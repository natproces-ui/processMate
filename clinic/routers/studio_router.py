# clinic/routers/studio_router.py
"""
Conversation du Studio en flux (Server-Sent Events).

Un tour = message + fichiers éventuels. L'aiguillage (processor/studio_planner) décide :
générer directement, proposer les procédures trouvées, fusionner, modifier la procédure
ouverte ou répondre. La progression est envoyée au fil de l'eau ; chaque procédure
générée part dès qu'elle est prête.

Rien n'est enregistré en base ici : une procédure générée reste dans le Studio jusqu'à
ce que l'utilisateur l'enregistre (avec son emplacement dans la taxonomie).

Événements (une ligne `data: {json}` par événement) :
  status            {id, label, state: running|done}
  message           {text}                    réponse de l'assistant
  proposal          {procedures, selected}    choix proposé (tout coché)
  procedure_started {id, title}
  procedure_progress {id, label}             avancement (lecture, analyse, rédaction)
  procedure_row     {id, row}                une étape complète, en aperçu pendant la génération
  procedure_ready   {id, title, workflow, enrichments, procedureMetadata}
  procedure_error   {id, title, message}
  chat_result       {result}                  modification / réponse via le chat existant
  error             {message}
  done              {}
"""
import asyncio
import hashlib
import json
import os
import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from manager import conversation_store as store
from manager.auth import AuthUser, get_optional_user
from manager.turn_recorder import TurnRecorder
from manager.model_manager import interactions_scope
from manager.guest_limits import GuestLimitError, check_files, client_ip, consume, guest_keys, load_limits
from manager.model_routing import TaskKind, routing_scope, scrub_model_names, source_kinds_of
from manager.processing_level import ProcessingLevel, get_processing_level, processing_level_scope
from models.discovery_models import ProcessCard, SourceReference, SourceType
from processor import studio_agent
from processor.studio_planner import plan_turn
from processor.office_extract import extract_office, office_type

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/studio", tags=["Studio"])

MAX_FILES = 10
MAX_FILE_SIZE = 20 * 1024 * 1024
MAX_PARALLEL = 3                   # générations simultanées
SESSION_TTL = 4 * 3600

# Fichiers et dernière proposition par conversation (mémoire du processus, comme la découverte)
_sessions: Dict[str, Dict[str, Any]] = {}

MERGE_RULES = """━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 FUSION EN UNE SEULE PROCÉDURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Réunis les procédures suivantes en UNE seule procédure cohérente : {titles}.
- Ordonne les étapes selon la chronologie réelle du processus, pas selon l'ordre des fichiers.
- Supprime les étapes en double ; garde la formulation la plus précise.
- Harmonise les noms d'acteurs, de départements et d'outils.
- Conserve toutes les branches (rejet, escalade, correction) et relie-les correctement.
"""


def _sse(event: Dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"


def _purge_sessions() -> None:
    limit = time.time() - SESSION_TTL
    for sid in [s for s, v in _sessions.items() if v.get("updated", 0) < limit]:
        _sessions.pop(sid, None)


def _loads(raw: Optional[str], default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


async def _read_files(files: List[UploadFile]) -> List[Dict[str, Any]]:
    if len(files) > MAX_FILES:
        raise HTTPException(400, f"Maximum {MAX_FILES} fichiers")
    out = []
    for f in files:
        name = f.filename or f"fichier_{len(out) + 1}"
        ctype = (f.content_type or "").lower()
        kind = office_type(name, ctype)
        if ctype == "application/pdf" or name.lower().endswith(".pdf"):
            ftype = "pdf"
        elif ctype.startswith("image/"):
            ftype = "image"
        elif kind:
            ftype = kind
        elif name.lower().endswith((".doc", ".ppt")):
            raise HTTPException(400, f"Ancien format Office non pris en charge : {name}. Enregistrez-le en .docx ou .pptx.")
        else:
            raise HTTPException(400, f"Format non pris en charge : {name} (PDF, image, Word .docx ou PowerPoint .pptx)")
        data = await f.read()
        if not data:
            raise HTTPException(400, f"Fichier vide : {name}")
        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(400, f"Fichier trop volumineux : {name} (max 20 Mo)")
        entry = {"file_id": str(uuid.uuid4()), "filename": name, "data": data, "type": ftype, "size": len(data)}
        if ftype in ("docx", "pptx"):
            try:
                entry["office"] = await asyncio.to_thread(extract_office, data, ftype)
            except ValueError as e:
                raise HTTPException(400, str(e))
        out.append(entry)
    return out


def _card(proc: Dict[str, Any], files: List[Dict[str, Any]], title: Optional[str] = None) -> ProcessCard:
    by_name = {f["filename"]: f for f in files}
    sources = []
    for s in proc.get("sources") or []:
        f = by_name.get(s.get("file"))
        if f:
            sources.append(SourceReference(
                file_id=f["file_id"], filename=f["filename"],
                source_type=SourceType.PDF if f["type"] == "pdf" else SourceType.IMAGE,
                page_hint=f"pages {s['pages']}" if s.get("pages") else None,
            ))
    return ProcessCard(
        process_id=proc.get("id") or str(uuid.uuid4()),
        title=title or proc.get("title") or "Procédure",
        description=proc.get("description") or "",
        sources=sources, confidence=90, estimated_steps=proc.get("estimated_steps"),
    )


def _scope_instructions(proc: Dict[str, Any]) -> str:
    """La génération reçoit le document entier : on lui dit où est la procédure et d'ignorer le reste."""
    where = ", ".join(f"{s['file']}" + (f" pages {s['pages']}" if s.get("pages") else "") for s in proc.get("sources") or [])
    return (f"Formalise UNIQUEMENT la procédure « {proc.get('title')} » ({where}). "
            "Le document peut contenir d'autres procédures : ignore-les.")


async def _generate(request: Request, files: List[Dict[str, Any]], procedures: List[Dict[str, Any]],
                    targets: List[str], merge: bool, merged_title: Optional[str], message: str,
                    references: Optional[List[str]] = None):
    chosen = [p for p in procedures if p["id"] in targets]
    if not chosen:
        yield _sse({"type": "error", "message": "Aucune procédure sélectionnée."})
        return

    user_note = f"\nDemande de l'utilisateur : {message.strip()}" if message and message.strip() else ""
    if merge:
        title = merged_title or " / ".join(p["title"] for p in chosen)
        merged = {"id": "merged", "title": title, "description": "Fusion de : " + ", ".join(p["title"] for p in chosen),
                  "sources": [s for p in chosen for s in p.get("sources") or []]}
        jobs = [(merged, MERGE_RULES.format(titles=", ".join(f"« {p['title']} »" for p in chosen)) + user_note)]
    else:
        jobs = [(p, _scope_instructions(p) + user_note) for p in chosen]

    for proc, _ in jobs:
        yield _sse({"type": "procedure_started", "id": proc["id"], "title": proc["title"]})

    # Initialisation (quelques secondes) après l'annonce : l'utilisateur voit démarrer tout de suite
    from processor.multi_doc_processor import MultiDocProcessor
    processor = await asyncio.to_thread(MultiDocProcessor)
    sem = asyncio.Semaphore(MAX_PARALLEL)
    ref_names = set(references or [])
    ref_files = [f for f in files if f["filename"] in ref_names]   # conventions de style (passe 1)
    src_pool = [f for f in files if f["filename"] not in ref_names]

    # Les générations tournent en parallèle et déposent leurs événements (avancement, lignes, fin)
    # dans une file unique, relayée au client dans l'ordre d'arrivée.
    queue: asyncio.Queue = asyncio.Queue()

    async def run(proc: Dict[str, Any], instructions: str):
        """Dépose ("done", procédure, résultat, erreur) : une génération en échec n'arrête pas les autres."""
        def on_progress(event: Dict[str, Any]) -> None:
            if "row" in event:
                queue.put_nowait({"type": "procedure_row", "id": proc["id"], "row": event["row"]})
            elif event.get("phase"):
                queue.put_nowait({"type": "procedure_progress", "id": proc["id"], "label": event["phase"]})

        async with sem:
            try:
                card = _card(proc, files)
                src = [f for f in src_pool if f["file_id"] in {s.file_id for s in card.sources}] or src_pool
                with routing_scope(TaskKind.GENERATION_PROCEDURE, source_kinds_of(src)):
                    result = await processor.generate_process(selected_card=card, src_files=src, ref_files=ref_files,
                                                              instructions=instructions, on_progress=on_progress)
                queue.put_nowait(("done", proc, result, None))
            except Exception as e:
                logger.error(f"❌ Génération Studio « {proc.get('title')} » : {e}", exc_info=True)
                queue.put_nowait(("done", proc, None, e))

    tasks = [asyncio.create_task(run(p, ins)) for p, ins in jobs]
    ready: List[Dict[str, Any]] = []
    stopped = False
    remaining = len(tasks)
    try:
        while remaining:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                item = None              # rien de neuf : on vérifie seulement que le client est toujours là
            if isinstance(item, dict):
                yield _sse(item)
            elif item is not None:
                _, proc, result, error = item
                remaining -= 1
                if error is None:
                    done = {"title": result.get("title") or proc["title"], "workflow": result.get("workflow") or [],
                            "procedureMetadata": result.get("procedureMetadata") or {}}
                    ready.append({**done, "id": proc["id"]})
                    yield _sse({"type": "procedure_ready", "id": proc["id"], **done,
                                "enrichments": result.get("enrichments") or {}})
                else:
                    yield _sse({"type": "procedure_error", "id": proc["id"], "title": proc["title"], "message": scrub_model_names(str(error))[:300]})
            if await request.is_disconnected():
                logger.info("⏹️ Génération Studio interrompue par l'utilisateur")
                stopped = True
                break
    finally:
        pending = [t for t in tasks if not t.done()]
        for t in pending:
            t.cancel()
        if pending:
            logger.warning(f"⏹️ {len(pending)} génération(s) annulée(s) (arrêt ou déconnexion du client)")

    if ready and not stopped:
        async for ev in _stream_remarks(request, ready, message):
            yield ev
        if os.getenv("OPEN_POINTS_ENABLED", "false").lower() == "true" and not await request.is_disconnected():
            async for ev in _open_points(ready, files):
                yield ev


async def _open_points(procedures: List[Dict[str, Any]], files: List[Dict[str, Any]]):
    """Points ouverts de chaque procédure générée (lot 5). Facultatif : une erreur n'interrompt rien."""
    from manager.model_manager import generate_content
    from prompts.open_points_prompt import build_prompt, parse

    yield _sse({"type": "status", "id": "open_points", "label": "Relevé des points à confirmer", "state": "running"})
    # Texte des sources disponible sans appel IA (Word, PowerPoint) ; les PDF ne sont pas relus ici
    source_texts = [f"--- {f['filename']} ---\n{(f.get('office') or {}).get('text', '')}" for f in files if f.get("office")]

    def _one(proc):
        with routing_scope(TaskKind.RELECTURE_CRITIQUE, ["texte"]):
            response = generate_content(build_prompt(proc, source_texts), None, "Points ouverts")
        return parse(response.text or "", [str(r.get("id")) for r in proc.get("workflow") or []])

    results = await asyncio.gather(*(asyncio.to_thread(_one, p) for p in procedures), return_exceptions=True)
    total = 0
    for proc, points in zip(procedures, results):
        if isinstance(points, Exception):
            logger.warning(f"⚠️ Points ouverts indisponibles pour « {proc.get('title')} » : {points}")
            continue
        total += len(points)
        yield _sse({"type": "open_points", "id": proc["id"], "points": points})
    label = f"{total} point{'s' if total > 1 else ''} à confirmer" if total else "Aucun point à confirmer relevé"
    yield _sse({"type": "status", "id": "open_points", "label": label, "state": "done"})


async def _stream_remarks(request: Request, procedures: List[Dict[str, Any]], message: str):
    """Relecture en flux : remarques (texte) puis suggestions (boutons). Facultatif : une erreur n'interrompt rien."""
    from manager.model_manager import generate_content_stream
    from prompts.studio_remarks_prompt import SUGGESTIONS_MARKER, build_remarks_prompt, split_suggestions

    yield _sse({"type": "status", "id": "remarks", "label": "Relecture de la procédure", "state": "running"})
    end = object()
    full, sent = "", 0
    try:
        with routing_scope(TaskKind.RELECTURE_CRITIQUE, ["texte"]):
            stream = generate_content_stream(build_remarks_prompt(procedures, message), task_name="Remarques Studio")
        while True:
            chunk = await asyncio.to_thread(next, stream, end)
            if chunk is end:
                break
            full += chunk
            # On n'envoie que ce qui précède la ligne SUGGESTIONS (marge pour un marqueur coupé en deux morceaux)
            cut = full.find(SUGGESTIONS_MARKER)
            visible = cut if cut >= 0 else max(sent, len(full) - len(SUGGESTIONS_MARKER))
            if visible > sent:
                yield _sse({"type": "remarks_delta", "text": full[sent:visible]})
                sent = visible
            if await request.is_disconnected():
                return
        _, items = split_suggestions(full)
        cut = full.find(SUGGESTIONS_MARKER)
        rest = (full[:cut] if cut >= 0 else full).rstrip()[sent:]
        if rest:
            yield _sse({"type": "remarks_delta", "text": rest})
        if items:
            yield _sse({"type": "suggestions", "items": items})
    except Exception as e:
        logger.warning(f"⚠️ Remarques Studio indisponibles : {e}")
    yield _sse({"type": "status", "id": "remarks", "label": "Relecture de la procédure", "state": "done"})


def _guest(request: Request, user: Optional[AuthUser]):
    """Clés de comptage d'un invité, ou None (utilisateur connecté, ou limites désactivées)."""
    if user is not None or not load_limits().enabled:
        return None
    ip = client_ip(request.headers, request.client.host if request.client else None)
    return guest_keys(request.headers.get("x-device-id"), ip)


def _level_for(guest) -> Optional[ProcessingLevel]:
    """Un invité n'a pas accès au niveau Approfondi : rabattu sur Normal."""
    level = get_processing_level()
    if guest is not None and level == ProcessingLevel.DEEP:
        return ProcessingLevel.NORMAL
    return level


def _consume_or_raise(keys, kind: str) -> None:
    try:
        consume(keys, kind)
    except GuestLimitError as e:
        raise HTTPException(e.status, str(e))


# ── Conversations enregistrées (lot 3) ─────────────────────────
# Une conversation enregistrée utilise son identifiant comme session_id : si l'identifiant
# envoyé est une conversation de l'utilisateur connecté (et CONVERSATIONS_ENABLED), le tour
# lit et écrit en base ; sinon, comportement d'avant (session en mémoire).

async def _owned_conversation(session_id: str, user: Optional[AuthUser]) -> Optional[Dict[str, Any]]:
    if user is None or not store.enabled() or not store.is_uuid(session_id):
        return None
    try:
        return await asyncio.to_thread(store.get_owned, session_id, user.id)
    except Exception as e:
        logger.warning(f"⚠️ Conversation illisible ({str(e)[:120]}) : mode session en mémoire")
        return None


def _entry_from_source(src: Dict[str, Any], data: bytes) -> Dict[str, Any]:
    """Même forme qu'une entrée de _read_files, à partir d'une source enregistrée."""
    entry = {"file_id": src["id"], "filename": src["filename"], "data": data, "type": src["type"],
             "size": src.get("size") or len(data), "sha256": src.get("sha256")}
    if src["type"] in ("docx", "pptx"):
        try:
            entry["office"] = extract_office(data, src["type"])
        except Exception as e:
            logger.warning(f"⚠️ Source « {src['filename']} » illisible : {str(e)[:120]}")
    return entry


async def _conversation_session(conv: Dict[str, Any]) -> Dict[str, Any]:
    """Session du tour, reconstruite depuis la base si le serveur a redémarré."""
    sess = _sessions.get(conv["id"])
    if sess and sess.get("persisted"):
        return sess
    srcs = await asyncio.to_thread(store.sources, conv["id"])
    files = []
    for src in srcs:
        try:
            data = await asyncio.to_thread(store.download, src["storage_path"])
            files.append(_entry_from_source(src, data))
        except Exception as e:
            logger.warning(f"⚠️ Source « {src.get('filename')} » non rechargée : {str(e)[:120]}")
    if conv.get("project_id"):
        # Sources du projet, partagées par toutes ses conversations (placées en premier)
        from manager import project_store
        project_files = []
        for src in await asyncio.to_thread(project_store.sources, conv["project_id"]):
            try:
                data = await asyncio.to_thread(store.download, src["storage_path"])
                project_files.append(_entry_from_source(src, data))
            except Exception as e:
                logger.warning(f"⚠️ Source de projet « {src.get('filename')} » non rechargée : {str(e)[:120]}")
        files = project_files + files
    state = conv.get("state") or {}
    sess = {"files": files, "proposal": state.get("proposal"), "references": state.get("references"),
            "persisted": True}
    _sessions[conv["id"]] = sess
    return sess


def forget_session(conversation_id: str) -> None:
    """À appeler quand les sources changent hors d'un tour (retrait d'une source)."""
    _sessions.pop(conversation_id, None)


async def _server_history(conv: Dict[str, Any]) -> List[Dict[str, str]]:
    """Historique pour le modèle, construit depuis la base (résumé des anciens échanges si long)."""
    msgs = await asyncio.to_thread(store.messages, conv["id"])
    summary, upto = conv.get("summary"), conv.get("summary_upto") or 0
    if store.needs_summary(msgs, upto):
        new_upto = len(msgs) - store.RECENT_MESSAGES
        try:
            from manager.model_manager import generate_content
            prompt = ("Résume en français, en 15 lignes au plus, les échanges ci-dessous entre un utilisateur et "
                      "l'assistant de formalisation de procédures : demandes, décisions prises, procédures produites, "
                      "points restés ouverts. N'invente rien.\n\n" + store.summary_input(msgs, summary, new_upto))
            with routing_scope(TaskKind.SYNTHESE_COURTE, ["texte"]):
                response = await asyncio.to_thread(generate_content, prompt, None, "Résumé de conversation")
            summary, upto = (response.text or "").strip() or summary, new_upto
            await asyncio.to_thread(store.update, conv["id"], conv["owner_id"], summary=summary, summary_upto=upto)
        except Exception as e:
            logger.warning(f"⚠️ Résumé de conversation indisponible : {str(e)[:120]}")
    history = store.history_for_model(msgs, summary, upto)
    if conv.get("project_id"):
        from manager import project_store
        project = await asyncio.to_thread(project_store.get_accessible, conv["project_id"], conv["owner_id"])
        intro = project_store.instructions_message(project) if project else None
        if intro:
            history.insert(0, intro)
    return history


def _record(gen, conv: Optional[Dict[str, Any]], sess: Dict[str, Any], ix: Optional[Dict[str, Any]] = None):
    """Relaie le flux tel quel et, pour une conversation enregistrée, sauvegarde la réponse à la fin
    (y compris si l'utilisateur arrête : le message est enregistré comme arrêté)."""
    if conv is None:
        return gen

    async def wrapper():
        recorder, finished = TurnRecorder(), False
        try:
            async for chunk in gen:
                for line in chunk.splitlines():
                    if line.startswith("data: "):
                        try:
                            ev = json.loads(line[6:])
                        except ValueError:
                            continue
                        if ev.get("type") == "done":
                            finished = True
                        recorder.feed(ev)
                yield chunk
        finally:
            try:
                msg = recorder.finish(stopped=not finished)
                ids = (ix or {}).get("ids") or []
                store.add_message(conv["id"], msg["role"], msg["content"], msg["payload"],
                                  interaction_id=ids[-1] if ids else None)
                # fusion : les procédures enregistrées par le navigateur restent dans l'état
                store.merge_state(conv["id"], conv["owner_id"],
                                  proposal=sess.get("proposal"), references=sess.get("references"))
            except Exception as e:
                logger.error(f"❌ Réponse non enregistrée dans la conversation {conv['id']} : {e}")

    return wrapper()


def _streaming(gen) -> StreamingResponse:
    return StreamingResponse(gen, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/turn")
async def studio_turn(
    request: Request,
    session_id: str = Form(...),
    message: str = Form(""),
    history: Optional[str] = Form(None),
    current_workflow: Optional[str] = Form(None),
    current_enrichments: Optional[str] = Form(None),
    current_procedure_metadata: Optional[str] = Form(None),
    conversation_procedures: Optional[str] = Form(None),
    active_procedure: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    user: Optional[AuthUser] = Depends(get_optional_user),
):
    _purge_sessions()
    guest = _guest(request, user)
    new_files = await _read_files(files)
    if guest is not None:
        try:
            check_files(new_files)
        except GuestLimitError as e:
            raise HTTPException(e.status, str(e))
        _consume_or_raise(guest, "turns")
    history_list = _loads(history, [])
    workflow = _loads(current_workflow, None)
    has_workflow = bool(workflow)
    conv = await _owned_conversation(session_id, user)
    plan_files = new_files
    if conv is None:
        sess = _sessions.setdefault(session_id, {"files": [], "proposal": None})
        if new_files:  # nouveaux fichiers = nouveau contexte
            sess["files"], sess["proposal"] = new_files, None
    else:
        # Conversation enregistrée : les sources s'ajoutent (dédoublonnées) au lieu de se remplacer
        sess = await _conversation_session(conv)
        if new_files:
            try:
                added = await asyncio.to_thread(store.add_sources, conv["id"], user.id, new_files)
            except RuntimeError as e:
                raise HTTPException(502, str(e))
            by_sha = {hashlib.sha256(f["data"]).hexdigest(): f for f in new_files}
            for row in added:
                f = by_sha.get(row["sha256"])
                if f:
                    sess["files"].append({**f, "file_id": row["id"], "sha256": row["sha256"]})
            sess["proposal"] = None
            plan_files = sess["files"]  # la proposition porte sur toutes les sources actives
        history_list = await _server_history(conv)
        attachments = [{"name": f["filename"], "type": f["type"], "size": f["size"]} for f in new_files]
        await asyncio.to_thread(store.add_message, conv["id"], "user", message.strip(),
                                {"attachments": attachments} if attachments else {})
    # Vrai titre (« Ouverture de compte étudiant au Maroc »), trouvé en parallèle de la réponse
    title_task = None
    if conv is not None:
        from manager import conversation_title
        title_task = asyncio.create_task(asyncio.to_thread(conversation_title.ensure_title, conv, message, new_files))
    sess["updated"] = time.time()
    level = _level_for(guest)
    ix = {"store": user is not None, "ids": []}  # API Interactions : rien de conservé pour un invité

    async def stream():
        with processing_level_scope(level):  # le niveau suit tout le flux, y compris les tâches parallèles
            try:
                if studio_agent.enabled():
                    # Lot 6 : agent outillé (toute écriture est une proposition à accepter)
                    ctx = studio_agent.AgentContext(message=message, history=history_list, files=sess["files"],
                                                    workflow=workflow or [], metadata=_loads(current_procedure_metadata, {}) or {})
                    with routing_scope(TaskKind.AGENT, source_kinds_of(sess["files"])):
                        async for ev in studio_agent.run_agent(ctx, request.is_disconnected):
                            yield _sse(ev)
                    if ctx.to_generate and not await request.is_disconnected():
                        if guest is not None:
                            consume(guest, "generations")
                        sess["proposal"] = ctx.to_generate
                        async for ev in _generate(request, sess["files"], ctx.to_generate, [p["id"] for p in ctx.to_generate],
                                                  False, None, message, sess.get("references")):
                            yield ev
                    return
                if not sess["files"] and not sess.get("proposal"):
                    # Ni sources ni proposition en cours : le chat existant (modifier, expliquer, générer depuis un texte…).
                    # Avec des sources déjà jointes (ex. relance après une erreur), on passe par leur analyse :
                    # sinon le chat rédigeait une procédure sans avoir lu le fichier.
                    yield _sse({"type": "status", "id": "think", "label": "Analyse de la demande", "state": "running"})
                    # l'étape « think » est terminée par _delegate_to_chat (avec ce qui a été compris)
                    async for ev in _delegate_to_chat(message, [], history_list, workflow, current_enrichments, current_procedure_metadata,
                                                      _loads(conversation_procedures, None), active_procedure, request):
                        yield ev
                    return

                n = len(sess["files"])
                # sources jointes plus tôt, pas encore analysées (ex. relance après une erreur)
                to_plan = plan_files or ([] if sess.get("proposal") else sess["files"])
                label = _reading_label(to_plan) if to_plan else "Analyse de la demande"
                yield _sse({"type": "status", "id": "plan", "label": label, "state": "running"})
                with routing_scope(TaskKind.AIGUILLAGE, source_kinds_of(to_plan)), interactions_scope(ix):
                    plan = await asyncio.to_thread(plan_turn, message, to_plan, has_workflow, history_list, sess.get("proposal"))
                found = len(plan.procedures)
                done_label = (f"{found} procédure{'s' if found > 1 else ''} trouvée{'s' if found > 1 else ''}"
                              if plan.action in ("generate", "propose", "merge") else label)
                yield _sse({"type": "status", "id": "plan", "label": done_label, "state": "done"})
                if plan.reply:
                    yield _sse({"type": "message", "text": plan.reply})

                if plan.procedures:
                    sess["proposal"] = plan.procedures
                if to_plan:
                    sess["references"] = plan.references
                if plan.action == "propose":
                    yield _sse({"type": "proposal", "procedures": plan.procedures, "selected": [p["id"] for p in plan.procedures]})
                elif plan.action in ("generate", "merge"):
                    if guest is not None:
                        consume(guest, "generations")  # GuestLimitError → message d'erreur ci-dessous
                    async for ev in _generate(request, sess["files"], plan.procedures, plan.targets,
                                              plan.action == "merge", plan.merged_title, message,
                                              sess.get("references")):
                        yield ev
                elif plan.action == "edit":
                    async for ev in _delegate_to_chat(message, sess["files"], history_list, workflow, current_enrichments, current_procedure_metadata,
                                                  _loads(conversation_procedures, None), active_procedure, request):
                        yield ev
                # answer : la réponse a déjà été envoyée
            except GuestLimitError as e:
                yield _sse({"type": "error", "message": str(e), "limit": True})
            except Exception as e:
                logger.error(f"❌ Tour Studio : {e}", exc_info=True)
                yield _sse({"type": "error", "message": scrub_model_names(str(e))[:300]})
            finally:
                yield _sse({"type": "done"})

    return _streaming(_record(_with_title(stream(), title_task), conv, sess, ix))


async def _with_title(gen, task: Optional["asyncio.Task"]):
    """Relaie le flux et y glisse le titre de la conversation dès qu'il est trouvé
    (au plus tard juste avant la fin du tour), pour l'en-tête et la barre latérale."""
    sent = task is None
    async for chunk in gen:
        if not sent and (task.done() or '"type": "done"' in chunk):
            sent = True
            try:
                title = await asyncio.wait_for(asyncio.shield(task), timeout=4)
            except Exception:
                title = None
            if title:
                yield _sse({"type": "conversation_title", "title": title})
        yield chunk


def _file_volume(f: Dict[str, Any]) -> str:
    try:
        if f.get("type") == "pdf" and f.get("data"):
            from manager.guest_limits import count_pdf_pages
            n = count_pdf_pages(f["data"])
            return f"{n} page{'s' if n > 1 else ''}" if n else ""
        text = (f.get("office") or {}).get("text") or ""
        if f.get("type") == "pptx":
            n = text.count("## Diapositive")
            return f"{n} diapositive{'s' if n > 1 else ''}" if n else ""
        if f.get("type") == "docx" and text:
            return f"{max(1, len(text) // 3000)} page{'s' if len(text) > 6000 else ''} environ"
    except Exception:
        pass
    return ""


def _reading_label(files: List[Dict[str, Any]]) -> str:
    """« Lecture de deck.pptx (12 diapositives) » — ce qui est réellement lu."""
    described = []
    for f in files[:3]:
        vol = _file_volume(f)
        described.append(f"{f.get('filename', 'fichier')}{f' ({vol})' if vol else ''}")
    more = f" et {len(files) - 3} autre{'s' if len(files) > 4 else ''}" if len(files) > 3 else ""
    return f"Lecture de {', '.join(described)}{more}"


async def _delegate_to_chat(message, files, history, workflow, enrichments_raw, metadata_raw,
                            procedures=None, active_procedure=None, request: Optional[Request] = None):
    """Modifications et conversation : logique existante du chat (patch, regen, explain…)."""
    from processor.chat_processor import ChatProcessor
    chat_files = [{"filename": f["filename"], "content": f["data"],
                   "content_type": "application/pdf" if f["type"] == "pdf" else "image/*", "type": f["type"]} for f in files]
    from manager import turn_progress
    queue: asyncio.Queue = asyncio.Queue()
    with routing_scope(TaskKind.MODIFICATION_PROCEDURE, source_kinds_of(files) if files else ["texte"]), \
            turn_progress.progress_scope(queue):
        # La tâche hérite du contexte : ce qu'elle signale (étapes, texte) part tout de suite au chat
        task = asyncio.create_task(ChatProcessor().process_message(
            message=message, files=chat_files, history=history, current_workflow=workflow,
            current_enrichments=_loads(enrichments_raw, None), current_procedure_metadata=_loads(metadata_raw, None),
            procedures=procedures if isinstance(procedures, list) else None, active_procedure=active_procedure,
        ))
    work_started = think_done = False
    while not task.done() or not queue.empty():
        try:
            ev = await asyncio.wait_for(queue.get(), timeout=0.1)
        except asyncio.TimeoutError:
            continue
        if ev.get("id") == "work" and ev.get("state") == "running":
            work_started = True
        if ev.get("id") == "think" and ev.get("state") == "done":
            think_done = True
        yield _sse(ev)
    result = task.result()
    if not think_done:  # aucun résumé d'intention : on termine l'étape avec son libellé d'origine
        yield _sse({"type": "status", "id": "think", "label": "Analyse de la demande", "state": "done"})
    if work_started:
        yield _sse({"type": "status", "id": "work", "label": _work_done_label(result), "state": "done"})
    yield _sse({"type": "chat_result", "result": result})
    # Procédure créée ou réécrite depuis le chat : une vraie réponse, comme après une génération
    # depuis des fichiers (relecture : ce qui tient, ce qui manque, puis des suggestions)
    if (request is not None and result.get("success") and result.get("workflow")
            and result.get("intent") in ("generate", "regen", "web_search", "transcribe")
            and not await request.is_disconnected()):
        proc = {"title": result.get("title") or "Procédure", "workflow": result["workflow"],
                "procedureMetadata": result.get("procedureMetadata") or {}}
        async for ev in _stream_remarks(request, [proc], message):
            yield ev


def _work_done_label(result: Dict[str, Any]) -> str:
    """Libellé final de l'étape de travail, avec ce qui a été produit."""
    intent = (result or {}).get("intent")
    n = len((result or {}).get("workflow") or [])
    if intent in ("generate", "regen", "transcribe") and n:
        return f"Procédure rédigée : {n} étape{'s' if n > 1 else ''}"
    if intent == "patch":
        ops = (result or {}).get("operations_count") or 0
        return f"Procédure modifiée : {ops} changement{'s' if ops > 1 else ''}" if ops else "Procédure modifiée"
    if intent == "explain":
        return "Réponse rédigée"
    return "Terminé"


class GenerateRequest(BaseModel):
    session_id: str
    procedure_ids: List[str]
    merge: bool = False
    merged_title: Optional[str] = None
    message: str = ""


@router.post("/generate")
async def studio_generate(request: Request, body: GenerateRequest,
                          user: Optional[AuthUser] = Depends(get_optional_user)):
    """Génère la sélection faite par l'utilisateur dans une proposition."""
    conv = await _owned_conversation(body.session_id, user)
    sess = await _conversation_session(conv) if conv else _sessions.get(body.session_id)
    if not sess or not sess.get("proposal"):
        raise HTTPException(404, "Conversation expirée : rejoignez les fichiers à nouveau.")
    guest = _guest(request, user)
    if conv:
        n = len(body.procedure_ids)
        text = (f"Fusionner les {n} procédures sélectionnées en une seule" if body.merge
                else ("Générer les " + str(n) + " procédures sélectionnées") if n > 1 else "Générer la procédure sélectionnée")
        await asyncio.to_thread(_mark_proposal_submitted, conv["id"], body.procedure_ids)
        await asyncio.to_thread(store.add_message, conv["id"], "user", text, {})
    if guest is not None:
        _consume_or_raise(guest, "generations")
    sess["updated"] = time.time()
    level = _level_for(guest)

    async def stream():
        with processing_level_scope(level):
            try:
                async for ev in _generate(request, sess["files"], sess["proposal"], body.procedure_ids,
                                          body.merge, body.merged_title, body.message, sess.get("references")):
                    yield ev
            except Exception as e:
                logger.error(f"❌ Génération Studio : {e}", exc_info=True)
                yield _sse({"type": "error", "message": scrub_model_names(str(e))[:300]})
            finally:
                yield _sse({"type": "done"})

    return _streaming(_record(stream(), conv, sess))


def _mark_proposal_submitted(conversation_id: str, selected: List[str]) -> None:
    """La dernière proposition enregistrée passe en « soumise » (cases figées à la réouverture)."""
    for m in reversed(store.messages(conversation_id)):
        prop = (m.get("payload") or {}).get("proposal")
        if prop:
            payload = {**m["payload"], "proposal": {**prop, "selected": selected, "submitted": True}}
            store.update_message_payload(m["id"], conversation_id, payload)
            return

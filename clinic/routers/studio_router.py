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
  procedure_ready   {id, title, workflow, enrichments, procedureMetadata}
  procedure_error   {id, title, message}
  chat_result       {result}                  modification / réponse via le chat existant
  error             {message}
  done              {}
"""
import asyncio
import json
import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from manager.processing_level import get_processing_level, processing_level_scope
from models.discovery_models import ProcessCard, SourceReference, SourceType
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

    async def run(proc: Dict[str, Any], instructions: str):
        """Renvoie (procédure, résultat, erreur) : une génération en échec n'arrête pas les autres."""
        async with sem:
            try:
                card = _card(proc, files)
                src = [f for f in src_pool if f["file_id"] in {s.file_id for s in card.sources}] or src_pool
                result = await processor.generate_process(selected_card=card, src_files=src, ref_files=ref_files, instructions=instructions)
                return proc, result, None
            except Exception as e:
                logger.error(f"❌ Génération Studio « {proc.get('title')} » : {e}", exc_info=True)
                return proc, None, e

    tasks = [asyncio.create_task(run(p, ins)) for p, ins in jobs]
    ready: List[Dict[str, Any]] = []
    stopped = False
    try:
        for fut in asyncio.as_completed(tasks):
            proc, result, error = await fut
            if error is None:
                done = {"title": result.get("title") or proc["title"], "workflow": result.get("workflow") or [],
                        "procedureMetadata": result.get("procedureMetadata") or {}}
                ready.append(done)
                yield _sse({"type": "procedure_ready", "id": proc["id"], **done,
                            "enrichments": result.get("enrichments") or {}})
            else:
                yield _sse({"type": "procedure_error", "id": proc["id"], "title": proc["title"], "message": str(error)[:300]})
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


async def _stream_remarks(request: Request, procedures: List[Dict[str, Any]], message: str):
    """Relecture en flux : remarques (texte) puis suggestions (boutons). Facultatif : une erreur n'interrompt rien."""
    from manager.model_manager import generate_content_stream
    from prompts.studio_remarks_prompt import SUGGESTIONS_MARKER, build_remarks_prompt, split_suggestions

    yield _sse({"type": "status", "id": "remarks", "label": "Relecture de la procédure", "state": "running"})
    end = object()
    full, sent = "", 0
    try:
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
    files: List[UploadFile] = File(default=[]),
):
    _purge_sessions()
    new_files = await _read_files(files)
    history_list = _loads(history, [])
    workflow = _loads(current_workflow, None)
    has_workflow = bool(workflow)
    sess = _sessions.setdefault(session_id, {"files": [], "proposal": None})
    sess["updated"] = time.time()
    if new_files:  # nouveaux fichiers = nouveau contexte
        sess["files"], sess["proposal"] = new_files, None
    level = get_processing_level()

    async def stream():
        with processing_level_scope(level):  # le niveau suit tout le flux, y compris les tâches parallèles
            try:
                if not new_files and not sess.get("proposal"):
                    # Sans fichiers ni proposition en cours : le chat existant (modifier, expliquer, générer depuis un texte…)
                    yield _sse({"type": "status", "id": "think", "label": "Analyse de la demande", "state": "running"})
                    async for ev in _delegate_to_chat(message, [], history_list, workflow, current_enrichments, current_procedure_metadata):
                        yield ev
                    yield _sse({"type": "status", "id": "think", "label": "Analyse de la demande", "state": "done"})
                    return

                n = len(sess["files"])
                label = f"Lecture de {n} fichier{'s' if n > 1 else ''}" if new_files else "Analyse de la demande"
                yield _sse({"type": "status", "id": "plan", "label": label, "state": "running"})
                plan = await asyncio.to_thread(plan_turn, message, new_files, has_workflow, history_list, sess.get("proposal"))
                found = len(plan.procedures)
                done_label = (f"{found} procédure{'s' if found > 1 else ''} trouvée{'s' if found > 1 else ''}"
                              if plan.action in ("generate", "propose", "merge") else label)
                yield _sse({"type": "status", "id": "plan", "label": done_label, "state": "done"})
                if plan.reply:
                    yield _sse({"type": "message", "text": plan.reply})

                if plan.procedures:
                    sess["proposal"] = plan.procedures
                if new_files:
                    sess["references"] = plan.references
                if plan.action == "propose":
                    yield _sse({"type": "proposal", "procedures": plan.procedures, "selected": [p["id"] for p in plan.procedures]})
                elif plan.action in ("generate", "merge"):
                    async for ev in _generate(request, sess["files"], plan.procedures, plan.targets,
                                              plan.action == "merge", plan.merged_title, message,
                                              sess.get("references")):
                        yield ev
                elif plan.action == "edit":
                    async for ev in _delegate_to_chat(message, sess["files"], history_list, workflow, current_enrichments, current_procedure_metadata):
                        yield ev
                # answer : la réponse a déjà été envoyée
            except Exception as e:
                logger.error(f"❌ Tour Studio : {e}", exc_info=True)
                yield _sse({"type": "error", "message": str(e)[:300]})
            finally:
                yield _sse({"type": "done"})

    return _streaming(stream())


async def _delegate_to_chat(message, files, history, workflow, enrichments_raw, metadata_raw):
    """Modifications et conversation : logique existante du chat (patch, regen, explain…)."""
    from processor.chat_processor import ChatProcessor
    chat_files = [{"filename": f["filename"], "content": f["data"],
                   "content_type": "application/pdf" if f["type"] == "pdf" else "image/*", "type": f["type"]} for f in files]
    result = await ChatProcessor().process_message(
        message=message, files=chat_files, history=history, current_workflow=workflow,
        current_enrichments=_loads(enrichments_raw, None), current_procedure_metadata=_loads(metadata_raw, None),
    )
    yield _sse({"type": "chat_result", "result": result})


class GenerateRequest(BaseModel):
    session_id: str
    procedure_ids: List[str]
    merge: bool = False
    merged_title: Optional[str] = None
    message: str = ""


@router.post("/generate")
async def studio_generate(request: Request, body: GenerateRequest):
    """Génère la sélection faite par l'utilisateur dans une proposition."""
    sess = _sessions.get(body.session_id)
    if not sess or not sess.get("proposal"):
        raise HTTPException(404, "Conversation expirée : rejoignez les fichiers à nouveau.")
    sess["updated"] = time.time()
    level = get_processing_level()

    async def stream():
        with processing_level_scope(level):
            try:
                async for ev in _generate(request, sess["files"], sess["proposal"], body.procedure_ids,
                                          body.merge, body.merged_title, body.message, sess.get("references")):
                    yield ev
            except Exception as e:
                logger.error(f"❌ Génération Studio : {e}", exc_info=True)
                yield _sse({"type": "error", "message": str(e)[:300]})
            finally:
                yield _sse({"type": "done"})

    return _streaming(stream())

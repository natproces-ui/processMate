"""
Agent outillé du Studio (lot 6).

Un seul agent, en boucle : il réfléchit, appelle des outils, lit leurs résultats, puis
répond ou s'arrête. Règles :
- Aucun outil n'écrit directement une procédure : les modifications, points ouverts et
  réponses sont des PROPOSITIONS envoyées au navigateur (événement « agent_proposal »),
  que l'utilisateur accepte ou refuse. Accepter crée un point de restauration (lot 5).
- Pas de mémoire implicite : l'agent ne connaît que la conversation, les sources jointes
  et la procédure ouverte (et les instructions du projet, s'il y en a).
- Boucle bornée (AGENT_MAX_STEPS) ; l'utilisateur peut arrêter à tout moment.
- Le modèle de chaque étape vient du routage (tâche « agent » × sources × niveau choisi).

Appel de fonctions via generateContent (SDK google-genai) : la forme de l'appel de
fonctions dans l'API Interactions n'a pas pu être vérifiée ici ; la boucle est isolée
dans run_agent pour une migration ultérieure.

Activation : STUDIO_AGENT_ENABLED=true (sinon l'aiguillage d'avant reste le chemin).
"""

import asyncio
import json
import logging
import os
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

OP_TYPES = {"add", "update", "delete", "move", "relink"}
POINT_TYPES = ["acteur à confirmer", "outil à confirmer", "étape implicite", "règle à préciser", "autre"]


def enabled() -> bool:
    return os.getenv("STUDIO_AGENT_ENABLED", "false").lower() == "true"


def max_steps() -> int:
    try:
        return max(1, min(20, int(os.getenv("AGENT_MAX_STEPS", "8"))))
    except ValueError:
        return 8


def max_output_tokens() -> int:
    try:
        return max(512, int(os.getenv("AGENT_MAX_OUTPUT_TOKENS", "4096")))
    except ValueError:
        return 4096


SYSTEM = """Tu es l'assistant de formalisation de procédures de ProcessMate. Tu réponds en français, clairement et sans jargon.

Ce que tu sais : uniquement la conversation, les sources jointes, la procédure ouverte et ses points ouverts (et les instructions du projet s'il y en a). Tu n'as aucune autre mémoire. Si une information manque, dis-le ou pose la question.

Méthode :
- Avant de modifier une procédure, lis-la (lire_procedure). Avant d'affirmer ce que dit un document, lis-le ou cherche dedans.
- Tu n'écris jamais directement : toute modification passe par proposer_modification, tout point à confirmer par proposer_point_ouvert, toute réponse à un point par proposer_reponse_point. L'utilisateur accepte ou refuse.
- Pour formaliser une nouvelle procédure à partir des sources, utilise creer_procedure (une fois par procédure).
- N'invente ni acteur, ni outil, ni règle : si c'est incertain, propose un point ouvert.
- Termine par une réponse courte qui dit ce que tu as fait et ce que tu proposes."""


def _decl(name: str, description: str, properties: Dict[str, Any], required: List[str]) -> Dict[str, Any]:
    return {"name": name, "description": description,
            "parameters_json_schema": {"type": "object", "properties": properties, "required": required}}


_OP_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": sorted(OP_TYPES)},
        "id": {"type": "string", "description": "id de l'étape visée (update, delete, move, relink)"},
        "after_id": {"type": "string", "description": "add/move : insérer après cette étape"},
        "row": {"type": "object", "description": "add : nouvelle étape (id 'NEW_1'…, étape, typeBpmn, acteur, département, outil, condition, outputs)"},
        "fields": {"type": "object", "description": "update : champs modifiés (étape, acteur, outil, condition, typeBpmn, outputs…)"},
        "outputs": {"type": "array", "items": {"type": "object"}, "description": "relink : nouvelles sorties [{targetId, label}]"},
        "reconnect": {"type": "boolean", "description": "delete : relier les prédécesseurs aux successeurs"},
    },
    "required": ["type"],
}

TOOL_DECLARATIONS = [
    _decl("lister_sources", "Liste les fichiers sources de la conversation (nom, type).", {}, []),
    _decl("lire_source", "Lit le texte d'une source Word ou PowerPoint (par morceaux). Les PDF et images sont joints directement.",
          {"nom": {"type": "string"}, "debut": {"type": "integer", "description": "position de départ (caractères)"}}, ["nom"]),
    _decl("chercher_dans_sources", "Cherche un terme dans le texte des sources Word et PowerPoint.",
          {"requete": {"type": "string"}}, ["requete"]),
    _decl("lire_procedure", "Lit la procédure ouverte : étapes et points ouverts.", {}, []),
    _decl("proposer_modification", "Propose une modification de la procédure ouverte (l'utilisateur accepte ou refuse).",
          {"explication": {"type": "string"}, "operations": {"type": "array", "items": _OP_SCHEMA}}, ["explication", "operations"]),
    _decl("creer_procedure", "Lance la formalisation d'une nouvelle procédure à partir des sources (un onglet par procédure).",
          {"titre": {"type": "string"}, "description": {"type": "string"},
           "fichiers": {"type": "array", "items": {"type": "string"}, "description": "noms des sources à utiliser (toutes si vide)"}},
          ["titre"]),
    _decl("lister_points_ouverts", "Liste les points ouverts de la procédure ouverte.", {}, []),
    _decl("proposer_point_ouvert", "Propose d'ajouter un point à confirmer auprès d'un métier.",
          {"question": {"type": "string"}, "step_id": {"type": "string"}, "acteur": {"type": "string"},
           "type": {"type": "string", "enum": POINT_TYPES}}, ["question"]),
    _decl("proposer_reponse_point", "Propose d'enregistrer la réponse à un point ouvert existant.",
          {"point_id": {"type": "string"}, "reponse": {"type": "string"}}, ["point_id", "reponse"]),
    _decl("consulter_bian", "Cherche des scénarios de référence BIAN (banque) par mot-clé dans leur titre.",
          {"recherche": {"type": "string"}}, ["recherche"]),
    _decl("analyser_complexite", "Calcule des indicateurs de la procédure ouverte : étapes, décisions, acteurs, outils, changements d'acteur, étapes incomplètes.", {}, []),
]

TOOL_LABELS = {
    "lister_sources": "Liste des sources", "lire_source": "Lecture d'une source", "chercher_dans_sources": "Recherche dans les sources",
    "lire_procedure": "Lecture de la procédure", "proposer_modification": "Proposition de modification",
    "creer_procedure": "Formalisation d'une procédure", "lister_points_ouverts": "Lecture des points ouverts",
    "proposer_point_ouvert": "Proposition d'un point ouvert", "proposer_reponse_point": "Proposition de réponse",
    "consulter_bian": "Consultation BIAN", "analyser_complexite": "Analyse de complexité",
}


@dataclass
class AgentContext:
    message: str
    history: List[Dict[str, str]]
    files: List[Dict[str, Any]]
    workflow: List[Dict[str, Any]]
    metadata: Dict[str, Any]
    to_generate: List[Dict[str, Any]] = field(default_factory=list)
    proposals: int = 0


# ── Outils (purs, sauf consulter_bian qui lit la base) ───────────

def _office_text(f: Dict[str, Any]) -> str:
    return (f.get("office") or {}).get("text") or ""


def _find_file(ctx: AgentContext, name: str) -> Optional[Dict[str, Any]]:
    name = (name or "").strip().lower()
    return next((f for f in ctx.files if f["filename"].lower() == name), None) or \
        next((f for f in ctx.files if name and name in f["filename"].lower()), None)


def _validate_operations(ops: Any, workflow: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    ids = {str(r.get("id")) for r in workflow}
    valid, errors = [], []
    for i, op in enumerate(ops if isinstance(ops, list) else []):
        if not isinstance(op, dict) or op.get("type") not in OP_TYPES:
            errors.append(f"opération {i + 1} : type inconnu")
            continue
        if op["type"] in ("update", "delete", "move", "relink") and str(op.get("id")) not in ids:
            errors.append(f"opération {i + 1} : étape « {op.get('id')} » introuvable")
            continue
        if op["type"] == "add" and not isinstance(op.get("row"), dict):
            errors.append(f"opération {i + 1} : « row » manquant")
            continue
        if op["type"] == "update" and not isinstance(op.get("fields"), dict):
            errors.append(f"opération {i + 1} : « fields » manquant")
            continue
        valid.append(op)
    return valid, errors


def complexity(workflow: List[Dict[str, Any]]) -> Dict[str, Any]:
    tasks = [r for r in workflow if r.get("typeBpmn") not in ("StartEvent", "EndEvent")]
    decisions = [r for r in workflow if "Gateway" in str(r.get("typeBpmn"))]
    actors = {r.get("acteur") for r in workflow if r.get("acteur")}
    tools = {r.get("outil") for r in workflow if r.get("outil")}
    by_id = {str(r.get("id")): r for r in workflow}
    handoffs = sum(1 for r in workflow for o in (r.get("outputs") or [])
                   if isinstance(o, dict) and by_id.get(str(o.get("targetId")), {}).get("acteur") not in (None, "", r.get("acteur")))
    return {
        "etapes": len(tasks), "decisions": len(decisions), "acteurs": sorted(actors), "outils": sorted(tools),
        "changements_acteur": handoffs,
        "etapes_sans_acteur": [r.get("id") for r in tasks if not r.get("acteur")],
        "taches_sans_outil": [r.get("id") for r in tasks if r.get("typeBpmn") == "Task" and not r.get("outil")],
    }


def _bian(query: str) -> List[Dict[str, Any]]:
    from database.supabase_client import get_supabase
    rows = get_supabase().table("bian_scenarios").select("title, category, url, participants").execute().data or []
    needle = (query or "").strip().lower()
    hits = [r for r in rows if needle and needle in (r.get("title") or "").lower()]
    return hits[:10]


def execute_tool(name: str, args: Dict[str, Any], ctx: AgentContext) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Exécute un outil. Renvoie (résultat pour le modèle, événements SSE pour le navigateur)."""
    events: List[Dict[str, Any]] = []
    if name == "lister_sources":
        return {"sources": [{"nom": f["filename"], "type": f["type"]} for f in ctx.files]}, events
    if name == "lire_source":
        f = _find_file(ctx, args.get("nom", ""))
        if not f:
            return {"erreur": "source introuvable", "sources": [x["filename"] for x in ctx.files]}, events
        text = _office_text(f)
        if not text:
            return {"info": "Ce document (PDF ou image) est joint au début de la conversation : lis-le directement."}, events
        start = max(0, int(args.get("debut") or 0))
        return {"texte": text[start:start + 8000], "debut": start, "taille_totale": len(text)}, events
    if name == "chercher_dans_sources":
        q = (args.get("requete") or "").strip()
        if not q:
            return {"erreur": "requête vide"}, events
        hits = []
        for f in ctx.files:
            text = _office_text(f)
            for m in re.finditer(re.escape(q), text, flags=re.I):
                hits.append({"source": f["filename"], "extrait": text[max(0, m.start() - 200):m.end() + 200]})
                if len(hits) >= 10:
                    break
        note = "" if any(_office_text(f) for f in ctx.files) else "Seuls les Word et PowerPoint sont cherchables ; les PDF et images sont joints directement."
        return {"resultats": hits, "note": note}, events
    if name == "lire_procedure":
        rows = [{k: r.get(k) for k in ("id", "étape", "typeBpmn", "acteur", "département", "outil", "condition", "outputs")}
                for r in ctx.workflow]
        return {"titre": ctx.metadata.get("nom"), "etapes": rows, "points_ouverts": ctx.metadata.get("open_points") or []}, events
    if name == "proposer_modification":
        if not ctx.workflow:
            return {"erreur": "Aucune procédure ouverte : utilise creer_procedure."}, events
        ops, errors = _validate_operations(args.get("operations"), ctx.workflow)
        if not ops:
            return {"erreur": "aucune opération valide", "details": errors}, events
        ctx.proposals += 1
        events.append({"type": "agent_proposal", "proposal_id": str(uuid.uuid4()), "kind": "modification",
                       "explanation": args.get("explication") or "", "operations": ops})
        return {"statut": "proposé à l'utilisateur, en attente de sa décision", "operations_retenues": len(ops),
                "operations_rejetees": errors}, events
    if name == "creer_procedure":
        names = [n for n in (args.get("fichiers") or []) if _find_file(ctx, n)]
        files = [_find_file(ctx, n)["filename"] for n in names] or [f["filename"] for f in ctx.files]
        if not files:
            return {"erreur": "aucune source jointe : demande un document ou une description"}, events
        ctx.to_generate.append({"id": f"agent{len(ctx.to_generate) + 1}", "title": (args.get("titre") or "Procédure")[:120],
                                "description": args.get("description") or "", "sources": [{"file": n} for n in files]})
        return {"statut": "formalisation lancée à la fin de ce tour", "sources": files}, events
    if name == "lister_points_ouverts":
        return {"points_ouverts": ctx.metadata.get("open_points") or []}, events
    if name == "proposer_point_ouvert":
        q = (args.get("question") or "").strip()
        if not q:
            return {"erreur": "question vide"}, events
        step = args.get("step_id")
        point = {"id": str(uuid.uuid4()), "step_id": step if step in {str(r.get('id')) for r in ctx.workflow} else None,
                 "question": q[:500], "type": args.get("type") if args.get("type") in POINT_TYPES else "autre",
                 "acteur": (args.get("acteur") or "")[:120], "origine": "detecte", "source": "", "statut": "ouvert", "reponse": ""}
        ctx.proposals += 1
        events.append({"type": "agent_proposal", "proposal_id": str(uuid.uuid4()), "kind": "point_ouvert",
                       "explanation": q, "point": point})
        return {"statut": "proposé à l'utilisateur"}, events
    if name == "proposer_reponse_point":
        points = {p.get("id"): p for p in ctx.metadata.get("open_points") or []}
        point = points.get(args.get("point_id"))
        if not point:
            return {"erreur": "point introuvable", "points": list(points)}, events
        ctx.proposals += 1
        events.append({"type": "agent_proposal", "proposal_id": str(uuid.uuid4()), "kind": "reponse_point",
                       "explanation": f"{point.get('question')} → {args.get('reponse')}",
                       "point_id": point["id"], "answer": (args.get("reponse") or "")[:1000]})
        return {"statut": "proposé à l'utilisateur"}, events
    if name == "consulter_bian":
        try:
            return {"scenarios": _bian(args.get("recherche") or "")}, events
        except Exception as e:
            return {"erreur": f"référentiel BIAN indisponible ({str(e)[:80]})"}, events
    if name == "analyser_complexite":
        if not ctx.workflow:
            return {"erreur": "aucune procédure ouverte"}, events
        return complexity(ctx.workflow), events
    return {"erreur": f"outil inconnu : {name}"}, events


# ── Boucle ───────────────────────────────────────────────────────

def _initial_contents(ctx: AgentContext) -> list:
    from google.genai import types
    from processor.studio_planner import file_to_parts
    contents = []
    for h in ctx.history:
        role = "user" if h.get("role") == "user" else "model"
        if h.get("content"):
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=h["content"])]))
    parts: list = []
    for f in ctx.files:
        if f.get("type") in ("pdf", "image"):  # Word / PowerPoint : via lire_source, pour économiser le contexte
            parts.append(types.Part.from_text(text=f"--- Source : {f['filename']} ---"))
            for p in file_to_parts(f):
                if isinstance(p, dict) and "inline_data" in p:
                    import base64
                    data = p["inline_data"]["data"]
                    parts.append(types.Part.from_bytes(data=base64.b64decode(data) if isinstance(data, str) else data,
                                                       mime_type=p["inline_data"]["mime_type"]))
                elif p.__class__.__module__.startswith("PIL."):
                    import io
                    buf = io.BytesIO()
                    p.save(buf, format="PNG")
                    parts.append(types.Part.from_bytes(data=buf.getvalue(), mime_type="image/png"))
    sources = ", ".join(f["filename"] for f in ctx.files) or "aucune"
    opened = f"une procédure de {len(ctx.workflow)} étapes" if ctx.workflow else "aucune procédure"
    parts.append(types.Part.from_text(text=f"[Sources : {sources}. Ouvert : {opened}.]\n\n{ctx.message}"))
    contents.append(types.Content(role="user", parts=parts))
    return contents


async def run_agent(ctx: AgentContext, is_disconnected: Callable[[], Any],
                    generate: Optional[Callable[..., Any]] = None) -> AsyncIterator[Dict[str, Any]]:
    """Déroule la boucle et produit les événements SSE (dicts). `generate` est injectable pour les tests."""
    from google.genai import types
    if generate is None:
        from manager.model_manager import generate_content as generate

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM, temperature=0.2, max_output_tokens=max_output_tokens(),
        tools=[types.Tool(function_declarations=[types.FunctionDeclaration(**d) for d in TOOL_DECLARATIONS])],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    contents = _initial_contents(ctx)
    for step in range(max_steps()):
        if await is_disconnected():
            return
        yield {"type": "status", "id": f"agent{step}", "label": "Réflexion", "state": "running"}
        response = await asyncio.to_thread(generate, contents, config, "Agent Studio")
        calls = list(getattr(response, "function_calls", None) or [])
        if not calls:
            yield {"type": "status", "id": f"agent{step}", "label": "Réponse", "state": "done"}
            text = (getattr(response, "text", None) or "").strip()
            yield {"type": "message", "text": text or "Je n'ai rien à ajouter."}
            return
        labels = ", ".join(dict.fromkeys(TOOL_LABELS.get(c.name, c.name) for c in calls))
        yield {"type": "status", "id": f"agent{step}", "label": labels, "state": "done"}
        contents.append(response.candidates[0].content)
        reply_parts = []
        for call in calls:
            try:
                result, events = execute_tool(call.name, dict(call.args or {}), ctx)
            except Exception as e:
                logger.warning(f"⚠️ Outil {call.name} en échec : {e}")
                result, events = {"erreur": "outil en échec"}, []
            for ev in events:
                yield ev
            reply_parts.append(types.Part.from_function_response(name=call.name, response={"result": json.loads(json.dumps(result, default=str))}))
        contents.append(types.Content(role="user", parts=reply_parts))
    yield {"type": "message", "text": "J'ai atteint le nombre maximal d'étapes pour ce message. Dites-moi comment poursuivre."}

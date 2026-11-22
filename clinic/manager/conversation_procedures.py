# clinic/manager/conversation_procedures.py
"""
Procédures de la conversation, côté serveur, avec leurs versions (docs/conversation-serveur.md).

Le serveur fait foi : chaque génération, modification par le chat, correction à la main ou restauration
crée une version (rien n'est écrasé). L'écran affiche ce que le serveur dit.

Format d'échange (le même que l'écran envoyait jusqu'ici, plus `version`) :
    {"key", "title", "workflow", "enrichments", "procedureMetadata", "bpmnXml", "workflow_db_id", "archived",
     "version", "saved_version"}

Tant que les tables ne sont pas créées (database/conversation_procedures_schema.sql) ou si
CONVERSATION_PROCEDURES_SERVEUR=false, available() est faux et tout continue comme avant.
"""

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

PROCS, VERSIONS = "conversation_procedures", "conversation_procedure_versions"
ORIGINES = {"generation", "modification", "transcription", "reecriture", "manuel", "restauration", "reprise"}
MAX_PROCEDURES = 30
MANUAL_WINDOW_S = 60          # corrections à la main d'une même minute : une seule version
_available: Dict[str, float] = {}   # {"ok": horodatage} ou {"ko": horodatage}


class Conflict(Exception):
    """La procédure a changé depuis la version dont partait la correction."""

    def __init__(self, current: Dict[str, Any]):
        super().__init__("La procédure a changé entre-temps")
        self.current = current


def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def available() -> bool:
    """Réglage actif et tables présentes (vérifié au plus toutes les 5 minutes quand elles manquent)."""
    if os.getenv("CONVERSATION_PROCEDURES_SERVEUR", "true").lower() != "true":
        return False
    if "ok" in _available:
        return True
    if time.time() - _available.get("ko", 0) < 300:
        return False
    try:
        _db().table(PROCS).select("id").limit(1).execute()
        _available.clear()
        _available["ok"] = time.time()
        return True
    except Exception as e:
        logger.info(f"ℹ️ Procédures de conversation côté serveur indisponibles (tables absentes ?) : {str(e)[:120]}")
        _available["ko"] = time.time()
        return False


# ── Lecture ──────────────────────────────────────────────────────

def _rows(conversation_id: str) -> List[Dict[str, Any]]:
    return (_db().table(PROCS).select("*").eq("conversation_id", conversation_id)
            .order("position").execute().data or [])


def _version(proc_id: str, version: int) -> Optional[Dict[str, Any]]:
    rows = (_db().table(VERSIONS).select("*").eq("procedure_id", proc_id).eq("version", version)
            .limit(1).execute().data or [])
    return rows[0] if rows else None


def _exchange(proc: Dict[str, Any], ver: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    ver = ver or {}
    return {
        "key": proc["key"], "title": proc.get("title") or ver.get("title") or "Procédure",
        "workflow": ver.get("workflow_json") or [], "enrichments": ver.get("enrichments_json") or {},
        "procedureMetadata": ver.get("metadata") or None, "bpmnXml": ver.get("bpmn_xml"),
        "workflow_db_id": proc.get("workflow_db_id"), "archived": proc.get("status") == "archivee",
        "version": proc.get("current_version") or 1, "saved_version": proc.get("saved_version"),
    }


def list_procedures(conversation_id: str, include_archived: bool = True) -> List[Dict[str, Any]]:
    """Les procédures de la conversation, chacune dans sa version courante."""
    out = []
    for proc in _rows(conversation_id):
        if proc.get("status") == "archivee" and not include_archived:
            continue
        out.append(_exchange(proc, _version(proc["id"], proc.get("current_version") or 1)))
    return out


def get(conversation_id: str, key: str) -> Optional[Dict[str, Any]]:
    rows = (_db().table(PROCS).select("*").eq("conversation_id", conversation_id).eq("key", key)
            .limit(1).execute().data or [])
    return rows[0] if rows else None


def current(conversation_id: str, key: str) -> Optional[Dict[str, Any]]:
    proc = get(conversation_id, key)
    return _exchange(proc, _version(proc["id"], proc.get("current_version") or 1)) if proc else None


def versions(conversation_id: str, key: str) -> List[Dict[str, Any]]:
    """Historique d'une procédure (sans le contenu), la plus récente d'abord."""
    proc = get(conversation_id, key)
    if not proc:
        return []
    rows = (_db().table(VERSIONS).select("version,title,origine,message_id,resume,created_at,updated_at")
            .eq("procedure_id", proc["id"]).order("version", desc=True).execute().data or [])
    return [{**r, "courante": r.get("version") == proc.get("current_version"),
             "enregistree": r.get("version") == proc.get("saved_version")} for r in rows]


def version_content(conversation_id: str, key: str, version: int) -> Optional[Dict[str, Any]]:
    proc = get(conversation_id, key)
    ver = _version(proc["id"], version) if proc else None
    return {**_exchange(proc, ver), "version": version, "title": ver.get("title") or proc.get("title")} if ver else None


# ── Écriture ─────────────────────────────────────────────────────

def _content_row(content: Dict[str, Any]) -> Dict[str, Any]:
    return {"title": (content.get("title") or "Procédure")[:200],
            "workflow_json": content.get("workflow") or [],
            "enrichments_json": content.get("enrichments") or {},
            "metadata": content.get("procedureMetadata") or {},
            "bpmn_xml": content.get("bpmnXml")}


def create(conversation_id: str, key: str, content: Dict[str, Any], origine: str = "generation",
           message_id: Optional[str] = None, resume: Optional[str] = None,
           author_id: Optional[str] = None) -> Dict[str, Any]:
    """Nouvelle procédure de la conversation, avec sa version 1. Une clé déjà présente reçoit une nouvelle version."""
    existing = get(conversation_id, key)
    if existing:
        return add_version(existing, content, origine, message_id, resume, author_id)
    rows = _rows(conversation_id)
    if len(rows) >= MAX_PROCEDURES:
        raise ValueError(f"Une conversation garde au plus {MAX_PROCEDURES} procédures.")
    proc = _db().table(PROCS).insert({
        "conversation_id": conversation_id, "key": key, "title": (content.get("title") or "Procédure")[:200],
        "position": max([r.get("position") or 0 for r in rows] + [-1]) + 1, "status": "active",
        "current_version": 1, "workflow_db_id": content.get("workflow_db_id"),
    }).execute().data[0]
    _db().table(VERSIONS).insert({"procedure_id": proc["id"], "version": 1, **_content_row(content),
                                  "origine": origine if origine in ORIGINES else "generation",
                                  "message_id": message_id, "resume": resume, "author_id": author_id}).execute()
    return _exchange(proc, _version(proc["id"], 1))


def add_version(proc: Dict[str, Any], content: Dict[str, Any], origine: str, message_id: Optional[str] = None,
                resume: Optional[str] = None, author_id: Optional[str] = None,
                base_version: Optional[int] = None) -> Dict[str, Any]:
    """Nouvelle version de la procédure. `base_version` : la version dont part une correction à la main ;
    si la procédure a avancé entre-temps → Conflict (rien n'est écrit)."""
    cur = proc.get("current_version") or 1
    if base_version is not None and int(base_version) != cur:
        raise Conflict(_exchange(proc, _version(proc["id"], cur)))
    last = _version(proc["id"], cur)
    row = _content_row({**content, "title": content.get("title") or proc.get("title")})
    # corrections à la main successives d'une même personne, dans la minute : la même version
    if origine == "manuel" and last and last.get("origine") == "manuel" and last.get("author_id") == author_id \
            and _recent(last.get("updated_at") or last.get("created_at")):
        _db().table(VERSIONS).update({**row, "updated_at": _now()}).eq("id", last["id"]).execute()
        version = cur
    else:
        version = cur + 1
        try:
            _db().table(VERSIONS).insert({"procedure_id": proc["id"], "version": version, **row,
                                          "origine": origine if origine in ORIGINES else "modification",
                                          "message_id": message_id, "resume": resume, "author_id": author_id}).execute()
        except Exception as e:  # deux écritures simultanées : la contrainte unique tranche
            if "duplicate" in str(e).lower() or "unique" in str(e).lower():
                fresh = get(proc["conversation_id"], proc["key"])
                raise Conflict(_exchange(fresh, _version(fresh["id"], fresh.get("current_version") or 1)))
            raise
    fields = {"current_version": version, "title": row["title"], "updated_at": _now()}
    if content.get("workflow_db_id"):
        fields["workflow_db_id"] = content["workflow_db_id"]
    _db().table(PROCS).update(fields).eq("id", proc["id"]).execute()
    return _exchange({**proc, **fields}, _version(proc["id"], version))


def _recent(stamp: Optional[str]) -> bool:
    try:
        t = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
        return datetime.now(timezone.utc) - t < timedelta(seconds=MANUAL_WINDOW_S)
    except Exception:
        return False


def set_archived(conversation_id: str, keys: List[str], archived: bool) -> int:
    n = 0
    for key in keys or []:
        proc = get(conversation_id, key)
        if proc:
            _db().table(PROCS).update({"status": "archivee" if archived else "active", "updated_at": _now()}) \
                .eq("id", proc["id"]).execute()
            n += 1
    return n


def restore_version(conversation_id: str, key: str, version: int, author_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Revenir à une version : une nouvelle version « restauration » (l'historique reste entier)."""
    proc = get(conversation_id, key)
    old = _version(proc["id"], version) if proc else None
    if not old:
        return None
    content = {"title": old.get("title"), "workflow": old.get("workflow_json"), "enrichments": old.get("enrichments_json"),
               "procedureMetadata": old.get("metadata"), "bpmnXml": old.get("bpmn_xml")}
    return add_version(proc, content, "restauration", resume=f"retour à la version {version}", author_id=author_id)


def link_saved(conversation_id: str, key: str, workflow_db_id: str, version: Optional[int] = None) -> bool:
    """Enregistrée dans le référentiel : on garde le lien et la version enregistrée."""
    proc = get(conversation_id, key)
    if not proc:
        return False
    _db().table(PROCS).update({"workflow_db_id": workflow_db_id,
                               "saved_version": int(version) if version else proc.get("current_version"),
                               "updated_at": _now()}).eq("id", proc["id"]).execute()
    return True


def reorder(conversation_id: str, keys: List[str]) -> None:
    for i, key in enumerate(keys or []):
        proc = get(conversation_id, key)
        if proc and proc.get("position") != i:
            _db().table(PROCS).update({"position": i}).eq("id", proc["id"]).execute()


# ── Reprise des conversations existantes (lot D) ─────────────────

def ensure_seeded(conv: Dict[str, Any]) -> bool:
    """Une conversation d'avant : ses procédures (state.procedures, recopiées par l'écran) deviennent la version 1
    « reprise », à sa première ouverture. Rien à faire si la conversation a déjà ses procédures côté serveur."""
    state = conv.get("state") or {}
    stored = [p for p in state.get("procedures") or [] if isinstance(p, dict) and p.get("key")]
    if not stored or _rows(conv["id"]):
        return False
    for p in stored[:MAX_PROCEDURES]:
        create(conv["id"], p["key"], p, "reprise", resume="reprise de la conversation existante")
        if p.get("archived"):
            set_archived(conv["id"], [p["key"]], True)
    return True

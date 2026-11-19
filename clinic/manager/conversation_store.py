"""
Conversations persistées : accès aux tables conversations, conversation_messages,
conversation_sources (clinic/database/conversations_schema.sql) et aux fichiers.

Le backend écrit avec la clé de service : CHAQUE fonction publique qui reçoit un
owner_id vérifie que la conversation appartient bien à cet utilisateur.

Pas de mémoire implicite : ce qui est stocké ici (messages, sources, résumé des anciens
échanges) est exactement ce que l'assistant peut voir, et l'utilisateur le voit aussi.

Activation : CONVERSATIONS_ENABLED=true (désactivé par défaut).
"""

import hashlib
import logging
import os
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)

BUCKET = "processmate-files"
PREFIX = "conversations"
RECENT_MESSAGES = 12        # échanges envoyés tels quels au modèle
SUMMARIZE_AFTER = 20        # au-delà, les plus anciens sont résumés


def enabled() -> bool:
    return os.getenv("CONVERSATIONS_ENABLED", "true").lower() == "true"  # activé par défaut ; =false pour couper


def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_uuid(value: Optional[str]) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, TypeError):
        return False


# ── Conversations ────────────────────────────────────────────────

def create(owner_id: str, title: str = "Nouvelle conversation", procedure_ids: Iterable[str] = (),
           project_id: Optional[str] = None) -> Dict[str, Any]:
    row = {"owner_id": owner_id, "title": (title or "Nouvelle conversation")[:120],
           "procedure_ids": [p for p in procedure_ids if p]}
    if project_id:
        row["project_id"] = project_id
    return _db().table("conversations").insert(row).execute().data[0]


def get_owned(conversation_id: str, owner_id: str) -> Optional[Dict[str, Any]]:
    if not is_uuid(conversation_id) or not owner_id:
        return None
    rows = (_db().table("conversations").select("*")
            .eq("id", conversation_id).eq("owner_id", owner_id).execute().data)
    return rows[0] if rows else None


_LIST_COLS = "id,title,procedure_ids,project_id,created_at,updated_at,archived_at"


def list_for(owner_id: str, limit: int = 50, include_archived: bool = False,
             procedure_id: Optional[str] = None, project_id: Optional[str] = None,
             search: Optional[str] = None) -> List[Dict[str, Any]]:
    def query(cols: str):
        q = _db().table("conversations").select(cols).eq("owner_id", owner_id)
        if not include_archived:
            q = q.is_("archived_at", "null")
        if procedure_id:
            q = q.contains("procedure_ids", [procedure_id])
        if project_id:
            q = q.eq("project_id", project_id)
        if search and search.strip():
            q = q.ilike("title", f"%{search.strip()[:80]}%")
        return q.order("updated_at", desc=True).limit(max(1, min(limit, 200))).execute().data
    try:
        return query(_LIST_COLS + ",pinned_at")
    except Exception:  # colonne pinned_at pas encore créée (migration chat_projets.sql)
        return query(_LIST_COLS)


_UPDATABLE = {"title", "archived_at", "state", "summary", "summary_upto", "procedure_ids", "project_id", "pinned_at"}
# Renommer ou épingler ne fait pas remonter la conversation dans les récents
_SILENT = {"title", "pinned_at"}


def update(conversation_id: str, owner_id: str, **fields) -> Optional[Dict[str, Any]]:
    if not get_owned(conversation_id, owner_id):
        return None
    data = {k: v for k, v in fields.items() if k in _UPDATABLE}
    if not set(data) <= _SILENT:
        data["updated_at"] = _now()
    if not data:
        return get_owned(conversation_id, owner_id)
    rows = (_db().table("conversations").update(data)
            .eq("id", conversation_id).eq("owner_id", owner_id).execute().data)
    return rows[0] if rows else None


def link_procedure(conversation_id: str, owner_id: str, procedure_id: str) -> Optional[Dict[str, Any]]:
    conv = get_owned(conversation_id, owner_id)
    if not conv or not procedure_id:
        return conv
    ids = list(dict.fromkeys([*(conv.get("procedure_ids") or []), procedure_id]))
    return update(conversation_id, owner_id, procedure_ids=ids)


def delete(conversation_id: str, owner_id: str) -> bool:
    if not get_owned(conversation_id, owner_id):
        return False
    paths = [s["storage_path"] for s in sources(conversation_id, include_removed=True)]
    if paths:
        try:
            _db().storage.from_(BUCKET).remove(paths)
        except Exception as e:
            logger.warning(f"⚠️ Fichiers de conversation non supprimés : {str(e)[:120]}")
    _db().table("conversations").delete().eq("id", conversation_id).eq("owner_id", owner_id).execute()
    return True


def touch(conversation_id: str) -> None:
    _db().table("conversations").update({"updated_at": _now()}).eq("id", conversation_id).execute()


# ── Messages ─────────────────────────────────────────────────────

def messages(conversation_id: str) -> List[Dict[str, Any]]:
    return (_db().table("conversation_messages").select("*")
            .eq("conversation_id", conversation_id).order("created_at").execute().data)


def add_message(conversation_id: str, role: str, content: str, payload: Optional[Dict[str, Any]] = None,
                interaction_id: Optional[str] = None) -> Dict[str, Any]:
    row = {"conversation_id": conversation_id, "role": role, "content": content or "",
           "payload": payload or {}}
    if interaction_id:
        row["interaction_id"] = interaction_id
    saved = _db().table("conversation_messages").insert(row).execute().data[0]
    touch(conversation_id)
    return saved


def update_message_payload(message_id: str, conversation_id: str, payload: Dict[str, Any]) -> None:
    (_db().table("conversation_messages").update({"payload": payload})
     .eq("id", message_id).eq("conversation_id", conversation_id).execute())


# ── Sources ──────────────────────────────────────────────────────

def sources(conversation_id: str, include_removed: bool = False) -> List[Dict[str, Any]]:
    q = _db().table("conversation_sources").select("*").eq("conversation_id", conversation_id)
    if not include_removed:
        q = q.is_("removed_at", "null")
    return q.order("added_at").execute().data


def _safe_name(name: str) -> str:
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")[:80] or "fichier"


_MIME = {"pdf": "application/pdf", "image": "image/png",
         "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
         "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}


def add_sources(conversation_id: str, owner_id: str, files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Ajoute les fichiers (entrées de studio_router._read_files) aux sources actives.

    Dédoublonnage par empreinte : un fichier déjà présent n'est ni re-téléversé ni ajouté.
    Renvoie les lignes réellement ajoutées.
    """
    existing = {s["sha256"] for s in sources(conversation_id)}
    added = []
    for f in files:
        data = f.get("data") or b""
        sha = hashlib.sha256(data).hexdigest()
        if sha in existing:
            continue
        path = f"{PREFIX}/{owner_id}/{conversation_id}/{sha[:16]}-{_safe_name(f['filename'])}"
        try:
            _db().storage.from_(BUCKET).upload(path=path, file=data,
                                               file_options={"content-type": f.get("content_type") or _MIME.get(f["type"], "application/octet-stream"),
                                                             "upsert": "true"})
        except Exception as e:
            raise RuntimeError(f"Enregistrement du fichier « {f['filename']} » impossible") from e
        row = {"conversation_id": conversation_id, "filename": f["filename"], "type": f["type"],
               "size": f.get("size") or len(data), "sha256": sha, "storage_path": path}
        added.append(_db().table("conversation_sources").insert(row).execute().data[0])
        existing.add(sha)
    if added:
        touch(conversation_id)
    return added


def remove_source(conversation_id: str, owner_id: str, source_id: str) -> bool:
    if not get_owned(conversation_id, owner_id) or not is_uuid(source_id):
        return False
    rows = (_db().table("conversation_sources").update({"removed_at": _now()})
            .eq("id", source_id).eq("conversation_id", conversation_id).execute().data)
    if rows:
        touch(conversation_id)
    return bool(rows)


def download(storage_path: str) -> bytes:
    return _db().storage.from_(BUCKET).download(storage_path)


# ── Contexte pour le modèle ──────────────────────────────────────

def _assistant_text(msg: Dict[str, Any]) -> str:
    """Texte d'un message de l'assistant tel que le modèle doit s'en souvenir (payload résumé)."""
    p = msg.get("payload") or {}
    parts = [msg.get("content") or ""]
    if p.get("proposal"):
        titles = [x.get("title", "") for x in p["proposal"].get("procedures", [])]
        parts.append("Procédures proposées : " + " ; ".join(titles))
    for g in p.get("generations") or []:
        parts.append(f"Procédure générée : « {g.get('title')} » ({g.get('steps') or 0} étapes, {g.get('status')})")
    if p.get("remarks"):
        parts.append("Relecture : " + p["remarks"][:1500])
    if p.get("suggestions"):
        parts.append("Suggestions proposées : " + " ; ".join(p["suggestions"]))
    return "\n".join(x for x in parts if x).strip()


def _user_text(msg: Dict[str, Any]) -> str:
    att = (msg.get("payload") or {}).get("attachments") or []
    names = ", ".join(a.get("name", "") for a in att)
    return ((msg.get("content") or "") + (f"\n[Fichiers joints : {names}]" if names else "")).strip()


def history_for_model(msgs: List[Dict[str, Any]], summary: Optional[str] = None,
                      summary_upto: int = 0) -> List[Dict[str, str]]:
    """Historique envoyé au modèle : résumé des anciens échanges + derniers messages complets."""
    history: List[Dict[str, str]] = []
    if summary and summary_upto > 0:
        history.append({"role": "user", "content": f"[Résumé des échanges précédents]\n{summary}"})
    recent = msgs[summary_upto:] if summary else msgs
    recent = recent[-RECENT_MESSAGES:]
    for m in recent:
        if m.get("role") == "user":
            history.append({"role": "user", "content": _user_text(m)})
        elif m.get("role") in ("assistant", "clarify"):
            text = _assistant_text(m)
            if text:
                history.append({"role": "assistant", "content": text})
    return history


def needs_summary(msgs: List[Dict[str, Any]], summary_upto: int) -> bool:
    return len(msgs) - summary_upto > SUMMARIZE_AFTER


def summary_input(msgs: List[Dict[str, Any]], previous_summary: Optional[str], upto: int) -> str:
    """Texte à résumer : résumé précédent + messages anciens non encore couverts."""
    lines = [f"Résumé existant :\n{previous_summary}"] if previous_summary else []
    for m in msgs[:upto]:
        role = "Utilisateur" if m.get("role") == "user" else "Assistant"
        text = _user_text(m) if m.get("role") == "user" else _assistant_text(m)
        lines.append(f"{role} : {text[:2000]}")
    return "\n\n".join(lines)


def title_from(message: str, files: List[Dict[str, Any]]) -> str:
    text = " ".join((message or "").split())
    if text:
        return text[:60] + ("…" if len(text) > 60 else "")
    if files:
        return files[0].get("filename", "Nouvelle conversation")[:60]
    return "Nouvelle conversation"

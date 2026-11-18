"""
Projets (lot 4) : instructions + sources partagées + conversations.

Accès : le propriétaire, ou un membre (project_members). Écriture des instructions et
des sources : propriétaire ou éditeur. Toutes les fonctions publiques vérifient l'accès.

Activation : avec les conversations (CONVERSATIONS_ENABLED).
"""

import hashlib
import logging
from typing import Any, Dict, List, Optional

from manager import conversation_store as conv_store

logger = logging.getLogger(__name__)

PREFIX = "projects"


def _db():
    return conv_store._db()


def _role(project: Dict[str, Any], user_id: str) -> Optional[str]:
    if project.get("owner_id") == user_id:
        return "owner"
    rows = (_db().table("project_members").select("role")
            .eq("project_id", project["id"]).eq("user_id", user_id).execute().data)
    return rows[0]["role"] if rows else None


def get_accessible(project_id: str, user_id: str, write: bool = False) -> Optional[Dict[str, Any]]:
    if not conv_store.is_uuid(project_id) or not user_id:
        return None
    rows = _db().table("projects").select("*").eq("id", project_id).execute().data
    if not rows:
        return None
    project = rows[0]
    role = _role(project, user_id)
    if role is None or (write and role == "viewer"):
        return None
    return {**project, "my_role": role}


def list_for(user_id: str, include_archived: bool = False) -> List[Dict[str, Any]]:
    owned = _db().table("projects").select("*").eq("owner_id", user_id)
    if not include_archived:
        owned = owned.is_("archived_at", "null")
    rows = owned.order("updated_at", desc=True).execute().data
    member_ids = [m["project_id"] for m in
                  _db().table("project_members").select("project_id").eq("user_id", user_id).execute().data]
    if member_ids:
        shared = _db().table("projects").select("*").in_("id", member_ids)
        if not include_archived:
            shared = shared.is_("archived_at", "null")
        known = {r["id"] for r in rows}
        rows += [r for r in shared.execute().data if r["id"] not in known]
    return rows


def create(user_id: str, name: str, instructions: str = "", campaign_id: Optional[str] = None) -> Dict[str, Any]:
    row = {"owner_id": user_id, "name": (name or "Nouveau projet")[:120], "instructions": instructions or ""}
    if campaign_id and conv_store.is_uuid(campaign_id):
        row["campaign_id"] = campaign_id
    return _db().table("projects").insert(row).execute().data[0]


def update(project_id: str, user_id: str, **fields) -> Optional[Dict[str, Any]]:
    if not get_accessible(project_id, user_id, write=True):
        return None
    data = {k: v for k, v in fields.items() if k in {"name", "instructions", "archived_at", "campaign_id"}}
    data["updated_at"] = conv_store._now()
    return _db().table("projects").update(data).eq("id", project_id).execute().data[0]


def delete(project_id: str, user_id: str) -> bool:
    project = get_accessible(project_id, user_id, write=True)
    if not project or project["my_role"] != "owner":
        return False
    paths = [s["storage_path"] for s in sources(project_id, include_removed=True)]
    if paths:
        try:
            _db().storage.from_(conv_store.BUCKET).remove(paths)
        except Exception as e:
            logger.warning(f"⚠️ Fichiers de projet non supprimés : {str(e)[:120]}")
    _db().table("projects").delete().eq("id", project_id).execute()
    return True


def sources(project_id: str, include_removed: bool = False) -> List[Dict[str, Any]]:
    q = _db().table("project_sources").select("*").eq("project_id", project_id)
    if not include_removed:
        q = q.is_("removed_at", "null")
    return q.order("added_at").execute().data


def add_sources(project_id: str, user_id: str, files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not get_accessible(project_id, user_id, write=True):
        return []
    existing = {s["sha256"] for s in sources(project_id)}
    added = []
    for f in files:
        data = f.get("data") or b""
        sha = hashlib.sha256(data).hexdigest()
        if sha in existing:
            continue
        path = f"{PREFIX}/{project_id}/{sha[:16]}-{conv_store._safe_name(f['filename'])}"
        _db().storage.from_(conv_store.BUCKET).upload(
            path=path, file=data,
            file_options={"content-type": conv_store._MIME.get(f["type"], "application/octet-stream"), "upsert": "true"})
        row = {"project_id": project_id, "filename": f["filename"], "type": f["type"],
               "size": f.get("size") or len(data), "sha256": sha, "storage_path": path, "added_by": user_id}
        added.append(_db().table("project_sources").insert(row).execute().data[0])
        existing.add(sha)
    return added


def remove_source(project_id: str, user_id: str, source_id: str) -> bool:
    if not get_accessible(project_id, user_id, write=True) or not conv_store.is_uuid(source_id):
        return False
    rows = (_db().table("project_sources").update({"removed_at": conv_store._now()})
            .eq("id", source_id).eq("project_id", project_id).execute().data)
    return bool(rows)


def instructions_message(project: Dict[str, Any]) -> Optional[Dict[str, str]]:
    """Instructions du projet, placées en tête de l'historique envoyé au modèle."""
    text = (project.get("instructions") or "").strip()
    if not text:
        return None
    return {"role": "user", "content": f"[Instructions du projet « {project.get('name')} »]\n{text}"}

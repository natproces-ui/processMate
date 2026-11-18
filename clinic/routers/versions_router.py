"""
Versions de procédure (lot 5) : historique, contenu d'une version, restauration.
Connexion requise ; actif avec VERSIONS_ENABLED.
"""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from manager import version_store
from manager.auth import AuthUser, require_user

router = APIRouter(prefix="/api/procedures", tags=["Versions"])


def _enabled() -> None:
    if not version_store.enabled():
        raise HTTPException(404, "Versions non activées")


@router.get("/{procedure_id}/versions", dependencies=[Depends(_enabled)])
async def list_versions(procedure_id: str, user: AuthUser = Depends(require_user)):
    return {"versions": await asyncio.to_thread(version_store.list_versions, procedure_id)}


@router.get("/{procedure_id}/versions/{version_id}", dependencies=[Depends(_enabled)])
async def get_version(procedure_id: str, version_id: str, user: AuthUser = Depends(require_user)):
    v = await asyncio.to_thread(version_store.get, procedure_id, version_id)
    if not v:
        raise HTTPException(404, "Version introuvable")
    return {"version": v}


@router.post("/{procedure_id}/versions/{version_id}/restore", dependencies=[Depends(_enabled)])
async def restore_version(procedure_id: str, version_id: str, user: AuthUser = Depends(require_user)):
    """La procédure reprend le contenu de la version ; une nouvelle version « restauration » est créée."""
    v = await asyncio.to_thread(version_store.get, procedure_id, version_id)
    if not v:
        raise HTTPException(404, "Version introuvable")

    def _restore():
        from database.supabase_client import get_supabase
        db = get_supabase()
        rows = db.table("workflows").select("procedure_metadata_json").eq("id", procedure_id).execute().data
        if not rows:
            raise HTTPException(404, "Procédure introuvable")
        enrichments = dict(v.get("enrichments_json") or {})
        if v.get("bpmn_xml"):
            enrichments["__bpmn_xml__"] = v["bpmn_xml"]
        meta = {**(rows[0].get("procedure_metadata_json") or {}), **(v.get("metadata") or {}),
                "has_unsaved_changes": True, "last_modified_at": datetime.now(timezone.utc).isoformat()}
        db.table("workflows").update({"workflow_json": v.get("workflow_json") or [], "enrichments_json": enrichments,
                                      "procedure_metadata_json": meta}).eq("id", procedure_id).execute()
        return version_store.add(procedure_id, v.get("workflow_json") or [], enrichments, v.get("metadata") or {},
                                 "restauration", user.id)

    created = await asyncio.to_thread(_restore)
    return {"success": True, "version": {k: created.get(k) for k in ("id", "version", "source", "created_at")}}

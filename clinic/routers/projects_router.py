"""
Projets (lot 4) : instructions et sources partagées par les conversations du projet.
Connexion requise ; actif avec CONVERSATIONS_ENABLED.
"""

import asyncio
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from manager import conversation_store as conv_store
from manager import project_store as store
from manager.auth import AuthUser, require_user

router = APIRouter(prefix="/api/projects", tags=["Projets"])


def _enabled() -> None:
    if not conv_store.enabled():
        raise HTTPException(404, "Projets non activés")


class CreateBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    instructions: str = ""
    campaign_id: Optional[str] = None


class UpdateBody(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    instructions: Optional[str] = None
    archived: Optional[bool] = None


def _public(p: dict) -> dict:
    return {k: p.get(k) for k in ("id", "name", "instructions", "campaign_id", "created_at", "updated_at",
                                  "archived_at", "my_role")}


def _public_source(s: dict) -> dict:
    return {k: s.get(k) for k in ("id", "filename", "type", "size", "added_at")}


def _forget_project_sessions() -> None:
    """Les sources d'un projet ont changé : les sessions en cache seront reconstruites."""
    from routers.studio_router import _sessions
    for sid in [k for k, v in _sessions.items() if v.get("persisted")]:
        _sessions.pop(sid, None)


@router.get("", dependencies=[Depends(_enabled)])
async def list_projects(user: AuthUser = Depends(require_user)):
    rows = await asyncio.to_thread(store.list_for, user.id)
    return {"projects": [_public({**r, "my_role": "owner" if r["owner_id"] == user.id else "member"}) for r in rows]}


@router.post("", dependencies=[Depends(_enabled)])
async def create_project(body: CreateBody, user: AuthUser = Depends(require_user)):
    p = await asyncio.to_thread(store.create, user.id, body.name.strip(), body.instructions, body.campaign_id)
    return {"project": _public({**p, "my_role": "owner"})}


@router.get("/{project_id}", dependencies=[Depends(_enabled)])
async def get_project(project_id: str, user: AuthUser = Depends(require_user)):
    p = await asyncio.to_thread(store.get_accessible, project_id, user.id)
    if not p:
        raise HTTPException(404, "Projet introuvable")
    srcs, convs = await asyncio.gather(
        asyncio.to_thread(store.sources, project_id),
        asyncio.to_thread(conv_store.list_for, user.id, 100, False, None, project_id),
    )
    return {"project": _public(p), "sources": [_public_source(s) for s in srcs],
            "conversations": [{k: c.get(k) for k in ("id", "title", "updated_at")} for c in convs]}


@router.patch("/{project_id}", dependencies=[Depends(_enabled)])
async def update_project(project_id: str, body: UpdateBody, user: AuthUser = Depends(require_user)):
    fields = {}
    if body.name is not None:
        fields["name"] = body.name.strip() or "Projet"
    if body.instructions is not None:
        fields["instructions"] = body.instructions
    if body.archived is not None:
        fields["archived_at"] = datetime.now(timezone.utc).isoformat() if body.archived else None
    p = await asyncio.to_thread(store.update, project_id, user.id, **fields)
    if not p:
        raise HTTPException(404, "Projet introuvable ou lecture seule")
    _forget_project_sessions()  # les instructions font partie du contexte
    return {"project": _public(p)}


@router.delete("/{project_id}", dependencies=[Depends(_enabled)])
async def delete_project(project_id: str, user: AuthUser = Depends(require_user)):
    if not await asyncio.to_thread(store.delete, project_id, user.id):
        raise HTTPException(404, "Projet introuvable ou suppression réservée au propriétaire")
    _forget_project_sessions()
    return {"success": True}


@router.post("/{project_id}/sources", dependencies=[Depends(_enabled)])
async def add_project_sources(project_id: str, files: List[UploadFile] = File(...), user: AuthUser = Depends(require_user)):
    from routers.studio_router import _read_files  # mêmes formats et limites que le chat
    if not await asyncio.to_thread(store.get_accessible, project_id, user.id, True):
        raise HTTPException(404, "Projet introuvable ou lecture seule")
    entries = await _read_files(files)
    added = await asyncio.to_thread(store.add_sources, project_id, user.id, entries)
    _forget_project_sessions()
    return {"added": [_public_source(s) for s in added]}


@router.delete("/{project_id}/sources/{source_id}", dependencies=[Depends(_enabled)])
async def remove_project_source(project_id: str, source_id: str, user: AuthUser = Depends(require_user)):
    if not await asyncio.to_thread(store.remove_source, project_id, user.id, source_id):
        raise HTTPException(404, "Source introuvable")
    _forget_project_sessions()
    return {"success": True}

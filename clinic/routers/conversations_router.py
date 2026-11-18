"""
Conversations persistées du chat (lot 3 de la refonte).

Toutes les routes exigent un utilisateur connecté et ne touchent qu'à SES conversations.
Les tours de conversation eux-mêmes passent par /api/studio/turn (session_id = id de la
conversation). Désactivé tant que CONVERSATIONS_ENABLED n'est pas à true (404).
"""

import asyncio
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from manager import conversation_store as store
from manager.auth import AuthUser, require_user

router = APIRouter(prefix="/api/conversations", tags=["Conversations"])


def _enabled() -> None:
    if not store.enabled():
        raise HTTPException(404, "Conversations non activées")


class CreateBody(BaseModel):
    title: Optional[str] = None
    procedure_ids: List[str] = Field(default_factory=list)
    project_id: Optional[str] = None


class UpdateBody(BaseModel):
    title: Optional[str] = Field(default=None, max_length=120)
    archived: Optional[bool] = None
    link_procedure_id: Optional[str] = None
    project_id: Optional[str] = None


def _public(conv: dict) -> dict:
    """Champs exposés au navigateur (l'état interne de la proposition reste côté serveur)."""
    return {k: conv.get(k) for k in ("id", "title", "procedure_ids", "project_id", "created_at",
                                     "updated_at", "archived_at")}


def _public_source(src: dict) -> dict:
    return {k: src.get(k) for k in ("id", "filename", "type", "size", "pages", "added_at")}


@router.get("", dependencies=[Depends(_enabled)])
async def list_conversations(
    user: AuthUser = Depends(require_user),
    limit: int = Query(50, ge=1, le=200),
    procedure_id: Optional[str] = None,
    project_id: Optional[str] = None,
    archived: bool = False,
):
    rows = await asyncio.to_thread(store.list_for, user.id, limit, archived, procedure_id, project_id)
    return {"conversations": [_public(r) for r in rows]}


@router.post("", dependencies=[Depends(_enabled)])
async def create_conversation(body: CreateBody, user: AuthUser = Depends(require_user)):
    conv = await asyncio.to_thread(store.create, user.id, body.title or "Nouvelle conversation",
                                   body.procedure_ids, body.project_id)
    return {"conversation": _public(conv)}


@router.get("/latest", dependencies=[Depends(_enabled)])
async def latest_for_procedure(procedure_id: str, user: AuthUser = Depends(require_user)):
    """Dernière conversation liée à une procédure (rouvrir une procédure rouvre sa conversation)."""
    rows = await asyncio.to_thread(store.list_for, user.id, 1, False, procedure_id, None)
    return {"conversation": _public(rows[0]) if rows else None}


@router.get("/{conversation_id}", dependencies=[Depends(_enabled)])
async def get_conversation(conversation_id: str, user: AuthUser = Depends(require_user)):
    conv = await asyncio.to_thread(store.get_owned, conversation_id, user.id)
    if not conv:
        raise HTTPException(404, "Conversation introuvable")
    msgs, srcs = await asyncio.gather(asyncio.to_thread(store.messages, conversation_id),
                                      asyncio.to_thread(store.sources, conversation_id))
    return {
        "conversation": _public(conv),
        "messages": [{k: m.get(k) for k in ("id", "role", "content", "payload", "created_at")} for m in msgs],
        "sources": [_public_source(s) for s in srcs],
    }


@router.patch("/{conversation_id}", dependencies=[Depends(_enabled)])
async def update_conversation(conversation_id: str, body: UpdateBody, user: AuthUser = Depends(require_user)):
    conv = await asyncio.to_thread(store.get_owned, conversation_id, user.id)
    if not conv:
        raise HTTPException(404, "Conversation introuvable")
    fields = {}
    if body.title is not None:
        fields["title"] = body.title.strip() or "Nouvelle conversation"
    if body.archived is not None:
        fields["archived_at"] = datetime.now(timezone.utc).isoformat() if body.archived else None
    if body.project_id is not None:
        fields["project_id"] = body.project_id or None
    if fields:
        conv = await asyncio.to_thread(store.update, conversation_id, user.id, **fields)
    if body.link_procedure_id:
        conv = await asyncio.to_thread(store.link_procedure, conversation_id, user.id, body.link_procedure_id)
    return {"conversation": _public(conv)}


@router.delete("/{conversation_id}", dependencies=[Depends(_enabled)])
async def delete_conversation(conversation_id: str, user: AuthUser = Depends(require_user)):
    if not await asyncio.to_thread(store.delete, conversation_id, user.id):
        raise HTTPException(404, "Conversation introuvable")
    from routers.studio_router import forget_session
    forget_session(conversation_id)
    return {"success": True}


@router.delete("/{conversation_id}/sources/{source_id}", dependencies=[Depends(_enabled)])
async def remove_source(conversation_id: str, source_id: str, user: AuthUser = Depends(require_user)):
    if not await asyncio.to_thread(store.remove_source, conversation_id, user.id, source_id):
        raise HTTPException(404, "Source introuvable")
    from routers.studio_router import forget_session
    forget_session(conversation_id)  # la session sera reconstruite sans cette source
    return {"success": True}

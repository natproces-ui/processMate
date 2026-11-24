"""
Conversations persistées du chat (lot 3 de la refonte).

Toutes les routes exigent un utilisateur connecté et ne touchent qu'à SES conversations.
Les tours de conversation eux-mêmes passent par /api/studio/turn (session_id = id de la
conversation). Désactivé tant que CONVERSATIONS_ENABLED n'est pas à true (404).
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from manager import conversation_store as store
from manager import conversation_procedures as cp
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
    pinned: Optional[bool] = None


class ProceduresBody(BaseModel):
    procedures: List[dict] = Field(default_factory=list, max_length=store.MAX_PROCEDURES)
    active: Optional[str] = Field(default=None, max_length=200)


def _public(conv: dict) -> dict:
    """Champs exposés au navigateur (l'état interne de la proposition reste côté serveur)."""
    return {k: conv.get(k) for k in ("id", "title", "procedure_ids", "project_id", "created_at",
                                     "updated_at", "archived_at", "pinned_at")}


def _public_source(src: dict) -> dict:
    return {k: src.get(k) for k in ("id", "filename", "type", "size", "pages", "added_at")}


@router.get("", dependencies=[Depends(_enabled)])
async def list_conversations(
    user: AuthUser = Depends(require_user),
    limit: int = Query(50, ge=1, le=200),
    procedure_id: Optional[str] = None,
    project_id: Optional[str] = None,
    archived: bool = False,
    q: Optional[str] = Query(None, max_length=80),
):
    rows = await asyncio.to_thread(store.list_for, user.id, limit, archived, procedure_id, project_id, q)
    return {"conversations": [_public(r) for r in rows]}


async def _check_project(project_id: Optional[str], user: AuthUser) -> None:
    if project_id:
        from manager import project_store
        if not await asyncio.to_thread(project_store.get_accessible, project_id, user.id):
            raise HTTPException(404, "Projet introuvable")


@router.post("", dependencies=[Depends(_enabled)])
async def create_conversation(body: CreateBody, user: AuthUser = Depends(require_user)):
    await _check_project(body.project_id, user)
    conv = await asyncio.to_thread(store.create, user.id, body.title or "Nouvelle conversation",
                                   body.procedure_ids, body.project_id)
    return {"conversation": _public(conv)}


class ImportMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant|clarify)$")
    content: str = Field(default="", max_length=50_000)
    payload: dict = Field(default_factory=dict)


class ImportBody(BaseModel):
    title: Optional[str] = None
    messages: List[ImportMessage] = Field(default_factory=list, max_length=200)


@router.post("/import", dependencies=[Depends(_enabled)])
async def import_guest_conversation(body: ImportBody, user: AuthUser = Depends(require_user)):
    """Reprend dans le compte le travail fait en mode invité (gardé dans le navigateur).
    Les fichiers de l'invité n'ont jamais été envoyés au stockage : seuls les messages et les
    procédures générées sont repris."""
    import json as _json
    if len(_json.dumps([m.payload for m in body.messages], default=str)) > 5_000_000:
        raise HTTPException(413, "Conversation trop volumineuse pour être reprise")
    first_user = next((m.content for m in body.messages if m.role == "user" and m.content), "")
    conv = await asyncio.to_thread(store.create, user.id, body.title or store.title_from(first_user, []))

    def _insert():
        for m in body.messages:
            store.add_message(conv["id"], m.role, m.content, m.payload)
    await asyncio.to_thread(_insert)
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
    procedures = store.procedures_of(conv)
    if await asyncio.to_thread(cp.available):
        # le serveur fait foi : une conversation d'avant est reprise à sa première ouverture
        await asyncio.to_thread(cp.ensure_seeded, conv)
        procedures = {"procedures": await asyncio.to_thread(cp.list_procedures, conversation_id),
                      "active_procedure": procedures.get("active_procedure"), "procedures_serveur": True}
    return {
        "conversation": _public(conv),
        "messages": [{k: m.get(k) for k in ("id", "role", "content", "payload", "created_at")} for m in msgs],
        "sources": [_public_source(s) for s in srcs],
        # fichiers désignés comme modèles de style (contexte utilisé, pas des sources de contenu)
        "references": (conv.get("state") or {}).get("references") or [],
        **procedures,
    }


@router.put("/{conversation_id}/procedures", dependencies=[Depends(_enabled)])
async def save_procedures(conversation_id: str, body: ProceduresBody, user: AuthUser = Depends(require_user)):
    """Procédures de la conversation telles qu'affichées (rouvertes avec elle)."""
    if len(json.dumps(body.procedures, ensure_ascii=False)) > store.MAX_PROCEDURES_BYTES:
        raise HTTPException(413, "Procédures trop volumineuses pour être gardées avec la conversation")
    if not await asyncio.to_thread(store.save_procedures, conversation_id, user.id, body.procedures, body.active):
        raise HTTPException(404, "Conversation introuvable")
    if await asyncio.to_thread(cp.available):
        # écran d'avant (il recopie toute la liste) : seules les procédures dont le contenu diffère de la version
        # courante deviennent une version « manuel » ; rien n'est perdu pendant la transition
        await asyncio.to_thread(_sync_from_screen, conversation_id, body.procedures, user.id)
    return {"success": True}


def _same(a: dict, b: dict) -> bool:
    return all(json.dumps(a.get(k) or None, sort_keys=True, ensure_ascii=False)
               == json.dumps(b.get(k) or None, sort_keys=True, ensure_ascii=False)
               for k in ("title", "workflow", "enrichments", "procedureMetadata", "bpmnXml"))


def _sync_from_screen(conversation_id: str, procedures: List[dict], author: str) -> None:
    conv = {"id": conversation_id}
    for p in procedures or []:
        if not isinstance(p, dict) or not p.get("key"):
            continue
        proc = cp.get(conv["id"], p["key"])
        if proc is None:
            cp.create(conv["id"], p["key"], p, "generation", resume="enregistrée par l'écran", author_id=author)
        else:
            cur = cp.current(conv["id"], p["key"]) or {}
            if not _same(cur, p):
                cp.add_version(proc, p, "manuel", resume="correction à la main", author_id=author)
        was_archived = (proc or {}).get("status") == "archivee"
        if proc is not None and bool(p.get("archived")) != was_archived:
            cp.set_archived(conv["id"], [p["key"]], bool(p.get("archived")))


# ── Procédures de la conversation, côté serveur (docs/conversation-serveur.md) ──

class ProcedureEdit(BaseModel):
    base_version: int
    title: Optional[str] = None
    workflow: list = Field(default_factory=list)
    enrichments: dict = Field(default_factory=dict)
    procedureMetadata: Optional[dict] = None
    bpmnXml: Optional[str] = None


class ArchiveBody(BaseModel):
    archived: bool = True


class SavedBody(BaseModel):
    workflow_db_id: str
    version: Optional[int] = None


async def _owned_with_procedures(conversation_id: str, user: AuthUser) -> dict:
    conv = await asyncio.to_thread(store.get_owned, conversation_id, user.id)
    if not conv:
        raise HTTPException(404, "Conversation introuvable")
    if not await asyncio.to_thread(cp.available):
        raise HTTPException(409, "Les procédures de la conversation ne sont pas encore gardées côté serveur")
    await asyncio.to_thread(cp.ensure_seeded, conv)
    return conv


@router.get("/{conversation_id}/procedures", dependencies=[Depends(_enabled)])
async def list_conversation_procedures(conversation_id: str, user: AuthUser = Depends(require_user)):
    await _owned_with_procedures(conversation_id, user)
    return {"procedures": await asyncio.to_thread(cp.list_procedures, conversation_id)}


@router.put("/{conversation_id}/procedures/{key}", dependencies=[Depends(_enabled)])
async def edit_conversation_procedure(conversation_id: str, key: str, body: ProcedureEdit,
                                      user: AuthUser = Depends(require_user)):
    """Correction à la main (tableau, diagramme) : une version « manuel », à partir de `base_version`.
    Si la procédure a changé entre-temps → 409 avec la version à jour."""
    await _owned_with_procedures(conversation_id, user)
    if len(json.dumps(body.workflow, ensure_ascii=False)) > store.MAX_PROCEDURES_BYTES:
        raise HTTPException(413, "Procédure trop volumineuse")
    proc = await asyncio.to_thread(cp.get, conversation_id, key)
    content = body.model_dump()
    try:
        if proc is None:  # procédure créée à la main dans la conversation
            current = await asyncio.to_thread(cp.create, conversation_id, key, content, "manuel", None,
                                              "créée à la main", user.id)
        else:
            current = await asyncio.to_thread(cp.add_version, proc, content, "manuel", None, "correction à la main",
                                              user.id, body.base_version)
    except cp.Conflict as e:
        raise HTTPException(409, {"message": "Cette procédure a changé pendant votre correction : voici la version à jour.",
                                  "procedure": e.current})
    return {"procedure": current}


@router.get("/{conversation_id}/procedures/{key}/versions", dependencies=[Depends(_enabled)])
async def procedure_versions(conversation_id: str, key: str, user: AuthUser = Depends(require_user)):
    await _owned_with_procedures(conversation_id, user)
    return {"versions": await asyncio.to_thread(cp.versions, conversation_id, key)}


@router.get("/{conversation_id}/procedures/{key}/versions/{version}", dependencies=[Depends(_enabled)])
async def procedure_version(conversation_id: str, key: str, version: int, user: AuthUser = Depends(require_user)):
    await _owned_with_procedures(conversation_id, user)
    content = await asyncio.to_thread(cp.version_content, conversation_id, key, version)
    if content is None:
        raise HTTPException(404, "Version introuvable")
    return {"procedure": content}


@router.post("/{conversation_id}/procedures/{key}/versions/{version}/restore", dependencies=[Depends(_enabled)])
async def restore_procedure_version(conversation_id: str, key: str, version: int, user: AuthUser = Depends(require_user)):
    """Revenir à une version : une nouvelle version « restauration », l'historique reste entier."""
    await _owned_with_procedures(conversation_id, user)
    current = await asyncio.to_thread(cp.restore_version, conversation_id, key, version, user.id)
    if current is None:
        raise HTTPException(404, "Version introuvable")
    return {"procedure": current}


@router.post("/{conversation_id}/procedures/{key}/archive", dependencies=[Depends(_enabled)])
async def archive_procedure(conversation_id: str, key: str, body: ArchiveBody, user: AuthUser = Depends(require_user)):
    await _owned_with_procedures(conversation_id, user)
    if not await asyncio.to_thread(cp.set_archived, conversation_id, [key], body.archived):
        raise HTTPException(404, "Procédure introuvable")
    return {"procedures": await asyncio.to_thread(cp.list_procedures, conversation_id)}


class AttachBody(BaseModel):
    workflow_db_id: str


@router.post("/{conversation_id}/procedures/attach", dependencies=[Depends(_enabled)])
async def attach_procedure(conversation_id: str, body: AttachBody, user: AuthUser = Depends(require_user)):
    """Ajouter au chat une procédure du référentiel (une version : AS IS ou TO BE), comme on joint un fichier."""
    from database.supabase_client import get_supabase
    await _owned_with_procedures(conversation_id, user)
    rows = await asyncio.to_thread(lambda: get_supabase().table("workflows").select("*").eq("id", body.workflow_db_id).execute().data)
    if not rows:
        raise HTTPException(404, "Procédure introuvable")
    try:
        key = await asyncio.to_thread(cp.attach, conversation_id, rows[0], user.id)
    except ValueError as e:  # trop de procédures dans la conversation
        raise HTTPException(400, str(e))
    return {"key": key, "procedures": await asyncio.to_thread(cp.list_procedures, conversation_id)}


@router.post("/{conversation_id}/procedures/{key}/saved", dependencies=[Depends(_enabled)])
async def procedure_saved(conversation_id: str, key: str, body: SavedBody, user: AuthUser = Depends(require_user)):
    """Enregistrée dans le référentiel : lien et version enregistrée (« modifiée depuis l'enregistrement »)."""
    await _owned_with_procedures(conversation_id, user)
    if not await asyncio.to_thread(cp.link_saved, conversation_id, key, body.workflow_db_id, body.version):
        raise HTTPException(404, "Procédure introuvable")
    return {"procedure": await asyncio.to_thread(cp.current, conversation_id, key)}


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
        await _check_project(body.project_id or None, user)
        fields["project_id"] = body.project_id or None
    if body.pinned is not None:
        fields["pinned_at"] = datetime.now(timezone.utc).isoformat() if body.pinned else None
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

"""
generator_router.py — Endpoints FastAPI pour le SFD Generator (session hybride).
Ajout : POST /style/{session_id} pour changer le thème + GET /themes pour lister les thèmes.
"""

import json
import asyncio
import traceback
from typing import Optional, List, Annotated

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse, Response

from pydantic import ValidationError

from session_store import (
    create_session, get_session, delete_session,
    set_section_status, add_chat_message
)
from methods.generation import init_sfd, chat_with_agent
from methods.html_renderer import render_html
from methods.word_renderer import render_docx
from themes import get_theme, list_themes, DEFAULT_THEME

router = APIRouter(prefix="/api/sfd-generator", tags=["SFD Generator v2"])


# ─── SSE ──────────────────────────────────────────────────────────────────────

@router.get("/progress/{session_id}")
async def progress_stream(session_id: str):
    """SSE — flux de progression pour l'initialisation."""
    session = get_session(session_id)
    if not session:
        session = create_session(session_id)

    queue = session.progress_queue

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=180)
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                    if event.get("stage") in ("done", "error"):
                        break
                except asyncio.TimeoutError:
                    yield 'data: {"stage": "ping", "message": "..."}\n\n'
        finally:
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )


# ─── HELPER ───────────────────────────────────────────────────────────────────

def _opt_file(f: Optional[UploadFile]) -> Optional[UploadFile]:
    if f is None or not f.filename or not f.filename.strip():
        return None
    return f


# ─── INIT ─────────────────────────────────────────────────────────────────────

@router.post("/init")
async def init_session(
    session_id:   Annotated[str, Form()],
    project_name: Annotated[str, Form()] = "",
    client:       Annotated[str, Form()] = "",
    description:  Annotated[str, Form()] = "",
    urls:         Annotated[str, Form()] = "",
    style:        Annotated[str, Form()] = DEFAULT_THEME,   # ← nouveau param
    file1: Annotated[Optional[UploadFile], File()] = None,
    file2: Annotated[Optional[UploadFile], File()] = None,
    file3: Annotated[Optional[UploadFile], File()] = None,
    file4: Annotated[Optional[UploadFile], File()] = None,
    file5: Annotated[Optional[UploadFile], File()] = None,
):
    """
    Crée une session et génère le premier draft SFD.
    Le paramètre `style` (al_maghrib | corporate_blue) est stocké dans la session.
    La progression est émise en SSE sur /progress/{session_id}.
    """
    valid_files = [f for f in [file1, file2, file3, file4, file5]
                   if _opt_file(f) is not None]

    try:
        url_list = json.loads(urls) if urls.strip() else []
    except Exception:
        url_list = [u.strip() for u in urls.split(",") if u.strip()]

    session = get_session(session_id)
    if not session:
        session = create_session(session_id)

    # Stocker le style dans la session dès l'init
    session.style = style if style in ("al_maghrib", "corporate_blue") else DEFAULT_THEME

    async def on_progress(stage: str, message: str):
        await session.progress_queue.put({"stage": stage, "message": message})

    try:
        sfd = await init_sfd(
            session_id=session_id,
            project_name=project_name,
            client=client,
            description=description,
            files=valid_files,
            urls=url_list,
            on_progress=on_progress,
        )
        return {
            "success":    True,
            "session_id": session_id,
            "sfd":        sfd.model_dump(),
            "style":      session.style,
        }
    except Exception as e:
        traceback.print_exc()
        await session.progress_queue.put({"stage": "error", "message": str(e)})
        raise HTTPException(status_code=500, detail=str(e))


# ─── STYLE ────────────────────────────────────────────────────────────────────

from pydantic import BaseModel

class StyleRequest(BaseModel):
    style: str


@router.post("/style/{session_id}")
async def set_style(session_id: str, body: StyleRequest):
    """
    Change le thème visuel d'une session existante.
    Affecte immédiatement la preview HTML et le prochain export Word.

    Body JSON : { "style": "al_maghrib" | "corporate_blue" }
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")

    valid_styles = ("al_maghrib", "corporate_blue")
    if body.style not in valid_styles:
        raise HTTPException(
            status_code=400,
            detail=f"Style invalide. Valeurs acceptées : {', '.join(valid_styles)}"
        )

    session.style = body.style
    theme = get_theme(body.style)

    return {
        "success": True,
        "session_id": session_id,
        "style":      body.style,
        "label":      theme.label,
    }


# ─── THEMES LIST ──────────────────────────────────────────────────────────────

@router.get("/themes")
async def get_themes():
    """Liste les thèmes disponibles avec leurs métadonnées."""
    return {
        "themes":  list_themes(),
        "default": DEFAULT_THEME,
    }


# ─── PATCH INLINE ─────────────────────────────────────────────────────────────

class PatchRequest(BaseModel):
    path:  str   # ex: "contexte.contexte_projet" ou "perimetre.inclus.2"
    value: str   # nouvelle valeur texte


@router.patch("/patch/{session_id}")
async def patch_sfd(session_id: str, body: PatchRequest):
    """
    Applique une modification inline depuis la preview HTML.
    Le path suit la notation pointée : "section.champ" ou "section.liste.index".

    Exemples :
      contexte.contexte_projet          → champ string
      perimetre.inclus.0                → item de liste
      exigences_non_fonctionnelles.performance.2
    """
    session = get_session(session_id)
    if not session or not session.sfd:
        raise HTTPException(status_code=404, detail="Session introuvable")

    sfd_dict = session.sfd.model_dump()
    parts    = body.path.split(".")

    # Naviguer jusqu'à l'avant-dernier niveau
    node = sfd_dict
    try:
        for part in parts[:-1]:
            if isinstance(node, list):
                node = node[int(part)]
            else:
                node = node[part]

        last = parts[-1]
        if isinstance(node, list):
            idx = int(last)
            if 0 <= idx < len(node):
                node[idx] = body.value
            else:
                raise HTTPException(status_code=400, detail=f"Index {idx} hors limites")
        elif isinstance(node, dict):
            if last in node:
                node[last] = body.value
            else:
                raise HTTPException(status_code=400, detail=f"Champ '{last}' introuvable")
        else:
            raise HTTPException(status_code=400, detail="Path invalide")

    except (KeyError, IndexError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Path invalide : {body.path} ({e})")

    from schemas.schema import SFDDocument
    try:
        new_sfd = SFDDocument(**sfd_dict)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Validation échouée : {e}")

    from session_store import update_sfd
    update_sfd(session_id, new_sfd)

    return {"success": True, "path": body.path}


# ─── CHAT ─────────────────────────────────────────────────────────────────────

@router.post("/chat/{session_id}")
async def chat(
    session_id: str,
    message: Annotated[str, Form()],
    section_context: Annotated[Optional[str], Form()] = None,
):
    """
    L'agent modifie le SFD selon l'instruction.
    Retourne les sections modifiées et un message explicatif.
    """
    full_message = message
    if section_context:
        full_message = f"[Section ciblée : {section_context}]\n{message}"

    try:
        result = await chat_with_agent(session_id, full_message)
        return result
    except ValidationError as e:
        traceback.print_exc()
        raise HTTPException(status_code=422, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ─── SESSION ──────────────────────────────────────────────────────────────────

@router.get("/session/{session_id}")
async def get_session_state(session_id: str):
    """Retourne l'état courant du SFD (JSON) + le style actif."""
    session = get_session(session_id)
    if not session or not session.sfd:
        raise HTTPException(status_code=404, detail="Session introuvable")
    return {
        "session_id":      session_id,
        "sfd":             session.sfd.model_dump(),
        "sections_status": session.sections_status,
        "chat_history":    session.chat_history,
        "style":           getattr(session, "style", DEFAULT_THEME),
    }


# ─── PREVIEW HTML ─────────────────────────────────────────────────────────────

@router.get("/preview/{session_id}")
async def get_preview(session_id: str):
    """
    Retourne le HTML WYSIWYG du SFD courant avec le thème actif de la session.
    """
    session = get_session(session_id)
    if not session or not session.sfd:
        raise HTTPException(status_code=404, detail="Session introuvable")

    current_style = getattr(session, "style", DEFAULT_THEME)
    html = render_html(session.sfd, style=current_style)
    return Response(content=html, media_type="text/html")


# ─── EXPORT WORD ──────────────────────────────────────────────────────────────

@router.post("/export/{session_id}")
async def export_word(session_id: str):
    """
    Génère et retourne le fichier Word (.docx) du SFD avec le thème actif.
    """
    session = get_session(session_id)
    if not session or not session.sfd:
        raise HTTPException(status_code=404, detail="Session introuvable")

    current_style = getattr(session, "style", DEFAULT_THEME)
    docx_bytes = render_docx(session.sfd, style=current_style)

    nom = session.sfd.meta.nom_projet.replace(" ", "_") or "SFD"
    theme = get_theme(current_style)
    filename = f"SFD_{nom}_{theme.name}.docx"

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── VALIDATION SECTION ───────────────────────────────────────────────────────

@router.post("/validate/{session_id}/{section}")
async def validate_section(session_id: str, section: str):
    """Marque une section comme validée."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")
    set_section_status(session_id, section, "validated")
    return {"success": True, "section": section, "status": "validated"}


# ─── DELETE SESSION ───────────────────────────────────────────────────────────

@router.delete("/session/{session_id}")
async def remove_session(session_id: str):
    """Supprime la session de la mémoire."""
    delete_session(session_id)
    return {"success": True}


# ─── HEALTH ───────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return {
        "status":  "healthy",
        "service": "sfd-generator",
        "version": "2.1",
        "themes":  [t["name"] for t in list_themes()],
    }
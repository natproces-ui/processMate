"""
sfd_router.py — Routes FastAPI pour le SFD Generator.
"""

import os
import json
import asyncio
from typing import Optional, List, Annotated

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from schemas.sfd_schema import SFD
from methods.sfd_methods import process_sfd

router = APIRouter(
    prefix="/api/sfd",
    tags=["SFD Generator"]
)

OUTPUT_DIR = "./tmp/outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ============================================================================
# GESTION DES QUEUES SSE (une queue par session_id)
# ============================================================================

_progress_queues: dict[str, asyncio.Queue] = {}


def _get_queue(session_id: str) -> asyncio.Queue:
    if session_id not in _progress_queues:
        _progress_queues[session_id] = asyncio.Queue()
    return _progress_queues[session_id]


async def _push(session_id: str, stage: str, message: str):
    if session_id in _progress_queues:
        await _progress_queues[session_id].put({"stage": stage, "message": message})


# ============================================================================
# ENDPOINT SSE — Suivi de progression
# ============================================================================

@router.get("/progress/{session_id}")
async def progress_stream(session_id: str):
    """
    SSE endpoint — le frontend s'y connecte pour recevoir la progression en temps réel.
    La connexion se ferme automatiquement quand stage == 'done' ou 'error'.
    """
    queue = _get_queue(session_id)

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=180)
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                    if event.get("stage") in ("done", "error"):
                        break
                except asyncio.TimeoutError:
                    # Keepalive pour éviter que le navigateur ferme la connexion
                    yield "data: {\"stage\": \"ping\", \"message\": \"...\"}\n\n"
        finally:
            _progress_queues.pop(session_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )


# ============================================================================
# HELPER — fichier optionnel
# ============================================================================

def _optional_file(f: Optional[UploadFile]) -> Optional[UploadFile]:
    if f is None or not f.filename or f.filename.strip() == "":
        return None
    return f


# ============================================================================
# ENDPOINT 1 — Générer SFD + Word
# ============================================================================

@router.post("/generate")
async def generate_sfd(
    target_url:             Annotated[Optional[str], Form()] = None,
    client_name:            Annotated[Optional[str], Form()] = None,
    project_description:    Annotated[Optional[str], Form()] = None,
    max_exploration_calls:  Annotated[int, Form()] = 6,
    session_id:             Annotated[Optional[str], Form()] = None,
    file1: Annotated[Optional[UploadFile], File()] = None,
    file2: Annotated[Optional[UploadFile], File()] = None,
    file3: Annotated[Optional[UploadFile], File()] = None,
    file4: Annotated[Optional[UploadFile], File()] = None,
    file5: Annotated[Optional[UploadFile], File()] = None,
):
    """
    Générer un SFD complet.
    - Explore le site via Playwright + Gemini
    - Analyse les documents fournis
    - Génère le SFD et le document Word
    - Envoie la progression via SSE si session_id fourni
    """
    max_exploration_calls = max(1, min(9, max_exploration_calls))
    valid_files = [f for f in [file1, file2, file3, file4, file5]
                   if _optional_file(f) is not None]

    # Callback de progression → pousse dans la queue SSE
    async def on_progress(stage: str, message: str):
        if session_id:
            await _push(session_id, stage, message)

    try:
        sfd, word_filename, exploration_summary = await process_sfd(
            target_url=target_url,
            files=valid_files,
            client_name=client_name,
            project_description=project_description,
            max_exploration_calls=max_exploration_calls,
            on_progress=on_progress
        )

        return {
            "success": True,
            "message": f"SFD généré avec succès pour {client_name or 'portail_cible'}",
            "filename": word_filename,
            "download_url": f"/api/sfd/download/{word_filename}",
            "sfd_data": sfd.dict(),
            "website_exploration_summary": exploration_summary
        }

    except ValueError as e:
        if session_id:
            await _push(session_id, "error", str(e))
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        import traceback
        error_msg = f"Erreur génération SFD: {str(e)}"
        if session_id:
            await _push(session_id, "error", error_msg)
        raise HTTPException(status_code=500, detail=f"{error_msg}\n{traceback.format_exc()}")


# ============================================================================
# ENDPOINT 2 — Téléchargement Word
# ============================================================================

@router.get("/download/{filename}")
async def download_sfd_word(filename: str):
    """Télécharger le document Word SFD généré."""
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")

    file_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Fichier non trouvé : {filename}")

    return FileResponse(
        path=file_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""}
    )


# ============================================================================
# ENDPOINT 3 — JSON uniquement (preview / debug)
# ============================================================================

@router.post("/generate-json")
async def generate_sfd_json_only(
    target_url:            Annotated[Optional[str], Form()] = None,
    client_name:           Annotated[Optional[str], Form()] = None,
    project_description:   Annotated[Optional[str], Form()] = None,
    max_exploration_calls: Annotated[int, Form()] = 6,
    file1: Annotated[Optional[UploadFile], File()] = None,
    file2: Annotated[Optional[UploadFile], File()] = None,
    file3: Annotated[Optional[UploadFile], File()] = None,
):
    max_exploration_calls = max(1, min(9, max_exploration_calls))
    valid_files = [f for f in [file1, file2, file3] if _optional_file(f) is not None]

    try:
        sfd, _, _ = await process_sfd(
            target_url=target_url,
            files=valid_files,
            client_name=client_name,
            project_description=project_description,
            max_exploration_calls=max_exploration_calls
        )
        return sfd.dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


# ============================================================================
# ENDPOINT 4 — Health check
# ============================================================================

@router.get("/health")
async def health_check():
    playwright_available = False
    try:
        from playwright.async_api import async_playwright
        playwright_available = True
    except ImportError:
        pass

    return {
        "status": "healthy",
        "service": "sfd-generator",
        "model": "gemini-2.5-flash",
        "playwright_available": playwright_available,
        "scraping_mode": "playwright" if playwright_available else "httpx (fallback)",
        "max_files": 5,
        "accepted_formats": ["PDF", "DOCX", "DOC", "TXT", "JPG", "PNG", "WEBP", "GIF"]
    }
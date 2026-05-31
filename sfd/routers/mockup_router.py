"""
mockup_router.py — API FastAPI pour le pipeline de génération de maquettes rebrandées.

Endpoints :
  POST /api/mockup/generate   — Lance le pipeline complet (explore + rebrand + export Word)
  GET  /api/mockup/status/{job_id} — Statut du job en cours
"""

import asyncio
import base64
import io
import os
import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Form, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import Response

from google import genai

from methods.web_explorer    import explore_website
from methods.mockup_rebrander  import rebrand_screenshot
from methods.mockup_word_export import generate_mockup_word

router = APIRouter(prefix="/api/mockup", tags=["mockup"])

# ── Store en mémoire des jobs ─────────────────────────────────────────────────
_jobs: dict[str, dict] = {}


def _get_gemini_api_key() -> str:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(500, "GEMINI_API_KEY non configurée")
    return api_key


def _pil_to_b64(img) -> str:
    """Convertit une image PIL en base64 PNG."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _extract_screens(result: dict) -> list[dict]:
    """
    Extrait les écrans uniques depuis le résultat de web_explorer.
    Garde uniquement les étapes qui ont provoqué une navigation (URL différente).
    Associe chaque navigation au screenshot PIL correspondant.
    """
    history     = result.get("history", [])
    screenshots = result.get("screenshots", [])
    screens     = []
    seen_urls   = set()

    # Index screenshots — il y a 1 screenshot par action dans all_screenshots
    for i, h in enumerate(history):
        url_before = h.get("url_before", "")
        url_after  = h.get("url_after", "")

        # Ne garder que les vraies navigations vers un nouvel écran
        if url_after and url_after != url_before and url_after not in seen_urls:
            seen_urls.add(url_after)

            # Screenshot correspondant (même index dans all_screenshots)
            pil_img = screenshots[i] if i < len(screenshots) else None
            if pil_img is None:
                continue

            screens.append({
                "url":           url_after,
                "title":         h.get("visible_text_sample", url_after)[:60] or url_after,
                "screenshot_b64": _pil_to_b64(pil_img),
            })

    # Fallback : si aucune navigation détectée, prendre le premier screenshot
    if not screens and screenshots:
        screens.append({
            "url":            result.get("url", ""),
            "title":          result.get("title", "Page principale"),
            "screenshot_b64": _pil_to_b64(screenshots[0]),
        })

    return screens


# ── Pipeline background ───────────────────────────────────────────────────────

async def _run_pipeline(
    job_id: str,
    url: str,
    client_name: str,
    primary_color: str,
    secondary_color: str,
    max_pages: int,
    logo_b64: Optional[str],
    logo_mime: str,
):
    job = _jobs[job_id]

    async def on_progress(stage: str, message: str):
        job["message"] = message

    try:
        # ── Étape 1 : Exploration autonome ────────────────────────────────────
        job["status"]   = "exploring"
        job["message"]  = f"Exploration de {url}..."
        job["progress"] = 5

        api_key = _get_gemini_api_key()

        # max_gemini_calls ≈ max_pages / 2  (chaque call couvre ~2 navigations)
        result = await explore_website(
            target_url       = url,
            gemini_api_key   = api_key,
            max_gemini_calls = max(3, max_pages // 2),
            actions_per_call = 6,
            on_progress      = on_progress,
        )

        screens = _extract_screens(result)

        if not screens:
            raise ValueError(f"Aucun écran capturé sur {url}")

        job["message"]  = f"{len(screens)} écran(s) unique(s) capturé(s)"
        job["progress"] = 35

        # ── Étape 2 : Rebranding ──────────────────────────────────────────────
        job["status"]  = "rebranding"
        gemini_client  = genai.Client(api_key=api_key)
        mockups        = []

        skipped = 0
        for i, screen in enumerate(screens):
            job["message"]  = f"Rebranding écran {i+1}/{len(screens)} : {screen['title']}"
            job["progress"] = 35 + int(45 * (i / len(screens)))

            try:
                html = await rebrand_screenshot(
                    client         = gemini_client,
                    screenshot_b64 = screen["screenshot_b64"],
                    page_title     = screen["title"],
                    client_name    = client_name,
                    primary_color  = primary_color,
                    secondary_color= secondary_color,
                    logo_b64       = logo_b64,
                    logo_mime      = logo_mime,
                )
                mockups.append({
                    "title": screen["title"],
                    "url":   screen["url"],
                    "html":  html,
                })
            except Exception as e:
                skipped += 1
                print(f"⚠️  Écran {i+1} skippé ({screen['title']}) : {e}")
                continue

        if not mockups:
            raise ValueError("Aucun écran n'a pu être rebrandé (tous en erreur).")

        skip_msg = f" ({skipped} écran(s) ignoré(s) sur erreur)" if skipped else ""
        job["message"]  = f"Génération du document Word — {len(mockups)} maquette(s){skip_msg}..."
        job["progress"] = 85

        # ── Étape 3 : Export Word ─────────────────────────────────────────────
        job["status"] = "exporting"

        docx_bytes = await generate_mockup_word(
            mockups        = mockups,
            client_name    = client_name,
            source_url     = url,
            primary_color  = primary_color,
            secondary_color= secondary_color,
            logo_b64       = logo_b64,
            logo_mime      = logo_mime,
        )

        job["status"]     = "done"
        job["message"]    = "Document prêt"
        job["progress"]   = 100
        job["docx_bytes"] = docx_bytes
        job["filename"]   = f"Maquettes_{client_name.replace(' ', '_')}.docx"

    except Exception as e:
        import traceback
        traceback.print_exc()
        job["status"]  = "error"
        job["message"] = str(e)
        job["progress"] = 0


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_mockups(
    background_tasks: BackgroundTasks,
    url:             Annotated[str,  Form()],
    client_name:     Annotated[str,  Form()],
    primary_color:   Annotated[str,  Form()],
    secondary_color: Annotated[str,  Form()],
    max_pages:       Annotated[int,  Form()] = 8,
    logo:            Optional[UploadFile] = File(default=None),
):
    """
    Lance le pipeline : exploration → rebranding → export Word.
    Retourne immédiatement un job_id pour suivre la progression.
    """
    job_id = str(uuid.uuid4())

    # Lecture du logo si fourni (ignore string vide envoyée par Swagger/curl)
    logo_b64  = None
    logo_mime = "image/png"
    if logo and isinstance(logo, UploadFile) and logo.filename:
        logo_bytes = await logo.read()
        if logo_bytes:
            logo_b64  = base64.b64encode(logo_bytes).decode()
            logo_mime = logo.content_type or "image/png"

    _jobs[job_id] = {
        "status":   "queued",
        "message":  "En attente de démarrage...",
        "progress": 0,
        "docx_bytes": None,
        "filename": None,
    }

    background_tasks.add_task(
        _run_pipeline,
        job_id        = job_id,
        url           = url,
        client_name   = client_name,
        primary_color = primary_color,
        secondary_color = secondary_color,
        max_pages     = max_pages,
        logo_b64      = logo_b64,
        logo_mime     = logo_mime,
    )

    return {"job_id": job_id}


@router.get("/status/{job_id}")
async def get_status(job_id: str):
    """Retourne le statut et la progression du job."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job introuvable")
    return {
        "job_id":   job_id,
        "status":   job["status"],
        "message":  job["message"],
        "progress": job["progress"],
        "ready":    job["status"] == "done",
    }


@router.get("/download/{job_id}")
async def download(job_id: str):
    """Télécharge le fichier Word généré."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job introuvable")
    if job["status"] != "done":
        raise HTTPException(400, f"Document pas encore prêt (statut: {job['status']})")
    if not job["docx_bytes"]:
        raise HTTPException(500, "Fichier vide")

    return Response(
        content     = job["docx_bytes"],
        media_type  = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers     = {"Content-Disposition": f'attachment; filename="{job["filename"]}"'},
    )
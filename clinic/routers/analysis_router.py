# clinic/routers/analysis_router.py
"""
Router universel d'analyse procédure ProcessMate.
Sessions de chat avec artifacts persistés et export Excel adapté.
"""
from __future__ import annotations
from datetime import datetime
from typing import List, Optional
import json
import uuid

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from database.supabase_client import get_supabase
from processor.analysis_processor import (
    get_artifact, get_session, get_session_messages,
    run_analysis, save_message, stream_chat,
    INTENT_TYPES,
)
from processor.analysis_excel_exporter import generate_analysis_excel

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/png", "image/jpeg", "image/jpg", "image/webp",
    "text/plain", "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
}

def _now(): return datetime.utcnow().isoformat()
def _session_or_404(sid):
    s = get_session(sid)
    if not s: raise HTTPException(404, "Session introuvable")
    return s

def _parse_procedure_ids(raw: str) -> List[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(p).strip() for p in parsed if str(p).strip()]
    except Exception:
        pass
    return [p.strip().strip('"\'') for p in raw.strip("[]").split(",") if p.strip().strip('"\'')]

def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except Exception:
        return False

# ─── Sessions ─────────────────────────────────────────────────

class SessionCreate(BaseModel):
    title: str = "Nouvelle analyse"
    procedure_ids: List[str] = Field(default_factory=list)

class SessionUpdate(BaseModel):
    title: Optional[str] = None
    procedure_ids: Optional[List[str]] = None

@router.get("/sessions")
async def list_sessions():
    try:
        rows = get_supabase().table("analysis_sessions").select("*").order("updated_at", desc=True).execute().data or []
        return {"success": True, "sessions": rows, "total": len(rows)}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.post("/sessions")
async def create_session(body: SessionCreate):
    try:
        row = {
            "id": str(uuid.uuid4()),
            "title": body.title.strip() or "Nouvelle analyse",
            "procedure_ids": body.procedure_ids,
            "artifact_count": 0,
            "created_at": _now(),
            "updated_at": _now(),
        }
        inserted = get_supabase().table("analysis_sessions").insert(row).execute().data
        return {"success": True, "session": inserted[0] if inserted else row}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.get("/sessions/{session_id}")
async def get_session_detail(session_id: str):
    session = _session_or_404(session_id)
    try:
        messages = get_session_messages(session_id)
        session["messages"] = messages
        return {"success": True, "session": session}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.patch("/sessions/{session_id}")
async def update_session(session_id: str, body: SessionUpdate):
    _session_or_404(session_id)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = _now()
    get_supabase().table("analysis_sessions").update(updates).eq("id", session_id).execute()
    return {"success": True}

@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    _session_or_404(session_id)
    db = get_supabase()
    db.table("analysis_messages").delete().eq("session_id", session_id).execute()
    db.table("analysis_artifacts").delete().eq("session_id", session_id).execute()
    db.table("analysis_sessions").delete().eq("id", session_id).execute()
    return {"success": True}

# ─── Analyse (multipart) ──────────────────────────────────────

@router.post("/sessions/{session_id}/analyze")
async def analyze(
    session_id: str,
    instruction: str = Form(default=""),
    procedure_ids: str = Form(default="[]"),
    files: List[UploadFile] = File(default=[]),
):
    _session_or_404(session_id)

    proc_ids = _parse_procedure_ids(procedure_ids or "[]")

    # Lire les fichiers
    file_data = []
    for f in (files or []):
        if not f.filename:
            continue
        content_type = f.content_type or "application/octet-stream"
        if content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(400, f"Type de fichier non supporté: {content_type} ({f.filename})")
        data = await f.read()
        if not data:
            continue
        if len(data) > 30 * 1024 * 1024:
            raise HTTPException(400, f"Fichier trop volumineux (max 30 Mo): {f.filename}")
        file_data.append({"bytes": data, "mime_type": content_type, "filename": f.filename})

    if not instruction.strip() and not file_data and not proc_ids:
        raise HTTPException(400, "Fournissez au moins une instruction, un fichier ou des procédures")

    # Sauvegarder le message utilisateur
    sources_meta = [{"filename": f["filename"], "mime_type": f["mime_type"], "size": len(f["bytes"])} for f in file_data]
    save_message(
        session_id=session_id,
        role="user",
        content=instruction or f"Analyse de {len(file_data)} fichier(s)",
        sources_meta=sources_meta,
    )

    # Mettre à jour la session
    db = get_supabase()
    session = get_session(session_id)
    merged_proc_ids = list(set((session.get("procedure_ids") or []) + proc_ids))
    db.table("analysis_sessions").update({
        "procedure_ids": merged_proc_ids,
        "updated_at": _now(),
    }).eq("id", session_id).execute()

    try:
        result = await run_analysis(
            session_id=session_id,
            instruction=instruction,
            procedure_ids=proc_ids or merged_proc_ids,
            files=file_data,
        )
        # Incrémenter artifact_count
        db.table("analysis_sessions").update({
            "artifact_count": (session.get("artifact_count") or 0) + 1,
            "updated_at": _now(),
        }).eq("id", session_id).execute()
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(500, str(e))

# ─── Messages & chat ──────────────────────────────────────────

@router.get("/sessions/{session_id}/messages")
async def list_messages(session_id: str):
    _session_or_404(session_id)
    messages = get_session_messages(session_id)
    return {"success": True, "messages": messages}

class ChatMessage(BaseModel):
    message: str
    artifact_id: Optional[str] = None

@router.get("/sessions/{session_id}/chat/stream")
async def chat_stream(session_id: str, request: Request, message: str = "", artifact_id: Optional[str] = None):
    if not message.strip():
        raise HTTPException(400, "Message obligatoire")
    _session_or_404(session_id)

    async def event_generator():
        async for chunk in stream_chat(session_id, message, artifact_id):
            if await request.is_disconnected():
                break
            yield chunk

    get_supabase().table("analysis_sessions").update({"updated_at": _now()}).eq("id", session_id).execute()
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ─── Artifacts ────────────────────────────────────────────────

@router.get("/sessions/{session_id}/artifacts")
async def list_artifacts(session_id: str):
    _session_or_404(session_id)
    rows = get_supabase().table("analysis_artifacts").select("id, session_id, intent_type, intent_label, instruction_summary, excel_template, procedure_ids, created_at").eq("session_id", session_id).order("created_at", desc=True).execute().data or []
    return {"success": True, "artifacts": rows}

@router.get("/artifacts/{artifact_id}")
async def get_artifact_detail(artifact_id: str):
    artifact = get_artifact(artifact_id)
    if not artifact:
        raise HTTPException(404, "Artifact introuvable")
    return {"success": True, "artifact": artifact}

@router.get("/artifacts/{artifact_id}/export-excel")
async def export_artifact_excel(artifact_id: str):
    artifact = get_artifact(artifact_id)
    if not artifact:
        raise HTTPException(404, "Artifact introuvable")
    try:
        analysis_json = artifact.get("analysis_json") or {}
        excel_bytes = generate_analysis_excel(
            artifact=artifact,
            analysis=analysis_json.get("analysis") or [],
            summary=analysis_json.get("summary") or {},
            analysis_log=analysis_json.get("analysis_log") or [],
            open_questions=analysis_json.get("open_questions") or [],
            excel_template=artifact.get("excel_template") or "impact",
        )
        safe_title = (
            (artifact.get("instruction_summary") or "analyse")
            .encode("ascii", errors="ignore").decode()
            .replace(" ", "_")[:50]
        )
        filename = f"{safe_title}_analyse.xlsx"
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(500, str(e))


# ─── Référentiels ─────────────────────────────────────────────

@router.get("/referentiels")
async def get_referentiels():
    return {"success": True, "intent_types": INTENT_TYPES, "allowed_mime_types": sorted(ALLOWED_MIME_TYPES)}

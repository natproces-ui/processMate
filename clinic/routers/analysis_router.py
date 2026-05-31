# clinic/routers/analysis_router.py
"""
Router universel d'analyse procédure ProcessMate.
Sessions de chat avec artifacts persistés et export Excel adapté.
"""
from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional
import hashlib
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

def _resolve_user_id(value: str, preferred_role: Optional[str] = None) -> str:
    """
    procedure_tasks.assigned_to/assigned_by are uuid columns. The analysis UI may
    send display labels, so resolve them to an active user before insertion.
    """
    value = (value or "").strip()
    if _is_uuid(value):
        return value

    db = get_supabase()
    users = db.table("user_profiles").select(
        "id, email, full_name, display_name, global_role, status"
    ).eq("status", "active").execute().data or []

    needle = value.lower()
    if needle:
        for user in users:
            candidates = [
                user.get("email"),
                user.get("full_name"),
                user.get("display_name"),
                user.get("global_role"),
            ]
            if any(needle == str(candidate or "").strip().lower() for candidate in candidates):
                return user["id"]

    if preferred_role:
        for user in users:
            if user.get("global_role") == preferred_role:
                return user["id"]

    if users:
        return users[0]["id"]

    raise HTTPException(400, "Aucun utilisateur actif disponible pour créer les tâches")

# ─── Sessions ─────────────────────────────────────────────────

class CreateTasksFromArtifact(BaseModel):
    assigned_by: str
    default_assigned_to: str
    only_high_priority: bool = False

class TaskCandidateUpdate(BaseModel):
    status: Optional[str] = None
    task_id: Optional[str] = None
    dismissed_reason: Optional[str] = None

class SessionCreate(BaseModel):
    title: str = "Nouvelle analyse"
    procedure_ids: List[str] = Field(default_factory=list)

class SessionUpdate(BaseModel):
    title: Optional[str] = None
    procedure_ids: Optional[List[str]] = None

PRIORITY_MAP = {"low": "low", "medium": "normal", "high": "high", "critical": "urgent"}

def _candidate_key(*parts: Any) -> str:
    raw = "|".join(str(part or "").strip().lower() for part in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]

def _task_type_from_owner(owner_type: str) -> str:
    if owner_type in {"si", "metier", "juridique", "organisation"}:
        return "correction"
    if owner_type == "externe":
        return "consultation"
    return "correction"

def _derive_task_candidates(artifact: Dict[str, Any]) -> List[Dict[str, Any]]:
    analysis_json = artifact.get("analysis_json") or {}
    existing = {
        c.get("source_key"): c
        for c in (analysis_json.get("task_candidates") or [])
        if c.get("source_key")
    }
    artifact_proc_ids = [
        str(pid).strip().strip('"\'')
        for pid in (artifact.get("procedure_ids") or [])
        if str(pid).strip().strip('"\'')
    ]
    candidates: List[Dict[str, Any]] = []

    for item_index, item in enumerate(analysis_json.get("analysis") or []):
        procedure_id = str(item.get("procedure_id") or "").strip().strip('"\'')
        if not _is_uuid(procedure_id) and len(artifact_proc_ids) == 1:
            procedure_id = artifact_proc_ids[0]
        if not _is_uuid(procedure_id):
            continue

        raw_tasks = item.get("potential_tasks") or []
        if not raw_tasks:
            raw_tasks = [
                {
                    "title": action.get("title", ""),
                    "description": action.get("description", ""),
                    "assigned_to_type": action.get("owner_type", "metier"),
                    "priority": action.get("priority", item.get("criticality", "medium")),
                    "procedure_step_target": action.get("procedure_step_target"),
                }
                for action in (item.get("recommended_actions") or [])
            ]

        for task_index, raw_task in enumerate(raw_tasks):
            title = (raw_task.get("title") or item.get("source_element") or "Action a traiter").strip()
            if not title:
                continue

            owner_type = raw_task.get("assigned_to_type") or raw_task.get("owner_type") or "metier"
            priority = raw_task.get("priority") or item.get("criticality") or "medium"
            if priority not in PRIORITY_MAP:
                priority = "medium"
            source_key = _candidate_key(artifact.get("id"), procedure_id, item_index, task_index, title)
            previous = existing.get(source_key) or {}

            description = "\n".join(filter(None, [
                raw_task.get("description", ""),
                "",
                "Point analyse : " + (item.get("source_element") or ""),
                "Procedure : " + " ".join(filter(None, [item.get("procedure_ref"), item.get("procedure_nom")])),
                "Etape / regle : " + (raw_task.get("procedure_step_target") or item.get("procedure_step") or item.get("procedure_section") or ""),
                "Ecart : " + (item.get("gap") or ""),
                "Impact metier : " + (item.get("business_impact") or ""),
                "Impact SI : " + (item.get("si_impact") or ""),
                "Risque : " + (item.get("operational_risk") or ""),
            ]))

            candidate = {
                "id": previous.get("id") or str(uuid.uuid4()),
                "source_key": source_key,
                "artifact_id": artifact.get("id"),
                "analysis_item_index": item_index,
                "task_index": task_index,
                "procedure_id": procedure_id,
                "procedure_nom": item.get("procedure_nom") or "",
                "procedure_ref": item.get("procedure_ref") or "",
                "procedure_section": raw_task.get("procedure_step_target") or item.get("procedure_step") or item.get("procedure_section") or "",
                "title": title[:180],
                "description": description,
                "owner_type": owner_type,
                "raci_role": previous.get("raci_role") or "R",
                "task_type": previous.get("task_type") or _task_type_from_owner(owner_type),
                "priority": PRIORITY_MAP.get(priority, "normal"),
                "criticality": priority,
                "status": previous.get("status") or "suggested",
                "task_id": previous.get("task_id"),
                "dismissed_reason": previous.get("dismissed_reason"),
                "created_from": "potential_tasks" if item.get("potential_tasks") else "recommended_actions",
            }
            candidates.append(candidate)

    return candidates

def _persist_task_candidates(artifact: Dict[str, Any], candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    analysis_json = artifact.get("analysis_json") or {}
    analysis_json["task_candidates"] = candidates
    get_supabase().table("analysis_artifacts").update({"analysis_json": analysis_json}).eq("id", artifact["id"]).execute()
    artifact["analysis_json"] = analysis_json
    return artifact

def _get_or_create_task_candidates(artifact: Dict[str, Any]) -> List[Dict[str, Any]]:
    candidates = _derive_task_candidates(artifact)
    _persist_task_candidates(artifact, candidates)
    return candidates

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

@router.get("/artifacts/{artifact_id}/task-candidates")
async def list_task_candidates(artifact_id: str):
    artifact = get_artifact(artifact_id)
    if not artifact:
        raise HTTPException(404, "Artifact introuvable")
    try:
        candidates = _get_or_create_task_candidates(artifact)
        return {"success": True, "candidates": candidates, "total": len(candidates)}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.patch("/artifacts/{artifact_id}/task-candidates/{candidate_id}")
async def update_task_candidate(artifact_id: str, candidate_id: str, body: TaskCandidateUpdate):
    artifact = get_artifact(artifact_id)
    if not artifact:
        raise HTTPException(404, "Artifact introuvable")
    candidates = _get_or_create_task_candidates(artifact)
    allowed_statuses = {"suggested", "selected", "converted", "dismissed"}
    found = False
    for candidate in candidates:
        if candidate.get("id") != candidate_id:
            continue
        found = True
        if body.status is not None:
            if body.status not in allowed_statuses:
                raise HTTPException(400, f"Statut candidat invalide: {body.status}")
            candidate["status"] = body.status
        if body.task_id is not None:
            candidate["task_id"] = body.task_id
        if body.dismissed_reason is not None:
            candidate["dismissed_reason"] = body.dismissed_reason
        candidate["updated_at"] = _now()
        break
    if not found:
        raise HTTPException(404, "Candidat de tache introuvable")
    _persist_task_candidates(artifact, candidates)
    return {"success": True, "candidate": next(c for c in candidates if c.get("id") == candidate_id)}

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


@router.post("/artifacts/{artifact_id}/create-tasks")
async def create_tasks_from_artifact(artifact_id: str, body: "CreateTasksFromArtifact"):
    """Crée des tâches procédure depuis les points d'analyse d'un artifact."""
    artifact = get_artifact(artifact_id)
    if not artifact:
        raise HTTPException(404, "Artifact introuvable")
    if not body.assigned_by or not body.default_assigned_to:
        raise HTTPException(400, "assigned_by et default_assigned_to sont obligatoires")
    try:
        analysis_json = artifact.get("analysis_json") or {}
        analysis_items = analysis_json.get("analysis") or []
        artifact_proc_ids = [
            str(pid).strip().strip('"\'')
            for pid in (artifact.get("procedure_ids") or [])
            if str(pid).strip().strip('"\'')
        ]
        db = get_supabase()
        created = []
        now = _now()
        assigned_by = _resolve_user_id(body.assigned_by, preferred_role="admin")
        assigned_to = _resolve_user_id(body.default_assigned_to, preferred_role="process_owner")

        PRIORITY_MAP = {"low": "low", "medium": "normal", "high": "high", "critical": "urgent"}

        for item in analysis_items:
            if body.only_high_priority and item.get("criticality") not in ("high", "critical"):
                continue

            procedure_id = str(item.get("procedure_id") or "").strip().strip('"\'')
            if not _is_uuid(procedure_id) and len(artifact_proc_ids) == 1:
                procedure_id = artifact_proc_ids[0]
            if not _is_uuid(procedure_id):
                continue
            # potential_tasks en priorité, sinon recommended_actions
            tasks = item.get("potential_tasks") or []
            if not tasks:
                tasks = [
                    {
                        "title": a.get("title", ""),
                        "description": a.get("description", ""),
                        "assigned_to_type": a.get("owner_type", "metier"),
                        "priority": a.get("priority", "medium"),
                    }
                    for a in (item.get("recommended_actions") or [])
                ]

            for t in tasks:
                description = "\n".join(filter(None, [
                    t.get("description", ""),
                    "",
                    "Point analysé : " + (item.get("source_element") or ""),
                    "Étape concernée : " + (item.get("procedure_step") or ""),
                    "Impact métier : " + (item.get("business_impact") or ""),
                    "Impact SI : " + (item.get("si_impact") or ""),
                    "Risque : " + (item.get("operational_risk") or ""),
                    "Dépendance : " + (item.get("external_dependency") or "Aucune"),
                ]))
                task = {
                    "id": str(uuid.uuid4()),
                    "procedure_id": procedure_id,
                    "title": (t.get("title") or "Action")[:180],
                    "description": description,
                    "assigned_to": assigned_to,
                    "assigned_by": assigned_by,
                    "raci_role": "R",
                    "task_type": "correction",
                    "status": "todo",
                    "priority": PRIORITY_MAP.get(t.get("priority", "medium"), "normal"),
                    "metadata": {
                        "source": "analysis_artifact",
                        "artifact_id": artifact_id,
                        "intent_type": artifact.get("intent_type"),
                        "intent_label": artifact.get("intent_label"),
                        "assigned_to_type": t.get("assigned_to_type"),
                    },
                    "created_at": now, "updated_at": now,
                }
                if procedure_id:
                    try:
                        inserted = db.table("procedure_tasks").insert(task).execute().data
                    except Exception as insert_error:
                        raise HTTPException(500, f"Erreur création tâche '{task['title']}': {insert_error}")
                    if inserted:
                        created.append(inserted[0])

        return {"success": True, "tasks": created, "total": len(created)}
    except Exception as e:
        raise HTTPException(500, str(e))

# ─── Référentiels ─────────────────────────────────────────────

@router.get("/referentiels")
async def get_referentiels():
    return {"success": True, "intent_types": INTENT_TYPES, "allowed_mime_types": sorted(ALLOWED_MIME_TYPES)}

"""
Router for AI-assisted regulatory impact analysis.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from database.supabase_client import get_supabase
from processor.regulatory_impact_processor import (
    IMPACT_STATUSES,
    get_campaign,
    get_impact_messages,
    get_latest_procedures,
    run_impact_analysis,
    stream_approfondir_impact,
)
from processor.regulatory_excel_exporter import generate_impact_excel


router = APIRouter(prefix="/api/regulatory-impact", tags=["Regulatory Impact"])

CAMPAIGN_STATUSES = {"draft", "ready", "analyzing", "analyzed", "archived"}
SOURCE_TYPES = {"text", "pdf", "mixed"}
TEMP_SOURCE_DIR = Path(__file__).resolve().parents[1] / "tmp" / "regulatory_sources"
TEMP_SOURCE_DIR.mkdir(parents=True, exist_ok=True)


# ─── Modèles ──────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    title: str
    description: str = ""
    source_type: str = "text"
    law_text: str = ""
    created_by: str = "Utilisateur"
    metadata: Dict[str, Any] = Field(default_factory=dict)


class CampaignUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    law_text: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class SourceTextUpdate(BaseModel):
    law_text: str


class AnalyzeRequest(BaseModel):
    procedure_ids: List[str]


class ImpactUpdate(BaseModel):
    theme: Optional[str] = None
    regulatory_change: Optional[str] = None
    business_impact: Optional[str] = None
    si_impact: Optional[str] = None
    impacted_systems: Optional[List[str]] = None
    recommended_actions: Optional[List[Dict[str, Any]]] = None
    external_dependency: Optional[str] = None
    criticality: Optional[str] = None
    confidence: Optional[float] = None
    law_reference: Optional[str] = None
    procedure_section: Optional[str] = None
    rationale: Optional[str] = None
    status: Optional[str] = None
    reviewer_comment: Optional[str] = None


class ImpactReview(BaseModel):
    status: str
    reviewer: str = "Utilisateur"
    comment: str = ""


class CreateTasksFromImpacts(BaseModel):
    assigned_by: str
    default_assigned_to: str
    impact_ids: List[str] = Field(default_factory=list)
    only_validated: bool = True


# ─── Helpers ──────────────────────────────────────────────────

def _now() -> str:
    return datetime.utcnow().isoformat()


def _campaign_or_404(campaign_id: str) -> Dict[str, Any]:
    campaign = get_campaign(campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    return campaign


def _impact_or_404(impact_id: str) -> Dict[str, Any]:
    rows = get_supabase().table("regulatory_impacts").select("*").eq("id", impact_id).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Impact introuvable")
    return rows[0]


# ─── Référentiels ─────────────────────────────────────────────

@router.get("/referentiels")
async def get_referentiels():
    return {
        "success": True,
        "campaign_statuses": sorted(CAMPAIGN_STATUSES),
        "source_types": sorted(SOURCE_TYPES),
        "impact_statuses": sorted(IMPACT_STATUSES),
        "criticalities": ["low", "medium", "high", "critical"],
        "owner_types": ["metier", "si", "juridique", "organisation", "externe"],
    }


# ─── Procédures candidates ────────────────────────────────────

@router.get("/procedures")
async def list_candidate_procedures():
    try:
        procedures = get_latest_procedures()
        return {"success": True, "procedures": procedures, "total": len(procedures)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Campagnes ────────────────────────────────────────────────

@router.get("/campaigns")
async def list_campaigns(status: Optional[str] = None):
    try:
        db = get_supabase()
        query = db.table("regulatory_campaigns").select("*").order("created_at", desc=True)
        if status:
            query = query.eq("status", status)
        rows = query.execute().data or []
        return {"success": True, "campaigns": rows, "total": len(rows)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/campaigns")
async def create_campaign(body: CampaignCreate):
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Titre obligatoire")
    if body.source_type not in SOURCE_TYPES:
        raise HTTPException(status_code=400, detail=f"Type source invalide: {body.source_type}")

    try:
        campaign = {
            "id": str(uuid.uuid4()),
            "title": body.title.strip(),
            "description": body.description,
            "source_type": body.source_type,
            "law_text": body.law_text,
            "status": "ready" if body.law_text.strip() else "draft",
            "created_by": body.created_by,
            "metadata": body.metadata,
        }
        row = get_supabase().table("regulatory_campaigns").insert(campaign).execute().data[0]
        return {"success": True, "campaign": row}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/campaigns/{campaign_id}")
async def get_campaign_detail(campaign_id: str, with_impacts: bool = True):
    try:
        campaign = _campaign_or_404(campaign_id)
        if with_impacts:
            impacts = (
                get_supabase()
                .table("regulatory_impacts")
                .select("*")
                .eq("campaign_id", campaign_id)
                .order("created_at", desc=True)
                .execute()
                .data
                or []
            )
            campaign["impacts"] = impacts
        return {"success": True, "campaign": campaign}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, body: CampaignUpdate):
    _campaign_or_404(campaign_id)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "status" in updates and updates["status"] not in CAMPAIGN_STATUSES:
        raise HTTPException(status_code=400, detail=f"Statut invalide: {updates['status']}")
    if "title" in updates:
        updates["title"] = updates["title"].strip()
    if updates:
        updates["updated_at"] = _now()
        get_supabase().table("regulatory_campaigns").update(updates).eq("id", campaign_id).execute()
    return {"success": True}


@router.post("/campaigns/{campaign_id}/source-text")
async def update_source_text(campaign_id: str, body: SourceTextUpdate):
    _campaign_or_404(campaign_id)
    if not body.law_text.strip():
        raise HTTPException(status_code=400, detail="Texte reglementaire obligatoire")

    get_supabase().table("regulatory_campaigns").update(
        {
            "source_type": "text",
            "law_text": body.law_text,
            "status": "ready",
            "updated_at": _now(),
        }
    ).eq("id", campaign_id).execute()
    return {"success": True}


@router.post("/campaigns/{campaign_id}/source-file")
async def upload_source_file(campaign_id: str, file: UploadFile = File(...)):
    _campaign_or_404(campaign_id)
    if file.content_type not in {"application/pdf", "text/plain"}:
        raise HTTPException(status_code=400, detail="Seuls PDF et fichiers texte sont acceptes")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Fichier vide")

    db = get_supabase()
    filename = file.filename or "source.pdf"

    if file.content_type == "text/plain":
        text = data.decode("utf-8", errors="ignore")
        db.table("regulatory_campaigns").update(
            {
                "source_type": "text",
                "law_text": text,
                "source_filename": filename,
                "source_mime": file.content_type,
                "status": "ready",
                "updated_at": _now(),
            }
        ).eq("id", campaign_id).execute()
        return {"success": True, "mode": "text", "filename": filename}

    safe_name = f"{uuid.uuid4().hex}_{Path(filename).name}"
    storage_path = f"regulatory/{campaign_id}/{safe_name}"
    storage_mode = "storage"

    try:
        db.storage.from_("processmate-files").upload(
            path=storage_path,
            file=data,
            file_options={"content-type": file.content_type},
        )
    except Exception:
        local_path = TEMP_SOURCE_DIR / f"{campaign_id}_{safe_name}"
        local_path.write_bytes(data)
        storage_path = f"local:{local_path}"
        storage_mode = "local"

    db.table("regulatory_campaigns").update(
        {
            "source_type": "pdf",
            "law_text": "",
            "source_filename": filename,
            "source_mime": file.content_type,
            "source_storage_path": storage_path,
            "status": "ready",
            "updated_at": _now(),
        }
    ).eq("id", campaign_id).execute()
    return {
        "success": True,
        "mode": "pdf",
        "storage_mode": storage_mode,
        "filename": filename,
        "storage_path": storage_path,
    }


@router.post("/campaigns/{campaign_id}/analyze")
async def analyze_campaign(campaign_id: str, body: AnalyzeRequest):
    campaign = _campaign_or_404(campaign_id)
    if campaign.get("status") not in {"ready", "analyzed"}:
        raise HTTPException(status_code=400, detail="La campagne doit contenir une source avant analyse")
    if not body.procedure_ids:
        raise HTTPException(status_code=400, detail="Selectionnez au moins une procedure")

    try:
        get_supabase().table("regulatory_campaigns").update(
            {"status": "analyzing", "updated_at": _now()}
        ).eq("id", campaign_id).execute()

        result = await run_impact_analysis(campaign_id, body.procedure_ids)
        return {"success": True, **result}
    except Exception as e:
        current = get_campaign(campaign_id) or {}
        metadata = current.get("metadata") or {}
        metadata["last_error"] = str(e)
        get_supabase().table("regulatory_campaigns").update(
            {"status": "ready", "metadata": metadata, "updated_at": _now()}
        ).eq("id", campaign_id).execute()
        raise HTTPException(status_code=500, detail=str(e))


# ─── Impacts ──────────────────────────────────────────────────

@router.get("/campaigns/{campaign_id}/impacts")
async def list_campaign_impacts(campaign_id: str, status: Optional[str] = None):
    _campaign_or_404(campaign_id)
    try:
        query = (
            get_supabase()
            .table("regulatory_impacts")
            .select("*")
            .eq("campaign_id", campaign_id)
            .order("created_at", desc=True)
        )
        if status:
            query = query.eq("status", status)
        impacts = query.execute().data or []
        return {"success": True, "impacts": impacts, "total": len(impacts)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/impacts/{impact_id}")
async def update_impact(impact_id: str, body: ImpactUpdate):
    _impact_or_404(impact_id)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "status" in updates and updates["status"] not in IMPACT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Statut impact invalide: {updates['status']}")
    if updates.get("criticality") and updates["criticality"] not in {"low", "medium", "high", "critical"}:
        raise HTTPException(status_code=400, detail=f"Criticite invalide: {updates['criticality']}")

    updates["updated_at"] = _now()
    get_supabase().table("regulatory_impacts").update(updates).eq("id", impact_id).execute()
    return {"success": True}


@router.post("/impacts/{impact_id}/review")
async def review_impact(impact_id: str, body: ImpactReview):
    if body.status not in IMPACT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Statut impact invalide: {body.status}")

    db = get_supabase()
    impact = _impact_or_404(impact_id)
    reviews = impact.get("reviews") or []
    reviews.append(
        {
            "id": str(uuid.uuid4()),
            "reviewer": body.reviewer,
            "status": body.status,
            "comment": body.comment,
            "created_at": _now(),
        }
    )

    db.table("regulatory_impacts").update(
        {
            "status": body.status,
            "reviewer_comment": body.comment,
            "reviews": reviews,
            "updated_at": _now(),
        }
    ).eq("id", impact_id).execute()
    return {"success": True}



# ─── Export Excel (backend) ───────────────────────────────────

@router.get("/campaigns/{campaign_id}/export-excel")
async def export_campaign_excel(campaign_id: str):
    """
    Génère et retourne le fichier Excel d'analyse d'impact.
    Utilise openpyxl côté serveur pour une mise en forme professionnelle.
    """
    campaign = _campaign_or_404(campaign_id)
    try:
        db = get_supabase()
        impacts = (
            db.table("regulatory_impacts")
            .select("*")
            .eq("campaign_id", campaign_id)
            .order("created_at", desc=True)
            .execute()
            .data or []
        )
        last_analysis = (campaign.get("metadata") or {}).get("last_analysis")
        analysis_log = (last_analysis or {}).get("analysis_log") or []

        excel_bytes = generate_impact_excel(
            campaign=campaign,
            impacts=impacts,
            last_analysis=last_analysis,
            analysis_log=analysis_log,
        )

        safe_title = (
            campaign.get("title", "analyse")
            .encode("ascii", errors="ignore")
            .decode()
            .replace(" ", "_")[:60]
        )
        filename = f"{safe_title}_analyse_impact.xlsx"

        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Approfondir (chat streaming) ────────────────────────────

@router.get("/impacts/{impact_id}/messages")
async def list_impact_messages(impact_id: str):
    """Retourne l'historique du chat approfondir pour un impact."""
    _impact_or_404(impact_id)
    try:
        messages = get_impact_messages(impact_id)
        return {"success": True, "messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/impacts/{impact_id}/approfondir/stream")
async def approfondir_impact_stream(impact_id: str, request: Request, message: str = ""):
    """
    Stream SSE — approfondir l'analyse d'un impact via chat.
    Pattern identique à /api/irritants/pistes/{id}/approfondir/stream.
    """
    if not message.strip():
        raise HTTPException(status_code=400, detail="Message obligatoire")

    _impact_or_404(impact_id)

    async def event_generator():
        async for chunk in stream_approfondir_impact(impact_id, message):
            if await request.is_disconnected():
                break
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ─── Création de tâches ───────────────────────────────────────

@router.post("/campaigns/{campaign_id}/create-tasks")
async def create_tasks_from_impacts(campaign_id: str, body: CreateTasksFromImpacts):
    _campaign_or_404(campaign_id)
    if not body.assigned_by:
        raise HTTPException(status_code=400, detail="assigned_by obligatoire")
    if not body.default_assigned_to:
        raise HTTPException(status_code=400, detail="default_assigned_to obligatoire")

    try:
        db = get_supabase()
        query = db.table("regulatory_impacts").select("*").eq("campaign_id", campaign_id)
        if body.impact_ids:
            query = query.in_("id", body.impact_ids)
        if body.only_validated:
            query = query.eq("status", "validated")
        impacts = query.execute().data or []

        created = []
        now = _now()

        for impact in impacts:
            procedure_id = impact.get("procedure_id")
            if not procedure_id:
                continue

            actions = impact.get("recommended_actions") or []
            if not actions:
                actions = [{
                    "title": impact.get("theme") or "Traiter l'impact",
                    "description": impact.get("regulatory_change") or "",
                }]

            for action in actions:
                title = action.get("title") or impact.get("theme") or "Action de mise en conformite"
                description_parts = [
                    action.get("description") or "",
                    "",
                    f"Impact: {impact.get('theme', '')}",
                    f"Changement reglementaire: {impact.get('regulatory_change', '')}",
                    f"Impact metier: {impact.get('business_impact', '')}",
                    f"Impact SI: {impact.get('si_impact', '')}",
                    f"Dependance externe: {impact.get('external_dependency') or 'Aucune'}",
                ]
                priority = action.get("priority") or impact.get("criticality") or "medium"
                task_priority = {"low": "low", "medium": "normal", "high": "high", "critical": "urgent"}.get(priority, "normal")

                task = {
                    "id": str(uuid.uuid4()),
                    "procedure_id": procedure_id,
                    "title": title[:180],
                    "description": "\n".join(p for p in description_parts if p is not None).strip(),
                    "assigned_to": body.default_assigned_to,
                    "assigned_by": body.assigned_by,
                    "raci_role": "R",
                    "task_type": "correction",
                    "status": "todo",
                    "priority": task_priority,
                    "metadata": {
                        "source": "regulatory_impact",
                        "campaign_id": campaign_id,
                        "impact_id": impact["id"],
                        "owner_type": action.get("owner_type"),
                    },
                    "created_at": now,
                    "updated_at": now,
                }
                inserted = db.table("procedure_tasks").insert(task).execute().data
                if inserted:
                    created.append(inserted[0])

            db.table("regulatory_impacts").update(
                {"status": "converted", "updated_at": _now()}
            ).eq("id", impact["id"]).execute()

        return {"success": True, "tasks": created, "total": len(created)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
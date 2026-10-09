"""Liaison générique ProcessMate ↔ Jira.

Un seul mécanisme (table jira_links) réutilisé par plusieurs origines :
tâches de suivi (création automatique, voir orchestration_tasks_router.py),
tâches de campagne, signalements outil/écran. 'regulatory_impact' retiré :
jamais exploité, Analyse IA couvre déjà ce besoin (cf. ArtifactDetail.tsx).
Voir clinic/manager/jira_client.py pour la configuration requise.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database.supabase_client import get_supabase
from manager.jira_client import JiraConfigError, create_issue, get_issue_status

router = APIRouter(prefix="/api/jira", tags=["Jira"])

ENTITY_TYPES = ("procedure_task", "campaign_procedure", "tool_issue")


class LinkCreate(BaseModel):
    entity_type: str
    entity_id: str
    summary: str
    description: Optional[str] = ""
    priority: Optional[str] = None
    labels: Optional[List[str]] = None
    due_date: Optional[str] = None
    assignee_email: Optional[str] = None
    created_by: Optional[str] = None


def _validate_entity_type(entity_type: str) -> None:
    if entity_type not in ENTITY_TYPES:
        raise HTTPException(400, f"entity_type doit être l'un de {ENTITY_TYPES}")


@router.get("/link/{entity_type}/{entity_id}")
async def get_link(entity_type: str, entity_id: str):
    _validate_entity_type(entity_type)
    db = get_supabase()
    res = (
        db.table("jira_links")
        .select("*")
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .execute()
    )
    return {"success": True, "link": res.data[0] if res.data else None}


@router.post("/link")
async def create_link(body: LinkCreate):
    _validate_entity_type(body.entity_type)
    db = get_supabase()

    existing = (
        db.table("jira_links")
        .select("*")
        .eq("entity_type", body.entity_type)
        .eq("entity_id", body.entity_id)
        .execute()
    )
    if existing.data:
        return {"success": True, "link": existing.data[0], "already_existed": True}

    try:
        issue = create_issue(
            summary=body.summary,
            description=body.description or "",
            priority=body.priority,
            labels=body.labels,
            due_date=body.due_date,
            assignee_email=body.assignee_email,
        )
    except JiraConfigError as e:
        raise HTTPException(503, str(e))
    except Exception as e:  # noqa: BLE001 - surface the real Jira error to the caller
        raise HTTPException(502, f"Échec de création du ticket Jira : {e}")

    now = datetime.utcnow().isoformat()
    row = {
        "entity_type": body.entity_type,
        "entity_id": body.entity_id,
        "jira_issue_key": issue["key"],
        "jira_issue_url": issue["url"],
        "jira_priority": body.priority,
        "jira_due_date": body.due_date,
        "jira_labels": body.labels,
        "jira_assignee_email": body.assignee_email if issue.get("assignee_resolved") else None,
        "created_by": body.created_by,
        "created_at": now,
        "updated_at": now,
    }
    res = db.table("jira_links").insert(row).execute()
    return {"success": True, "link": res.data[0], "already_existed": False}


@router.post("/link/{entity_type}/{entity_id}/sync")
async def sync_link(entity_type: str, entity_id: str):
    _validate_entity_type(entity_type)
    db = get_supabase()
    res = (
        db.table("jira_links")
        .select("*")
        .eq("entity_type", entity_type)
        .eq("entity_id", entity_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Aucun ticket Jira lié")
    link = res.data[0]

    try:
        status = get_issue_status(link["jira_issue_key"])
    except JiraConfigError as e:
        raise HTTPException(503, str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Échec de synchronisation : {e}")

    db.table("jira_links").update({
        "jira_status": status,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", link["id"]).execute()

    task_status = None
    if entity_type == "procedure_task" and status:
        # Import différé : évite un import circulaire (orchestration_tasks_router
        # importe des choses de ce module dans d'autres contextes potentiels).
        from routers.orchestration_tasks_router import sync_task_status_from_jira
        task_status = sync_task_status_from_jira(entity_id, status)

    return {"success": True, "jira_status": status, "task_status": task_status}


@router.delete("/link/{entity_type}/{entity_id}")
async def delete_link(entity_type: str, entity_id: str):
    """Détache le ticket Jira de ProcessMate (ne supprime pas le ticket côté Jira)."""
    _validate_entity_type(entity_type)
    db = get_supabase()
    db.table("jira_links").delete().eq("entity_type", entity_type).eq("entity_id", entity_id).execute()
    return {"success": True}

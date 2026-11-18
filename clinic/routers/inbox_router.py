"""
À faire, points ouverts, préférences d'e-mail, couverture BIAN (prompt 7).

GET  /api/taches/compteur                         → mes tâches ouvertes / en retard (+ relances, 1×/h)
POST /api/taches/relances                         → relances (super-admin, ou en-tête X-Cron-Token)
GET  /api/points/{procedure_id}                   → points ouverts de la procédure
POST /api/points/{procedure_id}/{point}/adresser  → à une personne ou une équipe (tâche « Répondre »)
POST /api/points/{procedure_id}/{point}/repondre  → la réponse revient dans la procédure
GET/PUT /api/me/notifications                     → e-mail des tâches (activé par défaut)
GET  /api/bian/couverture                         → domaines couverts / en cours / non couverts
GET/POST /api/bian/procedures/{id}                → correspondances (ajout manuel accepté)
POST /api/bian/procedures/{id}/suggestions        → suggestions de l'assistant (à accepter)
POST /api/bian/correspondances/{id}/accepter|refuser
POST /api/bian/couverture/emplacements            → emplacements de campagne (pilotage)
"""

import asyncio
import hmac
import os
import time
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from manager import access_control as ac
from manager import bian_coverage as bian
from manager import inbox
from manager.access_control import Access, current_access
from manager.auth import AuthUser, require_user

router = APIRouter(prefix="/api", tags=["À faire"])
_last_remind: Dict[str, float] = {}


def _me(access: Access) -> str:
    return (access.profile or {}).get("id") or access.user.id


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except (inbox.InboxError, bian.BianError) as e:
        raise HTTPException(e.status, str(e))


@router.get("/taches/compteur")
def task_counter(access: Access = Depends(current_access)):
    org = access.organisation_id or "-"
    if time.time() - _last_remind.get(org, 0) > 3600:  # relances paresseuses, au plus une fois par heure
        _last_remind[org] = time.time()
        try:
            inbox.remind()
        except Exception:
            pass
    return inbox.counter(_me(access))


@router.post("/taches/relances")
def run_reminders(request: Request, x_cron_token: Optional[str] = Header(default=None)):
    """Pour une tâche planifiée (DigitalOcean) : jeton CRON_TOKEN, ou super-admin connecté."""
    expected = os.getenv("CRON_TOKEN", "")
    by_cron = bool(expected) and bool(x_cron_token) and hmac.compare_digest(expected, x_cron_token)
    if not by_cron:
        ac.require_platform_admin(request)
    from database.org_scope import org_scope
    if not ac.organisations_enabled():
        return {"relances": inbox.remind()}
    total = 0
    for org in inbox._db().table("organisations").select("id").eq("statut", "active").execute().data or []:
        with org_scope(org["id"]):
            total += inbox.remind()
    return {"relances": total}


@router.get("/points/{procedure_id}")
def list_points(procedure_id: str, access: Access = Depends(current_access)):
    return {"points": _call(inbox.points, procedure_id)}


class AddressBody(BaseModel):
    user_id: Optional[str] = None
    equipe_id: Optional[str] = None


@router.post("/points/{procedure_id}/{point_id}/adresser")
def address_point(procedure_id: str, point_id: str, body: AddressBody, access: Access = Depends(current_access)):
    return {"point": _call(inbox.address, procedure_id, point_id, _me(access), body.user_id, body.equipe_id)}


class AnswerBody(BaseModel):
    reponse: str = Field(min_length=1, max_length=4000)


@router.post("/points/{procedure_id}/{point_id}/repondre")
def answer_point(procedure_id: str, point_id: str, body: AnswerBody, access: Access = Depends(current_access)):
    return {"point": _call(inbox.answer, procedure_id, point_id, _me(access), body.reponse)}


class NotifPrefs(BaseModel):
    email_taches: bool


@router.get("/me/notifications")
def get_notifications(user: AuthUser = Depends(require_user)):
    return {"email_taches": inbox.email_enabled(user.id)}


@router.put("/me/notifications")
def put_notifications(body: NotifPrefs, user: AuthUser = Depends(require_user)):
    inbox.set_email_enabled(user.id, body.email_taches)
    return {"email_taches": body.email_taches}


# ── BIAN ──────────────────────────────────────────────────────────────

@router.get("/bian/couverture")
async def get_coverage(access: Access = Depends(current_access)):
    return {"domaines": await asyncio.to_thread(bian.coverage)}


@router.get("/bian/procedures/{procedure_id}")
def get_mappings(procedure_id: str, access: Access = Depends(current_access)):
    return {"correspondances": bian.mappings(procedure_id)}


class MappingBody(BaseModel):
    domaine: str = Field(min_length=1, max_length=200)


@router.post("/bian/procedures/{procedure_id}")
def add_mapping(procedure_id: str, body: MappingBody, access: Access = Depends(current_access)):
    return {"correspondance": _call(bian.add, procedure_id, body.domaine, _me(access))}


@router.post("/bian/procedures/{procedure_id}/suggestions")
def suggest_mappings(procedure_id: str, access: Access = Depends(current_access)):
    return {"suggestions": _call(bian.suggest, procedure_id, _me(access))}


@router.post("/bian/correspondances/{mapping_id}/{decision}")
def decide_mapping(mapping_id: str, decision: str, access: Access = Depends(current_access)):
    if decision not in ("accepter", "refuser"):
        raise HTTPException(404, "Action inconnue")
    _call(bian.decide, mapping_id, decision == "accepter")
    return {"success": True}


class GapSlots(BaseModel):
    campaign_id: str
    domaines: List[str]


@router.post("/bian/couverture/emplacements")
def slots_from_gaps(body: GapSlots, access: Access = Depends(current_access)):
    if access.role not in ac.MANAGERS:
        raise HTTPException(403, "Réservé au pilotage (admin, pilote).")
    from manager.campaign_items import CampaignError
    try:
        return _call(bian.slots_from_gaps, body.campaign_id, body.domaines, _me(access))
    except CampaignError as e:
        raise HTTPException(e.status, str(e))

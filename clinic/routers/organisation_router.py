"""
Organisation de l'utilisateur connecté : fiche, membres, rôles.

Actif avec ORGANISATIONS_ENABLED=true (sinon 404 : l'ancienne gestion des comptes,
/api/orchestration/users, reste en place).

GET   /api/organisation                      → fiche de l'organisation (tout membre)
GET   /api/organisation/members              → membres et leur profil (tout membre)
PATCH /api/organisation/members/{user_id}    → rôle / statut (admin de l'organisation)

L'organisation vient TOUJOURS du compte connecté (current_access), jamais d'un paramètre.
"""

import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from manager import access_control as ac
from manager.access_control import Access, current_access

router = APIRouter(prefix="/api/organisation", tags=["Organisation"])

ROLES = ("admin", "pilote", "contributeur", "lecteur")
STATUTS = ("active", "invitee", "suspendue")
PROFILE_COLS = "id,email,full_name,display_name,job_title,department,avatar_url"


def _enabled() -> None:
    if not ac.organisations_enabled():
        raise HTTPException(404, "Organisations non activées")


def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def _org(org_id: str) -> Dict[str, Any]:
    rows = _db().table("organisations").select("id,nom,slug,statut,created_at").eq("id", org_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Organisation introuvable")
    return rows[0]


def list_members(org_id: str) -> List[Dict[str, Any]]:
    members = (_db().table("organisation_members").select("user_id,role,statut,created_at")
               .eq("organisation_id", org_id).execute().data)
    ids = [m["user_id"] for m in members]
    profiles = {p["id"]: p for p in (_db().table("user_profiles").select(PROFILE_COLS).in_("id", ids).execute().data
                                     if ids else [])}
    out = []
    for m in members:
        p = profiles.get(m["user_id"], {})
        out.append({**{k: p.get(k) for k in ("email", "full_name", "display_name", "job_title", "department", "avatar_url")},
                    "id": m["user_id"], "role": m["role"], "statut": m["statut"], "created_at": m.get("created_at")})
    out.sort(key=lambda u: ((u.get("full_name") or u.get("email") or "").lower()))
    return out


def update_member(org_id: str, actor: Access, user_id: str, role: Optional[str], statut: Optional[str]) -> Dict[str, Any]:
    """Change le rôle et/ou le statut d'un membre de LA MÊME organisation. Lève HTTPException."""
    if role is not None and role not in ROLES:
        raise HTTPException(400, f"Rôle inconnu : {role}")
    if statut is not None and statut not in STATUTS:
        raise HTTPException(400, f"Statut inconnu : {statut}")
    if user_id in (actor.user.id, (actor.profile or {}).get("id")):
        raise HTTPException(400, "Vous ne pouvez pas modifier votre propre rôle ni votre statut.")
    db = _db()
    rows = (db.table("organisation_members").select("user_id,role,statut").eq("organisation_id", org_id)
            .eq("user_id", user_id).limit(1).execute().data)
    if not rows:
        raise HTTPException(404, "Membre introuvable")  # autre organisation : on ne le dit pas
    before = rows[0]
    updates = {k: v for k, v in (("role", role), ("statut", statut)) if v is not None and v != before[k]}
    if not updates:
        return before
    loses_admin = before["role"] == "admin" and before["statut"] == "active" and (
        updates.get("role", "admin") != "admin" or updates.get("statut", "active") != "active")
    if loses_admin:
        admins = (db.table("organisation_members").select("user_id").eq("organisation_id", org_id)
                  .eq("role", "admin").eq("statut", "active").execute().data)
        if len(admins) <= 1:
            raise HTTPException(400, "Il doit rester au moins un administrateur actif.")
    db.table("organisation_members").update(updates).eq("organisation_id", org_id).eq("user_id", user_id).execute()
    ac.forget_profile()
    ac.audit("membre.modifie", actor.user, org_id, "membre", user_id,
             {"avant": {k: before[k] for k in ("role", "statut")}, "apres": updates})
    return {**before, **updates}


@router.get("", dependencies=[Depends(_enabled)])
async def get_organisation(access: Access = Depends(current_access)):
    org = await asyncio.to_thread(_org, access.organisation_id)
    return {"organisation": org, "my_role": access.role}


@router.get("/members", dependencies=[Depends(_enabled)])
async def get_members(access: Access = Depends(current_access)):
    return {"members": await asyncio.to_thread(list_members, access.organisation_id)}


class MemberUpdate(BaseModel):
    role: Optional[str] = None
    statut: Optional[str] = None


@router.patch("/members/{user_id}", dependencies=[Depends(_enabled)])
def patch_member(user_id: str, body: MemberUpdate, access: Access = Depends(current_access)):
    if access.role != "admin":
        raise HTTPException(403, "Action réservée à l'administrateur de l'organisation.")
    return {"member": update_member(access.organisation_id, access, user_id, body.role, body.statut)}

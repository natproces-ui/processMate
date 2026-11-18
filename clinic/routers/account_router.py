"""
Compte de l'utilisateur connecté : son profil et ce à quoi il a accès.

GET   /api/me → {id, email, member, role, status, can_manage_campaigns, is_admin,
                 read_only, profile}
PATCH /api/me → met à jour SES champs de profil (jamais le rôle ni le statut).

Le frontend s'en sert pour montrer ou masquer l'espace de l'organisation ; le backend
applique de toute façon les mêmes règles (manager/access_control.py). Le profil est
lu par ici plutôt que directement dans la table, ce qui permet de fermer la RLS.
"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from manager import access_control
from manager.auth import AuthUser, require_user

router = APIRouter(prefix="/api", tags=["Compte"])

_PROFILE_FIELDS = "id,email,full_name,display_name,avatar_url,phone,job_title,department,global_role,status"


def _full_profile(user: AuthUser, profile_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not profile_id:
        return None
    from database.supabase_client import get_supabase
    rows = get_supabase().table("user_profiles").select(_PROFILE_FIELDS).eq("id", profile_id).limit(1).execute().data
    return rows[0] if rows else None


@router.get("/me")
def me(user: AuthUser = Depends(require_user)):
    access_control.forget_profile(user.id)  # toujours l'état à jour (activation récente…)
    profile = access_control.profile_for(user)
    out = access_control.describe(user, profile, access_control.is_platform_admin(user))
    if not out["member"] and not (profile or {}).get("organisation_id"):
        from routers.organisation_router import pending_invitations_for
        try:
            out["invitations"] = pending_invitations_for(user)
        except Exception:
            out["invitations"] = []
    try:
        # Compte libre (aucune organisation) : son propre profil
        out["profile"] = _full_profile(user, (profile or {}).get("id") or user.id)
    except Exception:
        out["profile"] = None
    return out


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)
    display_name: Optional[str] = Field(default=None, max_length=80)
    avatar_url: Optional[str] = Field(default=None, max_length=500)
    phone: Optional[str] = Field(default=None, max_length=40)
    job_title: Optional[str] = Field(default=None, max_length=120)
    department: Optional[str] = Field(default=None, max_length=120)


@router.patch("/me")
def update_me(body: ProfileUpdate, user: AuthUser = Depends(require_user)):
    profile = access_control.profile_for(user)
    profile_id = (profile or {}).get("id") or user.id
    if not _full_profile(user, profile_id):
        raise HTTPException(404, "Profil introuvable")
    updates = body.model_dump(exclude_unset=True)
    if updates:
        from database.supabase_client import get_supabase
        get_supabase().table("user_profiles").update(updates).eq("id", profile_id).execute()
    return {"success": True}

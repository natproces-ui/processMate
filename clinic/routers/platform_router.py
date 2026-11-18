"""
Console plateforme : le super-admin processMate ouvre les espaces des organisations.

Parcours : une organisation demande l'ouverture de son espace (hors application) ; le
super-admin crée l'organisation et le compte de son admin, copie le LIEN renvoyé et
l'envoie lui-même. L'admin choisit son mot de passe et arrive dans son espace.

Toutes les routes : niveau PLATFORM (access_control) + require_platform_admin, dans tous
les modes. Le super-admin ne voit JAMAIS les données métier des organisations (ni
procédures, ni campagnes) : seulement organisations, admins, effectifs, consommation.
Chaque action est tracée (audit_log).
"""

import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from manager import access_control as ac
from manager import account_links, usage_meter
from manager.auth import AuthUser

router = APIRouter(prefix="/api/plateforme", tags=["Plateforme"])


def _enabled() -> None:
    if not ac.organisations_enabled():
        raise HTTPException(404, "Organisations non activées")


DEPS = [Depends(_enabled)]


def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60]


def _summary(orgs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ids = [o["id"] for o in orgs]
    members = _db().table("organisation_members").select("organisation_id,user_id,role,statut") \
        .in_("organisation_id", ids).execute().data if ids else []
    admin_ids = [m["user_id"] for m in members if m["role"] == "admin"]
    profiles = {p["id"]: p for p in (_db().table("user_profiles").select("id,email,full_name")
                                     .in_("id", admin_ids).execute().data if admin_ids else [])}
    usage = usage_meter.month_totals(datetime.now(timezone.utc).strftime("%Y-%m"))
    out = []
    for o in orgs:
        mine = [m for m in members if m["organisation_id"] == o["id"]]
        admins = [{"id": m["user_id"], "statut": m["statut"],
                   "email": profiles.get(m["user_id"], {}).get("email"),
                   "full_name": profiles.get(m["user_id"], {}).get("full_name")}
                  for m in mine if m["role"] == "admin"]
        out.append({**{k: o.get(k) for k in ("id", "nom", "slug", "statut", "created_at")},
                    "membres_actifs": sum(1 for m in mine if m["statut"] == "active"),
                    "membres": len(mine), "admins": admins,
                    "consommation_mois": usage.get(o["id"], {"appels": 0, "jetons_entree": 0, "jetons_sortie": 0})})
    return out


@router.get("/organisations", dependencies=DEPS)
def list_organisations(_: AuthUser = Depends(ac.require_platform_admin)):
    orgs = _db().table("organisations").select("id,nom,slug,statut,created_at").order("created_at", desc=True).execute().data
    usage = usage_meter.month_totals(datetime.now(timezone.utc).strftime("%Y-%m"))
    return {"organisations": _summary(orgs),
            "hors_organisation_mois": usage.get(usage_meter.HORS_ORGANISATION, {"appels": 0, "jetons_entree": 0, "jetons_sortie": 0})}


class CreateOrganisation(BaseModel):
    nom: str = Field(min_length=2, max_length=120)
    slug: Optional[str] = Field(default=None, max_length=60)
    admin_nom: str = Field(min_length=2, max_length=120)
    admin_email: str = Field(min_length=5, max_length=200)


def _link_error(e: account_links.AccountLinkError):
    raise HTTPException(e.status, str(e))


@router.post("/organisations", dependencies=DEPS)
def create_organisation(body: CreateOrganisation, actor: AuthUser = Depends(ac.require_platform_admin)):
    db = _db()
    slug = slugify(body.slug or body.nom)
    if not slug:
        raise HTTPException(400, "Identifiant d'organisation invalide")
    if db.table("organisations").select("id").eq("slug", slug).limit(1).execute().data:
        raise HTTPException(409, f"Une organisation utilise déjà l'identifiant « {slug} »")
    try:
        email = account_links.normalize_email(body.admin_email)
    except account_links.AccountLinkError as e:
        _link_error(e)
    existing = account_links.find_user_id(email)
    if existing and account_links.organisation_of(existing):
        raise HTTPException(409, "Ce compte appartient déjà à une organisation.")
    if existing and db.table("platform_admins").select("user_id").eq("user_id", existing).limit(1).execute().data:
        raise HTTPException(409, "Un administrateur de processMate ne peut pas être membre d'une organisation.")

    org = db.table("organisations").insert({"nom": body.nom.strip(), "slug": slug, "created_by": actor.id}).execute().data[0]
    try:
        acc = account_links.create_or_link(email, body.admin_nom.strip())
        if account_links.organisation_of(acc.user_id):  # course : rattaché entre-temps
            raise HTTPException(409, "Ce compte appartient déjà à une organisation.")
        db.table("organisation_members").insert({"organisation_id": org["id"], "user_id": acc.user_id,
                                                 "role": "admin", "statut": "active", "created_by": actor.id}).execute()
    except account_links.AccountLinkError as e:
        db.table("organisations").delete().eq("id", org["id"]).execute()
        _link_error(e)
    except Exception:
        db.table("organisations").delete().eq("id", org["id"]).execute()
        raise
    ac.forget_profile(acc.user_id)
    ac.audit("organisation.creee", actor, org["id"], "organisation", org["id"],
             {"nom": org["nom"], "slug": slug, "admin": acc.user_id, "compte_existant": not acc.created})
    return {"organisation": _summary([org])[0], "admin_id": acc.user_id, "lien": acc.link,
            "compte_existant": not acc.created}


class NewLink(BaseModel):
    admin_id: str


@router.post("/organisations/{org_id}/lien", dependencies=DEPS)
def regenerate_admin_link(org_id: str, body: NewLink, actor: AuthUser = Depends(ac.require_platform_admin)):
    db = _db()
    m = (db.table("organisation_members").select("user_id,role").eq("organisation_id", org_id)
         .eq("user_id", body.admin_id).limit(1).execute().data)
    if not m or m[0]["role"] != "admin":
        raise HTTPException(404, "Administrateur introuvable dans cette organisation")
    prof = db.table("user_profiles").select("email").eq("id", body.admin_id).limit(1).execute().data
    if not prof or not prof[0].get("email"):
        raise HTTPException(404, "Adresse e-mail introuvable")
    try:
        link = account_links.new_link(prof[0]["email"])
    except account_links.AccountLinkError as e:
        _link_error(e)
    ac.audit("organisation.lien_admin", actor, org_id, "membre", body.admin_id)
    return {"lien": link}


class OrgStatus(BaseModel):
    statut: str


@router.patch("/organisations/{org_id}", dependencies=DEPS)
def set_organisation_status(org_id: str, body: OrgStatus, actor: AuthUser = Depends(ac.require_platform_admin)):
    if body.statut not in ("active", "suspendue"):
        raise HTTPException(400, "Statut inconnu")
    rows = _db().table("organisations").update({"statut": body.statut}).eq("id", org_id).execute().data
    if not rows:
        raise HTTPException(404, "Organisation introuvable")
    ac.forget_profile()
    ac.audit("organisation.suspendue" if body.statut == "suspendue" else "organisation.reactivee",
             actor, org_id, "organisation", org_id)
    return {"organisation": _summary(rows)[0]}

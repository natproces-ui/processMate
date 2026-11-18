"""
Organisation de l'utilisateur connecté : fiche, membres, rôles.

Actif avec ORGANISATIONS_ENABLED=true (sinon 404 : l'ancienne gestion des comptes,
/api/orchestration/users, reste en place).

GET   /api/organisation                      → fiche de l'organisation (tout membre)
GET   /api/organisation/members              → membres et leur profil (tout membre)
POST  /api/organisation/members              → créer un compte (lien) ou inviter un compte libre (admin)
PATCH /api/organisation/members/{user_id}    → rôle / statut (admin de l'organisation)
POST  /api/organisation/members/{id}/lien    → nouveau lien (admin)
DELETE /api/organisation/members/{user_id}   → retirer ; tâches ouvertes à réaffecter (admin)
GET/POST/PATCH/DELETE /api/organisation/equipes → équipes, membres, branches de taxonomie
POST  /api/invitations/{id}/accepter|refuser → compte libre invité (son accord est requis)

L'organisation vient TOUJOURS du compte connecté (current_access), jamais d'un paramètre.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from manager import access_control as ac
from manager import account_links
from manager.access_control import Access, current_access
from manager.auth import AuthUser, require_user

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


def onboarding(org_id: str) -> Dict[str, bool]:
    """Premiers pas d'un nouvel espace : taxonomie, comptes, première campagne."""
    db = _db()  # tables d'organisation : lecture cloisonnée par la requête
    members = db.table("organisation_members").select("user_id").eq("organisation_id", org_id).execute().data
    return {
        "taxonomie": bool(db.table("process_taxonomy").select("id").limit(1).execute().data),
        "comptes": len(members) > 1,
        "campagne": bool(db.table("formalization_campaigns").select("id").limit(1).execute().data),
    }


@router.get("/demarrage", dependencies=[Depends(_enabled)])
async def get_onboarding(access: Access = Depends(current_access)):
    return {"etapes": await asyncio.to_thread(onboarding, access.organisation_id)}


class MemberUpdate(BaseModel):
    role: Optional[str] = None
    statut: Optional[str] = None


@router.patch("/members/{user_id}", dependencies=[Depends(_enabled)])
def patch_member(user_id: str, body: MemberUpdate, access: Access = Depends(current_access)):
    if access.role != "admin":
        raise HTTPException(403, "Action réservée à l'administrateur de l'organisation.")
    return {"member": update_member(access.organisation_id, access, user_id, body.role, body.statut)}


# ── Comptes créés par l'admin (lien à transmettre) ──────────────────────────

def _require_admin(access: Access) -> None:
    if access.role != "admin":
        raise HTTPException(403, "Action réservée à l'administrateur de l'organisation.")


class NewMember(BaseModel):
    email: str = Field(min_length=5, max_length=200)
    full_name: str = Field(min_length=2, max_length=120)
    role: str = "contributeur"
    job_title: Optional[str] = Field(default=None, max_length=120)
    department: Optional[str] = Field(default=None, max_length=120)
    equipes: List[str] = []


def create_member(org_id: str, actor: Access, body: NewMember) -> Dict[str, Any]:
    """Compte nouveau → lien ; compte libre existant → invitation à accepter ; autre organisation → refus."""
    if body.role not in ROLES:
        raise HTTPException(400, f"Rôle inconnu : {body.role}")
    try:
        email = account_links.normalize_email(body.email)
    except account_links.AccountLinkError as e:
        raise HTTPException(e.status, str(e))
    db = _db()
    existing = account_links.find_user_id(email)
    if existing:
        other = account_links.organisation_of(existing)
        if other == org_id:
            raise HTTPException(409, "Cette personne est déjà membre de l'organisation.")
        if other:
            raise HTTPException(409, "Ce compte appartient à une autre organisation.")
        if db.table("platform_admins").select("user_id").eq("user_id", existing).limit(1).execute().data:
            raise HTTPException(409, "Ce compte ne peut pas rejoindre une organisation.")
        # Compte inscrit librement : jamais rattaché sans son accord
        pending = (db.table("organisation_invitations").select("id").eq("organisation_id", org_id)
                   .ilike("email", email).eq("statut", "en_attente").limit(1).execute().data)
        if not pending:
            db.table("organisation_invitations").insert({"organisation_id": org_id, "email": email, "role": body.role, "statut": "en_attente",
                                                         "created_by": actor.user.id}).execute()
        ac.audit("membre.invite", actor.user, org_id, "invitation", email, {"role": body.role})
        return {"invitation": True, "email": email}
    try:
        acc = account_links.create_or_link(email, body.full_name.strip())
    except account_links.AccountLinkError as e:
        raise HTTPException(e.status, str(e))
    if account_links.organisation_of(acc.user_id):
        raise HTTPException(409, "Ce compte appartient déjà à une organisation.")
    db.table("organisation_members").insert({"organisation_id": org_id, "user_id": acc.user_id, "role": body.role,
                                             "statut": "active", "created_by": actor.user.id}).execute()
    extra = {k: v for k, v in (("job_title", body.job_title), ("department", body.department)) if v}
    if extra:
        db.table("user_profiles").update(extra).eq("id", acc.user_id).execute()
    if body.equipes:
        set_user_teams(org_id, acc.user_id, body.equipes)
    ac.audit("membre.cree", actor.user, org_id, "membre", acc.user_id, {"role": body.role})
    return {"invitation": False, "id": acc.user_id, "lien": acc.link}


def member_link(org_id: str, actor: Access, user_id: str) -> str:
    db = _db()
    if not (db.table("organisation_members").select("user_id").eq("organisation_id", org_id)
            .eq("user_id", user_id).limit(1).execute().data):
        raise HTTPException(404, "Membre introuvable")
    prof = db.table("user_profiles").select("email").eq("id", user_id).limit(1).execute().data
    if not prof or not prof[0].get("email"):
        raise HTTPException(404, "Adresse e-mail introuvable")
    try:
        link = account_links.new_link(prof[0]["email"])
    except account_links.AccountLinkError as e:
        raise HTTPException(e.status, str(e))
    ac.audit("membre.nouveau_lien", actor.user, org_id, "membre", user_id)
    return link


OPEN_TASK_STATUSES = ("todo", "in_progress", "submitted", "changes_requested", "waiting_info", "blocked")


def remove_member(org_id: str, actor: Access, user_id: str) -> Dict[str, Any]:
    """Retire de l'organisation. Son nom reste sur ses procédures, tâches et validations ;
    ses tâches ouvertes sont renvoyées pour réaffectation."""
    if user_id in (actor.user.id, (actor.profile or {}).get("id")):
        raise HTTPException(400, "Vous ne pouvez pas vous retirer vous-même.")
    db = _db()
    rows = (db.table("organisation_members").select("user_id,role,statut").eq("organisation_id", org_id)
            .eq("user_id", user_id).limit(1).execute().data)
    if not rows:
        raise HTTPException(404, "Membre introuvable")
    if rows[0]["role"] == "admin" and rows[0]["statut"] == "active":
        admins = (db.table("organisation_members").select("user_id").eq("organisation_id", org_id)
                  .eq("role", "admin").eq("statut", "active").execute().data)
        if len(admins) <= 1:
            raise HTTPException(400, "Il doit rester au moins un administrateur actif.")
    open_tasks = (db.table("procedure_tasks").select("id,title,procedure_id,status,due_date")
                  .eq("assigned_to", user_id).in_("status", list(OPEN_TASK_STATUSES)).execute().data or [])
    db.table("equipe_membres").delete().eq("user_id", user_id).execute()
    db.table("organisation_members").delete().eq("organisation_id", org_id).eq("user_id", user_id).execute()
    ac.forget_profile()
    ac.audit("membre.retire", actor.user, org_id, "membre", user_id, {"taches_ouvertes": len(open_tasks)})
    return {"taches_a_reaffecter": open_tasks}


# ── Équipes ─────────────────────────────────────────────────────────

def _member_ids(org_id: str) -> set:
    return {m["user_id"] for m in _db().table("organisation_members").select("user_id")
            .eq("organisation_id", org_id).execute().data}


def set_user_teams(org_id: str, user_id: str, team_ids: List[str]) -> None:
    db = _db()
    known = {t["id"] for t in db.table("equipes").select("id").execute().data}
    for tid in team_ids:
        if tid in known:
            db.table("equipe_membres").upsert({"equipe_id": tid, "user_id": user_id}, on_conflict="equipe_id,user_id").execute()


def list_teams(org_id: str) -> List[Dict[str, Any]]:
    db = _db()  # tables d'organisation : cloisonnées par la requête
    teams = db.table("equipes").select("id,nom,responsable_id,created_at").order("nom").execute().data
    members = db.table("equipe_membres").select("equipe_id,user_id").execute().data
    branches = db.table("equipe_branches").select("equipe_id,taxonomy_id").execute().data
    return [{**t, "membres": [m["user_id"] for m in members if m["equipe_id"] == t["id"]],
             "branches": [b["taxonomy_id"] for b in branches if b["equipe_id"] == t["id"]]} for t in teams]


class TeamBody(BaseModel):
    nom: Optional[str] = Field(default=None, min_length=1, max_length=120)
    responsable_id: Optional[str] = None
    membres: Optional[List[str]] = None
    branches: Optional[List[str]] = None


def save_team(org_id: str, actor: Access, team_id: Optional[str], body: TeamBody) -> Dict[str, Any]:
    db = _db()
    members = _member_ids(org_id)
    if body.responsable_id and body.responsable_id not in members:
        raise HTTPException(400, "Le responsable doit être membre de l'organisation.")
    if body.membres is not None and any(u not in members for u in body.membres):
        raise HTTPException(400, "Toutes les personnes de l'équipe doivent être membres de l'organisation.")
    if body.branches:
        known = {n["id"] for n in db.table("process_taxonomy").select("id").in_("id", body.branches).execute().data}
        if set(body.branches) - known:
            raise HTTPException(400, "Branche de taxonomie inconnue.")
    fields = {k: v for k, v in (("nom", body.nom and body.nom.strip()), ("responsable_id", body.responsable_id)) if v is not None}
    try:
        if team_id is None:
            if not fields.get("nom"):
                raise HTTPException(400, "Nom d'équipe requis")
            team = db.table("equipes").insert(fields).execute().data[0]
        else:
            rows = db.table("equipes").update(fields).eq("id", team_id).execute().data if fields else \
                db.table("equipes").select("*").eq("id", team_id).execute().data
            if not rows:
                raise HTTPException(404, "Équipe introuvable")
            team = rows[0]
    except HTTPException:
        raise
    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            raise HTTPException(409, "Une équipe porte déjà ce nom.")
        raise
    if body.membres is not None:
        db.table("equipe_membres").delete().eq("equipe_id", team["id"]).execute()
        for uid in dict.fromkeys(body.membres):
            db.table("equipe_membres").insert({"equipe_id": team["id"], "user_id": uid}).execute()
    if body.branches is not None:
        db.table("equipe_branches").delete().eq("equipe_id", team["id"]).execute()
        for tid in dict.fromkeys(body.branches):
            # une branche n'a qu'une équipe responsable : on la reprend à l'ancienne
            db.table("equipe_branches").delete().eq("taxonomy_id", tid).execute()
            db.table("equipe_branches").insert({"equipe_id": team["id"], "taxonomy_id": tid}).execute()
    ac.audit("equipe.creee" if team_id is None else "equipe.modifiee", actor.user, org_id, "equipe", team["id"],
             {k: v for k, v in body.model_dump().items() if v is not None and k != "membres"})
    return next(t for t in list_teams(org_id) if t["id"] == team["id"])


def delete_team(org_id: str, actor: Access, team_id: str) -> None:
    db = _db()
    if not db.table("equipes").select("id").eq("id", team_id).execute().data:
        raise HTTPException(404, "Équipe introuvable")
    db.table("equipe_branches").delete().eq("equipe_id", team_id).execute()
    db.table("equipe_membres").delete().eq("equipe_id", team_id).execute()
    db.table("equipes").delete().eq("id", team_id).execute()
    ac.audit("equipe.supprimee", actor.user, org_id, "equipe", team_id)


# ── Routes ──────────────────────────────────────────────────────────

@router.post("/members", dependencies=[Depends(_enabled)])
def post_member(body: NewMember, access: Access = Depends(current_access)):
    _require_admin(access)
    return create_member(access.organisation_id, access, body)


@router.post("/members/{user_id}/lien", dependencies=[Depends(_enabled)])
def post_member_link(user_id: str, access: Access = Depends(current_access)):
    _require_admin(access)
    return {"lien": member_link(access.organisation_id, access, user_id)}


@router.delete("/members/{user_id}", dependencies=[Depends(_enabled)])
def delete_member(user_id: str, access: Access = Depends(current_access)):
    _require_admin(access)
    return remove_member(access.organisation_id, access, user_id)


@router.get("/invitations", dependencies=[Depends(_enabled)])
def get_invitations(access: Access = Depends(current_access)):
    _require_admin(access)
    rows = (_db().table("organisation_invitations").select("id,email,role,statut,created_at")
            .eq("organisation_id", access.organisation_id).eq("statut", "en_attente").execute().data)
    return {"invitations": rows}


@router.delete("/invitations/{invitation_id}", dependencies=[Depends(_enabled)])
def cancel_invitation(invitation_id: str, access: Access = Depends(current_access)):
    _require_admin(access)
    rows = (_db().table("organisation_invitations").update({"statut": "annulee"})
            .eq("id", invitation_id).eq("organisation_id", access.organisation_id).execute().data)
    if not rows:
        raise HTTPException(404, "Invitation introuvable")
    ac.audit("invitation.annulee", access.user, access.organisation_id, "invitation", invitation_id)
    return {"success": True}


@router.get("/equipes", dependencies=[Depends(_enabled)])
async def get_teams(access: Access = Depends(current_access)):
    return {"equipes": await asyncio.to_thread(list_teams, access.organisation_id)}


@router.post("/equipes", dependencies=[Depends(_enabled)])
def post_team(body: TeamBody, access: Access = Depends(current_access)):
    _require_admin(access)
    return {"equipe": save_team(access.organisation_id, access, None, body)}


@router.patch("/equipes/{team_id}", dependencies=[Depends(_enabled)])
def patch_team(team_id: str, body: TeamBody, access: Access = Depends(current_access)):
    _require_admin(access)
    return {"equipe": save_team(access.organisation_id, access, team_id, body)}


@router.delete("/equipes/{team_id}", dependencies=[Depends(_enabled)])
def remove_team(team_id: str, access: Access = Depends(current_access)):
    _require_admin(access)
    delete_team(access.organisation_id, access, team_id)
    return {"success": True}


# ── Invitations reçues (compte libre : accepter ou refuser) ─────────────────

invitations_router = APIRouter(prefix="/api/invitations", tags=["Organisation"])


def pending_invitations_for(user: AuthUser) -> List[Dict[str, Any]]:
    """Invitations en attente pour l'e-mail CONFIRMÉ du compte (jamais un e-mail non confirmé)."""
    if not ac.organisations_enabled() or not user.email or not user.email_confirmed:
        return []
    db = _db()
    rows = (db.table("organisation_invitations").select("id,organisation_id,role,created_at")
            .ilike("email", user.email).eq("statut", "en_attente").execute().data)
    if not rows:
        return []
    names = {o["id"]: o["nom"] for o in db.table("organisations").select("id,nom")
             .in_("id", [r["organisation_id"] for r in rows]).execute().data}
    return [{"id": r["id"], "organisation": names.get(r["organisation_id"]), "role": r["role"]} for r in rows]


def answer_invitation(user: AuthUser, invitation_id: str, accept: bool) -> Dict[str, Any]:
    if not any(i["id"] == invitation_id for i in pending_invitations_for(user)):
        raise HTTPException(404, "Invitation introuvable")
    db = _db()
    inv = db.table("organisation_invitations").select("*").eq("id", invitation_id).limit(1).execute().data[0]
    if accept:
        if account_links.organisation_of(user.id):
            raise HTTPException(409, "Votre compte appartient déjà à une organisation.")
        db.table("organisation_members").insert({"organisation_id": inv["organisation_id"], "user_id": user.id,
                                                 "role": inv["role"], "statut": "active",
                                                 "created_by": inv.get("created_by")}).execute()
        # les autres invitations deviennent sans objet (une personne = une organisation)
        db.table("organisation_invitations").update({"statut": "annulee"}).ilike("email", user.email) \
            .eq("statut", "en_attente").execute()
    db.table("organisation_invitations").update({"statut": "acceptee" if accept else "refusee", "repondu_le": datetime.now(timezone.utc).isoformat()}) \
        .eq("id", invitation_id).execute()
    ac.forget_profile(user.id)
    ac.audit("invitation.acceptee" if accept else "invitation.refusee", user, inv["organisation_id"],
             "invitation", invitation_id)
    return {"success": True, "accepted": accept}


@invitations_router.post("/{invitation_id}/accepter", dependencies=[Depends(_enabled)])
def accept_invitation(invitation_id: str, user: AuthUser = Depends(require_user)):
    return answer_invitation(user, invitation_id, True)


@invitations_router.post("/{invitation_id}/refuser", dependencies=[Depends(_enabled)])
def refuse_invitation(invitation_id: str, user: AuthUser = Depends(require_user)):
    return answer_invitation(user, invitation_id, False)

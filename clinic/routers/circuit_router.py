"""
Circuit d'une procédure et propositions au référentiel (prompt 6).

/api/circuit/procedures/{id}             GET  : campagne, RACI, action attendue de moi, validation
/api/circuit/procedures/{id}/soumettre   POST : R soumet (relecture C, sinon validation A)
/api/circuit/procedures/{id}/relecture   POST : C transmet à A ou renvoie
/api/circuit/procedures/{id}/validation  POST : A valide (nom + date, version publiée) ou renvoie

/api/propositions                        POST : un membre propose une procédure (rien n'entre
                                                au référentiel sans validation)
/api/propositions                        GET  : file du pilote (les autres : leurs propositions)
/api/propositions/{id}/traiter           POST : ajouter à une campagne / verser au référentiel /
                                                refuser (motif) — pilotage seulement

L'acteur est TOUJOURS le compte connecté. Aucune route ne lit une conversation.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from manager import access_control as ac
from manager import campaign_flow as flow
from manager.access_control import Access, current_access

router = APIRouter(prefix="/api", tags=["Circuit"])


def _me(access: Access) -> str:
    return (access.profile or {}).get("id") or access.user.id


def _call(fn, *args):
    try:
        return fn(*args)
    except flow.FlowError as e:
        raise HTTPException(e.status, str(e))


class Decision(BaseModel):
    decision: Optional[str] = None
    message: Optional[str] = Field(default=None, max_length=4000)


@router.get("/circuit/procedures/{procedure_id}")
async def get_circuit(procedure_id: str, access: Access = Depends(current_access)):
    return await asyncio.to_thread(_call, flow.context, procedure_id, _me(access))


@router.post("/circuit/procedures/{procedure_id}/soumettre")
def post_submit(procedure_id: str, body: Decision, access: Access = Depends(current_access)):
    return _call(flow.submit, procedure_id, _me(access), body.message)


@router.post("/circuit/procedures/{procedure_id}/relecture")
def post_review(procedure_id: str, body: Decision, access: Access = Depends(current_access)):
    return _call(flow.review, procedure_id, _me(access), body.decision or "", body.message)


@router.post("/circuit/procedures/{procedure_id}/validation")
def post_validation(procedure_id: str, body: Decision, access: Access = Depends(current_access)):
    return _call(flow.validate, procedure_id, _me(access), body.decision or "", body.message)


# ── Propositions ─────────────────────────────────────────────────────

def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PropositionCreate(BaseModel):
    titre: str = Field(min_length=2, max_length=300)
    workflow_json: List[Dict[str, Any]] = []
    enrichments_json: Dict[str, Any] = {}
    metadata: Dict[str, Any] = {}
    message: Optional[str] = Field(default=None, max_length=4000)


@router.post("/propositions")
def create_proposition(body: PropositionCreate, access: Access = Depends(current_access)):
    if not body.workflow_json:
        raise HTTPException(400, "La procédure proposée est vide.")
    row = _db().table("procedure_propositions").insert({
        "titre": body.titre.strip(), "workflow_json": body.workflow_json, "enrichments_json": body.enrichments_json,
        "metadata": body.metadata, "message": body.message, "propose_par": _me(access), "statut": "en_attente",
    }).execute().data[0]
    ac.audit("proposition.creee", access.user, access.organisation_id, "proposition", row["id"], {"titre": row["titre"]})
    return {"proposition": {k: row.get(k) for k in ("id", "titre", "statut", "created_at")}}


@router.get("/propositions")
def list_propositions(access: Access = Depends(current_access)):
    q = _db().table("procedure_propositions").select("id,titre,message,propose_par,statut,decision,motif,procedure_id,campaign_id,created_at")
    if access.role not in ac.MANAGERS:
        q = q.eq("propose_par", _me(access))
    else:
        q = q.eq("statut", "en_attente")
    rows = q.order("created_at", desc=True).execute().data or []
    for r in rows:
        r["propose_par_nom"] = flow.person_name(r.get("propose_par"))
        r["nb_etapes"] = None
    return {"propositions": rows}


class Treatment(BaseModel):
    decision: str  # campagne | referentiel | refuser
    campaign_id: Optional[str] = None
    motif: Optional[str] = Field(default=None, max_length=2000)


def treat(prop_id: str, body: Treatment, access: Access) -> Dict[str, Any]:
    db = _db()
    rows = db.table("procedure_propositions").select("*").eq("id", prop_id).limit(1).execute().data
    if not rows or rows[0]["statut"] != "en_attente":
        raise HTTPException(404, "Proposition introuvable ou déjà traitée")
    prop, me = rows[0], _me(access)
    done = {"statut": "refusee" if body.decision == "refuser" else "acceptee", "decision": body.decision,
            "traitee_par": me, "traitee_le": _now(), "motif": body.motif}
    if body.decision == "refuser":
        if not (body.motif or "").strip():
            raise HTTPException(400, "Indiquez le motif du refus.")
        db.table("procedure_propositions").update(done).eq("id", prop_id).execute()
        ac.audit("proposition.refusee", access.user, access.organisation_id, "proposition", prop_id)
        return {"statut": "refusee"}
    if body.decision not in ("campagne", "referentiel"):
        raise HTTPException(400, "Décision inconnue")

    validator = me
    camp = None
    if body.decision == "campagne":
        found = db.table("formalization_campaigns").select("id,coordinator_id,status").eq("id", body.campaign_id or "").limit(1).execute().data
        if not found:
            raise HTTPException(404, "Campagne introuvable")
        camp = found[0]
        if camp.get("coordinator_id") and ac.membership_of(camp["coordinator_id"]):
            validator = camp["coordinator_id"]

    # La procédure entre au référentiel en brouillon, avec son contenu, et part en validation
    from routers.orchestration_router import create_procedure_shell
    from routers.orchestration_tasks_router import TaskCreate, _create_task_core
    from manager.campaign_items import _write_assignments
    wf = create_procedure_shell(prop["titre"], (prop.get("metadata") or {}).get("ref"), None, created_from="proposition")
    meta = {**(wf.get("procedure_metadata_json") or {}), **{k: v for k, v in (prop.get("metadata") or {}).items() if k not in ("status", "lifecycle_stages")},
            "circuit": {"etape": "soumise", "soumise_par": prop["propose_par"], "soumise_par_nom": flow.person_name(prop["propose_par"]), "soumise_le": _now()}}
    db.table("workflows").update({"workflow_json": prop.get("workflow_json") or [], "enrichments_json": prop.get("enrichments_json") or {},
                                  "procedure_metadata_json": meta}).eq("id", wf["id"]).execute()
    _write_assignments(wf["id"], {"R": [prop["propose_par"]], "A": validator, "C": [], "I": []})
    _create_task_core(wf["id"], TaskCreate(title=f"Valider : {prop['titre']}", assigned_to=validator, assigned_by=me,
                                           raci_role="A", task_type="validation",
                                           metadata={"proposition_id": prop_id}), send_email=False)
    if camp:
        db.table("campaign_procedures").insert({
            "campaign_id": camp["id"], "procedure_id": wf["id"], "procedure_nom": prop["titre"],
            "status": "submitted", "origine": "proposition"}).execute()
    db.table("procedure_propositions").update({**done, "procedure_id": wf["id"], "campaign_id": camp["id"] if camp else None}).eq("id", prop_id).execute()
    ac.audit("proposition.acceptee", access.user, access.organisation_id, "proposition", prop_id,
             {"decision": body.decision, "procedure_id": wf["id"]})
    return {"statut": "acceptee", "procedure_id": wf["id"], "valideur": validator}


@router.post("/propositions/{prop_id}/traiter")
def treat_proposition(prop_id: str, body: Treatment, access: Access = Depends(current_access)):
    if access.role not in ac.MANAGERS:
        raise HTTPException(403, "Réservé au pilotage (admin, pilote).")
    return treat(prop_id, body, access)

"""
Enregistrer une procédure à sa place (voir manager/save_targets.py).

GET  /api/enregistrement/arbre?titre=…           campagnes (dossiers) puis thèmes hors campagne,
                                                 limités à ce que je peux mettre à jour, et la
                                                 procédure au titre le plus proche
POST /api/enregistrement/emplacements/{id}       emplacement de campagne sans procédure (campagne
                                                 en brouillon) : la procédure est créée et reliée
POST /api/enregistrement/nouvelle                nouvelle procédure à un endroit de la taxonomie :
                                                 créée par le pilotage, proposée par un contributeur

Le contenu est ensuite enregistré par PATCH /api/orchestration/procedures/{id}/workflow,
qui applique la même règle d'écriture (R ou A).
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from manager import access_control as ac
from manager import save_targets as st
from manager.access_control import Access, current_access

router = APIRouter(prefix="/api/enregistrement", tags=["Enregistrement"])


def _me(access: Access) -> str:
    return (access.profile or {}).get("id") or access.user.id


def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/arbre")
async def get_tree(titre: Optional[str] = None, access: Access = Depends(current_access)):
    return await asyncio.to_thread(st.tree, _me(access), access.role, (titre or "")[:300] or None)


@router.post("/emplacements/{item_id}")
def attach_slot(item_id: str, access: Access = Depends(current_access)):
    """Crée la procédure d'un emplacement non relié et l'y relie (comme le ferait le lancement)."""
    from manager import campaign_items as ci
    from routers.orchestration_router import create_procedure_shell
    db = _db()
    rows = db.table("campaign_procedures").select("*").eq("id", item_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Emplacement introuvable")
    slot = rows[0]
    camp = (db.table("formalization_campaigns").select("id,status").eq("id", slot["campaign_id"]).limit(1).execute().data or [{}])[0]
    if camp.get("status") in st.READ_ONLY:
        raise HTTPException(409, "Cette campagne est close ou bloquée : on n'y enregistre plus.")
    me = _me(access)
    mine = st.my_write_procedures(me) if slot.get("procedure_id") else set()
    if access.role not in ac.MANAGERS and not (access.role == "contributeur" and st._slot_is_mine(slot, me, mine)):
        raise HTTPException(403, "Vous n'êtes ni R ni A sur cette procédure.")
    if slot.get("procedure_id"):
        return {"procedure_id": slot["procedure_id"], "titre": slot.get("procedure_nom")}
    wf = create_procedure_shell(slot.get("procedure_nom") or "Procédure", slot.get("procedure_ref") or None,
                                slot.get("taxonomy_id"), created_from="campagne")
    try:
        ci.link(slot["campaign_id"], item_id, wf["id"])
    except ci.CampaignError as e:
        raise HTTPException(e.status, str(e))
    if slot.get("status") == "pending":
        db.table("campaign_procedures").update({"status": "in_progress", "updated_at": _now()}).eq("id", item_id).execute()
    ac.audit("emplacement.relie", access.user, access.organisation_id, "procedure", wf["id"], {"emplacement": item_id})
    return {"procedure_id": wf["id"], "titre": slot.get("procedure_nom")}


class NewProcedure(BaseModel):
    titre: str = Field(min_length=2, max_length=300)
    taxonomy_id: Optional[str] = None
    campaign_id: Optional[str] = None
    workflow_json: List[Dict[str, Any]] = []
    enrichments_json: Dict[str, Any] = {}
    metadata: Dict[str, Any] = {}
    message: Optional[str] = Field(default=None, max_length=4000)


@router.post("/nouvelle")
def new_procedure(body: NewProcedure, access: Access = Depends(current_access)):
    """Pilotage : la procédure est créée (contenu enregistré ensuite par le client).
    Contributeur : elle est proposée au pilote, à cet endroit et dans cette campagne."""
    db = _db()
    me = _me(access)
    titre = body.titre.strip()
    camp = None
    if body.campaign_id:
        found = db.table("formalization_campaigns").select("id,title,status,coordinator_id").eq("id", body.campaign_id).limit(1).execute().data
        if not found:
            raise HTTPException(404, "Campagne introuvable")
        camp = found[0]
        if camp.get("status") in st.READ_ONLY:
            raise HTTPException(409, "Cette campagne est close ou bloquée : on n'y ajoute plus de procédure.")
    if body.taxonomy_id and not db.table("process_taxonomy").select("id").eq("id", body.taxonomy_id).limit(1).execute().data:
        raise HTTPException(404, "Emplacement de taxonomie introuvable")
    chemin = st.path_of(body.taxonomy_id) if body.taxonomy_id else ""

    if access.role in ac.MANAGERS:
        from routers.orchestration_router import create_procedure_shell
        from manager.campaign_items import _write_assignments
        wf = create_procedure_shell(titre, (body.metadata or {}).get("ref"), body.taxonomy_id, created_from="studio")
        a = camp.get("coordinator_id") if camp and camp.get("coordinator_id") and ac.membership_of(camp["coordinator_id"]) else me
        _write_assignments(wf["id"], {"R": [me], "A": a, "C": [], "I": []})
        if camp:
            db.table("campaign_procedures").insert({
                "campaign_id": camp["id"], "procedure_id": wf["id"], "procedure_nom": titre,
                "taxonomy_id": body.taxonomy_id, "status": "in_progress", "origine": "saisie"}).execute()
        ac.audit("procedure.creee", access.user, access.organisation_id, "procedure", wf["id"], {"campagne": body.campaign_id})
        return {"resultat": "creee", "procedure_id": wf["id"], "titre": titre}

    if access.role != "contributeur":
        raise HTTPException(403, "Votre rôle ne permet pas de proposer une procédure.")
    if not body.workflow_json:
        raise HTTPException(400, "La procédure proposée est vide.")
    cible = {"taxonomy_id": body.taxonomy_id, "campaign_id": body.campaign_id, "chemin": chemin,
             "campagne": camp.get("title") if camp else None}
    row = db.table("procedure_propositions").insert({
        "titre": titre, "workflow_json": body.workflow_json, "enrichments_json": body.enrichments_json,
        "metadata": {**(body.metadata or {}), "cible": cible}, "message": body.message,
        "propose_par": me, "statut": "en_attente", "campaign_id": body.campaign_id,
    }).execute().data[0]
    ac.audit("proposition.creee", access.user, access.organisation_id, "proposition", row["id"], {"titre": titre})
    return {"resultat": "proposee", "proposition_id": row["id"], "titre": titre}

"""
Campagnes de formalisation — ProcessMate
Coordonne la formalisation groupée de procédures avec suivi du cycle de vie réel.
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from datetime import datetime
import asyncio
import os
import uuid
import logging

from database.supabase_client import get_supabase
from manager import access_control as ac
from manager import campaign_items as slots
from manager.access_control import Access, current_access

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/campaigns", tags=["Campagnes"])

# ─── Constantes cycle de vie ──────────────────────────────────

LIFECYCLE_STAGES = ["Création", "Formalisation", "Vérification", "Validation", "Signature", "Publication"]
FORMALISATION_IDX = 1  # index de l'étape Formalisation dans la liste


# ─── Modèles ──────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    coordinator_id: Optional[str] = None

class CampaignUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    coordinator_id: Optional[str] = None
    status: Optional[str] = None

class AddProceduresBody(BaseModel):
    procedure_ids: List[str]

class CampaignProcedureUpdate(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────

def _derive_campaign_status(lifecycle_stages: list) -> str:
    """Déduit le statut campagne depuis les étapes réelles du cycle de vie."""
    if not lifecycle_stages:
        return "pending"
    completed = [s for s in lifecycle_stages if s.get("status") == "completed"]
    n_done = len(completed)
    if n_done == 0:
        return "pending"
    if n_done >= len(lifecycle_stages):
        return "validated"
    # Formalisation (idx 1) complétée
    if n_done > FORMALISATION_IDX:
        return "formalized"
    return "in_progress"


def _lifecycle_snapshot(workflow_row: dict) -> dict:
    """Extrait le snapshot du cycle de vie depuis un row workflows."""
    meta = workflow_row.get("procedure_metadata_json") or {}
    stages = meta.get("lifecycle_stages") or []
    n_done = sum(1 for s in stages if s.get("status") == "completed")
    n_total = len(stages) or len(LIFECYCLE_STAGES)
    formalisation = next((s for s in stages if s.get("title") == "Formalisation"), None)

    return {
        "workflow_status": meta.get("status", "Brouillon"),
        "lifecycle_stages": stages,
        "stages_done": n_done,
        "stages_total": n_total,
        "formalisation_done": formalisation.get("status") == "completed" if formalisation else False,
        "formalisation_in_progress": formalisation.get("status") == "in_progress" if formalisation else False,
        "taxonomy_id": workflow_row.get("taxonomy_id"),
        "category": meta.get("category", ""),
    }


def _enrich_campaign(campaign: dict, db, with_lifecycle: bool = True) -> dict:
    """Ajoute les procédures (avec snapshot lifecycle) et les stats."""
    cid = campaign["id"]
    cp_res = db.table("campaign_procedures").select("*").eq("campaign_id", cid).execute()
    procs = cp_res.data or []

    if with_lifecycle and procs:
        proc_ids = [p["procedure_id"] for p in procs if p.get("procedure_id")]
        wf_res = db.table("workflows").select("id, procedure_metadata_json, taxonomy_id").in_("id", proc_ids).execute()
        wf_map = {r["id"]: r for r in (wf_res.data or [])}

        for p in procs:
            wf = wf_map.get(p["procedure_id"])
            if wf:
                snap = _lifecycle_snapshot(wf)
                p["lifecycle"] = snap
                # Synchronise le nom/ref si vide
                meta = (wf.get("procedure_metadata_json") or {})
                if not p.get("procedure_nom"):
                    p["procedure_nom"] = meta.get("nom", "")
                if not p.get("procedure_ref"):
                    p["procedure_ref"] = meta.get("ref", "")
            else:
                p["lifecycle"] = None

    # Stats basées sur le cycle de vie réel si disponible
    def _is_done(p: dict) -> bool:
        lc = p.get("lifecycle")
        if lc:
            return lc["formalisation_done"] or p["status"] in ("formalized", "validated")
        return p["status"] in ("formalized", "validated")

    def _is_in_progress(p: dict) -> bool:
        lc = p.get("lifecycle")
        if lc:
            return lc["formalisation_in_progress"] or p["status"] in ("in_progress", "submitted", "in_review")
        return p["status"] in ("in_progress", "submitted", "in_review")

    total = len(procs)
    done = sum(1 for p in procs if _is_done(p))
    in_progress = sum(1 for p in procs if not _is_done(p) and _is_in_progress(p))

    campaign["procedures"] = procs
    campaign["stats"] = {
        "total": total,
        "done": done,
        "in_progress": in_progress,
        "pending": total - done - in_progress,
        "progress_pct": round((done / total * 100) if total else 0),
    }
    return campaign


# ─── Endpoints ────────────────────────────────────────────────

@router.get("")
async def list_campaigns():
    db = get_supabase()
    res = db.table("formalization_campaigns").select("*").order("created_at", desc=True).execute()
    campaigns = res.data or []

    for c in campaigns:
        cid = c["id"]
        cp = db.table("campaign_procedures").select("*").eq("campaign_id", cid).execute()
        procs = cp.data or []

        # Récupère lifecycle + nom/ref pour chaque procédure
        if procs:
            pids = [p["procedure_id"] for p in procs if p.get("procedure_id")]
            wf_res = db.table("workflows").select("id, procedure_metadata_json, taxonomy_id").in_("id", pids).execute()
            wf_map = {r["id"]: r for r in (wf_res.data or [])}
            for p in procs:
                wf = wf_map.get(p["procedure_id"])
                if wf:
                    p["lifecycle"] = _lifecycle_snapshot(wf)
                    meta = (wf.get("procedure_metadata_json") or {})
                    if not p.get("procedure_nom"):
                        p["procedure_nom"] = meta.get("nom", "")
                    if not p.get("procedure_ref"):
                        p["procedure_ref"] = meta.get("ref", "")

        total = len(procs)

        def _is_done(p):
            lc = p.get("lifecycle")
            return (lc and lc["formalisation_done"]) or p["status"] in ("formalized", "validated")

        def _is_ip(p):
            lc = p.get("lifecycle")
            return (lc and lc["formalisation_in_progress"]) or p["status"] in ("in_progress", "submitted", "in_review")

        done = sum(1 for p in procs if _is_done(p))
        in_progress = sum(1 for p in procs if not _is_done(p) and _is_ip(p))
        c["procedures"] = procs
        c["stats"] = {
            "total": total,
            "done": done,
            "in_progress": in_progress,
            "pending": total - done - in_progress,
            "progress_pct": round((done / total * 100) if total else 0),
        }

    return {"success": True, "campaigns": campaigns}


@router.post("")
async def create_campaign(body: CampaignCreate):
    db = get_supabase()
    now = datetime.utcnow().isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "title": body.title,
        "description": body.description,
        "status": "draft",
        "start_date": body.start_date,
        "end_date": body.end_date,
        "coordinator_id": body.coordinator_id,
        "created_at": now,
        "updated_at": now,
    }
    res = db.table("formalization_campaigns").insert(row).execute()
    if not res.data:
        raise HTTPException(500, "Échec de la création")
    campaign = res.data[0]
    campaign["procedures"] = []
    campaign["stats"] = {"total": 0, "done": 0, "in_progress": 0, "pending": 0, "progress_pct": 0}
    return {"success": True, "campaign": campaign}


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str):
    db = get_supabase()
    res = db.table("formalization_campaigns").select("*").eq("id", campaign_id).execute()
    if not res.data:
        raise HTTPException(404, "Campagne introuvable")
    campaign = _enrich_campaign(res.data[0], db, with_lifecycle=True)
    return {"success": True, "campaign": campaign}


@router.patch("/{campaign_id}")
async def update_campaign(campaign_id: str, body: CampaignUpdate):
    db = get_supabase()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Aucune modification fournie")
    updates["updated_at"] = datetime.utcnow().isoformat()
    db.table("formalization_campaigns").update(updates).eq("id", campaign_id).execute()
    return {"success": True}


@router.delete("/{campaign_id}")
async def delete_campaign(campaign_id: str):
    db = get_supabase()
    db.table("formalization_campaigns").delete().eq("id", campaign_id).execute()
    return {"success": True}


@router.post("/{campaign_id}/launch")
def launch_campaign(campaign_id: str, access: Access = Depends(current_access)):
    if slots_enabled():
        # Emplacements : vérifications (RACI, échéance), procédures vides, tâches « Formaliser »
        return {"success": True, "status": "active", **_launch_v2(campaign_id, access)}
    db = get_supabase()
    db.table("formalization_campaigns").update({
        "status": "active",
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", campaign_id).execute()
    return {"success": True, "status": "active"}


@router.post("/{campaign_id}/close")
async def close_campaign(campaign_id: str):
    db = get_supabase()
    if slots_enabled():
        from manager import inbox
        cancelled = await asyncio.to_thread(inbox.cancel_campaign_tasks, campaign_id, "Campagne clôturée")
        logger.info(f"Campagne {campaign_id[:8]} clôturée : {cancelled} tâche(s) annulée(s)")
    db.table("formalization_campaigns").update({
        "status": "completed",
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", campaign_id).execute()
    return {"success": True, "status": "completed"}


@router.post("/{campaign_id}/block")
async def block_campaign(campaign_id: str):
    db = get_supabase()
    db.table("formalization_campaigns").update({
        "status": "blocked",
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", campaign_id).execute()
    return {"success": True, "status": "blocked"}


@router.post("/{campaign_id}/pause")
async def pause_campaign(campaign_id: str):
    db = get_supabase()
    db.table("formalization_campaigns").update({
        "status": "on_hold",
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", campaign_id).execute()
    return {"success": True, "status": "on_hold"}


@router.post("/{campaign_id}/resume")
async def resume_campaign(campaign_id: str):
    db = get_supabase()
    db.table("formalization_campaigns").update({
        "status": "active",
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", campaign_id).execute()
    return {"success": True, "status": "active"}


@router.post("/{campaign_id}/sync")
async def sync_campaign(campaign_id: str):
    """Re-synchronise les noms, refs et statuts depuis les workflows réels."""
    db = get_supabase()
    cp_res = db.table("campaign_procedures").select("*").eq("campaign_id", campaign_id).execute()
    procs = cp_res.data or []
    if not procs:
        return {"success": True, "synced": 0}

    pids = [p["procedure_id"] for p in procs if p.get("procedure_id")]
    wf_res = db.table("workflows").select("id, procedure_metadata_json").in_("id", pids).execute()
    wf_map = {r["id"]: r for r in (wf_res.data or [])}

    now = datetime.utcnow().isoformat()
    synced = 0
    for p in procs:
        wf = wf_map.get(p["procedure_id"])
        if not wf:
            continue
        meta = wf.get("procedure_metadata_json") or {}
        stages = meta.get("lifecycle_stages") or []
        derived_status = _derive_campaign_status(stages)
        updates = {
            "procedure_nom": meta.get("nom", p.get("procedure_nom", "")),
            "procedure_ref": meta.get("ref", p.get("procedure_ref", "")),
            "status": derived_status,
            "updated_at": now,
        }
        if derived_status in ("formalized", "validated") and not p.get("completed_at"):
            updates["completed_at"] = now
        db.table("campaign_procedures").update(updates).eq("id", p["id"]).execute()
        synced += 1

    db.table("formalization_campaigns").update({"updated_at": now}).eq("id", campaign_id).execute()
    return {"success": True, "synced": synced}


@router.post("/{campaign_id}/procedures")
async def add_procedures(campaign_id: str, body: AddProceduresBody):
    db = get_supabase()

    res = db.table("formalization_campaigns").select("id").eq("id", campaign_id).execute()
    if not res.data:
        raise HTTPException(404, "Campagne introuvable")

    proc_res = db.table("workflows").select("id, procedure_metadata_json").in_("id", body.procedure_ids).execute()
    proc_map = {}
    for p in (proc_res.data or []):
        meta = p.get("procedure_metadata_json") or {}
        stages = meta.get("lifecycle_stages") or []
        proc_map[p["id"]] = {
            "nom": meta.get("nom", "Procédure sans nom"),
            "ref": meta.get("ref", ""),
            "status": _derive_campaign_status(stages),
        }

    existing = db.table("campaign_procedures").select("procedure_id").eq("campaign_id", campaign_id).execute()
    existing_ids = {r["procedure_id"] for r in (existing.data or [])}

    now = datetime.utcnow().isoformat()
    rows = []
    for pid in body.procedure_ids:
        if pid in existing_ids:
            continue
        info = proc_map.get(pid, {"nom": "", "ref": "", "status": "pending"})
        completed_at = now if info["status"] in ("formalized", "validated") else None
        rows.append({
            "id": str(uuid.uuid4()),
            "campaign_id": campaign_id,
            "procedure_id": pid,
            "procedure_nom": info["nom"],
            "procedure_ref": info["ref"],
            "status": info["status"],
            "completed_at": completed_at,
            "created_at": now,
            "updated_at": now,
        })

    if rows:
        db.table("campaign_procedures").insert(rows).execute()

    db.table("formalization_campaigns").update({"updated_at": now}).eq("id", campaign_id).execute()
    return {"success": True, "added": len(rows), "skipped": len(body.procedure_ids) - len(rows)}


@router.delete("/{campaign_id}/procedures/{procedure_id}")
async def remove_procedure(campaign_id: str, procedure_id: str):
    db = get_supabase()
    db.table("campaign_procedures").delete().eq("campaign_id", campaign_id).eq("procedure_id", procedure_id).execute()
    return {"success": True}


@router.patch("/{campaign_id}/procedures/{procedure_id}")
async def update_procedure_status(campaign_id: str, procedure_id: str, body: CampaignProcedureUpdate):
    db = get_supabase()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Aucune modification")

    if updates.get("status") in ("formalized", "validated"):
        updates["completed_at"] = datetime.utcnow().isoformat()

    updates["updated_at"] = datetime.utcnow().isoformat()
    db.table("campaign_procedures").update(updates) \
        .eq("campaign_id", campaign_id).eq("procedure_id", procedure_id).execute()
    return {"success": True}


# ─── Emplacements (prompt 5) ──────────────────────────────────
# Procédures attendues d'une campagne : voir manager/campaign_items.py.
# Actif avec CAMPAIGN_SLOTS_ENABLED=true (sinon 404, ancien comportement intact).

def slots_enabled() -> bool:
    return os.getenv("CAMPAIGN_SLOTS_ENABLED", "false").strip().lower() == "true"


def _slots() -> None:
    if not slots_enabled():
        raise HTTPException(404, "Emplacements de campagne non activés")


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except slots.CampaignError as e:
        raise HTTPException(e.status, {"message": str(e), "details": e.details} if e.details else str(e))


class SlotEntry(BaseModel):
    titre: Optional[str] = None
    reference: Optional[str] = None
    procedure_id: Optional[str] = None
    taxonomy_id: Optional[str] = None
    equipe_id: Optional[str] = None
    echeance: Optional[str] = None
    origine: Optional[str] = None
    notes: Optional[str] = None
    raci: Optional[Dict[str, Any]] = None


class SlotsCreate(BaseModel):
    entries: List[SlotEntry]
    force: bool = False


class SlotUpdate(BaseModel):
    procedure_nom: Optional[str] = None
    procedure_ref: Optional[str] = None
    taxonomy_id: Optional[str] = None
    equipe_id: Optional[str] = None
    echeance: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    procedure_id: Optional[str] = None
    unlink: bool = False


class SlotsBulk(BaseModel):
    ids: List[str]
    echeance: Optional[str] = None
    equipe_id: Optional[str] = None
    status: Optional[str] = None


class SlotsRaci(BaseModel):
    ids: List[str]
    raci: Dict[str, Any]
    partial: bool = False


@router.get("/{campaign_id}/emplacements", dependencies=[Depends(_slots)])
def list_slots(campaign_id: str):
    _call(slots.campaign, campaign_id)
    its = slots.items(campaign_id)
    try:  # le pilote voit le NOMBRE de points ouverts, jamais les conversations
        from manager import inbox
        counts = inbox.open_points_count([i.get("procedure_id") for i in its])
        for i in its:
            i["points_ouverts"] = counts.get(i.get("procedure_id"), 0)
    except Exception:
        pass
    return {"emplacements": its, "problemes_lancement": slots.launch_problems(campaign_id)}


@router.post("/{campaign_id}/emplacements", dependencies=[Depends(_slots)])
def create_slots(campaign_id: str, body: SlotsCreate, access: Access = Depends(current_access)):
    entries = [e.model_dump(exclude_none=True) for e in body.entries]
    return _call(slots.create_items, campaign_id, entries, access.user.id, body.force)


@router.patch("/{campaign_id}/emplacements/{item_id}", dependencies=[Depends(_slots)])
def update_slot(campaign_id: str, item_id: str, body: SlotUpdate):
    fields = body.model_dump(exclude_none=True)
    fields.pop("unlink", None)
    if body.unlink:
        _call(slots.link, campaign_id, item_id, None)
        fields.pop("procedure_id", None)
    return {"emplacement": _call(slots.update_item, campaign_id, item_id, fields)}


@router.patch("/{campaign_id}/emplacements", dependencies=[Depends(_slots)])
def bulk_update_slots(campaign_id: str, body: SlotsBulk):
    fields = {k: v for k, v in (("echeance", body.echeance), ("equipe_id", body.equipe_id), ("status", body.status)) if v is not None}
    for iid in body.ids:
        _call(slots.update_item, campaign_id, iid, fields)
    return {"success": True, "count": len(body.ids)}


@router.put("/{campaign_id}/emplacements/raci", dependencies=[Depends(_slots)])
def set_slots_raci(campaign_id: str, body: SlotsRaci):
    return {"success": True, "count": _call(slots.set_raci, campaign_id, body.ids, body.raci, body.partial)}


@router.delete("/{campaign_id}/emplacements/{item_id}", dependencies=[Depends(_slots)])
def delete_slot(campaign_id: str, item_id: str):
    _call(slots.delete_item, campaign_id, item_id)
    return {"success": True}


@router.post("/{campaign_id}/emplacements/depuis-document", dependencies=[Depends(_slots)])
async def slots_from_document(campaign_id: str, files: List[UploadFile] = File(...),
                              access: Access = Depends(current_access)):
    """Lit un document et PROPOSE des emplacements (rien n'est créé : on coche, puis POST)."""
    from processor.studio_planner import plan_turn
    from routers.studio_router import _read_files  # mêmes formats et limites que le chat
    from manager.model_routing import TaskKind, routing_scope, source_kinds_of
    _call(slots.campaign, campaign_id)
    entries = await _read_files(files)
    with routing_scope(TaskKind.AIGUILLAGE, source_kinds_of(entries)):
        plan = await asyncio.to_thread(
            plan_turn, "Liste toutes les procédures décrites dans ce document, sans les générer.", entries, False, [], None)
    candidates = [{"titre": p.get("title") or p.get("titre") or "", "resume": p.get("summary") or p.get("description") or ""}
                  for p in plan.procedures if (p.get("title") or p.get("titre"))]
    # Le document rejoint les sources du projet de la campagne (si les projets sont actifs)
    try:
        from manager import conversation_store, project_store
        if conversation_store.enabled():
            project = await asyncio.to_thread(project_store.for_campaign, campaign_id, access.user.id)
            if project:
                await asyncio.to_thread(project_store.add_sources, project["id"], access.user.id, entries)
    except Exception as e:
        logger.warning(f"Document non ajouté au projet de la campagne : {str(e)[:120]}")
    doublons = await asyncio.to_thread(slots.duplicates, campaign_id, [c["titre"] for c in candidates], [])
    return {"candidats": candidates, "doublons": doublons, "fichiers": [f["filename"] for f in entries]}


def _launch_v2(campaign_id: str, access: Access) -> Dict[str, Any]:
    from routers.orchestration_router import create_procedure_shell
    from routers.orchestration_tasks_router import TaskCreate, _create_task_core

    def shell(nom, ref, taxonomy_id):
        return create_procedure_shell(nom, ref, taxonomy_id, created_from="campagne")["id"]

    def task(procedure_id, assigned_to, assigned_by, titre, echeance, metadata):
        body = TaskCreate(title=titre, assigned_to=assigned_to, assigned_by=assigned_by, raci_role="R",
                          task_type="formalization", due_date=echeance, metadata=metadata)
        return _create_task_core(procedure_id, body, send_email=False)

    result = _call(slots.launch, campaign_id, access.user.id, shell, task)
    try:  # espace de travail de la campagne (projet), s'il n'existe pas encore
        from manager import conversation_store, project_store
        if conversation_store.enabled():
            project_store.for_campaign(campaign_id, access.user.id)
    except Exception as e:
        logger.warning(f"Projet de campagne non créé : {str(e)[:120]}")
    ac.audit("campagne.lancee", access.user, access.organisation_id, "campagne", campaign_id, result)
    return result

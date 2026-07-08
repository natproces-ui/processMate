# routers/irritants_router.py  v3
"""
Router Irritants — Routing pur.
Toute la logique métier est dans processor/irritants_processor.py
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

from database.supabase_client import get_supabase
from processor.irritants_processor import (
    stream_detect,
    stream_analyse,
    stream_approfondir,
    get_findings_with_pistes,
    compute_score,
)

router = APIRouter(prefix="/api/irritants", tags=["Irritants"])

CATEGORIES    = ["Rupture d'information", "Automatisation", "Délai / Attente", "Outil / Système"]
CRITICITES    = ["Majeur", "Moyen", "Mineur"]
STATUTS       = ["ASIS", "En cours", "TOBE", "Résolu"]
PISTE_STATUTS = ["proposée", "retenue", "rejetée", "en_cours"]

SSE_HEADERS = {
    "Cache-Control":     "no-cache",
    "X-Accel-Buffering": "no",
    "Connection":        "keep-alive",
}

# ─────────────────────────────────────────────────────────────
# MODÈLES
# ─────────────────────────────────────────────────────────────

class CreateIrritantRequest(BaseModel):
    titre: str
    description: str = ""
    categorie: str
    procedure_id: str = ""
    procedure_nom: str = ""
    etape_liee: str = ""
    criticite: str = "Moyen"
    statut: str = "ASIS"

class UpdateIrritantRequest(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    categorie: Optional[str] = None
    procedure_id: Optional[str] = None
    procedure_nom: Optional[str] = None
    etape_liee: Optional[str] = None
    criticite: Optional[str] = None
    statut: Optional[str] = None

class AddCommentaireRequest(BaseModel):
    auteur: str = "Utilisateur"
    contenu: str

class UpdatePisteRequest(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    statut: Optional[str] = None

class CreatePisteRequest(BaseModel):
    titre: str = "Piste manuelle"
    description: str
    ordre: int = 0

# ─────────────────────────────────────────────────────────────
# HELPERS ROUTER
# ─────────────────────────────────────────────────────────────

def _valid_procedure_ids() -> set:
    rows = get_supabase().table("workflows").select("id").execute().data or []
    return {r["id"] for r in rows}

def _filter_orphans(irritants: list) -> list:
    valid = _valid_procedure_ids()
    return [i for i in irritants if not i.get("procedure_id") or i["procedure_id"] in valid]

def _get_irritant_or_404(irritant_id: str) -> dict:
    r = get_supabase().table("irritants").select("*").eq("id", irritant_id).execute()
    if not r.data:
        raise HTTPException(404, "Irritant introuvable")
    return r.data[0]

def _get_piste_or_404(piste_id: str) -> dict:
    r = get_supabase().table("pistes").select("id").eq("id", piste_id).execute()
    if not r.data:
        raise HTTPException(404, "Piste introuvable")
    return r.data[0]

def _get_finding_or_404(finding_id: str) -> dict:
    r = get_supabase().table("findings").select("id").eq("id", finding_id).execute()
    if not r.data:
        raise HTTPException(404, "Finding introuvable")
    return r.data[0]

# ─────────────────────────────────────────────────────────────
# RÉFÉRENTIELS
# ─────────────────────────────────────────────────────────────

@router.get("/referentiels")
async def get_referentiels():
    return {
        "success":       True,
        "categories":    CATEGORIES,
        "criticites":    CRITICITES,
        "statuts":       STATUTS,
        "piste_statuts": PISTE_STATUTS,
    }

# ─────────────────────────────────────────────────────────────
# IRRITANTS — Liste & Stats
# ─────────────────────────────────────────────────────────────

@router.get("")
async def list_irritants(
    categorie:     Optional[str] = None,
    criticite:     Optional[str] = None,
    statut:        Optional[str] = None,
    procedure_id:  Optional[str] = None,
    with_findings: bool = Query(False),
):
    try:
        db = get_supabase()
        q = db.table("irritants").select("*").order("created_at", desc=True)
        if categorie:    q = q.eq("categorie",    categorie)
        if criticite:    q = q.eq("criticite",    criticite)
        if statut:       q = q.eq("statut",       statut)
        if procedure_id: q = q.eq("procedure_id", procedure_id)
        irritants = _filter_orphans(q.execute().data or [])
        if with_findings:
            for irr in irritants:
                irr["findings"] = get_findings_with_pistes(irr["id"])
        return {"success": True, "irritants": irritants, "total": len(irritants)}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/by-procedure")
async def list_by_procedure():
    try:
        db = get_supabase()
        irritants = _filter_orphans(db.table("irritants").select("*").order("created_at", desc=True).execute().data or [])
        grouped: dict = {}
        for irr in irritants:
            pid = irr.get("procedure_id") or "__manual__"
            if pid not in grouped:
                grouped[pid] = {
                    "procedure_id":  pid,
                    "procedure_nom": irr.get("procedure_nom", "Sans procédure"),
                    "irritants":     [],
                    "score":         0,
                }
            grouped[pid]["irritants"].append(irr)
        for g in grouped.values():
            g["score"] = compute_score(g["irritants"])
        return {"success": True, "groups": list(grouped.values()), "total": len(irritants)}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/stats")
async def get_stats():
    try:
        db = get_supabase()
        all_rows = db.table("irritants").select("categorie, criticite, statut, procedure_id").execute().data or []
        rows = _filter_orphans(all_rows)
        by_cat, by_crit, by_stat = {}, {}, {}
        for r in rows:
            by_cat[r["categorie"]]  = by_cat.get(r["categorie"], 0)  + 1
            by_crit[r["criticite"]] = by_crit.get(r["criticite"], 0) + 1
            by_stat[r["statut"]]    = by_stat.get(r["statut"], 0)    + 1
        pistes_rows  = db.table("pistes").select("statut").execute().data
        pistes_stats = {}
        for p in pistes_rows:
            pistes_stats[p["statut"]] = pistes_stats.get(p["statut"], 0) + 1
        return {
            "success": True, "total": len(rows),
            "by_categorie": by_cat, "by_criticite": by_crit,
            "by_statut": by_stat, "pistes_by_statut": pistes_stats,
        }
    except Exception as e:
        raise HTTPException(500, str(e))

# ─────────────────────────────────────────────────────────────
# IRRITANTS — CRUD
# ─────────────────────────────────────────────────────────────

@router.post("")
async def create_irritant(body: CreateIrritantRequest):
    if body.categorie not in CATEGORIES:
        raise HTTPException(400, f"Catégorie invalide. Valeurs : {CATEGORIES}")
    if not body.titre.strip():
        raise HTTPException(400, "Titre obligatoire")
    try:
        db  = get_supabase()
        irr = db.table("irritants").insert({
            "titre":         body.titre.strip(),
            "description":   body.description,
            "categorie":     body.categorie,
            "procedure_id":  body.procedure_id,
            "procedure_nom": body.procedure_nom,
            "etape_liee":    body.etape_liee,
            "criticite":     body.criticite,
            "statut":        body.statut,
            "commentaires":  [],
            "ia_analyse":    "",
        }).execute().data[0]
        irr["findings"] = []
        return {"success": True, "irritant": irr}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/{irritant_id}")
async def get_irritant(irritant_id: str, with_findings: bool = Query(True)):
    irr = _get_irritant_or_404(irritant_id)
    if with_findings:
        irr["findings"] = get_findings_with_pistes(irritant_id)
    return {"success": True, "irritant": irr}


@router.patch("/{irritant_id}")
async def update_irritant(irritant_id: str, body: UpdateIrritantRequest):
    try:
        _get_irritant_or_404(irritant_id)
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if "titre" in updates:
            updates["titre"] = updates["titre"].strip()
        if updates:
            get_supabase().table("irritants").update(updates).eq("id", irritant_id).execute()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/{irritant_id}")
async def delete_irritant(irritant_id: str):
    try:
        _get_irritant_or_404(irritant_id)
        get_supabase().table("irritants").delete().eq("id", irritant_id).execute()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/{irritant_id}/commentaires")
async def add_commentaire(irritant_id: str, body: AddCommentaireRequest):
    if not body.contenu.strip():
        raise HTTPException(400, "Contenu obligatoire")
    try:
        irritant     = _get_irritant_or_404(irritant_id)
        commentaires = irritant.get("commentaires") or []
        commentaires.append({
            "id":         str(uuid.uuid4()),
            "auteur":     body.auteur.strip(),
            "contenu":    body.contenu.strip(),
            "created_at": datetime.utcnow().isoformat(),
        })
        get_supabase().table("irritants") \
            .update({"commentaires": commentaires}).eq("id", irritant_id).execute()
        return {"success": True, "commentaires": commentaires}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

# ─────────────────────────────────────────────────────────────
# FINDINGS
# ─────────────────────────────────────────────────────────────

@router.get("/{irritant_id}/findings")
async def get_findings(irritant_id: str):
    _get_irritant_or_404(irritant_id)
    return {"success": True, "findings": get_findings_with_pistes(irritant_id)}


@router.delete("/findings/{finding_id}")
async def delete_finding(finding_id: str):
    try:
        _get_finding_or_404(finding_id)
        get_supabase().table("findings").delete().eq("id", finding_id).execute()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

# ─────────────────────────────────────────────────────────────
# PISTES
# ─────────────────────────────────────────────────────────────

@router.post("/findings/{finding_id}/pistes")
async def create_piste(finding_id: str, body: CreatePisteRequest):
    try:
        _get_finding_or_404(finding_id)
        piste = get_supabase().table("pistes").insert({
            "finding_id":  finding_id,
            "titre":       body.titre,
            "description": body.description,
            "statut":      "proposée",
            "source":      "manual",
            "ordre":       body.ordre,
        }).execute().data[0]
        return {"success": True, "piste": piste}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.patch("/pistes/{piste_id}")
async def update_piste(piste_id: str, body: UpdatePisteRequest):
    try:
        _get_piste_or_404(piste_id)
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if updates:
            get_supabase().table("pistes").update(updates).eq("id", piste_id).execute()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/pistes/{piste_id}")
async def delete_piste(piste_id: str):
    try:
        _get_piste_or_404(piste_id)
        get_supabase().table("pistes").delete().eq("id", piste_id).execute()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/pistes/{piste_id}/messages")
async def get_piste_messages(piste_id: str):
    try:
        msgs = get_supabase().table("piste_messages").select("*") \
            .eq("piste_id", piste_id).order("created_at").execute().data
        return {"success": True, "messages": msgs}
    except Exception as e:
        raise HTTPException(500, str(e))

# ─────────────────────────────────────────────────────────────
# STREAMS SSE — délèguent entièrement au processor
# ─────────────────────────────────────────────────────────────

@router.get("/detect/{procedure_id}/stream")
async def detect_stream(procedure_id: str):
    """Détection automatique d'irritants pour une procédure."""
    return StreamingResponse(
        stream_detect(procedure_id),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@router.get("/{irritant_id}/analyse/stream")
async def analyse_stream(irritant_id: str):
    """Re-analyse ciblée d'un irritant existant."""
    return StreamingResponse(
        stream_analyse(irritant_id),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@router.get("/pistes/{piste_id}/approfondir/stream")
async def approfondir_stream(piste_id: str, message: str = Query(..., min_length=1)):
    """Chat d'approfondissement pour une piste spécifique."""
    return StreamingResponse(
        stream_approfondir(piste_id, message),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )
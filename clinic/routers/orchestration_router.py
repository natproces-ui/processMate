# router/orchestration_router.py
"""
Router Orchestration — Gestion centralisée des procédures ProcessMate
Données stockées dans procedure_metadata_json (Supabase workflows table)
"""

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio
import json
import logging
import os
import re
import uuid

from database.supabase_client import get_supabase, ensure_session_exists

import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/orchestration", tags=["Orchestration"])

# ─────────────────────────────────────────────────────────────
# LIFECYCLE TEMPLATE
# ─────────────────────────────────────────────────────────────

DEFAULT_LIFECYCLE_STAGES = [
    {"id": "s1", "title": "Création",       "description": "Initialisation et cadrage de la procédure",      "workshop": "Atelier de cadrage",    "workshop_done": False, "status": "pending", "completed_at": None, "notes": ""},
    {"id": "s2", "title": "Formalisation",  "description": "Rédaction et structuration du processus",        "workshop": "Atelier de rédaction",  "workshop_done": False, "status": "pending", "completed_at": None, "notes": ""},
    {"id": "s3", "title": "Vérification",   "description": "Contrôle qualité et conformité interne",         "workshop": "Atelier de relecture",  "workshop_done": False, "status": "pending", "completed_at": None, "notes": ""},
    {"id": "s4", "title": "Validation",     "description": "Validation par la hiérarchie compétente",        "workshop": "Comité de validation",  "workshop_done": False, "status": "pending", "completed_at": None, "notes": ""},
    {"id": "s5", "title": "Signature",      "description": "Signature et approbation direction",              "workshop": "Comité d'approbation",  "workshop_done": False, "status": "pending", "completed_at": None, "notes": ""},
    {"id": "s6", "title": "Publication",    "description": "Diffusion, mise en production et formation",     "workshop": "Atelier de formation",  "workshop_done": False, "status": "pending", "completed_at": None, "notes": ""},
]

# Mapping ancien titre → nouveau titre pour migration
_LIFECYCLE_TITLE_MIGRATION = {
    "Initialisation":         "Création",
    "Validation Interne":     "Vérification",
    "Révision Légale":        "Validation",
    "Approbation Direction":  "Signature",
    "Publication & Formation":"Publication",
}

VALID_STATUSES = {
    "Brouillon", "En cours", "En validation",
    "Retours reçus", "En révision", "Validée", "Rejetée", "Bloquée",
    "En pause", "En arbitrage",
}

VALID_RACI = {"R", "A", "C", "I", "-"}
VALID_USER_ROLES = {"admin", "process_owner", "validator", "contributor", "viewer"}
VALID_USER_STATUSES = {"active", "invited", "suspended"}
VALID_ASSIGNMENT_TYPES = {"owner", "validator", "reviewer", "contributor", "observer"}
VALID_REVIEW_DECISIONS = {"pending", "approved", "changes_requested", "rejected"}

class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    phone: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    entity: Optional[str] = None
    global_role: Optional[str] = None
    status: Optional[str] = None


class ProcedureAssignmentItem(BaseModel):
    user_id: str
    raci_role: Optional[str] = None
    assignment_type: str = "contributor"
    stage_id: Optional[str] = None
    workflow_step_id: Optional[str] = None
    is_required: bool = True
    due_date: Optional[str] = None


class ProcedureAssignmentsUpdate(BaseModel):
    assignments: List[ProcedureAssignmentItem]


class ValidationReviewRequest(BaseModel):
    reviewer_id: str
    decision: str = "pending"
    comment: Optional[str] = None



# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────

def _get_workflow(workflow_id: str) -> Dict:
    db = get_supabase()
    result = db.table("workflows").select("*").eq("id", workflow_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Procédure introuvable")
    return result.data[0]


def _update_metadata(workflow_id: str, meta: Dict) -> None:
    db = get_supabase()
    db.table("workflows").update({"procedure_metadata_json": meta}).eq("id", workflow_id).execute()


def _get_latest_workflows() -> List[Dict]:
    db = get_supabase()
    result = (
        db.table("workflows")
        .select("id, session_id, title, version, procedure_metadata_json, workflow_json, enrichments_json, created_at")
        .order("version", desc=True)
        .execute()
    )
    seen: Dict[str, Dict] = {}
    for wf in result.data:
        sid = wf["session_id"]
        if sid not in seen:
            seen[sid] = wf
    return sorted(seen.values(), key=lambda x: x["created_at"], reverse=True)


def _normalize_raci_matrix(matrix: Dict) -> Dict[str, str]:
    """Normalise la matrice RACI en format plat {person: role}.
    Gère la migration depuis l'ancien format imbriqué {procId: {person: role}}.
    """
    flat: Dict[str, str] = {}
    for key, value in matrix.items():
        if isinstance(value, dict):
            # Ancien format imbriqué
            flat.update({k: v for k, v in value.items() if isinstance(v, str)})
        elif isinstance(value, str):
            flat[key] = value
    return flat


def _build_procedure(wf: Dict) -> Dict:
    meta: Dict = wf.get("procedure_metadata_json") or {}
    raci_raw = meta.get("raci", {"people": [], "matrix": {}})
    return {
        "id": wf["id"],
        "session_id": wf["session_id"],
        "nom": meta.get("nom") or wf.get("title") or "Sans titre",
        "ref": meta.get("ref", ""),
        "version": wf["version"],
        "status": meta.get("status", "Brouillon"),
        "category": meta.get("category") or meta.get("pole") or meta.get("direction") or "Non classé",
        "description": meta.get("objet", ""),
        "lastModified": wf["created_at"],
        "is_finalized": bool(meta.get("finalized_at")),
        "finalized_at": meta.get("finalized_at"),
        "remarks_count": len(meta.get("remarks", [])),
        "lifecycle_stages": meta.get("lifecycle_stages", DEFAULT_LIFECYCLE_STAGES),
        "raci": {
            "people": raci_raw.get("people", []),
            "matrix": _normalize_raci_matrix(raci_raw.get("matrix", {})),
        },
        "metadata": meta,
        "workflow_json":    wf.get("workflow_json") or [],
        "enrichments_json": wf.get("enrichments_json") or {},
    }


def _compute_stats(procedures: List[Dict]) -> Dict:
    by_status: Dict[str, int] = {}
    for p in procedures:
        s = p["status"]
        by_status[s] = by_status.get(s, 0) + 1
    return {
        "total": len(procedures),
        "en_cours": by_status.get("En cours", 0) + by_status.get("Brouillon", 0),
        "en_validation": by_status.get("En validation", 0),
        "en_revision": by_status.get("En révision", 0) + by_status.get("Retours reçus", 0),
        "validees": by_status.get("Validée", 0),
        "bloquees": by_status.get("Bloquée", 0) + by_status.get("Rejetée", 0),
        "finalisees": sum(1 for p in procedures if p.get("is_finalized")),
        "by_status": by_status,
    }

@router.get("/categories")
async def get_categories():
    try:
        workflows = _get_latest_workflows()
        cats = set()
        for wf in workflows:
            meta = wf.get("procedure_metadata_json") or {}
            c = meta.get("category") or meta.get("pole") or meta.get("direction")
            if c and c != "Non classé":
                cats.add(c)
        return {"success": True, "categories": sorted(cats)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
def _proc_event(
    procedure_id: str,
    event_type: str,
    actor_id: Optional[str] = None,
    task_id: Optional[str] = None,
    stage_id: Optional[str] = None,
    from_status: Optional[str] = None,
    to_status: Optional[str] = None,
    message: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> None:
    """Ecrit un evenement dans procedure_events pour la tracabilite du parcours."""
    try:
        get_supabase().table("procedure_events").insert({
            "id": str(uuid.uuid4()),
            "procedure_id": procedure_id,
            "event_type": event_type,
            "from_status": from_status,
            "to_status": to_status,
            "actor_id": actor_id,
            "task_id": task_id,
            "stage_id": stage_id,
            "message": message,
            "payload": payload or {},
            "created_at": datetime.utcnow().isoformat(),
        }).execute()
    except Exception as e:
        logger.warning(f"procedure_events insert failed ({event_type}): {e}")
    
# ─────────────────────────────────────────────────────────────
# ENDPOINTS — Liste & Stats
# ─────────────────────────────────────────────────────────────

@router.get("/procedures")
async def list_procedures():
    try:
        workflows = _get_latest_workflows()
        procedures = [_build_procedure(wf) for wf in workflows]
        return {"success": True, "procedures": procedures, "total": len(procedures)}
    except Exception as e:
        logger.error(f"❌ list_procedures: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_stats():
    try:
        workflows = _get_latest_workflows()
        procedures = [_build_procedure(wf) for wf in workflows]
        return {"success": True, "stats": _compute_stats(procedures)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
# ─────────────────────────────────────────────────────────────
# ENDPOINTS — Utilisateurs, affectations, validations
# ─────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    q: Optional[str] = None,
    department: Optional[str] = None,
    role: Optional[str] = None,
    active_only: bool = True,
):
    try:
        db = get_supabase()
        query = db.table("user_profiles").select("*").order("full_name")

        if active_only:
            query = query.eq("status", "active")
        if department:
            query = query.eq("department", department)
        if role:
            query = query.eq("global_role", role)

        users = query.execute().data or []

        if q:
            needle = q.strip().lower()
            users = [
                u for u in users
                if needle in (u.get("full_name") or "").lower()
                or needle in (u.get("display_name") or "").lower()
                or needle in (u.get("email") or "").lower()
                or needle in (u.get("job_title") or "").lower()
                or needle in (u.get("department") or "").lower()
            ]

        return {"success": True, "users": users, "total": len(users)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/users/{user_id}")
async def update_user_profile(user_id: str, body: UserProfileUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    if "global_role" in updates and updates["global_role"] not in VALID_USER_ROLES:
        raise HTTPException(status_code=400, detail=f"Rôle utilisateur invalide: {updates['global_role']}")

    if "status" in updates and updates["status"] not in VALID_USER_STATUSES:
        raise HTTPException(status_code=400, detail=f"Statut utilisateur invalide: {updates['status']}")

    try:
        db = get_supabase()
        db.table("user_profiles").update(updates).eq("id", user_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/procedures/{workflow_id}/assignments")
async def get_procedure_assignments(workflow_id: str):
    try:
        _get_workflow(workflow_id)
        db = get_supabase()

        rows = (
            db.table("procedure_assignments")
            .select("*, user_profiles!procedure_assignments_user_id_fkey(*)")
            .eq("procedure_id", workflow_id)
            .order("assignment_type")
            .execute()
            .data
            or []
        )

        return {"success": True, "assignments": rows, "total": len(rows)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/procedures/{workflow_id}/assignments")
async def update_procedure_assignments(workflow_id: str, body: ProcedureAssignmentsUpdate):
    for item in body.assignments:
        if item.raci_role and item.raci_role not in {"R", "A", "C", "I"}:
            raise HTTPException(status_code=400, detail=f"RACI invalide: {item.raci_role}")
        if item.assignment_type not in VALID_ASSIGNMENT_TYPES:
            raise HTTPException(status_code=400, detail=f"Type d'affectation invalide: {item.assignment_type}")

    try:
        _get_workflow(workflow_id)
        db = get_supabase()

        db.table("procedure_assignments").delete().eq("procedure_id", workflow_id).execute()

        payload = [
            {
                "procedure_id": workflow_id,
                "user_id": item.user_id,
                "raci_role": item.raci_role,
                "assignment_type": item.assignment_type,
                "stage_id": item.stage_id,
                "workflow_step_id": item.workflow_step_id,
                "is_required": item.is_required,
                "due_date": item.due_date,
            }
            for item in body.assignments
        ]

        if payload:
            db.table("procedure_assignments").insert(payload).execute()

        return {"success": True, "count": len(payload)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/procedures/{workflow_id}/validation-reviews")
async def get_validation_reviews(workflow_id: str):
    try:
        _get_workflow(workflow_id)
        db = get_supabase()

        rows = (
            db.table("procedure_validation_reviews")
            .select("*, user_profiles!procedure_assignments_user_id_fkey(*)")
            .eq("procedure_id", workflow_id)
            .order("created_at")
            .execute()
            .data
            or []
        )

        return {"success": True, "reviews": rows, "total": len(rows)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/procedures/{workflow_id}/validation-reviews")
async def upsert_validation_review(workflow_id: str, body: ValidationReviewRequest):
    if body.decision not in VALID_REVIEW_DECISIONS:
        raise HTTPException(status_code=400, detail=f"Décision invalide: {body.decision}")

    try:
        _get_workflow(workflow_id)
        db = get_supabase()

        payload = {
            "procedure_id": workflow_id,
            "reviewer_id": body.reviewer_id,
            "decision": body.decision,
            "comment": body.comment,
            "reviewed_at": datetime.utcnow().isoformat() if body.decision != "pending" else None,
        }

        result = (
            db.table("procedure_validation_reviews")
            .upsert(payload, on_conflict="procedure_id,reviewer_id")
            .execute()
        )

        return {"success": True, "review": result.data[0] if result.data else payload}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ─────────────────────────────────────────────────────────────
# ENDPOINTS — Détail
# ─────────────────────────────────────────────────────────────

@router.get("/procedures/{workflow_id}")
async def get_procedure(workflow_id: str):
    try:
        db = get_supabase()
        wf = _get_workflow(workflow_id)
        procedure = _build_procedure(wf)

        history = (
            db.table("workflows")
            .select("id, version, created_at, procedure_metadata_json")
            .eq("session_id", wf["session_id"])
            .order("version", desc=False)
            .execute()
        )
        procedure["versions"] = [
            {
                "id": v["id"],
                "version": v["version"],
                "date": v["created_at"],
                "status": (v.get("procedure_metadata_json") or {}).get("status", "Brouillon"),
            }
            for v in history.data
        ]
        return {"success": True, "procedure": procedure}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────
# ENDPOINTS — CRUD
# ─────────────────────────────────────────────────────────────

class CreateProcedureRequest(BaseModel):
    nom: str
    ref: str = ""
    category: str = ""
    description: str = ""
    taxonomy_id: Optional[str] = None





@router.post("/procedures")
async def create_procedure(body: CreateProcedureRequest):
    if not body.nom.strip():
        raise HTTPException(status_code=400, detail="Le nom est obligatoire")
    try:
        db = get_supabase()
        
        # Créer la session et récupérer l'ID confirmé
        session_result = db.table("sessions").insert({
            "title": body.nom.strip()
        }).execute()
        
        if not session_result.data:
            raise HTTPException(status_code=500, detail="Échec création session")
        
        session_id = session_result.data[0]["id"]
        logger.info(f"✅ Session créée : {session_id}")

        _init_stages = [dict(s) for s in DEFAULT_LIFECYCLE_STAGES]
        _init_stages[0]["status"] = "in_progress"
        meta = {
            "nom": body.nom.strip(),
            "ref": body.ref,
            "category": body.category,
            "objet": body.description,
            "status": "Brouillon",
            "lifecycle_stages": _init_stages,
            "raci": {"people": [], "matrix": {}},
            "remarks": [],
            "created_from": "orchestration",
        }
        wf_row: dict = {
            "session_id": session_id,
            "title": body.nom.strip(),
            "workflow_json": [],
            "enrichments_json": {},
            "procedure_metadata_json": meta,
            "version": 1,
        }
        if body.taxonomy_id:
            wf_row["taxonomy_id"] = body.taxonomy_id
        result = db.table("workflows").insert(wf_row).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Échec création workflow")
        
        _proc_event(
            procedure_id=result.data[0]["id"],
            event_type="procedure_created",
            message=f"Procedure creee: {body.nom.strip()}",
            payload={"category": body.category, "source": "manual"},
        )
            
        return {"success": True, "procedure": _build_procedure(result.data[0])}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ create_procedure: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────
# ENDPOINTS — Import PDF
# ─────────────────────────────────────────────────────────────

async def _call_gemini_for_pdf_raw(pdf_bytes: bytes) -> str:
    """Appelle Gemini avec le PDF via GeminiModelManager (fallback automatique)."""
    from google.genai import types
    from prompts.extract_prompt import get_extraction_prompt
    from manager.model_manager import GeminiModelManager

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY non configurée")

    manager = GeminiModelManager(api_key)
    pdf_part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
    prompt = get_extraction_prompt()

    async def _task(model_name: str):
        model = manager.get_model(model_name)
        return await asyncio.wait_for(
            asyncio.to_thread(
                model.generate_content,
                model=model_name,
                contents=[prompt, pdf_part],
            ),
            timeout=180,
        )

    result = await manager.execute_with_fallback(_task, task_name="Extraction PDF")
    if not result["success"]:
        raise ValueError(result["message"])

    return result["result"].text

def _parse_pdf_extraction(text: str) -> Dict:
    """Parse la réponse Gemini du prompt d'extraction standard (même logique que img_processor)."""
    text = text.strip()
    json_match = re.search(r'\{[\s\S]*\}', text)
    if json_match:
        text = json_match.group(0)
    text = re.sub(r'```json\s*', '', text)
    text = re.sub(r'```\s*', '', text)

    data = json.loads(text)

    title = (data.get("title") or "").strip() or "Procédure importée"
    workflow_raw = data.get("workflow") or []
    enrichments_list = data.get("enrichments") or []
    proc_meta = data.get("procedureMetadata") or {}

    valid_types = {"StartEvent", "Task", "ExclusiveGateway", "ParallelGateway", "InclusiveGateway", "EndEvent"}
    all_ids = [str(s.get("id", "")) for s in workflow_raw]
    workflow = []
    for idx, step in enumerate(workflow_raw):
        type_bpmn = str(step.get("typeBpmn", "Task"))
        if type_bpmn not in valid_types:
            type_bpmn = "Task"

        raw_outputs = step.get("outputs") or []
        outputs = []
        if isinstance(raw_outputs, list):
            for out in raw_outputs:
                if isinstance(out, dict) and str(out.get("targetId", "")).strip():
                    outputs.append({"targetId": str(out["targetId"]), "label": str(out.get("label", ""))})

        condition = ""
        if type_bpmn in ("ExclusiveGateway", "InclusiveGateway"):
            condition = str(step.get("condition", "")).strip() or str(step.get("étape", "")) or "Décision"

        workflow.append({
            "id": str(step.get("id", str(idx + 1))),
            "étape": str(step.get("étape", "")).strip() or f"Étape {idx + 1}",
            "typeBpmn": type_bpmn,
            "département": str(step.get("département", "")).strip(),
            "acteur": str(step.get("acteur", "")).strip(),
            "typeActeur": str(step.get("typeActeur", "")).strip(),  # ← AJOUT
            "condition": condition,
            "outputs": outputs,
            "outil": str(step.get("outil", "")).strip(),
        })

    enrichments: Dict[str, Dict] = {}
    for enr in enrichments_list:
        task_id = str(enr.get("id_tache", "")).strip()
        if task_id:
            enrichments[task_id] = {
                "id": task_id,
                "descriptif": str(enr.get("descriptif", "")).strip(),
                "applicatif": str(enr.get("applicatif", "")).strip(),
                "declencheur": str(enr.get("declencheur", "")).strip(),
                "duree_estimee": str(enr.get("duree_estimee", "")).strip(),
                "frequence": str(enr.get("frequence", "")).strip(),
                "kpi": str(enr.get("kpi", "")).strip(),
            }

    return {"title": title, "procedureMetadata": proc_meta, "workflow": workflow, "enrichments": enrichments}


@router.post("/procedures/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)):
    """Extrait le contenu d'un PDF via Gemini sans rien créer en base."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés")
    pdf_bytes = await file.read()
    if len(pdf_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="PDF trop volumineux (max 20 Mo)")
    try:
        raw_text = await _call_gemini_for_pdf_raw(pdf_bytes)
        parsed = _parse_pdf_extraction(raw_text)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=422, detail=f"Gemini n'a pas retourné un JSON valide: {e}")
    except Exception as e:
        logger.error(f"❌ extract_pdf Gemini: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur extraction Gemini: {e}")
    parsed["source_filename"] = file.filename or ""
    return {"success": True, "extracted": parsed, "steps_count": len(parsed.get("workflow") or [])}


class ImportFromExtractionRequest(BaseModel):
    nom: str
    categorie: str
    source_filename: str = ""
    extracted: Dict[str, Any]


@router.post("/procedures/import-pdf")
async def import_procedure_from_extraction(body: ImportFromExtractionRequest):
    """Crée une procédure depuis des données déjà extraites par Gemini."""
    if not body.nom.strip():
        raise HTTPException(status_code=400, detail="Le nom est obligatoire")

    extracted = body.extracted
    proc_meta = extracted.get("procedureMetadata") or {}
    workflow_json = extracted.get("workflow") or []
    enrichments_json = extracted.get("enrichments") or {}

    rg_raw = proc_meta.get("regles_gestion", "")
    if isinstance(rg_raw, list):
        regles_gestion = [r for r in rg_raw if r]
    elif isinstance(rg_raw, str) and rg_raw.strip():
        regles_gestion = [r.strip() for r in rg_raw.split("\n") if r.strip()]
    else:
        regles_gestion = []

    meta = {
        "nom": body.nom.strip(),
        "ref": proc_meta.get("ref", ""),
        "version": proc_meta.get("version", ""),
        "category": body.categorie.strip() or "Non classé",
        "pole": proc_meta.get("pole", ""),
        "direction": proc_meta.get("direction", ""),
        "objet": proc_meta.get("objet", ""),
        "definition": "",
        "perimetre": proc_meta.get("perimeter", ""),
        "proprietaire": proc_meta.get("direction", "") or proc_meta.get("pole", ""),
        "regles_gestion": regles_gestion,
        "abbreviations": proc_meta.get("abbreviations") or [],
        "definitions": proc_meta.get("definitions") or [],
        "responsabilites_internes": proc_meta.get("responsabilites_internes") or [],
        "responsabilites_externes": proc_meta.get("responsabilites_externes") or [],
        "references": proc_meta.get("references", ""),
        "status": "Brouillon",
        "lifecycle_stages": [dict(s) for s in DEFAULT_LIFECYCLE_STAGES],
        "raci": {"people": [], "matrix": {}},
        "remarks": [],
        "created_from": "pdf_import",
        "source_filename": body.source_filename,
    }

    try:
        db = get_supabase()
        session_result = db.table("sessions").insert({"title": body.nom.strip()}).execute()
        if not session_result.data:
            raise HTTPException(status_code=500, detail="Échec création session")
        session_id = session_result.data[0]["id"]

        wf_result = db.table("workflows").insert({
            "session_id": session_id,
            "title": body.nom.strip(),
            "workflow_json": workflow_json,
            "enrichments_json": enrichments_json,
            "procedure_metadata_json": meta,
            "version": 1,
        }).execute()

        if not wf_result.data:
            raise HTTPException(status_code=500, detail="Échec création workflow")

        _proc_event(
            procedure_id=wf_result.data[0]["id"],
            event_type="procedure_imported",
            message=f"Procedure importee depuis PDF: {body.nom.strip()}",
            payload={"source_filename": body.source_filename, "steps_count": len(workflow_json)},
        )

        procedure = _build_procedure(wf_result.data[0])
        return {"success": True, "procedure": procedure, "steps_count": len(workflow_json)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ import_pdf Supabase: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class UpdateProcedureRequest(BaseModel):
    nom: Optional[str] = None
    ref: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


@router.patch("/procedures/{workflow_id}")
async def update_procedure(workflow_id: str, body: UpdateProcedureRequest):
    if body.status and body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Statut invalide: {body.status}")
    try:
        wf = _get_workflow(workflow_id)
        meta = wf.get("procedure_metadata_json") or {}
        if body.nom is not None:
            meta["nom"] = body.nom.strip()
        if body.ref is not None:
            meta["ref"] = body.ref
        if body.category is not None:
            meta["category"] = body.category
        if body.description is not None:
            meta["objet"] = body.description
        if body.status is not None:
            meta["status"] = body.status
        _update_metadata(workflow_id, meta)
        return {"success": True, "workflow_id": workflow_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SaveWorkflowDataRequest(BaseModel):
    workflow_json: List[Dict]
    enrichments_json: Dict = {}
    procedure_metadata_json: Optional[Dict] = None


@router.patch("/procedures/{workflow_id}/workflow")
async def save_workflow_data(workflow_id: str, body: SaveWorkflowDataRequest):
    """Met à jour le tableau de travail (workflow_json + enrichments) d'une procédure existante."""
    try:
        db = get_supabase()
        wf = _get_workflow(workflow_id)
        update: Dict = {
            "workflow_json": body.workflow_json,
            "enrichments_json": body.enrichments_json,
        }
        if body.procedure_metadata_json is not None:
            update["procedure_metadata_json"] = body.procedure_metadata_json
        db.table("workflows").update(update).eq("id", workflow_id).execute()
        logger.info(f"💾 workflow_json mis à jour — {workflow_id}")
        return {"success": True, "workflow_id": workflow_id, "session_id": wf["session_id"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/procedures/{workflow_id}")
async def delete_procedure(workflow_id: str):
    try:
        db = get_supabase()
        wf = _get_workflow(workflow_id)
        # Supprimer tous les workflows de la session
        db.table("workflows").delete().eq("session_id", wf["session_id"]).execute()
        logger.info(f"🗑️ Procédure supprimée: session {wf['session_id']}")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────
# ENDPOINTS — Statut
# ─────────────────────────────────────────────────────────────

class StatusUpdate(BaseModel):
    status: str
    comment: Optional[str] = None


@router.patch("/procedures/{workflow_id}/status")
async def update_status(workflow_id: str, body: StatusUpdate):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Statut invalide: {body.status}")
    try:
        wf = _get_workflow(workflow_id)
        meta = wf.get("procedure_metadata_json") or {}
        prev_status = meta.get("status")
        meta["status"] = body.status
        if body.comment:
            meta["status_comment"] = body.comment
        _update_metadata(workflow_id, meta)
        _proc_event(
            procedure_id=workflow_id,
            event_type="status_changed",
            from_status=prev_status,
            to_status=body.status,
            message=body.comment,
            payload={"source": "manual"},
        )
        return {"success": True, "status": body.status}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─────────────────────────────────────────────────────────────
# ENDPOINTS — Migration cycle de vie
# ─────────────────────────────────────────────────────────────

_STATUS_TO_STAGE_IDX: Dict[str, int] = {
    "Brouillon":       0,
    "En cours":        1,
    "En vérification": 2,
    "Retours reçus":   1,
    "En révision":     2,
    "En validation":   3,
    "Rejetée":         3,
    "Validée":         4,
    "Bloquée":         3,
}


@router.post("/procedures/migrate-lifecycle-stages")
async def migrate_lifecycle_stages():
    """Renomme les étapes ET synchronise les statuts pour toutes les procédures existantes."""
    try:
        db = get_supabase()
        workflows = db.table("workflows").select("id, procedure_metadata_json").execute().data or []
        updated = 0
        now = datetime.utcnow().isoformat()

        for wf in workflows:
            meta = wf.get("procedure_metadata_json") or {}
            stages = meta.get("lifecycle_stages", [])

            # Assign default template if missing
            if not stages:
                stages = [dict(s) for s in DEFAULT_LIFECYCLE_STAGES]

            # Step 1: Rename old titles
            for stage in stages:
                new_title = _LIFECYCLE_TITLE_MIGRATION.get(stage.get("title", ""))
                if new_title:
                    stage["title"] = new_title

            # Step 2: Sync statuses based on procedure status
            proc_status = meta.get("status", "Brouillon")

            if meta.get("finalized_at"):
                # Finalized → all completed except Publication (in_progress)
                for i, stage in enumerate(stages):
                    if i < len(stages) - 1:
                        stage["status"] = "completed"
                        stage["completed_at"] = stage.get("completed_at") or meta["finalized_at"]
                    else:
                        stage["status"] = "in_progress"
                        stage["completed_at"] = None
            else:
                target_idx = _STATUS_TO_STAGE_IDX.get(proc_status)
                if target_idx is None:
                    # En pause / En arbitrage : keep existing or default to 0
                    has_ip = any(s.get("status") == "in_progress" for s in stages)
                    if not has_ip:
                        stages[0]["status"] = "in_progress"
                elif target_idx is not None:
                    for i, stage in enumerate(stages):
                        if i < target_idx:
                            stage["status"] = "completed"
                            if not stage.get("completed_at"):
                                stage["completed_at"] = now
                        elif i == target_idx:
                            stage["status"] = "in_progress"
                            stage["completed_at"] = None
                        else:
                            stage["status"] = "pending"
                            stage["completed_at"] = None

            meta["lifecycle_stages"] = stages
            db.table("workflows").update(
                {"procedure_metadata_json": meta}
            ).eq("id", wf["id"]).execute()
            updated += 1

        return {"success": True, "updated": updated, "total": len(workflows)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────
# ENDPOINTS — Stand-by & Arbitrage
# ─────────────────────────────────────────────────────────────

class PauseRequest(BaseModel):
    reason: str
    actor_id: Optional[str] = None

class ResumeRequest(BaseModel):
    actor_id: Optional[str] = None
    comment: Optional[str] = None

class ArbitrageRequest(BaseModel):
    reason: str
    actor_id: Optional[str] = None
    escalated_to: Optional[str] = None   # nom ou id du décideur

class ArbitrageResolveRequest(BaseModel):
    resolution: str                       # décision prise
    resume_status: str = "En cours"      # statut cible après résolution
    actor_id: Optional[str] = None


@router.post("/procedures/{workflow_id}/pause")
async def pause_procedure(workflow_id: str, body: PauseRequest):
    try:
        wf = _get_workflow(workflow_id)
        meta = wf.get("procedure_metadata_json") or {}
        prev_status = meta.get("status")
        if prev_status == "En pause":
            raise HTTPException(status_code=400, detail="La procédure est déjà en pause")
        meta["status"] = "En pause"
        meta["pause_reason"] = body.reason
        meta["paused_from_status"] = prev_status
        _update_metadata(workflow_id, meta)
        _proc_event(
            procedure_id=workflow_id,
            event_type="procedure_paused",
            from_status=prev_status,
            to_status="En pause",
            actor_id=body.actor_id,
            message=body.reason,
            payload={"previous_status": prev_status},
        )
        return {"success": True, "status": "En pause"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/procedures/{workflow_id}/resume")
async def resume_procedure(workflow_id: str, body: ResumeRequest):
    try:
        wf = _get_workflow(workflow_id)
        meta = wf.get("procedure_metadata_json") or {}
        prev_status = meta.get("status")
        resume_status = meta.get("paused_from_status") or "En cours"
        meta["status"] = resume_status
        meta.pop("pause_reason", None)
        meta.pop("paused_from_status", None)
        _update_metadata(workflow_id, meta)
        _proc_event(
            procedure_id=workflow_id,
            event_type="procedure_resumed",
            from_status=prev_status,
            to_status=resume_status,
            actor_id=body.actor_id,
            message=body.comment,
            payload={"resumed_to": resume_status},
        )
        return {"success": True, "status": resume_status}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/procedures/{workflow_id}/arbitrage")
async def request_arbitrage(workflow_id: str, body: ArbitrageRequest):
    try:
        wf = _get_workflow(workflow_id)
        meta = wf.get("procedure_metadata_json") or {}
        prev_status = meta.get("status")
        meta["status"] = "En arbitrage"
        meta["arbitrage_reason"] = body.reason
        meta["arbitrage_from_status"] = prev_status
        if body.escalated_to:
            meta["arbitrage_escalated_to"] = body.escalated_to
        _update_metadata(workflow_id, meta)
        _proc_event(
            procedure_id=workflow_id,
            event_type="arbitrage_requested",
            from_status=prev_status,
            to_status="En arbitrage",
            actor_id=body.actor_id,
            message=body.reason,
            payload={"escalated_to": body.escalated_to, "previous_status": prev_status},
        )
        return {"success": True, "status": "En arbitrage"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/procedures/{workflow_id}/arbitrage/resolve")
async def resolve_arbitrage(workflow_id: str, body: ArbitrageResolveRequest):
    if body.resume_status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Statut invalide: {body.resume_status}")
    try:
        wf = _get_workflow(workflow_id)
        meta = wf.get("procedure_metadata_json") or {}
        prev_status = meta.get("status")
        meta["status"] = body.resume_status
        meta.pop("arbitrage_reason", None)
        meta.pop("arbitrage_from_status", None)
        meta.pop("arbitrage_escalated_to", None)
        _update_metadata(workflow_id, meta)
        _proc_event(
            procedure_id=workflow_id,
            event_type="arbitrage_resolved",
            from_status=prev_status,
            to_status=body.resume_status,
            actor_id=body.actor_id,
            message=body.resolution,
            payload={"resolution": body.resolution, "resumed_to": body.resume_status},
        )
        return {"success": True, "status": body.resume_status}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────
# ENDPOINTS — Remarques
# ─────────────────────────────────────────────────────────────

class AddRemarkRequest(BaseModel):
    author: str
    content: str
    type: str = "remark"  # remark | modification_request | approval


@router.get("/procedures/{workflow_id}/remarks")
async def get_remarks(workflow_id: str):
    wf = _get_workflow(workflow_id)
    meta = wf.get("procedure_metadata_json") or {}
    return {"success": True, "remarks": meta.get("remarks", [])}


@router.post("/procedures/{workflow_id}/remarks")
async def add_remark(workflow_id: str, body: AddRemarkRequest):
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Le contenu est obligatoire")
    try:
        wf = _get_workflow(workflow_id)
        meta = wf.get("procedure_metadata_json") or {}
        remarks = meta.get("remarks", [])
        remark = {
            "id": str(uuid.uuid4()),
            "author": body.author.strip(),
            "content": body.content.strip(),
            "type": body.type,
            "created_at": datetime.utcnow().isoformat(),
            "resolved": False,
        }
        remarks.append(remark)
        meta["remarks"] = remarks
        _update_metadata(workflow_id, meta)
        return {"success": True, "remark": remark}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/procedures/{workflow_id}/remarks/{remark_id}/resolve")
async def resolve_remark(workflow_id: str, remark_id: str):
    try:
        wf = _get_workflow(workflow_id)
        meta = wf.get("procedure_metadata_json") or {}
        remarks = meta.get("remarks", [])
        found = False
        for r in remarks:
            if r["id"] == remark_id:
                r["resolved"] = True
                r["resolved_at"] = datetime.utcnow().isoformat()
                found = True
                break
        if not found:
            raise HTTPException(status_code=404, detail="Remarque introuvable")
        meta["remarks"] = remarks
        _update_metadata(workflow_id, meta)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────
# ENDPOINTS — RACI
# ─────────────────────────────────────────────────────────────

class RACIUpdate(BaseModel):
    people: List[str] = []
    matrix: Dict[str, str] = {}
    assignments: Optional[List[ProcedureAssignmentItem]] = None


@router.patch("/procedures/{workflow_id}/raci")
async def update_raci(workflow_id: str, body: RACIUpdate):
    try:
        wf = _get_workflow(workflow_id)
        meta = wf.get("procedure_metadata_json") or {}
        db = get_supabase()

        if body.assignments is not None:
            for item in body.assignments:
                if item.raci_role and item.raci_role not in {"R", "A", "C", "I"}:
                    raise HTTPException(status_code=400, detail=f"RACI invalide: {item.raci_role}")
                if item.assignment_type not in VALID_ASSIGNMENT_TYPES:
                    raise HTTPException(status_code=400, detail=f"Type d'affectation invalide: {item.assignment_type}")

            db.table("procedure_assignments").delete().eq("procedure_id", workflow_id).execute()

            payload = [
                {
                    "procedure_id": workflow_id,
                    "user_id": item.user_id,
                    "raci_role": item.raci_role,
                    "assignment_type": item.assignment_type,
                    "stage_id": item.stage_id,
                    "workflow_step_id": item.workflow_step_id,
                    "is_required": item.is_required,
                    "due_date": item.due_date,
                }
                for item in body.assignments
            ]

            if payload:
                db.table("procedure_assignments").insert(payload).execute()

            meta["raci"] = {
                "people": [],
                "matrix": {},
                "source": "procedure_assignments",
            }
            _update_metadata(workflow_id, meta)

            return {"success": True, "mode": "assignments", "count": len(payload)}

        for role in body.matrix.values():
            if role not in VALID_RACI:
                raise HTTPException(status_code=400, detail=f"Rôle invalide: {role}. Valeurs: R, A, C, I, -")

        meta["raci"] = {
            "people": body.people,
            "matrix": body.matrix,
            "source": "metadata_json",
        }
        _update_metadata(workflow_id, meta)

        return {"success": True, "mode": "legacy"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/raci")
async def get_global_raci():
    try:
        db = get_supabase()
        workflows = _get_latest_workflows()
        all_people: set = set()
        procedures_raci = []

        assignment_rows = (
            db.table("procedure_assignments")
            .select("*, user_profiles!procedure_assignments_user_id_fkey(*)")
            .execute()
            .data
            or []
        )

        assignments_by_proc: Dict[str, List[Dict]] = {}
        for row in assignment_rows:
            pid = row.get("procedure_id")
            if pid:
                assignments_by_proc.setdefault(pid, []).append(row)

        for wf in workflows:
            meta = wf.get("procedure_metadata_json") or {}
            procedure_id = wf["id"]
            rows = assignments_by_proc.get(procedure_id, [])

            if rows:
                people = []
                matrix = {}
                enriched_people = []

                for row in rows:
                    profile = row.get("user_profiles") or {}
                    display_name = (
                        profile.get("display_name")
                        or profile.get("full_name")
                        or profile.get("email")
                        or row.get("user_id")
                    )

                    people.append(display_name)
                    all_people.add(display_name)

                    if row.get("raci_role"):
                        matrix[display_name] = row["raci_role"]

                    enriched_people.append({
                        "assignment_id": row.get("id"),
                        "user_id": row.get("user_id"),
                        "name": display_name,
                        "email": profile.get("email"),
                        "job_title": profile.get("job_title"),
                        "department": profile.get("department"),
                        "raci_role": row.get("raci_role"),
                        "assignment_type": row.get("assignment_type"),
                        "stage_id": row.get("stage_id"),
                        "workflow_step_id": row.get("workflow_step_id"),
                        "is_required": row.get("is_required"),
                        "due_date": row.get("due_date"),
                    })

                procedures_raci.append({
                    "id": procedure_id,
                    "nom": meta.get("nom") or wf.get("title") or "Sans titre",
                    "people": people,
                    "matrix": matrix,
                    "assignments": enriched_people,
                    "is_finalized": bool(meta.get("finalized_at")),
                    "source": "procedure_assignments",
                })
            else:
                raci = meta.get("raci", {})
                people = raci.get("people", [])
                matrix = _normalize_raci_matrix(raci.get("matrix", {}))
                all_people.update(people)

                procedures_raci.append({
                    "id": procedure_id,
                    "nom": meta.get("nom") or wf.get("title") or "Sans titre",
                    "people": people,
                    "matrix": matrix,
                    "assignments": [],
                    "is_finalized": bool(meta.get("finalized_at")),
                    "source": "metadata_json",
                })

        return {
            "success": True,
            "all_people": sorted(all_people),
            "procedures": procedures_raci,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────
# ENDPOINTS — Cycle de vie
# ─────────────────────────────────────────────────────────────

class LifecycleStageUpdate(BaseModel):
    id: str
    status: str  # pending | in_progress | completed | blocked
    workshop_done: bool = False
    notes: str = ""
    completed_at: Optional[str] = None


class LifecycleUpdate(BaseModel):
    stages: List[LifecycleStageUpdate]


@router.patch("/procedures/{workflow_id}/lifecycle")
async def update_lifecycle(workflow_id: str, body: LifecycleUpdate):
    valid_stage_statuses = {"pending", "in_progress", "completed", "blocked"}
    for s in body.stages:
        if s.status not in valid_stage_statuses:
            raise HTTPException(status_code=400, detail=f"Statut étape invalide: {s.status}")
    try:
        wf = _get_workflow(workflow_id)
        meta = wf.get("procedure_metadata_json") or {}
        existing = {s["id"]: s for s in meta.get("lifecycle_stages", DEFAULT_LIFECYCLE_STAGES)}

        for update in body.stages:
            if update.id in existing:
                existing[update.id]["status"] = update.status
                existing[update.id]["workshop_done"] = update.workshop_done
                existing[update.id]["notes"] = update.notes
                if update.completed_at:
                    existing[update.id]["completed_at"] = update.completed_at
                elif update.status == "completed" and not existing[update.id].get("completed_at"):
                    existing[update.id]["completed_at"] = datetime.utcnow().isoformat()

        meta["lifecycle_stages"] = list(existing.values())
        _update_metadata(workflow_id, meta)
        return {"success": True, "lifecycle_stages": meta["lifecycle_stages"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────
# ENDPOINTS — Finalisation
# ─────────────────────────────────────────────────────────────

@router.get("/evolution")
async def get_evolution():
    """
    Évolution mensuelle des procédures sur les 6 derniers mois.
    Groupé par mois de création, comptage par statut.
    """
    try:
        db = get_supabase()
        result = (
            db.table("workflows")
            .select("id, session_id, version, procedure_metadata_json, created_at")
            .order("created_at", desc=False)
            .execute()
        )

        from collections import defaultdict
        import datetime

        # Garder uniquement la dernière version par session
        seen: Dict[str, Dict] = {}
        for wf in result.data:
            sid = wf["session_id"]
            if sid not in seen or wf["version"] > seen[sid]["version"]:
                seen[sid] = wf

        # Grouper par mois
        months_data: Dict[str, Dict[str, int]] = defaultdict(lambda: {"validated": 0, "inProgress": 0, "pending": 0})
        now = datetime.datetime.utcnow()

        for wf in seen.values():
            created = datetime.datetime.fromisoformat(wf["created_at"].replace("Z", "+00:00"))
            # Filtrer les 6 derniers mois
            diff_months = (now.year - created.year) * 12 + (now.month - created.month)
            if diff_months > 5:
                continue
            month_key = created.strftime("%b")
            status = (wf.get("procedure_metadata_json") or {}).get("status", "Brouillon")
            if status == "Validée":
                months_data[month_key]["validated"] += 1
            elif status in ("En cours", "En validation", "En révision", "Retours reçus"):
                months_data[month_key]["inProgress"] += 1
            else:
                months_data[month_key]["pending"] += 1

        # Construire la liste ordonnée des 6 derniers mois
        evolution = []
        for i in range(5, -1, -1):
            d = now - datetime.timedelta(days=30 * i)
            key = d.strftime("%b")
            evolution.append({
                "month": key,
                "validated": months_data[key]["validated"],
                "inProgress": months_data[key]["inProgress"],
                "pending": months_data[key]["pending"],
            })

        return {"success": True, "evolution": evolution}
    except Exception as e:
        logger.error(f"❌ evolution: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/procedures/{workflow_id}/finalize")
async def finalize_procedure(workflow_id: str):
    try:
        wf = _get_workflow(workflow_id)
        meta = wf.get("procedure_metadata_json") or {}

        if meta.get("finalized_at"):
            raise HTTPException(status_code=400, detail="Cette procédure est déjà finalisée")

        now = datetime.utcnow().isoformat()
        prev_status = meta.get("status")
        meta["finalized_at"] = now
        meta["status"] = "Validée"

        # Advance lifecycle to Publication (stage 5, index 5)
        stages = meta.get("lifecycle_stages", [])
        for i, stage in enumerate(stages):
            if i < 5:
                stage["status"] = "completed"
                if not stage.get("completed_at"):
                    stage["completed_at"] = now
            else:
                stage["status"] = "in_progress"
                stage["completed_at"] = None
        meta["lifecycle_stages"] = stages

        meta["finalized_snapshot"] = {
            "raci": meta.get("raci", {}),
            "lifecycle_stages": meta.get("lifecycle_stages", []),
            "version": wf["version"],
            "finalized_at": now,
        }
        _update_metadata(workflow_id, meta)
        _proc_event(
            procedure_id=workflow_id,
            event_type="procedure_finalized",
            from_status=prev_status,
            to_status="Validée",
            message="Procédure finalisée",
            payload={"version": wf["version"], "finalized_at": now},
        )
        logger.info(f"✅ Procédure finalisée: {workflow_id}")
        return {"success": True, "finalized_at": now}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
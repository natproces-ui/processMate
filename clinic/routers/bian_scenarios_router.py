"""Bibliothèque de procédures de base issues de BIAN (clinic/scripts/bian_scraper.py).

Un utilisateur qui crée une nouvelle procédure peut parcourir cette
bibliothèque et en choisir une comme point de départ — elle est alors
convertie en Table1Row[] et devient une procédure ProcessMate normale
(brouillon, à retravailler), exactement comme l'import PDF existant.
"""
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database.supabase_client import get_supabase, mark_bian_scenario_imported
from routers.orchestration_router import DEFAULT_LIFECYCLE_STAGES, _build_procedure

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bian-scenarios", tags=["BIAN Scenarios"])


@router.get("")
async def list_scenarios(
    category: Optional[str] = None,
    version: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
):
    db = get_supabase()
    query = db.table("bian_scenarios").select(
        "id, version, view_id, title, category, url, status, participants, scraped_at"
    )
    if category:
        query = query.eq("category", category)
    if version:
        query = query.eq("version", version)
    if status:
        query = query.eq("status", status)
    scenarios = query.order("title").execute().data or []

    if q:
        needle = q.strip().lower()
        scenarios = [s for s in scenarios if needle in s["title"].lower()]

    # step count utile pour la liste sans renvoyer tout le détail
    if scenarios:
        ids = [s["id"] for s in scenarios]
        steps_res = db.table("bian_scenarios").select("id, steps").in_("id", ids).execute()
        steps_map = {r["id"]: len(r.get("steps") or []) for r in (steps_res.data or [])}
        for s in scenarios:
            s["steps_count"] = steps_map.get(s["id"], 0)

    categories = sorted({s["category"] for s in scenarios if s.get("category")})
    return {"success": True, "scenarios": scenarios, "total": len(scenarios), "categories": categories}


@router.get("/{scenario_id}")
async def get_scenario(scenario_id: str):
    db = get_supabase()
    res = db.table("bian_scenarios").select("*").eq("id", scenario_id).execute()
    if not res.data:
        raise HTTPException(404, "Scénario introuvable")
    return {"success": True, "scenario": res.data[0]}


def _scenario_to_workflow(scenario: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Convertit un scénario BIAN (participants + steps ordonnées) en Table1Row[].

    Choix de mapping (décision, pas une évidence tirée des données) : BIAN
    n'a pas de notion de rôle humain, seulement des Service Domains — chaque
    étape est donc posée à la fois comme `acteur` (lane) et `outil`, avec le
    participant "to" (celui qui exécute l'action décrite par le message,
    contacté par "from"). L'utilisateur reworke ensuite les lanes vers de
    vrais départements/rôles ; `département` est pré-rempli avec la
    catégorie BIAN pour donner un point de départ.
    """
    category = scenario.get("category") or ""
    steps = scenario.get("steps") or []

    def _row(rid: str, etape: str, type_bpmn: str, acteur: str = "", outil: str = "") -> Dict[str, Any]:
        return {
            "id": rid,
            "étape": etape,
            "typeBpmn": type_bpmn,
            "département": category,
            "acteur": acteur,
            "typeActeur": "",
            "condition": "",
            "outputs": [],
            "outil": outil,
        }

    rows: List[Dict[str, Any]] = []
    start_id = str(uuid.uuid4())
    rows.append(_row(start_id, "Début", "StartEvent"))

    prev_id = start_id
    for step in steps:
        rid = str(uuid.uuid4())
        actor = step.get("to") or step.get("from") or "Système"
        rows.append(_row(rid, step.get("action") or "TBD", "Task", acteur=actor, outil=actor))
        prev = next(r for r in rows if r["id"] == prev_id)
        prev["outputs"] = [{"targetId": rid, "label": ""}]
        prev_id = rid

    end_id = str(uuid.uuid4())
    rows.append(_row(end_id, "Fin", "EndEvent"))
    prev = next(r for r in rows if r["id"] == prev_id)
    prev["outputs"] = [{"targetId": end_id, "label": ""}]

    return rows


class ImportScenarioRequest(BaseModel):
    nom: str
    categorie: Optional[str] = None
    taxonomy_id: Optional[str] = None  # service domain cible ; déduit des participants si absent


def _norm(s: str) -> str:
    import re, unicodedata
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower())


def _resolve_taxonomy_id(scenario: Dict[str, Any]) -> Optional[str]:
    """Service domain de la taxonomie où ranger le scénario : le participant présent
    dans la taxonomie qui apparaît le plus dans les étapes (aucune procédure non classée)."""
    db = get_supabase()
    nodes = db.table("process_taxonomy").select("id, name").eq("level", "subcategory").execute().data or []
    by_name = {_norm(n["name"]): n["id"] for n in nodes}
    weight: Dict[str, int] = {}
    for p in scenario.get("participants") or []:
        weight[p] = weight.get(p, 0)
    for st in scenario.get("steps") or []:
        for p in (st.get("from"), st.get("to")):
            if p:
                weight[p] = weight.get(p, 0) + 1
    for p in sorted(weight, key=lambda p: -weight[p]):
        if _norm(p) in by_name:
            return by_name[_norm(p)]
    return None


@router.post("/{scenario_id}/import")
async def import_scenario(scenario_id: str, body: ImportScenarioRequest):
    if not body.nom.strip():
        raise HTTPException(400, "Le nom est obligatoire")

    db = get_supabase()
    res = db.table("bian_scenarios").select("*").eq("id", scenario_id).execute()
    if not res.data:
        raise HTTPException(404, "Scénario introuvable")
    scenario = res.data[0]

    taxonomy_id = body.taxonomy_id or _resolve_taxonomy_id(scenario)
    if not taxonomy_id:
        raise HTTPException(400, "Aucun service domain de la taxonomie ne correspond à ce scénario : impossible de le classer.")

    workflow_json = _scenario_to_workflow(scenario)

    meta = {
        "nom": body.nom.strip(),
        "ref": "",
        "version": "",
        "category": (body.categorie or scenario.get("category") or "Non classé").strip(),
        "pole": "",
        "direction": "",
        "objet": f"Procédure générée à partir du scénario BIAN « {scenario['title']} » ({scenario['category']}).",
        "definition": "",
        "perimetre": "",
        "proprietaire": "",
        "regles_gestion": [],
        "abbreviations": [],
        "definitions": [],
        "responsabilites_internes": [],
        "responsabilites_externes": [],
        "references": scenario.get("url", ""),
        "status": "Brouillon",
        "lifecycle_stages": [dict(s) for s in DEFAULT_LIFECYCLE_STAGES],
        "raci": {"people": [], "matrix": {}},
        "remarks": [],
        "created_from": "bian_scenario",
        "source_bian_scenario_id": scenario_id,
        "source_bian_view_id": scenario.get("view_id"),
    }

    try:
        session_result = db.table("sessions").insert({"title": body.nom.strip()}).execute()
        if not session_result.data:
            raise HTTPException(500, "Échec création session")
        session_id = session_result.data[0]["id"]

        wf_result = db.table("workflows").insert({
            "session_id": session_id,
            "title": body.nom.strip(),
            "workflow_json": workflow_json,
            "enrichments_json": {},
            "procedure_metadata_json": meta,
            "version": 1,
            "taxonomy_id": taxonomy_id,
        }).execute()
        if not wf_result.data:
            raise HTTPException(500, "Échec création workflow")

        workflow_id = wf_result.data[0]["id"]
        mark_bian_scenario_imported(scenario_id, workflow_id)

        procedure = _build_procedure(wf_result.data[0])
        return {"success": True, "procedure": procedure, "steps_count": len(workflow_json)}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.error(f"❌ import_scenario: {e}", exc_info=True)
        raise HTTPException(500, str(e))

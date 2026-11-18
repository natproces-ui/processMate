"""
Versions de procédure (lot 5) : une version à chaque enregistrement, restauration sans perte.

Activation : VERSIONS_ENABLED=true. Sans le drapeau (ou sans la table), l'enregistrement
d'une procédure fonctionne exactement comme avant : toute erreur ici est journalisée,
jamais remontée.
"""

import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

SOURCES = {"initial", "manuel", "ia", "restauration"}


def enabled() -> bool:
    return os.getenv("VERSIONS_ENABLED", "false").lower() == "true"


def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def split_enrichments(enrichments: Optional[Dict[str, Any]]) -> tuple:
    """Le XML BPMN est rangé dans enrichments_json['__bpmn_xml__'] : on le sépare."""
    enr = dict(enrichments or {})
    xml = enr.pop("__bpmn_xml__", None)
    return enr, xml


def _next_version(procedure_id: str) -> int:
    rows = (_db().table("procedure_versions").select("version").eq("procedure_id", procedure_id)
            .order("version", desc=True).limit(1).execute().data)
    return (rows[0]["version"] + 1) if rows else 1


def add(procedure_id: str, workflow: List[Dict], enrichments: Dict[str, Any], metadata: Dict[str, Any],
        source: str = "manuel", author_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    enr, xml = split_enrichments(enrichments)
    row = {"procedure_id": procedure_id, "version": _next_version(procedure_id), "workflow_json": workflow or [],
           "enrichments_json": enr, "bpmn_xml": xml, "metadata": metadata or {},
           "source": source if source in SOURCES else "manuel"}
    if author_id:
        row["author_id"] = author_id
    return _db().table("procedure_versions").insert(row).execute().data[0]


def record_save(procedure_id: str, before: Dict[str, Any], after: Dict[str, Any], source: str = "manuel",
                author_id: Optional[str] = None) -> None:
    """Appelé par l'enregistrement d'une procédure. Ne lève jamais."""
    if not enabled():
        return
    try:
        has_any = bool(_db().table("procedure_versions").select("id").eq("procedure_id", procedure_id)
                       .limit(1).execute().data)
        if not has_any and before.get("workflow_json"):
            add(procedure_id, before.get("workflow_json") or [], before.get("enrichments_json") or {},
                before.get("procedure_metadata_json") or {}, "initial")
        add(procedure_id, after.get("workflow_json") or [], after.get("enrichments_json") or {},
            after.get("procedure_metadata_json") or {}, source, author_id)
    except Exception as e:
        logger.warning(f"⚠️ Version non enregistrée pour {procedure_id} : {str(e)[:160]}")


def list_versions(procedure_id: str) -> List[Dict[str, Any]]:
    rows = (_db().table("procedure_versions")
            .select("id,version,source,author_id,created_at,workflow_json")
            .eq("procedure_id", procedure_id).order("version", desc=True).execute().data)
    for r in rows:
        r["steps"] = len(r.pop("workflow_json") or [])
    return rows


def get(procedure_id: str, version_id: str) -> Optional[Dict[str, Any]]:
    rows = (_db().table("procedure_versions").select("*")
            .eq("procedure_id", procedure_id).eq("id", version_id).execute().data)
    return rows[0] if rows else None

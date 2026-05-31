"""
Router de génération BPMN
Génère depuis les sources, s'inspire des références pour le style.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
import logging

from processor.multi_doc_processor import MultiDocProcessor
from models.discovery_models import GenerationRequest
from routers.process_discovery import _session_store
from database.supabase_client import ensure_session_exists, save_workflow

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/generation",
    tags=["Process Generation"]
)

processor = MultiDocProcessor()


@router.post("/generate")
async def generate_bpmn(request: GenerationRequest):
    """
    Phase 2 — Génération complète.

    Utilise :
      - src_files (ou discovery_files si pas de src) comme données à extraire
      - ref_files comme modèles de style/formulation
      - instructions manuelles comme contraintes supplémentaires
    """
    session = _session_store.get(request.session_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session introuvable ou expirée. Veuillez relancer l'analyse."
        )

    discovery = session["discovery"]
    selected_card = next(
        (p for p in discovery.processes if p.process_id == request.process_id),
        None
    )

    if not selected_card:
        raise HTTPException(
            status_code=404,
            detail=f"Processus introuvable : {request.process_id}"
        )

    ref_files = session.get("ref_files", [])
    src_files = session.get("src_files", [])
    instructions = session.get("instructions")

    # Si pas de src séparés → les discovery_files sont les sources
    if not src_files:
        src_files = session.get("discovery_files", [])

    logger.info(
        f"⚙️ Génération — '{selected_card.title}' | "
        f"{len(ref_files)} référence(s), {len(src_files)} source(s)"
    )

    try:
        result = await processor.generate_process(
            selected_card=selected_card,
            src_files=src_files,
            ref_files=ref_files,
            instructions=instructions
        )

        # ── Persistance Supabase ──────────────────────────────
        # Chaque processus généré obtient sa propre session Supabase
        # pour qu'il apparaisse comme une entrée indépendante dans la bibliothèque.
        try:
            proc_session_id = f"{request.session_id}_{result.get('process_id', 'p')[:8]}"
            ensure_session_exists(proc_session_id, title=result["title"])
            saved = save_workflow(
                session_id=proc_session_id,
                title=result["title"],
                workflow_json=result["workflow"],
                enrichments_json=result.get("enrichments", {}),
                procedure_metadata_json={
                    **(result.get("procedureMetadata", {})),
                    "process_id": result.get("process_id"),
                    "discovery_session_id": request.session_id,
                    "generation_metadata": result.get("metadata", {}),
                }
            )
            result["workflow_db_id"] = saved["id"]
            logger.info(f"💾 Workflow persisté — id={saved['id']} session={proc_session_id}")
        except Exception as db_err:
            logger.warning(f"⚠️ Sauvegarde DB ignorée : {db_err}")

        return JSONResponse(content=result)

    except ValueError as e:
        logger.error(f"❌ Erreur génération : {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Erreur serveur génération : {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur interne : {str(e)}")


@router.get("/info")
async def get_info():
    return {
        "module": "Process Generation",
        "version": "2.0.0",
        "description": "Génération BPMN avec séparation stricte références/sources",
    }
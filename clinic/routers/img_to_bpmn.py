# routers/img_to_bpmn.py
"""
Router pour l'analyse d'images de workflows et leur conversion en Table1Row[]
+ Amélioration de workflows existants
+ Vérification de qualité d'extraction
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from typing import List
from pydantic import BaseModel
import logging
import json

from processor.img_processor import ImageProcessor

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/img-to-bpmn",
    tags=["Image to BPMN"]
)

class WorkflowImproveRequest(BaseModel):
    workflow: List[dict]

_processor = None

def _get_processor() -> ImageProcessor:
    global _processor
    if _processor is None:
        _processor = ImageProcessor()
    return _processor


@router.post("/analyze")
async def analyze_workflow_image(file: UploadFile = File(...)):
    """
    Analyse une image et extrait workflow + enrichissements + métadonnées procédure
    """
    try:
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Le fichier doit être une image (PNG, JPG, WebP)")

        image_data = await file.read()

        if len(image_data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="L'image ne doit pas dépasser 10MB")

        logger.info(f"📥 Analyse de l'image: {file.filename} ({len(image_data)} bytes)")

        result = await _get_processor().extract_workflow(image_data, file.content_type)

        return JSONResponse(content={
            "success": True,
            "title": result["title"],
            "workflow": result["workflow"],
            "enrichments": result["enrichments"],
            "procedureMetadata": result.get("procedureMetadata", {}),  # ← AJOUTÉ
            "steps_count": len(result["workflow"]),
            "metadata": result["metadata"]
        })

    except ValueError as e:
        logger.error(f"❌ Erreur métier: {str(e)}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Erreur serveur: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur interne: {str(e)}")


@router.post("/improve")
async def improve_workflow(request: WorkflowImproveRequest):
    """Améliore un workflow existant"""
    try:
        if not request.workflow or len(request.workflow) == 0:
            raise HTTPException(status_code=400, detail="Le workflow ne peut pas être vide")

        logger.info(f"🔄 Amélioration d'un workflow de {len(request.workflow)} étapes")

        result = await _get_processor().improve_workflow(request.workflow)

        return JSONResponse(content={
            "success": True,
            "workflow": result["workflow"],
            "steps_count": len(result["workflow"]),
            "metadata": result["metadata"]
        })

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne: {str(e)}")


@router.post("/verify")
async def verify_extraction(file: UploadFile = File(...), workflow: str = Form(...)):
    """Vérifie la qualité de l'extraction"""
    try:
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Le fichier doit être une image")

        image_data = await file.read()

        if len(image_data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="L'image ne doit pas dépasser 10MB")

        try:
            workflow_data = json.loads(workflow)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"JSON invalide: {str(e)}")

        result = await _get_processor().verify_extraction(image_data, file.content_type, workflow_data)

        return JSONResponse(content={"success": True, "verification_result": result})

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne: {str(e)}")


@router.post("/batch-analyze")
async def batch_analyze_workflow_images(files: List[UploadFile] = File(...)):
    """Analyse multiple d'images (max 5)"""
    if len(files) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 images par requête")

    results = []
    total_steps = 0

    for file in files:
        try:
            if not file.content_type or not file.content_type.startswith("image/"):
                results.append({"filename": file.filename, "success": False, "workflow": None, "enrichments": None, "procedureMetadata": None, "error": "Type de fichier invalide"})
                continue

            image_data = await file.read()

            if len(image_data) > 10 * 1024 * 1024:
                results.append({"filename": file.filename, "success": False, "workflow": None, "enrichments": None, "procedureMetadata": None, "error": "Fichier trop volumineux"})
                continue

            result = await _get_processor().extract_workflow(image_data, file.content_type)

            results.append({
                "filename": file.filename,
                "success": True,
                "workflow": result["workflow"],
                "enrichments": result["enrichments"],
                "procedureMetadata": result.get("procedureMetadata", {}),  # ← AJOUTÉ
                "steps_count": len(result["workflow"]),
                "error": None
            })

            total_steps += len(result["workflow"])

        except Exception as e:
            logger.error(f"❌ Erreur pour {file.filename}: {str(e)}")
            results.append({"filename": file.filename, "success": False, "workflow": None, "enrichments": None, "procedureMetadata": None, "error": str(e)})

    return JSONResponse(content={"success": True, "results": results, "total_processed": len(files), "total_steps": total_steps})


@router.get("/info")
async def get_info():
    return {
        "module": "Image to BPMN Converter",
        "version": "1.4.0",
        "status": "active",
        "ai_model": "Gemini 2.5 Flash",
        "features": [
            "✅ Analyse d'images de workflows (tout format de document)",
            "✅ Extraction automatique des formes BPMN",
            "✅ Constitution des métadonnées procédure (NOUVEAU)",
            "✅ Enrichissements documentaires automatiques",
            "✅ Détection des swimlanes et acteurs",
            "✅ Reconnaissance des flux et conditions",
            "✅ Identification des outils métier",
            "✅ Amélioration IA de workflows existants",
            "✅ Vérification de qualité d'extraction"
        ],
        "supported_formats": ["PNG", "JPG", "JPEG", "WebP"],
        "max_file_size": "10MB",
        "procedure_metadata_fields": {
            "nom": "Titre complet du processus",
            "ref": "Référence documentaire",
            "version": "Version du document",
            "objet": "Description synthétique (toujours rempli)",
            "perimeter": "Périmètre déduit du contenu",
            "responsabilites_internes": "Acteurs internes déduits du workflow",
            "responsabilites_externes": "Acteurs externes déduits du workflow",
            "abbreviations": "Abréviations déduites du contexte",
            "definitions": "Définitions constituées depuis le texte",
            "regles_gestion": "Règles métier extraites des conditions",
            "annexe": "Section(s) Annexe(s) recopiée(s) telle(s) quelle(s) si présente(s) dans le document"
        }
    }
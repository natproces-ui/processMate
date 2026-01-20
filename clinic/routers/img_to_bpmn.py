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

# Modèle pour l'amélioration de workflow
class WorkflowImproveRequest(BaseModel):
    workflow: List[dict]

# Instance unique du processeur
processor = ImageProcessor()

@router.post("/analyze")
async def analyze_workflow_image(file: UploadFile = File(...)):
    """
    Analyse une image et extrait workflow + enrichissements
    
    Args:
        file: Image (PNG, JPG, WebP) - Max 10MB
    
    Returns:
        {
            "success": true,
            "title": string,
            "workflow": Table1Row[],
            "enrichments": { "1": {...}, "2": {...} },
            "steps_count": number,
            "metadata": {...}
        }
    """
    try:
        # Validation du type de fichier
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail="Le fichier doit être une image (PNG, JPG, WebP)"
            )
        
        # Lecture des données
        image_data = await file.read()
        
        # Validation de la taille (10MB max)
        if len(image_data) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="L'image ne doit pas dépasser 10MB"
            )
        
        logger.info(f"📥 Analyse de l'image: {file.filename} ({len(image_data)} bytes)")
        
        # Extraction du workflow + enrichissements
        result = await processor.extract_workflow(image_data, file.content_type)
        
        return JSONResponse(content={
            "success": True,
            "title": result["title"],
            "workflow": result["workflow"],
            "enrichments": result["enrichments"],  # 🆕 AJOUTÉ
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
    """
    Améliore un workflow existant avec Gemini 2.5 Flash
    
    Args:
        request: { workflow: Table1Row[] }
    
    Returns:
        {
            "success": true,
            "workflow": Table1Row[] (amélioré),
            "steps_count": number,
            "metadata": {
                "comparison": {...},
                "improvements": {...}
            }
        }
    """
    try:
        if not request.workflow or len(request.workflow) == 0:
            raise HTTPException(
                status_code=400,
                detail="Le workflow ne peut pas être vide"
            )
        
        logger.info(f"🔄 Amélioration d'un workflow de {len(request.workflow)} étapes")
        
        # Amélioration du workflow
        result = await processor.improve_workflow(request.workflow)
        
        return JSONResponse(content={
            "success": True,
            "workflow": result["workflow"],
            "steps_count": len(result["workflow"]),
            "metadata": result["metadata"]
        })
        
    except ValueError as e:
        logger.error(f"❌ Erreur métier: {str(e)}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Erreur serveur: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur interne: {str(e)}")

@router.post("/verify")
async def verify_extraction(
    file: UploadFile = File(...),
    workflow: str = Form(...)
):
    """
    Vérifie la qualité de l'extraction en comparant l'image et le JSON
    
    Args:
        file: Image originale (PNG, JPG, WebP) - Max 10MB
        workflow: JSON stringifié du workflow extrait
    
    Returns:
        {
            "success": true,
            "verification_result": {
                "accuracy": 85.5,
                "total_extracted": 10,
                "total_expected": 12,
                "missing_count": 2,
                "errors": [...]
            }
        }
    """
    try:
        # Validation du type de fichier
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail="Le fichier doit être une image (PNG, JPG, WebP)"
            )
        
        # Lecture de l'image
        image_data = await file.read()
        
        # Validation de la taille
        if len(image_data) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="L'image ne doit pas dépasser 10MB"
            )
        
        # Parse du workflow JSON
        try:
            workflow_data = json.loads(workflow)
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Le workflow doit être un JSON valide: {str(e)}"
            )
        
        logger.info(f"🔍 Vérification: {file.filename} avec {len(workflow_data)} étapes")
        
        # Vérification de l'extraction
        result = await processor.verify_extraction(
            image_data, 
            file.content_type, 
            workflow_data
        )
        
        return JSONResponse(content={
            "success": True,
            "verification_result": result
        })
        
    except ValueError as e:
        logger.error(f"❌ Erreur métier: {str(e)}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Erreur serveur: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur interne: {str(e)}")

@router.post("/batch-analyze")
async def batch_analyze_workflow_images(files: List[UploadFile] = File(...)):
    """
    Analyse multiple d'images de workflows (max 5 images)
    
    Args:
        files: Liste d'images (PNG, JPG, WebP)
    
    Returns:
        {
            "success": true,
            "results": [
                {
                    "filename": string,
                    "success": boolean,
                    "workflow": Table1Row[] | null,
                    "enrichments": {...} | null,
                    "error": string | null
                }
            ],
            "total_processed": number,
            "total_steps": number
        }
    """
    if len(files) > 5:
        raise HTTPException(
            status_code=400,
            detail="Maximum 5 images par requête"
        )
    
    results = []
    total_steps = 0
    
    for file in files:
        try:
            if not file.content_type or not file.content_type.startswith("image/"):
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "workflow": None,
                    "enrichments": None,
                    "error": "Type de fichier invalide"
                })
                continue
            
            image_data = await file.read()
            
            if len(image_data) > 10 * 1024 * 1024:
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "workflow": None,
                    "enrichments": None,
                    "error": "Fichier trop volumineux (>10MB)"
                })
                continue
            
            result = await processor.extract_workflow(image_data, file.content_type)
            
            results.append({
                "filename": file.filename,
                "success": True,
                "workflow": result["workflow"],
                "enrichments": result["enrichments"],  # 🆕 AJOUTÉ
                "steps_count": len(result["workflow"]),
                "error": None
            })
            
            total_steps += len(result["workflow"])
            
        except Exception as e:
            logger.error(f"❌ Erreur pour {file.filename}: {str(e)}")
            results.append({
                "filename": file.filename,
                "success": False,
                "workflow": None,
                "enrichments": None,
                "error": str(e)
            })
    
    return JSONResponse(content={
        "success": True,
        "results": results,
        "total_processed": len(files),
        "total_steps": total_steps
    })


@router.get("/info")
async def get_info():
    """
    Informations sur le module d'analyse d'images
    """
    return {
        "module": "Image to BPMN Converter",
        "version": "1.3.0",  # 🆕 Version incrémentée
        "status": "active",
        "ai_model": "Gemini 2.5 Flash",
        "features": [
            "✅ Analyse d'images de workflows",
            "✅ Extraction automatique des formes BPMN",
            "✅ Enrichissements documentaires automatiques (NOUVEAU)",  # 🆕
            "✅ Détection des swimlanes et acteurs",
            "✅ Reconnaissance des flux et conditions",
            "✅ Identification des outils métier",
            "✅ Amélioration IA de workflows existants",
            "✅ Vérification de qualité d'extraction"
        ],
        "supported_formats": ["PNG", "JPG", "JPEG", "WebP"],
        "max_file_size": "10MB",
        "endpoints": {
            "analyze": {
                "method": "POST",
                "path": "/api/img-to-bpmn/analyze",
                "description": "Upload image → Retourne Table1Row[] + enrichissements"  # 🆕
            },
            "improve": {
                "method": "POST",
                "path": "/api/img-to-bpmn/improve",
                "description": "Améliore un workflow existant"
            },
            "verify": {
                "method": "POST",
                "path": "/api/img-to-bpmn/verify",
                "description": "Vérifie la qualité de l'extraction"
            },
            "batch_analyze": {
                "method": "POST",
                "path": "/api/img-to-bpmn/batch-analyze",
                "description": "Analyse multiple (max 5 images)"
            },
            "info": {
                "method": "GET",
                "path": "/api/img-to-bpmn/info"
            }
        },
        "workflow_format": {
            "id": "string (UUID ou séquentiel)",
            "étape": "string (nom descriptif)",
            "typeBpmn": "StartEvent | Task | ExclusiveGateway | EndEvent",
            "département": "string",
            "acteur": "string",
            "condition": "string (Gateway uniquement)",
            "outputOui": "string (ID suivant)",
            "outputNon": "string (ID alternatif pour Gateway)",
            "outil": "string (système/application)"
        },
        "enrichment_format": {  # 🆕 AJOUTÉ
            "id_tache": "string (ID de la tâche enrichie)",
            "descriptif": "string (100-200 caractères, OBLIGATOIRE)",
            "duree_estimee": "string (ex: '15 min', optionnel)",
            "frequence": "string (ex: 'À la demande', optionnel)",
            "kpi": "string (ex: 'Taux d'erreur < 2%', optionnel)"
        }
    }
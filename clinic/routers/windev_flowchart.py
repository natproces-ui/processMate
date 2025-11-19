"""
Router FastAPI pour la génération de flowcharts WinDev
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from typing import Optional
import json
import os
from pathlib import Path
from dotenv import load_dotenv

from flowcharts.flowchart_generator import FlowchartGenerator

# ✅ Charger le fichier .env
load_dotenv()

router = APIRouter(
    prefix="/api/flowchart",
    tags=["Flowchart Generation"]
)

# ✅ Chargement de la clé API depuis l'environnement
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY non définie dans .env")

# ✅ Instance du générateur
flowchart_gen = FlowchartGenerator(api_key=GOOGLE_API_KEY)


class FlowchartGenerationRequest(BaseModel):
    """Modèle pour génération depuis JSON dans le body"""
    json_data: dict
    output_format: Optional[str] = "png"


@router.post("/generate",
    summary="Générer et visualiser le flowchart",
    description="Génère un flowchart et retourne l'image directement (visualisable + téléchargeable dans Swagger)",
    responses={
        200: {
            "content": {
                "image/png": {},
                "image/svg+xml": {},
                "application/pdf": {}
            },
            "description": "Image du flowchart (s'affiche directement dans Swagger)"
        }
    }
)
async def generate_flowchart_from_upload(
    file: UploadFile = File(..., description="Fichier JSON contenant l'AST WinDev"),
    output_format: str = Query("png", regex="^(png|svg|pdf)$", description="Format de sortie: png (recommandé pour visualisation), svg, ou pdf")
):
    """
    Génère un flowchart à partir d'un fichier JSON uploadé
    
    ✨ L'image s'affiche directement dans Swagger !
    ⬇️ Utilisez le bouton "Download" pour la télécharger
    
    Args:
        file: Fichier JSON contenant l'AST
        output_format: Format de sortie (png recommandé pour visualisation, svg, pdf)
    
    Returns:
        Image du flowchart (affichée et téléchargeable)
    """
    # Vérification du type de fichier
    if not file.filename.endswith('.json'):
        raise HTTPException(
            status_code=400,
            detail="Le fichier doit être au format .json"
        )
    
    # Lecture du fichier
    try:
        content = await file.read()
        json_data = json.loads(content.decode('utf-8'))
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Fichier JSON invalide"
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erreur lors de la lecture du fichier : {str(e)}"
        )
    
    # Génération du flowchart
    try:
        graphviz_code, image_bytes, fmt = flowchart_gen.generate_flowchart(
            json_data=json_data,
            output_format=output_format
        )
        
        # Déterminer le media type
        media_types = {
            "png": "image/png",
            "svg": "image/svg+xml",
            "pdf": "application/pdf"
        }
        
        # Nom du fichier pour le téléchargement
        output_filename = file.filename.replace('.json', f'_flowchart.{fmt}')
        
        # Retourner l'image directement
        # Swagger l'affichera automatiquement ET proposera le téléchargement
        return Response(
            content=image_bytes,
            media_type=media_types[fmt],
            headers={
                "Content-Disposition": f'inline; filename="{output_filename}"'
            }
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la génération : {str(e)}"
        )


@router.post("/generate-from-json",
    summary="Générer flowchart depuis JSON body",
    description="Génère un flowchart depuis des données JSON (retourne l'image directement)"
)
async def generate_flowchart_from_json(request: FlowchartGenerationRequest):
    """
    Génère un flowchart à partir de JSON dans le body de la requête
    
    Args:
        request: JSON data et format souhaité
    
    Returns:
        Image du flowchart
    """
    try:
        graphviz_code, image_bytes, fmt = flowchart_gen.generate_flowchart(
            json_data=request.json_data,
            output_format=request.output_format
        )
        
        media_types = {
            "png": "image/png",
            "svg": "image/svg+xml",
            "pdf": "application/pdf"
        }
        
        return Response(
            content=image_bytes,
            media_type=media_types[fmt],
            headers={
                "Content-Disposition": f'inline; filename="flowchart.{fmt}"'
            }
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la génération : {str(e)}"
        )


@router.post("/generate-dot-only",
    summary="Générer uniquement le code Graphviz",
    description="Génère le code .dot sans compiler l'image (plus rapide, retourne du texte)"
)
async def generate_dot_only(file: UploadFile = File(...)):
    """
    Génère uniquement le code Graphviz .dot (sans compilation)
    Plus rapide si vous voulez juste le code source
    
    Args:
        file: Fichier JSON contenant l'AST
    
    Returns:
        Code .dot en texte brut
    """
    if not file.filename.endswith('.json'):
        raise HTTPException(
            status_code=400,
            detail="Le fichier doit être au format .json"
        )
    
    try:
        content = await file.read()
        json_data = json.loads(content.decode('utf-8'))
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Fichier JSON invalide"
        )
    
    try:
        graphviz_code, _, _ = flowchart_gen.generate_flowchart(
            json_data=json_data,
            output_format="png"  # Format par défaut, image ignorée
        )
        
        # Retourner le code .dot directement comme fichier texte
        return Response(
            content=graphviz_code,
            media_type="text/plain",
            headers={
                "Content-Disposition": f'attachment; filename="{file.filename.replace(".json", "_flowchart.dot")}"'
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la génération : {str(e)}"
        )


@router.get("/formats",
    summary="Formats supportés",
    description="Liste des formats de sortie disponibles"
)
async def get_supported_formats():
    """Retourne les formats de sortie supportés"""
    return {
        "formats": ["png", "svg", "pdf"],
        "default": "png",
        "recommendations": {
            "png": "✅ Recommandé - Visualisation directe dans Swagger + téléchargement",
            "svg": "Vectoriel, éditable, redimensionnable sans perte",
            "pdf": "Idéal pour impression et documentation professionnelle"
        },
        "usage": {
            "visualisation": "Utilisez format=png pour voir l'image directement dans Swagger",
            "telechargement": "Cliquez sur 'Download file' après génération",
            "code_source": "Utilisez /generate-dot-only pour obtenir le code Graphviz"
        }
    }
"""
Router FastAPI pour la génération de flowcharts COBOL
Version adaptée au nouveau générateur métier optimisé
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from typing import Optional
import json
import os
from pathlib import Path
from dotenv import load_dotenv

from flowcharts.cobol_flowchart_generator import CobolFlowchartGenerator
from config import GEMINI_MODEL_FLASH

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

# ✅ Instance du générateur COBOL métier
cobol_flowchart_gen = CobolFlowchartGenerator(api_key=GOOGLE_API_KEY)


class FlowchartGenerationRequest(BaseModel):
    """Modèle pour génération depuis JSON dans le body"""
    json_data: dict
    output_format: Optional[str] = "png"
    level: Optional[str] = "executive"  # Pour COBOL


# ============================================================================
# ENDPOINTS COBOL avec nouveau générateur métier
# ============================================================================

@router.post("/cobol/generate",
    summary="[COBOL] Générer et visualiser le flowchart",
    description="Génère un flowchart COBOL métier optimisé avec traduction technique → métier",
    responses={
        200: {
            "content": {
                "image/png": {},
                "image/svg+xml": {},
                "application/pdf": {}
            },
            "description": "Image du flowchart COBOL métier"
        }
    }
)
async def generate_cobol_flowchart(
    file: UploadFile = File(..., description="Fichier JSON contenant l'AST COBOL au nouveau format"),
    output_format: str = Query("png", regex="^(png|svg|pdf)$", description="Format: png, svg, ou pdf"),
    level: str = Query("executive", regex="^(executive|detailed)$", description="executive (vue globale) ou detailed (détaillé)")
):
    """
    Génère un flowchart COBOL métier à partir d'un fichier JSON uploadé
    
    **🎯 Nouveau format JSON attendu** :
    ```json
    {
      "language": "cobol",
      "ast": {
        "program": "ESCAL130",
        "procedures": [
          {
            "name": "0000-START-TO-FINISH",
            "logic": [...]
          }
        ]
      }
    }
    ```
    
    **✨ Traduction automatique technique → métier** :
    - `1000-VALIDATE-BILL-ELEMENTS` → "Validation des données patient/établissement"
    - `IF PPS-RTC = 00` → "Données valides ?"
    - `COMPUTE H-BUN-BSA` → "Calculer la surface corporelle"
    
    **🎨 Flowchart métier professionnel** :
    - Noms en français clair (pas de code technique brut)
    - Décisions sous forme de questions compréhensibles
    - Groupement des actions similaires
    - Maximum 25 nœuds pour rester lisible
    - Palette de couleurs professionnelle
    
    **📊 Niveaux de détail** :
    - `executive` : Vue globale du flux métier (recommandé)
    - `detailed` : Vue plus détaillée des étapes
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
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erreur lors de la lecture du fichier : {str(e)}"
        )
    
    # Vérification du format JSON (doit contenir "language" et "ast")
    if "language" not in json_data or "ast" not in json_data:
        raise HTTPException(
            status_code=400,
            detail="Format JSON invalide. Attendu : {\"language\": \"cobol\", \"ast\": {...}}"
        )
    
    if json_data.get("language") != "cobol":
        raise HTTPException(
            status_code=400,
            detail="Le JSON ne contient pas un programme COBOL. Le champ 'language' doit être 'cobol'."
        )
    
    # Vérification de la présence des procédures
    ast = json_data.get("ast", {})
    if not ast.get("procedures"):
        raise HTTPException(
            status_code=400,
            detail="Le JSON ne contient aucune procédure. Vérifiez la structure de l'AST."
        )
    
    try:
        graphviz_code, image_bytes, fmt = cobol_flowchart_gen.generate_flowchart(
            json_data=json_data,
            output_format=output_format,
            level=level
        )
        
        media_types = {
            "png": "image/png",
            "svg": "image/svg+xml",
            "pdf": "application/pdf"
        }
        
        program_name = ast.get("program", "unknown")
        output_filename = f"{program_name}_flowchart_{level}.{fmt}"
        
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
            detail=f"Erreur lors de la génération COBOL : {str(e)}"
        )


@router.post("/cobol/generate-from-json",
    summary="[COBOL] Générer depuis JSON body"
)
async def generate_cobol_from_json(request: FlowchartGenerationRequest):
    """
    Génère un flowchart COBOL métier depuis JSON dans le body
    
    **Format JSON attendu** :
    ```json
    {
      "json_data": {
        "language": "cobol",
        "ast": {
          "program": "ESCAL130",
          "procedures": [...]
        }
      },
      "output_format": "png",
      "level": "executive"
    }
    ```
    """
    
    # Vérification du format JSON
    if "language" not in request.json_data or "ast" not in request.json_data:
        raise HTTPException(
            status_code=400,
            detail="Format JSON invalide. Attendu : {\"language\": \"cobol\", \"ast\": {...}}"
        )
    
    if request.json_data.get("language") != "cobol":
        raise HTTPException(
            status_code=400,
            detail="Le JSON ne contient pas un programme COBOL. Le champ 'language' doit être 'cobol'."
        )
    
    # Vérification des procédures
    ast = request.json_data.get("ast", {})
    if not ast.get("procedures"):
        raise HTTPException(
            status_code=400,
            detail="Le JSON ne contient aucune procédure. Vérifiez la structure de l'AST."
        )
    
    try:
        graphviz_code, image_bytes, fmt = cobol_flowchart_gen.generate_flowchart(
            json_data=request.json_data,
            output_format=request.output_format,
            level=request.level or "executive"
        )
        
        media_types = {
            "png": "image/png",
            "svg": "image/svg+xml",
            "pdf": "application/pdf"
        }
        
        program_name = ast.get("program", "cobol_program")
        
        return Response(
            content=image_bytes,
            media_type=media_types[fmt],
            headers={
                "Content-Disposition": f'inline; filename="{program_name}_flowchart.{fmt}"'
            }
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la génération COBOL : {str(e)}"
        )


@router.post("/cobol/generate-dot-only",
    summary="[COBOL] Générer uniquement le code Graphviz"
)
async def generate_cobol_dot_only(
    file: UploadFile = File(...),
    level: str = Query("executive", regex="^(executive|detailed)$")
):
    """
    Génère uniquement le code Graphviz .dot COBOL métier
    
    Utile pour :
    - Éditer manuellement le flowchart
    - Déboguer la génération
    - Intégrer dans d'autres outils
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
    
    # Vérification du format
    if "language" not in json_data or "ast" not in json_data:
        raise HTTPException(
            status_code=400,
            detail="Format JSON invalide. Attendu : {\"language\": \"cobol\", \"ast\": {...}}"
        )
    
    if json_data.get("language") != "cobol":
        raise HTTPException(
            status_code=400,
            detail="Le JSON ne contient pas un programme COBOL."
        )
    
    ast = json_data.get("ast", {})
    if not ast.get("procedures"):
        raise HTTPException(
            status_code=400,
            detail="Le JSON ne contient aucune procédure."
        )
    
    try:
        graphviz_code, _, _ = cobol_flowchart_gen.generate_flowchart(
            json_data=json_data,
            output_format="png",
            level=level
        )
        
        program_name = ast.get("program", "unknown")
        output_filename = f"{program_name}_flowchart_{level}.dot"
        
        return Response(
            content=graphviz_code,
            media_type="text/plain",
            headers={
                "Content-Disposition": f'attachment; filename="{output_filename}"'
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la génération COBOL : {str(e)}"
        )


# ============================================================================
# ENDPOINTS GÉNÉRIQUES
# ============================================================================

@router.get("/formats",
    summary="Formats et options disponibles"
)
async def get_supported_formats():
    """Retourne les formats et options disponibles pour le générateur COBOL métier"""
    return {
        "languages": {
            "cobol": {
                "endpoints": [
                    "/api/flowchart/cobol/generate",
                    "/api/flowchart/cobol/generate-from-json",
                    "/api/flowchart/cobol/generate-dot-only"
                ],
                "description": "Flowcharts métier pour programmes COBOL avec traduction technique → métier",
                "json_format": {
                    "required_fields": ["language", "ast"],
                    "ast_structure": {
                        "program": "Nom du programme (ex: ESCAL130)",
                        "procedures": [
                            {
                                "name": "Nom de la procédure (ex: 0000-START-TO-FINISH)",
                                "logic": [
                                    {
                                        "type": "call | if | compute | initialize | assign",
                                        "target": "Cible de l'appel ou assignation",
                                        "condition": "Condition du IF"
                                    }
                                ]
                            }
                        ]
                    },
                    "example": {
                        "language": "cobol",
                        "ast": {
                            "program": "ESCAL130",
                            "procedures": [
                                {
                                    "name": "0000-START-TO-FINISH",
                                    "logic": [
                                        {"type": "call", "target": "1000-VALIDATE-BILL-ELEMENTS"},
                                        {"type": "if", "condition": "PPS-RTC = 00", "then": [...]}
                                    ]
                                }
                            ]
                        }
                    }
                },
                "levels": {
                    "executive": "Vue globale du flux métier (recommandé pour programmes volumineux)",
                    "detailed": "Vue détaillée avec plus d'étapes"
                },
                "features": {
                    "traduction_metier": "✅ Traduction automatique technique → métier",
                    "exemples": [
                        "1000-VALIDATE-BILL-ELEMENTS → Validation des données patient",
                        "IF PPS-RTC = 00 → Données valides ?",
                        "COMPUTE H-BUN-BSA → Calculer surface corporelle"
                    ],
                    "groupement_actions": "✅ Groupement intelligent des actions similaires",
                    "palette_couleurs": {
                        "debut_fin": "#2E8B57 (vert foncé)",
                        "processus": "#87CEEB (bleu ciel)",
                        "decision": "#FFD700 (jaune)",
                        "calcul": "#DDA0DD (violet clair)",
                        "erreur": "#FFB6C1 (rose)",
                        "succes": "#90EE90 (vert clair)"
                    }
                },
                "improvements": {
                    "v3.0_metier": "🎯 Générateur métier optimisé",
                    "features": [
                        "✅ Traduction complète en français métier",
                        "✅ Questions claires pour les décisions",
                        "✅ Actions concrètes (pas de code brut)",
                        "✅ Contexte métier dialyse/paiement intégré",
                        "✅ Maximum 25 nœuds pour lisibilité",
                        "✅ Gestion robuste des réponses Gemini"
                    ]
                }
            }
        },
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
            "code_source": "Utilisez /generate-dot-only pour obtenir le code Graphviz",
            "edition": "Les fichiers .dot peuvent être édités manuellement"
        },
        "troubleshooting": {
            "json_invalide": {
                "probleme": "Format JSON non reconnu",
                "solution": "Vérifiez la structure : {\"language\": \"cobol\", \"ast\": {\"program\": \"...\", \"procedures\": [...]}}",
                "champs_requis": ["language", "ast", "ast.program", "ast.procedures"]
            },
            "aucune_procedure": {
                "probleme": "Le JSON ne contient aucune procédure",
                "solution": "Assurez-vous que ast.procedures est un tableau non vide",
                "exemple": '{"ast": {"procedures": [{"name": "0000-START", "logic": [...]}]}}'
            },
            "erreur_generation": {
                "probleme": "Erreur lors de la génération du flowchart",
                "solution": "Vérifiez que le JSON est bien formé et contient toute la logique",
                "debug": "Utilisez /generate-dot-only pour voir le code Graphviz généré"
            }
        }
    }


@router.get("/health",
    summary="Vérifier l'état de l'API"
)
async def health_check():
    """Vérifie que l'API et le générateur COBOL métier sont opérationnels"""
    try:
        # Vérifier que les clés API sont configurées
        if not GOOGLE_API_KEY:
            return {
                "status": "error",
                "message": "GOOGLE_API_KEY non configurée",
                "cobol_generator": "❌"
            }
        
        # Vérifier que le générateur est instancié
        cobol_ok = cobol_flowchart_gen is not None
        
        return {
            "status": "ok" if cobol_ok else "degraded",
            "message": "API Flowcharts COBOL métier opérationnelle",
            "generators": {
                "cobol_metier": "✅" if cobol_ok else "❌"
            },
            "api_key_configured": "✅",
            "version": "3.0",
            "model": GEMINI_MODEL_FLASH,
            "capabilities": [
                "✅ Traduction technique → métier",
                "✅ Flowcharts métier professionnels",
                "✅ Support programmes COBOL complexes",
                "✅ Groupement intelligent des actions",
                "✅ Palette de couleurs professionnelle",
                "✅ Gestion robuste des réponses Gemini"
            ],
            "context": {
                "domaine": "Calcul de paiement dialyse (ESRD)",
                "concepts": ["PPS", "Composite Rate", "BSA", "BMI", "Onset", "Comorbidités"]
            }
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "cobol_generator": "❓"
        }
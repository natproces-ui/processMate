"""
API FastAPI complète pour la génération de processus BPMN
- Parser WinDev
- Flowcharts Graphviz
- BPMN depuis documents
- Enrichissement IA
- Image vers Table1Row[] (nouveau flux simplifié)
"""

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import logging
import os

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from config import API_CONFIG, CORS_CONFIG, HTML_FILE, IS_PRODUCTION, FRONTEND_URL, GOOGLE_API_KEY
from routers import parser, windev_flowchart, bpmn, bpmn_ai, img_to_bpmn

app = FastAPI(
    title="BPMN Process Generator API",
    description="API complète pour la génération et l'analyse de processus BPMN",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    **CORS_CONFIG
)

# Logs au démarrage
@app.on_event("startup")
async def startup_event():
    logger.info("=" * 60)
    logger.info("🚀 BPMN Process Generator API Started")
    logger.info(f"📦 Version: 3.0.0")
    logger.info(f"🌍 Environment: {'PRODUCTION' if IS_PRODUCTION else 'DEVELOPMENT'}")
    logger.info(f"🔗 Frontend URL: {FRONTEND_URL}")
    logger.info(f"🔑 Google API Key: {'✅ Configured' if GOOGLE_API_KEY else '❌ Missing'}")
    logger.info("=" * 60)

# Inclusion des routers
app.include_router(parser.router)
app.include_router(windev_flowchart.router)
app.include_router(bpmn.router)
app.include_router(bpmn_ai.router)
app.include_router(img_to_bpmn.router)

@app.head("/")
async def head_root():
    """Support HEAD pour health check Render"""
    return JSONResponse(content={}, status_code=200)

@app.get("/", response_class=HTMLResponse)
async def serve_html():
    """Sert le fichier HTML principal"""
    if not HTML_FILE.exists():
        return HTMLResponse(
            content="<h1>Erreur: index.html non trouvé</h1>",
            status_code=404
        )
    
    with open(HTML_FILE, "r", encoding="utf-8") as f:
        html_content = f.read()
    
    return HTMLResponse(content=html_content)

@app.get("/api")
async def api_root():
    """Documentation complète de l'API"""
    return {
        "title": "BPMN Process Generator API",
        "version": "3.0.0",
        "description": "Génération et analyse de processus métier BPMN avec IA",
        "architecture": {
            "principle": "Le tableau (Table1Row[]) est le point central",
            "workflow": [
                "1. Remplir le tableau via: Image | Vocal | Manuel | Défaut",
                "2. Valider et éditer le tableau",
                "3. Générer le BPMN XML",
                "4. Visualiser avec BPMNViewer"
            ]
        },
        "modules": {
            "img_to_bpmn": {
                "status": "🆕 NOUVEAU - Simplifié",
                "description": "Analyse d'images de workflows → Table1Row[]",
                "endpoints": {
                    "analyze": {
                        "method": "POST",
                        "path": "/api/img-to-bpmn/analyze",
                        "description": "Upload image → Retourne Table1Row[]",
                        "input": "Image (PNG, JPG, WebP) - Max 10MB",
                        "output": {
                            "success": "boolean",
                            "workflow": "Table1Row[]",
                            "steps_count": "number",
                            "metadata": "object"
                        }
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
                "ai_model": "Gemini 2.0 Flash Experimental",
                "features": [
                    "✅ Détection automatique des formes BPMN",
                    "✅ Extraction des swimlanes (acteurs/départements)",
                    "✅ Reconnaissance des flux et conditions",
                    "✅ Identification des outils métier",
                    "✅ Validation et normalisation"
                ]
            },
            "parser": {
                "status": "Actif",
                "description": "Parse du code WinDev legacy",
                "base_path": "/api/parser"
            },
            "flowchart": {
                "status": "Actif",
                "description": "Génération de flowcharts Graphviz",
                "base_path": "/api/flowchart"
            },
            "bpmn": {
                "status": "Actif",
                "description": "Génération BPMN depuis documents",
                "base_path": "/api/bpmn"
            },
            "bpmn_ai": {
                "status": "Actif",
                "description": "Enrichissement IA des tableaux BPMN",
                "base_path": "/api/bpmn-ai"
            }
        },
        "data_model": {
            "Table1Row": {
                "id": "string (UUID ou séquentiel)",
                "étape": "string (nom descriptif de l'action)",
                "typeBpmn": "StartEvent | Task | ExclusiveGateway | EndEvent",
                "département": "string (service/département)",
                "acteur": "string (rôle responsable)",
                "condition": "string (pour Gateway uniquement)",
                "outputOui": "string (ID étape suivante)",
                "outputNon": "string (ID alternatif pour Gateway)",
                "outil": "string (système/application)"
            }
        },
        "frontend_integration": {
            "image_upload": {
                "component": "ImageUploadSection",
                "action": "Upload → Appel /api/img-to-bpmn/analyze → setData(workflow)",
                "result": "Tableau rempli automatiquement"
            },
            "vocal_input": {
                "component": "Voice Recording",
                "action": "Record → Transcription → Ajout au tableau",
                "result": "Lignes ajoutées au tableau existant"
            },
            "manual_edit": {
                "component": "Tableau éditable",
                "action": "Édition directe des cellules",
                "result": "Modifications en temps réel"
            },
            "bpmn_generation": {
                "component": "Generate BPMN Button",
                "action": "generateBPMN(data) → XML",
                "result": "Visualisation via BPMNViewer"
            }
        },
        "best_practices": {
            "image_upload": [
                "Utiliser des captures nettes (PNG recommandé)",
                "Assurer un bon contraste",
                "Vérifier la lisibilité des textes",
                "Limiter à 10MB par image"
            ],
            "workflow_design": [
                "Un StartEvent unique au début",
                "Un ou plusieurs EndEvent",
                "Swimlanes claires pour les acteurs",
                "Conditions explicites sur les Gateways"
            ]
        }
    }

@app.head("/health")
async def head_health():
    """Support HEAD pour health check Render"""
    return JSONResponse(content={}, status_code=200)

@app.get("/health")
async def health_check():
    """Vérification de l'état de l'API"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "3.0.0",
        "environment": "production" if IS_PRODUCTION else "development",
        "frontend_url": FRONTEND_URL,
        "google_api": "configured" if GOOGLE_API_KEY else "missing",
        "service": "BPMN Process Generator API",
        "modules": {
            "parser": "active",
            "flowchart_generator": "active",
            "bpmn_generator": "active",
            "bpmn_ai_enricher": "active",
            "img_to_table_converter": "active ✨"
        },
        "ai_capabilities": {
            "gemini_2_flash": "Analyse d'images de workflows",
            "gemini_pro": "Enrichissement et formalisation BPMN"
        }
    }

@app.get("/api/quick-start")
async def quick_start_guide():
    """Guide de démarrage rapide"""
    return {
        "title": "🚀 Guide de démarrage rapide",
        "steps": [
            {
                "step": 1,
                "title": "Uploader une image de processus",
                "endpoint": "POST /api/img-to-bpmn/analyze",
                "method": "FormData avec clé 'file'",
                "result": "Tableau Table1Row[] rempli automatiquement"
            },
            {
                "step": 2,
                "title": "Éditer le tableau (optionnel)",
                "action": "Modifier les cellules si nécessaire",
                "tools": "Interface web avec édition en temps réel"
            },
            {
                "step": 3,
                "title": "Générer le BPMN",
                "action": "Cliquer sur 'Générer le BPMN'",
                "result": "XML BPMN 2.0 standard visualisable"
            },
            {
                "step": 4,
                "title": "Télécharger le fichier",
                "action": "Bouton 'Télécharger BPMN'",
                "result": "Fichier .bpmn importable dans Camunda, Signavio, etc."
            }
        ],
        "example_curl": {
            "analyze_image": """curl -X POST http://localhost:8002/api/img-to-bpmn/analyze \\
  -F "file=@workflow.png" \\
  -H "Accept: application/json"
            """
        }
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8002))
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=port,
        log_level="info"
    )
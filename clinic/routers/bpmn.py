"""
Router FastAPI pour la génération de processus BPMN depuis documents
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import Response, JSONResponse
from typing import List, Optional
import os
import tempfile
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

from flowcharts.bpmn_generator import BPMNGenerator

load_dotenv()

router = APIRouter(
    prefix="/api/bpmn",
    tags=["BPMN Process Generation"]
)

# Chargement de la clé API
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY non définie dans .env")

# Instance du générateur
bpmn_gen = BPMNGenerator(api_key=GOOGLE_API_KEY)

# Types MIME acceptés
ACCEPTED_MIME_TYPES = {
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'text/plain': '.txt'
}


@router.post("/generate",
    summary="Générer des processus BPMN depuis des documents",
    description="Analyse jusqu'à 6 documents (PDF/Word) et génère des processus BPMN formalisés"
)
async def generate_bpmn_from_documents(
    files: List[UploadFile] = File(..., description="Documents à analyser (PDF, Word, TXT) - Maximum 6 fichiers"),
    output_format: str = Query("json", regex="^(json|xml|both)$", description="Format de sortie: json, xml, ou both")
):
    """
    Génère des processus BPMN à partir de documents métier
    
    🤖 Gemini AI analyse vos documents et formalise automatiquement les processus
    
    Args:
        files: Liste de fichiers (PDF, Word, TXT) - Max 6 fichiers
        output_format: Format de sortie (json, xml, both)
    
    Returns:
        JSON avec les processus BPMN identifiés
    """
    # Validation du nombre de fichiers
    if len(files) == 0:
        raise HTTPException(
            status_code=400,
            detail="Vous devez fournir au moins 1 fichier"
        )
    
    if len(files) > 6:
        raise HTTPException(
            status_code=400,
            detail="Maximum 6 fichiers acceptés"
        )
    
    # Préparer les données des fichiers
    files_data = []
    temp_files = []
    
    try:
        for file in files:
            # Vérifier le type MIME
            mime_type = file.content_type
            if mime_type not in ACCEPTED_MIME_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Type de fichier non supporté: {file.filename}. "
                           f"Formats acceptés: PDF, Word (.doc, .docx), TXT"
                )
            
            # Lire le contenu
            content = await file.read()
            
            # Créer un fichier temporaire pour Gemini
            suffix = ACCEPTED_MIME_TYPES[mime_type]
            temp_file = tempfile.NamedTemporaryFile(
                delete=False,
                suffix=suffix
            )
            temp_file.write(content)
            temp_file.close()
            temp_files.append(temp_file.name)
            
            files_data.append({
                'filename': file.filename,
                'content': content,
                'mime_type': mime_type,
                'temp_path': temp_file.name
            })
        
        # Analyser les documents avec Gemini
        analysis_result = bpmn_gen.analyze_documents(files_data)
        
        # Générer les formats demandés
        result = {
            "success": True,
            "message": f"{len(files)} document(s) analysé(s) avec succès",
            "timestamp": datetime.now().isoformat(),
            "files_analyzed": [f['filename'] for f in files_data]
        }
        
        if output_format in ["json", "both"]:
            bpmn_json = bpmn_gen.generate_bpmn_json(analysis_result)
            bpmn_json["generated_at"] = datetime.now().isoformat()
            result["bpmn_json"] = bpmn_json
        
        if output_format in ["xml", "both"]:
            bpmn_xml = bpmn_gen.generate_bpmn_xml(analysis_result)
            result["bpmn_xml"] = bpmn_xml
        
        # Statistiques
        result["statistics"] = {
            "total_processes": len(analysis_result.get('processes', [])),
            "total_activities": sum(
                len(p.get('activities', [])) 
                for p in analysis_result.get('processes', [])
            ),
            "total_actors": len(set(
                actor['id'] 
                for p in analysis_result.get('processes', [])
                for actor in p.get('actors', [])
            )),
            "complexity": analysis_result.get('insights', {}).get('complexity', 'unknown')
        }
        
        return JSONResponse(content=result)
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la génération BPMN: {str(e)}"
        )
    finally:
        # Nettoyer les fichiers temporaires
        for temp_file in temp_files:
            try:
                os.unlink(temp_file)
            except:
                pass


@router.post("/generate-xml",
    summary="Générer BPMN XML uniquement",
    description="Analyse les documents et retourne uniquement le fichier BPMN XML (téléchargeable)",
    responses={
        200: {
            "content": {"application/xml": {}},
            "description": "Fichier BPMN 2.0 XML"
        }
    }
)
async def generate_bpmn_xml_only(
    files: List[UploadFile] = File(..., description="Documents à analyser - Maximum 6 fichiers")
):
    """
    Génère un fichier BPMN 2.0 XML à partir de documents
    
    ⬇️ Retourne directement le fichier XML (téléchargeable)
    
    Args:
        files: Liste de fichiers (PDF, Word, TXT) - Max 6 fichiers
    
    Returns:
        Fichier BPMN XML
    """
    # Validation
    if len(files) == 0 or len(files) > 6:
        raise HTTPException(
            status_code=400,
            detail="Fournissez entre 1 et 6 fichiers"
        )
    
    files_data = []
    temp_files = []
    
    try:
        # Préparer les fichiers
        for file in files:
            mime_type = file.content_type
            if mime_type not in ACCEPTED_MIME_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Type de fichier non supporté: {file.filename}"
                )
            
            content = await file.read()
            suffix = ACCEPTED_MIME_TYPES[mime_type]
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            temp_file.write(content)
            temp_file.close()
            temp_files.append(temp_file.name)
            
            files_data.append({
                'filename': file.filename,
                'content': content,
                'mime_type': mime_type,
                'temp_path': temp_file.name
            })
        
        # Analyser et générer
        analysis_result = bpmn_gen.analyze_documents(files_data)
        bpmn_xml = bpmn_gen.generate_bpmn_xml(analysis_result)
        
        # Nom du fichier de sortie
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"process_bpmn_{timestamp}.bpmn"
        
        return Response(
            content=bpmn_xml,
            media_type="application/xml",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la génération: {str(e)}"
        )
    finally:
        for temp_file in temp_files:
            try:
                os.unlink(temp_file)
            except:
                pass


@router.get("/formats",
    summary="Formats supportés",
    description="Liste des formats de documents et de sortie supportés"
)
async def get_supported_formats():
    """Retourne les formats supportés"""
    return {
        "input_formats": {
            "pdf": "Documents PDF",
            "docx": "Microsoft Word (format moderne)",
            "doc": "Microsoft Word (format legacy)",
            "txt": "Fichiers texte"
        },
        "output_formats": {
            "json": "Format JSON structuré (facile à parser)",
            "xml": "BPMN 2.0 XML standard (compatible avec les outils BPMN)",
            "both": "JSON + XML dans la même réponse"
        },
        "limitations": {
            "max_files": 6,
            "recommended_file_size": "< 10 MB par fichier",
            "languages": "Tous (Gemini multilingue)"
        },
        "capabilities": [
            "Identification automatique des processus",
            "Extraction des acteurs et rôles",
            "Détection des activités et tâches",
            "Identification des points de décision",
            "Analyse des flux de données",
            "Génération de BPMN 2.0 conforme",
            "Recommandations d'amélioration"
        ]
    }


@router.get("/info",
    summary="Informations sur le générateur BPMN",
    description="Documentation sur l'utilisation du générateur"
)
async def get_bpmn_info():
    """Informations sur le générateur BPMN"""
    return {
        "description": "Générateur de processus BPMN alimenté par Gemini AI",
        "version": "1.0",
        "how_it_works": [
            "1. Uploadez vos documents métier (procédures, spécifications, manuels)",
            "2. Gemini AI analyse le contenu et identifie les processus",
            "3. Les processus sont formalisés en BPMN 2.0",
            "4. Vous recevez un modèle BPMN structuré (JSON/XML)"
        ],
        "use_cases": [
            "Formalisation de procédures métier",
            "Documentation de processus existants",
            "Analyse de workflows",
            "Migration vers des outils BPM",
            "Audit et conformité",
            "Formation et onboarding"
        ],
        "bpmn_elements": {
            "events": "Événements de début, fin, intermédiaires",
            "activities": "Tâches utilisateur, tâches service, scripts",
            "gateways": "Points de décision (exclusif, parallèle, inclusif)",
            "flows": "Flux de séquence avec conditions",
            "actors": "Rôles, utilisateurs, systèmes",
            "data": "Objets de données, inputs/outputs"
        },
        "output_usage": {
            "json": "Intégration API, analyse programmatique",
            "xml": "Import dans Camunda, Bizagi, ARIS, Signavio, etc."
        }
    }
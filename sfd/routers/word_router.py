from fastapi import APIRouter, HTTPException, Body, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from schemas.word_schema import WordGenerationRequest, WordGenerationResponse
from methods.word_methods import generate_word_document, generate_word_bytes
from typing import Dict, Any, Optional
import os
import json
from datetime import datetime

router = APIRouter(
    prefix="/api/word",
    tags=["Génération Word"]
)

# Répertoire de stockage temporaire
OUTPUT_DIR = "./tmp/outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ============================================================================
# ENDPOINT 1: Upload JSON file -> Download Word
# ============================================================================
@router.post("/json-file-to-word-download")
async def json_file_to_word_download(
    json_file: UploadFile = File(..., description="Fichier JSON SFD"),
    format_type: str = Form(..., description="Type de format: 'format1' ou 'format2'"),
    nom_fichier: str = Form(default="SFD_Generated", description="Nom du fichier Word sans extension")
):
    """
    Générer un document Word à partir d'un fichier JSON uploadé
    
    Permet d'uploader un fichier JSON contenant les données SFD
    et retourne directement un fichier Word téléchargeable
    
    Args:
        json_file: Fichier JSON contenant les données SFD
        format_type: Type de format ('format1' ou 'format2')
        nom_fichier: Nom du fichier Word de sortie (sans extension)
        
    Returns:
        FileResponse: Fichier Word téléchargeable
        
    Raises:
        HTTPException: Si erreur lors de la génération
    """
    try:
        # Lire le contenu du fichier JSON
        json_content = await json_file.read()
        sfd_data = json.loads(json_content.decode('utf-8'))
        
        # Générer le fichier Word
        file_path = generate_word_document(
            sfd_data=sfd_data,
            format_type=format_type,
            nom_fichier=nom_fichier
        )
        
        return FileResponse(
            path=file_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=f"{nom_fichier}.docx"
        )
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Le fichier JSON est invalide: {str(e)}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Erreur de validation: {str(e)}")
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Champ requis manquant dans le JSON: {str(e)}")
    except Exception as e:
        import traceback
        error_msg = f"Erreur lors de la génération du document: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)  # Log dans la console
        raise HTTPException(
            status_code=500,
            detail=error_msg
        )


# ============================================================================
# ENDPOINT 2: JSON text -> Direct Word download (in-memory)
# ============================================================================
@router.post("/json-text-to-word-download")
async def json_text_to_word_download(
    json_data: Dict[str, Any] = Body(..., description="Données SFD au format JSON"),
    format_type: str = Body(..., description="Type de format: 'format1' ou 'format2'"),
    nom_fichier: str = Body(default="SFD_Generated", description="Nom du fichier Word sans extension")
):
    """
    Générer un document Word directement à partir de JSON
    
    Permet de copier-coller le JSON directement en tant que body JSON
    et retourne immédiatement un fichier Word téléchargeable sans stockage temporaire
    
    Args:
        json_data: Données SFD au format JSON
        format_type: Type de format ('format1' ou 'format2')
        nom_fichier: Nom du fichier Word de sortie (sans extension)
        
    Returns:
        StreamingResponse: Fichier Word téléchargeable
        
    Exemple de body:
    {
        "json_data": { ... votre JSON SFD complet ... },
        "format_type": "format2",
        "nom_fichier": "Mon_SFD"
    }
        
    Raises:
        HTTPException: Si erreur lors de la génération
    """
    try:
        # Générer le fichier Word en mémoire
        word_bytes = generate_word_bytes(
            sfd_data=json_data,
            format_type=format_type
        )
        
        # Retourner en streaming
        return StreamingResponse(
            iter([word_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={nom_fichier}.docx"}
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la génération du document: {str(e)}"
        )


# ============================================================================
# ENDPOINT 3 (LEGACY): Generate + Download with body request
# ============================================================================
@router.post("/generate", response_model=WordGenerationResponse)
async def generate_word(
    sfd_data: Dict[str, Any] = Body(..., description="Données SFD (Format1 ou Format2)"),
    format_type: str = Body(..., description="Type de format: 'format1' ou 'format2'"),
    nom_fichier: str = Body(default="SFD_Generated", description="Nom du fichier sans extension")
):
    """
    [LEGACY] Générer un document Word à partir de données SFD
    
    Génère et sauvegarde le fichier, puis retourne un objet response avec le chemin
    
    Args:
        sfd_data: Données SFD au format JSON
        format_type: Type de format ('format1' ou 'format2')
        nom_fichier: Nom du fichier de sortie (sans extension)
        
    Returns:
        WordGenerationResponse: Informations sur le fichier généré
        
    Exemple de body:
    {
        "sfd_data": { ... votre JSON SFD ... },
        "format_type": "format1",
        "nom_fichier": "Mon_SFD"
    }
        
    Raises:
        HTTPException: Si erreur lors de la génération
    """
    try:
        file_path = generate_word_document(
            sfd_data=sfd_data,
            format_type=format_type,
            nom_fichier=nom_fichier
        )
        
        return WordGenerationResponse(
            success=True,
            message="Document Word généré avec succès",
            file_path=file_path,
            file_name=f"{nom_fichier}.docx"
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la génération du document: {str(e)}"
        )


# ============================================================================
# ENDPOINT 4: Download a previously generated Word file
# ============================================================================
@router.get("/download/{filename}")
async def download_word(filename: str):
    """
    Télécharger un document Word généré antérieurement
    
    Args:
        filename: Nom du fichier à télécharger (ex: "SFD_Generated.docx")
        
    Returns:
        FileResponse: Fichier Word
        
    Raises:
        HTTPException: Si le fichier n'existe pas
    """
    file_path = os.path.join(OUTPUT_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=404,
            detail=f"Fichier non trouvé: {filename}"
        )
    
    return FileResponse(
        path=file_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename
    )


@router.get("/health")
async def health_check():
    """Vérifier que le service de génération Word fonctionne"""
    return {"status": "healthy", "service": "word_generator"}
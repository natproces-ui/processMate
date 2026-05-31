from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from typing import Optional, Dict, Any
from schemas.format2_schema import Format2SFD
from methods.format2_methods import process_format2_extraction
import json
import os
from datetime import datetime
import uuid

router = APIRouter(
    prefix="/api/format2",
    tags=["Format 2 - SFD Agile"]
)

# Répertoire de stockage temporaire
OUTPUT_DIR = "./tmp/outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)


@router.post("/extract-json", response_model=Format2SFD)
async def extract_json_format2(
    file: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None)
):
    """
    Extraire et générer un SFD au Format 2 - Sortie JSON en réponse (copier directement)
    
    Retourne le JSON directement dans la réponse sans fichier téléchargeable.
    
    Args:
        file: Fichier PDF, Word ou Image (optionnel)
        text: Texte brut (optionnel)
        
    Returns:
        Format2SFD: SFD structuré au format JSON
        
    Raises:
        HTTPException: Si ni fichier ni texte fourni, ou si erreur de traitement
    """
    try:
        if not file and not text:
            raise HTTPException(
                status_code=400,
                detail="Vous devez fournir soit un fichier, soit du texte"
            )
        
        sfd = await process_format2_extraction(file=file, text=text)
        return sfd
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de l'extraction: {str(e)}"
        )


@router.post("/extract-download")
async def extract_download_format2(
    file: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None)
):
    """
    Extraire et générer un SFD au Format 2 - Sortie fichier JSON téléchargeable
    
    Retourne un fichier JSON téléchargeable avec tous les métadonnées SFD.
    
    Args:
        file: Fichier PDF, Word ou Image (optionnel)
        text: Texte brut (optionnel)
        
    Returns:
        FileResponse: Fichier JSON téléchargeable
        
    Raises:
        HTTPException: Si ni fichier ni texte fourni, ou si erreur de traitement
    """
    try:
        if not file and not text:
            raise HTTPException(
                status_code=400,
                detail="Vous devez fournir soit un fichier, soit du texte"
            )
        
        sfd = await process_format2_extraction(file=file, text=text)
        
        # Générer un nom de fichier unique
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{sfd.nom_projet}_format2_{timestamp}.json"
        file_path = os.path.join(OUTPUT_DIR, filename)
        
        # Sauvegarder le JSON
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(sfd.model_dump(), f, ensure_ascii=False, indent=2)
        
        return FileResponse(
            path=file_path,
            media_type="application/json",
            filename=filename
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de l'extraction: {str(e)}"
        )


@router.get("/download-json/{filename}")
async def download_json_format2(filename: str):
    """
    Télécharger un fichier JSON SFD Format 2 sauvegardé
    
    Args:
        filename: Nom du fichier JSON
        
    Returns:
        FileResponse: Fichier JSON
    """
    file_path = os.path.join(OUTPUT_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Fichier non trouvé: {filename}")
    
    return FileResponse(
        path=file_path,
        media_type="application/json",
        filename=filename
    )


@router.get("/health")
async def health_check():
    """Vérifier que le service Format 2 fonctionne"""
    return {"status": "healthy", "format": "format2"}
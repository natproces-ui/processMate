from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
import io
from typing import Dict, Any
from processor.image_processor import processor

router = APIRouter(prefix="/api/mega", tags=["Mega Table"])

@router.post("/process-json")
async def process_image_to_json(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Analyse une image et retourne les données en JSON
    
    Args:
        file: Image du processus (BPMN, flowchart, photo, etc.)
        
    Returns:
        JSON avec les données extraites et les statistiques
    """
    try:
        # Lire le contenu du fichier
        contents = await file.read()
        
        # Traiter l'image
        result = await processor.process_image(contents, file.filename)
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Processing failed"))
        
        return JSONResponse(content=result)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-excel")
async def process_image_to_excel(file: UploadFile = File(...)):
    """
    Analyse une image et retourne un fichier Excel téléchargeable
    
    Args:
        file: Image du processus (BPMN, flowchart, photo, etc.)
        
    Returns:
        Fichier Excel avec les données extraites
    """
    try:
        # Lire le contenu du fichier
        contents = await file.read()
        
        # Traiter l'image
        result = await processor.process_image(contents, file.filename)
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Processing failed"))
        
        # Convertir en Excel
        excel_data = processor.to_excel(result["data"])
        
        # Retourner le fichier Excel
        return StreamingResponse(
            io.BytesIO(excel_data),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=mega_table_{result['timestamp']}.xlsx"
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stats")
async def get_analysis_stats(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Analyse une image et retourne uniquement les statistiques
    
    Args:
        file: Image du processus
        
    Returns:
        Statistiques d'analyse (nombre d'éléments par colonne, etc.)
    """
    try:
        # Lire le contenu du fichier
        contents = await file.read()
        
        # Traiter l'image
        result = await processor.process_image(contents, file.filename)
        
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Processing failed"))
        
        # Retourner uniquement les stats
        return JSONResponse(content={
            "success": True,
            "filename": result["filename"],
            "timestamp": result["timestamp"],
            "stats": result["stats"]
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/info")
async def get_mega_info():
    """Informations sur l'API Mega Table"""
    return {
        "service": "Mega Table Processor",
        "version": "1.0.0",
        "description": "Extrait des données de processus depuis des images (BPMN, flowcharts, photos) vers JSON ou Excel",
        "endpoints": {
            "/process-json": "Upload une image → JSON",
            "/process-excel": "Upload une image → Excel téléchargeable",
            "/stats": "Upload une image → Statistiques d'analyse"
        },
        "supported_formats": ["JPG", "PNG", "JPEG", "BMP", "GIF", "WEBP"],
        "model": "Gemini 2.5 Flash",
        "columns": processor.columns
    }
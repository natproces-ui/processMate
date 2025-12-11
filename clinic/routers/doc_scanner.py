"""
routers/doc_scanner.py
Scanner de documents professionnel - Qualité CamScanner
S'intègre au flux existant: Capture → Scan → Analyse BPMN
"""

from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse
import base64
import logging
from typing import Optional

from processor.scanner import scan_document, ScanResult, ScanMode

router = APIRouter(prefix="/api/scanner", tags=["Document Scanner"])
logger = logging.getLogger(__name__)


@router.post("/scan")
async def scan_document_endpoint(
    file: UploadFile = File(...),
    mode: str = Form(default="clarity"),  # clarity | diagram | auto | document | whiteboard | receipt
    enhance: bool = Form(default=True),
    output_format: str = Form(default="jpeg")  # jpeg | png
):
    """
    Scan un document et retourne l'image redressée + améliorée
    
    Args:
        file: Image capturée (JPEG, PNG, WebP)
        mode: Mode de scan (clarity [défaut], diagram, auto, document, whiteboard, receipt)
        enhance: Appliquer l'amélioration (CLAHE, threshold, sharpen)
        output_format: Format de sortie (jpeg, png)
    
    Returns:
        {
            "success": true,
            "scanned_image": "data:image/jpeg;base64,...",
            "document_detected": true,
            "confidence": 0.95,
            "corners": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]],
            "original_size": [1920, 1080],
            "scanned_size": [2480, 3508]
        }
    """
    
    # Validation
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(400, "Le fichier doit être une image")
    
    try:
        image_bytes = await file.read()
        
        if len(image_bytes) == 0:
            raise HTTPException(400, "Fichier vide")
        
        if len(image_bytes) > 20 * 1024 * 1024:
            raise HTTPException(400, "Fichier trop volumineux (max 20MB)")
        
        logger.info(f"Scanning: {file.filename}, mode={mode}, enhance={enhance}")
        
        # Scan avec OpenCV
        valid_modes = ['clarity', 'diagram', 'auto', 'document', 'whiteboard', 'receipt']
        scan_mode = ScanMode(mode) if mode in valid_modes else ScanMode.CLARITY
        result: ScanResult = scan_document(
            image_bytes, 
            mode=scan_mode,
            enhance=enhance,
            output_format=output_format
        )
        
        if not result.success:
            # Même si pas de document détecté, retourner l'image améliorée
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "scanned_image": f"data:image/{output_format};base64,{base64.b64encode(result.processed_image).decode()}",
                    "document_detected": False,
                    "confidence": result.confidence,
                    "message": "Document non détecté, image améliorée retournée",
                    "original_size": result.original_size,
                    "scanned_size": result.scanned_size
                }
            )
        
        # Encodage base64
        scanned_b64 = base64.b64encode(result.processed_image).decode('utf-8')
        mime = f"image/{output_format}"
        
        logger.info(f"Scan OK: confidence={result.confidence:.2f}, size={result.scanned_size}")
        
        return {
            "success": True,
            "scanned_image": f"data:{mime};base64,{scanned_b64}",
            "document_detected": True,
            "confidence": result.confidence,
            "corners": result.corners.tolist() if result.corners is not None else None,
            "original_size": result.original_size,
            "scanned_size": result.scanned_size
        }
        
    except Exception as e:
        logger.error(f"Scan error: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Erreur scanning: {str(e)}")


@router.post("/scan-and-analyze")
async def scan_and_analyze_endpoint(
    file: UploadFile = File(...),
    mode: str = Form(default="auto"),
    enhance: bool = Form(default=True)
):
    """
    Pipeline complet: Scan → Amélioration → Analyse BPMN
    Endpoint combiné pour le frontend CameraScanSection
    
    Retourne à la fois l'image scannée ET le workflow extrait
    """
    import httpx
    from config import API_CONFIG
    
    # Validation
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(400, "Le fichier doit être une image")
    
    try:
        image_bytes = await file.read()
        
        if len(image_bytes) == 0:
            raise HTTPException(400, "Fichier vide")
        
        logger.info(f"Scan+Analyze: {file.filename}")
        
        # Étape 1: Scanner le document
        scan_mode = ScanMode(mode) if mode in ['auto', 'document', 'whiteboard', 'receipt'] else ScanMode.AUTO
        scan_result = scan_document(image_bytes, mode=scan_mode, enhance=enhance)
        
        # Utiliser l'image scannée (ou originale améliorée si pas de document)
        processed_bytes = scan_result.processed_image
        
        # Étape 2: Analyser avec img-to-bpmn (appel interne)
        from routers.img_to_bpmn import analyze_image_internal
        
        analysis_result = await analyze_image_internal(processed_bytes)
        
        # Combiner les résultats
        scanned_b64 = base64.b64encode(processed_bytes).decode('utf-8')
        
        return {
            "success": analysis_result.get("success", False),
            "workflow": analysis_result.get("workflow", []),
            "steps_count": analysis_result.get("steps_count", 0),
            "scanned_image": f"data:image/jpeg;base64,{scanned_b64}",
            "document_detected": scan_result.success,
            "scan_confidence": scan_result.confidence,
            "metadata": {
                "original_size": scan_result.original_size,
                "scanned_size": scan_result.scanned_size,
                "scan_mode": mode,
                "enhanced": enhance
            }
        }
        
    except Exception as e:
        logger.error(f"Scan+Analyze error: {str(e)}", exc_info=True)
        raise HTTPException(500, f"Erreur: {str(e)}")


@router.get("/info")
async def scanner_info():
    """Informations sur le module scanner"""
    return {
        "name": "Document Scanner Pro",
        "version": "1.0.0",
        "quality": "CamScanner / Adobe Scan level",
        "endpoints": {
            "/api/scanner/scan": "Scan seul (retourne image redressée)",
            "/api/scanner/scan-and-analyze": "Scan + Analyse BPMN combinés"
        },
        "modes": {
            "clarity": "⚡ RECOMMANDÉ - Clarté maximale pour caméras faibles",
            "diagram": "Optimisé pour diagrammes BPMN/workflows (amélioration douce)",
            "auto": "Détection automatique du type de document",
            "document": "Optimisé pour documents texte (contrat, facture)",
            "whiteboard": "Optimisé pour tableaux blancs/paper",
            "receipt": "Optimisé pour tickets/reçus"
        },
        "features": [
            "Détection automatique des bords",
            "Correction perspective 4 points",
            "Amélioration contraste (CLAHE)",
            "Binarisation adaptative",
            "Sharpening pour texte net",
            "Suppression des ombres"
        ],
        "supported_formats": ["JPEG", "PNG", "WebP"],
        "max_file_size": "20MB",
        "output_quality": "JPEG 95% ou PNG"
    }
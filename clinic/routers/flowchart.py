# backend/routers/flowchart.py

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
import json
import io
from config import FLOWCHARTS_DIR, FLOWCHART_PATTERNS

router = APIRouter(prefix="", tags=["flowchart"])

# ============================================
# LOGIQUE DE DÉTECTION
# ============================================

async def validate_json_file(file: UploadFile) -> dict:
    """
    Valide qu'un fichier est un JSON valide
    
    Args:
        file: Fichier uploadé
        
    Returns:
        Contenu du JSON parsé
        
    Raises:
        HTTPException: Si le fichier n'est pas un JSON valide
    """
    if not file.filename.endswith('.json'):
        raise HTTPException(
            status_code=400,
            detail="Le fichier doit être un fichier JSON (.json)"
        )
    
    try:
        content = await file.read()
        return json.loads(content.decode('utf-8'))
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Le fichier n'est pas un JSON valide"
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erreur lors de la lecture du fichier: {str(e)}"
        )

def detect_flowchart_type(filename: str) -> tuple:
    """
    Détecte le type de flowchart basé sur le nom du fichier
    
    Args:
        filename: Nom du fichier JSON
        
    Returns:
        Tuple (detected_type, base_filename) ou (None, None) si non détecté
    """
    filename_lower = filename.lower()
    
    for pattern_key, base_name in FLOWCHART_PATTERNS.items():
        if pattern_key in filename_lower:
            return pattern_key, base_name
    
    return None, None

def get_flowchart_path(filename: str, extension: str):
    """
    Récupère le chemin du flowchart basé sur le nom du fichier JSON
    
    Args:
        filename: Nom du fichier JSON uploadé
        extension: Extension du fichier recherché (.png ou .dot)
        
    Returns:
        Tuple (flowchart_path, detected_type, flowchart_filename)
        
    Raises:
        HTTPException: Si le type n'est pas détecté ou si le fichier n'existe pas
    """
    detected_type, base_name = detect_flowchart_type(filename)
    
    if not detected_type:
        raise HTTPException(
            status_code=404,
            detail={
                "message": "Fichier non pris en charge",
                "filename": filename,
                "reason": f"Le nom du fichier ne contient ni {' ni '.join(FLOWCHART_PATTERNS.keys())}",
                "supported_patterns": list(FLOWCHART_PATTERNS.keys())
            }
        )
    
    flowchart_filename = f"{base_name}{extension}"
    flowchart_path = FLOWCHARTS_DIR / flowchart_filename
    
    # Vérifier si le dossier existe
    if not FLOWCHARTS_DIR.exists():
        raise HTTPException(
            status_code=404,
            detail={
                "message": "Dossier des flowcharts introuvable",
                "expected_directory": str(FLOWCHARTS_DIR),
                "solution": "Vérifiez que le chemin du dossier est correct dans le code"
            }
        )
    
    # Vérifier si le fichier existe
    if not flowchart_path.exists():
        available_files = [f.name for f in FLOWCHARTS_DIR.glob(f"*{extension}")]
        
        raise HTTPException(
            status_code=404,
            detail={
                "message": f"Flowchart non trouvé ({extension})",
                "detected_type": detected_type,
                "expected_file": flowchart_filename,
                "path": str(flowchart_path),
                "directory": str(FLOWCHARTS_DIR),
                "available_files": available_files
            }
        )
    
    return flowchart_path, detected_type, flowchart_filename

# ============================================
# ROUTES
# ============================================

@router.post("/get-flowchart")
async def get_flowchart(file: UploadFile = File(...)):
    """
    Upload un fichier JSON et récupère l'image flowchart correspondante
    
    - **file**: Fichier JSON (le nom du fichier est analysé pour trouver le flowchart)
    
    Returns:
        Image PNG du flowchart correspondant
        
    Détection automatique:
        - Si le nom contient "cpt" → retourne cpt_flowchart.png
        - Si le nom contient "gar" → retourne gar_flowchart.png
        - Sinon → erreur "Fichier non pris en charge"
    """
    # Valider le JSON
    await validate_json_file(file)
    
    # Récupérer le chemin du flowchart PNG
    flowchart_path, detected_type, flowchart_filename = get_flowchart_path(
        file.filename, 
        ".png"
    )
    
    # Retourner l'image
    return FileResponse(
        path=flowchart_path,
        media_type="image/png",
        filename=flowchart_filename,
        headers={
            "Content-Disposition": f"inline; filename={flowchart_filename}"
        }
    )

@router.post("/get-flowchart-editable")
async def get_flowchart_editable(file: UploadFile = File(...)):
    """
    Upload un fichier JSON et récupère le code source .dot éditable du flowchart
    
    - **file**: Fichier JSON (le nom du fichier est analysé pour trouver le flowchart)
    
    Returns:
        Fichier .dot (source Graphviz) éditable
        
    Détection automatique:
        - Si le nom contient "cpt" → retourne cpt_flowchart.dot
        - Si le nom contient "gar" → retourne gar_flowchart.dot
        - Sinon → erreur "Fichier non pris en charge"
    """
    # Valider le JSON
    await validate_json_file(file)
    
    # Récupérer le chemin du flowchart DOT
    flowchart_path, detected_type, flowchart_filename = get_flowchart_path(
        file.filename, 
        ".dot"
    )
    
    # Lire et retourner le contenu du fichier .dot
    try:
        with open(flowchart_path, 'r', encoding='utf-8') as f:
            dot_content = f.read()
        
        # Vérifier que le contenu n'est pas vide
        if not dot_content.strip():
            raise HTTPException(
                status_code=500,
                detail={
                    "message": "Le fichier .dot est vide",
                    "file": flowchart_filename,
                    "path": str(flowchart_path)
                }
            )
        
        return StreamingResponse(
            io.BytesIO(dot_content.encode('utf-8')),
            media_type="text/plain",
            headers={
                "Content-Disposition": f"inline; filename={flowchart_filename}",
                "Content-Type": "text/plain; charset=utf-8"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la lecture du fichier .dot: {str(e)}"
        )

@router.get("/list-flowcharts")
async def list_flowcharts():
    """
    Liste tous les flowcharts disponibles dans le dossier
    
    Returns:
        Liste des flowcharts disponibles avec leurs noms de fichiers JSON correspondants
    """
    if not FLOWCHARTS_DIR.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Le dossier des flowcharts n'existe pas: {FLOWCHARTS_DIR}"
        )
    
    flowcharts = []
    for flowchart_file in FLOWCHARTS_DIR.glob("*_flowchart.png"):
        # Extraire le nom de base
        base_name = flowchart_file.stem.replace('_flowchart', '')
        
        # Vérifier si le .dot existe aussi
        dot_file = FLOWCHARTS_DIR / f"{base_name}_flowchart.dot"
        
        flowcharts.append({
            "flowchart_file": flowchart_file.name,
            "dot_file": dot_file.name if dot_file.exists() else None,
            "json_file_expected": f"{base_name}_ast.json",
            "base_name": base_name,
            "has_editable": dot_file.exists()
        })
    
    return {
        "flowcharts_directory": str(FLOWCHARTS_DIR),
        "total_flowcharts": len(flowcharts),
        "flowcharts": flowcharts
    }
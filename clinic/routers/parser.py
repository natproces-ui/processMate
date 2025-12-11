from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from datetime import datetime
import json
import io
from parsers.windev_parser import parse_windev_code
from parsers.cobol_parser import parse_cobol_code
from config import ALLOWED_EXTENSIONS

router = APIRouter(prefix="/api/parser", tags=["parser"])

async def read_file_content(file: UploadFile) -> str:
    """
    Lit et décode le contenu d'un fichier uploadé
    
    Args:
        file: Fichier uploadé
        
    Returns:
        Contenu du fichier en string UTF-8
        
    Raises:
        HTTPException: Si erreur de lecture ou d'encodage
    """
    try:
        content = await file.read()
        return content.decode('utf-8')
    except UnicodeDecodeError:
        try:
            content = await file.read()
            return content.decode('latin-1')
        except:
            raise HTTPException(
                status_code=400,
                detail="Le fichier doit être encodé en UTF-8 ou Latin-1"
            )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erreur lors de la lecture du fichier: {str(e)}"
        )

def validate_file_extension(filename: str, allowed_extensions: list = None):
    """
    Valide l'extension d'un fichier (optionnel, informatif uniquement)
    
    Args:
        filename: Nom du fichier
        allowed_extensions: Liste des extensions autorisées
    """
    if allowed_extensions is None:
        allowed_extensions = ALLOWED_EXTENSIONS
    
    if "." in filename:
        file_ext = "." + filename.rsplit(".", 1)[1].lower()
        return file_ext in allowed_extensions
    return False

def create_ast_statistics(ast_dict: dict, filename: str = None, file_size: int = None) -> dict:
    """
    Crée un dictionnaire de statistiques enrichies à partir d'un AST
    
    Args:
        ast_dict: Dictionnaire AST parsé
        filename: Nom du fichier source (optionnel)
        file_size: Taille du fichier (optionnel)
        
    Returns:
        Dictionnaire de statistiques enrichies
    """
    metadata = ast_dict.get("metadata", {})
    
    stats = {
        "total_lines": metadata.get("total_lines", 0),
        "root_type": ast_dict.get("type"),
        "statement_count": len(ast_dict.get("children", [])),
        "procedures_count": metadata.get("procedures_count", 0),
        "global_variables_count": len(metadata.get("global_variables", [])),
        "functions_called_count": len(metadata.get("functions_called", [])),
        "parsed_at": datetime.now().isoformat()
    }
    
    if filename:
        stats["filename"] = filename
    if file_size is not None:
        stats["file_size"] = file_size
    
    return stats

def extract_business_info(ast_dict: dict) -> dict:
    """
    Extrait TOUTES les informations métier de l'AST en parcourant récursivement
    
    Args:
        ast_dict: Dictionnaire AST parsé
        
    Returns:
        Dictionnaire contenant les infos métier complètes
    """
    metadata = ast_dict.get("metadata", {})
    
    business_info = {
        "global_variables": set(metadata.get("global_variables", [])),
        "functions_called": set(metadata.get("functions_called", [])),
        "procedures": [],
        "api_calls": set(),
        "business_functions": set(),
        "data_structures": [],
        "chain_accesses": [],
        "compound_assignments": 0,
        "conditionals": 0,
        "loops": 0,
        "database_tables": set()
    }
    
    def traverse(node, depth=0):
        """Parcours récursif de TOUT l'AST"""
        if not isinstance(node, dict):
            return
        
        node_type = node.get("type")
        node_value = node.get("value")
        node_metadata = node.get("metadata", {})
        
        if node_type == "Procedure":
            business_info["procedures"].append({
                "name": node_value,
                "parameters": node_metadata.get("parameters", []),
                "body_statements": node_metadata.get("body_statements", 0)
            })
        
        elif node_type == "FunctionCall":
            func_name = node_value
            business_info["functions_called"].add(func_name)
            
            if node_metadata.get("is_api_call"):
                business_info["api_calls"].add(func_name)
            
            if node_metadata.get("is_business_function") or func_name.startswith('_') or func_name.startswith('fct'):
                business_info["business_functions"].add(func_name)
        
        elif node_type == "DialogCall":
            business_info["functions_called"].add("Dialogue")
        
        elif node_type == "VariableDeclaration":
            if node_metadata.get("is_associative_array"):
                business_info["data_structures"].append({
                    "name": node_value,
                    "type": node_metadata.get("var_type")
                })
        
        elif node_type == "ChainAccess":
            chain_info = {
                "variable": node_value,
                "depth": node_metadata.get("depth", 0),
                "access_chain": node_metadata.get("access_chain", [])
            }
            business_info["chain_accesses"].append(chain_info)
            
            if node_metadata.get("is_global"):
                business_info["global_variables"].add(node_value)
        
        elif node_type == "GlobalVariable":
            business_info["global_variables"].add(node_value)
        
        elif node_type == "ArrayAccess":
            if node_metadata.get("is_global"):
                business_info["global_variables"].add(node_value)
        
        elif node_type == "CompoundAssignment":
            business_info["compound_assignments"] += 1
        
        elif node_type == "IfStatement":
            business_info["conditionals"] += 1
        
        elif node_type == "ForLoop":
            business_info["loops"] += 1
        
        elif node_type == "Literal":
            if node_metadata.get("literal_type") == "string":
                literal_value = node_value.strip('"')
                if literal_value.isupper() and '_' in literal_value:
                    if any(keyword in literal_value for keyword in ['TIERS', 'TABLE', 'EVE', 'COMPTE']):
                        business_info["database_tables"].add(literal_value)
        
        for child in node.get("children", []):
            traverse(child, depth + 1)
    
    traverse(ast_dict)
    
    business_info["global_variables"] = sorted(list(business_info["global_variables"]))
    business_info["functions_called"] = sorted(list(business_info["functions_called"]))
    business_info["api_calls"] = sorted(list(business_info["api_calls"]))
    business_info["business_functions"] = sorted(list(business_info["business_functions"]))
    business_info["database_tables"] = sorted(list(business_info["database_tables"]))
    
    return business_info

# ============================================================================
# ENDPOINTS WINDEV (existants - non modifiés)
# ============================================================================

@router.post("/parse")
async def parse_file(file: UploadFile = File(...)):
    """
    Parse un fichier WinDev et retourne l'AST JSON enrichi
    
    - **file**: Fichier contenant du code WinDev (.wl, .swift, etc.)
    
    Returns:
        - JSON contenant l'AST complet
        - Statistiques détaillées sur le parsing
        - Informations métier extraites
    """
    code = await read_file_content(file)
    
    try:
        ast_dict = parse_windev_code(code)
        
        content_bytes = code.encode('utf-8')
        stats = create_ast_statistics(
            ast_dict, 
            filename=file.filename, 
            file_size=len(content_bytes)
        )
        
        business_info = extract_business_info(ast_dict)
        
        return JSONResponse(
            content={
                "success": True,
                "statistics": stats,
                "business_info": business_info,
                "ast": ast_dict
            },
            status_code=200
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors du parsing: {str(e)}"
        )

@router.post("/parse-text")
async def parse_text(request_body: dict):
    """
    Parse du code WinDev envoyé directement dans le body de la requête
    
    - **code**: String contenant du code WinDev
    
    Example:
    ```json
    {
        "code": "PROCÉDURE MaFonction()\\n\\tRENVOYER Vrai\\nFIN"
    }
    ```
    """
    code = request_body.get("code")
    
    if not code:
        raise HTTPException(
            status_code=400,
            detail="Le champ 'code' est requis dans le body"
        )
    
    try:
        ast_dict = parse_windev_code(code)
        stats = create_ast_statistics(ast_dict)
        business_info = extract_business_info(ast_dict)
        
        return JSONResponse(
            content={
                "success": True,
                "statistics": stats,
                "business_info": business_info,
                "ast": ast_dict
            },
            status_code=200
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors du parsing: {str(e)}"
        )

@router.post("/parse-download")
async def parse_and_download(file: UploadFile = File(...)):
    """
    Parse un fichier WinDev et retourne le JSON en téléchargement direct
    
    - **file**: Fichier contenant du code WinDev
    
    Returns:
        Fichier JSON téléchargeable avec l'AST complet
    """
    code = await read_file_content(file)
    
    try:
        ast_dict = parse_windev_code(code)
        business_info = extract_business_info(ast_dict)
        
        result = {
            "ast": ast_dict,
            "business_info": business_info,
            "generated_at": datetime.now().isoformat()
        }
        
        json_str = json.dumps(result, ensure_ascii=False, indent=2)
        json_bytes = json_str.encode('utf-8')
        
        original_name = file.filename.rsplit(".", 1)[0] if "." in file.filename else file.filename
        download_filename = f"{original_name}_ast.json"
        
        return StreamingResponse(
            io.BytesIO(json_bytes),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename={download_filename}"
            }
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors du parsing: {str(e)}"
        )

@router.post("/analyze")
async def analyze_code(file: UploadFile = File(...)):
    """
    Analyse approfondie du code WinDev pour extraire uniquement les infos métier
    
    - **file**: Fichier contenant du code WinDev
    
    Returns:
        - Informations métier structurées
        - Flux d'exécution
        - Dépendances
    """
    code = await read_file_content(file)
    
    try:
        ast_dict = parse_windev_code(code)
        business_info = extract_business_info(ast_dict)
        stats = create_ast_statistics(ast_dict, filename=file.filename)
        
        return JSONResponse(
            content={
                "success": True,
                "file_info": {
                    "filename": file.filename,
                    "total_lines": stats["total_lines"],
                    "procedures_count": stats["procedures_count"]
                },
                "business_logic": {
                    "global_variables": business_info["global_variables"],
                    "functions_called": business_info["functions_called"],
                    "api_calls": business_info["api_calls"],
                    "business_functions": business_info["business_functions"],
                    "procedures": business_info["procedures"],
                    "data_structures": business_info["data_structures"],
                    "database_tables": business_info["database_tables"]
                },
                "complexity_metrics": {
                    "global_variables": len(business_info["global_variables"]),
                    "function_calls": len(business_info["functions_called"]),
                    "api_calls": len(business_info["api_calls"]),
                    "business_functions": len(business_info["business_functions"]),
                    "conditionals": business_info["conditionals"],
                    "loops": business_info["loops"],
                    "compound_assignments": business_info["compound_assignments"],
                    "chain_accesses": len(business_info["chain_accesses"]),
                    "total_statements": stats["statement_count"]
                }
            },
            status_code=200
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de l'analyse: {str(e)}"
        )

# ============================================================================
# ENDPOINTS COBOL (nouveaux - ajoutés)
# ============================================================================

@router.post("/cobol/parse")
async def parse_cobol_file(file: UploadFile = File(...)):
    """
    Parse un fichier COBOL et retourne l'AST JSON structuré
    
    - **file**: Fichier contenant du code COBOL (.cob, .cbl, .cobol, .cpy)
    
    Returns:
        JSON contenant l'AST complet du programme COBOL avec :
        - identification_division (PROGRAM-ID, AUTHOR, etc.)
        - environment_division (CONFIGURATION, INPUT-OUTPUT)
        - data_division (FILE, WORKING-STORAGE, LINKAGE)
        - procedure_division (paragraphes avec statements)
    """
    code = await read_file_content(file)
    
    try:
        ast_dict = parse_cobol_code(code)
        
        return JSONResponse(
            content={
                "success": True,
                "language": "cobol",
                "ast": ast_dict
            },
            status_code=200
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors du parsing COBOL: {str(e)}"
        )

@router.post("/cobol/parse-text")
async def parse_cobol_text(request_body: dict):
    """
    Parse du code COBOL envoyé directement dans le body de la requête
    
    - **code**: String contenant du code COBOL
    
    Example:
    ```json
    {
        "code": "IDENTIFICATION DIVISION.\\nPROGRAM-ID. TEST.\\nPROCEDURE DIVISION.\\n0000-START.\\n    DISPLAY 'HELLO'.\\n    STOP RUN."
    }
    ```
    """
    code = request_body.get("code")
    
    if not code:
        raise HTTPException(
            status_code=400,
            detail="Le champ 'code' est requis dans le body"
        )
    
    try:
        ast_dict = parse_cobol_code(code)
        
        return JSONResponse(
            content={
                "success": True,
                "language": "cobol",
                "ast": ast_dict
            },
            status_code=200
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors du parsing COBOL: {str(e)}"
        )

@router.post("/cobol/parse-download")
async def parse_cobol_and_download(file: UploadFile = File(...)):
    """
    Parse un fichier COBOL et retourne le JSON en téléchargement direct
    
    - **file**: Fichier contenant du code COBOL
    
    Returns:
        Fichier JSON téléchargeable avec l'AST complet
    """
    code = await read_file_content(file)
    
    try:
        ast_dict = parse_cobol_code(code)
        
        result = {
            "language": "cobol",
            "ast": ast_dict,
            "generated_at": datetime.now().isoformat()
        }
        
        json_str = json.dumps(result, ensure_ascii=False, indent=2)
        json_bytes = json_str.encode('utf-8')
        
        original_name = file.filename.rsplit(".", 1)[0] if "." in file.filename else file.filename
        download_filename = f"{original_name}_cobol_ast.json"
        
        return StreamingResponse(
            io.BytesIO(json_bytes),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename={download_filename}"
            }
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors du parsing COBOL: {str(e)}"
        )
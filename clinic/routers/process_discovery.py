"""
Router de découverte des processus
Upload multi-fichiers → Analyse → Retourne les ProcessCards

Logique de rôle :
  - ref_files : fichiers de référence (style, formulation) — NON analysés pour la découverte
  - src_files : fichiers sources (données réelles) — analysés pour la découverte
  - Si seuls ref_files fournis (sans src_files) → tous traités comme sources
  - Si seuls src_files fournis → comportement normal
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from typing import List, Optional
import logging
import uuid

from processor.multi_doc_processor import MultiDocProcessor
from models.discovery_models import DiscoveryResult

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/discovery",
    tags=["Process Discovery"]
)

_session_store: dict = {}

_processor = None

def _get_processor() -> MultiDocProcessor:
    global _processor
    if _processor is None:
        _processor = MultiDocProcessor()
    return _processor

ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "image/png": "image",
    "image/jpeg": "image",
    "image/jpg": "image",
    "image/webp": "image",
}

MAX_FILE_SIZE = 20 * 1024 * 1024
MAX_FILES = 10


def _prepare_file(file_obj, prepared: list) -> dict:
    """Valide et prépare un fichier uploadé."""
    content_type = file_obj.content_type or ""
    file_type = ALLOWED_TYPES.get(content_type)

    if not file_type and file_obj.filename:
        ext = file_obj.filename.lower().rsplit(".", 1)[-1]
        file_type = {"pdf": "pdf", "png": "image", "jpg": "image", "jpeg": "image", "webp": "image"}.get(ext)

    if not file_type:
        raise HTTPException(
            status_code=400,
            detail=f"Format non supporté : {file_obj.filename}. Formats acceptés : PDF, PNG, JPG, WebP"
        )

    return file_type


@router.post("/analyze")
async def analyze_documents(
    ref_files: List[UploadFile] = File(default=[]),
    src_files: List[UploadFile] = File(default=[]),
    instructions: Optional[str] = Form(None)
):
    """
    Phase 1 — Analyse des fichiers sources uniquement.
    Les fichiers de référence sont stockés en session pour la phase de génération.

    - ref_files : modèles de style/formulation → stockés, pas analysés pour la découverte
    - src_files : données du processus → analysés pour identifier les processus
    - instructions : contraintes supplémentaires optionnelles
    """
    total = len(ref_files) + len(src_files)

    if total == 0:
        raise HTTPException(status_code=400, detail="Au moins un fichier requis")
    if total > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_FILES} fichiers au total")

    # ── Préparer les fichiers de référence ───────────────────
    prepared_refs = []
    for f in ref_files:
        file_type = _prepare_file(f, prepared_refs)
        data = await f.read()
        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"Fichier trop volumineux : {f.filename} (max 20MB)")
        if len(data) == 0:
            raise HTTPException(status_code=400, detail=f"Fichier vide : {f.filename}")
        prepared_refs.append({
            "file_id": str(uuid.uuid4()),
            "filename": f.filename or f"ref_{len(prepared_refs)+1}",
            "data": data,
            "type": file_type,
            "size": len(data),
            "role": "reference"
        })
        logger.info(f"📚 Référence reçue : {f.filename} ({len(data)} bytes, {file_type})")

    # ── Préparer les fichiers sources ─────────────────────────
    prepared_srcs = []
    for f in src_files:
        file_type = _prepare_file(f, prepared_srcs)
        data = await f.read()
        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"Fichier trop volumineux : {f.filename} (max 20MB)")
        if len(data) == 0:
            raise HTTPException(status_code=400, detail=f"Fichier vide : {f.filename}")
        prepared_srcs.append({
            "file_id": str(uuid.uuid4()),
            "filename": f.filename or f"src_{len(prepared_srcs)+1}",
            "data": data,
            "type": file_type,
            "size": len(data),
            "role": "source"
        })
        logger.info(f"📄 Source reçue : {f.filename} ({len(data)} bytes, {file_type})")

    # ── Si pas de sources → tous les fichiers sont sources ───
    # (cas où l'utilisateur n'utilise qu'une seule zone)
    discovery_files = prepared_srcs if prepared_srcs else prepared_refs

    logger.info(
        f"🔍 Découverte — {len(prepared_refs)} référence(s), {len(prepared_srcs)} source(s) — "
        f"analyse sur {len(discovery_files)} fichier(s)"
    )

    try:
        result: DiscoveryResult = await _get_processor().discover_processes(
            files=discovery_files,
            instructions=instructions
        )

        # Stocker refs + srcs séparément en session
        _session_store[result.session_id] = {
            "ref_files": prepared_refs,
            "src_files": prepared_srcs if prepared_srcs else [],
            "discovery_files": discovery_files,
            "discovery": result,
            "instructions": instructions
        }

        logger.info(f"✅ Session {result.session_id} : {len(result.processes)} processus détectés")

        return JSONResponse(content={
            "success": True,
            "session_id": result.session_id,
            "processes": [
                {
                    "process_id": p.process_id,
                    "title": p.title,
                    "description": p.description,
                    "sources": [
                        {
                            "file_id": s.file_id,
                            "filename": s.filename,
                            "source_type": s.source_type.value
                        }
                        for s in p.sources
                    ],
                    "confidence": p.confidence,
                    "estimated_steps": p.estimated_steps,
                    "category": p.category.value
                }
                for p in result.processes
            ],
            "total_files_analyzed": result.total_files_analyzed,
            "warnings": result.warnings
        })

    except ValueError as e:
        logger.error(f"❌ Erreur découverte : {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Erreur serveur découverte : {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur interne : {str(e)}")


@router.get("/session/{session_id}")
async def get_session_info(session_id: str):
    session = _session_store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable ou expirée")
    discovery = session["discovery"]
    return {
        "session_id": session_id,
        "ref_files": [{"filename": f["filename"], "type": f["type"]} for f in session["ref_files"]],
        "src_files": [{"filename": f["filename"], "type": f["type"]} for f in session["src_files"]],
        "processes_count": len(discovery.processes)
    }


@router.post("/chat")
async def chat_correction(payload: dict):
    """Phase 1b — Correction des processus détectés via message utilisateur."""
    session_id = payload.get("session_id")
    message = payload.get("message", "").strip()
    current_cards_raw = payload.get("current_cards", [])

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id requis")
    if not message:
        raise HTTPException(status_code=400, detail="message requis")

    session = _session_store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable ou expirée")

    from models.discovery_models import ProcessCard as PC, SourceReference, SourceType, ProcessCategory

    current_cards = []
    for c in current_cards_raw:
        sources = [
            SourceReference(
                file_id=s["file_id"],
                filename=s["filename"],
                source_type=SourceType(s["source_type"])
            )
            for s in c.get("sources", [])
        ]
        category = ProcessCategory.INSTRUCTED if c.get("category") == "instructed" else ProcessCategory.DISCOVERED
        current_cards.append(PC(
            process_id=c["process_id"],
            title=c["title"],
            description=c["description"],
            sources=sources,
            confidence=c.get("confidence", 70),
            estimated_steps=c.get("estimated_steps"),
            category=category
        ))

    try:
        result: DiscoveryResult = await _get_processor().chat_correction(
            files=session["discovery_files"],
            current_cards=current_cards,
            user_message=message
        )

        _session_store[session_id]["discovery"] = result

        return JSONResponse(content={
            "success": True,
            "session_id": session_id,
            "processes": [
                {
                    "process_id": p.process_id,
                    "title": p.title,
                    "description": p.description,
                    "sources": [
                        {"file_id": s.file_id, "filename": s.filename, "source_type": s.source_type.value}
                        for s in p.sources
                    ],
                    "confidence": p.confidence,
                    "estimated_steps": p.estimated_steps,
                    "category": p.category.value
                }
                for p in result.processes
            ],
            "warnings": result.warnings
        })

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Erreur chat correction : {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur interne : {str(e)}")


# ─────────────────────────────────────────────────────────────
# ENDPOINT — Découverte depuis flowchart de code source
# ─────────────────────────────────────────────────────────────

from pydantic import BaseModel
from typing import Dict, Any

class CodeDiscoveryRequest(BaseModel):
    dot_source: str
    business_info: Dict[str, Any] = {}
    statistics: Dict[str, Any] = {}
    instructions: Optional[str] = None


@router.post("/analyze-code")
async def analyze_code_flowchart(body: CodeDiscoveryRequest):
    """
    Découverte de processus depuis un flowchart de code source (DOT + métadonnées).
    Même pipeline que /analyze mais avec un prompt adapté au code.
    """
    if not body.dot_source.strip():
        raise HTTPException(status_code=400, detail="Le flowchart DOT est requis")

    logger.info(f"🔍 Découverte code — DOT {len(body.dot_source)} chars, "
                f"{len(body.business_info.get('procedures', []))} procédures")

    try:
        from prompts.discovery_code_prompt import get_code_discovery_prompt
        from models.discovery_models import DiscoveryResult, ProcessCard, SourceReference, SourceType, ProcessCategory

        prompt = get_code_discovery_prompt(
            dot_source=body.dot_source,
            business_info=body.business_info,
            instructions=body.instructions,
        )

        processor = _get_processor()

        import asyncio
        async def _task(model_name: str):
            model = processor.model_manager.get_model(model_name)
            response = await asyncio.wait_for(
                asyncio.to_thread(model.generate_content, model=model_name, contents=[prompt]),
                timeout=90,
            )
            return response

        result = await processor.model_manager.execute_with_fallback(_task, task_name="Découverte code source")
        if not result["success"]:
            raise ValueError(result["message"])

        discovery_data = processor._parse_discovery_response(result["result"].text)

        session_id = str(uuid.uuid4())
        process_cards = []
        for idx, p in enumerate(discovery_data.get("processes", [])):
            process_cards.append(ProcessCard(
                process_id=str(uuid.uuid4()),
                title=p.get("title", f"Processus {idx + 1}"),
                description=p.get("description", ""),
                sources=[SourceReference(
                    file_id="flowchart",
                    filename="flowchart_source",
                    source_type=SourceType.IMAGE,
                )],
                confidence=p.get("confidence", 70),
                estimated_steps=p.get("estimated_steps"),
                category=ProcessCategory.DISCOVERED,
            ))

        discovery_result = DiscoveryResult(
            session_id=session_id,
            processes=process_cards,
            total_files_analyzed=1,
            warnings=discovery_data.get("warnings", []),
        )

        # Stocker en session pour la phase génération
        # On crée un fichier virtuel avec le DOT pour que generate_process puisse le traiter
        _session_store[session_id] = {
            "ref_files": [],
            "src_files": [],
            "discovery_files": [{
                "file_id": "flowchart",
                "filename": "flowchart_source",
                "data": body.dot_source.encode("utf-8"),
                "type": "text",
                "size": len(body.dot_source),
                "role": "source",
            }],
            "discovery": discovery_result,
            "code_context": {
                "dot_source": body.dot_source,
                "business_info": body.business_info,
                "statistics": body.statistics,
            },
            "instructions": body.instructions,
        }

        logger.info(f"✅ Découverte code : {len(process_cards)} processus détectés")

        return {
            "success": True,
            "session_id": session_id,
            "processes": [
                {
                    "process_id": p.process_id,
                    "title": p.title,
                    "description": p.description,
                    "sources": [{"file_id": s.file_id, "filename": s.filename, "source_type": s.source_type.value} for s in p.sources],
                    "confidence": p.confidence,
                    "estimated_steps": p.estimated_steps,
                    "category": p.category.value,
                }
                for p in process_cards
            ],
            "warnings": discovery_data.get("warnings", []),
        }

    except ValueError as e:
        logger.error(f"❌ Erreur découverte code : {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Erreur serveur découverte code : {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur interne : {str(e)}")
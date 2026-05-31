"""
Router FastAPI pour le chat ProcessMate
Endpoints : sessions, messages
"""

import logging
import json
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from typing import List, Optional
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


# ─────────────────────────────────────────────────────────────
# SESSION
# ─────────────────────────────────────────────────────────────

@router.post("/session")
async def create_session():
    """Crée une nouvelle session de chat"""
    try:
        from database.supabase_client import create_session
        session = create_session()
        return {"success": True, "session": session}
    except Exception as e:
        logger.warning(f"Supabase indisponible, session locale : {e}")
        session_id = str(uuid.uuid4())
        return {"success": True, "session": {"id": session_id, "title": "Nouvelle session"}}


@router.get("/sessions")
async def list_sessions():
    """Liste les sessions récentes"""
    try:
        from database.supabase_client import list_sessions as db_list_sessions
        sessions = db_list_sessions()
        return {"success": True, "sessions": sessions}
    except Exception as e:
        logger.warning(f"Impossible de récupérer les sessions : {e}")
        return {"success": True, "sessions": []}


# ─────────────────────────────────────────────────────────────
# MESSAGE
# ─────────────────────────────────────────────────────────────

@router.post("/message")
async def send_message(
    session_id: str = Form(...),
    message: str = Form(...),
    current_workflow: Optional[str] = Form(None),
    history: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[])
):
    """Traite un message utilisateur et génère un workflow"""
    from processor.chat_processor import ChatProcessor

    try:
        processor = ChatProcessor()

        # Historique de conversation
        history_list = []
        if history:
            try:
                history_list = json.loads(history)
            except Exception:
                pass

        # Fichiers uploadés
        file_contents = []
        for f in files:
            content = await f.read()
            file_contents.append({
                "filename": f.filename,
                "content": content,
                "content_type": f.content_type,
                "type": "pdf" if (f.content_type == "application/pdf" or (f.filename or "").endswith(".pdf")) else "image"
            })

        # Workflow existant
        existing_workflow = None
        if current_workflow:
            try:
                existing_workflow = json.loads(current_workflow)
            except Exception:
                pass

        # Traitement
        result = await processor.process_message(
            message=message,
            files=file_contents,
            history=history_list,
            current_workflow=existing_workflow
        )

        intent = result.get("intent")

        # Sauvegarde Supabase
        try:
            from database.supabase_client import save_message, save_workflow, ensure_session_exists
            ensure_session_exists(session_id)

            # Le message user est toujours sauvegardé
            save_message(session_id, "user", message)

            # La réponse assistant est sauvegardée selon l'intent
            if intent == "explain":
                save_message(session_id, "assistant", result.get("answer", ""))

            elif intent == "clarify":
                save_message(session_id, "assistant", result.get("clarify_question", ""))

            elif intent == "patch":
                save_message(session_id, "assistant", result.get("explanation", ""))

            elif result.get("workflow"):
                # generate / regen / transcribe / web_search
                save_workflow(
                    session_id=session_id,
                    title=result.get("title", ""),
                    workflow_json=result["workflow"],
                    enrichments_json=result.get("enrichments", {}),
                    procedure_metadata_json=result.get("procedureMetadata", {})
                )

        except Exception as db_err:
            logger.warning(f"Sauvegarde Supabase ignorée : {db_err}")

        return JSONResponse(content=result)

    except Exception as e:
        logger.error(f"Erreur traitement message : {e}")
        raise HTTPException(status_code=500, detail=str(e))
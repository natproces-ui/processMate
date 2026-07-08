# database/supabase_client.py
"""
Client Supabase pour ProcessMate
Gère : sessions, messages, fichiers, workflows
"""

import os
import sys
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime
import httpx
from supabase import create_client, Client, ClientOptions

logger = logging.getLogger(__name__)


_supabase_client: Optional[Client] = None


def _make_httpx_client() -> httpx.Client:
    """Return an httpx.Client, disabling SSL verify on Windows dev when certs are missing."""
    if sys.platform == "win32" and os.getenv("IS_PRODUCTION", "false").lower() != "true":
        return httpx.Client(verify=False)
    return httpx.Client()


def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise ValueError("SUPABASE_URL et SUPABASE_SERVICE_KEY sont requis")
        _supabase_client = create_client(
            url, key,
            options=ClientOptions(httpx_client=_make_httpx_client()),
        )
        logger.info("✅ Client Supabase initialisé")
    return _supabase_client


# ─────────────────────────────────────────────────────────────
# SESSIONS
# ─────────────────────────────────────────────────────────────

def create_session(title: Optional[str] = None) -> Dict[str, Any]:
    """Crée une nouvelle session de chat"""
    db = get_supabase()
    data = {"title": title or "Nouvelle session"}
    result = db.table("sessions").insert(data).execute()
    session = result.data[0]
    logger.info(f"✅ Session créée : {session['id']}")
    return session


def ensure_session_exists(session_id: str, title: Optional[str] = None) -> Dict[str, Any]:
    """S'assure qu'une session existe, la crée si nécessaire"""
    db = get_supabase()
    
    # Vérifier si la session existe
    existing = db.table("sessions").select("*").eq("id", session_id).execute()
    if existing.data:
        return existing.data[0]
    
    # Créer la session si elle n'existe pas
    data = {
        "id": session_id,
        "title": title or "Nouvelle session"
    }
    result = db.table("sessions").insert(data).execute()
    session = result.data[0]
    logger.info(f"✅ Session créée : {session['id']}")
    return session


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Récupère une session par ID"""
    db = get_supabase()
    result = db.table("sessions").select("*").eq("id", session_id).execute()
    return result.data[0] if result.data else None


def update_session_title(session_id: str, title: str) -> None:
    """Met à jour le titre d'une session"""
    db = get_supabase()
    db.table("sessions").update({"title": title}).eq("id", session_id).execute()


def list_sessions(limit: int = 20) -> List[Dict[str, Any]]:
    """Liste les sessions les plus récentes"""
    db = get_supabase()
    result = (
        db.table("sessions")
        .select("*")
        .order("updated_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


# ─────────────────────────────────────────────────────────────
# MESSAGES
# ─────────────────────────────────────────────────────────────

def save_message(
    session_id: str,
    role: str,
    content: str
) -> Dict[str, Any]:
    """Sauvegarde un message (role: 'user' ou 'assistant')"""
    db = get_supabase()
    data = {
        "session_id": session_id,
        "role": role,
        "content": content
    }
    result = db.table("messages").insert(data).execute()
    return result.data[0]


def get_session_messages(session_id: str) -> List[Dict[str, Any]]:
    """Récupère tous les messages d'une session, triés par date"""
    db = get_supabase()
    result = (
        db.table("messages")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data


# ─────────────────────────────────────────────────────────────
# FICHIERS
# ─────────────────────────────────────────────────────────────

def save_file_reference(
    session_id: str,
    filename: str,
    file_type: str,
    storage_path: str,
    size_bytes: Optional[int] = None
) -> Dict[str, Any]:
    """Enregistre la référence d'un fichier uploadé"""
    db = get_supabase()
    data = {
        "session_id": session_id,
        "filename": filename,
        "file_type": file_type,
        "storage_path": storage_path,
        "size_bytes": size_bytes
    }
    result = db.table("files").insert(data).execute()
    return result.data[0]


def upload_file_to_storage(
    session_id: str,
    filename: str,
    file_data: bytes,
    file_type: str
) -> str:
    """
    Upload un fichier dans le bucket Supabase Storage.
    Retourne le storage_path.
    """
    db = get_supabase()
    storage_path = f"{session_id}/{filename}"

    mime = "application/pdf" if file_type == "pdf" else "image/png"

    db.storage.from_("processmate-files").upload(
        path=storage_path,
        file=file_data,
        file_options={"content-type": mime}
    )

    logger.info(f"📁 Fichier uploadé : {storage_path}")
    return storage_path


def get_session_files(session_id: str) -> List[Dict[str, Any]]:
    """Récupère les références de fichiers d'une session"""
    db = get_supabase()
    result = (
        db.table("files")
        .select("*")
        .eq("session_id", session_id)
        .execute()
    )
    return result.data


def download_file_from_storage(storage_path: str) -> bytes:
    """Télécharge un fichier depuis le bucket"""
    db = get_supabase()
    data = db.storage.from_("processmate-files").download(storage_path)
    return data


# ─────────────────────────────────────────────────────────────
# WORKFLOWS
# ─────────────────────────────────────────────────────────────

def save_workflow(
    session_id: str,
    title: str,
    workflow_json: List[Dict],
    enrichments_json: Dict,
    procedure_metadata_json: Dict,
    message_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sauvegarde un workflow généré.
    Calcule automatiquement la version (dernière + 1).
    """
    db = get_supabase()

    # Calcul version
    existing = (
        db.table("workflows")
        .select("version")
        .eq("session_id", session_id)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    version = (existing.data[0]["version"] + 1) if existing.data else 1

    data = {
        "session_id": session_id,
        "message_id": message_id,
        "title": title,
        "workflow_json": workflow_json,
        "enrichments_json": enrichments_json,
        "procedure_metadata_json": procedure_metadata_json,
        "version": version
    }

    result = db.table("workflows").insert(data).execute()
    workflow = result.data[0]
    logger.info(f"💾 Workflow v{version} sauvegardé — session {session_id}")
    return workflow


def get_latest_workflow(session_id: str) -> Optional[Dict[str, Any]]:
    """Récupère le dernier workflow d'une session"""
    db = get_supabase()
    result = (
        db.table("workflows")
        .select("*")
        .eq("session_id", session_id)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_workflow_history(session_id: str) -> List[Dict[str, Any]]:
    """Récupère tout l'historique des workflows d'une session"""
    db = get_supabase()
    result = (
        db.table("workflows")
        .select("id, session_id, message_id, title, version, created_at")
        .eq("session_id", session_id)
        .order("version", desc=False)
        .execute()
    )
    return result.data


def get_workflow_by_version(session_id: str, version: int) -> Optional[Dict[str, Any]]:
    """Récupère un workflow spécifique par version"""
    db = get_supabase()
    result = (
        db.table("workflows")
        .select("*")
        .eq("session_id", session_id)
        .eq("version", version)
        .execute()
    )
    return result.data[0] if result.data else None
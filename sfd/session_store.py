"""
session_store.py — Gestion des sessions SFD en mémoire.
Chaque session conserve le SFD courant, les sources originales et l'historique de chat.
"""

import asyncio
from typing import Dict, Optional
from datetime import datetime

from schemas.schema import SFDDocument
from themes import DEFAULT_THEME          # ← LIGNE AJOUTÉE


class SFDSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.sfd: Optional[SFDDocument] = None

        # Sources originales conservées pour re-consultation par l'agent chat
        self.sources: dict = {
            "docs_content": [],     # output de extract_files_content()
            "urls": [],             # URLs explorées
            "description": "",
            "project_name": "",
            "client": "",
        }

        self.chat_history: list = []        # [{role, content, timestamp}]
        self.sections_status: dict = {}     # {section: "draft" | "validated"}
        self.progress_queue: asyncio.Queue = asyncio.Queue()
        self.created_at: datetime = datetime.now()
        self.updated_at: datetime = datetime.now()
        self.style: str = DEFAULT_THEME     # ← LIGNE AJOUTÉE


# Store global en mémoire
_sessions: Dict[str, SFDSession] = {}


def create_session(session_id: str) -> SFDSession:
    session = SFDSession(session_id)
    _sessions[session_id] = session
    return session


def get_session(session_id: str) -> Optional[SFDSession]:
    return _sessions.get(session_id)


def update_sfd(session_id: str, sfd: SFDDocument) -> None:
    if session_id in _sessions:
        _sessions[session_id].sfd = sfd
        _sessions[session_id].updated_at = datetime.now()


def add_chat_message(session_id: str, role: str, content: str) -> None:
    if session_id in _sessions:
        _sessions[session_id].chat_history.append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat(),
        })
        _sessions[session_id].updated_at = datetime.now()


def set_section_status(session_id: str, section: str, status: str) -> None:
    """status : 'draft' | 'validated'"""
    if session_id in _sessions:
        _sessions[session_id].sections_status[section] = status


def delete_session(session_id: str) -> None:
    _sessions.pop(session_id, None)


def list_sessions() -> list:
    return list(_sessions.keys())
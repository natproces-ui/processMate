"""
Limites du mode invité (personne non connectée).

Un invité peut formaliser une première procédure, mais avec des limites pour maîtriser
le coût : taille et nombre de fichiers, pages, messages et générations par jour, pas de
niveau Approfondi. Rien n'est enregistré pour lui.

Les compteurs vivent dans la table Supabase `guest_usage` (clinic/database/
guest_usage_schema.sql), partagée entre les instances du backend. Si la table n'existe
pas encore ou si la base ne répond pas, repli sur un compteur en mémoire.

Activation : GUEST_LIMITS_ENABLED=true. Tant que le drapeau est éteint, aucun compte
n'est fait et le comportement reste celui d'avant (à activer une fois le frontend qui
envoie le jeton déployé, sinon les utilisateurs connectés seraient traités en invités).
"""

import hashlib
import logging
import os
import re
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class GuestLimits:
    enabled: bool
    max_files: int
    max_file_mb: int
    max_pages: int
    turns_per_day: int
    generations_per_day: int


def load_limits() -> GuestLimits:
    return GuestLimits(
        enabled=os.getenv("GUEST_LIMITS_ENABLED", "false").lower() == "true",
        max_files=_env_int("GUEST_MAX_FILES", 1),
        max_file_mb=_env_int("GUEST_MAX_FILE_MB", 5),
        max_pages=_env_int("GUEST_MAX_PAGES", 15),
        turns_per_day=_env_int("GUEST_TURNS_PER_DAY", 10),
        generations_per_day=_env_int("GUEST_GENERATIONS_PER_DAY", 2),
    )


class GuestLimitError(Exception):
    """Limite atteinte : message en français, affiché tel quel à l'invité (HTTP 429 ou 413)."""

    def __init__(self, message: str, status: int = 429):
        super().__init__(message)
        self.status = status


SIGNUP_HINT = " Créez un compte gratuit pour continuer sans ces limites et conserver votre travail."


# ── Identité de l'invité ─────────────────────────────────────────

def client_ip(headers, fallback: Optional[str]) -> str:
    """IP réelle derrière le proxy de DigitalOcean : premier élément de X-Forwarded-For."""
    fwd = headers.get("x-forwarded-for") or headers.get("X-Forwarded-For") or ""
    first = fwd.split(",")[0].strip()
    return first or (fallback or "inconnue")


def guest_keys(device_id: Optional[str], ip: str) -> Tuple[str, ...]:
    """On compte à la fois par appareil et par IP : vider le navigateur ne suffit pas."""
    keys = []
    if device_id and re.fullmatch(r"[A-Za-z0-9-]{8,64}", device_id):
        keys.append("dev:" + device_id)
    keys.append("ip:" + hashlib.sha256(ip.encode()).hexdigest()[:32])  # pas d'IP en clair en base
    return tuple(keys)


# ── Compteurs ────────────────────────────────────────────────────

_memory: Dict[Tuple[str, str], Dict[str, int]] = {}
_lock = threading.Lock()


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _read_db(day: str, key: str) -> Optional[Dict[str, int]]:
    from database.supabase_client import get_supabase
    rows = get_supabase().table("guest_usage").select("turns,generations").eq("day", day).eq("key", key).execute().data
    return rows[0] if rows else {"turns": 0, "generations": 0}


def _write_db(day: str, key: str, counts: Dict[str, int]) -> None:
    from database.supabase_client import get_supabase
    get_supabase().table("guest_usage").upsert({"day": day, "key": key, **counts}, on_conflict="day,key").execute()


def _get(day: str, key: str) -> Dict[str, int]:
    try:
        return _read_db(day, key)
    except Exception as e:
        logger.debug(f"guest_usage indisponible, compteur mémoire : {str(e)[:100]}")
        with _lock:
            return dict(_memory.get((day, key), {"turns": 0, "generations": 0}))


def _put(day: str, key: str, counts: Dict[str, int]) -> None:
    with _lock:
        if len(_memory) > 20000:
            _memory.clear()
        _memory[(day, key)] = dict(counts)
    try:
        _write_db(day, key, counts)
    except Exception:
        pass  # le compteur mémoire suffit en repli


def consume(keys: Tuple[str, ...], kind: str, limits: Optional[GuestLimits] = None) -> None:
    """Compte un message (kind='turns') ou une génération (kind='generations').

    Lève GuestLimitError si la limite du jour est atteinte pour l'une des clés.
    """
    limits = limits or load_limits()
    if not limits.enabled:
        return
    cap = limits.turns_per_day if kind == "turns" else limits.generations_per_day
    day = _today()
    current = {k: _get(day, k) for k in keys}
    if any(c.get(kind, 0) >= cap for c in current.values()):
        what = "messages" if kind == "turns" else "générations de procédure"
        raise GuestLimitError(f"Limite du jour atteinte en mode invité ({cap} {what})." + SIGNUP_HINT)
    for k, c in current.items():
        c = {"turns": c.get("turns", 0), "generations": c.get("generations", 0)}
        c[kind] += 1
        _put(day, k, c)


# ── Fichiers ─────────────────────────────────────────────────────

def count_pdf_pages(data: bytes) -> int:
    """Estimation sans dépendance : nombre d'objets /Type /Page (et non /Pages)."""
    return len(re.findall(rb"/Type\s*/Page(?![a-zA-Z])", data))


def check_files(files: list, limits: Optional[GuestLimits] = None) -> None:
    """files : entrées produites par studio_router._read_files (filename, type, size, data, office…)."""
    limits = limits or load_limits()
    if not limits.enabled or not files:
        return
    if len(files) > limits.max_files:
        raise GuestLimitError(
            f"En mode invité, vous pouvez joindre {limits.max_files} fichier{'s' if limits.max_files > 1 else ''} à la fois." + SIGNUP_HINT, 413)
    for f in files:
        if f.get("size", 0) > limits.max_file_mb * 1024 * 1024:
            raise GuestLimitError(
                f"« {f.get('filename')} » dépasse {limits.max_file_mb} Mo, la taille maximale en mode invité." + SIGNUP_HINT, 413)
        pages = 0
        if f.get("type") == "pdf":
            pages = count_pdf_pages(f.get("data") or b"")
        elif f.get("type") == "pptx":
            text = (f.get("office") or {}).get("text") or ""
            pages = len(re.findall(r"^## Diapositive \d+", text, flags=re.M))  # format de office_extract
        if pages > limits.max_pages:
            raise GuestLimitError(
                f"« {f.get('filename')} » compte {pages} pages ; le mode invité est limité à {limits.max_pages}." + SIGNUP_HINT, 413)

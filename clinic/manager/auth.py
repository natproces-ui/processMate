"""
Authentification des appels au backend clinic.

Le frontend envoie le jeton de session Supabase (« Authorization: Bearer … »).
- get_optional_user : utilisateur connecté, ou None pour un invité (aucun jeton).
  Un jeton présent mais invalide ou expiré → 401 : on ne rabat pas silencieusement
  un utilisateur connecté sur les limites d'un invité.
- require_user : 401 si personne n'est connecté.

Les vérifications auprès de Supabase sont mises en cache quelques minutes pour ne pas
ajouter un aller-retour réseau à chaque tour de conversation.
"""

import hashlib
import logging
import time
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)

_CACHE_TTL = 300  # secondes
_cache: Dict[str, Tuple[float, "AuthUser"]] = {}


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: Optional[str] = None


def _token_from_header(authorization: str) -> str:
    return (authorization or "").removeprefix("Bearer ").strip()


def _verify(token: str) -> Optional[AuthUser]:
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.time()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    from database.supabase_client import get_supabase  # import tardif : tests sans Supabase
    try:
        user = get_supabase().auth.get_user(token).user
    except Exception as e:
        logger.info(f"Jeton refusé : {str(e)[:120]}")
        user = None
    if not user:
        return None
    auth_user = AuthUser(id=user.id, email=getattr(user, "email", None))
    if len(_cache) > 5000:
        _cache.clear()
    _cache[key] = (now + _CACHE_TTL, auth_user)
    return auth_user


def get_optional_user(authorization: str = Header(default="")) -> Optional[AuthUser]:
    token = _token_from_header(authorization)
    if not token:
        return None
    user = _verify(token)
    if not user:
        raise HTTPException(401, "Session invalide ou expirée. Reconnectez-vous.")
    return user


def require_user(authorization: str = Header(default="")) -> AuthUser:
    user = get_optional_user(authorization)
    if not user:
        raise HTTPException(401, "Connexion requise")
    return user

"""
Contrôle d'accès central du backend clinic.

Le frontend ne lit aucune table métier directement : tout passe par ce backend, qui
utilise la clé de service Supabase (RLS contournée). C'est donc ICI que se décide qui
peut faire quoi. Chaque requête /api/* est classée par une table de règles (la
première qui correspond gagne ; une route absente de la table est réservée aux
membres : sécurisé par défaut).

Niveaux :
- PUBLIC  : personne n'a besoin d'être connecté (santé, racine).
- GUEST   : invité accepté (chat d'essai, dictée), limité par guest_limits.
- USER    : n'importe quel compte connecté (conversations, projets personnels,
            outils de transformation sans base).
- MEMBER  : membre actif de l'organisation (user_profiles.status = 'active') :
            référentiel, campagnes, orchestration… Un « viewer » y est en lecture seule.
- roles   : rôle global exigé en plus (admin, process_owner…).

Un compte créé librement depuis l'accueil n'est PAS membre : il garde son espace
personnel (chat, conversations, projets) ; l'accès au référentiel de l'organisation
est donné par un administrateur (statut « active »).

Mode (variable AUTH_MODE) :
- enforce : refuse (401/403) ;
- report  : laisse passer mais journalise ce qui serait refusé (défaut, pour déployer
            le frontend qui envoie le jeton avant de fermer la porte) ;
- off     : aucun contrôle par le middleware.
Les routes d'administration des utilisateurs vérifient le rôle admin dans tous les modes.
"""

import asyncio
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, FrozenSet, List, Optional, Pattern, Tuple

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from manager.auth import AuthUser, _token_from_header, _verify

logger = logging.getLogger(__name__)

PUBLIC, GUEST, USER, MEMBER = "public", "guest", "user", "member"
WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
ROLES = ("admin", "process_owner", "validator", "contributor", "viewer")
MANAGERS = frozenset({"admin", "process_owner"})


def auth_mode() -> str:
    mode = os.getenv("AUTH_MODE", "report").strip().lower()
    return mode if mode in ("enforce", "report", "off") else "report"


@dataclass(frozen=True)
class Rule:
    pattern: Pattern
    level: str
    methods: Optional[FrozenSet[str]] = None  # None = toutes
    roles: Optional[FrozenSet[str]] = None


def _r(regex: str, level: str, methods: Optional[str] = None, roles=None) -> Rule:
    return Rule(re.compile(regex), level,
                frozenset(methods.split(",")) if methods else None,
                frozenset(roles) if roles else None)


_ID = r"[^/]+"

# Ordre important : la première règle qui correspond s'applique.
RULES: List[Rule] = [
    # ── Public ──
    _r(r"^/$", PUBLIC), _r(r"^/health/?$", PUBLIC), _r(r"^/api/?$", PUBLIC),
    _r(r"^/(docs|redoc|openapi\.json)(/.*)?$", PUBLIC),
    # ── Invité accepté (limites invité appliquées) ──
    _r(r"^/api/studio/", GUEST),
    _r(r"^/api/stt/dictate/?$", GUEST, "POST"),
    # ── Tout compte connecté (espace personnel, outils sans base) ──
    _r(r"^/api/me/?$", USER),
    _r(r"^/api/conversations(/|$)", USER),
    _r(r"^/api/projects/for-campaign/", MEMBER),  # espace de travail d'une campagne
    _r(r"^/api/projects(/|$)", USER),
    _r(r"^/api/stt/", USER),
    _r(r"^/api/demo-files(/|$)", USER),  # le routeur exige en plus le rôle admin
    _r(r"^/api/(parser|flowchart|bpmn|bpmn-ai|img-to-bpmn|dot-to-table|doc|interfaces|discovery|revision)(/|$)", USER),
    # ── Administration ──
    _r(rf"^/api/orchestration/users/{_ID}/?$", MEMBER, "PATCH", roles={"admin"}),
    _r(r"^/api/orchestration/procedures/migrate-lifecycle-stages/?$", MEMBER, "POST", roles={"admin"}),
    # ── Pilotage des campagnes : admin ou responsable de processus ──
    _r(r"^/api/campaigns/?$", MEMBER, "POST", roles=MANAGERS),
    _r(rf"^/api/campaigns/{_ID}/?$", MEMBER, "DELETE", roles=MANAGERS),
    _r(rf"^/api/campaigns/{_ID}/(launch|close|block|pause|resume)/?$", MEMBER, "POST", roles=MANAGERS),
]
DEFAULT_API_LEVEL = MEMBER


def rule_for(method: str, path: str) -> Rule:
    for rule in RULES:
        if rule.pattern.search(path) and (rule.methods is None or method in rule.methods):
            return rule
    if path.startswith("/api"):
        return Rule(re.compile(""), DEFAULT_API_LEVEL)
    return Rule(re.compile(""), PUBLIC)


# ── Profil d'organisation ─────────────────────────────────────────

_PROFILE_TTL = 60
_profiles: Dict[str, Tuple[float, Optional[Dict[str, Any]]]] = {}


def forget_profile(user_id: Optional[str] = None) -> None:
    if user_id:
        _profiles.pop(user_id, None)
    else:
        _profiles.clear()


def _load_profile(user: AuthUser) -> Optional[Dict[str, Any]]:
    """Profil de user_profiles : par identifiant, sinon par e-mail CONFIRMÉ (profils
    pré-créés par un administrateur avant l'inscription). Jamais par un e-mail non
    confirmé : sinon s'inscrire avec l'adresse d'un autre suffirait à hériter de ses droits."""
    from database.supabase_client import get_supabase
    db = get_supabase()
    rows = db.table("user_profiles").select("id,email,global_role,status").eq("id", user.id).limit(1).execute().data
    if not rows and user.email and user.email_confirmed:
        rows = (db.table("user_profiles").select("id,email,global_role,status")
                .ilike("email", user.email).limit(1).execute().data)
    return rows[0] if rows else None


def profile_for(user: AuthUser) -> Optional[Dict[str, Any]]:
    now = time.time()
    hit = _profiles.get(user.id)
    if hit and hit[0] > now:
        return hit[1]
    try:
        profile = _load_profile(user)
    except Exception as e:  # base indisponible : on ne donne pas d'accès par défaut
        logger.warning(f"Profil illisible pour {user.id[:8]} : {str(e)[:120]}")
        return None
    if len(_profiles) > 5000:
        _profiles.clear()
    _profiles[user.id] = (now + _PROFILE_TTL, profile)
    return profile


@dataclass
class Access:
    user: Optional[AuthUser] = None
    profile: Optional[Dict[str, Any]] = None
    errors: List[str] = field(default_factory=list)

    @property
    def role(self) -> Optional[str]:
        return (self.profile or {}).get("global_role")

    @property
    def member(self) -> bool:
        return bool(self.profile) and self.profile.get("status") == "active"


def describe(user: Optional[AuthUser], profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Ce que le frontend a besoin de savoir sur l'accès de l'utilisateur."""
    a = Access(user=user, profile=profile)
    return {
        "id": user.id if user else None,
        "email": user.email if user else None,
        "member": a.member,
        "role": a.role if a.member else None,
        "status": (profile or {}).get("status"),
        "can_manage_campaigns": a.member and a.role in MANAGERS,
        "is_admin": a.member and a.role == "admin",
        "read_only": a.member and a.role == "viewer",
    }


def decide(method: str, path: str, user: Optional[AuthUser], profile_loader) -> Optional[Tuple[int, str]]:
    """None si autorisé, sinon (statut HTTP, message)."""
    rule = rule_for(method, path)
    if rule.level in (PUBLIC, GUEST):
        return None
    if user is None:
        return 401, "Connexion requise"
    if rule.level == USER:
        return None
    profile = profile_loader(user)
    access = Access(user=user, profile=profile)
    if not access.member:
        return 403, ("Votre compte n'a pas encore accès à l'espace de l'organisation. "
                     "Un administrateur doit l'activer.")
    if rule.roles and access.role not in rule.roles:
        return 403, "Action réservée à un administrateur ou à un responsable de processus."
    if access.role == "viewer" and method in WRITE_METHODS:
        return 403, "Votre accès est en lecture seule."
    return None


async def middleware(request: Request, call_next):
    """Middleware HTTP : vérifie le jeton, classe la route, refuse ou journalise."""
    mode = auth_mode()
    method, path = request.method, request.url.path
    if mode == "off" or method == "OPTIONS":
        return await call_next(request)

    token = _token_from_header(request.headers.get("authorization", ""))
    user: Optional[AuthUser] = None
    denial: Optional[Tuple[int, str]] = None
    if token:
        user = await asyncio.to_thread(_verify, token)
        if user is None and rule_for(method, path).level != PUBLIC:
            denial = (401, "Session invalide ou expirée. Reconnectez-vous.")
    if denial is None:
        cache: Dict[str, Any] = {}

        def loader(u: AuthUser):
            if "p" not in cache:
                cache["p"] = profile_for(u)
            return cache["p"]

        # La lecture du profil fait un appel réseau : hors de la boucle d'événements.
        denial = await asyncio.to_thread(decide, method, path, user, loader)
        request.state.profile = cache.get("p")
    request.state.user = user

    if denial:
        if mode == "enforce":
            return JSONResponse(status_code=denial[0], content={"detail": denial[1]})
        logger.warning(f"[accès:report] {method} {path} serait refusé ({denial[0]}) — "
                       f"{'utilisateur ' + user.id[:8] if user else 'sans jeton'}")
    return await call_next(request)


# ── Dépendances pour les routeurs (appliquées dans tous les modes) ──

def require_role(*roles: str):
    """Dépendance FastAPI : membre actif avec l'un des rôles donnés. Indépendante d'AUTH_MODE."""
    wanted = frozenset(roles)

    def dependency(request: Request) -> Access:
        token = _token_from_header(request.headers.get("authorization", ""))
        user = _verify(token) if token else None
        if user is None:
            raise HTTPException(401, "Connexion requise")
        access = Access(user=user, profile=profile_for(user))
        if not access.member or (wanted and access.role not in wanted):
            raise HTTPException(403, "Action réservée à un administrateur.")
        return access

    return dependency

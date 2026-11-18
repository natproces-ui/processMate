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
- MEMBER  : membre actif d'une organisation active : référentiel, campagnes,
            orchestration… Un « lecteur » y est en lecture seule.
- PLATFORM: super-admin processMate (console des organisations). Il n'est membre
            d'aucune organisation et n'a donc pas accès aux routes MEMBER.
- roles   : rôle d'organisation exigé en plus (admin, pilote…).

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

PUBLIC, GUEST, USER, MEMBER, PLATFORM = "public", "guest", "user", "member", "platform"
WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
ROLES = ("admin", "pilote", "contributeur", "lecteur")  # rôles d'organisation
MANAGERS = frozenset({"admin", "pilote"})


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
    _r(r"^/api/invitations/", USER),  # compte libre invité par une organisation
    _r(r"^/api/conversations(/|$)", USER),
    _r(r"^/api/projects/for-campaign/", MEMBER),  # espace de travail d'une campagne
    _r(r"^/api/projects(/|$)", USER),
    _r(r"^/api/stt/", USER),
    _r(r"^/api/demo-files(/|$)", USER),  # le routeur exige en plus le rôle admin
    _r(r"^/api/(parser|flowchart|bpmn|bpmn-ai|img-to-bpmn|dot-to-table|doc|interfaces|discovery|revision)(/|$)", USER),
    # ── Plateforme (super-admin processMate) ──
    _r(r"^/api/plateforme(/|$)", PLATFORM),
    # ── Administration ──
    _r(rf"^/api/organisation/members/{_ID}/?$", MEMBER, "PATCH,DELETE", roles={"admin"}),
    _r(r"^/api/organisation/(members|equipes|invitations)(/.*)?$", MEMBER, "POST,PATCH,DELETE", roles={"admin"}),
    _r(rf"^/api/orchestration/users/{_ID}/?$", MEMBER, "PATCH", roles={"admin"}),
    _r(r"^/api/orchestration/procedures/migrate-lifecycle-stages/?$", MEMBER, "POST", roles={"admin"}),
    # ── Pilotage des campagnes : admin ou responsable de processus ──
    _r(r"^/api/campaigns/?$", MEMBER, "POST", roles=MANAGERS),
    _r(rf"^/api/campaigns/{_ID}/?$", MEMBER, "DELETE", roles=MANAGERS),
    _r(rf"^/api/campaigns/{_ID}/(launch|close|block|pause|resume)/?$", MEMBER, "POST", roles=MANAGERS),
    # Emplacements : la structure de la campagne est l'affaire du pilotage
    _r(rf"^/api/campaigns/{_ID}/emplacements(/.*)?$", MEMBER, "POST,PUT,PATCH,DELETE", roles=MANAGERS),
]
DEFAULT_API_LEVEL = MEMBER


def rule_for(method: str, path: str) -> Rule:
    for rule in RULES:
        if rule.pattern.search(path) and (rule.methods is None or method in rule.methods):
            return rule
    if path.startswith("/api"):
        return Rule(re.compile(""), DEFAULT_API_LEVEL)
    return Rule(re.compile(""), PUBLIC)


# ── Appartenance à une organisation ───────────────────────────────
#
# Deux sources, une seule forme (dict « appartenance ») :
# - ORGANISATIONS_ENABLED=false (défaut, tant que la migration n'est pas appliquée) :
#   user_profiles.global_role / status, organisation unique implicite ;
# - ORGANISATIONS_ENABLED=true : organisation_members + organisations.
# Les rôles sont toujours exprimés dans le vocabulaire d'organisation.

LEGACY_ROLES = {"admin": "admin", "process_owner": "pilote", "validator": "contributeur",
                "contributor": "contributeur", "viewer": "lecteur"}
_STATUS = {"active": "active", "invitee": "invited", "invited": "invited",
           "suspendue": "suspended", "suspended": "suspended"}


def organisations_enabled() -> bool:
    return os.getenv("ORGANISATIONS_ENABLED", "false").strip().lower() == "true"


def normalize(p: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Forme commune, idempotente. Accepte une ligne user_profiles (ancien mode)."""
    if not p:
        return None
    if p.get("_norm"):
        return p
    role = p.get("role") if "organisation_id" in p else LEGACY_ROLES.get(p.get("global_role") or "")
    raw_status = p.get("statut") or p.get("status") or ""
    return {
        "_norm": True,
        "id": p.get("user_id") or p.get("id"),
        "email": p.get("email"),
        "role": role,
        "status": _STATUS.get(raw_status, raw_status or None),
        "organisation_id": p.get("organisation_id"),
        "organisation_nom": p.get("organisation_nom"),
        "organisation_statut": p.get("organisation_statut") or "active",
    }


_PROFILE_TTL = 60
_profiles: Dict[str, Tuple[float, Optional[Dict[str, Any]]]] = {}
_platform: Dict[str, Tuple[float, bool]] = {}


def forget_profile(user_id: Optional[str] = None) -> None:
    if user_id:
        _profiles.pop(user_id, None)
        _platform.pop(user_id, None)
    else:
        _profiles.clear()
        _platform.clear()


def _profile_id(db, user: AuthUser) -> Optional[str]:
    """Profil pré-créé avec le même e-mail CONFIRMÉ. Jamais par un e-mail non confirmé :
    s'inscrire avec l'adresse d'un autre suffirait sinon à hériter de ses droits."""
    if user.email and user.email_confirmed:
        rows = db.table("user_profiles").select("id").ilike("email", user.email).limit(1).execute().data
        if rows:
            return rows[0]["id"]
    return None


def _load_membership(user: AuthUser) -> Optional[Dict[str, Any]]:
    from database.supabase_client import get_supabase
    db = get_supabase()
    cols = "organisation_id,user_id,role,statut,organisations(nom,statut)"

    def by(uid):
        return db.table("organisation_members").select(cols).eq("user_id", uid).limit(1).execute().data

    rows = by(user.id)
    if not rows:
        pid = _profile_id(db, user)
        rows = by(pid) if pid and pid != user.id else []
    if not rows:
        return None
    r = rows[0]
    org = r.get("organisations") or {}
    return {**r, "email": user.email, "organisation_nom": org.get("nom"), "organisation_statut": org.get("statut")}


def _load_profile(user: AuthUser) -> Optional[Dict[str, Any]]:
    """Appartenance de l'utilisateur, ou None (compte libre)."""
    if organisations_enabled():
        return _load_membership(user)
    from database.supabase_client import get_supabase
    db = get_supabase()
    cols = "id,email,global_role,status"
    rows = db.table("user_profiles").select(cols).eq("id", user.id).limit(1).execute().data
    if not rows:
        pid = _profile_id(db, user)
        if pid:
            rows = db.table("user_profiles").select(cols).eq("id", pid).limit(1).execute().data
    return rows[0] if rows else None


def profile_for(user: AuthUser) -> Optional[Dict[str, Any]]:
    now = time.time()
    hit = _profiles.get(user.id)
    if hit and hit[0] > now:
        return hit[1]
    try:
        profile = normalize(_load_profile(user))
    except Exception as e:  # base indisponible : on ne donne pas d'accès par défaut
        logger.warning(f"Profil illisible pour {user.id[:8]} : {str(e)[:120]}")
        return None
    if len(_profiles) > 5000:
        _profiles.clear()
    _profiles[user.id] = (now + _PROFILE_TTL, profile)
    return profile


def is_platform_admin(user: Optional[AuthUser]) -> bool:
    """Super-admin processMate (table platform_admins). Jamais membre d'une organisation."""
    if user is None or not organisations_enabled():
        return False
    now = time.time()
    hit = _platform.get(user.id)
    if hit and hit[0] > now:
        return hit[1]
    try:
        from database.supabase_client import get_supabase
        ok = bool(get_supabase().table("platform_admins").select("user_id").eq("user_id", user.id)
                  .limit(1).execute().data)
    except Exception as e:
        logger.warning(f"platform_admins illisible : {str(e)[:120]}")
        return False
    _platform[user.id] = (now + _PROFILE_TTL, ok)
    return ok


# Vocabulaire d'organisation → ancien vocabulaire (écrans existants qui lisent global_role)
TO_LEGACY_ROLE = {"admin": "admin", "pilote": "process_owner", "contributeur": "contributor", "lecteur": "viewer"}


def membership_of(user_id: str) -> Optional[Dict[str, Any]]:
    """Appartenance normalisée d'un utilisateur quelconque, ou None.

    En mode organisations : seulement s'il est membre de l'organisation de la requête
    (une personne d'une autre organisation n'existe pas pour l'appelant).
    """
    from database.supabase_client import get_supabase
    db = get_supabase()
    if organisations_enabled():
        from database.org_scope import current_org_id
        org = current_org_id()
        if not org:
            return None
        rows = (db.table("organisation_members").select("organisation_id,user_id,role,statut")
                .eq("organisation_id", org).eq("user_id", user_id).limit(1).execute().data)
        return normalize(rows[0]) if rows else None
    rows = db.table("user_profiles").select("id,email,global_role,status").eq("id", user_id).limit(1).execute().data
    return normalize(rows[0]) if rows else None


def org_member_ids(active_only: bool = True, role: Optional[str] = None) -> Optional[Dict[str, Dict[str, Any]]]:
    """Membres de l'organisation de la requête {user_id: appartenance} ; None en ancien mode."""
    if not organisations_enabled():
        return None
    from database.org_scope import current_org_id
    from database.supabase_client import get_supabase
    org = current_org_id()
    if not org:
        return {}
    q = get_supabase().table("organisation_members").select("organisation_id,user_id,role,statut").eq("organisation_id", org)
    if active_only:
        q = q.eq("statut", "active")
    if role:
        q = q.eq("role", role)
    return {r["user_id"]: normalize(r) for r in (q.execute().data or [])}


@dataclass
class Access:
    user: Optional[AuthUser] = None
    profile: Optional[Dict[str, Any]] = None
    errors: List[str] = field(default_factory=list)

    def __post_init__(self):
        self.profile = normalize(self.profile)

    @property
    def role(self) -> Optional[str]:
        return (self.profile or {}).get("role")

    @property
    def organisation_id(self) -> Optional[str]:
        return (self.profile or {}).get("organisation_id")

    @property
    def organisation_suspended(self) -> bool:
        return bool(self.profile) and self.profile.get("organisation_statut") not in (None, "active")

    @property
    def member(self) -> bool:
        return (bool(self.profile) and self.profile.get("status") == "active"
                and not self.organisation_suspended)


def describe(user: Optional[AuthUser], profile: Optional[Dict[str, Any]],
             platform_admin: bool = False) -> Dict[str, Any]:
    """Ce que le frontend a besoin de savoir sur l'accès de l'utilisateur."""
    a = Access(user=user, profile=profile)
    p = a.profile or {}
    org = None
    if p.get("organisation_id"):
        org = {"id": p["organisation_id"], "nom": p.get("organisation_nom"), "statut": p.get("organisation_statut")}
    return {
        "id": user.id if user else None,
        "email": user.email if user else None,
        "organisations_mode": organisations_enabled(),
        "organisation": org,
        "member": a.member,
        "role": a.role if a.member else None,
        "status": "organisation_suspendue" if a.organisation_suspended else p.get("status"),
        "can_manage_campaigns": a.member and a.role in MANAGERS,
        "is_admin": a.member and a.role == "admin",
        "is_org_admin": a.member and a.role == "admin",
        "read_only": a.member and a.role == "lecteur",
        "is_platform_admin": platform_admin,
    }


def decide(method: str, path: str, user: Optional[AuthUser], profile_loader,
           platform_loader=is_platform_admin) -> Optional[Tuple[int, str]]:
    """None si autorisé, sinon (statut HTTP, message)."""
    rule = rule_for(method, path)
    if rule.level in (PUBLIC, GUEST):
        return None
    if user is None:
        return 401, "Connexion requise"
    if rule.level == USER:
        return None
    if rule.level == PLATFORM:
        return None if platform_loader(user) else (403, "Réservé à l'administration de processMate.")
    profile = profile_loader(user)
    access = Access(user=user, profile=profile)
    if access.organisation_suspended:
        return 403, "L'espace de votre organisation est suspendu. Contactez processMate."
    if not access.member:
        return 403, ("Votre compte n'a pas encore accès à l'espace de l'organisation. "
                     "Un administrateur doit l'activer.")
    if rule.roles and access.role not in rule.roles:
        return 403, "Action réservée à un administrateur ou à un pilote."
    if access.role == "lecteur" and method in WRITE_METHODS:
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
        if user is not None and organisations_enabled():
            # Toute requête d'un membre porte son organisation, y compris les routes
            # « compte » (projets de campagne…) : les données sont cloisonnées par elle.
            cache["p"] = await asyncio.to_thread(profile_for, user)

        def loader(u: AuthUser):
            if "p" not in cache:
                cache["p"] = profile_for(u)
            return cache["p"]

        # La lecture du profil fait un appel réseau : hors de la boucle d'événements.
        denial = await asyncio.to_thread(decide, method, path, user, loader)
        request.state.profile = cache.get("p")
    request.state.user = user
    access = Access(user=user, profile=getattr(request.state, "profile", None))
    if organisations_enabled() and access.member and access.organisation_id:
        from database.org_scope import set_org
        set_org(access.organisation_id)  # vu par la route et ses threads

    if denial:
        if mode == "enforce":
            return JSONResponse(status_code=denial[0], content={"detail": denial[1]})
        logger.warning(f"[accès:report] {method} {path} serait refusé ({denial[0]}) — "
                       f"{'utilisateur ' + user.id[:8] if user else 'sans jeton'}")
    return await call_next(request)


# ── Dépendances pour les routeurs (appliquées dans tous les modes) ──

def _request_user(request: Request) -> Optional[AuthUser]:
    user = getattr(request.state, "user", None)
    if user is not None:
        return user
    token = _token_from_header(request.headers.get("authorization", ""))
    return _verify(token) if token else None


def current_access(request: Request) -> Access:
    """Appartenance de l'appelant (organisation, rôle). 401 sans compte, 403 sans accès."""
    user = _request_user(request)
    if user is None:
        raise HTTPException(401, "Connexion requise")
    access = Access(user=user, profile=profile_for(user))
    if access.organisation_suspended:
        raise HTTPException(403, "L'espace de votre organisation est suspendu. Contactez processMate.")
    if not access.member:
        raise HTTPException(403, "Accès réservé aux membres de l'organisation.")
    return access


def current_org(request: Request) -> Optional[str]:
    """Organisation de l'appelant, TOUJOURS déduite du compte (jamais d'un paramètre).

    None en ancien mode (ORGANISATIONS_ENABLED=false) : organisation unique implicite.
    """
    if not organisations_enabled():
        return None
    org = current_access(request).organisation_id
    if not org:
        raise HTTPException(403, "Accès réservé aux membres de l'organisation.")
    return org


def require_platform_admin(request: Request) -> AuthUser:
    """Super-admin processMate (dans tous les modes d'AUTH_MODE)."""
    user = _request_user(request)
    if user is None:
        raise HTTPException(401, "Connexion requise")
    if not is_platform_admin(user):
        raise HTTPException(403, "Réservé à l'administration de processMate.")
    return user


# ── Journal d'audit ─────────────────────────────────────────────

def audit(action: str, actor: Optional[AuthUser] = None, organisation_id: Optional[str] = None,
          cible_type: Optional[str] = None, cible_id: Optional[str] = None,
          details: Optional[Dict[str, Any]] = None, actor_nom: Optional[str] = None) -> None:
    """Trace une action sensible (qui, quoi, quand, sur quoi). Ne lève jamais.

    En ancien mode, ou si la table n'existe pas encore, la trace va dans les journaux.
    """
    entry = {"organisation_id": organisation_id, "actor_id": actor.id if actor else None,
             "actor_nom": actor_nom or (actor.email if actor else None), "action": action,
             "cible_type": cible_type, "cible_id": cible_id, "details": details or {}}
    logger.info(f"[audit] {action} par {entry['actor_id'] and entry['actor_id'][:8]} "
                f"sur {cible_type}:{cible_id and str(cible_id)[:8]} {sorted((details or {}).keys())}")
    if not organisations_enabled():
        return
    try:
        from database.supabase_client import get_supabase
        get_supabase().table("audit_log").insert(entry).execute()
    except Exception as e:
        logger.warning(f"audit_log non écrit : {str(e)[:120]}")

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

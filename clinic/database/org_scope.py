"""
Cloisonnement des données par organisation (prompt 2 de docs/prompts-organisations.md).

Plutôt que d'ajouter .eq("organisation_id", …) à la main dans ~300 requêtes (un seul
oubli = fuite entre clients), get_supabase() renvoie un client qui, pour chaque table
« propre à une organisation » (ORG_TABLES) :
- ajoute le filtre organisation_id en lecture, modification et suppression ;
- pose organisation_id à l'insertion (et refuse une autre valeur) ;
- refuse un upsert qui écraserait une ligne d'une autre organisation ;
- refuse toute requête quand aucune organisation n'est connue (OrgScopeError → 403).
Les fonctions SQL (rpc) ne sont pas cloisonnées : refusées en mode organisations (les
appelants retombent déjà sur leur calcul Python, qui passe par ce filtre).

L'organisation vient du compte connecté : le middleware d'accès la pose dans le contexte
de la requête (org_scope). Les threads créés par asyncio.to_thread et par Starlette
héritent de ce contexte.

Inactif tant que ORGANISATIONS_ENABLED n'est pas « true » (les colonnes n'existent pas
encore) : le client se comporte alors exactement comme avant.
"""

import os
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Dict, Iterator, List, Optional

COLUMN = "organisation_id"

# Tables dont chaque ligne appartient à une organisation.
ORG_TABLES = frozenset({
    # référentiel
    "workflows", "sessions", "messages", "files", "process_taxonomy", "process_maps",
    "procedure_versions", "procedure_assignments", "procedure_validation_reviews", "procedure_events",
    # campagnes et tâches
    "formalization_campaigns", "campaign_procedures", "campaigns",
    "procedure_tasks", "procedure_task_comments", "procedure_task_events", "procedure_notifications",
    # analyse, irritants, spécifications, outils, Jira
    "analysis_sessions", "analysis_messages", "analysis_artifacts",
    "irritants", "findings", "pistes", "piste_messages", "specifications",
    "tools", "tool_screens", "tool_screen_fields", "tool_codes", "tool_business_rules", "tool_data_entities",
    "jira_links",
    # équipes (prompt 4)
    "equipes", "equipe_membres", "equipe_branches",
    # propositions au référentiel (prompt 6)
    "procedure_propositions",
    # correspondances BIAN de l'organisation (prompt 7)
    "procedure_bian",
})
# Tables communes : catalogue partagé, ou filtrées par l'appartenance dans le code.
COMMON_TABLES = frozenset({
    "bian_scenarios", "organisations", "organisation_members", "platform_admins", "audit_log",
    "guest_usage", "user_profiles", "ai_usage",
    "organisation_invitations",  # cherchées par e-mail pour l'invité ; filtrées par organisation côté admin
    "notification_preferences",  # préférences personnelles (par compte)
})
# Tables personnelles : contrôle par propriétaire (conversation_store, project_store).
PERSONAL_TABLES = frozenset({
    "conversations", "conversation_messages", "conversation_sources",
    "projects", "project_members", "project_sources",
})
# Toute table utilisée dans le code doit figurer dans l'une des trois listes
# (tests/test_org_isolation.py échoue sinon) : une nouvelle table est classée exprès.

_org: ContextVar[Optional[str]] = ContextVar("organisation_id", default=None)


class OrgScopeError(PermissionError):
    """Requête sur une table d'organisation sans organisation, ou vers une autre organisation."""


def enabled() -> bool:
    return os.getenv("ORGANISATIONS_ENABLED", "false").strip().lower() == "true"


def current_org_id() -> Optional[str]:
    return _org.get()


def set_org(org_id: Optional[str]):
    """Pose l'organisation pour la suite de la requête (middleware). Renvoie le jeton."""
    return _org.set(org_id)


@contextmanager
def org_scope(org_id: Optional[str]) -> Iterator[None]:
    token = _org.set(org_id)
    try:
        yield
    finally:
        _org.reset(token)


def _stamp(payload: Any, org: str) -> Any:
    def one(row: Dict[str, Any]) -> Dict[str, Any]:
        if row.get(COLUMN) not in (None, org):
            raise OrgScopeError("Écriture vers une autre organisation refusée")
        return {**row, COLUMN: org}
    if isinstance(payload, list):
        return [one(r) for r in payload]
    return one(payload)


class ScopedTable:
    """Requête sur une table d'organisation, filtrée par l'organisation courante."""

    def __init__(self, raw_client: Any, name: str, org: str):
        self._raw, self._name, self._org = raw_client, name, org
        self._t = raw_client.table(name)

    def select(self, *args, **kwargs):
        return self._t.select(*args, **kwargs).eq(COLUMN, self._org)

    def update(self, payload: Dict[str, Any], **kwargs):
        if payload.get(COLUMN) not in (None, self._org):
            raise OrgScopeError("Changement d'organisation refusé")
        clean = {k: v for k, v in payload.items() if k != COLUMN}
        return self._t.update(clean, **kwargs).eq(COLUMN, self._org)

    def delete(self, **kwargs):
        return self._t.delete(**kwargs).eq(COLUMN, self._org)

    def insert(self, payload: Any, **kwargs):
        return self._t.insert(_stamp(payload, self._org), **kwargs)

    def upsert(self, payload: Any, **kwargs):
        rows: List[Dict[str, Any]] = payload if isinstance(payload, list) else [payload]
        keys = [k.strip() for k in (kwargs.get("on_conflict") or "id").split(",") if k.strip()]
        for row in rows:
            if not all(row.get(k) is not None for k in keys):
                continue
            q = self._raw.table(self._name).select(COLUMN)
            for k in keys:
                q = q.eq(k, row[k])
            if any(r.get(COLUMN) != self._org for r in (q.execute().data or [])):
                raise OrgScopeError("Cette ligne appartient à une autre organisation")
        return self._t.upsert(_stamp(payload, self._org), **kwargs)

    def __getattr__(self, name: str):
        raise OrgScopeError(f"Opération « {name} » non cloisonnée sur {self._name}")


class ScopedClient:
    """Enveloppe du client Supabase : cloisonne ORG_TABLES, délègue tout le reste."""

    def __init__(self, raw_client: Any):
        self._raw = raw_client

    @property
    def raw(self) -> Any:
        """Client brut, NON cloisonné : réservé à la plateforme (création d'organisation…)."""
        return self._raw

    def table(self, name: str):
        if not enabled() or name not in ORG_TABLES:
            return self._raw.table(name)
        org = _org.get()
        if not org:
            raise OrgScopeError("Accès réservé aux membres de l'organisation.")
        return ScopedTable(self._raw, name, org)

    from_ = table

    def rpc(self, fn: str, params: Optional[Dict[str, Any]] = None, *args, **kwargs):
        if enabled():
            raise OrgScopeError(f"Fonction SQL {fn} non cloisonnée : calcul applicatif utilisé")
        return self._raw.rpc(fn, params or {}, *args, **kwargs)

    def __getattr__(self, name: str):
        return getattr(self._raw, name)

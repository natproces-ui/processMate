"""Client Jira Cloud minimal — création/lecture d'issues.

Config attendue en variables d'environnement (clinic/.env) :
  JIRA_BASE_URL     ex. "https://votre-domaine.atlassian.net"
  JIRA_EMAIL        compte utilisé pour générer l'API token
  JIRA_API_TOKEN    généré sur id.atlassian.com/manage-profile/security/api-tokens
  JIRA_PROJECT_KEY  ex. "PROC"
  JIRA_ISSUE_TYPE   optionnel, défaut "Task"

Vérifié contre un vrai Jira Cloud (création + lecture de statut) — voir
KAN-1/KAN-2 sur l'instance de test.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


class JiraConfigError(RuntimeError):
    """Levée quand les variables d'environnement Jira ne sont pas configurées."""


def _config() -> dict:
    base_url = os.getenv("JIRA_BASE_URL")
    email = os.getenv("JIRA_EMAIL")
    api_token = os.getenv("JIRA_API_TOKEN")
    project_key = os.getenv("JIRA_PROJECT_KEY")
    if not all([base_url, email, api_token, project_key]):
        raise JiraConfigError(
            "Jira non configuré — définir JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN "
            "et JIRA_PROJECT_KEY dans clinic/.env"
        )
    return {
        "base_url": base_url.rstrip("/"),
        "email": email,
        "api_token": api_token,
        "project_key": project_key,
        "issue_type": os.getenv("JIRA_ISSUE_TYPE", "Task"),
    }


def _adf_description(text: str) -> dict:
    """Construit un document ADF minimal (un paragraphe par ligne) pour l'API v3."""
    paragraphs = [
        {"type": "paragraph", "content": [{"type": "text", "text": line}]}
        for line in (text or "").split("\n") if line.strip()
    ]
    return {"type": "doc", "version": 1, "content": paragraphs or [{"type": "paragraph", "content": []}]}


def _find_account_id(client: httpx.Client, base_url: str, email: str) -> Optional[str]:
    """Résout un email en accountId Jira (requis par l'API v3 pour assigner un
    ticket — un email brut n'est pas accepté dans fields.assignee). Retourne
    None si aucun compte Jira ne correspond (ex. email @example.com de démo) —
    l'appelant doit alors créer le ticket sans assigné plutôt qu'échouer."""
    resp = client.get(f"{base_url}/rest/api/3/user/search", params={"query": email})
    if resp.status_code != 200:
        return None
    users = resp.json()
    return users[0]["accountId"] if users else None


def create_issue(
    summary: str,
    description: str = "",
    priority: Optional[str] = None,
    labels: Optional[list[str]] = None,
    due_date: Optional[str] = None,
    assignee_email: Optional[str] = None,
) -> dict:
    """Crée un ticket Jira. Retourne {"key", "url", "assignee_resolved": bool} —
    assignee_resolved est False si assignee_email était fourni mais qu'aucun
    compte Jira ne correspondait (ticket créé quand même, non assigné)."""
    cfg = _config()
    fields: dict = {
        "project": {"key": cfg["project_key"]},
        "summary": summary,
        "issuetype": {"name": cfg["issue_type"]},
        "description": _adf_description(description),
    }
    if priority:
        fields["priority"] = {"name": priority}
    if labels:
        fields["labels"] = labels
    if due_date:
        fields["duedate"] = due_date

    with httpx.Client(auth=(cfg["email"], cfg["api_token"]), timeout=15.0) as client:
        assignee_resolved = False
        if assignee_email:
            account_id = _find_account_id(client, cfg["base_url"], assignee_email)
            if account_id:
                fields["assignee"] = {"accountId": account_id}
                assignee_resolved = True
            else:
                logger.info("Jira: aucun compte trouvé pour %s — ticket créé sans assigné", assignee_email)

        resp = client.post(f"{cfg['base_url']}/rest/api/3/issue", json={"fields": fields})

    if resp.status_code >= 400:
        logger.error("Jira create_issue failed: %s %s", resp.status_code, resp.text)
        resp.raise_for_status()

    key = resp.json()["key"]
    return {"key": key, "url": f"{cfg['base_url']}/browse/{key}", "assignee_resolved": assignee_resolved}


def get_issue_status(issue_key: str) -> Optional[str]:
    """Récupère le statut courant d'un ticket Jira (ex. "To Do", "In Progress")."""
    cfg = _config()
    with httpx.Client(auth=(cfg["email"], cfg["api_token"]), timeout=15.0) as client:
        resp = client.get(
            f"{cfg['base_url']}/rest/api/3/issue/{issue_key}",
            params={"fields": "status"},
        )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()["fields"]["status"]["name"]

"""
Comptes créés pour quelqu'un d'autre, remis par un lien (prompts 3 et 4).

Dans la pratique, une organisation fournit les identifiants à ses collaborateurs : le
super-admin crée l'admin d'une organisation, l'admin crée les comptes de son
organisation. Le compte Supabase est créé par l'API d'administration, qui renvoie un
LIEN (définir son mot de passe) à copier et envoyer soi-même. Aucun e-mail automatique.

Le lien n'est renvoyé qu'une fois et n'est jamais enregistré.
"""

import logging
import re
from dataclasses import dataclass
from typing import Optional

from config import FRONTEND_URL

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
LANDING = "/mot-de-passe/"  # hors /auth : ce layout renvoie les personnes connectées


class AccountLinkError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


@dataclass
class AccountLink:
    user_id: str
    link: str
    created: bool  # False : le compte existait déjà (lien de connexion / nouveau mot de passe)


def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def normalize_email(email: str) -> str:
    email = (email or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise AccountLinkError("Adresse e-mail invalide")
    return email


def find_user_id(email: str) -> Optional[str]:
    rows = _db().table("user_profiles").select("id").ilike("email", email).limit(1).execute().data
    return rows[0]["id"] if rows else None


def organisation_of(user_id: str) -> Optional[str]:
    rows = _db().table("organisation_members").select("organisation_id").eq("user_id", user_id).limit(1).execute().data
    return rows[0]["organisation_id"] if rows else None


def _generate(kind: str, email: str, full_name: Optional[str]):
    options = {"redirect_to": FRONTEND_URL + LANDING}
    if full_name:
        options["data"] = {"full_name": full_name}
    return _db().auth.admin.generate_link({"type": kind, "email": email, "options": options})


def create_or_link(email: str, full_name: Optional[str] = None) -> AccountLink:
    """Crée le compte (lien d'invitation), ou renvoie un lien pour un compte existant.

    L'appelant vérifie AVANT l'appartenance éventuelle à une autre organisation.
    """
    email = normalize_email(email)
    created = True
    try:
        res = _generate("invite", email, full_name)
    except Exception as e:
        if "already" not in str(e).lower() and "exists" not in str(e).lower() and "registered" not in str(e).lower():
            logger.warning(f"Lien d'invitation impossible : {str(e)[:160]}")
            raise AccountLinkError("Création du compte impossible pour le moment.", 502)
        created = False
        res = _generate("recovery", email, None)
    user = getattr(res, "user", None)
    link = getattr(getattr(res, "properties", None), "action_link", None)
    if not user or not link:
        raise AccountLinkError("Création du compte impossible pour le moment.", 502)
    # Profil (normalement créé par le déclencheur d'inscription) : on s'en assure
    try:
        profile = {"id": user.id, "email": email}
        if full_name:
            profile["full_name"] = full_name
        _db().table("user_profiles").upsert(profile, on_conflict="id").execute()
    except Exception as e:
        logger.warning(f"Profil non créé pour {user.id[:8]} : {str(e)[:120]}")
    return AccountLink(user_id=user.id, link=link, created=created)


def new_link(email: str) -> str:
    """Nouveau lien pour un compte existant (lien expiré, mot de passe à définir)."""
    email = normalize_email(email)
    for kind in ("invite", "recovery"):
        try:
            res = _generate(kind, email, None)
            link = getattr(getattr(res, "properties", None), "action_link", None)
            if link:
                return link
        except Exception as e:
            logger.info(f"Lien {kind} refusé : {str(e)[:120]}")
    raise AccountLinkError("Nouveau lien impossible pour le moment.", 502)


ROLE_LABELS = {"admin": "administrateur", "pilote": "pilote", "contributeur": "contributeur", "lecteur": "lecteur"}


def email_link(email: str, full_name: Optional[str], organisation: str, role: str, link: str,
               invited_by: Optional[str] = None, existing_account: bool = False) -> bool:
    """Envoie le lien d'accès par e-mail (identifiant + lien). True si parti. Ne lève jamais."""
    try:
        import email_sender
        return email_sender.send_access_email(email, full_name or "", organisation, ROLE_LABELS.get(role, role),
                                              link, invited_by or "processMate", existing_account)
    except Exception as e:
        logger.warning(f"E-mail d'accès non envoyé : {str(e)[:120]}")
        return False

"""
Tâches produites par le processus et points ouverts (prompt 7 de docs/prompts-organisations.md).

Déjà produites par les événements existants : « Formaliser » (lancement de campagne,
campaign_items.launch), « Relire » / « Valider » (soumission), « Corriger » (renvoi).
Ce module ajoute :
- les points ouverts adressés à une personne ou une équipe → tâche « Répondre » ; la réponse
  revient dans la procédure (jamais dans la conversation du rédacteur) et ferme la tâche ;
- la relance unique avant échéance (paramètre d'organisation relance_jours, défaut 3) ;
- l'annulation des tâches ouvertes d'une campagne close ;
- le compteur « À faire » ;
- l'e-mail facultatif (désactivable par chaque personne) pour Valider, Répondre et relances.
Toutes les requêtes passent par get_supabase() : cloisonnées par l'organisation.
"""

import logging
import threading
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

OPEN = ("todo", "in_progress", "changes_requested", "waiting_info", "blocked", "submitted")


class InboxError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── E-mail (facultatif, par personne) ─────────────────────────────────

def email_enabled(user_id: str) -> bool:
    try:
        rows = _db().table("notification_preferences").select("email_taches").eq("user_id", user_id).limit(1).execute().data
        return rows[0]["email_taches"] if rows else True
    except Exception:
        return True  # préférences pas encore installées : comportement par défaut


def set_email_enabled(user_id: str, enabled: bool) -> None:
    _db().table("notification_preferences").upsert({"user_id": user_id, "email_taches": enabled}, on_conflict="user_id").execute()


def email_task(user_id: str, task_title: str, procedure_id: Optional[str], assigned_by: Optional[str] = None) -> None:
    """E-mail « vous avez une tâche » si la personne ne l'a pas désactivé. Ne lève jamais."""
    try:
        if not email_enabled(user_id):
            return
        p = _db().table("user_profiles").select("email,full_name,display_name").eq("id", user_id).limit(1).execute().data
        if not p or not p[0].get("email"):
            return
        from config import FRONTEND_URL
        from email_sender import send_task_email
        from manager.campaign_flow import person_name
        proc = _db().table("workflows").select("title").eq("id", procedure_id).limit(1).execute().data if procedure_id else []
        url = f"{FRONTEND_URL}/orchestration?tab=workspace&procedure_id={procedure_id}" if procedure_id else None
        threading.Thread(target=send_task_email, daemon=True, kwargs={
            "to_email": p[0]["email"], "to_name": p[0].get("full_name") or p[0].get("display_name") or p[0]["email"],
            "assigned_by_name": person_name(assigned_by) or "processMate", "task_title": task_title,
            "procedure_name": proc[0]["title"] if proc else "", "workspace_url": url,
        }).start()
    except Exception as e:
        logger.warning(f"E-mail de tâche non envoyé : {str(e)[:120]}")


def _new_task(procedure_id: str, assigned_to: str, assigned_by: str, title: str, task_type: str,
              metadata: Dict[str, Any], due_date: Optional[str] = None, raci_role: Optional[str] = None) -> Dict[str, Any]:
    """Tâche hors cycle de vie (ne bloque pas la formalisation en cours)."""
    from routers.orchestration_tasks_router import _insert_task, _notify
    task = {"id": str(uuid.uuid4()), "procedure_id": procedure_id, "title": title[:300], "description": "",
            "assigned_to": assigned_to, "assigned_by": assigned_by, "raci_role": raci_role, "task_type": task_type,
            "status": "todo", "priority": "normal", "due_date": due_date, "metadata": metadata,
            "created_at": _now(), "updated_at": _now()}
    created = _insert_task(_db(), task)
    _notify(assigned_to, title, procedure_id, task["id"], None, "task")
    return created


# ── Points ouverts ───────────────────────────────────────────────────

def _meta(procedure_id: str) -> Dict[str, Any]:
    rows = _db().table("workflows").select("id,procedure_metadata_json").eq("id", procedure_id).limit(1).execute().data
    if not rows:
        raise InboxError("Procédure introuvable", 404)
    return dict(rows[0].get("procedure_metadata_json") or {})


def _save_points(procedure_id: str, meta: Dict[str, Any], points: List[Dict[str, Any]]) -> None:
    meta["open_points"] = points
    _db().table("workflows").update({"procedure_metadata_json": meta}).eq("id", procedure_id).execute()


SERVER_POINT_FIELDS = ("statut", "reponse", "repondu_par", "repondu_par_nom", "repondu_le",
                       "destinataires", "equipe_id", "adresse_par", "adresse_le")


def merge_open_points(existing: List[Dict[str, Any]], incoming: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Fusion à l'enregistrement : l'éditeur ne peut pas effacer un adressage ni une réponse
    enregistrés côté serveur (le métier a pu répondre pendant que le rédacteur travaillait)."""
    server = {p.get("id"): p for p in existing or [] if p.get("id")}
    out, seen = [], set()
    for p in incoming or []:
        s = server.get(p.get("id"))
        if s and (s.get("destinataires") or s.get("reponse")):
            p = {**p, **{k: s[k] for k in SERVER_POINT_FIELDS if k in s}}
        out.append(p)
        seen.add(p.get("id"))
    out += [s for pid, s in server.items() if pid not in seen and (s.get("destinataires") or s.get("reponse"))]
    return out


def points(procedure_id: str) -> List[Dict[str, Any]]:
    return list(_meta(procedure_id).get("open_points") or [])


def open_points_count(procedure_ids: List[str]) -> Dict[str, int]:
    ids = [p for p in procedure_ids if p]
    if not ids:
        return {}
    rows = _db().table("workflows").select("id,procedure_metadata_json").in_("id", ids).execute().data or []
    return {r["id"]: sum(1 for p in ((r.get("procedure_metadata_json") or {}).get("open_points") or [])
                         if (p.get("statut") or "ouvert") == "ouvert") for r in rows}


def address(procedure_id: str, point_id: str, actor: str, user_id: Optional[str] = None,
            equipe_id: Optional[str] = None) -> Dict[str, Any]:
    """Adresse un point ouvert à une personne (ou au responsable / aux membres d'une équipe)."""
    from manager.access_control import membership_of
    meta = _meta(procedure_id)
    pts = list(meta.get("open_points") or [])
    pt = next((p for p in pts if p.get("id") == point_id), None)
    if not pt:
        raise InboxError("Point ouvert introuvable", 404)
    if (pt.get("statut") or "ouvert") != "ouvert":
        raise InboxError("Ce point a déjà une réponse.")
    if user_id:
        if not membership_of(user_id):
            raise InboxError("Cette personne n'est pas membre de l'organisation.")
        targets = [user_id]
    elif equipe_id:
        team = _db().table("equipes").select("id,responsable_id").eq("id", equipe_id).limit(1).execute().data
        if not team:
            raise InboxError("Équipe introuvable", 404)
        members = [m["user_id"] for m in _db().table("equipe_membres").select("user_id").eq("equipe_id", equipe_id).execute().data or []]
        targets = [team[0]["responsable_id"]] if team[0].get("responsable_id") else members
        if not targets:
            raise InboxError("Cette équipe n'a ni responsable ni membre.")
    else:
        raise InboxError("Indiquez une personne ou une équipe.")
    pt.update({"destinataires": targets, "equipe_id": equipe_id, "adresse_par": actor, "adresse_le": _now()})
    _save_points(procedure_id, meta, pts)
    title = f"Répondre : {pt.get('question', '')[:120]}"
    for uid in targets:
        _new_task(procedure_id, uid, actor, title, "consultation", {"open_point_id": point_id, "origine": "point_ouvert"},
                  raci_role="C")
        email_task(uid, title, procedure_id, actor)
    return pt


def answer(procedure_id: str, point_id: str, me: str, reponse: str) -> Dict[str, Any]:
    reponse = (reponse or "").strip()
    if not reponse:
        raise InboxError("La réponse est vide.")
    meta = _meta(procedure_id)
    pts = list(meta.get("open_points") or [])
    pt = next((p for p in pts if p.get("id") == point_id), None)
    if not pt:
        raise InboxError("Point ouvert introuvable", 404)
    raci = {r["user_id"] for r in _db().table("procedure_assignments").select("user_id,raci_role")
            .eq("procedure_id", procedure_id).execute().data or [] if r.get("raci_role") in ("R", "A")}
    if me not in (pt.get("destinataires") or []) and me not in raci:
        raise InboxError("Ce point ne vous est pas adressé.", 403)
    from manager.campaign_flow import person_name
    pt.update({"statut": "repondu", "reponse": reponse[:4000], "repondu_par": me,
               "repondu_par_nom": person_name(me), "repondu_le": _now()})
    _save_points(procedure_id, meta, pts)
    for t in _db().table("procedure_tasks").select("id,metadata,status").eq("procedure_id", procedure_id) \
            .in_("status", list(OPEN)).execute().data or []:
        if (t.get("metadata") or {}).get("open_point_id") == point_id:
            _db().table("procedure_tasks").update({"status": "completed", "completed_at": _now(), "updated_at": _now()}) \
                .eq("id", t["id"]).execute()
    return pt


# ── Relances, clôture, compteur ──────────────────────────────────────

def _org_param(name: str, default: Any) -> Any:
    from database.org_scope import current_org_id
    org = current_org_id()
    if not org:
        return default
    rows = _db().table("organisations").select("parametres").eq("id", org).limit(1).execute().data
    return ((rows[0].get("parametres") or {}) if rows else {}).get(name, default)


def remind(today: Optional[date] = None) -> int:
    """Relance UNE fois chaque tâche ouverte dont l'échéance approche. Idempotent."""
    from routers.orchestration_tasks_router import _notify
    today = today or datetime.now(timezone.utc).date()
    horizon = (today + timedelta(days=int(_org_param("relance_jours", 3)))).isoformat()
    rows = (_db().table("procedure_tasks").select("id,title,procedure_id,assigned_to,assigned_by,due_date,metadata,status")
            .in_("status", list(OPEN)).lte("due_date", horizon).execute().data or [])
    sent = 0
    for t in rows:
        meta = dict(t.get("metadata") or {})
        if not t.get("due_date") or meta.get("relance_le"):
            continue
        meta["relance_le"] = _now()
        _db().table("procedure_tasks").update({"metadata": meta}).eq("id", t["id"]).execute()
        late = str(t["due_date"])[:10] < today.isoformat()
        title = f"{'En retard' if late else 'Échéance proche'} : {t.get('title')}"
        _notify(t["assigned_to"], title, t["procedure_id"], t["id"], None, "warning")
        email_task(t["assigned_to"], title, t["procedure_id"], t.get("assigned_by"))
        sent += 1
    return sent


def cancel_campaign_tasks(campaign_id: str, motif: str = "Campagne clôturée") -> int:
    rows = _db().table("procedure_tasks").select("id,metadata,status").in_("status", list(OPEN)).execute().data or []
    n = 0
    for t in rows:
        if (t.get("metadata") or {}).get("campaign_id") == campaign_id:
            meta = {**(t.get("metadata") or {}), "annulation": motif}
            _db().table("procedure_tasks").update({"status": "cancelled", "metadata": meta, "updated_at": _now()}).eq("id", t["id"]).execute()
            n += 1
    return n


def counter(me: str, today: Optional[date] = None) -> Dict[str, int]:
    today = today or datetime.now(timezone.utc).date()
    rows = (_db().table("procedure_tasks").select("id,due_date,status").eq("assigned_to", me)
            .in_("status", ["todo", "in_progress", "changes_requested", "waiting_info", "blocked"]).execute().data or [])
    late = sum(1 for t in rows if t.get("due_date") and str(t["due_date"])[:10] < today.isoformat())
    return {"ouvertes": len(rows), "en_retard": late}

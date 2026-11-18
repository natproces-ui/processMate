"""
Du chat à la campagne : soumettre, relire, valider (prompt 6 de docs/prompts-organisations.md).

S'appuie sur le circuit de tâches EXISTANT (routers/orchestration_tasks_router.py) :
- R soumet (sa tâche formalisation/correction → submitted) : tâche « relire » pour C s'il
  y en a, sinon tâche « valider » pour A ;
- C transmet (sa tâche de relecture → submitted, vers A) ou renvoie (changes_requested,
  tâche « corriger » pour R) ;
- A valide (tâche de validation → validated : informés, cycle de vie) ou renvoie.
Ce module ajoute : l'acteur = le compte connecté (jamais un identifiant envoyé par le
client), seul l'assigné agit, A ne valide pas sa propre soumission (sauf paramètre
d'organisation « auto_validation »), la validation porte le NOM (figé) et la DATE, la
version validée est publiée, et l'emplacement de campagne suit chaque étape.

Les conversations ne sont jamais lues ici : le pilote voit des statuts, pas des échanges.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

OPEN = ("todo", "in_progress", "changes_requested", "waiting_info", "blocked")
SLOT_STATUS_FOR = {"soumise_c": "in_review", "soumise_a": "submitted", "renvoyee": "in_progress", "validee": "validated"}


class FlowError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def person_name(user_id: Optional[str]) -> Optional[str]:
    if not user_id:
        return None
    rows = _db().table("user_profiles").select("full_name,display_name,email").eq("id", user_id).limit(1).execute().data
    if not rows:
        return None
    p = rows[0]
    return p.get("full_name") or p.get("display_name") or p.get("email")


def _workflow(procedure_id: str) -> Dict[str, Any]:
    rows = (_db().table("workflows").select("id,title,procedure_metadata_json")
            .eq("id", procedure_id).limit(1).execute().data)
    if not rows:
        raise FlowError("Procédure introuvable", 404)
    return rows[0]


def _set_meta(procedure_id: str, **fields) -> Dict[str, Any]:
    wf = _workflow(procedure_id)
    meta = dict(wf.get("procedure_metadata_json") or {})
    flow = dict(meta.get("circuit") or {})
    flow.update({k: v for k, v in fields.items() if k != "validation"})
    meta["circuit"] = flow
    if "validation" in fields:
        meta["validation"] = fields["validation"]
    _db().table("workflows").update({"procedure_metadata_json": meta}).eq("id", procedure_id).execute()
    return meta


def _my_task(procedure_id: str, me: str, types: tuple) -> Dict[str, Any]:
    rows = (_db().table("procedure_tasks").select("*").eq("procedure_id", procedure_id).eq("assigned_to", me)
            .in_("status", list(OPEN)).execute().data or [])
    rows = [t for t in rows if t.get("task_type") in types]
    if not rows:
        raise FlowError("Aucune tâche de votre part n'attend cette action sur cette procédure.", 403)
    return sorted(rows, key=lambda t: t.get("created_at") or "")[-1]


def _raci(procedure_id: str) -> Dict[str, Any]:
    rows = _db().table("procedure_assignments").select("user_id,raci_role").eq("procedure_id", procedure_id).execute().data or []
    out: Dict[str, Any] = {"R": [], "A": None, "C": [], "I": []}
    for r in rows:
        if r.get("raci_role") == "A":
            out["A"] = r["user_id"]
        elif r.get("raci_role") in ("R", "C", "I"):
            out[r["raci_role"]].append(r["user_id"])
    return out


def slots_of(procedure_id: str) -> List[Dict[str, Any]]:
    return (_db().table("campaign_procedures").select("id,campaign_id,status,echeance,procedure_nom")
            .eq("procedure_id", procedure_id).execute().data or [])


def _sync_slots(procedure_id: str, step: str) -> None:
    status = SLOT_STATUS_FOR.get(step)
    if not status:
        return
    fields: Dict[str, Any] = {"status": status, "updated_at": _now()}
    if status == "validated":
        fields["completed_at"] = _now()
    for s in slots_of(procedure_id):
        try:
            _db().table("campaign_procedures").update(fields).eq("id", s["id"]).execute()
        except Exception as e:  # statut pas encore autorisé (migration du prompt 5)
            logger.warning(f"Statut d'emplacement non mis à jour : {str(e)[:120]}")


def _org_setting(name: str, default: Any = None) -> Any:
    from database.org_scope import current_org_id
    org = current_org_id()
    if not org:
        return default
    rows = _db().table("organisations").select("parametres").eq("id", org).limit(1).execute().data
    return ((rows[0].get("parametres") or {}) if rows else {}).get(name, default)


# ── Contexte (bandeau de l'éditeur) ──────────────────────────────────

def context(procedure_id: str, me: str) -> Dict[str, Any]:
    wf = _workflow(procedure_id)
    meta = wf.get("procedure_metadata_json") or {}
    raci = _raci(procedure_id)
    tasks = (_db().table("procedure_tasks").select("id,task_type,status,raci_role")
             .eq("procedure_id", procedure_id).eq("assigned_to", me).in_("status", list(OPEN)).execute().data or [])
    action = None
    for t in tasks:
        if t.get("task_type") == "validation":
            action = "valider"
        elif t.get("task_type") == "review" and action != "valider":
            action = "relire"
        elif t.get("task_type") in ("formalization", "correction") and action is None:
            action = "soumettre"
    campaign = None
    slots = slots_of(procedure_id)
    if slots:
        c = (_db().table("formalization_campaigns").select("id,title,end_date,status")
             .eq("id", slots[0]["campaign_id"]).limit(1).execute().data)
        if c:
            campaign = {**c[0], "emplacement_id": slots[0]["id"], "emplacement_statut": slots[0]["status"],
                        "echeance": slots[0].get("echeance") or c[0].get("end_date")}
    names = {uid: person_name(uid) for uid in set(raci["R"] + raci["C"] + raci["I"] + ([raci["A"]] if raci["A"] else []))}
    return {
        "procedure_id": procedure_id,
        "campagne": campaign,
        "raci": {"R": [{"id": u, "nom": names.get(u)} for u in raci["R"]],
                 "A": {"id": raci["A"], "nom": names.get(raci["A"])} if raci["A"] else None,
                 "C": [{"id": u, "nom": names.get(u)} for u in raci["C"]],
                 "I": [{"id": u, "nom": names.get(u)} for u in raci["I"]]},
        "mes_roles": [r for r in ("R", "A", "C", "I") if (me == raci["A"] if r == "A" else me in raci[r])],
        "action": action,
        "circuit": meta.get("circuit") or {},
        "validation": meta.get("validation"),
    }


# ── Actions ──────────────────────────────────────────────────────────

def _transition(task_id: str, status: str, me: str, message: Optional[str], payload: Dict[str, Any]):
    """Transition existante (tâches de relais, notifications, cycle de vie), acteur vérifié."""
    from routers.orchestration_tasks_router import TaskTransition, transition_task
    body = TaskTransition(actor_id=me, status=status, message=message, payload=payload)
    return transition_task(task_id, body, None, trusted_actor=me)


def submit(procedure_id: str, me: str, message: Optional[str] = None) -> Dict[str, Any]:
    """R : la version enregistrée part en relecture (C) ou en validation (A)."""
    task = _my_task(procedure_id, me, ("formalization", "correction", "other"))
    raci = _raci(procedure_id)
    if not raci["A"]:
        raise FlowError("Aucun valideur (A) n'est désigné pour cette procédure. Demandez-le au pilote de la campagne.")
    to_c = bool(raci["C"])
    if task.get("raci_role") != "R":
        _db().table("procedure_tasks").update({"raci_role": "R"}).eq("id", task["id"]).execute()
    _transition(task["id"], "submitted", me, message,
                {"override_recipient_role": "C" if to_c else "A", "transition_intent": "soumission_campagne"})
    if to_c:  # une tâche de relecture par C (la transition n'en crée qu'une, pour un destinataire)
        from routers.orchestration_tasks_router import _ensure_validation_tasks
        for c in raci["C"][1:]:
            _ensure_validation_tasks({**task, "raci_role": "R"}, me, message, c, "C")
    from manager import inbox
    for uid in (raci["C"] if to_c else [raci["A"]]):
        inbox.email_task(uid, f"{'Relire' if to_c else 'Valider'} : {_workflow(procedure_id).get('title')}", procedure_id, me)
    _set_meta(procedure_id, etape="en_relecture" if to_c else "soumise", soumise_par=me,
              soumise_par_nom=person_name(me), soumise_le=_now())
    _sync_slots(procedure_id, "soumise_c" if to_c else "soumise_a")
    _mark_version(procedure_id, "soumise", me)
    return context(procedure_id, me)


def review(procedure_id: str, me: str, decision: str, message: Optional[str] = None) -> Dict[str, Any]:
    """C : transmettre à A, ou renvoyer au rédacteur."""
    task = _my_task(procedure_id, me, ("review",))
    if decision == "transmettre":
        if not _raci(procedure_id)["A"]:
            raise FlowError("Aucun valideur (A) n'est désigné pour cette procédure.")
        _transition(task["id"], "submitted", me, message, {"override_recipient_role": "A"})
        from manager import inbox
        inbox.email_task(_raci(procedure_id)["A"], f"Valider : {_workflow(procedure_id).get('title')}", procedure_id, me)
        _set_meta(procedure_id, etape="soumise", relue_par=me, relue_par_nom=person_name(me), relue_le=_now())
        _sync_slots(procedure_id, "soumise_a")
    elif decision == "renvoyer":
        _transition(task["id"], "changes_requested", me, message, {"override_recipient_role": "R"})
        _set_meta(procedure_id, etape="a_corriger")
        _sync_slots(procedure_id, "renvoyee")
    else:
        raise FlowError("Décision inconnue")
    return context(procedure_id, me)


def validate(procedure_id: str, me: str, decision: str, message: Optional[str] = None) -> Dict[str, Any]:
    """A : valider (nom et date enregistrés, version publiée) ou renvoyer."""
    task = _my_task(procedure_id, me, ("validation",))
    if _raci(procedure_id)["A"] not in (me, None):
        raise FlowError("Seul le valideur (A) de la procédure peut la valider.", 403)
    if decision == "renvoyer":
        _transition(task["id"], "changes_requested", me, message, {"override_recipient_role": "R"})
        _set_meta(procedure_id, etape="a_corriger")
        _sync_slots(procedure_id, "renvoyee")
        return context(procedure_id, me)
    if decision != "valider":
        raise FlowError("Décision inconnue")
    circuit = (_workflow(procedure_id).get("procedure_metadata_json") or {}).get("circuit") or {}
    if circuit.get("soumise_par") == me and not _org_setting("auto_validation", False):
        raise FlowError("Vous ne pouvez pas valider une version que vous avez vous-même soumise.", 403)
    _transition(task["id"], "validated", me, message, {"transition_intent": "validation_campagne"})
    version = _mark_version(procedure_id, "validee", me, publish=True)
    validation = {"par": me, "nom": person_name(me) or "—", "le": _now(), "commentaire": message or "",
                  "version": (version or {}).get("version")}
    _set_meta(procedure_id, etape="validee", validation=validation)
    _sync_slots(procedure_id, "validee")
    from manager import access_control as ac
    from database.org_scope import current_org_id
    ac.audit("procedure.validee", None, current_org_id(), "procedure", procedure_id,
             {"par": me, "nom": validation["nom"], "version": validation["version"]}, actor_nom=validation["nom"])
    return context(procedure_id, me)


def _mark_version(procedure_id: str, statut: str, me: str, publish: bool = False) -> Optional[Dict[str, Any]]:
    """État de la dernière version (si l'historique des versions est actif). Ne lève jamais."""
    try:
        from manager import version_store
        if not version_store.enabled():
            return None
        rows = (_db().table("procedure_versions").select("id,version").eq("procedure_id", procedure_id)
                .order("version", desc=True).limit(1).execute().data)
        if not rows:
            return None
        v = rows[0]
        fields: Dict[str, Any] = {"statut": statut}
        if statut == "soumise":
            fields.update({"soumise_par": me, "soumise_le": _now()})
        if statut == "validee":
            fields.update({"validee_par": me, "validee_par_nom": person_name(me), "validee_le": _now()})
        if publish:
            _db().table("procedure_versions").update({"statut": "obsolete"}).eq("procedure_id", procedure_id) \
                .eq("statut", "publiee").execute()
            fields["statut"] = "publiee"
        _db().table("procedure_versions").update(fields).eq("id", v["id"]).execute()
        return v
    except Exception as e:
        logger.warning(f"État de version non enregistré : {str(e)[:120]}")
        return None

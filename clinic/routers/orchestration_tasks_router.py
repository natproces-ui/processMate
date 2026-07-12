"""
Router Suivi des taches ProcessMate.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
import threading
import uuid
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database.supabase_client import get_supabase
from config import FRONTEND_URL
from email_sender import send_task_email, send_tasks_digest_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/orchestration", tags=["Orchestration Tasks"])

TASK_STATUSES = {
    "todo", "in_progress", "submitted", "changes_requested",
    "waiting_info", "blocked", "completed", "validated", "cancelled",
}
TASK_PRIORITIES = {"low", "normal", "high", "urgent"}
TASK_TYPES = {"formalization", "review", "validation", "consultation", "information", "correction", "other"}
RACI_ROLES = {"R", "A", "C", "I"}

ALLOWED_TRANSITIONS = {
    "todo":              {"in_progress", "submitted", "changes_requested", "validated", "completed", "blocked", "cancelled"},
    "in_progress":       {"submitted", "changes_requested", "completed", "blocked", "cancelled"},
    "submitted":         {"changes_requested", "validated", "completed", "cancelled"},
    "changes_requested": {"in_progress", "submitted", "blocked", "cancelled"},
    "waiting_info":      {"in_progress", "submitted", "completed", "blocked", "cancelled"},
    "blocked":           {"in_progress", "cancelled"},
    "completed":         {"validated", "changes_requested"},
    "validated":         set(),
    "cancelled":         set(),
}


# ─── Modèles ──────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_to: str
    assigned_by: str
    raci_role: Optional[str] = None
    task_type: str = "other"
    priority: str = "normal"
    due_date: Optional[str] = None
    workflow_stage_id: Optional[str] = None
    workflow_step_id: Optional[str] = None
    metadata: Dict[str, Any] = {}
    force: bool = False

class BulkTaskItem(TaskCreate):
    procedure_id: str

class BulkTaskCreateRequest(BaseModel):
    tasks: List[BulkTaskItem]

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    raci_role: Optional[str] = None
    task_type: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    workflow_stage_id: Optional[str] = None
    workflow_step_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class TaskTransition(BaseModel):
    actor_id: str
    status: str
    message: Optional[str] = None
    payload: Dict[str, Any] = {}

class TaskCommentCreate(BaseModel):
    author_id: str
    comment: str
    visibility: str = "public"

class NotificationRead(BaseModel):
    actor_id: str


# ─── Helpers ──────────────────────────────────────────────────

def _now() -> str:
    return datetime.utcnow().isoformat()


def _validate_task_input(body: TaskCreate) -> None:
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Le titre de la tache est obligatoire")
    if body.raci_role and body.raci_role not in RACI_ROLES:
        raise HTTPException(status_code=400, detail=f"Role RACI invalide: {body.raci_role}")
    if body.task_type not in TASK_TYPES:
        raise HTTPException(status_code=400, detail=f"Type de tache invalide: {body.task_type}")
    if body.priority not in TASK_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Priorite invalide: {body.priority}")


def _get_task(task_id: str) -> Dict[str, Any]:
    db = get_supabase()
    result = db.table("procedure_tasks").select("*").eq("id", task_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tache introuvable")
    return result.data[0]


def _resolve_user_name(user_id: Optional[str]) -> str:
    """Retourne le nom lisible d'un utilisateur depuis son UUID."""
    if not user_id:
        return "Système"
    try:
        profile = get_supabase().table("user_profiles").select(
            "display_name, full_name, email"
        ).eq("id", user_id).execute().data
        if profile:
            p = profile[0]
            return p.get("display_name") or p.get("full_name") or p.get("email") or user_id
    except Exception:
        pass
    return user_id


def _get_admin_users() -> List[str]:
    """Retourne la liste des IDs des admins actifs."""
    try:
        rows = get_supabase().table("user_profiles").select("id").eq(
            "global_role", "admin"
        ).eq("status", "active").execute().data or []
        return [r["id"] for r in rows if r.get("id")]
    except Exception:
        return []


def _proc_event(
    procedure_id: str,
    event_type: str,
    actor_id: Optional[str] = None,
    task_id: Optional[str] = None,
    stage_id: Optional[str] = None,
    from_status: Optional[str] = None,
    to_status: Optional[str] = None,
    message: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> None:
    try:
        get_supabase().table("procedure_events").insert({
            "id": str(uuid.uuid4()),
            "procedure_id": procedure_id,
            "event_type": event_type,
            "from_status": from_status,
            "to_status": to_status,
            "actor_id": actor_id,
            "task_id": task_id,
            "stage_id": stage_id,
            "message": message,
            "payload": payload or {},
            "created_at": _now(),
        }).execute()
    except Exception as e:
        logger.warning(f"procedure_events insert failed ({event_type}): {e}")


def _advance_lifecycle_to(procedure_id: str, stage_idx: int, force_backward: bool = False) -> None:
    """Advance lifecycle_stages to stage_idx (in_progress), mark prior as completed, later as pending."""
    try:
        db = get_supabase()
        result = db.table("workflows").select("procedure_metadata_json").eq("id", procedure_id).execute()
        if not result.data:
            return
        meta = result.data[0].get("procedure_metadata_json") or {}
        stages = meta.get("lifecycle_stages", [])
        if not stages or stage_idx >= len(stages):
            return
        # Don't go backwards unless forced (e.g. correction)
        current_ip = next((i for i, s in enumerate(stages) if s.get("status") == "in_progress"), -1)
        if current_ip > stage_idx and not force_backward:
            return
        now = _now()
        for i, stage in enumerate(stages):
            if i < stage_idx:
                stage["status"] = "completed"
                if not stage.get("completed_at"):
                    stage["completed_at"] = now
            elif i == stage_idx:
                stage["status"] = "in_progress"
                stage["completed_at"] = None
            else:
                stage["status"] = "pending"
                stage["completed_at"] = None
        meta["lifecycle_stages"] = stages
        db.table("workflows").update({"procedure_metadata_json": meta}).eq("id", procedure_id).execute()
    except Exception as e:
        logger.warning(f"_advance_lifecycle_to({procedure_id}, {stage_idx}): {e}")


def _sync_procedure_status(
    procedure_id: str,
    task_status: str,
    message: Optional[str] = None,
    task_type: Optional[str] = None,
    transition_intent: Optional[str] = None,
    actor_id: Optional[str] = None,
) -> None:
    if task_status == "validated" and task_type != "validation":
        return

    if task_status == "submitted":
        next_status = "En vérification" if transition_intent == "submit_for_review" else "En validation"
    else:
        status_map = {
            "changes_requested": "Retours reçus",
            "blocked":           "Bloquée",
            "validated":         "Validée",
        }
        next_status = status_map.get(task_status)

    if not next_status:
        return
    db = get_supabase()
    result = db.table("workflows").select("procedure_metadata_json").eq("id", procedure_id).execute()
    if not result.data:
        return
    meta = result.data[0].get("procedure_metadata_json") or {}
    prev_status = meta.get("status")
    meta["status"] = next_status
    if message:
        meta["status_comment"] = message
    meta["updated_from_task_at"] = _now()
    db.table("workflows").update({"procedure_metadata_json": meta}).eq("id", procedure_id).execute()
    _proc_event(
        procedure_id=procedure_id,
        event_type="status_changed",
        actor_id=actor_id,
        from_status=prev_status,
        to_status=next_status,
        message=message,
        payload={"source": "task_transition", "task_status": task_status,
                 "actor": _resolve_user_name(actor_id) if actor_id else None},
    )


def _get_procedure_title(procedure_id: str) -> str:
    db = get_supabase()
    result = db.table("workflows").select("title, procedure_metadata_json").eq("id", procedure_id).execute()
    if not result.data:
        return "Procedure"
    row = result.data[0]
    meta = row.get("procedure_metadata_json") or {}
    return meta.get("nom") or row.get("title") or "Procedure"


def _role_label(raci_role: str) -> str:
    return {
        "R": "responsable",
        "A": "valideur",
        "C": "verificateur",
        "I": "informe",
    }.get(raci_role, "acteur")


def _handoff_spec(raci_role: str, procedure_title: str, message: Optional[str]) -> Dict[str, str]:
    if raci_role == "C":
        return {
            "task_type": "review",
            "event_type": "review_task_created",
            "title": f"Verifier la procedure: {procedure_title}",
            "description": message or "Verifier la coherence de la procedure puis soumettre la suite du parcours.",
            "notification": f"Nouvelle verification: {procedure_title}",
            "payload_key": "reviewer",
        }
    if raci_role == "A":
        return {
            "task_type": "validation",
            "event_type": "validation_task_created",
            "title": f"Valider la procedure: {procedure_title}",
            "description": message or "Verifier la procedure soumise, valider ou demander les corrections necessaires.",
            "notification": f"Nouvelle validation: {procedure_title}",
            "payload_key": "validator",
        }
    return {
        "task_type": "correction",
        "event_type": "correction_task_created",
        "title": f"Corriger la procedure: {procedure_title}",
        "description": message or "Traiter les corrections demandees puis resoumettre.",
        "notification": f"Corrections demandees: {procedure_title}",
        "payload_key": "responsible",
    }


def _get_raci_users(procedure_id: str, raci_role: str) -> List[str]:
    db = get_supabase()
    rows = (
        db.table("procedure_assignments")
        .select("user_id")
        .eq("procedure_id", procedure_id)
        .eq("raci_role", raci_role)
        .execute()
        .data or []
    )
    return [row["user_id"] for row in rows if row.get("user_id")]


def _upsert_raci_assignment(procedure_id: str, user_id: str, raci_role: str) -> None:
    """
    Synchronise procedure_assignments depuis la création d'une tâche.
    N'écrase pas un rôle déjà existant.
    """
    try:
        db = get_supabase()
        existing = db.table("procedure_assignments").select("id, raci_role").eq(
            "procedure_id", procedure_id
        ).eq("user_id", user_id).execute().data

        if existing:
            # Mettre à jour seulement si aucun rôle défini
            if not existing[0].get("raci_role"):
                db.table("procedure_assignments").update({
                    "raci_role": raci_role
                }).eq("id", existing[0]["id"]).execute()
        else:
            # Créer une nouvelle affectation
            db.table("procedure_assignments").insert({
                "id": str(uuid.uuid4()),
                "procedure_id": procedure_id,
                "user_id": user_id,
                "raci_role": raci_role,
                "assignment_type": "contributor",
                "is_required": True,
                "created_at": _now(),
            }).execute()
    except Exception as e:
        logger.warning(f"_upsert_raci_assignment failed: {e}")


def _event(
    procedure_id: str,
    event_type: str,
    task_id: Optional[str] = None,
    actor_id: Optional[str] = None,
    message: Optional[str] = None,
    from_status: Optional[str] = None,
    to_status: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> None:
    db = get_supabase()
    db.table("procedure_task_events").insert({
        "id": str(uuid.uuid4()),
        "task_id": task_id,
        "procedure_id": procedure_id,
        "actor_id": actor_id,
        "event_type": event_type,
        "message": message,
        "from_status": from_status,
        "to_status": to_status,
        "payload": payload or {},
        "created_at": _now(),
    }).execute()


def _notify(
    user_id: str,
    title: str,
    procedure_id: Optional[str] = None,
    task_id: Optional[str] = None,
    message: Optional[str] = None,
    type_: str = "task",
) -> None:
    try:
        get_supabase().table("procedure_notifications").insert({
            "id": str(uuid.uuid4()),
            "procedure_id": procedure_id,
            "user_id": user_id,
            "type": type_,
            "title": title,
            "body": message,
            "metadata": {"task_id": task_id} if task_id else {},
            "created_at": _now(),
        }).execute()
    except Exception:
        pass


def _ensure_validation_tasks(
    source_task: Dict[str, Any],
    actor_id: str,
    message: Optional[str] = None,
    override_recipient_id: Optional[str] = None,
    override_recipient_role: Optional[str] = None,
) -> None:
    """
    Crée une tâche de validation quand un R soumet.
    Si override_recipient_id → envoyer à cet utilisateur spécifiquement.
    Si aucun A dans le RACI → fallback notification aux admins.
    """
    if source_task.get("raci_role") not in {"R", "C"} and not override_recipient_id:
        return

    procedure_id = source_task["procedure_id"]
    procedure_title = _get_procedure_title(procedure_id)
    recipient_role = override_recipient_role if override_recipient_role in {"A", "C"} else "A"
    spec = _handoff_spec(recipient_role, procedure_title, message)

    # Déterminer les valideurs
    if override_recipient_id:
        validators = [override_recipient_id]
    else:
        validators = _get_raci_users(procedure_id, recipient_role)

    # Fallback : si aucun valideur trouvé → notifier les admins
    if not validators:
        admin_ids = _get_admin_users()
        for admin_id in admin_ids:
            _notify(
                admin_id,
                f"⚠ Soumission sans valideur RACI: {procedure_title}",
                procedure_id,
                source_task.get("id"),
                f"La procédure a été soumise mais aucun approbateur (A) n'est défini dans le RACI. Veuillez assigner un valideur.",
                "warning",
            )
        logger.warning(f"_ensure_validation_tasks: aucun A dans RACI pour {procedure_id}, admins notifiés")
        return

    db = get_supabase()
    now = _now()

    # Si le destinataire est explicitement choisi, toujours créer une nouvelle tâche.
    # Sinon, éviter les doublons pour les tâches actives (pas encore finalisées).
    if not override_recipient_id:
        existing_rows = (
            db.table("procedure_tasks")
            .select("assigned_to")
            .eq("procedure_id", procedure_id)
            .eq("raci_role", recipient_role)
            .eq("task_type", spec["task_type"])
            .in_("status", ["todo", "in_progress", "changes_requested", "waiting_info", "blocked"])
            .execute()
            .data or []
        )
        existing_validators = {row["assigned_to"] for row in existing_rows if row.get("assigned_to")}
    else:
        existing_validators = set()

    for validator_id in validators:
        if validator_id in existing_validators:
            _notify(validator_id, f"Procédure soumise pour validation: {procedure_title}",
                    procedure_id, source_task.get("id"), message, "task")
            continue

        task = {
            "id": str(uuid.uuid4()),
            "procedure_id": procedure_id,
            "title": spec["title"],
            "description": spec["description"],
            "assigned_to": validator_id,
            "assigned_by": actor_id,
            "raci_role": recipient_role,
            "task_type": spec["task_type"],
            "status": "todo",
            "priority": source_task.get("priority") or "normal",
            "due_date": source_task.get("due_date"),
            "workflow_stage_id": source_task.get("workflow_stage_id"),
            "workflow_step_id": source_task.get("workflow_step_id"),
            "metadata": {
                "source_task_id": source_task.get("id"),
                "source_task_role": source_task.get("raci_role"),
                "transition_intent": "submit_for_review" if recipient_role == "C" else "submit_for_validation",
            },
            "created_at": now,
            "updated_at": now,
        }
        result = db.table("procedure_tasks").insert(task).execute()
        created = result.data[0] if result.data else task

        # Sync RACI — utiliser le rôle override si fourni (ex: C pour vérifieur)
        _upsert_raci_assignment(procedure_id, validator_id, recipient_role)

        _event(procedure_id, spec["event_type"], created["id"], actor_id,
               f"Tâche de validation créée: {source_task.get('title')}", None, "todo",
               {"source_task_id": source_task.get("id"), "recipient_role": recipient_role})
        _proc_event(procedure_id=procedure_id, event_type=spec["event_type"],
                    actor_id=actor_id, task_id=created["id"],
                    message=f"Validation assignée à {_resolve_user_name(validator_id)}",
                    payload={spec["payload_key"]: _resolve_user_name(validator_id),
                             "recipient_role": recipient_role,
                             "source_task_id": source_task.get("id")})
        _notify(validator_id, spec["notification"],
                procedure_id, created["id"], message, "task")
        _fire_task_email(validator_id, actor_id, created, procedure_title, spec["task_type"], spec["description"])

    # Sync lifecycle stage once after all tasks are created
    if spec["event_type"] == "review_task_created":
        _advance_lifecycle_to(procedure_id, 2)
    elif spec["event_type"] == "validation_task_created":
        _advance_lifecycle_to(procedure_id, 3)


def _ensure_correction_tasks(
    validation_task: Dict[str, Any],
    actor_id: str,
    message: Optional[str] = None,
    override_recipient_id: Optional[str] = None,
    override_recipient_role: Optional[str] = None,
) -> None:
    """
    Crée une tâche de correction quand un A demande des corrections.
    Si override_recipient_id → envoyer à cet utilisateur spécifiquement.
    Si aucun R dans le RACI → fallback notification aux admins.
    """
    if validation_task.get("raci_role") not in {"A", "C"} and not override_recipient_id:
        return

    procedure_id = validation_task["procedure_id"]
    procedure_title = _get_procedure_title(procedure_id)
    recipient_role = override_recipient_role if override_recipient_role in {"R", "C"} else "R"
    spec = _handoff_spec(recipient_role, procedure_title, message)

    # Déterminer les responsables
    if override_recipient_id:
        responsibles = [override_recipient_id]
    else:
        responsibles = _get_raci_users(procedure_id, recipient_role)

    # Fallback : si aucun R trouvé → notifier les admins
    if not responsibles:
        admin_ids = _get_admin_users()
        for admin_id in admin_ids:
            _notify(
                admin_id,
                f"⚠ Correction sans responsable RACI: {procedure_title}",
                procedure_id,
                validation_task.get("id"),
                f"Des corrections ont été demandées mais aucun responsable (R) n'est défini dans le RACI.",
                "warning",
            )
        logger.warning(f"_ensure_correction_tasks: aucun R dans RACI pour {procedure_id}, admins notifiés")
        return

    db = get_supabase()
    now = _now()

    if not override_recipient_id:
        existing_rows = (
            db.table("procedure_tasks")
            .select("assigned_to")
            .eq("procedure_id", procedure_id)
            .eq("raci_role", recipient_role)
            .eq("task_type", spec["task_type"])
            .in_("status", ["todo", "in_progress", "changes_requested", "waiting_info", "blocked"])
            .execute()
            .data or []
        )
        existing_recipients = {row["assigned_to"] for row in existing_rows if row.get("assigned_to")}
    else:
        existing_recipients = set()

    for responsible_id in responsibles:
        if responsible_id in existing_recipients:
            _notify(responsible_id, spec["notification"],
                    procedure_id, validation_task.get("id"), message, "task")
            continue

        task = {
            "id": str(uuid.uuid4()),
            "procedure_id": procedure_id,
            "title": spec["title"],
            "description": spec["description"],
            "assigned_to": responsible_id,
            "assigned_by": actor_id,
            "raci_role": recipient_role,
            "task_type": spec["task_type"],
            "status": "todo",
            "priority": validation_task.get("priority") or "normal",
            "due_date": validation_task.get("due_date"),
            "workflow_stage_id": validation_task.get("workflow_stage_id"),
            "workflow_step_id": validation_task.get("workflow_step_id"),
            "metadata": {
                "source_task_id": validation_task.get("id"),
                "source_task_role": validation_task.get("raci_role"),
                "transition_intent": "return_to_review" if recipient_role == "C" else "request_correction",
            },
            "created_at": now,
            "updated_at": now,
        }
        result = db.table("procedure_tasks").insert(task).execute()
        created = result.data[0] if result.data else task

        # Sync RACI — utiliser le rôle override si fourni (ex: C pour re-vérification)
        _upsert_raci_assignment(procedure_id, responsible_id, recipient_role)

        _event(procedure_id, spec["event_type"], created["id"], actor_id,
               f"Correction demandée: {validation_task.get('title')}", None, "todo",
               {"source_task_id": validation_task.get("id"), "recipient_role": recipient_role})
        _proc_event(procedure_id=procedure_id, event_type=spec["event_type"],
                    actor_id=actor_id, task_id=created["id"],
                    message=f"Corrections envoyées à {_resolve_user_name(responsible_id)}",
                    payload={spec["payload_key"]: _resolve_user_name(responsible_id),
                             "recipient_role": recipient_role,
                             "source_task_id": validation_task.get("id"),
                             "reason": message or ""})
        if recipient_role == "C":
            _notify(responsible_id, spec["notification"],
                    procedure_id, created["id"], message, "task")
            _fire_task_email(responsible_id, actor_id, created, procedure_title, spec["task_type"], spec["description"])
            continue
        _notify(responsible_id, f"Corrections demandées: {procedure_title}",
                procedure_id, created["id"], message, "task")
        _fire_task_email(responsible_id, actor_id, created, procedure_title, spec["task_type"], spec["description"])

    # Sync lifecycle stage — corrections go backward
    if spec["event_type"] == "correction_task_created":
        _advance_lifecycle_to(procedure_id, 1, force_backward=True)
    elif spec["event_type"] == "review_task_created":
        _advance_lifecycle_to(procedure_id, 2, force_backward=True)


def _ensure_information_tasks(
    validated_task: Dict[str, Any],
    actor_id: str,
    message: Optional[str] = None,
) -> None:
    if validated_task.get("raci_role") != "A":
        return
    procedure_id = validated_task["procedure_id"]

    # Advance to Signature regardless of whether there are I-users to notify
    _advance_lifecycle_to(procedure_id, 4)

    informed_users = _get_raci_users(procedure_id, "I")
    if not informed_users:
        return
    db = get_supabase()
    procedure_title = _get_procedure_title(procedure_id)
    now = _now()
    for informed_id in informed_users:
        task = {
            "id": str(uuid.uuid4()),
            "procedure_id": procedure_id,
            "title": f"Prendre connaissance: {procedure_title}",
            "description": message or "La procédure a été validée. Merci d'en prendre connaissance.",
            "assigned_to": informed_id,
            "assigned_by": actor_id,
            "raci_role": "I",
            "task_type": "information",
            "status": "todo",
            "priority": "normal",
            "due_date": None,
            "workflow_stage_id": validated_task.get("workflow_stage_id"),
            "workflow_step_id": validated_task.get("workflow_step_id"),
            "metadata": {"source_task_id": validated_task.get("id")},
            "created_at": now,
            "updated_at": now,
        }
        result = db.table("procedure_tasks").insert(task).execute()
        created = result.data[0] if result.data else task
        _event(procedure_id, "information_task_created", created["id"], actor_id,
               f"Information après validation: {validated_task.get('title')}", None, "todo",
               {"source_task_id": validated_task.get("id")})
        _proc_event(procedure_id=procedure_id, event_type="procedure_validated",
                    actor_id=actor_id, task_id=created["id"], to_status="Validée",
                    message=f"Procédure validée, {_resolve_user_name(informed_id)} informé",
                    payload={"informed": _resolve_user_name(informed_id)})
        _notify(informed_id, f"Procédure validée: {procedure_title}",
                procedure_id, created["id"], message, "task")
        _fire_task_email(informed_id, actor_id, created, procedure_title, "information")


def _fire_task_email(
    user_id: str,
    assigned_by_id: str,
    task: Dict[str, Any],
    procedure_title: str,
    task_type: str,
    task_description: Optional[str] = None,
) -> None:
    """Récupère l'email du destinataire et envoie la notification en arrière-plan."""
    try:
        db = get_supabase()
        rows = db.table("user_profiles").select(
            "display_name, full_name, email"
        ).eq("id", user_id).execute().data
        if not rows:
            return
        p = rows[0]
        to_email = p.get("email") or ""
        if not to_email:
            return
        to_name = p.get("display_name") or p.get("full_name") or to_email
        assigned_by_name = _resolve_user_name(assigned_by_id)
        procedure_id = task.get("procedure_id", "")
        task_id = task.get("id", "")
        qs = f"tab=workspace&procedure_id={procedure_id}"
        if task_id:
            qs += f"&taskId={task_id}"
        ws_url = (
            f"{FRONTEND_URL}/orchestration?{qs}"
            if FRONTEND_URL and procedure_id else None
        )
        threading.Thread(
            target=send_task_email,
            kwargs={
                "to_email": to_email,
                "to_name": to_name,
                "assigned_by_name": assigned_by_name,
                "task_title": task.get("title", ""),
                "procedure_name": procedure_title,
                "task_type": task_type,
                "due_date": task.get("due_date"),
                "workspace_url": ws_url,
                "task_description": task_description,
            },
            daemon=True,
        ).start()
    except Exception as exc:
        logger.warning(f"_fire_task_email failed for user {user_id}: {exc}")


# ─── HELPERS ──────────────────────────────────────────────────

def _enrich_tasks_with_names(db, tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Batch-fetch user profiles and inject assigned_to_name / assigned_by_name."""
    user_ids = {t.get("assigned_to") for t in tasks if t.get("assigned_to")} | \
               {t.get("assigned_by") for t in tasks if t.get("assigned_by")}
    if not user_ids:
        return tasks
    profiles = db.table("user_profiles").select("id, display_name, full_name, email") \
        .in_("id", list(user_ids)).execute().data or []
    name_map = {
        p["id"]: p.get("display_name") or p.get("full_name") or p.get("email") or p["id"]
        for p in profiles
    }
    for t in tasks:
        if t.get("assigned_to"):
            t["assigned_to_name"] = name_map.get(t["assigned_to"], t["assigned_to"])
        if t.get("assigned_by"):
            t["assigned_by_name"] = name_map.get(t["assigned_by"], t["assigned_by"])
    return tasks


# ─── ENDPOINTS ────────────────────────────────────────────────

@router.get("/events")
async def list_recent_events(
    limit: int = 100,
    procedure_id: Optional[str] = None,
):
    """Journal global des événements inter-RACI (admin)."""
    try:
        db = get_supabase()
        query = (
            db.table("procedure_task_events")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
        )
        if procedure_id:
            query = query.eq("procedure_id", procedure_id)
        events: List[Dict[str, Any]] = query.execute().data or []

        # Batch-enrich actor names
        actor_ids = {e.get("actor_id") for e in events if e.get("actor_id")}
        if actor_ids:
            profiles = (
                db.table("user_profiles")
                .select("id, display_name, full_name, email")
                .in_("id", list(actor_ids))
                .execute()
                .data or []
            )
            name_map = {
                p["id"]: p.get("display_name") or p.get("full_name") or p.get("email") or p["id"]
                for p in profiles
            }
            for e in events:
                if e.get("actor_id"):
                    e["actor_name"] = name_map.get(e["actor_id"], e.get("actor_name") or "")

        # Batch-enrich task info (title, type, raci_role, procedure_name)
        task_ids = {e.get("task_id") for e in events if e.get("task_id")}
        if task_ids:
            tasks_rows = (
                db.table("procedure_tasks")
                .select("id, title, procedure_id, task_type, raci_role")
                .in_("id", list(task_ids))
                .execute()
                .data or []
            )
            task_map = {t["id"]: t for t in tasks_rows}

            proc_ids = {t.get("procedure_id") for t in tasks_rows if t.get("procedure_id")}
            if proc_ids:
                wfs = (
                    db.table("workflows")
                    .select("id, procedure_metadata_json")
                    .in_("id", list(proc_ids))
                    .execute()
                    .data or []
                )
                proc_name_map = {
                    w["id"]: (w.get("procedure_metadata_json") or {}).get("nom") or ""
                    for w in wfs
                }
            else:
                proc_name_map = {}

            for e in events:
                task_row = task_map.get(e.get("task_id", ""))
                if task_row:
                    e["task_title"] = task_row.get("title", "")
                    e["task_type"] = task_row.get("task_type", "")
                    e["raci_role"] = task_row.get("raci_role", "")
                    e["procedure_name"] = proc_name_map.get(task_row.get("procedure_id", ""), "")

        return {"success": True, "events": events, "total": len(events)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/tasks")
async def list_tasks(
    actor_id: Optional[str] = None,
    assigned_by: Optional[str] = None,
    procedure_id: Optional[str] = None,
    status: Optional[str] = None,
    role: Optional[str] = None,
    overdue_only: bool = False,
):
    try:
        db = get_supabase()
        query = db.table("procedure_tasks").select("*").order("created_at", desc=True)
        if actor_id:
            query = query.eq("assigned_to", actor_id)
        if assigned_by:
            query = query.eq("assigned_by", assigned_by)
        if procedure_id:
            query = query.eq("procedure_id", procedure_id)
        if status:
            query = query.eq("status", status)
        if role:
            query = query.eq("raci_role", role)
        tasks: List[Dict[str, Any]] = query.execute().data or []
        if overdue_only:
            now = _now()
            tasks = [t for t in tasks if t.get("due_date") and t["due_date"] < now
                     and t.get("status") not in {"completed", "validated", "cancelled"}]
        tasks = _enrich_tasks_with_names(db, tasks)
        return {"success": True, "tasks": tasks, "total": len(tasks)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/procedures/{procedure_id}/tasks")
async def get_procedure_tasks(procedure_id: str):
    try:
        db = get_supabase()
        rows = (
            db.table("procedure_tasks")
            .select("*")
            .eq("procedure_id", procedure_id)
            .order("created_at", desc=True)
            .execute()
            .data or []
        )
        rows = _enrich_tasks_with_names(db, rows)
        return {"success": True, "tasks": rows, "total": len(rows)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


def _create_task_core(procedure_id: str, body: TaskCreate, send_email: bool = True) -> Dict[str, Any]:
    _validate_task_input(body)
    try:
        db = get_supabase()
        now = _now()

        # Une tâche "modification" (créée depuis une proposition de l'analyse IA, porte
        # metadata.proposed_patch) n'est qu'un changement de champ précis et ciblé — pas
        # une prise en main de toute la procédure. Contrairement aux tâches de cycle de
        # vie (formalisation/vérification/validation/correction), plusieurs modifications
        # peuvent être en cours en parallèle, y compris pour des personnes différentes :
        # la règle "une seule tâche active à la fois" ne s'applique qu'aux tâches de cycle
        # de vie, où une seule personne doit travailler sur la procédure à la fois.
        is_modification_task = bool((body.metadata or {}).get("proposed_patch"))

        active_tasks: list = []
        if not is_modification_task:
            # Vérifier s'il y a des tâches de cycle de vie actives sur cette procédure —
            # les tâches modification en cours ne comptent pas comme un blocage.
            active_statuses = ["todo", "in_progress", "changes_requested"]
            active_tasks_raw = (
                db.table("procedure_tasks")
                .select("id, title, status, assigned_to, task_type, metadata")
                .eq("procedure_id", procedure_id)
                .in_("status", active_statuses)
                .execute()
                .data or []
            )
            active_tasks = [t for t in active_tasks_raw if not (t.get("metadata") or {}).get("proposed_patch")]

        if active_tasks and not body.force:
            names = [_resolve_user_name(t["assigned_to"]) for t in active_tasks]
            return {
                "success": False,
                "blocked": True,
                "active_tasks": [
                    {"id": t["id"], "title": t["title"], "status": t["status"],
                     "assigned_to_name": _resolve_user_name(t["assigned_to"]),
                     "task_type": t["task_type"]}
                    for t in active_tasks
                ],
                "message": f"Tâche(s) active(s) chez {', '.join(names)}. Forcer l'envoi annulera ces tâches.",
            }

        if active_tasks and body.force:
            for t in active_tasks:
                db.table("procedure_tasks").update({
                    "status": "cancelled", "updated_at": now,
                }).eq("id", t["id"]).execute()
                _event(procedure_id, "task_cancelled", t["id"], body.assigned_by,
                       f"Tâche annulée (réassignation forcée par admin): {t['title']}", t["status"], "cancelled")
                _proc_event(
                    procedure_id=procedure_id, event_type="task_force_cancelled",
                    actor_id=body.assigned_by, task_id=t["id"], to_status="cancelled",
                    message=f"Tâche annulée par admin — réassignation vers {_resolve_user_name(body.assigned_to)}",
                    payload={"cancelled_by": "admin_force", "new_assignee": body.assigned_to},
                )
            logger.info(f"⚠️ {len(active_tasks)} tâche(s) annulée(s) par force — procédure {procedure_id}")

        task = {
            "id": str(uuid.uuid4()),
            "procedure_id": procedure_id,
            "title": body.title.strip(),
            "description": (body.description or "").strip(),
            "assigned_to": body.assigned_to,
            "assigned_by": body.assigned_by,
            "raci_role": body.raci_role,
            "task_type": body.task_type,
            "status": "todo",
            "priority": body.priority,
            "due_date": body.due_date,
            "workflow_stage_id": body.workflow_stage_id,
            "workflow_step_id": body.workflow_step_id,
            "metadata": body.metadata,
            "created_at": now,
            "updated_at": now,
        }
        result = db.table("procedure_tasks").insert(task).execute()
        created = result.data[0] if result.data else task

        # Sync RACI automatique si raci_role fourni
        if body.raci_role and body.raci_role in RACI_ROLES:
            _upsert_raci_assignment(procedure_id, body.assigned_to, body.raci_role)

        _event(procedure_id, "task_created", created["id"], body.assigned_by,
               f"Tâche créée: {created['title']}", None, "todo")
        _proc_event(
            procedure_id=procedure_id,
            event_type="task_created",
            actor_id=body.assigned_by,
            task_id=created["id"],
            stage_id=body.workflow_stage_id,
            message=f"Tâche créée: {created['title']}",
            payload={
                "task_type": body.task_type,
                "raci_role": body.raci_role,
                "priority": body.priority,
                "assigned_to": _resolve_user_name(body.assigned_to),
            },
        )
        _notify(body.assigned_to, f"Nouvelle tâche: {created['title']}",
                procedure_id, created["id"], body.description)

        procedure_title = _get_procedure_title(procedure_id)
        if send_email:
            _fire_task_email(body.assigned_to, body.assigned_by, created, procedure_title, body.task_type, body.description)

        # Formalization task → move to Formalisation stage
        if body.task_type == "formalization":
            _advance_lifecycle_to(procedure_id, 1)

        return {"success": True, "task": created, "procedure_title": procedure_title}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/procedures/{procedure_id}/tasks")
async def create_task(procedure_id: str, body: TaskCreate):
    return _create_task_core(procedure_id, body, send_email=True)


@router.post("/tasks/bulk-create")
async def bulk_create_tasks(body: BulkTaskCreateRequest):
    """
    Crée plusieurs tâches en un seul appel (ex: sélection de plusieurs modifications
    proposées par l'analyse IA). Chaque tâche est créée indépendamment (résultat par
    item, un échec n'annule pas les autres), mais l'email n'est jamais envoyé tâche par
    tâche ici : si une même personne reçoit plusieurs tâches dans ce lot, un seul email
    récapitulatif lui est envoyé à la fin, groupé par destinataire.
    """
    results: List[Dict[str, Any]] = []
    created_by_assignee: Dict[str, List[Dict[str, Any]]] = {}
    assigned_by_id = body.tasks[0].assigned_by if body.tasks else None

    for item in body.tasks:
        try:
            result = _create_task_core(item.procedure_id, item, send_email=False)
            results.append(result)
            if result.get("success") and result.get("task"):
                created_by_assignee.setdefault(item.assigned_to, []).append({
                    "title": result["task"]["title"],
                    "procedure_name": result.get("procedure_title"),
                })
        except HTTPException as exc:
            results.append({"success": False, "message": exc.detail})

    if assigned_by_id:
        assigned_by_name = _resolve_user_name(assigned_by_id)
        workspace_url = f"{FRONTEND_URL}/orchestration?tab=workspace" if FRONTEND_URL else None
        for assignee_id, tasks_for_user in created_by_assignee.items():
            db = get_supabase()
            rows = db.table("user_profiles").select("display_name, full_name, email").eq("id", assignee_id).execute().data
            if not rows or not rows[0].get("email"):
                continue
            p = rows[0]
            to_email = p["email"]
            to_name = p.get("display_name") or p.get("full_name") or to_email
            threading.Thread(
                target=send_tasks_digest_email,
                kwargs={
                    "to_email": to_email, "to_name": to_name,
                    "assigned_by_name": assigned_by_name,
                    "tasks": tasks_for_user, "workspace_url": workspace_url,
                },
                daemon=True,
            ).start()

    return {
        "success": True,
        "results": results,
        "created_count": sum(1 for r in results if r.get("success")),
    }


@router.get("/tasks/my")
async def get_my_tasks(user_id: str):
    """All active tasks for a user, enriched with procedure + campaign info, sorted by due_date."""
    try:
        db = get_supabase()
        active_statuses = ["todo", "in_progress", "submitted", "changes_requested", "waiting_info", "blocked", "completed"]
        tasks: List[Dict[str, Any]] = (
            db.table("procedure_tasks")
            .select("*")
            .eq("assigned_to", user_id)
            .in_("status", active_statuses)
            .execute()
            .data or []
        )
        if not tasks:
            return {"success": True, "tasks": [], "total": 0}

        proc_ids = list({t["procedure_id"] for t in tasks if t.get("procedure_id")})
        proc_rows = (
            db.table("workflows")
            .select("id, title, procedure_metadata_json, taxonomy_id")
            .in_("id", proc_ids)
            .execute()
            .data or []
        )
        proc_map: Dict[str, Any] = {p["id"]: p for p in proc_rows}

        cp_rows = (
            db.table("campaign_procedures")
            .select("procedure_id, campaign_id")
            .in_("procedure_id", proc_ids)
            .execute()
            .data or []
        )
        proc_to_campaign: Dict[str, str] = {cp["procedure_id"]: cp["campaign_id"] for cp in cp_rows}

        campaign_ids = list(set(proc_to_campaign.values()))
        campaign_map: Dict[str, str] = {}
        if campaign_ids:
            c_rows = (
                db.table("campaigns").select("id, title")
                .in_("id", campaign_ids).execute().data or []
            )
            campaign_map = {c["id"]: c["title"] for c in c_rows}

        tax_map: Dict[str, Any] = {}
        if any(p.get("taxonomy_id") for p in proc_map.values()):
            all_nodes = (
                db.table("process_taxonomy")
                .select("id, name, level, parent_id")
                .execute()
                .data or []
            )
            tax_map = {n["id"]: n for n in all_nodes}

        def build_breadcrumb(taxonomy_id: Optional[str]) -> str:
            if not taxonomy_id or taxonomy_id not in tax_map:
                return ""
            parts: List[str] = []
            node = tax_map.get(taxonomy_id)
            while node:
                parts.insert(0, node["name"])
                parent_id = node.get("parent_id")
                node = tax_map.get(parent_id) if parent_id else None
            return " > ".join(parts)

        enriched: List[Dict[str, Any]] = []
        for t in tasks:
            proc = proc_map.get(t.get("procedure_id", ""), {})
            proc_meta = proc.get("procedure_metadata_json") or {}
            proc_name = proc_meta.get("nom") or proc.get("title") or "Procédure"
            taxonomy_id = proc.get("taxonomy_id")
            campaign_id = proc_to_campaign.get(t.get("procedure_id", ""))
            enriched.append({
                **t,
                "procedure_name": proc_name,
                "taxonomy_id": taxonomy_id,
                "taxonomy_breadcrumb": build_breadcrumb(taxonomy_id),
                "campaign_id": campaign_id,
                "campaign_name": campaign_map.get(campaign_id) if campaign_id else None,
            })

        enriched = _enrich_tasks_with_names(db, enriched)
        _prio = {"urgent": 0, "high": 1, "normal": 2, "low": 3}

        def _sort_key(t: Dict[str, Any]):
            return (0 if t.get("due_date") else 1, t.get("due_date") or "9999-99-99", _prio.get(t.get("priority", "normal"), 2))

        enriched.sort(key=_sort_key)
        return {"success": True, "tasks": enriched, "total": len(enriched)}
    except Exception as exc:
        logger.exception("get_my_tasks failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/tasks/{task_id}")
async def get_task(task_id: str):
    try:
        task = _get_task(task_id)
        task["procedure_name"] = _get_procedure_title(task.get("procedure_id", ""))
        db = get_supabase()
        rows = _enrich_tasks_with_names(db, [task])
        return {"success": True, "task": rows[0]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/tasks/{task_id}")
async def update_task(task_id: str, body: TaskUpdate):
    try:
        task = _get_task(task_id)
        updates = {key: value for key, value in body.model_dump().items() if value is not None}
        updates["updated_at"] = _now()
        if "raci_role" in updates and updates["raci_role"] not in RACI_ROLES:
            raise HTTPException(status_code=400, detail=f"Role RACI invalide: {updates['raci_role']}")
        if "task_type" in updates and updates["task_type"] not in TASK_TYPES:
            raise HTTPException(status_code=400, detail=f"Type invalide: {updates['task_type']}")
        if "priority" in updates and updates["priority"] not in TASK_PRIORITIES:
            raise HTTPException(status_code=400, detail=f"Priorité invalide: {updates['priority']}")
        db = get_supabase()
        result = db.table("procedure_tasks").update(updates).eq("id", task_id).execute()
        updated = result.data[0] if result.data else {**task, **updates}
        _event(task["procedure_id"], "task_updated", task_id, None, "Tâche mise à jour", payload=updates)
        return {"success": True, "task": updated}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/tasks/{task_id}/transition")
async def transition_task(task_id: str, body: TaskTransition):
    if body.status not in TASK_STATUSES:
        raise HTTPException(status_code=400, detail=f"Statut invalide: {body.status}")
    try:
        task = _get_task(task_id)
        current_status = task.get("status")
        status_changed = body.status != current_status
        allowed = ALLOWED_TRANSITIONS.get(current_status, set())
        if body.status != current_status and body.status not in allowed:
            raise HTTPException(status_code=400,
                detail=f"Transition invalide: {current_status} -> {body.status}")

        now = _now()
        updates: Dict[str, Any] = {"status": body.status, "updated_at": now}
        if body.status == "in_progress" and not task.get("started_at"):
            updates["started_at"] = now
        if body.status == "submitted":
            updates["submitted_at"] = now
        if body.status == "completed":
            updates["completed_at"] = now
        if body.status == "validated":
            updates["validated_at"] = now

        db = get_supabase()
        result = db.table("procedure_tasks").update(updates).eq("id", task_id).execute()
        updated = result.data[0] if result.data else {**task, **updates}

        # Lire le destinataire et son rôle (depuis RecipientPicker)
        override_recipient = body.payload.get("override_recipient_id")
        override_recipient_role = body.payload.get("override_recipient_role")

        _event(
            procedure_id=task["procedure_id"],
            task_id=task_id,
            actor_id=body.actor_id,
            event_type="task_transition",
            message=body.message,
            from_status=current_status,
            to_status=body.status,
            payload=body.payload,
        )
        _proc_event(
            procedure_id=task["procedure_id"],
            event_type=f"task_{body.status}",
            actor_id=body.actor_id,
            task_id=task_id,
            stage_id=task.get("workflow_stage_id"),
            from_status=current_status,
            to_status=body.status,
            message=body.message or f"{task.get('title', '')} → {body.status}",
            payload={
                "task_title": task.get("title"),
                "task_type": task.get("task_type"),
                "raci_role": task.get("raci_role"),
                "assigned_to": _resolve_user_name(task.get("assigned_to")),
                "assigned_by": _resolve_user_name(body.actor_id),
                **({"override_recipient": _resolve_user_name(override_recipient)} if override_recipient else {}),
                **{k: v for k, v in body.payload.items() if k != "override_recipient_id"},
            },
        )

        if status_changed:
            _sync_procedure_status(
                task["procedure_id"], body.status, body.message,
                updated.get("task_type"),
                body.payload.get("transition_intent"),
                body.actor_id,
            )

            if body.status == "submitted":
                _ensure_validation_tasks(updated, body.actor_id, body.message, override_recipient, override_recipient_role)
            if body.status == "changes_requested":
                _ensure_correction_tasks(updated, body.actor_id, body.message, override_recipient, override_recipient_role)
            if body.status == "validated":
                _ensure_information_tasks(updated, body.actor_id, body.message)
                if updated.get("task_type") == "validation":
                    _advance_lifecycle_to(task["procedure_id"], 4)

        if body.status in {"changes_requested", "validated", "submitted"}:
            _notify(task["assigned_to"], f"Tâche {body.status}: {task['title']}",
                    task["procedure_id"], task_id, body.message)

        return {"success": True, "task": updated}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/tasks/{task_id}/comments")
async def get_task_comments(task_id: str):
    try:
        _get_task(task_id)
        db = get_supabase()
        rows = (db.table("procedure_task_comments").select("*")
                .eq("task_id", task_id).order("created_at").execute().data or [])
        return {"success": True, "comments": rows, "total": len(rows)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/tasks/{task_id}/comments")
async def add_task_comment(task_id: str, body: TaskCommentCreate):
    if not body.comment.strip():
        raise HTTPException(status_code=400, detail="Le commentaire est obligatoire")
    try:
        task = _get_task(task_id)
        db = get_supabase()
        comment = {
            "id": str(uuid.uuid4()),
            "task_id": task_id,
            "procedure_id": task["procedure_id"],
            "author_id": body.author_id,
            "comment": body.comment.strip(),
            "visibility": body.visibility,
            "created_at": _now(),
        }
        result = db.table("procedure_task_comments").insert(comment).execute()
        created = result.data[0] if result.data else comment
        _event(task["procedure_id"], "comment_added", task_id, body.author_id, body.comment.strip())
        _proc_event(procedure_id=task["procedure_id"], event_type="comment_added",
                    actor_id=body.author_id, task_id=task_id,
                    message=body.comment.strip()[:200],
                    payload={"author": _resolve_user_name(body.author_id)})
        return {"success": True, "comment": created}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/tasks/{task_id}/events")
async def get_task_events(task_id: str):
    try:
        _get_task(task_id)
        db = get_supabase()
        rows = (db.table("procedure_task_events").select("*")
                .eq("task_id", task_id).order("created_at").execute().data or [])
        for row in rows:
            row["actor_name"] = _resolve_user_name(row.get("actor_id")) if row.get("actor_id") else "Systeme"
        return {"success": True, "events": rows, "total": len(rows)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/notifications")
async def list_notifications(user_id: str):
    try:
        db = get_supabase()
        rows = (db.table("procedure_notifications").select("*")
                .eq("user_id", user_id).order("created_at", desc=True).execute().data or [])
        return {"success": True, "notifications": rows, "total": len(rows)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, body: NotificationRead):
    try:
        db = get_supabase()
        db.table("procedure_notifications").update({"read_at": _now()}).eq(
            "id", notification_id).eq("user_id", body.actor_id).execute()
        return {"success": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/procedures/{procedure_id}/journey")
async def get_procedure_journey(procedure_id: str):
    try:
        db = get_supabase()
        events = (
            db.table("procedure_events")
            .select("*")
            .eq("procedure_id", procedure_id)
            .order("created_at", desc=False)
            .execute()
            .data or []
        )

        actor_ids = list({e["actor_id"] for e in events if e.get("actor_id")})
        actors_map: Dict[str, str] = {}
        if actor_ids:
            profiles = (
                db.table("user_profiles")
                .select("id, display_name, full_name, email")
                .in_("id", actor_ids)
                .execute()
                .data or []
            )
            actors_map = {
                p["id"]: p.get("display_name") or p.get("full_name") or p.get("email") or p["id"]
                for p in profiles
            }

        task_ids = list({e["task_id"] for e in events if e.get("task_id")})
        tasks_map: Dict[str, Dict] = {}
        if task_ids:
            tasks = (
                db.table("procedure_tasks")
                .select("id, title, task_type, raci_role, status, priority, assigned_to")
                .in_("id", task_ids)
                .execute()
                .data or []
            )
            tasks_map = {t["id"]: t for t in tasks}

        enriched = []
        for i, ev in enumerate(events):
            prev = events[i - 1] if i > 0 else None
            duration_seconds = None
            if prev:
                t1 = datetime.fromisoformat(prev["created_at"].replace("Z", "+00:00"))
                t2 = datetime.fromisoformat(ev["created_at"].replace("Z", "+00:00"))
                duration_seconds = int((t2 - t1).total_seconds())

            task = tasks_map.get(ev.get("task_id", "")) if ev.get("task_id") else None
            if task and task.get("assigned_to"):
                task = {**task, "assigned_to_name": _resolve_user_name(task["assigned_to"])}

            enriched.append({
                **ev,
                "actor_name": actors_map.get(ev.get("actor_id", ""), "Système"),
                "task": task,
                "duration_from_previous_seconds": duration_seconds,
            })

        # Récupérer le statut courant et les étapes du cycle de vie
        wf = db.table("workflows").select("procedure_metadata_json").eq("id", procedure_id).execute()
        meta = (wf.data[0].get("procedure_metadata_json") or {}) if wf.data else {}

        return {
            "success": True,
            "procedure_id": procedure_id,
            "events": enriched,
            "total": len(enriched),
            "current_status": meta.get("status"),
            "lifecycle_stages": meta.get("lifecycle_stages", []),
            "pause_reason": meta.get("pause_reason"),
            "arbitrage_reason": meta.get("arbitrage_reason"),
            "arbitrage_escalated_to": meta.get("arbitrage_escalated_to"),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

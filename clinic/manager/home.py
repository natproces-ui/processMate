"""
Accueil de l'organisation, adapté au rôle (page d'arrivée des membres).

- Tout membre : mes tâches (ouvertes, en retard, les prochaines), mes procédures (R ou A).
- Pilotage (admin, pilote) : ce qui attend une décision (propositions, validations, retards
  de l'équipe), l'avancement des campagnes en cours, l'état du référentiel.

Mêmes définitions que le compteur « À faire » (manager/inbox.counter). Tout passe par
get_supabase() : cloisonné par l'organisation.
"""
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from manager import access_control as ac

ACTIVE = ("todo", "in_progress", "changes_requested", "waiting_info", "blocked")
CAMPAIGN_OPEN = ("draft", "active", "on_hold")
DONE_SLOTS = ("formalized", "validated")


def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def _late(t: Dict[str, Any], today: str) -> bool:
    return bool(t.get("due_date")) and str(t["due_date"])[:10] < today


def _names(procedure_ids: List[str]) -> Dict[str, str]:
    if not procedure_ids:
        return {}
    rows = _db().table("workflows").select("id,title,procedure_metadata_json").in_("id", procedure_ids).execute().data or []
    return {w["id"]: (w.get("procedure_metadata_json") or {}).get("nom") or w.get("title") or "Procédure" for w in rows}


def my_tasks(me: str, today: str, limit: int = 6) -> Dict[str, Any]:
    rows = (_db().table("procedure_tasks").select("id,title,procedure_id,due_date,status,task_type")
            .eq("assigned_to", me).in_("status", list(ACTIVE)).execute().data or [])
    rows.sort(key=lambda t: (not _late(t, today), str(t.get("due_date") or "9999")))
    names = _names(list({t["procedure_id"] for t in rows[:limit] if t.get("procedure_id")}))
    return {
        "ouvertes": len(rows),
        "en_retard": sum(1 for t in rows if _late(t, today)),
        "prochaines": [{"id": t["id"], "titre": t.get("title"), "procedure_id": t.get("procedure_id"),
                        "procedure": names.get(t.get("procedure_id")), "echeance": t.get("due_date"),
                        "statut": t.get("status"), "en_retard": _late(t, today)} for t in rows[:limit]],
    }


def my_procedures(me: str, limit: int = 8) -> Dict[str, Any]:
    rows = (_db().table("procedure_assignments").select("procedure_id,raci_role").eq("user_id", me)
            .execute().data or [])
    roles: Dict[str, str] = {}
    for r in rows:
        if r.get("raci_role") in ("R", "A"):
            roles[r["procedure_id"]] = "A" if roles.get(r["procedure_id"]) == "A" or r["raci_role"] == "A" else "R"
    names = _names(list(roles)[:200])
    items = sorted(({"id": pid, "nom": names[pid], "role": role} for pid, role in roles.items() if pid in names),
                   key=lambda p: p["nom"].lower())
    return {"total": len(items), "liste": items[:limit]}


def steering(today: str) -> Dict[str, Any]:
    db = _db()
    propositions = len(db.table("procedure_propositions").select("id").eq("statut", "en_attente").execute().data or [])
    tasks = db.table("procedure_tasks").select("id,due_date,status,task_type").in_("status", list(ACTIVE) + ["submitted"]).execute().data or []
    validations = sum(1 for t in tasks if t.get("task_type") == "validation" and t.get("status") in ACTIVE)
    late = sum(1 for t in tasks if t.get("status") in ACTIVE and _late(t, today))
    camps = [c for c in db.table("formalization_campaigns").select("id,title,status,end_date").execute().data or []
             if c.get("status") in CAMPAIGN_OPEN]
    slots = db.table("campaign_procedures").select("campaign_id,status").execute().data or []
    campaigns = []
    for c in sorted(camps, key=lambda c: (c.get("status") != "active", str(c.get("end_date") or "9999"))):
        mine = [s for s in slots if s.get("campaign_id") == c["id"] and s.get("status") != "skipped"]
        done = sum(1 for s in mine if s.get("status") in DONE_SLOTS)
        campaigns.append({"id": c["id"], "titre": c.get("title"), "statut": c.get("status"), "echeance": c.get("end_date"),
                          "total": len(mine), "faites": done,
                          "avancement": round(100 * done / len(mine)) if mine else 0,
                          "en_retard": bool(c.get("end_date")) and str(c["end_date"])[:10] < today and done < len(mine)})
    from routers.taxonomy_router import referential_state
    return {"propositions": propositions, "validations": validations, "taches_en_retard": late,
            "campagnes": campaigns[:6], "referentiel": referential_state()}


def home(me: str, role: Optional[str], today: Optional[date] = None) -> Dict[str, Any]:
    day = (today or datetime.now(timezone.utc).date()).isoformat()
    out: Dict[str, Any] = {"role": role, "taches": my_tasks(me, day), "procedures": my_procedures(me)}
    if role in ac.MANAGERS:
        out["pilotage"] = steering(day)
    return out

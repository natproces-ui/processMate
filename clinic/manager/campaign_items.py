"""
Emplacements de campagne (prompt 5 de docs/prompts-organisations.md).

Un emplacement est une « procédure attendue » d'une campagne : titre, référence, branche
de taxonomie, équipe, échéance, statut, origine — et une procédure du référentiel quand
elle existe (procedure_id, facultatif). Stocké dans campaign_procedures (les lignes
existantes sont des emplacements déjà reliés).

RACI — une seule source de vérité :
- emplacement NON relié : campaign_procedures.raci {"R": [...], "A": "...", "C": [...], "I": [...]} ;
- emplacement relié : procedure_assignments de la procédure (raci_role), et raci = NULL.
  Le transfert se fait au rattachement (link).

Lancement : chaque emplacement non relié reçoit une procédure vide (brouillon) dans le
référentiel, puis une tâche « Formaliser » pour chacun de ses R. Ainsi le Studio, le RACI
et les tâches existants servent tels quels.

Toutes les requêtes passent par get_supabase() : cloisonnées par l'organisation.
"""

import logging
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

STATUSES = ("pending", "in_progress", "submitted", "in_review", "formalized", "validated", "skipped")
ORIGINES = ("referentiel", "document", "bian", "analyse", "proposition", "saisie")
RACI_TO_ASSIGNMENT = {"R": "contributor", "A": "validator", "C": "reviewer", "I": "observer"}
ITEM_FIELDS = ("procedure_nom", "procedure_ref", "taxonomy_id", "equipe_id", "echeance", "status", "notes", "origine")


class CampaignError(Exception):
    def __init__(self, message: str, status: int = 400, details: Any = None):
        super().__init__(message)
        self.status = status
        self.details = details


def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def norm(text: Optional[str]) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


# ── Lecture ──────────────────────────────────────────────────────────

def campaign(campaign_id: str) -> Dict[str, Any]:
    rows = _db().table("formalization_campaigns").select("*").eq("id", campaign_id).limit(1).execute().data
    if not rows:
        raise CampaignError("Campagne introuvable", 404)
    return rows[0]


def item(campaign_id: str, item_id: str) -> Dict[str, Any]:
    rows = (_db().table("campaign_procedures").select("*").eq("campaign_id", campaign_id)
            .eq("id", item_id).limit(1).execute().data)
    if not rows:
        raise CampaignError("Emplacement introuvable", 404)
    return rows[0]


def raci_of(it: Dict[str, Any]) -> Dict[str, Any]:
    """RACI d'un emplacement, lu à sa source unique."""
    if it.get("procedure_id"):
        rows = (_db().table("procedure_assignments").select("user_id,raci_role")
                .eq("procedure_id", it["procedure_id"]).execute().data or [])
        out: Dict[str, Any] = {"R": [], "A": None, "C": [], "I": []}
        for r in rows:
            role = r.get("raci_role")
            if role == "A":
                out["A"] = r["user_id"]
            elif role in ("R", "C", "I"):
                out[role].append(r["user_id"])
        return out
    raci = it.get("raci") or {}
    return {"R": list(raci.get("R") or []), "A": raci.get("A"), "C": list(raci.get("C") or []), "I": list(raci.get("I") or [])}


def items(campaign_id: str) -> List[Dict[str, Any]]:
    rows = (_db().table("campaign_procedures").select("*").eq("campaign_id", campaign_id)
            .order("created_at").execute().data or [])
    return [{**r, "raci": raci_of(r)} for r in rows]


# ── Validation ───────────────────────────────────────────────────────

def _members() -> set:
    from manager.access_control import org_member_ids
    m = org_member_ids(active_only=True)
    if m is not None:
        return set(m)
    return {u["id"] for u in _db().table("user_profiles").select("id").eq("status", "active").execute().data or []}


def validate_raci(raci: Dict[str, Any], members: Optional[set] = None) -> Dict[str, Any]:
    members = members if members is not None else _members()
    clean = {"R": list(dict.fromkeys(raci.get("R") or [])), "A": raci.get("A") or None,
             "C": list(dict.fromkeys(raci.get("C") or [])), "I": list(dict.fromkeys(raci.get("I") or []))}
    people = clean["R"] + clean["C"] + clean["I"] + ([clean["A"]] if clean["A"] else [])
    unknown = [p for p in people if p not in members]
    if unknown:
        raise CampaignError("Le RACI ne peut désigner que des membres actifs de l'organisation.", 400, unknown)
    return clean


def raci_problems(raci: Dict[str, Any]) -> List[str]:
    out = []
    if not raci.get("R"):
        out.append("aucun R")
    if not raci.get("A"):
        out.append("aucun A")
    return out


def _team_defaults(taxonomy_id: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """(équipe responsable de la branche, son responsable) — valeurs proposées par défaut."""
    if not taxonomy_id:
        return None, None
    b = _db().table("equipe_branches").select("equipe_id").eq("taxonomy_id", taxonomy_id).limit(1).execute().data
    if not b:
        return None, None
    t = _db().table("equipes").select("id,responsable_id").eq("id", b[0]["equipe_id"]).limit(1).execute().data
    return (t[0]["id"], t[0].get("responsable_id")) if t else (None, None)


def _safe_team_defaults(taxonomy_id: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    try:
        return _team_defaults(taxonomy_id)
    except Exception as e:  # équipes pas encore installées (migration du prompt 4)
        logger.info(f"Équipes indisponibles : {str(e)[:100]}")
        return None, None


# ── Création, modification ────────────────────────────────────────────

def duplicates(campaign_id: str, titles: List[str], refs: List[str]) -> List[Dict[str, Any]]:
    """Doublons probables : dans la campagne, ou dans le référentiel (même titre ou même référence)."""
    wanted_t = {norm(t) for t in titles if norm(t)}
    wanted_r = {norm(r) for r in refs if norm(r)}
    found = []
    for r in _db().table("campaign_procedures").select("id,procedure_nom,procedure_ref").eq("campaign_id", campaign_id).execute().data or []:
        if norm(r.get("procedure_nom")) in wanted_t or (r.get("procedure_ref") and norm(r["procedure_ref"]) in wanted_r):
            found.append({"ou": "campagne", "titre": r.get("procedure_nom"), "reference": r.get("procedure_ref")})
    for w in _db().table("workflows").select("id,title,procedure_metadata_json").execute().data or []:
        meta = w.get("procedure_metadata_json") or {}
        nom, ref = meta.get("nom") or w.get("title"), meta.get("ref")
        if norm(nom) in wanted_t or (ref and norm(ref) in wanted_r):
            found.append({"ou": "referentiel", "titre": nom, "reference": ref, "procedure_id": w["id"]})
    return found


def create_items(campaign_id: str, entries: List[Dict[str, Any]], actor_id: str, force: bool = False) -> Dict[str, Any]:
    camp = campaign(campaign_id)
    if camp.get("status") in ("completed", "archived"):
        raise CampaignError("Campagne close : ajout impossible.", 409)
    dups = duplicates(campaign_id, [e.get("titre") or "" for e in entries], [e.get("reference") or "" for e in entries])
    in_campaign = [d for d in dups if d["ou"] == "campagne"]
    if dups and not force:
        return {"created": [], "doublons": dups}
    existing_titles = {norm(d["titre"]) for d in in_campaign}
    existing_pids = {r["procedure_id"] for r in _db().table("campaign_procedures").select("procedure_id")
                     .eq("campaign_id", campaign_id).execute().data or [] if r.get("procedure_id")}
    members = _members()
    now = _now()
    rows = []
    for e in entries:
        titre = (e.get("titre") or "").strip()
        pid = e.get("procedure_id")
        if pid:
            w = _db().table("workflows").select("id,title,procedure_metadata_json,taxonomy_id").eq("id", pid).limit(1).execute().data
            if not w:
                raise CampaignError("Procédure introuvable", 404)
            meta = w[0].get("procedure_metadata_json") or {}
            titre = titre or meta.get("nom") or w[0].get("title") or "Procédure"
            e.setdefault("reference", meta.get("ref"))
            e.setdefault("taxonomy_id", w[0].get("taxonomy_id"))
            if pid in existing_pids:
                continue
        if not titre:
            raise CampaignError("Chaque emplacement doit avoir un titre.")
        if norm(titre) in existing_titles:
            continue  # même avec force, pas deux fois le même titre dans une campagne
        origine = e.get("origine") or ("referentiel" if pid else "saisie")
        if origine not in ORIGINES:
            raise CampaignError(f"Origine inconnue : {origine}")
        team_id, team_lead = _safe_team_defaults(e.get("taxonomy_id"))
        if e.get("raci"):
            raci = validate_raci(e["raci"], members)  # fourni : validé strictement
        else:  # proposé par défaut : seulement des membres actifs
            coord = camp.get("coordinator_id")
            raci = {"R": [team_lead] if team_lead in members else [], "A": coord if coord in members else None,
                    "C": [], "I": []}
        rows.append({
            "id": str(uuid.uuid4()), "campaign_id": campaign_id, "procedure_id": pid,
            "procedure_nom": titre[:300], "procedure_ref": (e.get("reference") or "")[:120],
            "taxonomy_id": e.get("taxonomy_id"), "equipe_id": e.get("equipe_id") or team_id,
            "echeance": e.get("echeance"), "status": "pending", "origine": origine,
            "notes": e.get("notes"), "raci": None if pid else raci, "created_at": now, "updated_at": now,
        })
        existing_titles.add(norm(titre))
    if rows:
        _db().table("campaign_procedures").insert(rows).execute()
        coord = camp.get("coordinator_id")
        for r in rows:  # emplacement relié dès la création : RACI porté par la procédure
            if r["procedure_id"] and coord in members and not raci_of(r)["A"]:
                current = raci_of(r)
                _write_assignments(r["procedure_id"], {**current, "A": coord})
        _touch(campaign_id)
    return {"created": [r["id"] for r in rows], "doublons": dups}


def update_item(campaign_id: str, item_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
    it = item(campaign_id, item_id)
    data = {k: v for k, v in fields.items() if k in ITEM_FIELDS}
    if "status" in data and data["status"] not in STATUSES:
        raise CampaignError(f"Statut inconnu : {data['status']}")
    if data.get("status") in ("formalized", "validated") and not it.get("completed_at"):
        data["completed_at"] = _now()
    if "procedure_id" in fields and fields["procedure_id"] != it.get("procedure_id"):
        link(campaign_id, item_id, fields["procedure_id"])
    if data:
        data["updated_at"] = _now()
        _db().table("campaign_procedures").update(data).eq("id", item_id).execute()
        _touch(campaign_id)
    return item(campaign_id, item_id)


def _write_assignments(procedure_id: str, raci: Dict[str, Any]) -> None:
    db = _db()
    existing = db.table("procedure_assignments").select("user_id,raci_role").eq("procedure_id", procedure_id).execute().data or []
    db.table("procedure_assignments").delete().eq("procedure_id", procedure_id).execute()
    keep = [r for r in existing if not r.get("raci_role")]  # affectations hors RACI conservées
    rows = [{"procedure_id": procedure_id, "user_id": r["user_id"], "raci_role": None,
             "assignment_type": "contributor"} for r in keep]
    for role in ("R", "C", "I"):
        for uid in raci.get(role) or []:
            rows.append({"procedure_id": procedure_id, "user_id": uid, "raci_role": role,
                         "assignment_type": RACI_TO_ASSIGNMENT[role]})
    if raci.get("A"):
        rows.append({"procedure_id": procedure_id, "user_id": raci["A"], "raci_role": "A", "assignment_type": "validator"})
    if rows:
        db.table("procedure_assignments").insert(rows).execute()


def set_raci(campaign_id: str, item_ids: List[str], raci: Dict[str, Any], partial: bool = False) -> int:
    """RACI d'un ou plusieurs emplacements (actions en masse). partial : seuls les rôles fournis changent."""
    members = _members()
    count = 0
    for iid in item_ids:
        it = item(campaign_id, iid)
        current = raci_of(it)
        target = {**current, **{k: v for k, v in raci.items() if k in ("R", "A", "C", "I")}} if partial else raci
        clean = validate_raci(target, members)
        if it.get("procedure_id"):
            _write_assignments(it["procedure_id"], clean)
        else:
            _db().table("campaign_procedures").update({"raci": clean, "updated_at": _now()}).eq("id", iid).execute()
        count += 1
    _touch(campaign_id)
    return count


def link(campaign_id: str, item_id: str, procedure_id: Optional[str]) -> None:
    """Relie (ou délie) un emplacement à une procédure. Le RACI suit sa source unique."""
    it = item(campaign_id, item_id)
    db = _db()
    if procedure_id:
        if not db.table("workflows").select("id").eq("id", procedure_id).limit(1).execute().data:
            raise CampaignError("Procédure introuvable", 404)
        taken = (db.table("campaign_procedures").select("id").eq("campaign_id", campaign_id)
                 .eq("procedure_id", procedure_id).execute().data or [])
        if any(t["id"] != item_id for t in taken):
            raise CampaignError("Cette procédure est déjà reliée à un autre emplacement de la campagne.", 409)
        pending = raci_of({**it, "procedure_id": None}) if not it.get("procedure_id") else None
        db.table("campaign_procedures").update({"procedure_id": procedure_id, "raci": None, "updated_at": _now()}).eq("id", item_id).execute()
        if pending and (pending["R"] or pending["A"] or pending["C"] or pending["I"]):
            _write_assignments(procedure_id, pending)
    else:
        current = raci_of(it)
        db.table("campaign_procedures").update({"procedure_id": None, "raci": current, "updated_at": _now()}).eq("id", item_id).execute()


def delete_item(campaign_id: str, item_id: str) -> None:
    item(campaign_id, item_id)
    _db().table("campaign_procedures").delete().eq("id", item_id).execute()
    _touch(campaign_id)


def _touch(campaign_id: str) -> None:
    _db().table("formalization_campaigns").update({"updated_at": _now()}).eq("id", campaign_id).execute()


# ── Lancement ────────────────────────────────────────────────────────

def launch_problems(campaign_id: str) -> List[Dict[str, Any]]:
    camp = campaign(campaign_id)
    out: List[Dict[str, Any]] = []
    if not camp.get("end_date"):
        out.append({"emplacement": None, "probleme": "la campagne n'a pas d'échéance"})
    its = [i for i in items(campaign_id) if i.get("status") != "skipped"]
    if not its:
        out.append({"emplacement": None, "probleme": "aucun emplacement"})
    for i in its:
        for p in raci_problems(i["raci"]):
            out.append({"emplacement": i["id"], "titre": i.get("procedure_nom"), "probleme": p})
    return out


def launch(campaign_id: str, actor_id: str, create_shell, create_task) -> Dict[str, Any]:
    """Lance la campagne. create_shell(nom, ref, taxonomy_id) → procedure_id ;
    create_task(procedure_id, assigned_to, assigned_by, titre, echeance, metadata) → dict."""
    camp = campaign(campaign_id)
    if camp.get("status") not in ("draft", None):
        raise CampaignError("Seule une campagne en brouillon peut être lancée.", 409)
    problems = launch_problems(campaign_id)
    if problems:
        raise CampaignError("La campagne ne peut pas encore être lancée.", 400, problems)
    created_procs, tasks, skipped = 0, 0, []
    for it in items(campaign_id):
        if it.get("status") == "skipped":
            continue
        if not it.get("procedure_id"):
            pid = create_shell(it.get("procedure_nom") or "Procédure", it.get("procedure_ref") or None, it.get("taxonomy_id"))
            link(campaign_id, it["id"], pid)
            created_procs += 1
            it = item(campaign_id, it["id"])
        raci = raci_of(it)
        for r in raci["R"]:
            res = create_task(it["procedure_id"], r, actor_id, f"Formaliser : {it.get('procedure_nom')}",
                              it.get("echeance") or camp.get("end_date"),
                              {"campaign_id": campaign_id, "emplacement_id": it["id"], "origine": "lancement_campagne"})
            if res.get("success"):
                tasks += 1
            else:
                skipped.append({"emplacement": it["id"], "titre": it.get("procedure_nom"), "raison": res.get("message")})
    _db().table("formalization_campaigns").update({"status": "active", "updated_at": _now()}).eq("id", campaign_id).execute()
    return {"procedures_creees": created_procs, "taches_creees": tasks, "taches_non_creees": skipped}

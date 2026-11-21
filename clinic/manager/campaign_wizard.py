"""
Créer une campagne guidée (accueil de l'organisation, lot 4 de l'arrivée).

L'admin ou le pilote choisit des branches ou des procédures du référentiel ; pour chacune on
propose le RACI : celui de la procédure s'il existe, sinon le responsable de l'équipe rattachée
à sa branche (ou à une branche parente) en R, et le pilote de la campagne en A. Puis la campagne
est créée (emplacements reliés aux procédures) et, si on le demande, lancée — avec les mêmes
vérifications que le lancement habituel (échéance, un R et un A partout).

Toutes les requêtes passent par get_supabase() : cloisonnées par l'organisation.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from manager import campaign_items as ci

OPEN = ("draft", "active", "on_hold")


def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def _members() -> set:
    return ci._members()


def _team_by_branch() -> Dict[str, Dict[str, Any]]:
    """{taxonomy_id: équipe} ; vide si les équipes ne sont pas installées."""
    try:
        teams = {t["id"]: t for t in _db().table("equipes").select("id,nom,responsable_id").execute().data or []}
        links = _db().table("equipe_branches").select("equipe_id,taxonomy_id").execute().data or []
    except Exception:
        return {}
    return {l["taxonomy_id"]: teams[l["equipe_id"]] for l in links if l.get("equipe_id") in teams}


def suggest(procedure_ids: List[str], coordinator_id: Optional[str]) -> List[Dict[str, Any]]:
    db = _db()
    members = _members()
    coord = coordinator_id if coordinator_id in members else None
    wfs = {w["id"]: w for w in db.table("workflows").select("id,title,taxonomy_id,procedure_metadata_json")
           .in_("id", procedure_ids).execute().data or []} if procedure_ids else {}
    nodes = {n["id"]: n for n in db.table("process_taxonomy").select("id,parent_id,name").execute().data or []}
    teams = _team_by_branch()
    assigns: Dict[str, Dict[str, Any]] = {}
    if procedure_ids:
        for a in db.table("procedure_assignments").select("procedure_id,user_id,raci_role").in_("procedure_id", procedure_ids).execute().data or []:
            r = assigns.setdefault(a["procedure_id"], {"R": [], "A": None, "C": [], "I": []})
            if a.get("raci_role") == "A":
                r["A"] = a["user_id"]
            elif a.get("raci_role") in ("R", "C", "I"):
                r[a["raci_role"]].append(a["user_id"])
    open_camps = {c["id"]: c["title"] for c in db.table("formalization_campaigns").select("id,title,status").execute().data or []
                  if c.get("status") in OPEN}
    in_camp: Dict[str, List[str]] = {}
    for s in db.table("campaign_procedures").select("campaign_id,procedure_id").execute().data or []:
        if s.get("procedure_id") in wfs and s.get("campaign_id") in open_camps:
            in_camp.setdefault(s["procedure_id"], []).append(open_camps[s["campaign_id"]])

    out = []
    for pid in procedure_ids:
        w = wfs.get(pid)
        if not w:
            continue
        path, team, cur = [], None, nodes.get(w.get("taxonomy_id"))
        while cur:
            path.insert(0, cur["name"])
            team = team or teams.get(cur["id"])  # l'équipe de la branche la plus proche
            cur = nodes.get(cur.get("parent_id"))
        current = assigns.get(pid)
        if current and (current["R"] or current["A"]):
            raci, source = {**current, "A": current["A"] or coord}, "procedure"
        elif team and team.get("responsable_id") in members:
            raci, source = {"R": [team["responsable_id"]], "A": coord, "C": [], "I": []}, "equipe"
        else:
            raci, source = {"R": [], "A": coord, "C": [], "I": []}, "aucune"
        out.append({"procedure_id": pid, "titre": (w.get("procedure_metadata_json") or {}).get("nom") or w.get("title"),
                    "chemin": " › ".join(path), "equipe": team["nom"] if team else None, "raci": raci,
                    "source": source, "deja_en_campagne": in_camp.get(pid, [])})
    return out


def create(title: str, description: Optional[str], end_date: Optional[str], coordinator_id: Optional[str],
           entries: List[Dict[str, Any]], actor_id: str) -> Dict[str, Any]:
    """Crée la campagne (brouillon), ses emplacements reliés et leur RACI. Renvoie la campagne."""
    if not entries:
        raise ci.CampaignError("Choisissez au moins une procédure.")
    members = _members()
    if coordinator_id and coordinator_id not in members:
        raise ci.CampaignError("Le pilote doit être un membre actif de l'organisation.")
    for e in entries:  # vérifié avant toute écriture
        if e.get("raci"):
            e["raci"] = ci.validate_raci(e["raci"], members)
    now = datetime.now(timezone.utc).isoformat()
    camp = _db().table("formalization_campaigns").insert({
        "id": str(uuid.uuid4()), "title": title.strip(), "description": description, "status": "draft",
        "end_date": end_date, "coordinator_id": coordinator_id or actor_id, "created_at": now, "updated_at": now,
    }).execute().data[0]
    try:
        # force : des procédures du référentiel « en doublon » d'elles-mêmes ne sont pas des doublons
        ci.create_items(camp["id"], [{"procedure_id": e["procedure_id"], "origine": "referentiel"} for e in entries],
                        actor_id, force=True)
        by_pid = {it["procedure_id"]: it["id"] for it in ci.items(camp["id"]) if it.get("procedure_id")}
        for e in entries:
            if e.get("raci") and e["procedure_id"] in by_pid:
                ci.set_raci(camp["id"], [by_pid[e["procedure_id"]]], e["raci"])
    except Exception:
        _db().table("campaign_procedures").delete().eq("campaign_id", camp["id"]).execute()
        _db().table("formalization_campaigns").delete().eq("id", camp["id"]).execute()  # rien de moitié créé
        raise
    return camp

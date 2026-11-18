"""
Couverture BIAN par organisation (prompt 7).

Le catalogue (bian_scenarios) est COMMUN, géré par la plateforme. Chaque organisation relie
ses procédures à des domaines de service BIAN (procedure_bian, cloisonnée) :
- saisie manuelle (acceptée d'emblée) ;
- suggestion de l'assistant (statut « suggere ») : jamais appliquée seule, à accepter.
Couverture d'un domaine : « couvert » si une procédure validée y est reliée, « en cours » si
une procédure non validée ou un emplacement de campagne l'est, « non couvert » sinon.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class BianError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def catalogue() -> Dict[str, Dict[str, Any]]:
    """Domaines de service du catalogue {nom: {categories, scenarios}} (dernière version)."""
    rows = _db().table("bian_scenarios").select("version,title,category,participants").execute().data or []
    if not rows:
        return {}
    latest = max(r.get("version") or "" for r in rows)
    out: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        if (r.get("version") or "") != latest:
            continue
        for d in r.get("participants") or []:
            e = out.setdefault(d, {"categories": set(), "scenarios": 0})
            if r.get("category"):
                e["categories"].add(r["category"])
            e["scenarios"] += 1
    return {k: {"categories": sorted(v["categories"]), "scenarios": v["scenarios"]} for k, v in out.items()}


def mappings(procedure_id: str) -> List[Dict[str, Any]]:
    return (_db().table("procedure_bian").select("id,domaine,statut,source,created_at")
            .eq("procedure_id", procedure_id).execute().data or [])


def add(procedure_id: str, domaine: str, actor: str, statut: str = "accepte", source: str = "manuel") -> Dict[str, Any]:
    if domaine not in catalogue():
        raise BianError("Domaine de service inconnu du catalogue BIAN.")
    if not _db().table("workflows").select("id").eq("id", procedure_id).limit(1).execute().data:
        raise BianError("Procédure introuvable", 404)
    existing = [m for m in mappings(procedure_id) if m["domaine"] == domaine]
    if existing:
        if statut == "accepte" and existing[0]["statut"] != "accepte":
            _db().table("procedure_bian").update({"statut": "accepte"}).eq("id", existing[0]["id"]).execute()
        return existing[0]
    return _db().table("procedure_bian").insert({"procedure_id": procedure_id, "domaine": domaine, "statut": statut,
                                                 "source": source, "created_by": actor}).execute().data[0]


def decide(mapping_id: str, accept: bool) -> None:
    rows = _db().table("procedure_bian").select("id").eq("id", mapping_id).limit(1).execute().data
    if not rows:
        raise BianError("Correspondance introuvable", 404)
    if accept:
        _db().table("procedure_bian").update({"statut": "accepte"}).eq("id", mapping_id).execute()
    else:
        _db().table("procedure_bian").delete().eq("id", mapping_id).execute()


def suggest(procedure_id: str, actor: str, max_items: int = 3) -> List[Dict[str, Any]]:
    """L'assistant propose des domaines (statut « suggere », à accepter). Jamais appliqué seul."""
    domains = sorted(catalogue())
    if not domains:
        return []
    wf = _db().table("workflows").select("title,workflow_json,procedure_metadata_json").eq("id", procedure_id).limit(1).execute().data
    if not wf:
        raise BianError("Procédure introuvable", 404)
    steps = [str(s.get("étape") or "") for s in (wf[0].get("workflow_json") or [])][:40]
    prompt = (
        "Tu relies une procédure bancaire aux domaines de service BIAN. Réponds UNIQUEMENT par un tableau JSON "
        f"d'au plus {max_items} noms EXACTS pris dans la liste fournie, du plus pertinent au moins pertinent.\n"
        f"Procédure : {wf[0].get('title')}\nÉtapes : {' ; '.join(s for s in steps if s)}\n"
        f"Domaines BIAN : {json.dumps(domains, ensure_ascii=False)}"
    )
    from manager.model_manager import generate_content
    from manager.model_routing import TaskKind, routing_scope
    with routing_scope(TaskKind.SYNTHESE_COURTE, ["texte"]):
        text = generate_content(prompt, task_name="Suggestion BIAN").text or ""
    match = re.search(r"\[[\s\S]*\]", text)
    try:
        names = [n for n in json.loads(match.group(0)) if isinstance(n, str)] if match else []
    except Exception:
        names = []
    known = set(domains)
    out = []
    for n in names[:max_items]:
        if n in known:
            out.append(add(procedure_id, n, actor, statut="suggere", source="assistant"))
    return out


def coverage() -> List[Dict[str, Any]]:
    cat = catalogue()
    maps = _db().table("procedure_bian").select("procedure_id,domaine").eq("statut", "accepte").execute().data or []
    pids = list({m["procedure_id"] for m in maps})
    validated = set()
    if pids:
        for w in _db().table("workflows").select("id,procedure_metadata_json").in_("id", pids).execute().data or []:
            if (w.get("procedure_metadata_json") or {}).get("validation"):
                validated.add(w["id"])
    in_campaign = {s["procedure_id"] for s in _db().table("campaign_procedures").select("procedure_id,status")
                   .execute().data or [] if s.get("procedure_id") and s.get("status") not in ("validated", "skipped")}
    slots_bian = {norm for norm in (s.get("procedure_nom") for s in _db().table("campaign_procedures")
                  .select("procedure_nom,origine,status").eq("origine", "bian").execute().data or []
                  if s.get("status") not in ("validated", "skipped")) if norm}
    by_domain: Dict[str, List[str]] = {}
    for m in maps:
        by_domain.setdefault(m["domaine"], []).append(m["procedure_id"])
    out = []
    for name, info in sorted(cat.items()):
        procs = by_domain.get(name, [])
        if any(p in validated for p in procs):
            state = "couvert"
        elif procs or name in slots_bian or any(p in in_campaign for p in procs):
            state = "en_cours"
        else:
            state = "non_couvert"
        out.append({"domaine": name, "categories": info["categories"], "etat": state, "procedures": len(procs)})
    return out


def slots_from_gaps(campaign_id: str, domaines: List[str], actor: str) -> Dict[str, Any]:
    """Emplacements de campagne pour des domaines non couverts (origine BIAN)."""
    from manager import campaign_items
    cat = catalogue()
    unknown = [d for d in domaines if d not in cat]
    if unknown:
        raise BianError(f"Domaines inconnus : {', '.join(unknown[:5])}")
    entries = [{"titre": d, "origine": "bian", "notes": "Domaine de service BIAN non couvert"} for d in domaines]
    return campaign_items.create_items(campaign_id, entries, actor, force=True)

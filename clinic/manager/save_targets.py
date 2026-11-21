"""
Où enregistrer une procédure (depuis le chat ou le Studio).

L'utilisateur parcourt ses campagnes comme des dossiers (campagne › thème › catégorie ›
sous-catégorie › procédures), puis, en dessous, les thèmes hors campagne. Il met à jour une
procédure existante, ou propose une nouvelle procédure à un endroit de la taxonomie.

Règle d'écriture : l'admin et le pilote écrivent partout ; un contributeur seulement dans
les procédures où il est R ou A (RACI) ; un lecteur nulle part. La même règle sert à
l'arbre (ce qu'on voit) et au serveur (ce qu'on peut enregistrer).

Toutes les requêtes passent par get_supabase() : cloisonnées par l'organisation.
"""

import logging
import re
import unicodedata
from typing import Any, Dict, Iterable, List, Optional, Set

from manager import access_control as ac

logger = logging.getLogger(__name__)

# Campagnes affichées mais où l'on n'enregistre plus
READ_ONLY = frozenset({"completed", "archived", "blocked"})
WRITE_ROLES = frozenset({"R", "A"})


def _db():
    from database.supabase_client import get_supabase
    return get_supabase()


def _norm(text: Optional[str]) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


_STOP = {"de", "du", "des", "la", "le", "les", "l", "d", "un", "une", "et", "a", "au", "aux", "en", "pour", "par", "sur"}


def _words(text: Optional[str]) -> Set[str]:
    return {w for w in _norm(text).split() if w not in _STOP and len(w) > 1}


def similarity(a: Optional[str], b: Optional[str]) -> float:
    """Mots communs / mots du plus court titre (0…1). Même racine (« ouverture », « ouvrir ») : demi-point."""
    wa, wb = _words(a), _words(b)
    if not wa or not wb:
        return 0.0
    short, long_ = (wa, wb) if len(wa) <= len(wb) else (wb, wa)
    score = 0.0
    for w in short:
        if w in long_:
            score += 1
        elif len(w) >= 5 and any(len(x) >= 5 and x[:3] == w[:3] for x in long_):
            score += 0.5
    return score / len(short)


# ── Droits ──────────────────────────────────────────────────────────

def my_write_procedures(me: str) -> Set[str]:
    """Procédures où je suis R ou A."""
    rows = (_db().table("procedure_assignments").select("procedure_id,raci_role")
            .eq("user_id", me).execute().data or [])
    return {r["procedure_id"] for r in rows if r.get("raci_role") in WRITE_ROLES}


def can_write(procedure_id: str, me: str, role: Optional[str]) -> bool:
    if role in ac.MANAGERS:
        return True
    if role != "contributeur":
        return False
    return procedure_id in my_write_procedures(me)


def _slot_is_mine(slot: Dict[str, Any], me: str, mine: Set[str]) -> bool:
    if slot.get("procedure_id"):
        return slot["procedure_id"] in mine
    raci = slot.get("raci") or {}
    return me in (raci.get("R") or []) or raci.get("A") == me


def enforce_write(request, procedure_id: str) -> None:
    """Refuse l'enregistrement d'une procédure à qui n'y est ni R ni A (selon AUTH_MODE).

    report : on journalise ce qui serait refusé, sans bloquer (déploiement progressif).
    Sans compte ou sans appartenance, c'est le contrôle général (middleware) qui décide.
    """
    mode = ac.auth_mode()
    if mode == "off":
        return
    user = ac._request_user(request)
    if user is None:
        return
    access = ac.Access(user=user, profile=ac.profile_for(user))
    if not access.member:
        return
    me = (access.profile or {}).get("id") or user.id
    if can_write(procedure_id, me, access.role):
        return
    message = "Vous ne pouvez enregistrer que les procédures dont vous êtes responsable (R) ou approbateur (A)."
    if mode == "enforce":
        from fastapi import HTTPException
        raise HTTPException(403, message)
    logger.warning(f"[report] enregistrement refusé en mode enforce : {me[:8]} sur {procedure_id[:8]} ({access.role})")


# ── L'arbre « où enregistrer » ──────────────────────────────────────

def _proc_name(wf: Dict[str, Any]) -> str:
    meta = wf.get("procedure_metadata_json") or {}
    return meta.get("nom") or wf.get("title") or "Procédure"


def _ancestors(node_id: Optional[str], by_id: Dict[str, Dict[str, Any]]) -> List[str]:
    out, seen = [], set()
    while node_id and node_id in by_id and node_id not in seen:
        seen.add(node_id)
        out.append(node_id)
        node_id = by_id[node_id].get("parent_id")
    return out


def path_of(node_id: Optional[str], by_id: Optional[Dict[str, Dict[str, Any]]] = None) -> str:
    if by_id is None:
        by_id = {n["id"]: n for n in _taxonomy()}
    return " › ".join(by_id[i]["name"] for i in reversed(_ancestors(node_id, by_id)))


def _taxonomy() -> List[Dict[str, Any]]:
    return (_db().table("process_taxonomy").select("id,parent_id,name,level,order_index")
            .execute().data or [])


def tree(me: str, role: Optional[str], titre: Optional[str] = None) -> Dict[str, Any]:
    db = _db()
    manager = role in ac.MANAGERS
    mine = set() if manager else my_write_procedures(me)
    taxonomy = _taxonomy()
    by_id = {n["id"]: n for n in taxonomy}
    workflows = {w["id"]: w for w in (db.table("workflows").select("id,title,taxonomy_id,procedure_metadata_json")
                                      .execute().data or [])}
    camps = db.table("formalization_campaigns").select("id,title,status,coordinator_id,created_at").execute().data or []
    slots = db.table("campaign_procedures").select("*").execute().data or []

    used: Set[str] = set()  # nœuds à garder dans la taxonomie renvoyée
    in_open_campaign: Set[str] = set()
    campaigns = []
    for c in sorted(camps, key=lambda c: c.get("created_at") or "", reverse=True):
        read_only = c.get("status") in READ_ONLY
        items = []
        for s in (x for x in slots if x.get("campaign_id") == c["id"] and x.get("status") != "skipped"):
            pid = s.get("procedure_id")
            wf = workflows.get(pid) if pid else None
            if pid and not wf:
                continue  # procédure supprimée
            writable = manager or _slot_is_mine(s, me, mine)
            if pid and not read_only:
                in_open_campaign.add(pid)
            if not writable:
                continue
            tax = s.get("taxonomy_id") or (wf or {}).get("taxonomy_id")
            items.append({"id": s["id"], "procedure_id": pid, "titre": s.get("procedure_nom") or (_proc_name(wf) if wf else "Procédure"),
                          "taxonomy_id": tax if tax in by_id else None, "statut": s.get("status"),
                          "ecriture": not read_only})
            used.update(_ancestors(tax, by_id))
        if items or (manager and not read_only):
            campaigns.append({"id": c["id"], "titre": c.get("title") or "Campagne", "statut": c.get("status"),
                              "lecture_seule": read_only, "emplacements": items})

    others = []
    for pid, wf in workflows.items():
        if pid in in_open_campaign or not (manager or pid in mine):
            continue
        tax = wf.get("taxonomy_id") if wf.get("taxonomy_id") in by_id else None
        others.append({"procedure_id": pid, "titre": _proc_name(wf), "taxonomy_id": tax, "ecriture": True})
        used.update(_ancestors(tax, by_id))
    others.sort(key=lambda o: _norm(o["titre"]))

    # Le pilotage peut créer partout : toute la taxonomie ; un contributeur, là où il travaille
    nodes = taxonomy if manager else [n for n in taxonomy if n["id"] in used]

    return {
        "taxonomie": sorted(nodes, key=lambda n: (n.get("order_index") or 0, _norm(n.get("name")))),
        "campagnes": campaigns,
        "hors_campagne": others,
        "creation": "directe" if manager else ("proposition" if role == "contributeur" else None),
        "suggestion": suggest(titre, campaigns, others) if titre else None,
    }


def suggest(titre: str, campaigns: List[Dict[str, Any]], others: List[Dict[str, Any]],
            threshold: float = 0.6) -> Optional[Dict[str, Any]]:
    """La procédure (accessible en écriture) dont le titre est le plus proche."""
    best, best_score = None, threshold
    candidates: Iterable = [(c, it) for c in campaigns if not c["lecture_seule"] for it in c["emplacements"]]
    candidates = list(candidates) + [(None, o) for o in others]
    for camp, it in candidates:
        score = similarity(titre, it["titre"])
        if score > best_score or (score == best_score and best is None):
            best_score = score
            best = {"campaign_id": camp["id"] if camp else None, "emplacement_id": it.get("id") if camp else None,
                    "procedure_id": it.get("procedure_id"), "titre": it["titre"]}
    return best

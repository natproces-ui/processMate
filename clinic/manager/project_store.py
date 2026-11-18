"""
Projets (lot 4) : instructions + sources partagées + conversations.

Accès : le propriétaire, ou un membre (project_members). Écriture des instructions et
des sources : propriétaire ou éditeur. Toutes les fonctions publiques vérifient l'accès.

Activation : avec les conversations (CONVERSATIONS_ENABLED).

Projet de campagne (projects.campaign_id) : l'espace de travail d'une campagne de
formalisation. La campagne dit CE QU'IL FAUT LIVRER (procédures, responsables,
échéances, avancement) ; le projet est L'ENDROIT OÙ L'ON TRAVAILLE (instructions,
sources, conversations). Un seul projet par campagne, créé à la demande (for_campaign).
Les droits y sont calculés depuis la campagne, sans liste de membres à synchroniser :
admin / responsable de processus / coordinateur / affecté à une procédure → éditeur ;
autre membre actif de l'organisation → lecture ; compte non membre → aucun accès.
"""

import hashlib
import logging
from typing import Any, Dict, List, Optional

from manager import conversation_store as conv_store

logger = logging.getLogger(__name__)

PREFIX = "projects"


def _db():
    return conv_store._db()


MANAGERS = ("admin", "pilote")


def active_profile(user_id: str) -> Optional[Dict[str, Any]]:
    """Appartenance ACTIVE (rôle d'organisation : admin, pilote, contributeur, lecteur).

    En mode organisations, seulement dans l'organisation de la requête.
    """
    from manager.access_control import membership_of
    m = membership_of(user_id)
    return m if m and m.get("status") == "active" else None


def _campaign_role(campaign_id: str, user_id: str) -> Optional[str]:
    profile = active_profile(user_id)
    if not profile:
        return None
    # La campagne doit exister DANS l'organisation de la requête (lecture cloisonnée)
    camp = (_db().table("formalization_campaigns").select("coordinator_id")
            .eq("id", campaign_id).limit(1).execute().data)
    if not camp:
        return None
    if profile.get("role") in MANAGERS:
        return "editor"
    if profile.get("role") == "lecteur":
        return "viewer"
    if camp[0].get("coordinator_id") == user_id:
        return "editor"
    assigned = (_db().table("campaign_procedures").select("id").eq("campaign_id", campaign_id)
                .eq("assigned_to", user_id).limit(1).execute().data)
    return "editor" if assigned else "viewer"


def _role(project: Dict[str, Any], user_id: str) -> Optional[str]:
    if project.get("owner_id") == user_id:
        return "owner"
    rows = (_db().table("project_members").select("role")
            .eq("project_id", project["id"]).eq("user_id", user_id).execute().data)
    if rows:
        return rows[0]["role"]
    if project.get("campaign_id"):
        return _campaign_role(project["campaign_id"], user_id)
    return None


def _my_campaign_ids(user_id: str) -> List[str]:
    """Campagnes dont l'utilisateur est coordinateur ou affecté à une procédure."""
    if not active_profile(user_id):
        return []
    ids = {c["id"] for c in _db().table("formalization_campaigns").select("id")
           .eq("coordinator_id", user_id).execute().data}
    ids |= {c["campaign_id"] for c in _db().table("campaign_procedures").select("campaign_id")
            .eq("assigned_to", user_id).execute().data}
    return sorted(ids)


def get_accessible(project_id: str, user_id: str, write: bool = False) -> Optional[Dict[str, Any]]:
    if not conv_store.is_uuid(project_id) or not user_id:
        return None
    rows = _db().table("projects").select("*").eq("id", project_id).execute().data
    if not rows:
        return None
    project = rows[0]
    role = _role(project, user_id)
    if role is None or (write and role == "viewer"):
        return None
    return {**project, "my_role": role}


def list_for(user_id: str, include_archived: bool = False) -> List[Dict[str, Any]]:
    owned = _db().table("projects").select("*").eq("owner_id", user_id)
    if not include_archived:
        owned = owned.is_("archived_at", "null")
    rows = owned.order("updated_at", desc=True).execute().data
    member_ids = [m["project_id"] for m in
                  _db().table("project_members").select("project_id").eq("user_id", user_id).execute().data]
    if member_ids:
        shared = _db().table("projects").select("*").in_("id", member_ids)
        if not include_archived:
            shared = shared.is_("archived_at", "null")
        known = {r["id"] for r in rows}
        rows += [r for r in shared.execute().data if r["id"] not in known]
    campaign_ids = _my_campaign_ids(user_id)
    if campaign_ids:
        camp = _db().table("projects").select("*").in_("campaign_id", campaign_ids)
        if not include_archived:
            camp = camp.is_("archived_at", "null")
        known = {r["id"] for r in rows}
        rows += [r for r in camp.execute().data if r["id"] not in known]
    return rows


def create(user_id: str, name: str, instructions: str = "") -> Dict[str, Any]:
    """Projet personnel. Le lien à une campagne passe uniquement par for_campaign."""
    row = {"owner_id": user_id, "name": (name or "Nouveau projet")[:120], "instructions": instructions or ""}
    return _db().table("projects").insert(row).execute().data[0]


def _campaign_instructions(campaign: Dict[str, Any]) -> str:
    lines = [f"Campagne de formalisation « {campaign.get('title')} »."]
    if campaign.get("description"):
        lines.append(f"Objectif : {campaign['description']}")
    if campaign.get("end_date"):
        lines.append(f"Échéance : {campaign['end_date']}.")
    lines.append("Formalisez chaque procédure de la campagne avec les conventions et le vocabulaire "
                 "ci-dessous (à compléter par le coordinateur).")
    return "\n".join(lines)


def for_campaign(campaign_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Projet de travail de la campagne : le renvoie, ou le crée au premier appel.

    Réservé aux membres actifs. None si la campagne n'existe pas ou si l'accès est refusé.
    """
    if not conv_store.is_uuid(campaign_id) or not active_profile(user_id):
        return None
    existing = (_db().table("projects").select("id").eq("campaign_id", campaign_id)
                .order("created_at").limit(1).execute().data)
    if not existing:
        camp = (_db().table("formalization_campaigns").select("id,title,description,end_date")
                .eq("id", campaign_id).limit(1).execute().data)
        if not camp:
            return None
        row = {"owner_id": user_id, "name": f"Campagne · {camp[0]['title']}"[:120],
               "instructions": _campaign_instructions(camp[0]), "campaign_id": campaign_id}
        try:
            existing = _db().table("projects").insert(row).execute().data
        except Exception:  # créé au même instant par quelqu'un d'autre (index unique)
            existing = (_db().table("projects").select("id").eq("campaign_id", campaign_id)
                        .limit(1).execute().data)
    return get_accessible(existing[0]["id"], user_id) if existing else None


def campaign_summary(campaign_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Avancement de la campagne liée, pour la page du projet (membres actifs seulement)."""
    if not active_profile(user_id):
        return None
    from routers.campaigns_router import _enrich_campaign  # mêmes statistiques que le pilotage
    rows = _db().table("formalization_campaigns").select("*").eq("id", campaign_id).limit(1).execute().data
    if not rows:
        return None
    c = _enrich_campaign(rows[0], _db(), with_lifecycle=True)
    from manager.campaign_items import raci_of

    def mine(p: Dict[str, Any]) -> bool:
        if p.get("assigned_to") == user_id:
            return True
        try:  # emplacements : « mes procédures » = celles dont je suis R
            return user_id in raci_of(p)["R"]
        except Exception:
            return False

    procs = [{"id": p.get("id"), "procedure_id": p.get("procedure_id"), "procedure_nom": p.get("procedure_nom") or "",
              "procedure_ref": p.get("procedure_ref") or "", "status": p.get("status"),
              "echeance": p.get("echeance"), "mine": mine(p)}
             for p in c.get("procedures", [])]
    procs.sort(key=lambda p: (not p["mine"], p["procedure_nom"]))
    return {k: c.get(k) for k in ("id", "title", "status", "start_date", "end_date", "stats")} | {"procedures": procs}


def update(project_id: str, user_id: str, **fields) -> Optional[Dict[str, Any]]:
    if not get_accessible(project_id, user_id, write=True):
        return None
    data = {k: v for k, v in fields.items() if k in {"name", "instructions", "archived_at", "campaign_id"}}
    data["updated_at"] = conv_store._now()
    return _db().table("projects").update(data).eq("id", project_id).execute().data[0]


def delete(project_id: str, user_id: str) -> bool:
    project = get_accessible(project_id, user_id, write=True)
    if not project or project["my_role"] != "owner":
        return False
    paths = [s["storage_path"] for s in sources(project_id, include_removed=True)]
    if paths:
        try:
            _db().storage.from_(conv_store.BUCKET).remove(paths)
        except Exception as e:
            logger.warning(f"⚠️ Fichiers de projet non supprimés : {str(e)[:120]}")
    _db().table("projects").delete().eq("id", project_id).execute()
    return True


def sources(project_id: str, include_removed: bool = False) -> List[Dict[str, Any]]:
    q = _db().table("project_sources").select("*").eq("project_id", project_id)
    if not include_removed:
        q = q.is_("removed_at", "null")
    return q.order("added_at").execute().data


def add_sources(project_id: str, user_id: str, files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not get_accessible(project_id, user_id, write=True):
        return []
    existing = {s["sha256"] for s in sources(project_id)}
    added = []
    for f in files:
        data = f.get("data") or b""
        sha = hashlib.sha256(data).hexdigest()
        if sha in existing:
            continue
        path = f"{PREFIX}/{project_id}/{sha[:16]}-{conv_store._safe_name(f['filename'])}"
        _db().storage.from_(conv_store.BUCKET).upload(
            path=path, file=data,
            file_options={"content-type": conv_store._MIME.get(f["type"], "application/octet-stream"), "upsert": "true"})
        row = {"project_id": project_id, "filename": f["filename"], "type": f["type"],
               "size": f.get("size") or len(data), "sha256": sha, "storage_path": path, "added_by": user_id}
        added.append(_db().table("project_sources").insert(row).execute().data[0])
        existing.add(sha)
    return added


def remove_source(project_id: str, user_id: str, source_id: str) -> bool:
    if not get_accessible(project_id, user_id, write=True) or not conv_store.is_uuid(source_id):
        return False
    rows = (_db().table("project_sources").update({"removed_at": conv_store._now()})
            .eq("id", source_id).eq("project_id", project_id).execute().data)
    return bool(rows)


def instructions_message(project: Dict[str, Any]) -> Optional[Dict[str, str]]:
    """Instructions du projet, placées en tête de l'historique envoyé au modèle."""
    text = (project.get("instructions") or "").strip()
    if not text:
        return None
    return {"role": "user", "content": f"[Instructions du projet « {project.get('name')} »]\n{text}"}

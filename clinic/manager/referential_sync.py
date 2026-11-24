"""La copie du chat est-elle à jour avec le référentiel ?

Une procédure du chat liée au référentiel part d'un état connu : sa version « enregistrée » (saved_version), identique
au référentiel au moment de l'ajout au chat ou du dernier « Enregistrer ». Si le référentiel a changé depuis (un collègue,
un autre chat, une correction à la main dans l'espace de travail), le chat le dit avant d'agir : la version qu'il a, celle
du référentiel, et demande laquelle garder. « Garder la mienne » est retenu dans l'état de la conversation (ref_ack),
pour ne pas reposer la question tant que le référentiel ne bouge pas de nouveau.

On compare le contenu (étapes et descriptions), pas les champs tenus par le serveur (statut, circuit, cycle de vie).
"""
import hashlib
import json
from typing import Any, Callable, Dict, List, Optional

from manager import conversation_procedures as cp

_STEP_KEYS = ("id", "étape", "acteur", "département", "typeBpmn", "condition", "outil")


def fingerprint(workflow: List[Dict[str, Any]], enrichments: Dict[str, Any]) -> str:
    """Empreinte du contenu : étapes (libellé, acteur, liens…) et description de chaque étape."""
    steps = []
    for r in workflow or []:
        if not isinstance(r, dict):
            continue
        enr = (enrichments or {}).get(str(r.get("id"))) or {}
        steps.append({**{k: str(r.get(k) or "").strip() for k in _STEP_KEYS},
                      "outputs": sorted((str(o.get("targetId") or ""), str(o.get("label") or "").strip())
                                        for o in (r.get("outputs") or []) if isinstance(o, dict)),
                      "descriptif": str(enr.get("descriptif") or "").strip() if isinstance(enr, dict) else ""})
    return hashlib.sha1(json.dumps(steps, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def _ref_fingerprint(wf: Dict[str, Any]) -> str:
    enr = {k: v for k, v in (wf.get("enrichments_json") or {}).items() if k != "__bpmn_xml__"}
    return fingerprint(wf.get("workflow_json") or [], enr)


def _ref_version(workflow_id: str, wf: Dict[str, Any]) -> Dict[str, Any]:
    """Dernière version du référentiel (numéro et date) quand l'historique existe ; sinon la date de modification."""
    try:
        from manager import version_store
        if version_store.enabled():
            rows = version_store.list_versions(workflow_id)
            if rows:
                return {"version": rows[0].get("version"), "date": rows[0].get("created_at")}
    except Exception:
        pass
    return {"version": None, "date": (wf.get("procedure_metadata_json") or {}).get("last_modified_at")}


def check(conversation_id: str, keys: List[str], read_workflow: Callable[[str], Optional[Dict[str, Any]]],
          ack: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
    """Procédures (parmi `keys`) dont le référentiel a changé depuis la version du chat : ce que le chat doit dire."""
    out = []
    for key in dict.fromkeys(k for k in keys if k):
        proc = cp.get(conversation_id, key)
        if not proc or not proc.get("workflow_db_id") or not proc.get("saved_version"):
            continue
        wf = read_workflow(proc["workflow_db_id"])
        if not wf:
            continue
        ref_fp = _ref_fingerprint(wf)
        if (ack or {}).get(key) == ref_fp:
            continue
        base = cp.version_content(conversation_id, key, proc["saved_version"])
        if base is None or fingerprint(base.get("workflow") or [], base.get("enrichments") or {}) == ref_fp:
            continue
        base_row = cp._version(proc["id"], proc["saved_version"]) or {}
        meta = base.get("procedureMetadata") or {}
        out.append({"key": key, "title": proc.get("title") or "Procédure",
                    "version_label": "TO BE" if meta.get("asis_id") else None,
                    "chat_version": proc.get("current_version"), "base_version": proc["saved_version"],
                    "base_date": base_row.get("created_at"),
                    "unsaved": (proc.get("current_version") or 0) != proc["saved_version"],
                    "referentiel": _ref_version(proc["workflow_db_id"], wf), "fingerprint": ref_fp})
    return out


def _date(iso: Optional[str]) -> str:
    if not iso:
        return ""
    try:
        from datetime import datetime
        d = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return f"du {d.day:02d}/{d.month:02d} à {d.hour} h {d.minute:02d}"
    except Exception:
        return ""


def question(stale: List[Dict[str, Any]]) -> str:
    """Ce que le chat dit : la version qu'il a, celle du référentiel, et la question."""
    parts = []
    for s in stale:
        name = f"« {s['title']} »" + (f" ({s['version_label']})" if s.get("version_label") else "")
        mine = f"Ma copie de {name} part de la version enregistrée {_date(s.get('base_date'))}".replace("  ", " ").strip()
        if s.get("unsaved"):
            mine += ", avec des modifications faites ici depuis, pas encore enregistrées"
        ref = s.get("referentiel") or {}
        theirs = "le référentiel a été modifié depuis"
        if ref.get("version"):
            theirs += f" (version {ref['version']}{' ' + _date(ref.get('date')) if _date(ref.get('date')) else ''})"
        elif _date(ref.get("date")):
            theirs += f" ({_date(ref.get('date'))[3:]})"
        parts.append(f"{mine} ; {theirs}.")
    ask = ("Je reprends la version à jour du référentiel, ou je garde la mienne ? Si vous gardez la vôtre, "
           "« Enregistrer » remplacera les modifications faites au référentiel.")
    return " ".join(parts) + " " + ask


def reprendre(conversation_id: str, key: str, wf: Dict[str, Any], author_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """La version à jour du référentiel devient la version courante du chat (une nouvelle version : rien n'est perdu)."""
    proc = cp.get(conversation_id, key)
    if not proc:
        return None
    enr = dict(wf.get("enrichments_json") or {})
    xml = enr.pop("__bpmn_xml__", None)
    content = {"title": wf.get("title") or proc.get("title"), "workflow": wf.get("workflow_json") or [], "enrichments": enr,
               "procedureMetadata": wf.get("procedure_metadata_json") or {}, "bpmnXml": xml}
    cp.add_version(proc, content, "reprise", resume="version à jour du référentiel reprise", author_id=author_id)
    fresh = cp.get(conversation_id, key)
    cp.link_saved(conversation_id, key, proc["workflow_db_id"], fresh.get("current_version"))
    return cp.current(conversation_id, key)

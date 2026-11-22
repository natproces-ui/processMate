# clinic/manager/workflow_operations.py
"""
Application des opérations de modification (revision_prompt) à une procédure, côté serveur.

Copie fidèle de frontend/src/logic/workflowOperations.ts et du traitement fait ensuite par ChatInterface
(les descriptions portées par `description` passent dans les enrichissements, jamais dans la ligne) :
le serveur applique lui-même la modification et en garde la version (docs/conversation-serveur.md).
"""

import copy
from typing import Any, Dict, List, Tuple


def _num(value: Any) -> int:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return 0


def apply_operations(workflow: List[Dict[str, Any]], operations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Même résultat que applyOperations (workflowOperations.ts)."""
    result = [copy.deepcopy(r) for r in workflow or []]
    nxt = max([_num(r.get("id")) for r in result] + [0]) + 1
    mapping: Dict[str, str] = {}
    for op in operations or []:
        rid = str((op.get("row") or {}).get("id") or "")
        if op.get("type") == "add" and rid.startswith("NEW_"):
            mapping[rid] = str(nxt)
            nxt += 1

    def res(i: Any) -> str:
        return mapping.get(str(i), str(i))

    def res_out(outs: Any) -> List[Dict[str, Any]]:
        return [{**o, "targetId": res(o.get("targetId"))} for o in outs or [] if isinstance(o, dict)]

    for op in operations or []:
        kind = op.get("type")
        if kind == "add" and op.get("row"):
            row = op["row"]
            new = {"id": res(row.get("id") or "NEW_0"), "étape": row.get("étape") or "", "typeBpmn": row.get("typeBpmn") or "Task",
                   "département": row.get("département") or "", "acteur": row.get("acteur") or "",
                   "typeActeur": row.get("typeActeur") or "", "condition": row.get("condition") or "",
                   "outputs": res_out(row.get("outputs")), "outil": row.get("outil") or ""}
            if row.get("description"):
                new["description"] = row["description"]
            if not op.get("after_id"):
                result.insert(0, new)
            else:
                idx = next((i for i, r in enumerate(result) if str(r.get("id")) == str(op["after_id"])), None)
                result.append(new) if idx is None else result.insert(idx + 1, new)
        elif kind == "update" and op.get("id") and op.get("fields"):
            for r in result:
                if str(r.get("id")) == str(op["id"]):
                    for k, v in op["fields"].items():
                        r[k] = res_out(v) if k == "outputs" else v
        elif kind == "delete" and op.get("id"):
            gone = next((r for r in result if str(r.get("id")) == str(op["id"])), None)
            if op.get("reconnect") and gone:
                targets = [o.get("targetId") for o in gone.get("outputs") or []]
                for r in result:
                    if any(str(o.get("targetId")) == str(op["id"]) for o in r.get("outputs") or []):
                        r["outputs"] = [x for o in r.get("outputs") or [] for x in
                                        ([{"targetId": t, "label": o.get("label", "")} for t in targets]
                                         if str(o.get("targetId")) == str(op["id"]) else [o])]
            result = [r for r in result if str(r.get("id")) != str(op["id"])]
        elif kind == "move" and op.get("id"):
            for r in result:
                if str(r.get("id")) == str(op["id"]):
                    if op.get("acteur") is not None:
                        r["acteur"] = op["acteur"]
                    if op.get("département") is not None:
                        r["département"] = op["département"]
        elif kind == "relink" and op.get("id"):
            for r in result:
                if str(r.get("id")) == str(op["id"]):
                    r["outputs"] = res_out(op.get("outputs"))
    return result


def apply_with_descriptions(workflow: List[Dict[str, Any]], enrichments: Dict[str, Any],
                            operations: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Applique les opérations ; les descriptions (`description`) vont dans les enrichissements (`descriptif`),
    comme le fait l'écran. Renvoie (workflow, enrichments)."""
    applied = apply_operations(workflow, operations)
    rows = [{k: v for k, v in r.items() if k != "description"} for r in applied]
    enr = copy.deepcopy(enrichments or {})
    for op in operations or []:
        desc = (op.get("fields") or {}).get("description") or (op.get("row") or {}).get("description")
        if not desc:
            continue
        rid = op.get("id") or (op.get("row") or {}).get("id")
        if not any(str(r.get("id")) == str(rid) for r in rows) and op.get("row"):
            rid = next((r["id"] for r in rows if r.get("étape") == op["row"].get("étape")), None)
        if rid:
            enr[str(rid)] = {**(enr.get(str(rid)) or {}), "id_tache": str(rid), "descriptif": desc}
    return rows, enr


def summarize_changes(before: List[Dict[str, Any]], after: List[Dict[str, Any]]) -> str:
    """Ce qui a changé, en une phrase (versions de la conversation)."""
    b = {str(r.get("id")): r for r in before or []}
    a = {str(r.get("id")): r for r in after or []}
    added = [a[i] for i in a if i not in b]
    removed = [b[i] for i in b if i not in a]
    changed = [i for i in a if i in b and {k: v for k, v in a[i].items() if k != "outputs"}
               != {k: v for k, v in b[i].items() if k != "outputs"}]
    relinked = [i for i in a if i in b and a[i].get("outputs") != b[i].get("outputs") and i not in changed]
    parts = []
    if added:
        parts.append(f"{len(added)} étape{'s' if len(added) > 1 else ''} ajoutée{'s' if len(added) > 1 else ''}")
    if removed:
        parts.append(f"{len(removed)} retirée{'s' if len(removed) > 1 else ''}")
    if changed:
        parts.append(f"{len(changed)} modifiée{'s' if len(changed) > 1 else ''} (étape{'s' if len(changed) > 1 else ''} "
                     f"{', '.join(changed[:5])}{'…' if len(changed) > 5 else ''})")
    if relinked:
        parts.append(f"{len(relinked)} connexion{'s' if len(relinked) > 1 else ''} revue{'s' if len(relinked) > 1 else ''}")
    return ", ".join(parts) if parts else "aucun changement d'étape"

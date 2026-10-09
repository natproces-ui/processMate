# clinic/processor/procedure_lint.py
"""
Vérifications structurelles d'une procédure (sans IA).

Sert de base factuelle à la relecture du Studio : l'IA reçoit ces constats vérifiés
et ne peut plus affirmer un problème que les données ne montrent pas.
"""
from collections import deque
from typing import Any, Dict, List

START, END, GATEWAYS = "StartEvent", "EndEvent", ("ExclusiveGateway", "ParallelGateway", "InclusiveGateway")
METADATA_FIELDS = {"objet": "objet", "perimetre": "périmètre", "dateEffet": "date d'effet", "proprietaire": "propriétaire"}


def _targets(row: Dict[str, Any]) -> List[str]:
    return [str(o.get("targetId")) for o in (row.get("outputs") or []) if isinstance(o, dict) and o.get("targetId") not in (None, "")]


def lint_procedure(workflow: List[Dict[str, Any]], metadata: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
    """Renvoie des constats {kind, steps, message} : kind = erreur (structure fausse) ou manque (information absente)."""
    findings: List[Dict[str, Any]] = []
    rows = [r for r in workflow or [] if isinstance(r, dict)]
    if not rows:
        return findings
    ids = [str(r.get("id")) for r in rows]
    by_id = {str(r.get("id")): r for r in rows}
    add = lambda kind, steps, msg: findings.append({"kind": kind, "steps": steps, "message": msg})

    starts = [str(r.get("id")) for r in rows if r.get("typeBpmn") == START]
    ends = [str(r.get("id")) for r in rows if r.get("typeBpmn") == END]
    if not starts:
        add("erreur", [], "Aucun événement de début (StartEvent).")
    if not ends:
        add("erreur", [], "Aucun événement de fin (EndEvent).")
    incoming: Dict[str, List[str]] = {i: [] for i in ids}
    for r in rows:
        for tgt in _targets(r):
            if tgt in incoming:
                incoming[tgt].append(str(r.get("id")))
    # Convention de modélisation (prompt de génération) : un acteur EXTERNE qui déclenche le
    # processus (ex. le client dépose sa demande) a sa tâche AVANT le StartEvent et pointe vers lui ;
    # le StartEvent appartient au premier acteur interne. Ce n'est pas une erreur.
    def is_external_trigger(rid: str) -> bool:
        r = by_id.get(rid, {})
        return (str(r.get("typeActeur") or "").strip().lower() == "externe"
                and r.get("typeBpmn") not in (START, END) and not incoming.get(rid))
    triggers: List[str] = []
    for s in starts:
        preds = incoming.get(s) or []
        internal_preds = [p for p in preds if not is_external_trigger(p)]
        triggers += [p for p in preds if is_external_trigger(p)]
        if internal_preds:
            add("erreur", [s] + internal_preds, f"Le début (étape {s}) est précédé par l'étape {', '.join(internal_preds)} : seule une tâche d'acteur externe déclencheur peut le précéder.")
        elif any(not is_external_trigger(i) for i in ids[:ids.index(s)]):
            add("erreur", [s], f"Le début (étape {s}) n'est pas placé en premier dans le tableau.")

    for r in rows:
        rid, typ, outs = str(r.get("id")), r.get("typeBpmn"), _targets(r)
        missing = [t for t in outs if t not in by_id]
        if missing:
            add("erreur", [rid], f"L'étape {rid} pointe vers une étape inexistante ({', '.join(missing)}).")
        if typ != END and not outs:
            add("erreur", [rid], f"L'étape {rid} n'a aucune suite alors que ce n'est pas une fin.")
        if typ in GATEWAYS and len(outs) < 2:
            add("erreur", [rid], f"La décision de l'étape {rid} n'a qu'une seule issue.")
        if typ in GATEWAYS and not (r.get("condition") or "").strip():
            add("manque", [rid], f"La décision de l'étape {rid} n'a pas de condition formulée.")
        if typ not in (START, END) and not (r.get("acteur") or "").strip():
            add("manque", [rid], f"L'étape {rid} n'a pas d'acteur.")

    if starts:  # étapes inatteignables depuis le début (ou depuis un déclencheur externe)
        roots = starts + triggers
        seen, queue = set(roots), deque(roots)
        while queue:
            for tgt in _targets(by_id.get(queue.popleft(), {})):
                if tgt in by_id and tgt not in seen:
                    seen.add(tgt)
                    queue.append(tgt)
        unreachable = [i for i in ids if i not in seen]
        if unreachable:
            add("erreur", unreachable, f"Étape(s) jamais atteinte(s) depuis le début : {', '.join(unreachable)}.")

    no_tool = [str(r.get("id")) for r in rows if r.get("typeBpmn") == "Task" and not (r.get("outil") or "").strip()]
    if no_tool:
        add("manque", no_tool, f"{len(no_tool)} tâche(s) sans outil renseigné : étapes {', '.join(no_tool)}.")
    empty_meta = [label for key, label in METADATA_FIELDS.items() if not (metadata or {}).get(key)]
    if empty_meta:
        add("manque", [], "Métadonnées non renseignées : " + ", ".join(empty_meta) + ".")
    return findings

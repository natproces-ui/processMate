"""
Banc d'essai de la modification — ce que devient une procédure après une instruction du chat.

Rejoue des instructions réelles sur une procédure (Crédit documentaire à l'export – Modification) par le
même chemin que le chat (ChatProcessor, intention « patch »), puis vérifie le résultat selon le glossaire
(acteur tel que nommé, fonction / entité séparées, outils, suppression demandée seulement) et la validité
du logigramme (aucune sortie vers une étape absente, aucune étape orpheline).

Appels payants (un appel rapide par instruction) : jamais lancé automatiquement.

Usage (depuis clinic/, avec GOOGLE_API_KEY) :
    python bench/modification.py [--repeat 2] [--sans-glossaire]
"""

import argparse
import asyncio
import copy
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bench.decisions_cases import CREDOC  # noqa: E402


def apply_operations(workflow, operations):
    """Copie fidèle de frontend/src/logic/workflowOperations.ts (c'est l'écran qui applique les opérations)."""
    result = [dict(r) for r in workflow]
    nums = [int(r["id"]) for r in result if str(r.get("id", "")).isdigit()]
    nxt = (max(nums) if nums else 0) + 1
    mapping = {}
    for op in operations:
        rid = str((op.get("row") or {}).get("id") or "")
        if op.get("type") == "add" and rid.startswith("NEW_"):
            mapping[rid] = str(nxt)
            nxt += 1

    def res(i):
        return mapping.get(str(i), str(i))

    def res_out(outs):
        return [{**o, "targetId": res(o.get("targetId"))} for o in outs or []]
    for op in operations:
        t = op.get("type")
        if t == "add" and op.get("row"):
            row = op["row"]
            new = {"id": res(row.get("id") or "NEW_0"), "étape": row.get("étape") or "", "typeBpmn": row.get("typeBpmn") or "Task",
                   "département": row.get("département") or "", "acteur": row.get("acteur") or "",
                   "typeActeur": row.get("typeActeur") or "", "condition": row.get("condition") or "",
                   "outputs": res_out(row.get("outputs")), "outil": row.get("outil") or ""}
            idx = next((i for i, r in enumerate(result) if str(r["id"]) == str(op.get("after_id"))), None) if op.get("after_id") else -2
            if idx == -2:
                result = [new] + result
            elif idx is None:
                result.append(new)
            else:
                result.insert(idx + 1, new)
        elif t == "update" and op.get("id") and op.get("fields"):
            for r in result:
                if str(r["id"]) == str(op["id"]):
                    for k, v in op["fields"].items():
                        r[k] = res_out(v) if k == "outputs" else v
        elif t == "delete" and op.get("id"):
            gone = next((r for r in result if str(r["id"]) == str(op["id"])), None)
            if op.get("reconnect") and gone:
                tg = [o["targetId"] for o in gone.get("outputs") or []]
                for r in result:
                    r["outputs"] = [x for o in r.get("outputs") or [] for x in
                                    ([{"targetId": t2, "label": o.get("label", "")} for t2 in tg]
                                     if str(o.get("targetId")) == str(op["id"]) else [o])]
            result = [r for r in result if str(r["id"]) != str(op["id"])]
        elif t == "move" and op.get("id"):
            for r in result:
                if str(r["id"]) == str(op["id"]):
                    r["acteur"] = op.get("acteur", r.get("acteur"))
                    r["département"] = op.get("département", r.get("département"))
        elif t == "relink" and op.get("id"):
            for r in result:
                if str(r["id"]) == str(op["id"]):
                    r["outputs"] = res_out(op.get("outputs"))
    return result


def acteurs(wf):
    return {r.get("acteur") for r in wf if r.get("acteur")}


def step(wf, words):
    return next((r for r in wf if all(w.lower() in str(r.get("étape") or "").lower() for w in words)), None)


def check_graph(wf):
    ids = {str(r.get("id")) for r in wf}
    errors = []
    targets = set()
    for r in wf:
        for o in r.get("outputs") or []:
            t = str(o.get("targetId"))
            targets.add(t)
            if t not in ids:
                errors.append(f"sortie de {r.get('id')} vers {t} absente")
        if r.get("typeBpmn") != "EndEvent" and not r.get("outputs"):
            errors.append(f"{r.get('id')} « {str(r.get('étape'))[:30]} » sans sortie")
    for r in wf:
        if r.get("typeBpmn") != "StartEvent" and str(r.get("id")) not in targets:
            errors.append(f"{r.get('id')} « {str(r.get('étape'))[:30]} » sans entrée")
    return errors


def c_superviseur(wf):
    s = step(wf, ["valider"])
    if not s:
        return ["étape « Valider » disparue"]
    e = []
    if s.get("acteur") != "Superviseur":
        e.append(f"acteur « {s.get('acteur')} » au lieu de « Superviseur »")
    if s.get("département") not in ("BOI", "Back Office International"):
        e.append(f"département « {s.get('département')} »")
    return e


def c_outlook(wf):
    tools = " ".join(str(r.get("outil") or "") for r in wf)
    return (["Docflow encore présent"] if "docflow" in tools.lower() else []) + \
           ([] if "Outlook" in tools else ["Outlook absent"])


def c_conformite(wf):
    s = next((r for r in wf if "conformit" in str(r.get("acteur") or "").lower()
              or "conformit" in str(r.get("département") or "").lower()), None)
    e = [] if s else ["aucune étape de la Direction conformité"]
    if len(wf) < len(CREDOC) + 1:
        e.append("aucune étape ajoutée")
    return e


def c_automatique(wf):
    s = step(wf, ["valider"])
    if s and s.get("acteur") == "Responsable":
        return ["la validation est toujours faite par le Responsable"]
    return []


def c_rejet(wf):
    e = ["étape de rejet encore présente"] if step(wf, ["rejet"]) else []
    if len(wf) < len(CREDOC) - 2:
        e.append(f"{len(CREDOC) - len(wf)} étapes supprimées au lieu d'une")
    return e


def c_reunir(wf):
    a = acteurs(wf)
    e = [f"« {x} » encore présent" for x in ("Responsable", "Gestionnaire des opérations") if x in a]
    if not any("back office international" in x.lower() for x in a):
        e.append("« Back office international » absent")
    return e


def c_rien_casse(wf):
    """Une modification ciblée ne touche pas aux autres acteurs ni outils."""
    e = []
    if acteurs(wf) - acteurs(CREDOC):
        e.append(f"acteurs apparus : {sorted(acteurs(wf) - acteurs(CREDOC))}")
    if len(wf) != len(CREDOC):
        e.append(f"{len(wf)} étapes au lieu de {len(CREDOC)}")
    return e


def c_ajout_fonction_entite(wf):
    s = next((r for r in wf if "viser" in str(r.get("étape") or "").lower() or "vise" in str(r.get("étape") or "").lower()), None)
    if not s:
        return ["étape de visa absente"]
    e = []
    if s.get("acteur") != "Responsable de service":
        e.append(f"acteur « {s.get('acteur')} » au lieu de « Responsable de service »")
    if s.get("département") not in ("BOI", "Back Office International"):
        e.append(f"département « {s.get('département')} »")
    if "docflow" not in str(s.get("outil") or "").lower():
        e.append(f"outil « {s.get('outil')} »")
    return e


def c_profil(wf):
    s = step(wf, ["vérifier"])
    if not s:
        return ["étape « Vérifier » disparue"]
    return [] if s.get("acteur") == "Gestionnaire des opérations" else [f"acteur « {s.get('acteur')} »"]


def c_outil_partout(wf):
    tools = [str(r.get("outil") or "") for r in wf]
    e = [f"« TI+ » encore sur {sum('TI+' in t for t in tools)} étape(s)"] if any("TI+" in t for t in tools) else []
    n = sum("TIPLUS" in t for t in tools)
    return e + ([] if n == 4 else [f"« TIPLUS » sur {n} étape(s) au lieu de 4"])


CASES = [
    ("fonction-entite", "Ajoute après la saisie une étape où le Responsable de service – BOI vise le dossier dans Docflow.",
     c_ajout_fonction_entite),
    ("profil", "L'étape 2 est faite par le Gestionnaire des opérations – BOI (profil de saisie).", c_profil),
    ("outil-partout", "Chez nous TI+ s'appelle TIPLUS.", c_outil_partout),
    ("superviseur", "L'étape 5 est faite par le Superviseur – BOI.", c_superviseur),
    ("outlook", "On n'utilise plus Docflow, c'est Outlook maintenant.", c_outlook),
    ("conformite", "Ajoute un contrôle de la Direction conformité après la saisie de la modification.", c_conformite),
    ("automatique", "Le responsable ne valide pas, c'est automatique dans TI+.", c_automatique),
    ("rejet", "Supprime l'étape de rejet.", c_rejet),
    ("reunir", "Réunis Responsable et Gestionnaire des opérations sous « Back office international ».", c_reunir),
    ("description", "Décris mieux l'étape « Vérifier la demande de modification ».", c_rien_casse),
    ("libelle", "Renomme l'étape 7 en « Notifier la banque du bénéficiaire ».", c_rien_casse),
]


async def run(name, message, check):
    from processor.chat_processor import ChatProcessor
    r = await ChatProcessor().process_message(message=message, files=[], history=[],
                                              current_workflow=copy.deepcopy(CREDOC), intent="patch")
    wf = apply_operations(r.get("workflow") or [], r.get("operations") or [])
    errors = check(wf) + check_graph(wf)
    return errors, r.get("explanation") or r.get("message") or ""


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeat", type=int, default=1)
    ap.add_argument("--sans-glossaire", action="store_true")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()
    if args.sans_glossaire:
        import prompts.revision_prompt as rp
        rp.REGLES = ""
    ok_total = n_total = 0
    for name, message, check in [c for c in CASES if not args.only or c[0] in args.only]:
        runs = []
        t = time.monotonic()
        for _ in range(args.repeat):
            try:
                runs.append(await run(name, message, check))
            except Exception as e:
                runs.append(([f"erreur : {e}"[:150]], ""))
        ok = sum(not e for e, _ in runs)
        ok_total += ok
        n_total += len(runs)
        errors, text = next((r for r in runs if r[0]), runs[0])
        print(f"  {'✓' if ok == len(runs) else '✗'}  {name:<12} {ok}/{len(runs)}  {(time.monotonic() - t) / len(runs):4.1f} s  "
              f"{'; '.join(errors)[:160]}")
        if text:
            print(f"       « {text[:150]} »")
    print(f"\n{ok_total}/{n_total} justes")


if __name__ == "__main__":
    asyncio.run(main())

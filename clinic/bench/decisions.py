"""
Banc d'essai des décisions — étape 0 du « cerveau unique ».

Pour chaque situation de bench/decisions_cases.py, rejoue le vrai chemin de décision d'un tour du
chat (studio_turn) : aiguillage (plan_turn + garde-fous), puis, quand le tour est confié au chat,
le classifieur d'intention (detect_intent). Rien n'est rédigé, rien n'est écrit en base : seule la
décision est mesurée, puis comparée à la décision attendue.

Appels payants (un ou deux appels rapides par situation) : jamais lancé automatiquement.

Usage (depuis clinic/, avec GOOGLE_API_KEY) :
    python bench/decisions.py                         # toutes les situations
    python bench/decisions.py --only op- mod-         # préfixes d'identifiants
    python bench/decisions.py --save avant.json       # garder les résultats
    python bench/decisions.py --compare avant.json    # comparer à une mesure précédente

Sources : BENCH_SOURCES (par défaut le dossier utilisateur, ex. C:/Users/<nom>) ; une situation dont
une source manque est sautée et signalée.
"""

import argparse
import asyncio
import json
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bench.decisions_cases import CASES  # noqa: E402
from processor.office_extract import EXTRACTED_TYPES, extract_office, office_type  # noqa: E402

ROOT = Path(os.environ.get("BENCH_SOURCES") or Path.home())
EXTRA_ROOTS = [Path("C:/")]  # « processMate/… » : le dépôt à la racine du disque
TYPES = {".pdf": "pdf", ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image"}

FORMACASH_PROPOSAL = ["Organiser une formation (circuit Plan)", "Organiser une formation en alternance", "Former l'intérimaire",
                      "Vérifier la formation", "Payer l'organisme et se faire rembourser", "Valoriser la formation"]

# Décision du code actuel → vocabulaire du banc
CHAT_INTENTS = {"patch": "modifier", "regen": "refaire", "explain": "expliquer", "generate": "rediger",
                "clarify": "demander", "transcribe": "transcrire", "web_search": "recherche"}


def find(rel: str):
    for base in [ROOT, *EXTRA_ROOTS]:
        p = base / rel
        if p.exists():
            return p
    return None


def load(path: Path) -> dict:
    data = path.read_bytes()
    ftype = TYPES.get(path.suffix.lower()) or office_type(path.name, "")
    entry = {"file_id": path.stem, "filename": path.name, "data": data, "type": ftype, "size": len(data)}
    if ftype in EXTRACTED_TYPES:
        entry["office"] = extract_office(data, ftype)
    return entry


async def decide(case: dict, files: list) -> dict:
    """Même enchaînement que studio_turn (agent outillé désactivé)."""
    from processor.intent_detector import detect_intent
    from processor.studio_planner import plan_turn
    from routers.studio_router import _steps_summary

    conv = [{"key": f"k{i}", "title": t, "workflow": wf} for i, (t, wf) in enumerate(case.get("conv") or [], 1)]
    active = conv[(case.get("active") or len(conv)) - 1] if conv else None
    workflow = active["workflow"] if active else []
    history = [{"role": r, "content": c} for r, c in case.get("history") or []]
    proposal = None
    if case.get("proposal"):
        proposal = [{"id": f"p{i}", "title": t, "sources": [f["filename"] for f in files]}
                    for i, t in enumerate(FORMACASH_PROPOSAL[:case["proposal"]], 1)]
    out = {"chemin": [], "nombre": None, "remplace": [], "cible": None, "reponse": ""}

    async def chat(chat_files):
        procs = conv if len(conv) >= 2 else []
        intent = await detect_intent(
            message=case["message"], has_workflow=bool(workflow) or bool(procs), filenames=[f["filename"] for f in chat_files],
            history=history, procedures=[{"n": i + 1, "title": p["title"], "steps": len(p["workflow"]),
                                          "displayed": p is active} for i, p in enumerate(procs)] or None)
        out["chemin"].append(f"chat:{intent.intent}")
        out["decision"] = CHAT_INTENTS.get(intent.intent, intent.intent)
        if out["decision"] == "expliquer" and not (workflow or procs):
            out["decision"] = "repondre"  # sans procédure, « expliquer » est la réponse de conversation
        out["cible"] = intent.target_procedure or (conv.index(active) + 1 if active else None)
        out["reponse"] = intent.clarify_question or intent.summary or ""

    if not files and not proposal and not conv:
        await chat([])
        return out
    summary = [{"n": i + 1, "titre": p["title"], "nb_etapes": len(p["workflow"]), "etapes": _steps_summary(p)}
               for i, p in enumerate(conv)]
    plan = await asyncio.to_thread(plan_turn, case["message"], files, bool(workflow), history, proposal, False, summary)
    out["chemin"].append(f"aiguillage:{plan.action}")
    out["reponse"] = plan.reply or ""
    out["remplace"] = list(plan.replaces or [])
    out["titres"] = [p.get("title") for p in plan.procedures if not plan.targets or p["id"] in plan.targets]
    if plan.action in ("generate", "propose", "merge"):
        out["nombre"] = len(plan.targets) if plan.action == "generate" and plan.targets else len(plan.procedures)
    if plan.action == "generate":
        out["decision"] = "operation" if plan.replaces else "rediger"
    elif plan.action == "propose":
        out["decision"] = "proposer"
    elif plan.action == "merge":
        out["decision"] = "fusionner"
    elif plan.action == "remove":
        out["decision"] = "retirer"
    elif plan.action == "structure":
        out["decision"] = "referentiel"
    elif plan.action == "transcribe":
        out["decision"] = "transcrire"
    elif plan.action == "ask":
        out["decision"] = "demander"
    elif plan.action == "answer":
        out["decision"] = "repondre"
    elif plan.action == "analyze" and files:
        out["decision"] = "repondre_sources"
    elif plan.action in ("analyze", "edit"):
        await chat(files if plan.action == "edit" else [])
    else:
        out["decision"] = plan.action
    return out


def judge(case: dict, got: dict) -> list:
    """Écarts entre la décision obtenue et l'attendue (liste vide = juste)."""
    errors = []
    if got["decision"] not in case["attendu"]:
        errors.append(f"décision {got['decision']} (attendu {'/'.join(case['attendu'])})")
        return errors
    if case.get("nombre") is not None and got["decision"] in ("rediger", "operation", "proposer") \
            and got["nombre"] is not None and got["nombre"] != case["nombre"]:
        errors.append(f"{got['nombre']} procédure(s) au lieu de {case['nombre']}")
    if "remplace" in case and got["decision"] in ("operation", "retirer", "fusionner", "rediger") \
            and sorted(got["remplace"]) != sorted(case["remplace"]):
        errors.append(f"refait {got['remplace']} au lieu de {case['remplace']}")
    if case.get("cible") and got["decision"] == "modifier" and got["cible"] != case["cible"]:
        errors.append(f"modifie la procédure {got['cible']} au lieu de {case['cible']}")
    return errors


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="préfixes d'identifiants")
    ap.add_argument("--save", help="fichier JSON des résultats")
    ap.add_argument("--compare", help="résultats précédents (JSON) à comparer")
    ap.add_argument("--repeat", type=int, default=1, help="passages par situation (juste = juste à chaque passage)")
    ap.add_argument("--sans-glossaire", action="store_true", help="aiguillage sans les règles communes (comparaison)")
    args = ap.parse_args()
    if args.sans_glossaire:
        import prompts.studio_planner_prompt as spp
        spp.GLOSSAIRE = ""

    cases = [c for c in CASES if not args.only or any(c["id"].startswith(p) for p in args.only)]
    cache, results = {}, []
    for case in cases:
        paths = [find(rel) for rel in case.get("files") or []]
        if any(p is None for p in paths):
            missing = [rel for rel, p in zip(case["files"], paths) if p is None]
            print(f"  —  {case['id']:<28} sautée : source absente ({', '.join(missing)})")
            results.append({"id": case["id"], "cat": case["cat"], "statut": "sautée"})
            continue
        files = [cache.setdefault(str(p), load(p)) for p in paths]
        t = time.monotonic()
        runs = []
        for _ in range(max(1, args.repeat)):
            try:
                got = await decide(case, files)
                runs.append((got, judge(case, got)))
            except Exception as e:  # une situation en erreur ne bloque pas le banc
                runs.append(({"decision": "erreur", "chemin": [], "reponse": str(e)[:200]}, [f"erreur : {e}"[:200]]))
        # le premier passage faux s'il y en a un (c'est lui qu'on veut voir)
        got, errors = next((r for r in runs if r[1]), runs[0])
        got["duree_s"] = round((time.monotonic() - t) / len(runs), 1)
        got["passages_justes"] = f"{sum(not e for _, e in runs)}/{len(runs)}"
        ok = not errors
        results.append({"id": case["id"], "cat": case["cat"], "statut": "juste" if ok else "faux", "ecarts": errors,
                        "attendu": case["attendu"], **got})
        print(f"  {'✓' if ok else '✗'}  {case['id']:<28} {got['decision']:<17} {' → '.join(got['chemin']):<36} "
              f"{got['duree_s']:>5} s  {got['passages_justes'] if len(runs) > 1 else ''}  {'; '.join(errors)}")
        if not ok and got.get("reponse"):
            print(f"       « {got['reponse'][:160]} »")

    run = [r for r in results if r["statut"] != "sautée"]
    print(f"\n{sum(r['statut'] == 'juste' for r in run)}/{len(run)} justes"
          f" ({len(results) - len(run)} sautée(s)) · {sum(r.get('duree_s', 0) for r in run):.0f} s")
    by_cat = defaultdict(lambda: [0, 0])
    for r in run:
        by_cat[r["cat"]][0] += r["statut"] == "juste"
        by_cat[r["cat"]][1] += 1
    for cat, (ok, n) in by_cat.items():
        print(f"  {cat:<14} {ok}/{n}")

    if args.compare:
        before = {r["id"]: r for r in json.loads(Path(args.compare).read_text(encoding="utf-8"))["resultats"]}
        print("\nChangements par rapport à", args.compare)
        for r in run:
            b = before.get(r["id"])
            if b and b.get("statut") != r["statut"]:
                print(f"  {r['id']:<28} {b['statut']} → {r['statut']}  ({b.get('decision')} → {r['decision']})")
    if args.save:
        Path(args.save).write_text(json.dumps({"date": time.strftime("%Y-%m-%d %H:%M"), "resultats": results},
                                              ensure_ascii=False, indent=1), encoding="utf-8")
        print("Résultats enregistrés :", args.save)


if __name__ == "__main__":
    asyncio.run(main())

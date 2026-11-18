"""
Banc d'essai des modèles sur des fichiers réels (lot 2 de la refonte du chat).

Pour chaque fichier d'un dossier et chaque modèle candidat, exécute le vrai parcours du
Studio — aiguillage (découpage en procédures) puis génération de la première procédure —
en forçant le modèle, et sort un tableau comparatif : durée, nombre de procédures
trouvées, nombre d'étapes générées, erreur éventuelle.

Ce script consomme des appels payants : il ne se lance jamais automatiquement.

Usage (depuis clinic/, avec l'environnement du backend et GOOGLE_API_KEY) :
    python bench/eval_models.py <dossier> --models gemini-3.5-flash-lite gemini-3.6-flash gemini-3.8-flash
    python bench/eval_models.py <dossier> --models ... --limit 5 --csv resultats.csv

Les identifiants de modèles sont passés en argument : ce script ne fait que mesurer, la
configuration retenue va ensuite dans les variables d'environnement de config.py.
"""

import argparse
import asyncio
import csv
import sys
import time
import uuid
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from manager import model_manager  # noqa: E402
from processor.office_extract import extract_office, office_type  # noqa: E402

TYPES = {".pdf": "pdf", ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image",
         ".docx": "docx", ".pptx": "pptx"}


def load_file(path: Path) -> dict:
    data = path.read_bytes()
    ftype = TYPES.get(path.suffix.lower()) or office_type(path.name, "")
    entry = {"file_id": str(uuid.uuid4()), "filename": path.name, "data": data, "type": ftype, "size": len(data)}
    if ftype in ("docx", "pptx"):
        entry["office"] = extract_office(data, ftype)
    return entry


def force_model(model_id: str) -> None:
    """Toutes les fonctions d'appel lisent get_models_for_request au moment de l'appel."""
    model_manager.get_models_for_request = lambda: [SimpleNamespace(value=model_id)]


async def run_one(entry: dict, model_id: str) -> dict:
    from processor.studio_planner import plan_turn
    from processor.multi_doc_processor import MultiDocProcessor
    from routers.studio_router import _card

    force_model(model_id)
    row = {"fichier": entry["filename"], "modèle": model_id, "procédures": 0, "étapes": 0,
           "durée_aiguillage_s": None, "durée_génération_s": None, "erreur": ""}
    try:
        t0 = time.monotonic()
        plan = await asyncio.to_thread(plan_turn, "Formalise les procédures de ce document.", [entry], False, [], None)
        row["durée_aiguillage_s"] = round(time.monotonic() - t0, 1)
        row["procédures"] = len(plan.procedures)
        if plan.procedures:
            t1 = time.monotonic()
            result = await MultiDocProcessor().generate_process(selected_card=_card(plan.procedures[0], [entry]),
                                                                src_files=[entry])
            row["durée_génération_s"] = round(time.monotonic() - t1, 1)
            row["étapes"] = len(result.get("workflow") or [])
    except Exception as e:
        row["erreur"] = str(e)[:160]
    return row


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dossier", type=Path)
    ap.add_argument("--models", nargs="+", required=True)
    ap.add_argument("--limit", type=int, default=0, help="nombre maximal de fichiers")
    ap.add_argument("--csv", type=Path)
    args = ap.parse_args()

    files = sorted(p for p in args.dossier.iterdir() if p.suffix.lower() in TYPES)
    if args.limit:
        files = files[:args.limit]
    rows = []
    for path in files:
        entry = load_file(path)
        for model_id in args.models:
            row = await run_one(entry, model_id)
            rows.append(row)
            print(" | ".join(str(v) for v in row.values()), flush=True)

    if args.csv and rows:
        with args.csv.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f"→ {args.csv}")


if __name__ == "__main__":
    asyncio.run(main())

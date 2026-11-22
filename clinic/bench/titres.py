"""
Banc d'essai des titres de procédures (règle TITRE du glossaire, style des fiches CIH).

Fait proposer des titres par l'aiguillage (sources réelles), la découverte du Studio complet et la rédaction
à partir d'un texte, puis signale les titres qui commencent par « Procédure / Processus / Workflow » alors que
la source ne les nomme pas ainsi, et ceux qui commencent par un verbe à l'infinitif (réservé aux étapes).

Appels payants : jamais lancé automatiquement.
Usage (depuis clinic/) : python bench/titres.py
"""

import asyncio
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bench.decisions import find, load  # noqa: E402
from bench.decisions_cases import FORMACASH, MCNE, FORMULES, INCIDENTS, CHEQUES_DEVISES, TEXTE_COMPLET  # noqa: E402

PREFIX = re.compile(r"^\s*(proc[ée]dure|processus|workflow)\b", re.I)
# premiers mots en -er/-ir/-re qui sont des noms, pas des verbes
NOUNS = {"dossier", "courrier", "fichier", "premier", "dernier", "titre", "lettre", "centre", "ordre", "offre", "nostro",
         "loro", "chantier", "atelier", "registre", "cadre", "chiffre", "livre", "compte", "remdoc", "mcne", "refi", "prefi"}


def verdict(title: str, source_text: str = "") -> list:
    issues = []
    if re.search(r"^(contr[ôo]le|paiement|gestion|traitement|ouverture|modification|réception|délivrance|commande|annulation)\b.*[–-]\s*"
                 r"(v[ée]rification|gestion|traitement|r[ée]alisation|contr[ôo]le)", title or "", re.I):
        issues.append("deux formes (action puis événement)")
    m = PREFIX.match(title or "")
    if m and m.group(0).lower() not in (source_text or "").lower():
        issues.append("commence par « " + m.group(0).strip() + " »")
    first = re.findall(r"[A-Za-zÀ-ÿ']+", title or "")
    if first:
        w = first[0].lower()
        if re.search(r"(er|ir|re)$", w) and not w.endswith("ure") and len(w) > 3 and w not in NOUNS:
            issues.append(f"verbe en tête (« {first[0]} »)")
    return issues


async def main():
    from processor.studio_planner import plan_turn
    rows = []
    for rel in (FORMACASH, MCNE, FORMULES, INCIDENTS, CHEQUES_DEVISES):
        path = find(rel)
        if not path:
            print("  — absente :", rel)
            continue
        f = load(path)
        text = (f.get("office") or {}).get("text", "")
        t = time.monotonic()
        plan = await asyncio.to_thread(plan_turn, "Fais les procédures de ce document.", [f], False, [], None, False, [])
        for p in plan.procedures:
            rows.append(("aiguillage", path.name[:38], p.get("title") or "", verdict(p.get("title"), text)))
        print(f"  aiguillage {path.name[:40]:<40} {len(plan.procedures)} titre(s) · {time.monotonic() - t:.0f} s")

    from processor.multi_doc_processor import MultiDocProcessor
    f = load(find(FORMACASH))
    disc = await MultiDocProcessor().discover_processes([f])
    for c in disc.processes:
        rows.append(("découverte", "Forma Cash", c.title, verdict(c.title)))

    from processor.chat_processor import ChatProcessor
    r = await ChatProcessor().process_message(message=TEXTE_COMPLET, files=[], history=[], intent="generate")
    rows.append(("texte", "compte étudiant", r.get("title") or "", verdict(r.get("title"))))

    print()
    bad = 0
    for where, src, title, issues in rows:
        bad += bool(issues)
        print(f"  {'✗' if issues else '✓'} {where:<11} {src:<38} « {title} »  {'; '.join(issues)}")
    print(f"\n{len(rows) - bad}/{len(rows)} titres conformes")


if __name__ == "__main__":
    asyncio.run(main())

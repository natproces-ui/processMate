"""
Banc d'essai du contenu — ce que la rédaction et la transcription écrivent.

Sur des fiches procédure réelles (format « Acteur : … / Commentaire : … », procédures Opérations à
l'international), compare la procédure produite à ce que dit la fiche, selon les règles du glossaire :
  - acteurs : gardés tels que la fiche les nomme (« Gestionnaire des opérations – BOI » → acteur
    « Gestionnaire des opérations », département « BOI ») ; ni inventés, ni fusionnés ;
  - départements : l'entité de la fiche, pas l'acteur répété ;
  - outils : seulement ceux de la fiche, sous un seul nom ;
  - descriptions : part des tâches décrites.

Rien n'est écrit en base. Appels payants (une rédaction complète par fiche et par mode, ~1 min) :
jamais lancé automatiquement.

Usage (depuis clinic/, avec GOOGLE_API_KEY) :
    python bench/contenu.py                      # fiches par défaut, rédaction et transcription
    python bench/contenu.py --modes rediger --limit 2
    python bench/contenu.py --save avant.json --compare precedent.json
"""

import argparse
import asyncio
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

ROOT = Path(os.environ.get("BENCH_SOURCES") or Path.home()) / "Desktop" / "Procedures processmate"
FICHES = [
    "CREDOC EXPORT Modification V2 (1).docx",
    "Virements.docx",
    "Rapatriements en devises.docx",
    "Expiration des cautions émises à l'international.docx",
    "SBLC Import - Mise en jeu (1).docx",
    "Gestion des transferts de masse des pensions de retraite - CDG.docx",
]
# Applicatifs cités dans les fiches (relevés sur les 71 fiches)
OUTILS = ["TI+", "TIPLUS", "Docflow", "Swift Alliance", "SWIFT", "Nov@GC", "Nov@BOmain", "Nov@Op", "PORTNET", "Outlook",
          "E-mail", "IBO", "EDI", "Carthago", "SIMT", "RTGS", "BADR", "Excel", "FIRCO"]
ARTICLES = {"le", "la", "les", "l", "un", "une", "des", "du", "de", "d"}
# Abréviations des fiches : leur forme développée est permise (glossaire : « déduire une abréviation »)
ALIAS = {"back office international": "boi", "back office": "bo", "salle des marches": "salle marche",
         "salle marches": "salle marche"}


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", (text or "").replace("’", " ").replace("'", " ")).encode("ascii", "ignore").decode().lower()
    words = [w for w in re.findall(r"[a-z0-9@+]+", text) if w not in ARTICLES]
    out = " ".join(words)
    for long, short in ALIAS.items():
        out = re.sub(r"\b" + long + r"\b", short, out)
    return out


def split_actor(raw: str):
    """« Gestionnaire des opérations – BOI » → (fonction, entité) ; « Agence » → (Agence, Agence)."""
    raw = re.sub(r"\(.*?\)", "", raw or "").strip()
    parts = re.split(r"\s+[–—-]\s+|\s*[–—]\s*", raw, maxsplit=1)
    if len(parts) == 2 and parts[0].strip() and parts[1].strip():
        return parts[0].strip(), parts[1].strip()
    return raw, raw


def read_fiche(path: Path) -> dict:
    import docx
    d = docx.Document(str(path))
    actors, text = [], []
    for t in d.tables:
        for r in t.rows:
            cells = [c.text.strip() for c in r.cells]
            if len(cells) >= 2 and re.match(r"Acteur", cells[0]) and cells[1]:
                actors.append(cells[1])
            text.append(" ".join(cells))
    text = "\n".join(text + [p.text for p in d.paragraphs])
    tools = {o for o in OUTILS if re.search(r"(?<![\w@])" + re.escape(o) + r"(?![\w])", text, re.I)}
    if {"TI+", "TIPLUS"} & tools:
        tools = (tools - {"TIPLUS"}) | {"TI+"}
    return {"acteurs": actors, "fonctions": {norm(split_actor(a)[0]) for a in actors},
            "entites": {norm(split_actor(a)[1]) for a in actors}, "complets": {norm(a) for a in actors},
            "outils": {norm(o) for o in tools}, "texte": norm(text)}


def score(fiche: dict, workflow: list) -> dict:
    """Note une procédure produite contre la fiche."""
    tasks = [r for r in workflow if r.get("typeBpmn") in ("UserTask", "ServiceTask", "Task", "ManualTask", "SendTask",
                                                           "ReceiveTask", "BusinessRuleTask", "ScriptTask")]
    internes = [r for r in workflow if (r.get("typeActeur") or "interne") != "externe"]
    actors = {r.get("acteur") or "" for r in internes if r.get("acteur")}

    def known(a):
        n = norm(a)
        # nommé dans les lignes « Acteur : », ou ailleurs dans la fiche (section « Acteurs internes »…)
        return (n in fiche["fonctions"] or n in fiche["complets"] or n in fiche["entites"]
                or bool(n and re.search(r"\b" + re.escape(n) + r"\b", fiche["texte"])))
    invented = sorted(a for a in actors if not known(a))
    found = {norm(a) for a in actors}
    lost = sorted(f for f in fiche["fonctions"] if f not in found and not any(f in norm(a) for a in actors))
    # Fiche « Fonction – Entité » : acteur = la fonction, département = l'entité (glossaire)
    pairs = {norm(a): split_actor(a) for a in fiche["acteurs"]}
    pairs = {k: (norm(f), norm(e)) for k, (f, e) in pairs.items() if norm(f) != norm(e)}
    by_fonction = {f: e for f, e in pairs.values()}
    with_entity, dept_ok = [], 0
    for r in internes:
        a, d = norm(r.get("acteur") or ""), norm(r.get("département") or "")
        if a in pairs:                      # l'entité est restée dans l'acteur
            with_entity.append(r)
        elif a in by_fonction:
            with_entity.append(r)
            dept_ok += d == by_fonction[a] or by_fonction[a] in d
    tools_out = {}
    for r in workflow:
        for t in re.split(r"\s*[/,;]\s*", r.get("outil") or ""):
            if t.strip():
                key = norm(t).replace("tiplus", "ti+")
                key = "e mail" if key in ("email", "mail", "e mail", "messagerie") else key
                tools_out.setdefault(key, set()).add(t.strip())
    tools_invented = sorted(t for t in tools_out if not any(t == o or t in o or o in t for o in fiche["outils"]))
    variants = sorted(", ".join(sorted(v)) for v in tools_out.values() if len(v) > 1)
    described = sum(bool((r.get("descriptif") or r.get("description") or "").strip()) for r in tasks)
    return {"etapes": len(workflow), "acteurs": sorted(actors),
            "departements": sorted({r.get("département") or "" for r in internes}),
            "paires": sorted({f"{r.get('acteur')} | {r.get('département')}" for r in internes}), "acteurs_inventes": invented, "acteurs_perdus": lost,
            "departements_justes": f"{dept_ok}/{len(with_entity)}", "outils": sorted(tools_out),
            "outils_inventes": tools_invented, "outils_graphies": variants,
            "descriptions": f"{described}/{len(tasks)}", "workflow": workflow}


class FakeRequest:
    async def is_disconnected(self):
        return False


async def produce(mode: str, path: Path) -> list:
    from processor.office_extract import extract_office
    data = path.read_bytes()
    office = extract_office(data, "docx")
    if mode == "transcrire":
        from processor.chat_processor import ChatProcessor
        f = {"filename": path.name, "content": data, "type": "docx", "office": office}
        r = await ChatProcessor().process_message(message="Transcris la fiche à l'identique.", files=[f], history=[],
                                                  intent="transcribe")
        return r.get("workflow") or []
    from routers import studio_router as sr
    files = [{"file_id": "f1", "filename": path.name, "data": data, "type": "docx", "size": len(data), "office": office}]
    proc = {"id": "p1", "title": path.stem, "sources": [{"file": path.name}], "base": []}
    async for chunk in sr._generate(FakeRequest(), files, [proc], ["p1"], False, None, "Formalise cette procédure.", None, [], []):
        ev = json.loads(chunk[6:]) if chunk.startswith("data: ") else {}
        if ev.get("type") == "procedure_ready":
            wf = ev["workflow"]
            desc = (ev.get("enrichments") or {})
            for r in wf:  # les descriptions de la rédaction sont dans les enrichissements
                e = desc.get(str(r.get("id"))) or {}
                r.setdefault("descriptif", e.get("descriptif") or "")
            return wf
        if ev.get("type") == "procedure_error":
            raise RuntimeError(ev.get("message"))
    return []


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--modes", nargs="*", default=["rediger", "transcrire"])
    ap.add_argument("--limit", type=int)
    ap.add_argument("--fiches", nargs="*", help="débuts de noms de fiches")
    ap.add_argument("--save")
    ap.add_argument("--compare")
    ap.add_argument("--renoter", help="renoter les procédures d'un fichier de résultats, sans rien produire")
    args = ap.parse_args()
    if args.renoter:
        old = json.loads(Path(args.renoter).read_text(encoding="utf-8"))["resultats"]
        for r in old:
            if r.get("workflow") is not None:
                s = score(read_fiche(ROOT / r["fiche"]), r["workflow"])
                print(f"  {r['mode']:<10} {r['fiche'][:45]:<45} inventés {len(s['acteurs_inventes'])} · perdus "
                      f"{len(s['acteurs_perdus'])} · fonction/entité {s['departements_justes']} · outils inventés "
                      f"{len(s['outils_inventes'])} · descriptions {s['descriptions']}")
        return
    results = []
    chosen = [f for f in FICHES if not args.fiches or any(f.lower().startswith(x.lower()) for x in args.fiches)]
    for name in chosen[:args.limit]:
        path = ROOT / name
        if not path.exists():
            print("  — sautée :", name)
            continue
        fiche = read_fiche(path)
        for mode in args.modes:
            t = time.monotonic()
            try:
                s = score(fiche, await produce(mode, path))
            except Exception as e:
                s = {"erreur": str(e)[:200]}
            s.update(fiche=name, mode=mode, duree_s=round(time.monotonic() - t))
            results.append(s)
            if "erreur" in s:
                print(f"  ✗ {mode:<10} {name[:45]:<45} erreur : {s['erreur']}")
                continue
            print(f"  {mode:<10} {name[:45]:<45} {s['etapes']:>3} étapes · acteurs inventés {len(s['acteurs_inventes'])}"
                  f" · perdus {len(s['acteurs_perdus'])} · fonction/entité {s["departements_justes"]}"
                  f" · outils inventés {len(s['outils_inventes'])} · graphies {len(s['outils_graphies'])}"
                  f" · descriptions {s['descriptions']} · {s['duree_s']} s")
            print(f"       acteur | département : {s['paires']}")
            for k in ("acteurs_inventes", "acteurs_perdus", "outils_inventes", "outils_graphies"):
                if s[k]:
                    print(f"       {k.replace('_', ' ')} : {s[k]}")
    ok = [r for r in results if "erreur" not in r]
    if ok:
        def tot(key):
            return sum(len(r[key]) for r in ok)

        def frac(key):
            a = [tuple(map(int, r[key].split("/"))) for r in ok]
            return f"{sum(x for x, _ in a)}/{sum(y for _, y in a)}"
        print(f"\nTotal ({len(ok)} productions) : acteurs inventés {tot('acteurs_inventes')} · perdus {tot('acteurs_perdus')}"
              f" · fonction/entité {frac("departements_justes")} · outils inventés {tot('outils_inventes')}"
              f" · graphies multiples {tot('outils_graphies')} · descriptions {frac('descriptions')}")
    if args.save:
        Path(args.save).write_text(json.dumps({"date": time.strftime("%Y-%m-%d %H:%M"), "resultats": results},
                                              ensure_ascii=False, indent=1), encoding="utf-8")
        print("Résultats enregistrés :", args.save)


if __name__ == "__main__":
    asyncio.run(main())

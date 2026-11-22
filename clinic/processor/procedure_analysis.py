# clinic/processor/procedure_analysis.py
"""
Analyses d'une procédure, demandées dans le chat (cerveau unique, action « analyse ») :

- irritants      : ce qui gêne vraiment dans la procédure telle qu'elle est (ruptures d'information, ressaisies,
                   attentes, outils, responsabilités floues), avec des pistes de résolution ;
- ameliorations  : ce qui rendrait la procédure meilleure, même sans problème visible (simplifier, automatiser,
                   contrôler, digitaliser, clarifier) — différent des irritants ;
- reglementaire  : les exigences réglementaires trouvées par une vraie recherche sur internet, comparées à la
                   procédure (couverte, partielle, absente), avec leurs sources.

Chaque analyse renvoie un texte pour le chat (les étapes citées « étape 5 » sont cliquables) et des éléments
structurés pour l'écran (futurs boutons « Irritants », « Améliorations », « Analyse réglementaire »).
Catégories d'irritants reprises de processor/irritants_processor.py (écran Analyse).
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional

from google.genai import types

from prompts.glossaire import extrait

logger = logging.getLogger(__name__)

TYPES = {"irritants": "Irritants", "ameliorations": "Pistes d'amélioration", "reglementaire": "Analyse réglementaire"}


def _workflow_text(proc: Dict[str, Any], limit: int = 80) -> str:
    enr = proc.get("enrichments") or {}
    lines = []
    for r in (proc.get("workflow") or [])[:limit]:
        if not isinstance(r, dict):
            continue
        rid = str(r.get("id"))
        desc = (enr.get(rid) or {}).get("descriptif") if isinstance(enr.get(rid), dict) else ""
        outs = ", ".join(f"{o.get('targetId')}{' (' + o['label'] + ')' if o.get('label') else ''}"
                         for o in r.get("outputs") or [] if isinstance(o, dict))
        lines.append(f"{rid}. [{r.get('typeBpmn')}] {r.get('étape')} — {r.get('acteur') or '?'} ({r.get('département') or '?'})"
                     f"{' · outil : ' + r['outil'] if r.get('outil') else ''}{' · condition : ' + r['condition'] if r.get('condition') else ''}"
                     f" → {outs or 'fin'}{' · ' + desc[:200] if desc else ''}")
    return "\n".join(lines)


COMMUN = """{regles}

PROCÉDURE « {titre} » (une ligne par étape : numéro, type, libellé, acteur (département), outil, condition, suite, descriptif) :
{workflow}

DEMANDE DE L'UTILISATEUR : {message}

Règles :
- Ne fabrique rien : tout constat s'appuie sur des étapes réelles de la procédure ci-dessus ; cite-les par leur NUMÉRO
  dans "etapes" (ex. ["4", "5"]).
- Si la procédure ne montre aucun problème de ce type, renvoie une liste vide : c'est une réponse valable.
- Français, phrases courtes et concrètes, sans jargon d'interface.
"""

IRRITANTS = COMMUN + """
Tâche : repère les IRRITANTS — ce qui gêne vraiment dans la procédure telle qu'elle est écrite.
Catégories : Rupture d'information (transfert manuel, mail, ressaisie, interface absente, statut non visible) |
Automatisation (tâche manuelle répétitive, contrôle simple, document à produire) | Délai / Attente (blocage, validation
lente, dépendance externe) | Outil / Système | Organisation (responsabilité floue, relais ambigu, acteurs mal définis).
Au plus 6 irritants, du plus gênant au moins gênant ; 1 à 3 pistes chacun (la première : la solution la plus complète ;
la dernière : un gain rapide si pertinent).

Réponds UNIQUEMENT avec ce JSON :
{{"elements": [{{"titre": "max 80 caractères", "categorie": "Rupture d'information", "niveau": "Élevé|Moyen|Faible",
  "etapes": ["4"], "constat": "2 phrases", "pistes": [{{"titre": "max 60 caractères", "description": "1-2 phrases"}}]}}]}}
"""

AMELIORATIONS = COMMUN + """
Tâche : propose des PISTES D'AMÉLIORATION — ce qui rendrait la procédure meilleure, même si rien n'y est bloquant
(ce ne sont pas des irritants) : supprimer ou fusionner des étapes, automatiser, ajouter un contrôle manquant au bon
endroit, digitaliser un échange, clarifier une responsabilité, raccourcir le parcours, mieux tracer.
Au plus 6 pistes, de la plus utile à la moins utile.

Réponds UNIQUEMENT avec ce JSON :
{{"elements": [{{"titre": "max 80 caractères", "type": "Simplification|Automatisation|Contrôle|Digitalisation|Organisation|Traçabilité",
  "etapes": ["4"], "apport": "ce que ça change, 1-2 phrases", "effort": "Faible|Moyen|Élevé", "mise_en_oeuvre": "1-2 phrases"}}]}}
"""

REGLEMENTAIRE = COMMUN + """
EXIGENCES RÉGLEMENTAIRES TROUVÉES PAR UNE RECHERCHE SUR INTERNET (avec leurs sources numérotées) :
{exigences}

Tâche : compare la procédure à CES exigences seulement (n'en ajoute aucune). Pour chacune : la procédure la couvre-t-elle ?
"couverte" (une étape la réalise), "partielle" (une étape s'en approche sans la remplir), "absente" (rien dans la procédure).
Dans "source", le numéro de la source qui la fonde.

Réponds UNIQUEMENT avec ce JSON :
{{"elements": [{{"exigence": "max 120 caractères", "texte": "référence du texte (circulaire, article…) si connue",
  "statut": "couverte|partielle|absente", "etapes": ["4"], "constat": "1-2 phrases", "action": "ce qu'il faudrait faire, vide si couverte",
  "source": 1}}]}}
"""


def _ask(prompt: str) -> List[Dict[str, Any]]:
    from manager.model_manager import GeminiModel, generate_content
    response = generate_content(prompt, types.GenerateContentConfig(temperature=0.2, response_mime_type="application/json"),
                                "Analyse de procédure", [GeminiModel.FLASH, GeminiModel.LITE])
    text = re.sub(r"```(?:json)?", "", response.text or "").strip()
    try:
        data = json.loads(text)
    except ValueError:
        m = re.search(r"\{[\s\S]*\}", text)
        data = json.loads(m.group(0)) if m else {}
    return [e for e in (data.get("elements") or []) if isinstance(e, dict)][:8]


def _valid_steps(elements: List[Dict[str, Any]], proc: Dict[str, Any]) -> None:
    """Ne garde que les numéros d'étapes qui existent (rien d'inventé)."""
    ids = {str(r.get("id")) for r in proc.get("workflow") or [] if isinstance(r, dict)}
    for e in elements:
        e["etapes"] = [str(x) for x in e.get("etapes") or [] if str(x) in ids]


def _steps_ref(e: Dict[str, Any]) -> str:
    s = e.get("etapes") or []
    return "" if not s else (f" (étape {s[0]})" if len(s) == 1 else f" (étapes {', '.join(s[:-1])} et {s[-1]})")


def analyse(kind: str, proc: Dict[str, Any], message: str, found: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Appel synchrone (asyncio.to_thread). `found` : résultat de web_search.search (analyse réglementaire).
    Renvoie {"type", "titre", "elements", "text"}."""
    title = proc.get("title") or "la procédure"
    base = {"regles": extrait("ACTEUR", "OUTIL", "DÉDUIRE OU INVENTER", "LA RÉPONSE"), "titre": title,
            "workflow": _workflow_text(proc), "message": message.strip()[:600]}
    if kind == "reglementaire":
        sources = (found or {}).get("sources") or []
        numbered = "\n".join(f"[{i}] {s.get('title') or s.get('domain')}" for i, s in enumerate(sources, 1))
        prompt = REGLEMENTAIRE.format(**base, exigences=((found or {}).get("text") or "(rien trouvé)") + "\nSources :\n" + (numbered or "(aucune)"))
    else:
        prompt = (IRRITANTS if kind == "irritants" else AMELIORATIONS).format(**base)
    elements = _ask(prompt)
    _valid_steps(elements, proc)
    if kind == "reglementaire":
        sources = (found or {}).get("sources") or []
        for e in elements:
            try:
                n = int(e.get("source"))
                e["source"] = sources[n - 1] if 1 <= n <= len(sources) else None
            except (TypeError, ValueError):
                e["source"] = None
    return {"type": kind, "titre": TYPES[kind], "elements": elements, "text": render(kind, title, elements, found)}


def render(kind: str, title: str, elements: List[Dict[str, Any]], found: Optional[Dict[str, Any]] = None) -> str:
    """Texte du chat : direct, sans étiquettes, étapes citées (cliquables à l'écran)."""
    if kind == "irritants":
        if not elements:
            return f"Je ne vois pas d'irritant net dans « {title} » : les relais, outils et responsabilités sont lisibles tels qu'écrits."
        lines = [f"Dans « {title} », je relève **{len(elements)} irritant{'s' if len(elements) > 1 else ''}**, du plus gênant au moins gênant :", ""]
        for i, e in enumerate(elements, 1):
            lines.append(f"{i}. **{e.get('titre')}**{_steps_ref(e)} — {e.get('categorie', '')}, {str(e.get('niveau', '')).lower()}. {e.get('constat', '')}")
            for p in (e.get("pistes") or [])[:3]:
                lines.append(f"   - {p.get('titre')} : {p.get('description')}")
        return "\n".join(lines)
    if kind == "ameliorations":
        if not elements:
            return f"Je ne vois pas d'amélioration nette à proposer pour « {title} » tel qu'il est écrit."
        lines = [f"Pour améliorer « {title} », voici **{len(elements)} piste{'s' if len(elements) > 1 else ''}**, de la plus utile à la moins utile :", ""]
        for i, e in enumerate(elements, 1):
            lines.append(f"{i}. **{e.get('titre')}**{_steps_ref(e)} — {e.get('type', '')}, effort {str(e.get('effort', '')).lower()}. "
                         f"{e.get('apport', '')} {e.get('mise_en_oeuvre', '')}".rstrip())
        return "\n".join(lines)
    # réglementaire
    if not elements:
        return (f"La recherche n'a pas trouvé d'exigence réglementaire précise à comparer à « {title} »."
                if not (found or {}).get("sources") else
                f"Je n'ai pas pu rattacher les textes trouvés aux étapes de « {title} ».")
    order = {"absente": 0, "partielle": 1, "couverte": 2}
    elements = sorted(elements, key=lambda e: order.get(e.get("statut"), 3))
    counts = {k: sum(e.get("statut") == k for e in elements) for k in order}
    lines = [f"J'ai comparé « {title} » à **{len(elements)} exigence{'s' if len(elements) > 1 else ''}** trouvée{'s' if len(elements) > 1 else ''} "
             f"en ligne : {counts['couverte']} couverte{'s' if counts['couverte'] > 1 else ''}, {counts['partielle']} partielle{'s' if counts['partielle'] > 1 else ''}, "
             f"{counts['absente']} absente{'s' if counts['absente'] > 1 else ''}.", ""]
    for e in elements:
        src = (e.get("source") or {}).get("domain") if isinstance(e.get("source"), dict) else ""
        ref = f" ({e['texte']})" if e.get("texte") else ""
        lines.append(f"- **{e.get('exigence')}**{ref} — {e.get('statut')}{_steps_ref(e)}. {e.get('constat', '')}"
                     f"{' ' + e['action'] if e.get('action') and e.get('statut') != 'couverte' else ''}{f' Source : {src}.' if src else ''}")
    return "\n".join(lines)


def regulatory_question(proc: Dict[str, Any], message: str) -> str:
    """Ce qu'on cherche en ligne pour l'analyse réglementaire d'une procédure."""
    steps = "; ".join(str(r.get("étape")) for r in (proc.get("workflow") or [])[:25] if isinstance(r, dict))
    return (f"Quelles exigences réglementaires (textes officiels, circulaires, instructions, normes) s'appliquent à la "
            f"procédure « {proc.get('title')} » ? Étapes : {steps}. Demande de l'utilisateur : {message.strip()[:300]}. "
            f"Liste les exigences précises (obligations, contrôles, délais, documents, déclarations) avec leurs références.")

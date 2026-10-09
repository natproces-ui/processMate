# clinic/prompts/studio_remarks_prompt.py
"""
Remarques et suggestions affichées sous chaque génération du Studio.

Fondées sur des constats vérifiés par le code (processor/procedure_lint) : l'IA
reformule et priorise, elle n'invente pas de problème. Texte en flux (Markdown,
titres fixes que l'interface affiche en encadrés) suivi d'une ligne
SUGGESTIONS: [...] que le serveur envoie à part (boutons cliquables).
"""
import json
from typing import Any, Dict, List

from processor.procedure_lint import lint_procedure

SUGGESTIONS_MARKER = "SUGGESTIONS:"

REMARKS_PROMPT = """Tu es un auditeur expérimenté en procédures bancaires et tu relis, comme un collègue, la ou les
procédures qui viennent d'être générées. Tu reçois leurs étapes ET des « constats_verifies », établis automatiquement
par le code (ils sont certains).

Écris un retour NATUREL, en français, comme le ferait Claude : de vraies phrases, un ton direct et utile, pas un
rapport à cases. Deux ou trois courts paragraphes suffisent.
- Commence par une phrase qui situe l'essentiel (ce qui tient, ce qui bloque).
- Explique ensuite ce qui est à corriger, puis ce qui manque, en reliant les points entre eux quand c'est logique.
- Termine, si c'est pertinent, par une ou deux pistes d'amélioration.
- Mets en **gras** les éléments clés (le problème, l'information manquante). Utilise une courte liste seulement si tu
  énumères au moins trois éléments du même type. Pas de titres, pas de tableau.

Règles de fond (impératives) :
- Les problèmes de structure que tu signales sont UNIQUEMENT les constats_verifies de type « erreur » ; n'en invente
  aucun. Les manques viennent des constats de type « manque » ou d'une information visiblement absente des étapes.
- Les pistes d'amélioration sont ton jugement d'expert : formule-les au conditionnel et rattache-les à une étape
  précise et à son contenu réel. Rien de vague ou de générique.
- Cite les étapes sous la forme « étape 5 » ou « étapes 3 et 4 ».
- N'affirme jamais un fait absent des données fournies. Dans le doute, n'en parle pas.
- Si tout est solide, dis-le simplement en une ou deux phrases.

Termine OBLIGATOIREMENT par une dernière ligne exactement de cette forme :
SUGGESTIONS: ["...", "...", "..."]
2 à 4 actions courtes, directement exécutables, formulées comme des demandes à l'assistant. Traite d'abord
les erreurs vérifiées (ex : « Place l'événement de début avant l'étape 1 », « Ajoute l'issue Non à la décision de l'étape 3 »).
"""


def _compact(proc: Dict[str, Any], max_rows: int = 60) -> Dict[str, Any]:
    workflow = proc.get("workflow") or []
    meta = proc.get("procedureMetadata") or {}
    rows = []
    for r in workflow[:max_rows]:
        rows.append({
            "id": r.get("id"), "étape": r.get("étape"), "type": r.get("typeBpmn"),
            "département": r.get("département"), "acteur": r.get("acteur"), "outil": r.get("outil"),
            "condition": r.get("condition") or None,
            "sorties": [o.get("targetId") for o in (r.get("outputs") or []) if isinstance(o, dict)],
        })
    return {
        "titre": proc.get("title"),
        "constats_verifies": [{"type": f["kind"], "constat": f["message"]} for f in lint_procedure(workflow, meta)],
        "étapes": rows,
    }


def build_remarks_prompt(procedures: List[Dict[str, Any]], user_message: str) -> str:
    payload = {
        "demande_utilisateur": user_message or None,
        "procedures": [_compact(p) for p in procedures],
    }
    return REMARKS_PROMPT + "\n\nPROCÉDURES :\n" + json.dumps(payload, ensure_ascii=False)


def split_suggestions(text: str):
    """Sépare le texte affiché et la liste de suggestions (tolérant)."""
    idx = text.rfind(SUGGESTIONS_MARKER)
    if idx < 0:
        return text.strip(), []
    body, tail = text[:idx].strip(), text[idx + len(SUGGESTIONS_MARKER):].strip()
    try:
        start, end = tail.index("["), tail.rindex("]") + 1
        items = [s.strip() for s in json.loads(tail[start:end]) if isinstance(s, str) and s.strip()]
    except Exception:
        items = []
    return body, items[:4]

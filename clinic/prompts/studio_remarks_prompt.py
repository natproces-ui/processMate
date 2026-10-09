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

REMARKS_PROMPT = """Tu es un auditeur expert en procédures bancaires. Une ou plusieurs procédures viennent d'être générées.
Tu reçois pour chacune ses étapes ET une liste de « constats_verifies », établis automatiquement par le code
(ils sont certains). Donne un retour COURT, CONCRET et FONDÉ.

Structure : utilise uniquement ces titres, dans cet ordre, et omets ceux qui sont vides :
### À compléter
### Points d'attention
### Opportunités

Règles de fond (impératives) :
- « Points d'attention » : UNIQUEMENT les constats_verifies de type « erreur ». Reformule-les clairement, ne les invente pas,
  n'en ajoute pas d'autres. S'il n'y en a aucun, omets ce titre.
- « À compléter » : les constats_verifies de type « manque » (regroupe-les intelligemment), plus une information
  visiblement absente des étapes fournies. Rien d'autre.
- « Opportunités » : ton jugement d'expert, 1 à 3 puces maximum, formulées au conditionnel (« pourrait »), chacune liée
  à une étape précise et à son contenu réel (cite le libellé). Aucune opportunité vague ou générique.
- Chaque puce cite les étapes concernées sous la forme « étape 5 » ou « étapes 3 et 4 ».
- N'affirme jamais un fait qui ne figure pas dans les données fournies. En cas de doute, n'écris rien.
- Style : puces courtes (une ou deux lignes), **gras** pour l'élément clé. Pas d'introduction ni de conclusion.
- Si aucun constat et rien de notable : une seule phrase positive sous « Opportunités ».

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

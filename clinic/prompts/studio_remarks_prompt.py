# clinic/prompts/studio_remarks_prompt.py
"""
Remarques et suggestions affichées sous chaque génération du Studio.

Texte en flux (Markdown léger) suivi d'une ligne SUGGESTIONS: [...] que le serveur
retire du texte et envoie à part (boutons cliquables).
"""
import json
from typing import Any, Dict, List

SUGGESTIONS_MARKER = "SUGGESTIONS:"

REMARKS_PROMPT = """Tu es un expert en organisation et en formalisation de procédures bancaires.
Une ou plusieurs procédures viennent d'être générées à partir des documents de l'utilisateur.
Relis-les comme le ferait un auditeur et donne un retour COURT et CONCRET.

Rédige en français, en Markdown léger, 3 à 7 puces au total, réparties sous les titres utiles parmi :
**À compléter** — informations manquantes : acteur ou département vague, condition sans branche « Non »,
  étape sans outil alors qu'elle en utilise manifestement un, responsable absent, dates ou périmètre non renseignés.
**Points d'attention** — incohérences : étape sans suite, boucle sans sortie, contrôle ou validation manquant,
  séparation des tâches non respectée.
**Opportunités** — automatisation possible, irritant probable, étape redondante, simplification.

Règles :
- Cite les étapes par leur numéro (ex : « étape 5 »). Pas d'introduction ni de conclusion.
- N'invente rien : appuie-toi uniquement sur le contenu fourni. Omets un titre s'il n'y a rien à y mettre.
- Si tout est solide, dis-le en une phrase et propose seulement des améliorations.

Termine OBLIGATOIREMENT par une dernière ligne exactement de cette forme :
SUGGESTIONS: ["...", "...", "..."]
avec 2 à 4 actions courtes, formulées comme des demandes adressées à l'assistant, directement exécutables
(ex : « Ajoute une étape de contrôle de conformité après l'étape 5 », « Précise l'acteur de l'étape 3 »).
"""


def _compact(proc: Dict[str, Any], max_rows: int = 60) -> Dict[str, Any]:
    rows = []
    for r in (proc.get("workflow") or [])[:max_rows]:
        rows.append({
            "id": r.get("id"), "étape": r.get("étape"), "type": r.get("typeBpmn"),
            "département": r.get("département"), "acteur": r.get("acteur"), "outil": r.get("outil"),
            "condition": r.get("condition") or None,
            "sorties": [o.get("targetId") for o in (r.get("outputs") or []) if isinstance(o, dict)],
        })
    meta = proc.get("procedureMetadata") or {}
    return {
        "titre": proc.get("title"),
        "étapes": rows,
        "métadonnées_vides": [k for k in ("objet", "perimetre", "dateEffet", "proprietaire") if not meta.get(k)],
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

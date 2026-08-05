"""
Prompt pour l'extraction des champs d'un écran d'application depuis une capture.
Même principe que extract_prompt.py (extraction de workflow depuis une image), appliqué
à un écran d'outil plutôt qu'à un processus complet — voir referentiel-outils.md.
"""

TOOL_SCREEN_EXTRACTION_PROMPT = """Tu es un expert en analyse d'interfaces applicatives métier (outils bancaires internes : saisie de transactions, consultation de dossiers, back-office...).

🎯 OBJECTIF : à partir de la capture d'écran fournie, identifier tous les champs de saisie/consultation visibles et les restituer sous forme de JSON structuré.

RÈGLES :
- Un champ = tout élément de formulaire visible : zone de texte, liste déroulante, case à cocher, sélecteur de date, montant, numéro de compte, etc.
- N'invente aucun champ qui n'est pas visible sur la capture.
- Le type doit être l'un de : "texte", "nombre", "date", "liste".
- "required" = true uniquement si un indicateur visuel de champ obligatoire est présent (astérisque, couleur, mention explicite) — sinon false, ne jamais deviner.
- "example_value" = la valeur déjà affichée dans le champ sur la capture, si il y en a une (utile comme exemple) — sinon chaîne vide.
- Si le nom exact du champ n'est pas lisible, utilise une description courte plutôt que de l'inventer.

FORMAT DE SORTIE — uniquement ce JSON, rien d'autre :
{
  "fields": [
    {"name": "...", "field_type": "texte|nombre|date|liste", "required": true|false, "example_value": "..."}
  ]
}
"""


def get_tool_screen_extraction_prompt() -> str:
    return TOOL_SCREEN_EXTRACTION_PROMPT

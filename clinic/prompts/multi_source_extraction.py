"""
Prompt d'extraction complète multi-sources
Utilisé quand l'utilisateur sélectionne un processus à générer
"""

from prompts.extract_prompt import get_extraction_prompt


MULTI_SOURCE_PREFIX = """Tu es un expert en formalisation de processus métier bancaires.

🎯 OBJECTIF : Extraire et formaliser COMPLÈTEMENT le processus "{process_title}" depuis les documents fournis.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CONTEXTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Description connue du processus :
{process_description}

Sources impliquées : {source_files}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 INSTRUCTIONS SPÉCIFIQUES MULTI-SOURCES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Si plusieurs documents sont fournis :
- Identifie le document principal (celui qui contient la structure du processus)
- Les autres documents apportent des détails complémentaires (acteurs, outils, conditions)
- Fusionne intelligemment sans dupliquer les étapes
- En cas de contradiction entre sources, privilégie le document le plus détaillé

⚠️ IMPORTANT :
- Parcours TOUT le contenu disponible, ne t'arrête pas à la première page
- Un processus bancaire peut avoir des branches de rejet, d'escalade, de reprise — capture-les TOUTES
- Les swimlanes peuvent être implicites dans le texte (mentionner des acteurs = swimlane potentielle)

"""


def get_multi_source_extraction_prompt(
    process_title: str,
    process_description: str,
    source_files: list[str]
) -> str:
    """
    Construit le prompt complet pour l'extraction d'un processus sélectionné.
    Combine le contexte multi-sources + le prompt d'extraction standard.
    """
    prefix = MULTI_SOURCE_PREFIX.format(
        process_title=process_title,
        process_description=process_description,
        source_files=", ".join(source_files)
    )

    # Réutilise le prompt d'extraction existant (format Table1Row + enrichissements)
    extraction_format = get_extraction_prompt()

    return prefix + "\n\n" + extraction_format
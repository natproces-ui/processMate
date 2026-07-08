"""
Prompt de découverte de processus depuis un flowchart de code source.
Identifie les processus métier dans le code, sépare actions humaines vs système.
"""

_DISCOVERY_CODE_BASE = """Tu es un expert en analyse de code source et modélisation de processus métier (BPMN).

🎯 OBJECTIF : Analyser ce flowchart de code source et identifier les processus métier sous-jacents.
Le code implémente des processus métier — ton rôle est de les retrouver.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CE QUE TU DOIS FAIRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Analyser le flowchart (structure DOT/Graphviz) et les métadonnées du code
2. Identifier chaque processus métier distinct implémenté dans le code
3. Pour chaque processus : titre clair + description orientée métier (pas technique)
4. Estimer le nombre d'étapes BPMN (pas de lignes de code)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 RÈGLES D'IDENTIFICATION DES ACTEURS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Si le code mentionne des rôles/acteurs clairs (Client, Gestionnaire, Validateur) → utiliser ces noms
- Si les acteurs ne sont pas clairs → regrouper par fonction logique : "Acteur 1", "Acteur 2", etc.
- Les actions SYSTÈME (calculs, validations automatiques, appels API) ne sont PAS des acteurs
  → Elles vont dans les règles de gestion ou les descriptions de tâches
- Un système n'est jamais un acteur BPMN — c'est un outil utilisé par un acteur humain

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 FORMAT DE SORTIE JSON STRICT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Réponds UNIQUEMENT avec ce JSON, sans markdown :

{
  "processes": [
    {
      "title": "Titre clair et professionnel du processus métier",
      "description": "Description en 2-3 phrases : objectif métier, acteurs principaux, flux général",
      "source_files": ["flowchart_source"],
      "estimated_steps": 12,
      "confidence": 85,
      "category": "discovered",
      "actors_identified": ["Client", "Gestionnaire"],
      "system_actions": ["Validation automatique MD5", "Appel API partenaire"]
    }
  ],
  "warnings": []
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ RÈGLES IMPORTANTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Chaque procédure/fonction majeure du code peut être un processus séparé OU une étape d'un processus plus large
- Si une fonction est un sous-processus d'une autre → les regrouper
- Si deux fonctions sont indépendantes → deux processus séparés
- Privilégier la vision métier : "Traitement de la demande de virement" plutôt que "Fonction ProcessVirement()"
- estimated_steps : nombre d'étapes BPMN (tâches humaines + gateways), pas le nombre de lignes
- JSON PUR, pas de ```json

⚡ ANALYSE MAINTENANT :"""


def get_code_discovery_prompt(
    dot_source: str,
    business_info: dict,
    instructions: str = None,
) -> str:
    procedures = business_info.get("procedures", [])
    functions = business_info.get("functions_called", [])
    api_calls = business_info.get("api_calls", [])
    variables = business_info.get("global_variables", [])
    data_structures = business_info.get("data_structures", [])

    context_parts = []
    if procedures:
        names = [p.get("name", p) if isinstance(p, dict) else str(p) for p in procedures]
        context_parts.append(f"Procédures du code : {', '.join(names)}")
    if functions:
        context_parts.append(f"Fonctions appelées : {', '.join(functions[:20])}")
    if api_calls:
        context_parts.append(f"Appels API : {', '.join(api_calls[:10])}")
    if variables:
        context_parts.append(f"Variables globales : {', '.join(variables[:15])}")
    if data_structures:
        names = [d.get("name", str(d)) if isinstance(d, dict) else str(d) for d in data_structures]
        context_parts.append(f"Structures de données : {', '.join(names[:10])}")

    business_context = "\n".join(context_parts) if context_parts else "Aucune métadonnée supplémentaire."

    instructions_section = ""
    if instructions and instructions.strip():
        instructions_section = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  INSTRUCTIONS UTILISATEUR — PRIORITÉ ABSOLUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{instructions.strip()}

"""

    return f"""Source : flowchart de code source

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 MÉTADONNÉES DU CODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{business_context}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔀 FLOWCHART (Graphviz DOT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{dot_source}
{instructions_section}
{_DISCOVERY_CODE_BASE}"""

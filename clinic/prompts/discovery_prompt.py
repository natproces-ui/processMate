"""
Prompt de découverte — phase légère d'analyse
Objectif : identifier les processus présents, pas les extraire
"""

_DISCOVERY_BASE = """Tu es un expert en analyse de documents bancaires et procédures métier.

🎯 OBJECTIF : Analyser ce(s) document(s) et identifier les processus métier présents.
Ne génère PAS de BPMN. Ne fais PAS d'extraction détaillée. Identifie et liste uniquement.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CE QUE TU DOIS FAIRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Parcourir TOUT le contenu fourni (texte, diagrammes, tableaux, schémas)
2. Identifier chaque processus ou procédure distincte
3. Pour chaque processus : donner un titre clair + description courte
4. Estimer le nombre d'étapes approximatif
5. Indiquer depuis quel(s) fichier(s) il provient

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏦 CONTEXTE BANCAIRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Les documents peuvent contenir des procédures de type :
- Ouverture / clôture de comptes
- Virements (SWIFT, internes, internationaux)
- KYC / conformité / AML
- Crédits et financement
- Gestion des réclamations
- Opérations de caisse
- Contrôles internes
- Gestion des incidents

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 FORMAT DE SORTIE JSON STRICT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Réponds UNIQUEMENT avec ce JSON, sans markdown :

{
  "processes": [
    {
      "title": "Titre clair et professionnel du processus",
      "description": "Description en 2-3 phrases : objectif, acteurs principaux, étapes clés",
      "source_files": ["nom_fichier_1", "nom_fichier_2"],
      "estimated_steps": 12,
      "confidence": 90,
      "category": "instructed"
    }
  ],
  "warnings": ["Avertissement si document illisible ou ambigu"]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ RÈGLES IMPORTANTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Si un processus apparaît dans plusieurs fichiers → liste tous les fichiers dans source_files
- Si deux fichiers couvrent le même processus → un seul ProcessCard avec les deux sources
- Si un fichier contient plusieurs processus → crée une carte par processus
- title : max 80 caractères, commence par un verbe ou nom du processus
- description : max 300 caractères, factuelle et professionnelle
- estimated_steps : entre 3 et 50, estimation honnête
- confidence : 0-100 selon la clarté du document
- category : "instructed" si le processus correspond aux instructions utilisateur, "discovered" sinon
- JSON PUR, pas de ```json

⚡ ANALYSE MAINTENANT :"""


def get_discovery_prompt(filenames: list[str], instructions: str = None) -> str:
    """
    Retourne le prompt de découverte avec contexte des fichiers.
    Si instructions fournies, les injecte comme contraintes prioritaires.
    """
    files_context = "\n".join([f"- {f}" for f in filenames])

    if instructions and instructions.strip():
        instructions_section = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  INSTRUCTIONS UTILISATEUR — PRIORITÉ ABSOLUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{instructions.strip()}

Règles découlant de ces instructions :
- Les processus décrits ci-dessus doivent être identifiés tels quels (category: "instructed")
- Ne PAS fragmenter un processus qui est décrit comme unique dans les instructions
- Si le document contient des éléments NON couverts par les instructions et qui forment un processus distinct → les inclure quand même (category: "discovered")
- En cas de doute sur le regroupement, privilégie l'intention exprimée dans les instructions

"""
    else:
        instructions_section = "\n"

    return f"""Fichiers fournis :
{files_context}
{instructions_section}{_DISCOVERY_BASE}"""


def get_chat_correction_prompt(
    filenames: list[str],
    current_cards: list[dict],
    user_message: str
) -> str:
    """
    Prompt pour corriger la liste des processus suite à un message utilisateur.
    Le document est toujours joint à l'appel Gemini.
    """
    files_context = "\n".join([f"- {f}" for f in filenames])

    cards_context = ""
    for i, card in enumerate(current_cards, 1):
        cards_context += f"\n{i}. [{card.get('category', 'discovered').upper()}] {card['title']}\n"
        cards_context += f"   {card['description']}\n"

    return f"""Tu es un expert en analyse de processus bancaires.

Fichiers fournis :
{files_context}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 PROCESSUS ACTUELLEMENT IDENTIFIÉS (À AMÉLIORER)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{cards_context}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 INSTRUCTION DE CORRECTION DE L'UTILISATEUR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{user_message.strip()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 CE QUE TU DOIS FAIRE - IMPORTANT!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **GARDE LES PROCESSUS EXISTANTS** - ne les remplace pas!
2. **AMÉLIORE UNIQUEMENT** ce qui a été demandé par l'utilisateur
3. **SI l'utilisateur parle de "remboursement"** → améliore le processus REMBOURSEMENT, ne génère pas la MISE EN PLACE
4. **SI l'utilisateur dit "s'inspirer de"** → utilise la référence pour améliorer le processus ciblé
5. Fusionne SEULEMENT si explicitement demandé
6. Renomme SEULEMENT si l'utilisateur le demande
7. Ajoute un processus SEULEMENT s'il est clairement manquant et mentionné par l'utilisateur

Respecte STRICTEMENT le premier processus de la liste si c'est celui ciblé.

Réponds UNIQUEMENT avec ce JSON, sans markdown :

{{
  "processes": [
    {{
      "title": "Titre du processus",
      "description": "Description en 2-3 phrases",
      "source_files": ["nom_fichier"],
      "estimated_steps": 10,
      "confidence": 85,
      "category": "instructed"
    }}
  ],
  "warnings": []
}}

JSON PUR, pas de ```json. Réponds maintenant :"""
# clinic/prompts/transcribe_prompt.py
"""
Prompts de transcription fidèle — AUCUNE reformulation.
Trois modes : image_only, text_only, combined.
"""

# ─────────────────────────────────────────────────────────────
# RÈGLES COMMUNES À TOUS LES MODES
# ─────────────────────────────────────────────────────────────

_COMMON_RULES = """
⚠️ RÈGLES ABSOLUES — AUCUNE EXCEPTION :

❌ NE PAS reformuler les noms d'étapes
❌ NE PAS mettre les verbes à l'infinitif si ce n'est pas le cas dans la source
❌ NE PAS corriger les abréviations (garde "BOI", "CAE", "DUM" tels quels)
❌ NE PAS ajouter d'étapes qui n'existent pas dans la source
❌ NE PAS supprimer d'étapes présentes dans la source
❌ NE PAS changer les noms des acteurs
❌ NE PAS changer les noms des départements
❌ NE PAS changer les labels des connexions (Oui/Non, etc.)
❌ NE PAS compléter, enrichir ou améliorer le contenu
❌ NE PAS créer d'acteurs ou de swimlanes absents de la source
❌ NE PAS inventer des tâches pour des acteurs non représentés dans le diagramme

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 RÈGLES DE MAPPING BPMN (seule liberté autorisée)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Si le type BPMN est explicite dans la source → le copier tel quel.
Si absent → déduire depuis la forme ou le rôle :
- Première étape / "Début" / "Start" → StartEvent, chez le premier acteur INTERNE visible
- Dernière étape / "Fin" / "End" → EndEvent
- Losange / décision / "?" → ExclusiveGateway
- Branche parallèle / "+" / AND → ParallelGateway
- Toute autre action → Task

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 ACTEURS ET typeActeur
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Copier EXACTEMENT les noms d'acteurs depuis les en-têtes de swimlanes de la source
- typeActeur doit être renseigné sur TOUTES les étapes : "interne" ou "externe"
- Si un acteur externe a une swimlane et des éléments visibles dans la source → les transcrire tels quels avec typeActeur: "externe"
- Si un acteur est absent de la source → ne pas le créer
- Un acteur externe typique : Client, Banque présentatrice, Banque correspondante, Office de Change — mais uniquement s'il est VISIBLE dans la source

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 FORMAT DE SORTIE JSON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "title": "Titre exact du processus depuis la source (ou déduit si absent)",
  "workflow": [
    {
      "id": "1",
      "étape": "Texte EXACT de l'étape, copié tel quel depuis la source",
      "typeBpmn": "StartEvent | Task | ExclusiveGateway | ParallelGateway | EndEvent",
      "département": "Département exact depuis la source (ou déduit de l'acteur si absent)",
      "acteur": "Acteur exact depuis la source",
      "typeActeur": "interne | externe",
      "condition": "Texte exact de la condition si Gateway, sinon \"\"",
      "outputs": [{"targetId": "ID", "label": "label exact depuis la source"}],
      "outil": "Outil exact depuis la source, sinon \"\""
    }
  ],
  "enrichments": []
}

⚠️ enrichments = [] toujours (pas d'enrichissement dans la transcription)
⚠️ JSON PUR sans markdown
"""

# ─────────────────────────────────────────────────────────────
# MODE : IMAGE ONLY — uniquement le logigramme visuel
# ─────────────────────────────────────────────────────────────

_IMAGE_ONLY_PROMPT = """Tu es un outil de transcription de processus métier.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 OBJECTIF : TRANSCRIRE UNIQUEMENT LE LOGIGRAMME VISUEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Le document contient du texte ET un logigramme/schéma visuel.
Tu dois transcrire EXCLUSIVEMENT la structure du diagramme graphique.

⚠️ RÈGLE FONDAMENTALE :
→ Source de vérité = le logigramme visuel (boîtes, flèches, losanges, connecteurs, swimlanes)
→ Le texte descriptif autour du diagramme est IGNORÉ complètement
→ Si une étape apparaît dans le texte mais PAS dans le diagramme → NE PAS l'inclure
→ Si une étape est dans le diagramme avec un libellé différent du texte → prendre le libellé du diagramme
→ Les connexions (flèches) = les outputs à reproduire fidèlement
→ Les swimlanes visibles dans le diagramme (internes ET externes) = les transcrire toutes
""" + _COMMON_RULES


# ─────────────────────────────────────────────────────────────
# MODE : TEXT ONLY — uniquement les étapes textuelles
# ─────────────────────────────────────────────────────────────

_TEXT_ONLY_PROMPT = """Tu es un outil de transcription de processus métier.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 OBJECTIF : TRANSCRIRE UNIQUEMENT LE TEXTE DE PROCÉDURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Le document contient du texte ET éventuellement un logigramme/schéma visuel.
Tu dois transcrire EXCLUSIVEMENT les étapes décrites en texte.

⚠️ RÈGLE FONDAMENTALE :
→ Source de vérité = le texte écrit (listes, tableaux, descriptions d'étapes)
→ Le logigramme ou schéma visuel est IGNORÉ complètement
→ Si une étape est dans le texte mais PAS dans le diagramme → l'inclure quand même
→ Copie les libellés exactement tels qu'écrits dans le texte, sans adapter
→ Déduis les connexions depuis l'ordre logique du texte (séquence, conditions mentionnées)
""" + _COMMON_RULES


# ─────────────────────────────────────────────────────────────
# MODE : COMBINED — fusion ou source unique
# ─────────────────────────────────────────────────────────────

_COMBINED_PROMPT = """Tu es un outil de transcription de processus métier.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 OBJECTIF : TRANSCRIRE FIDÈLEMENT TOUT LE CONTENU
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tu dois retranscrire FIDÈLEMENT le logigramme/tableau/processus fourni dans le format JSON.

Si le document contient à la fois du texte et un diagramme :
→ Utilise les deux comme sources complémentaires
→ Le diagramme donne la structure, les connexions et les swimlanes
→ Le texte peut compléter les libellés ou les acteurs si le diagramme est peu lisible
→ En cas de conflit → privilégier le diagramme pour la structure, le texte pour les détails
→ Transcrire toutes les swimlanes visibles, internes ET externes
""" + _COMMON_RULES


# ─────────────────────────────────────────────────────────────
# FONCTIONS PUBLIQUES
# ─────────────────────────────────────────────────────────────

def get_transcribe_prompt(message: str, mode: str = "combined") -> str:
    """
    Retourne le prompt de transcription selon le mode détecté par l'intent detector.
    mode : "image_only" | "text_only" | "combined"
    """
    prompts = {
        "image_only": _IMAGE_ONLY_PROMPT,
        "text_only":  _TEXT_ONLY_PROMPT,
        "combined":   _COMBINED_PROMPT,
    }
    base = prompts.get(mode, _COMBINED_PROMPT)

    return f"""{base}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 SOURCE À TRANSCRIRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{message}

TRANSCRIS MAINTENANT — TEL QUEL, SANS MODIFIER :"""
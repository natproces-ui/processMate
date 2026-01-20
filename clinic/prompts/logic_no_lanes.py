"""
Prompt logique pour BPMN sans swimlanes (Type B)
"""

LOGIC_NO_LANES = """🎯 TU ANALYSES UN DIAGRAMME BPMN SANS SWIMLANES

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 LOGIQUE D'EXTRACTION SPÉCIFIQUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. ABSENCE DE SWIMLANES**

Ce diagramme n'a PAS de bandes horizontales/verticales avec en-têtes.
Les acteurs sont mentionnés DIRECTEMENT dans ou près des formes.

**2. EXTRACTION DES ACTEURS**

**Cas 1** : Acteur écrit DANS le rectangle
- Exemple : Rectangle "Engineering Team Lead review"
- Extraction : acteur: "Engineering Team Lead"

**Cas 2** : Acteur écrit À CÔTÉ du rectangle
- Exemple : Texte "Editor" près d'un rectangle
- Extraction : acteur: "Editor"

**Cas 3** : Acteur déduit du contexte
- Si le rectangle dit "Writer composes first draft"
- Extraction : acteur: "Writer" (déduit du verbe)

**Cas 4** : Aucun acteur visible
- Si impossible de déduire → acteur: "" (vide)

**3. FLUX HORIZONTAL SIMPLE**

Les étapes s'enchaînent généralement de gauche à droite :
- Cercle de départ → Rectangles → Losanges → Cercle de fin
- Suis les flèches pour l'ordre exact
- outputOui = ID de l'étape suivante

**4. CONTEXTE POUR DÉBUT/FIN**

Le texte indique souvent le début et la fin :
- "Start", "Begin", premier cercle/rectangle → StartEvent
- "End", "Finish", "Publish", dernier cercle → EndEvent
- Si pas clair : premier élément = StartEvent, dernier = EndEvent

**5. OUTILS**

Même sans swimlanes, les outils peuvent être mentionnés :
- Cherche les noms de systèmes/applications près des formes
- Exemples : "CRM", "Email", "Portal", "System"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ INSTRUCTIONS FINALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Extrais TOUTES les formes visibles dans l'ordre du flux
- Acteurs = Extrais depuis le texte des formes
- Si aucun acteur visible → acteur: ""
- Département = Déduis du contexte ou laisse ""
- Flux généralement horizontal (gauche → droite)

"""

def get_logic_no_lanes() -> str:
    return LOGIC_NO_LANES
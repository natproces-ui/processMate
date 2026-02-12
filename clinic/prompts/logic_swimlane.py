# clinic/prompts/logic_swimlane.py
"""
Prompt logique pour BPMN avec swimlanes (Type A)
"""

LOGIC_SWIMLANES = """🎯 TU ANALYSES UN DIAGRAMME BPMN AVEC SWIMLANES

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 LOGIQUE D'EXTRACTION SPÉCIFIQUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. STRUCTURE DES SWIMLANES**

Les swimlanes sont des **bandes horizontales** (parfois verticales) avec des en-têtes.

**RÈGLE CRITIQUE** : Les en-têtes de swimlanes = ACTEURS
- En-tête peut être : "Client", "Agence/Chef de caisse", "CAE/Middle Office BPP", "BOI"
- Copie EXACTEMENT le texte de l'en-tête (ne raccourcis JAMAIS)
- Si l'en-tête dit "Agence/Chef de caisse Super CCO" → acteur: "Agence/Chef de caisse Super CCO"

**2. ACTEURS vs OUTILS (⚠️ DISTINCTION ABSOLUE)**

**ACTEURS** = Rôles dans les EN-TÊTES de swimlanes
- Exemples : "Client", "Gestionnaire", "CAE/Middle Office"

**OUTILS** = Systèmes/applications MENTIONNÉS À CÔTÉ des formes
- Reconnaissables par : @ ou noms de systèmes
- Exemples : "Nov@ OA", "Nov@ CL", "TI+", "Email", "CRM", "Portal"
- Souvent placés : en bas des rectangles, à côté, ou avec une icône

⚠️ **ERREUR FRÉQUENTE À ÉVITER** :
- ❌ FAUX : Si tu vois "Nov@ OA" près d'un rectangle → acteur: "Nov@ OA"
- ✅ CORRECT : L'acteur est celui de l'EN-TÊTE de la swimlane, outil: "Nov@ OA"

**3. SECTIONS IMBRIQUÉES (CAGES/GROUPEMENTS)**

Parfois un grand rectangle contient PLUSIEURS formes à l'intérieur :
- Exemple : Rectangle "Identification du souscripteur" contient 3 rectangles
- **RÈGLE** : Le titre du rectangle englobant N'EST PAS une étape
- Extrais CHAQUE forme À L'INTÉRIEUR comme étape séparée
- Les formes intérieures gardent le même acteur (swimlane parente)

**4. OUTILS POSITIONNÉS**

Les outils peuvent être placés :
- En bas du rectangle : "Nov@ OA" sous "Saisie demande"
- À côté du rectangle : "Email" près de "Notifier client"
- Dans une annotation : Icône ou texte avec @

**RÈGLE** : Extrais l'outil même si position inhabituelle

**5. FLUX ET CONNEXIONS**

- Suis les flèches entre formes (même si elles traversent plusieurs swimlanes)
- Gateway peut rediriger vers étape précédente (boucle)
- Plusieurs chemins peuvent converger vers une même étape

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ INSTRUCTIONS FINALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Extrais TOUTES les formes visibles dans l'ordre du flux
- Acteurs = Copie EXACTEMENT les en-têtes de swimlanes
- Outils = Systèmes avec @ ou noms d'applications
- Ne confonds JAMAIS acteurs et outils
- Les sections imbriquées : extrais chaque forme séparée

"""

def get_logic_swimlanes() -> str:
    return LOGIC_SWIMLANES
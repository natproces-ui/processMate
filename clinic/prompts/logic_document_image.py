# clinic/prompts/logic_document_image.py
"""
Prompt logique pour documents mixtes : texte + diagramme intégré (Type E)
Utilisé quand un PDF contient à la fois du texte descriptif et un logigramme/diagramme visuel,
ou quand on a un mix de fichiers PDF et images
"""

LOGIC_DOCUMENT_IMAGE = """🎯 TU ANALYSES DES SOURCES MIXTES : TEXTE DOCUMENTAIRE + DIAGRAMME(S) VISUEL(S)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 LOGIQUE D'EXTRACTION SPÉCIFIQUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. COMPRENDRE LES DEUX SOURCES**

Tu as accès à :
- **Du texte documentaire** : descriptions de procédures, listes d'étapes, notes métier avec des details sur les rôles, outils, règles métier, conditions, etc. (dans le PDF ou en texte séparé)
- **Un ou plusieurs diagrammes visuels** : logigrammes, BPMN, flowcharts (dans le PDF ou en image séparée)

Ces deux sources sont COMPLÉMENTAIRES — elles décrivent le même processus sous deux formes.

**2. STRATÉGIE DE FUSION**

**Étape 1 : Identifier le diagramme comme base structurelle**
- Le diagramme visuel donne la STRUCTURE du processus : étapes, gateways, flux, swimlanes
- C'est la colonne vertébrale du BPMN à produire

**Étape 2 : Enrichir avec le texte**
- Le texte apporte les DÉTAILS que le diagramme ne montre pas :
  - Descriptions détaillées des étapes
  - Conditions précises des gateways
  - Acteurs non visibles dans le diagramme
  - Outils et systèmes utilisés
  - Règles métier et exceptions

**Étape 3 : Résoudre les contradictions**
- Si le texte décrit une étape absente du diagramme → l'ajouter si elle est clairement délimitée
- Si le texte contredit le diagramme → privilégier le texte (plus récent ou plus détaillé)
- Si les acteurs diffèrent → combiner les informations

**3. ANALYSE DU DIAGRAMME VISUEL**

Applique la même logique que pour une image BPMN :
- Détecte les swimlanes (bandes horizontales/verticales avec en-têtes)
- Les en-têtes de swimlanes = acteurs (copie EXACTEMENT)
- Identifie les formes : cercle = StartEvent/EndEvent, rectangle = Task, losange = Gateway
- Suis les flèches pour les connexions et l'ordre du flux
- Outils = systèmes mentionnés près des formes (avec @ ou noms d'applications)

**4. ANALYSE DU TEXTE DOCUMENTAIRE**

Cherche dans le texte :
- Descriptions détaillées de chaque étape du diagramme
- Acteurs et rôles mentionnés
- Conditions des points de décision
- Systèmes et outils utilisés
- Branches de rejet, escalade, exception non visibles dans le diagramme

**5. RÉSULTAT ATTENDU**

Le BPMN produit doit être PLUS COMPLET que le diagramme seul :
- Structure fidèle au diagramme visuel
- Enrichi par les détails du texte
- Acteurs consolidés des deux sources
- Outils identifiés depuis les deux sources
- Branches d'exception intégrées si mentionnées dans le texte

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ INSTRUCTIONS FINALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Le diagramme visuel est la BASE STRUCTURELLE — commence par l'analyser
- Le texte est l'ENRICHISSEMENT — utilise-le pour compléter chaque étape
- Fusionne sans dupliquer les étapes
- Capture TOUTES les branches visibles dans le diagramme ET décrites dans le texte
- Acteurs : depuis les en-têtes de swimlanes ET depuis le texte
- Outils : depuis les annotations du diagramme ET depuis les mentions textuelles

"""


def get_logic_document_image() -> str:
    return LOGIC_DOCUMENT_IMAGE
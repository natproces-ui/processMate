# clinic/prompts/logic_document.py
"""
Prompt logique pour documents textuels (Type D)
Utilisé quand les sources sont des PDFs sans diagramme visuel
"""

LOGIC_DOCUMENT = """🎯 TU ANALYSES UN OU PLUSIEURS DOCUMENTS TEXTUELS (PDF, PROCÉDURES, NOTES)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 LOGIQUE D'EXTRACTION SPÉCIFIQUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. TYPE DE DOCUMENT**

Ces documents contiennent UNIQUEMENT du texte : descriptions de procédures,
listes d'étapes, notes métier, référentiels, tableaux descriptifs.
Il n'y a PAS de diagramme visuel — tu dois LIRE, COMPRENDRE et MODÉLISER.

**Trois cas possibles** :

**Cas A — Description pure** : Le document décrit un processus à modéliser de zéro
→ Construire le BPMN depuis la description textuelle

**Cas B — Document avec instructions de modification** : Le document décrit un processus
existant ET des corrections/enrichissements à y apporter
→ Intégrer les modifications décrites, ne pas reproduire l'ancien état

**Cas C — Plusieurs documents complémentaires** : Un document principal + des compléments
→ Identifier la base, fusionner les enrichissements sans dupliquer les étapes
→ En cas de contradiction, privilégier le document le plus détaillé

**2. IDENTIFIER LES ACTEURS**

Cherche dans le texte :
- Mentions de rôles : "le client", "le conseiller", "le responsable", "le service X"
- Sections par acteur : "Actions du client :", "Responsabilités du Back Office :"
- Verbes assignés : "Le client devra...", "Le conseiller vérifie..."

**RÈGLE** : Chaque acteur distinct = une swimlane distincte
- Normalise : "le client" → "Client", "le conseiller commercial" → "Conseiller Commercial"
- Si aucun acteur visible → acteur = ""

**3. IDENTIFIER LES ÉTAPES**

Indices d'étapes (Tasks) dans le texte :
- Verbes d'action : "vérifier", "transmettre", "valider", "enregistrer", "notifier"
- Listes numérotées ou à puces décrivant des actions
- Étapes nommées : "Étape 1 :", "Phase 2 :", "1. Réception de la demande"
- Un paragraphe décrivant une action unitaire

**RÈGLE** : Une étape = une action précise et délimitée
- Découpe si un paragraphe décrit plusieurs actions distinctes

**4. IDENTIFIER LES GATEWAYS**

Indices de décision (ExclusiveGateway) :
- "Si... alors... sinon..."
- "En cas de conformité / non-conformité"
- "Si la demande est acceptée / rejetée"
- "Selon le profil du client"

Indices de parallélisme (ParallelGateway) :
- "Simultanément", "en parallèle", "en même temps"
- "Les services X et Y sont notifiés en même temps"

Indices de conditions multiples (InclusiveGateway) :
- "Selon les cas, une ou plusieurs des actions suivantes"
- "Peut déclencher A et/ou B"

**5. IDENTIFIER LE FLUX**

- Ordre séquentiel : numérotation, "ensuite", "puis", "après"
- Retours en arrière : "en cas de rejet, retourner à l'étape X"
- Point d'entrée : premier événement déclencheur = StartEvent
- Points de sortie : "fin du processus", "dossier clôturé" = EndEvent
- Plusieurs fins possibles → plusieurs EndEvent

**6. OUTILS**

Mention explicite dans le document :
- "via le CRM", "dans SAP", "par email", "sur le portail"
- Normalise : "système CRM" → "CRM", "application mobile" → "App Mobile"
- Si non mentionné → outil = ""

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ INSTRUCTIONS FINALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Parcours TOUT le contenu textuel, page par page
- Extrais TOUTES les étapes décrites, dans l'ordre du flux
- Un seul StartEvent, plusieurs EndEvent possibles selon les issues
- Acteurs = extraits et normalisés depuis le texte
- Gateways = transformés en questions Oui/Non
- Capture toutes les branches : rejet, escalade, boucle de correction

"""


def get_logic_document() -> str:
    return LOGIC_DOCUMENT
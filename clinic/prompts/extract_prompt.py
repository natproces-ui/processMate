"""
Prompt pour l'extraction de workflows depuis des images BPMN
"""

EXTRACTION_PROMPT = """Tu es un expert en extraction de processus métier depuis des diagrammes BPMN visuels.

🎯 OBJECTIF: Extraire le workflow (TABLE 1) ET les enrichissements documentaires (TABLE 2) en un seul JSON structuré.
Sois méthodique et précis, ne néglige aucune étape visible.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 PHASE 0 : IDENTIFICATION DU TITRE DU PROCESSUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**OÙ CHERCHER LE TITRE ?**
- En haut du diagramme (titre principal, souvent en gros)
- Dans un rectangle/cadre de titre
- Dans les métadonnées du document
- En en-tête de page

**SI AUCUN TITRE VISIBLE** : Déduis un titre professionnel depuis le contenu global
- Commence par "Processus de..." ou "Workflow de..." ou "Procédure de..."
- Maximum 80 caractères
- Exemples : "Processus d'ouverture de compte bancaire", "Processus de vérification KYC"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 PHASE 1 : ANALYSE VISUELLE CRITIQUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**1. STRUCTURE DES SWIMLANES**
   - Détecte les bandes horizontales/verticales avec en-têtes
   - Les en-têtes = acteurs (ex: "Client", "Agence/Chef de caisse", "CAE/Middle Office BPP")
   - Repère leur position : en haut, à gauche, ou dans une colonne dédiée

**2. ACTEURS vs OUTILS (⚠️ CRITIQUE)**
   
   **ACTEURS** = Rôles humains ou organisationnels qui EXÉCUTENT les tâches
   - Positionnés dans les en-têtes de swimlanes
   - Exemples : "Client", "Gestionnaire", "CAE/Middle Office", "Mandataires habilités"
   
   **OUTILS** = Systèmes informatiques UTILISÉS pour réaliser les tâches
   - Mentionnés À CÔTÉ ou DANS les rectangles/cercles d'étapes
   - Souvent avec @ ou des icônes : "Nov@ OA", "Nov@ CL", "TI+", "Portal", "CRM", "Email"
   
   ⚠️ **RÈGLE ABSOLUE** :
   - Si tu vois "Nov@ OA" PRÈS d'une forme → c'est un OUTIL, pas un acteur
   - L'acteur est celui dans l'EN-TÊTE de la swimlane où se trouve cette forme
   - ❌ FAUX : acteur: "Nov@ OA"
   - ✅ CORRECT : acteur: "Client", outil: "Nov@ OA"

**3. HIÉRARCHIE DES GROUPEMENTS**
   
   **CAGES/RECTANGLES ENGLOBANTS** = Groupes d'étapes sous un titre commun
   - Un rectangle avec un titre général contient PLUSIEURS formes à l'intérieur
   - Exemple : "Identification du souscripteur" contient "Recherche client", "Entretien", "Définir usage"
   - **RÈGLE** : Le titre du groupement n'est PAS une étape
   - Extrais CHAQUE forme À L'INTÉRIEUR comme étape séparée

**4. IDENTIFICATION PRÉCISE DES FORMES BPMN**
   
   - **Cercle simple** (trait fin) → **StartEvent** (début du processus)
   - **Cercle épais/double/rempli** → **EndEvent** (fin du processus)
   - **Rectangle** (coins droits ou arrondis) → **Task** (action à réaliser)
   - **Losange** → **ExclusiveGateway** (décision binaire avec AU MOINS 2 sorties)
   
   ⚠️ **Annotations sur flèches** : Labels comme "Oui", "Non", "Conforme" sont des CONDITIONS, pas des étapes

**5. FLUX ET GATEWAYS COMPLEXES**
   
   - **Retour en arrière** : Un Gateway peut rediriger vers une étape précédente (boucle)
   - **Jonction (OU logique)** : Plusieurs chemins peuvent se rejoindre sur une même étape
   - **Gateway → Gateway** : Chaque Gateway est une étape distincte

**6. END EVENTS vs TASKS FINALES**
   
   - **EndEvent** = Cercle épais qui TERMINE le processus (pas de sortie)
   - **Task finale** = Rectangle qui peut avoir une sortie vers un EndEvent
   - Les EndEvents peuvent avoir les mêmes acteurs/swimlanes que les tâches précédentes
   - Ne pas inventer d'EndEvent ni de swimlane

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🖊️ PHASE 1.5 : TRAITEMENT DES DIAGRAMMES MANUSCRITS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ **SI LE DIAGRAMME EST MANUSCRIT** (traits irréguliers, écriture à la main) :

**MÉTHODOLOGIE EN 4 ÉTAPES**

**ÉTAPE 1 : SCANNER ET IDENTIFIER**
- Repère TOUTES les formes (cercles, rectangles, losanges) sur TOUTE la page
- Note TOUTES les zones/sections (même avec titres différents)
- Suis TOUTES les flèches (même imparfaites, en pointillés, courbées)

**ÉTAPE 2 : CORRIGER ET REFORMULER (⚠️ CRITIQUE)**

✅ **Orthographe et grammaire** :
- "Controle des docs" → "Contrôle des documents"
- "Validat" → "Validation"
- "traitemt ope" → "Traitement opérationnel"
- "Notife-mail" → "Notification par email"

✅ **Verbes à l'infinitif** :
- "Blocage prov" → "Bloquer provisoirement"
- "Scan DOCS" → "Scanner les documents"
- "Validat SWIFT" → "Valider le message SWIFT"

✅ **Textes incomplets ou abrégés** :
- "docs" → "documents"
- "prov" → "provisoire/provisoirement"
- "ope" → "opération/opérationnel"

✅ **Contextualisation** :
- "Rejet + motif" → "Notifier le rejet avec motif"
- "Validation KO" → "Gestion du refus"

**NORMALISATION DES GATEWAYS (⚠️ RÈGLE ABSOLUE)**

TOUS les ExclusiveGateway doivent avoir des sorties Oui/Non LOGIQUES

📌 **Gateway avec OK/KO** : Transforme en question Oui/Non
- Manuscrit : [Losange] "OK ?" → OK / KO
- JSON : "Contrôle validé ?", outputOui (chemin OK), outputNon (chemin KO)

📌 **Gateway avec Succès/Échec** : Transforme en question
- "Tâche effectuée avec succès ?", outputOui (Succès), outputNon (Échec)

📌 **Gateway avec Conforme/Non conforme** : Transforme en question
- "Documents conformes ?", outputOui (Conforme), outputNon (Non conforme)

🚨 **RÈGLE ABSOLUE** : 
- **JAMAIS** de "OK/KO", "Succès/Échec" dans outputOui/outputNon
- **TOUJOURS** transformer en question claire avec réponse Oui/Non
- **TOUJOURS** garder la LOGIQUE : ce qui était "OK" devient outputOui

**ÉTAPE 3 : COMPRENDRE LES CONNEXIONS**
- Les flèches montrent les connexions RÉELLES entre zones
- Une flèche qui traverse les zones = ces zones sont CONNECTÉES

**ÉTAPE 4 : FUSIONNER EN UN SEUL FLOW**
- **UN SEUL StartEvent** au début du processus global
- **Toutes les sections sont des BRANCHES** d'un même processus
- **Plusieurs EndEvent possibles** selon les issues

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 PHASE 2 : EXTRACTION DU WORKFLOW (TABLE 1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pour CHAQUE forme géométrique visible, extrais :

**CHAMPS OBLIGATOIRES** :
- **id** : Séquentiel "1", "2", "3"... (dans l'ordre du flux)
- **étape** : Nom descriptif de l'action
- **typeBpmn** : StartEvent | Task | ExclusiveGateway | EndEvent
- **département** : Service métier déduit de l'acteur (ex: "CAE/Middle Office" → "Middle Office")
- **acteur** : Copie EXACTEMENT l'en-tête de swimlane (ou "" si absent)
- **condition** : Question pour Gateway (ex: "Dossier conforme ?"), sinon ""
- **outputOui** : ID de l'étape suivante
- **outputNon** : ID alternatif pour Gateway uniquement, sinon ""
- **outil** : Système informatique utilisé (ex: "CRM", "Nov@ OA"), sinon ""

**RÈGLES D'EXTRACTION** :

📌 **ACTEURS** :
- **Avec swimlanes** : Copie EXACTEMENT le texte de l'en-tête
  - "Agence/Chef de caisse Super CCO" → acteur: "Agence/Chef de caisse Super CCO"
  - **NE JAMAIS raccourcir ou modifier**
- **Sans swimlanes** : Extrait le rôle depuis le texte de la forme
- **Aucun acteur visible** : acteur = ""

📌 **OUTILS** :
- Systèmes avec @ : "Nov@ OA", "Nov@ CL", "Nov@ Bank"
- Applications : "TI+", "CRM", "Portal", "SAP", "Swift"
- Communication : "Email", "Mail", "Fax"
- Normalise : "nov@ oa" → "Nov@ OA", "crm" → "CRM"

📌 **CONNEXIONS** :
- **outputOui** = ID de l'étape suivante dans le flux principal
- **outputNon** = ID de l'alternative (UNIQUEMENT pour ExclusiveGateway)
- **Flux avec retour** : outputNon peut pointer vers une étape précédente (boucle)
- **Gateway vers Gateway** : Chaque Gateway est une étape distincte

📌 **CONDITIONS (pour ExclusiveGateway)** :
- Extrais le texte du losange et transforme en question si nécessaire
- "Dossier conforme" → "Dossier conforme ?"
- "Approved" → "Content approved ?"
- Si pas de texte clair : déduis depuis le contexte

**RÈGLES STRICTES** :
- Utilise "" si vide, JAMAIS null
- IDs séquentiels dans l'ordre du flux
- Pour ExclusiveGateway : condition, outputOui ET outputNon obligatoires
- Pour Task/StartEvent/EndEvent : condition = "", outputNon = ""
- Extrais TOUTES les formes géométriques visibles
- JSON PUR sans markdown

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 PHASE 3 : ENRICHISSEMENTS DOCUMENTAIRES (TABLE 2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pour CHAQUE Task (typeBpmn = "Task"), génère un enrichissement documentaire :

**1. DESCRIPTIF** (OBLIGATOIRE, 100-200 caractères)
   - Décris l'objectif de la tâche
   - Mentionne les inputs (ce qui est reçu)
   - Mentionne les outputs (ce qui est produit)
   - Identifie les risques potentiels si pertinent
   
   **Exemples** :
   - "Le client accède au portail en ligne et sélectionne un créneau disponible. Le système envoie une confirmation par email et SMS."
   - "Vérifier l'authenticité des documents via des outils de détection de fraude. Contrôler les hologrammes, filigranes et signatures."
   - "Création du compte dans le système Core Banking. Paramétrage des droits et des produits associés."

**2. DURÉE ESTIMÉE** (optionnel, format : "X min" ou "X h")
   - Tâche manuelle simple → 5-15 min
   - Tâche manuelle complexe → 20-45 min
   - Tâche système automatisée → 1-5 min
   - Tâche de validation/contrôle → 10-30 min
   - Si manque d'infos → ""
   
   **Exemples** : "5 min", "15-20 min", "1 h", "2-3 min"

**3. FRÉQUENCE** (optionnel, valeur exacte parmi) :
   Quotidien | Hebdomadaire | Mensuel | Trimestriel | Annuel | À la demande | En continu | Ponctuel
   
   **Règles de déduction** :
   - Demandes clients → "À la demande"
   - Reporting → "Mensuel" ou "Hebdomadaire"
   - Clôture → "Quotidien" ou "Mensuel"
   - Validation → "À la demande"
   - Monitoring → "En continu"
   - Si manque d'infos → ""

**4. KPI** (optionnel, 20-60 caractères)
   - Un indicateur concret et mesurable
   - Lié à la performance de la tâche
   
   **Exemples** :
   - "Taux de conversion > 80%"
   - "Taux d'erreur < 2%"
   - "Taux de détection fraude > 95%"
   - "Délai de création < 1h"
   - "Délai de notification < 2h"
   - "Temps de traitement < 15 min"
   - Si manque d'infos → ""

⚠️ **RÈGLES IMPORTANTES** :
- Ne génère PAS d'enrichissement pour StartEvent, EndEvent, ExclusiveGateway
- **DESCRIPTIF OBLIGATOIRE** pour TOUTES les Tasks (ne jamais laisser vide)
- Durée, fréquence, KPI sont optionnels (laisse "" si incertain)
- Base-toi sur le département, l'acteur et l'outil pour déduire le contexte métier
- Sois réaliste et professionnel

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FORMAT DE SORTIE JSON (sans markdown)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "title": "Titre du processus extrait ou déduit",
  "workflow": [
    {
      "id": "1",
      "étape": "Nom descriptif de l'action",
      "typeBpmn": "StartEvent | Task | ExclusiveGateway | EndEvent",
      "département": "Service métier déduit",
      "acteur": "Rôle responsable depuis swimlane",
      "condition": "Question pour Gateway (sinon vide)",
      "outputOui": "ID étape suivante",
      "outputNon": "ID alternatif (Gateway uniquement)",
      "outil": "Système informatique utilisé (sinon vide)"
    }
  ],
  "enrichments": [
    {
      "id_tache": "2",
      "descriptif": "Description complète de la tâche avec objectif, inputs, outputs (OBLIGATOIRE)",
      "duree_estimee": "15 min (optionnel)",
      "frequence": "À la demande (optionnel)",
      "kpi": "Taux d'erreur < 2% (optionnel)"
    }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ EXEMPLE COMPLET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "title": "Processus d'ouverture de compte bancaire",
  "workflow": [
    {
      "id": "1",
      "étape": "Demande d'ouverture de compte",
      "typeBpmn": "StartEvent",
      "département": "Commercial",
      "acteur": "Client",
      "condition": "",
      "outputOui": "2",
      "outputNon": "",
      "outil": "Portail web"
    },
    {
      "id": "2",
      "étape": "Prendre rendez-vous en ligne",
      "typeBpmn": "Task",
      "département": "Commercial",
      "acteur": "Client",
      "condition": "",
      "outputOui": "3",
      "outputNon": "",
      "outil": "Application mobile"
    },
    {
      "id": "3",
      "étape": "Collecter les informations client",
      "typeBpmn": "Task",
      "département": "Commercial",
      "acteur": "Conseiller",
      "condition": "",
      "outputOui": "4",
      "outputNon": "",
      "outil": "CRM"
    },
    {
      "id": "4",
      "étape": "Fournir les documents",
      "typeBpmn": "Task",
      "département": "Commercial",
      "acteur": "Client",
      "condition": "",
      "outputOui": "5",
      "outputNon": "",
      "outil": "Portail client"
    },
    {
      "id": "5",
      "étape": "Vérifier authenticité des documents",
      "typeBpmn": "Task",
      "département": "Conformité",
      "acteur": "KYC",
      "condition": "",
      "outputOui": "6",
      "outputNon": "",
      "outil": "GED"
    },
    {
      "id": "6",
      "étape": "Documents conformes ?",
      "typeBpmn": "ExclusiveGateway",
      "département": "Conformité",
      "acteur": "KYC",
      "condition": "Documents conformes ?",
      "outputOui": "7",
      "outputNon": "4",
      "outil": ""
    },
    {
      "id": "7",
      "étape": "Créer le compte bancaire",
      "typeBpmn": "Task",
      "département": "Back Office",
      "acteur": "Comptabilité",
      "condition": "",
      "outputOui": "8",
      "outputNon": "",
      "outil": "Core Banking"
    },
    {
      "id": "8",
      "étape": "Informer le client",
      "typeBpmn": "Task",
      "département": "Commercial",
      "acteur": "Conseiller",
      "condition": "",
      "outputOui": "9",
      "outputNon": "",
      "outil": "Email"
    },
    {
      "id": "9",
      "étape": "Compte créé avec succès",
      "typeBpmn": "EndEvent",
      "département": "Commercial",
      "acteur": "",
      "condition": "",
      "outputOui": "",
      "outputNon": "",
      "outil": ""
    }
  ],
  "enrichments": [
    {
      "id_tache": "2",
      "descriptif": "Le client accède au portail en ligne et sélectionne un créneau disponible pour un rendez-vous. Le système envoie une confirmation par email et SMS.",
      "duree_estimee": "5 min",
      "frequence": "À la demande",
      "kpi": "Taux de conversion > 80%"
    },
    {
      "id_tache": "3",
      "descriptif": "Le conseiller recueille l'identité, l'adresse, la situation professionnelle et les revenus du client via un formulaire CRM. Ces informations sont nécessaires pour l'analyse KYC.",
      "duree_estimee": "15 min",
      "frequence": "À la demande",
      "kpi": "Taux de complétion > 95%"
    },
    {
      "id_tache": "4",
      "descriptif": "Le client télécharge ses pièces d'identité, justificatif de domicile et relevés bancaires via le portail sécurisé. Les documents sont automatiquement horodatés.",
      "duree_estimee": "10 min",
      "frequence": "À la demande",
      "kpi": ""
    },
    {
      "id_tache": "5",
      "descriptif": "Vérification de l'authenticité des documents fournis via des outils de détection de fraude. Contrôle des hologrammes, filigranes et signatures.",
      "duree_estimee": "20 min",
      "frequence": "À la demande",
      "kpi": "Taux de détection fraude > 95%"
    },
    {
      "id_tache": "7",
      "descriptif": "Création du compte dans le système Core Banking avec génération de l'IBAN et paramétrage des droits d'accès et des produits associés.",
      "duree_estimee": "5 min",
      "frequence": "À la demande",
      "kpi": "Délai de création < 10 min"
    },
    {
      "id_tache": "8",
      "descriptif": "Envoi d'un email récapitulatif au client contenant ses identifiants, son IBAN et les documents contractuels à signer électroniquement.",
      "duree_estimee": "2 min",
      "frequence": "À la demande",
      "kpi": "Délai de notification < 1h"
    }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 VÉRIFICATION FINALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Avant de retourner le JSON, vérifie :
✓ Toutes les formes géométriques extraites ?
✓ Les acteurs sont dans les swimlanes, pas les outils ?
✓ Tous les Gateway ont des conditions en questions Oui/Non ?
✓ Toutes les connexions (flèches) sont capturées ?
✓ Le flow est continu, logique et fait du sens métier ?
✓ TOUTES les Tasks ont un descriptif obligatoire ?
✓ Les enrichissements optionnels (durée, fréquence, KPI) sont remplis quand possible ?
✓ JSON pur sans markdown (pas de ```json) ?

⚡ COMMENCE L'ANALYSE ET L'EXTRACTION MAINTENANT :"""


def get_extraction_prompt() -> str:
    """Retourne le prompt d'extraction de workflow"""
    return EXTRACTION_PROMPT
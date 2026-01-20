"""
Format JSON global réutilisable pour tous les types d'images
"""

FORMAT_GLOBAL = """
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 PHASE FINALE : EXTRACTION AU FORMAT JSON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**TITRE DU PROCESSUS** :
- Cherche en haut du diagramme, dans un cadre de titre, ou en en-tête
- Si aucun titre visible : Déduis un titre professionnel
- Commence par "Processus de..." ou "Workflow de..."
- Maximum 80 caractères

**IDENTIFICATION DES FORMES BPMN** :
- **Cercle simple** (trait fin) → **StartEvent**
- **Cercle épais/double** → **EndEvent**
- **Rectangle** → **Task**
- **Losange** → **ExclusiveGateway** (décision binaire)

**CHAMPS OBLIGATOIRES POUR CHAQUE ÉTAPE** :
- **id** : Séquentiel "1", "2", "3"... (ordre du flux)
- **étape** : Nom descriptif de l'action
- **typeBpmn** : StartEvent | Task | ExclusiveGateway | EndEvent
- **département** : Service métier (déduis de l'acteur si possible)
- **acteur** : Rôle responsable (depuis swimlane ou texte)
- **condition** : Question pour Gateway (ex: "Dossier conforme ?"), sinon ""
- **outputOui** : ID de l'étape suivante
- **outputNon** : ID alternatif (Gateway uniquement), sinon ""
- **outil** : Système informatique (ex: "CRM", "Nov@ OA"), sinon ""

**RÈGLES STRICTES** :
- Utilise "" si vide (JAMAIS null)
- IDs séquentiels dans l'ordre du flux
- Pour ExclusiveGateway : condition, outputOui ET outputNon obligatoires
- Pour Task/StartEvent/EndEvent : condition = "", outputNon = ""
- Gateway peut pointer vers étape précédente (boucle)

**ENRICHISSEMENTS DOCUMENTAIRES** :

Pour CHAQUE Task (typeBpmn = "Task"), génère un enrichissement :

**1. DESCRIPTIF** (OBLIGATOIRE, 100-200 caractères)
   - Décris l'objectif, inputs, outputs
   - Exemples :
     * "Le client accède au portail et sélectionne un créneau. Confirmation envoyée par email."
     * "Vérification authenticité via outils anti-fraude. Contrôle hologrammes et signatures."

**2. DURÉE ESTIMÉE** (optionnel : "5 min", "15-20 min", "1 h")
   - Manuelle simple → 5-15 min
   - Manuelle complexe → 20-45 min
   - Système auto → 1-5 min
   - Si incertain → ""

**3. FRÉQUENCE** (optionnel, valeurs exactes) :
   Quotidien | Hebdomadaire | Mensuel | Trimestriel | Annuel | À la demande | En continu | Ponctuel
   - Demandes clients → "À la demande"
   - Reporting → "Mensuel" ou "Hebdomadaire"
   - Si incertain → ""

**4. KPI** (optionnel, 20-60 caractères)
   - Indicateur mesurable lié à la performance
   - Exemples : "Taux d'erreur < 2%", "Délai < 15 min"
   - Si incertain → ""

⚠️ PAS d'enrichissement pour StartEvent, EndEvent, ExclusiveGateway

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FORMAT DE SORTIE JSON (sans markdown)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "title": "Titre du processus",
  "workflow": [
    {
      "id": "1",
      "étape": "Nom descriptif",
      "typeBpmn": "StartEvent | Task | ExclusiveGateway | EndEvent",
      "département": "Service",
      "acteur": "Rôle",
      "condition": "Question ? (Gateway uniquement)",
      "outputOui": "ID suivant",
      "outputNon": "ID alternatif (Gateway uniquement)",
      "outil": "Système"
    }
  ],
  "enrichments": [
    {
      "id_tache": "2",
      "descriptif": "Description complète (OBLIGATOIRE)",
      "duree_estimee": "15 min (optionnel)",
      "frequence": "À la demande (optionnel)",
      "kpi": "Taux d'erreur < 2% (optionnel)"
    }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ VÉRIFICATION FINALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Avant de retourner le JSON, vérifie :
✓ Toutes les formes géométriques extraites ?
✓ Toutes les connexions (flèches) capturées ?
✓ Le flux est continu et logique ?
✓ TOUTES les Tasks ont un descriptif ?
✓ JSON pur sans markdown (pas de ```json) ?

⚡ RETOURNE LE JSON MAINTENANT :"""

def get_format_global() -> str:
    return FORMAT_GLOBAL
"""
Prompt pour l'enrichissement automatique des tâches BPMN
Génère : descriptif, durée, fréquence, KPI
"""

def get_enrichment_prompt(task: dict) -> str:
    """
    Génère le prompt pour enrichir UNE tâche spécifique
    
    Args:
        task: Une ligne Table1Row à enrichir
    
    Returns:
        Prompt formaté
    """
    
    return f"""Tu es un expert en analyse de processus métier et en documentation opérationnelle.

🎯 OBJECTIF : Générer des enrichissements documentaires professionnels pour UNE tâche BPMN.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 TÂCHE À ENRICHIR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Nom de la tâche** : {task.get('étape', 'Tâche sans nom')}
**Type BPMN** : {task.get('typeBpmn', 'Task')}
**Département** : {task.get('département', 'Non spécifié')}
**Acteur** : {task.get('acteur', 'Non spécifié')}
**Outil** : {task.get('outil', 'Non spécifié')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 ENRICHISSEMENTS À GÉNÉRER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tu dois générer 4 enrichissements professionnels :

1️⃣ **DESCRIPTIF** (100-250 caractères)
   - Décris l'objectif de la tâche
   - Mentionne les inputs (ce qui est reçu)
   - Mentionne les outputs (ce qui est produit)
   - Identifie les risques potentiels
   
   **Exemples** :
   - "Le client accède au portail en ligne et sélectionne un créneau disponible. Le système envoie une confirmation par email et SMS."
   - "Vérifier l'authenticité des documents via des outils de détection de fraude. Contrôler les hologrammes, filigranes et signatures."
   - "Création du compte dans le système Core Banking. Paramétrage des droits et des produits associés."

2️⃣ **DURÉE ESTIMÉE** (format court)
   - Estime une durée réaliste en fonction du type de tâche
   - Utilise : "X min", "X h", "X-Y min"
   
   **Règles d'estimation** :
   - Tâche manuelle simple → 5-15 min
   - Tâche manuelle complexe → 20-45 min
   - Tâche système automatisée → 1-5 min
   - Tâche de validation/contrôle → 10-30 min
   - Tâche administrative → 15-60 min
   
   **Exemples** :
   - "5 min"
   - "15-20 min"
   - "1 h"
   - "2-3 min" (si automatisé)

3️⃣ **FRÉQUENCE** (utilise EXACTEMENT une de ces valeurs)
   - "Quotidien"
   - "Hebdomadaire"
   - "Mensuel"
   - "Trimestriel"
   - "Annuel"
   - "À la demande"
   - "En continu"
   - "Ponctuel"
   
   **Règles de déduction** :
   - Si c'est lié à des demandes clients → "À la demande"
   - Si c'est un reporting → "Mensuel" ou "Hebdomadaire"
   - Si c'est une tâche de clôture → "Quotidien" ou "Mensuel"
   - Si c'est une validation → "À la demande"
   - Si c'est du monitoring → "En continu"

4️⃣ **KPI** (indicateur mesurable, 20-60 caractères)
   - Un KPI concret et mesurable
   - Lié à la performance de la tâche
   
   **Exemples** :
   - "Taux de conversion > 80%"
   - "Taux d'erreur < 2%"
   - "Taux de détection fraude > 95%"
   - "Délai de création < 1h"
   - "Délai de notification < 2h"
   - "Temps de traitement < 15 min"
   - "Taux de conformité > 98%"
   - "Taux d'approbation 1er passage > 70%"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ RÈGLES STRICTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ✅ **CONTEXTE** : Base-toi sur le département, l'acteur et l'outil pour déduire le contexte métier
2. ✅ **RÉALISME** : Les durées et KPI doivent être réalistes et professionnels
3. ✅ **COHÉRENCE** : Si l'outil est mentionné, intègre-le dans le descriptif
4. ✅ **CLARTÉ** : Le descriptif doit être compréhensible par un non-expert
5. ✅ **FRÉQUENCE STRICTE** : Utilise EXACTEMENT une valeur de la liste fournie

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FORMAT DE SORTIE (JSON PUR, sans markdown)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{{
  "descriptif": "Descriptif professionnel de 100-250 caractères",
  "duree_estimee": "Durée au format court (ex: 15 min, 1 h)",
  "frequence": "Une valeur EXACTE de la liste (ex: À la demande, Quotidien)",
  "kpi": "KPI mesurable de 20-60 caractères (ex: Taux d'erreur < 2%)"
}}

⚡ GÉNÈRE MAINTENANT L'ENRICHISSEMENT POUR CETTE TÂCHE :"""


def get_batch_enrichment_prompt(workflow: list) -> str:
    """
    Génère le prompt pour enrichir TOUT un workflow en une seule requête
    (Plus efficace mais moins précis que task-by-task)
    
    Args:
        workflow: Liste complète des Table1Row
    
    Returns:
        Prompt formaté
    """
    
    # Construire la liste des tâches
    tasks_list = "\n".join([
        f"[ID: {task['id']}] {task.get('étape', 'Sans nom')} "
        f"({task.get('acteur', 'N/A')}, {task.get('département', 'N/A')})"
        for task in workflow
        if task.get('typeBpmn') == 'Task'  # Seulement les Tasks
    ])
    
    return f"""Tu es un expert en analyse de processus métier et en documentation opérationnelle.

🎯 OBJECTIF : Générer des enrichissements documentaires pour TOUTES les tâches d'un workflow BPMN.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 WORKFLOW À ENRICHIR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{tasks_list}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 ENRICHISSEMENTS À GÉNÉRER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pour CHAQUE tâche (typeBpmn = "Task"), génère 4 enrichissements :

1️⃣ **DESCRIPTIF** (100-250 caractères)
   - Objectif, inputs, outputs, risques
   
2️⃣ **DURÉE ESTIMÉE** (format court)
   - Tâche simple → 5-15 min
   - Tâche complexe → 20-45 min
   - Tâche automatisée → 1-5 min
   
3️⃣ **FRÉQUENCE** (valeur exacte parmi)
   - Quotidien, Hebdomadaire, Mensuel, Trimestriel, Annuel
   - À la demande, En continu, Ponctuel

4️⃣ **KPI** (indicateur mesurable, 20-60 caractères)
   - Exemples : "Taux d'erreur < 2%", "Délai < 1h"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FORMAT DE SORTIE (JSON PUR, sans markdown)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{{
  "enrichments": [
    {{
      "id_tache": "1",
      "descriptif": "...",
      "duree_estimee": "15 min",
      "frequence": "À la demande",
      "kpi": "Taux de conversion > 80%"
    }},
    ...
  ]
}}

⚠️ **IMPORTANT** : 
- N'enrichis QUE les Tasks (pas les StartEvent, EndEvent, ExclusiveGateway)
- Respecte EXACTEMENT les IDs des tâches
- Utilise les fréquences de la liste fournie

⚡ GÉNÈRE MAINTENANT LES ENRICHISSEMENTS :"""
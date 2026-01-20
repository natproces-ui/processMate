"""
Prompt pour l'amélioration de workflows existants
"""

import json
from typing import List, Dict


def get_improvement_prompt(workflow: List[Dict[str, str]]) -> str:
    """
    Construit le prompt pour améliorer un workflow existant
    
    Args:
        workflow: Tableau Table1Row[] existant à améliorer
        
    Returns:
        str: Prompt formaté avec le workflow intégré
    """
    workflow_json = json.dumps(workflow, ensure_ascii=False, indent=2)
    
    return f"""Tu es un expert en modélisation de processus métier BPMN. 

🎯 MISSION: Améliorer le workflow suivant pour qu'il soit plus professionnel, cohérent et exploitable.

📋 WORKFLOW ACTUEL:
```json
{workflow_json}
```

✨ AMÉLIORATIONS À APPORTER:

1. **FORMULATION DES ÉTAPES**:
   - Utilise des verbes d'action à l'infinitif (ex: "Vérifier", "Envoyer", "Valider")
   - Sois précis et professionnel (évite "Faire qqchose", privilégie "Effectuer la vérification KYC")
   - Harmonise le style rédactionnel

2. **COHÉRENCE STRUCTURELLE**:
   - Vérifie que les connexions (outputOui/outputNon) sont logiques
   - Assure-toi qu'il y a UN StartEvent au début
   - Assure-toi qu'il y a au moins UN EndEvent
   - Valide que les IDs référencés existent

3. **DÉPARTEMENTS & ACTEURS**:
   - Unifie les noms (ex: "Vente" vs "Commercial" → choisis un seul terme)
   - Complète les acteurs manquants si le contexte le permet
   - Organise logiquement les swimlanes

4. **OUTILS**:
   - Identifie et ajoute les outils métier manquants (CRM, Email, Portail, etc.)
   - Normalise les noms d'outils (ex: "crm" → "CRM")

5. **CONDITIONS (pour ExclusiveGateway)**:
   - Formule des questions claires (ex: "Document valide ?" au lieu de "check doc")
   - Assure-toi que chaque Gateway a une condition

⚠️ RÈGLES STRICTES:
1. **GARDE LA MÊME STRUCTURE**: Ne change pas les IDs, ne supprime pas d'étapes
2. **CONSERVE LES CONNEXIONS**: outputOui/outputNon doivent rester cohérents
3. **FORMAT JSON OBLIGATOIRE**: Retourne UNIQUEMENT le JSON, sans markdown
4. **TOUS LES CHAMPS REQUIS**: id, étape, typeBpmn, département, acteur, condition, outputOui, outputNon, outil
5. **PAS DE NULL**: Utilise toujours "" pour les champs vides

📊 FORMAT DE SORTIE (identique au format d'entrée):
{{
  "workflow": [
    {{
      "id": "1",
      "étape": "Démarrer le processus de création de compte",
      "typeBpmn": "StartEvent",
      "département": "Service Client",
      "acteur": "Client",
      "condition": "",
      "outputOui": "2",
      "outputNon": "",
      "outil": "Portail en ligne"
    }},
    ...
  ]
}}

🚀 AMÉLIORE MAINTENANT LE WORKFLOW:"""
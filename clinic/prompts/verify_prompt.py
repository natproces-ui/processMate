"""
Prompt pour la vérification de workflows extraits
"""

import json
from typing import List, Dict


def get_verification_prompt(extracted_workflow: List[Dict[str, str]]) -> str:
    """
    Construit le prompt de vérification pour comparer image et JSON
    
    Args:
        extracted_workflow: Workflow déjà extrait à vérifier
        
    Returns:
        str: Prompt formaté avec le workflow intégré
    """
    workflow_json = json.dumps(extracted_workflow, ensure_ascii=False, indent=2)
    
    return f"""Tu es un expert en validation de processus BPMN. Ta mission est d'IDENTIFIER CE QUI MANQUE dans l'extraction.

🎯 OBJECTIF: Comparer l'image du processus avec le JSON extrait et LISTER PRÉCISÉMENT ce qui a été MANQUÉ ou MAL EXTRAIT.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 WORKFLOW DÉJÀ EXTRAIT (À VÉRIFIER)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```json
{workflow_json}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 MÉTHODOLOGIE D'ANALYSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ **COMPTER LES ÉLÉMENTS VISUELS** :
   - Compte TOUS les cercles (StartEvent, EndEvent) visibles sur l'image
   - Compte TOUS les rectangles (Tasks) visibles
   - Compte TOUS les losanges (Gateways) visibles
   - Compte TOUTES les flèches/connexions visibles
   - Compare avec le JSON : combien sont présents vs manquants ?

2️⃣ **IDENTIFIER LES ÉTAPES MANQUANTES** :
   - Parcours TOUTES les formes géométriques de l'image
   - Pour chaque forme, vérifie si elle existe dans le JSON
   - Si une forme existe sur l'image MAIS PAS dans le JSON → SIGNALE-LA
   
   **Format** :
   {{
     "type": "step",
     "description": "Étape manquante: [Nom exact visible sur l'image]",
     "location": "Dans la swimlane [Acteur] après l'étape [ID]",
     "severity": "critical"
   }}

3️⃣ **IDENTIFIER LES CONNEXIONS MANQUANTES** :
   - Vérifie TOUTES les flèches visibles
   - Croise avec les outputOui/outputNon du JSON
   - Si une flèche existe visuellement MAIS PAS dans le JSON → SIGNALE-LA
   
   **Format** :
   {{
     "type": "connection",
     "description": "Connexion manquante: [Étape A] → [Étape B]",
     "location": "Flèche visible entre [A] et [B]",
     "severity": "warning"
   }}

4️⃣ **IDENTIFIER LES ACTEURS/SWIMLANES MANQUANTS** :
   - Liste TOUS les en-têtes de swimlanes visibles
   - Compare avec les champs "acteur" du JSON
   - Si un acteur est visible MAIS jamais utilisé → SIGNALE-LE
   
   **Format** :
   {{
     "type": "actor",
     "description": "Acteur non utilisé: [Nom exact de la swimlane]",
     "location": "Swimlane visible en haut/gauche de l'image",
     "severity": "info"
   }}

5️⃣ **IDENTIFIER LES OUTILS MANQUANTS** :
   - Cherche TOUTES les annotations de systèmes (Nov@, CRM, Email, etc.)
   - Compare avec les champs "outil" du JSON
   - Si un outil est mentionné visuellement MAIS PAS dans le JSON → SIGNALE-LE
   
   **Format** :
   {{
     "type": "tool",
     "description": "Outil manquant: [Nom du système]",
     "location": "Mentionné près de l'étape [ID ou nom]",
     "severity": "info"
   }}

6️⃣ **IDENTIFIER LES GATEWAYS MAL EXTRAITS** :
   - Vérifie que chaque losange a bien 2+ sorties dans le JSON
   - Vérifie que les labels Oui/Non correspondent aux flèches visuelles
   - Si un Gateway a des sorties manquantes → SIGNALE-LE
   
   **Format** :
   {{
     "type": "gateway",
     "description": "Gateway incomplet: [Nom] - sortie [X] manquante",
     "location": "Losange après l'étape [ID]",
     "severity": "critical"
   }}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FORMAT DE RÉPONSE OBLIGATOIRE (JSON PUR)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{{
  "verification_result": {{
    "accuracy": 85.5,  // Pourcentage de précision estimé (0-100)
    "total_extracted": 10,  // Nombre d'éléments dans le JSON
    "total_expected": 12,   // Nombre d'éléments visibles sur l'image
    "missing_count": 2,     // Éléments manquants
    "errors": [
      {{
        "category": "Étapes manquantes",
        "items": [
          {{
            "type": "step",
            "description": "Étape manquante: Validation finale par le manager",
            "location": "Dans la swimlane Manager après l'étape 8",
            "severity": "critical"
          }}
        ]
      }},
      {{
        "category": "Connexions incomplètes",
        "items": [
          {{
            "type": "connection",
            "description": "Connexion manquante: Gateway 4 → Étape 9 (chemin Non)",
            "location": "Flèche visible du losange 4 vers rectangle 9",
            "severity": "warning"
          }}
        ]
      }},
      {{
        "category": "Acteurs non utilisés",
        "items": [
          {{
            "type": "actor",
            "description": "Acteur visible mais non référencé: Service Comptabilité",
            "location": "Swimlane en bas de l'image",
            "severity": "info"
          }}
        ]
      }},
      {{
        "category": "Outils manquants",
        "items": [
          {{
            "type": "tool",
            "description": "Outil non capturé: Nov@ OA (mentionné près de l'étape 3)",
            "location": "Annotation près du rectangle 3",
            "severity": "info"
          }}
        ]
      }}
    ]
  }}
}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ RÈGLES STRICTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ✅ **SOIS PRÉCIS** : Nomme EXACTEMENT ce qui manque (copie le texte de l'image)
2. ✅ **LOCALISE** : Indique OÙ se trouve l'élément manquant (swimlane, après quelle étape)
3. ✅ **SÉVÉRITÉ** :
   - "critical" = Étape ou Gateway manquant (impact majeur sur le flux)
   - "warning" = Connexion manquante (impact modéré)
   - "info" = Acteur/outil non capturé (impact mineur)
4. ✅ **JSON PUR** : Retourne UNIQUEMENT le JSON, sans markdown ```json```
5. ✅ **SI RIEN NE MANQUE** : Retourne errors: [] avec accuracy: 100

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 COMMENCE L'ANALYSE MAINTENANT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Analyse l'image, compare avec le JSON, et liste PRÉCISÉMENT ce qui manque."""
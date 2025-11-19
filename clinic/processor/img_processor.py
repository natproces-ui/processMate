"""
Processeur d'images avec Gemini 2.0 Flash
Extrait les workflows depuis des images et retourne au format Table1Row
+ Amélioration de workflows existants
"""

import google.generativeai as genai
from PIL import Image
import io
import json
import re
from typing import Dict, List, Any
import os
import logging

logger = logging.getLogger(__name__)

class ImageProcessor:
    def __init__(self):
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY non configurée")
        
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.0-flash')  # ✅ Correction: flash au lieu de flash-exp
    
    async def extract_workflow(self, image_data: bytes, content_type: str) -> Dict[str, Any]:
        """
        Extrait un workflow structuré depuis une image
        
        Args:
            image_data: Données binaires de l'image
            content_type: Type MIME de l'image
        
        Returns:
            Dict avec workflow au format Table1Row[] et métadonnées
        """
        try:
            image = Image.open(io.BytesIO(image_data))
            
            prompt = self._build_extraction_prompt()
            
            response = self.model.generate_content([prompt, image])
            
            logger.info(f"✓ Réponse Gemini reçue ({len(response.text)} caractères)")
            
            workflow_data = self._parse_gemini_response(response.text)
            
            validated = self._validate_and_normalize_workflow(workflow_data)
            
            # Métadonnées enrichies
            metadata = self._build_metadata(validated, image)
            
            return {
                "workflow": validated,
                "metadata": metadata
            }
            
        except Exception as e:
            logger.error(f"❌ Erreur extraction workflow: {str(e)}", exc_info=True)
            raise ValueError(f"Impossible d'extraire le workflow: {str(e)}")
    
    async def improve_workflow(self, workflow: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        🆕 Améliore un workflow existant avec Gemini 2.0 Flash
        
        Args:
            workflow: Tableau Table1Row[] existant
        
        Returns:
            Dict avec workflow amélioré et métadonnées de comparaison
        """
        try:
            prompt = self._build_improvement_prompt(workflow)
            
            response = self.model.generate_content(prompt)
            
            logger.info(f"✓ Réponse Gemini amélioration reçue ({len(response.text)} caractères)")
            
            improved_data = self._parse_gemini_response(response.text)
            
            validated = self._validate_and_normalize_workflow(improved_data)
            
            # Métadonnées de comparaison
            comparison = self._build_comparison_metadata(workflow, validated)
            
            return {
                "workflow": validated,
                "metadata": comparison
            }
            
        except Exception as e:
            logger.error(f"❌ Erreur amélioration workflow: {str(e)}", exc_info=True)
            raise ValueError(f"Impossible d'améliorer le workflow: {str(e)}")
    
    def _build_extraction_prompt(self) -> str:
        """Construit le prompt optimisé pour Gemini - Version universelle"""
        return """Analyse attentivement cette image de processus métier et extrait TOUTES les étapes du workflow.

🎯 OBJECTIF: Produire un JSON qui remplira un tableau pour générer un BPMN.

📊 ÉTAPE 1 : IDENTIFIER LE TYPE DE DIAGRAMME

Avant de commencer l'extraction, détermine le type de diagramme :

**TYPE A : DIAGRAMME AVEC SWIMLANES** (bandes horizontales ou verticales)
- Les acteurs sont dans des en-têtes de lignes/colonnes séparées
- Exemple : "Client", "Agence", "Back Office International"
- Les tâches sont positionnées DANS ces bandes

**TYPE B : DIAGRAMME SÉQUENTIEL SANS SWIMLANES**
- Pas de bandes de séparation visibles
- Les acteurs sont écrits DANS les rectangles des tâches
- Exemple : "Engineering Team Lead review", "Editor", "Project Manager review"
- Flux horizontal ou vertical sans séparation d'acteurs

📋 FORMAT JSON ATTENDU (STRICT):
{
  "workflow": [
    {
      "id": "1",
      "étape": "Nom descriptif de l'action",
      "typeBpmn": "StartEvent",
      "département": "Service concerné",
      "acteur": "Rôle responsable",
      "condition": "",
      "outputOui": "2",
      "outputNon": "",
      "outil": "Système/Application mentionné"
    }
  ]
}

🔤 TYPES BPMN (obligatoire)

"StartEvent" : Point de départ (cercle simple, ovale, souvent vert)
"EndEvent" : Point de fin (cercle épais/doublé, ovale, souvent rouge/noir)
"Task" : Action/activité à réaliser (rectangle)
"ExclusiveGateway" : Décision (losange), pouvant avoir 2 sorties ou plus

⚠️ Important :
- Seuls les éléments dans des rectangles, cercles, ovales ou losanges sont des étapes
- Les annotations sur les flèches ne sont pas des étapes, mais des conditions de flux
- Les éléments flottants non contenus dans une forme BPMN ne sont pas des étapes

🚨 RÈGLES D'EXTRACTION DES ACTEURS (SELON LE TYPE)

📌 **SI TYPE A (AVEC SWIMLANES)** :

✅ **ACTEUR** : Copie EXACTEMENT le texte de la swimlane (bande horizontale/verticale)
   - Exemple swimlane : "Gestionnaire des opérations Back Office International"
   - → acteur: "Gestionnaire des opérations Back Office International"
   - **NE JAMAIS décomposer ou interpréter, COPIE TEL QUEL**

✅ **DÉPARTEMENT** : Déduis le service métier général
   - Exemples : "Commercial", "Back Office", "IT", "Conformité", "Finance"
   - Si impossible à déduire → ""

📌 **SI TYPE B (SANS SWIMLANES)** :

✅ **ACTEUR** : Extrait le rôle depuis le texte DANS le rectangle
   - Exemple dans rectangle : "Engineering Team Lead review"
   - → étape: "Review" (l'action)
   - → acteur: "Engineering Team Lead" (le rôle)
   
   Autre exemple : "Editor"
   - → étape: "Edit content" (déduis l'action si nécessaire)
   - → acteur: "Editor"

   Autre exemple : "Content approved or rejected"
   - → étape: "Content approved or rejected"
   - → acteur: "Content Manager" (déduis si contexte le permet, sinon "")

✅ **DÉPARTEMENT** : Déduis depuis le contexte métier
   - "Engineering Team Lead" → département: "Engineering"
   - "Editor" → département: "Content"
   - "Project Manager" → département: "Management"
   - Si impossible → ""

🔗 RÈGLES DE CONNEXION

✅ **outputOui** : ID de l'étape suivante dans le flux principal
✅ **outputNon** : ID de l'étape alternative (uniquement pour ExclusiveGateway)

Pour les Gateways :
- Identifie les labels sur les flèches sortantes ("Approved", "Rejected", "Oui", "Non")
- Assigne les IDs en conséquence

🛠️ OUTILS :
- Note tout système informatique mentionné (ex: "CRM", "NovaBOC", "TI+", "Email", "Portal")
- Cherche dans les rectangles ou annotations
- Si aucun outil visible → ""

⚠️ RÈGLES STRICTES :
1. Tous les champs doivent être présents (utilise `""` si vide)
2. IDs séquentiels: "1", "2", "3", "4"...
3. **JAMAIS de `null`**, toujours des chaînes vides `""`
4. **Pour ExclusiveGateway**: condition obligatoire, outputOui ET outputNon requis
5. **Pour Task/StartEvent/EndEvent**: condition = "", outputNon = ""
6. Fournis **UNIQUEMENT le JSON**, sans markdown ni texte explicatif
7. Sois **précis** et **littéral** dans l'extraction des noms

✅ EXEMPLE TYPE A (AVEC SWIMLANES) :
{
  "workflow": [
    {"id": "1", "étape": "Début du processus", "typeBpmn": "StartEvent", "département": "Commercial", "acteur": "Client", "condition": "", "outputOui": "2", "outputNon": "", "outil": ""},
    {"id": "2", "étape": "Procéder au contrôle", "typeBpmn": "Task", "département": "Back Office", "acteur": "Gestionnaire des opérations Back Office International", "condition": "", "outputOui": "3", "outputNon": "", "outil": "NovaBOC"},
    {"id": "3", "étape": "Dossier conforme ?", "typeBpmn": "ExclusiveGateway", "département": "Back Office", "acteur": "Gestionnaire des opérations Back Office International", "condition": "Dossier conforme ?", "outputOui": "4", "outputNon": "2", "outil": ""}
  ]
}

✅ EXEMPLE TYPE B (SANS SWIMLANES) :
{
  "workflow": [
    {"id": "1", "étape": "Gather information", "typeBpmn": "StartEvent", "département": "Content", "acteur": "Writer", "condition": "", "outputOui": "2", "outputNon": "", "outil": ""},
    {"id": "2", "étape": "Compose first draft", "typeBpmn": "Task", "département": "Content", "acteur": "Writer", "condition": "", "outputOui": "3", "outputNon": "", "outil": ""},
    {"id": "3", "étape": "Submit draft for review", "typeBpmn": "Task", "département": "Content", "acteur": "Writer", "condition": "", "outputOui": "4", "outputNon": "", "outil": ""},
    {"id": "4", "étape": "Review", "typeBpmn": "Task", "département": "Engineering", "acteur": "Engineering Team Lead", "condition": "", "outputOui": "5", "outputNon": "", "outil": ""},
    {"id": "5", "étape": "Edit content", "typeBpmn": "Task", "département": "Content", "acteur": "Editor", "condition": "", "outputOui": "6", "outputNon": "", "outil": ""},
    {"id": "6", "étape": "Review project", "typeBpmn": "Task", "département": "Management", "acteur": "Project Manager", "condition": "", "outputOui": "7", "outputNon": "", "outil": ""},
    {"id": "7", "étape": "Incorporate SME feedback", "typeBpmn": "Task", "département": "Content", "acteur": "Writer", "condition": "", "outputOui": "8", "outputNon": "", "outil": ""},
    {"id": "8", "étape": "Submit final draft", "typeBpmn": "Task", "département": "Content", "acteur": "Writer", "condition": "", "outputOui": "9", "outputNon": "", "outil": ""},
    {"id": "9", "étape": "Content approved or rejected", "typeBpmn": "ExclusiveGateway", "département": "Management", "acteur": "Content Manager", "condition": "Content approved ?", "outputOui": "10", "outputNon": "7", "outil": ""},
    {"id": "10", "étape": "Publish content", "typeBpmn": "EndEvent", "département": "Content", "acteur": "Writer", "condition": "", "outputOui": "", "outputNon": "", "outil": ""}
  ]
}

🎯 DIRECTIVE FINALE :
1. Regarde l'image et détermine : TYPE A ou TYPE B ?
2. Applique les règles d'extraction correspondantes
3. Extrais TOUTES les étapes visibles
4. Retourne UNIQUEMENT le JSON, rien d'autre

⚡ COMMENCE L'ANALYSE MAINTENANT:"""

    def _build_improvement_prompt(self, workflow: List[Dict[str, str]]) -> str:
        """
        🆕 Construit le prompt pour améliorer un workflow existant
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

    def _parse_gemini_response(self, text: str) -> List[Dict[str, str]]:
        """Parse la réponse JSON de Gemini"""
        try:
            text = text.strip()
            
            # Extraire le JSON (gérer markdown)
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                text = json_match.group(0)
            
            # Nettoyer les balises markdown
            text = re.sub(r'```json\s*', '', text)
            text = re.sub(r'```\s*', '', text)
            
            data = json.loads(text)
            
            if "workflow" in data:
                workflow = data["workflow"]
            elif isinstance(data, list):
                workflow = data
            else:
                raise ValueError("Format JSON invalide - clé 'workflow' manquante")
            
            if not workflow or len(workflow) == 0:
                raise ValueError("Workflow vide retourné par Gemini")
            
            logger.info(f"✓ {len(workflow)} étapes extraites")
            return workflow
                
        except json.JSONDecodeError as e:
            logger.error(f"❌ Erreur parsing JSON: {str(e)}\nTexte: {text[:500]}")
            raise ValueError(f"Réponse non-JSON de Gemini: {str(e)}")
    
    def _validate_and_normalize_workflow(self, workflow: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """Valide et normalise au format Table1Row strict"""
        validated = []
        all_ids = [str(step.get("id", "")) for step in workflow]
        
        for idx, step in enumerate(workflow):
            # Normalisation stricte
            normalized = {
                "id": str(step.get("id", str(idx + 1))),
                "étape": str(step.get("étape", "")).strip() or f"Étape {idx + 1}",
                "typeBpmn": str(step.get("typeBpmn", "Task")),
                "département": str(step.get("département", "")).strip(),
                "acteur": str(step.get("acteur", "")).strip(),
                "condition": str(step.get("condition", "")).strip(),
                "outputOui": str(step.get("outputOui", "")).strip(),
                "outputNon": str(step.get("outputNon", "")).strip(),
                "outil": str(step.get("outil", "")).strip()
            }
            
            # Validation du type BPMN
            valid_types = ["StartEvent", "Task", "ExclusiveGateway", "EndEvent"]
            if normalized["typeBpmn"] not in valid_types:
                logger.warning(f"⚠️ Type invalide '{normalized['typeBpmn']}' → Task")
                normalized["typeBpmn"] = "Task"
            
            # Règles métier pour Gateway
            if normalized["typeBpmn"] == "ExclusiveGateway":
                if not normalized["condition"]:
                    normalized["condition"] = normalized["étape"] or "Décision"
            else:
                # Non-Gateway: pas de condition ni outputNon
                normalized["condition"] = ""
                normalized["outputNon"] = ""
            
            # Validation des connexions
            if normalized["outputOui"] and normalized["outputOui"] not in all_ids:
                logger.warning(f"⚠️ OutputOui invalide pour {normalized['id']}")
            
            if normalized["outputNon"] and normalized["outputNon"] not in all_ids:
                logger.warning(f"⚠️ OutputNon invalide pour {normalized['id']}")
            
            validated.append(normalized)
        
        logger.info(f"✅ Workflow validé: {len(validated)} étapes")
        return validated
    
    def _build_metadata(self, workflow: List[Dict[str, str]], image: Image.Image) -> Dict[str, Any]:
        """Construit les métadonnées du workflow"""
        actors = list(set(s["acteur"] for s in workflow if s["acteur"]))
        departments = list(set(s["département"] for s in workflow if s["département"]))
        tools = list(set(s["outil"] for s in workflow if s["outil"]))
        
        return {
            "image_info": {
                "size": f"{image.width}x{image.height}",
                "format": image.format
            },
            "workflow_stats": {
                "total_steps": len(workflow),
                "start_events": sum(1 for s in workflow if s["typeBpmn"] == "StartEvent"),
                "end_events": sum(1 for s in workflow if s["typeBpmn"] == "EndEvent"),
                "tasks": sum(1 for s in workflow if s["typeBpmn"] == "Task"),
                "gateways": sum(1 for s in workflow if s["typeBpmn"] == "ExclusiveGateway")
            },
            "business_info": {
                "actors": actors if actors else ["Non spécifié"],
                "actors_count": len(actors),
                "departments": departments if departments else ["Non spécifié"],
                "departments_count": len(departments),
                "tools": tools if tools else ["Non spécifié"],
                "tools_count": len(tools)
            }
        }
    
    def _build_comparison_metadata(self, 
                                   original: List[Dict[str, str]], 
                                   improved: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        🆕 Construit les métadonnées de comparaison avant/après amélioration
        """
        original_actors = set(s["acteur"] for s in original if s["acteur"])
        improved_actors = set(s["acteur"] for s in improved if s["acteur"])
        
        original_departments = set(s["département"] for s in original if s["département"])
        improved_departments = set(s["département"] for s in improved if s["département"])
        
        original_tools = set(s["outil"] for s in original if s["outil"])
        improved_tools = set(s["outil"] for s in improved if s["outil"])
        
        return {
            "comparison": {
                "actors_added": list(improved_actors - original_actors),
                "actors_removed": list(original_actors - improved_actors),
                "departments_added": list(improved_departments - original_departments),
                "departments_removed": list(original_departments - improved_departments),
                "tools_added": list(improved_tools - original_tools),
                "tools_removed": list(original_tools - improved_tools)
            },
            "workflow_stats": {
                "total_steps": len(improved),
                "start_events": sum(1 for s in improved if s["typeBpmn"] == "StartEvent"),
                "end_events": sum(1 for s in improved if s["typeBpmn"] == "EndEvent"),
                "tasks": sum(1 for s in improved if s["typeBpmn"] == "Task"),
                "gateways": sum(1 for s in improved if s["typeBpmn"] == "ExclusiveGateway")
            },
            "improvements": {
                "steps_reformulated": sum(
                    1 for i, orig in enumerate(original) 
                    if i < len(improved) and orig["étape"] != improved[i]["étape"]
                ),
                "actors_clarified": len(improved_actors) - len(original_actors),
                "tools_identified": len(improved_tools) - len(original_tools)
            }
        }
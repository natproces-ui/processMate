# processor/img_processor.py
"""
Processeur d'images 
Extrait les workflows depuis des images et retourne au format Table1Row
+ Amélioration de workflows existants
VERSION ADAPTATIVE : Classification automatique → Prompt spécialisé
"""

from google import genai
from PIL import Image
import io
import json
import re
from typing import Dict, List, Any, Tuple
import os
import logging
import asyncio
from functools import partial
import time
import random
from manager.model_manager import GeminiModelManager, GeminiModel

# Import du classifier et des prompts spécialisés
from prompts.image_classifier import ImageClassifier
from prompts.logic_swimlane import get_logic_swimlanes
from prompts.logic_no_lanes import get_logic_no_lanes
from prompts.logic_manuscript import get_logic_manuscript

# Import des prompts standards
from prompts.extract_prompt import get_extraction_prompt

logger = logging.getLogger(__name__)

class ImageProcessor:
    def __init__(self):
        """
        Utilise le ModelManager pour gérer les retries et fallbacks
        """
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY non configurée")
        
        self.model_manager = GeminiModelManager(api_key)
        self.request_timeout = 600  # Timeout par défaut (peut être overridé par classifier)
    
    def _parse_gemini_response(self, text: str) -> Tuple[List[Dict[str, str]], str, Dict[str, Dict]]:
        """Parse la réponse JSON de Gemini et retourne (workflow, title, enrichments_dict)"""
        try:
            text = text.strip()

            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                text = json_match.group(0)

            text = re.sub(r'```json\s*', '', text)
            text = re.sub(r'```\s*', '', text)

            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                # Tolérance : virgules en trop avant } ou ] (erreur fréquente des modèles rapides)
                data = json.loads(re.sub(r',\s*([}\]])', r'\1', text))
            
            title = data.get("title", "").strip()
            if not title:
                title = "Processus métier"
            
            if "workflow" in data:
                workflow = data["workflow"]
            elif isinstance(data, list):
                workflow = data
            else:
                raise ValueError("Format JSON invalide - clé 'workflow' manquante")
            
            if not workflow or len(workflow) == 0:
                raise ValueError("Workflow vide retourné par Gemini")
            
            enrichments_raw = data.get("enrichments", [])
            if isinstance(enrichments_raw, dict):
                # Tolérance de format : le modèle peut renvoyer un objet {id_tache: {...}}
                # au lieu de la liste attendue — on normalise dans les deux cas.
                enrichments_list = [
                    {**(v or {}), "id_tache": v.get("id_tache", k) if isinstance(v, dict) else k}
                    for k, v in enrichments_raw.items()
                ]
            else:
                enrichments_list = enrichments_raw
            enrichments_dict = {}
            for enr in enrichments_list:
                if not isinstance(enr, dict):
                    continue
                task_id = enr.get("id_tache", "")
                if task_id:
                    enrichments_dict[task_id] = {
                        "id_tache": task_id,
                        "descriptif": enr.get("descriptif", "").strip(),
                        "declencheur": enr.get("declencheur", "").strip(),
                        "applicatif": enr.get("applicatif", "").strip(),
                        "duree_estimee": enr.get("duree_estimee", "").strip(),
                        "frequence": enr.get("frequence", "").strip(),
                        "kpi": enr.get("kpi", "").strip()
                    }
            
            logger.info(f"✓ Titre: '{title}' - {len(workflow)} étapes, {len(enrichments_dict)} enrichies")
            return workflow, title, enrichments_dict
                
        except json.JSONDecodeError as e:
            logger.error(f"❌ Erreur parsing JSON: {str(e)}\nTexte: {text[:500]}")
            raise ValueError(f"Réponse non-JSON de Gemini: {str(e)}")
    
    def _validate_and_normalize_workflow(self, workflow: List[Dict[str, Any]], quiet: bool = False) -> List[Dict[str, Any]]:
        """Valide et normalise au format Table1Row strict (avec outputs[]).

        quiet : aperçu en flux (lignes partielles) — les cibles pas encore écrites ne sont pas signalées.
        """
        log = (lambda *a, **k: None) if quiet else logger.warning
        validated = []
        all_ids = [str(step.get("id", "")) for step in workflow]

        valid_types = ["StartEvent", "Task", "ExclusiveGateway", "ParallelGateway", "InclusiveGateway", "EndEvent"]

        for idx, step in enumerate(workflow):
            type_bpmn = str(step.get("typeBpmn", "Task"))
            if type_bpmn not in valid_types:
                log(f"⚠️ Type invalide '{type_bpmn}' → Task")
                type_bpmn = "Task"

            # --- Normalisation du tableau outputs ---
            raw_outputs = step.get("outputs", [])
            outputs = []

            if isinstance(raw_outputs, list):
                for out in raw_outputs:
                    if isinstance(out, dict):
                        target_id = str(out.get("targetId", "")).strip()
                        label = str(out.get("label", "")).strip()
                        if target_id:
                            if target_id not in all_ids:
                                log(
                                    f"⚠️ targetId '{target_id}' introuvable pour étape {step.get('id')}"
                                )
                            outputs.append({"targetId": target_id, "label": label})
                    elif isinstance(out, str) and out.strip():
                        # Rétrocompatibilité : string seul → targetId sans label
                        if out.strip() not in all_ids:
                            log(
                                f"⚠️ targetId '{out.strip()}' introuvable pour étape {step.get('id')}"
                            )
                        outputs.append({"targetId": out.strip(), "label": ""})

            # --- Condition (gateway uniquement) ---
            if type_bpmn == "ExclusiveGateway":
                condition = str(step.get("condition", "")).strip()
                if not condition:
                    condition = str(step.get("étape", "")) or "Décision"
                if len(outputs) < 2:
                    log(f"⚠️ ExclusiveGateway '{step.get('id')}' a moins de 2 sorties")
            elif type_bpmn == "InclusiveGateway":
                condition = str(step.get("condition", "")).strip()
            else:
                condition = ""

            normalized = {
                "id": str(step.get("id", str(idx + 1))),
                "étape": str(step.get("étape", "")).strip() or f"Étape {idx + 1}",
                "typeBpmn": type_bpmn,
                "département": str(step.get("département", "")).strip(),
                "acteur": str(step.get("acteur", "")).strip(),
                "typeActeur": str(step.get("typeActeur", "")).strip(),  # ← AJOUT
                "condition": condition,
                "outputs": outputs,
                "outil": str(step.get("outil", "")).strip()
            }

            validated.append(normalized)

        if not quiet:
            logger.info(f"✅ Workflow validé: {len(validated)} étapes")
        return validated

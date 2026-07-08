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
from prompts.enhance_prompt import get_improvement_prompt
from prompts.verify_prompt import get_verification_prompt

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
    
    async def extract_workflow(self, image_data: bytes, content_type: str) -> Dict[str, Any]:
        """
        Extrait un workflow ET enrichissements depuis une image
        AVEC classification adaptative pour sélectionner le prompt optimal
        """
        try:
            # ============================================
            # PHASE 0 : Classification de l'image avec Gemini
            # ============================================
            logger.info("📊 Phase 0 : Classification de l'image avec Gemini...")
            classifier = ImageClassifier()
            classification = await classifier.classify_image(image_data)
            
            image_type = classification['type']
            confidence = classification['confidence']
            recommended_timeout = classification['recommended_timeout']
            
            logger.info(
                f"📊 Image classifiée: {image_type} "
                f"(confiance: {confidence}%, timeout: {recommended_timeout}s)"
            )
            
            # ============================================
            # Optimisation de l'image
            # ============================================
            image = Image.open(io.BytesIO(image_data))
            
            max_size = 1024
            if max(image.size) > max_size:
                image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                buffer = io.BytesIO()
                image.save(buffer, format='JPEG', quality=85, optimize=True)
                image = Image.open(buffer)
                logger.info(f"Image optimisée: {image.size} px, ~{len(buffer.getvalue())} bytes")
            
            # ============================================
            # PHASE 1 : Sélection du prompt adaptatif
            # ============================================
            logger.info(f"🎯 Phase 1 : Sélection prompt pour type '{image_type}'")
            
            if image_type == "manuscript":
                logic_prompt = get_logic_manuscript()
                logger.info("📝 Prompt MANUSCRIT activé (correction orthographique)")
            elif image_type == "swimlanes":
                logic_prompt = get_logic_swimlanes()
                logger.info("🏊 Prompt SWIMLANES activé (détection acteurs/outils)")
            else:  # "simple" ou "no_lanes"
                logic_prompt = get_logic_no_lanes()
                logger.info("📋 Prompt SIMPLE activé (flux horizontal sans swimlanes)")
            
            # Combinaison : Logique spécialisée + Format de sortie
            format_prompt = get_extraction_prompt()
            full_prompt = logic_prompt + "\n\n" + format_prompt
            
            # ============================================
            # PHASE 2 : Extraction avec Gemini
            # ============================================
            logger.info("🤖 Phase 2 : Extraction avec Gemini...")
            
            async def _extract_task(model_name: str):
                logger.info(f"🔍 Extraction avec {model_name}")
                model = self.model_manager.get_model(model_name)
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        model.generate_content,
                        model=model_name,
                        contents=[full_prompt, image]
                    ),
                    timeout=recommended_timeout
                )
                return response
            
            result = await self.model_manager.execute_with_fallback(
                _extract_task,
                task_name="Extraction de workflow depuis image"
            )
            
            if not result["success"]:
                raise ValueError(result["message"])
            
            response = result["result"]
            logger.info(f"✓ Réponse Gemini reçue ({len(response.text)} caractères)")
            
            # ============================================
            # PHASE 3 : Parsing et validation
            # ============================================
            workflow_data, title, enrichments_dict = self._parse_gemini_response(response.text)
            validated = self._validate_and_normalize_workflow(workflow_data)
            
            # ============================================
            # PHASE 4 : Métadonnées enrichies
            # ============================================
            metadata = self._build_metadata(validated, image)
            metadata["model_used"] = result["model_used"]
            metadata["attempts"] = result["attempts"]
            metadata["enrichments_count"] = len(enrichments_dict)
            metadata["classification"] = {
                "type": image_type,
                "confidence": confidence,
                "timeout_used": recommended_timeout,
                "prompt_used": image_type,
                "debug": classification.get('debug', {})
            }
            
            logger.info(
                f"✅ Extraction terminée: {len(validated)} étapes, "
                f"{len(enrichments_dict)} enrichies, "
                f"type={image_type}"
            )
            
            return {
                "title": title,
                "workflow": validated,
                "enrichments": enrichments_dict,
                "metadata": metadata
            }
            
        except Exception as e:
            logger.error(f"❌ Erreur extraction workflow: {str(e)}", exc_info=True)
            raise ValueError(f"Impossible d'extraire le workflow: {str(e)}")
    
    async def improve_workflow(self, workflow: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        Améliore un workflow existant avec Gemini 2.5 Flash
        """
        try:
            prompt = get_improvement_prompt(workflow)
            
            async def _improve_task(model_name: str):
                logger.info(f"🔧 Amélioration avec {model_name}")
                model = self.model_manager.get_model(model_name)
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        model.generate_content,
                        model=model_name,
                        contents=prompt
                    ),
                    timeout=90
                )
                return response
            
            result = await self.model_manager.execute_with_fallback(
                _improve_task,
                task_name="Amélioration de workflow"
            )
            
            if not result["success"]:
                raise ValueError(result["message"])
            
            response = result["result"]
            logger.info(f"✓ Réponse Gemini amélioration reçue ({len(response.text)} caractères)")
            
            improved_data, _, _ = self._parse_gemini_response(response.text)
            validated = self._validate_and_normalize_workflow(improved_data)
            
            comparison = self._build_comparison_metadata(workflow, validated)
            comparison["model_used"] = result["model_used"]
            comparison["attempts"] = result["attempts"]
            
            return {
                "workflow": validated,
                "metadata": comparison
            }
            
        except Exception as e:
            logger.error(f"❌ Erreur amélioration workflow: {str(e)}", exc_info=True)
            raise ValueError(f"Impossible d'améliorer le workflow: {str(e)}")
    
    async def verify_extraction(self, 
                               image_data: bytes, 
                               content_type: str,
                               extracted_workflow: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        Vérifie l'extraction en comparant l'image et le workflow JSON
        """
        try:
            image = Image.open(io.BytesIO(image_data))
            
            max_size = 1024
            if max(image.size) > max_size:
                image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                buffer = io.BytesIO()
                image.save(buffer, format='JPEG', quality=85, optimize=True)
                image = Image.open(buffer)
            
            prompt = get_verification_prompt(extracted_workflow)
            
            async def _verify_task(model_name: str):
                logger.info(f"🔍 Vérification avec {model_name}")
                model = self.model_manager.get_model(model_name)
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        model.generate_content,
                        model=model_name,
                        contents=[prompt, image]
                    ),
                    timeout=self.request_timeout
                )
                return response
            
            result = await self.model_manager.execute_with_fallback(
                _verify_task,
                task_name="Vérification de workflow"
            )
            
            if not result["success"]:
                raise ValueError(result["message"])
            
            response = result["result"]
            logger.info(f"✓ Vérification reçue ({len(response.text)} caractères)")
            
            verification_result = self._parse_verification_response(response.text)
            verification_result["model_used"] = result["model_used"]
            verification_result["attempts"] = result["attempts"]
            
            return verification_result
            
        except Exception as e:
            logger.error(f"❌ Erreur vérification workflow: {str(e)}", exc_info=True)
            raise ValueError(f"Impossible de vérifier le workflow: {str(e)}")
    
    def _parse_gemini_response(self, text: str) -> Tuple[List[Dict[str, str]], str, Dict[str, Dict]]:
        """Parse la réponse JSON de Gemini et retourne (workflow, title, enrichments_dict)"""
        try:
            text = text.strip()
            
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                text = json_match.group(0)
            
            text = re.sub(r'```json\s*', '', text)
            text = re.sub(r'```\s*', '', text)
            
            data = json.loads(text)
            
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
    
    def _validate_and_normalize_workflow(self, workflow: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Valide et normalise au format Table1Row strict (avec outputs[])"""
        validated = []
        all_ids = [str(step.get("id", "")) for step in workflow]

        valid_types = ["StartEvent", "Task", "ExclusiveGateway", "ParallelGateway", "InclusiveGateway", "EndEvent"]

        for idx, step in enumerate(workflow):
            type_bpmn = str(step.get("typeBpmn", "Task"))
            if type_bpmn not in valid_types:
                logger.warning(f"⚠️ Type invalide '{type_bpmn}' → Task")
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
                                logger.warning(
                                    f"⚠️ targetId '{target_id}' introuvable pour étape {step.get('id')}"
                                )
                            outputs.append({"targetId": target_id, "label": label})
                    elif isinstance(out, str) and out.strip():
                        # Rétrocompatibilité : string seul → targetId sans label
                        if out.strip() not in all_ids:
                            logger.warning(
                                f"⚠️ targetId '{out.strip()}' introuvable pour étape {step.get('id')}"
                            )
                        outputs.append({"targetId": out.strip(), "label": ""})

            # --- Condition (gateway uniquement) ---
            if type_bpmn == "ExclusiveGateway":
                condition = str(step.get("condition", "")).strip()
                if not condition:
                    condition = str(step.get("étape", "")) or "Décision"
                if len(outputs) < 2:
                    logger.warning(f"⚠️ ExclusiveGateway '{step.get('id')}' a moins de 2 sorties")
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
                "exclusive_gateways": sum(1 for s in workflow if s["typeBpmn"] == "ExclusiveGateway"),
                "parallel_gateways": sum(1 for s in workflow if s["typeBpmn"] == "ParallelGateway"),
                "inclusive_gateways": sum(1 for s in workflow if s["typeBpmn"] == "InclusiveGateway"),
                "gateways": sum(1 for s in workflow if s["typeBpmn"] in ("ExclusiveGateway", "ParallelGateway", "InclusiveGateway"))
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
        """Construit les métadonnées de comparaison avant/après amélioration"""
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
                "tools_removed": list(original_tools - original_tools)
            },
            "workflow_stats": {
                "total_steps": len(improved),
                "start_events": sum(1 for s in improved if s["typeBpmn"] == "StartEvent"),
                "end_events": sum(1 for s in improved if s["typeBpmn"] == "EndEvent"),
                "tasks": sum(1 for s in improved if s["typeBpmn"] == "Task"),
                "exclusive_gateways": sum(1 for s in improved if s["typeBpmn"] == "ExclusiveGateway"),
                "parallel_gateways": sum(1 for s in improved if s["typeBpmn"] == "ParallelGateway"),
                "inclusive_gateways": sum(1 for s in improved if s["typeBpmn"] == "InclusiveGateway"),
                "gateways": sum(1 for s in improved if s["typeBpmn"] in ("ExclusiveGateway", "ParallelGateway", "InclusiveGateway"))
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
    
    def _parse_verification_response(self, text: str) -> Dict[str, Any]:
        """Parse la réponse de vérification de Gemini"""
        try:
            text = text.strip()
            
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                text = json_match.group(0)
            
            text = re.sub(r'```json\s*', '', text)
            text = re.sub(r'```\s*', '', text)
            
            data = json.loads(text)
            
            if "verification_result" in data:
                result = data["verification_result"]
            else:
                result = data
            
            required_keys = ["accuracy", "total_extracted", "total_expected", "errors"]
            for key in required_keys:
                if key not in result:
                    logger.warning(f"⚠️ Clé manquante dans vérification: {key}")
                    result[key] = 0 if key != "errors" else []
            
            logger.info(f"✓ Vérification parsée: {result.get('missing_count', 0)} éléments manquants")
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ Erreur parsing vérification: {str(e)}\nTexte: {text[:500]}")
            return {
                "accuracy": 0,
                "total_extracted": 0,
                "total_expected": 0,
                "missing_count": 0,
                "errors": [
                    {
                        "category": "Erreur système",
                        "items": [
                            {
                                "type": "step",
                                "description": f"Erreur de parsing: {str(e)}",
                                "location": "Système",
                                "severity": "critical"
                            }
                        ]
                    }
                ]
            }
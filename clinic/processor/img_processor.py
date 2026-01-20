"""
Processeur d'images 
Extrait les workflows depuis des images et retourne au format Table1Row
+ Amélioration de workflows existants
VERSION AMÉLIORÉE : Prompt adaptatif avec analyse réflexive
"""

import google.generativeai as genai
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

# Import des prompts depuis les fichiers dédiés
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
        self.request_timeout = 600
    
    async def extract_workflow(self, image_data: bytes, content_type: str) -> Dict[str, Any]:
        """
        Extrait un workflow ET enrichissements depuis une image
        
        Args:
            image_data: Données binaires de l'image
            content_type: Type MIME de l'image
        
        Returns:
            Dict avec title, workflow, enrichments et métadonnées
        """
        try:
            image = Image.open(io.BytesIO(image_data))
            
            max_size = 1024
            if max(image.size) > max_size:
                image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                buffer = io.BytesIO()
                image.save(buffer, format='JPEG', quality=85, optimize=True)
                image = Image.open(buffer)
                logger.info(f"Image optimisée: {image.size} px, ~{len(buffer.getvalue())} bytes")
            
            prompt = get_extraction_prompt()
            
            async def _extract_task(model_name: str):
                logger.info(f"🔍 Extraction avec {model_name}")
                
                model = self.model_manager.get_model(model_name)
                
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        model.generate_content,
                        [prompt, image]
                    ),
                    timeout=self.request_timeout
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
            
            workflow_data, title, enrichments_dict = self._parse_gemini_response(response.text)
            
            validated = self._validate_and_normalize_workflow(workflow_data)
            
            metadata = self._build_metadata(validated, image)
            metadata["model_used"] = result["model_used"]
            metadata["attempts"] = result["attempts"]
            metadata["enrichments_count"] = len(enrichments_dict)
            
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
        
        Args:
            workflow: Tableau Table1Row[] existant
        
        Returns:
            Dict avec workflow amélioré et métadonnées de comparaison
        """
        try:
            prompt = get_improvement_prompt(workflow)
            
            async def _improve_task(model_name: str):
                logger.info(f"🔧 Amélioration avec {model_name}")
                
                model = self.model_manager.get_model(model_name)
                
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        model.generate_content,
                        prompt
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
        Identifie les éléments manquants ou mal extraits
        
        Args:
            image_data: Données binaires de l'image originale
            content_type: Type MIME de l'image
            extracted_workflow: Workflow déjà extrait à vérifier
        
        Returns:
            Dict avec analyse des erreurs et éléments manquants
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
                        [prompt, image]
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
            
            enrichments_list = data.get("enrichments", [])
            enrichments_dict = {}
            for enr in enrichments_list:
                task_id = enr.get("id_tache", "")
                if task_id:
                    enrichments_dict[task_id] = {
                        "id_tache": task_id,
                        "descriptif": enr.get("descriptif", "").strip(),
                        "duree_estimee": enr.get("duree_estimee", "").strip(),
                        "frequence": enr.get("frequence", "").strip(),
                        "kpi": enr.get("kpi", "").strip()
                    }
            
            logger.info(f"✓ Titre: '{title}' - {len(workflow)} étapes, {len(enrichments_dict)} enrichies")
            return workflow, title, enrichments_dict
                
        except json.JSONDecodeError as e:
            logger.error(f"❌ Erreur parsing JSON: {str(e)}\nTexte: {text[:500]}")
            raise ValueError(f"Réponse non-JSON de Gemini: {str(e)}")
    
    def _validate_and_normalize_workflow(self, workflow: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """Valide et normalise au format Table1Row strict"""
        validated = []
        all_ids = [str(step.get("id", "")) for step in workflow]
        
        for idx, step in enumerate(workflow):
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
            
            valid_types = ["StartEvent", "Task", "ExclusiveGateway", "EndEvent"]
            if normalized["typeBpmn"] not in valid_types:
                logger.warning(f"⚠️ Type invalide '{normalized['typeBpmn']}' → Task")
                normalized["typeBpmn"] = "Task"
            
            if normalized["typeBpmn"] == "ExclusiveGateway":
                if not normalized["condition"]:
                    normalized["condition"] = normalized["étape"] or "Décision"
            else:
                normalized["condition"] = ""
                normalized["outputNon"] = ""
            
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
        Construit les métadonnées de comparaison avant/après amélioration
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
                "tools_removed": list(original_tools - original_tools)
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
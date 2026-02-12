# clinic/prompts/image_classifier.py
"""
Classificateur d'images BPMN avec Gemini
Classification rapide et précise en ~10 secondes
"""

import google.generativeai as genai
from PIL import Image
import io
from typing import Dict
import logging
import asyncio
import os

logger = logging.getLogger(__name__)


class ImageClassifier:
    """
    Classifie les images BPMN en utilisant Gemini pour une précision maximale
    """
    
    # Prompt ultra-court pour classification rapide
    CLASSIFICATION_PROMPT = """Analyse cette image de processus métier et classifie-la en UN SEUL MOT parmi ces 3 types :

**swimlanes** : Diagramme BPMN formel avec bandes horizontales/verticales (swimlanes) contenant des acteurs/départements
**manuscript** : Diagramme dessiné à la main sur tableau blanc ou papier (traits irréguliers, écriture manuscrite)
**simple** : Diagramme BPMN simple sans swimlanes (flux horizontal standard)

RÈGLES CRITIQUES :
- Si tu vois des bandes horizontales avec en-têtes (acteurs/départements) → swimlanes
- Si le diagramme est dessiné à la main avec traits irréguliers → manuscript
- Sinon → simple

Réponds UNIQUEMENT avec un seul mot : swimlanes, manuscript, ou simple"""

    def __init__(self):
        """Initialise le classifier avec l'API Gemini"""
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY non configurée")
        
        genai.configure(api_key=api_key)
        # Utiliser Flash pour classification rapide
        self.model = genai.GenerativeModel("gemini-2.5-flash")
    
    async def classify_image(self, image_data: bytes) -> Dict[str, any]:
        """
        Classification rapide avec Gemini
        
        Args:
            image_data: Données binaires de l'image
            
        Returns:
            {
                "type": "swimlanes" | "simple" | "manuscript",
                "recommended_timeout": 25-40 seconds,
                "recommended_model": "flash",
                "confidence": 0-100,
                "method": "gemini"
            }
        """
        try:
            # Optimisation de l'image pour classification rapide
            image = Image.open(io.BytesIO(image_data))
            
            # Réduire à 512px max pour classification (plus rapide)
            max_size = 512
            if max(image.size) > max_size:
                image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            
            logger.info(f"📊 Classification Gemini de l'image ({image.size[0]}x{image.size[1]}px)")
            
            # Appel Gemini avec timeout court
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    self.model.generate_content,
                    [self.CLASSIFICATION_PROMPT, image]
                ),
                timeout=15  # 15 secondes max pour classification
            )
            
            # Extraction du type depuis la réponse
            classification_text = response.text.strip().lower()
            
            # Nettoyage de la réponse
            if "swimlanes" in classification_text or "swimlane" in classification_text:
                image_type = "swimlanes"
                recommended_timeout = 60  # ← Augmenté de 30 à 60s
                confidence = 95
            elif "manuscript" in classification_text or "manuscrit" in classification_text:
                image_type = "manuscript"
                recommended_timeout = 60  # ← Augmenté de 40 à 60s
                confidence = 95
            elif "simple" in classification_text or "no_lanes" in classification_text or "no-lanes" in classification_text:
                image_type = "simple"
                recommended_timeout = 60  # ← Augmenté de 25 à 60s
                confidence = 95
            else:
                # Fallback si réponse inattendue
                logger.warning(f"⚠️ Réponse Gemini inattendue: '{classification_text}' → Fallback 'simple'")
                image_type = "simple"
                recommended_timeout = 60  # ← Uniformisé à 60s
                confidence = 60
            
            result = {
                "type": image_type,
                "recommended_timeout": recommended_timeout,
                "recommended_model": "flash",
                "confidence": confidence,
                "method": "gemini",
                "debug": {
                    "raw_response": classification_text,
                    "image_size": f"{image.size[0]}x{image.size[1]}"
                }
            }
            
            logger.info(
                f"📊 Gemini classifié: {image_type} "
                f"(confiance: {confidence}%, timeout: {recommended_timeout}s)"
            )
            
            return result
            
        except asyncio.TimeoutError:
            logger.error("⏱️ Timeout classification Gemini → Fallback heuristique")
            return self._fallback_heuristic_classification(image_data)
            
        except Exception as e:
            logger.error(f"❌ Erreur classification Gemini: {str(e)} → Fallback heuristique")
            return self._fallback_heuristic_classification(image_data)
    
    def _fallback_heuristic_classification(self, image_data: bytes) -> Dict[str, any]:
        """
        Fallback rapide basé sur heuristiques simples
        Utilisé si Gemini échoue ou timeout
        """
        try:
            import numpy as np
            
            image = Image.open(io.BytesIO(image_data)).convert('RGB')
            img_array = np.array(image)
            height, width = img_array.shape[:2]
            gray = np.mean(img_array, axis=2).astype(np.uint8)
            
            # Détection rapide de swimlanes (lignes horizontales)
            binary = gray < 200
            horizontal_projection = np.sum(binary, axis=1)
            threshold = width * 0.4  # 40% au lieu de 50% (plus tolérant)
            potential_lanes = horizontal_projection > threshold
            
            lane_count = 0
            in_lane = False
            current_height = 0
            
            for has_line in potential_lanes:
                if has_line:
                    if not in_lane:
                        in_lane = True
                        current_height = 1
                    else:
                        current_height += 1
                else:
                    if in_lane and current_height >= 3:
                        lane_count += 1
                    in_lane = False
                    current_height = 0
            
            has_swimlanes = lane_count >= 2
            
            # Variance pour manuscrit (seuil plus élevé)
            variances = []
            step = 20
            for y in range(0, height - 5, step):
                for x in range(0, width - 5, step):
                    window = gray[y:y+5, x:x+5]
                    variance = np.var(window)
                    variances.append(variance)
            
            avg_variance = np.mean(variances) if variances else 0
            is_manuscript = avg_variance > 1500  # Seuil augmenté de 800 à 1500
            
            # Décision avec PRIORITÉ SWIMLANES
            if has_swimlanes:
                image_type = "swimlanes"
                recommended_timeout = 60  # ← Augmenté de 30 à 60s
                confidence = 75
            elif is_manuscript:
                image_type = "manuscript"
                recommended_timeout = 60  # ← Augmenté de 40 à 60s
                confidence = 70
            else:
                image_type = "simple"
                recommended_timeout = 60  # ← Augmenté de 25 à 60s
                confidence = 65
            
            logger.info(
                f"📊 Fallback heuristique: {image_type} "
                f"(confiance: {confidence}%, lanes={lane_count}, var={int(avg_variance)})"
            )
            
            return {
                "type": image_type,
                "recommended_timeout": recommended_timeout,
                "recommended_model": "flash",
                "confidence": confidence,
                "method": "heuristic_fallback",
                "debug": {
                    "lane_count": int(lane_count),
                    "avg_variance": float(avg_variance),
                    "has_swimlanes": bool(has_swimlanes),
                    "is_manuscript": bool(is_manuscript)
                }
            }
            
        except Exception as e:
            logger.error(f"❌ Erreur fallback heuristique: {str(e)}")
            # Fallback ultime : simple
            return {
                "type": "simple",
                "recommended_timeout": 60,  # ← Augmenté de 30 à 60s
                "recommended_model": "flash",
                "confidence": 50,
                "method": "ultimate_fallback",
                "debug": {"error": str(e)}
            }


# Fonction helper pour compatibilité avec l'ancien code
async def classify_image(image_data: bytes) -> Dict[str, any]:
    """
    Wrapper pour compatibilité avec l'ancienne interface synchrone
    """
    classifier = ImageClassifier()
    return await classifier.classify_image(image_data)
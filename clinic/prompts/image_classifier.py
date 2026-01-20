"""
Classificateur simple d'images BPMN
Détecte : Manuscrit / Swimlanes → 3 types (A/B/C)
"""

from PIL import Image
import numpy as np
import io
from typing import Dict
import logging

logger = logging.getLogger(__name__)


class ImageClassifier:
    """
    Classifie rapidement les images BPMN pour adapter la stratégie d'extraction
    """
    
    @staticmethod
    def classify_image(image_data: bytes) -> Dict[str, any]:
        """
        Classification rapide basée sur 2 critères :
        1. Manuscrit ? (variance locale élevée)
        2. Swimlanes ? (lignes horizontales/verticales)
        
        Returns:
            {
                "type": "swimlanes" | "no_lanes" | "manuscript",
                "recommended_timeout": 25-40 seconds,
                "recommended_model": "flash" | "flash-lite",
                "confidence": 0-100
            }
        """
        try:
            image = Image.open(io.BytesIO(image_data)).convert('RGB')
            img_array = np.array(image)
            
            height, width = img_array.shape[:2]
            
            # Conversion en niveaux de gris
            gray = np.mean(img_array, axis=2).astype(np.uint8)
            
            # ============================================
            # 1. DÉTECTION MANUSCRIT (variance locale)
            # ============================================
            
            # Calcul variance locale simple (fenêtre 5×5)
            variances = []
            step = 20  # Échantillonnage pour rapidité
            
            for y in range(0, height - 5, step):
                for x in range(0, width - 5, step):
                    window = gray[y:y+5, x:x+5]
                    variance = np.var(window)
                    variances.append(variance)
            
            avg_variance = np.mean(variances) if variances else 0
            
            # Manuscrit = variance élevée (traits irréguliers)
            is_manuscript = avg_variance > 800
            
            # ============================================
            # 2. DÉTECTION SWIMLANES (lignes horizontales)
            # ============================================
            
            # Binarisation simple
            binary = gray < 200  # Pixels sombres = traits
            
            # Projection horizontale (somme par ligne)
            horizontal_projection = np.sum(binary, axis=1)
            
            # Lignes avec beaucoup de pixels sombres = swimlanes potentielles
            threshold = width * 0.5  # Au moins 50% de la largeur
            potential_lanes = horizontal_projection > threshold
            
            # Compte les groupes de lignes adjacentes
            lane_count = 0
            in_lane = False
            current_height = 0
            min_height = 3
            
            for has_line in potential_lanes:
                if has_line:
                    if not in_lane:
                        in_lane = True
                        current_height = 1
                    else:
                        current_height += 1
                else:
                    if in_lane and current_height >= min_height:
                        lane_count += 1
                    in_lane = False
                    current_height = 0
            
            has_swimlanes = lane_count >= 2
            
            # ============================================
            # 3. CLASSIFICATION
            # ============================================
            
            if is_manuscript:
                image_type = "manuscript"
                recommended_model = "flash-lite"
                recommended_timeout = 40
                confidence = 85
                
            elif has_swimlanes:
                image_type = "swimlanes"
                recommended_model = "flash"
                recommended_timeout = 30
                confidence = 80
                
            else:
                image_type = "no_lanes"
                recommended_model = "flash"
                recommended_timeout = 25
                confidence = 75
            
            result = {
                "type": image_type,
                "recommended_timeout": recommended_timeout,
                "recommended_model": recommended_model,
                "confidence": confidence,
                "debug": {
                    "is_manuscript": is_manuscript,
                    "has_swimlanes": has_swimlanes,
                    "lane_count": lane_count,
                    "avg_variance": round(avg_variance, 2)
                }
            }
            
            logger.info(
                f"📊 Image classifiée: {image_type} "
                f"(confiance: {confidence}%, "
                f"modèle: {recommended_model}, "
                f"timeout: {recommended_timeout}s)"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Erreur classification: {str(e)}")
            # Fallback sécurisé
            return {
                "type": "manuscript",
                "recommended_timeout": 40,
                "recommended_model": "flash-lite",
                "confidence": 50,
                "debug": {"error": str(e)}
            }
"""
processor/transformer.py
Transformation perspective robuste
"""

import cv2
import numpy as np
from typing import Tuple


class PerspectiveTransformer:
    """Transformation perspective 4 points"""
    
    @staticmethod
    def transform(img: np.ndarray, corners: np.ndarray, target_ratio: str = "auto") -> np.ndarray:
        """
        Applique une transformation perspective
        
        Args:
            img: Image source
            corners: 4 points (x, y) ordonnés TL, TR, BR, BL
            target_ratio: Ratio cible ("auto", "A4", "letter", "square")
            
        Returns:
            Image redressée
        """
        
        if len(corners) != 4:
            raise ValueError("4 corners required")
        
        # S'assurer que les points sont ordonnés
        rect = PerspectiveTransformer._order_points(corners)
        (tl, tr, br, bl) = rect
        
        # Calcul des dimensions cibles
        target_width, target_height = PerspectiveTransformer._calculate_dimensions(
            rect, target_ratio
        )
        
        # Points de destination
        dst = np.array([
            [0, 0],
            [target_width - 1, 0],
            [target_width - 1, target_height - 1],
            [0, target_height - 1]
        ], dtype=np.float32)
        
        # Matrice de transformation
        M = cv2.getPerspectiveTransform(rect, dst)
        
        # Application
        warped = cv2.warpPerspective(
            img, M, (target_width, target_height),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(255, 255, 255)
        )
        
        return warped
    
    @staticmethod
    def _order_points(pts: np.ndarray) -> np.ndarray:
        """
        Ordonne les points dans l'ordre: TL, TR, BR, BL
        
        Méthode robuste même si points désordonnés
        """
        
        rect = np.zeros((4, 2), dtype=np.float32)
        
        # Somme: TL a la plus petite, BR la plus grande
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]  # TL
        rect[2] = pts[np.argmax(s)]  # BR
        
        # Différence: TR a la plus petite, BL la plus grande
        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]  # TR
        rect[3] = pts[np.argmax(diff)]  # BL
        
        return rect
    
    @staticmethod
    def _calculate_dimensions(rect: np.ndarray, target_ratio: str) -> Tuple[int, int]:
        """
        Calcule les dimensions optimales pour l'image redressée
        
        Args:
            rect: 4 points ordonnés
            target_ratio: Ratio cible
            
        Returns:
            (width, height) en pixels
        """
        
        (tl, tr, br, bl) = rect
        
        # Calcul de la largeur
        widthA = np.linalg.norm(br - bl)
        widthB = np.linalg.norm(tr - tl)
        maxWidth = max(int(widthA), int(widthB))
        
        # Calcul de la hauteur
        heightA = np.linalg.norm(tr - br)
        heightB = np.linalg.norm(tl - bl)
        maxHeight = max(int(heightA), int(heightB))
        
        # Appliquer le ratio cible
        if target_ratio == "A4":
            # A4 = 1:1.414 (210 x 297 mm)
            A4_RATIO = 1.414
            if maxHeight / maxWidth > A4_RATIO * 1.2:
                maxHeight = int(maxWidth * A4_RATIO)
            elif maxWidth / maxHeight > A4_RATIO * 1.2:
                maxWidth = int(maxHeight / A4_RATIO)
        
        elif target_ratio == "letter":
            # Letter = 1:1.294 (8.5 x 11 inches)
            LETTER_RATIO = 1.294
            if maxHeight / maxWidth > LETTER_RATIO * 1.2:
                maxHeight = int(maxWidth * LETTER_RATIO)
            elif maxWidth / maxHeight > LETTER_RATIO * 1.2:
                maxWidth = int(maxHeight / LETTER_RATIO)
        
        elif target_ratio == "square":
            # Carré
            maxHeight = maxWidth = max(maxWidth, maxHeight)
        
        # Sinon "auto" = garder les dimensions naturelles
        
        # Limiter à une résolution maximale raisonnable
        MAX_DIM = 4000
        if maxWidth > MAX_DIM or maxHeight > MAX_DIM:
            scale = min(MAX_DIM / maxWidth, MAX_DIM / maxHeight)
            maxWidth = int(maxWidth * scale)
            maxHeight = int(maxHeight * scale)
        
        return maxWidth, maxHeight
    
    @staticmethod
    def calculate_confidence(corners: np.ndarray, img_size: Tuple[int, int]) -> float:
        """
        Calcule un score de confiance pour la détection
        
        Args:
            corners: 4 points détectés
            img_size: (width, height) de l'image originale
            
        Returns:
            Score entre 0 et 1
        """
        
        img_area = img_size[0] * img_size[1]
        doc_area = cv2.contourArea(corners)
        
        # Ratio d'occupation
        ratio = doc_area / img_area
        
        # Score basé sur le ratio
        if 0.4 <= ratio <= 0.85:
            ratio_score = 1.0
        elif 0.25 <= ratio < 0.4 or 0.85 < ratio <= 0.95:
            ratio_score = 0.8
        elif 0.1 <= ratio < 0.25:
            ratio_score = 0.6
        else:
            ratio_score = 0.4
        
        # Vérifier la rectangularité
        rect = cv2.minAreaRect(corners)
        rect_area = rect[1][0] * rect[1][1]
        rectangularity = doc_area / (rect_area + 1e-6)
        
        # Vérifier les angles (doivent être proches de 90°)
        angles = []
        for i in range(4):
            p1 = corners[i]
            p2 = corners[(i + 1) % 4]
            p3 = corners[(i + 2) % 4]
            
            v1 = p1 - p2
            v2 = p3 - p2
            
            cos_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
            angle = np.degrees(np.arccos(np.clip(cos_angle, -1.0, 1.0)))
            angles.append(angle)
        
        # Angles proches de 90° = bon
        angle_score = 1.0 - (np.std(angles) / 90.0)
        angle_score = max(0, min(1, angle_score))
        
        # Score final
        confidence = (
            ratio_score * 0.4 +
            rectangularity * 0.3 +
            angle_score * 0.3
        )
        
        return confidence
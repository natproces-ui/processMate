"""
processor/detector.py
Détection robuste des contours de documents
Utilise 5 algorithmes différents et choisit le meilleur
"""

import cv2
import numpy as np
from typing import Optional, List, Tuple
from dataclasses import dataclass


@dataclass
class DetectionResult:
    """Résultat d'une détection"""
    corners: np.ndarray  # 4 points (x, y)
    confidence: float
    method: str
    contour_area: float


class DocumentDetector:
    """Détecteur de documents avec multiples stratégies"""
    
    def __init__(self, min_area_ratio: float = 0.03):
        """
        Args:
            min_area_ratio: Aire minimale du document (% de l'image)
        """
        self.min_area_ratio = min_area_ratio
    
    def detect(self, img: np.ndarray) -> Optional[np.ndarray]:
        """
        Détection avec multiples algorithmes
        Retourne les 4 coins du document détecté
        """
        
        # Preprocessing: resize pour rapidité
        max_dim = 1200
        h, w = img.shape[:2]
        ratio = min(max_dim / w, max_dim / h, 1.0)
        
        if ratio < 1.0:
            resized = cv2.resize(img, None, fx=ratio, fy=ratio, interpolation=cv2.INTER_AREA)
        else:
            resized = img.copy()
            ratio = 1.0
        
        # Essayer tous les algorithmes
        results: List[DetectionResult] = []
        
        # Algorithme 1: Canny multi-échelle
        result1 = self._detect_canny_multiscale(resized, ratio)
        if result1:
            results.append(result1)
        
        # Algorithme 2: Adaptive threshold
        result2 = self._detect_adaptive(resized, ratio)
        if result2:
            results.append(result2)
        
        # Algorithme 3: Morphological gradient
        result3 = self._detect_morpho(resized, ratio)
        if result3:
            results.append(result3)
        
        # Algorithme 4: HSV-based (pour papier blanc sur fond sombre)
        result4 = self._detect_hsv(resized, ratio)
        if result4:
            results.append(result4)
        
        # Algorithme 5: Contour hiérarchique
        result5 = self._detect_hierarchy(resized, ratio)
        if result5:
            results.append(result5)
        
        if not results:
            return None
        
        # Choisir le meilleur (score combiné)
        best = max(results, key=lambda r: self._score_detection(r, (w, h)))
        
        print(f"Best detection: {best.method}, confidence={best.confidence:.2f}")
        return best.corners
    
    def _detect_canny_multiscale(self, img: np.ndarray, ratio: float) -> Optional[DetectionResult]:
        """Détection via Canny avec multiples seuils"""
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Essayer plusieurs seuils
        best_quad = None
        best_area = 0
        
        for low, high in [(30, 100), (50, 150), (70, 200)]:
            edges = cv2.Canny(blurred, low, high)
            kernel = np.ones((3, 3), np.uint8)
            dilated = cv2.dilate(edges, kernel, iterations=2)
            
            quad = self._find_largest_quad(dilated, ratio, img.shape[:2])
            if quad is not None:
                area = cv2.contourArea(quad)
                if area > best_area:
                    best_area = area
                    best_quad = quad
        
        if best_quad is None:
            return None
        
        return DetectionResult(
            corners=best_quad,
            confidence=0.8,
            method="canny_multiscale",
            contour_area=best_area
        )
    
    def _detect_adaptive(self, img: np.ndarray, ratio: float) -> Optional[DetectionResult]:
        """Détection via seuillage adaptatif"""
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (11, 11), 0)
        
        # Adaptive threshold
        binary = cv2.adaptiveThreshold(
            blurred, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            11, 2
        )
        
        # Morphologie pour nettoyer
        kernel = np.ones((5, 5), np.uint8)
        morph = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)
        
        quad = self._find_largest_quad(morph, ratio, img.shape[:2])
        
        if quad is None:
            return None
        
        return DetectionResult(
            corners=quad,
            confidence=0.85,
            method="adaptive_threshold",
            contour_area=cv2.contourArea(quad)
        )
    
    def _detect_morpho(self, img: np.ndarray, ratio: float) -> Optional[DetectionResult]:
        """Détection via gradient morphologique"""
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Gradient morphologique
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        gradient = cv2.morphologyEx(gray, cv2.MORPH_GRADIENT, kernel)
        
        # Seuillage Otsu
        _, binary = cv2.threshold(gradient, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Fermeture
        kernel2 = np.ones((7, 7), np.uint8)
        closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel2, iterations=3)
        
        quad = self._find_largest_quad(closed, ratio, img.shape[:2])
        
        if quad is None:
            return None
        
        return DetectionResult(
            corners=quad,
            confidence=0.75,
            method="morpho_gradient",
            contour_area=cv2.contourArea(quad)
        )
    
    def _detect_hsv(self, img: np.ndarray, ratio: float) -> Optional[DetectionResult]:
        """Détection via HSV (bon pour papier blanc)"""
        
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        
        # Isoler les zones claires (papier blanc)
        _, s, v = cv2.split(hsv)
        
        # Papier = faible saturation + haute valeur
        mask = cv2.inRange(v, 150, 255)
        
        # Morphologie
        kernel = np.ones((9, 9), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
        
        quad = self._find_largest_quad(mask, ratio, img.shape[:2])
        
        if quad is None:
            return None
        
        return DetectionResult(
            corners=quad,
            confidence=0.9,  # Très fiable si papier blanc
            method="hsv_white_detection",
            contour_area=cv2.contourArea(quad)
        )
    
    def _detect_hierarchy(self, img: np.ndarray, ratio: float) -> Optional[DetectionResult]:
        """Détection via hiérarchie de contours"""
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Canny
        edges = cv2.Canny(blurred, 50, 150)
        
        # Trouver contours avec hiérarchie
        contours, hierarchy = cv2.findContours(
            edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE
        )
        
        if hierarchy is None or len(contours) == 0:
            return None
        
        # Chercher contours sans parent (niveau externe)
        external_contours = []
        for i, h in enumerate(hierarchy[0]):
            if h[3] == -1:  # Pas de parent
                external_contours.append(contours[i])
        
        if not external_contours:
            external_contours = contours
        
        # Trier par aire
        external_contours = sorted(external_contours, key=cv2.contourArea, reverse=True)[:5]
        
        for contour in external_contours:
            area = cv2.contourArea(contour)
            min_area = img.shape[0] * img.shape[1] * self.min_area_ratio
            
            if area < min_area:
                continue
            
            peri = cv2.arcLength(contour, True)
            for eps in [0.02, 0.03, 0.04]:
                approx = cv2.approxPolyDP(contour, eps * peri, True)
                
                if len(approx) == 4 and cv2.isContourConvex(approx):
                    corners = approx.reshape(4, 2) / ratio
                    corners = self._order_points(corners)
                    
                    return DetectionResult(
                        corners=corners,
                        confidence=0.8,
                        method="hierarchy",
                        contour_area=area
                    )
        
        return None
    
    def _find_largest_quad(self, binary: np.ndarray, ratio: float, shape: Tuple[int, int]) -> Optional[np.ndarray]:
        """Trouve le plus grand quadrilatère dans une image binaire"""
        
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return None
        
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]
        min_area = shape[0] * shape[1] * self.min_area_ratio
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < min_area:
                continue
            
            peri = cv2.arcLength(contour, True)
            
            # Essayer plusieurs précisions
            for epsilon_factor in [0.015, 0.02, 0.025, 0.03, 0.04, 0.05]:
                approx = cv2.approxPolyDP(contour, epsilon_factor * peri, True)
                
                if len(approx) == 4:
                    if cv2.isContourConvex(approx):
                        corners = approx.reshape(4, 2) / ratio
                        
                        # Vérifier que c'est un quadrilatère valide
                        if self._is_valid_quad(corners):
                            return self._order_points(corners)
        
        return None
    
    def _is_valid_quad(self, corners: np.ndarray) -> bool:
        """Vérifie qu'un quadrilatère est valide"""
        
        if len(corners) != 4:
            return False
        
        # Vérifier les angles (pas trop déformé)
        angles = []
        for i in range(4):
            p1 = corners[i]
            p2 = corners[(i + 1) % 4]
            p3 = corners[(i + 2) % 4]
            
            v1 = p1 - p2
            v2 = p3 - p2
            
            angle = np.arccos(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6))
            angles.append(np.degrees(angle))
        
        # Tous les angles doivent être entre 30° et 150°
        return all(30 < angle < 150 for angle in angles)
    
    def _order_points(self, pts: np.ndarray) -> np.ndarray:
        """Ordonne les points: TL, TR, BR, BL"""
        
        rect = np.zeros((4, 2), dtype=np.float32)
        
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]  # TL
        rect[2] = pts[np.argmax(s)]  # BR
        
        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]  # TR
        rect[3] = pts[np.argmax(diff)]  # BL
        
        return rect
    
    def _score_detection(self, result: DetectionResult, img_size: Tuple[int, int]) -> float:
        """Score combiné pour choisir la meilleure détection"""
        
        img_area = img_size[0] * img_size[1]
        area_ratio = result.contour_area / img_area
        
        # Score basé sur:
        # - Confiance de la méthode
        # - Ratio d'occupation (optimal: 0.4-0.9)
        # - Rectangularité
        
        # Ratio optimal
        if 0.4 <= area_ratio <= 0.9:
            area_score = 1.0
        elif 0.2 <= area_ratio < 0.4:
            area_score = 0.7
        elif 0.9 < area_ratio <= 0.98:
            area_score = 0.8
        else:
            area_score = 0.3
        
        # Rectangularité
        rect = cv2.minAreaRect(result.corners.astype(np.float32))
        rect_area = rect[1][0] * rect[1][1]
        rectangularity = result.contour_area / (rect_area + 1e-6)
        
        # Score final
        score = (
            result.confidence * 0.4 +
            area_score * 0.4 +
            rectangularity * 0.2
        )
        
        return score
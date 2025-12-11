"""
processor/scanner.py
Moteur de scanning professionnel - Qualité CamScanner / Adobe Scan
Compatible avec opencv-python==4.7.0.72
"""

import cv2
import numpy as np
from typing import Optional, Tuple, List
from dataclasses import dataclass
from enum import Enum


class ScanMode(Enum):
    AUTO = "auto"
    DOCUMENT = "document"
    WHITEBOARD = "whiteboard"
    RECEIPT = "receipt"
    DIAGRAM = "diagram"
    CLARITY = "clarity"  # 🆕 Clarté maximale pour caméras faibles


@dataclass
class ScanResult:
    """Résultat du scanning"""
    success: bool
    processed_image: bytes
    confidence: float = 0.0
    corners: Optional[np.ndarray] = None
    original_size: Optional[Tuple[int, int]] = None
    scanned_size: Optional[Tuple[int, int]] = None
    error: Optional[str] = None


def scan_document(
    image_bytes: bytes,
    mode: ScanMode = ScanMode.AUTO,
    enhance: bool = True,
    output_format: str = "jpeg"
) -> ScanResult:
    """
    Pipeline de scanning professionnel
    
    1. Détection du quadrilatère (document)
    2. Correction perspective
    3. Amélioration d'image (optionnel)
    4. Export haute qualité
    """
    
    try:
        # Décodage
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None or img.size == 0:
            return ScanResult(
                success=False,
                processed_image=image_bytes,
                error="Image invalide ou vide"
            )
        
        original_h, original_w = img.shape[:2]
        original_size = (original_w, original_h)
        
        # Détection des coins du document
        corners = detect_document_corners(img)
        
        if corners is not None:
            # Document détecté → correction perspective
            try:
                warped = four_point_transform(img, corners)
                confidence = calculate_confidence(corners, original_size)
            except Exception as e:
                # Si transform échoue, utiliser l'original
                print(f"Perspective transform failed: {e}")
                warped = img.copy()
                confidence = 0.3
                corners = None
        else:
            # Pas de document → utiliser l'image originale
            warped = img.copy()
            confidence = 0.3
        
        # Vérifier que warped n'est pas vide
        if warped is None or warped.size == 0:
            warped = img.copy()
        
        # Amélioration selon le mode
        if enhance:
            try:
                if mode == ScanMode.DIAGRAM:
                    enhanced = enhance_diagram(warped)
                elif mode == ScanMode.WHITEBOARD:
                    enhanced = enhance_whiteboard(warped)
                elif mode == ScanMode.RECEIPT:
                    enhanced = enhance_receipt(warped)
                elif mode == ScanMode.DOCUMENT:
                    enhanced = enhance_document(warped)
                else:  # AUTO
                    enhanced = enhance_auto(warped)
                
                # Vérifier que enhanced n'est pas vide
                if enhanced is None or enhanced.size == 0:
                    enhanced = warped
            except Exception as e:
                print(f"Enhancement failed: {e}")
                enhanced = warped
        else:
            enhanced = warped
        
        scanned_h, scanned_w = enhanced.shape[:2] if len(enhanced.shape) == 2 else enhanced.shape[:2]
        
        # Encodage avec vérification
        try:
            if output_format == "png":
                encode_params = [int(cv2.IMWRITE_PNG_COMPRESSION), 3]
                success, buffer = cv2.imencode('.png', enhanced, encode_params)
            else:
                encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), 95]
                success, buffer = cv2.imencode('.jpg', enhanced, encode_params)
            
            if not success or buffer is None or len(buffer) == 0:
                # Fallback: encoder l'image originale
                success, buffer = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        except Exception as e:
            print(f"Encoding failed: {e}")
            # Dernière tentative avec l'original
            success, buffer = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        
        if not success or buffer is None:
            return ScanResult(success=False, processed_image=image_bytes, error="Encodage impossible")
        
        return ScanResult(
            success=corners is not None,
            processed_image=buffer.tobytes(),
            confidence=confidence,
            corners=corners,
            original_size=original_size,
            scanned_size=(scanned_w, scanned_h)
        )
        
    except Exception as e:
        print(f"Scan document error: {e}")
        return ScanResult(success=False, processed_image=image_bytes, error=str(e))


def detect_document_corners(img: np.ndarray) -> Optional[np.ndarray]:
    """
    Détection robuste des 4 coins du document
    Version améliorée avec seuils plus permissifs
    """
    
    # Resize pour traitement rapide
    max_dim = 1000  # Augmenté pour meilleure précision
    h, w = img.shape[:2]
    ratio = min(max_dim / w, max_dim / h, 1.0)
    
    if ratio < 1.0:
        resized = cv2.resize(img, None, fx=ratio, fy=ratio, interpolation=cv2.INTER_AREA)
    else:
        resized = img.copy()
        ratio = 1.0
    
    # Conversion grayscale
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    
    # Méthode 1: Canny classique
    corners1 = detect_with_canny(gray, ratio)
    
    # Méthode 2: Adaptive threshold
    corners2 = detect_with_adaptive(gray, ratio)
    
    # Méthode 3: Morphologie
    corners3 = detect_with_morphology(gray, ratio)
    
    # Sélectionner le meilleur résultat
    candidates = [c for c in [corners1, corners2, corners3] if c is not None]
    
    if not candidates:
        return None
    
    # Choisir celui avec la plus grande aire
    best = max(candidates, key=lambda c: cv2.contourArea(c))
    
    # Vérifier que c'est bien un rectangle (pas trop déformé)
    area = cv2.contourArea(best)
    rect = cv2.minAreaRect(best)
    rect_area = rect[1][0] * rect[1][1]
    rectangularity = area / (rect_area + 1e-6)
    
    # Si trop déformé, rejeter
    if rectangularity < 0.75:
        return None
    
    return best


def detect_with_canny(gray: np.ndarray, ratio: float) -> Optional[np.ndarray]:
    """Détection via Canny edge detection"""
    
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Auto-threshold basé sur médiane
    median = np.median(blurred)
    low = int(max(0, 0.5 * median))
    high = int(min(255, 1.5 * median))
    
    edges = cv2.Canny(blurred, low, high)
    
    # Dilatation pour connecter les contours
    kernel = np.ones((3, 3), np.uint8)
    dilated = cv2.dilate(edges, kernel, iterations=2)
    
    return find_largest_quad(dilated, ratio, gray.shape)


def detect_with_adaptive(gray: np.ndarray, ratio: float) -> Optional[np.ndarray]:
    """Détection via seuillage adaptatif"""
    
    blurred = cv2.GaussianBlur(gray, (11, 11), 0)
    thresh = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        11, 2
    )
    
    kernel = np.ones((5, 5), np.uint8)
    morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    
    return find_largest_quad(morph, ratio, gray.shape)


def detect_with_morphology(gray: np.ndarray, ratio: float) -> Optional[np.ndarray]:
    """Détection via opérations morphologiques"""
    
    blurred = cv2.bilateralFilter(gray, 9, 75, 75)
    
    # Gradient morphologique
    kernel = np.ones((5, 5), np.uint8)
    gradient = cv2.morphologyEx(blurred, cv2.MORPH_GRADIENT, kernel)
    
    _, thresh = cv2.threshold(gradient, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # Fermeture pour connecter
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)
    
    return find_largest_quad(closed, ratio, gray.shape)


def find_largest_quad(binary: np.ndarray, ratio: float, shape: Tuple) -> Optional[np.ndarray]:
    """Trouve le plus grand quadrilatère dans une image binaire"""
    
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return None
    
    # Trier par aire
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]
    
    min_area = shape[0] * shape[1] * 0.05  # Réduit à 5% (était 10%)
    
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue
        
        peri = cv2.arcLength(contour, True)
        
        # Essayer plusieurs précisions d'approximation
        for epsilon_factor in [0.02, 0.03, 0.04, 0.05]:
            approx = cv2.approxPolyDP(contour, epsilon_factor * peri, True)
            
            if len(approx) == 4:
                # Vérifier la convexité
                if cv2.isContourConvex(approx):
                    # Retour aux coordonnées originales
                    corners = approx.reshape(4, 2) / ratio
                    return order_points(corners)
    
    return None


def order_points(pts: np.ndarray) -> np.ndarray:
    """Ordonne les points: TL, TR, BR, BL"""
    
    rect = np.zeros((4, 2), dtype=np.float32)
    
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # TL
    rect[2] = pts[np.argmax(s)]  # BR
    
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # TR
    rect[3] = pts[np.argmax(diff)]  # BL
    
    return rect


def four_point_transform(img: np.ndarray, pts: np.ndarray) -> np.ndarray:
    """Transformation perspective 4 points"""
    
    rect = order_points(pts)
    (tl, tr, br, bl) = rect
    
    # Dimensions cibles
    widthA = np.linalg.norm(br - bl)
    widthB = np.linalg.norm(tr - tl)
    maxWidth = max(int(widthA), int(widthB))
    
    heightA = np.linalg.norm(tr - br)
    heightB = np.linalg.norm(tl - bl)
    maxHeight = max(int(heightA), int(heightB))
    
    # Points destination
    dst = np.array([
        [0, 0],
        [maxWidth - 1, 0],
        [maxWidth - 1, maxHeight - 1],
        [0, maxHeight - 1]
    ], dtype=np.float32)
    
    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(img, M, (maxWidth, maxHeight))
    
    return warped


def enhance_diagram(img: np.ndarray) -> np.ndarray:
    """
    Amélioration DOUCE pour diagrammes/workflows BPMN
    Objectif: Garder tous les détails, juste améliorer la lisibilité
    """
    
    try:
        # Convertir en grayscale si besoin
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img.copy()
        
        # 1. Correction de luminosité douce
        mean_brightness = np.mean(gray)
        if mean_brightness < 100:
            # Image trop sombre, éclaircir légèrement
            gray = cv2.convertScaleAbs(gray, alpha=1.2, beta=20)
        elif mean_brightness > 200:
            # Image trop claire, assombrir légèrement
            gray = cv2.convertScaleAbs(gray, alpha=0.9, beta=-10)
        
        # 2. CLAHE LÉGER (clipLimit faible pour pas trop de contraste)
        clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # 3. Débruitage TRÈS léger (préserver les détails)
        denoised = cv2.fastNlMeansDenoising(enhanced, h=5, templateWindowSize=7, searchWindowSize=21)
        
        # 4. Sharpening DOUX pour les lignes
        kernel = np.array([
            [0, -0.5, 0],
            [-0.5, 3, -0.5],
            [0, -0.5, 0]
        ], dtype=np.float32)
        sharpened = cv2.filter2D(denoised, -1, kernel)
        
        # 5. Normalisation finale douce (stretcher légèrement le contraste)
        normalized = cv2.normalize(sharpened, None, alpha=10, beta=245, norm_type=cv2.NORM_MINMAX)
        
        return normalized
        
    except Exception as e:
        print(f"enhance_diagram error: {e}")
        # Fallback minimal: juste un CLAHE léger
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img.copy()
        clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
        return clahe.apply(gray)


def enhance_auto(img: np.ndarray) -> np.ndarray:
    """Amélioration automatique basée sur le contenu"""
    
    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        
        # Analyse de l'histogramme
        hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
        dark_ratio = np.sum(hist[:128]) / (np.sum(hist) + 1e-6)
        
        if dark_ratio > 0.7:
            return enhance_whiteboard(img)
        else:
            return enhance_document(img)
    except:
        # Fallback: retourner l'image sans modification
        return img


def enhance_document(img: np.ndarray) -> np.ndarray:
    """Amélioration pour documents texte (contrats, factures)"""
    
    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        
        # CLAHE pour contraste local
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # Vérifier si l'image n'est pas trop sombre
        mean_val = np.mean(enhanced)
        if mean_val < 50:
            # Image trop sombre, augmenter la luminosité
            enhanced = cv2.convertScaleAbs(enhanced, alpha=1.5, beta=30)
        
        # Seuillage adaptatif
        thresh = cv2.adaptiveThreshold(
            enhanced, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            21, 10
        )
        
        # Vérifier que thresh n'est pas complètement noir
        if np.mean(thresh) < 10:
            # Fallback: utiliser enhanced au lieu de thresh
            return enhanced
        
        # Sharpening léger
        kernel = np.array([[-0.5, -0.5, -0.5],
                           [-0.5,  5.0, -0.5],
                           [-0.5, -0.5, -0.5]])
        sharpened = cv2.filter2D(thresh, -1, kernel)
        
        # Denoising
        denoised = cv2.fastNlMeansDenoising(sharpened, h=7)
        
        return denoised
    except Exception as e:
        print(f"enhance_document error: {e}")
        return img


def enhance_whiteboard(img: np.ndarray) -> np.ndarray:
    """Amélioration pour tableaux blancs / papier"""
    
    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        
        # CLAHE simple sans division morphologique (plus robuste)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # Seuillage Otsu
        _, thresh = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Vérifier le résultat
        if np.mean(thresh) < 10:
            return enhanced
        
        return thresh
    except Exception as e:
        print(f"enhance_whiteboard error: {e}")
        return img


def enhance_receipt(img: np.ndarray) -> np.ndarray:
    """Amélioration pour tickets/reçus (papier thermique)"""
    
    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        
        # Bilateral filter pour lisser en gardant les bords
        filtered = cv2.bilateralFilter(gray, 9, 75, 75)
        
        # CLAHE fort pour tickets décolorés
        clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(4, 4))
        enhanced = clahe.apply(filtered)
        
        # Seuillage adaptatif avec petit bloc
        thresh = cv2.adaptiveThreshold(
            enhanced, 255,
            cv2.ADAPTIVE_THRESH_MEAN_C,
            cv2.THRESH_BINARY,
            15, 8
        )
        
        # Vérifier
        if np.mean(thresh) < 10:
            return enhanced
        
        # Morphologie pour nettoyer
        kernel = np.ones((2, 2), np.uint8)
        cleaned = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        
        return cleaned
    except Exception as e:
        print(f"enhance_receipt error: {e}")
        return img


def calculate_confidence(corners: Optional[np.ndarray], img_size: Tuple[int, int]) -> float:
    """Calcule un score de confiance"""
    
    if corners is None:
        return 0.0
    
    area = cv2.contourArea(corners)
    img_area = img_size[0] * img_size[1]
    ratio = area / img_area
    
    # Vérifier la forme (doit être quasi-rectangulaire)
    rect = cv2.minAreaRect(corners)
    rect_area = rect[1][0] * rect[1][1]
    rectangularity = area / (rect_area + 1e-6)
    
    # Score combiné
    if 0.3 <= ratio <= 0.95 and rectangularity > 0.8:
        return min(0.95, ratio + rectangularity * 0.2)
    elif 0.15 <= ratio < 0.3:
        return 0.6
    else:
        return 0.4
"""
processor/enhancer.py
Amélioration d'image adaptative pour différents types de contenu
"""

import cv2
import numpy as np
from enum import Enum


class EnhanceMode(Enum):
    DIAGRAM = "diagram"
    DOCUMENT = "document"
    WHITEBOARD = "whiteboard"
    RECEIPT = "receipt"
    CLARITY = "clarity"  # 🆕 Clarté maximale
    AUTO = "auto"


class ImageEnhancer:
    """Amélioration adaptative d'images scannées"""
    
    @staticmethod
    def enhance(img: np.ndarray, mode: EnhanceMode) -> np.ndarray:
        """
        Améliore l'image selon le mode
        
        Args:
            img: Image BGR ou grayscale
            mode: Mode d'amélioration
            
        Returns:
            Image améliorée (grayscale)
        """
        
        # Conversion grayscale si nécessaire
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img.copy()
        
        # Analyse de l'image pour AUTO
        if mode == EnhanceMode.AUTO:
            mode = ImageEnhancer._detect_mode(gray)
            print(f"Auto-detected mode: {mode.value}")
        
        # Dispatch vers la bonne méthode
        if mode == EnhanceMode.CLARITY:
            return ImageEnhancer._enhance_clarity(gray)
        elif mode == EnhanceMode.DIAGRAM:
            return ImageEnhancer._enhance_diagram(gray)
        elif mode == EnhanceMode.DOCUMENT:
            return ImageEnhancer._enhance_document(gray)
        elif mode == EnhanceMode.WHITEBOARD:
            return ImageEnhancer._enhance_whiteboard(gray)
        elif mode == EnhanceMode.RECEIPT:
            return ImageEnhancer._enhance_receipt(gray)
        else:
            return ImageEnhancer._enhance_clarity(gray)
    
    @staticmethod
    def _detect_mode(gray: np.ndarray) -> EnhanceMode:
        """Détecte automatiquement le meilleur mode"""
        
        # Analyse de l'histogramme
        hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
        
        # Calcul de statistiques
        mean_brightness = np.mean(gray)
        std_dev = np.std(gray)
        dark_ratio = np.sum(hist[:100]) / np.sum(hist)
        
        # Heuristiques
        if std_dev < 30:
            # Faible variance = document uniforme
            return EnhanceMode.DOCUMENT
        elif dark_ratio > 0.6:
            # Beaucoup de pixels sombres = whiteboard
            return EnhanceMode.WHITEBOARD
        elif mean_brightness < 100:
            # Sombre = receipt décoloré
            return EnhanceMode.RECEIPT
        else:
            # Par défaut = diagram
            return EnhanceMode.DIAGRAM
    
    @staticmethod
    def _enhance_clarity(gray: np.ndarray) -> np.ndarray:
        """
        Amélioration MAXIMALE pour caméras faibles
        Objectif: rendre visible même avec mauvaise caméra
        """
        
        print("[Enhancer] Mode CLARITY - Amélioration maximale")
        
        # 1. Correction gamma FORTE (éclaircir beaucoup)
        mean_val = np.mean(gray)
        if mean_val < 120:
            gamma = 1.8  # Très sombre → éclaircir beaucoup
        elif mean_val < 150:
            gamma = 1.4
        else:
            gamma = 1.2
        
        inv_gamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype(np.uint8)
        gamma_corrected = cv2.LUT(gray, table)
        
        # 2. Auto brightness/contrast AGRESSIF
        brightened = ImageEnhancer.auto_brightness_contrast(gamma_corrected, clip_percent=2.5)
        
        # 3. CLAHE FORT
        clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(6, 6))
        enhanced = clahe.apply(brightened)
        
        # 4. Augmenter le contraste manuellement
        enhanced = cv2.convertScaleAbs(enhanced, alpha=1.4, beta=10)
        
        # 5. Sharpening AGRESSIF pour rendre net
        kernel = np.array([
            [-1, -1, -1],
            [-1,  10, -1],
            [-1, -1, -1]
        ], dtype=np.float32)
        sharpened = cv2.filter2D(enhanced, -1, kernel)
        
        # 6. Denoising léger (pour éviter trop de grain)
        denoised = cv2.fastNlMeansDenoising(sharpened, h=8, templateWindowSize=7, searchWindowSize=21)
        
        # 7. Normalisation FORTE (étendre l'histogramme au max)
        normalized = cv2.normalize(denoised, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)
        
        # 8. Un dernier coup de contraste
        final = cv2.convertScaleAbs(normalized, alpha=1.2, beta=5)
        
        print(f"[Enhancer] CLARITY: brightness {mean_val:.0f} → {np.mean(final):.0f}")
        
        return final
    
    @staticmethod
    def _enhance_diagram(gray: np.ndarray) -> np.ndarray:
        """
        Amélioration DOUCE pour diagrammes
        Objectif: préserver détails + améliorer lisibilité
        """
        
        # 1. Correction gamma adaptative
        mean_val = np.mean(gray)
        if mean_val < 100:
            gamma = 1.3  # Éclaircir
        elif mean_val > 180:
            gamma = 0.8  # Assombrir
        else:
            gamma = 1.0
        
        if gamma != 1.0:
            inv_gamma = 1.0 / gamma
            table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype(np.uint8)
            gray = cv2.LUT(gray, table)
        
        # 2. Correction de contraste douce
        gray = cv2.convertScaleAbs(gray, alpha=1.1, beta=5)
        
        # 3. CLAHE très léger
        clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # 4. Débruitage ultra-léger
        denoised = cv2.fastNlMeansDenoising(enhanced, h=3, templateWindowSize=7, searchWindowSize=21)
        
        # 5. Sharpening doux pour les lignes
        kernel = np.array([
            [0, -0.3, 0],
            [-0.3, 2.2, -0.3],
            [0, -0.3, 0]
        ], dtype=np.float32)
        sharpened = cv2.filter2D(denoised, -1, kernel)
        
        # 6. Normalisation douce (étendre légèrement l'histogramme)
        normalized = cv2.normalize(sharpened, None, alpha=5, beta=250, norm_type=cv2.NORM_MINMAX)
        
        return normalized
    
    @staticmethod
    def _enhance_document(gray: np.ndarray) -> np.ndarray:
        """
        Amélioration FORTE pour documents texte
        Objectif: noir/blanc pur pour texte
        """
        
        # 1. CLAHE moyen
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # 2. Correction de luminosité
        mean_val = np.mean(enhanced)
        if mean_val < 100:
            enhanced = cv2.convertScaleAbs(enhanced, alpha=1.4, beta=30)
        
        # 3. Adaptive threshold
        binary = cv2.adaptiveThreshold(
            enhanced, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            21, 10
        )
        
        # 4. Sharpening modéré
        kernel = np.array([
            [-0.5, -0.5, -0.5],
            [-0.5,  5.0, -0.5],
            [-0.5, -0.5, -0.5]
        ])
        sharpened = cv2.filter2D(binary, -1, kernel)
        
        # 5. Denoising
        denoised = cv2.fastNlMeansDenoising(sharpened, h=7)
        
        return denoised
    
    @staticmethod
    def _enhance_whiteboard(gray: np.ndarray) -> np.ndarray:
        """
        Amélioration pour tableaux blancs
        Objectif: supprimer fond + garder écriture
        """
        
        # 1. Suppression du fond par morphologie
        # (ne marche que si fond uniforme)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
        bg = cv2.morphologyEx(gray, cv2.MORPH_DILATE, kernel)
        
        # Division pour normaliser
        divided = cv2.divide(gray, bg, scale=255)
        
        # 2. CLAHE
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(divided)
        
        # 3. Otsu thresholding
        _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # 4. Nettoyage morphologique léger
        kernel_clean = np.ones((2, 2), np.uint8)
        cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_clean)
        
        return cleaned
    
    @staticmethod
    def _enhance_receipt(gray: np.ndarray) -> np.ndarray:
        """
        Amélioration pour tickets/reçus thermiques
        Objectif: récupérer texte décoloré
        """
        
        # 1. Bilateral filter (lisse tout en gardant bords)
        filtered = cv2.bilateralFilter(gray, 9, 75, 75)
        
        # 2. CLAHE fort
        clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(4, 4))
        enhanced = clahe.apply(filtered)
        
        # 3. Correction gamma pour éclaircir
        inv_gamma = 1.0 / 0.7
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype(np.uint8)
        gamma_corrected = cv2.LUT(enhanced, table)
        
        # 4. Adaptive threshold avec petit bloc
        binary = cv2.adaptiveThreshold(
            gamma_corrected, 255,
            cv2.ADAPTIVE_THRESH_MEAN_C,
            cv2.THRESH_BINARY,
            15, 8
        )
        
        # 5. Morphologie pour relier caractères
        kernel = np.ones((2, 2), np.uint8)
        cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        
        return cleaned
    
    @staticmethod
    def auto_brightness_contrast(img: np.ndarray, clip_percent: float = 1.0) -> np.ndarray:
        """
        Correction automatique de luminosité et contraste
        
        Args:
            img: Image grayscale
            clip_percent: % de pixels à clipper aux extrêmes
            
        Returns:
            Image corrigée
        """
        
        # Calcul des histogrammes
        hist = cv2.calcHist([img], [0], None, [256], [0, 256])
        hist_size = len(hist)
        
        # Calcul des percentiles
        accumulator = np.cumsum(hist)
        maximum = accumulator[-1]
        
        clip_hist_percent = (clip_percent * maximum / 100.0)
        clip_hist_percent /= 2.0
        
        # Trouver les seuils min/max
        minimum_gray = 0
        while accumulator[minimum_gray] < clip_hist_percent:
            minimum_gray += 1
        
        maximum_gray = hist_size - 1
        while accumulator[maximum_gray] >= (maximum - clip_hist_percent):
            maximum_gray -= 1
        
        # Calcul alpha et beta
        alpha = 255.0 / (maximum_gray - minimum_gray)
        beta = -minimum_gray * alpha
        
        # Application
        auto_result = cv2.convertScaleAbs(img, alpha=alpha, beta=beta)
        
        return auto_result
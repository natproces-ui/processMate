"""
Modèles de données pour la découverte et génération de processus
"""

from pydantic import BaseModel
from typing import List, Optional
from enum import Enum


class SourceType(str, Enum):
    PDF = "pdf"
    IMAGE = "image"


class SourceReference(BaseModel):
    """Référence à un fichier source"""
    file_id: str          # ID temporaire attribué à l'upload
    filename: str
    source_type: SourceType
    page_hint: Optional[str] = None   # ex: "pages 3-7" si détecté


class ProcessCategory(str, Enum):
    INSTRUCTED = "instructed"   # mentionné dans les instructions utilisateur
    DISCOVERED = "discovered"   # détecté automatiquement par l'agent


class ProcessCard(BaseModel):
    """Carte représentant un processus découvert"""
    process_id: str                        # UUID généré côté backend
    title: str                             # Titre du processus
    description: str                       # Brève description (2-3 phrases)
    sources: List[SourceReference]         # Fichier(s) source(s) concernés
    confidence: int                        # 0-100
    estimated_steps: Optional[int] = None  # Estimation du nb d'étapes
    category: ProcessCategory = ProcessCategory.DISCOVERED  # origine de la carte


class DiscoveryResult(BaseModel):
    """Résultat complet de la phase de découverte"""
    session_id: str                  # ID de session pour retrouver les fichiers
    processes: List[ProcessCard]     # Cartes de processus détectés
    total_files_analyzed: int
    warnings: List[str] = []


class GenerationRequest(BaseModel):
    """Requête de génération pour un processus sélectionné"""
    session_id: str
    process_id: str


class GenerationResult(BaseModel):
    """Résultat de la génération BPMN complète"""
    success: bool
    process_id: str
    title: str
    workflow: List[dict]        # Table1Row[]
    enrichments: dict           # enrichments_dict
    metadata: dict
    warnings: List[str] = []
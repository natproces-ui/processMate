from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


# ============================================================================
# SOUS-MODÈLES
# ============================================================================

class ActeurSFD(BaseModel):
    nom: str
    role: str
    droits: List[str] = []


class ModuleSFD(BaseModel):
    nom: str
    description: str
    fonctionnalites: List[str] = []
    source_inspiration: Optional[str] = None


class SerieStatistique(BaseModel):
    categorie: str
    description: str
    format_echange: Optional[str] = "SDMX"
    frequence_mise_a_jour: Optional[str] = "Mensuelle"


class CasUtilisation(BaseModel):
    identifiant: str
    titre: str
    acteur: str
    description: str
    preconditions: List[str] = []
    etapes: List[str] = []
    postconditions: List[str] = []


class ApiEndpoint(BaseModel):
    methode: str
    chemin: str
    description: str
    parametres: List[str] = []


class ExigenceNonFonctionnelle(BaseModel):
    categorie: str
    description: str
    critere_acceptance: Optional[str] = None


class WebsiteAnalysis(BaseModel):
    url_analysee: str
    titre_site: Optional[str] = None
    fonctionnalites_identifiees: List[str] = []
    themes_couverts: List[str] = []
    structure_navigation: List[str] = []
    technologies_detectees: List[str] = []
    recommandations: List[str] = []
    pages_visitees: List[str] = []
    actions_effectuees: int = 0


# ============================================================================
# MODÈLE PRINCIPAL SFD
# ============================================================================

class SFD(BaseModel):
    nom_projet: str
    nom_cible: str
    version: str = "1.0"
    date_creation: str
    auteur: str = "SFD Generator AI"
    statut: str = "Draft"

    # Contexte
    contexte_projet: str
    objectifs: List[str] = []
    perimetre: str
    public_cible: List[str] = []

    # Analyse du site de référence (Webstat ou autre URL scrapée)
    analyse_site_reference: Optional[WebsiteAnalysis] = None

    # Contenu fonctionnel
    acteurs: List[ActeurSFD] = []
    modules: List[ModuleSFD] = []
    series_statistiques: List[SerieStatistique] = []
    cas_utilisation: List[CasUtilisation] = []
    api_endpoints: List[ApiEndpoint] = []
    exigences_non_fonctionnelles: List[ExigenceNonFonctionnelle] = []

    # Architecture
    architecture_technique: Optional[str] = None
    contraintes: List[str] = []
    glossaire: Dict[str, str] = {}


# ============================================================================
# RÉPONSES API
# ============================================================================

class SFDGenerationResponse(BaseModel):
    success: bool
    message: str
    filename: str
    download_url: str
    sfd_data: SFD
    website_exploration_summary: Optional[str] = None


class ExplorationStatus(BaseModel):
    url: str
    steps_completed: int
    pages_visited: List[str]
    status: str
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict


# ============================================================================
# SCHEMAS INTERNES
# ============================================================================

class ModuleFonctionnel(BaseModel):
    """Un module fonctionnel du portail statistique"""
    nom: str = Field(..., description="Nom du module")
    description: str = Field(..., description="Description fonctionnelle")
    fonctionnalites: List[str] = Field(default=[], description="Liste des fonctionnalités")
    source_inspiration: Optional[str] = Field(None, description="Module Webstat dont il s'inspire")


class SerieStatistique(BaseModel):
    """Série ou catégorie de données statistiques"""
    categorie: str = Field(..., description="Catégorie (ex: Taux, Crédit, Monnaie...)")
    description: str = Field(..., description="Description de la donnée")
    format_echange: Optional[str] = Field(None, description="Format : SDMX, CSV, JSON...")
    frequence_mise_a_jour: Optional[str] = Field(None, description="Journalière, mensuelle...")


class EndpointAPI(BaseModel):
    """Endpoint de l'API du portail"""
    methode: str = Field(..., description="GET / POST / PUT / DELETE")
    chemin: str = Field(..., description="Chemin de l'endpoint ex: /api/series/{id}")
    description: str = Field(..., description="Description fonctionnelle")
    parametres: Optional[List[str]] = Field(default=[], description="Paramètres attendus")


class ExigenceNonFonctionnelle(BaseModel):
    """Exigence non fonctionnelle"""
    categorie: str = Field(..., description="Performance, Sécurité, Disponibilité...")
    description: str = Field(..., description="Description de l'exigence")
    critere_acceptance: Optional[str] = Field(None, description="Critère mesurable")


class ActeurSysteme(BaseModel):
    """Acteur interagissant avec le système"""
    nom: str = Field(..., description="Nom de l'acteur")
    role: str = Field(..., description="Rôle dans le système")
    droits: List[str] = Field(default=[], description="Droits et permissions")


class CasUtilisation(BaseModel):
    """Cas d'utilisation principal"""
    identifiant: str = Field(..., description="Ex: UC-001")
    titre: str = Field(..., description="Titre court")
    acteur: str = Field(..., description="Acteur principal")
    description: str = Field(..., description="Description du cas d'utilisation")
    preconditions: Optional[List[str]] = Field(default=[])
    etapes: Optional[List[str]] = Field(default=[], description="Étapes principales")
    postconditions: Optional[List[str]] = Field(default=[])


class ContexteWebstat(BaseModel):
    """Informations extraites de Webstat pour contextualiser le SFD"""
    fonctionnalites_identifiees: List[str] = Field(
        default=[],
        description="Fonctionnalités identifiées sur Webstat lors du scraping"
    )
    themes_couverts: List[str] = Field(
        default=[],
        description="Thématiques statistiques couvertes sur Webstat"
    )
    format_standard: str = Field(
        default="SDMX",
        description="Format standard utilisé (SDMX par défaut)"
    )
    recommandations: List[str] = Field(
        default=[],
        description="Recommandations basées sur l'analyse de Webstat"
    )


# ============================================================================
# SCHEMA PRINCIPAL
# ============================================================================

class BankSFD(BaseModel):
    """
    SFD (Spécification Fonctionnelle Détaillée) pour un portail statistique bancaire
    inspiré de Webstat - Banque de France
    """

    # --- Identification ---
    nom_projet: str = Field(..., description="Nom du portail statistique")
    nom_banque: str = Field(..., description="Nom de la banque commanditaire")
    version: str = Field(default="1.0", description="Version du SFD")
    date_creation: str = Field(..., description="Date de création du document")
    auteur: Optional[str] = Field(None, description="Auteur du SFD")
    statut: str = Field(default="Draft", description="Draft / Validé / En révision")

    # --- Contexte ---
    contexte_projet: str = Field(..., description="Contexte général du projet")
    objectifs: List[str] = Field(..., description="Objectifs principaux du portail")
    perimetre: str = Field(..., description="Périmètre fonctionnel couvert")
    public_cible: List[str] = Field(default=[], description="Public cible du portail")

    # --- Analyse Webstat ---
    contexte_webstat: ContexteWebstat = Field(
        ...,
        description="Analyse et inspiration tirée de Webstat"
    )

    # --- Acteurs ---
    acteurs: List[ActeurSysteme] = Field(
        default=[],
        description="Acteurs du système"
    )

    # --- Modules fonctionnels ---
    modules: List[ModuleFonctionnel] = Field(
        ...,
        description="Modules fonctionnels du portail"
    )

    # --- Données statistiques ---
    series_statistiques: List[SerieStatistique] = Field(
        default=[],
        description="Catégories de séries statistiques à intégrer"
    )

    # --- Cas d'utilisation ---
    cas_utilisation: List[CasUtilisation] = Field(
        default=[],
        description="Cas d'utilisation principaux"
    )

    # --- API ---
    api_endpoints: List[EndpointAPI] = Field(
        default=[],
        description="Endpoints de l'API publique du portail"
    )

    # --- Exigences non fonctionnelles ---
    exigences_non_fonctionnelles: List[ExigenceNonFonctionnelle] = Field(
        default=[],
        description="Exigences de performance, sécurité, accessibilité..."
    )

    # --- Architecture technique ---
    architecture_technique: Optional[str] = Field(
        None,
        description="Description de l'architecture technique recommandée"
    )

    # --- Contraintes ---
    contraintes: Optional[List[str]] = Field(
        default=[],
        description="Contraintes techniques, légales ou organisationnelles"
    )

    # --- Glossaire ---
    glossaire: Optional[Dict[str, str]] = Field(
        default={},
        description="Termes métier et définitions"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "nom_projet": "StatPortail BNK",
                "nom_banque": "Banque Nationale XYZ",
                "version": "1.0",
                "date_creation": "2026-02-20",
                "statut": "Draft",
                "contexte_projet": "Création d'un portail statistique public...",
                "objectifs": ["Diffuser les données économiques", "Fournir une API publique"],
                "perimetre": "Portail web statistique avec API et visualisations",
                "public_cible": ["Chercheurs", "Institutions financières", "Grand public"]
            }
        }


# ============================================================================
# SCHEMAS DE REPONSE
# ============================================================================

class BankSFDGenerationResponse(BaseModel):
    """Réponse après génération du SFD Bank"""
    success: bool
    message: str
    filename: Optional[str] = Field(None, description="Nom du fichier Word généré")
    download_url: Optional[str] = Field(None, description="URL pour télécharger le Word")
    sfd_data: Optional[BankSFD] = Field(None, description="Données SFD générées")

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "message": "SFD généré avec succès",
                "filename": "SFD_BankPortail_20260220.docx",
                "download_url": "/api/bank-sfd/download/SFD_BankPortail_20260220.docx"
            }
        }
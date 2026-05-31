from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class FonctionDetail(BaseModel):
    """Détail d'une fonction"""
    id: str = Field(..., description="Identifiant unique (ex: F001)")
    nom: str = Field(..., description="Nom de la fonction")
    description: str = Field(..., description="Description détaillée")
    regles_metier: List[str] = Field(default_factory=list, description="Liste des règles métier")
    donnees_entree: List[str] = Field(default_factory=list, description="Données en entrée")
    donnees_sortie: List[str] = Field(default_factory=list, description="Données en sortie")
    cas_nominal: str = Field(default="", description="Scénario nominal")
    cas_erreur: List[str] = Field(default_factory=list, description="Cas d'erreur possibles")
    contraintes: List[str] = Field(default_factory=list, description="Contraintes techniques ou métier")


class Module(BaseModel):
    """Module fonctionnel"""
    id: str = Field(..., description="Identifiant du module (ex: MOD001)")
    nom: str = Field(..., description="Nom du module")
    description: str = Field(..., description="Description du module")
    fonctions: List[FonctionDetail] = Field(default_factory=list, description="Liste des fonctions du module")


class Contexte(BaseModel):
    """Contexte et objectifs du projet"""
    presentation: str = Field(..., description="Présentation générale du projet")
    objectifs_metier: List[str] = Field(default_factory=list, description="Objectifs métier")
    perimetre: str = Field(..., description="Périmètre fonctionnel")
    acteurs: List[Dict[str, str]] = Field(
        default_factory=list,
        description="Liste des acteurs avec leurs rôles"
    )


class DescriptionGenerale(BaseModel):
    """Description générale du système"""
    architecture_fonctionnelle: str = Field(..., description="Description de l'architecture")
    flux_principaux: List[str] = Field(default_factory=list, description="Flux métier principaux")
    regles_gestion: List[str] = Field(default_factory=list, description="Règles de gestion globales")


class ExigencesNonFonctionnelles(BaseModel):
    """Exigences non fonctionnelles"""
    performance: List[str] = Field(default_factory=list, description="Exigences de performance")
    securite: List[str] = Field(default_factory=list, description="Exigences de sécurité")
    disponibilite: List[str] = Field(default_factory=list, description="Exigences de disponibilité")
    scalabilite: List[str] = Field(default_factory=list, description="Exigences de scalabilité")


class ContraintesTechniques(BaseModel):
    """Contraintes techniques"""
    environnement: List[str] = Field(default_factory=list, description="Environnement technique")
    technologies: List[str] = Field(default_factory=list, description="Technologies imposées")
    normes: List[str] = Field(default_factory=list, description="Normes et conformité")


class Format1SFD(BaseModel):
    """Structure complète d'un SFD Format Classique"""
    nom_projet: str = Field(..., description="Nom du projet")
    version: str = Field(default="1.0", description="Version du document")
    date: str = Field(..., description="Date de création")
    auteur: str = Field(default="", description="Auteur du document")
    
    # Sections principales
    contexte: Contexte
    description_generale: DescriptionGenerale
    modules: List[Module] = Field(default_factory=list, description="Liste des modules fonctionnels")
    exigences_non_fonctionnelles: ExigencesNonFonctionnelles
    contraintes_techniques: ContraintesTechniques
    
    # Annexes optionnelles
    glossaire: Dict[str, str] = Field(default_factory=dict, description="Glossaire des termes")
    notes: str = Field(default="", description="Notes complémentaires")

    class Config:
        json_schema_extra = {
            "example": {
                "nom_projet": "E-commerce AS-SÂFI",
                "version": "1.0",
                "date": "2024-12-23",
                "auteur": "Consultant ABC",
                "contexte": {
                    "presentation": "Plateforme e-commerce pour la vente de cacahuètes premium",
                    "objectifs_metier": ["Vendre en ligne", "Gérer les stocks"],
                    "perimetre": "Module vente et paiement",
                    "acteurs": [{"role": "Client", "description": "Achète des produits"}]
                },
                "description_generale": {
                    "architecture_fonctionnelle": "Architecture 3-tiers",
                    "flux_principaux": ["Commande", "Paiement", "Livraison"],
                    "regles_gestion": ["Stock minimum 10 unités"]
                },
                "modules": [],
                "exigences_non_fonctionnelles": {
                    "performance": ["Temps réponse < 2s"],
                    "securite": ["Chiffrement SSL"],
                    "disponibilite": ["99.9% uptime"],
                    "scalabilite": ["Support 1000 users simultanés"]
                },
                "contraintes_techniques": {
                    "environnement": ["AWS"],
                    "technologies": ["React", "FastAPI"],
                    "normes": ["RGPD"]
                }
            }
        }

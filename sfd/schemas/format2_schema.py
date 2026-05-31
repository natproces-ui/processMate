from pydantic import BaseModel, Field
from typing import List, Optional, Dict


class UserStory(BaseModel):
    """User Story individuelle"""
    id: str = Field(..., description="Identifiant unique (ex: US001)")
    titre: str = Field(..., description="Titre de la user story")
    en_tant_que: str = Field(..., description="Rôle de l'utilisateur")
    je_veux: str = Field(..., description="Action souhaitée")
    afin_de: str = Field(..., description="Bénéfice attendu")
    criteres_acceptation: List[str] = Field(
        default_factory=list,
        description="Critères d'acceptation"
    )
    regles_metier: List[str] = Field(default_factory=list, description="Règles métier associées")
    priorite: str = Field(default="Moyenne", description="Priorité (Haute/Moyenne/Basse)")
    estimation: str = Field(default="", description="Estimation (points ou jours)")
    statut: str = Field(default="À faire", description="Statut actuel")


class Epic(BaseModel):
    """Epic regroupant plusieurs User Stories"""
    id: str = Field(..., description="Identifiant de l'epic (ex: EP001)")
    nom: str = Field(..., description="Nom de l'epic")
    description: str = Field(..., description="Description de l'epic")
    objectif: str = Field(..., description="Objectif métier de l'epic")
    user_stories: List[UserStory] = Field(default_factory=list, description="User stories de cet epic")


class VisionProduit(BaseModel):
    """Vision produit"""
    probleme: str = Field(..., description="Problème à résoudre")
    utilisateurs_cibles: List[str] = Field(default_factory=list, description="Utilisateurs cibles")
    valeur_apportee: str = Field(..., description="Valeur apportée par le produit")
    objectifs: List[str] = Field(default_factory=list, description="Objectifs principaux")


class RegleMetier(BaseModel):
    """Règle métier transverse"""
    id: str = Field(..., description="Identifiant (ex: R001)")
    nom: str = Field(..., description="Nom de la règle")
    description: str = Field(..., description="Description détaillée")
    impact: List[str] = Field(default_factory=list, description="User stories impactées")


class ModeleData(BaseModel):
    """Modèle de données simplifié"""
    entites: List[Dict[str, str]] = Field(
        default_factory=list,
        description="Entités principales avec leurs attributs"
    )
    relations: List[str] = Field(default_factory=list, description="Relations entre entités")


class Workflow(BaseModel):
    """Workflow / Parcours utilisateur"""
    nom: str = Field(..., description="Nom du workflow")
    etapes: List[str] = Field(default_factory=list, description="Étapes du parcours")
    description: str = Field(default="", description="Description du workflow")


class Format2SFD(BaseModel):
    """Structure complète d'un SFD Format Agile"""
    nom_projet: str = Field(..., description="Nom du projet")
    version: str = Field(default="1.0", description="Version du document")
    date: str = Field(..., description="Date de création")
    product_owner: str = Field(default="", description="Product Owner")
    scrum_master: str = Field(default="", description="Scrum Master")
    
    # Sections principales
    vision_produit: VisionProduit
    epics: List[Epic] = Field(default_factory=list, description="Liste des epics")
    regles_metier: List[RegleMetier] = Field(
        default_factory=list,
        description="Règles métier transverses"
    )
    modele_data: ModeleData
    workflows: List[Workflow] = Field(default_factory=list, description="Workflows principaux")
    
    # Définition de "Done"
    definition_of_done: List[str] = Field(
        default_factory=list,
        description="Critères pour considérer une story terminée"
    )
    
    # Notes
    notes: str = Field(default="", description="Notes complémentaires")

    class Config:
        json_schema_extra = {
            "example": {
                "nom_projet": "E-commerce AS-SÂFI",
                "version": "1.0",
                "date": "2024-12-23",
                "product_owner": "Aymara",
                "scrum_master": "Team Lead",
                "vision_produit": {
                    "probleme": "Difficulté d'acheter des cacahuètes premium en ligne",
                    "utilisateurs_cibles": ["Clients B2C", "Distributeurs B2B"],
                    "valeur_apportee": "Plateforme simple et rapide",
                    "objectifs": ["Lancer MVP en 3 mois", "Atteindre 1000 clients"]
                },
                "epics": [
                    {
                        "id": "EP001",
                        "nom": "Gestion du panier",
                        "description": "Permettre aux clients de gérer leur panier",
                        "objectif": "Faciliter l'achat",
                        "user_stories": [
                            {
                                "id": "US001",
                                "titre": "Ajouter un produit au panier",
                                "en_tant_que": "Client",
                                "je_veux": "Ajouter un produit à mon panier",
                                "afin_de": "Préparer ma commande",
                                "criteres_acceptation": [
                                    "Le produit apparaît dans le panier",
                                    "La quantité est modifiable"
                                ],
                                "regles_metier": ["Stock minimum requis"],
                                "priorite": "Haute",
                                "estimation": "3 points",
                                "statut": "À faire"
                            }
                        ]
                    }
                ],
                "regles_metier": [
                    {
                        "id": "R001",
                        "nom": "Stock minimum",
                        "description": "Un produit doit avoir au moins 10 unités en stock",
                        "impact": ["US001", "US002"]
                    }
                ],
                "modele_data": {
                    "entites": [
                        {"nom": "Produit", "attributs": "id, nom, prix, stock"},
                        {"nom": "Panier", "attributs": "id, user_id, produits"}
                    ],
                    "relations": ["Un panier contient plusieurs produits"]
                },
                "workflows": [
                    {
                        "nom": "Processus d'achat",
                        "etapes": [
                            "Parcourir catalogue",
                            "Ajouter au panier",
                            "Valider panier",
                            "Paiement",
                            "Confirmation"
                        ]
                    }
                ],
                "definition_of_done": [
                    "Code reviewé",
                    "Tests unitaires passent",
                    "Déployé en staging",
                    "Validé par PO"
                ]
            }
        }

"""
schema.py — Modèles Pydantic pour le SFD (Spécification Fonctionnelle Détaillée).
Structure conforme aux standards MOA/MOE français.
"""

import re

from pydantic import BaseModel, Field
from pydantic.functional_validators import BeforeValidator
from typing import List, Dict, Optional, Annotated


# ─── Mermaid label sanitizer ──────────────────────────────────────────────────

_NEEDS_QUOTING = re.compile(r"[()'\u00C0-\u024F]")  # parens, apostrophes, lettres accentuées


def _sanitize_mermaid(code) -> str:
    """Auto-quote les labels Mermaid contenant des caractères spéciaux.

    Ex: A[Appliquer Critères (F003)] → A["Appliquer Critères (F003)"]
        B{Droits d'Accès? (RG006)}   → B{"Droits d'Accès? (RG006)"}
    """
    if not isinstance(code, str):
        return str(code) if code is not None else ""

    def _quote_if_needed(m: re.Match) -> str:
        open_b, content, close_b = m.group(1), m.group(2), m.group(3)
        # Déjà quoté
        if content.startswith('"') and content.endswith('"'):
            return m.group(0)
        if _NEEDS_QUOTING.search(content):
            safe = content.replace('"', "'")
            return f'{open_b}"{safe}"{close_b}'
        return m.group(0)

    # Labels entre crochets : A[label]
    code = re.sub(r'(\[)([^\[\]"\n]+?)(\])', _quote_if_needed, code)
    # Labels entre accolades : B{label}
    code = re.sub(r'(\{)([^{}"' r'\n]+?)(\})', _quote_if_needed, code)
    return code


def _coerce_str(v) -> str:
    """Convertit un dict en string en extrayant 'description', 'text' ou 'nom'."""
    if isinstance(v, dict):
        return v.get('description', v.get('text', v.get('nom', str(v))))
    return str(v) if v is not None else ""


def _coerce_str_list(v):
    """Tolère List[dict] → List[str] (Gemini retourne parfois des objets)."""
    if isinstance(v, list):
        return [_coerce_str(item) if not isinstance(item, str) else item for item in v]
    return v


CoercedStrList = Annotated[List[str], BeforeValidator(_coerce_str_list)]


class RevisionHistorique(BaseModel):
    version: str
    date: str
    auteur: str
    description: str


class DocumentReference(BaseModel):
    nom: str
    type: str = ""      # CDC, SFG, Cahier des charges, etc.
    version: str = ""
    description: str = ""


class SFDMeta(BaseModel):
    nom_projet: str
    client: str = ""
    version: str = "1.0"
    date: str = ""
    statut: str = "Draft"   # Draft | En révision | Validé
    auteurs: CoercedStrList = Field(default_factory=list)
    historique_revisions: List[RevisionHistorique] = Field(default_factory=list)


class Contexte(BaseModel):
    presentation_client: str = ""
    contexte_projet: str = ""
    objectifs_metier: CoercedStrList = Field(default_factory=list)


class Perimetre(BaseModel):
    inclus: CoercedStrList = Field(default_factory=list)
    exclus: CoercedStrList = Field(default_factory=list)
    hypotheses: CoercedStrList = Field(default_factory=list)
    contraintes_generales: CoercedStrList = Field(default_factory=list)


class Acteur(BaseModel):
    id: str             # ACT001
    nom: str
    type: str = "interne"   # interne | externe | système
    role: str = ""
    description: str = ""


class FluxEtape(BaseModel):
    numero: int
    description: str


class CasUtilisation(BaseModel):
    id: str             # UC001
    nom: str
    acteur_principal: str
    acteurs_secondaires: CoercedStrList = Field(default_factory=list)
    preconditions: CoercedStrList = Field(default_factory=list)
    flux_nominal: List[FluxEtape] = Field(default_factory=list)
    flux_alternatifs: CoercedStrList = Field(default_factory=list)
    flux_erreur: CoercedStrList = Field(default_factory=list)
    postconditions: CoercedStrList = Field(default_factory=list)


class Fonction(BaseModel):
    id: str             # F001
    nom: str
    priorite: str = "Moyenne"  # Haute | Moyenne | Basse
    description: str = ""
    donnees_entree: CoercedStrList = Field(default_factory=list)
    donnees_sortie: CoercedStrList = Field(default_factory=list)
    regles_gestion_ids: CoercedStrList = Field(default_factory=list)
    contraintes: CoercedStrList = Field(default_factory=list)


class Module(BaseModel):
    id: str             # MOD001
    nom: str
    description: str = ""
    fonctions: List[Fonction] = Field(default_factory=list)


class RegleGestion(BaseModel):
    id: str             # RG001
    description: str
    type: str = "validation"    # calcul | validation | décision
    fonctions_concernees: CoercedStrList = Field(default_factory=list)


class SpecificationDonnee(BaseModel):
    entite: str
    attributs: CoercedStrList = Field(default_factory=list)
    description: str = ""
    flux_associes: CoercedStrList = Field(default_factory=list)


class ElementUI(BaseModel):
    nom: str
    type: str = ""      # champ | bouton | liste | tableau
    description: str = ""
    obligatoire: bool = False


class InterfaceUI(BaseModel):
    id: str             # IHM001
    nom_ecran: str
    description: str = ""
    acteur: str = ""
    elements: List[ElementUI] = Field(default_factory=list)


class InterfaceExterne(BaseModel):
    id: str             # INT001
    nom: str
    type: str = "externe"   # interne | externe
    systeme_tiers: str = ""
    description: str = ""
    format_echange: str = ""


class Interfaces(BaseModel):
    interfaces_ui: List[InterfaceUI] = Field(default_factory=list)
    interfaces_externes: List[InterfaceExterne] = Field(default_factory=list)


class ExigencesNF(BaseModel):
    performance: CoercedStrList = Field(default_factory=list)
    securite: CoercedStrList = Field(default_factory=list)
    disponibilite: CoercedStrList = Field(default_factory=list)
    ergonomie: CoercedStrList = Field(default_factory=list)
    maintenabilite: CoercedStrList = Field(default_factory=list)


class MatriceTracabilite(BaseModel):
    id_besoin_source: str
    description_besoin: str
    fonctions_couvrant: CoercedStrList = Field(default_factory=list)


SanitizedMermaid = Annotated[str, BeforeValidator(_sanitize_mermaid)]


class SchemaConceptuel(BaseModel):
    id: str             # SCH001
    titre: str
    type: str = "flux"  # flux | sequence | entites | cas_utilisation
    mermaid_code: SanitizedMermaid
    description: str = ""


class SFDDocument(BaseModel):
    meta: SFDMeta
    documents_reference: List[DocumentReference] = Field(default_factory=list)
    contexte: Contexte = Field(default_factory=Contexte)
    perimetre: Perimetre = Field(default_factory=Perimetre)
    acteurs: List[Acteur] = Field(default_factory=list)
    cas_utilisation: List[CasUtilisation] = Field(default_factory=list)
    modules: List[Module] = Field(default_factory=list)
    regles_gestion: List[RegleGestion] = Field(default_factory=list)
    specifications_donnees: List[SpecificationDonnee] = Field(default_factory=list)
    interfaces: Interfaces = Field(default_factory=Interfaces)
    exigences_non_fonctionnelles: ExigencesNF = Field(default_factory=ExigencesNF)
    matrice_tracabilite: List[MatriceTracabilite] = Field(default_factory=list)
    schemas_conceptuels: List[SchemaConceptuel] = Field(default_factory=list)
    glossaire: Dict[str, str] = Field(default_factory=dict)

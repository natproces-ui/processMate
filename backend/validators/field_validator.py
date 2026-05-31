# field_validator.py
"""
Validateur au niveau des champs individuels basé sur rules.json
Vérifie: type, longueur, format, obligatoire, pseudo
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
import re


class FieldValidationError:
    def __init__(self, entity: str, field: str, rule: str, message: str, severity: str = "error"):
        self.entity = entity  # Ex: "Identifiant_Deposant", "Heritier"
        self.field = field    # Ex: "nom", "idscv"
        self.rule = rule      # Ex: "type", "longueur", "obligatoire"
        self.message = message
        self.severity = severity


class FieldValidator:
    """Validateur strict basé sur les règles de rules.json"""
    
    def __init__(self, rules: dict):
        self.rules = rules
        self.errors: List[FieldValidationError] = []
        self.warnings: List[FieldValidationError] = []
    
    def validate_scv(self, data: dict) -> Dict[str, Any]:
        """Valide tous les champs du SCV selon rules.json"""
        self.errors = []
        self.warnings = []
        
        scv = data.get('SCV', {})
        
        # Valider chaque entité
        self.validate_identifiant_deposant(scv.get('identifiantDeposant', {}))
        self.validate_infos_contact(scv.get('infosContact', {}), "Deposant")
        
        # Représentants légaux
        for i, rep in enumerate(scv.get('representantLegal', [])):
            self.validate_representant_legal(rep, i)
        
        # Héritiers
        for i, heritier in enumerate(scv.get('heritier', [])):
            self.validate_heritier(heritier, i)
        
        # Comptes
        for i, compte in enumerate(scv.get('compte', [])):
            self.validate_compte(compte, i)
        
        return {
            "valid": len(self.errors) == 0,
            "errors": [self._format_error(e) for e in self.errors],
            "warnings": [self._format_error(w) for w in self.warnings],
            "can_proceed": len(self.errors) == 0,
            "summary": {
                "total_errors": len(self.errors),
                "total_warnings": len(self.warnings),
                "entities_validated": [
                    "Identifiant_Deposant",
                    "Infos_Contact",
                    "Representant_Legal",
                    "Heritier",
                    "Compte",
                    "Cotitulaire",
                    "Prelevement",
                    "Carte_Bancaire"
                ]
            }
        }
    
    def _format_error(self, e: FieldValidationError) -> dict:
        return {
            "entity": e.entity,
            "field": e.field,
            "rule": e.rule,
            "message": e.message,
            "severity": e.severity
        }
    
    # ============================================================
    # VALIDATION: Identifiant_Deposant
    # ============================================================
    
    def validate_identifiant_deposant(self, deposant: dict):
        """Valide tous les champs de Identifiant_Deposant selon rules.json"""
        entity = "Identifiant_Deposant"
        rules = self.rules.get(entity, {})
        
        type_personne = deposant.get('typePersonne')
        is_decede = deposant.get('isDecede')
        
        # idscv - Numérique, 30, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field="idscv",
            value=deposant.get('idscv'),
            rules=rules.get('idscv', {}),
            context=deposant
        )
        
        # version - Numérique, 1, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field="version",
            value=deposant.get('version'),
            rules=rules.get('version', {}),
            context=deposant
        )
        
        # typePersonne - Référentiel, 2, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field="typePersonne",
            value=type_personne,
            rules=rules.get('typePersonne', {}),
            context=deposant,
            referentiel_values=['PP', 'PM']
        )
        
        # nom - Alphabétique, 40, Oui si PP, Oui pseudo
        obligatoire = type_personne == 'PP'
        self._validate_field(
            entity=entity,
            field="nom",
            value=deposant.get('nom'),
            rules=rules.get('nom', {}),
            context=deposant,
            obligatoire_override=obligatoire
        )
        
        # prenom - Alphabétique, 40, Oui si PP, Oui pseudo
        self._validate_field(
            entity=entity,
            field="prenom",
            value=deposant.get('prenom'),
            rules=rules.get('prenom', {}),
            context=deposant,
            obligatoire_override=obligatoire
        )
        
        # dateNaissance - Date, 10, Oui si PP, Non pseudo
        self._validate_field(
            entity=entity,
            field="dateNaissance",
            value=deposant.get('dateNaissance'),
            rules=rules.get('dateNaissance', {}),
            context=deposant,
            obligatoire_override=obligatoire
        )
        
        # nationalite - Référentiel, 2, Oui si PP, Non pseudo
        self._validate_field(
            entity=entity,
            field="nationalite",
            value=deposant.get('nationalite'),
            rules=rules.get('nationalite', {}),
            context=deposant,
            obligatoire_override=obligatoire
        )
        
        # formeJuridique - Référentiel, 8, Oui si PM, Non pseudo
        obligatoire_pm = type_personne == 'PM'
        self._validate_field(
            entity=entity,
            field="formeJuridique",
            value=deposant.get('formeJuridique'),
            rules=rules.get('formeJuridique', {}),
            context=deposant,
            obligatoire_override=obligatoire_pm
        )
        
        # natureIdentifiantDeposant - Référentiel, 8, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field="natureIdentifiantDeposant",
            value=deposant.get('natureIdentifiantDeposant'),
            rules=rules.get('natureIdentifiantDeposant', {}),
            context=deposant
        )
        
        # numeroIdentifiantDeposant - Alphanumérique, 30, Oui, Oui pseudo
        self._validate_field(
            entity=entity,
            field="numeroIdentifiantDeposant",
            value=deposant.get('numeroIdentifiantDeposant'),
            rules=rules.get('numeroIdentifiantDeposant', {}),
            context=deposant
        )
        
        # denominationSociale - Alphanumérique, 100, Oui si PM, Oui pseudo
        self._validate_field(
            entity=entity,
            field="denominationSociale",
            value=deposant.get('denominationSociale'),
            rules=rules.get('denominationSociale', {}),
            context=deposant,
            obligatoire_override=obligatoire_pm
        )
        
        # nombreComptes - Numérique, 3, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field="nombreComptes",
            value=deposant.get('nombreComptes'),
            rules=rules.get('nombreComptes', {}),
            context=deposant
        )
        
        # isDecede - Référentiel, 1, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field="isDecede",
            value=is_decede,
            rules=rules.get('isDecede', {}),
            context=deposant,
            referentiel_values=['O', 'N']
        )
        
        # nombreHeritiers - Numérique, 3, Oui si décédé, Non pseudo
        obligatoire_decede = is_decede == 'O'
        self._validate_field(
            entity=entity,
            field="nombreHeritiers",
            value=deposant.get('nombreHeritiers'),
            rules=rules.get('nombreHeritiers', {}),
            context=deposant,
            obligatoire_override=obligatoire_decede
        )
    
    # ============================================================
    # VALIDATION: Representant_Legal
    # ============================================================
    
    def validate_representant_legal(self, rep: dict, index: int):
        """Valide un représentant légal"""
        entity = "Representant_Legal"
        rules = self.rules.get(entity, {})
        
        rep_id = rep.get('identifiantRepresentantLegal', {})
        rep_contact = rep.get('infosContact', {})
        
        # Détecter si le représentant est "vide" (tous les champs à null)
        has_data = any(v is not None and v != '' for v in rep_id.values())
        
        # Si au moins un champ est rempli, tous les champs obligatoires le deviennent
        obligatoire = has_data
        
        # idscv - Numérique, 30, Non, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"representantLegal[{index}].idscv",
            value=rep_id.get('idscv'),
            rules=rules.get('idscv', {}),
            context=rep_id,
            obligatoire_override=False  # Non obligatoire selon rules
        )
        
        # natureIdentifiantDeposantP - Référentiel, 10, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"representantLegal[{index}].natureIdentifiantDeposantP",
            value=rep_id.get('natureIdentifiantDeposantP'),
            rules=rules.get('natureIdentifiantDeposantP', {}),
            context=rep_id,
            obligatoire_override=obligatoire
        )
        
        # numeroIdentifiantDeposantP - Alphanumérique, 20, Oui, Oui pseudo
        self._validate_field(
            entity=entity,
            field=f"representantLegal[{index}].numeroIdentifiantDeposantP",
            value=rep_id.get('numeroIdentifiantDeposantP'),
            rules=rules.get('numeroIdentifiantDeposantP', {}),
            context=rep_id,
            obligatoire_override=obligatoire
        )
        
        # nom - Alphabétique, 40, Oui, Oui pseudo
        self._validate_field(
            entity=entity,
            field=f"representantLegal[{index}].nom",
            value=rep_id.get('nom'),
            rules=rules.get('nom', {}),
            context=rep_id,
            obligatoire_override=obligatoire
        )
        
        # prenom - Alphabétique, 40, Oui, Oui pseudo
        self._validate_field(
            entity=entity,
            field=f"representantLegal[{index}].prenom",
            value=rep_id.get('prenom'),
            rules=rules.get('prenom', {}),
            context=rep_id,
            obligatoire_override=obligatoire
        )
        
        # dateNaissance - Date, 10, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"representantLegal[{index}].dateNaissance",
            value=rep_id.get('dateNaissance'),
            rules=rules.get('dateNaissance', {}),
            context=rep_id,
            obligatoire_override=obligatoire
        )
        
        # nationalite - Alphabétique, 2, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"representantLegal[{index}].nationalite",
            value=rep_id.get('nationalite'),
            rules=rules.get('nationalite', {}),
            context=rep_id,
            obligatoire_override=obligatoire
        )
        
        # Valider les infos contact si le représentant est déclaré
        if has_data:
            self.validate_infos_contact(rep_contact, f"RepresentantLegal[{index}]")
    
    # ============================================================
    # VALIDATION: Heritier
    # ============================================================
    
    def validate_heritier(self, heritier: dict, index: int):
        """Valide un héritier"""
        entity = "Heritier"
        rules = self.rules.get(entity, {})
        
        h_id = heritier.get('identifiantHeritier', {})
        h_contact = heritier.get('infosContact', {})
        h_rep = heritier.get('representantLegal', {})
        
        # idscv - Numérique, 30, Non, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"heritier[{index}].idscv",
            value=h_id.get('idscv'),
            rules=rules.get('idscv', {}),
            context=h_id,
            obligatoire_override=False
        )
        
        # natureIdentifiantDeposantP - Référentiel, 10, Non, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"heritier[{index}].natureIdentifiantDeposantP",
            value=h_id.get('natureIdentifiantDeposantP'),
            rules=rules.get('natureIdentifiantDeposantP', {}),
            context=h_id,
            obligatoire_override=False
        )
        
        # numeroIdentifiantDeposantP - Alphanumérique, 20, Non, Oui pseudo
        self._validate_field(
            entity=entity,
            field=f"heritier[{index}].numeroIdentifiantDeposantP",
            value=h_id.get('numeroIdentifiantDeposantP'),
            rules=rules.get('numeroIdentifiantDeposantP', {}),
            context=h_id,
            obligatoire_override=False
        )
        
        # nom - Alphabétique, 40, Oui, Oui pseudo
        self._validate_field(
            entity=entity,
            field=f"heritier[{index}].nom",
            value=h_id.get('nom'),
            rules=rules.get('nom', {}),
            context=h_id
        )
        
        # prenom - Alphabétique, 40, Oui, Oui pseudo
        self._validate_field(
            entity=entity,
            field=f"heritier[{index}].prenom",
            value=h_id.get('prenom'),
            rules=rules.get('prenom', {}),
            context=h_id
        )
        
        # dateNaissance - Date, 10, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"heritier[{index}].dateNaissance",
            value=h_id.get('dateNaissance'),
            rules=rules.get('dateNaissance', {}),
            context=h_id
        )
        
        # nationalite - Alphabétique, 2, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"heritier[{index}].nationalite",
            value=h_id.get('nationalite'),
            rules=rules.get('nationalite', {}),
            context=h_id
        )
        
        # partHeritage - Numérique, 3, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"heritier[{index}].partHeritage",
            value=h_id.get('partHeritage'),
            rules=rules.get('partHeritage', {}),
            context=h_id
        )
        
        # Valider contact héritier
        self.validate_infos_contact(h_contact, f"Heritier[{index}]")
        
        # Valider représentant légal de l'héritier
        if h_rep:
            self.validate_representant_legal(h_rep, f"{index}.representant")
    
    # ============================================================
    # VALIDATION: Infos_Contact
    # ============================================================
    
    def validate_infos_contact(self, contact: dict, context_name: str):
        """Valide les informations de contact"""
        entity = "Infos_Contact"
        rules = self.rules.get(entity, {})
        
        # adresse1 - Alphanumérique, 200, Oui, Oui pseudo
        self._validate_field(
            entity=entity,
            field=f"{context_name}.infosContact.adresse1",
            value=contact.get('adresse1'),
            rules=rules.get('adresse1', {}),
            context=contact
        )
        
        # adresse2 - Alphanumérique, 200, Non, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"{context_name}.infosContact.adresse2",
            value=contact.get('adresse2'),
            rules=rules.get('adresse2', {}),
            context=contact
        )
        
        # codePostal - Alphanumérique, 10, Non, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"{context_name}.infosContact.codePostal",
            value=contact.get('codePostal'),
            rules=rules.get('codePostal', {}),
            context=contact
        )
        
        # ville - Référentiel, 3, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"{context_name}.infosContact.ville",
            value=contact.get('ville'),
            rules=rules.get('ville', {}),
            context=contact
        )
        
        # pays - Référentiel, 2, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"{context_name}.infosContact.pays",
            value=contact.get('pays'),
            rules=rules.get('pays', {}),
            context=contact
        )
        
        # mobile - Alphanumérique, 20, Oui, Oui pseudo
        self._validate_field(
            entity=entity,
            field=f"{context_name}.infosContact.mobile",
            value=contact.get('mobile'),
            rules=rules.get('mobile', {}),
            context=contact
        )
        
        # fixe - Alphanumérique, 20, Non, Oui pseudo
        self._validate_field(
            entity=entity,
            field=f"{context_name}.infosContact.fixe",
            value=contact.get('fixe'),
            rules=rules.get('fixe', {}),
            context=contact
        )
        
        # email - Alphanumérique, 50, Non, Oui pseudo
        self._validate_field(
            entity=entity,
            field=f"{context_name}.infosContact.email",
            value=contact.get('email'),
            rules=rules.get('email', {}),
            context=contact
        )
    
    # ============================================================
    # VALIDATION: Compte
    # ============================================================
    
    def validate_compte(self, compte: dict, index: int):
        """Valide un compte bancaire"""
        entity = "Compte"
        rules = self.rules.get(entity, {})
        
        infos = compte.get('infosCompteBancaire', {})
        nature_compte = infos.get('natureCompte')
        statut_compte = infos.get('statutCompte')
        is_carte = infos.get('isCarteBancaire')
        
        # rib - Numérique, 24, Oui, Oui pseudo
        self._validate_field(
            entity=entity,
            field=f"compte[{index}].rib",
            value=infos.get('rib'),
            rules=rules.get('rib', {}),
            context=infos
        )
        
        # natureCompte - Référentiel, 3, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"compte[{index}].natureCompte",
            value=nature_compte,
            rules=rules.get('natureCompte', {}),
            context=infos
        )
        
        # nombreCotitulaires - Numérique, 4, Oui si collectif, Non pseudo
        obligatoire_col = nature_compte == 'COL'
        self._validate_field(
            entity=entity,
            field=f"compte[{index}].nombreCotitulaires",
            value=infos.get('nombreCotitulaires'),
            rules=rules.get('nombreCotitulaires', {}),
            context=infos,
            obligatoire_override=obligatoire_col
        )
        
        # pcec - Référentiel, 5, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"compte[{index}].pcec",
            value=infos.get('pcec'),
            rules=rules.get('pcec', {}),
            context=infos
        )
        
        # devise - Référentiel, 3, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"compte[{index}].devise",
            value=infos.get('devise'),
            rules=rules.get('devise', {}),
            context=infos
        )
        
        # nomCompte - Alphabétique, 100, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"compte[{index}].nomCompte",
            value=infos.get('nomCompte'),
            rules=rules.get('nomCompte', {}),
            context=infos
        )
        
        # isCarteBancaire - Référentiel, 1, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"compte[{index}].isCarteBancaire",
            value=is_carte,
            rules=rules.get('isCarteBancaire', {}),
            context=infos,
            referentiel_values=['O', 'N']
        )
        
        # statutCompte - Référentiel, 4, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"compte[{index}].statutCompte",
            value=statut_compte,
            rules=rules.get('statutCompte', {}),
            context=infos
        )
        
        # compteNSTP - Référentiel, 20, Oui si NSTP, Non pseudo
        obligatoire_nstp = statut_compte == 'NSTP'
        self._validate_field(
            entity=entity,
            field=f"compte[{index}].compteNSTP",
            value=infos.get('compteNSTP'),
            rules=rules.get('compteNSTP', {}),
            context=infos,
            obligatoire_override=obligatoire_nstp
        )
        
        # autreCompteNSTP - Alphanumérique, 300, Oui si Autre, Non pseudo
        obligatoire_autre = infos.get('compteNSTP') == 'Autre'
        self._validate_field(
            entity=entity,
            field=f"compte[{index}].autreCompteNSTP",
            value=infos.get('autreCompteNSTP'),
            rules=rules.get('autreCompteNSTP', {}),
            context=infos,
            obligatoire_override=obligatoire_autre
        )
        
        # sensSolde - Référentiel, 4, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"compte[{index}].sensSolde",
            value=infos.get('sensSolde'),
            rules=rules.get('sensSolde', {}),
            context=infos
        )
        
        # Montants monétaires
        montants = [
            'montantTotalSolde', 'montantTotalDettes', 'montantTotalDebits',
            'montantTotalAgios', 'montantTotalGarantie', 'montantTotalInterets'
        ]
        for montant_field in montants:
            self._validate_field(
                entity=entity,
                field=f"compte[{index}].{montant_field}",
                value=infos.get(montant_field),
                rules=rules.get(montant_field, {}),
                context=infos
            )
        
        # Valider cotitulaires
        for j, cotit in enumerate(compte.get('cotitulaire', [])):
            self.validate_cotitulaire(cotit, index, j)
        
        # Valider prélèvements
        for j, prel in enumerate(compte.get('prelevement', [])):
            self.validate_prelevement(prel, index, j)
        
        # Valider cartes bancaires
        if is_carte == 'O':
            for j, carte in enumerate(compte.get('infosCarteBancaire', [])):
                self.validate_carte_bancaire(carte, index, j)
    
    # ============================================================
    # VALIDATION: Cotitulaire
    # ============================================================
    
    def validate_cotitulaire(self, cotit: dict, compte_index: int, cotit_index: int):
        """Valide un cotitulaire"""
        entity = "Cotitulaire"
        rules = self.rules.get(entity, {})
        
        # idscv - Numérique, 30, Oui si collectif, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"compte[{compte_index}].cotitulaire[{cotit_index}].idscv",
            value=cotit.get('idscv'),
            rules=rules.get('idscv', {}),
            context=cotit
        )
        
        # partCoTitulaire - Numérique, 2, Non, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"compte[{compte_index}].cotitulaire[{cotit_index}].partCoTitulaire",
            value=cotit.get('partCoTitulaire'),
            rules=rules.get('partCoTitulaire', {}),
            context=cotit,
            obligatoire_override=False
        )
    
    # ============================================================
    # VALIDATION: Prelevement
    # ============================================================
    
    def validate_prelevement(self, prel: dict, compte_index: int, prel_index: int):
        """Valide un prélèvement"""
        entity = "Prelevement"
        rules = self.rules.get(entity, {})
        
        montant = prel.get('montant')
        nature = prel.get('nature')
        
        # montant - Monétaire, Oui, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"compte[{compte_index}].prelevement[{prel_index}].montant",
            value=montant,
            rules=rules.get('montant', {}),
            context=prel
        )
        
        # nature - Référentiel, Oui si montant>0, Non pseudo
        obligatoire_nature = montant and montant > 0
        self._validate_field(
            entity=entity,
            field=f"compte[{compte_index}].prelevement[{prel_index}].nature",
            value=nature,
            rules=rules.get('nature', {}),
            context=prel,
            obligatoire_override=obligatoire_nature
        )
        
        # natureAutre - Alphabétique, Oui si nature=Autre, Non pseudo
        obligatoire_autre = nature == 'AUTRE'
        self._validate_field(
            entity=entity,
            field=f"compte[{compte_index}].prelevement[{prel_index}].natureAutre",
            value=prel.get('natureAutre'),
            rules=rules.get('natureAutre', {}),
            context=prel,
            obligatoire_override=obligatoire_autre
        )
    
    # ============================================================
    # VALIDATION: Carte_Bancaire
    # ============================================================
    
    def validate_carte_bancaire(self, carte: dict, compte_index: int, carte_index: int):
        """Valide une carte bancaire"""
        entity = "Carte_Bancaire"
        rules = self.rules.get(entity, {})
        
        # numeroCarte - Numérique, 16, Oui si carte associée, Oui pseudo
        self._validate_field(
            entity=entity,
            field=f"compte[{compte_index}].infosCarteBancaire[{carte_index}].numeroCarte",
            value=carte.get('numeroCarte'),
            rules=rules.get('numeroCarte', {}),
            context=carte
        )
        
        # validite - Date, 8, Oui si carte associée, Non pseudo
        self._validate_field(
            entity=entity,
            field=f"compte[{compte_index}].infosCarteBancaire[{carte_index}].validite",
            value=carte.get('validite'),
            rules=rules.get('validite', {}),
            context=carte
        )
    
    # ============================================================
    # VALIDATION GÉNÉRIQUE DES CHAMPS
    # ============================================================
    
    def _validate_field(
        self,
        entity: str,
        field: str,
        value: Any,
        rules: dict,
        context: dict,
        obligatoire_override: Optional[bool] = None,
        referentiel_values: Optional[List[str]] = None
    ):
        """
        Valide un champ selon ses règles
        
        Args:
            entity: Nom de l'entité (ex: "Identifiant_Deposant")
            field: Nom du champ (ex: "nom")
            value: Valeur du champ
            rules: Règles du champ depuis rules.json
            context: Contexte de l'objet parent
            obligatoire_override: Override pour les champs conditionnels
            referentiel_values: Valeurs valides pour un référentiel
        """
        if not rules:
            return
        
        field_type = rules.get('type', '')
        longueur = rules.get('longueur')
        obligatoire_str = rules.get('obligatoire', 'Non')
        pseudo = rules.get('pseudo', 'Non')
        
        # Déterminer si le champ est obligatoire
        # Déterminer si le champ est obligatoire
        if obligatoire_override is not None:
            obligatoire = obligatoire_override
        else:
            obligatoire = obligatoire_str == 'Oui'
        
        # 1. VALIDATION: Champ obligatoire
        if obligatoire:
            if value is None or value == '':
                self.errors.append(FieldValidationError(
                    entity=entity,
                    field=field,
                    rule="obligatoire",
                    message=f"❌ Le champ '{field}' est obligatoire mais est vide ou null"
                ))
                return  # Ne pas continuer si le champ obligatoire est vide
        
        # Si le champ n'est pas obligatoire et est vide, pas besoin de valider le reste
        if value is None or value == '':
            return
        
        # 2. VALIDATION: Type de données
        self._validate_type(entity, field, value, field_type)
        
        # 3. VALIDATION: Longueur
        if longueur:
            self._validate_length(entity, field, value, longueur, field_type)
        
        # 4. VALIDATION: Référentiel
        if field_type == 'Référentiel' and referentiel_values:
            self._validate_referentiel(entity, field, value, referentiel_values)
        
        # 5. VALIDATION: Format spécifique (date, email, etc.)
        if field_type == 'Date':
            self._validate_date_format(entity, field, value)
        elif 'email' in field.lower():
            self._validate_email_format(entity, field, value)
        elif 'mobile' in field.lower() or 'fixe' in field.lower():
            self._validate_phone_format(entity, field, value)
    
    def _validate_type(self, entity: str, field: str, value: Any, field_type: str):
        """Valide le type de données"""
        
        if field_type == 'Numérique':
            # Doit être un nombre ou une chaîne de chiffres
            if not isinstance(value, (int, float)):
                if not (isinstance(value, str) and value.isdigit()):
                    self.errors.append(FieldValidationError(
                        entity=entity,
                        field=field,
                        rule="type",
                        message=f"❌ Le champ '{field}' doit être numérique (actuellement: '{value}')"
                    ))
        
        elif field_type == 'Alphabétique':
            # Doit contenir uniquement des lettres et espaces
            if isinstance(value, str):
                # Accepter lettres, espaces, tirets, apostrophes
                if not re.match(r"^[a-zA-ZÀ-ÿ\s\-']+$", value):
                    self.errors.append(FieldValidationError(
                        entity=entity,
                        field=field,
                        rule="type",
                        message=f"❌ Le champ '{field}' doit être alphabétique (lettres uniquement)"
                    ))
            else:
                self.errors.append(FieldValidationError(
                    entity=entity,
                    field=field,
                    rule="type",
                    message=f"❌ Le champ '{field}' doit être une chaîne alphabétique"
                ))
        
        elif field_type == 'Alphanumérique':
            # Doit être une chaîne de caractères
            if not isinstance(value, str):
                self.errors.append(FieldValidationError(
                    entity=entity,
                    field=field,
                    rule="type",
                    message=f"❌ Le champ '{field}' doit être une chaîne alphanumérique"
                ))
        
        elif field_type == 'Monétaire':
            # Doit être un nombre
            if not isinstance(value, (int, float)):
                self.errors.append(FieldValidationError(
                    entity=entity,
                    field=field,
                    rule="type",
                    message=f"❌ Le champ '{field}' doit être un montant numérique"
                ))
            elif value < 0:
                self.warnings.append(FieldValidationError(
                    entity=entity,
                    field=field,
                    rule="type",
                    message=f"⚠️ Le montant '{field}' est négatif ({value})",
                    severity="warning"
                ))
        
        elif field_type == 'Date':
            # Doit être une chaîne de caractères
            if not isinstance(value, str):
                self.errors.append(FieldValidationError(
                    entity=entity,
                    field=field,
                    rule="type",
                    message=f"❌ Le champ '{field}' doit être une date au format texte"
                ))
    
    def _validate_length(self, entity: str, field: str, value: Any, max_length: int, field_type: str):
        """Valide la longueur d'un champ"""
        
        # Convertir la valeur en chaîne pour vérifier la longueur
        str_value = str(value)
        actual_length = len(str_value)
        
        if actual_length > max_length:
            self.errors.append(FieldValidationError(
                entity=entity,
                field=field,
                rule="longueur",
                message=f"❌ Le champ '{field}' dépasse la longueur maximale: "
                        f"{actual_length} caractères (max: {max_length})"
            ))
        
        # Pour les champs numériques avec longueur exacte (comme idscv=30)
        if field_type == 'Numérique' and field in ['idscv', 'rib', 'numeroCarte']:
            if actual_length != max_length:
                self.errors.append(FieldValidationError(
                    entity=entity,
                    field=field,
                    rule="longueur_exacte",
                    message=f"❌ Le champ '{field}' doit contenir exactement {max_length} chiffres "
                            f"(actuellement: {actual_length})"
                ))
    
    def _validate_referentiel(self, entity: str, field: str, value: Any, valid_values: List[str]):
        """Valide qu'une valeur appartient au référentiel"""
        
        if value not in valid_values:
            self.errors.append(FieldValidationError(
                entity=entity,
                field=field,
                rule="referentiel",
                message=f"❌ La valeur '{value}' n'est pas valide pour '{field}'. "
                        f"Valeurs acceptées: {', '.join(valid_values)}"
            ))
    
    def _validate_date_format(self, entity: str, field: str, value: str):
        """Valide le format d'une date"""
        
        # Format attendu: DD/MM/YYYY ou MM/YYYY pour validité carte
        if '/' not in value:
            self.errors.append(FieldValidationError(
                entity=entity,
                field=field,
                rule="format_date",
                message=f"❌ Le format de date '{value}' est invalide. Format attendu: DD/MM/YYYY ou MM/YYYY"
            ))
            return
        
        try:
            # Tenter de parser la date
            if len(value) == 10:  # DD/MM/YYYY
                datetime.strptime(value, '%d/%m/%Y')
            elif len(value) == 7:  # MM/YYYY
                datetime.strptime(value, '%m/%Y')
            else:
                raise ValueError("Format non reconnu")
        except ValueError:
            self.errors.append(FieldValidationError(
                entity=entity,
                field=field,
                rule="format_date",
                message=f"❌ La date '{value}' n'est pas valide. Format attendu: DD/MM/YYYY ou MM/YYYY"
            ))
        
        # Vérifier que la date n'est pas dans le futur (sauf pour validité carte)
        if 'validite' not in field.lower():
            try:
                if len(value) == 10:
                    date_obj = datetime.strptime(value, '%d/%m/%Y')
                    if date_obj > datetime.now():
                        self.warnings.append(FieldValidationError(
                            entity=entity,
                            field=field,
                            rule="date_future",
                            message=f"⚠️ La date '{value}' est dans le futur",
                            severity="warning"
                        ))
            except:
                pass
    
    def _validate_email_format(self, entity: str, field: str, value: str):
        """Valide le format d'un email"""
        
        # Pattern simple pour email
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        
        if not re.match(email_pattern, value):
            self.errors.append(FieldValidationError(
                entity=entity,
                field=field,
                rule="format_email",
                message=f"❌ L'email '{value}' n'est pas valide"
            ))
    
    def _validate_phone_format(self, entity: str, field: str, value: str):
        """Valide le format d'un numéro de téléphone"""
        
        # Patterns acceptés:
        # - 06-12345678, 07-12345678
        # - +2126-12345678
        # - 002125-12345678
        # - 05-12345678
        
        phone_patterns = [
            r'^0[567]-\d{8}$',           # 06-12345678
            r'^\+2126-\d{8}$',            # +2126-12345678
            r'^002125-\d{8}$',            # 002125-12345678
            r'^\d{10}$',                  # 0612345678 (sans tiret)
            r'^\+\d{10,15}$'              # Format international
        ]
        
        is_valid = any(re.match(pattern, value) for pattern in phone_patterns)
        
        if not is_valid:
            self.warnings.append(FieldValidationError(
                entity=entity,
                field=field,
                rule="format_telephone",
                message=f"⚠️ Le format du téléphone '{value}' est inhabituel. "
                        f"Formats attendus: 06-12345678, +2126-12345678, 002125-12345678",
                severity="warning"
            ))


# ============================================================
# FONCTIONS UTILITAIRES
# ============================================================

def validate_json_structure(data: dict) -> bool:
    """Vérifie que la structure JSON de base est correcte"""
    try:
        if 'SCV' not in data:
            return False
        
        scv = data['SCV']
        required_keys = ['identifiantDeposant', 'infosContact', 'representantLegal', 'heritier', 'compte']
        
        for key in required_keys:
            if key not in scv:
                return False
        
        return True
    except:
        return False


def get_validation_summary(errors: List[FieldValidationError], warnings: List[FieldValidationError]) -> dict:
    """Génère un résumé de validation par entité"""
    
    summary = {}
    
    for error in errors:
        if error.entity not in summary:
            summary[error.entity] = {"errors": 0, "warnings": 0, "fields": []}
        summary[error.entity]["errors"] += 1
        summary[error.entity]["fields"].append(error.field)
    
    for warning in warnings:
        if warning.entity not in summary:
            summary[warning.entity] = {"errors": 0, "warnings": 0, "fields": []}
        summary[warning.entity]["warnings"] += 1
    
    return summary


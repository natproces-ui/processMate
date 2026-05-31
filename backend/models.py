from pydantic import BaseModel
from typing import Optional, List

class IdentifiantRepresentantLegal(BaseModel):
    idscv: Optional[str] = None
    natureIdentifiantDeposantP: Optional[str] = None
    numeroIdentifiantDeposantP: Optional[str] = None
    nom: Optional[str] = None
    prenom: Optional[str] = None
    dateNaissance: Optional[str] = None
    nationalite: Optional[str] = None

class InfosContact(BaseModel):
    adresse1: Optional[str] = None
    adresse2: Optional[str] = None
    codePostal: Optional[str] = None
    ville: Optional[str] = None
    pays: Optional[str] = None
    mobile: Optional[str] = None
    fixe: Optional[str] = None
    email: Optional[str] = None

class RepresentantLegal(BaseModel):
    identifiantRepresentantLegal: IdentifiantRepresentantLegal
    infosContact: InfosContact

class IdentifiantDeposant(BaseModel):
    idscv: str
    version: int
    typePersonne: str
    nom: str
    prenom: str
    dateNaissance: str
    nationalite: str
    formeJuridique: Optional[str] = None
    natureIdentifiantDeposant: str
    numeroIdentifiantDeposant: str
    denominationSociale: Optional[str] = None
    nombreComptes: int
    isDecede: str
    nombreHeritiers: int

class IdentifiantHeritier(BaseModel):
    idscv: Optional[str] = None
    natureIdentifiantDeposantP: str
    numeroIdentifiantDeposantP: str
    nom: str
    prenom: str
    dateNaissance: str
    nationalite: str
    partHeritage: int

class Heritier(BaseModel):
    identifiantHeritier: IdentifiantHeritier
    infosContact: InfosContact
    representantLegal: RepresentantLegal

class InfosCompteBancaire(BaseModel):
    rib: str
    natureCompte: str
    nombreCotitulaires: int
    pcec: str
    devise: str
    nomCompte: str
    isCarteBancaire: str
    statutCompte: str
    compteNSTP: Optional[str] = None
    autreCompteNSTP: Optional[str] = None
    sensSolde: str
    montantTotalSolde: int
    montantTotalDettes: int
    montantTotalDebits: int
    montantTotalAgios: int
    montantTotalGarantie: int
    montantTotalInterets: int

class Prelevement(BaseModel):
    montant: int
    nature: str
    natureAutre: Optional[str] = None

class Cotitulaire(BaseModel):
    idscv: str
    partCoTitulaire: int

class InfosCarteBancaire(BaseModel):
    numeroCarte: str
    validite: str

class Compte(BaseModel):
    infosCompteBancaire: InfosCompteBancaire
    prelevement: List[Prelevement]
    cotitulaire: List[Cotitulaire]
    infosCarteBancaire: List[InfosCarteBancaire]

class SCV(BaseModel):
    identifiantDeposant: IdentifiantDeposant
    infosContact: InfosContact
    representantLegal: List[RepresentantLegal]
    heritier: List[Heritier]
    compte: List[Compte]

class SCVRoot(BaseModel):
    SCV: SCV
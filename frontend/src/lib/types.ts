export interface IdentifiantRepresentantLegal {
    idscv: string | null;
    natureIdentifiantDeposantP: string | null;
    numeroIdentifiantDeposantP: string | null;
    nom: string | null;
    prenom: string | null;
    dateNaissance: string | null;
    nationalite: string | null;
}

export interface InfosContact {
    adresse1: string | null;
    adresse2: string | null;
    codePostal: string | null;
    ville: string | null;
    pays: string | null;
    mobile: string | null;
    fixe: string | null;
    email: string | null;
}

export interface RepresentantLegal {
    identifiantRepresentantLegal: IdentifiantRepresentantLegal;
    infosContact: InfosContact;
}

export interface IdentifiantDeposant {
    idscv: string;
    version: number;
    typePersonne: string;
    nom: string;
    prenom: string;
    dateNaissance: string;
    nationalite: string;
    formeJuridique: string | null;
    natureIdentifiantDeposant: string;
    numeroIdentifiantDeposant: string;
    denominationSociale: string | null;
    nombreComptes: number;
    isDecede: string;
    nombreHeritiers: number;
}

export interface IdentifiantHeritier {
    idscv: string | null;
    natureIdentifiantDeposantP: string;
    numeroIdentifiantDeposantP: string;
    nom: string;
    prenom: string;
    dateNaissance: string;
    nationalite: string;
    partHeritage: number;
}

export interface Heritier {
    identifiantHeritier: IdentifiantHeritier;
    infosContact: InfosContact;
    representantLegal: RepresentantLegal;
}

export interface InfosCompteBancaire {
    rib: string;
    natureCompte: string;
    nombreCotitulaires: number;
    pcec: string;
    devise: string;
    nomCompte: string;
    isCarteBancaire: string;
    statutCompte: string;
    compteNSTP: string | null;
    autreCompteNSTP: string | null;
    sensSolde: string;
    montantTotalSolde: number;
    montantTotalDettes: number;
    montantTotalDebits: number;
    montantTotalAgios: number;
    montantTotalGarantie: number;
    montantTotalInterets: number;
}

export interface Prelevement {
    montant: number;
    nature: string;
    natureAutre: string | null;
}

export interface Cotitulaire {
    idscv: string;
    partCoTitulaire: number;
}

export interface InfosCarteBancaire {
    numeroCarte: string;
    validite: string;
}

export interface Compte {
    infosCompteBancaire: InfosCompteBancaire;
    prelevement: Prelevement[];
    cotitulaire: Cotitulaire[];
    infosCarteBancaire: InfosCarteBancaire[];
}

export interface SCV {
    identifiantDeposant: IdentifiantDeposant;
    infosContact: InfosContact;
    representantLegal: RepresentantLegal[];
    heritier: Heritier[];
    compte: Compte[];
}

export interface SCVRoot {
    SCV: SCV;
}

export interface Ville {
    code: string;
    ville: string;
}

export interface Refs {
    villes: Ville[];
    rules: any;
}
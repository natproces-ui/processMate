/**
 * Types pour les interfaces applicatives — VERSION 2
 * Déduplication : une interface = un système, avec liste de tâches liées
 */

export type TypeDeveloppement =
    | "Développement Interne"
    | "Développement Externe"
    | "Progiciel"
    | "Inconnu";

export type TypeFlux =
    | "API REST"
    | "Webservice"
    | "Flux fichier"
    | "Lecture/Écriture BDD"
    | "Email"
    | "Inconnu";

export type SensFlux = "Sortant" | "Entrant" | "Bidirectionnel" | "Inconnu";
export type OuiNonInconnu = "Oui" | "Non" | "Inconnu";
export type NiveauConfiance = "Confirmée" | "Suggérée" | "Incertaine";

// ─── Tâche liée à une interface ───
export interface TacheLiee {
    id_tache: string;
    nom_etape: string;
}

// ─── Interface dédupliquée (une par système) ───
export interface InterfaceDetectee {
    id_interface: string;
    application_cible: string;
    taches_liees: TacheLiee[];        // ← remplace id_tache + nom_etape simples
    description_fonctionnelle: string;
    type_developpement: TypeDeveloppement;
    type_flux: TypeFlux;
    sens_flux: SensFlux;
    flux_intra_module: OuiNonInconnu;
    flux_vers_CBS: OuiNonInconnu;
    interface_jetable: OuiNonInconnu;
    niveau_confiance: NiveauConfiance;
    champs_a_completer: string[];
}

export interface InterfaceResume {
    total_interfaces: number;
    confirmees: number;
    suggerees: number;
    incertaines: number;
    systemes_identifies: string[];    // ← liste des noms de systèmes
    taches_avec_interface: string[];
    taches_sans_interface: string[];
}

export interface InterfaceDetectionResult {
    success: boolean;
    interfaces: InterfaceDetectee[];
    resume: InterfaceResume;
    metadata: {
        model_used: string;
        attempts: number;
        taches_analysees: number;
        total_etapes_workflow: number;
    };
}

// ─── Options selects ───
export const TYPE_DEVELOPPEMENT_OPTIONS: TypeDeveloppement[] = [
    "Développement Interne", "Développement Externe", "Progiciel", "Inconnu",
];
export const TYPE_FLUX_OPTIONS: TypeFlux[] = [
    "API REST", "Webservice", "Flux fichier", "Lecture/Écriture BDD", "Email", "Inconnu",
];
export const SENS_FLUX_OPTIONS: SensFlux[] = [
    "Sortant", "Entrant", "Bidirectionnel", "Inconnu",
];
export const OUI_NON_OPTIONS: OuiNonInconnu[] = ["Oui", "Non", "Inconnu"];
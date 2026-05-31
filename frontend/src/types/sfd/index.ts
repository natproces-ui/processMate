/**
 * Types pour le SFD Generator
 */

// ============================================================================
// TYPES DE FORMAT
// ============================================================================
export type SFDFormatType = 'format1' | 'format2' | 'format3';

export interface FormatOption {
    id: SFDFormatType;
    name: string;
    description: string;
    icon: string;
}

// ============================================================================
// FORMAT 1 - SFD CLASSIQUE
// ============================================================================
export interface Format1SFD {
    nom_projet: string;
    version: string;
    date: string;
    auteur: string;
    contexte: {
        presentation: string;
        objectifs_metier: string[];
        perimetre: string;
        acteurs: Array<{
            role: string;
            description: string;
        }>;
    };
    description_generale: {
        architecture_fonctionnelle: string;
        flux_principaux: string[];
        regles_gestion: string[];
    };
    modules: Array<{
        id: string;
        nom: string;
        description: string;
        fonctions: Array<{
            id: string;
            nom: string;
            description: string;
            regles_metier: string[];
            donnees_entree: string[];
            donnees_sortie: string[];
            cas_nominal: string;
            cas_erreur: string[];
            contraintes: string[];
        }>;
    }>;
    exigences_non_fonctionnelles: {
        performance: string[];
        securite: string[];
        disponibilite: string[];
        scalabilite: string[];
    };
    contraintes_techniques: {
        environnement: string[];
        technologies: string[];
        normes: string[];
    };
    glossaire: Record<string, string>;
    notes: string;
}

// ============================================================================
// FORMAT 2 - SFD AGILE
// ============================================================================
export interface Format2SFD {
    nom_projet: string;
    version: string;
    date: string;
    product_owner: string;
    scrum_master: string;
    vision_produit: {
        probleme: string;
        utilisateurs_cibles: string[];
        valeur_apportee: string;
        objectifs: string[];
    };
    epics: Array<{
        id: string;
        nom: string;
        description: string;
        objectif: string;
        user_stories: Array<{
            id: string;
            titre: string;
            en_tant_que: string;
            je_veux: string;
            afin_de: string;
            criteres_acceptation: string[];
            regles_metier: string[];
            priorite: string;
            estimation: string;
            statut: string;
        }>;
    }>;
    regles_metier: Array<{
        id: string;
        nom: string;
        description: string;
        impact: string[];
    }>;
    modele_data: {
        entites: Array<{
            nom: string;
            attributs: string;
        }>;
        relations: string[];
    };
    workflows: Array<{
        nom: string;
        etapes: string[];
        description: string;
    }>;
    definition_of_done: string[];
    notes: string;
}

// ============================================================================
// FORMAT 3 - EXPLORATION WEB + DOCUMENTS
// ============================================================================

export interface WebsiteAnalysis {
    url_analysee: string;
    titre_site?: string;
    fonctionnalites_identifiees: string[];
    themes_couverts: string[];
    structure_navigation: string[];
    technologies_detectees: string[];
    recommandations: string[];
    pages_visitees: string[];
    actions_effectuees: number;
}

export interface Format3SFD {
    nom_projet: string;
    nom_cible: string;
    version: string;
    date_creation: string;
    auteur: string;
    statut: string;

    // Contexte
    contexte_projet: string;
    objectifs: string[];
    perimetre: string;
    public_cible: string[];

    // Analyse du site exploré
    analyse_site_reference?: WebsiteAnalysis;

    // Contenu fonctionnel
    acteurs: Array<{
        nom: string;
        role: string;
        droits: string[];
    }>;
    modules: Array<{
        nom: string;
        description: string;
        fonctionnalites: string[];
        source_inspiration: string | null;
    }>;
    series_statistiques: Array<{
        categorie: string;
        description: string;
        format_echange: string;
        frequence_mise_a_jour: string;
    }>;
    cas_utilisation: Array<{
        identifiant: string;
        titre: string;
        acteur: string;
        description: string;
        preconditions: string[];
        etapes: string[];
        postconditions: string[];
    }>;
    api_endpoints: Array<{
        methode: string;
        chemin: string;
        description: string;
        parametres: string[];
    }>;
    exigences_non_fonctionnelles: Array<{
        categorie: string;
        description: string;
        critere_acceptance: string;
    }>;
    architecture_technique: string;
    contraintes: string[];
    glossaire: Record<string, string>;
}

// ============================================================================
// TYPE UNION
// ============================================================================
export type SFDData = Format1SFD | Format2SFD | Format3SFD;

// ============================================================================
// RÉPONSE API FORMAT 3
// ============================================================================
export interface SFDGenerationResponse {
    success: boolean;
    message: string;
    filename: string;
    download_url: string;
    sfd_data: Format3SFD;
    website_exploration_summary?: string;
}

// ============================================================================
// ÉTATS DE TRAITEMENT
// ============================================================================
export type ProcessingStage =
    | 'idle'
    | 'uploading'
    | 'extracting'
    | 'extracted'
    | 'generating'
    | 'completed'
    | 'error';

export interface ProcessingStatus {
    stage: ProcessingStage;
    message: string;
    progress?: number;
}

// ============================================================================
// RÉSULTATS
// ============================================================================
export interface ExtractionResult {
    success: boolean;
    data: SFDData;
    format: SFDFormatType;
    fileName?: string;
}

export interface WordGenerationResult {
    success: boolean;
    fileName: string;
    downloadUrl: string;
    message: string;
}
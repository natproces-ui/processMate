// bpmnTypes.ts - Types pour les 3 tables du système BPMN

/**
 * Table 0 : Métadonnées globales du processus
 */
export interface ProcessMetadata {
    nom: string;
    version: string;
    proprietaire: string;
    dateCreation?: string;
    dateModification?: string;
}

/**
 * Table 1 : Structure du processus (déjà existante dans bpmnGenerator.ts)
 * On la réexporte ici pour centraliser les types
 */
export interface Table1Row {
    id: string;
    étape: string;
    typeBpmn: 'StartEvent' | 'EndEvent' | 'Task' | 'ExclusiveGateway';
    département: string;
    acteur: string;
    condition: string;
    outputOui: string;
    outputNon: string;
    outil: string;
}

/**
 * Table 2 : Enrichissement documentaire des tâches
 */
export interface TaskEnrichment {
    id_tache: string;              // FK vers Table1Row.id
    descriptif: string;            // Description détaillée (markdown accepté)
    duree_estimee: string;         // Ex: "15 min", "2h", "1 jour"
    frequence: string;             // Ex: "quotidien", "hebdomadaire", "mensuel", "à la demande"
    kpi: string;                   // Ex: "taux d'erreur < 2%", "délai < 24h"
}

/**
 * Options pour la fréquence (dropdown)
 */
export const FREQUENCE_OPTIONS = [
    { value: '', label: 'Non spécifié' },
    { value: 'unique', label: 'Unique (ponctuel)' },
    { value: 'quotidien', label: 'Quotidien' },
    { value: 'hebdomadaire', label: 'Hebdomadaire' },
    { value: 'mensuel', label: 'Mensuel' },
    { value: 'trimestriel', label: 'Trimestriel' },
    { value: 'annuel', label: 'Annuel' },
    { value: 'demande', label: 'À la demande' },
] as const;

/**
 * Données par défaut pour Table 0
 */
export const DEFAULT_PROCESS_METADATA: ProcessMetadata = {
    nom: "Création compte bancaire",
    version: "1.0",
    proprietaire: "Direction des opérations",
    dateCreation: new Date().toISOString().split('T')[0],
    dateModification: new Date().toISOString().split('T')[0],
};

/**
 * Enrichissements par défaut pour quelques tâches du processus bancaire
 */
export const DEFAULT_ENRICHMENTS: Map<string, TaskEnrichment> = new Map([
    ['2', {
        id_tache: '2',
        descriptif: 'Le client accède au portail en ligne et sélectionne un créneau disponible. Le système envoie une confirmation par email et SMS.',
        duree_estimee: '5 min',
        frequence: 'demande',
        kpi: 'Taux de conversion > 80%'
    }],
    ['5', {
        id_tache: '5',
        descriptif: 'Collecter les informations personnelles (état civil, adresse, profession, revenus) via le formulaire CRM. Vérifier la cohérence des données saisies.',
        duree_estimee: '15 min',
        frequence: 'demande',
        kpi: 'Taux d\'erreur < 2%'
    }],
    ['7', {
        id_tache: '7',
        descriptif: 'Scanner les pièces d\'identité (CNI, passeport), justificatifs de domicile et bulletins de salaire. Indexer dans la GED.',
        duree_estimee: '10 min',
        frequence: 'demande',
        kpi: 'Qualité scan > 300 DPI'
    }],
    ['12', {
        id_tache: '12',
        descriptif: 'Vérifier l\'authenticité des documents via des outils de détection de fraude. Contrôler les hologrammes, filigranes et signatures.',
        duree_estimee: '20 min',
        frequence: 'demande',
        kpi: 'Taux de détection fraude > 95%'
    }],
    ['21', {
        id_tache: '21',
        descriptif: 'Création du compte dans le système Core Banking. Paramétrage des droits et des produits associés.',
        duree_estimee: '30 min',
        frequence: 'demande',
        kpi: 'Délai de création < 1h'
    }],
]);
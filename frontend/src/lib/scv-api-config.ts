/**
 * Configuration API pour SCV Maker
 * Port 8001 en local, URL Render en production
 */

const getScvApiBaseUrl = (): string => {
    if (process.env.NEXT_PUBLIC_SCV_API_URL) {
        return process.env.NEXT_PUBLIC_SCV_API_URL;
    }

    if (process.env.NODE_ENV === 'production') {
        return 'https://scv-maker-api.onrender.com'; // À remplacer par votre URL Render
    }

    return 'http://localhost:8001';
};

const SCV_API_BASE_URL = getScvApiBaseUrl();

export const SCV_API_CONFIG = {
    baseUrl: SCV_API_BASE_URL,

    endpoints: {
        /* ---------------------- GENERATION ---------------------- */
        generateFull: '/generate/full',
        generateDeposant: '/generate/deposant',
        generateHeritier: '/generate/heritier',
        generateCompte: '/generate/compte',
        generateRepresentant: '/generate/representant',

        /* ---------------------- VALIDATION ---------------------- */
        validateCoherence: '/validate/coherence',

        /* ---------------------- EXCEL IMPORT ---------------------- */
        importExcel: '/import/excel',
        downloadTemplate: '/download/template',

        /* ---------------------- REFERENTIELS ---------------------- */
        refs: '/refs',

        /* ---------------------- ROOT & HEALTH ---------------------- */
        root: '/',
    },

    /**
     * Construit l'URL complète pour un endpoint
     */
    getFullUrl(endpoint: string): string {
        return `${this.baseUrl}${endpoint}`;
    },

    /**
     * Vérifie si on est en mode développement
     */
    isDevelopment(): boolean {
        return process.env.NODE_ENV === 'development';
    },

    /**
     * Vérifie si on est en mode production
     */
    isProduction(): boolean {
        return process.env.NODE_ENV === 'production';
    },

    /**
     * Retourne des informations sur l'environnement actuel
     */
    getEnvironmentInfo() {
        return {
            environment: process.env.NODE_ENV || 'development',
            baseUrl: this.baseUrl,
            isProduction: this.isProduction(),
            isDevelopment: this.isDevelopment()
        };
    }
};

// Types pour SCV Maker
export interface SCVData {
    SCV: {
        identifiantDeposant: any;
        infosContact: any;
        representantLegal: any[];
        heritier: any[];
        compte: any[];
    };
}

export interface ImportResult {
    success: boolean;
    total_rows: number;
    generated: number;
    errors: Array<{
        row: number;
        deposant_id: string;
        error?: string;
        errors?: any[];
    }>;
    data: SCVData[];
}

// Log de debug en dev
if (typeof window !== 'undefined' && SCV_API_CONFIG.isDevelopment()) {
    console.log('🔧 SCV API Configuration:', SCV_API_CONFIG.getEnvironmentInfo());
}
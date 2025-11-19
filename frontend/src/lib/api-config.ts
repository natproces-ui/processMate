/**
 * Configuration centralisée de l'API
 * Gère automatiquement l'environnement (dev/production)
 */

// Détection automatique de l'environnement
const getApiBaseUrl = (): string => {
    // En priorité : variable d'environnement explicite
    if (process.env.NEXT_PUBLIC_API_URL) {
        return process.env.NEXT_PUBLIC_API_URL;
    }

    // Sinon, détection automatique selon l'environnement
    if (process.env.NODE_ENV === 'production') {
        // URL de production sur Render
        return 'https://processmate-back.onrender.com';
    }

    // Par défaut : développement local
    return 'http://localhost:8002';
};

const API_BASE_URL = getApiBaseUrl();

export const API_CONFIG = {
    baseUrl: API_BASE_URL,

    endpoints: {
        // Clinic endpoints
        parse: '/api/parse',
        parseDownload: '/api/parse/download',
        generateFlowchart: '/api/generate-flowchart',
        generateDotOnly: '/api/generate-dot-only',
        generateBPMN: '/api/generate-bpmn',

        // ProcessMate endpoints
        transcribe: '/api/transcribe',
        imgToBpmn: '/api/img-to-bpmn',
        imgToBpmnImprove: '/api/img-to-bpmn/improve',
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

// Log de l'environnement au chargement (seulement en dev côté client)
if (typeof window !== 'undefined' && API_CONFIG.isDevelopment()) {
    console.log('🔧 API Configuration:', API_CONFIG.getEnvironmentInfo());
}
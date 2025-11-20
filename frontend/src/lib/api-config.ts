/**
 * Configuration centralisée de l'API
 * Gère automatiquement l'environnement (dev/production)
 */

// Détection automatique de l'URL backend
const getApiBaseUrl = (): string => {
    // Priorité : variable d'environnement explicite
    if (process.env.NEXT_PUBLIC_API_URL) {
        return process.env.NEXT_PUBLIC_API_URL;
    }

    // Sinon détection automatique
    if (process.env.NODE_ENV === 'production') {
        return 'https://processmate-back.onrender.com';
    }

    // Par défaut : local
    return 'http://localhost:8002';
};

const API_BASE_URL = getApiBaseUrl();

export const API_CONFIG = {
    baseUrl: API_BASE_URL,

    endpoints: {
        /* ---------------------- PARSER ---------------------- */
        parse: '/api/parser/parse',
        parseText: '/api/parser/parse-text',
        parseDownload: '/api/parser/parse-download',
        analyze: '/api/parser/analyze',

        /* ---------------------- FLOWCHART ---------------------- */
        generateFlowchart: '/api/flowchart/generate',
        generateFlowchartFromJson: '/api/flowchart/generate-from-json',
        generateDotOnly: '/api/flowchart/generate-dot-only',
        flowchartFormats: '/api/flowchart/formats',

        /* ---------------------- BPMN ---------------------- */
        generateBPMN: '/api/bpmn/generate',
        generateBPMNxml: '/api/bpmn/generate-xml',
        bpmnFormats: '/api/bpmn/formats',
        bpmnInfo: '/api/bpmn/info',

        /* ---------------------- BPMN AI ---------------------- */
        bpmnAiEnrichTable: '/api/bpmn-ai/enrich-table',
        bpmnAiInfo: '/api/bpmn-ai/info',

        /* ---------------------- IMG → BPMN ---------------------- */
        imgToBpmnAnalyze: '/api/img-to-bpmn/analyze',
        imgToBpmnImprove: '/api/img-to-bpmn/improve',
        imgToBpmnBatchAnalyze: '/api/img-to-bpmn/batch-analyze',
        imgToBpmnInfo: '/api/img-to-bpmn/info',

        /* ---------------------- ROOT & HEALTH ---------------------- */
        apiRoot: '/api',
        health: '/health',
        quickStart: '/api/quick-start',
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

// Log de debug en dev (côté navigateur)
if (typeof window !== 'undefined' && API_CONFIG.isDevelopment()) {
    console.log('🔧 API Configuration:', API_CONFIG.getEnvironmentInfo());
}

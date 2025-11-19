/**
 * Configuration centralisée de l'API
 * Utilise automatiquement la bonne URL selon l'environnement
 */

export const API_CONFIG = {
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002',
    endpoints: {
        // Parser
        parse: '/api/parser/parse',
        parseDownload: '/api/parser/parse-download',

        // Flowchart
        generateFlowchart: '/api/flowchart/generate',
        generateDotOnly: '/api/flowchart/generate-dot-only',

        // BPMN
        generateBPMN: '/api/bpmn/generate',
        enrichBPMN: '/api/bpmn-ai/enrich',

        // Image to BPMN
        analyzeImage: '/api/img-to-bpmn/analyze',
        batchAnalyze: '/api/img-to-bpmn/batch-analyze',

        // Health
        health: '/health',
    },

    // Helper pour construire l'URL complète
    getFullUrl: (endpoint: string): string => {
        return `${API_CONFIG.baseURL}${endpoint}`;
    }
};

// Export également l'URL de base pour les cas simples
export const API_URL = API_CONFIG.baseURL;
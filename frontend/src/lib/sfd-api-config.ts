const getSfdApiBaseUrl = (): string => {
    if (process.env.NEXT_PUBLIC_SFD_API_URL) {
        return process.env.NEXT_PUBLIC_SFD_API_URL;
    }
    if (process.env.NODE_ENV === 'production') {
        return 'https://sfd-generator-api.onrender.com';
    }
    return 'http://localhost:8004';
};

const SFD_API_BASE_URL = getSfdApiBaseUrl();

export const SFD_API_CONFIG = {
    baseUrl: SFD_API_BASE_URL,

    endpoints: {
        format1Extract: '/api/format1/extract-json',
        format2Extract: '/api/format2/extract-json',
        wordGenerate: '/api/word/generate',
        wordDownload: '/api/word/download',
        // ← Nouveau endpoint unifié
        sfdGenerate: '/api/sfd/generate',
        sfdDownload: '/api/sfd/download',
        health: '/health',
    },

    getFullUrl(endpoint: string): string {
        return `${this.baseUrl}${endpoint}`;
    },

    isDevelopment: () => process.env.NODE_ENV === 'development',
    isProduction: () => process.env.NODE_ENV === 'production',
};
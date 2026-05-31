/**
 * Types pour les appels API SFD Generator
 */

import { SFDFormatType, SFDData } from './index';

// ============================================================================
// REQUÊTES API
// ============================================================================

/**
 * Extraction depuis fichier ou texte
 */
export interface ExtractRequest {
    file?: File;
    text?: string;
}

/**
 * Génération Word depuis JSON
 */
export interface WordGenerationRequest {
    json_data: SFDData;
    format_type: SFDFormatType;
    nom_fichier: string;
}

// ============================================================================
// RÉPONSES API
// ============================================================================

/**
 * Réponse santé de l'API
 */
export interface HealthResponse {
    status: string;
    version: string;
    environment: string;
    api_key_configured: boolean;
    services: {
        format1: string;
        format2: string;
        word_generator: string;
    };
}

/**
 * Erreur API
 */
export interface APIError {
    detail: string | Array<{
        type: string;
        loc: string[];
        msg: string;
        input: any;
    }>;
}

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Vérifie si une réponse est une erreur
 */
export function isAPIError(response: any): response is APIError {
    return 'detail' in response;
}

/**
 * Extrait le message d'erreur d'une réponse API
 */
export function getErrorMessage(error: unknown): string {
    if (typeof error === 'string') return error;

    if (error && typeof error === 'object') {
        if ('detail' in error) {
            const detail = (error as APIError).detail;
            if (typeof detail === 'string') return detail;
            if (Array.isArray(detail)) {
                return detail.map(e => e.msg).join(', ');
            }
        }
        if ('message' in error) {
            return String(error.message);
        }
    }

    return 'Une erreur inconnue est survenue';
}
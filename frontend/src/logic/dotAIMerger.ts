/**
 * Module d'enrichissement IA pour les tableaux BPMN
 * Enrichit UNIQUEMENT les colonnes manquantes sur demande (via bouton)
 */

import { TableRow } from './dotTableProcessor';

export interface AIEnrichmentResult {
    id: string;
    étape_améliorée: string;
    département: string;
    acteur: string;
    outil: string;
}

export interface AIEnrichmentResponse {
    success: boolean;
    enrichments: AIEnrichmentResult[];
    message: string;
}

/**
 * Appelle l'API d'enrichissement IA avec les lignes du tableau
 */
export async function enrichTable(rows: TableRow[]): Promise<AIEnrichmentResponse> {
    try {
        // Validation
        if (!rows || rows.length === 0) {
            throw new Error('Le tableau est vide');
        }

        console.log('📤 Envoi du tableau à l\'API IA:', {
            url: 'http://localhost:8002/api/bpmn-ai/enrich-table',
            rowCount: rows.length,
            preview: rows.slice(0, 2)
        });

        const response = await fetch('http://localhost:8002/api/bpmn-ai/enrich-table', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                rows: rows.map(row => ({
                    id: row.id,
                    étape: row.étape,
                    typeBpmn: row.typeBpmn,
                    actions: row.actions,
                    département: row.département || '',
                    acteur: row.acteur || '',
                    outil: row.outil || ''
                }))
            })
        });

        console.log('📥 Réponse API:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        });

        if (!response.ok) {
            let errorMessage = 'Erreur lors de l\'enrichissement IA';
            let errorDetail = '';

            try {
                const error = await response.json();
                console.error('❌ Erreur détaillée:', error);

                if (error.detail) {
                    if (typeof error.detail === 'string') {
                        errorDetail = error.detail;
                    } else if (Array.isArray(error.detail)) {
                        errorDetail = error.detail.map((e: any) =>
                            `${e.loc?.join('.')} : ${e.msg}`
                        ).join(', ');
                    } else if (typeof error.detail === 'object') {
                        errorDetail = JSON.stringify(error.detail);
                    }
                }

                errorMessage = errorDetail || error.message || errorMessage;
            } catch (parseError) {
                console.error('Erreur parsing JSON:', parseError);
                errorMessage = `${errorMessage} (Status: ${response.status})`;
            }

            throw new Error(errorMessage);
        }

        const result = await response.json();
        console.log('✅ Enrichissement réussi:', result);

        return result;

    } catch (error) {
        console.error('💥 Erreur enrichTable:', error);

        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error('Impossible de contacter le serveur. Vérifiez que l\'API est démarrée sur le port 8002');
        }

        throw error;
    }
}

/**
 * Fusionne les enrichissements IA avec les lignes existantes du tableau
 */
export function mergeAIEnrichments(
    rows: TableRow[],
    enrichments: AIEnrichmentResult[]
): TableRow[] {
    console.log('🔀 Fusion des enrichissements IA:', {
        rows: rows.length,
        enrichments: enrichments.length
    });

    // Créer une map pour accès rapide par ID
    const enrichmentMap = new Map<string, AIEnrichmentResult>();
    enrichments.forEach(enr => {
        enrichmentMap.set(enr.id, enr);
    });

    // Fusionner
    return rows.map(row => {
        const enrichment = enrichmentMap.get(row.id);

        if (!enrichment) {
            console.warn(`⚠️ Aucun enrichissement trouvé pour la ligne ${row.id}`);
            return row;
        }

        return {
            ...row,
            // ✅ Améliorer le titre si l'IA propose mieux
            étape: enrichment.étape_améliorée || row.étape,
            // ✅ Remplir les colonnes vides
            département: enrichment.département || row.département,
            acteur: enrichment.acteur || row.acteur,
            outil: enrichment.outil || row.outil
        };
    });
}
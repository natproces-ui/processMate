/**
 * Processeur pour convertir les fichiers .dot en données de tableau métier
 * VERSION API : Envoi direct à l'API FastAPI qui gère tout (parsing + enrichissement Gemini automatique)
 */

export interface TableRow {
    id: string;
    étape: string;
    typeBpmn: 'StartEvent' | 'Task' | 'ExclusiveGateway' | 'EndEvent';
    département: string;
    acteur: string;
    condition: string;
    outputOui: string;
    outputNon: string;
    outil: string;
    actions: string;
}

interface ProcessingResult {
    success: boolean;
    rows: TableRow[];
    errors: string[];
    warnings: string[];
}

/**
 * Envoie le fichier .dot à l'API FastAPI qui le parse et l'enrichit automatiquement avec Gemini
 */
export async function processDotToTable(dotSource: string): Promise<ProcessingResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Vérification initiale
    if (!dotSource || dotSource.trim() === '') {
        errors.push('Le contenu DOT est vide');
        return { success: false, rows: [], errors, warnings };
    }

    try {
        console.log('📤 Envoi du fichier .dot à l\'API pour parsing et enrichissement automatique...');

        // URL de l'API (à configurer dans .env.local)
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';

        const response = await fetch(`${API_URL}/api/dot-to-table`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                dotSource: dotSource,
                useAI: true  // ✅ Enrichissement Gemini automatique activé
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
                errorData.detail ||
                `Erreur API: ${response.status} ${response.statusText}`
            );
        }

        const result = await response.json();

        if (!result.success) {
            errors.push('L\'API a retourné une erreur');
            return { success: false, rows: [], errors, warnings };
        }

        console.log(`✅ ${result.rows.length} lignes enrichies par Gemini reçues`);

        // Ajouter les warnings de l'API
        if (result.warnings && result.warnings.length > 0) {
            warnings.push(...result.warnings);
        }

        // Log des métadonnées pour debug
        if (result.metadata) {
            console.log('📊 Métadonnées du processus:', {
                nom: result.metadata.graph_name,
                noeuds: result.metadata.nodes_count,
                arêtes: result.metadata.edges_count,
                enrichissement_gemini: result.metadata.ai_enrichment ? '✅ Actif' : '❌ Désactivé',
                composition: {
                    start_events: result.metadata.start_events,
                    tasks: result.metadata.tasks,
                    gateways: result.metadata.gateways,
                    end_events: result.metadata.end_events
                }
            });
        }

        return {
            success: true,
            rows: result.rows,
            errors: [],
            warnings
        };

    } catch (err) {
        console.error('❌ Erreur lors de l\'appel API:', err);

        errors.push(
            err instanceof Error
                ? `Impossible de contacter l'API: ${err.message}`
                : 'Erreur inconnue lors de l\'appel API'
        );

        // Note: Pas de fallback local - on dépend de l'API
        return { success: false, rows: [], errors, warnings };
    }
}
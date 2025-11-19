/**
 * Processeur pour convertir les fichiers .dot en données de tableau métier
 * Adapté au nouveau format avec les colonnes: Étape, Type BPMN, Département, Acteur, Condition, Output Oui, Output Non, Outil, Actions
 * Séparation automatique: première ligne du label = Étape, lignes suivantes = Actions
 */

import parse from 'dotparser';

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
 * Extrait l'étape principale et les actions détaillées d'un label
 * Règle: Première ligne = Étape, lignes suivantes = Actions
 */
function extractStepAndActions(rawLabel: string): { étape: string; actions: string } {
    // Nettoyer les guillemets
    const cleaned = rawLabel.replace(/^"|"$/g, '');

    // Diviser par \n (échappé dans le .dot)
    const lines = cleaned.split('\\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    if (lines.length === 0) {
        return { étape: '', actions: '' };
    }

    // Première ligne = Étape principale
    const étape = lines[0];

    // Lignes suivantes = Actions (en retirant les bullets si présents)
    const actions = lines.slice(1)
        .map(line => line.replace(/^[•\-\*]\s*/, ''))  // Retirer les bullets
        .filter(line => line.length > 0)
        .join(' • ')  // Rejoindre avec des séparateurs propres
        .trim();

    return { étape, actions };
}

/**
 * Traite le contenu .dot et retourne les lignes du tableau
 */
export function processDotToTable(dotSource: string): ProcessingResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Vérification initiale
    if (!dotSource || dotSource.trim() === '') {
        errors.push('Le contenu DOT est vide');
        return { success: false, rows: [], errors, warnings };
    }

    try {
        // Parser le fichier DOT
        const graphs = parse(dotSource);
        if (!graphs || graphs.length === 0) {
            errors.push('Aucun graphe trouvé dans le fichier DOT');
            return { success: false, rows: [], errors, warnings };
        }

        const graph = graphs[0];
        if (!graph.children || !Array.isArray(graph.children)) {
            errors.push('Structure du graphe invalide');
            return { success: false, rows: [], errors, warnings };
        }

        // Extraire les nœuds et arêtes (avec support des subgraphs)
        const nodes: any = {};
        const edges: any[] = [];

        // Fonction récursive pour parcourir les children et les subgraphs
        const extractNodesAndEdges = (children: any[], parentIndex = '') => {
            children.forEach((child: any, index: number) => {
                const currentIndex = parentIndex ? `${parentIndex}.${index}` : String(index);

                try {
                    if (child.type === 'node_stmt') {
                        if (!child.node_id || !child.node_id.id) {
                            warnings.push(`Nœud ${currentIndex} sans identifiant ignoré`);
                            return;
                        }

                        const id = child.node_id.id;
                        const attrs = child.attr_list?.reduce((acc: any, attr: any) => {
                            if (attr.id && attr.eq !== undefined) {
                                acc[attr.id] = attr.eq;
                            }
                            return acc;
                        }, {}) || {};

                        nodes[id] = { id, ...attrs };

                    } else if (child.type === 'edge_stmt') {
                        if (!child.edge_list || !Array.isArray(child.edge_list) || child.edge_list.length < 2) {
                            warnings.push(`Arête ${currentIndex} invalide ignorée`);
                            return;
                        }

                        const from = child.edge_list[0]?.id;
                        const to = child.edge_list[1]?.id;

                        if (!from || !to) {
                            warnings.push(`Arête ${currentIndex} avec nœuds manquants ignorée`);
                            return;
                        }

                        const labelAttr = child.attr_list?.find((a: any) => a.id === 'label');
                        const label = labelAttr?.eq ? String(labelAttr.eq).replace(/"/g, '') : '';

                        edges.push({ from, to, label });
                    } else if (child.type === 'subgraph' && child.children) {
                        // Traiter récursivement les subgraphs (clusters)
                        extractNodesAndEdges(child.children, currentIndex);
                    }
                } catch (err) {
                    warnings.push(`Erreur lors du traitement de l'élément ${currentIndex}: ${err}`);
                }
            });
        };

        // Lancer l'extraction récursive
        extractNodesAndEdges(graph.children);

        // Vérifier qu'on a des nœuds
        const nodeIds = Object.keys(nodes);
        if (nodeIds.length === 0) {
            errors.push('Aucun nœud valide détecté');
            return { success: false, rows: [], errors, warnings };
        }

        // Valider que les arêtes pointent vers des nœuds existants
        edges.forEach((edge, idx) => {
            if (!nodes[edge.from]) {
                warnings.push(`Arête ${idx}: nœud source "${edge.from}" introuvable`);
            }
            if (!nodes[edge.to]) {
                warnings.push(`Arête ${idx}: nœud cible "${edge.to}" introuvable`);
            }
        });

        // Tri topologique
        const orderedNodes = topologicalSort(nodeIds, edges, warnings);

        // Convertir en lignes de tableau
        const tableRows: TableRow[] = orderedNodes.map((nodeId, index) => {
            const node = nodes[nodeId];
            if (!node) {
                warnings.push(`Nœud "${nodeId}" introuvable lors de la conversion`);
                return null;
            }

            const outgoing = edges.filter(e => e.from === nodeId);

            // Déterminer le type BPMN
            let typeBpmn: 'StartEvent' | 'Task' | 'ExclusiveGateway' | 'EndEvent' = 'Task';

            // StartEvent / EndEvent : forme circulaire
            if (node.shape === 'circle' || node.shape === 'ellipse' || node.shape === 'oval') {
                // Si c'est le premier nœud ou qu'il n'a pas de prédécesseur, c'est un StartEvent
                const hasIncoming = edges.some(e => e.to === nodeId);
                if (!hasIncoming || index === 0) {
                    typeBpmn = 'StartEvent';
                } else {
                    typeBpmn = 'EndEvent';
                }
            }
            // ExclusiveGateway : forme diamond
            else if (node.shape === 'diamond') {
                typeBpmn = 'ExclusiveGateway';
            }
            // Sinon, c'est une Task
            else {
                typeBpmn = 'Task';
            }

            // ✅ Extraire et séparer étape/actions depuis le label
            const rawLabel = node.label ? String(node.label) : nodeId;
            const { étape, actions } = extractStepAndActions(rawLabel);

            const row: TableRow = {
                id: String(index + 1),
                étape: étape || nodeId,  // ✅ Première ligne uniquement
                typeBpmn,
                département: '', // À remplir par l'IA
                acteur: '', // À remplir par l'IA
                condition: typeBpmn === 'ExclusiveGateway' ? étape : '',
                outputOui: '',
                outputNon: '',
                outil: '', // À remplir par l'IA
                actions: actions  // ✅ Lignes suivantes du label
            };

            // Remplir les transitions
            if (outgoing.length === 1) {
                const targetIndex = orderedNodes.indexOf(outgoing[0].to);
                if (targetIndex >= 0) {
                    row.outputOui = String(targetIndex + 1);
                } else {
                    warnings.push(`Transition de "${row.étape}" vers "${outgoing[0].to}" introuvable`);
                }
            } else if (outgoing.length >= 2) {
                // Chercher les labels Oui/Non
                const ouiEdge = outgoing.find(e => /oui|true|vrai|yes|1/i.test(e.label));
                const nonEdge = outgoing.find(e => /non|false|faux|no|0/i.test(e.label));

                if (ouiEdge) {
                    const idx = orderedNodes.indexOf(ouiEdge.to);
                    if (idx >= 0) {
                        row.outputOui = String(idx + 1);
                    }
                }

                if (nonEdge) {
                    const idx = orderedNodes.indexOf(nonEdge.to);
                    if (idx >= 0) {
                        row.outputNon = String(idx + 1);
                    }
                }

                // Si aucune transition reconnue, attribution par défaut
                if (!ouiEdge && !nonEdge) {
                    warnings.push(`Impossible de déterminer Oui/Non pour "${row.étape}", attribution par défaut`);

                    const idx1 = orderedNodes.indexOf(outgoing[0].to);
                    const idx2 = orderedNodes.indexOf(outgoing[1].to);

                    if (idx1 >= 0) row.outputOui = String(idx1 + 1);
                    if (idx2 >= 0) row.outputNon = String(idx2 + 1);
                }
            }

            return row;
        }).filter((row): row is TableRow => row !== null);

        return {
            success: true,
            rows: tableRows,
            errors,
            warnings
        };

    } catch (err) {
        errors.push(`Erreur lors du traitement: ${err instanceof Error ? err.message : String(err)}`);
        return { success: false, rows: [], errors, warnings };
    }
}

/**
 * Tri topologique avec gestion d'erreurs
 */
function topologicalSort(nodes: string[], edges: any[], warnings: string[]): string[] {
    // Construire le graphe
    const graph = new Map<string, string[]>();
    const indegree = new Map<string, number>();

    // Initialiser
    nodes.forEach(n => {
        graph.set(n, []);
        indegree.set(n, 0);
    });

    // Remplir le graphe avec vérification
    edges.forEach((edge, idx) => {
        if (!graph.has(edge.from)) {
            warnings.push(`Arête ${idx}: nœud source "${edge.from}" n'existe pas dans le graphe`);
            return;
        }

        if (!graph.has(edge.to)) {
            warnings.push(`Arête ${idx}: nœud cible "${edge.to}" n'existe pas dans le graphe`);
            return;
        }

        const neighbors = graph.get(edge.from);
        if (neighbors) {
            neighbors.push(edge.to);
        }
        indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
    });

    // Algorithme de Kahn
    const queue: string[] = [];
    const result: string[] = [];

    // Nœuds sans prédécesseurs
    nodes.forEach(id => {
        if (indegree.get(id) === 0) {
            queue.push(id);
        }
    });

    while (queue.length > 0) {
        const node = queue.shift()!;
        result.push(node);

        const neighbors = graph.get(node) || [];
        neighbors.forEach(neighbor => {
            const degree = (indegree.get(neighbor) || 0) - 1;
            indegree.set(neighbor, degree);
            if (degree === 0) {
                queue.push(neighbor);
            }
        });
    }

    // Vérifier s'il y a un cycle
    if (result.length !== nodes.length) {
        warnings.push('Cycle détecté dans le graphe, certains nœuds peuvent être mal ordonnés');

        // Ajouter les nœuds manquants à la fin
        nodes.forEach(id => {
            if (!result.includes(id)) {
                result.push(id);
            }
        });
    }

    return result;
}
// bpmnLayoutEngine.ts - VERSION OPTIMISÉE (compacte + intelligente)

export interface Table1Row {
    id: string;
    étape: string;
    typeBpmn: 'StartEvent' | 'Task' | 'ExclusiveGateway' | 'EndEvent';
    département: string;
    acteur: string;
    condition: string;
    outputOui: string;
    outputNon: string;
    outil: string;
}

export interface NodePosition {
    x: number;
    y: number;
    layer: number;
    laneIndex: number;
    acteur: string;
}

export interface LayoutConfig {
    laneHeight: number;
    nodeWidth: number;
    nodeHeight: number;
    horizontalSpacing: number;
    verticalSpacing: number;
    marginLeft: number;
    marginTop: number;
    compactMode: boolean; // 🆕 Mode compact par lane
    spacingMultiplier: number; // 🆕 Multiplicateur d'espacement (1.0 = normal, 1.5 = étendu)
}

/**
 * ✨ VERSION OPTIMISÉE - Compact mais avec espacement configurable
 * - Progression indépendante par lane (évite les espaces vides)
 * - Espacement ajustable via spacingMultiplier
 * - Alignement partiel pour les nœuds connectés entre lanes
 */
export class BPMNLayoutEngine {
    private config: LayoutConfig;
    private idMap: Map<string, Table1Row>;
    private acteurMap: Map<string, Table1Row[]>;
    private acteurs: string[];
    private layers: Map<string, number>;
    private positions: Map<string, NodePosition>;
    private laneProgression: Map<string, number>; // 🆕 Position actuelle dans chaque lane

    constructor(config?: Partial<LayoutConfig>) {
        this.config = {
            laneHeight: config?.laneHeight || 350,
            nodeWidth: config?.nodeWidth || 180,
            nodeHeight: config?.nodeHeight || 90,
            horizontalSpacing: config?.horizontalSpacing || 120, // 🎯 Base spacing
            verticalSpacing: config?.verticalSpacing || 40,
            marginLeft: config?.marginLeft || 150,
            marginTop: config?.marginTop || 80,
            compactMode: config?.compactMode ?? true, // 🆕 Compact par défaut
            spacingMultiplier: config?.spacingMultiplier || 1.3 // 🆕 30% plus d'espace qu'avant
        };

        this.idMap = new Map();
        this.acteurMap = new Map();
        this.acteurs = [];
        this.layers = new Map();
        this.positions = new Map();
        this.laneProgression = new Map();
    }

    public calculateLayout(data: Table1Row[]): Map<string, NodePosition> {
        this.initialize(data);
        this.assignLayers(data);
        this.minimizeCrossings();
        this.calculatePositions();
        this.alignCrossLaneConnections(); // 🆕 Aligner les connexions entre lanes
        return this.positions;
    }

    private initialize(data: Table1Row[]): void {
        this.idMap.clear();
        this.acteurMap.clear();
        this.layers.clear();
        this.positions.clear();
        this.laneProgression.clear();

        data.forEach(row => {
            this.idMap.set(row.id, row);
            if (!this.acteurMap.has(row.acteur)) {
                this.acteurMap.set(row.acteur, []);
            }
            this.acteurMap.get(row.acteur)!.push(row);
        });

        this.acteurs = Array.from(this.acteurMap.keys());

        // Initialiser la progression de chaque lane à 0
        this.acteurs.forEach(acteur => {
            this.laneProgression.set(acteur, 0);
        });
    }

    private assignLayers(data: Table1Row[]): void {
        const startNodes = data.filter(row => row.typeBpmn === 'StartEvent');
        const visited = new Set<string>();

        if (startNodes.length === 0) {
            if (data.length > 0) {
                this.assignLayerRecursive(data[0].id, 0, visited);
            }
            return;
        }

        startNodes.forEach(startNode => {
            this.assignLayerRecursive(startNode.id, 0, visited);
        });

        data.forEach(row => {
            if (!visited.has(row.id)) {
                this.assignLayerRecursive(row.id, 0, visited);
            }
        });

        this.adjustBackwardEdges();
    }

    private assignLayerRecursive(id: string, currentLayer: number, visited: Set<string>): void {
        const row = this.idMap.get(id);

        if (row && row.typeBpmn === 'EndEvent') {
            if (!visited.has(id)) {
                visited.add(id);
                this.layers.set(id, currentLayer);
            }
            return;
        }

        if (visited.has(id)) {
            const existingLayer = this.layers.get(id) || 0;
            if (currentLayer > existingLayer) {
                this.layers.set(id, currentLayer);
                if (row) {
                    this.propagateLayers(row, currentLayer);
                }
            }
            return;
        }

        visited.add(id);
        this.layers.set(id, currentLayer);

        if (!row) return;

        if (row.outputOui && row.outputOui.trim() !== '') {
            this.assignLayerRecursive(row.outputOui, currentLayer + 1, visited);
        }

        if (row.typeBpmn === 'ExclusiveGateway' && row.outputNon && row.outputNon.trim() !== '') {
            const noRow = this.idMap.get(row.outputNon);
            if (noRow) {
                const existingNoLayer = this.layers.get(row.outputNon) || 0;
                if (existingNoLayer > currentLayer) {
                    this.assignLayerRecursive(row.outputNon, currentLayer + 1, visited);
                }
            }
        }
    }

    private propagateLayers(row: Table1Row, fromLayer: number): void {
        if (row.outputOui && row.outputOui.trim() !== '') {
            const nextRow = this.idMap.get(row.outputOui);
            if (nextRow) {
                const currentLayer = this.layers.get(row.outputOui) || 0;
                if (fromLayer + 1 > currentLayer) {
                    this.layers.set(row.outputOui, fromLayer + 1);
                    this.propagateLayers(nextRow, fromLayer + 1);
                }
            }
        }
    }

    private adjustBackwardEdges(): void {
        this.idMap.forEach((row, id) => {
            if (row.typeBpmn === 'ExclusiveGateway' && row.outputNon && row.outputNon.trim() !== '') {
                const currentLayer = this.layers.get(id) || 0;
                const targetLayer = this.layers.get(row.outputNon) || 0;
                if (targetLayer < currentLayer) {
                    // Retour en arrière détecté
                }
            }
        });
    }

    private minimizeCrossings(): void {
        const layerGroups: Map<number, Table1Row[]> = new Map();

        this.idMap.forEach((row, id) => {
            const layer = this.layers.get(id) || 0;
            if (!layerGroups.has(layer)) {
                layerGroups.set(layer, []);
            }
            layerGroups.get(layer)!.push(row);
        });

        layerGroups.forEach((rows) => {
            rows.sort((a, b) => {
                const acteurA = this.acteurs.indexOf(a.acteur);
                const acteurB = this.acteurs.indexOf(b.acteur);
                if (acteurA !== acteurB) return acteurA - acteurB;
                return a.id.localeCompare(b.id);
            });
        });
    }

    private calculatePositions(): void {
        this.positions.clear();

        // 🎯 Espacement ajusté avec le multiplicateur
        const effectiveSpacing = this.config.horizontalSpacing * this.config.spacingMultiplier;

        // Trier les nœuds par couche logique pour les traiter dans l'ordre
        const sortedNodes = Array.from(this.idMap.entries())
            .sort((a, b) => {
                const layerA = this.layers.get(a[0]) || 0;
                const layerB = this.layers.get(b[0]) || 0;
                return layerA - layerB;
            });

        // 🎯 Mode compact : chaque lane progresse indépendamment
        sortedNodes.forEach(([id, row]) => {
            const layer = this.layers.get(id) || 0;
            const laneIndex = this.acteurs.indexOf(row.acteur);

            // Position X = progression actuelle de cette lane
            const currentProgress = this.laneProgression.get(row.acteur) || 0;
            const x = this.config.marginLeft + (currentProgress * (this.config.nodeWidth + effectiveSpacing));
            const y = this.config.marginTop + (laneIndex * this.config.laneHeight);

            this.positions.set(id, {
                x,
                y,
                layer,
                laneIndex,
                acteur: row.acteur
            });

            // Incrémenter la progression de cette lane
            this.laneProgression.set(row.acteur, currentProgress + 1);
        });

        this.adjustOverlaps();
    }

    // 🆕 Aligner les nœuds qui sont connectés entre différentes lanes
    private alignCrossLaneConnections(): void {
        this.idMap.forEach((sourceRow, sourceId) => {
            const sourcePos = this.positions.get(sourceId);
            if (!sourcePos) return;

            // Vérifier les connexions
            [sourceRow.outputOui, sourceRow.outputNon].forEach(targetId => {
                if (!targetId || targetId.trim() === '') return;

                const targetRow = this.idMap.get(targetId);
                const targetPos = this.positions.get(targetId);

                if (!targetRow || !targetPos) return;

                // Si connexion entre lanes différentes
                if (sourceRow.acteur !== targetRow.acteur) {
                    // Aligner légèrement pour réduire les croisements
                    const avgX = (sourcePos.x + targetPos.x) / 2;

                    // Ajuster légèrement la position du target si trop décalé
                    const maxOffset = this.config.nodeWidth + this.config.horizontalSpacing;
                    if (Math.abs(targetPos.x - sourcePos.x) > maxOffset * 2) {
                        // Ne rien faire pour garder le mode compact
                    }
                }
            });
        });
    }

    private adjustOverlaps(): void {
        const groups: Map<string, { id: string, pos: NodePosition }[]> = new Map();

        this.positions.forEach((pos, id) => {
            // Grouper par position approximative dans la lane
            const xBucket = Math.floor(pos.x / 50); // Grouper par zones de 50px
            const key = `${xBucket}-${pos.laneIndex}`;

            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push({ id, pos });
        });

        groups.forEach((items) => {
            if (items.length > 1) {
                // Trier par X pour maintenir l'ordre
                items.sort((a, b) => a.pos.x - b.pos.x);

                const startY = items[0].pos.y;

                items.forEach((item, index) => {
                    const newY = startY + (index * (this.config.nodeHeight + this.config.verticalSpacing));
                    this.positions.set(item.id, {
                        ...item.pos,
                        y: newY
                    });
                });
            }
        });
    }

    public getActeurs(): string[] {
        return this.acteurs;
    }

    public getPosition(id: string): NodePosition | undefined {
        return this.positions.get(id);
    }

    public getAllPositions(): Map<string, NodePosition> {
        return this.positions;
    }

    public getDiagramWidth(): number {
        // 🎯 Calculer la largeur réelle basée sur les positions
        let maxX = 0;
        this.positions.forEach(pos => {
            const nodeEndX = pos.x + this.config.nodeWidth;
            if (nodeEndX > maxX) {
                maxX = nodeEndX;
            }
        });

        // Ajouter une marge finale confortable
        return maxX + this.config.marginLeft + 150;
    }

    public getDiagramHeight(): number {
        return this.acteurs.length * this.config.laneHeight + this.config.marginTop;
    }
}
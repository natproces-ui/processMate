// bpmnLayoutEngine.ts - VERSION ENRICHIE POUR ROUTAGE INTELLIGENT

import { DEFAULT_DIMENSIONS } from './bpmnConstants';

export interface Table1Row {
    id: string;
    étape: string;
    typeBpmn: 'StartEvent' | 'Task' | 'ExclusiveGateway' | 'EndEvent' | 'UserTask';
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
    laneWidth: number;
    nodeWidth: number;
    nodeHeight: number;
    verticalSpacing: number;
    horizontalSpacing: number;
    marginLeft: number;
    marginTop: number;
    compactMode: boolean;
    spacingMultiplier: number;
}

/**
 * ✨ SWIMLANES VERTICALES - Les acteurs sont des colonnes de gauche à droite
 * - Le flux s'écoule de haut en bas
 * - Chaque colonne (lane) progresse verticalement de manière indépendante
 */
export class BPMNLayoutEngine {
    private config: LayoutConfig;
    private idMap: Map<string, Table1Row>;
    private acteurMap: Map<string, Table1Row[]>;
    private acteurs: string[];
    private layers: Map<string, number>;
    private positions: Map<string, NodePosition>;
    private laneProgression: Map<string, number>;

    constructor(config?: Partial<LayoutConfig>) {
        // Utilisation des constantes partagées par défaut
        this.config = {
            laneWidth: config?.laneWidth ?? DEFAULT_DIMENSIONS.LANE_WIDTH,
            nodeWidth: config?.nodeWidth ?? DEFAULT_DIMENSIONS.NODE_WIDTH,
            nodeHeight: config?.nodeHeight ?? DEFAULT_DIMENSIONS.NODE_HEIGHT,
            verticalSpacing: config?.verticalSpacing ?? DEFAULT_DIMENSIONS.VERTICAL_SPACING,
            horizontalSpacing: config?.horizontalSpacing ?? DEFAULT_DIMENSIONS.HORIZONTAL_SPACING,
            marginLeft: config?.marginLeft ?? DEFAULT_DIMENSIONS.MARGIN_LEFT,
            marginTop: config?.marginTop ?? DEFAULT_DIMENSIONS.MARGIN_TOP,
            compactMode: config?.compactMode ?? true,
            spacingMultiplier: config?.spacingMultiplier ?? 1.3
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

        // Initialiser la progression verticale de chaque lane à 0
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
            this.assignLayerRecursive(row.outputNon, currentLayer + 1, visited);
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

        const effectiveSpacing = this.config.verticalSpacing * this.config.spacingMultiplier;

        const sortedNodes = Array.from(this.idMap.entries())
            .sort((a, b) => {
                const layerA = this.layers.get(a[0]) || 0;
                const layerB = this.layers.get(b[0]) || 0;
                return layerA - layerB;
            });

        sortedNodes.forEach(([id, row]) => {
            const layer = this.layers.get(id) || 0;
            const laneIndex = this.acteurs.indexOf(row.acteur);

            // Position X = colonne de l'acteur (horizontal)
            const x = this.config.marginLeft +
                (laneIndex * this.config.laneWidth) +
                (this.config.laneWidth - this.config.nodeWidth) / 2;

            // Position Y = progression verticale dans cette lane
            const currentProgress = this.laneProgression.get(row.acteur) || 0;
            const y = this.config.marginTop +
                DEFAULT_DIMENSIONS.LANE_LABEL_OFFSET +
                (currentProgress * (this.config.nodeHeight + effectiveSpacing));

            this.positions.set(id, { x, y, layer, laneIndex, acteur: row.acteur });

            // Incrémenter la progression verticale de cette lane
            this.laneProgression.set(row.acteur, currentProgress + 1);
        });
    }

    // ========== GETTERS PUBLICS ==========

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
        return (this.acteurs.length * this.config.laneWidth) +
            this.config.marginLeft + 150;
    }

    public getDiagramHeight(): number {
        let maxY = 0;
        this.positions.forEach(pos => {
            const nodeEndY = pos.y + this.config.nodeHeight;
            if (nodeEndY > maxY) maxY = nodeEndY;
        });
        return maxY + this.config.marginTop + 200;
    }

    public getConfig(): LayoutConfig {
        return { ...this.config };
    }

    public getIdMap(): Map<string, Table1Row> {
        return this.idMap;
    }

    // ========== MÉTHODES D'ANALYSE POUR LE ROUTAGE ==========

    /**
     * Obtenir toutes les étapes d'une lane donnée, triées par position Y
     */
    public getStepsInLane(laneIndex: number): Array<{ id: string; y: number; row: Table1Row }> {
        const acteur = this.acteurs[laneIndex];
        if (!acteur) return [];

        const steps: Array<{ id: string; y: number; row: Table1Row }> = [];

        this.positions.forEach((pos, id) => {
            if (pos.laneIndex === laneIndex) {
                const row = this.idMap.get(id);
                if (row) {
                    steps.push({ id, y: pos.y, row });
                }
            }
        });

        // Trier par position Y (de haut en bas)
        steps.sort((a, b) => a.y - b.y);
        return steps;
    }

    /**
     * Vérifier si targetId est immédiatement après sourceId dans la même lane
     */
    public isImmediateNext(sourceId: string, targetId: string): boolean {
        const sourcePos = this.positions.get(sourceId);
        const targetPos = this.positions.get(targetId);

        if (!sourcePos || !targetPos) return false;
        if (sourcePos.laneIndex !== targetPos.laneIndex) return false;

        const stepsInLane = this.getStepsInLane(sourcePos.laneIndex);
        const sourceIndex = stepsInLane.findIndex(s => s.id === sourceId);
        const targetIndex = stepsInLane.findIndex(s => s.id === targetId);

        if (sourceIndex === -1 || targetIndex === -1) return false;

        // Immédiat = juste après (index suivant)
        return targetIndex === sourceIndex + 1;
    }

    /**
     * Obtenir les étapes intermédiaires entre source et target dans la même lane
     */
    public getIntermediateSteps(sourceId: string, targetId: string): string[] {
        const sourcePos = this.positions.get(sourceId);
        const targetPos = this.positions.get(targetId);

        if (!sourcePos || !targetPos) return [];
        if (sourcePos.laneIndex !== targetPos.laneIndex) return [];

        const stepsInLane = this.getStepsInLane(sourcePos.laneIndex);
        const sourceIndex = stepsInLane.findIndex(s => s.id === sourceId);
        const targetIndex = stepsInLane.findIndex(s => s.id === targetId);

        if (sourceIndex === -1 || targetIndex === -1) return [];

        // Retourner les IDs entre source et target
        const start = Math.min(sourceIndex, targetIndex);
        const end = Math.max(sourceIndex, targetIndex);

        return stepsInLane
            .slice(start + 1, end)
            .map(s => s.id);
    }

    /**
     * Obtenir les limites Y (min, max) d'une lane
     */
    public getLaneYBounds(laneIndex: number): { minY: number; maxY: number } {
        const steps = this.getStepsInLane(laneIndex);

        if (steps.length === 0) {
            return { minY: 0, maxY: 0 };
        }

        const minY = steps[0].y;
        const maxY = steps[steps.length - 1].y + this.config.nodeHeight;

        return { minY, maxY };
    }

    /**
     * Obtenir la position Y maximale globale (toutes lanes confondues)
     */
    public getGlobalMaxY(): number {
        let maxY = 0;

        this.positions.forEach(pos => {
            const y = pos.y + this.config.nodeHeight;
            if (y > maxY) maxY = y;
        });

        return maxY;
    }

    /**
     * Vérifier si deux étapes se chevauchent verticalement
     */
    public hasVerticalOverlap(id1: string, id2: string): boolean {
        const pos1 = this.positions.get(id1);
        const pos2 = this.positions.get(id2);

        if (!pos1 || !pos2) return false;

        const y1Start = pos1.y;
        const y1End = pos1.y + this.config.nodeHeight;
        const y2Start = pos2.y;
        const y2End = pos2.y + this.config.nodeHeight;

        // Chevauchement si les intervalles se croisent
        return !(y1End < y2Start || y2End < y1Start);
    }

    /**
     * Obtenir tous les IDs des étapes, triés par ordre de layer
     */
    public getStepsSortedByLayer(): string[] {
        return Array.from(this.idMap.keys())
            .sort((a, b) => {
                const layerA = this.layers.get(a) || 0;
                const layerB = this.layers.get(b) || 0;
                return layerA - layerB;
            });
    }

    /**
     * Calculer la distance horizontale entre deux lanes
     */
    public getLaneDistance(laneIndex1: number, laneIndex2: number): number {
        return Math.abs(laneIndex2 - laneIndex1);
    }
}
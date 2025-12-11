// bpmnRouter.ts - ROUTAGE INTELLIGENT BASÉ SUR L'ANALYSE DU LAYOUT

import type { Table1Row, NodePosition } from './bpmnLayoutEngine';
import { BPMNLayoutEngine } from './bpmnLayoutEngine';
import { BPMN_TYPES } from './bpmnConstants';

export interface Arrow {
    id: string;
    sourceId: string;
    targetId: string;
    type: 'yes' | 'no' | 'next';
    sourceRow: Table1Row;
    targetRow: Table1Row;
    sourcePos: NodePosition;
    targetPos: NodePosition;
}

export interface RouterConfig {
    laneWidth: number;
    nodeWidth: number;
    nodeHeight: number;
    gatewaySize: number;
    eventSize: number;
    corridorOffset: number;
}

/**
 * 🎯 ROUTER INTELLIGENT - Analyse le layout et applique les règles de routage
 */
export class BPMNRouter {
    private config: RouterConfig;
    private layout: BPMNLayoutEngine;
    private arrows: Arrow[] = [];
    private routedPaths: Map<string, Array<{ x: number; y: number }>> = new Map();

    constructor(config: RouterConfig, layout: BPMNLayoutEngine) {
        this.config = config;
        this.layout = layout;
    }

    /**
     * EXTRACTION DES FLÈCHES
     */
    public extractArrows(
        data: Table1Row[],
        idMap: Map<string, Table1Row>,
        positions: Map<string, NodePosition>
    ): void {
        this.arrows = [];

        data.forEach(row => {
            // Flèche OUI/NEXT
            if (row.outputOui && row.outputOui.trim() !== '') {
                const targetRow = idMap.get(row.outputOui);
                const targetPos = positions.get(row.outputOui);

                if (targetRow && targetPos) {
                    const sourcePos = positions.get(row.id);
                    if (sourcePos) {
                        const arrowType = row.typeBpmn === BPMN_TYPES.EXCLUSIVE_GATEWAY ? 'yes' : 'next';

                        this.arrows.push({
                            id: `${row.id}_${arrowType}`,
                            sourceId: row.id,
                            targetId: row.outputOui,
                            type: arrowType,
                            sourceRow: row,
                            targetRow: targetRow,
                            sourcePos: sourcePos,
                            targetPos: targetPos
                        });
                    }
                }
            }

            // Flèche NON (Gateway uniquement)
            if (row.typeBpmn === BPMN_TYPES.EXCLUSIVE_GATEWAY &&
                row.outputNon && row.outputNon.trim() !== '') {
                const targetRow = idMap.get(row.outputNon);
                const targetPos = positions.get(row.outputNon);

                if (targetRow && targetPos) {
                    const sourcePos = positions.get(row.id);
                    if (sourcePos) {
                        this.arrows.push({
                            id: `${row.id}_no`,
                            sourceId: row.id,
                            targetId: row.outputNon,
                            type: 'no',
                            sourceRow: row,
                            targetRow: targetRow,
                            sourcePos: sourcePos,
                            targetPos: targetPos
                        });
                    }
                }
            }
        });

        console.log(`\n📊 Router: ${this.arrows.length} flèches extraites\n`);
    }

    /**
     * ROUTER TOUTES LES FLÈCHES
     */
    public routeAll(): Map<string, Array<{ x: number; y: number }>> {
        this.routedPaths.clear();

        this.arrows.forEach(arrow => {
            const waypoints = this.routeArrow(arrow);
            this.routedPaths.set(arrow.id, waypoints);
        });

        return this.routedPaths;
    }

    /**
     * ROUTER UNE FLÈCHE - Détecte le cas et applique la règle
     */
    private routeArrow(arrow: Arrow): Array<{ x: number; y: number }> {
        const sameLane = arrow.sourcePos.laneIndex === arrow.targetPos.laneIndex;
        const laneDistance = arrow.targetPos.laneIndex - arrow.sourcePos.laneIndex;

        console.log(`\n🔍 Routage: ${arrow.id}`);
        console.log(`   Source: lane ${arrow.sourcePos.laneIndex}, Y=${arrow.sourcePos.y}`);
        console.log(`   Target: lane ${arrow.targetPos.laneIndex}, Y=${arrow.targetPos.y}`);
        console.log(`   SameLane: ${sameLane}, Distance: ${laneDistance}`);

        // CAS 1 : MÊME LANE
        if (sameLane) {
            return this.routeSameLane(arrow);
        }

        // CAS 2 : LANE IMMÉDIATE (n-1 ou n+1)
        if (Math.abs(laneDistance) === 1) {
            return this.routeAdjacentLane(arrow, laneDistance);
        }

        // CAS 3 : LANE ÉLOIGNÉE (n-2, n-3, n+2, n+3...)
        return this.routeDistantLane(arrow, laneDistance);
    }

    /**
     * CAS 1 : MÊME LANE
     */
    private routeSameLane(arrow: Arrow): Array<{ x: number; y: number }> {
        // Vérifier s'il y a des intermédiaires
        const intermediates = this.layout.getIntermediateSteps(arrow.sourceId, arrow.targetId);
        const immediate = this.layout.isImmediateNext(arrow.sourceId, arrow.targetId);

        console.log(`   → Même lane, intermédiaires: ${intermediates.length}, immédiat: ${immediate}`);

        // CAS 1A : Pas d'intermédiaire OU immédiat → ligne droite
        if (intermediates.length === 0 || immediate) {
            console.log(`   ✅ Ligne droite (pas d'obstacle)`);

            const sourcePoint = this.getConnectionPoint(arrow.sourceRow, arrow.sourcePos, 'bottom', arrow.type);
            const targetPoint = this.getConnectionPoint(arrow.targetRow, arrow.targetPos, 'top');

            return [sourcePoint, targetPoint];
        }

        // CAS 1B : Avec intermédiaires → contourner par la gauche
        console.log(`   ✅ Contournement par gauche (${intermediates.length} obstacles)`);

        return this.routeSameLaneWithObstacles(arrow);
    }

    /**
     * CAS 1B : Même lane avec obstacles
     */
    private routeSameLaneWithObstacles(arrow: Arrow): Array<{ x: number; y: number }> {
        const sourceLeft = this.getConnectionPoint(arrow.sourceRow, arrow.sourcePos, 'left', arrow.type);
        const targetLeft = this.getConnectionPoint(arrow.targetRow, arrow.targetPos, 'left');

        // Couloir gauche de la lane
        const corridorX = 80 + (arrow.sourcePos.laneIndex * this.config.laneWidth) + 30;

        const waypoints = [
            sourceLeft,
            { x: sourceLeft.x - 20, y: sourceLeft.y },
            { x: corridorX, y: sourceLeft.y },
            { x: corridorX, y: targetLeft.y },
            { x: targetLeft.x - 20, y: targetLeft.y },
            targetLeft
        ];

        return waypoints;
    }

    /**
     * CAS 2 : LANE ADJACENTE (n±1)
     */
    private routeAdjacentLane(arrow: Arrow, laneDistance: number): Array<{ x: number; y: number }> {
        const goingRight = laneDistance > 0;

        console.log(`   → Lane adjacente, direction: ${goingRight ? 'droite' : 'gauche'}`);

        if (goingRight) {
            // Sortir à droite, entrer à gauche
            const sourceRight = this.getConnectionPoint(arrow.sourceRow, arrow.sourcePos, 'right', arrow.type);
            const targetLeft = this.getConnectionPoint(arrow.targetRow, arrow.targetPos, 'left');

            // Analyser positions verticales
            const sameY = Math.abs(arrow.sourcePos.y - arrow.targetPos.y) < 50;
            const targetHigher = arrow.targetPos.y < arrow.sourcePos.y;

            console.log(`   → SameY: ${sameY}, TargetHigher: ${targetHigher}`);

            if (sameY) {
                // Même niveau → horizontal direct
                console.log(`   ✅ Horizontal direct`);
                return [sourceRight, targetLeft];
            } else if (targetHigher) {
                // Target plus haut → sortir, monter, entrer
                console.log(`   ✅ Sortir-Monter-Entrer`);
                const midX = (sourceRight.x + targetLeft.x) / 2;
                return [
                    sourceRight,
                    { x: sourceRight.x + 20, y: sourceRight.y },
                    { x: midX, y: sourceRight.y },
                    { x: midX, y: targetLeft.y },
                    { x: targetLeft.x - 20, y: targetLeft.y },
                    targetLeft
                ];
            } else {
                // Target plus bas → sortir, descendre, entrer
                console.log(`   ✅ Sortir-Descendre-Entrer`);
                const midX = (sourceRight.x + targetLeft.x) / 2;
                return [
                    sourceRight,
                    { x: sourceRight.x + 20, y: sourceRight.y },
                    { x: midX, y: sourceRight.y },
                    { x: midX, y: targetLeft.y },
                    { x: targetLeft.x - 20, y: targetLeft.y },
                    targetLeft
                ];
            }
        } else {
            // Aller à gauche
            const sourceLeft = this.getConnectionPoint(arrow.sourceRow, arrow.sourcePos, 'left', arrow.type);
            const targetRight = this.getConnectionPoint(arrow.targetRow, arrow.targetPos, 'right');

            const sameY = Math.abs(arrow.sourcePos.y - arrow.targetPos.y) < 50;

            if (sameY) {
                console.log(`   ✅ Horizontal direct (vers gauche)`);
                return [sourceLeft, targetRight];
            } else {
                console.log(`   ✅ Sortir-Descendre-Entrer (vers gauche)`);
                const midX = (sourceLeft.x + targetRight.x) / 2;
                return [
                    sourceLeft,
                    { x: sourceLeft.x - 20, y: sourceLeft.y },
                    { x: midX, y: sourceLeft.y },
                    { x: midX, y: targetRight.y },
                    { x: targetRight.x + 20, y: targetRight.y },
                    targetRight
                ];
            }
        }
    }

    /**
     * CAS 3 : LANE ÉLOIGNÉE (n±2, n±3...)
     */
    private routeDistantLane(arrow: Arrow, laneDistance: number): Array<{ x: number; y: number }> {
        const goingRight = laneDistance > 0;

        console.log(`   → Lane éloignée (distance: ${Math.abs(laneDistance)}), direction: ${goingRight ? 'droite' : 'gauche'}`);
        console.log(`   ✅ Grand contournement`);

        // Obtenir Y max global pour contourner TOUT
        const globalMaxY = this.layout.getGlobalMaxY();
        const bypassY = globalMaxY + 100; // Descendre sous tout

        if (goingRight) {
            const sourceRight = this.getConnectionPoint(arrow.sourceRow, arrow.sourcePos, 'right', arrow.type);
            const targetLeft = this.getConnectionPoint(arrow.targetRow, arrow.targetPos, 'left');

            // Couloirs
            const sourceCorridor = 80 + (arrow.sourcePos.laneIndex * this.config.laneWidth) + this.config.laneWidth - 30;
            const targetCorridor = 80 + (arrow.targetPos.laneIndex * this.config.laneWidth) + 30;

            return [
                sourceRight,
                { x: sourceRight.x + 20, y: sourceRight.y },
                { x: sourceCorridor, y: sourceRight.y },
                { x: sourceCorridor, y: bypassY },
                { x: targetCorridor, y: bypassY },
                { x: targetCorridor, y: targetLeft.y },
                { x: targetLeft.x - 20, y: targetLeft.y },
                targetLeft
            ];
        } else {
            const sourceLeft = this.getConnectionPoint(arrow.sourceRow, arrow.sourcePos, 'left', arrow.type);
            const targetRight = this.getConnectionPoint(arrow.targetRow, arrow.targetPos, 'right');

            const sourceCorridor = 80 + (arrow.sourcePos.laneIndex * this.config.laneWidth) + 30;
            const targetCorridor = 80 + (arrow.targetPos.laneIndex * this.config.laneWidth) + this.config.laneWidth - 30;

            return [
                sourceLeft,
                { x: sourceLeft.x - 20, y: sourceLeft.y },
                { x: sourceCorridor, y: sourceLeft.y },
                { x: sourceCorridor, y: bypassY },
                { x: targetCorridor, y: bypassY },
                { x: targetCorridor, y: targetRight.y },
                { x: targetRight.x + 20, y: targetRight.y },
                targetRight
            ];
        }
    }

    /**
     * OBTENIR POINT DE CONNEXION
     */
    private getConnectionPoint(
        row: Table1Row,
        pos: NodePosition,
        side: 'top' | 'bottom' | 'left' | 'right',
        flowType?: 'yes' | 'no' | 'next'
    ): { x: number; y: number } {
        if (row.typeBpmn === BPMN_TYPES.START_EVENT || row.typeBpmn === BPMN_TYPES.END_EVENT) {
            const size = this.config.eventSize;
            const centerX = pos.x + this.config.nodeWidth / 2;
            const centerY = pos.y + size / 2;

            switch (side) {
                case 'top': return { x: centerX, y: pos.y };
                case 'bottom': return { x: centerX, y: pos.y + size };
                case 'left': return { x: pos.x + (this.config.nodeWidth - size) / 2, y: centerY };
                case 'right': return { x: pos.x + (this.config.nodeWidth + size) / 2, y: centerY };
            }
        } else if (row.typeBpmn === BPMN_TYPES.EXCLUSIVE_GATEWAY) {
            const centerOffset = (this.config.nodeWidth - this.config.gatewaySize) / 2;
            const centerX = pos.x + centerOffset + this.config.gatewaySize / 2;
            const centerY = pos.y + this.config.gatewaySize / 2;

            // Gateway : OUI sort à droite, NON sort en bas
            if (flowType === 'yes') {
                return { x: pos.x + centerOffset + this.config.gatewaySize, y: centerY };
            } else if (flowType === 'no') {
                return { x: centerX, y: pos.y + this.config.gatewaySize };
            }

            switch (side) {
                case 'top': return { x: centerX, y: pos.y };
                case 'bottom': return { x: centerX, y: pos.y + this.config.gatewaySize };
                case 'left': return { x: pos.x + centerOffset, y: centerY };
                case 'right': return { x: pos.x + centerOffset + this.config.gatewaySize, y: centerY };
            }
        } else {
            // Task standard
            const centerY = pos.y + this.config.nodeHeight / 2;

            switch (side) {
                case 'top': return { x: pos.x + this.config.nodeWidth / 2, y: pos.y };
                case 'bottom': return { x: pos.x + this.config.nodeWidth / 2, y: pos.y + this.config.nodeHeight };
                case 'left': return { x: pos.x, y: centerY };
                case 'right': return { x: pos.x + this.config.nodeWidth, y: centerY };
            }
        }
    }

    public getRoutedPath(arrowId: string): Array<{ x: number; y: number }> | undefined {
        return this.routedPaths.get(arrowId);
    }

    public printStats(): void {
        console.log(`\n📊 Statistiques:`);
        console.log(`  Total: ${this.arrows.length} flèches`);
        console.log(`  Routées: ${this.routedPaths.size} chemins\n`);
    }
}
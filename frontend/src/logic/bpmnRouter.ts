// bpmnRouter.ts - VERSION AVEC CÔTÉS GATEWAY RÉSERVÉS (Oui/Non jamais même angle)
import type { Table1Row, NodePosition } from './bpmnLayoutEngine';
import { BPMNLayoutEngine } from './bpmnLayoutEngine';
import { BPMN_TYPES, DEFAULT_DIMENSIONS } from './bpmnConstants';

export interface Arrow {
    id: string;
    sourceId: string;
    targetId: string;
    label: string;
    outputIndex: number;
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

type ExitSide = 'top' | 'bottom' | 'left' | 'right';

// Si le côté idéal est déjà pris → quel côté alternatif ?
const ALTERNATE_SIDE: Record<ExitSide, ExitSide> = {
    right: 'bottom',
    bottom: 'right',
    left: 'bottom',
    top: 'right',
};

export class BPMNRouter {
    private config: RouterConfig;
    private layout: BPMNLayoutEngine;
    private nodeHeights: Map<string, number>;
    private arrows: Arrow[] = [];
    private routedPaths: Map<string, Array<{ x: number; y: number }>> = new Map();

    // Côtés déjà réservés par gateway : sourceId → Set<ExitSide>
    private gatewayReservedSides: Map<string, Set<ExitSide>> = new Map();

    // Anti-collision corridors
    private corridorUsage: Map<number, number[]> = new Map();

    constructor(
        config: RouterConfig,
        layout: BPMNLayoutEngine,
        nodeHeights?: Map<string, number>
    ) {
        this.config = config;
        this.layout = layout;
        this.nodeHeights = nodeHeights || new Map();
    }

    // ============================================
    // EXTRACTION DES FLÈCHES
    // ============================================
    public extractArrows(
        data: Table1Row[],
        idMap: Map<string, Table1Row>,
        positions: Map<string, NodePosition>
    ): void {
        this.arrows = [];

        data.forEach(row => {
            const sourcePos = positions.get(row.id);
            if (!sourcePos) return;

            row.outputs.forEach((output, index) => {
                if (!output.targetId || output.targetId.trim() === '') return;

                const targetRow = idMap.get(output.targetId);
                const targetPos = positions.get(output.targetId);

                if (targetRow && targetPos) {
                    this.arrows.push({
                        id: `${row.id}_${output.targetId}`,
                        sourceId: row.id,
                        targetId: output.targetId,
                        label: output.label || '',
                        outputIndex: index,
                        sourceRow: row,
                        targetRow,
                        sourcePos,
                        targetPos
                    });
                }
            });
        });

        console.log(`\n📊 Router: ${this.arrows.length} flèches extraites\n`);
    }

    public routeAll(): Map<string, Array<{ x: number; y: number }>> {
        this.routedPaths.clear();
        this.corridorUsage.clear();
        this.gatewayReservedSides.clear();

        // outputIndex 0 traité en premier → la réservation de côté est déterministe
        const sorted = [...this.arrows].sort((a, b) => a.outputIndex - b.outputIndex);

        sorted.forEach(arrow => {
            const waypoints = this.routeArrow(arrow);
            this.routedPaths.set(arrow.id, waypoints);
        });

        return this.routedPaths;
    }

    private routeArrow(arrow: Arrow): Array<{ x: number; y: number }> {
        const sameLane = arrow.sourcePos.laneIndex === arrow.targetPos.laneIndex;
        const laneDistance = arrow.targetPos.laneIndex - arrow.sourcePos.laneIndex;

        console.log(`\n🔍 Routage: ${arrow.id} [${arrow.label || 'no-label'}]`);

        if (sameLane) return this.routeSameLane(arrow);
        if (Math.abs(laneDistance) === 1) return this.routeAdjacentLane(arrow, laneDistance);
        return this.routeDistantLane(arrow, laneDistance);
    }

    // ============================================
    // CÔTÉ DE SORTIE GATEWAY — DYNAMIQUE + RÉSERVATION
    // ============================================
    private getGatewayExitSide(arrow: Arrow): ExitSide {
        const { sourcePos, targetPos, sourceId } = arrow;

        const sourceCenterX = sourcePos.x + this.config.nodeWidth / 2;
        const sourceCenterY = sourcePos.y + this.config.gatewaySize / 2;
        const targetCenterX = targetPos.x + this.config.nodeWidth / 2;
        const targetCenterY = targetPos.y + this.config.gatewaySize / 2;

        const dx = targetCenterX - sourceCenterX;
        const dy = targetCenterY - sourceCenterY;

        // Côté idéal selon vecteur source→cible
        let ideal: ExitSide;
        if (Math.abs(dx) >= Math.abs(dy)) {
            ideal = dx >= 0 ? 'right' : 'left';
        } else {
            ideal = dy >= 0 ? 'bottom' : 'top';
        }

        // Réservation : ce côté est-il déjà pris pour ce gateway ?
        if (!this.gatewayReservedSides.has(sourceId)) {
            this.gatewayReservedSides.set(sourceId, new Set());
        }
        const reserved = this.gatewayReservedSides.get(sourceId)!;

        let chosen: ExitSide;
        if (!reserved.has(ideal)) {
            chosen = ideal;
        } else {
            // Côté alternatif obligatoire (jamais le même que l'output précédent)
            const alt = ALTERNATE_SIDE[ideal];
            if (!reserved.has(alt)) {
                chosen = alt;
            } else {
                // 3ème sortie : premier côté libre parmi les 4
                const allSides: ExitSide[] = ['right', 'bottom', 'left', 'top'];
                chosen = allSides.find(s => !reserved.has(s)) ?? ideal;
            }
        }

        reserved.add(chosen);
        console.log(`   🔷 Gateway ${sourceId}: output[${arrow.outputIndex}] "${arrow.label}" → côté ${chosen}`);
        return chosen;
    }

    // ============================================
    // ANTI-COLLISION CORRIDORS
    // ============================================
    private getFreeCorridor(baseCorridor: number, sourceY: number): number {
        const key = Math.round(baseCorridor / 10) * 10;
        const used = this.corridorUsage.get(key) || [];

        const offsets = [0, 15, -15, 30, -30, 45, -45];
        for (const offset of offsets) {
            const conflict = used.some(usedY => Math.abs(usedY - sourceY) < 25);
            if (!conflict) {
                used.push(sourceY);
                this.corridorUsage.set(key, used);
                return baseCorridor + offset;
            }
        }

        const result = baseCorridor + (used.length * 12);
        used.push(sourceY);
        this.corridorUsage.set(key, used);
        return result;
    }

    // ============================================
    // POINTS DE CONNEXION
    // ============================================
    private getSourcePoint(arrow: Arrow): { x: number; y: number } {
        const { sourceRow, sourcePos, targetPos } = arrow;

        const isGateway =
            sourceRow.typeBpmn === BPMN_TYPES.EXCLUSIVE_GATEWAY ||
            sourceRow.typeBpmn === 'ParallelGateway' ||
            sourceRow.typeBpmn === 'InclusiveGateway';

        if (isGateway) {
            const side = this.getGatewayExitSide(arrow);
            return this.getGatewayPoint(sourcePos, side);
        }

        if (sourceRow.typeBpmn === BPMN_TYPES.START_EVENT || sourceRow.typeBpmn === BPMN_TYPES.END_EVENT) {
            return this.getEventPoint(sourcePos, 'bottom');
        }

        // Task : sortie dynamique selon position cible
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;
        const nodeHeight = this.getNodeHeight(sourceRow);

        if (Math.abs(dx) > Math.abs(dy) * 1.5) {
            return dx >= 0
                ? this.getTaskPoint(sourcePos, 'right', nodeHeight)
                : this.getTaskPoint(sourcePos, 'left', nodeHeight);
        }
        return this.getTaskPoint(sourcePos, 'bottom', nodeHeight);
    }

    private getTargetPoint(
        row: Table1Row,
        pos: NodePosition,
        preferredSide: ExitSide = 'top'
    ): { x: number; y: number } {
        if (row.typeBpmn === BPMN_TYPES.START_EVENT || row.typeBpmn === BPMN_TYPES.END_EVENT) {
            return this.getEventPoint(pos, preferredSide);
        }
        if (
            row.typeBpmn === BPMN_TYPES.EXCLUSIVE_GATEWAY ||
            row.typeBpmn === 'ParallelGateway' ||
            row.typeBpmn === 'InclusiveGateway'
        ) {
            return this.getGatewayPoint(pos, preferredSide);
        }
        return this.getTaskPoint(pos, preferredSide, this.getNodeHeight(row));
    }

    private getGatewayPoint(pos: NodePosition, side: ExitSide): { x: number; y: number } {
        const offset = (this.config.nodeWidth - this.config.gatewaySize) / 2;
        const gx = pos.x + offset;
        const gy = pos.y;
        const gs = this.config.gatewaySize;

        switch (side) {
            case 'right': return { x: gx + gs, y: gy + gs / 2 };
            case 'left': return { x: gx, y: gy + gs / 2 };
            case 'bottom': return { x: gx + gs / 2, y: gy + gs };
            case 'top': return { x: gx + gs / 2, y: gy };
        }
    }

    private getEventPoint(pos: NodePosition, side: ExitSide): { x: number; y: number } {
        const size = this.config.eventSize;
        const cx = pos.x + this.config.nodeWidth / 2;
        const cy = pos.y + size / 2;

        switch (side) {
            case 'top': return { x: cx, y: pos.y };
            case 'bottom': return { x: cx, y: pos.y + size };
            case 'left': return { x: pos.x + (this.config.nodeWidth - size) / 2, y: cy };
            case 'right': return { x: pos.x + (this.config.nodeWidth + size) / 2, y: cy };
        }
    }

    private getTaskPoint(pos: NodePosition, side: ExitSide, nodeHeight: number): { x: number; y: number } {
        const cy = pos.y + nodeHeight / 2;

        switch (side) {
            case 'top': return { x: pos.x + this.config.nodeWidth / 2, y: pos.y };
            case 'bottom': return { x: pos.x + this.config.nodeWidth / 2, y: pos.y + nodeHeight };
            case 'left': return { x: pos.x, y: cy };
            case 'right': return { x: pos.x + this.config.nodeWidth, y: cy };
        }
    }

    // ============================================
    // CAS 1 : MÊME LANE
    // ============================================
    private routeSameLane(arrow: Arrow): Array<{ x: number; y: number }> {
        const intermediates = this.layout.getIntermediateSteps(arrow.sourceId, arrow.targetId);
        const immediate = this.layout.isImmediateNext(arrow.sourceId, arrow.targetId);

        if (intermediates.length === 0 || immediate) {
            const src = this.getSourcePoint(arrow);
            const tgt = this.getTargetPoint(arrow.targetRow, arrow.targetPos, 'top');
            return [src, tgt];
        }

        return this.routeSameLaneWithObstacles(arrow);
    }

    private routeSameLaneWithObstacles(arrow: Arrow): Array<{ x: number; y: number }> {
        const src = this.getSourcePoint(arrow);
        const tgt = this.getTargetPoint(arrow.targetRow, arrow.targetPos, 'left');
        const baseCorridorX = 80 + (arrow.sourcePos.laneIndex * this.config.laneWidth) + 30;
        const corridorX = this.getFreeCorridor(baseCorridorX, arrow.sourcePos.y);

        return [
            src,
            { x: src.x - 20, y: src.y },
            { x: corridorX, y: src.y },
            { x: corridorX, y: tgt.y },
            { x: tgt.x - 20, y: tgt.y },
            tgt
        ];
    }

    // ============================================
    // CAS 2 : LANE ADJACENTE (n±1)
    // ============================================
    private routeAdjacentLane(arrow: Arrow, laneDistance: number): Array<{ x: number; y: number }> {
        const goingRight = laneDistance > 0;

        if (goingRight) {
            const src = this.getSourcePoint(arrow);
            const tgt = this.getTargetPoint(arrow.targetRow, arrow.targetPos, 'left');
            const sameY = Math.abs(src.y - tgt.y) < 50;

            if (sameY) return [src, tgt];

            const midX = (src.x + tgt.x) / 2;
            return [
                src,
                { x: src.x + 20, y: src.y },
                { x: midX, y: src.y },
                { x: midX, y: tgt.y },
                { x: tgt.x - 20, y: tgt.y },
                tgt
            ];
        } else {
            const src = this.getSourcePoint(arrow);
            const tgt = this.getTargetPoint(arrow.targetRow, arrow.targetPos, 'right');
            const sameY = Math.abs(src.y - tgt.y) < 50;

            if (sameY) return [src, tgt];

            const midX = (src.x + tgt.x) / 2;
            return [
                src,
                { x: src.x - 20, y: src.y },
                { x: midX, y: src.y },
                { x: midX, y: tgt.y },
                { x: tgt.x + 20, y: tgt.y },
                tgt
            ];
        }
    }

    // ============================================
    // CAS 3 : LANE ÉLOIGNÉE (n±2, n±3...)
    // ============================================
    private routeDistantLane(arrow: Arrow, laneDistance: number): Array<{ x: number; y: number }> {
        const goingRight = laneDistance > 0;
        const globalMaxY = this.getGlobalMaxY();
        const bypassY = globalMaxY + 80 + (arrow.outputIndex * 20);

        if (goingRight) {
            const src = this.getSourcePoint(arrow);
            const tgt = this.getTargetPoint(arrow.targetRow, arrow.targetPos, 'left');
            const srcCorridor = 80 + (arrow.sourcePos.laneIndex * this.config.laneWidth) + this.config.laneWidth - 30;
            const tgtCorridor = 80 + (arrow.targetPos.laneIndex * this.config.laneWidth) + 30;

            return [
                src,
                { x: src.x + 20, y: src.y },
                { x: srcCorridor, y: src.y },
                { x: srcCorridor, y: bypassY },
                { x: tgtCorridor, y: bypassY },
                { x: tgtCorridor, y: tgt.y },
                { x: tgt.x - 20, y: tgt.y },
                tgt
            ];
        } else {
            const src = this.getSourcePoint(arrow);
            const tgt = this.getTargetPoint(arrow.targetRow, arrow.targetPos, 'right');
            const srcCorridor = 80 + (arrow.sourcePos.laneIndex * this.config.laneWidth) + 30;
            const tgtCorridor = 80 + (arrow.targetPos.laneIndex * this.config.laneWidth) + this.config.laneWidth - 30;

            return [
                src,
                { x: src.x - 20, y: src.y },
                { x: srcCorridor, y: src.y },
                { x: srcCorridor, y: bypassY },
                { x: tgtCorridor, y: bypassY },
                { x: tgtCorridor, y: tgt.y },
                { x: tgt.x + 20, y: tgt.y },
                tgt
            ];
        }
    }

    // ============================================
    // UTILITAIRES
    // ============================================
    private getNodeHeight(row: Table1Row): number {
        if (this.nodeHeights.has(row.id)) return this.nodeHeights.get(row.id)!;
        if (row.typeBpmn === BPMN_TYPES.START_EVENT || row.typeBpmn === BPMN_TYPES.END_EVENT) return this.config.eventSize;
        if (
            row.typeBpmn === BPMN_TYPES.EXCLUSIVE_GATEWAY ||
            row.typeBpmn === 'ParallelGateway' ||
            row.typeBpmn === 'InclusiveGateway'
        ) return this.config.gatewaySize;
        return this.config.nodeHeight;
    }

    private getGlobalMaxY(): number {
        let maxY = 0;
        this.arrows.forEach(arrow => {
            const srcEnd = arrow.sourcePos.y + this.getNodeHeight(arrow.sourceRow);
            const tgtEnd = arrow.targetPos.y + this.getNodeHeight(arrow.targetRow);
            if (srcEnd > maxY) maxY = srcEnd;
            if (tgtEnd > maxY) maxY = tgtEnd;
        });
        return maxY;
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
// bpmnGenerator.ts - VERSION AMÉLIORÉE AVEC SUPPORT OUTPUTS[] ET NOUVEAUX GATEWAY TYPES
import { BPMNLayoutEngine } from './bpmnLayoutEngine';
import type { Table1Row, NodePosition } from './bpmnLayoutEngine';
import {
    DEFAULT_DIMENSIONS,
    BPMN_ELEMENT_PREFIXES,
    BPMN_TYPES
} from './bpmnConstants';
import {
    getLaneId,
    escapeXml,
    getElementId,
    getElementIdFromString,
    formatLaneNameForDisplay,
    getCenterPosition
} from './bpmnUtils';
import { BPMNRouter } from './bpmnRouter';

export { Table1Row };

interface BPMNGeneratorConfig {
    laneWidth?: number;
    nodeWidth?: number;
    nodeMinHeight?: number;
    nodeMaxHeight?: number;
    verticalSpacing?: number;
    gatewaySize?: number;
    spacingMultiplier?: number;
    showToolsAsAnnotations?: boolean;
    charsPerLine?: number;
    lineHeight?: number;
    paddingVertical?: number;
}

// ============================================
// UTILITAIRE : CALCUL DE HAUTEUR ADAPTATIVE
// ============================================
interface TextMetrics {
    lines: number;
    height: number;
}

function calculateTextMetrics(
    text: string,
    nodeWidth: number,
    config: {
        charsPerLine: number;
        lineHeight: number;
        paddingVertical: number;
        minHeight: number;
        maxHeight: number;
    }
): TextMetrics {
    if (!text || text.trim() === '') return { lines: 1, height: config.minHeight };

    const effectiveWidth = nodeWidth - 40;
    const estimatedCharsPerLine = Math.floor(effectiveWidth / 8);
    const charsPerLine = Math.min(config.charsPerLine, estimatedCharsPerLine);

    const words = text.trim().split(/\s+/);
    let lines = 1;
    let currentLineLength = 0;

    for (const word of words) {
        if (currentLineLength + word.length + 1 > charsPerLine) {
            lines++;
            currentLineLength = word.length;
        } else {
            currentLineLength += (currentLineLength > 0 ? 1 : 0) + word.length;
        }
    }

    const totalHeight = lines * config.lineHeight + config.paddingVertical * 2;
    return {
        lines,
        height: Math.max(config.minHeight, Math.min(config.maxHeight, totalHeight))
    };
}

// ============================================
// CLASSE PRINCIPALE
// ============================================
export class BPMNGenerator {
    private layoutEngine!: BPMNLayoutEngine;
    private positions: Map<string, NodePosition>;
    private nodeHeights: Map<string, number>;
    private idMap: Map<string, Table1Row>;
    private acteurMap: Map<string, Table1Row[]>;
    private acteurs: string[];

    private gatewaySize: number;
    private nodeWidth: number;
    private nodeMinHeight: number;
    private nodeMaxHeight: number;
    private laneWidth: number;
    private verticalSpacing: number;
    private showToolsAsAnnotations: boolean;
    private charsPerLine: number;
    private lineHeight: number;
    private paddingVertical: number;

    private router!: BPMNRouter;
    private routedPaths: Map<string, Array<{ x: number; y: number }>> = new Map();

    constructor(config: BPMNGeneratorConfig = {}) {
        this.gatewaySize = config.gatewaySize ?? DEFAULT_DIMENSIONS.GATEWAY_SIZE;
        this.nodeWidth = config.nodeWidth ?? 280;
        this.nodeMinHeight = config.nodeMinHeight ?? 60;
        this.nodeMaxHeight = config.nodeMaxHeight ?? 160;
        this.laneWidth = config.laneWidth ?? DEFAULT_DIMENSIONS.LANE_WIDTH;
        this.verticalSpacing = config.verticalSpacing ?? 50;
        this.showToolsAsAnnotations = config.showToolsAsAnnotations ?? true;
        this.charsPerLine = config.charsPerLine ?? 30;
        this.lineHeight = config.lineHeight ?? 20;
        this.paddingVertical = config.paddingVertical ?? 20;

        this.positions = new Map();
        this.nodeHeights = new Map();
        this.idMap = new Map();
        this.acteurMap = new Map();
        this.acteurs = [];
    }

    public generate(data: Table1Row[]): string {
        if (data.length === 0) throw new Error("Aucune donnée à générer");

        this.buildMaps(data);
        this.calculateNodeHeights(data);
        this.calculateAdaptiveLayout(data);

        this.router = new BPMNRouter({
            laneWidth: this.laneWidth,
            nodeWidth: this.nodeWidth,
            nodeHeight: this.nodeMinHeight,
            gatewaySize: this.gatewaySize,
            eventSize: DEFAULT_DIMENSIONS.EVENT_SIZE,
            corridorOffset: 40
        }, this.layoutEngine, this.nodeHeights);

        console.log("\n🎬 PHASE DE ROUTAGE INTELLIGENT");
        console.log("================================");
        this.router.extractArrows(data, this.idMap, this.positions);
        this.routedPaths = this.router.routeAll();
        this.router.printStats();
        console.log("✅ Routage terminé !\n");

        const lanesXML = this.generateLanes();
        const { tasksXML, flowsXML } = this.generateTasksAndFlows(data);
        const { shapesXML, edgesXML } = this.generateDiagramElements(data);

        return this.buildXML(lanesXML, tasksXML, flowsXML, shapesXML, edgesXML);
    }

    // ============================================
    // CONSTRUCTION DES MAPS
    // ============================================
    private buildMaps(data: Table1Row[]): void {
        this.idMap.clear();
        this.acteurMap.clear();
        this.acteurs = [];

        data.forEach(row => {
            this.idMap.set(row.id, row);
            if (!this.acteurMap.has(row.acteur)) {
                this.acteurMap.set(row.acteur, []);
                this.acteurs.push(row.acteur);
            }
            this.acteurMap.get(row.acteur)!.push(row);
        });
    }

    // ============================================
    // CALCUL DES HAUTEURS ADAPTATIVES
    // ============================================
    private calculateNodeHeights(data: Table1Row[]): void {
        this.nodeHeights.clear();

        data.forEach(row => {
            let height: number;

            if (row.typeBpmn === BPMN_TYPES.START_EVENT || row.typeBpmn === BPMN_TYPES.END_EVENT) {
                height = DEFAULT_DIMENSIONS.EVENT_SIZE;
            } else if (
                row.typeBpmn === BPMN_TYPES.EXCLUSIVE_GATEWAY ||
                row.typeBpmn === 'ParallelGateway' ||
                row.typeBpmn === 'InclusiveGateway'
            ) {
                // MODIFIED: tous les gateway types ont la même taille fixe
                height = this.gatewaySize + 50;
            } else {
                const metrics = calculateTextMetrics(row.étape, this.nodeWidth, {
                    charsPerLine: this.charsPerLine,
                    lineHeight: this.lineHeight,
                    paddingVertical: this.paddingVertical,
                    minHeight: this.nodeMinHeight,
                    maxHeight: this.nodeMaxHeight
                });
                height = metrics.height;
                console.log(`📏 Task "${row.étape.substring(0, 30)}..." → ${metrics.lines} lignes → ${height}px`);
            }

            this.nodeHeights.set(row.id, height);
        });
    }

    // ============================================
    // LAYOUT ADAPTATIF
    // ============================================
    private calculateAdaptiveLayout(data: Table1Row[]): void {
        this.positions.clear();

        const laneProgress: Map<string, number> = new Map();
        this.acteurs.forEach(acteur => laneProgress.set(acteur, 0));

        const layers = this.assignLayers(data);
        const sortedData = [...data].sort((a, b) => {
            return (layers.get(a.id) || 0) - (layers.get(b.id) || 0);
        });

        sortedData.forEach(row => {
            const laneIndex = this.acteurs.indexOf(row.acteur);
            const nodeHeight = this.nodeHeights.get(row.id) || this.nodeMinHeight;
            const currentY = laneProgress.get(row.acteur) || 0;

            const x = 80 + (laneIndex * this.laneWidth) + (this.laneWidth - this.nodeWidth) / 2;
            const y = DEFAULT_DIMENSIONS.MARGIN_TOP + DEFAULT_DIMENSIONS.LANE_LABEL_OFFSET + currentY;

            this.positions.set(row.id, {
                x, y,
                layer: layers.get(row.id) || 0,
                laneIndex,
                acteur: row.acteur
            });

            laneProgress.set(row.acteur, currentY + nodeHeight + this.verticalSpacing);
        });

        this.layoutEngine = new BPMNLayoutEngine({
            laneWidth: this.laneWidth,
            nodeWidth: this.nodeWidth,
            nodeHeight: this.nodeMinHeight,
            verticalSpacing: this.verticalSpacing,
            compactMode: true,
            spacingMultiplier: 1
        });

        (this.layoutEngine as any).positions = this.positions;
        (this.layoutEngine as any).acteurs = this.acteurs;
        (this.layoutEngine as any).idMap = this.idMap;
    }

    private assignLayers(data: Table1Row[]): Map<string, number> {
        const layers: Map<string, number> = new Map();
        const visited = new Set<string>();

        const assignRecursive = (id: string, layer: number) => {
            if (visited.has(id)) {
                const existing = layers.get(id) || 0;
                if (layer > existing) layers.set(id, layer);
                return;
            }
            visited.add(id);
            layers.set(id, layer);

            const row = this.idMap.get(id);
            if (!row) return;

            // MODIFIED: iterate outputs[] for all node types
            row.outputs.forEach(output => {
                if (output.targetId && output.targetId.trim() !== '') {
                    assignRecursive(output.targetId, layer + 1);
                }
            });
        };

        const startNodes = data.filter(row => row.typeBpmn === BPMN_TYPES.START_EVENT);
        if (startNodes.length > 0) {
            startNodes.forEach(node => assignRecursive(node.id, 0));
        } else if (data.length > 0) {
            assignRecursive(data[0].id, 0);
        }

        data.forEach(row => {
            if (!visited.has(row.id)) assignRecursive(row.id, 0);
        });

        return layers;
    }

    // ============================================
    // GÉNÉRATION DES LANES
    // ============================================
    private generateLanes(): string {
        let lanesXML = '';

        this.acteurs.forEach(acteur => {
            const laneId = getLaneId(acteur);
            const rows = this.acteurMap.get(acteur)!;
            const formattedName = formatLaneNameForDisplay(acteur);

            let flowNodeRefs = '';
            rows.forEach(row => {
                const elementId = getElementId(row);
                flowNodeRefs += `        <flowNodeRef>${elementId}</flowNodeRef>\n`;
                if (
                    this.showToolsAsAnnotations &&
                    row.outil && row.outil.trim() !== '' &&
                    row.typeBpmn !== BPMN_TYPES.START_EVENT &&
                    row.typeBpmn !== BPMN_TYPES.END_EVENT
                ) {
                    flowNodeRefs += `        <flowNodeRef>${BPMN_ELEMENT_PREFIXES.ANNOTATION}${row.id}</flowNodeRef>\n`;
                }
            });

            lanesXML += `      <lane id="${laneId}" name="${escapeXml(formattedName)}">
${flowNodeRefs}      </lane>\n`;
        });

        return lanesXML;
    }

    // ============================================
    // GÉNÉRATION DES TASKS ET FLOWS
    // ============================================
    private generateTasksAndFlows(data: Table1Row[]): { tasksXML: string; flowsXML: string } {
        let tasksXML = '';
        let flowsXML = '';

        data.forEach(row => {
            const elementId = getElementId(row);

            // --- BPMN element declaration ---
            if (row.typeBpmn === BPMN_TYPES.START_EVENT) {
                tasksXML += `    <startEvent id="${elementId}" name="${escapeXml(row.étape)}" />\n`;

            } else if (row.typeBpmn === BPMN_TYPES.END_EVENT) {
                tasksXML += `    <endEvent id="${elementId}" name="${escapeXml(row.étape)}" />\n`;

            } else if (row.typeBpmn === BPMN_TYPES.EXCLUSIVE_GATEWAY) {
                tasksXML += `    <exclusiveGateway id="${elementId}" name="${escapeXml(row.condition)}" />\n`;

            } else if (row.typeBpmn === 'ParallelGateway') {
                // MODIFIED: nouveau type de gateway
                tasksXML += `    <parallelGateway id="${elementId}" name="${escapeXml(row.étape)}" />\n`;

            } else if (row.typeBpmn === 'InclusiveGateway') {
                // MODIFIED: nouveau type de gateway
                tasksXML += `    <inclusiveGateway id="${elementId}" name="${escapeXml(row.condition || row.étape)}" />\n`;

            } else {
                // Task / UserTask
                tasksXML += `    <userTask id="${elementId}" name="${escapeXml(row.étape)}" />\n`;

                if (this.showToolsAsAnnotations && row.outil && row.outil.trim() !== '') {
                    const annotationId = `${BPMN_ELEMENT_PREFIXES.ANNOTATION}${row.id}`;
                    tasksXML += `    <textAnnotation id="${annotationId}">
      <text>🔧 ${escapeXml(row.outil)}</text>
    </textAnnotation>\n`;
                    flowsXML += `    <association id="${BPMN_ELEMENT_PREFIXES.ASSOCIATION}${row.id}" sourceRef="${elementId}" targetRef="${annotationId}" />\n`;
                }
            }

            // --- MODIFIED: sequence flows from outputs[] for ALL node types ---
            row.outputs.forEach(output => {
                if (!output.targetId || output.targetId.trim() === '') return;

                const targetElementId = getElementIdFromString(output.targetId, this.idMap);
                const flowId = `${BPMN_ELEMENT_PREFIXES.FLOW}${row.id}_${output.targetId}`;
                const labelAttr = output.label ? ` name="${escapeXml(output.label)}"` : '';

                flowsXML += `    <sequenceFlow id="${flowId}"${labelAttr} sourceRef="${elementId}" targetRef="${targetElementId}" />\n`;
            });
        });

        return { tasksXML, flowsXML };
    }

    // ============================================
    // GÉNÉRATION DES ÉLÉMENTS DE DIAGRAMME
    // ============================================
    private generateDiagramElements(data: Table1Row[]): { shapesXML: string; edgesXML: string } {
        let shapesXML = '';
        let edgesXML = '';

        const diagramHeight = this.getDiagramHeight();
        const lanePaddingTop = 80;

        this.acteurs.forEach((acteur, index) => {
            const laneId = getLaneId(acteur);
            const laneX = 80 + (index * this.laneWidth);
            const marginHorizontal = Math.floor(this.laneWidth * 0.05);
            const marginTop = 15;

            shapesXML += `      <bpmndi:BPMNShape id="${laneId}_di" bpmnElement="${laneId}" isHorizontal="false">
        <dc:Bounds x="${laneX}" y="120" width="${this.laneWidth}" height="${diagramHeight + lanePaddingTop}" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="${laneX + marginHorizontal}" y="${120 + marginTop}" width="${this.laneWidth - marginHorizontal * 2}" height="70" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>\n`;
        });

        data.forEach(row => {
            const pos = this.positions.get(row.id);
            if (!pos) return;

            const elementId = getElementId(row);
            const nodeHeight = this.nodeHeights.get(row.id) || this.nodeMinHeight;

            // Shape
            if (row.typeBpmn === BPMN_TYPES.START_EVENT || row.typeBpmn === BPMN_TYPES.END_EVENT) {
                shapesXML += this.generateEventShape(elementId, pos, row.typeBpmn);
            } else if (
                row.typeBpmn === BPMN_TYPES.EXCLUSIVE_GATEWAY ||
                row.typeBpmn === 'ParallelGateway' ||
                row.typeBpmn === 'InclusiveGateway'
            ) {
                // MODIFIED: tous les gateway types utilisent le même shape
                shapesXML += this.generateGatewayShape(elementId, pos);
            } else {
                shapesXML += this.generateTaskShape(elementId, pos, nodeHeight);
                if (this.showToolsAsAnnotations && row.outil && row.outil.trim() !== '') {
                    const { annotationXML, associationXML } = this.generateAnnotation(row.id, pos, nodeHeight);
                    shapesXML += annotationXML;
                    edgesXML += associationXML;
                }
            }

            // MODIFIED: edges pour chaque output
            row.outputs.forEach(output => {
                if (output.targetId && output.targetId.trim() !== '') {
                    edgesXML += this.generateEdgeFromRouter(row.id, output.targetId, output.label);
                }
            });
        });

        return { shapesXML, edgesXML };
    }

    // ============================================
    // GÉNÉRATION DES SHAPES INDIVIDUELS
    // ============================================
    private generateEventShape(elementId: string, pos: NodePosition, typeBpmn: string): string {
        const size = DEFAULT_DIMENSIONS.EVENT_SIZE;
        const centerX = pos.x + (this.nodeWidth - size) / 2;

        return `      <bpmndi:BPMNShape id="${elementId}_di" bpmnElement="${elementId}">
        <dc:Bounds x="${centerX}" y="${pos.y}" width="${size}" height="${size}" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="${centerX - 30}" y="${pos.y + size + 8}" width="${size + 60}" height="40" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>\n`;
    }

    private generateGatewayShape(elementId: string, pos: NodePosition): string {
        const centerX = pos.x + (this.nodeWidth - this.gatewaySize) / 2;

        return `      <bpmndi:BPMNShape id="${elementId}_di" bpmnElement="${elementId}" isMarkerVisible="true">
        <dc:Bounds x="${centerX}" y="${pos.y}" width="${this.gatewaySize}" height="${this.gatewaySize}" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="${centerX - 40}" y="${pos.y + this.gatewaySize + 8}" width="${this.gatewaySize + 80}" height="40" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>\n`;
    }

    private generateTaskShape(elementId: string, pos: NodePosition, height: number): string {
        return `      <bpmndi:BPMNShape id="${elementId}_di" bpmnElement="${elementId}">
        <dc:Bounds x="${pos.x}" y="${pos.y}" width="${this.nodeWidth}" height="${height}" />
      </bpmndi:BPMNShape>\n`;
    }

    private generateAnnotation(rowId: string, pos: NodePosition, nodeHeight: number): { annotationXML: string; associationXML: string } {
        const annotationId = `${BPMN_ELEMENT_PREFIXES.ANNOTATION}${rowId}`;
        const annotationX = pos.x + this.nodeWidth + DEFAULT_DIMENSIONS.ANNOTATION_OFFSET;
        const annotationY = pos.y + (nodeHeight - DEFAULT_DIMENSIONS.ANNOTATION_HEIGHT) / 2;

        const annotationXML = `      <bpmndi:BPMNShape id="${annotationId}_di" bpmnElement="${annotationId}">
        <dc:Bounds x="${annotationX}" y="${annotationY}" width="${DEFAULT_DIMENSIONS.ANNOTATION_WIDTH}" height="${DEFAULT_DIMENSIONS.ANNOTATION_HEIGHT}" />
      </bpmndi:BPMNShape>\n`;

        const associationXML = `      <bpmndi:BPMNEdge id="${BPMN_ELEMENT_PREFIXES.ASSOCIATION}${rowId}_di" bpmnElement="${BPMN_ELEMENT_PREFIXES.ASSOCIATION}${rowId}">
        <di:waypoint x="${pos.x + this.nodeWidth}" y="${pos.y + nodeHeight / 2}" />
        <di:waypoint x="${annotationX}" y="${annotationY + DEFAULT_DIMENSIONS.ANNOTATION_HEIGHT / 2}" />
      </bpmndi:BPMNEdge>\n`;

        return { annotationXML, associationXML };
    }

    // ============================================
    // MODIFIED: GÉNÉRATION DES EDGES AVEC LE ROUTER
    // Signature: (sourceId, targetId, label) au lieu de (sourceId, type)
    // ============================================
    private generateEdgeFromRouter(sourceId: string, targetId: string, label: string): string {
        const arrowId = `${sourceId}_${targetId}`;
        const waypoints = this.routedPaths.get(arrowId);

        if (!waypoints || waypoints.length < 2) {
            console.error(`❌ PAS DE CHEMIN pour ${arrowId}`);
            return '';
        }

        const flowId = `${BPMN_ELEMENT_PREFIXES.FLOW}${arrowId}`;
        let edgeXML = `      <bpmndi:BPMNEdge id="${flowId}_di" bpmnElement="${flowId}">\n`;

        waypoints.forEach(wp => {
            edgeXML += `        <di:waypoint x="${Math.round(wp.x)}" y="${Math.round(wp.y)}" />\n`;
        });

        // Label si présent (ex: "Oui", "Non", condition custom)
        if (label && label.trim() !== '') {
            const midIdx = Math.floor(waypoints.length / 2);
            const labelPoint = waypoints[midIdx];
            edgeXML += `        <bpmndi:BPMNLabel>
          <dc:Bounds x="${Math.round(labelPoint.x + 10)}" y="${Math.round(labelPoint.y - 15)}" width="40" height="18" />
        </bpmndi:BPMNLabel>\n`;
        }

        edgeXML += `      </bpmndi:BPMNEdge>\n`;
        return edgeXML;
    }

    // ============================================
    // UTILITAIRES
    // ============================================
    private getDiagramHeight(): number {
        let maxY = 0;
        this.positions.forEach((pos, id) => {
            const nodeHeight = this.nodeHeights.get(id) || this.nodeMinHeight;
            const nodeEndY = pos.y + nodeHeight;
            if (nodeEndY > maxY) maxY = nodeEndY;
        });
        return maxY + 100;
    }

    public getNodeHeight(id: string): number {
        return this.nodeHeights.get(id) || this.nodeMinHeight;
    }

    public getPosition(id: string): NodePosition | undefined {
        return this.positions.get(id);
    }

    // ============================================
    // CONSTRUCTION DU XML FINAL
    // ============================================
    private buildXML(lanes: string, tasks: string, flows: string, shapes: string, edges: string): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" 
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" 
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" 
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI" 
             id="Definitions_1" 
             targetNamespace="http://example.com">
  <process id="Process_1" isExecutable="false">
    <laneSet id="LaneSet_1">
${lanes}    </laneSet>
${tasks}${flows}  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
${shapes}${edges}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;
    }
}

export function generateBPMN(data: Table1Row[], config?: BPMNGeneratorConfig): string {
    const generator = new BPMNGenerator(config);
    return generator.generate(data);
}

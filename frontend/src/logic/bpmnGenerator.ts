// bpmnGenerator.ts - VERSION COMPLÈTE AVEC ROUTER INTELLIGENT

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
    nodeHeight?: number;
    verticalSpacing?: number;
    gatewaySize?: number;
    spacingMultiplier?: number;
    showToolsAsAnnotations?: boolean;
}

export class BPMNGenerator {
    private layoutEngine: BPMNLayoutEngine;
    private positions: Map<string, NodePosition>;
    private idMap: Map<string, Table1Row>;
    private acteurMap: Map<string, Table1Row[]>;
    private acteurs: string[];
    private gatewaySize: number;
    private nodeWidth: number;
    private nodeHeight: number;
    private laneWidth: number;
    private showToolsAsAnnotations: boolean;

    // ✨ AJOUT DU ROUTER
    private router!: BPMNRouter; // Initialisé dans generate()
    private routedPaths: Map<string, Array<{ x: number; y: number }>> = new Map();

    constructor(config: BPMNGeneratorConfig = {}) {
        this.gatewaySize = config.gatewaySize ?? DEFAULT_DIMENSIONS.GATEWAY_SIZE;
        this.nodeWidth = config.nodeWidth ?? 280;
        this.nodeHeight = config.nodeHeight ?? 100;
        this.laneWidth = config.laneWidth ?? DEFAULT_DIMENSIONS.LANE_WIDTH;
        this.showToolsAsAnnotations = config.showToolsAsAnnotations ?? true;

        const spacingMultiplier = config.spacingMultiplier ?? 0.7;

        this.layoutEngine = new BPMNLayoutEngine({
            laneWidth: this.laneWidth,
            nodeWidth: this.nodeWidth,
            nodeHeight: this.nodeHeight,
            verticalSpacing: config.verticalSpacing ?? 60,
            compactMode: true,
            spacingMultiplier: spacingMultiplier
        });

        this.positions = new Map();
        this.idMap = new Map();
        this.acteurMap = new Map();
        this.acteurs = [];
    }

    public generate(data: Table1Row[]): string {
        if (data.length === 0) throw new Error("Aucune donnée à générer");

        this.positions = this.layoutEngine.calculateLayout(data);
        this.acteurs = this.layoutEngine.getActeurs();
        this.buildMaps(data);

        // ✨ INITIALISER LE ROUTER AVEC LE LAYOUT
        this.router = new BPMNRouter({
            laneWidth: this.laneWidth,
            nodeWidth: this.nodeWidth,
            nodeHeight: this.nodeHeight,
            gatewaySize: this.gatewaySize,
            eventSize: DEFAULT_DIMENSIONS.EVENT_SIZE,
            corridorOffset: 40
        }, this.layoutEngine); // ← Passer le layout

        // ✨ PHASE DE ROUTAGE INTELLIGENT
        console.log("\n🎬 PHASE DE ROUTAGE INTELLIGENT");
        console.log("================================");
        this.router.extractArrows(data, this.idMap, this.positions);
        this.routedPaths = this.router.routeAll();
        this.router.printStats();
        console.log("✅ Routage terminé !\n");

        const lanesXML = this.generateLanes();
        const { tasksXML, flowsXML } = this.generateTasksAndFlows(data);
        const { shapesXML, edgesXML } = this.generateDiagramWithRouter(data);

        return this.buildXML(lanesXML, tasksXML, flowsXML, shapesXML, edgesXML);
    }

    private buildMaps(data: Table1Row[]): void {
        this.idMap.clear();
        this.acteurMap.clear();

        data.forEach(row => {
            this.idMap.set(row.id, row);
            if (!this.acteurMap.has(row.acteur)) {
                this.acteurMap.set(row.acteur, []);
            }
            this.acteurMap.get(row.acteur)!.push(row);
        });
    }

    private generateLanes(): string {
        let lanesXML = '';

        this.acteurs.forEach((acteur) => {
            const laneId = getLaneId(acteur);
            const rows = this.acteurMap.get(acteur)!;
            const formattedName = formatLaneNameForDisplay(acteur);

            let flowNodeRefs = '';

            rows.forEach(row => {
                const elementId = getElementId(row);
                flowNodeRefs += `        <flowNodeRef>${elementId}</flowNodeRef>\n`;

                if (this.showToolsAsAnnotations && row.outil && row.outil.trim() !== '' &&
                    row.typeBpmn !== BPMN_TYPES.START_EVENT && row.typeBpmn !== BPMN_TYPES.END_EVENT) {
                    flowNodeRefs += `        <flowNodeRef>${BPMN_ELEMENT_PREFIXES.ANNOTATION}${row.id}</flowNodeRef>\n`;
                }
            });

            lanesXML += `      <lane id="${laneId}" name="${escapeXml(formattedName)}">
${flowNodeRefs}      </lane>\n`;
        });

        return lanesXML;
    }

    private generateTasksAndFlows(data: Table1Row[]): { tasksXML: string, flowsXML: string } {
        let tasksXML = '';
        let flowsXML = '';

        data.forEach(row => {
            const elementId = getElementId(row);

            if (row.typeBpmn === BPMN_TYPES.START_EVENT) {
                tasksXML += `    <startEvent id="${elementId}" name="${escapeXml(row.étape)}" />\n`;

                if (row.outputOui && row.outputOui.trim() !== '') {
                    const targetId = getElementIdFromString(row.outputOui, this.idMap);
                    flowsXML += `    <sequenceFlow id="${BPMN_ELEMENT_PREFIXES.FLOW}${row.id}_next" sourceRef="${elementId}" targetRef="${targetId}" />\n`;
                }
            } else if (row.typeBpmn === BPMN_TYPES.END_EVENT) {
                tasksXML += `    <endEvent id="${elementId}" name="${escapeXml(row.étape)}" />\n`;
            } else if (row.typeBpmn === BPMN_TYPES.EXCLUSIVE_GATEWAY) {
                tasksXML += `    <exclusiveGateway id="${elementId}" name="${escapeXml(row.condition)}" />\n`;

                if (row.outputOui && row.outputOui.trim() !== '') {
                    const yesTarget = getElementIdFromString(row.outputOui, this.idMap);
                    flowsXML += `    <sequenceFlow id="${BPMN_ELEMENT_PREFIXES.FLOW}${row.id}_yes" name="Oui" sourceRef="${elementId}" targetRef="${yesTarget}" />\n`;
                }

                if (row.outputNon && row.outputNon.trim() !== '') {
                    const noTarget = getElementIdFromString(row.outputNon, this.idMap);
                    flowsXML += `    <sequenceFlow id="${BPMN_ELEMENT_PREFIXES.FLOW}${row.id}_no" name="Non" sourceRef="${elementId}" targetRef="${noTarget}" />\n`;
                }
            } else {
                tasksXML += `    <userTask id="${elementId}" name="${escapeXml(row.étape)}" />\n`;

                if (this.showToolsAsAnnotations && row.outil && row.outil.trim() !== '') {
                    const annotationId = `${BPMN_ELEMENT_PREFIXES.ANNOTATION}${row.id}`;
                    tasksXML += `    <textAnnotation id="${annotationId}">
      <text>🔧 ${escapeXml(row.outil)}</text>
    </textAnnotation>\n`;

                    flowsXML += `    <association id="${BPMN_ELEMENT_PREFIXES.ASSOCIATION}${row.id}" sourceRef="${elementId}" targetRef="${annotationId}" />\n`;
                }

                if (row.outputOui && row.outputOui.trim() !== '' && row.outputNon && row.outputNon.trim() !== '') {
                    const yesTarget = getElementIdFromString(row.outputOui, this.idMap);
                    const noTarget = getElementIdFromString(row.outputNon, this.idMap);
                    flowsXML += `    <sequenceFlow id="${BPMN_ELEMENT_PREFIXES.FLOW}${row.id}_yes" name="Confirmer" sourceRef="${elementId}" targetRef="${yesTarget}" />\n`;
                    flowsXML += `    <sequenceFlow id="${BPMN_ELEMENT_PREFIXES.FLOW}${row.id}_no" name="Annuler" sourceRef="${elementId}" targetRef="${noTarget}" />\n`;
                } else if (row.outputOui && row.outputOui.trim() !== '') {
                    const nextTarget = getElementIdFromString(row.outputOui, this.idMap);
                    flowsXML += `    <sequenceFlow id="${BPMN_ELEMENT_PREFIXES.FLOW}${row.id}_next" sourceRef="${elementId}" targetRef="${nextTarget}" />\n`;
                }
            }
        });

        return { tasksXML, flowsXML };
    }

    // ✨ NOUVELLE MÉTHODE : Générer le diagramme avec le Router
    private generateDiagramWithRouter(data: Table1Row[]): { shapesXML: string, edgesXML: string } {
        let shapesXML = '';
        let edgesXML = '';

        const diagramHeight = this.layoutEngine.getDiagramHeight();
        const lanePaddingTop = 80;

        // Générer les shapes de lanes
        this.acteurs.forEach((acteur, index) => {
            const laneId = getLaneId(acteur);
            const laneX = 80 + (index * this.laneWidth);
            const marginHorizontal = Math.floor(this.laneWidth * 0.05);
            const marginTop = 15;

            shapesXML += `      <bpmndi:BPMNShape id="${laneId}_di" bpmnElement="${laneId}" isHorizontal="false">
        <dc:Bounds x="${laneX}" y="120" width="${this.laneWidth}" height="${diagramHeight + lanePaddingTop}" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="${laneX + marginHorizontal}" y="${120 + marginTop}" width="${this.laneWidth - (marginHorizontal * 2)}" height="70" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>\n`;
        });

        // Générer les shapes et edges pour chaque élément
        data.forEach(row => {
            const pos = this.positions.get(row.id);
            if (!pos) return;

            const elementId = getElementId(row);

            // Générer les shapes
            if (row.typeBpmn === BPMN_TYPES.START_EVENT || row.typeBpmn === BPMN_TYPES.END_EVENT) {
                const centerPos = getCenterPosition(pos, this.nodeWidth, DEFAULT_DIMENSIONS.EVENT_SIZE);
                shapesXML += this.generateEventShape(elementId, centerPos);
            } else if (row.typeBpmn === BPMN_TYPES.EXCLUSIVE_GATEWAY) {
                const centerPos = getCenterPosition(pos, this.nodeWidth, this.gatewaySize);
                shapesXML += this.generateGatewayShape(elementId, centerPos);
            } else {
                shapesXML += this.generateTaskShape(elementId, pos);

                if (this.showToolsAsAnnotations && row.outil && row.outil.trim() !== '') {
                    const { annotationXML, associationXML } = this.generateAnnotation(row.id, pos);
                    shapesXML += annotationXML;
                    edgesXML += associationXML;
                }
            }

            // ✨ GÉNÉRER LES EDGES AVEC LE ROUTER
            if (row.outputOui && row.outputOui.trim() !== '') {
                const flowType = row.typeBpmn === BPMN_TYPES.EXCLUSIVE_GATEWAY ? 'yes' : 'next';
                edgesXML += this.generateEdgeFromRouter(row.id, flowType);
            }

            if (row.typeBpmn === BPMN_TYPES.EXCLUSIVE_GATEWAY &&
                row.outputNon && row.outputNon.trim() !== '') {
                edgesXML += this.generateEdgeFromRouter(row.id, 'no');
            }
        });

        return { shapesXML, edgesXML };
    }

    // ✨ NOUVELLE MÉTHODE : Générer un edge depuis les waypoints du Router
    private generateEdgeFromRouter(
        sourceId: string,
        type: 'yes' | 'no' | 'next'
    ): string {
        const arrowId = `${sourceId}_${type}`;

        console.log(`\n🔍 Génération edge pour ${arrowId}`);
        console.log(`   Chemins routés disponibles:`, Array.from(this.routedPaths.keys()));

        const waypoints = this.routedPaths.get(arrowId);

        if (!waypoints || waypoints.length < 2) {
            console.error(`❌ PAS DE CHEMIN pour ${arrowId}`);
            console.error(`   Chemins disponibles:`, Array.from(this.routedPaths.keys()));
            return '';
        }

        console.log(`✅ Chemin trouvé pour ${arrowId}: ${waypoints.length} waypoints`);

        const flowId = `${BPMN_ELEMENT_PREFIXES.FLOW}${arrowId}`;
        console.log(`   FlowID: ${flowId}`);

        let edgeXML = `      <bpmndi:BPMNEdge id="${flowId}_di" bpmnElement="${flowId}">\n`;

        waypoints.forEach((wp, idx) => {
            console.log(`   Waypoint ${idx}: (${Math.round(wp.x)}, ${Math.round(wp.y)})`);
            edgeXML += `        <di:waypoint x="${Math.round(wp.x)}" y="${Math.round(wp.y)}" />\n`;
        });

        if (type === 'yes' || type === 'no') {
            const midIdx = Math.floor(waypoints.length / 2);
            const labelPoint = waypoints[midIdx];
            edgeXML += `        <bpmndi:BPMNLabel>
          <dc:Bounds x="${Math.round(labelPoint.x + 10)}" y="${Math.round(labelPoint.y - 10)}" width="32" height="18" />
        </bpmndi:BPMNLabel>\n`;
        }

        edgeXML += `      </bpmndi:BPMNEdge>\n`;
        return edgeXML;
    }

    private generateEventShape(elementId: string, pos: { x: number; y: number }): string {
        const size = DEFAULT_DIMENSIONS.EVENT_SIZE;
        return `      <bpmndi:BPMNShape id="${elementId}_di" bpmnElement="${elementId}">
        <dc:Bounds x="${pos.x}" y="${pos.y}" width="${size}" height="${size}" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="${pos.x - 30}" y="${pos.y + size + 5}" width="${size + 60}" height="40" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>\n`;
    }

    private generateGatewayShape(elementId: string, pos: { x: number; y: number }): string {
        return `      <bpmndi:BPMNShape id="${elementId}_di" bpmnElement="${elementId}" isMarkerVisible="true">
        <dc:Bounds x="${pos.x}" y="${pos.y}" width="${this.gatewaySize}" height="${this.gatewaySize}" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="${pos.x - 50}" y="${pos.y + this.gatewaySize + 5}" width="170" height="40" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>\n`;
    }

    private generateTaskShape(elementId: string, pos: NodePosition): string {
        return `      <bpmndi:BPMNShape id="${elementId}_di" bpmnElement="${elementId}">
        <dc:Bounds x="${pos.x}" y="${pos.y}" width="${this.nodeWidth}" height="${this.nodeHeight}" />
      </bpmndi:BPMNShape>\n`;
    }

    private generateAnnotation(rowId: string, pos: NodePosition): { annotationXML: string; associationXML: string } {
        const annotationId = `${BPMN_ELEMENT_PREFIXES.ANNOTATION}${rowId}`;
        const annotationX = pos.x + this.nodeWidth + DEFAULT_DIMENSIONS.ANNOTATION_OFFSET;
        const annotationY = pos.y + (this.nodeHeight - DEFAULT_DIMENSIONS.ANNOTATION_HEIGHT) / 2;

        const annotationXML = `      <bpmndi:BPMNShape id="${annotationId}_di" bpmnElement="${annotationId}">
        <dc:Bounds x="${annotationX}" y="${annotationY}" width="${DEFAULT_DIMENSIONS.ANNOTATION_WIDTH}" height="${DEFAULT_DIMENSIONS.ANNOTATION_HEIGHT}" />
      </bpmndi:BPMNShape>\n`;

        const taskRightX = pos.x + this.nodeWidth;
        const taskCenterY = pos.y + this.nodeHeight / 2;
        const annotationLeftX = annotationX;
        const annotationCenterY = annotationY + DEFAULT_DIMENSIONS.ANNOTATION_HEIGHT / 2;

        const associationXML = `      <bpmndi:BPMNEdge id="${BPMN_ELEMENT_PREFIXES.ASSOCIATION}${rowId}_di" bpmnElement="${BPMN_ELEMENT_PREFIXES.ASSOCIATION}${rowId}">
        <di:waypoint x="${taskRightX}" y="${taskCenterY}" />
        <di:waypoint x="${annotationLeftX}" y="${annotationCenterY}" />
      </bpmndi:BPMNEdge>\n`;

        return { annotationXML, associationXML };
    }

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

// ✅ EXPORT DE LA FONCTION UTILITAIRE (pour garder la compatibilité)
export function generateBPMN(data: Table1Row[], config?: BPMNGeneratorConfig): string {
    const generator = new BPMNGenerator(config);
    return generator.generate(data);
}
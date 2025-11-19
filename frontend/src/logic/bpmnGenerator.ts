// bpmnGenerator.ts - VERSION OPTIMISÉE avec espacement intelligent
import { BPMNLayoutEngine } from './bpmnLayoutEngine';
import type { Table1Row, NodePosition } from './bpmnLayoutEngine';

export { Table1Row };

interface BPMNGeneratorConfig {
    laneHeight?: number;
    nodeWidth?: number;
    nodeHeight?: number;
    horizontalSpacing?: number;
    gatewaySize?: number;
    spacingMultiplier?: number; // 🆕 Contrôle de l'étalement (1.0 = compact, 1.5 = étendu, 2.0 = très étendu)
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

    constructor(config: BPMNGeneratorConfig = {}) {
        // 🎯 Configuration optimisée pour un bon équilibre
        this.gatewaySize = config.gatewaySize || 60;
        this.nodeWidth = config.nodeWidth || 180;
        this.nodeHeight = config.nodeHeight || 90;

        const spacingMultiplier = config.spacingMultiplier || 1.3; // 🆕 30% plus d'espace par défaut

        this.layoutEngine = new BPMNLayoutEngine({
            laneHeight: config.laneHeight || 350,
            nodeWidth: this.nodeWidth,
            nodeHeight: this.nodeHeight,
            horizontalSpacing: config.horizontalSpacing || 120,
            compactMode: true, // 🆕 Mode compact activé
            spacingMultiplier: spacingMultiplier // 🆕 Multiplicateur d'espacement
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

        const lanesXML = this.generateLanes();
        const { tasksXML, flowsXML } = this.generateTasksAndFlows(data);
        const { shapesXML, edgesXML } = this.generateDiagram(data);

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

        this.acteurs.forEach((acteur, index) => {
            const laneId = this.getLaneId(acteur);
            const rows = this.acteurMap.get(acteur)!;

            let flowNodeRefs = '';

            rows.forEach(row => {
                if (row.typeBpmn === 'StartEvent') {
                    flowNodeRefs += `        <flowNodeRef>Start_${row.id}</flowNodeRef>\n`;
                } else if (row.typeBpmn === 'EndEvent') {
                    flowNodeRefs += `        <flowNodeRef>End_${row.id}</flowNodeRef>\n`;
                } else if (row.typeBpmn === 'ExclusiveGateway') {
                    flowNodeRefs += `        <flowNodeRef>Gateway_${row.id}</flowNodeRef>\n`;
                } else {
                    flowNodeRefs += `        <flowNodeRef>Task_${row.id}</flowNodeRef>\n`;
                }
            });

            lanesXML += `      <lane id="${laneId}" name="${this.escapeXml(acteur)}">
${flowNodeRefs}      </lane>\n`;
        });

        return lanesXML;
    }

    private generateTasksAndFlows(data: Table1Row[]): { tasksXML: string, flowsXML: string } {
        let tasksXML = '';
        let flowsXML = '';

        data.forEach(row => {
            if (row.typeBpmn === 'StartEvent') {
                tasksXML += `    <startEvent id="Start_${row.id}" name="${this.escapeXml(row.étape)}" />\n`;

                if (row.outputOui && row.outputOui.trim() !== '') {
                    const targetId = this.getElementId(row.outputOui);
                    flowsXML += `    <sequenceFlow id="Flow_${row.id}_yes" sourceRef="Start_${row.id}" targetRef="${targetId}" />\n`;
                }
            } else if (row.typeBpmn === 'EndEvent') {
                tasksXML += `    <endEvent id="End_${row.id}" name="${this.escapeXml(row.étape)}" />\n`;
            } else if (row.typeBpmn === 'ExclusiveGateway') {
                tasksXML += `    <exclusiveGateway id="Gateway_${row.id}" name="${this.escapeXml(row.condition)}" />\n`;

                if (row.outputOui && row.outputOui.trim() !== '') {
                    const yesTarget = this.getElementId(row.outputOui);
                    flowsXML += `    <sequenceFlow id="Flow_${row.id}_yes" name="Oui" sourceRef="Gateway_${row.id}" targetRef="${yesTarget}" />\n`;
                }

                if (row.outputNon && row.outputNon.trim() !== '') {
                    const noTarget = this.getElementId(row.outputNon);
                    flowsXML += `    <sequenceFlow id="Flow_${row.id}_no" name="Non" sourceRef="Gateway_${row.id}" targetRef="${noTarget}" />\n`;
                }
            } else {
                tasksXML += `    <userTask id="Task_${row.id}" name="${this.escapeXml(row.étape)}" />\n`;

                if (row.outputOui && row.outputOui.trim() !== '' && row.outputNon && row.outputNon.trim() !== '') {
                    const yesTarget = this.getElementId(row.outputOui);
                    const noTarget = this.getElementId(row.outputNon);
                    flowsXML += `    <sequenceFlow id="Flow_${row.id}_yes" name="Confirmer" sourceRef="Task_${row.id}" targetRef="${yesTarget}" />\n`;
                    flowsXML += `    <sequenceFlow id="Flow_${row.id}_no" name="Annuler" sourceRef="Task_${row.id}" targetRef="${noTarget}" />\n`;
                } else if (row.outputOui && row.outputOui.trim() !== '') {
                    const nextTarget = this.getElementId(row.outputOui);
                    flowsXML += `    <sequenceFlow id="Flow_${row.id}_next" sourceRef="Task_${row.id}" targetRef="${nextTarget}" />\n`;
                }
            }
        });

        return { tasksXML, flowsXML };
    }

    private generateDiagram(data: Table1Row[]): { shapesXML: string, edgesXML: string } {
        let shapesXML = '';
        let edgesXML = '';

        const diagramWidth = this.layoutEngine.getDiagramWidth();
        const laneHeight = 350;

        this.acteurs.forEach((acteur, index) => {
            const laneId = this.getLaneId(acteur);
            const laneY = index * laneHeight;

            shapesXML += `      <bpmndi:BPMNShape id="${laneId}_di" bpmnElement="${laneId}" isHorizontal="true">
        <dc:Bounds x="80" y="${laneY}" width="${diagramWidth}" height="${laneHeight}" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>\n`;
        });

        data.forEach(row => {
            const pos = this.positions.get(row.id);
            if (!pos) return;

            if (row.typeBpmn === 'StartEvent') {
                const eventSize = 42;
                const x = pos.x - eventSize / 2;
                const y = pos.y + (this.nodeHeight - eventSize) / 2;

                shapesXML += `      <bpmndi:BPMNShape id="Start_${row.id}_di" bpmnElement="Start_${row.id}">
        <dc:Bounds x="${x}" y="${y}" width="${eventSize}" height="${eventSize}" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="${x - 30}" y="${y + eventSize + 5}" width="${eventSize + 60}" height="40" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>\n`;

                if (row.outputOui && row.outputOui.trim() !== '') {
                    edgesXML += this.generateEdge(row, `Start_${row.id}`, row.outputOui, 'yes', pos);
                }
            } else if (row.typeBpmn === 'EndEvent') {
                const eventSize = 42;
                const x = pos.x - eventSize / 2;
                const y = pos.y + (this.nodeHeight - eventSize) / 2;

                shapesXML += `      <bpmndi:BPMNShape id="End_${row.id}_di" bpmnElement="End_${row.id}">
        <dc:Bounds x="${x}" y="${y}" width="${eventSize}" height="${eventSize}" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="${x - 30}" y="${y + eventSize + 5}" width="${eventSize + 60}" height="40" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>\n`;
            } else if (row.typeBpmn === 'ExclusiveGateway') {
                const gwX = pos.x;
                const gwY = pos.y + (this.nodeHeight - this.gatewaySize) / 2;

                shapesXML += `      <bpmndi:BPMNShape id="Gateway_${row.id}_di" bpmnElement="Gateway_${row.id}" isMarkerVisible="true">
        <dc:Bounds x="${gwX}" y="${gwY}" width="${this.gatewaySize}" height="${this.gatewaySize}" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="${gwX - 50}" y="${gwY + this.gatewaySize + 5}" width="160" height="40" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>\n`;

                if (row.outputOui && row.outputOui.trim() !== '') {
                    edgesXML += this.generateEdge(row, `Gateway_${row.id}`, row.outputOui, 'yes', pos);
                }

                if (row.outputNon && row.outputNon.trim() !== '') {
                    edgesXML += this.generateEdge(row, `Gateway_${row.id}`, row.outputNon, 'no', pos);
                }
            } else {
                shapesXML += `      <bpmndi:BPMNShape id="Task_${row.id}_di" bpmnElement="Task_${row.id}">
        <dc:Bounds x="${pos.x}" y="${pos.y}" width="${this.nodeWidth}" height="${this.nodeHeight}" />
      </bpmndi:BPMNShape>\n`;

                if (row.outputOui && row.outputOui.trim() !== '' && row.outputNon && row.outputNon.trim() !== '') {
                    edgesXML += this.generateEdge(row, `Task_${row.id}`, row.outputOui, 'yes', pos);
                    edgesXML += this.generateEdge(row, `Task_${row.id}`, row.outputNon, 'no', pos);
                } else if (row.outputOui && row.outputOui.trim() !== '') {
                    edgesXML += this.generateEdge(row, `Task_${row.id}`, row.outputOui, 'next', pos);
                }
            }
        });

        return { shapesXML, edgesXML };
    }

    private generateEdge(row: Table1Row, sourceRef: string, targetId: string, type: 'yes' | 'no' | 'next', sourcePos: NodePosition): string {
        const targetRow = this.idMap.get(targetId);
        const targetPos = this.positions.get(targetId);

        if (!targetRow || !targetPos) return '';

        const targetElementId = this.getElementId(targetId);
        const flowId = `Flow_${row.id}_${type}`;

        let sourceX: number, sourceY: number, targetX: number, targetY: number;

        // Calcul des points de connexion SOURCE
        if (row.typeBpmn === 'StartEvent') {
            sourceX = sourcePos.x + 21;
            sourceY = sourcePos.y + this.nodeHeight / 2;
        } else if (row.typeBpmn === 'ExclusiveGateway') {
            const gwX = sourcePos.x;
            const gwY = sourcePos.y + (this.nodeHeight - this.gatewaySize) / 2;

            if (type === 'yes') {
                sourceX = gwX + this.gatewaySize;
                sourceY = gwY + this.gatewaySize / 2;
            } else {
                sourceX = gwX + this.gatewaySize / 2;
                sourceY = gwY + this.gatewaySize;
            }
        } else {
            sourceX = sourcePos.x + this.nodeWidth;
            sourceY = sourcePos.y + this.nodeHeight / 2;
        }

        // Calcul des points de connexion TARGET
        if (targetRow.typeBpmn === 'EndEvent' || targetRow.typeBpmn === 'StartEvent') {
            targetX = targetPos.x + 21;
            targetY = targetPos.y + this.nodeHeight / 2;
        } else if (targetRow.typeBpmn === 'ExclusiveGateway') {
            const gwX = targetPos.x;
            const gwY = targetPos.y + (this.nodeHeight - this.gatewaySize) / 2;
            targetX = gwX;
            targetY = gwY + this.gatewaySize / 2;
        } else {
            targetX = targetPos.x;
            targetY = targetPos.y + this.nodeHeight / 2;
        }

        const isChangingLane = Math.abs(targetY - sourceY) > 60;
        const isBackward = targetX < sourceX;

        let edgeXML = `      <bpmndi:BPMNEdge id="${flowId}_di" bpmnElement="${flowId}">\n`;

        if (isBackward && type === 'no') {
            // Retour en arrière avec arc au-dessus
            const topY = sourcePos.y - 80;
            const leftX = targetX - 80;

            edgeXML += `        <di:waypoint x="${sourceX}" y="${sourceY}" />
        <di:waypoint x="${sourceX}" y="${topY}" />
        <di:waypoint x="${leftX}" y="${topY}" />
        <di:waypoint x="${leftX}" y="${targetY}" />
        <di:waypoint x="${targetX}" y="${targetY}" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="${sourceX - 30}" y="${topY - 20}" width="36" height="18" />
        </bpmndi:BPMNLabel>\n`;
        } else if (isChangingLane) {
            // Changement de lane
            const midX = sourceX + 50;
            edgeXML += `        <di:waypoint x="${sourceX}" y="${sourceY}" />
        <di:waypoint x="${midX}" y="${sourceY}" />
        <di:waypoint x="${midX}" y="${targetY}" />
        <di:waypoint x="${targetX}" y="${targetY}" />\n`;

            if (type === 'yes' || type === 'no') {
                edgeXML += `        <bpmndi:BPMNLabel>
          <dc:Bounds x="${midX + 10}" y="${Math.min(sourceY, targetY) + 30}" width="32" height="18" />
        </bpmndi:BPMNLabel>\n`;
            }
        } else {
            // Connexion directe
            edgeXML += `        <di:waypoint x="${sourceX}" y="${sourceY}" />
        <di:waypoint x="${targetX}" y="${targetY}" />\n`;

            if (type === 'yes' || type === 'no') {
                edgeXML += `        <bpmndi:BPMNLabel>
          <dc:Bounds x="${(sourceX + targetX) / 2 - 16}" y="${sourceY - 22}" width="32" height="18" />
        </bpmndi:BPMNLabel>\n`;
            }
        }

        edgeXML += `      </bpmndi:BPMNEdge>\n`;

        return edgeXML;
    }

    private getElementId(id: string): string {
        const row = this.idMap.get(id);
        if (!row) return `Task_${id}`;

        if (row.typeBpmn === 'StartEvent') return `Start_${id}`;
        if (row.typeBpmn === 'EndEvent') return `End_${id}`;
        if (row.typeBpmn === 'ExclusiveGateway') return `Gateway_${id}`;
        return `Task_${id}`;
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

    private getLaneId(acteur: string): string {
        return `Lane_${acteur.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`;
    }

    private escapeXml(text: string): string {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

export function generateBPMN(data: Table1Row[], config?: BPMNGeneratorConfig): string {
    const generator = new BPMNGenerator(config);
    return generator.generate(data);
}
// logic/bpmnLogicGenerator.ts - GÉNÈRE UNIQUEMENT LA LOGIQUE BPMN (sans positions DI)

import type { Table1Row } from './types';
import {
    BPMN_ELEMENT_PREFIXES,
    BPMN_TYPES
} from './bpmnConstants';
import {
    getLaneId,
    escapeXml,
    getElementId,
    getElementIdFromString,
    formatLaneNameForDisplay
} from './bpmnUtils';

export class BPMNLogicGenerator {
    private idMap: Map<string, Table1Row>;
    private acteurMap: Map<string, Table1Row[]>;
    private acteurs: string[];

    constructor() {
        this.idMap = new Map();
        this.acteurMap = new Map();
        this.acteurs = [];
    }

    public generate(data: Table1Row[]): string {
        if (data.length === 0) throw new Error("Aucune donnée à générer");

        this.buildMaps(data);

        const lanesXML = this.generateLanes();
        const { tasksXML, flowsXML } = this.generateTasksAndFlows(data);

        return this.buildXML(lanesXML, tasksXML, flowsXML);
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

        this.acteurs = Array.from(this.acteurMap.keys());
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
                // UserTask
                tasksXML += `    <userTask id="${elementId}" name="${escapeXml(row.étape)}" />\n`;

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

    private buildXML(lanes: string, tasks: string, flows: string): string {
        // ✨ XML MINIMAL - PAS de <bpmndi:BPMNDiagram> !
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
</definitions>`;
    }

    /**
     * ✨ Récupère les informations d'outils pour créer des overlays
     */
    public getToolsInfo(data: Table1Row[]): Map<string, string> {
        const toolsMap = new Map<string, string>();

        data.forEach(row => {
            if (row.outil && row.outil.trim() !== '') {
                const elementId = getElementId(row);
                toolsMap.set(elementId, row.outil);
            }
        });

        return toolsMap;
    }
}

/**
 * ✅ FONCTION UTILITAIRE pour générer le XML logique
 */
export function generateLogicBPMN(data: Table1Row[]): {
    xml: string;
    toolsInfo: Map<string, string>
} {
    const generator = new BPMNLogicGenerator();
    const xml = generator.generate(data);
    const toolsInfo = generator.getToolsInfo(data);

    return { xml, toolsInfo };
}
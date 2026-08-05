// src/logic/bpmnGeneratorOutillage.ts
//
// "Vue outillage" — mêmes lanes (acteurs) et mêmes positions que le diagramme métier
// (réutilise computePlacements telle quelle, aucune duplication de cette logique), mais
// le nœud de flux n'est plus la tâche : quand une étape a un outil, le nœud principal
// devient un `serviceTask` d'id `ToolNode_<id>` — même type que les petits satellites du
// diagramme métier (`Tool_<id>`), ce qui déclenche le même rendu personnalisé (capsule
// colorée, pas un rectangle de tâche) dans BpmnEditor.tsx — mais un préfixe DIFFÉRENT,
// délibérément. `ToolConnectionBehavior` (BpmnEditor.tsx) convertit automatiquement toute
// connexion touchant un `Tool_...` en association dès qu'elle se crée — un comportement
// pensé pour les satellites, pas pour un nœud de flux avec de vrais sequenceFlow entrants
// et sortants. Partager le préfixe `Tool_` ferait supprimer et remplacer chaque flèche
// réelle par une association auto-routée (constaté : lignes diagonales à l'usage réel,
// alors que le XML généré ici a des waypoints orthogonaux corrects — bug de collision de
// préfixe, pas de routage). `ToolNode_` évite la collision sans toucher au comportement
// existant des satellites.
//
// L'étape devient une `textAnnotation` reliée par association — le repère métier reste
// visible sans être le contenu principal du nœud.
//
// Lecture seule par construction côté appelant (SttPanel.tsx) : ce XML n'est jamais
// sauvegardé ni reparsé par bpmnParser.ts.

import type { Table1Row } from './types';
import {
    type NodeType, type GraphEdge as Edge,
    isGateway, elementId, laneId,
} from './bpmnGraphModel';
import {
    type NodeInfo,
    computePlacements, escapeXml,
    POOL_Y,
} from './bpmnGeneratorSimple';

const ANNOT_W = 160;
const ANNOT_H = 44;
const ANNOT_GAP = 14; // espace entre le nœud et son annotation

function toolId(id: string): string { return `ToolNode_${id}`; }
function annotId(id: string): string { return `Annot_${id}`; }
function annotAssocId(id: string): string { return `AnnotAssoc_${id}`; }

export function generateBPMNOutillage(data: Table1Row[], processName = 'Processus'): string {
    if (!data.length) throw new Error('Aucune donnée');

    const nodes: NodeInfo[] = data.map(row => ({
        id: row.id,
        type: row.typeBpmn as NodeType,
        acteur: row.acteur,
        nom: row.étape || '',
        outil: row.outil || '',
    }));
    const edges: Edge[] = data.flatMap(row =>
        (row.outputs || [])
            .filter(o => o.targetId)
            .map(o => ({ src: row.id, tgt: o.targetId, label: o.label || '' })),
    );
    const acteurs: string[] = [];
    for (const row of data) if (!acteurs.includes(row.acteur)) acteurs.push(row.acteur);
    const acteurType = new Map<string, 'interne' | 'externe' | ''>();
    for (const row of data) if (!acteurType.has(row.acteur)) acteurType.set(row.acteur, row.typeActeur ?? '');

    // Même calcul de lanes/rangs/positions que le diagramme métier — la vue outillage
    // n'invente pas sa propre géométrie.
    const { positions, laneX, laneWidth, poolWidth } = computePlacements(nodes, edges, acteurs);
    const nodeMap = new Map(data.map(r => [r.id, r]));

    // Id du nœud PRINCIPAL pour une ligne donnée — Tool_<id> si un outil existe (et que
    // ce n'est pas un Start/End/Gateway, qui restent inchangés), Task_<id> sinon.
    function mainId(row: Table1Row): string {
        const isFlowEvent = row.typeBpmn === 'StartEvent' || row.typeBpmn === 'EndEvent' || isGateway(row.typeBpmn as NodeType);
        if (isFlowEvent) return elementId(row.id, row.typeBpmn as NodeType);
        return row.outil?.trim() ? toolId(row.id) : `Task_${row.id}`;
    }

    // ── Lanes ──────────────────────────────────────────────────
    let lanesXML = '';
    for (const acteur of acteurs) {
        const lid = laneId(acteur, acteurType.get(acteur) ?? '');
        const refs = data.filter(r => r.acteur === acteur)
            .map(r => `        <flowNodeRef>${mainId(r)}</flowNodeRef>`)
            .join('\n');
        lanesXML += `      <lane id="${lid}" name="${escapeXml(acteur)}">\n${refs}\n      </lane>\n`;
    }

    // ── Éléments + annotations + flux ────────────────────────────
    let elementsXML = '';
    let annotationsXML = '';
    let annotAssocsXML = '';
    let flowsXML = '';

    for (const row of data) {
        const type = row.typeBpmn as NodeType;
        const isFlowEvent = type === 'StartEvent' || type === 'EndEvent' || isGateway(type);
        const eid = mainId(row);
        const outgoing = (row.outputs || [])
            .filter(o => o.targetId)
            .map(o => `<outgoing>Flow_${row.id}_${o.targetId}</outgoing>`)
            .join('');

        if (isFlowEvent) {
            // Start/End/Gateway : identiques au diagramme métier, aucune raison de les
            // transformer — ils n'ont pas d'outil au sens de cette vue.
            const name = escapeXml(row.étape || '');
            const cond = escapeXml(row.condition || row.étape || '');
            switch (type) {
                case 'StartEvent': elementsXML += `    <startEvent id="${eid}" name="${name}">${outgoing}</startEvent>\n`; break;
                case 'EndEvent': elementsXML += `    <endEvent id="${eid}" name="${name}"></endEvent>\n`; break;
                case 'ExclusiveGateway': elementsXML += `    <exclusiveGateway id="${eid}" name="${cond}" isMarkerVisible="true">${outgoing}</exclusiveGateway>\n`; break;
                case 'ParallelGateway': elementsXML += `    <parallelGateway id="${eid}" name="${name}">${outgoing}</parallelGateway>\n`; break;
                case 'InclusiveGateway': elementsXML += `    <inclusiveGateway id="${eid}" name="${cond}">${outgoing}</inclusiveGateway>\n`; break;
            }
        } else if (row.outil?.trim()) {
            elementsXML += `    <serviceTask id="${eid}" name="${escapeXml(row.outil.trim())}">${outgoing}</serviceTask>\n`;
        } else {
            elementsXML += `    <task id="${eid}" name="(Manuel)">${outgoing}</task>\n`;
        }

        // Annotation = l'étape, pour toute ligne qui a un nom d'étape et n'est pas déjà
        // purement structurelle (on annote aussi les gateways : "Dossier complet ?" y
        // gagne un rappel textuel distinct du losange).
        if (row.étape?.trim() && !isFlowEvent) {
            const aid = annotId(row.id);
            annotationsXML += `    <textAnnotation id="${aid}"><text>${escapeXml(row.étape.trim())}</text></textAnnotation>\n`;
            annotAssocsXML += `    <association id="${annotAssocId(row.id)}" sourceRef="${eid}" targetRef="${aid}" associationDirection="None"/>\n`;
        }

        for (const out of (row.outputs || [])) {
            if (!out.targetId) continue;
            const tgtRow = nodeMap.get(out.targetId);
            if (!tgtRow) continue;
            const flowId = `Flow_${row.id}_${out.targetId}`;
            const labelAttr = out.label ? ` name="${escapeXml(out.label)}"` : '';
            flowsXML += `    <sequenceFlow id="${flowId}"${labelAttr} sourceRef="${eid}" targetRef="${mainId(tgtRow)}"/>\n`;
        }
    }

    // ── DI : shapes ────────────────────────────────────────────
    const POOL_X = 0;
    // Hauteur du pool élargie pour laisser la place aux annotations au-dessus de
    // chaque nœud (computePlacements ne les connaît pas, elle calcule pour le
    // diagramme métier qui n'en a pas).
    let maxBottom = 0;
    for (const pos of positions.values()) if (pos.y + pos.h + 60 > maxBottom) maxBottom = pos.y + pos.h + 60;
    const poolHeight = (maxBottom - POOL_Y) + ANNOT_H + ANNOT_GAP;
    const yOffset = ANNOT_H + ANNOT_GAP; // tout le contenu descend pour laisser la place aux annotations en haut

    let shapesXML = '';
    shapesXML += `      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="false">
        <dc:Bounds x="${POOL_X}" y="${POOL_Y}" width="${poolWidth}" height="${poolHeight}"/>
      </bpmndi:BPMNShape>\n`;
    for (const acteur of acteurs) {
        const lid = laneId(acteur, acteurType.get(acteur) ?? '');
        const lx = POOL_X + (laneX.get(acteur) ?? 0);
        const lw = laneWidth.get(acteur) ?? 0;
        shapesXML += `      <bpmndi:BPMNShape id="${lid}_di" bpmnElement="${lid}" isHorizontal="false">
        <dc:Bounds x="${lx}" y="${POOL_Y}" width="${lw}" height="${poolHeight}"/>
      </bpmndi:BPMNShape>\n`;
    }

    for (const row of data) {
        const pos = positions.get(row.id);
        if (!pos) continue;
        const eid = mainId(row);
        const absX = POOL_X + pos.x;
        const absY = pos.y + yOffset;
        const type = row.typeBpmn as NodeType;
        const isEv = type === 'StartEvent' || type === 'EndEvent';
        const isGw = isGateway(type);

        shapesXML += `      <bpmndi:BPMNShape id="${eid}_di" bpmnElement="${eid}"${isGw ? ' isMarkerVisible="true"' : ''}>
        <dc:Bounds x="${Math.round(absX)}" y="${Math.round(absY)}" width="${pos.w}" height="${pos.h}"/>`;
        if (isEv || isGw) {
            const lw = isGw ? 100 : 80;
            shapesXML += `
        <bpmndi:BPMNLabel><dc:Bounds x="${Math.round(absX + pos.w / 2 - lw / 2)}" y="${Math.round(absY + pos.h + 5)}" width="${lw}" height="40"/></bpmndi:BPMNLabel>`;
        }
        shapesXML += `\n      </bpmndi:BPMNShape>\n`;

        // Annotation centrée au-dessus du nœud.
        if (row.étape?.trim() && !isEv && !isGw) {
            const aid = annotId(row.id);
            const ax = Math.round(absX + pos.w / 2 - ANNOT_W / 2);
            const ay = Math.round(absY - ANNOT_GAP - ANNOT_H);
            shapesXML += `      <bpmndi:BPMNShape id="${aid}_di" bpmnElement="${aid}">
        <dc:Bounds x="${ax}" y="${ay}" width="${ANNOT_W}" height="${ANNOT_H}"/>
      </bpmndi:BPMNShape>\n`;
        }
    }

    // ── DI : edges — routage simplifié (pas les cas spéciaux boucle/split du
    // diagramme métier, cette vue n'en a pas besoin pour être lisible) ──────
    let edgesXML = '';
    function wp(x: number, y: number) { return `        <di:waypoint x="${Math.round(x)}" y="${Math.round(y)}" />\n`; }

    for (const row of data) {
        const s = positions.get(row.id);
        if (!s) continue;
        const eid = mainId(row);
        const sAbsY = s.y + yOffset;
        const sCx = s.x + s.w / 2, sCy = sAbsY + s.h / 2, sBot = sAbsY + s.h, sRight = s.x + s.w, sLeft = s.x;

        for (const out of (row.outputs || [])) {
            if (!out.targetId) continue;
            const tgtRow = nodeMap.get(out.targetId);
            const t = positions.get(out.targetId);
            if (!tgtRow || !t) continue;
            const tAbsY = t.y + yOffset;
            const tCx = t.x + t.w / 2, tCy = tAbsY + t.h / 2, tTop = tAbsY, tBot = tAbsY + t.h;

            const flowId = `Flow_${row.id}_${out.targetId}`;
            const sameLane = row.acteur === tgtRow.acteur;
            let wps: string;
            if (tCy < sCy - 20) {
                // Remonte (boucle) — contourne par la gauche du pool, quelle que soit la lane.
                const leftX = -40;
                wps = wp(sLeft, sCy) + wp(leftX, sCy) + wp(leftX, tCy) + wp(t.x, tCy);
            } else if (sameLane) {
                wps = wp(sCx, sBot) + wp(tCx, tTop);
            } else if (tCx > sCx) {
                wps = wp(sRight, sCy) + wp(tCx, sCy) + wp(tCx, tTop);
            } else {
                wps = wp(sLeft, sCy) + wp(tCx, sCy) + wp(tCx, tTop);
            }
            edgesXML += `      <bpmndi:BPMNEdge id="${flowId}_di" bpmnElement="${flowId}">\n${wps}      </bpmndi:BPMNEdge>\n`;
        }

        // Association vers l'annotation — ligne courte verticale, nœud → annotation.
        if (row.étape?.trim() && row.typeBpmn !== 'StartEvent' && row.typeBpmn !== 'EndEvent' && !isGateway(row.typeBpmn as NodeType)) {
            const aid = annotAssocId(row.id);
            edgesXML += `      <bpmndi:BPMNEdge id="${aid}_di" bpmnElement="${aid}">
${wp(sCx, sAbsY)}${wp(sCx, sAbsY - ANNOT_GAP)}      </bpmndi:BPMNEdge>\n`;
        }
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             id="Definitions_1"
             targetNamespace="http://bpmn.io/schema/bpmn">

  <collaboration id="Collab_1">
    <participant id="Participant_1" name="${escapeXml(processName)}" processRef="Process_1"/>
  </collaboration>

  <process id="Process_1" isExecutable="false">
    <laneSet id="LaneSet_1">
${lanesXML}    </laneSet>
${elementsXML}${annotationsXML}${annotAssocsXML}${flowsXML}  </process>

  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collab_1">
${shapesXML}${edgesXML}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;
}

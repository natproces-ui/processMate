// src/logic/bpmnGeneratorSimple.ts
import type { Table1Row } from './types';

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

const POOL_Y = -98;   // Y du pool (bpmn-js convention)
const LANE_HEADER = 100;   // hauteur de l'en-tête de lane (label)
const START_Y = 80;    // Y du premier élément
const STEP_Y = 130;   // espacement vertical entre rangs
const LANE_W = 280;   // largeur d'une lane normale
const SPLIT_LANE_W = 560;   // largeur d'une lane avec split gateway (2 sous-colonnes)
const NODE_W = 220;
const NODE_H = 60;
const GW_SIZE = 50;
const EV_SIZE = 36;
const TOOL_H = 28;
const TOOL_OFFSET = 8;     // espace entre tâche et outil en dessous

// ─────────────────────────────────────────────────────────────
// TYPES INTERNES
// ─────────────────────────────────────────────────────────────

type NodeType = 'StartEvent' | 'EndEvent' | 'Task' | 'ExclusiveGateway' | 'ParallelGateway' | 'InclusiveGateway';

interface NodeInfo {
    id: string;
    type: NodeType;
    acteur: string;
    nom: string;
    outil: string;
}

interface Edge {
    src: string;
    tgt: string;
    label: string;
}

interface Position {
    x: number;
    y: number;
    w: number;
    h: number;
    cx: number;
    cy: number;
}

// ─────────────────────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function isGateway(type: NodeType): boolean {
    return type === 'ExclusiveGateway' || type === 'ParallelGateway' || type === 'InclusiveGateway';
}

function elementId(id: string, type: NodeType): string {
    const prefix: Record<NodeType, string> = {
        StartEvent: 'Start', EndEvent: 'End', Task: 'Task',
        ExclusiveGateway: 'Gateway', ParallelGateway: 'ParGateway', InclusiveGateway: 'IncGateway',
    };
    return `${prefix[type]}_${id}`;
}

function toolId(id: string): string { return `Tool_${id}`; }
function toolAssocId(id: string): string { return `ToolAssoc_${id}`; }

// Convention : Lane_ext_ pour externe, Lane_int_ pour interne
// Le renderer détecte le préfixe pour appliquer le bon style visuel
function laneId(acteur: string, typeActeur: 'interne' | 'externe' | ''): string {
    const prefix = typeActeur === 'externe' ? 'Lane_ext_' : 'Lane_int_';
    return prefix + acteur.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
}

function nodeW(type: NodeType): number {
    if (type === 'StartEvent' || type === 'EndEvent') return EV_SIZE;
    if (isGateway(type)) return GW_SIZE;
    return NODE_W;
}
function nodeH(type: NodeType): number {
    if (type === 'StartEvent' || type === 'EndEvent') return EV_SIZE;
    if (isGateway(type)) return GW_SIZE;
    return NODE_H;
}

// ─────────────────────────────────────────────────────────────
// DÉTECTION DES BOUCLES ARRIÈRE (DFS tricolore)
// ─────────────────────────────────────────────────────────────

function detectBackEdges(
    nodes: NodeInfo[],
    successors: Map<string, Edge[]>,
): Set<string> {
    const color = new Map<string, 0 | 1 | 2>(nodes.map(n => [n.id, 0]));
    const back = new Set<string>();

    function dfs(id: string) {
        color.set(id, 1);
        for (const e of successors.get(id) ?? []) {
            const c = color.get(e.tgt) ?? 0;
            if (c === 1) back.add(`${id}→${e.tgt}`);
            else if (c === 0) dfs(e.tgt);
        }
        color.set(id, 2);
    }

    for (const n of nodes) {
        if ((color.get(n.id) ?? 0) === 0) dfs(n.id);
    }
    return back;
}

// ─────────────────────────────────────────────────────────────
// TRI TOPOLOGIQUE (Kahn)
// ─────────────────────────────────────────────────────────────

function topoSort(
    nodes: NodeInfo[],
    edges: Edge[],
    backEdges: Set<string>,
): string[] {
    const inDeg = new Map<string, number>(nodes.map(n => [n.id, 0]));
    for (const e of edges) {
        if (!backEdges.has(`${e.src}→${e.tgt}`)) {
            inDeg.set(e.tgt, (inDeg.get(e.tgt) ?? 0) + 1);
        }
    }
    const queue = nodes.filter(n => (inDeg.get(n.id) ?? 0) === 0).map(n => n.id);
    const result: string[] = [];
    while (queue.length > 0) {
        queue.sort();
        const id = queue.shift()!;
        result.push(id);
        for (const e of (successors_global.get(id) ?? [])) {
            if (backEdges.has(`${id}→${e.tgt}`)) continue;
            const deg = (inDeg.get(e.tgt) ?? 1) - 1;
            inDeg.set(e.tgt, deg);
            if (deg === 0) queue.push(e.tgt);
        }
    }
    return result;
}

// Variable globale temporaire pour le tri topo (nécessaire car closure)
let successors_global = new Map<string, Edge[]>();

// ─────────────────────────────────────────────────────────────
// ACCESSIBILITÉ DANS LA LANE (propagation du côté d'une branche)
// ─────────────────────────────────────────────────────────────

// Renvoie tous les nœuds atteignables depuis startId en restant dans la même
// lane (acteur), sans emprunter de back-edge (boucle arrière).
function reachableInLane(
    startId: string,
    lane: string,
    nodeMap: Map<string, NodeInfo>,
    successors: Map<string, Edge[]>,
    backEdges: Set<string>,
): Set<string> {
    const visited = new Set<string>();
    const queue: string[] = [startId];
    while (queue.length > 0) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        const node = nodeMap.get(id);
        if (!node || node.acteur !== lane) continue;
        visited.add(id);
        const outs = (successors.get(id) ?? []).filter(e => !backEdges.has(`${id}→${e.tgt}`));
        for (const e of outs) {
            if (!visited.has(e.tgt)) queue.push(e.tgt);
        }
    }
    return visited;
}

// ─────────────────────────────────────────────────────────────
// CALCUL DES RANGS (premier prédécesseur = roi)
// ─────────────────────────────────────────────────────────────

function computeRanks(
    topoOrder: string[],
    predecessors: Map<string, Edge[]>,
    backEdges: Set<string>,
    splitNodes: Map<string, { side: 'left' | 'right'; gateway: string }>,
    ranks: Map<string, number>,
): void {
    for (const id of topoOrder) {
        // Branche split : rang gateway + 1 (en dessous, côte à côte horizontalement)
        if (splitNodes.has(id)) {
            const { gateway } = splitNodes.get(id)!;
            ranks.set(id, (ranks.get(gateway) ?? 0) + 1);
            continue;
        }

        // Prédécesseurs valides (pas back-edge, déjà rankés)
        const validPreds = (predecessors.get(id) ?? []).filter(
            e => !backEdges.has(`${e.src}→${id}`) && ranks.has(e.src)
        );

        if (validPreds.length === 0) {
            ranks.set(id, 0);
        } else {
            // Premier prédécesseur dans l'ordre original = roi
            const firstPred = validPreds[0].src;
            ranks.set(id, (ranks.get(firstPred) ?? 0) + 1);
        }
    }
}

// ─────────────────────────────────────────────────────────────
// ALGORITHME PRINCIPAL DE PLACEMENT
// ─────────────────────────────────────────────────────────────

interface PlacementResult {
    positions: Map<string, Position>;
    laneX: Map<string, number>;
    laneWidth: Map<string, number>;
    poolWidth: number;
    poolHeight: number;
    sameLaneSplits: Map<string, { left: string; right: string }>;
}

function computePlacements(
    nodes: NodeInfo[],
    edges: Edge[],
    acteurs: string[],
): PlacementResult {
    // 1. Construire successeurs et prédécesseurs
    const successors = new Map<string, Edge[]>();
    const predecessors = new Map<string, Edge[]>();
    for (const e of edges) {
        successors.set(e.src, [...(successors.get(e.src) ?? []), e]);
        predecessors.set(e.tgt, [...(predecessors.get(e.tgt) ?? []), e]);
    }
    successors_global = successors;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // 2. Boucles arrière
    const backEdges = detectBackEdges(nodes, successors);

    // 3. Détection des splits gateway dans la même lane
    // Split = gateway dont au moins 2 sorties sont dans la même lane que lui
    const sameLaneSplits = new Map<string, { left: string; right: string }>();

    for (const node of nodes) {
        if (!isGateway(node.type)) continue;
        const gwLane = node.acteur;
        const outs = (successors.get(node.id) ?? []).filter(
            e => !backEdges.has(`${node.id}→${e.tgt}`)
        );
        const sameLaneOuts = outs.filter(e => nodeMap.get(e.tgt)?.acteur === gwLane);

        if (sameLaneOuts.length >= 2) {
            const oui = sameLaneOuts.find(e => e.label === 'Oui')?.tgt ?? sameLaneOuts[0].tgt;
            const non = sameLaneOuts.find(e => e.label === 'Non')?.tgt ?? sameLaneOuts[1].tgt;
            sameLaneSplits.set(node.id, { left: non, right: oui });
        }
    }

    // Premier nœud de chaque branche (immédiatement après le gateway) — sert au
    // calcul du RANG (une seule ligne, juste sous le gateway, gauche/droite).
    const splitEntryNodes = new Map<string, { side: 'left' | 'right'; gateway: string }>();
    for (const [gw, { left, right }] of sameLaneSplits) {
        splitEntryNodes.set(left, { side: 'left', gateway: gw });
        splitEntryNodes.set(right, { side: 'right', gateway: gw });
    }

    // Ensemble ÉLARGI des nœuds d'une branche — sert au calcul du X (sous-colonne).
    // On propage le côté (gauche/droite) à toute la branche — pas seulement au
    // premier nœud après le gateway — jusqu'à ce qu'elle sorte de la lane ou
    // reconverge avec l'autre branche. Un nœud atteignable depuis les DEUX
    // côtés est un point de jonction : il reste centré (pas de côté assigné).
    const splitNodes = new Map<string, { side: 'left' | 'right'; gateway: string }>();
    for (const [gw, { left, right }] of sameLaneSplits) {
        const gwLane = nodeMap.get(gw)!.acteur;
        const leftReach = reachableInLane(left, gwLane, nodeMap, successors, backEdges);
        const rightReach = reachableInLane(right, gwLane, nodeMap, successors, backEdges);
        for (const id of leftReach) {
            if (!rightReach.has(id)) splitNodes.set(id, { side: 'left', gateway: gw });
        }
        for (const id of rightReach) {
            if (!leftReach.has(id)) splitNodes.set(id, { side: 'right', gateway: gw });
        }
    }

    // Lanes avec split → largeur double
    const lanesWithSplit = new Set<string>();
    for (const [gw] of sameLaneSplits) {
        lanesWithSplit.add(nodeMap.get(gw)!.acteur);
    }

    // 4. Tri topologique
    const topoOrder = topoSort(nodes, edges, backEdges);

    // 5. Calcul des rangs
    const ranks = new Map<string, number>();
    computeRanks(topoOrder, predecessors, backEdges, splitEntryNodes, ranks);

    // 6. Re-trier par rang
    const sortedByRank = [...topoOrder].sort((a, b) => (ranks.get(a) ?? 0) - (ranks.get(b) ?? 0));

    // 7. Positions X des lanes
    const laneWidth = new Map<string, number>();
    const laneX = new Map<string, number>();
    let curX = 0;
    for (const acteur of acteurs) {
        const w = lanesWithSplit.has(acteur) ? SPLIT_LANE_W : LANE_W;
        laneWidth.set(acteur, w);
        laneX.set(acteur, curX);
        curX += w;
    }
    const poolWidth = curX;

    // 8. Placement Y avec gestion des collisions par slot
    // Slot = (lane, subcol, y) → subcol = null | 'left' | 'right'
    const occupied = new Set<string>();
    const positions = new Map<string, Position>();

    function slotKey(lane: string, subcol: string | null, y: number): string {
        return `${lane}:${subcol ?? 'main'}:${y}`;
    }

    function isOccupied(lane: string, subcol: string | null, y: number): boolean {
        return occupied.has(slotKey(lane, subcol, y));
    }

    function markOccupied(lane: string, subcol: string | null, y: number): void {
        occupied.add(slotKey(lane, subcol, y));
    }

    function isSlotFreeForNode(lane: string, subcol: string | null, y: number): boolean {
        if (subcol !== null) {
            // Branche d'un split : uniquement vérifier la sous-colonne
            return !isOccupied(lane, subcol, y);
        }
        // Nœud normal dans une lane avec split : doit éviter les deux subcols ET main
        if (lanesWithSplit.has(lane)) {
            return !isOccupied(lane, null, y) &&
                !isOccupied(lane, 'left', y) &&
                !isOccupied(lane, 'right', y);
        }
        return !isOccupied(lane, null, y);
    }

    function firstFreeY(lane: string, subcol: string | null, fromY: number): number {
        let y = fromY;
        while (!isSlotFreeForNode(lane, subcol, y)) {
            y += STEP_Y;
        }
        return y;
    }

    for (const id of sortedByRank) {
        const node = nodeMap.get(id);
        if (!node) continue;

        const lane = node.acteur;
        const lx = laneX.get(lane) ?? 0;
        const lw = laneWidth.get(lane) ?? LANE_W;
        const w = nodeW(node.type);
        const h = nodeH(node.type);

        // Rang → Y de base
        const r = ranks.get(id) ?? 0;
        const baseY = START_Y + r * STEP_Y;

        // Sous-colonne pour les splits
        const splitInfo = splitNodes.get(id);
        const subcol = splitInfo?.side ?? null;

        const actualY = firstFreeY(lane, subcol, baseY);
        markOccupied(lane, subcol, actualY);

        // Calcul X
        let x: number;
        if (splitInfo) {
            const subW = lw / 2; // 280
            const subX = splitInfo.side === 'left' ? lx : lx + subW;
            x = subX + (subW - w) / 2;
        } else {
            x = lx + (lw - w) / 2;
        }

        const px = Math.round(x);
        const py = Math.round(actualY);
        positions.set(id, { x: px, y: py, w, h, cx: px + w / 2, cy: py + h / 2 });
    }

    // 9. Hauteur du pool
    let maxBottom = 0;
    for (const pos of positions.values()) {
        const bottom = pos.y + pos.h + TOOL_H + TOOL_OFFSET + 50;
        if (bottom > maxBottom) maxBottom = bottom;
    }
    const poolHeight = maxBottom - POOL_Y;

    return { positions, laneX, laneWidth, poolWidth, poolHeight, sameLaneSplits };
}

// ─────────────────────────────────────────────────────────────
// GÉNÉRATION XML BPMN
// ─────────────────────────────────────────────────────────────

export function generateBPMNSimple(
    data: Table1Row[],
    processName = 'Processus',
): string {
    if (!data.length) throw new Error('Aucune donnée');

    // Construire les structures internes
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
            .map(o => ({ src: row.id, tgt: o.targetId, label: o.label || '' }))
    );

    // Ordre des acteurs (ordre d'apparition dans les données)
    const acteurs: string[] = [];
    for (const row of data) {
        if (!acteurs.includes(row.acteur)) acteurs.push(row.acteur);
    }

    // Map acteur → typeActeur (premier trouvé fait foi, cohérence garantie par le prompt)
    const acteurType = new Map<string, 'interne' | 'externe' | ''>();
    for (const row of data) {
        if (!acteurType.has(row.acteur)) {
            acteurType.set(row.acteur, row.typeActeur ?? '');
        }
    }

    // Calcul des placements
    const { positions, laneX, laneWidth, poolWidth, poolHeight, sameLaneSplits: sameLaneSplitsRef } = computePlacements(nodes, edges, acteurs);

    const nodeMap = new Map(data.map(r => [r.id, r]));

    // ── Lanes XML ─────────────────────────────────────────────
    let lanesXML = '';
    for (const acteur of acteurs) {
        const type = acteurType.get(acteur) ?? '';
        const lid = laneId(acteur, type);
        const laneNodes = data.filter(r => r.acteur === acteur);
        const refs = laneNodes
            .map(r => `        <flowNodeRef>${elementId(r.id, r.typeBpmn as NodeType)}</flowNodeRef>`)
            .join('\n');
        const toolRefs = laneNodes
            .filter(r => r.outil?.trim() && r.typeBpmn !== 'StartEvent' && r.typeBpmn !== 'EndEvent')
            .map(r => `        <flowNodeRef>${toolId(r.id)}</flowNodeRef>`)
            .join('\n');
        lanesXML += `      <lane id="${lid}" name="${escapeXml(acteur)}">\n${refs}\n${toolRefs}\n      </lane>\n`;
    }

    // ── Éléments BPMN XML ─────────────────────────────────────
    let elementsXML = '';
    let toolsXML = '';
    let toolAssocsXML = '';
    let flowsXML = '';

    for (const row of data) {
        const eid = elementId(row.id, row.typeBpmn as NodeType);
        const name = escapeXml(row.étape || '');
        const cond = escapeXml(row.condition || row.étape || '');
        const outgoing = (row.outputs || [])
            .filter(o => o.targetId)
            .map(o => `<outgoing>Flow_${row.id}_${o.targetId}</outgoing>`)
            .join('');

        switch (row.typeBpmn as NodeType) {
            case 'StartEvent':
                elementsXML += `    <startEvent id="${eid}" name="${name}">${outgoing}</startEvent>\n`;
                break;
            case 'EndEvent':
                elementsXML += `    <endEvent id="${eid}" name="${name}"></endEvent>\n`;
                break;
            case 'ExclusiveGateway':
                elementsXML += `    <exclusiveGateway id="${eid}" name="${cond}" isMarkerVisible="true">${outgoing}</exclusiveGateway>\n`;
                break;
            case 'ParallelGateway':
                elementsXML += `    <parallelGateway id="${eid}" name="${name}">${outgoing}</parallelGateway>\n`;
                break;
            case 'InclusiveGateway':
                elementsXML += `    <inclusiveGateway id="${eid}" name="${cond}">${outgoing}</inclusiveGateway>\n`;
                break;
            default:
                elementsXML += `    <userTask id="${eid}" name="${name}">${outgoing}</userTask>\n`;
        }

        // Outil
        if (row.outil?.trim() && row.typeBpmn !== 'StartEvent' && row.typeBpmn !== 'EndEvent') {
            const tid = toolId(row.id);
            const aid = toolAssocId(row.id);
            toolsXML += `    <serviceTask id="${tid}" name="${escapeXml(row.outil)}"/>\n`;
            toolAssocsXML += `    <association id="${aid}" name="link" sourceRef="${eid}" targetRef="${tid}" associationDirection="None"/>\n`;
        }

        // Flux
        for (const out of (row.outputs || [])) {
            if (!out.targetId) continue;
            const tgtRow = nodeMap.get(out.targetId);
            if (!tgtRow) continue;
            const flowId = `Flow_${row.id}_${out.targetId}`;
            const labelAttr = out.label ? ` name="${escapeXml(out.label)}"` : '';
            flowsXML += `    <sequenceFlow id="${flowId}"${labelAttr} sourceRef="${eid}" targetRef="${elementId(tgtRow.id, tgtRow.typeBpmn as NodeType)}"/>\n`;
        }
    }

    // ── DI : Shapes XML ───────────────────────────────────────
    let shapesXML = '';

    // Pool — origines absolues pour bpmn-js
    const POOL_X = 0;
    shapesXML += `      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="false">
        <dc:Bounds x="${POOL_X}" y="${POOL_Y}" width="${poolWidth}" height="${poolHeight}"/>
      </bpmndi:BPMNShape>\n`;

    // Lanes
    for (const acteur of acteurs) {
        const type = acteurType.get(acteur) ?? '';
        const lid = laneId(acteur, type);
        const lx = POOL_X + (laneX.get(acteur) ?? 0);
        const lw = laneWidth.get(acteur) ?? LANE_W;
        shapesXML += `      <bpmndi:BPMNShape id="${lid}_di" bpmnElement="${lid}" isHorizontal="false">
        <dc:Bounds x="${lx}" y="${POOL_Y}" width="${lw}" height="${poolHeight}"/>
      </bpmndi:BPMNShape>\n`;
    }

    // Nœuds + outils
    for (const row of data) {
        const eid = elementId(row.id, row.typeBpmn as NodeType);
        const pos = positions.get(row.id);
        if (!pos) continue;

        const lx = POOL_X + (laneX.get(row.acteur) ?? 0);
        const absx = lx + pos.x - (laneX.get(row.acteur) ?? 0);

        // Pour les shapes, on utilise la position absolue = laneX + offset dans la lane
        // pos.x est déjà calculé comme position absolue dans computePlacements
        const absX = POOL_X + pos.x;
        const absY = pos.y;

        const type = row.typeBpmn as NodeType;
        const isEv = type === 'StartEvent' || type === 'EndEvent';
        const isGw = isGateway(type);

        shapesXML += `      <bpmndi:BPMNShape id="${eid}_di" bpmnElement="${eid}"${isGw ? ' isMarkerVisible="true"' : ''}>
        <dc:Bounds x="${Math.round(absX)}" y="${Math.round(absY)}" width="${pos.w}" height="${pos.h}"/>`;

        if (isEv || isGw) {
            const lw = isGw ? 100 : 80;
            const lh = 40;
            shapesXML += `
        <bpmndi:BPMNLabel>
          <dc:Bounds x="${Math.round(absX + pos.w / 2 - lw / 2)}" y="${Math.round(absY + pos.h + 5)}" width="${lw}" height="${lh}"/>
        </bpmndi:BPMNLabel>`;
        }

        shapesXML += `\n      </bpmndi:BPMNShape>\n`;

        // Outil — aligné à gauche de la tâche
        if (row.outil?.trim() && !isEv) {
            const tid = toolId(row.id);
            const ty = Math.round(absY + pos.h + TOOL_OFFSET);
            const tx = Math.round(absX); // aligné à gauche de la tâche
            shapesXML += `      <bpmndi:BPMNShape id="${tid}_di" bpmnElement="${tid}">
        <dc:Bounds x="${tx}" y="${ty}" width="140" height="${TOOL_H}"/>
      </bpmndi:BPMNShape>\n`;
        }
    }

    // ── DI : Edges XML avec waypoints Manhattan ──────────────────
    let edgesXML = '';

    // ── Fonction waypoints Manhattan ─────────────────────────────
    // Règles :
    // 1. Même lane, descend       → vertical direct (bot→top)
    // 2. Cross-lane droite/gauche, descend → L-shape par le bas du src
    // 3. Remonte cross-lane (boucle) → contourner par le bord gauche du pool
    // 4. Remonte même lane ou cross → sortir par le haut, contourner à gauche

    const POOL_LEFT_MARGIN = -40; // bord gauche hors pool pour boucles arrière

    function wp(x: number, y: number): string {
        return `        <di:waypoint x="${Math.round(x)}" y="${Math.round(y)}" />\n`;
    }

    function computeWaypoints(srcId: string, tgtId: string): string {
        const s = positions.get(srcId);
        const t = positions.get(tgtId);
        if (!s || !t) return '';

        const sBot = s.y + s.h;
        const sLeft = s.x;
        const sRight = s.x + s.w;
        const sCx = s.cx;
        const sCy = s.cy;

        const tTop = t.y;
        const tBot = t.y + t.h;
        const tLeft = t.x;
        const tRight = t.x + t.w;
        const tCx = t.cx;
        const tCy = t.cy;

        const goingRight = tCx > sCx + 20;
        const goingLeft = tCx < sCx - 20;
        const srcLaneIdx = acteurs.indexOf(nodeMap.get(srcId)?.acteur ?? '');
        const tgtLaneIdx = acteurs.indexOf(nodeMap.get(tgtId)?.acteur ?? '');
        const sameLane = srcLaneIdx === tgtLaneIdx;
        const goingUp = tCy < sCy - 20;

        // ─── Cas 0 : connexion quasi-horizontale (même Y exact) ──────
        // Couvre les connexions entre éléments au même rang horizontal
        const horizThreshold = 15;
        if (Math.abs(sCy - tCy) < horizThreshold && (goingRight || goingLeft)) {
            if (goingRight) return wp(sRight, sCy) + wp(tLeft, tCy);
            else return wp(sLeft, sCy) + wp(tRight, tCy);
        }

        // ─── Cas 0b : gateway split dans même lane (Oui droite, Non gauche) ─
        // Le gateway et ses branches sont dans la même lane mais Y différents
        // Oui → droite du gateway → descend → entre par le haut de la tâche
        // Non → gauche du gateway → descend → entre par le haut de la tâche
        const srcNode = nodeMap.get(srcId);
        if (srcNode && isGateway(srcNode.typeBpmn as NodeType)) {
            // Chercher si c'est un split gateway avec branches dans la même lane
            for (const [gw, sides] of sameLaneSplitsRef) {
                if (gw === srcId) {
                    if (tgtId === sides.right) {
                        // Oui → sort à droite du gateway → centre haut de la tâche
                        return wp(sRight, sCy) + wp(tCx, sCy) + wp(tCx, tTop);
                    }
                    if (tgtId === sides.left) {
                        // Non → sort à gauche du gateway → centre haut de la tâche
                        return wp(sLeft, sCy) + wp(tCx, sCy) + wp(tCx, tTop);
                    }
                }
            }
        }

        // ─── Cas 1 : boucle arrière — remonte + cross-lane ───────────
        // Règle B: sort par la gauche → va au cx de la tâche → entre par le bas
        if (goingUp && !sameLane) {
            if (goingLeft) {
                // Va à gauche ET remonte → entre par le bas de la tâche
                return wp(sLeft, sCy) +
                    wp(tCx, sCy) +
                    wp(tCx, tBot);
            }
            // Va à droite ET remonte → contourner par le bord gauche du pool
            return wp(sLeft, sCy) +
                wp(POOL_LEFT_MARGIN, sCy) +
                wp(POOL_LEFT_MARGIN, tCy) +
                wp(tLeft, tCy);
        }

        // ─── Cas 2 : remonte dans la même lane ───────────────────────
        if (goingUp && sameLane) {
            const leftX = sLeft - 40;
            return wp(sLeft, sCy) +
                wp(leftX, sCy) +
                wp(leftX, tBot + 5) +
                wp(tCx, tBot + 5) +
                wp(tCx, tBot);
        }

        // ─── Cas 3 : même lane, descend ──────────────────────────────
        // Règle C: si décalé en X → sort par la droite vers le cx du gateway
        if (sameLane) {
            const xOffset = Math.abs(sCx - tCx);
            if (xOffset > 20) {
                // Tâche décalée → sort par droite/gauche, va au cx de la cible, descend
                if (tCx > sCx) {
                    return wp(sRight, sCy) + wp(tCx, sCy) + wp(tCx, tTop);
                } else {
                    return wp(sLeft, sCy) + wp(tCx, sCy) + wp(tCx, tTop);
                }
            }
            return wp(sCx, sBot) + wp(sCx, tTop);
        }

        // ─── Cas 4 : cross-lane droite, descend ──────────────────────
        // Règle A: sort par la DROITE → va au cx tgt → descend au top tgt
        if (goingRight) {
            return wp(sRight, sCy) + wp(tCx, sCy) + wp(tCx, tTop);
        }

        // ─── Cas 5 : cross-lane gauche, descend ──────────────────────
        if (goingLeft) {
            return wp(sLeft, sCy) + wp(tCx, sCy) + wp(tCx, tTop);
        }

        // ─── Fallback : vertical direct ──────────────────────────────
        return wp(sCx, sBot) + wp(tCx, tTop);
    }

    // Associations outils — crochet gauche: left(tâche),cy → left-10,cy → left-10,cy_outil → left_outil,cy_outil
    for (const row of data) {
        if (!row.outil?.trim() || row.typeBpmn === 'StartEvent' || row.typeBpmn === 'EndEvent') continue;
        const aid = toolAssocId(row.id);
        const pos = positions.get(row.id);
        if (!pos) { edgesXML += `      <bpmndi:BPMNEdge id="${aid}_di" bpmnElement="${aid}"/>\n`; continue; }
        const absX = POOL_X + pos.x;
        const absY = pos.y;
        const taskLeft = Math.round(absX);
        const taskCy = Math.round(absY + pos.h / 2);
        const hookX = taskLeft - 10;
        const toolTop = Math.round(absY + pos.h + TOOL_OFFSET);
        const toolCy = Math.round(toolTop + TOOL_H / 2);
        edgesXML += `      <bpmndi:BPMNEdge id="${aid}_di" bpmnElement="${aid}">
        <di:waypoint x="${taskLeft}" y="${taskCy}"/>
        <di:waypoint x="${hookX}" y="${taskCy}"/>
        <di:waypoint x="${hookX}" y="${toolCy}"/>
        <di:waypoint x="${taskLeft}" y="${toolCy}"/>
      </bpmndi:BPMNEdge>\n`;
    }

    // Sequence flows avec waypoints Manhattan
    for (const row of data) {
        for (const out of (row.outputs || [])) {
            if (!out.targetId) continue;
            const flowId = `Flow_${row.id}_${out.targetId}`;
            const wps = computeWaypoints(row.id, out.targetId);
            edgesXML += `      <bpmndi:BPMNEdge id="${flowId}_di" bpmnElement="${flowId}">\n${wps}      </bpmndi:BPMNEdge>\n`;
        }
    }

    // ── Assemblage final ──────────────────────────────────────
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
${elementsXML}${toolsXML}${toolAssocsXML}${flowsXML}  </process>

  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collab_1">
${shapesXML}${edgesXML}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;
}
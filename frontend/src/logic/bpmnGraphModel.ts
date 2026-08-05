// src/logic/bpmnGraphModel.ts
//
// Modèle de graphe partagé (nœuds + rangs + lanes), extrait de bpmnGeneratorSimple.ts.
// Utilisé dans les deux sens :
//   - table → diagramme : bpmnGeneratorSimple.ts (positionnement des shapes)
//   - diagramme → table : bpmnParser.ts (reconstruction de l'ordre des lignes)
//
// Extraction pure — le comportement de generateBPMNSimple ne doit pas changer.
// Seul changement de fond : topoSort ne dépend plus d'une variable globale mutable
// (successors_global) mais reçoit `successors` en paramètre, pour être réutilisable
// en toute sécurité depuis plusieurs appelants (table→diagramme et diagramme→table).

export type NodeType =
    | 'StartEvent' | 'EndEvent' | 'Task'
    | 'ExclusiveGateway' | 'ParallelGateway' | 'InclusiveGateway';

export interface GraphNode {
    id: string;
    type: NodeType;
    acteur: string;
}

export interface GraphEdge {
    src: string;
    tgt: string;
    label: string;
}

// ─────────────────────────────────────────────────────────────
// IDENTIFIANTS — convention partagée table↔diagramme
// ─────────────────────────────────────────────────────────────

export function isGateway(type: NodeType): boolean {
    return type === 'ExclusiveGateway' || type === 'ParallelGateway' || type === 'InclusiveGateway';
}

export function elementId(id: string, type: NodeType): string {
    const prefix: Record<NodeType, string> = {
        StartEvent: 'Start', EndEvent: 'End', Task: 'Task',
        ExclusiveGateway: 'Gateway', ParallelGateway: 'ParGateway', InclusiveGateway: 'IncGateway',
    };
    return `${prefix[type]}_${id}`;
}

export function toolId(id: string): string { return `Tool_${id}`; }
export function toolAssocId(id: string): string { return `ToolAssoc_${id}`; }

// Convention : Lane_ext_ pour externe, Lane_int_ pour interne.
// Le renderer (BpmnEditor.tsx) détecte le préfixe pour appliquer le bon style visuel,
// et le parseur (bpmnParser.ts) le relit pour retrouver typeActeur.
export function laneId(acteur: string, typeActeur: 'interne' | 'externe' | ''): string {
    const prefix = typeActeur === 'externe' ? 'Lane_ext_' : 'Lane_int_';
    return prefix + acteur.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
}

// ─────────────────────────────────────────────────────────────
// ADJACENCE
// ─────────────────────────────────────────────────────────────

export interface Adjacency {
    successors: Map<string, GraphEdge[]>;
    predecessors: Map<string, GraphEdge[]>;
}

export function buildAdjacency(edges: GraphEdge[]): Adjacency {
    const successors = new Map<string, GraphEdge[]>();
    const predecessors = new Map<string, GraphEdge[]>();
    for (const e of edges) {
        successors.set(e.src, [...(successors.get(e.src) ?? []), e]);
        predecessors.set(e.tgt, [...(predecessors.get(e.tgt) ?? []), e]);
    }
    return { successors, predecessors };
}

// ─────────────────────────────────────────────────────────────
// DÉTECTION DES BOUCLES ARRIÈRE (DFS tricolore)
// ─────────────────────────────────────────────────────────────

export function detectBackEdges(
    nodes: GraphNode[],
    successors: Map<string, GraphEdge[]>,
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
//
// Historique : cette fonction lisait auparavant une variable de module mutable
// (`successors_global`, fixée par l'appelant juste avant l'appel) au lieu du
// paramètre `successors`. Ça ne posait pas de problème tant qu'un seul appelant
// existait (computePlacements), mais c'est dangereux dès qu'on veut réutiliser le
// modèle de graphe depuis plusieurs endroits (table→diagramme ET diagramme→table).
// Corrigé ici : `successors` est un paramètre explicite. Comportement identique
// pour l'appelant existant (bpmnGeneratorSimple.ts lui passe la même map).

export function topoSort(
    nodes: GraphNode[],
    successors: Map<string, GraphEdge[]>,
    backEdges: Set<string>,
): string[] {
    const inDeg = new Map<string, number>(nodes.map(n => [n.id, 0]));
    for (const [, outs] of successors) {
        for (const e of outs) {
            if (!backEdges.has(`${e.src}→${e.tgt}`)) {
                inDeg.set(e.tgt, (inDeg.get(e.tgt) ?? 0) + 1);
            }
        }
    }
    const queue = nodes.filter(n => (inDeg.get(n.id) ?? 0) === 0).map(n => n.id);
    const result: string[] = [];
    while (queue.length > 0) {
        queue.sort();
        const id = queue.shift()!;
        result.push(id);
        for (const e of (successors.get(id) ?? [])) {
            if (backEdges.has(`${id}→${e.tgt}`)) continue;
            const deg = (inDeg.get(e.tgt) ?? 1) - 1;
            inDeg.set(e.tgt, deg);
            if (deg === 0) queue.push(e.tgt);
        }
    }
    return result;
}

// ─────────────────────────────────────────────────────────────
// ACCESSIBILITÉ DANS LA LANE (propagation du côté d'une branche)
// ─────────────────────────────────────────────────────────────

export function reachableInLane(
    startId: string,
    lane: string,
    nodeMap: Map<string, GraphNode>,
    successors: Map<string, GraphEdge[]>,
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

export function computeRanks(
    topoOrder: string[],
    predecessors: Map<string, GraphEdge[]>,
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
// ORDRE LINÉAIRE STABLE (sens diagramme → tableau)
// ─────────────────────────────────────────────────────────────
//
// Étant donné des nœuds/arêtes quelconques (typiquement lus depuis un diagramme
// bpmn-js par bpmnParser.ts), produit un ordre linéaire stable : rang topologique
// d'abord, puis départage explicite pour les nœuds de même rang (branches
// parallèles). Départage : position X sur le canevas si elle est connue (reflète
// ce que l'utilisateur a visuellement disposé), sinon ordre topologique brut.
//
// Ne gère pas les splits "même lane" (sameLaneSplits) de bpmnGeneratorSimple.ts —
// c'est un raffinement du positionnement table→diagramme, pas nécessaire pour
// simplement ordonner des lignes de tableau.

export interface OrderedResult {
    order: string[];
    ranks: Map<string, number>;
}

export function orderNodesByRankAndPosition(
    nodes: GraphNode[],
    edges: GraphEdge[],
    opts?: { xOf?: (id: string) => number | undefined },
): OrderedResult {
    const { successors, predecessors } = buildAdjacency(edges);
    const backEdges = detectBackEdges(nodes, successors);
    const topoOrder = topoSort(nodes, successors, backEdges);

    const ranks = new Map<string, number>();
    computeRanks(topoOrder, predecessors, backEdges, new Map(), ranks);

    const xOf = opts?.xOf;
    const topoIndex = new Map(topoOrder.map((id, i) => [id, i]));

    const order = [...topoOrder].sort((a, b) => {
        const ra = ranks.get(a) ?? 0;
        const rb = ranks.get(b) ?? 0;
        if (ra !== rb) return ra - rb;

        const xa = xOf?.(a);
        const xb = xOf?.(b);
        if (xa !== undefined && xb !== undefined && xa !== xb) return xa - xb;

        // Repli : ordre topologique déjà calculé (déterministe, stable).
        return (topoIndex.get(a) ?? 0) - (topoIndex.get(b) ?? 0);
    });

    return { order, ranks };
}

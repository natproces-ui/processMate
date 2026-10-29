// lib/screenFlow.ts — Écrans d'une procédure dans l'ordre où ses étapes s'enchaînent.
//
// On suit le workflow depuis son début : la branche choisie à chaque décision (la première par
// défaut, sans reboucler), toutes les branches d'un parallèle l'une après l'autre. Le choix d'une
// branche se fait en désignant une étape (choicesToReach) : on suit alors le chemin qui y mène.
// Le résultat est découpé en unités affichées à la suite : écrans, « creux » (étapes sans écran),
// décisions, liens vers d'autres process, fin.

import type { Table1Row } from '@/logic/types';
import type { TaskEnrichment } from '@/logic/bpmnTypes';
import type { ResolvedLink } from '@/lib/processLinks';

export type Choices = Map<string, number>; // id de l'étape de décision → index de la sortie suivie

const isDecision = (r: Table1Row) =>
    r.typeBpmn.endsWith('Gateway') && r.typeBpmn !== 'ParallelGateway' && (r.outputs || []).length > 1;

function startOf(rows: Table1Row[]) {
    return rows.find(r => r.typeBpmn === 'StartEvent') ?? rows[0];
}

/** Étapes dans l'ordre du parcours (les passerelles parallèles, sans contenu, sont omises). */
export function walkProcedure(rows: Table1Row[], choices: Choices): Table1Row[] {
    const byId = new Map(rows.map(r => [r.id, r]));
    const indegree = new Map<string, number>();
    rows.forEach(r => (r.outputs || []).forEach(o => indegree.set(o.targetId, (indegree.get(o.targetId) || 0) + 1)));
    const isJoin = (r: Table1Row) => r.typeBpmn === 'ParallelGateway' && (indegree.get(r.id) || 0) > 1;
    const out: Table1Row[] = [];
    const visited = new Set<string>();

    const run = (start: string | undefined, stopAtJoin: boolean): string | null => {
        let id = start;
        while (id) {
            const r = byId.get(id);
            if (!r || visited.has(id)) return null;
            if (stopAtJoin && isJoin(r)) return id;
            visited.add(id);
            if (r.typeBpmn !== 'ParallelGateway') out.push(r);
            const outs = (r.outputs || []).filter(o => byId.has(o.targetId));
            if (outs.length === 0) return null;
            if (r.typeBpmn === 'ParallelGateway' && outs.length > 1) {
                let join: string | null = null;
                for (const o of outs) join = run(o.targetId, true) ?? join;
                if (!join) return null;
                visited.add(join);
                id = byId.get(join)?.outputs?.[0]?.targetId;
                continue;
            }
            if (outs.length > 1) {
                const chosen = outs[Math.min(choices.get(r.id) ?? 0, outs.length - 1)];
                id = (visited.has(chosen.targetId) ? outs.find(o => !visited.has(o.targetId)) : chosen)?.targetId;
                continue;
            }
            id = outs[0].targetId;
        }
        return null;
    };

    run(startOf(rows)?.id, false);
    return out;
}

/** Choix de branches qui font passer le parcours par `targetId` (chemin le plus court). */
export function choicesToReach(rows: Table1Row[], targetId: string, current: Choices): Choices {
    const byId = new Map(rows.map(r => [r.id, r]));
    const start = startOf(rows);
    if (!start) return current;
    const parent = new Map<string, { from: string; index: number }>();
    const queue = [start.id];
    const seen = new Set(queue);
    while (queue.length) {
        const id = queue.shift()!;
        if (id === targetId) break;
        (byId.get(id)?.outputs || []).forEach((o, index) => {
            if (seen.has(o.targetId) || !byId.has(o.targetId)) return;
            seen.add(o.targetId);
            parent.set(o.targetId, { from: id, index });
            queue.push(o.targetId);
        });
    }
    if (!seen.has(targetId)) return current;
    const next = new Map(current);
    for (let id = targetId; parent.has(id);) {
        const { from, index } = parent.get(id)!;
        if (isDecision(byId.get(from)!)) next.set(from, index);
        id = from;
    }
    return next;
}

// ─── Unités affichées ─────────────────────────────────────────

export type FlowUnit<S> =
    | { kind: 'screen'; key: string; rows: Table1Row[]; screen: S; toolName: string }
    | { kind: 'gap'; key: string; rows: Table1Row[] }
    | { kind: 'decision'; key: string; row: Table1Row; chosen: number }
    | { kind: 'link'; key: string; row: Table1Row; link: ResolvedLink }
    | { kind: 'end'; key: string; row: Table1Row };

export function buildFlowUnits<S extends { id: string }>(
    path: Table1Row[],
    enrichments: Record<string, TaskEnrichment>,
    links: ResolvedLink[],
    choices: Choices,
    screenOf: (toolName: string, screenId: string) => S | undefined,
): FlowUnit<S>[] {
    const units: FlowUnit<S>[] = [];
    const last = () => units[units.length - 1];

    path.forEach(row => {
        if (isDecision(row)) {
            units.push({ kind: 'decision', key: `d-${row.id}`, row, chosen: Math.min(choices.get(row.id) ?? 0, row.outputs.length - 1) });
        } else if (row.typeBpmn === 'EndEvent') {
            units.push({ kind: 'end', key: `e-${row.id}`, row });
        } else if (!row.typeBpmn.endsWith('Gateway')) {
            const screens = (enrichments[row.id]?.ecrans ?? [])
                .map(id => (row.outil ? screenOf(row.outil, id) : undefined))
                .filter((s): s is S => !!s);
            if (screens.length === 0) {
                const prev = last();
                if (prev?.kind === 'gap') prev.rows.push(row);
                else units.push({ kind: 'gap', key: `g-${row.id}`, rows: [row] });
            }
            screens.forEach(screen => {
                const prev = last();
                // Étapes qui se suivent sur le même écran : une seule vue
                if (prev?.kind === 'screen' && prev.screen.id === screen.id) {
                    if (!prev.rows.includes(row)) prev.rows.push(row);
                } else {
                    units.push({ kind: 'screen', key: `s-${row.id}-${screen.id}`, rows: [row], screen, toolName: row.outil });
                }
            });
        }
        links.filter(l => l.step_id === row.id && l.type !== 'necessite')
            .forEach(link => units.push({ kind: 'link', key: `l-${row.id}-${link.session_id}`, row, link }));
    });
    return units;
}

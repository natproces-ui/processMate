// lib/screenFlow.ts — Ordre dans lequel les étapes d'une procédure s'enchaînent.
//
// On suit le workflow depuis son début : la branche choisie à chaque décision (la première par
// défaut, sans reboucler), toutes les branches d'un parallèle l'une après l'autre.

import type { Table1Row } from '@/logic/types';

export type Choices = Map<string, number>; // id de l'étape de décision → index de la sortie suivie

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

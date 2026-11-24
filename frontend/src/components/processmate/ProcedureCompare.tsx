'use client';

// Comparer : l'AS IS et le TO BE d'un même processus, côte à côte. Chaque étape du TO BE garde l'étape de l'AS IS dont
// elle vient (même identifiant, ou la table `origines` du TO BE) : on en déduit ce qui est nouveau, modifié ou supprimé.
// Cliquer une étape la montre dans les deux versions, avec sa description.
import { useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import type { Table1Row } from '@/logic/types';
import type { TaskEnrichment } from '@/logic/bpmnTypes';
import StepLinkedDiagram, { type StepLinkedDiagramHandle } from '@/components/shared/StepLinkedDiagram';

export interface CompareSide { rows: Table1Row[]; xml: string; enrichments: Map<string, TaskEnrichment> }
type Diff = 'nouvelle' | 'modifiee' | 'supprimee';

const same = (a: Table1Row, b: Table1Row) =>
    a.étape === b.étape && a.acteur === b.acteur && (a.outil || '') === (b.outil || '') && a.typeBpmn === b.typeBpmn;

/** Différences entre l'AS IS et le TO BE (origines : étape TO BE vers étape AS IS, quand les identifiants diffèrent) */
export function diffVersions(asis: Table1Row[], tobe: Table1Row[], origines: Record<string, string> = {}) {
    const asisById = new Map(asis.map(r => [r.id, r]));
    // une table d'origine (TO BE écrit à part) fait foi seule ; sinon le TO BE est une copie : même identifiant, même étape
    const hasTable = Object.keys(origines).length > 0;
    const originOf = (id: string) => hasTable ? origines[id] : (asisById.has(id) ? id : undefined);
    const tobeDiff: Record<string, Diff> = {};
    const asisDiff: Record<string, Diff> = {};
    const reprises = new Set<string>();
    for (const r of tobe) {
        const o = originOf(r.id);
        if (!o || !asisById.has(o)) { tobeDiff[r.id] = 'nouvelle'; continue; }
        reprises.add(o);
        if (!same(r, asisById.get(o)!)) { tobeDiff[r.id] = 'modifiee'; asisDiff[o] = 'modifiee'; }
    }
    for (const r of asis) if (!reprises.has(r.id)) asisDiff[r.id] = 'supprimee';
    const count = (d: Record<string, Diff>, k: Diff) => Object.values(d).filter(v => v === k).length;
    return { tobeDiff, asisDiff, originOf, nouvelles: count(tobeDiff, 'nouvelle'), modifiees: count(tobeDiff, 'modifiee'), supprimees: count(asisDiff, 'supprimee') };
}

const LABEL: Record<Diff, string> = { nouvelle: 'Nouvelle', modifiee: 'Modifiée', supprimee: 'Supprimée' };

export default function ProcedureCompare({ asis, tobe, origines }: { asis: CompareSide; tobe: CompareSide; origines?: Record<string, string> }) {
    const d = useMemo(() => diffVersions(asis.rows, tobe.rows, origines), [asis.rows, tobe.rows, origines]);
    const [sel, setSel] = useState<{ side: 'asis' | 'tobe'; id: string } | null>(null);
    const left = useRef<StepLinkedDiagramHandle>(null);
    const right = useRef<StepLinkedDiagramHandle>(null);

    // l'étape choisie, dans les deux versions
    const asisSel = !sel ? [] : sel.side === 'asis' ? [sel.id] : [d.originOf(sel.id)].filter(Boolean) as string[];
    const tobeSel = !sel ? [] : sel.side === 'tobe' ? [sel.id] : tobe.rows.filter(r => d.originOf(r.id) === sel.id).map(r => r.id);
    const tobeRow = tobeSel[0] ? tobe.rows.find(r => r.id === tobeSel[0]) : undefined;
    const asisRow = asisSel[0] ? asis.rows.find(r => r.id === asisSel[0]) : undefined;
    const status: Diff | 'conservee' | undefined = !sel ? undefined
        : sel.side === 'asis' ? (d.asisDiff[sel.id] === 'supprimee' ? 'supprimee' : d.asisDiff[sel.id] ? 'modifiee' : 'conservee')
            : (d.tobeDiff[sel.id] || 'conservee');
    const desc = (tobeRow && tobe.enrichments.get(tobeRow.id)?.descriptif) || (asisRow && asis.enrichments.get(asisRow.id)?.descriptif) || '';

    // une fonction de rendu, pas un composant : sinon chaque clic recréerait les logigrammes
    const pane = (title: string, side: 'asis' | 'tobe', data: CompareSide, diff: Record<string, Diff>, selected: string[],
        refObj: React.RefObject<StepLinkedDiagramHandle | null>) => (
        <section aria-label={title} className="flex min-h-[320px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-baseline justify-between border-b border-neutral-200 px-3 py-2">
                <h3 className="text-sm font-semibold text-petrole">{title}</h3>
                <span className="text-[11px] text-neutral-600">{data.rows.length} étapes</span>
            </div>
            <div className="relative min-h-0 flex-1">
                <StepLinkedDiagram ref={refObj} xml={data.xml} diff={diff} selectedIds={selected}
                    onSelect={id => setSel(id ? { side, id } : null)} />
            </div>
        </section>
    );

    return (
        <div className="flex h-full min-h-[480px] flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-700">
                <span><strong className="text-neutral-900">{d.nouvelles}</strong> nouvelle{d.nouvelles > 1 ? 's' : ''}, <strong className="text-neutral-900">{d.modifiees}</strong> modifiée{d.modifiees > 1 ? 's' : ''}, <strong className="text-neutral-900">{d.supprimees}</strong> supprimée{d.supprimees > 1 ? 's' : ''}</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border-[3px] border-petrole bg-petrole-tint" />nouvelle</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border-2 border-dashed border-petrole" />modifiée</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border-2 border-dashed border-neutral-500 opacity-60" />supprimée (dans l’AS IS)</span>
                <span className="text-neutral-500">Cliquez une étape : elle s’affiche dans les deux versions.</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
                {pane('AS IS', 'asis', asis, d.asisDiff, asisSel, left)}
                {pane('TO BE', 'tobe', tobe, d.tobeDiff, tobeSel, right)}
            </div>
            {sel && (
                <div className="shrink-0 rounded-xl border border-petrole/30 bg-petrole-tint/40 px-4 py-2.5 text-xs leading-relaxed text-neutral-800">
                    <p className="text-sm font-semibold text-neutral-900">
                        {status && <span className="mr-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-petrole">{status === 'conservee' ? 'Conservée' : LABEL[status]}</span>}
                        {tobeRow?.étape || asisRow?.étape}
                    </p>
                    {asisRow && tobeRow && asisRow.étape !== tobeRow.étape && <p className="mt-0.5 text-neutral-600">Dans l’AS IS : {asisRow.étape}</p>}
                    {status === 'supprimee' && <p className="mt-0.5 text-neutral-600">Cette étape de l’AS IS n’a plus d’équivalent dans le TO BE.</p>}
                    {desc && <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-line">{desc}</p>}
                </div>
            )}
        </div>
    );
}

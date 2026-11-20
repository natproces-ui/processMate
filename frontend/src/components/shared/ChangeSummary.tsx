'use client';

/**
 * Carte « 3 étapes modifiées — Voir les changements · Annuler » après une modification
 * demandée au chat (comme les modifications de fichiers chez Claude) : on voit ce qui a
 * changé, on va voir les étapes concernées, on annule d'un clic.
 */
import { useState } from 'react';
import { ChevronRight, Minus, PenLine, Plus, Undo2 } from 'lucide-react';
import type { Table1Row } from '@/logic/types';

export interface StepChange {
    kind: 'added' | 'modified' | 'removed';
    id: string;
    label: string;
    /** Pour une étape modifiée : ce qui a changé (« acteur : Agent → Chargé de clientèle ») */
    details?: string[];
}

const FIELDS: [keyof Table1Row, string][] = [
    ['étape', 'libellé'], ['acteur', 'acteur'], ['département', 'département'], ['outil', 'outil'],
    ['condition', 'condition'], ['typeBpmn', 'type'],
];

const short = (v: unknown) => {
    const s = String(v ?? '').trim();
    return s ? (s.length > 40 ? `${s.slice(0, 40)}…` : s) : '—';
};

/** Différences entre deux versions d'une procédure, étape par étape. */
export function diffWorkflows(before: Table1Row[], after: Table1Row[]): StepChange[] {
    const prev = new Map(before.map(r => [r.id, r]));
    const next = new Map(after.map(r => [r.id, r]));
    const changes: StepChange[] = [];
    for (const r of after) {
        const old = prev.get(r.id);
        if (!old) { changes.push({ kind: 'added', id: r.id, label: r.étape }); continue; }
        const details: string[] = [];
        for (const [k, name] of FIELDS) {
            if (String(old[k] ?? '') !== String(r[k] ?? '')) details.push(`${name} : ${short(old[k])} → ${short(r[k])}`);
        }
        const links = (x: Table1Row) => (x.outputs || []).map(o => `${o.targetId}:${o.label || ''}`).sort().join('|');
        if (links(old) !== links(r)) details.push('enchaînement modifié');
        if (details.length) changes.push({ kind: 'modified', id: r.id, label: r.étape, details });
    }
    for (const r of before) if (!next.has(r.id)) changes.push({ kind: 'removed', id: r.id, label: r.étape });
    return changes;
}

export function changeTitle(changes: StepChange[]): string {
    const n = changes.length;
    return `${n} étape${n > 1 ? 's' : ''} modifiée${n > 1 ? 's' : ''}`;
}

export default function ChangeSummary({ changes, onShow, onUndo, undone, disabled, procedure }: {
    changes: StepChange[];
    /** Procédure modifiée, quand la conversation en contient plusieurs et que ce n'était pas l'affichée */
    procedure?: string;
    onShow?: (ids: string[]) => void;
    onUndo?: () => void;
    undone?: boolean;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    if (!changes.length) return null;
    const count = (k: StepChange['kind']) => changes.filter(c => c.kind === k).length;
    const parts = [
        count('added') && `${count('added')} ajoutée${count('added') > 1 ? 's' : ''}`,
        count('modified') && `${count('modified')} modifiée${count('modified') > 1 ? 's' : ''}`,
        count('removed') && `${count('removed')} supprimée${count('removed') > 1 ? 's' : ''}`,
    ].filter(Boolean).join(' · ');
    const visibleIds = changes.filter(c => c.kind !== 'removed').map(c => c.id);

    return (
        <div className={`rounded-xl border border-neutral-200 bg-white text-sm text-neutral-900 ${undone ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
                    className="flex min-w-0 items-center gap-1.5 font-medium hover:underline">
                    <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                    <PenLine className="w-4 h-4 shrink-0" />
                    <span>{undone ? 'Modifications annulées' : changeTitle(changes)}</span>
                </button>
                <span className="text-xs text-neutral-500">{procedure && <span className="font-medium text-neutral-900">{procedure} · </span>}{parts}</span>
                <span className="ml-auto flex items-center gap-1">
                    {onShow && visibleIds.length > 0 && !undone && (
                        <button type="button" onClick={() => onShow(visibleIds)}
                            className="rounded-md px-2 py-1 text-xs font-medium hover:bg-neutral-100">Voir dans la procédure</button>
                    )}
                    {onUndo && !undone && (
                        <button type="button" onClick={onUndo} disabled={disabled}
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-100 disabled:opacity-40">
                            <Undo2 className="w-3.5 h-3.5" /> Annuler
                        </button>
                    )}
                </span>
            </div>
            {open && (
                <ul className="border-t border-neutral-100 px-3 py-2 space-y-1.5" aria-label="Changements">
                    {changes.map(c => (
                        <li key={`${c.kind}:${c.id}`} className="flex items-start gap-2">
                            <span className={`mt-0.5 shrink-0 rounded p-0.5 ${c.kind === 'added' ? 'bg-emerald-50 text-emerald-700' : c.kind === 'removed' ? 'bg-red-50 text-red-700' : 'bg-neutral-100 text-neutral-900'}`}>
                                {c.kind === 'added' ? <Plus className="w-3 h-3" /> : c.kind === 'removed' ? <Minus className="w-3 h-3" /> : <PenLine className="w-3 h-3" />}
                            </span>
                            <span className="min-w-0">
                                {c.kind !== 'removed' && onShow && !undone ? (
                                    <button type="button" onClick={() => onShow([c.id])} className="text-left hover:underline">{c.label || c.id}</button>
                                ) : (
                                    <span className={c.kind === 'removed' ? 'line-through text-neutral-500' : ''}>{c.label || c.id}</span>
                                )}
                                {c.details && c.details.length > 0 && (
                                    <span className="block text-xs text-neutral-500">{c.details.join(' · ')}</span>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

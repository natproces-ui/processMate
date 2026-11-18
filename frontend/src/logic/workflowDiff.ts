/**
 * Comparaison de deux états d'une procédure (lot 5).
 * - Historique des versions : étapes ajoutées / supprimées / modifiées.
 * - Modification par le chat : si seuls des libellés changent, le diagramme BPMN existant
 *   est mis à jour sur place (positions conservées) au lieu d'être régénéré.
 */
import type { Table1Row } from '@/logic/types';

export const COMPARED_FIELDS = ['étape', 'typeBpmn', 'département', 'acteur', 'typeActeur', 'condition', 'outil', 'outputs'] as const;
type Field = typeof COMPARED_FIELDS[number];

/** Champs dont le changement ne touche que le texte affiché d'un élément du diagramme. */
const LABEL_FIELDS: ReadonlySet<Field> = new Set(['étape', 'condition']);

export interface WorkflowDiff {
    added: Table1Row[];
    removed: Table1Row[];
    modified: { id: string; before: Table1Row; after: Table1Row; fields: Field[] }[];
}

const norm = (row: Table1Row, f: Field): string => {
    const v = (row as unknown as Record<string, unknown>)[f];
    if (f === 'outputs') {
        return JSON.stringify(((v as { targetId: string; label?: string }[]) || []).map(o => [o.targetId, o.label || '']));
    }
    return String(v ?? '').trim();
};

export function diffWorkflows(before: Table1Row[], after: Table1Row[]): WorkflowDiff {
    const prev = new Map(before.map(r => [r.id, r]));
    const next = new Map(after.map(r => [r.id, r]));
    const diff: WorkflowDiff = { added: [], removed: [], modified: [] };
    for (const r of after) if (!prev.has(r.id)) diff.added.push(r);
    for (const r of before) if (!next.has(r.id)) diff.removed.push(r);
    for (const r of after) {
        const old = prev.get(r.id);
        if (!old) continue;
        const fields = COMPARED_FIELDS.filter(f => norm(old, f) !== norm(r, f));
        if (fields.length) diff.modified.push({ id: r.id, before: old, after: r, fields });
    }
    return diff;
}

export function isEmptyDiff(d: WorkflowDiff): boolean {
    return !d.added.length && !d.removed.length && !d.modified.length;
}

/** Vrai si le diagramme peut être mis à jour sur place (libellés seulement, même structure). */
export function isLabelOnly(d: WorkflowDiff): boolean {
    return !d.added.length && !d.removed.length && d.modified.every(m => m.fields.every(f => LABEL_FIELDS.has(f)));
}

export function summarizeDiff(d: WorkflowDiff): string {
    const parts: string[] = [];
    if (d.added.length) parts.push(`${d.added.length} étape${d.added.length > 1 ? 's' : ''} ajoutée${d.added.length > 1 ? 's' : ''}`);
    if (d.removed.length) parts.push(`${d.removed.length} supprimée${d.removed.length > 1 ? 's' : ''}`);
    if (d.modified.length) parts.push(`${d.modified.length} modifiée${d.modified.length > 1 ? 's' : ''}`);
    return parts.join(', ') || 'aucune différence';
}

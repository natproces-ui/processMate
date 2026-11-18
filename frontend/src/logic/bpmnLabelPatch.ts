/**
 * Applique des changements de libellés à un diagramme BPMN existant, sans le régénérer
 * (lot 5) : les positions et retouches faites à la main sont conservées.
 * Mêmes règles de nommage que bpmnGeneratorSimple : passerelles exclusives et inclusives =
 * condition (ou, à défaut, libellé de l'étape) ; autres éléments = libellé de l'étape.
 * Renvoie null si le diagramme ne peut pas être modifié sur place (l'appelant régénère).
 */
import type { Table1Row } from '@/logic/types';
import { elementId, type NodeType } from '@/logic/bpmnGraphModel';
import type { WorkflowDiff } from '@/logic/workflowDiff';

const CONDITION_NAMED = new Set(['ExclusiveGateway', 'InclusiveGateway']);

function labelOf(row: Table1Row): string {
    return CONDITION_NAMED.has(row.typeBpmn) ? (row.condition || row.étape || '') : (row.étape || '');
}

export function applyLabelChanges(xml: string, diff: WorkflowDiff): string | null {
    if (typeof DOMParser === 'undefined' || diff.added.length || diff.removed.length) return null;
    try {
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) return null;
        const byId = new Map<string, Element>();
        const all = doc.getElementsByTagName('*');
        for (let i = 0; i < all.length; i++) {
            const id = all[i].getAttribute('id');
            if (id) byId.set(id, all[i]);
        }
        for (const m of diff.modified) {
            const el = byId.get(elementId(m.after.id, m.after.typeBpmn as NodeType));
            if (!el) return null; // élément introuvable (diagramme modifié à la main) : on régénère
            el.setAttribute('name', labelOf(m.after));
        }
        return new XMLSerializer().serializeToString(doc);
    } catch {
        return null;
    }
}

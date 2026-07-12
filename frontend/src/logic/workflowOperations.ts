// logic/workflowOperations.ts
// Vocabulaire d'opérations partagé pour modifier un Table1Row[] — utilisé par le chat
// (ChatInterface), et destiné à être réutilisé par toute autre source de modification
// de procédure (analyse IA, impacts réglementaires, édition directe du diagramme).
import type { Table1Row } from './types';

export type Operation = {
    type: 'add' | 'update' | 'delete' | 'move' | 'relink';
    id?: string;
    after_id?: string;
    row?: any;
    fields?: any;
    acteur?: string;
    département?: string;
    outputs?: { targetId: string; label: string }[];
    reconnect?: boolean;
};

export function applyOperations(workflow: Table1Row[], operations: Operation[]): Table1Row[] {
    let result = [...workflow];

    const maxId = result.reduce((max, row) => {
        const num = parseInt(row.id, 10);
        return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    let nextId = maxId + 1;

    const idMapping: Record<string, string> = {};
    operations.forEach(op => {
        if (op.type === 'add' && op.row?.id?.startsWith('NEW_')) {
            idMapping[op.row.id] = String(nextId++);
        }
    });

    const resolveId = (id: string) => idMapping[id] || id;
    const resolveOutputs = (outputs?: { targetId: string; label: string }[]) =>
        outputs?.map(o => ({ ...o, targetId: resolveId(o.targetId) })) || [];

    for (const op of operations) {
        switch (op.type) {
            case 'add': {
                if (!op.row) break;
                const newRow: Table1Row = {
                    id: resolveId(op.row.id || 'NEW_0'),
                    étape: op.row.étape || '',
                    typeBpmn: op.row.typeBpmn || 'Task',
                    département: op.row.département || '',
                    acteur: op.row.acteur || '',
                    typeActeur: op.row.typeActeur || '',
                    condition: op.row.condition || '',
                    outputs: resolveOutputs(op.row.outputs),
                    outil: op.row.outil || '',
                };
                if (!op.after_id) {
                    result = [newRow, ...result];
                } else {
                    const idx = result.findIndex(r => r.id === op.after_id);
                    result = idx === -1
                        ? [...result, newRow]
                        : [...result.slice(0, idx + 1), newRow, ...result.slice(idx + 1)];
                }
                break;
            }
            case 'update': {
                if (!op.id || !op.fields) break;
                result = result.map(row => {
                    if (row.id !== op.id) return row;
                    const updated = { ...row };
                    Object.entries(op.fields).forEach(([key, value]) => {
                        (updated as any)[key] = key === 'outputs'
                            ? resolveOutputs(value as any)
                            : value;
                    });
                    return updated;
                });
                break;
            }
            case 'delete': {
                if (!op.id) break;
                const toDelete = result.find(r => r.id === op.id);
                if (op.reconnect && toDelete) {
                    const deletedTargets = toDelete.outputs.map(o => o.targetId);
                    result = result.map(row => {
                        if (!row.outputs.some(o => o.targetId === op.id)) return row;
                        return {
                            ...row,
                            outputs: row.outputs.flatMap(o =>
                                o.targetId === op.id
                                    ? deletedTargets.map(t => ({ targetId: t, label: o.label }))
                                    : [o]
                            )
                        };
                    });
                }
                result = result.filter(r => r.id !== op.id);
                break;
            }
            case 'move': {
                if (!op.id) break;
                result = result.map(row =>
                    row.id !== op.id ? row : {
                        ...row,
                        acteur: op.acteur ?? row.acteur,
                        département: op.département ?? row.département,
                    }
                );
                break;
            }
            case 'relink': {
                if (!op.id) break;
                result = result.map(row =>
                    row.id !== op.id ? row : { ...row, outputs: resolveOutputs(op.outputs) }
                );
                break;
            }
        }
    }

    return result;
}

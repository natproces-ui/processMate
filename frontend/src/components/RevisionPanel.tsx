'use client';

import { useState, useRef, useEffect } from 'react';
import { Table1Row } from '@/logic/bpmnGenerator';
import { API_CONFIG } from '@/lib/api-config';
import {
    Wand2, Send, Loader2, CheckCircle2, AlertCircle,
    ChevronDown, ChevronUp, RotateCcw, Lightbulb, History
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface Operation {
    type: 'add' | 'update' | 'delete' | 'move' | 'relink';
    id?: string;
    after_id?: string;
    row?: Partial<Table1Row>;
    fields?: Partial<Table1Row>;
    acteur?: string;
    département?: string;
    outputs?: { targetId: string; label: string }[];
    reconnect?: boolean;
}

interface RevisionEntry {
    id: string;
    instruction: string;
    explanation: string;
    operations_count: number;
    timestamp: string;
    success: boolean;
    snapshot: Table1Row[]; // état avant révision pour undo
}

interface RevisionPanelProps {
    workflow: Table1Row[];
    onWorkflowChange: (workflow: Table1Row[]) => void;
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
}

// ─────────────────────────────────────────────────────────────
// EXEMPLES D'INSTRUCTIONS
// ─────────────────────────────────────────────────────────────

const EXAMPLES = [
    "Ajoute une étape de validation entre l'étape 3 et 4",
    "L'étape 5 doit pointer vers 7 au lieu de 6",
    "Renomme l'étape 8 en 'Contrôler les pièces justificatives'",
    "Supprime l'étape 12, elle est redondante",
    "Transforme l'étape 6 en gateway — si conforme vers 7, sinon retour vers 3",
    "Déplace l'étape 9 dans la swimlane Back Office",
];

// ─────────────────────────────────────────────────────────────
// APPLICATEUR DE PATCH (côté frontend)
// ─────────────────────────────────────────────────────────────

function applyOperations(workflow: Table1Row[], operations: Operation[]): Table1Row[] {
    let result = [...workflow];

    // Calculer le prochain ID numérique disponible
    const maxId = result.reduce((max, row) => {
        const num = parseInt(row.id, 10);
        return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    let nextId = maxId + 1;

    // Map NEW_x → vrai ID séquentiel
    const idMapping: Record<string, string> = {};

    // Pré-passe : résoudre les IDs "NEW_x"
    operations.forEach(op => {
        if (op.type === 'add' && op.row?.id?.startsWith('NEW_')) {
            idMapping[op.row.id] = String(nextId++);
        }
    });

    const resolveId = (id: string): string => idMapping[id] || id;

    // Résoudre les IDs dans les outputs
    const resolveOutputs = (outputs?: { targetId: string; label: string }[]) =>
        outputs?.map(o => ({ ...o, targetId: resolveId(o.targetId) })) || [];

    for (const op of operations) {
        switch (op.type) {

            // ── ADD ──────────────────────────────────────────
            case 'add': {
                if (!op.row) break;
                const newRow: Table1Row = {
                    id: resolveId(op.row.id || 'NEW_0'),
                    étape: op.row.étape || '',
                    typeBpmn: op.row.typeBpmn || 'Task',
                    département: op.row.département || '',
                    acteur: op.row.acteur || '',
                    condition: op.row.condition || '',
                    outputs: resolveOutputs(op.row.outputs as any),
                    outil: op.row.outil || '',
                };

                if (!op.after_id) {
                    result = [newRow, ...result];
                } else {
                    const idx = result.findIndex(r => r.id === op.after_id);
                    if (idx === -1) {
                        result = [...result, newRow];
                    } else {
                        result = [
                            ...result.slice(0, idx + 1),
                            newRow,
                            ...result.slice(idx + 1)
                        ];
                    }
                }
                break;
            }

            // ── UPDATE ───────────────────────────────────────
            case 'update': {
                if (!op.id || !op.fields) break;
                result = result.map(row => {
                    if (row.id !== op.id) return row;
                    const updated = { ...row };
                    Object.entries(op.fields!).forEach(([key, value]) => {
                        if (key === 'outputs') {
                            (updated as any)[key] = resolveOutputs(value as any);
                        } else {
                            (updated as any)[key] = value;
                        }
                    });
                    return updated;
                });
                break;
            }

            // ── DELETE ───────────────────────────────────────
            case 'delete': {
                if (!op.id) break;
                const toDelete = result.find(r => r.id === op.id);

                if (op.reconnect && toDelete) {
                    // Trouver les étapes qui pointaient vers celle supprimée
                    // et les rediriger vers les cibles de l'étape supprimée
                    const deletedTargets = toDelete.outputs.map(o => o.targetId);
                    result = result.map(row => {
                        const pointsToDeleted = row.outputs.some(o => o.targetId === op.id);
                        if (!pointsToDeleted) return row;
                        // Remplacer les outputs pointant vers l'étape supprimée
                        const newOutputs = row.outputs.flatMap(o =>
                            o.targetId === op.id
                                ? deletedTargets.map(t => ({ targetId: t, label: o.label }))
                                : [o]
                        );
                        return { ...row, outputs: newOutputs };
                    });
                }

                result = result.filter(r => r.id !== op.id);
                break;
            }

            // ── MOVE ─────────────────────────────────────────
            case 'move': {
                if (!op.id) break;
                result = result.map(row => {
                    if (row.id !== op.id) return row;
                    return {
                        ...row,
                        acteur: op.acteur ?? row.acteur,
                        département: op.département ?? row.département,
                    };
                });
                break;
            }

            // ── RELINK ───────────────────────────────────────
            case 'relink': {
                if (!op.id) break;
                result = result.map(row => {
                    if (row.id !== op.id) return row;
                    return { ...row, outputs: resolveOutputs(op.outputs) };
                });
                break;
            }
        }
    }

    return result;
}

// ─────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────

export default function RevisionPanel({
    workflow,
    onWorkflowChange,
    onSuccess,
    onError
}: RevisionPanelProps) {
    const [instruction, setInstruction] = useState('');
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<RevisionEntry[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [showExamples, setShowExamples] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [instruction]);

    const handleSubmit = async () => {
        if (!instruction.trim() || loading) return;
        if (workflow.length === 0) {
            onError('Le workflow est vide — rien à réviser.');
            return;
        }

        setLoading(true);
        const snapshot = [...workflow]; // sauvegarde pour undo

        try {
            const res = await fetch(
                API_CONFIG.getFullUrl(API_CONFIG.endpoints.revisionApply),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        workflow,
                        instruction: instruction.trim(),
                    })
                }
            );

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Erreur lors de la révision');

            // Appliquer le patch localement
            const revised = applyOperations(workflow, data.operations);
            onWorkflowChange(revised);

            // Enregistrer dans l'historique
            const entry: RevisionEntry = {
                id: crypto.randomUUID(),
                instruction: instruction.trim(),
                explanation: data.explanation,
                operations_count: data.operations_count,
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                success: true,
                snapshot,
            };
            setHistory(prev => [entry, ...prev]);

            onSuccess(`✓ ${data.explanation}`);
            setInstruction('');

        } catch (err: any) {
            onError(err.message || 'Erreur lors de la révision');

            const entry: RevisionEntry = {
                id: crypto.randomUUID(),
                instruction: instruction.trim(),
                explanation: 'Échec de la révision',
                operations_count: 0,
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                success: false,
                snapshot,
            };
            setHistory(prev => [entry, ...prev]);
        } finally {
            setLoading(false);
        }
    };

    const handleUndo = (entry: RevisionEntry) => {
        onWorkflowChange(entry.snapshot);
        onSuccess('↩ Révision annulée — état restauré');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

            {/* ── Header ───────────────────────────────────── */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                        <Wand2 className="w-4 h-4 text-violet-600" />
                    </div>
                    <div className="text-left">
                        <p className="text-sm font-semibold text-slate-800">Révision intelligente</p>
                        <p className="text-xs text-slate-500">
                            Modifiez le logigramme en langage naturel
                        </p>
                    </div>
                    {history.length > 0 && (
                        <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                            {history.length} révision{history.length > 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                {collapsed
                    ? <ChevronDown className="w-4 h-4 text-slate-400" />
                    : <ChevronUp className="w-4 h-4 text-slate-400" />
                }
            </button>

            {!collapsed && (
                <div className="px-5 pb-5 space-y-4 border-t border-slate-100 pt-4">

                    {/* ── Zone de saisie ───────────────────── */}
                    <div className="relative">
                        <textarea
                            ref={textareaRef}
                            value={instruction}
                            onChange={e => setInstruction(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Décrivez la modification souhaitée…&#10;Ex : Ajoute une étape de validation entre 5 et 6 dans la swimlane Conformité"
                            rows={2}
                            className="w-full px-4 py-3 pr-12 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 placeholder-slate-400 transition-all"
                            disabled={loading}
                        />
                        <button
                            onClick={handleSubmit}
                            disabled={!instruction.trim() || loading || workflow.length === 0}
                            className={`
                                absolute right-3 bottom-3 w-8 h-8 rounded-lg flex items-center justify-center
                                transition-all duration-200
                                ${!instruction.trim() || loading || workflow.length === 0
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-violet-600 text-white hover:bg-violet-700 active:scale-95'
                                }
                            `}
                            title="Envoyer (Ctrl+Entrée)"
                        >
                            {loading
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Send className="w-4 h-4" />
                            }
                        </button>
                    </div>

                    <p className="text-xs text-slate-400">
                        Ctrl+Entrée pour envoyer · {workflow.length} étape{workflow.length > 1 ? 's' : ''} dans le workflow
                    </p>

                    {/* ── Exemples ─────────────────────────── */}
                    <div>
                        <button
                            onClick={() => setShowExamples(!showExamples)}
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-600 transition-colors"
                        >
                            <Lightbulb className="w-3.5 h-3.5" />
                            {showExamples ? 'Masquer les exemples' : 'Voir des exemples'}
                        </button>

                        {showExamples && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {EXAMPLES.map((ex, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            setInstruction(ex);
                                            textareaRef.current?.focus();
                                        }}
                                        className="text-xs bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-all text-left"
                                    >
                                        {ex}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Historique ───────────────────────── */}
                    {history.length > 0 && (
                        <div>
                            <button
                                onClick={() => setShowHistory(!showHistory)}
                                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                            >
                                <History className="w-3.5 h-3.5" />
                                {showHistory ? 'Masquer l\'historique' : `Historique (${history.length})`}
                            </button>

                            {showHistory && (
                                <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                                    {history.map(entry => (
                                        <div
                                            key={entry.id}
                                            className={`
                                                flex items-start gap-3 p-3 rounded-lg border text-xs
                                                ${entry.success
                                                    ? 'bg-green-50 border-green-200'
                                                    : 'bg-red-50 border-red-200'
                                                }
                                            `}
                                        >
                                            {entry.success
                                                ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                                                : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                            }
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-slate-700 truncate">
                                                    {entry.instruction}
                                                </p>
                                                <p className="text-slate-500 mt-0.5">
                                                    {entry.explanation}
                                                </p>
                                                <p className="text-slate-400 mt-0.5">
                                                    {entry.timestamp} · {entry.operations_count} opération{entry.operations_count > 1 ? 's' : ''}
                                                </p>
                                            </div>
                                            {entry.success && (
                                                <button
                                                    onClick={() => handleUndo(entry)}
                                                    className="flex-shrink-0 flex items-center gap-1 text-slate-500 hover:text-slate-700 border border-slate-200 rounded px-2 py-1 bg-white hover:bg-slate-50 transition-colors"
                                                    title="Annuler cette révision"
                                                >
                                                    <RotateCcw className="w-3 h-3" />
                                                    Undo
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
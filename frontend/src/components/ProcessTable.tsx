'use client';
import { useState, useRef } from 'react';
import { FileText, Trash2, Plus, Edit, Eye, EyeOff, GripVertical } from 'lucide-react';
import { Table1Row } from '@/logic/bpmnGenerator';
import { TaskEnrichment } from '@/logic/bpmnTypes';
import EnrichmentModal from '@/components/DetailModal';

interface TableProps {
    data: Table1Row[];
    enrichments: Map<string, TaskEnrichment>;
    processTitle: string;
    onDataChange: (data: Table1Row[]) => void;
    onEnrichmentsChange: (enrichments: Map<string, TaskEnrichment>) => void;
    onShowSuccess: (message: string) => void;
}

// ─────────────────────────────────────────────────────────────
// HELPERS outputs[] ↔ string
// ─────────────────────────────────────────────────────────────

function outputsToString(outputs: { targetId: string; label: string }[]): string {
    return outputs
        .map(o => o.label ? `${o.targetId}:${o.label}` : o.targetId)
        .join(', ');
}

function parseOutputsString(str: string): { targetId: string; label: string }[] {
    if (!str.trim()) return [];
    return str
        .split(',')
        .map(part => {
            const colonIdx = part.indexOf(':');
            if (colonIdx === -1) return { targetId: part.trim(), label: '' };
            return {
                targetId: part.slice(0, colonIdx).trim(),
                label: part.slice(colonIdx + 1).trim(),
            };
        })
        .filter(o => o.targetId !== '');
}

// ─────────────────────────────────────────────────────────────
// RENUMÉROTATION
// Après un drag, on réassigne les ids 1,2,3...
// et on met à jour toutes les références dans outputs[]
// ─────────────────────────────────────────────────────────────

function renumberRows(rows: Table1Row[]): Table1Row[] {
    // Mapping ancien id → nouvel id
    const idMap = new Map<string, string>();
    rows.forEach((row, i) => {
        idMap.set(row.id, String(i + 1));
    });

    return rows.map((row, i) => ({
        ...row,
        id: String(i + 1),
        outputs: row.outputs.map(o => ({
            ...o,
            targetId: idMap.get(o.targetId) ?? o.targetId,
        })),
    }));
}

const GATEWAY_TYPES = ['ExclusiveGateway', 'ParallelGateway', 'InclusiveGateway'];

export default function Table({
    data,
    enrichments,
    processTitle,
    onDataChange,
    onEnrichmentsChange,
    onShowSuccess,
}: TableProps) {
    const [showTable2, setShowTable2] = useState(false);
    const [enrichmentModalOpen, setEnrichmentModalOpen] = useState(false);
    const [selectedTaskForEnrichment, setSelectedTaskForEnrichment] = useState<{ id: string; name: string } | null>(null);

    // ── Drag state ────────────────────────────────────────────
    const dragIndexRef = useRef<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // ── Enrichment modal ──────────────────────────────────────
    const openEnrichmentModal = (taskId: string, taskName: string) => {
        setSelectedTaskForEnrichment({ id: taskId, name: taskName });
        setEnrichmentModalOpen(true);
    };
    const closeEnrichmentModal = () => {
        setEnrichmentModalOpen(false);
        setSelectedTaskForEnrichment(null);
    };
    const handleSaveEnrichment = (enrichment: TaskEnrichment) => {
        const newEnrichments = new Map(enrichments);
        newEnrichments.set(enrichment.id_tache, enrichment);
        onEnrichmentsChange(newEnrichments);
        onShowSuccess('Détails sauvegardés !');
    };

    // ── Drag & drop handlers ──────────────────────────────────

    const handleDragStart = (e: React.DragEvent, index: number) => {
        dragIndexRef.current = index;
        setIsDragging(true);
        e.dataTransfer.effectAllowed = 'move';
        // Ghost image invisible — on gère visuellement via CSS
        const ghost = document.createElement('div');
        ghost.style.cssText = 'position:fixed;top:-999px';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 0, 0);
        setTimeout(() => document.body.removeChild(ghost), 0);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragIndexRef.current !== null && dragIndexRef.current !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDragEnd = () => {
        dragIndexRef.current = null;
        setDragOverIndex(null);
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        const fromIndex = dragIndexRef.current;
        if (fromIndex === null || fromIndex === dropIndex) {
            handleDragEnd();
            return;
        }

        // Réordonner
        const reordered = [...data];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(dropIndex, 0, moved);

        // Renuméroter + mettre à jour les outputs
        const renumbered = renumberRows(reordered);

        // Remettre à jour les enrichments avec les nouveaux ids
        const oldIds = reordered.map(r => r.id);         // ids avant renumber
        const newIds = renumbered.map(r => r.id);         // ids après renumber
        const newEnrichments = new Map<string, TaskEnrichment>();
        oldIds.forEach((oldId, i) => {
            const enr = enrichments.get(oldId);
            if (enr) {
                newEnrichments.set(newIds[i], {
                    ...enr,
                    id_tache: newIds[i],
                });
            }
        });

        onDataChange(renumbered);
        onEnrichmentsChange(newEnrichments);
        onShowSuccess('Ordre mis à jour — ids renumérotés');
        handleDragEnd();
    };

    // ── Champs simples ────────────────────────────────────────
    const handleChange = (index: number, field: keyof Table1Row, value: string) => {
        const updated = [...data];
        if (field === 'typeBpmn') {
            updated[index][field] = value as Table1Row['typeBpmn'];
            if (!GATEWAY_TYPES.includes(value)) updated[index].condition = '';
        } else {
            (updated[index] as any)[field] = value;
        }
        onDataChange(updated);
    };

    const handleOutputsChange = (index: number, value: string) => {
        const updated = [...data];
        updated[index] = { ...updated[index], outputs: parseOutputsString(value) };
        onDataChange(updated);
    };

    // ── Ajout / Suppression ───────────────────────────────────
    const handleAddRow = () => {
        const maxId = data.reduce((max, row) => {
            const num = parseInt(row.id, 10);
            return isNaN(num) ? max : Math.max(max, num);
        }, 0);
        const newId = String(maxId + 1);
        const newRow: Table1Row = {
            id: newId,
            étape: '',
            typeBpmn: 'Task',
            département: '',
            acteur: '',
            condition: '',
            outputs: [],
            outil: '',
        };
        onDataChange([...data, newRow]);
        const newEnrichments = new Map(enrichments);
        newEnrichments.set(newRow.id, {
            id_tache: newRow.id,
            descriptif: '',
            duree_estimee: '',
            frequence: '',
            kpi: '',
        });
        onEnrichmentsChange(newEnrichments);
    };

    const handleDeleteRow = (index: number) => {
        const rowToDelete = data[index];
        const remaining = data.filter((_, i) => i !== index);
        const renumbered = renumberRows(remaining);

        // Mettre à jour enrichments
        const oldIds = remaining.map(r => r.id);
        const newIds = renumbered.map(r => r.id);
        const newEnrichments = new Map<string, TaskEnrichment>();
        oldIds.forEach((oldId, i) => {
            const enr = enrichments.get(oldId);
            if (enr) newEnrichments.set(newIds[i], { ...enr, id_tache: newIds[i] });
        });

        onDataChange(renumbered);
        onEnrichmentsChange(newEnrichments);
    };

    // ─────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────

    return (
        <>
            {/* TABLE 1 */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-sm">
                        <caption className="bg-gray-800 text-white p-4 text-left">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <FileText className="w-5 h-5" />
                                {processTitle} ({data.length} étapes)
                            </h2>
                            <p className="text-xs text-gray-400 mt-1 font-normal">
                                Glissez <GripVertical className="inline w-3 h-3" /> pour réordonner les étapes — les IDs se mettent à jour automatiquement
                            </p>
                        </caption>
                        <thead className="bg-gray-700 text-white">
                            <tr>
                                <th className="border border-gray-600 px-2 py-2 w-8" title="Réordonner" />
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">ID</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Étape</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Type BPMN</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Département</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Acteur</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Condition</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">
                                    Sorties
                                    <span className="block text-xs font-normal text-gray-300">id:label, id:label</span>
                                </th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Outil</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="text-center py-12 text-gray-500">
                                        <div className="flex flex-col items-center gap-3">
                                            <FileText className="w-12 h-12 text-gray-300" />
                                            <p className="text-lg font-semibold">Tableau vide</p>
                                            <p className="text-sm">
                                                Uploadez une image, enregistrez vocalement ou ajoutez manuellement des lignes
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                data.map((row, i) => {
                                    const isBeingDragged = isDragging && dragIndexRef.current === i;
                                    const isDragTarget = dragOverIndex === i;

                                    return (
                                        <tr
                                            key={row.id}
                                            draggable
                                            onDragStart={e => handleDragStart(e, i)}
                                            onDragOver={e => handleDragOver(e, i)}
                                            onDrop={e => handleDrop(e, i)}
                                            onDragEnd={handleDragEnd}
                                            className={`
                                                transition-all duration-150
                                                ${isBeingDragged ? 'opacity-30' : 'opacity-100'}
                                                ${isDragTarget
                                                    ? 'border-t-2 border-t-blue-500 bg-blue-50'
                                                    : 'hover:bg-gray-50'
                                                }
                                            `}
                                        >
                                            {/* Handle drag */}
                                            <td className="border border-gray-300 px-2 py-1 text-center cursor-grab active:cursor-grabbing select-none">
                                                <GripVertical className="w-4 h-4 text-gray-400 mx-auto" />
                                            </td>

                                            {/* ID */}
                                            <td className="border border-gray-300 px-2 py-1 text-center font-mono text-xs bg-gray-100 select-none">
                                                {row.id}
                                            </td>

                                            {/* ÉTAPE */}
                                            <td className="border border-gray-300 p-1">
                                                <input
                                                    type="text"
                                                    value={row.étape}
                                                    onChange={e => handleChange(i, 'étape', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded"
                                                />
                                            </td>

                                            {/* TYPE BPMN */}
                                            <td className="border border-gray-300 p-1">
                                                <select
                                                    value={row.typeBpmn}
                                                    onChange={e => handleChange(i, 'typeBpmn', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded"
                                                >
                                                    <option value="StartEvent">StartEvent</option>
                                                    <option value="EndEvent">EndEvent</option>
                                                    <option value="Task">Task</option>
                                                    <option value="ExclusiveGateway">ExclusiveGateway</option>
                                                    <option value="ParallelGateway">ParallelGateway</option>
                                                    <option value="InclusiveGateway">InclusiveGateway</option>
                                                </select>
                                            </td>

                                            {/* DÉPARTEMENT */}
                                            <td className="border border-gray-300 p-1">
                                                <input
                                                    type="text"
                                                    value={row.département}
                                                    onChange={e => handleChange(i, 'département', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded"
                                                />
                                            </td>

                                            {/* ACTEUR */}
                                            <td className="border border-gray-300 p-1">
                                                <input
                                                    type="text"
                                                    value={row.acteur}
                                                    onChange={e => handleChange(i, 'acteur', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded"
                                                />
                                            </td>

                                            {/* CONDITION */}
                                            <td className="border border-gray-300 p-1">
                                                <input
                                                    type="text"
                                                    value={row.condition}
                                                    onChange={e => handleChange(i, 'condition', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded"
                                                    disabled={!GATEWAY_TYPES.includes(row.typeBpmn)}
                                                    placeholder={GATEWAY_TYPES.includes(row.typeBpmn) ? 'Question ?' : ''}
                                                />
                                            </td>

                                            {/* SORTIES */}
                                            <td className="border border-gray-300 p-1 min-w-[140px]">
                                                <input
                                                    type="text"
                                                    value={outputsToString(row.outputs)}
                                                    onChange={e => handleOutputsChange(i, e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded font-mono text-xs"
                                                    placeholder={
                                                        row.typeBpmn === 'ExclusiveGateway'
                                                            ? '10:Oui, 6:Non'
                                                            : row.typeBpmn === 'ParallelGateway'
                                                                ? '3, 5, 7'
                                                                : '3'
                                                    }
                                                />
                                            </td>

                                            {/* OUTIL */}
                                            <td className="border border-gray-300 p-1">
                                                <input
                                                    type="text"
                                                    value={row.outil}
                                                    onChange={e => handleChange(i, 'outil', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded"
                                                />
                                            </td>

                                            {/* ACTIONS */}
                                            <td className="border border-gray-300 p-1 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => openEnrichmentModal(row.id, row.étape)}
                                                        className="text-blue-600 hover:text-blue-800"
                                                        title="Ajouter/Modifier les détails"
                                                    >
                                                        {enrichments.has(row.id) &&
                                                            (enrichments.get(row.id)?.descriptif ||
                                                                enrichments.get(row.id)?.duree_estimee ||
                                                                enrichments.get(row.id)?.frequence ||
                                                                enrichments.get(row.id)?.kpi) ? (
                                                            <Edit className="w-5 h-5 fill-blue-200" />
                                                        ) : (
                                                            <Edit className="w-5 h-5" />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteRow(i)}
                                                        className="text-red-600 hover:text-red-800"
                                                        title="Supprimer la ligne"
                                                    >
                                                        <Trash2 className="w-5 h-5 mx-auto" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* BOUTONS ACTIONS */}
            <div className="mt-4 flex gap-4">
                <button
                    onClick={handleAddRow}
                    className="px-6 py-3 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition-all flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Ajouter une étape
                </button>
                <button
                    onClick={() => setShowTable2(!showTable2)}
                    className="px-6 py-3 rounded-lg bg-gray-600 text-white font-semibold hover:bg-gray-700 transition-all flex items-center gap-2"
                >
                    {showTable2 ? (
                        <><EyeOff className="w-5 h-5" />Masquer les détails</>
                    ) : (
                        <><Eye className="w-5 h-5" />Afficher les détails</>
                    )}
                </button>
            </div>

            {/* TABLE 2 — DÉTAILS */}
            {showTable2 && (
                <div className="mt-6 mb-6 bg-white rounded-lg shadow-lg overflow-hidden">
                    <div className="bg-gray-800 text-white p-4">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <FileText className="w-5 h-5" />
                            Détails documentaires ({Array.from(enrichments.values()).filter(e =>
                                e.descriptif || e.duree_estimee || e.frequence || e.kpi
                            ).length} tâche(s) détaillée(s))
                        </h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-sm">
                            <thead className="bg-gray-700 text-white">
                                <tr>
                                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold">ID Tâche</th>
                                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Nom Tâche</th>
                                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Descriptif</th>
                                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Durée estimée</th>
                                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Fréquence</th>
                                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold">KPI</th>
                                    <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map(row => {
                                    const enrichment = enrichments.get(row.id);
                                    return (
                                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="border border-gray-300 px-2 py-1 text-center font-mono text-xs bg-gray-100">
                                                {row.id}
                                            </td>
                                            <td className="border border-gray-300 px-3 py-2 font-medium">
                                                {row.étape || <span className="text-gray-400 italic">Sans nom</span>}
                                            </td>
                                            <td className="border border-gray-300 px-3 py-2 max-w-xs">
                                                <div className="truncate" title={enrichment?.descriptif}>
                                                    {enrichment?.descriptif || <span className="text-gray-400">-</span>}
                                                </div>
                                            </td>
                                            <td className="border border-gray-300 px-3 py-2">
                                                {enrichment?.duree_estimee || <span className="text-gray-400">-</span>}
                                            </td>
                                            <td className="border border-gray-300 px-3 py-2">
                                                {enrichment?.frequence || <span className="text-gray-400">-</span>}
                                            </td>
                                            <td className="border border-gray-300 px-3 py-2">
                                                {enrichment?.kpi || <span className="text-gray-400">-</span>}
                                            </td>
                                            <td className="border border-gray-300 p-1 text-center">
                                                <button
                                                    onClick={() => openEnrichmentModal(row.id, row.étape)}
                                                    className="text-blue-600 hover:text-blue-800"
                                                    title="Modifier"
                                                >
                                                    <Edit className="w-5 h-5 mx-auto" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* MODAL DÉTAILS */}
            <EnrichmentModal
                isOpen={enrichmentModalOpen}
                taskId={selectedTaskForEnrichment?.id || ''}
                taskName={selectedTaskForEnrichment?.name || ''}
                enrichment={selectedTaskForEnrichment ? enrichments.get(selectedTaskForEnrichment.id) || null : null}
                onSave={handleSaveEnrichment}
                onClose={closeEnrichmentModal}
            />
        </>
    );
}
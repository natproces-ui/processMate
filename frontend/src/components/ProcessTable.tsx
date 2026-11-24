'use client';
import SourceCitation from '@/components/shared/SourceCitation';
import { useState, useRef } from 'react';
import { FileText, Trash2, Plus, Edit, Eye, EyeOff, GripVertical } from 'lucide-react';
import type { Table1Row } from '@/logic/types';
import { TaskEnrichment } from '@/logic/bpmnTypes';
import EnrichmentModal from '@/components/DetailModal';
import ToolPicker from '@/components/orchestration/ToolPicker';
import ToolDetailPanel from '@/components/orchestration/ToolDetailPanel';
import { Settings2 } from 'lucide-react';
import { ScreenHoverTarget } from '@/components/orchestration/ScreenHover';

interface TableProps {
    data: Table1Row[];
    enrichments: Map<string, TaskEnrichment>;
    processTitle: string;
    onDataChange: (data: Table1Row[]) => void;
    onEnrichmentsChange: (enrichments: Map<string, TaskEnrichment>) => void;
    onShowSuccess: (message: string) => void;
    /** Ids d'étapes récemment touchées par une modification IA appliquée — surlignées
     *  jusqu'à la prochaine sauvegarde manuelle. */
    highlightedRowIds?: Set<string>;
    /** Nom et nombre d'étapes déjà affichés par l'écran parent */
    hideTitle?: boolean;
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
    highlightedRowIds,
    hideTitle = false,
}: TableProps) {
    const [showTable2, setShowTable2] = useState(false);
    const [enrichmentModalOpen, setEnrichmentModalOpen] = useState(false);
    const [selectedTaskForEnrichment, setSelectedTaskForEnrichment] = useState<{ id: string; name: string } | null>(null);
    const [managingTool, setManagingTool] = useState<string | null>(null);

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
        // Les écrans choisis appartiennent à l'ancien outil : on les retire si l'outil change
        if (field === 'outil' && value !== updated[index].outil) {
            const enr = enrichments.get(updated[index].id);
            if (enr?.ecrans?.length) {
                const newEnrichments = new Map(enrichments);
                newEnrichments.set(enr.id_tache, { ...enr, ecrans: [] });
                onEnrichmentsChange(newEnrichments);
            }
        }
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
            typeActeur: '',
            condition: '',
            outputs: [],
            outil: '',
        };
        onDataChange([...data, newRow]);
        const newEnrichments = new Map(enrichments);
        newEnrichments.set(newRow.id, {
            id_tache: newRow.id,
            descriptif: '',
            declencheur: '',
            applicatif: '',
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
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-sm">
                        {hideTitle ? (
                            <caption className="sr-only">{processTitle}</caption>
                        ) : (
                            <caption className="border-b border-neutral-200 bg-white p-4 text-left text-neutral-900">
                                <h2 className="flex items-center gap-2 text-sm font-semibold text-petrole">
                                    <FileText className="w-5 h-5" />
                                    {processTitle} ({data.length} étapes)
                                </h2>
                                <p className="mt-1 text-xs font-normal text-neutral-500">
                                    Glissez <GripVertical className="inline w-3 h-3" /> pour réordonner les étapes — les IDs se mettent à jour automatiquement
                                </p>
                            </caption>
                        )}
                        <thead className="bg-neutral-50 text-xs text-neutral-700">
                            <tr>
                                <th className="border border-neutral-200 px-2 py-2 w-8" title="Glisser pour réordonner — les IDs se mettent à jour" />
                                <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">ID</th>
                                <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">Étape</th>
                                <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">Type BPMN</th>
                                <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">Département</th>
                                <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">Acteur</th>
                                <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">Condition</th>
                                <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">
                                    Sorties
                                    <span className="block text-[11px] font-normal text-neutral-500">id:label, id:label</span>
                                </th>
                                <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">Applicatif</th>
                                <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="text-center py-12 text-neutral-500">
                                        <div className="flex flex-col items-center gap-3">
                                            <FileText className="w-12 h-12 text-neutral-300" />
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
                                    const isAiChanged = highlightedRowIds?.has(row.id) ?? false;

                                    return (
                                        <tr
                                            key={row.id}
                                            data-step-id={row.id}
                                            draggable
                                            onDragStart={e => handleDragStart(e, i)}
                                            onDragOver={e => handleDragOver(e, i)}
                                            onDrop={e => handleDrop(e, i)}
                                            onDragEnd={handleDragEnd}
                                            title={isAiChanged ? 'Modifiée par l’IA' : undefined}
                                            className={`
                                                transition-all duration-150
                                                ${isBeingDragged ? 'opacity-30' : 'opacity-100'}
                                                ${isDragTarget
                                                    ? 'border-t-2 border-t-petrole bg-petrole-tint'
                                                    : isAiChanged
                                                        ? 'bg-petrole-tint/60 border-l-4 border-l-petrole'
                                                        : 'hover:bg-neutral-50'
                                                }
                                            `}
                                        >
                                            {/* Handle drag */}
                                            <td className="border border-neutral-200 px-2 py-1 text-center cursor-grab active:cursor-grabbing select-none">
                                                <GripVertical className="mx-auto h-4 w-4 text-neutral-400" />
                                            </td>

                                            {/* ID */}
                                            <td className="border border-neutral-200 px-2 py-1 text-center font-mono text-xs bg-neutral-50 text-neutral-600 select-none">
                                                {row.id}
                                                {isAiChanged && <span className="ml-1 rounded-full bg-petrole px-1 text-[9px] font-bold text-white align-top">IA</span>}
                                            </td>

                                            {/* ÉTAPE */}
                                            <td className="border border-neutral-200 p-1 min-w-[18rem]">
                                                <input
                                                    type="text"
                                                    value={row.étape}
                                                    onChange={e => handleChange(i, 'étape', e.target.value)}
                                                    className="w-full rounded border border-transparent bg-transparent px-2 py-1 hover:border-neutral-300 focus:border-petrole focus:bg-white focus:outline-none"
                                                />
                                            </td>

                                            {/* TYPE BPMN */}
                                            <td className="border border-neutral-200 p-1 min-w-[10.5rem]">
                                                <select
                                                    value={row.typeBpmn}
                                                    onChange={e => handleChange(i, 'typeBpmn', e.target.value)}
                                                    className="w-full rounded border border-transparent bg-transparent px-2 py-1 hover:border-neutral-300 focus:border-petrole focus:bg-white focus:outline-none"
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
                                            <td className="border border-neutral-200 p-1 min-w-[8rem]">
                                                <input
                                                    type="text"
                                                    value={row.département}
                                                    onChange={e => handleChange(i, 'département', e.target.value)}
                                                    className="w-full rounded border border-transparent bg-transparent px-2 py-1 hover:border-neutral-300 focus:border-petrole focus:bg-white focus:outline-none"
                                                />
                                            </td>

                                            {/* ACTEUR */}
                                            <td className="border border-neutral-200 p-1 min-w-[11rem]">
                                                <input
                                                    type="text"
                                                    value={row.acteur}
                                                    onChange={e => handleChange(i, 'acteur', e.target.value)}
                                                    className="w-full rounded border border-transparent bg-transparent px-2 py-1 hover:border-neutral-300 focus:border-petrole focus:bg-white focus:outline-none"
                                                />
                                            </td>

                                            {/* CONDITION */}
                                            <td className="border border-neutral-200 p-1 min-w-[9rem]">
                                                <input
                                                    type="text"
                                                    value={row.condition}
                                                    onChange={e => handleChange(i, 'condition', e.target.value)}
                                                    className="w-full rounded border border-transparent bg-transparent px-2 py-1 hover:border-neutral-300 focus:border-petrole focus:bg-white focus:outline-none"
                                                    disabled={!GATEWAY_TYPES.includes(row.typeBpmn)}
                                                    placeholder={GATEWAY_TYPES.includes(row.typeBpmn) ? 'Question ?' : ''}
                                                />
                                            </td>

                                            {/* SORTIES */}
                                            <td className="border border-neutral-200 p-1 min-w-[140px]">
                                                <input
                                                    type="text"
                                                    value={outputsToString(row.outputs)}
                                                    onChange={e => handleOutputsChange(i, e.target.value)}
                                                    className="w-full rounded border border-transparent bg-transparent px-2 py-1 font-mono text-xs hover:border-neutral-300 focus:border-petrole focus:bg-white focus:outline-none"
                                                    placeholder={
                                                        row.typeBpmn === 'ExclusiveGateway'
                                                            ? '10:Oui, 6:Non'
                                                            : row.typeBpmn === 'ParallelGateway'
                                                                ? '3, 5, 7'
                                                                : '3'
                                                    }
                                                />
                                            </td>

                                            {/* OUTIL — picker chercher-ou-créer sur le référentiel,
                                                voir referentiel-outils.md. outil reste un string ici :
                                                le picker garantit juste qu'il vient du référentiel. */}
                                            <td className="border border-neutral-200 p-1">
                                                <div className="flex items-center gap-1">
                                                    <div className="flex-1 min-w-0">
                                                        <ToolPicker
                                                            value={row.outil}
                                                            onChange={name => handleChange(i, 'outil', name)}
                                                        />
                                                    </div>
                                                    {row.outil && (
                                                        <button type="button" onClick={() => setManagingTool(row.outil)}
                                                            title="Gérer les écrans/champs/codes de cet applicatif"
                                                            className="p-1.5 text-neutral-400 hover:text-petrole hover:bg-petrole-tint rounded-lg shrink-0">
                                                            <Settings2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>

                                            {/* ACTIONS */}
                                            <td className="border border-neutral-200 p-1 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => openEnrichmentModal(row.id, row.étape)}
                                                        className="text-petrole hover:opacity-80"
                                                        title="Ajouter/Modifier les détails"
                                                    >
                                                        {enrichments.has(row.id) &&
                                                            (enrichments.get(row.id)?.descriptif ||
                                                                enrichments.get(row.id)?.duree_estimee ||
                                                                enrichments.get(row.id)?.frequence ||
                                                                enrichments.get(row.id)?.kpi ||
                                                                enrichments.get(row.id)?.ecrans?.length ||
                                                                enrichments.get(row.id)?.liens?.length) ? (
                                                            <Edit className="w-5 h-5 fill-petrole-tint" />
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
                    className="flex items-center gap-1.5 rounded-lg bg-petrole px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                    <Plus className="w-4 h-4" />
                    Ajouter une étape
                </button>
                <button
                    onClick={() => setShowTable2(!showTable2)}
                    className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-50"
                >
                    {showTable2 ? (
                        <><EyeOff className="h-3.5 w-3.5" />Masquer le détail des étapes</>
                    ) : (
                        <><Eye className="h-3.5 w-3.5" />Afficher le détail des étapes</>
                    )}
                </button>
            </div>

            {/* TABLE 2 — DÉTAILS */}
            {showTable2 && (
                <div className="mt-4 mb-6 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                    <div className="border-b border-neutral-200 px-4 py-3">
                        <h2 className="flex items-center gap-2 text-sm font-semibold text-petrole">
                            <FileText className="w-5 h-5" />
                            Détails documentaires ({Array.from(enrichments.values()).filter(e =>
                                e.descriptif || e.duree_estimee || e.frequence || e.kpi || e.ecrans?.length || e.liens?.length
                            ).length} tâche(s) détaillée(s))
                        </h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-sm">
                            <thead className="bg-neutral-50 text-xs text-neutral-700">
                                <tr>
                                    <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">ID Tâche</th>
                                    <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">Nom Tâche</th>
                                    <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">Descriptif</th>
                                    <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">Source</th>
                                    <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">Durée estimée</th>
                                    <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">Écrans</th>
                                    <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">Liens</th>
                                    <th className="border border-neutral-200 px-3 py-2 text-left font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map(row => {
                                    const enrichment = enrichments.get(row.id);
                                    const isAiChanged = highlightedRowIds?.has(row.id) ?? false;
                                    return (
                                        <tr
                                            key={row.id}
                                            title={isAiChanged ? 'Modifiée par l’IA' : undefined}
                                            className={`transition-colors ${isAiChanged ? 'bg-petrole-tint/60 border-l-4 border-l-petrole' : 'hover:bg-neutral-50'}`}
                                        >
                                            <td className="border border-neutral-200 px-2 py-1 text-center font-mono text-xs bg-neutral-50">
                                                {row.id}
                                                {isAiChanged && <span className="ml-1 rounded-full bg-petrole px-1 text-[9px] font-bold text-white align-top">IA</span>}
                                            </td>
                                            <td className="border border-neutral-200 px-3 py-2 font-medium">
                                                <ScreenHoverTarget toolName={row.outil} screenIds={enrichment?.ecrans}>
                                                    {row.étape || <span className="text-neutral-400 italic">Sans nom</span>}
                                                </ScreenHoverTarget>
                                            </td>
                                            <td className="border border-neutral-200 px-3 py-2 max-w-xs">
                                                <div className="truncate" title={enrichment?.descriptif}>
                                                    {enrichment?.descriptif || <span className="text-neutral-400">-</span>}
                                                </div>
                                            </td>
                                            <td className="border border-neutral-200 px-3 py-2 max-w-[14rem]">
                                                {enrichment?.source?.fichier ? <SourceCitation source={enrichment.source} compact /> : <span className="text-neutral-400">-</span>}
                                            </td>
                                            <td className="border border-neutral-200 px-3 py-2">
                                                {enrichment?.duree_estimee || <span className="text-neutral-400">-</span>}
                                            </td>
                                            <td className="border border-neutral-200 px-3 py-2 whitespace-nowrap">
                                                {enrichment?.ecrans?.length
                                                    ? `${enrichment.ecrans.length} écran${enrichment.ecrans.length > 1 ? 's' : ''}${row.outil ? ` · ${row.outil}` : ''}`
                                                    : <span className="text-neutral-400">-</span>}
                                            </td>
                                            <td className="border border-neutral-200 px-3 py-2 whitespace-nowrap">
                                                {enrichment?.liens?.length
                                                    ? `${enrichment.liens.length} lien${enrichment.liens.length > 1 ? 's' : ''}`
                                                    : <span className="text-neutral-400">-</span>}
                                            </td>
                                            <td className="border border-neutral-200 p-1 text-center">
                                                <button
                                                    onClick={() => openEnrichmentModal(row.id, row.étape)}
                                                    className="text-petrole hover:opacity-80"
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
                toolName={data.find(r => r.id === selectedTaskForEnrichment?.id)?.outil || ''}
                enrichment={selectedTaskForEnrichment ? enrichments.get(selectedTaskForEnrichment.id) || null : null}
                onSave={handleSaveEnrichment}
                onClose={closeEnrichmentModal}
            />

            {managingTool && (
                <ToolDetailPanel toolName={managingTool} onClose={() => setManagingTool(null)} />
            )}
        </>
    );
}
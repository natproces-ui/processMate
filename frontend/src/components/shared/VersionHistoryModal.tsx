'use client';

// Historique des versions d'une procédure enregistrée (lot 5), partagé par le Studio et
// l'espace de travail : liste, comparaison avec l'état affiché, restauration.
import { useEffect, useState } from 'react';
import { History, Loader2, RotateCcw, X } from 'lucide-react';
import type { Table1Row } from '@/logic/types';
import { diffWorkflows, summarizeDiff, type WorkflowDiff } from '@/logic/workflowDiff';
import { versionsApi, type VersionDetail, type VersionSummary } from '@/lib/versionsApi';

const SOURCE_LABEL: Record<VersionSummary['source'], string> = {
    initial: 'État d’origine', manuel: 'Enregistrement', ia: 'Modification par l’assistant', restauration: 'Restauration',
};

export default function VersionHistoryModal({ procedureId, currentWorkflow, onClose, onRestored }: {
    procedureId: string;
    currentWorkflow: Table1Row[];
    onClose: () => void;
    /** Appelé avec le contenu restauré (déjà enregistré côté serveur) */
    onRestored: (version: VersionDetail) => void;
}) {
    const [versions, setVersions] = useState<VersionSummary[] | null>(null);
    const [selected, setSelected] = useState<VersionDetail | null>(null);
    const [diff, setDiff] = useState<WorkflowDiff | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        versionsApi.list(procedureId).then(setVersions).catch(e => setError(e.message));
    }, [procedureId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const select = async (v: VersionSummary) => {
        setBusy(true); setError(null);
        try {
            const detail = await versionsApi.get(procedureId, v.id);
            setSelected(detail);
            setDiff(diffWorkflows(detail.workflow_json || [], currentWorkflow));
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Version illisible');
        } finally { setBusy(false); }
    };

    const restore = async () => {
        if (!selected) return;
        if (!window.confirm(`Revenir à la version ${selected.version} ? L’état actuel reste disponible dans l’historique.`)) return;
        setBusy(true);
        try {
            await versionsApi.restore(procedureId, selected.id);
            onRestored(selected);
            onClose();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Restauration impossible');
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Historique des versions">
            <div className="bg-white w-full max-w-3xl max-h-[85vh] rounded-xl shadow-xl flex flex-col overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                    <History className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold text-slate-900">Historique des versions</h3>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
                    <ul className="sm:w-64 shrink-0 overflow-y-auto border-b sm:border-b-0 sm:border-r border-slate-100 max-h-48 sm:max-h-none">
                        {versions === null && !error && <li className="p-4"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></li>}
                        {versions?.length === 0 && <li className="p-4 text-xs text-slate-400">Aucune version : elles sont créées à chaque enregistrement.</li>}
                        {versions?.map(v => (
                            <li key={v.id}>
                                <button type="button" onClick={() => select(v)}
                                    className={`w-full text-left px-4 py-2.5 border-b border-slate-50 hover:bg-slate-50 ${selected?.id === v.id ? 'bg-blue-50' : ''}`}>
                                    <span className="block text-sm font-medium text-slate-800">Version {v.version} · {SOURCE_LABEL[v.source]}</span>
                                    <span className="block text-[11px] text-slate-400">{new Date(v.created_at).toLocaleString('fr-FR')} · {v.steps} étapes</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className="flex-1 min-w-0 overflow-y-auto p-4 text-sm">
                        {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-300" />}
                        {!selected && !busy && <p className="text-slate-400">Choisissez une version pour la comparer à l’état affiché.</p>}
                        {selected && diff && !busy && (
                            <div className="space-y-3">
                                <p className="text-slate-700">
                                    Par rapport à la version {selected.version}, l’état affiché a : <strong>{summarizeDiff(diff)}</strong>.
                                </p>
                                <DiffList title="Ajoutées depuis" rows={diff.added.map(r => r.étape)} tone="text-emerald-700" />
                                <DiffList title="Supprimées depuis" rows={diff.removed.map(r => r.étape)} tone="text-red-700" />
                                <DiffList title="Modifiées depuis" rows={diff.modified.map(m => `${m.after.étape} (${m.fields.join(', ')})`)} tone="text-amber-700" />
                            </div>
                        )}
                        {error && <p className="mt-3 text-red-600">{error}</p>}
                    </div>
                </div>
                <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Fermer</button>
                    <button type="button" onClick={restore} disabled={!selected || busy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
                        <RotateCcw className="w-3.5 h-3.5" /> Revenir à cette version
                    </button>
                </div>
            </div>
        </div>
    );
}

function DiffList({ title, rows, tone }: { title: string; rows: string[]; tone: string }) {
    if (!rows.length) return null;
    return (
        <div>
            <p className="text-xs font-semibold text-slate-500">{title}</p>
            <ul className={`mt-1 list-disc list-inside text-xs ${tone}`}>{rows.map((r, i) => <li key={i}>{r || '(sans libellé)'}</li>)}</ul>
        </div>
    );
}

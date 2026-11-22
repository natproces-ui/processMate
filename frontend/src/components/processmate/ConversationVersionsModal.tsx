'use client';

// Versions d'une procédure de la conversation (gardées par le serveur) : ce qui a changé à chaque message ou
// correction, comparaison avec l'état affiché, retour à une version (qui crée une nouvelle version).
import { useEffect, useState } from 'react';
import { History, Loader2, RotateCcw, X } from 'lucide-react';
import type { Table1Row } from '@/logic/types';
import { diffWorkflows, summarizeDiff, type WorkflowDiff } from '@/logic/workflowDiff';
import { conversationsApi, type ConversationVersion, type StoredProcedure } from '@/lib/conversationsApi';

const ORIGINE: Record<string, string> = {
    generation: 'Rédigée', modification: 'Modifiée par l’assistant', transcription: 'Transcrite', reecriture: 'Réécrite',
    manuel: 'Corrigée à la main', restauration: 'Restaurée', reprise: 'Reprise de la conversation',
};

export default function ConversationVersionsModal({ conversationId, procedureKey, title, currentWorkflow, onClose, onRestored }: {
    conversationId: string;
    procedureKey: string;
    title: string;
    currentWorkflow: Table1Row[];
    onClose: () => void;
    /** La nouvelle version courante (restauration enregistrée côté serveur) */
    onRestored: (procedure: StoredProcedure) => void;
}) {
    const [versions, setVersions] = useState<ConversationVersion[] | null>(null);
    const [selected, setSelected] = useState<{ version: number; procedure: StoredProcedure } | null>(null);
    const [diff, setDiff] = useState<WorkflowDiff | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        conversationsApi.procedureVersions(conversationId, procedureKey).then(setVersions).catch(e => setError(e.message));
    }, [conversationId, procedureKey]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const select = async (v: ConversationVersion) => {
        setBusy(true); setError(null);
        try {
            const procedure = await conversationsApi.procedureVersion(conversationId, procedureKey, v.version);
            setSelected({ version: v.version, procedure });
            setDiff(diffWorkflows((procedure.workflow || []) as Table1Row[], currentWorkflow));
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Version illisible');
        } finally { setBusy(false); }
    };

    const restore = async () => {
        if (!selected) return;
        setBusy(true);
        try {
            onRestored(await conversationsApi.restoreProcedureVersion(conversationId, procedureKey, selected.version));
            onClose();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Retour impossible');
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Versions de la procédure">
            <div className="bg-white w-full max-w-3xl max-h-[85vh] rounded-xl shadow-xl flex flex-col overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-200 flex items-center gap-2">
                    <History className="w-4 h-4 text-neutral-900" />
                    <h3 className="font-semibold text-neutral-900 truncate">Versions · {title}</h3>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
                    <ul className="sm:w-72 shrink-0 overflow-y-auto border-b sm:border-b-0 sm:border-r border-neutral-100 max-h-56 sm:max-h-none">
                        {versions === null && !error && <li className="p-4"><Loader2 className="w-4 h-4 animate-spin text-neutral-300" /></li>}
                        {versions?.map(v => (
                            <li key={v.version}>
                                <button type="button" onClick={() => select(v)}
                                    className={`w-full text-left px-4 py-2.5 border-b border-neutral-50 hover:bg-neutral-50 ${selected?.version === v.version ? 'bg-neutral-100' : ''}`}>
                                    <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-900">
                                        Version {v.version} · {ORIGINE[v.origine] || v.origine}
                                        {v.courante && <span className="rounded-full bg-neutral-900 px-1.5 text-[10px] font-semibold text-white">affichée</span>}
                                        {v.enregistree && <span className="rounded-full bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700">enregistrée</span>}
                                    </span>
                                    {v.resume && <span className="block text-xs text-neutral-600 line-clamp-2">{v.resume}</span>}
                                    <span className="block text-[11px] text-neutral-400">{new Date(v.created_at).toLocaleString('fr-FR')}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className="flex-1 min-w-0 overflow-y-auto p-4 text-sm">
                        {busy && <Loader2 className="w-4 h-4 animate-spin text-neutral-300" />}
                        {!selected && !busy && <p className="text-neutral-500">Choisissez une version pour voir ce qui a changé depuis.</p>}
                        {selected && diff && !busy && (
                            <div className="space-y-3">
                                <p className="text-neutral-700">
                                    Depuis la version {selected.version}, la procédure affichée a : <strong>{summarizeDiff(diff)}</strong>.
                                </p>
                                <DiffList title="Étapes ajoutées depuis" rows={diff.added.map(r => r.étape)} tone="text-emerald-700" />
                                <DiffList title="Étapes retirées depuis" rows={diff.removed.map(r => r.étape)} tone="text-red-700" />
                                <DiffList title="Étapes modifiées depuis" rows={diff.modified.map(m => `${m.after.étape} (${m.fields.join(', ')})`)} tone="text-amber-700" />
                            </div>
                        )}
                        {error && <p className="mt-3 text-red-600">{error}</p>}
                    </div>
                </div>
                <div className="px-5 py-3 border-t border-neutral-100 flex items-center justify-end gap-2">
                    <span className="mr-auto text-[11px] text-neutral-500">Revenir à une version en crée une nouvelle : rien n’est effacé.</span>
                    <button type="button" onClick={onClose} className="px-3 py-1.5 border border-neutral-200 rounded-lg text-sm text-neutral-700 hover:bg-neutral-50">Fermer</button>
                    <button type="button" onClick={restore} disabled={!selected || busy || versions?.find(v => v.version === selected?.version)?.courante}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-700 disabled:opacity-40">
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
            <p className="text-xs font-semibold text-neutral-500">{title}</p>
            <ul className={`mt-1 list-disc list-inside text-xs ${tone}`}>{rows.map((r, i) => <li key={i}>{r || '(sans libellé)'}</li>)}</ul>
        </div>
    );
}

'use client';

// Joindre au chat une procédure du référentiel, comme on joint un fichier : on choisit la version (AS IS ou TO BE).
// Une version déjà dans le chat est signalée ; la joindre de nouveau ne fait que l'afficher.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import { orchestrationApi, type Procedure } from '@/lib/orchestrationApi';

interface Props {
    open: boolean;
    onClose: () => void;
    /** identifiant de la version choisie (ligne du référentiel) */
    onPick: (workflowId: string) => Promise<void> | void;
    /** versions déjà dans le chat */
    inChat: Set<string>;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function ReferentialPicker({ open, onClose, onPick, inChat }: Props) {
    const [procs, setProcs] = useState<Procedure[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        setQ(''); setError(null);
        orchestrationApi.listProcedures()
            .then(r => setProcs(r.procedures))
            .catch(e => setError(e?.message || 'Référentiel indisponible'));
        setTimeout(() => inputRef.current?.focus(), 0);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const shown = useMemo(() => {
        const t = norm(q.trim());
        const list = (procs || []).filter(p => !t || norm(`${p.nom} ${p.ref} ${p.category}`).includes(t));
        return list.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    }, [procs, q]);

    if (!open) return null;

    const pick = async (id: string) => {
        setBusy(id);
        try { await onPick(id); onClose(); }
        catch (e: unknown) { setError(e instanceof Error ? e.message : 'Ajout impossible'); }
        finally { setBusy(null); }
    };

    const versionButton = (id: string, label: string) => {
        const already = inChat.has(id);
        return (
            <button key={id} type="button" disabled={!!busy} onClick={() => void pick(id)}
                title={already ? 'Déjà dans le chat : l’afficher' : `Ajouter ${label === 'Ajouter' ? 'cette procédure' : `le ${label}`} au chat`}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold disabled:opacity-50 ${already
                    ? 'border-petrole/40 bg-petrole-tint text-petrole' : 'border-neutral-300 text-neutral-900 hover:border-petrole hover:text-petrole'}`}>
                {busy === id ? <Loader2 className="h-3 w-3 animate-spin" /> : already ? <Check className="h-3 w-3" /> : null}
                {label}
            </button>
        );
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 p-4 pt-[12vh]" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div role="dialog" aria-modal="true" aria-label="Joindre une procédure du référentiel"
                className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
                <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3">
                    <h2 className="text-sm font-semibold text-neutral-900">Joindre une procédure du référentiel</h2>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto rounded-lg p-1 text-neutral-700 hover:bg-neutral-100">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="border-b border-neutral-200 px-4 py-2">
                    <label className="flex items-center gap-2 rounded-lg border border-neutral-300 px-2.5 py-1.5 focus-within:border-neutral-900">
                        <Search className="h-4 w-4 text-neutral-500" />
                        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une procédure"
                            className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none" />
                    </label>
                    <p className="mt-1.5 text-[11px] text-neutral-500">Le chat travaille sur la version choisie ; « Enregistrer » écrit dans cette version.</p>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto py-1">
                    {error && <li className="px-4 py-3 text-sm text-red-600">{error}</li>}
                    {!procs && !error && <li className="flex items-center gap-2 px-4 py-3 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" />Chargement</li>}
                    {procs && shown.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">Aucune procédure.</li>}
                    {shown.map(p => (
                        <li key={p.id} className="flex items-center gap-3 px-4 py-2 hover:bg-neutral-50">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-neutral-900" title={p.nom}>{p.nom}</p>
                                <p className="truncate text-[11px] text-neutral-500">{[p.ref, p.category !== 'Non classé' ? p.category : '', p.status].filter(Boolean).join(', ')}</p>
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                                {p.tobe_id
                                    ? <>{versionButton(p.id, 'AS IS')}{versionButton(p.tobe_id, 'TO BE')}</>
                                    : versionButton(p.id, 'Ajouter')}
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

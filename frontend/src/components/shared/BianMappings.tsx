'use client';

/** Domaines de service BIAN d'une procédure : ajout manuel, suggestions de l'assistant à accepter. */
import { useEffect, useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { inboxApi, type BianMapping } from '@/lib/inboxApi';
import { useAuth } from '@/context/AuthContext';

export default function BianMappings({ procedureId }: { procedureId: string }) {
    const [items, setItems] = useState<BianMapping[] | null>(null);
    const [domain, setDomain] = useState('');
    const [options, setOptions] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { access } = useAuth();
    const enabled = !!access?.member && !!access.organisations_mode;

    useEffect(() => {
        if (!enabled) return;
        inboxApi.mappings(procedureId).then(setItems).catch(() => setItems(null));
        inboxApi.coverage().then(d => setOptions(d.map(x => x.domaine))).catch(() => setOptions([]));
    }, [procedureId, enabled]);
    if (!enabled || items === null || options.length === 0) return null;

    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true);
        setError(null);
        try { await fn(); setItems(await inboxApi.mappings(procedureId)); }
        catch (e) { setError(e instanceof Error ? e.message : 'Action impossible'); }
        finally { setBusy(false); }
    };

    return (
        <section aria-label="Domaines BIAN" className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-800">Domaines de service BIAN</h3>
                <button type="button" disabled={busy} onClick={() => void run(() => inboxApi.suggest(procedureId))}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Suggérer
                </button>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
                {items.length === 0 && <li className="text-xs text-gray-400">Aucun domaine relié.</li>}
                {items.map(m => (
                    <li key={m.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${m.statut === 'accepte' ? 'bg-indigo-50 text-indigo-700' : 'border border-dashed border-indigo-300 text-indigo-600'}`}>
                        {m.domaine}
                        {m.statut === 'suggere' && (<>
                            <span className="text-[10px] text-indigo-400">suggéré</span>
                            <button type="button" onClick={() => void run(() => inboxApi.decide(m.id, true))} aria-label={`Accepter ${m.domaine}`} className="p-0.5 hover:text-emerald-600"><Check className="w-3 h-3" /></button>
                        </>)}
                        <button type="button" onClick={() => void run(() => inboxApi.decide(m.id, false))} aria-label={`Retirer ${m.domaine}`} className="p-0.5 hover:text-red-600"><X className="w-3 h-3" /></button>
                    </li>
                ))}
            </ul>
            <div className="mt-2 flex gap-2">
                <input list={`bian-${procedureId}`} value={domain} onChange={e => setDomain(e.target.value)} placeholder="Ajouter un domaine…"
                    aria-label="Domaine BIAN" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs" />
                <datalist id={`bian-${procedureId}`}>{options.map(o => <option key={o} value={o} />)}</datalist>
                <button type="button" disabled={busy || !domain} onClick={() => void run(async () => { await inboxApi.addMapping(procedureId, domain); setDomain(''); })}
                    className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50">Ajouter</button>
            </div>
            {error && <p role="alert" className="mt-1.5 text-xs text-red-600">{error}</p>}
        </section>
    );
}

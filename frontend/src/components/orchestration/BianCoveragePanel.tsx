'use client';

/**
 * Couverture BIAN de l'organisation : domaines de service couverts (procédure validée),
 * en cours, non couverts. Depuis les non couverts : créer des emplacements dans une campagne.
 */
import { useMemo, useState } from 'react';
import { Loader2, Network } from 'lucide-react';
import { inboxApi, type BianDomain } from '@/lib/inboxApi';
import type { Campaign } from '@/lib/campaignsApi';

const STATE: Record<BianDomain['etat'], { label: string; cls: string }> = {
    couvert: { label: 'Couvert', cls: 'bg-emerald-50 text-emerald-700' },
    en_cours: { label: 'En cours', cls: 'bg-blue-50 text-blue-700' },
    non_couvert: { label: 'Non couvert', cls: 'bg-slate-100 text-slate-600' },
};

export default function BianCoveragePanel({ campaigns, onCreated }: { campaigns: Campaign[]; onCreated?: () => void }) {
    const [open, setOpen] = useState(false);
    const [domains, setDomains] = useState<BianDomain[] | null>(null);
    const [filter, setFilter] = useState<BianDomain['etat'] | 'all'>('non_couvert');
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [campaignId, setCampaignId] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const toggleOpen = () => {
        setOpen(o => !o);
        if (!domains) inboxApi.coverage().then(setDomains).catch(e => setMessage(e instanceof Error ? e.message : 'Couverture indisponible'));
    };
    const counts = useMemo(() => ({
        couvert: domains?.filter(d => d.etat === 'couvert').length ?? 0,
        en_cours: domains?.filter(d => d.etat === 'en_cours').length ?? 0,
        non_couvert: domains?.filter(d => d.etat === 'non_couvert').length ?? 0,
    }), [domains]);
    const shown = (domains || []).filter(d => filter === 'all' || d.etat === filter);
    const usable = campaigns.filter(c => c.status === 'draft' || c.status === 'active');

    const create = async () => {
        if (!campaignId || picked.size === 0) return;
        setBusy(true);
        setMessage(null);
        try {
            const r = await inboxApi.slotsFromGaps(campaignId, [...picked]);
            setMessage(`${r.created.length} emplacement(s) créé(s) dans la campagne.`);
            setPicked(new Set());
            setDomains(await inboxApi.coverage());
            onCreated?.();
        } catch (e) { setMessage(e instanceof Error ? e.message : 'Création impossible'); }
        finally { setBusy(false); }
    };

    return (
        <section aria-label="Couverture BIAN" className="mx-5 mt-3 rounded-xl border border-slate-200 bg-white">
            <button type="button" onClick={toggleOpen} aria-expanded={open}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-800">
                <Network className="w-4 h-4 text-slate-500" /> Couverture BIAN
                {domains && <span className="text-xs font-normal text-slate-500">· {counts.couvert} couverts · {counts.en_cours} en cours · {counts.non_couvert} non couverts</span>}
            </button>
            {open && (
                <div className="border-t border-slate-100 px-4 py-3">
                    {!domains ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : domains.length === 0 ? (
                        <p className="text-xs text-slate-500">Le catalogue BIAN n&apos;est pas encore chargé.</p>
                    ) : (<>
                        <div className="flex flex-wrap gap-1.5">
                            {(['non_couvert', 'en_cours', 'couvert', 'all'] as const).map(f => (
                                <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                                    className={`rounded-full px-2.5 py-0.5 text-xs ${filter === f ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'}`}>
                                    {f === 'all' ? 'Tous' : STATE[f].label}
                                </button>
                            ))}
                        </div>
                        <ul className="mt-2 max-h-64 overflow-y-auto divide-y divide-slate-100">
                            {shown.map(d => (
                                <li key={d.domaine} className="flex items-center gap-2 py-1.5 text-sm">
                                    {d.etat === 'non_couvert' && (
                                        <input type="checkbox" aria-label={`Choisir ${d.domaine}`} checked={picked.has(d.domaine)}
                                            onChange={e => setPicked(prev => { const n = new Set(prev); if (e.target.checked) n.add(d.domaine); else n.delete(d.domaine); return n; })} />
                                    )}
                                    <span className="min-w-0 flex-1 truncate text-slate-800">{d.domaine}
                                        <span className="ml-1.5 text-[11px] text-slate-400">{d.categories.join(', ')}</span></span>
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATE[d.etat].cls}`}>{STATE[d.etat].label}</span>
                                </li>
                            ))}
                        </ul>
                        {picked.size > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                <span>{picked.size} domaine(s)</span>
                                <select value={campaignId} onChange={e => setCampaignId(e.target.value)} aria-label="Campagne" className="rounded-lg border border-slate-200 px-2 py-1">
                                    <option value="">Campagne…</option>
                                    {usable.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                </select>
                                <button type="button" disabled={busy || !campaignId} onClick={() => void create()}
                                    className="rounded-lg bg-slate-900 px-2.5 py-1 font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                                    Créer les emplacements
                                </button>
                            </div>
                        )}
                    </>)}
                    {message && <p role="status" className="mt-2 text-xs text-slate-600">{message}</p>}
                </div>
            )}
        </section>
    );
}

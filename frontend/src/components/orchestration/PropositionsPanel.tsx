'use client';

/**
 * File du pilote : procédures proposées par les membres. Pour chacune : l'ajouter à une
 * campagne, la verser au référentiel (elle part en validation), ou la refuser avec un motif.
 * Rien n'entre au référentiel sans validation.
 */
import { useEffect, useState } from 'react';
import { Inbox, Loader2 } from 'lucide-react';
import { circuitApi, type Proposition } from '@/lib/circuitApi';
import type { Campaign } from '@/lib/campaignsApi';

export default function PropositionsPanel({ campaigns, onTreated }: { campaigns: Campaign[]; onTreated?: () => void }) {
    const [items, setItems] = useState<Proposition[] | null>(null);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [target, setTarget] = useState<Record<string, string>>({});

    useEffect(() => { circuitApi.propositions().then(setItems).catch(() => setItems([])); }, []);
    if (!items || items.length === 0) return null;
    const usable = campaigns.filter(c => c.status === 'draft' || c.status === 'active');

    const treat = async (p: Proposition, decision: 'campagne' | 'referentiel' | 'refuser') => {
        let motif: string | undefined;
        if (decision === 'refuser') {
            motif = window.prompt(`Motif du refus de « ${p.titre} » (transmis à ${p.propose_par_nom || 'la personne'}) :`) || undefined;
            if (!motif) return;
        }
        if (decision === 'campagne' && !target[p.id]) { setError('Choisissez une campagne.'); return; }
        setBusy(p.id);
        setError(null);
        try {
            await circuitApi.treat(p.id, { decision, campaign_id: target[p.id], motif });
            setItems(prev => (prev || []).filter(x => x.id !== p.id));
            onTreated?.();
        } catch (e) { setError(e instanceof Error ? e.message : 'Traitement impossible'); }
        finally { setBusy(null); }
    };

    return (
        <section aria-label="Procédures proposées" className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50/60">
            <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-900">
                <Inbox className="w-4 h-4" /> {items.length} procédure{items.length > 1 ? 's' : ''} proposée{items.length > 1 ? 's' : ''} à traiter
            </button>
            {open && (
                <ul className="divide-y divide-amber-100 border-t border-amber-100 bg-white">
                    {items.map(p => (
                        <li key={p.id} className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-900">{p.titre}</p>
                                <p className="text-xs text-slate-500">
                                    Proposée par {p.propose_par_nom || '—'} le {new Date(p.created_at).toLocaleDateString('fr-FR')}{p.message ? ` — « ${p.message} »` : ''}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : (<>
                                    <select value={target[p.id] || ''} onChange={e => setTarget(t => ({ ...t, [p.id]: e.target.value }))}
                                        aria-label="Campagne" className="rounded-lg border border-slate-200 px-2 py-1 text-xs">
                                        <option value="">Campagne…</option>
                                        {usable.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                    </select>
                                    <button type="button" onClick={() => void treat(p, 'campagne')} className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700">Ajouter</button>
                                    <button type="button" onClick={() => void treat(p, 'referentiel')} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">Verser au référentiel</button>
                                    <button type="button" onClick={() => void treat(p, 'refuser')} className="rounded-lg px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">Refuser</button>
                                </>)}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {error && <p role="alert" className="px-4 pb-2 text-xs text-red-600">{error}</p>}
        </section>
    );
}

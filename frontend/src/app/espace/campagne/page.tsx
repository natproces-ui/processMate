'use client';

/**
 * Créer une campagne guidée (admin et pilote) : la campagne (nom, échéance, pilote), les
 * procédures choisies dans le référentiel (une branche entière ou une à une), puis les
 * responsables : RACI proposé (celui de la procédure, sinon l'équipe de la branche ; A = pilote),
 * ajustable ligne par ligne ou pour toutes. Création en brouillon, ou lancement direct.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, FileText, Loader2, Search } from 'lucide-react';
import AuthGuard from '@/components/auth/AuthGuard';
import AppShell from '@/components/home/AppShell';
import { btnGhost, btnPrimary } from '@/components/home/ui';
import { useAuth } from '@/context/AuthContext';
import { taxonomyApi, type TaxonomyNode } from '@/lib/taxonomyApi';
import { orchestrationApi } from '@/lib/orchestrationApi';
import { campaignWizardApi, type WizardRaci, type WizardResult, type WizardSuggestion } from '@/lib/campaignWizardApi';

export default function NouvelleCampagnePage() {
    return (
        <AuthGuard>
            <AppShell activeNav="espace">
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <Wizard />
                </div>
            </AppShell>
        </AuthGuard>
    );
}

type Proc = { id: string; nom: string; taxonomy_id: string | null };
type Person = { id: string; name: string };
const field = 'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900';
const select = 'rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-900';
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Wizard() {
    const { access } = useAuth();
    const [title, setTitle] = useState('');
    const [endDate, setEndDate] = useState('');
    const [coordinator, setCoordinator] = useState('');
    const [tree, setTree] = useState<TaxonomyNode[] | null>(null);
    const [procs, setProcs] = useState<Proc[]>([]);
    const [people, setPeople] = useState<Person[]>([]);
    const [chosen, setChosen] = useState<Set<string>>(new Set());
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [q, setQ] = useState('');
    const [rows, setRows] = useState<WizardSuggestion[]>([]);
    const [suggesting, setSuggesting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<WizardResult | null>(null);
    const edited = useRef<Map<string, WizardRaci>>(new Map());

    useEffect(() => {
        taxonomyApi.getTree().then(r => setTree(r.tree)).catch(() => setTree([]));
        orchestrationApi.listProcedures()
            .then(r => setProcs(r.procedures.map(p => ({ id: p.id, nom: p.nom, taxonomy_id: p.taxonomy_id ?? null }))))
            .catch(e => setError(e instanceof Error ? e.message : 'Référentiel indisponible'));
        orchestrationApi.listUsers({ active_only: true })
            .then(r => setPeople(r.users.map(u => ({ id: u.id, name: u.full_name || u.display_name || u.email }))))
            .catch(() => setPeople([]));
    }, []);

    // Procédures sous chaque nœud (lui compris)
    const procsUnder = useMemo(() => {
        const direct = new Map<string, Proc[]>();
        for (const p of procs) if (p.taxonomy_id) direct.set(p.taxonomy_id, [...(direct.get(p.taxonomy_id) || []), p]);
        const all = new Map<string, Proc[]>();
        const walk = (n: TaxonomyNode): Proc[] => {
            const list = [...(direct.get(n.id) || []), ...(n.children || []).flatMap(walk)];
            all.set(n.id, list);
            return list;
        };
        (tree || []).forEach(walk);
        return { direct, all };
    }, [tree, procs]);

    // RACI proposé à chaque changement de sélection (les choix déjà faits sont gardés)
    useEffect(() => {
        const ids = [...chosen];
        if (!ids.length) { setRows([]); return; }
        const t = setTimeout(() => {
            setSuggesting(true);
            campaignWizardApi.suggest(ids, coordinator || undefined)
                .then(list => setRows(list.map(s => ({ ...s, raci: edited.current.get(s.procedure_id) || s.raci }))))
                .catch(e => setError(e instanceof Error ? e.message : 'Proposition indisponible'))
                .finally(() => setSuggesting(false));
        }, 400);
        return () => clearTimeout(t);
    }, [chosen, coordinator]);

    if (access && !access.can_manage_campaigns) {
        return <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-neutral-700">La création de campagne est réservée à l’administrateur et au pilote.</p>;
    }

    const needle = norm(q.trim());
    const toggleSet = (ids: string[], on: boolean) => setChosen(prev => {
        const n = new Set(prev);
        ids.forEach(id => (on ? n.add(id) : n.delete(id)));
        return n;
    });
    const setRaci = (pid: string, raci: WizardRaci) => {
        edited.current.set(pid, raci);
        setRows(prev => prev.map(r => (r.procedure_id === pid ? { ...r, raci } : r)));
    };
    /** Complète seulement les procédures sans R (ou sans A) : les responsables déjà proposés restent */
    const applyAll = (role: 'R' | 'A', id: string) => {
        if (!id) return;
        setRows(prev => prev.map(r => {
            if (role === 'R' ? r.raci.R.length : r.raci.A) return r;
            const raci = role === 'R' ? { ...r.raci, R: [id] } : { ...r.raci, A: id };
            edited.current.set(r.procedure_id, raci);
            return { ...r, raci };
        }));
    };
    const missing = rows.filter(r => !r.raci.R.length || !r.raci.A).length;
    // les responsables proposés suivent la sélection (léger différé) : on attend qu'ils soient à jour
    const pending = suggesting || rows.length !== chosen.size;
    const nameOf = (id: string) => people.find(p => p.id === id)?.name || 'Membre';

    const submit = async (lancer: boolean) => {
        if (!title.trim()) { setError('Donnez un nom à la campagne.'); return; }
        setBusy(true); setError(null);
        try {
            setResult(await campaignWizardApi.create({
                title: title.trim(), end_date: endDate, coordinator_id: coordinator, lancer,
                procedures: rows.map(r => ({ procedure_id: r.procedure_id, raci: r.raci })),
            }));
        } catch (e) { setError(e instanceof Error ? e.message : 'Création impossible'); }
        finally { setBusy(false); }
    };

    const renderNode = (n: TaxonomyNode, depth: number): ReactNode => {
        const under = procsUnder.all.get(n.id) || [];
        if (!under.length) return null;
        const visible = needle ? under.filter(p => norm(p.nom).includes(needle) || norm(n.name).includes(needle)) : under;
        if (needle && !visible.length) return null;
        const selected = under.filter(p => chosen.has(p.id)).length;
        const open = expanded.has(n.id) || !!needle;
        return (
            <li key={n.id}>
                <div className="flex items-center gap-1 rounded-lg hover:bg-neutral-50" style={{ paddingLeft: depth * 16 }}>
                    <button type="button" onClick={() => setExpanded(prev => { const s = new Set(prev); if (s.has(n.id)) s.delete(n.id); else s.add(n.id); return s; })}
                        aria-expanded={open} aria-label={open ? `Replier ${n.name}` : `Déplier ${n.name}`} className="p-1.5 text-neutral-500 hover:text-neutral-900">
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
                    </button>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 pr-2 text-sm">
                        <input type="checkbox" className="accent-neutral-900" checked={selected === under.length}
                            ref={el => { if (el) el.indeterminate = selected > 0 && selected < under.length; }}
                            onChange={e => toggleSet(under.map(p => p.id), e.target.checked)} />
                        <span className={`min-w-0 flex-1 truncate ${depth === 0 ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-800'}`}>{n.name}</span>
                        <span className="shrink-0 text-xs text-neutral-500">{selected ? `${selected}/` : ''}{under.length}</span>
                    </label>
                </div>
                {open && (
                    <ul>
                        {(procsUnder.direct.get(n.id) || []).filter(p => !needle || visible.includes(p)).map(p => (
                            <li key={p.id} style={{ paddingLeft: depth * 16 + 30 }}>
                                <label className="flex cursor-pointer items-center gap-2 rounded-lg py-1 pr-2 text-sm text-neutral-700 hover:bg-neutral-50">
                                    <input type="checkbox" className="accent-neutral-900" checked={chosen.has(p.id)} onChange={e => toggleSet([p.id], e.target.checked)} />
                                    <FileText className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                                    <span className="min-w-0 flex-1 truncate">{p.nom}</span>
                                </label>
                            </li>
                        ))}
                        {(n.children || []).map(c => renderNode(c, depth + 1))}
                    </ul>
                )}
            </li>
        );
    };

    if (result) {
        const problems = typeof result.problemes === 'string' ? [result.problemes]
            : (result.problemes?.details || []).map(d => `${d.titre ? `${d.titre} : ` : ''}${d.probleme}`);
        return (
            <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
                <h1 className="text-xl font-semibold text-neutral-900">{result.campaign.title}</h1>
                {result.lancee ? (
                    <p className="text-sm text-neutral-700">
                        Campagne lancée : {result.taches_creees ?? 0} tâche{(result.taches_creees ?? 0) > 1 ? 's' : ''} « Formaliser » envoyée{(result.taches_creees ?? 0) > 1 ? 's' : ''} aux responsables (R).
                    </p>
                ) : (
                    <div className="space-y-2 text-sm text-neutral-700">
                        <p>Campagne créée en brouillon.{problems.length ? ' Elle n’a pas pu être lancée :' : ''}</p>
                        {problems.length > 0 && <ul className="list-disc pl-5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
                    </div>
                )}
                <div className="flex gap-2">
                    <Link href="/orchestration?tab=campagnes" className={btnPrimary}>Voir la campagne</Link>
                    <Link href="/espace" className={btnGhost}>Retour à l’accueil</Link>
                </div>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-3xl px-4 py-6 space-y-5">
            <Link href="/espace" className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900">
                <ArrowLeft className="w-4 h-4" /> Accueil de l’organisation
            </Link>
            <h1 className="text-xl font-semibold text-neutral-900">Nouvelle campagne</h1>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <section aria-labelledby="w-1" className="rounded-xl border border-neutral-200 p-4 space-y-3">
                <h2 id="w-1" className="text-base font-semibold text-neutral-900">1. La campagne</h2>
                <label className="block text-sm text-neutral-700">Nom
                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. : Formalisation de l’épargne 2027" className={`mt-1 ${field}`} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm text-neutral-700">Échéance
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={`mt-1 ${field}`} />
                    </label>
                    <label className="block text-sm text-neutral-700">Pilote (approbateur proposé)
                        <select value={coordinator} onChange={e => setCoordinator(e.target.value)} className={`mt-1 w-full ${select}`}>
                            <option value="">Moi</option>
                            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </label>
                </div>
            </section>

            <section aria-labelledby="w-2" className="rounded-xl border border-neutral-200 p-4">
                <div className="flex items-center justify-between gap-2">
                    <h2 id="w-2" className="text-base font-semibold text-neutral-900">2. Les procédures</h2>
                    <span className="text-sm text-neutral-600">{chosen.size} choisie{chosen.size > 1 ? 's' : ''}</span>
                </div>
                <p className="mt-1 text-sm text-neutral-600">Cochez une branche entière, ou les procédures une à une.</p>
                <label className="mt-3 flex items-center gap-2 rounded-lg border border-neutral-200 px-2.5 py-1.5">
                    <Search className="w-4 h-4 text-neutral-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une procédure, une branche…" aria-label="Rechercher" className="w-full bg-transparent text-sm outline-none" />
                </label>
                {!tree ? <Loader2 className="mt-3 w-4 h-4 animate-spin text-neutral-400" /> : (
                    <ul className="mt-2 max-h-96 overflow-y-auto">
                        {tree.map(n => renderNode(n, 0))}
                        {procs.length > 0 && tree.every(n => !(procsUnder.all.get(n.id) || []).length) && (
                            <li className="px-2 py-3 text-sm text-neutral-600">Aucune procédure rangée dans le référentiel pour l’instant.</li>
                        )}
                    </ul>
                )}
            </section>

            {chosen.size > 0 && (
                <section aria-labelledby="w-3" className="rounded-xl border border-neutral-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                        <h2 id="w-3" className="text-base font-semibold text-neutral-900">3. Les responsables</h2>
                        {suggesting ? <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                            : missing > 0 && <span className="text-sm text-neutral-600">{missing} à compléter</span>}
                    </div>
                    <p className="mt-1 text-sm text-neutral-600">
                        Proposés d’après le RACI de chaque procédure, sinon l’équipe de sa branche ; le pilote approuve (A).
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                        Compléter celles qui n’en ont pas :
                        <select aria-label="R pour toutes" defaultValue="" onChange={e => { applyAll('R', e.target.value); e.target.value = ''; }} className={select}>
                            <option value="">Responsable (R)…</option>
                            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <select aria-label="A pour toutes" defaultValue="" onChange={e => { applyAll('A', e.target.value); e.target.value = ''; }} className={select}>
                            <option value="">Approbateur (A)…</option>
                            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <ul className="mt-2 divide-y divide-neutral-100">
                        {rows.map(r => (
                            <li key={r.procedure_id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-neutral-900">{r.titre}</p>
                                    <p className="truncate text-xs text-neutral-500">
                                        {r.chemin}{r.equipe ? ` · ${r.equipe}` : ''}
                                        {r.deja_en_campagne.length > 0 && ` · déjà dans « ${r.deja_en_campagne.join(' », « ')} »`}
                                    </p>
                                </div>
                                <select aria-label={`Responsable de ${r.titre}`} value={r.raci.R[0] || ''}
                                    onChange={e => setRaci(r.procedure_id, { ...r.raci, R: e.target.value ? [e.target.value, ...r.raci.R.slice(1).filter(x => x !== e.target.value)] : r.raci.R.slice(1) })}
                                    className={`${select} ${r.raci.R.length ? '' : 'border-neutral-900'}`}>
                                    <option value="">R à désigner</option>
                                    {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <select aria-label={`Approbateur de ${r.titre}`} value={r.raci.A || ''}
                                    onChange={e => setRaci(r.procedure_id, { ...r.raci, A: e.target.value || null })}
                                    className={`${select} ${r.raci.A ? '' : 'border-neutral-900'}`}>
                                    <option value="">A à désigner</option>
                                    {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                {r.raci.R.length > 1 && <span className="text-xs text-neutral-500">+ {r.raci.R.slice(1).map(nameOf).join(', ')}</span>}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
                {chosen.size > 0 && (!endDate || missing > 0) && (
                    <span className="text-xs text-neutral-500">Pour lancer : une échéance, et un R et un A pour chaque procédure.</span>
                )}
                <button type="button" onClick={() => void submit(false)} disabled={busy || !chosen.size || pending} className={btnGhost}>Créer en brouillon</button>
                <button type="button" onClick={() => void submit(true)} disabled={busy || !chosen.size || pending || !endDate || missing > 0} className={btnPrimary}>
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />} Créer et lancer
                </button>
            </div>
        </main>
    );
}

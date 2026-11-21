'use client';

/**
 * Emplacements d'une campagne (procédures attendues) : cadrage et suivi.
 * - Ajouter depuis le référentiel, un document (l'assistant y repère les procédures) ou en saisie libre.
 * - RACI, échéance, statut, en masse. Le RACI a une seule source (backend).
 * - Lancer : vérifie R/A/échéance, crée les procédures vides et les tâches « Formaliser ».
 * La structure de la campagne est réservée au pilotage (admin, pilote) ; les autres lisent.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileUp, Link2, ListPlus, Loader2, PlayCircle, Plus, Search, Trash2, UserCog, X } from 'lucide-react';
import {
    campaignSlotsApi, SLOT_ORIGIN_LABELS, SLOT_STATUS_LABELS, SlotsError,
    type Duplicate, type LaunchProblem, type Raci, type Slot, type SlotEntry, type SlotStatus,
} from '@/lib/campaignSlotsApi';
import { orchestrationApi } from '@/lib/orchestrationApi';
import { organisationApi, type Team } from '@/lib/organisationApi';
import { useProceduresStore } from '@/store/proceduresStore';

type Person = { id: string; name: string };
type AddMode = 'referentiel' | 'document' | 'saisie' | null;

const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50';

function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
    return (
        <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
            <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                    <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="p-1 rounded text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
            </div>
        </div>
    );
}

function DuplicatesNote({ items }: { items: Duplicate[] }) {
    if (!items.length) return null;
    return (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="w-3.5 h-3.5" /> Doublons probables</p>
            <ul className="mt-1 list-disc pl-5">
                {items.map((d, i) => <li key={i}>{d.titre}{d.reference ? ` (${d.reference})` : ''} — déjà dans {d.ou === 'campagne' ? 'la campagne' : 'le référentiel'}</li>)}
            </ul>
        </div>
    );
}

function AddDialog({ mode, campaignId, existingProcIds, onClose, onDone }: {
    mode: Exclude<AddMode, null>; campaignId: string; existingProcIds: Set<string>; onClose: () => void; onDone: () => void;
}) {
    const { procedures } = useProceduresStore();
    const [q, setQ] = useState('');
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [text, setText] = useState('');
    const [candidates, setCandidates] = useState<{ titre: string; resume: string }[] | null>(null);
    const [checked, setChecked] = useState<Set<number>>(new Set());
    const [dups, setDups] = useState<Duplicate[]>([]);
    const [needForce, setNeedForce] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const list = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return procedures.filter(p => !existingProcIds.has(p.id))
            .filter(p => !needle || `${p.nom} ${p.ref || ''}`.toLowerCase().includes(needle)).slice(0, 200);
    }, [procedures, q, existingProcIds]);

    const entries = (): SlotEntry[] => {
        if (mode === 'referentiel') return [...picked].map(id => ({ procedure_id: id, origine: 'referentiel' }));
        if (mode === 'saisie') return text.split('\n').map(t => t.trim()).filter(Boolean).map(titre => ({ titre, origine: 'saisie' }));
        return (candidates || []).filter((_, i) => checked.has(i)).map(c => ({ titre: c.titre, origine: 'document' }));
    };

    const submit = async (force = false) => {
        const e = entries();
        if (!e.length) return;
        setBusy(true);
        setError(null);
        try {
            const r = await campaignSlotsApi.create(campaignId, e, force);
            if (r.created.length === 0 && r.doublons.length && !force) {
                setDups(r.doublons);
                setNeedForce(true);
            } else onDone();
        } catch (err) { setError(err instanceof Error ? err.message : 'Ajout impossible'); }
        finally { setBusy(false); }
    };

    const readDocument = async (files: File[]) => {
        if (!files.length) return;
        setBusy(true);
        setError(null);
        try {
            const r = await campaignSlotsApi.fromDocument(campaignId, files);
            setCandidates(r.candidats);
            setChecked(new Set(r.candidats.map((_, i) => i)));
            setDups(r.doublons);
        } catch (err) { setError(err instanceof Error ? err.message : 'Lecture impossible'); }
        finally { setBusy(false); }
    };

    const title = mode === 'referentiel' ? 'Ajouter depuis le référentiel' : mode === 'document' ? 'Ajouter depuis un document' : 'Ajouter des procédures attendues';
    const count = entries().length;

    return (
        <Modal title={title} onClose={onClose} footer={<>
            <button type="button" onClick={onClose} className={`${btn} text-slate-600 hover:bg-slate-50`}>Annuler</button>
            {needForce
                ? <button type="button" disabled={busy} onClick={() => void submit(true)} className={`${btn} bg-amber-600 text-white hover:bg-amber-700`}>Ajouter quand même</button>
                : <button type="button" disabled={busy || count === 0} onClick={() => void submit(false)} className={`${btn} bg-slate-900 text-white hover:bg-slate-700`}>
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Ajouter{count ? ` (${count})` : ''}
                </button>}
        </>}>
            {mode === 'referentiel' && (
                <>
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                        <Search className="w-4 h-4 text-slate-400" />
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nom ou référence…" aria-label="Rechercher une procédure" className="w-full text-sm outline-none" />
                    </label>
                    <ul className="mt-2 divide-y divide-slate-100">
                        {list.map(p => (
                            <li key={p.id}>
                                <label className="flex items-center gap-2 py-1.5 text-sm text-slate-700">
                                    <input type="checkbox" checked={picked.has(p.id)}
                                        onChange={e => setPicked(prev => { const n = new Set(prev); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                                    <span className="truncate">{p.nom}</span>{p.ref && <span className="text-xs text-slate-400">{p.ref}</span>}
                                </label>
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {mode === 'saisie' && (
                <>
                    <p className="text-xs text-slate-500">Une procédure attendue par ligne. Elle sera créée dans le référentiel au lancement.</p>
                    <textarea value={text} onChange={e => setText(e.target.value)} rows={8} aria-label="Titres des procédures attendues"
                        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </>
            )}
            {mode === 'document' && (
                <>
                    {candidates === null ? (
                        <div className="text-center">
                            <p className="text-sm text-slate-600">L&apos;assistant lit le document et repère les procédures qu&apos;il décrit. Rien n&apos;est créé avant votre choix.</p>
                            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={`${btn} mt-3 bg-slate-900 text-white hover:bg-slate-700`}>
                                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />} {busy ? 'Lecture…' : 'Choisir un document'}
                            </button>
                            <input ref={fileRef} type="file" hidden accept=".pdf,.docx,.pptx,.xlsx,.xlsm,.csv,.txt,.md,image/png,image/jpeg,image/webp"
                                onChange={e => { void readDocument(Array.from(e.target.files || [])); e.target.value = ''; }} />
                        </div>
                    ) : candidates.length === 0 ? <p className="text-sm text-slate-500">Aucune procédure repérée dans ce document.</p> : (
                        <ul className="divide-y divide-slate-100">
                            {candidates.map((c, i) => (
                                <li key={i}>
                                    <label className="flex items-start gap-2 py-1.5 text-sm text-slate-700">
                                        <input type="checkbox" className="mt-1" checked={checked.has(i)}
                                            onChange={e => setChecked(prev => { const n = new Set(prev); if (e.target.checked) n.add(i); else n.delete(i); return n; })} />
                                        <span><span className="font-medium">{c.titre}</span>{c.resume && <span className="block text-xs text-slate-500">{c.resume}</span>}</span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
            <DuplicatesNote items={dups} />
            {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        </Modal>
    );
}

function RaciDialog({ people, initial, count, onClose, onApply }: {
    people: Person[]; initial: Raci | null; count: number; onClose: () => void; onApply: (raci: Partial<Raci>) => Promise<void>;
}) {
    const [raci, setRaci] = useState<Raci>(initial || { R: [], A: null, C: [], I: [] });
    const [touched, setTouched] = useState<Set<keyof Raci>>(new Set());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const set = (k: keyof Raci, v: Raci[keyof Raci]) => { setRaci(prev => ({ ...prev, [k]: v })); setTouched(prev => new Set(prev).add(k)); };
    const multi = (k: 'R' | 'C' | 'I', label: string) => (
        <fieldset className="mt-3">
            <legend className="text-xs font-medium text-slate-700">{label}</legend>
            <div className="mt-1 grid max-h-32 gap-1 overflow-y-auto rounded-lg border border-slate-100 p-2 sm:grid-cols-2">
                {people.map(p => (
                    <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={raci[k].includes(p.id)}
                            onChange={e => set(k, e.target.checked ? [...raci[k], p.id] : raci[k].filter(x => x !== p.id))} />
                        <span className="truncate">{p.name}</span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
    const apply = async () => {
        setBusy(true);
        setError(null);
        try {
            const partial: Partial<Raci> = {};
            touched.forEach(k => { (partial as Record<string, unknown>)[k] = raci[k]; });
            await onApply(partial);
        } catch (e) { setError(e instanceof Error ? e.message : 'RACI refusé'); setBusy(false); }
    };
    return (
        <Modal title={`RACI — ${count} procédure${count > 1 ? 's' : ''}`} onClose={onClose} footer={<>
            <button type="button" onClick={onClose} className={`${btn} text-slate-600 hover:bg-slate-50`}>Annuler</button>
            <button type="button" disabled={busy || touched.size === 0} onClick={() => void apply()} className={`${btn} bg-slate-900 text-white hover:bg-slate-700`}>
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Appliquer
            </button>
        </>}>
            {count > 1 && <p className="text-xs text-slate-500">Seuls les rôles que vous modifiez changent sur les procédures sélectionnées.</p>}
            {multi('R', 'R — formalise (au moins une personne)')}
            <label className="mt-3 block text-xs font-medium text-slate-700">A — valide (une seule personne)
                <select value={raci.A || ''} onChange={e => set('A', e.target.value || null)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">—</option>
                    {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
            </label>
            {multi('C', 'C — relit')}
            {multi('I', 'I — est informé')}
            {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        </Modal>
    );
}

export default function CampaignSlots({ campaignId, campaignStatus, canManage, onChanged, onOpenProcedure }: {
    campaignId: string; campaignStatus: string; canManage: boolean; onChanged: () => void; onOpenProcedure?: (id: string) => void;
}) {
    const [slots, setSlots] = useState<Slot[] | null>(null);
    const [problems, setProblems] = useState<LaunchProblem[]>([]);
    const [people, setPeople] = useState<Person[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [adding, setAdding] = useState<AddMode>(null);
    const [raciOpen, setRaciOpen] = useState(false);
    const [deadline, setDeadline] = useState('');
    const [q, setQ] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [launching, setLaunching] = useState(false);
    const [launchResult, setLaunchResult] = useState<string | null>(null);
    const closed = campaignStatus === 'completed' || campaignStatus === 'archived';
    const editable = canManage && !closed;

    const load = useCallback(async () => {
        try {
            const r = await campaignSlotsApi.list(campaignId);
            setSlots(r.emplacements);
            setProblems(r.problemes_lancement);
            setSelected(prev => new Set([...prev].filter(id => r.emplacements.some(s => s.id === id))));
        } catch (e) { setError(e instanceof Error ? e.message : 'Emplacements indisponibles'); }
    }, [campaignId]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        orchestrationApi.listUsers({ active_only: true })
            .then(r => setPeople(r.users.map(u => ({ id: u.id, name: u.full_name || u.display_name || u.email }))))
            .catch(() => setPeople([]));
        organisationApi.teams().then(setTeams).catch(() => setTeams([]));
    }, []);

    const name = useMemo(() => new Map(people.map(p => [p.id, p.name])), [people]);
    const teamName = useMemo(() => new Map(teams.map(t => [t.id, t.nom])), [teams]);
    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return (slots || []).filter(s => !needle || `${s.procedure_nom} ${s.procedure_ref || ''}`.toLowerCase().includes(needle));
    }, [slots, q]);
    const sel = (slots || []).filter(s => selected.has(s.id));

    const run = async (fn: () => Promise<unknown>) => {
        setError(null);
        try { await fn(); await load(); onChanged(); }
        catch (e) { setError(e instanceof Error ? e.message : 'Action refusée'); }
    };

    const launch = async () => {
        setLaunching(true);
        setError(null);
        try {
            const r = await campaignSlotsApi.launch(campaignId);
            setLaunchResult(`Campagne lancée : ${r.procedures_creees} procédure(s) créée(s) dans le référentiel, ${r.taches_creees} tâche(s) « Formaliser » envoyée(s).`
                + (r.taches_non_creees.length ? ` ${r.taches_non_creees.length} tâche(s) non créée(s) : une tâche est déjà active sur la procédure.` : ''));
            await load();
            onChanged();
        } catch (e) {
            if (e instanceof SlotsError && Array.isArray(e.details)) setProblems(e.details as LaunchProblem[]);
            setError(e instanceof Error ? e.message : 'Lancement impossible');
        } finally { setLaunching(false); }
    };

    if (!slots) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;
    const existingProcIds = new Set(slots.map(s => s.procedure_id).filter(Boolean) as string[]);
    const who = (ids: string[]) => ids.map(id => name.get(id) || '—').join(', ') || <span className="text-amber-600">à désigner</span>;

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 px-5 py-3 bg-white border-b border-gray-100 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5 w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-gray-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…" aria-label="Rechercher un emplacement" className="w-full text-sm outline-none" />
                </label>
                {editable && (
                    <div className="ml-auto flex flex-wrap gap-2">
                        <button type="button" onClick={() => setAdding('referentiel')} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}><Plus className="w-3.5 h-3.5" /> Référentiel</button>
                        <button type="button" onClick={() => setAdding('document')} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}><FileUp className="w-3.5 h-3.5" /> Document</button>
                        <button type="button" onClick={() => setAdding('saisie')} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}><ListPlus className="w-3.5 h-3.5" /> Saisie</button>
                    </div>
                )}
            </div>

            {campaignStatus === 'draft' && canManage && (
                <div className="shrink-0 px-5 py-3 bg-slate-50 border-b border-gray-100">
                    {problems.length ? (
                        <div className="text-xs text-slate-600">
                            <p className="font-semibold text-slate-800">Avant de lancer :</p>
                            <ul className="mt-1 list-disc pl-5">
                                {problems.slice(0, 6).map((p, i) => <li key={i}>{p.titre ? `${p.titre} : ` : ''}{p.probleme}</li>)}
                                {problems.length > 6 && <li>… et {problems.length - 6} autre(s)</li>}
                            </ul>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-slate-600">Tout est prêt. Au lancement, les procédures attendues sont créées dans le référentiel et chaque R reçoit une tâche « Formaliser ».</p>
                            <button type="button" disabled={launching} onClick={() => void launch()} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
                                {launching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />} Lancer la campagne
                            </button>
                        </div>
                    )}
                </div>
            )}
            {launchResult && <p role="status" className="shrink-0 mx-5 mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">{launchResult}</p>}
            {error && <p role="alert" className="shrink-0 mx-5 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</p>}

            {editable && sel.length > 0 && (
                <div className="shrink-0 mx-5 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs">
                    <span className="font-semibold text-slate-800">{sel.length} sélectionnée(s)</span>
                    <button type="button" onClick={() => setRaciOpen(true)} className={`${btn} bg-white border border-slate-300 text-slate-700`}><UserCog className="w-3.5 h-3.5" /> RACI</button>
                    <label className="flex items-center gap-1 text-slate-700">Échéance
                        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="rounded border border-slate-300 px-1.5 py-0.5" />
                    </label>
                    <button type="button" disabled={!deadline} onClick={() => void run(() => campaignSlotsApi.bulk(campaignId, [...selected], { echeance: deadline }))} className={`${btn} bg-white border border-slate-300 text-slate-700`}>Appliquer</button>
                    <button type="button" onClick={() => void run(() => campaignSlotsApi.bulk(campaignId, [...selected], { status: 'skipped' }))} className={`${btn} bg-white border border-slate-300 text-slate-700`}>Écarter</button>
                    <button type="button" onClick={() => { if (window.confirm(`Retirer ${sel.length} emplacement(s) de la campagne ? Les procédures du référentiel ne sont pas supprimées.`)) void run(async () => { for (const s of sel) await campaignSlotsApi.remove(campaignId, s.id); }); }}
                        className={`${btn} bg-white border border-red-200 text-red-600`}><Trash2 className="w-3.5 h-3.5" /> Retirer</button>
                </div>
            )}

            <div className="flex-1 overflow-auto bg-gray-50 mt-3">
                {shown.length === 0 ? (
                    <p className="py-10 text-center text-sm text-gray-400">{slots.length === 0 ? 'Aucune procédure attendue. Ajoutez-en depuis le référentiel, un document ou en saisie.' : 'Aucun résultat'}</p>
                ) : (
                    <table className="w-full min-w-[720px] text-sm">
                        <thead className="sticky top-0 bg-white text-left text-xs text-gray-500">
                            <tr>
                                {editable && <th className="w-8 px-3 py-2" scope="col">
                                    <input type="checkbox" aria-label="Tout sélectionner" checked={shown.length > 0 && shown.every(s => selected.has(s.id))}
                                        onChange={e => setSelected(e.target.checked ? new Set(shown.map(s => s.id)) : new Set())} />
                                </th>}
                                <th className="px-3 py-2" scope="col">Procédure</th>
                                <th className="px-3 py-2" scope="col">Équipe</th>
                                <th className="px-3 py-2" scope="col">R</th>
                                <th className="px-3 py-2" scope="col">A</th>
                                <th className="px-3 py-2" scope="col">Échéance</th>
                                <th className="px-3 py-2" scope="col">Statut</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {shown.map(s => (
                                <tr key={s.id} className={selected.has(s.id) ? 'bg-blue-50/40' : ''}>
                                    {editable && <td className="px-3 py-2">
                                        <input type="checkbox" aria-label={`Sélectionner ${s.procedure_nom}`} checked={selected.has(s.id)}
                                            onChange={e => setSelected(prev => { const n = new Set(prev); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />
                                    </td>}
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-1.5">
                                            {s.procedure_id && onOpenProcedure
                                                ? <button type="button" onClick={() => onOpenProcedure(s.procedure_id!)} className="font-medium text-slate-900 hover:text-blue-700 hover:underline text-left">{s.procedure_nom}</button>
                                                : <span className="font-medium text-slate-900">{s.procedure_nom}</span>}
                                            {s.procedure_id && <Link2 className="w-3 h-3 text-slate-400" aria-label="Reliée au référentiel" />}
                                        </div>
                                        <p className="text-[11px] text-slate-400">{[s.procedure_ref, SLOT_ORIGIN_LABELS[s.origine]].filter(Boolean).join(' · ')}</p>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-600">{(s.equipe_id && teamName.get(s.equipe_id)) || '—'}</td>
                                    <td className="px-3 py-2 text-xs text-slate-600">{who(s.raci.R)}</td>
                                    <td className="px-3 py-2 text-xs text-slate-600">{s.raci.A ? name.get(s.raci.A) || '—' : <span className="text-amber-600">à désigner</span>}</td>
                                    <td className="px-3 py-2 text-xs text-slate-600">{s.echeance ? new Date(s.echeance).toLocaleDateString('fr-FR') : '—'}</td>
                                    <td className="px-3 py-2">
                                        {editable ? (
                                            <select value={s.status} aria-label={`Statut de ${s.procedure_nom}`}
                                                onChange={e => void run(() => campaignSlotsApi.update(campaignId, s.id, { status: e.target.value as SlotStatus }))}
                                                className="rounded border border-slate-200 px-1.5 py-0.5 text-xs">
                                                {(Object.keys(SLOT_STATUS_LABELS) as SlotStatus[]).map(k => <option key={k} value={k}>{SLOT_STATUS_LABELS[k]}</option>)}
                                            </select>
                                        ) : <span className="text-xs text-slate-600">{SLOT_STATUS_LABELS[s.status]}</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {adding && (
                <AddDialog mode={adding} campaignId={campaignId} existingProcIds={existingProcIds}
                    onClose={() => setAdding(null)} onDone={() => { setAdding(null); void load(); onChanged(); }} />
            )}
            {raciOpen && (
                <RaciDialog people={people} count={sel.length} initial={sel.length === 1 ? sel[0].raci : null}
                    onClose={() => setRaciOpen(false)}
                    onApply={async raci => { await campaignSlotsApi.setRaci(campaignId, [...selected], raci, true); setRaciOpen(false); await load(); }} />
            )}
        </div>
    );
}

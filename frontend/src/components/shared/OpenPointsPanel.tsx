'use client';

// Points ouverts d'une procédure (lot 5), partagé par le Studio et l'espace de travail.
// Rangés dans les métadonnées de la procédure (open_points) : ils sont enregistrés avec elle.
// Origine toujours visible : « Dans la source » (écrit dans le document) ou « Relevé par l'assistant ».
import { useState } from 'react';
import { Check, CircleHelp, ClipboardCopy, MessageSquareReply, Plus, UserPlus, X } from 'lucide-react';
import { inboxApi } from '@/lib/inboxApi';
import { orchestrationApi } from '@/lib/orchestrationApi';
import { organisationApi } from '@/lib/organisationApi';
import type { Table1Row } from '@/logic/types';

export interface OpenPoint {
    id: string;
    step_id: string | null;
    question: string;
    type: string;
    acteur: string;
    origine: 'source' | 'detecte' | 'manuel';
    source: string;
    statut: 'ouvert' | 'repondu' | 'abandonne';
    reponse: string;
    /** adressé à (tâche « Répondre ») — tenu par le serveur */
    destinataires?: string[];
    repondu_par_nom?: string;
}

const STATUS_LABEL: Record<OpenPoint['statut'], string> = { ouvert: 'Ouvert', repondu: 'Répondu', abandonne: 'Abandonné' };
const ORIGIN_LABEL: Record<OpenPoint['origine'], string> = { source: 'Dans la source', detecte: 'Relevé par l’assistant', manuel: 'Ajouté à la main' };

export function readOpenPoints(meta: unknown): OpenPoint[] {
    const list = (meta as { open_points?: unknown } | null | undefined)?.open_points;
    return Array.isArray(list) ? (list as OpenPoint[]) : [];
}

/** Texte prêt à envoyer aux métiers, regroupé par personne à interroger. */
export function openPointsAsText(title: string, points: OpenPoint[], rows: Table1Row[]): string {
    const open = points.filter(p => p.statut === 'ouvert');
    const byActor = new Map<string, OpenPoint[]>();
    open.forEach(p => { const k = p.acteur || 'À répartir'; byActor.set(k, [...(byActor.get(k) || []), p]); });
    const lines = [`Procédure « ${title} » — ${open.length} point${open.length > 1 ? 's' : ''} à confirmer`, ''];
    byActor.forEach((list, actor) => {
        lines.push(`${actor} :`);
        list.forEach(p => {
            const step = rows.find(r => r.id === p.step_id);
            lines.push(`- ${p.question}${step ? ` (étape « ${step.étape} »)` : ''}`);
        });
        lines.push('');
    });
    return lines.join('\n').trim();
}

export default function OpenPointsPanel({ title, points, rows, onChange, onFocusStep, onAnswer, procedureId }: {
    title: string;
    points: OpenPoint[];
    rows: Table1Row[];
    onChange: (points: OpenPoint[]) => void;
    onFocusStep?: (stepId: string) => void;
    /** Réponse donnée : le texte est proposé dans le chat pour mettre la procédure à jour */
    onAnswer?: (point: OpenPoint, answer: string) => void;
    /** Procédure enregistrée : on peut adresser un point à une personne ou une équipe */
    procedureId?: string | null;
}) {
    const [addressing, setAddressing] = useState<string | null>(null);
    const [targets, setTargets] = useState<{ people: { id: string; name: string }[]; teams: { id: string; nom: string }[] } | null>(null);
    const [addressError, setAddressError] = useState<string | null>(null);
    const openAddress = async (id: string) => {
        setAddressing(id);
        setAddressError(null);
        if (targets) return;
        const [users, teams] = await Promise.all([
            orchestrationApi.listUsers({ active_only: true }).then(r => r.users).catch(() => []),
            organisationApi.teams().catch(() => []),
        ]);
        setTargets({ people: users.map(u => ({ id: u.id, name: u.full_name || u.email })), teams: teams.map(t => ({ id: t.id, nom: t.nom })) });
    };
    const sendAddress = async (p: OpenPoint, value: string) => {
        if (!procedureId || !value) return;
        const [kind, id] = value.split(':');
        try {
            const res = await inboxApi.addressPoint(procedureId, p.id, kind === 'eq' ? { equipe_id: id } : { user_id: id });
            onChange(points.map(x => x.id === p.id ? { ...x, destinataires: res.destinataires } : x));
            setAddressing(null);
        } catch (e) {
            setAddressError(e instanceof Error && e.message.includes('introuvable')
                ? 'Enregistrez d’abord la procédure, puis adressez le point.' : (e instanceof Error ? e.message : 'Adressage impossible'));
        }
    };
    const nameOf = (id: string) => targets?.people.find(x => x.id === id)?.name;
    const [answering, setAnswering] = useState<string | null>(null);
    const [answer, setAnswer] = useState('');
    const [newQuestion, setNewQuestion] = useState('');
    const [copied, setCopied] = useState(false);
    const [showClosed, setShowClosed] = useState(false);

    const update = (id: string, patch: Partial<OpenPoint>) => onChange(points.map(p => p.id === id ? { ...p, ...patch } : p));
    const visible = points.filter(p => showClosed || p.statut === 'ouvert');
    const openCount = points.filter(p => p.statut === 'ouvert').length;

    const submitAnswer = (p: OpenPoint) => {
        if (!answer.trim()) return;
        update(p.id, { statut: 'repondu', reponse: answer.trim() });
        onAnswer?.(p, answer.trim());
        setAnswering(null); setAnswer('');
    };

    const add = () => {
        if (!newQuestion.trim()) return;
        onChange([...points, { id: crypto.randomUUID(), step_id: null, question: newQuestion.trim(), type: 'autre', acteur: '', origine: 'manuel', source: '', statut: 'ouvert', reponse: '' }]);
        setNewQuestion('');
    };

    const copy = async () => {
        try { await navigator.clipboard.writeText(openPointsAsText(title, points, rows)); setCopied(true); setTimeout(() => setCopied(false), 1500); }
        catch { /* presse-papiers indisponible */ }
    };

    return (
        <section aria-label="Points ouverts" className="bg-white border border-slate-200 rounded-xl">
            <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <CircleHelp className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-800">Points ouverts</h3>
                <span className="text-xs text-slate-400">{openCount} à confirmer{points.length > openCount ? ` · ${points.length - openCount} traités` : ''}</span>
                <div className="ml-auto flex items-center gap-1">
                    {points.length > openCount && (
                        <button type="button" onClick={() => setShowClosed(s => !s)} className="px-2 py-1 rounded-lg text-xs text-slate-500 hover:bg-slate-100">
                            {showClosed ? 'Masquer les traités' : 'Voir les traités'}
                        </button>
                    )}
                    <button type="button" onClick={copy} disabled={!openCount} title="Copier la liste, regroupée par personne à interroger"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                        {copied ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}{copied ? 'Copié' : 'Copier pour envoi'}
                    </button>
                </div>
            </div>
            {visible.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate-400">{points.length ? 'Tous les points sont traités.' : 'Aucun point ouvert.'}</p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {visible.map(p => {
                        const step = rows.find(r => r.id === p.step_id);
                        return (
                            <li key={p.id} className="px-4 py-2.5 text-sm">
                                <div className="flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <p className={p.statut === 'ouvert' ? 'text-slate-800' : 'text-slate-400 line-through'}>{p.question}</p>
                                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-400">
                                            <span>{ORIGIN_LABEL[p.origine] || p.origine}</span>
                                            {p.type && <span>· {p.type}</span>}
                                            {p.acteur && <span>· à demander à {p.acteur}</span>}
                                            {step && onFocusStep && (
                                                <button type="button" onClick={() => onFocusStep(step.id)} className="text-blue-600 hover:underline">· étape « {step.étape} »</button>
                                            )}
                                            {p.statut !== 'ouvert' && <span>· {STATUS_LABEL[p.statut]}</span>}
                                        </p>
                                        {p.source && <p className="mt-0.5 text-[11px] italic text-slate-400">« {p.source} »</p>}
                                        {p.reponse && <p className="mt-1 text-xs text-emerald-700">Réponse{p.repondu_par_nom ? ` de ${p.repondu_par_nom}` : ''} : {p.reponse}</p>}
                                        {p.statut === 'ouvert' && !!p.destinataires?.length && (
                                            <p className="mt-0.5 text-[11px] text-blue-600">Adressé à {p.destinataires.map(id => nameOf(id) || 'une personne').join(', ')} — en attente de réponse</p>
                                        )}
                                    </div>
                                    {procedureId && p.statut === 'ouvert' && (
                                        addressing === p.id ? (
                                            <select autoFocus aria-label="Adresser à" defaultValue="" onChange={e => void sendAddress(p, e.target.value)}
                                                onBlur={() => setAddressing(null)} className="shrink-0 rounded-lg border border-slate-300 px-1.5 py-1 text-xs">
                                                <option value="" disabled>{targets ? 'Adresser à…' : 'Chargement…'}</option>
                                                {targets?.teams.map(t => <option key={t.id} value={`eq:${t.id}`}>Équipe {t.nom}</option>)}
                                                {targets?.people.map(u => <option key={u.id} value={`u:${u.id}`}>{u.name}</option>)}
                                            </select>
                                        ) : (
                                            <button type="button" onClick={() => void openAddress(p.id)} title={p.destinataires?.length ? 'Adressé — adresser à quelqu’un d’autre' : 'Adresser à une personne ou une équipe'}
                                                className={`p-1.5 rounded-lg hover:bg-blue-50 ${p.destinataires?.length ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'}`}><UserPlus className="w-4 h-4" /></button>
                                        )
                                    )}
                                    {p.statut === 'ouvert' ? (
                                        <div className="flex shrink-0 gap-0.5">
                                            <button type="button" onClick={() => { setAnswering(p.id); setAnswer(''); }} title="Répondre"
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"><MessageSquareReply className="w-4 h-4" /></button>
                                            <button type="button" onClick={() => update(p.id, { statut: 'abandonne' })} title="Abandonner ce point"
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-4 h-4" /></button>
                                        </div>
                                    ) : (
                                        <button type="button" onClick={() => update(p.id, { statut: 'ouvert' })} className="shrink-0 text-[11px] text-slate-500 hover:underline">Rouvrir</button>
                                    )}
                                </div>
                                {answering === p.id && (
                                    <div className="mt-2 flex gap-2">
                                        <input autoFocus value={answer} onChange={e => setAnswer(e.target.value)} aria-label="Réponse"
                                            onKeyDown={e => { if (e.key === 'Enter') submitAnswer(p); if (e.key === 'Escape') setAnswering(null); }}
                                            placeholder="Réponse obtenue…" className="flex-1 min-w-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                                        <button type="button" onClick={() => submitAnswer(p)} disabled={!answer.trim()}
                                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Valider</button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            {addressError && (
                <p role="alert" className="px-4 py-1.5 text-xs text-red-600">{addressError}</p>
            )}
            <div className="px-4 py-2.5 border-t border-slate-100 flex gap-2">
                <input value={newQuestion} onChange={e => setNewQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }}
                    placeholder="Ajouter un point à confirmer…" aria-label="Nouveau point ouvert"
                    className="flex-1 min-w-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200" />
                <button type="button" onClick={add} disabled={!newQuestion.trim()} aria-label="Ajouter"
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40"><Plus className="w-4 h-4" /></button>
            </div>
        </section>
    );
}

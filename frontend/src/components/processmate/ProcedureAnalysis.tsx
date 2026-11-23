'use client';

// Analyse vers la cible : les défaillances de la procédure, regroupées par axe de transformation, à gauche ;
// le logigramme à droite, où les étapes concernées sont signalées. Cliquer une défaillance montre ses étapes ;
// cliquer une étape du logigramme ne garde que les défaillances qui la touchent. Les pistes se retiennent ou s'écartent
// sur place (atelier de conception de la cible).
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AlertCircle, Check, Loader2, Scan, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { Table1Row } from '@/logic/types';
import StepLinkedDiagram, { type StepLinkedDiagramHandle } from '@/components/shared/StepLinkedDiagram';
import { orchestrationApi } from '@/lib/orchestrationApi';

interface Piste { id: string; titre: string; description?: string; statut: string }
interface Finding { id: string; categorie?: string; constat?: string; etapes?: string[] | string; pistes?: Piste[] }
interface Irritant {
    id: string; titre: string; description?: string; categorie?: string; criticite?: string;
    etape_liee?: string; findings?: Finding[];
}

const isEvent = (t: string) => /Event/.test(t);
const CRIT_ORDER: Record<string, number> = { Majeur: 0, Moyen: 1, Mineur: 2 };

/** Étapes touchées : libellés cités par l'irritant (etape_liee) ou par ses constats. */
function stepsOf(irr: Irritant, rows: Table1Row[]): string[] {
    const hay = [irr.etape_liee || '', ...(irr.findings || []).map(f => Array.isArray(f.etapes) ? f.etapes.join('\n') : String(f.etapes || ''))].join('\n');
    return rows.filter(r => !isEvent(r.typeBpmn) && r.étape && r.étape.length > 3 && hay.includes(r.étape)).map(r => r.id);
}

const axisOf = (irr: Irritant) => irr.findings?.[0]?.categorie || irr.categorie || 'Sans axe';

/** « … → conséquence » : le constat d'un côté, ce qu'il entraîne de l'autre */
function splitDescription(d = '') {
    const [body, ...rest] = d.split('\n\n');
    const [constat, effet] = body.split(' → ');
    return { constat: constat.trim(), effet: effet?.trim(), note: rest.join(' ').trim() };
}

export default function ProcedureAnalysis({ procedureId, xml, rows, diagramRef }: {
    procedureId: string; xml: string; rows: Table1Row[];
    /** zoom et légende tenus par la barre de commandes : rien n'est posé sur le dessin */
    diagramRef?: RefObject<StepLinkedDiagramHandle | null>;
}) {
    const [items, setItems] = useState<Irritant[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeIrr, setActiveIrr] = useState<string | null>(null);
    const [stepFilter, setStepFilter] = useState<string | null>(null);
    const ownDiagram = useRef<StepLinkedDiagramHandle>(null);
    const diagram = diagramRef ?? ownDiagram;
    const cardRefs = useRef<Record<string, HTMLElement | null>>({});

    useEffect(() => {
        let gone = false;
        setItems(null); setError(null);
        orchestrationApi.listIrritants({ procedure_id: procedureId, with_findings: true })
            .then(r => { if (!gone) setItems(r.irritants as Irritant[]); })
            .catch(e => { if (!gone) setError(e?.message || 'Analyse indisponible'); });
        return () => { gone = true; };
    }, [procedureId]);

    const stepsById = useMemo(() => new Map((items || []).map(i => [i.id, stepsOf(i, rows)])), [items, rows]);
    const marked = useMemo(() => Array.from(new Set(Array.from(stepsById.values()).flat())), [stepsById]);
    const byRow = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);

    const visible = (items || []).filter(i => !stepFilter || stepsById.get(i.id)?.includes(stepFilter));
    const groups = useMemo(() => {
        const m = new Map<string, Irritant[]>();
        for (const i of visible) m.set(axisOf(i), [...(m.get(axisOf(i)) || []), i]);
        Array.from(m.values()).forEach(l => l.sort((a, b) => (CRIT_ORDER[a.criticite || ''] ?? 3) - (CRIT_ORDER[b.criticite || ''] ?? 3)));
        // axes numérotés (T1, T2…) d'abord, le reste ensuite
        return Array.from(m.entries()).sort(([a], [b]) => (/^T\d/.test(a) ? 0 : 1) - (/^T\d/.test(b) ? 0 : 1) || a.localeCompare(b, 'fr'));
    }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

    const selected = activeIrr ? stepsById.get(activeIrr) || [] : stepFilter ? [stepFilter] : [];

    const onDiagramSelect = useCallback((id: string | null) => {
        setActiveIrr(null);
        setStepFilter(id && byRow.has(id) ? id : null);
    }, [byRow]);

    const setPiste = async (p: Piste, statut: string) => {
        const next = p.statut === statut ? 'proposée' : statut;
        const patch = (s: string) => setItems(prev => prev && prev.map(i => ({
            ...i, findings: i.findings?.map(f => ({ ...f, pistes: f.pistes?.map(x => x.id === p.id ? { ...x, statut: s } : x) })),
        })));
        patch(next);
        try { await orchestrationApi.updatePiste(p.id, { statut: next }); }
        catch { patch(p.statut); setError('La piste n’a pas pu être mise à jour'); }
    };

    const all = items || [];
    const majeurs = all.filter(i => i.criticite === 'Majeur').length;
    const pistes = all.flatMap(i => (i.findings || []).flatMap(f => f.pistes || []));
    const retenues = pistes.filter(p => p.statut === 'retenue').length;
    const filterRow = stepFilter ? byRow.get(stepFilter) : null;

    return (
        <div className="flex h-full min-h-[480px] flex-col gap-3 lg:flex-row">
            {/* Défaillances par axe */}
            <section aria-label="Défaillances et pistes" className="flex min-h-[320px] flex-[2] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white lg:min-w-[400px] lg:max-w-[600px]">
                <div className="border-b border-neutral-200 px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-sm font-semibold text-neutral-900">Analyse vers la cible</h3>
                        {items && <span className="text-[11px] text-neutral-500">{all.length} défaillance{all.length > 1 ? 's' : ''} · {majeurs} majeure{majeurs > 1 ? 's' : ''} · {retenues} piste{retenues > 1 ? 's' : ''} retenue{retenues > 1 ? 's' : ''} sur {pistes.length}</span>}
                    </div>
                    {filterRow && (
                        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-neutral-900">
                            <span className="min-w-0 truncate">Étape {filterRow.id} · {filterRow.étape} — {visible.length} défaillance{visible.length > 1 ? 's' : ''}</span>
                            <button type="button" onClick={() => setStepFilter(null)} className="shrink-0 font-medium underline">Tout afficher</button>
                        </div>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto p-2.5">
                    {error && <p className="flex items-center gap-2 p-2 text-sm text-red-600"><AlertCircle className="h-4 w-4" />{error}</p>}
                    {!items && !error && <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-neutral-400" /></div>}
                    {items && all.length === 0 && (
                        <p className="p-3 text-sm text-neutral-600">Aucune défaillance relevée sur cette procédure. Demandez une analyse des irritants dans le chat.</p>
                    )}
                    {items && all.length > 0 && visible.length === 0 && (
                        <p className="p-3 text-sm text-neutral-600">Aucune défaillance ne touche cette étape.</p>
                    )}
                    {groups.map(([axis, list]) => (
                        <div key={axis} className="mb-3">
                            <div className="sticky top-0 z-[1] bg-white px-1 pb-1.5 pt-1">
                                <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-900">{axis} <span className="font-medium text-neutral-500">({list.length})</span></h4>
                                {list[0].findings?.[0]?.constat && <p className="mt-0.5 text-[11px] leading-snug text-neutral-600">{list[0].findings[0].constat}</p>}
                            </div>
                            <ul className="space-y-1.5">
                                {list.map(irr => {
                                    const active = activeIrr === irr.id;
                                    const d = splitDescription(irr.description);
                                    const steps = stepsById.get(irr.id) || [];
                                    const ps = (irr.findings || []).flatMap(f => f.pistes || []);
                                    return (
                                        <li key={irr.id} ref={el => { cardRefs.current[irr.id] = el; }}
                                            className={`rounded-lg border px-3 py-2 ${active ? 'border-neutral-900 bg-amber-50' : 'border-neutral-200'}`}>
                                            <button type="button" onClick={() => setActiveIrr(active ? null : irr.id)} aria-pressed={active} className="w-full text-left">
                                                <span className="flex items-start justify-between gap-2">
                                                    <span className="text-sm font-medium text-neutral-900">{irr.titre}</span>
                                                    {irr.criticite && (
                                                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${irr.criticite === 'Majeur' ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-700'}`}>{irr.criticite}</span>
                                                    )}
                                                </span>
                                                {d.effet && <span className="mt-0.5 block text-xs font-medium text-neutral-800">→ {d.effet}</span>}
                                                <span className={`mt-1 block text-xs leading-relaxed text-neutral-600 ${active ? '' : 'line-clamp-2'}`}>{d.constat}</span>
                                            </button>
                                            {steps.length > 0 && (
                                                <div className="mt-1.5 flex flex-wrap gap-1">
                                                    {steps.map(id => (
                                                        <button key={id} type="button" onClick={() => { setActiveIrr(irr.id); setStepFilter(null); }}
                                                            className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-800 hover:bg-neutral-200">
                                                            {id}. {byRow.get(id)?.étape}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {active && d.note && <p className="mt-1.5 text-[11px] text-neutral-500">{d.note}</p>}
                                            {ps.length > 0 && (
                                                <ul className="mt-2 space-y-1 border-t border-neutral-100 pt-1.5">
                                                    {ps.map(p => (
                                                        <li key={p.id} className="flex items-start gap-2">
                                                            <span className={`min-w-0 flex-1 text-xs ${p.statut === 'rejetée' ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>
                                                                {p.statut === 'retenue' && <Check className="mr-1 inline h-3 w-3" aria-label="Retenue" />}{p.titre}
                                                            </span>
                                                            <span className="flex shrink-0 gap-0.5">
                                                                <button type="button" onClick={() => void setPiste(p, 'retenue')} aria-pressed={p.statut === 'retenue'}
                                                                    title={p.statut === 'retenue' ? 'Remettre en proposition' : 'Retenir pour la cible'}
                                                                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${p.statut === 'retenue' ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'}`}>Retenir</button>
                                                                <button type="button" onClick={() => void setPiste(p, 'rejetée')} aria-pressed={p.statut === 'rejetée'}
                                                                    title={p.statut === 'rejetée' ? 'Remettre en proposition' : 'Écarter'} aria-label="Écarter"
                                                                    className={`rounded p-0.5 ${p.statut === 'rejetée' ? 'bg-neutral-200 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100'}`}><X className="h-3 w-3" /></button>
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            </section>

            {/* Logigramme : étapes concernées signalées */}
            <div className="relative min-h-[360px] flex-[3] overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <StepLinkedDiagram ref={diagram} xml={xml} selectedIds={selected} markedIds={marked} onSelect={onDiagramSelect} />
                {!diagramRef && <div className="absolute left-3 top-3 rounded-lg border border-neutral-200 bg-white/95 px-2 py-1 text-[11px] text-neutral-700 shadow-sm">
                    <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border-2 border-amber-500 align-middle" />étape touchée par une défaillance
                </div>}
                {!diagramRef && <div className="absolute right-3 top-3 flex overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-sm">
                    <button type="button" aria-label="Dézoomer" onClick={() => diagram.current?.zoomOut()} className="border-r border-neutral-300 p-1.5 hover:bg-neutral-100"><ZoomOut className="h-4 w-4" /></button>
                    <button type="button" aria-label="Zoomer" onClick={() => diagram.current?.zoomIn()} className="border-r border-neutral-300 p-1.5 hover:bg-neutral-100"><ZoomIn className="h-4 w-4" /></button>
                    <button type="button" aria-label="Ajuster" onClick={() => diagram.current?.fit()} className="p-1.5 hover:bg-neutral-100"><Scan className="h-4 w-4" /></button>
                </div>}
            </div>
        </div>
    );
}

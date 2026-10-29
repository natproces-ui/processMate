'use client';

// components/orchestration/ProcedureLinksView.tsx
//
// Procédures liées et leurs écrans. À gauche, la procédure choisie puis celles qu'elle appelle,
// déclenche ou nécessite (et celles qui y mènent), chacune avec son BPMN en entier et ses liens
// posés sur les étapes. À droite, leurs écrans dans l'ordre des étapes. Les deux colonnes
// défilent verticalement et se suivent : cliquer une étape amène à son écran, faire défiler
// les écrans surligne l'étape. Sert à Analyse > Bout en bout et au bouton « Défiler les
// écrans » des éditeurs (onClose).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Search, Loader2, X, ChevronLeft, ChevronRight, MonitorOff, CornerDownRight, Maximize2 } from 'lucide-react';
import type { Table1Row } from '@/logic/types';
import type { TaskEnrichment } from '@/logic/bpmnTypes';
import { elementId } from '@/logic/bpmnGraphModel';
import { orchestrationApi, type Procedure } from '@/lib/orchestrationApi';
import type { ToolDetail, ToolScreen } from '@/lib/toolsApi';
import { LINK_LABELS, type LinkType } from '@/lib/processLinks';
import { walkProcedure } from '@/lib/screenFlow';
import { loadToolDetail } from '@/components/orchestration/StepScreensPicker';
import ScreenFrame from '@/components/orchestration/ScreenFrame';
import type { DiagramLink } from '@/components/orchestration/ProcedureDiagram';

const ProcedureDiagram = dynamic(() => import('@/components/orchestration/ProcedureDiagram'), { ssr: false });

interface LinkEdge { source: string; target: string; type: LinkType; step_id: string | null; step_name: string | null }

const LINK_COLORS: Record<LinkType, string> = { fait_appel_a: '#7c3aed', declenche: '#d97706', necessite: '#0284c7' };

type Depth = 1 | 2 | 99;

interface Section {
    sid: string;
    summary: Procedure;               // ligne de la liste (nom, ref, catégorie, id)
    via: { edge: LinkEdge; from: string; incoming: boolean } | null;
}

interface ScreenCardData {
    key: string;
    sid: string;
    rows: Table1Row[];
    screen: ToolScreen;
    toolName: string;
    offPath: boolean;                 // sur une autre branche que la principale
}

interface Props {
    /** Procédure affichée au départ (id de version) ; sinon la plus liée. */
    initialWorkflowId?: string;
    initialDepth?: Depth;
    onClose?: () => void;
}

export default function ProcedureLinksView({ initialWorkflowId, initialDepth = 2, onClose }: Props) {
    const [procedures, setProcedures] = useState<Procedure[] | null>(null);
    const [edges, setEdges] = useState<LinkEdge[]>([]);
    const [full, setFull] = useState<Map<string, Procedure>>(new Map());
    const [tools, setTools] = useState<Map<string, ToolDetail | null>>(new Map());
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [depth, setDepth] = useState<Depth>(initialDepth);
    const [active, setActive] = useState<{ sid: string; stepId: string } | null>(null);
    const [zoom, setZoom] = useState<number | null>(null);
    const leftRef = useRef<HTMLDivElement>(null);
    const rightRef = useRef<HTMLDivElement>(null);
    const fromRightScroll = useRef(false);
    const programmatic = useRef(false);

    useEffect(() => {
        Promise.all([orchestrationApi.listProcedures(), orchestrationApi.getAllLinks()])
            .then(([p, l]) => { setProcedures(p.procedures); setEdges(l.edges); })
            .catch(e => setError(e.message || 'Chargement impossible'));
    }, []);

    const bySession = useMemo(() => new Map((procedures ?? []).map(p => [p.session_id, p])), [procedures]);
    const linkCount = useMemo(() => {
        const m = new Map<string, number>();
        edges.forEach(e => { m.set(e.source, (m.get(e.source) || 0) + 1); m.set(e.target, (m.get(e.target) || 0) + 1); });
        return m;
    }, [edges]);

    // Procédure de départ
    useEffect(() => {
        if (selected || !procedures?.length) return;
        const initial = initialWorkflowId && procedures.find(p => p.id === initialWorkflowId);
        const busiest = [...linkCount.entries()].sort((a, b) => b[1] - a[1]).find(([sid]) => bySession.has(sid))?.[0];
        setSelected(initial ? initial.session_id : busiest ?? procedures[0].session_id);
    }, [procedures, selected, initialWorkflowId, linkCount, bySession]);

    // Procédures affichées : la choisie, puis de proche en proche par ses liens
    const sections: Section[] = useMemo(() => {
        if (!selected || !bySession.has(selected)) return [];
        const out: Section[] = [{ sid: selected, summary: bySession.get(selected)!, via: null }];
        const seen = new Set([selected]);
        let frontier = [selected];
        for (let d = 1; d <= depth && frontier.length; d++) {
            const next: string[] = [];
            frontier.forEach(sid => {
                const add = (other: string, edge: LinkEdge, incoming: boolean) => {
                    if (seen.has(other) || !bySession.has(other)) return;
                    seen.add(other);
                    next.push(other);
                    out.push({ sid: other, summary: bySession.get(other)!, via: { edge, from: sid, incoming } });
                };
                edges.filter(e => e.source === sid).forEach(e => add(e.target, e, false));
                edges.filter(e => e.target === sid).forEach(e => add(e.source, e, true));
            });
            frontier = next;
        }
        return out;
    }, [selected, depth, edges, bySession]);

    // Contenu complet (étapes, écrans) des procédures affichées
    useEffect(() => {
        const missing = sections.filter(s => !full.has(s.sid));
        if (missing.length === 0) return;
        let cancelled = false;
        Promise.all(missing.map(s => orchestrationApi.getProcedure(s.summary.id).then(r => [s.sid, r.procedure] as const).catch(() => null)))
            .then(entries => {
                if (cancelled) return;
                setFull(prev => { const m = new Map(prev); entries.forEach(e => { if (e) m.set(e[0], e[1]); }); return m; });
            });
        return () => { cancelled = true; };
    }, [sections, full]);

    const rowsOf = useCallback((sid: string) => ((full.get(sid) as any)?.workflow_json || []) as Table1Row[], [full]);
    const enrOf = useCallback((sid: string) => (full.get(sid)?.enrichments_json || {}) as Record<string, TaskEnrichment>, [full]);

    useEffect(() => {
        const names = new Set<string>();
        sections.forEach(s => rowsOf(s.sid).forEach(r => { if (r.outil && (enrOf(s.sid)[r.id]?.ecrans?.length ?? 0) > 0) names.add(r.outil); }));
        const missing = [...names].filter(n => !tools.has(n));
        if (missing.length === 0) return;
        Promise.all(missing.map(n => loadToolDetail(n).then(d => [n, d] as const).catch(() => [n, null] as const)))
            .then(entries => setTools(prev => new Map([...prev, ...entries])));
    }, [sections, rowsOf, enrOf, tools]);

    // Écrans de chaque procédure : la branche principale d'abord, puis les autres branches
    const cards: ScreenCardData[] = useMemo(() => {
        const list: ScreenCardData[] = [];
        sections.forEach(({ sid }) => {
            const rows = rowsOf(sid), enr = enrOf(sid);
            const path = walkProcedure(rows, new Map());
            const onPath = new Set(path.map(r => r.id));
            const ordered = [...path, ...rows.filter(r => !onPath.has(r.id))];
            let last: ScreenCardData | null = null;
            ordered.forEach(row => {
                (enr[row.id]?.ecrans ?? []).forEach(id => {
                    const screen = row.outil ? tools.get(row.outil)?.screens.find(s => s.id === id) : undefined;
                    if (!screen) return;
                    if (last && last.screen.id === screen.id && last.offPath === !onPath.has(row.id)) { last.rows.push(row); return; }
                    last = { key: `${sid}:${row.id}:${id}`, sid, rows: [row], screen, toolName: row.outil, offPath: !onPath.has(row.id) };
                    list.push(last);
                });
            });
        });
        return list;
    }, [sections, rowsOf, enrOf, tools]);

    // ─── Synchronisation des deux colonnes ────────────────────
    const scrollWithin = (container: HTMLElement | null, el: Element | null, align: 'start' | 'center') => {
        if (!container || !el) return;
        const c = container.getBoundingClientRect(), r = el.getBoundingClientRect();
        // 'start' : sous l'en-tête collant de la procédure (colonne des écrans)
        const top = container.scrollTop + r.top - c.top - (align === 'center' ? (c.height - r.height) / 2 : 72);
        programmatic.current = true;
        container.scrollTo({ top, behavior: 'smooth' });
        setTimeout(() => { programmatic.current = false; }, 700);
    };

    const cardOfStep = (sid: string, stepId: string) => cards.find(c => c.sid === sid && c.rows.some(r => r.id === stepId));

    const onStepClick = (sid: string, stepId: string) => {
        setActive({ sid, stepId });
        const card = cardOfStep(sid, stepId);
        if (card) scrollWithin(rightRef.current, rightRef.current?.querySelector(`[data-card="${CSS.escape(card.key)}"]`) ?? null, 'start');
    };

    const goToSection = (sid: string) => {
        scrollWithin(leftRef.current, leftRef.current?.querySelector(`[data-section="${CSS.escape(sid)}"]`) ?? null, 'start');
        scrollWithin(rightRef.current, rightRef.current?.querySelector(`[data-screens="${CSS.escape(sid)}"]`) ?? null, 'start');
    };

    // Faire défiler les écrans : le premier écran visible devient l'étape active, et le BPMN suit
    const onRightScroll = () => {
        if (programmatic.current || !rightRef.current) return;
        const top = rightRef.current.getBoundingClientRect().top + 90;
        let best: ScreenCardData | null = null, dist = Infinity;
        cards.forEach(c => {
            const el = rightRef.current!.querySelector(`[data-card="${CSS.escape(c.key)}"]`);
            if (!el) return;
            const r = el.getBoundingClientRect();
            const d = r.bottom < top ? Infinity : Math.abs(r.top - top);
            if (d < dist) { dist = d; best = c; }
        });
        const b = best as ScreenCardData | null;
        if (b && !(active?.sid === b.sid && b.rows.some(r => r.id === active.stepId))) {
            fromRightScroll.current = true;
            setActive({ sid: b.sid, stepId: b.rows[0].id });
        }
    };

    useEffect(() => {
        if (!fromRightScroll.current || !active) return;
        fromRightScroll.current = false;
        const row = rowsOf(active.sid).find(r => r.id === active.stepId);
        const left = leftRef.current;
        const el = row && left?.querySelector(`[data-section="${CSS.escape(active.sid)}"] [data-element-id="${elementId(row.id, row.typeBpmn as any)}"]`);
        if (!left || !el) return;
        const c = left.getBoundingClientRect(), r = el.getBoundingClientRect();
        if (r.top < c.top + 40 || r.bottom > c.bottom - 40) scrollWithin(left, el, 'center');
    }, [active, rowsOf]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { if (zoom !== null) setZoom(null); else onClose?.(); }
            if (zoom !== null && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                setZoom(z => Math.max(0, Math.min((z ?? 0) + (e.key === 'ArrowRight' ? 1 : -1), cards.length - 1)));
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [zoom, onClose, cards.length]);

    // ─── Rendu ────────────────────────────────────────────────
    if (error && !procedures) return <div className="p-8 text-sm text-rose-600">{error}</div>;
    if (!procedures) return <div className="h-full flex items-center justify-center bg-slate-50"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>;

    const stepLabel = (sid: string, stepId: string) => rowsOf(sid).find(r => r.id === stepId)?.étape ?? '';
    const zoomed = zoom !== null ? cards[zoom] : null;

    return (
        <div className={`${onClose ? 'fixed inset-0 z-[60]' : 'h-full'} flex flex-col bg-slate-50 min-w-0`}>

            {/* Barre : procédure, niveaux de liens */}
            <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-4">
                <ProcedurePicker procedures={procedures} linkCount={linkCount} value={selected}
                    onChange={sid => { setSelected(sid); setActive(null); leftRef.current?.scrollTo({ top: 0 }); rightRef.current?.scrollTo({ top: 0 }); }} />
                <div className="flex items-center gap-1 text-xs">
                    <span className="text-slate-500 mr-1">Niveaux de liens</span>
                    {([1, 2, 99] as Depth[]).map(d => (
                        <button key={d} type="button" onClick={() => setDepth(d)} title={d === 99 ? 'Toute la chaîne' : `${d} niveau${d > 1 ? 'x' : ''} de liens`}
                            className={`min-w-[28px] px-2 py-1 rounded-md font-medium ${depth === d ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                            {d === 99 ? 'Tout' : d}
                        </button>
                    ))}
                </div>
                <span className="text-xs text-slate-500">{sections.length} procédure{sections.length > 1 ? 's' : ''} · {cards.length} écran{cards.length > 1 ? 's' : ''}</span>
                <div className="flex-1" />
                <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-500">
                    {(Object.keys(LINK_COLORS) as LinkType[]).map(t => (
                        <span key={t} className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border-2" style={{ borderColor: LINK_COLORS[t] }} />{LINK_LABELS[t].label}</span>
                    ))}
                </div>
                {onClose && (
                    <button type="button" onClick={onClose} title="Fermer (Échap)" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        <X className="w-5 h-5" />
                    </button>
                )}
            </div>

            <div className="flex-1 min-h-0 flex">

                {/* Procédures et leur BPMN */}
                <div ref={leftRef} className="flex-[3] min-w-0 overflow-y-auto p-4 space-y-4">
                    {sections.map(s => {
                        const proc = full.get(s.sid);
                        const rows = rowsOf(s.sid);
                        const enr = enrOf(s.sid);
                        const counts = new Map<string, number>();
                        rows.forEach(r => { const n = enr[r.id]?.ecrans?.length ?? 0; if (n) counts.set(r.id, n); });
                        const diagramLinks: DiagramLink[] = edges
                            .filter(e => e.source === s.sid && e.step_id && bySession.has(e.target))
                            .map(e => ({
                                stepId: e.step_id!, color: LINK_COLORS[e.type],
                                label: `${LINK_LABELS[e.type].label} · ${bySession.get(e.target)!.nom}`,
                                onClick: () => sections.some(x => x.sid === e.target) ? goToSection(e.target) : setSelected(e.target),
                            }));
                        const needs = edges.filter(e => e.source === s.sid && e.type === 'necessite' && bySession.has(e.target));
                        return (
                            <section key={s.sid} data-section={s.sid} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <header className="px-4 py-3 border-b border-slate-100 flex items-start gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-mono text-slate-400">{s.summary.ref} · {s.summary.category}</p>
                                        <p className="text-base font-bold text-slate-800 leading-snug">{s.summary.nom}</p>
                                        {s.via && (
                                            <button type="button" onClick={() => goToSection(s.via!.from)}
                                                className="mt-1 flex items-center gap-1.5 text-xs text-left hover:underline" style={{ color: LINK_COLORS[s.via.edge.type] }}>
                                                <CornerDownRight className="w-3.5 h-3.5 flex-shrink-0" />
                                                {s.via.incoming
                                                    ? `${LINK_LABELS[s.via.edge.type].label} « ${bySession.get(s.via.from)?.nom} »`
                                                    : `${LINK_LABELS[s.via.edge.type].inverse} « ${bySession.get(s.via.from)?.nom} »`}
                                                {s.via.edge.step_name && <span className="text-slate-400">— étape « {s.via.edge.step_name} »</span>}
                                            </button>
                                        )}
                                    </div>
                                    {needs.length > 0 && (
                                        <div className="flex flex-wrap gap-1 justify-end max-w-[45%]">
                                            {needs.map(e => (
                                                <button key={e.target} type="button"
                                                    onClick={() => sections.some(x => x.sid === e.target) ? goToSection(e.target) : setSelected(e.target)}
                                                    className="text-[11px] px-2 py-0.5 rounded-md border bg-white hover:bg-slate-50" style={{ color: LINK_COLORS.necessite, borderColor: LINK_COLORS.necessite }}>
                                                    Nécessite · {bySession.get(e.target)?.nom}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </header>
                                {proc ? (
                                    rows.length > 0 ? (
                                        <ProcedureDiagram rows={rows} title={s.summary.nom} screenCounts={counts} links={diagramLinks}
                                            activeStepId={active?.sid === s.sid ? active.stepId : null}
                                            onStepClick={stepId => onStepClick(s.sid, stepId)} />
                                    ) : <p className="p-6 text-sm text-slate-400">Aucune étape.</p>
                                ) : (
                                    <div className="h-64 flex items-center justify-center text-slate-300"><Loader2 className="w-5 h-5 animate-spin" /></div>
                                )}
                            </section>
                        );
                    })}
                </div>

                {/* Écrans */}
                <div ref={rightRef} onScroll={onRightScroll} className="flex-[2] min-w-[360px] max-w-[640px] overflow-y-auto border-l border-slate-200 bg-white">
                    {sections.map(s => {
                        const own = cards.filter(c => c.sid === s.sid);
                        return (
                            <div key={s.sid} data-screens={s.sid}>
                                <div className="sticky top-0 z-10 px-4 py-2.5 bg-white/95 backdrop-blur border-b border-slate-100">
                                    <p className="text-[11px] font-mono text-slate-400">{s.summary.ref}</p>
                                    <p className="text-sm font-semibold text-slate-800 truncate">{s.summary.nom} <span className="font-normal text-slate-400">· {own.length} écran{own.length > 1 ? 's' : ''}</span></p>
                                </div>
                                <div className="p-4 space-y-4">
                                    {own.length === 0 && full.has(s.sid) && (
                                        <p className="flex items-center gap-2 text-sm text-slate-400"><MonitorOff className="w-4 h-4" />Aucun écran rattaché à ses étapes.</p>
                                    )}
                                    {own.map(c => {
                                        const isActive = active?.sid === c.sid && c.rows.some(r => r.id === active.stepId);
                                        const index = cards.indexOf(c);
                                        return (
                                            <div key={c.key} data-card={c.key} role="button" tabIndex={0}
                                                onClick={() => { if (isActive) setZoom(index); else { setActive({ sid: c.sid, stepId: c.rows[0].id }); fromRightScroll.current = true; } }}
                                                className={`group rounded-xl border overflow-hidden cursor-pointer transition-shadow ${isActive ? 'border-blue-500 ring-2 ring-blue-500/25 shadow-md' : 'border-slate-200 hover:shadow-md'}`}>
                                                <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/70">
                                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                                                        {[...new Set(c.rows.map(r => r.acteur).filter(Boolean))].join(', ')}{c.offPath ? ' · autre branche' : ''}
                                                    </p>
                                                    <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{c.rows.map(r => r.étape).join(' · ')}</p>
                                                </div>
                                                <div style={{ position: 'relative' }}>
                                                    <ScreenFrame screen={c.screen} css={tools.get(c.toolName)?.tool.design_css} toolName={c.toolName} cropHeight={800} />
                                                    <span className="absolute top-2 right-2 px-2 py-1 rounded-md bg-slate-900/75 text-white text-[11px] font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Maximize2 className="w-3 h-3" />{isActive ? 'Agrandir' : 'Afficher'}
                                                    </span>
                                                </div>
                                                <p className="px-3.5 py-2 text-xs text-slate-500 truncate">{c.screen.name} · {c.toolName}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Écran en grand */}
            {zoomed && (
                <div className="fixed inset-0 z-[70] bg-slate-900/70 flex flex-col" onClick={() => setZoom(null)}>
                    <div className="h-14 flex-shrink-0 px-5 flex items-center gap-3 text-white" onClick={e => e.stopPropagation()}>
                        <div className="min-w-0">
                            <p className="text-xs text-slate-300 truncate">{bySession.get(zoomed.sid)?.ref} · {bySession.get(zoomed.sid)?.nom}</p>
                            <p className="text-sm font-semibold truncate">{zoomed.rows.map(r => stepLabel(zoomed.sid, r.id)).join(' · ')}</p>
                        </div>
                        <div className="flex-1" />
                        <button type="button" disabled={zoom === 0} onClick={() => setZoom(z => Math.max((z ?? 0) - 1, 0))} className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="w-5 h-5" /></button>
                        <span className="text-sm text-slate-300 tabular-nums">{(zoom ?? 0) + 1} / {cards.length}</span>
                        <button type="button" disabled={zoom === cards.length - 1} onClick={() => setZoom(z => Math.min((z ?? 0) + 1, cards.length - 1))} className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
                        <button type="button" onClick={() => setZoom(null)} className="p-2 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto pb-10" onClick={e => e.stopPropagation()}>
                        <div className="mx-auto w-[min(94vw,1280px)] rounded-xl overflow-hidden bg-white shadow-2xl">
                            <ScreenFrame key={zoomed.key} screen={zoomed.screen} css={tools.get(zoomed.toolName)?.tool.design_css} toolName={zoomed.toolName} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Choix de la procédure : recherche, rangement par catégorie, nombre de liens
function ProcedurePicker({ procedures, linkCount, value, onChange }: {
    procedures: Procedure[];
    linkCount: Map<string, number>;
    value: string | null;
    onChange: (sid: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const current = procedures.find(p => p.session_id === value);
    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const map = new Map<string, Procedure[]>();
        procedures.filter(p => !q || `${p.ref} ${p.nom}`.toLowerCase().includes(q))
            .forEach(p => { const k = p.category || 'Sans catégorie'; map.set(k, [...(map.get(k) || []), p]); });
        map.forEach(list => list.sort((a, b) => (a.ref || a.nom).localeCompare(b.ref || b.nom)));
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [procedures, query]);

    return (
        <div className="w-[420px] max-w-[45vw]" style={{ position: 'relative' }}>
            <button type="button" onClick={() => setOpen(o => !o)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 hover:border-slate-300 flex items-center gap-2 text-left">
                <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm">
                    {current ? <><span className="font-mono text-xs text-slate-400 mr-1.5">{current.ref}</span><span className="font-semibold text-slate-800">{current.nom}</span></> : <span className="text-slate-400">Choisir une procédure</span>}
                </span>
            </button>
            {open && (
                <div className="absolute z-30 top-11 left-0 w-full rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-slate-100">
                        <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher une procédure"
                            className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400" />
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto py-1">
                        {groups.map(([cat, list]) => (
                            <div key={cat}>
                                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{cat}</p>
                                {list.map(p => {
                                    const n = linkCount.get(p.session_id) || 0;
                                    return (
                                        <button key={p.id} type="button" onClick={() => { onChange(p.session_id); setOpen(false); setQuery(''); }}
                                            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-sm hover:bg-slate-50 ${p.session_id === value ? 'bg-blue-50 text-blue-800' : 'text-slate-700'}`}>
                                            <span className="font-mono text-[11px] text-slate-400 w-16 flex-shrink-0">{p.ref}</span>
                                            <span className="flex-1 min-w-0 truncate">{p.nom}</span>
                                            {n > 0 && <span className="text-[11px] px-1.5 rounded-full bg-slate-100 text-slate-500">{n}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

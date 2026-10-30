'use client';

// components/orchestration/ProcessChainView.tsx
//
// « Enchaînement des process » d'un thème : une rangée par grande fonctionnalité, ses procédures
// de gauche à droite du début à la fin (ProcessChainMap), et à droite les écrans de la rangée
// choisie, de bout en bout (la première par défaut). Les rangées sont proposées
// automatiquement à partir des liens, puis modifiables depuis « ⋯ » : réordonner, ajouter ou
// retirer une procédure, renommer, supprimer. Rangées et dernière vue sont propres au thème et
// enregistrées quand l'utilisateur quitte la carte.
// Sert à Analyse > Enchaînement des process et au bouton « Défiler les écrans » (onClose).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
    Loader2, X, ZoomIn, ZoomOut, Maximize, PanelRightClose, PanelRightOpen, ChevronLeft, ChevronRight,
    MonitorOff, Check, ArrowUp, ArrowDown, ArrowDownToLine, Plus, Pencil, Trash2, ListOrdered, Search, RotateCcw,
} from 'lucide-react';
import type { Table1Row } from '@/logic/types';
import type { TaskEnrichment } from '@/logic/bpmnTypes';
import { orchestrationApi, type Procedure } from '@/lib/orchestrationApi';
import { taxonomyApi, type Box, type TaxonomyFlat } from '@/lib/taxonomyApi';
import type { ToolDetail, ToolScreen } from '@/lib/toolsApi';
import { LINK_LABELS, type LinkType } from '@/lib/processLinks';
import { walkProcedure } from '@/lib/screenFlow';
import { autoRows, buildProcessMap, reconcileRows, LINK_COLORS, THEN_COLOR, type MapLink, type MapProcedure, type MapRow } from '@/lib/processMapXml';
import { loadToolDetail } from '@/components/orchestration/StepScreensPicker';
import ScreenFrame from '@/components/orchestration/ScreenFrame';
import type { ActiveStep, ProcessChainMapHandle } from '@/components/orchestration/ProcessChainMap';

const ProcessChainMap = dynamic(() => import('@/components/orchestration/ProcessChainMap'), { ssr: false });

const PANEL_KEY = 'pm.processChain.panelWidth';
const THEME_KEY = 'pm.processChain.theme';

interface Card { key: string; index: number; sid: string; rows: Table1Row[]; screen: ToolScreen; toolName: string; offPath: boolean }
type MenuMode = 'menu' | 'reorder' | 'add' | 'rename';

interface Props {
    /** Procédure mise en avant au départ (id de version) : son thème, sa rangée. */
    initialWorkflowId?: string;
    onClose?: () => void;
}

export default function ProcessChainView({ initialWorkflowId, onClose }: Props) {
    const [procedures, setProcedures] = useState<Procedure[] | null>(null);
    const [nodes, setNodes] = useState<TaxonomyFlat[]>([]);
    const [links, setLinks] = useState<MapLink[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [themeId, setThemeId] = useState<string | null>(null);
    const [full, setFull] = useState<Map<string, Procedure>>(new Map());
    const [failed, setFailed] = useState<Set<string>>(new Set());
    const [saved, setSaved] = useState<{ rows?: MapRow[]; viewbox?: Box } | null | undefined>(undefined); // undefined = en chargement
    const [rows, setRows] = useState<MapRow[] | null>(null);
    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [active, setActive] = useState<ActiveStep | null>(null);
    const [tools, setTools] = useState<Map<string, ToolDetail | null>>(new Map());
    const [zoom, setZoom] = useState<number | null>(null);
    const [panelWidth, setPanelWidth] = useState(460);
    const [panelOpen, setPanelOpen] = useState(true);
    const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved');
    const [menu, setMenu] = useState<{ rowId: string; anchor: DOMRect; mode: MenuMode } | null>(null);
    const mapRef = useRef<ProcessChainMapHandle>(null);
    const rightRef = useRef<HTMLDivElement>(null);
    const viewbox = useRef<Box | undefined>(undefined);
    const dirty = useRef(false);
    const programmatic = useRef(false);

    useEffect(() => {
        try { const w = Number(localStorage.getItem(PANEL_KEY)); if (w >= 300 && w <= 1000) setPanelWidth(w); } catch { /* préférence locale facultative */ }
        Promise.all([orchestrationApi.listProcedures(), taxonomyApi.getFlat(), orchestrationApi.getAllLinks()])
            .then(([p, t, l]) => { setProcedures(p.procedures); setNodes(t.nodes); setLinks(l.edges); })
            .catch(e => setError(e.message || 'Chargement impossible'));
    }, []);

    // Thème, catégorie et sous-catégorie de chaque procédure
    const byNode = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
    const ancestry = useCallback((nodeId: string | null | undefined) => {
        const chain: TaxonomyFlat[] = [];
        for (let n = nodeId ? byNode.get(nodeId) : undefined; n; n = n.parent_id ? byNode.get(n.parent_id) : undefined) chain.push(n);
        return { theme: chain.find(n => n.level === 'theme'), category: chain.find(n => n.level === 'category'), subcategory: chain.find(n => n.level === 'subcategory') };
    }, [byNode]);
    const themes = useMemo(() => {
        const count = new Map<string, number>();
        (procedures ?? []).forEach(p => { const t = ancestry(p.taxonomy_id).theme; if (t) count.set(t.id, (count.get(t.id) || 0) + 1); });
        return [...count.entries()].map(([id, n]) => ({ id, name: byNode.get(id)!.name, n })).sort((a, b) => a.name.localeCompare(b.name));
    }, [procedures, ancestry, byNode]);

    const initialSid = useMemo(() => procedures?.find(p => p.id === initialWorkflowId)?.session_id ?? null, [procedures, initialWorkflowId]);

    useEffect(() => {
        if (themeId || !procedures || themes.length === 0) return;
        // Thème de la procédure de départ, sinon le dernier consulté, sinon celui qui a le plus de liens
        const initial = initialWorkflowId && procedures.find(p => p.id === initialWorkflowId);
        const t = initial && ancestry(initial.taxonomy_id).theme;
        let last: string | null = null;
        try { last = localStorage.getItem(THEME_KEY); } catch { /* facultatif */ }
        const themeOfSid = new Map(procedures.map(p => [p.session_id, ancestry(p.taxonomy_id).theme?.id]));
        const perTheme = new Map<string, number>();
        links.forEach(l => { const id = themeOfSid.get(l.source); if (id) perTheme.set(id, (perTheme.get(id) || 0) + 1); });
        const mostLinked = [...themes].sort((a, b) => (perTheme.get(b.id) || 0) - (perTheme.get(a.id) || 0))[0].id;
        setThemeId(t ? t.id : last && themes.some(x => x.id === last) ? last : mostLinked);
    }, [themeId, procedures, themes, initialWorkflowId, ancestry, links]);

    useEffect(() => { if (themeId) try { localStorage.setItem(THEME_KEY, themeId); } catch { /* facultatif */ } }, [themeId]);

    const themeProcs = useMemo(() => (procedures ?? []).filter(p => themeId && ancestry(p.taxonomy_id).theme?.id === themeId), [procedures, themeId, ancestry]);

    useEffect(() => {
        if (!themeId) return;
        let cancelled = false;
        setSaved(undefined);
        setRows(null);
        taxonomyApi.getMap(themeId)
            .then(r => { if (!cancelled) setSaved(r.layout ?? null); })
            .catch(() => { if (!cancelled) setSaved(null); });
        return () => { cancelled = true; };
    }, [themeId]);
    useEffect(() => {
        const missing = themeProcs.filter(p => !full.has(p.session_id) && !failed.has(p.session_id));
        if (missing.length === 0) return;
        let cancelled = false;
        Promise.all(missing.map(p => orchestrationApi.getProcedure(p.id).then(r => [p.session_id, r.procedure] as const).catch(() => [p.session_id, null] as const)))
            .then(list => {
                if (cancelled) return;
                setFull(prev => { const m = new Map(prev); list.forEach(([sid, p]) => { if (p) m.set(sid, p); }); return m; });
                setFailed(prev => { const f = new Set(prev); list.forEach(([sid, p]) => { if (!p) f.add(sid); }); return f; });
            });
        return () => { cancelled = true; };
    }, [themeProcs, full, failed]);

    const rowsOf = useCallback((sid: string) => ((full.get(sid) as any)?.workflow_json || []) as Table1Row[], [full]);
    const enrOf = useCallback((sid: string) => (full.get(sid)?.enrichments_json || {}) as Record<string, TaskEnrichment>, [full]);
    const allLoaded = themeProcs.length > 0 && themeProcs.every(p => full.has(p.session_id) || failed.has(p.session_id));

    const mapProcs: MapProcedure[] = useMemo(() => !allLoaded ? [] : themeProcs.map(p => {
        const a = ancestry(p.taxonomy_id);
        return { sid: p.session_id, name: p.nom, ref: p.ref, rows: rowsOf(p.session_id), category: a.category?.name ?? '', subcategory: a.subcategory?.name ?? '' };
    }), [allLoaded, themeProcs, ancestry, rowsOf]);
    const themeLinks = useMemo(() => {
        const sids = new Set(themeProcs.map(p => p.session_id));
        return links.filter(l => sids.has(l.source) && sids.has(l.target));
    }, [links, themeProcs]);

    // Rangées : enregistrées (complétées), sinon proposées
    useEffect(() => {
        if (!allLoaded || saved === undefined || rows) return;
        const r = reconcileRows(saved?.rows, mapProcs, themeLinks);
        viewbox.current = saved?.viewbox;
        setRows(r);
        const start = initialSid ? r.find(x => x.sids.includes(initialSid)) : undefined;
        setActiveRowId((start ?? r[0])?.id ?? null);
    }, [allLoaded, saved, rows, mapProcs, themeLinks, initialSid]);

    const map = useMemo(() => rows && mapProcs.length ? buildProcessMap(mapProcs, themeLinks, rows) : null, [rows, mapProcs, themeLinks]);
    const procOf = useMemo(() => new Map(themeProcs.map(p => [p.session_id, p])), [themeProcs]);

    const screenCounts = useMemo(() => {
        const m = new Map<string, Map<string, number>>();
        themeProcs.forEach(p => {
            const per = new Map<string, number>();
            Object.entries(enrOf(p.session_id)).forEach(([id, e]) => { const n = e?.ecrans?.length ?? 0; if (n) per.set(id, n); });
            m.set(p.session_id, per);
        });
        return m;
    }, [themeProcs, enrOf]);

    // ─── Enregistrement en quittant ───────────────────────────
    const save = useCallback(() => {
        if (!dirty.current || !themeId || !rows) return;
        dirty.current = false;
        setSaveState('saving');
        const vb = mapRef.current?.viewbox() ?? viewbox.current;
        taxonomyApi.saveMap(themeId, { rows, viewbox: vb ?? undefined })
            .then(r => { if (!r.ok) { dirty.current = true; setSaveState('dirty'); } else setSaveState('saved'); })
            .catch(() => { dirty.current = true; setSaveState('dirty'); });
    }, [themeId, rows]);
    const saveRef = useRef(save);
    saveRef.current = save;
    useEffect(() => {
        const onHide = () => { if (document.visibilityState === 'hidden') saveRef.current(); };
        const onLeave = () => saveRef.current();
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('pagehide', onLeave);
        return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onLeave); saveRef.current(); };
    }, []);
    const markDirty = useCallback(() => { dirty.current = true; setSaveState('dirty'); }, []);

    const changeTheme = (id: string) => { save(); setThemeId(id); setActive(null); setActiveRowId(null); setMenu(null); };
    const close = () => { save(); onClose?.(); };

    // Modifier les rangées : la carte est reconstruite, la vue courante est gardée
    const updateRows = (next: MapRow[]) => {
        viewbox.current = mapRef.current?.viewbox() ?? viewbox.current;
        setRows(next);
        markDirty();
    };
    const editRow = (rowId: string, change: (r: MapRow) => MapRow | null) =>
        updateRows((rows ?? []).flatMap(r => { if (r.id !== rowId) return [r]; const n = change(r); return n ? [n] : []; }));

    // Mise en avant de la rangée de départ (bouton « Défiler les écrans »)
    const focusedOnce = useRef(false);
    useEffect(() => {
        if (!map || focusedOnce.current || !initialSid || !activeRowId) return;
        const t = setTimeout(() => { mapRef.current?.focusRow(activeRowId); focusedOnce.current = true; }, 700);
        return () => clearTimeout(t);
    }, [map, initialSid, activeRowId]);

    // ─── Écrans de la rangée choisie ──────────────────────────
    const activeRow = rows?.find(r => r.id === activeRowId) ?? null;
    useEffect(() => {
        if (!activeRow) return;
        const names = new Set<string>();
        activeRow.sids.forEach(sid => rowsOf(sid).forEach(r => { if (r.outil && (enrOf(sid)[r.id]?.ecrans?.length ?? 0) > 0) names.add(r.outil); }));
        const missing = [...names].filter(n => !tools.has(n));
        if (missing.length === 0) return;
        Promise.all(missing.map(n => loadToolDetail(n).then(d => [n, d] as const).catch(() => [n, null] as const)))
            .then(entries => setTools(prev => new Map([...prev, ...entries])));
    }, [activeRow, rowsOf, enrOf, tools]);

    const cards: Card[] = useMemo(() => {
        if (!activeRow) return [];
        const list: Card[] = [];
        activeRow.sids.forEach((sid, index) => {
            const rows = rowsOf(sid), enr = enrOf(sid);
            const path = walkProcedure(rows, new Map());
            const onPath = new Set(path.map(r => r.id));
            let last: Card | null = null;
            [...path, ...rows.filter(r => !onPath.has(r.id))].forEach(row => {
                (enr[row.id]?.ecrans ?? []).forEach(id => {
                    const screen = row.outil ? tools.get(row.outil)?.screens.find(s => s.id === id) : undefined;
                    if (!screen) return;
                    if (last && last.screen.id === screen.id && last.offPath === !onPath.has(row.id)) { last.rows.push(row); return; }
                    last = { key: `${index}:${row.id}:${id}`, index, sid, rows: [row], screen, toolName: row.outil, offPath: !onPath.has(row.id) };
                    list.push(last);
                });
            });
        });
        return list;
    }, [activeRow, rowsOf, enrOf, tools]);

    const scrollToCard = (index: number, stepId: string) => {
        const card = cards.find(c => c.index === index && c.rows.some(r => r.id === stepId));
        const el = card && rightRef.current?.querySelector(`[data-card="${CSS.escape(card.key)}"]`);
        const box = rightRef.current;
        if (!el || !box) return;
        programmatic.current = true;
        box.scrollTo({ top: box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - 64, behavior: 'smooth' });
        setTimeout(() => { programmatic.current = false; }, 700);
    };

    const pending = useRef<ActiveStep | null>(null);
    const selectRow = (rowId: string) => {
        if (rowId === activeRowId) return;
        setActiveRowId(rowId);
        setActive(null);
        rightRef.current?.scrollTo({ top: 0 });
        if (!panelOpen) setPanelOpen(true);
    };
    const onStepClick = (step: ActiveStep) => {
        setActive(step);
        if (step.rowId !== activeRowId) { selectRow(step.rowId); setActive(step); pending.current = step; }
        else scrollToCard(step.index, step.stepId);
    };
    useEffect(() => {
        if (!pending.current || cards.length === 0) return;
        const s = pending.current;
        pending.current = null;
        setTimeout(() => scrollToCard(s.index, s.stepId), 80);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cards]);

    const onRightScroll = () => {
        if (programmatic.current || !rightRef.current || !activeRow) return;
        const top = rightRef.current.getBoundingClientRect().top + 90;
        let best: Card | null = null, dist = Infinity;
        cards.forEach(c => {
            const el = rightRef.current!.querySelector(`[data-card="${CSS.escape(c.key)}"]`);
            if (!el) return;
            const r = el.getBoundingClientRect();
            const d = r.bottom < top ? Infinity : Math.abs(r.top - top);
            if (d < dist) { dist = d; best = c; }
        });
        const b = best as Card | null;
        if (b && !(active?.rowId === activeRow.id && active.index === b.index && b.rows.some(r => r.id === active.stepId))) {
            const step = { rowId: activeRow.id, index: b.index, stepId: b.rows[0].id };
            setActive(step);
            mapRef.current?.focusStep(step);
        }
    };

    // ─── Barre de séparation ──────────────────────────────────
    const startResize = (e: React.PointerEvent) => {
        e.preventDefault();
        const startX = e.clientX, startW = panelWidth;
        const width = (ev: PointerEvent) => Math.max(300, Math.min(1000, startW + startX - ev.clientX));
        const move = (ev: PointerEvent) => setPanelWidth(width(ev));
        const up = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            try { localStorage.setItem(PANEL_KEY, String(width(ev))); } catch { /* facultatif */ }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { if (menu) setMenu(null); else if (zoom !== null) setZoom(null); else if (onClose) close(); }
            if (zoom !== null && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) setZoom(z => Math.max(0, Math.min((z ?? 0) + (e.key === 'ArrowRight' ? 1 : -1), cards.length - 1)));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoom, cards.length, onClose, menu]);

    // ─── Rendu ────────────────────────────────────────────────
    if (error && !procedures) return <div className="p-8 text-sm text-rose-600">{error}</div>;
    const zoomed = zoom !== null ? cards[zoom] : null;
    const linkBetween = (a: string, b: string) => links.find(l => l.source === a && l.target === b && l.type !== 'necessite');

    return (
        <div className={`${onClose ? 'fixed inset-0 z-[60]' : 'h-full'} flex flex-col bg-slate-50 min-w-0`}>

            {/* Barre */}
            <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3">
                <select value={themeId ?? ''} onChange={e => changeTheme(e.target.value)}
                    className="h-9 max-w-[320px] px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-800 bg-white">
                    {themes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.n})</option>)}
                </select>
                <span className="text-xs text-slate-500">{rows ? `${rows.length} enchaînement${rows.length > 1 ? 's' : ''} · ` : ''}{themeProcs.length} procédures</span>
                <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
                    <IconButton title="Dézoomer" onClick={() => mapRef.current?.zoom(1 / 1.25)}><ZoomOut className="w-4 h-4" /></IconButton>
                    <IconButton title="Zoomer" onClick={() => mapRef.current?.zoom(1.25)}><ZoomIn className="w-4 h-4" /></IconButton>
                    <IconButton title="Tout afficher" onClick={() => mapRef.current?.fit()}><Maximize className="w-4 h-4" /></IconButton>
                </div>
                <button type="button" onClick={() => { if (rows) updateRows(autoRows(mapProcs, themeLinks)); }}
                    title="Revenir aux enchaînements proposés à partir des liens (les modifications des rangées sont perdues)"
                    className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" />Proposer à nouveau
                </button>
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    {saveState === 'saved' && <><Check className="w-3.5 h-3.5" />Enregistré</>}
                    {saveState === 'saving' && <><Loader2 className="w-3.5 h-3.5 animate-spin" />Enregistrement…</>}
                    {saveState === 'dirty' && 'Enregistré en quittant la carte'}
                </span>
                <div className="flex-1" />
                <div className="hidden 2xl:flex items-center gap-3 text-[11px] text-slate-500">
                    {(Object.keys(LINK_COLORS) as LinkType[]).map(t => (
                        <span key={t} className="flex items-center gap-1.5">
                            <span className={`w-5 ${t === 'necessite' ? 'border-t-2 border-dotted' : 'border-t-[3px]'}`} style={{ borderColor: LINK_COLORS[t] }} />
                            {t === 'necessite' ? 'Nécessite (sous la procédure)' : LINK_LABELS[t].label}
                        </span>
                    ))}
                    <span className="flex items-center gap-1.5"><span className="w-5 border-t-[3px]" style={{ borderColor: THEN_COLOR }} />Puis</span>
                </div>
                <button type="button" onClick={() => setPanelOpen(o => !o)} title={panelOpen ? 'Masquer les écrans' : 'Afficher les écrans'}
                    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
                    {panelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                </button>
                {onClose && (
                    <button type="button" onClick={close} title="Fermer (Échap)" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="w-5 h-5" /></button>
                )}
            </div>

            <div className="flex-1 min-h-0 flex">
                {/* Carte : on la quitte en sortant de sa zone, la vue est alors enregistrée */}
                <div className="flex-1 min-w-0 bg-white" onMouseLeave={save}>
                    {map && rows ? (
                        <ProcessChainMap ref={mapRef} key={`${themeId}`} map={map} rows={rows} savedViewbox={viewbox.current}
                            screenCounts={screenCounts} activeRowId={activeRowId} activeStep={active}
                            onRowClick={selectRow} onStepClick={onStepClick}
                            onRowMenu={(rowId, anchor) => setMenu({ rowId, anchor, mode: 'menu' })}
                            onViewChange={markDirty} />
                    ) : (
                        <div className="h-full flex items-center justify-center gap-2 text-sm text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin" />Chargement des procédures du thème…
                        </div>
                    )}
                </div>

                {panelOpen && (
                    <>
                        <div onPointerDown={startResize} title="Glisser pour redimensionner"
                            className="w-1.5 flex-shrink-0 cursor-col-resize bg-slate-200 hover:bg-blue-400 transition-colors" />
                        <aside ref={rightRef} onScroll={onRightScroll} style={{ width: panelWidth }} className="flex-shrink-0 overflow-y-auto bg-white">
                            <div className="sticky top-0 z-10 px-4 py-2.5 bg-white/95 backdrop-blur border-b border-slate-100">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Écrans de l&apos;enchaînement</p>
                                <p className="text-sm font-semibold text-slate-800 truncate">
                                    {activeRow?.name ?? '—'} <span className="font-normal text-slate-400">· {cards.length} écran{cards.length > 1 ? 's' : ''}</span>
                                </p>
                            </div>
                            <div className="p-4">
                                {activeRow?.sids.map((sid, index) => {
                                    const own = cards.filter(c => c.index === index);
                                    const p = procOf.get(sid);
                                    const next = activeRow.sids[index + 1];
                                    const link = next ? linkBetween(sid, next) : undefined;
                                    return (
                                        <div key={`${index}-${sid}`}>
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">{index + 1}</span>
                                                <p className="min-w-0 text-sm font-semibold text-slate-800 leading-snug">
                                                    <span className="font-mono text-xs text-slate-400 mr-1">{p?.ref}</span>{p?.nom}
                                                </p>
                                            </div>
                                            <div className="space-y-2">
                                                {own.length === 0 && full.has(sid) && (
                                                    <p className="flex items-center gap-2 text-xs text-slate-400 pl-8"><MonitorOff className="w-3.5 h-3.5" />Aucun écran rattaché.</p>
                                                )}
                                                {own.map((c, k) => {
                                                    const isActive = active?.rowId === activeRow.id && active.index === index && c.rows.some(r => r.id === active.stepId);
                                                    return (
                                                        <div key={c.key}>
                                                            {k > 0 && <div className="flex justify-center text-slate-300 py-0.5"><ArrowDownToLine className="w-4 h-4" /></div>}
                                                            <div data-card={c.key} role="button" tabIndex={0}
                                                                onClick={() => {
                                                                    if (isActive) return setZoom(cards.indexOf(c));
                                                                    const step = { rowId: activeRow.id, index, stepId: c.rows[0].id };
                                                                    setActive(step);
                                                                    mapRef.current?.focusStep(step);
                                                                }}
                                                                className={`rounded-xl border overflow-hidden cursor-pointer transition-shadow ${isActive ? 'border-blue-500 ring-2 ring-blue-500/25 shadow-md' : 'border-slate-200 hover:shadow-md'}`}>
                                                                <div className="px-3.5 py-2 border-b border-slate-100 bg-slate-50/70">
                                                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                                                                        {[...new Set(c.rows.map(r => r.acteur).filter(Boolean))].join(', ')}{c.offPath ? ' · autre branche' : ''}
                                                                    </p>
                                                                    <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{c.rows.map(r => r.étape).join(' · ')}</p>
                                                                </div>
                                                                <ScreenFrame screen={c.screen} css={tools.get(c.toolName)?.tool.design_css} toolName={c.toolName} cropHeight={800} />
                                                                <p className="px-3.5 py-1.5 text-xs text-slate-500 truncate">{c.screen.name}{isActive ? ' · cliquer pour agrandir' : ''}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {next && (
                                                <div className="my-4 flex items-center gap-2 text-xs font-semibold" style={{ color: link ? LINK_COLORS[link.type] : THEN_COLOR }}>
                                                    <span className="flex-1 border-t-2" style={{ borderColor: 'currentColor' }} />
                                                    <ArrowDown className="w-4 h-4" />{link ? LINK_LABELS[link.type].label : 'Puis'}
                                                    <span className="flex-1 border-t-2" style={{ borderColor: 'currentColor' }} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </aside>
                    </>
                )}
            </div>

            {/* Menu « ⋯ » d'une rangée */}
            {menu && rows && (() => {
                const row = rows.find(r => r.id === menu.rowId);
                if (!row) return null;
                const left = Math.min(menu.anchor.left, window.innerWidth - 340);
                const top = Math.min(menu.anchor.bottom + 6, window.innerHeight - 420);
                return (
                    <div className="fixed inset-0 z-[75]" onClick={() => setMenu(null)}>
                        <div className="absolute w-[320px] rounded-xl bg-white border border-slate-200 shadow-xl" style={{ left, top }} onClick={e => e.stopPropagation()}>
                            <div className="px-3.5 py-2.5 border-b border-slate-100">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Enchaînement</p>
                                <p className="text-sm font-semibold text-slate-800 truncate">{row.name}</p>
                            </div>
                            {menu.mode === 'menu' && (
                                <div className="p-1.5">
                                    <MenuItem icon={<ListOrdered className="w-4 h-4" />} onClick={() => setMenu({ ...menu, mode: 'reorder' })}>Réordonner les procédures</MenuItem>
                                    <MenuItem icon={<Plus className="w-4 h-4" />} onClick={() => setMenu({ ...menu, mode: 'add' })}>Ajouter une procédure</MenuItem>
                                    <MenuItem icon={<Pencil className="w-4 h-4" />} onClick={() => setMenu({ ...menu, mode: 'rename' })}>Renommer</MenuItem>
                                    <MenuItem icon={<Trash2 className="w-4 h-4" />} danger onClick={() => { editRow(row.id, () => null); setMenu(null); }}>Supprimer l&apos;enchaînement</MenuItem>
                                </div>
                            )}
                            {menu.mode === 'reorder' && (
                                <div className="p-2 space-y-1 max-h-[340px] overflow-y-auto">
                                    {row.sids.map((sid, i) => (
                                        <div key={`${sid}-${i}`} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-50">
                                            <span className="w-5 text-[11px] font-bold text-slate-400">{i + 1}</span>
                                            <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">
                                                <span className="font-mono text-[11px] text-slate-400 mr-1">{procOf.get(sid)?.ref}</span>{procOf.get(sid)?.nom}
                                            </span>
                                            <SmallButton title="Monter" disabled={i === 0} onClick={() => editRow(row.id, r => { const s = [...r.sids]; [s[i - 1], s[i]] = [s[i], s[i - 1]]; return { ...r, sids: s }; })}><ArrowUp className="w-3.5 h-3.5" /></SmallButton>
                                            <SmallButton title="Descendre" disabled={i === row.sids.length - 1} onClick={() => editRow(row.id, r => { const s = [...r.sids]; [s[i + 1], s[i]] = [s[i], s[i + 1]]; return { ...r, sids: s }; })}><ArrowDown className="w-3.5 h-3.5" /></SmallButton>
                                            <SmallButton title="Retirer de l'enchaînement" onClick={() => editRow(row.id, r => ({ ...r, sids: r.sids.filter((_, k) => k !== i) }))}><X className="w-3.5 h-3.5" /></SmallButton>
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setMenu(null)} className="mt-1 w-full h-8 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">Terminé</button>
                                </div>
                            )}
                            {menu.mode === 'add' && (
                                <AddProcedure procedures={themeProcs} onPick={sid => { editRow(row.id, r => ({ ...r, sids: [...r.sids, sid] })); setMenu({ ...menu, mode: 'reorder' }); }} />
                            )}
                            {menu.mode === 'rename' && (
                                <form className="p-3 flex gap-2" onSubmit={e => {
                                    e.preventDefault();
                                    const name = String(new FormData(e.currentTarget).get('name') || '').trim();
                                    if (name) editRow(row.id, r => ({ ...r, name }));
                                    setMenu(null);
                                }}>
                                    <input name="name" defaultValue={row.name} autoFocus className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400" />
                                    <button type="submit" className="h-9 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold">OK</button>
                                </form>
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* Écran en grand */}
            {zoomed && (
                <div className="fixed inset-0 z-[70] bg-slate-900/70 flex flex-col" onClick={() => setZoom(null)}>
                    <div className="h-14 flex-shrink-0 px-5 flex items-center gap-3 text-white" onClick={e => e.stopPropagation()}>
                        <div className="min-w-0">
                            <p className="text-xs text-slate-300 truncate">{procOf.get(zoomed.sid)?.ref} · {procOf.get(zoomed.sid)?.nom}</p>
                            <p className="text-sm font-semibold truncate">{zoomed.rows.map(r => r.étape).join(' · ')}</p>
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

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" title={title} onClick={onClick} className="h-9 w-9 flex items-center justify-center text-slate-600 hover:bg-slate-50 border-r last:border-r-0 border-slate-200">
            {children}
        </button>
    );
}

function MenuItem({ icon, onClick, danger, children }: { icon: React.ReactNode; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left ${danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'}`}>
            {icon}{children}
        </button>
    );
}

function SmallButton({ title, disabled, onClick, children }: { title: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" title={title} disabled={disabled} onClick={onClick}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-800 disabled:opacity-30">
            {children}
        </button>
    );
}

function AddProcedure({ procedures, onPick }: { procedures: Procedure[]; onPick: (sid: string) => void }) {
    const [q, setQ] = useState('');
    const list = procedures
        .filter(p => !q.trim() || `${p.ref} ${p.nom}`.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => (a.ref || a.nom).localeCompare(b.ref || b.nom));
    return (
        <div className="p-2">
            <div className="flex items-center gap-2 px-2.5 h-9 rounded-lg border border-slate-200 focus-within:border-blue-400">
                <Search className="w-4 h-4 text-slate-400" />
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Procédure à ajouter à la fin" className="flex-1 min-w-0 text-sm outline-none" />
            </div>
            <div className="mt-1.5 max-h-[300px] overflow-y-auto">
                {list.map(p => (
                    <button key={p.id} type="button" onClick={() => onPick(p.session_id)}
                        className="w-full text-left px-2.5 py-1.5 rounded-md text-sm text-slate-700 hover:bg-slate-50 flex gap-2">
                        <span className="font-mono text-[11px] text-slate-400 w-16 flex-shrink-0 pt-0.5">{p.ref}</span>
                        <span className="flex-1 min-w-0">{p.nom}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

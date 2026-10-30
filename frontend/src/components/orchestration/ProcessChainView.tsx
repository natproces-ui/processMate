'use client';

// components/orchestration/ProcessChainView.tsx
//
// « Enchaînement des process » d'un thème : toutes ses procédures sur une carte BPMN
// (ProcessChainMap), regroupées par catégorie et reliées par leurs liens, avec à droite les
// écrans de la procédure sélectionnée. Cliquer une étape amène à son écran ; faire défiler les
// écrans surligne l'étape sur la carte. La disposition (positions, tailles, vue) est propre au
// thème et enregistrée automatiquement quand l'utilisateur quitte la carte.
// Sert à Analyse > Enchaînement des process et au bouton « Défiler les écrans » (onClose).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, X, ZoomIn, ZoomOut, Maximize, LayoutGrid, PanelRightClose, PanelRightOpen, ChevronLeft, ChevronRight, MonitorOff, Check } from 'lucide-react';
import type { Table1Row } from '@/logic/types';
import type { TaskEnrichment } from '@/logic/bpmnTypes';
import { orchestrationApi, type Procedure } from '@/lib/orchestrationApi';
import { taxonomyApi, type ProcessMapLayout, type TaxonomyFlat } from '@/lib/taxonomyApi';
import type { ToolDetail, ToolScreen } from '@/lib/toolsApi';
import { LINK_LABELS, type LinkType } from '@/lib/processLinks';
import { walkProcedure } from '@/lib/screenFlow';
import { buildProcessMap, LINK_COLORS, type MapLink } from '@/lib/processMapXml';
import { loadToolDetail } from '@/components/orchestration/StepScreensPicker';
import ScreenFrame from '@/components/orchestration/ScreenFrame';
import type { ProcessChainMapHandle } from '@/components/orchestration/ProcessChainMap';

const ProcessChainMap = dynamic(() => import('@/components/orchestration/ProcessChainMap'), { ssr: false });

const PANEL_KEY = 'pm.processChain.panelWidth';
const THEME_KEY = 'pm.processChain.theme';

interface Card { key: string; rows: Table1Row[]; screen: ToolScreen; toolName: string; offPath: boolean }

interface Props {
    /** Procédure mise en avant au départ (id de version) : son thème, ses écrans. */
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
    const [failed, setFailed] = useState<Set<string>>(new Set()); // procédures illisibles : affichées sans leur BPMN
    const [layout, setLayout] = useState<ProcessMapLayout | null | undefined>(undefined); // undefined = en chargement
    const [resetKey, setResetKey] = useState(0);
    const [focusSid, setFocusSid] = useState<string | null>(null);
    const [active, setActive] = useState<{ sid: string; stepId: string } | null>(null);
    const [tools, setTools] = useState<Map<string, ToolDetail | null>>(new Map());
    const [zoom, setZoom] = useState<number | null>(null);
    const [panelWidth, setPanelWidth] = useState(460);
    const [panelOpen, setPanelOpen] = useState(true);
    const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved');
    const mapRef = useRef<ProcessChainMapHandle>(null);
    const rightRef = useRef<HTMLDivElement>(null);
    const dirty = useRef(false);
    const programmatic = useRef(false);

    useEffect(() => {
        try { const w = Number(localStorage.getItem(PANEL_KEY)); if (w >= 300 && w <= 1000) setPanelWidth(w); } catch { /* préférence locale facultative */ }
        Promise.all([orchestrationApi.listProcedures(), taxonomyApi.getFlat(), orchestrationApi.getAllLinks()])
            .then(([p, t, l]) => { setProcedures(p.procedures); setNodes(t.nodes); setLinks(l.edges); })
            .catch(e => setError(e.message || 'Chargement impossible'));
    }, []);

    // Thème et catégorie de chaque procédure (taxonomie : thème → catégorie → sous-catégorie)
    const byNode = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
    const ancestry = useCallback((nodeId: string | null | undefined) => {
        const chain: TaxonomyFlat[] = [];
        for (let n = nodeId ? byNode.get(nodeId) : undefined; n; n = n.parent_id ? byNode.get(n.parent_id) : undefined) chain.push(n);
        return { theme: chain.find(n => n.level === 'theme'), category: chain.find(n => n.level === 'category') };
    }, [byNode]);
    const themes = useMemo(() => {
        const count = new Map<string, number>();
        (procedures ?? []).forEach(p => { const t = ancestry(p.taxonomy_id).theme; if (t) count.set(t.id, (count.get(t.id) || 0) + 1); });
        return [...count.entries()].map(([id, n]) => ({ id, name: byNode.get(id)!.name, n })).sort((a, b) => a.name.localeCompare(b.name));
    }, [procedures, ancestry, byNode]);

    useEffect(() => {
        if (themeId || !procedures || themes.length === 0) return;
        // Thème de la procédure de départ, sinon le dernier consulté, sinon celui qui a le plus de liens
        const initial = initialWorkflowId && procedures.find(p => p.id === initialWorkflowId);
        const t = initial && ancestry(initial.taxonomy_id).theme;
        let last: string | null = null;
        try { last = localStorage.getItem(THEME_KEY); } catch { /* préférence locale facultative */ }
        const linksPerTheme = new Map<string, number>();
        const themeOfSid = new Map(procedures.map(p => [p.session_id, ancestry(p.taxonomy_id).theme?.id]));
        links.forEach(l => { const id = themeOfSid.get(l.source); if (id) linksPerTheme.set(id, (linksPerTheme.get(id) || 0) + 1); });
        const mostLinked = [...themes].sort((a, b) => (linksPerTheme.get(b.id) || 0) - (linksPerTheme.get(a.id) || 0))[0].id;
        setThemeId(t ? t.id : last && themes.some(x => x.id === last) ? last : mostLinked);
        if (initial) setFocusSid(initial.session_id);
    }, [themeId, procedures, themes, initialWorkflowId, ancestry, links]);

    useEffect(() => { if (themeId) try { localStorage.setItem(THEME_KEY, themeId); } catch { /* facultatif */ } }, [themeId]);

    const themeProcs = useMemo(() => (procedures ?? []).filter(p => themeId && ancestry(p.taxonomy_id).theme?.id === themeId), [procedures, themeId, ancestry]);

    // Contenu des procédures du thème et disposition enregistrée
    useEffect(() => {
        if (!themeId) return;
        let cancelled = false;
        setLayout(undefined);
        taxonomyApi.getMap(themeId).then(r => { if (!cancelled) setLayout(r.layout); }).catch(() => { if (!cancelled) setLayout(null); });
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

    const map = useMemo(() => {
        if (!allLoaded || layout === undefined) return null;
        const sids = new Set(themeProcs.map(p => p.session_id));
        return buildProcessMap(
            themeProcs.map(p => {
                const c = ancestry(p.taxonomy_id).category;
                return { sid: p.session_id, name: p.nom, ref: p.ref, rows: rowsOf(p.session_id), cluster: c ? c.name : 'Sans catégorie' };
            }),
            links.filter(l => sids.has(l.source) && sids.has(l.target)),
            resetKey > 0 ? undefined : layout?.pools,
        );
        // resetKey : « Réorganiser » repart de la disposition par catégorie
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allLoaded, layout, themeProcs, links, resetKey]);

    const screenCounts = useMemo(() => {
        const m = new Map<string, Map<string, number>>();
        themeProcs.forEach(p => {
            const per = new Map<string, number>();
            Object.entries(enrOf(p.session_id)).forEach(([id, e]) => { const n = e?.ecrans?.length ?? 0; if (n) per.set(id, n); });
            m.set(p.session_id, per);
        });
        return m;
    }, [themeProcs, enrOf]);

    // ─── Enregistrement de la disposition en quittant ─────────
    const save = useCallback(() => {
        if (!dirty.current || !themeId) return;
        const snap = mapRef.current?.snapshot();
        if (!snap) return;
        dirty.current = false;
        setSaveState('saving');
        taxonomyApi.saveMap(themeId, snap)
            .then(r => setSaveState(r.ok ? 'saved' : 'dirty'))
            .catch(() => { dirty.current = true; setSaveState('dirty'); });
    }, [themeId]);
    const saveRef = useRef(save);
    saveRef.current = save;
    useEffect(() => {
        const onHide = () => { if (document.visibilityState === 'hidden') saveRef.current(); };
        const onLeave = () => saveRef.current();
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('pagehide', onLeave);
        return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onLeave); saveRef.current(); };
    }, []);
    const onMapChange = useCallback(() => { dirty.current = true; setSaveState('dirty'); }, []);

    const changeTheme = (id: string) => { save(); setThemeId(id); setFocusSid(null); setActive(null); setResetKey(0); };
    const close = () => { save(); onClose?.(); };

    // Mise en avant de la procédure de départ, une fois la carte prête
    const focusedOnce = useRef(false);
    useEffect(() => {
        if (!map || focusedOnce.current || !focusSid) return;
        const t = setTimeout(() => { mapRef.current?.focusPool(focusSid); focusedOnce.current = true; }, 600);
        return () => clearTimeout(t);
    }, [map, focusSid]);

    // ─── Écrans de la procédure sélectionnée ──────────────────
    useEffect(() => {
        if (!focusSid) return;
        const names = [...new Set(rowsOf(focusSid).filter(r => r.outil && (enrOf(focusSid)[r.id]?.ecrans?.length ?? 0) > 0).map(r => r.outil))].filter(n => !tools.has(n));
        if (names.length === 0) return;
        Promise.all(names.map(n => loadToolDetail(n).then(d => [n, d] as const).catch(() => [n, null] as const)))
            .then(entries => setTools(prev => new Map([...prev, ...entries])));
    }, [focusSid, rowsOf, enrOf, tools]);

    const cards: Card[] = useMemo(() => {
        if (!focusSid) return [];
        const rows = rowsOf(focusSid), enr = enrOf(focusSid);
        const path = walkProcedure(rows, new Map());
        const onPath = new Set(path.map(r => r.id));
        const list: Card[] = [];
        let last: Card | null = null;
        [...path, ...rows.filter(r => !onPath.has(r.id))].forEach(row => {
            (enr[row.id]?.ecrans ?? []).forEach(id => {
                const screen = row.outil ? tools.get(row.outil)?.screens.find(s => s.id === id) : undefined;
                if (!screen) return;
                if (last && last.screen.id === screen.id && last.offPath === !onPath.has(row.id)) { last.rows.push(row); return; }
                last = { key: `${row.id}:${id}`, rows: [row], screen, toolName: row.outil, offPath: !onPath.has(row.id) };
                list.push(last);
            });
        });
        return list;
    }, [focusSid, rowsOf, enrOf, tools]);

    const scrollToCard = (stepId: string) => {
        const card = cards.find(c => c.rows.some(r => r.id === stepId));
        const el = card && rightRef.current?.querySelector(`[data-card="${CSS.escape(card.key)}"]`);
        const box = rightRef.current;
        if (!el || !box) return;
        programmatic.current = true;
        box.scrollTo({ top: box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - 64, behavior: 'smooth' });
        setTimeout(() => { programmatic.current = false; }, 700);
    };

    const pendingStep = useRef<string | null>(null);
    const onStepClick = (sid: string, stepId: string) => {
        setActive({ sid, stepId });
        if (sid !== focusSid) { setFocusSid(sid); pendingStep.current = stepId; if (!panelOpen) setPanelOpen(true); }
        else scrollToCard(stepId);
    };
    useEffect(() => {
        if (!pendingStep.current || cards.length === 0) return;
        const s = pendingStep.current;
        pendingStep.current = null;
        setTimeout(() => scrollToCard(s), 80);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cards]);

    const onRightScroll = () => {
        if (programmatic.current || !rightRef.current || !focusSid) return;
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
        if (b && !(active?.sid === focusSid && b.rows.some(r => r.id === active.stepId))) {
            setActive({ sid: focusSid, stepId: b.rows[0].id });
            mapRef.current?.focusStep(focusSid, b.rows[0].id);
        }
    };

    // ─── Barre de séparation ──────────────────────────────────
    const startResize = (e: React.PointerEvent) => {
        e.preventDefault();
        const startX = e.clientX, startW = panelWidth;
        const move = (ev: PointerEvent) => setPanelWidth(Math.max(300, Math.min(1000, startW + startX - ev.clientX)));
        const up = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            try { localStorage.setItem(PANEL_KEY, String(Math.max(300, Math.min(1000, startW + startX - ev.clientX)))); } catch { /* facultatif */ }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { if (zoom !== null) setZoom(null); else if (onClose) close(); }
            if (zoom !== null && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) setZoom(z => Math.max(0, Math.min((z ?? 0) + (e.key === 'ArrowRight' ? 1 : -1), cards.length - 1)));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoom, cards.length, onClose]);

    // ─── Rendu ────────────────────────────────────────────────
    if (error && !procedures) return <div className="p-8 text-sm text-rose-600">{error}</div>;
    const focus = focusSid ? themeProcs.find(p => p.session_id === focusSid) : null;
    const zoomed = zoom !== null ? cards[zoom] : null;
    const noSteps = themeProcs.filter(p => full.has(p.session_id) && rowsOf(p.session_id).length === 0).length;

    return (
        <div className={`${onClose ? 'fixed inset-0 z-[60]' : 'h-full'} flex flex-col bg-slate-50 min-w-0`}>

            {/* Barre */}
            <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3">
                <select value={themeId ?? ''} onChange={e => changeTheme(e.target.value)}
                    className="h-9 max-w-[320px] px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-800 bg-white">
                    {themes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.n})</option>)}
                </select>
                <span className="text-xs text-slate-500">
                    {themeProcs.length} procédure{themeProcs.length > 1 ? 's' : ''}{noSteps ? ` · ${noSteps} sans étapes` : ''}
                </span>
                <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
                    <IconButton title="Dézoomer" onClick={() => mapRef.current?.zoom(1 / 1.25)}><ZoomOut className="w-4 h-4" /></IconButton>
                    <IconButton title="Zoomer" onClick={() => mapRef.current?.zoom(1.25)}><ZoomIn className="w-4 h-4" /></IconButton>
                    <IconButton title="Tout afficher" onClick={() => mapRef.current?.fit()}><Maximize className="w-4 h-4" /></IconButton>
                </div>
                <button type="button" onClick={() => { dirty.current = true; setResetKey(k => k + 1); }}
                    title="Ranger les procédures par catégorie (la disposition actuelle est remplacée)"
                    className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
                    <LayoutGrid className="w-3.5 h-3.5" />Réorganiser
                </button>
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    {saveState === 'saved' && <><Check className="w-3.5 h-3.5" />Disposition enregistrée</>}
                    {saveState === 'saving' && <><Loader2 className="w-3.5 h-3.5 animate-spin" />Enregistrement…</>}
                    {saveState === 'dirty' && 'Enregistrée en quittant la carte'}
                </span>
                <div className="flex-1" />
                <div className="hidden 2xl:flex items-center gap-3 text-[11px] text-slate-500">
                    {(Object.keys(LINK_COLORS) as LinkType[]).map(t => (
                        <span key={t} className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: LINK_COLORS[t] }} />{LINK_LABELS[t].label}</span>
                    ))}
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
                {/* Carte : on quitte la carte en sortant de sa zone, la disposition est alors enregistrée */}
                <div className="flex-1 min-w-0 bg-white" onMouseLeave={save}>
                    {map ? (
                        <ProcessChainMap ref={mapRef} key={`${themeId}-${resetKey}`} map={map}
                            savedPools={resetKey > 0 ? undefined : layout?.pools ?? undefined}
                            savedViewbox={resetKey > 0 ? undefined : layout?.viewbox ?? undefined}
                            screenCounts={screenCounts} activeStep={active} focusSid={focusSid}
                            onStepClick={onStepClick}
                            onPoolClick={sid => { setFocusSid(sid); if (!panelOpen) setPanelOpen(true); }}
                            onChange={onMapChange} />
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
                        <aside ref={rightRef} onScroll={onRightScroll} style={{ width: panelWidth }}
                            className="flex-shrink-0 overflow-y-auto bg-white">
                            <div className="sticky top-0 z-10 px-4 py-2.5 bg-white/95 backdrop-blur border-b border-slate-100">
                                {focus ? (
                                    <>
                                        <p className="text-[11px] font-mono text-slate-400">{focus.ref} · {ancestry(focus.taxonomy_id).category?.name}</p>
                                        <p className="text-sm font-semibold text-slate-800 truncate">{focus.nom} <span className="font-normal text-slate-400">· {cards.length} écran{cards.length > 1 ? 's' : ''}</span></p>
                                    </>
                                ) : <p className="text-sm text-slate-500">Cliquez une procédure ou une étape pour voir ses écrans.</p>}
                            </div>
                            <div className="p-4 space-y-4">
                                {focus && cards.length === 0 && full.has(focus.session_id) && (
                                    <p className="flex items-center gap-2 text-sm text-slate-400"><MonitorOff className="w-4 h-4" />Aucun écran rattaché à ses étapes.</p>
                                )}
                                {cards.map((c, i) => {
                                    const isActive = active?.sid === focusSid && c.rows.some(r => r.id === active.stepId);
                                    return (
                                        <div key={c.key} data-card={c.key} role="button" tabIndex={0}
                                            onClick={() => {
                                                if (isActive) return setZoom(i);
                                                setActive({ sid: focusSid!, stepId: c.rows[0].id });
                                                mapRef.current?.focusStep(focusSid!, c.rows[0].id);
                                            }}
                                            className={`group rounded-xl border overflow-hidden cursor-pointer transition-shadow ${isActive ? 'border-blue-500 ring-2 ring-blue-500/25 shadow-md' : 'border-slate-200 hover:shadow-md'}`}>
                                            <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/70">
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                                                    {[...new Set(c.rows.map(r => r.acteur).filter(Boolean))].join(', ')}{c.offPath ? ' · autre branche' : ''}
                                                </p>
                                                <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{c.rows.map(r => r.étape).join(' · ')}</p>
                                            </div>
                                            <ScreenFrame screen={c.screen} css={tools.get(c.toolName)?.tool.design_css} toolName={c.toolName} cropHeight={800} />
                                            <p className="px-3.5 py-2 text-xs text-slate-500 truncate">{c.screen.name} · {c.toolName}{isActive ? ' · cliquer pour agrandir' : ''}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </aside>
                    </>
                )}
            </div>

            {/* Écran en grand */}
            {zoomed && (
                <div className="fixed inset-0 z-[70] bg-slate-900/70 flex flex-col" onClick={() => setZoom(null)}>
                    <div className="h-14 flex-shrink-0 px-5 flex items-center gap-3 text-white" onClick={e => e.stopPropagation()}>
                        <div className="min-w-0">
                            <p className="text-xs text-slate-300 truncate">{focus?.ref} · {focus?.nom}</p>
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

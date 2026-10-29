'use client';

// components/orchestration/ScreenFlow.tsx
//
// Défilement des écrans d'une procédure : son BPMN en haut, ses écrans en dessous, enchaînés
// comme ses étapes. Les étapes sans écran restent visibles comme des « creux », les décisions
// et les liens vers d'autres process s'intercalent là où ils se produisent. Cliquer une étape
// du BPMN amène à son écran (en suivant sa branche) ; faire défiler les écrans surligne l'étape
// dans le BPMN. Un lien ouvre l'autre process à la place, avec un fil d'Ariane pour revenir.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { X, ChevronRight, ChevronLeft, Loader2, Play, Maximize2, GitFork, MonitorOff, ArrowRight } from 'lucide-react';
import type { Table1Row } from '@/logic/types';
import type { TaskEnrichment } from '@/logic/bpmnTypes';
import { orchestrationApi, type Procedure } from '@/lib/orchestrationApi';
import type { ToolDetail, ToolScreen } from '@/lib/toolsApi';
import { LINK_LABELS, type ResolvedLink } from '@/lib/processLinks';
import { buildFlowUnits, choicesToReach, walkProcedure, type Choices, type FlowUnit } from '@/lib/screenFlow';
import { loadToolDetail } from '@/components/orchestration/StepScreensPicker';
import ScreenFrame from '@/components/orchestration/ScreenFrame';

const StepFlowViewer = dynamic(() => import('@/components/orchestration/StepFlowViewer'), { ssr: false });

type Unit = FlowUnit<ToolScreen>;

interface Frame {
    procedure: Procedure;
    rows: Table1Row[];
    enrichments: Record<string, TaskEnrichment>;
    links: ResolvedLink[] | null;
    choices: Choices;
    activeStepId: string | null;
}

function makeFrame(procedure: Procedure): Frame {
    return {
        procedure,
        rows: ((procedure as any).workflow_json || []) as Table1Row[],
        enrichments: (procedure.enrichments_json || {}) as Record<string, TaskEnrichment>,
        links: null,
        choices: new Map(),
        activeStepId: null,
    };
}

interface Props {
    procedure: Procedure;
    onClose: () => void;
}

export default function ScreenFlow({ procedure, onClose }: Props) {
    const [frames, setFrames] = useState<Frame[]>(() => [makeFrame(procedure)]);
    const [tools, setTools] = useState<Map<string, ToolDetail | null>>(new Map());
    const [zoom, setZoom] = useState<number | null>(null); // index dans screenUnits
    const [opening, setOpening] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const stripRef = useRef<HTMLDivElement>(null);
    const unitRefs = useRef(new Map<string, HTMLDivElement>());
    const pendingScroll = useRef<string | null>(null);
    const programmatic = useRef(false);

    const frame = frames[frames.length - 1];
    const updateFrame = useCallback((patch: Partial<Frame>) =>
        setFrames(fs => fs.map((f, i) => i === fs.length - 1 ? { ...f, ...patch } : f)), []);

    // Liens de la procédure affichée
    const frameId = frame.procedure.id;
    useEffect(() => {
        if (frame.links || !frameId) { if (!frameId) updateFrame({ links: [] }); return; }
        let cancelled = false;
        orchestrationApi.getProcedureLinks(frameId)
            .then(res => { if (!cancelled) updateFrame({ links: res.sortants }); })
            .catch(() => { if (!cancelled) updateFrame({ links: [] }); });
        return () => { cancelled = true; };
    }, [frameId, frame.links, updateFrame]);

    // Applicatifs (charte + écrans) des étapes qui ont des écrans
    useEffect(() => {
        const names = [...new Set(frame.rows.filter(r => r.outil && (frame.enrichments[r.id]?.ecrans?.length ?? 0) > 0).map(r => r.outil))]
            .filter(n => !tools.has(n));
        if (names.length === 0) return;
        let cancelled = false;
        Promise.all(names.map(n => loadToolDetail(n).then(d => [n, d] as const).catch(() => [n, null] as const)))
            .then(entries => { if (!cancelled) setTools(prev => new Map([...prev, ...entries])); });
        return () => { cancelled = true; };
    }, [frame.rows, frame.enrichments, tools]);

    const toolsReady = frame.rows.every(r => !r.outil || !(frame.enrichments[r.id]?.ecrans?.length) || tools.has(r.outil));

    const path = useMemo(() => walkProcedure(frame.rows, frame.choices), [frame.rows, frame.choices]);
    const pathIds = useMemo(() => new Set(path.map(r => r.id)), [path]);
    const units: Unit[] = useMemo(() => buildFlowUnits(path, frame.enrichments, frame.links ?? [], frame.choices,
        (toolName, id) => tools.get(toolName)?.screens.find(s => s.id === id)), [path, frame.enrichments, frame.links, frame.choices, tools]);
    const screenUnits = useMemo(() => units.filter((u): u is Extract<Unit, { kind: 'screen' }> => u.kind === 'screen'), [units]);
    const stepNumber = useMemo(() => new Map(path.map((r, i) => [r.id, i + 1])), [path]);
    const screenCounts = useMemo(() => {
        const m = new Map<string, number>();
        frame.rows.forEach(r => { const n = frame.enrichments[r.id]?.ecrans?.length ?? 0; if (n) m.set(r.id, n); });
        return m;
    }, [frame.rows, frame.enrichments]);

    const unitOfStep = useCallback((stepId: string) =>
        units.find(u => u.kind === 'screen' && u.rows.some(r => r.id === stepId))
        ?? units.find(u => ('rows' in u ? u.rows.some(r => r.id === stepId) : u.row.id === stepId)), [units]);

    const scrollToUnit = useCallback((key: string) => {
        const el = unitRefs.current.get(key);
        if (!el) return;
        programmatic.current = true;
        el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        setTimeout(() => { programmatic.current = false; }, 700);
    }, []);

    // Désigner une étape (BPMN, creux, décision) : sa branche est suivie, puis on va à son écran
    const selectStep = useCallback((stepId: string) => {
        if (!pathIds.has(stepId)) {
            pendingScroll.current = stepId;
            updateFrame({ choices: choicesToReach(frame.rows, stepId, frame.choices), activeStepId: stepId });
            return;
        }
        updateFrame({ activeStepId: stepId });
        const u = unitOfStep(stepId);
        if (u) scrollToUnit(u.key);
    }, [pathIds, frame.rows, frame.choices, updateFrame, unitOfStep, scrollToUnit]);

    useEffect(() => {
        const id = pendingScroll.current;
        if (!id) return;
        const u = unitOfStep(id);
        if (u) { pendingScroll.current = null; setTimeout(() => scrollToUnit(u.key), 50); }
    }, [units, unitOfStep, scrollToUnit]);

    // Au départ : premier écran
    useEffect(() => {
        if (!frame.activeStepId && screenUnits[0]) updateFrame({ activeStepId: screenUnits[0].rows[0].id });
    }, [frame.activeStepId, screenUnits, updateFrame]);

    // Faire défiler : l'écran au centre devient l'étape affichée
    const onScroll = useCallback(() => {
        if (programmatic.current) return;
        const strip = stripRef.current;
        if (!strip) return;
        const center = strip.scrollLeft + strip.clientWidth / 2;
        let best: Unit | null = null, dist = Infinity;
        screenUnits.forEach(u => {
            const el = unitRefs.current.get(u.key);
            if (!el) return;
            const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center);
            if (d < dist) { dist = d; best = u; }
        });
        const b = best as Unit | null;
        if (b && b.kind === 'screen' && !b.rows.some(r => r.id === frame.activeStepId)) updateFrame({ activeStepId: b.rows[0].id });
    }, [screenUnits, frame.activeStepId, updateFrame]);

    const activeScreenIndex = screenUnits.findIndex(u => u.rows.some(r => r.id === frame.activeStepId));
    const goScreen = useCallback((i: number) => {
        const u = screenUnits[Math.max(0, Math.min(i, screenUnits.length - 1))];
        if (!u) return;
        updateFrame({ activeStepId: u.rows[0].id });
        scrollToUnit(u.key);
    }, [screenUnits, updateFrame, scrollToUnit]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { if (zoom !== null) setZoom(null); else onClose(); return; }
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const delta = e.key === 'ArrowRight' ? 1 : -1;
            if (zoom !== null) setZoom(z => Math.max(0, Math.min((z ?? 0) + delta, screenUnits.length - 1)));
            else goScreen((activeScreenIndex < 0 ? 0 : activeScreenIndex) + delta);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [zoom, onClose, goScreen, activeScreenIndex, screenUnits.length]);

    const openLink = async (link: ResolvedLink) => {
        if (!link.workflow_id) return;
        setOpening(link.session_id);
        setError(null);
        try {
            const res = await orchestrationApi.getProcedure(link.workflow_id);
            setFrames(fs => [...fs, makeFrame(res.procedure)]);
            stripRef.current?.scrollTo({ left: 0 });
        } catch (e: any) {
            setError(`Impossible d'ouvrir « ${link.nom} » : ${e.message || 'erreur'}`);
        } finally {
            setOpening(null);
        }
    };

    const backTo = (level: number) => { setFrames(fs => fs.slice(0, level + 1)); setZoom(null); };
    const parent = frames.length > 1 ? frames[frames.length - 2] : null;

    // ─── Rendu ────────────────────────────────────────────────
    const zoomed = zoom !== null ? screenUnits[zoom] : null;

    return (
        <div className="fixed inset-0 z-[60] flex flex-col bg-slate-50">

            {/* En-tête : fil des process ouverts */}
            <header className="h-14 flex-shrink-0 bg-white border-b border-slate-200 px-5 flex items-center gap-4">
                <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Play className="w-4 h-4" fill="currentColor" />
                </span>
                <nav className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto text-sm">
                    {frames.map((f, i) => {
                        const last = i === frames.length - 1;
                        return (
                            <span key={`${f.procedure.id}-${i}`} className="flex items-center gap-1 flex-shrink-0">
                                {i > 0 && <ChevronRight className="w-4 h-4 text-slate-300" />}
                                <button type="button" disabled={last} onClick={() => backTo(i)}
                                    className={`px-2 py-1 rounded-md truncate ${last ? 'max-w-[520px] font-semibold text-slate-900 cursor-default' : 'max-w-[240px] text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
                                    {f.procedure.ref && <span className="font-mono text-xs text-slate-400 mr-1.5">{f.procedure.ref}</span>}
                                    {f.procedure.nom}
                                </button>
                            </span>
                        );
                    })}
                </nav>
                {screenUnits.length > 0 && (
                    <span className="text-sm text-slate-500 tabular-nums flex-shrink-0">
                        Écran {Math.max(activeScreenIndex + 1, 1)} / {screenUnits.length}
                    </span>
                )}
                {parent && (
                    <button type="button" onClick={() => backTo(frames.length - 2)}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50">
                        <ChevronLeft className="w-3.5 h-3.5" />Revenir
                    </button>
                )}
                <button type="button" onClick={onClose} title="Fermer (Échap)"
                    className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex-shrink-0">
                    <X className="w-5 h-5" />
                </button>
            </header>

            {/* BPMN */}
            <section className="h-[38vh] min-h-[220px] flex-shrink-0 bg-white border-b border-slate-200" style={{ position: 'relative' }}>
                {frame.rows.length > 0 ? (
                    <StepFlowViewer
                        key={frame.procedure.id + frames.length}
                        rows={frame.rows}
                        title={frame.procedure.nom}
                        screenCounts={screenCounts}
                        pathStepIds={pathIds}
                        activeStepId={frame.activeStepId}
                        onStepClick={selectStep}
                    />
                ) : (
                    <div className="h-full flex items-center justify-center text-sm text-slate-400">Cette procédure n&apos;a pas d&apos;étapes.</div>
                )}
                <p className="absolute left-4 bottom-3 text-[11px] text-slate-400 bg-white/90 px-2 py-1 rounded pointer-events-none">
                    Cliquez une étape pour afficher son écran · les étapes estompées sont sur une autre branche
                </p>
            </section>

            {/* Écrans enchaînés */}
            {error && <div className="mx-5 mt-3 px-4 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">{error}</div>}
            {!toolsReady ? (
                <div className="flex-1 flex items-center justify-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" />Chargement des écrans…</div>
            ) : (
                <div ref={stripRef} onScroll={onScroll}
                    className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden flex items-center px-[8vw] py-6 snap-x snap-proximity">
                    {units.map((u, i) => (
                        <div key={u.key} className="flex items-center flex-shrink-0">
                            {i > 0 && <Connector />}
                            <div ref={el => { if (el) unitRefs.current.set(u.key, el); else unitRefs.current.delete(u.key); }}
                                className={u.kind === 'screen' ? 'snap-center' : ''}>
                                {u.kind === 'screen' && (
                                    <ScreenCard unit={u} active={u.rows.some(r => r.id === frame.activeStepId)}
                                        numbers={u.rows.map(r => stepNumber.get(r.id) ?? 0)}
                                        css={tools.get(u.toolName)?.tool.design_css}
                                        onClick={() => {
                                            const active = u.rows.some(r => r.id === frame.activeStepId);
                                            if (active) setZoom(screenUnits.indexOf(u)); else selectStep(u.rows[0].id);
                                        }} />
                                )}
                                {u.kind === 'gap' && <GapCard unit={u} activeStepId={frame.activeStepId} onStep={selectStep} />}
                                {u.kind === 'decision' && (
                                    <DecisionCard unit={u} rows={frame.rows}
                                        onChoose={index => {
                                            const target = u.row.outputs[index]?.targetId;
                                            updateFrame({ choices: new Map(frame.choices).set(u.row.id, index) });
                                            if (target) pendingScroll.current = target;
                                        }} />
                                )}
                                {u.kind === 'link' && <LinkCard link={u.link} opening={opening === u.link.session_id} onOpen={() => openLink(u.link)} />}
                                {u.kind === 'end' && (
                                    <div className="w-44 flex flex-col items-center text-center gap-2">
                                        <span className="w-9 h-9 rounded-full border-[3px] border-slate-700 bg-white" />
                                        <p className="text-xs text-slate-500 leading-snug">{u.row.étape}</p>
                                        {parent && (
                                            <button type="button" onClick={() => backTo(frames.length - 2)}
                                                className="mt-1 text-xs font-medium text-blue-600 hover:underline">← Revenir à « {parent.procedure.nom} »</button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {units.length > 0 && screenUnits.length === 0 && (
                        <p className="ml-8 text-sm text-slate-400 flex-shrink-0">Aucune étape de ce parcours n&apos;a d&apos;écran.</p>
                    )}
                </div>
            )}

            {/* Écran en grand */}
            {zoomed && (
                <div className="fixed inset-0 z-[70] bg-slate-900/70 flex flex-col" onClick={() => setZoom(null)}>
                    <div className="h-14 flex-shrink-0 px-5 flex items-center gap-3 text-white" onClick={e => e.stopPropagation()}>
                        <div className="min-w-0">
                            <p className="text-xs text-slate-300 truncate">{frame.procedure.ref} · {frame.procedure.nom}</p>
                            <p className="text-sm font-semibold truncate">{zoomed.rows.map(r => r.étape).join(' · ')}</p>
                        </div>
                        <div className="flex-1" />
                        <button type="button" disabled={zoom === 0} onClick={() => setZoom(z => Math.max((z ?? 0) - 1, 0))}
                            className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="w-5 h-5" /></button>
                        <span className="text-sm text-slate-300 tabular-nums">{(zoom ?? 0) + 1} / {screenUnits.length}</span>
                        <button type="button" disabled={zoom === screenUnits.length - 1} onClick={() => setZoom(z => Math.min((z ?? 0) + 1, screenUnits.length - 1))}
                            className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
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

// ─── Unités ───────────────────────────────────────────────────

function Connector() {
    return (
        <div className="flex items-center px-2 text-slate-300" aria-hidden>
            <span className="w-6 h-px bg-slate-300" />
            <ChevronRight className="w-4 h-4 -ml-1.5" />
        </div>
    );
}

function ScreenCard({ unit, active, numbers, css, onClick }: {
    unit: Extract<Unit, { kind: 'screen' }>;
    active: boolean;
    numbers: number[];
    css?: string | null;
    onClick: () => void;
}) {
    const actors = [...new Set(unit.rows.map(r => r.acteur).filter(Boolean))].join(', ');
    const label = numbers.length > 1 ? `Étapes ${numbers[0]} à ${numbers[numbers.length - 1]}` : `Étape ${numbers[0]}`;
    return (
        <div role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter') onClick(); }}
            className={`group w-[min(44vw,500px)] rounded-xl bg-white border overflow-hidden cursor-pointer transition-all ${active
                ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-lg' : 'border-slate-200 shadow-sm hover:border-slate-300 hover:shadow-md'}`}>
            <div className="border-b border-slate-100" style={{ position: 'relative' }}>
                <ScreenFrame screen={unit.screen} css={css} toolName={unit.toolName} cropHeight={800} />
                {active && (
                    <span className="absolute top-2 right-2 px-2 py-1 rounded-md bg-slate-900/75 text-white text-[11px] font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Maximize2 className="w-3 h-3" />Agrandir
                    </span>
                )}
            </div>
            <div className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">{label} · {actors}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800 leading-snug line-clamp-2">
                    {unit.rows.length > 1 ? unit.rows.map(r => r.étape).join(' · ') : unit.rows[0].étape}
                </p>
                <p className="mt-1 text-xs text-slate-500 truncate">{unit.screen.name} · {unit.toolName}</p>
            </div>
        </div>
    );
}

function GapCard({ unit, activeStepId, onStep }: {
    unit: Extract<Unit, { kind: 'gap' }>;
    activeStepId: string | null;
    onStep: (id: string) => void;
}) {
    const shown = unit.rows.slice(0, 3);
    return (
        <div className="w-48 rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <MonitorOff className="w-3.5 h-3.5" />Sans écran
            </p>
            <div className="mt-1.5 space-y-1">
                {shown.map(r => (
                    <button key={r.id} type="button" onClick={() => onStep(r.id)}
                        className={`block w-full text-left text-xs leading-snug rounded px-1 -mx-1 py-0.5 hover:bg-slate-100 ${r.id === activeStepId ? 'text-blue-700 font-medium' : 'text-slate-600'}`}>
                        <span className="text-slate-400">{r.acteur || '—'} · </span>{r.étape}
                    </button>
                ))}
                {unit.rows.length > shown.length && <p className="text-[11px] text-slate-400">+ {unit.rows.length - shown.length} étape(s)</p>}
            </div>
        </div>
    );
}

function DecisionCard({ unit, rows, onChoose }: {
    unit: Extract<Unit, { kind: 'decision' }>;
    rows: Table1Row[];
    onChoose: (index: number) => void;
}) {
    const nameOf = (id: string) => rows.find(r => r.id === id)?.étape ?? id;
    return (
        <div className="w-56 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                <GitFork className="w-3.5 h-3.5" />Décision
            </p>
            <p className="mt-1 text-sm font-medium text-slate-800 leading-snug">{unit.row.étape}</p>
            <div className="mt-2 space-y-1">
                {unit.row.outputs.map((o, i) => (
                    <button key={o.targetId} type="button" onClick={() => onChoose(i)}
                        className={`w-full text-left text-xs rounded-lg px-2 py-1.5 border transition-colors ${i === unit.chosen
                            ? 'bg-white border-blue-500 text-blue-700 font-semibold' : 'border-transparent text-slate-600 hover:bg-white/70'}`}>
                        {o.label?.trim() || 'Suite'} <span className="font-normal text-slate-400">→ {nameOf(o.targetId)}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function LinkCard({ link, opening, onOpen }: { link: ResolvedLink; opening: boolean; onOpen: () => void }) {
    return (
        <div className="w-56 rounded-xl border border-dashed border-blue-300 bg-blue-50/60 px-3 py-2.5">
            <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded border ${LINK_LABELS[link.type].color}`}>{LINK_LABELS[link.type].label}</span>
            <p className="mt-1.5 text-sm font-medium text-slate-800 leading-snug">{link.nom}</p>
            <button type="button" onClick={onOpen} disabled={!link.workflow_id || opening}
                className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline disabled:opacity-40">
                {opening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                {link.workflow_id ? 'Voir ses écrans' : 'Process supprimé'}
            </button>
        </div>
    );
}


'use client';

// components/orchestration/ProcessChainMap.tsx
//
// Carte bpmn-js des enchaînements d'un thème (lib/processMapXml.ts), en lecture : on zoome, on
// dézoome, on déplace la vue. Chaque rangée porte son nom et un bouton « ⋯ » (modification de
// la rangée, gérée par le parent). Cliquer une procédure sélectionne sa rangée ; cliquer une
// étape la désigne.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Box } from '@/lib/taxonomyApi';
import type { MapRow, ProcessMap } from '@/lib/processMapXml';

let assetsLoaded = false;
function loadAssets() {
    if (assetsLoaded || typeof document === 'undefined') return;
    assetsLoaded = true;
    [
        'https://unpkg.com/bpmn-js@17.11.1/dist/assets/bpmn-js.css',
        'https://unpkg.com/bpmn-js@17.11.1/dist/assets/diagram-js.css',
        'https://unpkg.com/bpmn-js@17.11.1/dist/assets/bpmn-font/css/bpmn.css',
    ].forEach(href => {
        if (document.querySelector(`link[href="${href}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    });
    const style = document.createElement('style');
    style.textContent = `
.pm-map .djs-element.pm-step { cursor: pointer; }
.pm-map .djs-element.pm-step:hover .djs-visual > :first-child { stroke: #60a5fa !important; }
.pm-map .djs-element.pm-active .djs-visual > :first-child { stroke: #2563eb !important; stroke-width: 4px !important; fill: #dbeafe !important; }
/* Cadre de rangée : bordure seule, le groupe BPMN est dessiné au-dessus des procédures */
.pm-map .djs-element.pm-row .djs-visual rect { stroke: #cbd5e1 !important; stroke-width: 3px !important; stroke-dasharray: none !important; fill: none !important; }
.pm-map .djs-element.pm-row-active .djs-visual rect { stroke: #2563eb !important; stroke-width: 6px !important; }
.pm-map .djs-element.pm-need-pool .djs-visual rect { fill: #f1f5f9 !important; stroke: #94a3b8 !important; }
.pm-map .djs-element.pm-chain .djs-visual path { stroke-dasharray: none !important; stroke-width: 4px !important; }
.pm-map .djs-element.pm-then .djs-visual path { stroke-dasharray: none !important; stroke-width: 3px !important; }
.pm-map .djs-element.pm-need .djs-visual path { stroke-dasharray: 3 7 !important; stroke-width: 2px !important; }
.pm-map .pm-pool-title { font: 700 20px/1.2 Inter, system-ui, sans-serif; color: #1e293b; white-space: nowrap; pointer-events: none; }
.pm-map .pm-pool-title span { margin-left: 10px; padding: 1px 8px; border-radius: 6px; background: #e2e8f0; color: #475569; font-weight: 600; font-size: 15px; }
.pm-map .pm-row-title { display: flex; align-items: center; gap: 8px; font: 700 34px/1 Inter, system-ui, sans-serif; color: #fff; background: #1e293b;
  padding: 6px 6px 6px 16px; border-radius: 10px; white-space: nowrap; box-shadow: 0 1px 3px rgba(15,23,42,.25); cursor: pointer; }
.pm-map .pm-row-title.on { background: #2563eb; }
.pm-map .pm-row-title button { width: 48px; height: 48px; border-radius: 8px; border: 0; background: rgba(255,255,255,.15); color: #fff; font: 700 30px/1 Inter, sans-serif; cursor: pointer; }
.pm-map .pm-row-title button:hover { background: rgba(255,255,255,.3); }
.pm-map .pm-badge { display: flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 9px; background: #2563eb; color: #fff;
  font: 600 10px/16px Inter, system-ui, sans-serif; box-shadow: 0 1px 3px rgba(15,23,42,.25); pointer-events: none; white-space: nowrap; }`;
    document.head.appendChild(style);
}

const SCREEN_ICON = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';

export interface ActiveStep { rowId: string; index: number; stepId: string }

export interface ProcessChainMapHandle {
    zoom: (factor: number) => void;
    fit: () => void;
    focusStep: (step: ActiveStep) => void;
    focusRow: (rowId: string) => void;
    viewbox: () => Box | null;
}

interface Props {
    map: ProcessMap;
    rows: MapRow[];
    savedViewbox?: Box;
    screenCounts: Map<string, Map<string, number>>; // session_id → étape → nombre d'écrans
    activeRowId: string | null;
    activeStep: ActiveStep | null;
    onRowClick: (rowId: string) => void;
    onStepClick: (step: ActiveStep) => void;
    onRowMenu: (rowId: string, anchor: DOMRect) => void;
    onViewChange: () => void;
}

const ProcessChainMap = forwardRef<ProcessChainMapHandle, Props>(function ProcessChainMap(
    { map, rows, savedViewbox, screenCounts, activeRowId, activeStep, onRowClick, onStepClick, onRowMenu, onViewChange }, ref) {
    const boxRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const cb = useRef({ onRowClick, onStepClick, onRowMenu, onViewChange });
    cb.current = { onRowClick, onStepClick, onRowMenu, onViewChange };
    const rowTags = useRef(new Map<string, HTMLElement>());
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const get = (name: string) => viewerRef.current?.get(name);
    const centerOn = (el: any, zoomTo?: number) => {
        const canvas = get('canvas');
        if (zoomTo) canvas.zoom(zoomTo);
        const vb = canvas.viewbox();
        canvas.viewbox({ x: el.x + el.width / 2 - vb.width / 2, y: el.y + el.height / 2 - vb.height / 2, width: vb.width, height: vb.height });
    };

    useImperativeHandle(ref, () => ({
        zoom: factor => { const c = get('canvas'); if (c) c.zoom(c.zoom() * factor); },
        fit: () => get('canvas')?.zoom('fit-viewport', 'auto'),
        focusStep: step => {
            const id = map.elementOfStep(step.rowId, step.index, step.stepId);
            const el = id && get('elementRegistry')?.get(id);
            if (!el) return;
            const vb = get('canvas').viewbox();
            const inside = el.x >= vb.x && el.y >= vb.y && el.x + el.width <= vb.x + vb.width && el.y + el.height <= vb.y + vb.height;
            if (!inside) centerOn(el);
        },
        focusRow: rowId => {
            const el = get('elementRegistry')?.get(map.groupOfRow.get(rowId));
            if (!el) return;
            const vb = get('canvas').viewbox();
            centerOn(el, Math.min(1, (vb.outer.width / el.width) * 0.95, (vb.outer.height / el.height) * 0.95));
        },
        viewbox: () => {
            const vb = get('canvas')?.viewbox();
            return vb ? { x: vb.x, y: vb.y, width: vb.width, height: vb.height } : null;
        },
    }), [map]);

    useEffect(() => {
        let destroyed = false;
        setReady(false);
        setError(null);
        loadAssets();
        (async () => {
            try {
                const Viewer = (await import('bpmn-js/lib/NavigatedViewer')).default;
                if (destroyed || !boxRef.current) return;
                const viewer = new Viewer({ container: boxRef.current });
                viewerRef.current = viewer;
                await viewer.importXML(map.xml);
                if (destroyed) return;
                const canvas = viewer.get('canvas') as any;
                const registry = viewer.get('elementRegistry') as any;
                const overlays = viewer.get('overlays') as any;
                const eventBus = viewer.get('eventBus') as any;

                rowTags.current.clear();
                map.groupOfRow.forEach((groupId, rowId) => {
                    if (!registry.get(groupId)) return;
                    canvas.addMarker(groupId, 'pm-row');
                    const row = rows.find(r => r.id === rowId);
                    const tag = document.createElement('div');
                    tag.className = 'pm-row-title';
                    const name = document.createElement('span');
                    name.textContent = row?.name ?? '';
                    const more = document.createElement('button');
                    more.type = 'button';
                    more.textContent = '⋯';
                    more.title = 'Modifier la rangée';
                    more.onclick = e => { e.stopPropagation(); cb.current.onRowMenu(rowId, more.getBoundingClientRect()); };
                    tag.append(name, more);
                    tag.onclick = () => cb.current.onRowClick(rowId);
                    rowTags.current.set(rowId, tag);
                    // Au-dessus du cadre ; suit le zoom, sans descendre sous une taille lisible
                    overlays.add(groupId, { position: { top: -92, left: 0 }, scale: { min: 0.35 }, html: tag });
                });
                map.titles.forEach((title, poolId) => {
                    if (!registry.get(poolId)) return;
                    const tag = document.createElement('div');
                    tag.className = 'pm-pool-title';
                    tag.textContent = title;
                    const cat = map.subtitles.get(poolId);
                    if (cat) { const chip = document.createElement('span'); chip.textContent = cat; tag.appendChild(chip); }
                    overlays.add(poolId, { position: { top: -30, left: 0 }, html: tag });
                });
                map.dependencyOf.forEach((_, id) => { if (registry.get(id)) canvas.addMarker(id, 'pm-need-pool'); });
                map.linkTypes.forEach((type, id) => {
                    if (registry.get(id)) canvas.addMarker(id, type === 'necessite' ? 'pm-need' : type === 'puis' ? 'pm-then' : 'pm-chain');
                });
                map.stepOfElement.forEach(({ sid, stepId }, id) => {
                    if (!registry.get(id)) return;
                    canvas.addMarker(id, 'pm-step');
                    const n = screenCounts.get(sid)?.get(stepId) ?? 0;
                    if (n > 0) overlays.add(id, { position: { top: -9, right: 4 }, html: `<div class="pm-badge">${SCREEN_ICON}${n > 1 ? n : ''}</div>` });
                });

                eventBus.on('element.click', (e: any) => {
                    const id = e.element?.id;
                    const step = map.stepOfElement.get(id);
                    if (step) return cb.current.onStepClick({ rowId: step.rowId, index: step.index, stepId: step.stepId });
                    const inst = map.instanceOfPool.get(id);
                    if (inst) return cb.current.onRowClick(inst.rowId);
                    const row = map.rowOfGroup.get(id);
                    if (row) cb.current.onRowClick(row);
                });
                eventBus.on('canvas.viewbox.changed', () => cb.current.onViewChange());

                // Dernière vue enregistrée, sinon la rangée sélectionnée
                if (savedViewbox) canvas.viewbox(savedViewbox);
                else {
                    canvas.zoom('fit-viewport', 'auto');
                    const group = activeRowId ? registry.get(map.groupOfRow.get(activeRowId)) : null;
                    if (group) {
                        const vb = canvas.viewbox();
                        centerOn(group, Math.min(1, (vb.outer.width / group.width) * 0.95, (vb.outer.height / group.height) * 0.95));
                    }
                }
                setReady(true);
            } catch (e: any) {
                if (!destroyed) setError(e.message || 'Carte indisponible');
            }
        })();
        return () => { destroyed = true; viewerRef.current?.destroy(); viewerRef.current = null; };
        // Reconstruite quand le diagramme change (thème, rangées modifiées)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map]);

    useEffect(() => {
        if (!ready) return;
        const canvas = get('canvas'), registry = get('elementRegistry');
        registry.getAll().forEach((el: any) => { canvas.removeMarker(el.id, 'pm-active'); canvas.removeMarker(el.id, 'pm-row-active'); });
        rowTags.current.forEach((tag, rowId) => tag.classList.toggle('on', rowId === activeRowId));
        const group = activeRowId && map.groupOfRow.get(activeRowId);
        if (group && registry.get(group)) canvas.addMarker(group, 'pm-row-active');
        const id = activeStep && map.elementOfStep(activeStep.rowId, activeStep.index, activeStep.stepId);
        if (id && registry.get(id)) canvas.addMarker(id, 'pm-active');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, activeRowId, activeStep, map]);

    return (
        <div className="pm-map w-full h-full" style={{ position: 'relative' }}>
            {/* La molette ne fait défiler la carte que si elle a le focus : on le lui donne au survol */}
            <div ref={boxRef} className="w-full h-full" onMouseEnter={() => get('canvas')?.focus?.()} />
            {!ready && !error && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-400 bg-white">
                    <Loader2 className="w-5 h-5 animate-spin" />Assemblage des enchaînements…
                </div>
            )}
            {error && <div className="absolute inset-0 flex items-center justify-center text-sm text-rose-600 bg-white">{error}</div>}
        </div>
    );
});

export default ProcessChainMap;

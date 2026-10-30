'use client';

// components/orchestration/ProcessChainMap.tsx
//
// Carte bpmn-js d'un thème (lib/processMapXml.ts) en mode « disposition » : on zoome, on
// déplace la vue, on déplace et redimensionne les procédures (bassins) ; rien d'autre n'est
// modifiable. Les grappes (catégories) suivent leurs procédures ; cliquer le titre d'une grappe
// sélectionne ses procédures pour les déplacer ensemble. Cliquer une étape la désigne.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Box, ProcessMapLayout } from '@/lib/taxonomyApi';
import { groupBounds, type ProcessMap } from '@/lib/processMapXml';

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
.pm-map .djs-palette, .pm-map .djs-context-pad, .pm-map .djs-popup { display: none !important; }
.pm-map .djs-element.pm-step { cursor: pointer; }
.pm-map .djs-element.pm-step:hover .djs-visual > :first-child { stroke: #60a5fa !important; }
.pm-map .djs-element.pm-active .djs-visual > :first-child { stroke: #2563eb !important; stroke-width: 4px !important; fill: #dbeafe !important; }
.pm-map .djs-element.pm-focus > .djs-visual > rect { stroke: #2563eb !important; stroke-width: 3px !important; }
.pm-map .djs-element[data-element-id^="Cluster_"] .djs-visual rect { stroke: #94a3b8 !important; stroke-width: 2px !important; }
.pm-map .pm-pool-title { font: 700 20px/1.2 Inter, system-ui, sans-serif; color: #1e293b; white-space: nowrap; pointer-events: none; }
.pm-map .pm-cluster-title { font: 700 13px/1 Inter, system-ui, sans-serif; color: #fff; background: #475569; padding: 5px 10px; border-radius: 6px;
  white-space: nowrap; pointer-events: none; box-shadow: 0 1px 3px rgba(15,23,42,.2); }
.pm-map .pm-badge { display: flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 9px; background: #2563eb; color: #fff;
  font: 600 10px/16px Inter, system-ui, sans-serif; box-shadow: 0 1px 3px rgba(15,23,42,.25); pointer-events: none; white-space: nowrap; }`;
    document.head.appendChild(style);
}

const SCREEN_ICON = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';

// Seuls le déplacement et le redimensionnement des procédures sont permis
async function layoutOnlyModule() {
    const RuleProvider = (await import('diagram-js/lib/features/rules/RuleProvider')).default as any;
    class LayoutOnlyRules extends RuleProvider {
        static $inject = ['eventBus'];
        init() {
            const isPool = (e: any) => e?.type === 'bpmn:Participant';
            this.addRule('elements.move', 3000, (ctx: any) => (ctx.shapes || []).every(isPool));
            this.addRule('shape.resize', 3000, (ctx: any) => isPool(ctx.shape));
            ['shape.create', 'shape.append', 'elements.create', 'connection.create', 'connection.start', 'connection.reconnect',
                'connection.updateWaypoints', 'elements.delete', 'shape.replace', 'element.copy', 'elements.paste', 'shape.attach',
                'lane.add', 'lane.split', 'element.autoResize'].forEach(r => this.addRule(r, 3000, () => false));
        }
    }
    return { __init__: ['pmLayoutOnlyRules'], pmLayoutOnlyRules: ['type', LayoutOnlyRules] };
}

export interface ProcessChainMapHandle {
    zoom: (factor: number) => void;
    fit: () => void;
    focusStep: (sid: string, stepId: string) => void;
    focusPool: (sid: string) => void;
    /** Positions des procédures et vue courante, pour l'enregistrement. */
    snapshot: () => ProcessMapLayout | null;
}

interface Props {
    map: ProcessMap;
    savedPools?: Record<string, Box>;
    savedViewbox?: Box;
    screenCounts: Map<string, Map<string, number>>; // session_id → étape → nombre d'écrans
    activeStep: { sid: string; stepId: string } | null;
    focusSid: string | null;
    onStepClick: (sid: string, stepId: string) => void;
    onPoolClick: (sid: string) => void;
    onChange: () => void;                            // disposition ou vue modifiée
}

const ProcessChainMap = forwardRef<ProcessChainMapHandle, Props>(function ProcessChainMap(
    { map, savedPools, savedViewbox, screenCounts, activeStep, focusSid, onStepClick, onPoolClick, onChange }, ref) {
    const boxRef = useRef<HTMLDivElement>(null);
    const modelerRef = useRef<any>(null);
    const cb = useRef({ onStepClick, onPoolClick, onChange });
    cb.current = { onStepClick, onPoolClick, onChange };
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const get = (name: string) => modelerRef.current?.get(name);

    const centerOn = (el: any) => {
        const canvas = get('canvas');
        const vb = canvas.viewbox();
        canvas.viewbox({ x: el.x + el.width / 2 - vb.width / 2, y: el.y + el.height / 2 - vb.height / 2, width: vb.width, height: vb.height });
    };

    useImperativeHandle(ref, () => ({
        zoom: factor => { const c = get('canvas'); if (c) c.zoom(c.zoom() * factor); },
        fit: () => get('canvas')?.zoom('fit-viewport', 'auto'),
        focusStep: (sid, stepId) => {
            const id = map.elementOfStep(sid, stepId);
            const el = id && get('elementRegistry')?.get(id);
            if (!el) return;
            const vb = get('canvas').viewbox();
            const inside = el.x >= vb.x && el.y >= vb.y && el.x + el.width <= vb.x + vb.width && el.y + el.height <= vb.y + vb.height;
            if (!inside) centerOn(el);
        },
        focusPool: sid => {
            const el = get('elementRegistry')?.get(map.poolOf.get(sid));
            if (!el) return;
            const canvas = get('canvas');
            const vb = canvas.viewbox();
            const scale = Math.min(1, (vb.outer.width / el.width) * 0.9, (vb.outer.height / el.height) * 0.9);
            canvas.zoom(scale);
            centerOn(el);
        },
        snapshot: () => {
            const registry = get('elementRegistry');
            if (!registry) return null;
            const pools: Record<string, Box> = {};
            map.poolOf.forEach((poolId, sid) => {
                const el = registry.get(poolId);
                if (el) pools[sid] = { x: el.x, y: el.y, width: el.width, height: el.height };
            });
            const vb = get('canvas').viewbox();
            return { pools, viewbox: { x: vb.x, y: vb.y, width: vb.width, height: vb.height } };
        },
    }), [map]);

    useEffect(() => {
        let destroyed = false;
        setReady(false);
        setError(null);
        loadAssets();
        (async () => {
            try {
                const [{ default: Modeler }, rules] = await Promise.all([import('bpmn-js/lib/Modeler'), layoutOnlyModule()]);
                if (destroyed || !boxRef.current) return;
                const modeler = new Modeler({ container: boxRef.current, additionalModules: [rules] });
                modelerRef.current = modeler;
                await modeler.importXML(map.xml);
                if (destroyed) return;
                const canvas = modeler.get('canvas') as any;
                const registry = modeler.get('elementRegistry') as any;
                const modeling = modeler.get('modeling') as any;
                const overlays = modeler.get('overlays') as any;
                const eventBus = modeler.get('eventBus') as any;
                const selection = modeler.get('selection') as any;

                // Taille enregistrée des procédures (les couloirs suivent)
                map.poolOf.forEach((poolId, sid) => {
                    const saved = savedPools?.[sid], el = registry.get(poolId);
                    if (saved && el && (Math.round(saved.width) !== el.width || Math.round(saved.height) !== el.height)) {
                        modeling.resizeShape(el, { x: el.x, y: el.y, width: saved.width, height: saved.height });
                    }
                });
                const refitGroups = () => map.groups.forEach((sids, groupId) => {
                    const g = registry.get(groupId);
                    const pools = sids.map(s => registry.get(map.poolOf.get(s))).filter(Boolean);
                    if (!g || pools.length === 0) return;
                    const b = groupBounds(pools.map((p: any) => ({ x: p.x, y: p.y, width: p.width, height: p.height })));
                    if (b.x !== g.x || b.y !== g.y || b.width !== g.width || b.height !== g.height) modeling.resizeShape(g, b);
                });
                refitGroups();
                (modeler.get('commandStack') as any).clear();

                // Titres : procédure au-dessus de son bassin (suit le zoom), grappe en étiquette fixe
                map.titles.forEach((title, id) => {
                    if (!registry.get(id)) return;
                    const isCluster = map.groups.has(id);
                    const tag = document.createElement('div');
                    tag.className = isCluster ? 'pm-cluster-title' : 'pm-pool-title';
                    tag.textContent = title;
                    overlays.add(id, isCluster
                        ? { position: { top: 8, left: 8 }, scale: false, html: tag }
                        : { position: { top: -30, left: 0 }, html: tag });
                });

                map.stepOfElement.forEach(({ sid, stepId }, id) => {
                    if (!registry.get(id)) return;
                    canvas.addMarker(id, 'pm-step');
                    const n = screenCounts.get(sid)?.get(stepId) ?? 0;
                    if (n > 0) overlays.add(id, { position: { top: -9, right: 4 }, html: `<div class="pm-badge">${SCREEN_ICON}${n > 1 ? n : ''}</div>` });
                });

                // Pas d'édition des libellés
                eventBus.on('element.dblclick', 5000, () => false);
                eventBus.on('element.click', (e: any) => {
                    const id = e.element?.id;
                    const step = map.stepOfElement.get(id);
                    if (step) return cb.current.onStepClick(step.sid, step.stepId);
                    if (map.sidOfPool.has(id)) return cb.current.onPoolClick(map.sidOfPool.get(id)!);
                    const members = map.groups.get(id);
                    if (members) selection.select(members.map(s => registry.get(map.poolOf.get(s))).filter(Boolean));
                });
                // Les grappes suivent leurs procédures
                eventBus.on(['commandStack.elements.move.postExecuted', 'commandStack.shape.resize.postExecuted'], (e: any) => {
                    const shapes = e.context?.shapes ?? [e.context?.shape];
                    if (shapes.some((s: any) => s?.type === 'bpmn:Participant')) refitGroups();
                });
                eventBus.on('commandStack.changed', () => cb.current.onChange());
                eventBus.on('canvas.viewbox.changed', () => cb.current.onChange());

                if (savedViewbox) canvas.viewbox(savedViewbox);
                else canvas.zoom('fit-viewport', 'auto');
                setReady(true);
            } catch (e: any) {
                if (!destroyed) setError(e.message || 'Carte indisponible');
            }
        })();
        return () => { destroyed = true; modelerRef.current?.destroy(); modelerRef.current = null; };
        // Reconstruite seulement quand le diagramme change (thème, réorganisation)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map]);

    // Étape active et procédure sélectionnée
    useEffect(() => {
        if (!ready) return;
        const canvas = get('canvas'), registry = get('elementRegistry');
        registry.getAll().forEach((el: any) => { canvas.removeMarker(el.id, 'pm-active'); canvas.removeMarker(el.id, 'pm-focus'); });
        const id = activeStep && map.elementOfStep(activeStep.sid, activeStep.stepId);
        if (id && registry.get(id)) canvas.addMarker(id, 'pm-active');
        const pool = focusSid && map.poolOf.get(focusSid);
        if (pool && registry.get(pool)) canvas.addMarker(pool, 'pm-focus');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, activeStep, focusSid, map]);

    return (
        <div className="pm-map w-full h-full" style={{ position: 'relative' }}>
            <div ref={boxRef} className="w-full h-full" />
            {!ready && !error && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-400 bg-white">
                    <Loader2 className="w-5 h-5 animate-spin" />Assemblage des procédures…
                </div>
            )}
            {error && <div className="absolute inset-0 flex items-center justify-center text-sm text-rose-600 bg-white">{error}</div>}
        </div>
    );
});

export default ProcessChainMap;

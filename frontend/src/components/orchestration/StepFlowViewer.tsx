'use client';

// components/orchestration/StepFlowViewer.tsx
//
// BPMN d'une procédure en lecture seule, pour le défilement des écrans : badge sur les tâches
// qui ont un écran, étape affichée surlignée, étapes hors de la branche suivie estompées.
// Cliquer une étape la désigne (onStepClick). Diagramme généré depuis les étapes, comme
// ailleurs dans l'application (bpmnGeneratorSimple, ids « {préfixe}_{id de l'étape} »).

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Table1Row } from '@/logic/types';
import { generateBPMNSimple } from '@/logic/bpmnGeneratorSimple';
import { elementId } from '@/logic/bpmnGraphModel';

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
.pm-flow .djs-element.pm-step { cursor: pointer; }
.pm-flow .djs-element.pm-off-path { opacity: .3; }
.pm-flow .djs-element.pm-active .djs-visual > :first-child { stroke: #2563eb !important; stroke-width: 3px !important; fill: #eff6ff !important; }
.pm-flow .pm-screen-badge { display: flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 9px; background: #2563eb;
  color: #fff; font: 600 10px/16px Inter, system-ui, sans-serif; box-shadow: 0 1px 3px rgba(15,23,42,.25); pointer-events: none; white-space: nowrap; }`;
    document.head.appendChild(style);
}

const SCREEN_ICON = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';

interface Props {
    rows: Table1Row[];
    title: string;
    screenCounts: Map<string, number>; // id d'étape → nombre d'écrans
    pathStepIds: Set<string>;
    activeStepId: string | null;
    onStepClick: (stepId: string) => void;
}

export default function StepFlowViewer({ rows, title, screenCounts, pathStepIds, activeStepId, onStepClick }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const onClickRef = useRef(onStepClick);
    onClickRef.current = onStepClick;
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Élément BPMN de chaque étape
    const elementOf = (r: Table1Row) => elementId(r.id, r.typeBpmn as any);

    // Centre la vue sur un élément, au zoom courant (scrollToElement décale mal la vue zoomée)
    const centerOn = (canvas: any, el: any) => {
        const vb = canvas.viewbox();
        canvas.viewbox({ x: el.x + el.width / 2 - vb.width / 2, y: el.y + el.height / 2 - vb.height / 2, width: vb.width, height: vb.height });
    };

    useEffect(() => {
        let destroyed = false;
        setReady(false);
        loadAssets();
        (async () => {
            try {
                const Viewer = (await import('bpmn-js/lib/NavigatedViewer')).default;
                if (destroyed || !containerRef.current) return;
                viewerRef.current?.destroy();
                const viewer = new Viewer({ container: containerRef.current });
                viewerRef.current = viewer;
                await viewer.importXML(generateBPMNSimple(rows, title));
                if (destroyed) return;
                const registry = viewer.get('elementRegistry') as any;
                const canvas = viewer.get('canvas') as any;
                const overlays = viewer.get('overlays') as any;
                const stepOfElement = new Map<string, string>();
                rows.forEach(r => {
                    const el = elementOf(r);
                    if (!registry.get(el)) return;
                    stepOfElement.set(el, r.id);
                    canvas.addMarker(el, 'pm-step');
                    const n = screenCounts.get(r.id) ?? 0;
                    if (n > 0) {
                        overlays.add(el, {
                            position: { top: -9, right: 4 },
                            html: `<div class="pm-screen-badge">${SCREEN_ICON}${n > 1 ? n : ''}</div>`,
                        });
                    }
                });
                (viewer.get('eventBus') as any).on('element.click', (e: any) => {
                    const step = stepOfElement.get(e.element?.id);
                    if (step) onClickRef.current(step);
                });
                // Diagramme entier s'il reste lisible, sinon taille lisible centrée sur le début ;
                // l'étape affichée est ensuite ramenée dans la vue (effet plus bas)
                canvas.zoom('fit-viewport', 'auto');
                if (canvas.zoom() < 0.7) {
                    canvas.zoom(0.8);
                    const start = rows.find(r => r.typeBpmn === 'StartEvent') ?? rows[0];
                    const el = start && registry.get(elementOf(start));
                    if (el) centerOn(canvas, el);
                }
                setReady(true);
            } catch (e: any) {
                if (!destroyed) setError(e.message || 'Diagramme indisponible');
            }
        })();
        return () => { destroyed = true; viewerRef.current?.destroy(); viewerRef.current = null; };
        // Le diagramme ne dépend que des étapes ; les écrans ne changent pas pendant le défilement
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, title]);

    // Branche suivie : les étapes hors parcours sont estompées
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!ready || !viewer) return;
        const canvas = viewer.get('canvas') as any;
        const registry = viewer.get('elementRegistry') as any;
        rows.forEach(r => {
            const el = elementOf(r);
            if (!registry.get(el)) return;
            if (pathStepIds.has(r.id) || r.typeBpmn === 'ParallelGateway') canvas.removeMarker(el, 'pm-off-path');
            else canvas.addMarker(el, 'pm-off-path');
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, pathStepIds, rows]);

    // Étape affichée : surlignée et ramenée dans la vue si elle en sort
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!ready || !viewer) return;
        const canvas = viewer.get('canvas') as any;
        const registry = viewer.get('elementRegistry') as any;
        registry.getAll().forEach((el: any) => canvas.removeMarker(el.id, 'pm-active'));
        const row = rows.find(r => r.id === activeStepId);
        const element = row && registry.get(elementOf(row));
        if (!element) return;
        canvas.addMarker(element.id, 'pm-active');
        const vb = canvas.viewbox();
        const inside = element.x >= vb.x && element.y >= vb.y
            && element.x + element.width <= vb.x + vb.width && element.y + element.height <= vb.y + vb.height;
        if (!inside) centerOn(canvas, element);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, activeStepId, rows]);

    return (
        <div className="pm-flow w-full h-full" style={{ position: 'relative' }}>
            {/* Le déplacement passe par le canevas : un défilement natif du conteneur (focus,
                scrollIntoView) décalerait le dessin de ses badges */}
            <div ref={containerRef} className="w-full h-full overflow-hidden"
                onScroll={e => { e.currentTarget.scrollTop = 0; e.currentTarget.scrollLeft = 0; }} />
            {!ready && !error && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                </div>
            )}
            {error && <div className="absolute inset-0 flex items-center justify-center text-sm text-rose-600">{error}</div>}
        </div>
    );
}

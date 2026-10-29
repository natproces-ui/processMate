'use client';

// components/orchestration/ProcedureDiagram.tsx
//
// BPMN d'une procédure affiché en entier, à la largeur disponible (hauteur déduite du
// diagramme), pour être parcouru en faisant défiler la page — viewer sans navigation, la
// molette reste à la page. Badge sur les étapes qui ont un écran, étiquettes cliquables sur
// les étapes qui portent un lien vers une autre procédure, étape active surlignée.
// Ids d'éléments : « {préfixe}_{id de l'étape} » (bpmnGeneratorSimple / bpmnGraphModel).

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
.pm-diagram .djs-element.pm-step { cursor: pointer; }
.pm-diagram .djs-element.pm-step:hover .djs-visual > :first-child { stroke: #60a5fa !important; }
.pm-diagram .djs-element.pm-active .djs-visual > :first-child { stroke: #2563eb !important; stroke-width: 3px !important; fill: #dbeafe !important; }
.pm-diagram .pm-badge { display: flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 9px; background: #2563eb; color: #fff;
  font: 600 10px/16px Inter, system-ui, sans-serif; box-shadow: 0 1px 3px rgba(15,23,42,.25); pointer-events: none; white-space: nowrap; }
.pm-diagram .pm-link { pointer-events: auto; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; max-width: 220px; padding: 2px 8px;
  border-radius: 6px; border: 1px solid currentColor; background: #fff; font: 600 11px/16px Inter, system-ui, sans-serif; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; box-shadow: 0 1px 3px rgba(15,23,42,.15); }
.pm-diagram .pm-link:hover { background: #f8fafc; }`;
    document.head.appendChild(style);
}

const SCREEN_ICON = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';

export interface DiagramLink {
    stepId: string;
    label: string; // ex. « Déclenche · Instruire une demande »
    color: string;
    onClick: () => void;
}

interface Props {
    rows: Table1Row[];
    title: string;
    screenCounts: Map<string, number>;
    links: DiagramLink[];
    activeStepId: string | null;
    onStepClick: (stepId: string) => void;
}

export default function ProcedureDiagram({ rows, title, screenCounts, links, activeStepId, onStepClick }: Props) {
    const boxRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const onClickRef = useRef(onStepClick);
    onClickRef.current = onStepClick;
    const linksRef = useRef(links);
    linksRef.current = links;
    const [height, setHeight] = useState(360);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const elementOf = (r: Table1Row) => elementId(r.id, r.typeBpmn as any);

    useEffect(() => {
        let destroyed = false;
        setReady(false);
        loadAssets();
        (async () => {
            try {
                const Viewer = (await import('bpmn-js/lib/Viewer')).default;
                if (destroyed || !boxRef.current) return;
                const viewer = new Viewer({ container: boxRef.current });
                viewerRef.current = viewer;
                await viewer.importXML(generateBPMNSimple(rows, title));
                if (destroyed) return;
                const canvas = viewer.get('canvas') as any;
                const registry = viewer.get('elementRegistry') as any;
                const overlays = viewer.get('overlays') as any;
                const stepOf = new Map<string, string>();
                rows.forEach(r => {
                    const el = elementOf(r);
                    if (!registry.get(el)) return;
                    stepOf.set(el, r.id);
                    canvas.addMarker(el, 'pm-step');
                    const n = screenCounts.get(r.id) ?? 0;
                    if (n > 0) overlays.add(el, { position: { top: -9, right: 4 }, html: `<div class="pm-badge">${SCREEN_ICON}${n > 1 ? n : ''}</div>` });
                });
                linksRef.current.forEach((l, i) => {
                    const row = rows.find(r => r.id === l.stepId);
                    const el = row && registry.get(elementOf(row));
                    if (!el) return;
                    const tag = document.createElement('button');
                    tag.type = 'button';
                    tag.className = 'pm-link';
                    tag.style.color = l.color;
                    tag.textContent = `→ ${l.label}`;
                    tag.title = l.label;
                    tag.onclick = e => { e.stopPropagation(); linksRef.current[i]?.onClick(); };
                    overlays.add(el, { position: { bottom: -6, left: el.width + 8 }, html: tag });
                });
                (viewer.get('eventBus') as any).on('element.click', (e: any) => {
                    const step = stepOf.get(e.element?.id);
                    if (step) onClickRef.current(step);
                });
                // Hauteur : celle du diagramme mis à la largeur du cadre
                const inner = canvas.viewbox().inner;
                const width = boxRef.current.clientWidth || 800;
                setHeight(Math.max(240, Math.min(3200, Math.round(width * (inner.height / Math.max(inner.width, 1))) + 24)));
                setReady(true);
            } catch (e: any) {
                if (!destroyed) setError(e.message || 'Diagramme indisponible');
            }
        })();
        return () => { destroyed = true; viewerRef.current?.destroy(); viewerRef.current = null; };
        // Le diagramme ne dépend que des étapes et des liens affichés
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, title, links.length]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!ready || !viewer) return;
        const canvas = viewer.get('canvas') as any;
        canvas.resized();
        canvas.zoom('fit-viewport', 'auto');
    }, [ready, height]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!ready || !viewer) return;
        const canvas = viewer.get('canvas') as any;
        const registry = viewer.get('elementRegistry') as any;
        rows.forEach(r => { if (registry.get(elementOf(r))) canvas.removeMarker(elementOf(r), 'pm-active'); });
        const row = rows.find(r => r.id === activeStepId);
        if (row && registry.get(elementOf(row))) canvas.addMarker(elementOf(row), 'pm-active');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, activeStepId, rows]);

    return (
        <div className="pm-diagram w-full" style={{ position: 'relative', height }}>
            <div ref={boxRef} className="w-full h-full" />
            {!ready && !error && <div className="absolute inset-0 flex items-center justify-center text-slate-300"><Loader2 className="w-5 h-5 animate-spin" /></div>}
            {error && <div className="absolute inset-0 flex items-center justify-center text-sm text-rose-600">{error}</div>}
        </div>
    );
}

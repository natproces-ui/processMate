'use client';

// Logigramme en lecture, relié aux étapes par leur numéro : cliquer une forme sélectionne l'étape, et l'étape
// sélectionnée ailleurs (tableau, analyse) est mise en évidence et amenée à l'écran. Partagé par la « Vue d'ensemble »
// et, plus tard, l'analyse du processus cible (irritants à gauche, logigramme à droite).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { loadPmRenderModules, PM_DIAGRAM_CSS } from '@/components/shared/bpmnLook';

// seules les formes du parcours sont des étapes (pas les outils associés, couloirs, flèches)
const isStepShape = (el: any) => /Task|Event|Gateway|SubProcess/.test(el?.type || '') && String(el.id).includes('_') && !/^Tool/.test(String(el.id));

/** « UserTask_3 » → « 3 » (convention des logigrammes générés : type_numéro) */
export const stepIdOf = (elementId: string) => elementId.slice(elementId.indexOf('_') + 1);

export interface StepLinkedDiagramHandle {
    fit: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
}

const StepLinkedDiagram = forwardRef<StepLinkedDiagramHandle, {
    xml: string;
    selectedIds?: string[];
    /** étapes en défaillance : badge « ! » ambre, visible même quand l'étape est sélectionnée */
    markedIds?: string[];
    onSelect?: (stepId: string | null) => void;
    /** différences AS IS / TO BE : étape nouvelle, modifiée ou supprimée */
    diff?: Record<string, 'nouvelle' | 'modifiee' | 'supprimee'>;
}>(({ xml, selectedIds = [], markedIds = [], onSelect, diff }, ref) => {
    const host = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

    /** À la largeur du cadre, depuis le haut, sans descendre sous un zoom lisible (0,7) : un logigramme large
     *  (beaucoup de couloirs) se parcourt alors en le faisant glisser, comme dans le Studio, plutôt que d'être
     *  réduit jusqu'à l'illisible. Molette pour descendre, Ctrl + molette pour zoomer. */
    const fitWidth = () => {
        const canvas = viewerRef.current?.get('canvas');
        const el = host.current;
        if (!canvas || !el) return;
        try {
            const box = el.getBoundingClientRect();
            if (box.width < 40 || box.height < 40) return;
            const inner = canvas.viewbox().inner;
            if (!inner?.width) return;
            const zoom = Math.max(0.7, Math.min(1, (box.width - 40) / inner.width));
            canvas.viewbox({ x: inner.x - 20 / zoom, y: inner.y - 20 / zoom, width: box.width / zoom, height: box.height / zoom });
        } catch { /* cadre sans taille */ }
    };

    useImperativeHandle(ref, () => ({
        fit: fitWidth,
        zoomIn: () => { const c = viewerRef.current?.get('canvas'); if (c) c.zoom(c.zoom() * 1.2); },
        zoomOut: () => { const c = viewerRef.current?.get('canvas'); if (c) c.zoom(c.zoom() / 1.2); },
    }));

    // chargement du logigramme
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!host.current || !xml) return;
            setState('loading');
            try {
                // même rendu que le Studio : en-têtes de couloirs colorés, applicatifs, tâches externes
                const [{ default: Viewer }, { laneHeaderModule, linkRendererModule }] = await Promise.all([
                    import('bpmn-js/lib/NavigatedViewer'), loadPmRenderModules(),
                ]);
                if (cancelled || !host.current) return;
                viewerRef.current?.destroy();
                const viewer: any = new Viewer({ container: host.current, additionalModules: [laneHeaderModule, linkRendererModule] });
                viewerRef.current = viewer;
                await viewer.importXML(xml);
                if (cancelled) return;
                fitWidth();
                viewer.get('eventBus').on('element.click', (e: any) => {
                    const el = e.element;
                    onSelectRef.current?.(isStepShape(el) ? stepIdOf(el.id) : null);
                });
                setState('ready');
                applyMarks();
            } catch {
                if (!cancelled) setState('error');
            }
        })();
        return () => { cancelled = true; };
    }, [xml]);

    useEffect(() => () => { viewerRef.current?.destroy(); viewerRef.current = null; }, []);

    // sélection et marques : mises en évidence, et l'étape sélectionnée amenée à l'écran.
    // Les dernières valeurs sont lues par référence : les marques sont posées à la fin du chargement
    // (sinon un logigramme qui arrive après ses marques resterait sans couleur jusqu'au prochain clic)
    const marksRef = useRef({ selectedIds, markedIds, diff });
    marksRef.current = { selectedIds, markedIds, diff };
    const applyMarks = () => {
        const { selectedIds, markedIds, diff } = marksRef.current;
        const viewer = viewerRef.current;
        if (!viewer) return;
        const canvas = viewer.get('canvas');
        const registry = viewer.get('elementRegistry');
        const steps = registry.filter(isStepShape);
        const overlays = viewer.get('overlays');
        overlays.remove({ type: 'pm-defaillance' });
        let first: any = null;
        for (const el of steps) {
            const id = stepIdOf(el.id);
            canvas.removeMarker(el.id, 'pm-step-selected');
            canvas.removeMarker(el.id, 'pm-step-marked');
            ['nouvelle', 'modifiee', 'supprimee'].forEach(k => canvas.removeMarker(el.id, `pm-diff-${k}`));
            if (diff?.[id]) canvas.addMarker(el.id, `pm-diff-${diff[id]}`);
            const selected = selectedIds.includes(id);
            if (selected) { canvas.addMarker(el.id, 'pm-step-selected'); first = first || el; }
            if (markedIds.includes(id)) {
                if (!selected) canvas.addMarker(el.id, 'pm-step-marked');
                overlays.add(el.id, 'pm-defaillance', {
                    position: { top: -9, right: 9 },
                    html: '<span title="Défaillance relevée" style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:9px;background:#B45309;color:#fff;font:700 11px/1 system-ui,sans-serif">!</span>',
                });
            }
        }
        if (first) {
            // ne bouge la vue que si l'étape n'est pas déjà visible
            const vb = canvas.viewbox();
            const inside = first.x >= vb.x && first.y >= vb.y && first.x + first.width <= vb.x + vb.width && first.y + first.height <= vb.y + vb.height;
            if (!inside) canvas.scrollToElement(first, { top: 120, bottom: 120, left: 160, right: 160 });
        }
    };
    useEffect(() => {
        if (state === 'ready') applyMarks();
    }, [state, selectedIds.join(','), markedIds.join(','), JSON.stringify(diff || {})]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="relative h-full w-full">
            <div ref={host} className="h-full w-full [&_.djs-element]:cursor-pointer" />
            {state === 'loading' && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-neutral-400" /></div>}
            {state === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-red-600"><AlertCircle className="h-4 w-4" />Logigramme illisible</div>
            )}
            <style>{`${PM_DIAGRAM_CSS}
                .djs-element.pm-diff-nouvelle .djs-visual > rect,
                .djs-element.pm-diff-nouvelle .djs-visual > circle,
                .djs-element.pm-diff-nouvelle .djs-visual > polygon { stroke: #0B6E80 !important; stroke-width: 3px !important; fill: #E4F2F4 !important; }
                .djs-element.pm-diff-modifiee .djs-visual > rect,
                .djs-element.pm-diff-modifiee .djs-visual > circle,
                .djs-element.pm-diff-modifiee .djs-visual > polygon { stroke: #0B6E80 !important; stroke-width: 2.5px !important; stroke-dasharray: 6 3 !important; }
                .djs-element.pm-diff-supprimee .djs-visual { opacity: 0.5; }
                .djs-element.pm-diff-supprimee .djs-visual > rect,
                .djs-element.pm-diff-supprimee .djs-visual > circle,
                .djs-element.pm-diff-supprimee .djs-visual > polygon { stroke: #6B7280 !important; stroke-dasharray: 4 3 !important; }
                .djs-element.pm-step-selected .djs-visual > rect,
                .djs-element.pm-step-selected .djs-visual > circle,
                .djs-element.pm-step-selected .djs-visual > polygon { stroke: #0B6E80 !important; stroke-width: 4px !important; fill: #E4F2F4 !important; }
                .djs-element.pm-step-marked .djs-visual > rect,
                .djs-element.pm-step-marked .djs-visual > circle,
                .djs-element.pm-step-marked .djs-visual > polygon { stroke: #B45309 !important; stroke-width: 2.5px !important; }
            `}</style>
        </div>
    );
});
StepLinkedDiagram.displayName = 'StepLinkedDiagram';
export default StepLinkedDiagram;

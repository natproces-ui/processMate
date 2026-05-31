// BPMNViewer.tsx - VERSION ÉPURÉE (sans bandeau mode édition)
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { X, ZoomIn, ZoomOut, Maximize2, FileBarChart, Lock, Unlock, Save, Image as ImageIcon, FileImage } from "lucide-react";
import { BPMN_VIEWER_STYLES } from '@/logic/bpmnStyles';
import { LANE_COLORS } from '@/logic/bpmnConstants';

interface BPMNViewerProps {
    xml: string;
    height?: string;
    onClose?: () => void;
    onError?: (error: string) => void;
    onUpdate?: (updatedXml: string) => void;
    readOnly?: boolean;
}

declare global {
    interface Window { BpmnJS: any; }
}

export interface BPMNViewerHandle {
    getContainerRef: () => HTMLDivElement | null;
}

function useBPMNScript(onError?: (error: string) => void) {
    const [scriptLoaded, setScriptLoaded] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (window.BpmnJS) { setScriptLoaded(true); return; }
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/bpmn-js@17.11.1/dist/bpmn-modeler.development.js';
        script.async = true;
        script.onload = () => setScriptLoaded(true);
        script.onerror = () => onError?.("Impossible de charger BPMN.js");
        document.body.appendChild(script);
        return () => script.remove();
    }, [onError]);
    return scriptLoaded;
}

function useConnectionInteractions(viewerRef: React.RefObject<any>, editMode: boolean) {
    useEffect(() => {
        if (!viewerRef.current || !editMode) return;
        try {
            const eventBus = viewerRef.current.get('eventBus');
            const modeling = viewerRef.current.get('modeling');

            const handleConnectionHover = (event: any) => {
                if (event.element?.type === 'bpmn:SequenceFlow' || event.element?.type === 'bpmn:Association') {
                    const path = event.gfx?.querySelector('path');
                    if (path) path.style.strokeWidth = '6px';
                }
            };
            const handleConnectionLeave = (event: any) => {
                if (event.element?.type === 'bpmn:SequenceFlow' || event.element?.type === 'bpmn:Association') {
                    const path = event.gfx?.querySelector('path');
                    if (path) path.style.strokeWidth = '3px';
                }
            };
            const handleDoubleClick = (event: any) => {
                if (event.element.type !== 'bpmn:SequenceFlow' && event.element.type !== 'bpmn:Association') return;
                event.preventDefault();
                event.stopPropagation();
                const connection = event.element;
                const position = { x: event.x, y: event.y };
                const waypoints = connection.waypoints;
                let closestSegment = 0;
                let minDistance = Infinity;
                for (let i = 0; i < waypoints.length - 1; i++) {
                    const d = distanceToSegment(position, waypoints[i], waypoints[i + 1]);
                    if (d < minDistance) { minDistance = d; closestSegment = i; }
                }
                const newWaypoints = [...waypoints];
                newWaypoints.splice(closestSegment + 1, 0, position);
                modeling.updateWaypoints(connection, newWaypoints);
            };

            eventBus.on('element.hover', handleConnectionHover);
            eventBus.on('element.out', handleConnectionLeave);
            eventBus.on('element.dblclick', handleDoubleClick);
            return () => {
                eventBus.off('element.hover', handleConnectionHover);
                eventBus.off('element.out', handleConnectionLeave);
                eventBus.off('element.dblclick', handleDoubleClick);
            };
        } catch (error) { console.error('Erreur configuration interactions:', error); }
    }, [viewerRef, editMode]);
}

function distanceToSegment(point: any, start: any, end: any): number {
    const dx = end.x - start.x, dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.sqrt((point.x - start.x) ** 2 + (point.y - start.y) ** 2);
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return Math.sqrt((point.x - start.x - t * dx) ** 2 + (point.y - start.y - t * dy) ** 2);
}

function ZoomControls({ onZoomIn, onZoomOut, onFit }: { onZoomIn: () => void; onZoomOut: () => void; onFit: () => void }) {
    return (
        <div className="flex gap-0.5 bg-slate-100 rounded-lg p-1">
            <button onClick={onZoomIn} className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition-all" title="Zoom +">
                <ZoomIn className="w-4 h-4 text-slate-600" />
            </button>
            <button onClick={onZoomOut} className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition-all" title="Zoom -">
                <ZoomOut className="w-4 h-4 text-slate-600" />
            </button>
            <button onClick={onFit} className="p-1.5 rounded-md hover:bg-white hover:shadow-sm transition-all" title="Ajuster">
                <Maximize2 className="w-4 h-4 text-slate-600" />
            </button>
        </div>
    );
}

const BPMNViewer = forwardRef<BPMNViewerHandle, BPMNViewerProps>(({
    xml, height = '800px', onClose, onError, onUpdate, readOnly = false
}, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState(!readOnly);
    const [hasChanges, setHasChanges] = useState(false);
    const [exporting, setExporting] = useState(false);

    const scriptLoaded = useBPMNScript(onError);
    useConnectionInteractions(viewerRef, editMode);

    useImperativeHandle(ref, () => ({
        getContainerRef: () => containerRef.current
    }));

    useEffect(() => {
        if (!scriptLoaded || !containerRef.current || viewerRef.current) return;
        try {
            viewerRef.current = new window.BpmnJS({
                container: containerRef.current,
                height,
                keyboard: { bindTo: document },
                textRenderer: {
                    defaultStyle: { fontFamily: 'Arial, sans-serif', fontWeight: '600', fontSize: '16px', lineHeight: 1.3 },
                    externalStyle: { fontSize: '16px', lineHeight: 1.3 }
                }
            });
            const eventBus = viewerRef.current.get('eventBus');
            ['elements.changed', 'element.updateLabel', 'connection.reconnect', 'shape.move.end', 'connection.updateWaypoints']
                .forEach(event => eventBus.on(event, () => setHasChanges(true)));
            setLoading(false);
        } catch {
            onError?.("Erreur initialisation viewer");
            setLoading(false);
        }
        return () => { viewerRef.current?.destroy(); viewerRef.current = null; };
    }, [scriptLoaded, height, onError]);

    const applyLaneColors = useCallback(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        const applyColors = () => {
            const laneElements = Array.from(container.querySelectorAll('[data-element-id^="Lane_"]'))
                .sort((a, b) => {
                    const aX = parseFloat(a.querySelector('rect')?.getAttribute('x') || '0');
                    const bX = parseFloat(b.querySelector('rect')?.getAttribute('x') || '0');
                    return aX - bX;
                });
            laneElements.forEach((lane, index) => {
                const color = LANE_COLORS[index % LANE_COLORS.length];
                const laneRect = lane.querySelector('rect');
                const laneLabel = lane.querySelector('.djs-label');
                if (!laneRect) return;
                lane.querySelector('.lane-header-custom')?.remove();
                const headerRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                headerRect.classList.add('lane-header-custom');
                headerRect.setAttribute('x', laneRect.getAttribute('x') || '0');
                headerRect.setAttribute('y', laneRect.getAttribute('y') || '0');
                headerRect.setAttribute('width', laneRect.getAttribute('width') || '0');
                headerRect.setAttribute('height', '100');
                headerRect.setAttribute('fill', color.stroke);
                headerRect.setAttribute('opacity', '0.95');
                headerRect.style.pointerEvents = 'none';
                lane.insertBefore(headerRect, lane.firstChild);
                laneLabel?.querySelectorAll('text, tspan').forEach(text => {
                    (text as SVGElement).setAttribute('fill', '#ffffff');
                    (text as SVGElement).style.fontWeight = '700';
                    (text as SVGElement).style.fontSize = '18px';
                });
            });
        };
        const svgContainer = container.querySelector('.djs-container svg');
        if (!svgContainer) { setTimeout(applyColors, 100); return; }
        const observer = new MutationObserver((_, obs) => {
            if (container.querySelectorAll('[data-element-id^="Lane_"]').length > 0) {
                applyColors(); obs.disconnect();
            }
        });
        observer.observe(svgContainer, { childList: true, subtree: true });
        setTimeout(() => { observer.disconnect(); applyColors(); }, 500);
    }, []);

    const displayDiagram = useCallback(async (xmlContent: string) => {
        if (!viewerRef.current) return;
        try {
            setLoading(true);
            await viewerRef.current.importXML(xmlContent);
            viewerRef.current.get('canvas').zoom('fit-viewport');
            applyLaneColors();
            setLoading(false);
            setHasChanges(false);
        } catch (error: any) {
            onError?.(`Erreur: ${error.message}`);
            setLoading(false);
        }
    }, [onError, applyLaneColors]);

    useEffect(() => {
        if (viewerRef.current && xml && !loading) displayDiagram(xml);
    }, [xml, loading, displayDiagram]);

    const toggleEditMode = useCallback(() => {
        if (readOnly) return;
        const newMode = !editMode;
        setEditMode(newMode);
        if (containerRef.current) {
            containerRef.current.classList.remove('bpmn-view-only', 'bpmn-editable');
            containerRef.current.classList.add(newMode ? 'bpmn-editable' : 'bpmn-view-only');
        }
    }, [editMode, readOnly]);

    const saveChanges = useCallback(async () => {
        if (!viewerRef.current || !onUpdate) return;
        try {
            const { xml: updatedXml } = await viewerRef.current.saveXML({ format: true });
            onUpdate(updatedXml);
            setHasChanges(false);
        } catch { onError?.("Erreur lors de la sauvegarde"); }
    }, [onUpdate, onError]);

    const downloadPNG = useCallback(async () => {
        if (!containerRef.current) return;
        setExporting(true);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const svgContainer = containerRef.current.querySelector('.djs-container');
            if (!svgContainer) { setExporting(false); return; }
            const editElements = svgContainer.querySelectorAll('.djs-bendpoint,.djs-segment-dragger,.djs-waypoint-move-handle,.djs-connect-handle,.djs-resize-handle,.djs-context-pad,.djs-outline');
            const origDisplays: string[] = [];
            editElements.forEach(el => { origDisplays.push((el as HTMLElement).style.display); (el as HTMLElement).style.display = 'none'; });
            await new Promise(r => setTimeout(r, 150));
            const canvas = await html2canvas(svgContainer as HTMLElement, { backgroundColor: '#ffffff', scale: 3, logging: false, useCORS: true });
            editElements.forEach((el, i) => { (el as HTMLElement).style.display = origDisplays[i]; });
            canvas.toBlob(blob => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `diagram-${Date.now()}.png`;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
                setExporting(false);
            }, 'image/png', 1.0);
        } catch (error: any) { onError?.(`Erreur export PNG: ${error.message}`); setExporting(false); }
    }, [onError]);

    const downloadSVG = useCallback(async () => {
        if (!containerRef.current) return;
        setExporting(true);
        try {
            const svgElement = containerRef.current.querySelector('.djs-container svg');
            if (!svgElement) { setExporting(false); return; }
            const clonedSvg = svgElement.cloneNode(true) as SVGElement;
            clonedSvg.querySelectorAll('.djs-bendpoint,.djs-segment-dragger,.djs-waypoint-move-handle,.djs-connect-handle,.djs-resize-handle,.djs-context-pad,.djs-outline').forEach(el => el.remove());
            const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
            styleEl.textContent = BPMN_VIEWER_STYLES;
            clonedSvg.insertBefore(styleEl, clonedSvg.firstChild);
            const bbox = (svgElement as SVGSVGElement).getBBox();
            clonedSvg.setAttribute('viewBox', `${bbox.x - 20} ${bbox.y - 20} ${bbox.width + 40} ${bbox.height + 40}`);
            clonedSvg.setAttribute('width', String(bbox.width + 40));
            clonedSvg.setAttribute('height', String(bbox.height + 40));
            clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            const svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clonedSvg);
            const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `diagram-${Date.now()}.svg`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setExporting(false);
        } catch (error: any) { onError?.(`Erreur export SVG: ${error.message}`); setExporting(false); }
    }, [onError]);

    const zoom = (delta: number) => viewerRef.current?.get('canvas').zoom(viewerRef.current.get('canvas').zoom() + delta);
    const fitViewport = () => viewerRef.current?.get('canvas').zoom('fit-viewport');

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.classList.remove('bpmn-view-only', 'bpmn-editable');
            containerRef.current.classList.add(editMode ? 'bpmn-editable' : 'bpmn-view-only');
        }
    }, [editMode]);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <style>{BPMN_VIEWER_STYLES}</style>

            {/* Header épuré */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2.5">
                    <FileBarChart className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-700">Diagramme BPMN</span>
                    {hasChanges && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                            Modifié
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {!readOnly && (
                        <>
                            <button
                                onClick={toggleEditMode}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${editMode
                                    ? 'bg-green-500 text-white border-green-500'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                    }`}
                            >
                                {editMode ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                                {editMode ? 'Édition' : 'Lecture'}
                            </button>
                            {hasChanges && onUpdate && (
                                <button
                                    onClick={saveChanges}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium"
                                >
                                    <Save className="w-3.5 h-3.5" />
                                    Sauvegarder
                                </button>
                            )}
                        </>
                    )}

                    <ZoomControls onZoomIn={() => zoom(0.1)} onZoomOut={() => zoom(-0.1)} onFit={fitViewport} />

                    <button
                        onClick={downloadPNG}
                        disabled={exporting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-all"
                    >
                        <ImageIcon className="w-3.5 h-3.5" />
                        PNG
                    </button>
                    <button
                        onClick={downloadSVG}
                        disabled={exporting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-all"
                    >
                        <FileImage className="w-3.5 h-3.5" />
                        SVG
                    </button>

                    {onClose && (
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                            <X className="w-4 h-4 text-slate-500" />
                        </button>
                    )}
                </div>
            </div>

            {/* Canvas */}
            <div ref={containerRef} style={{ height, position: 'relative' }} className={`bg-white ${editMode ? 'bpmn-editable' : 'bpmn-view-only'}`}>
                {(loading || exporting) && (
                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                        <div className="text-center">
                            <svg className="w-8 h-8 text-blue-500 spinner mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <p className="text-xs text-slate-500">{exporting ? 'Export en cours…' : 'Chargement…'}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

BPMNViewer.displayName = 'BPMNViewer';
export default BPMNViewer;
// BPMNViewer.tsx - VERSION AVEC ÉDITION COMPLÈTE ET INTERACTIONS FLÈCHES AMÉLIORÉES
import { useEffect, useRef, useState, useCallback } from "react";
import { X, ZoomIn, ZoomOut, Maximize2, Download, FileBarChart, Lock, Unlock, Save } from "lucide-react";
import { LANE_COLORS } from '@/logic/bpmnConstants';
import { BPMN_VIEWER_STYLES } from '@/logic/bpmnStyles';

interface BPMNViewerProps {
    xml: string;
    height?: string;
    onClose?: () => void;
    onError?: (error: string) => void;
    onUpdate?: (updatedXml: string) => void;
    readOnly?: boolean;
}

declare global {
    interface Window {
        BpmnJS: any;
    }
}

function useBPMNScript(onError?: (error: string) => void) {
    const [scriptLoaded, setScriptLoaded] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (window.BpmnJS) {
            setScriptLoaded(true);
            return;
        }

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

function useColorStyling(viewerRef: React.RefObject<any>) {
    const applyColors = useCallback(() => {
        if (!viewerRef.current) return;

        try {
            const registry = viewerRef.current.get('elementRegistry');
            const canvas = viewerRef.current.get('canvas');
            const elements = registry.getAll();

            elements.filter((e: any) => e.type === 'bpmn:Lane').forEach((lane: any, i: number) => {
                const gfx = registry.getGraphics(lane);
                const rect = gfx?.querySelector('rect');
                if (rect) {
                    const color = LANE_COLORS[i % LANE_COLORS.length];
                    Object.assign(rect.style, {
                        fill: 'transparent',
                        stroke: color.stroke,
                        strokeWidth: color.strokeWidth
                    });
                }
            });

            setTimeout(() => {
                const laneWidth = 450;
                const headerHeight = 100;
                const lanes = elements.filter((e: any) => e.type === 'bpmn:Lane');

                const svg = canvas.getContainer().querySelector('svg .viewport');
                if (!svg) return;

                lanes.forEach((lane: any, i: number) => {
                    const color = LANE_COLORS[i % LANE_COLORS.length];
                    const laneX = 80 + (i * laneWidth);

                    const oldBg = svg.querySelector(`.lane-header-${i}`);
                    if (oldBg) oldBg.remove();

                    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    bgRect.classList.add('lane-header', `lane-header-${i}`);
                    bgRect.setAttribute('x', String(laneX));
                    bgRect.setAttribute('y', '120');
                    bgRect.setAttribute('width', String(laneWidth));
                    bgRect.setAttribute('height', String(headerHeight));
                    bgRect.setAttribute('fill', color.stroke);
                    bgRect.setAttribute('opacity', '0.95');
                    bgRect.style.pointerEvents = 'none';

                    svg.insertBefore(bgRect, svg.firstChild);

                    const gfx = registry.getGraphics(lane);
                    if (gfx) {
                        const labelGroup = gfx.querySelector('.djs-label');
                        if (labelGroup) {
                            const textElement = labelGroup.querySelector('text');
                            if (textElement) {
                                textElement.setAttribute('fill', '#ffffff');
                                textElement.setAttributeNS(null, 'fill', '#ffffff');
                                textElement.style.fill = '#ffffff';

                                const marginHorizontal = Math.floor(laneWidth * 0.05);
                                textElement.setAttribute('x', String(laneX + marginHorizontal));
                                textElement.setAttribute('text-anchor', 'start');
                            }

                            const allTspans = labelGroup.querySelectorAll('tspan');
                            allTspans.forEach((tspan: any) => {
                                tspan.setAttribute('fill', '#ffffff');
                                tspan.setAttributeNS(null, 'fill', '#ffffff');
                                tspan.style.fill = '#ffffff';
                                tspan.setAttribute('text-anchor', 'start');

                                const marginHorizontal = Math.floor(laneWidth * 0.05);
                                tspan.setAttribute('x', String(laneX + marginHorizontal));
                            });
                        }
                    }
                });
            }, 500);

            styleAnnotationsAndAssociations(elements, registry);
            forceMarkerDisplay(canvas, registry);

            setTimeout(() => {
                elements.filter((e: any) => e.type === 'bpmn:Task' || e.type === 'bpmn:UserTask')
                    .forEach((task: any) => {
                        const gfx = registry.getGraphics(task);
                        const textElements = gfx?.querySelectorAll('text');
                        textElements?.forEach((text: any) => {
                            text.setAttribute('font-size', '16');
                            text.style.fontWeight = '600';
                        });
                    });

                elements.filter((e: any) => e.type === 'bpmn:ExclusiveGateway')
                    .forEach((gw: any) => {
                        const gfx = registry.getGraphics(gw);
                        const textElements = gfx?.querySelectorAll('text');
                        textElements?.forEach((text: any) => {
                            text.setAttribute('font-size', '14');
                            text.style.fontWeight = '600';
                        });
                    });

                elements.filter((e: any) => e.type === 'bpmn:StartEvent' || e.type === 'bpmn:EndEvent')
                    .forEach((event: any) => {
                        const gfx = registry.getGraphics(event);
                        const textElements = gfx?.querySelectorAll('text');
                        textElements?.forEach((text: any) => {
                            text.setAttribute('font-size', '13');
                            text.style.fontWeight = '600';
                        });
                    });

                elements.filter((e: any) => e.type === 'bpmn:Lane')
                    .forEach((lane: any) => {
                        const gfx = registry.getGraphics(lane);
                        const textElements = gfx?.querySelectorAll('text');
                        textElements?.forEach((text: any) => {
                            text.setAttribute('font-size', '18');
                            text.style.fontWeight = '700';
                        });
                    });
            }, 200);
        } catch (error) {
            console.error('Erreur application couleurs:', error);
        }
    }, [viewerRef]);

    return applyColors;
}

function styleAnnotationsAndAssociations(elements: any[], registry: any) {
    elements.filter((e: any) => e.type === 'bpmn:TextAnnotation').forEach((ann: any) => {
        const gfx = registry.getGraphics(ann);
        const rect = gfx?.querySelector('rect');
        if (rect) {
            rect.style.fill = 'transparent';
            rect.style.stroke = 'none';
        }
    });

    elements.filter((e: any) => e.type === 'bpmn:Association').forEach((assoc: any) => {
        const gfx = registry.getGraphics(assoc);
        const path = gfx?.querySelector('path');
        if (path) {
            Object.assign(path.style, {
                stroke: '#F59E0B',
                strokeWidth: '1.5px',
                strokeDasharray: '4,2',
                opacity: '0.5'
            });
        }
    });
}

function forceMarkerDisplay(canvas: any, registry: any) {
    const svg = canvas._svg;
    const defs = svg.querySelector('defs');

    if (defs) {
        const markers = defs.querySelectorAll('marker');
        markers.forEach((marker: any) => {
            marker.style.display = 'block';
            marker.style.visibility = 'visible';

            const markerPath = marker.querySelector('path, polygon');
            if (markerPath) {
                markerPath.style.fill = '#6b7280';
                markerPath.style.stroke = 'none';
            }
        });
    }

    const elements = registry.getAll();
    elements.filter((e: any) => e.type === 'bpmn:SequenceFlow').forEach((flow: any) => {
        const gfx = registry.getGraphics(flow);
        const path = gfx?.querySelector('path');
        if (path) {
            path.style.markerEnd = 'url(#sequenceflow-end)';
        }
    });
}

function useConnectionInteractions(viewerRef: React.RefObject<any>, editMode: boolean) {
    useEffect(() => {
        if (!viewerRef.current || !editMode) return;

        try {
            const eventBus = viewerRef.current.get('eventBus');
            const modeling = viewerRef.current.get('modeling');
            const canvas = viewerRef.current.get('canvas');

            // Améliorer le hover sur les connexions
            const handleConnectionHover = (event: any) => {
                if (event.element && (event.element.type === 'bpmn:SequenceFlow' || event.element.type === 'bpmn:Association')) {
                    const gfx = event.gfx;
                    if (gfx) {
                        gfx.style.cursor = 'pointer';
                        // Augmenter temporairement l'épaisseur de la ligne pour faciliter la sélection
                        const path = gfx.querySelector('path');
                        if (path) {
                            path.style.strokeWidth = '6px';
                        }
                    }
                }
            };

            const handleConnectionLeave = (event: any) => {
                if (event.element && (event.element.type === 'bpmn:SequenceFlow' || event.element.type === 'bpmn:Association')) {
                    const gfx = event.gfx;
                    if (gfx) {
                        gfx.style.cursor = '';
                        const path = gfx.querySelector('path');
                        if (path) {
                            path.style.strokeWidth = '3px';
                        }
                    }
                }
            };

            // Double-clic sur une connexion = ajouter bendpoint
            const handleDoubleClick = (event: any) => {
                if (event.element.type === 'bpmn:SequenceFlow' || event.element.type === 'bpmn:Association') {
                    event.preventDefault();
                    event.stopPropagation();

                    const connection = event.element;
                    const position = { x: event.x, y: event.y };

                    // Trouver le segment le plus proche
                    const waypoints = connection.waypoints;
                    let closestSegment = 0;
                    let minDistance = Infinity;

                    for (let i = 0; i < waypoints.length - 1; i++) {
                        const start = waypoints[i];
                        const end = waypoints[i + 1];
                        const distance = distanceToSegment(position, start, end);

                        if (distance < minDistance) {
                            minDistance = distance;
                            closestSegment = i;
                        }
                    }

                    // Insérer le nouveau waypoint
                    const newWaypoints = [...waypoints];
                    newWaypoints.splice(closestSegment + 1, 0, position);

                    modeling.updateWaypoints(connection, newWaypoints);
                }
            };

            eventBus.on('element.hover', handleConnectionHover);
            eventBus.on('element.out', handleConnectionLeave);
            eventBus.on('element.dblclick', handleDoubleClick);

            return () => {
                eventBus.off('element.hover', handleConnectionHover);
                eventBus.off('element.out', handleConnectionLeave);
                eventBus.off('element.dblclick', handleDoubleClick);
            };
        } catch (error) {
            console.error('Erreur configuration interactions:', error);
        }
    }, [viewerRef, editMode]);
}

// Fonction utilitaire : distance d'un point à un segment
function distanceToSegment(point: any, start: any, end: any): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
        return Math.sqrt((point.x - start.x) ** 2 + (point.y - start.y) ** 2);
    }

    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    const projectionX = start.x + t * dx;
    const projectionY = start.y + t * dy;

    return Math.sqrt((point.x - projectionX) ** 2 + (point.y - projectionY) ** 2);
}

function ZoomControls({ onZoomIn, onZoomOut, onFit }: {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFit: () => void;
}) {
    return (
        <div className="flex gap-1 bg-white rounded-lg border border-gray-300 p-1">
            <button onClick={onZoomIn} className="p-2 rounded hover:bg-gray-100" title="Zoom +">
                <ZoomIn className="w-4 h-4 text-gray-600" />
            </button>
            <button onClick={onZoomOut} className="p-2 rounded hover:bg-gray-100" title="Zoom -">
                <ZoomOut className="w-4 h-4 text-gray-600" />
            </button>
            <button onClick={onFit} className="p-2 rounded hover:bg-gray-100" title="Ajuster">
                <Maximize2 className="w-4 h-4 text-gray-600" />
            </button>
        </div>
    );
}

export default function BPMNViewer({ xml, height = '800px', onClose, onError, onUpdate, readOnly = false }: BPMNViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState(!readOnly);
    const [hasChanges, setHasChanges] = useState(false);

    const scriptLoaded = useBPMNScript(onError);
    const applyColors = useColorStyling(viewerRef);
    useConnectionInteractions(viewerRef, editMode);

    useEffect(() => {
        if (!scriptLoaded || !containerRef.current || viewerRef.current) return;

        try {
            viewerRef.current = new window.BpmnJS({
                container: containerRef.current,
                height,
                keyboard: { bindTo: document },
                textRenderer: {
                    defaultStyle: {
                        fontFamily: 'Arial, sans-serif',
                        fontWeight: '600',
                        fontSize: '16px',
                        lineHeight: 1.3
                    },
                    externalStyle: {
                        fontSize: '16px',
                        lineHeight: 1.3
                    }
                }
            });

            const eventBus = viewerRef.current.get('eventBus');
            const changeEvents = [
                'elements.changed',
                'element.updateLabel',
                'connection.reconnect',
                'shape.move.end',
                'connection.updateWaypoints'
            ];

            changeEvents.forEach(event => {
                eventBus.on(event, () => {
                    setHasChanges(true);
                });
            });

            setLoading(false);
        } catch (error) {
            onError?.("Erreur initialisation viewer");
            setLoading(false);
        }

        return () => {
            viewerRef.current?.destroy();
            viewerRef.current = null;
        };
    }, [scriptLoaded, height, onError]);

    const displayDiagram = useCallback(async (xmlContent: string) => {
        if (!viewerRef.current) return;

        try {
            setLoading(true);
            await viewerRef.current.importXML(xmlContent);
            viewerRef.current.get('canvas').zoom('fit-viewport');
            applyColors();
            setLoading(false);
            setHasChanges(false);
        } catch (error: any) {
            console.error('Erreur rendu BPMN:', error);
            onError?.(`Erreur: ${error.message}`);
            setLoading(false);
        }
    }, [applyColors, onError]);

    useEffect(() => {
        if (viewerRef.current && xml && !loading) {
            displayDiagram(xml);
        }
    }, [xml, loading, displayDiagram]);

    const toggleEditMode = useCallback(() => {
        if (readOnly) return;

        const newMode = !editMode;
        setEditMode(newMode);

        if (containerRef.current) {
            const container = containerRef.current;
            container.classList.remove('bpmn-view-only', 'bpmn-editable');
            container.classList.add(newMode ? 'bpmn-editable' : 'bpmn-view-only');
        }
    }, [editMode, readOnly]);

    const saveChanges = useCallback(async () => {
        if (!viewerRef.current || !onUpdate) return;

        try {
            const { xml: updatedXml } = await viewerRef.current.saveXML({ format: true });
            onUpdate(updatedXml);
            setHasChanges(false);
            applyColors();
            alert('✅ Modifications sauvegardées !');
        } catch (error) {
            console.error('Erreur sauvegarde:', error);
            onError?.("Erreur lors de la sauvegarde");
        }
    }, [applyColors, onUpdate, onError]);

    const zoom = (delta: number) => viewerRef.current?.get('canvas').zoom(viewerRef.current.get('canvas').zoom() + delta);
    const fitViewport = () => viewerRef.current?.get('canvas').zoom('fit-viewport');

    const downloadSVG = async () => {
        try {
            const { svg } = await viewerRef.current.saveSVG();
            const blob = new Blob([svg], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'diagram.svg';
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            onError?.("Erreur export");
        }
    };

    useEffect(() => {
        if (containerRef.current) {
            const container = containerRef.current;
            container.classList.remove('bpmn-view-only', 'bpmn-editable');
            container.classList.add(editMode ? 'bpmn-editable' : 'bpmn-view-only');
        }
    }, [editMode]);

    return (
        <div className="bg-white rounded-lg shadow-xl border border-gray-200">
            <style>{BPMN_VIEWER_STYLES}</style>

            <div className="flex items-center justify-between p-4 px-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center gap-3">
                    <FileBarChart className="w-6 h-6 text-blue-600" />
                    <h2 className="text-xl font-semibold text-gray-800 m-0">Diagramme BPMN</h2>
                    {hasChanges && (
                        <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded font-semibold">
                            Modifications non sauvegardées
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {!readOnly && (
                        <>
                            <button
                                onClick={toggleEditMode}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm border transition-all ${editMode
                                    ? 'bg-green-500 text-white border-green-500 hover:bg-green-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                    }`}
                                title={editMode ? "Passer en mode visualisation" : "Activer le mode édition"}
                            >
                                {editMode ? (
                                    <>
                                        <Unlock className="w-4 h-4" />
                                        Édition active
                                    </>
                                ) : (
                                    <>
                                        <Lock className="w-4 h-4" />
                                        Mode lecture
                                    </>
                                )}
                            </button>

                            {hasChanges && onUpdate && (
                                <button
                                    onClick={saveChanges}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 font-medium text-sm animate-pulse"
                                >
                                    <Save className="w-4 h-4" />
                                    Sauvegarder
                                </button>
                            )}

                            <div className="w-px h-6 bg-gray-300 mx-1"></div>
                        </>
                    )}

                    <ZoomControls
                        onZoomIn={() => zoom(0.1)}
                        onZoomOut={() => zoom(-0.1)}
                        onFit={fitViewport}
                    />

                    <button onClick={downloadSVG} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                        <Download className="w-4 h-4" />
                        Exporter
                    </button>

                    {onClose && (
                        <>
                            <div className="w-px h-6 bg-gray-300 mx-1"></div>
                            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
                                <X className="w-5 h-5 text-gray-600" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {editMode && !readOnly && (
                <div className="mx-6 mt-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-gray-700 m-0">
                        <strong>🎯 Mode édition activé :</strong> Déplacez les éléments (drag & drop).
                        Sur les flèches : <strong>Survolez</strong> pour voir les outils et augmenter l'épaisseur, <strong>double-cliquez</strong> pour ajouter un angle/coin.
                    </p>
                </div>
            )}

            <div
                ref={containerRef}
                style={{ height, position: 'relative' }}
                className={`bg-white ${editMode ? 'bpmn-editable' : 'bpmn-view-only'}`}
            >
                {loading && (
                    <div className="absolute inset-0 bg-white/75 flex items-center justify-center z-10">
                        <svg className="w-12 h-12 text-blue-600 spinner" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                )}
            </div>
        </div>
    );
}
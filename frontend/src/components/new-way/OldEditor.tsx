'use client';

import {
    useEffect, useRef, useState,
    forwardRef, useImperativeHandle
} from 'react';

export interface BpmnEditorHandle {
    saveXml: () => Promise<string | null>;
    saveSvg: () => Promise<string | null>;
    importXml: (xml: string) => Promise<void>;
    zoomIn: () => void;
    zoomOut: () => void;
    zoomFit: () => void;
    undo: () => void;
    redo: () => void;
}

interface BpmnEditorProps {
    initialXml?: string;
    onChange?: (xml: string) => void;
    onReady?: () => void;
    onError?: (err: string) => void;
    onModelerReady?: (modeler: any) => void; // ← expose l'instance modeler à Library
}

// ─────────────────────────────────────────────────────────────
// DIAGRAMME VIDE
// ─────────────────────────────────────────────────────────────

export const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             id="Definitions_1"
             targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" isExecutable="false">
    <startEvent id="StartEvent_1" name="Début"/>
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="82" width="36" height="36"/>
        <bpmndi:BPMNLabel>
          <dc:Bounds x="144" y="125" width="52" height="14"/>
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;

// ─────────────────────────────────────────────────────────────
// CSS — chargé une seule fois côté client
// ─────────────────────────────────────────────────────────────

let cssLoaded = false;
function loadBpmnCss() {
    if (cssLoaded || typeof document === 'undefined') return;
    cssLoaded = true;
    const hrefs = [
        'https://unpkg.com/bpmn-js@17.11.1/dist/assets/bpmn-js.css',
        'https://unpkg.com/bpmn-js@17.11.1/dist/assets/diagram-js.css',
        'https://unpkg.com/bpmn-js@17.11.1/dist/assets/bpmn-font/css/bpmn.css',
        'https://unpkg.com/bpmn-js-create-append-anything@1.2.0/assets/bpmn-js-create-append-anything.css',
    ];
    hrefs.forEach(href => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    });
}

// ─────────────────────────────────────────────────────────────
// COMPOSANT
// ─────────────────────────────────────────────────────────────

const BpmnEditor = forwardRef<BpmnEditorHandle, BpmnEditorProps>(({
    initialXml,
    onChange,
    onReady,
    onError,
    onModelerReady,
}, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const modelerRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const changeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        let destroyed = false;
        loadBpmnCss();

        async function init() {
            try {
                const [
                    { default: BpmnModeler },
                    { default: BaseRenderer },
                    { is },
                    { attr: svgAttr, create: svgCreate },
                    appendModule,
                ] = await Promise.all([
                    import('bpmn-js/lib/Modeler'),
                    import('diagram-js/lib/draw/BaseRenderer'),
                    import('bpmn-js/lib/util/ModelUtil'),
                    import('tiny-svg'),
                    import('bpmn-js-create-append-anything'),
                ]);

                if (destroyed || !containerRef.current) return;

                const CreateAppendAnythingModule =
                    (appendModule as any).CreateAppendAnythingModule ??
                    (appendModule as any).default;

                // ── LaneHeaderRenderer ────────────────────────────────
                const LANE_COLORS = [
                    { fill: '#2C7BE5', text: '#ffffff' },
                    { fill: '#00B4A0', text: '#ffffff' },
                    { fill: '#E67E22', text: '#ffffff' },
                    { fill: '#8E44AD', text: '#ffffff' },
                    { fill: '#27AE60', text: '#ffffff' },
                    { fill: '#E74C3C', text: '#ffffff' },
                    { fill: '#2980B9', text: '#ffffff' },
                    { fill: '#16A085', text: '#ffffff' },
                ];

                // ── Couleur outil HOPEX ──────────────────────────────
                const TOOL_COLOR = '#1a7a5e';   // vert foncé style HOPEX
                const TOOL_STROKE = '#1a7a5e';

                // SVG path roue dentée 12×12 centrée sur (6,6)
                const GEAR_PATH = 'M7.5 4.5A1.5 1.5 0 0 0 6 3a1.5 1.5 0 0 0-1.5 1.5 1.5 1.5 0 0 0 1.5 1.5 1.5 1.5 0 0 0 1.5-1.5zM6 1c.3 0 .6.03.88.08l.34 1.02a.85.85 0 0 0 1.06.54l1-.38c.46.35.84.79 1.12 1.3l-.6.88a.85.85 0 0 0 .18 1.14l.9.65c.04.27.06.55.06.83s-.02.56-.06.83l-.9.65a.85.85 0 0 0-.18 1.14l.6.88c-.28.51-.66.95-1.12 1.3l-1-.38a.85.85 0 0 0-1.06.54l-.34 1.02A5 5 0 0 1 6 13a5 5 0 0 1-.88-.08l-.34-1.02a.85.85 0 0 0-1.06-.54l-1 .38c-.46-.35-.84-.79-1.12-1.3l.6-.88a.85.85 0 0 0-.18-1.14l-.9-.65A5 5 0 0 1 1 7c0-.28.02-.56.06-.83l.9-.65A.85.85 0 0 0 2.14 4.38l-.6-.88C1.82 3 2.2 2.56 2.66 2.21l1 .38a.85.85 0 0 0 1.06-.54l.34-1.02A5 5 0 0 1 6 1z';

                function isToolElement(element: any): boolean {
                    return (
                        is(element, 'bpmn:ServiceTask') &&
                        typeof element.id === 'string' &&
                        element.id.startsWith('Tool_')
                    );
                }

                class LaneHeaderRenderer extends BaseRenderer {
                    bpmnRenderer: any;
                    _idx: Map<string, number>;

                    constructor(eventBus: any, bpmnRenderer: any) {
                        super(eventBus, 1500);
                        this.bpmnRenderer = bpmnRenderer;
                        this._idx = new Map();
                    }

                    canRender(element: any) {
                        return (
                            is(element, 'bpmn:Lane') ||
                            is(element, 'bpmn:Participant') ||
                            isToolElement(element)
                        );
                    }

                    drawShape(parentNode: SVGElement, element: any) {
                        // ── Outil : barre verticale verte + roue en haut + texte noir ──
                        if (isToolElement(element)) {
                            while (parentNode.firstChild) {
                                parentNode.removeChild(parentNode.firstChild);
                            }

                            const w = element.width || 140;
                            const h = element.height || 28;

                            // Barre verticale verte — x=4, pleine hauteur
                            const bar = svgCreate('line') as SVGLineElement;
                            svgAttr(bar, {
                                x1: 4, y1: 0,
                                x2: 4, y2: h,
                                stroke: TOOL_STROKE,
                                'stroke-width': '2',
                                'stroke-linecap': 'round',
                                'pointer-events': 'none',
                            });
                            parentNode.appendChild(bar);

                            // Roue dentée — à DROITE de la barre, en haut
                            // barre à x=4 largeur 2 → roue commence à x=8
                            const gearGroup = svgCreate('g') as SVGGElement;
                            svgAttr(gearGroup, {
                                transform: `translate(8, 0) scale(0.85)`,
                                'pointer-events': 'none',
                            });
                            const gearIcon = svgCreate('path') as SVGPathElement;
                            svgAttr(gearIcon, {
                                d: GEAR_PATH,
                                fill: TOOL_COLOR,
                            });
                            gearGroup.appendChild(gearIcon);
                            parentNode.appendChild(gearGroup);

                            // Texte noir — à droite de la roue (roue ~11px large)
                            const label = element.businessObject?.name || '';
                            const text = svgCreate('text') as SVGTextElement;
                            svgAttr(text, {
                                x: 22,
                                y: 9,
                                fill: '#1a1a1a',
                                'font-size': '11',
                                'font-weight': '500',
                                'font-family': 'system-ui, sans-serif',
                                'pointer-events': 'none',
                            });
                            text.textContent = label;
                            parentNode.appendChild(text);

                            // Hitbox invisible pour sélection/déplacement
                            const hitbox = svgCreate('rect') as SVGRectElement;
                            svgAttr(hitbox, {
                                x: 0, y: 0,
                                width: w, height: h,
                                fill: 'transparent',
                                stroke: 'none',
                            });
                            parentNode.appendChild(hitbox);

                            return parentNode as any;
                        }

                        const shape = this.bpmnRenderer.drawShape(parentNode, element);

                        if (is(element, 'bpmn:Lane')) {
                            const idx = this._getLaneIndex(element);
                            const color = LANE_COLORS[idx % LANE_COLORS.length];
                            const isVertical = element.height > element.width;

                            const rect = svgCreate('rect') as SVGRectElement;
                            svgAttr(rect, {
                                x: 0,
                                y: 0,
                                width: isVertical ? element.width : 30,
                                height: isVertical ? 30 : element.height,
                                fill: color.fill,
                                'fill-opacity': '0.88',
                                'stroke-width': '0',
                                'pointer-events': 'none',
                            });
                            parentNode.insertBefore(rect, parentNode.firstChild);

                            setTimeout(() => {
                                parentNode.querySelectorAll('text, tspan').forEach((el: Element) => {
                                    (el as SVGElement).setAttribute('fill', '#ffffff');
                                    (el as SVGElement).style.fontWeight = '700';
                                });
                            }, 20);
                        }

                        if (is(element, 'bpmn:Participant')) {
                            const rect = svgCreate('rect') as SVGRectElement;
                            svgAttr(rect, {
                                x: 0,
                                y: 0,
                                width: element.width,
                                height: 28,
                                fill: '#1e293b',
                                'fill-opacity': '0.85',
                                'stroke-width': '0',
                                'pointer-events': 'none',
                            });
                            parentNode.insertBefore(rect, parentNode.firstChild);

                            setTimeout(() => {
                                parentNode.querySelectorAll('text, tspan').forEach((el: Element) => {
                                    (el as SVGElement).setAttribute('fill', '#ffffff');
                                    (el as SVGElement).style.fontWeight = '700';
                                });
                            }, 20);
                        }

                        return shape;
                    }

                    getShapePath(shape: any) {
                        return this.bpmnRenderer.getShapePath(shape);
                    }

                    _getLaneIndex(element: any): number {
                        if (this._idx.has(element.id)) return this._idx.get(element.id)!;
                        const parent = element.parent;
                        if (parent?.children) {
                            parent.children
                                .filter((c: any) => is(c, 'bpmn:Lane'))
                                .forEach((lane: any, i: number) => {
                                    this._idx.set(lane.id, i);
                                });
                        }
                        return this._idx.get(element.id) ?? 0;
                    }
                }

                (LaneHeaderRenderer as any).$inject = ['eventBus', 'bpmnRenderer'];

                // ── LinkRenderer : association "link" → ligne pleine noire sans flèche ──
                class LinkRenderer extends BaseRenderer {
                    bpmnRenderer: any;

                    constructor(eventBus: any, bpmnRenderer: any) {
                        super(eventBus, 1600); // priorité > LaneHeaderRenderer
                        this.bpmnRenderer = bpmnRenderer;
                    }

                    canRender(element: any) {
                        return (
                            element.type === 'bpmn:Association' &&
                            element.businessObject?.name === 'link'
                        );
                    }

                    drawConnection(parentNode: SVGElement, element: any) {
                        // Effacer le rendu pointillé par défaut
                        while (parentNode.firstChild) {
                            parentNode.removeChild(parentNode.firstChild);
                        }

                        const waypoints = element.waypoints || [];
                        if (waypoints.length < 2) return parentNode as any;

                        // Construire le path depuis les waypoints
                        const d = waypoints
                            .map((wp: any, i: number) => `${i === 0 ? 'M' : 'L'} ${Math.round(wp.x)} ${Math.round(wp.y)}`)
                            .join(' ');

                        const path = svgCreate('path') as SVGPathElement;
                        svgAttr(path, {
                            d,
                            stroke: '#000000',
                            'stroke-width': '1.5',
                            fill: 'none',
                            'stroke-dasharray': 'none',
                            'stroke-linecap': 'round',
                            'stroke-linejoin': 'round',
                            'pointer-events': 'none',
                        });
                        parentNode.appendChild(path);

                        return parentNode as any;
                    }

                    getConnectionPath(connection: any) {
                        return this.bpmnRenderer.getConnectionPath(connection);
                    }
                }

                (LinkRenderer as any).$inject = ['eventBus', 'bpmnRenderer'];

                const linkRendererModule = {
                    __init__: ['linkRenderer'],
                    linkRenderer: ['type', LinkRenderer],
                };


                const laneHeaderModule = {
                    __init__: ['laneHeaderRenderer'],
                    laneHeaderRenderer: ['type', LaneHeaderRenderer],
                };

                // ── PaletteOutil : item "Outil" avec id Tool_ ────────
                class PaletteOutil {
                    _palette: any;
                    _create: any;
                    _elementFactory: any;
                    _moddle: any;

                    constructor(palette: any, create: any, elementFactory: any, moddle: any) {
                        this._palette = palette;
                        this._create = create;
                        this._elementFactory = elementFactory;
                        this._moddle = moddle;
                        palette.registerProvider(this);
                    }

                    getPaletteEntries() {
                        const create = this._create;
                        const elementFactory = this._elementFactory;
                        const moddle = this._moddle;

                        const createTool = (event: any) => {
                            // Id unique commençant par Tool_ → déclenche le renderer custom
                            const toolId = `Tool_${Date.now()}`;
                            const bo = moddle.create('bpmn:ServiceTask', {
                                id: toolId,
                                name: 'Outil',
                            });
                            const shape = elementFactory.createShape({
                                type: 'bpmn:ServiceTask',
                                id: toolId,
                                businessObject: bo,
                                width: 140,
                                height: 28,
                            });
                            create.start(event, shape);
                        };

                        return {
                            'processmate.tool': {
                                group: 'tools',
                                className: 'bpmn-icon-service-task',
                                title: 'Outil / Applicatif',
                                action: {
                                    dragstart: createTool,
                                    click: createTool,
                                },
                            },
                            'processmate.link': {
                                group: 'tools',
                                className: 'bpmn-icon-connection',
                                title: 'Link — relier un outil à une tâche',
                                action: {
                                    click(_event: any) {
                                        // Le link se crée en tirant depuis le contextPad
                                        // Cet item est un rappel visuel — le vrai connect est dans le contextPad
                                    },
                                },
                            },
                        };
                    }
                }

                (PaletteOutil as any).$inject = ['palette', 'create', 'elementFactory', 'moddle'];

                const paletteOutilModule = {
                    __init__: ['paletteOutil'],
                    paletteOutil: ['type', PaletteOutil],
                };

                // ── ContextPadLink : ajoute "Link" dans le contextPad ──
                // Disponible sur toute tâche — crée une Association name="link"
                // vers l'élément cible (outil ou autre tâche)
                class ContextPadLink {
                    _contextPad: any;
                    _connect: any;
                    _modeling: any;
                    _moddle: any;

                    constructor(contextPad: any, connect: any, modeling: any, moddle: any) {
                        this._contextPad = contextPad;
                        this._connect = connect;
                        this._modeling = modeling;
                        this._moddle = moddle;
                        contextPad.registerProvider(this);
                    }

                    getContextPadEntries(element: any) {
                        const connect = this._connect;

                        // Disponible sur UserTask, ServiceTask (outils inclus), Task
                        if (
                            !is(element, 'bpmn:Task') &&
                            !is(element, 'bpmn:UserTask') &&
                            !is(element, 'bpmn:ServiceTask')
                        ) return {};

                        return {
                            'processmate.link': {
                                group: 'connect',
                                className: 'bpmn-icon-connection',
                                title: 'Lier un outil (Link)',
                                action: {
                                    click(_event: any, element: any) {
                                        connect.start(_event, element);
                                    },
                                    dragstart(_event: any, element: any) {
                                        connect.start(_event, element);
                                    },
                                },
                            },
                        };
                    }
                }

                (ContextPadLink as any).$inject = ['contextPad', 'connect', 'modeling', 'moddle'];

                const contextPadLinkModule = {
                    __init__: ['contextPadLink'],
                    contextPadLink: ['type', ContextPadLink],
                };

                // ── ConnectionRule : autoriser Association entre Task et Tool_ ──
                // Intercepte la création de connexion et la transforme en Association link
                class ToolConnectionBehavior {
                    _eventBus: any;
                    _modeling: any;
                    _moddle: any;

                    constructor(eventBus: any, modeling: any, moddle: any) {
                        this._eventBus = eventBus;
                        this._modeling = modeling;
                        this._moddle = moddle;

                        // Après création d'une connexion entre un Tool_ et une tâche,
                        // la convertir en Association name="link"
                        eventBus.on('connection.added', (e: any) => {
                            const conn = e.element;
                            const src = conn.source;
                            const tgt = conn.target;

                            const involvesTool =
                                (src?.id?.startsWith('Tool_') || tgt?.id?.startsWith('Tool_'));

                            if (involvesTool && conn.type !== 'bpmn:Association') {
                                // Remplacer par une association
                                setTimeout(() => {
                                    try {
                                        modeling.removeConnection(conn);
                                        const assocId = `ToolAssoc_${Date.now()}`;
                                        const bo = moddle.create('bpmn:Association', {
                                            id: assocId,
                                            name: 'link',
                                            associationDirection: 'None',
                                            sourceRef: src.businessObject,
                                            targetRef: tgt.businessObject,
                                        });
                                        modeling.createConnection(src, tgt, {
                                            type: 'bpmn:Association',
                                            id: assocId,
                                            businessObject: bo,
                                        }, src.parent);
                                    } catch { /* ignore */ }
                                }, 0);
                            }
                        });
                    }
                }

                (ToolConnectionBehavior as any).$inject = ['eventBus', 'modeling', 'moddle'];

                const toolConnectionModule = {
                    __init__: ['toolConnectionBehavior'],
                    toolConnectionBehavior: ['type', ToolConnectionBehavior],
                };


                const modeler = new (BpmnModeler as any)({
                    container: containerRef.current,
                    additionalModules: [
                        CreateAppendAnythingModule,
                        laneHeaderModule,
                        linkRendererModule,
                        paletteOutilModule,
                        contextPadLinkModule,
                        toolConnectionModule,
                    ],
                });

                modelerRef.current = modeler;
                onModelerReady?.(modeler); // ← notifie Library que le modeler est prêt

                // Écoute changements
                const eventBus = modeler.get('eventBus') as any;
                const CHANGE_EVENTS = [
                    'elements.changed', 'element.updateLabel',
                    'connection.reconnect', 'shape.move.end',
                    'shape.create', 'shape.delete',
                    'connection.create', 'connection.delete',
                    'connection.updateWaypoints',
                ];
                CHANGE_EVENTS.forEach(evt => {
                    eventBus.on(evt, () => {
                        if (!onChange) return;
                        if (changeTimeout.current) clearTimeout(changeTimeout.current);
                        changeTimeout.current = setTimeout(async () => {
                            try {
                                const { xml } = await modeler.saveXML({ format: true });
                                onChange(xml);
                            } catch { /* ignore */ }
                        }, 400);
                    });
                });

                await modeler.importXML(initialXml || EMPTY_DIAGRAM);
                if (destroyed) return;

                // Force le rendu "link" (plein, noir) sur toutes les associations ToolAssoc_
                // après chaque import ou changement — le CSS seul ne suffit pas toujours
                function fixToolLinks() {
                    if (!containerRef.current) return;
                    containerRef.current
                        .querySelectorAll('[data-element-id^="ToolAssoc_"] .djs-visual path')
                        .forEach((path) => {
                            (path as SVGPathElement).setAttribute('stroke', '#000000');
                            (path as SVGPathElement).setAttribute('stroke-dasharray', '0');
                            (path as SVGPathElement).setAttribute('stroke-width', '1.5');
                            (path as SVGPathElement).removeAttribute('marker-end');
                            (path as SVGPathElement).removeAttribute('marker-start');
                        });
                }

                eventBus.on('import.done', fixToolLinks);
                eventBus.on('elements.changed', fixToolLinks);
                setTimeout(fixToolLinks, 100);


                const canvas = modeler.get('canvas');
                canvas.zoom('fit-viewport');
                setTimeout(() => {
                    const currentZoom = canvas.zoom();
                    canvas.zoom(Math.min(currentZoom * 0.85, 0.9));
                }, 50);
                setLoading(false);
                onReady?.();

            } catch (err: any) {
                if (!destroyed) {
                    console.error('BpmnEditor init error:', err);
                    onError?.(err.message || 'Erreur initialisation');
                    setLoading(false);
                }
            }
        }

        init();

        return () => {
            destroyed = true;
            if (changeTimeout.current) clearTimeout(changeTimeout.current);
            modelerRef.current?.destroy();
            modelerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
        saveXml: async () => {
            if (!modelerRef.current) return null;
            try {
                const { xml } = await modelerRef.current.saveXML({ format: true });
                return xml;
            } catch { return null; }
        },
        saveSvg: async () => {
            if (!modelerRef.current) return null;
            try {
                const { svg } = await modelerRef.current.saveSVG();
                return svg;
            } catch { return null; }
        },
        importXml: async (xml: string) => {
            if (!modelerRef.current) return;
            await modelerRef.current.importXML(xml);
            modelerRef.current.get('canvas').zoom('fit-viewport');
        },
        zoomIn: () => {
            const c = modelerRef.current?.get('canvas');
            if (c) c.zoom(c.zoom() + 0.15);
        },
        zoomOut: () => {
            const c = modelerRef.current?.get('canvas');
            if (c) c.zoom(Math.max(0.2, c.zoom() - 0.15));
        },
        zoomFit: () => modelerRef.current?.get('canvas')?.zoom('fit-viewport'),
        undo: () => modelerRef.current?.get('commandStack')?.undo(),
        redo: () => modelerRef.current?.get('commandStack')?.redo(),
    }));

    return (
        <div className="relative w-full h-full bg-white">
            {loading && (
                <div className="absolute inset-0 bg-white flex items-center justify-center z-10">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-7 h-7 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                        <p className="text-xs text-slate-400">Chargement…</p>
                    </div>
                </div>
            )}

            <div
                ref={containerRef}
                className="w-full h-full"
                onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('processmate/tool')) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                    }
                }}
                onDrop={(e) => {
                    if (!e.dataTransfer.types.includes('processmate/tool')) return;
                    e.preventDefault();

                    const modeler = modelerRef.current;
                    if (!modeler) return;

                    try {
                        const canvas = modeler.get('canvas');
                        const modeling = modeler.get('modeling');
                        const elementFactory = modeler.get('elementFactory');
                        const moddle = modeler.get('moddle');

                        // Convertir coordonnées écran → coordonnées canvas
                        const rect = containerRef.current!.getBoundingClientRect();
                        const viewbox = canvas.viewbox();
                        const canvasX = (e.clientX - rect.left) / viewbox.scale + viewbox.x;
                        const canvasY = (e.clientY - rect.top) / viewbox.scale + viewbox.y;

                        const toolId = `Tool_${Date.now()}`;
                        const bo = moddle.create('bpmn:ServiceTask', {
                            id: toolId,
                            name: 'Outil',
                        });
                        const shape = elementFactory.createShape({
                            type: 'bpmn:ServiceTask',
                            id: toolId,
                            businessObject: bo,
                            width: 140,
                            height: 28,
                        });

                        // Trouver le parent (lane ou process)
                        const elementRegistry = modeler.get('elementRegistry');
                        const rootElement = canvas.getRootElement();

                        modeling.createShape(shape, {
                            x: Math.round(canvasX),
                            y: Math.round(canvasY),
                        }, rootElement);

                    } catch (err) {
                        console.warn('Library drop error:', err);
                    }
                }}
            />

            <style>{`
                .bjs-powered-by { display: none !important; }

                /* ── Palette : item Outil — icône SVG custom barre+roue ── */
                .djs-palette .entry[data-action="processmate.tool"] {
                    position: relative;
                    overflow: visible;
                }
                /* Masquer l'icône bpmn-font par défaut */
                .djs-palette .entry[data-action="processmate.tool"]::before {
                    display: none !important;
                }
                /* Injecter notre SVG via background */
                .djs-palette .entry[data-action="processmate.tool"] {
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cline x1='8' y1='4' x2='8' y2='28' stroke='%231a7a5e' stroke-width='2.5' stroke-linecap='round'/%3E%3Cg transform='translate(11,4)'%3E%3Cpath d='M7.5 4.5A1.5 1.5 0 0 0 6 3a1.5 1.5 0 0 0-1.5 1.5 1.5 1.5 0 0 0 1.5 1.5 1.5 1.5 0 0 0 1.5-1.5zM6 1c.3 0 .6.03.88.08l.34 1.02a.85.85 0 0 0 1.06.54l1-.38c.46.35.84.79 1.12 1.3l-.6.88a.85.85 0 0 0 .18 1.14l.9.65c.04.27.06.55.06.83s-.02.56-.06.83l-.9.65a.85.85 0 0 0-.18 1.14l.6.88c-.28.51-.66.95-1.12 1.3l-1-.38a.85.85 0 0 0-1.06.54l-.34 1.02A5 5 0 0 1 6 13a5 5 0 0 1-.88-.08l-.34-1.02a.85.85 0 0 0-1.06-.54l-1 .38c-.46-.35-.84-.79-1.12-1.3l.6-.88a.85.85 0 0 0-.18-1.14l-.9-.65A5 5 0 0 1 1 7c0-.28.02-.56.06-.83l.9-.65A.85.85 0 0 0 2.14 4.38l-.6-.88C1.82 3 2.2 2.56 2.66 2.21l1 .38a.85.85 0 0 0 1.06-.54l.34-1.02A5 5 0 0 1 6 1z' fill='%231a7a5e'/%3E%3C/g%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: center;
                    background-size: 28px 28px;
                }
                .djs-palette .entry[data-action="processmate.tool"]::after {
                    content: 'Outil';
                    position: absolute;
                    bottom: -13px;
                    left: 50%;
                    transform: translateX(-50%);
                    font-size: 8px;
                    color: #1a7a5e;
                    white-space: nowrap;
                    font-weight: 700;
                }

                /* ── Palette : item Link — icône chaîne ── */
                .djs-palette .entry[data-action="processmate.link"] {
                    position: relative;
                    overflow: visible;
                }
                .djs-palette .entry[data-action="processmate.link"]::before {
                    display: none !important;
                }
                .djs-palette .entry[data-action="processmate.link"] {
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23334155' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'/%3E%3Cpath d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'/%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: center;
                    background-size: 22px 22px;
                }
                .djs-palette .entry[data-action="processmate.link"]::after {
                    content: 'Link';
                    position: absolute;
                    bottom: -13px;
                    left: 50%;
                    transform: translateX(-50%);
                    font-size: 8px;
                    color: #334155;
                    white-space: nowrap;
                    font-weight: 700;
                }

                /* ── Link outil : ligne pleine noire sans pointillés ── */
                .djs-connection[data-element-id^="ToolAssoc_"] .djs-visual path {
                    stroke: #000000 !important;
                    stroke-dasharray: 0 !important;
                    stroke-width: 1.5px !important;
                    fill: none !important;
                }
                /* Supprimer les marqueurs (flèches) sur le link outil */
                .djs-connection[data-element-id^="ToolAssoc_"] .djs-visual path[marker-end] {
                    marker-end: url(#none) !important;
                }
                .djs-shape[data-element-id^="Tool_"].selected .djs-outline {
                    stroke: #1a7a5e !important;
                    stroke-dasharray: 3,2 !important;
                }
            `}</style>
        </div>
    );
});

BpmnEditor.displayName = 'BpmnEditor';
export default BpmnEditor;
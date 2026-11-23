// src/components/new-way/BpmnEditor.tsx
'use client';

import {
    useEffect, useRef, useState,
    forwardRef, useImperativeHandle
} from 'react';
import { loadPmRenderModules } from '@/components/shared/bpmnLook';

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
    /** Ids de Table1Row (pas d'éléments BPMN) récemment touchés par une modification IA
     *  appliquée — surlignés à l'ouverture du diagramme. */
    highlightStepIds?: string[];
    /** Survol d'une étape (id de Table1Row) : rectangle à l'écran pour y ancrer un aperçu ;
     *  (null, null) quand la souris la quitte. */
    onStepHover?: (stepId: string | null, rect: DOMRect | null) => void;
    /** Palette d'outils affichée (le Studio la masque tant qu'on ne clique pas sur « Outils ») */
    paletteOpen?: boolean;
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
    highlightStepIds,
    onStepHover,
    paletteOpen = true,
}, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const modelerRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const changeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Gardé dans une ref : le modeler n'est créé qu'une fois, le callback peut changer
    const onStepHoverRef = useRef(onStepHover);
    onStepHoverRef.current = onStepHover;
    useEffect(() => {
        let destroyed = false;
        loadBpmnCss();

        async function init() {
            try {
                const [
                    { default: BpmnModeler },
                    { is },
                    appendModule,
                ] = await Promise.all([
                    import('bpmn-js/lib/Modeler'),
                    import('bpmn-js/lib/util/ModelUtil'),
                    import('bpmn-js-create-append-anything'),
                ]);

                if (destroyed || !containerRef.current) return;

                const CreateAppendAnythingModule =
                    (appendModule as any).CreateAppendAnythingModule ??
                    (appendModule as any).default;

                const { laneHeaderModule, linkRendererModule } = await loadPmRenderModules();
                if (destroyed || !containerRef.current) return;

                // ── PaletteOutil : « Applicatif » et « Lien » dans la palette standard ──
                // Icônes bpmn-js d'origine, groupe séparé après les éléments BPMN.
                class PaletteOutil {
                    _create: any;
                    _elementFactory: any;
                    _moddle: any;
                    _canvas: any;
                    _eventBus: any;
                    _modeling: any;
                    _contextPad: any;
                    _stopLink: (() => void) | null = null;

                    constructor(palette: any, create: any, elementFactory: any, moddle: any,
                        canvas: any, eventBus: any, modeling: any, contextPad: any) {
                        this._create = create;
                        this._elementFactory = elementFactory;
                        this._moddle = moddle;
                        this._canvas = canvas;
                        this._eventBus = eventBus;
                        this._modeling = modeling;
                        this._contextPad = contextPad;
                        palette.registerProvider(this);
                    }

                    // Mode « Lien » : clic sur la tâche puis sur l'applicatif (ou l'inverse).
                    // Les clics ne sélectionnent rien : pas de menu contextuel pendant le mode.
                    toggleLink() {
                        if (this._stopLink) { this._stopLink(); return; }
                        const canvas = this._canvas, eventBus = this._eventBus;
                        const container = canvas.getContainer();
                        const entry = () => container.querySelector('.djs-palette [data-action="processmate.link"]');
                        let source: any = null;

                        const stop = () => {
                            if (source) canvas.removeMarker(source, 'pm-link-source');
                            source = null;
                            container.classList.remove('pm-link-mode');
                            entry()?.classList.remove('pm-entry-active');
                            eventBus.off('element.click', onClick);
                            document.removeEventListener('keydown', onKey);
                            this._stopLink = null;
                        };
                        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stop(); };
                        const onClick = (event: any) => {
                            const el = event.element;
                            const linkable = el && (is(el, 'bpmn:Task') || el.id?.startsWith('Tool_'));
                            if (!linkable) { stop(); return; }
                            if (!source) {
                                source = el;
                                canvas.addMarker(el, 'pm-link-source');
                            } else if (el.id !== source.id) {
                                try {
                                    const assocId = `ToolAssoc_${Date.now()}`;
                                    const bo = this._moddle.create('bpmn:Association', {
                                        id: assocId, name: 'link', associationDirection: 'None',
                                        sourceRef: source.businessObject, targetRef: el.businessObject,
                                    });
                                    this._modeling.createConnection(source, el, {
                                        type: 'bpmn:Association', id: assocId, businessObject: bo,
                                    }, source.parent);
                                } catch (err) { console.warn('Lien applicatif :', err); }
                                stop();
                            }
                            return false;
                        };

                        this._contextPad.close();
                        container.classList.add('pm-link-mode');
                        entry()?.classList.add('pm-entry-active');
                        eventBus.on('element.click', 1500, onClick);
                        document.addEventListener('keydown', onKey);
                        this._stopLink = stop;
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
                                name: 'Applicatif',
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
                            'processmate.separator': { group: 'processmate', separator: true },
                            'processmate.tool': {
                                group: 'processmate',
                                className: 'bpmn-icon-service-task',
                                title: 'Applicatif — glisser sur le diagramme',
                                action: { dragstart: createTool, click: createTool },
                            },
                            'processmate.link': {
                                group: 'processmate',
                                className: 'bpmn-icon-connection',
                                title: 'Lien — cliquer la tâche puis l’applicatif (Échap pour annuler)',
                                action: { click: () => this.toggleLink() },
                            },
                        };
                    }
                }

                (PaletteOutil as any).$inject = ['palette', 'create', 'elementFactory', 'moddle', 'canvas', 'eventBus', 'modeling', 'contextPad'];

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
                                title: 'Lier un applicatif (Link)',
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

                // Survol d'une étape : même convention d'id "{préfixe}_{id de la ligne}"
                const STEP_TYPES = ['bpmn:Task', 'bpmn:UserTask', 'bpmn:StartEvent', 'bpmn:EndEvent'];
                eventBus.on('element.hover', (e: any) => {
                    const el = e.element;
                    if (!el || el.waypoints || !STEP_TYPES.includes(el.type) || !el.id.includes('_')) return;
                    onStepHoverRef.current?.(el.id.slice(el.id.indexOf('_') + 1), (e.gfx as SVGGElement).getBoundingClientRect());
                });
                eventBus.on('element.out', (e: any) => {
                    if (e.element && STEP_TYPES.includes(e.element.type)) onStepHoverRef.current?.(null, null);
                });

                // Surligne les éléments correspondant aux étapes récemment modifiées par
                // l'IA — l'id d'un élément BPMN est toujours "{préfixe}_{id de la ligne}"
                // (voir bpmnGeneratorSimple.ts), donc un suffixe exact suffit à le retrouver
                // sans avoir besoin de connaître son type.
                if (highlightStepIds && highlightStepIds.length > 0) {
                    const elementRegistry = modeler.get('elementRegistry') as any;
                    elementRegistry.getAll().forEach((el: any) => {
                        if (highlightStepIds.some(id => el.id.endsWith(`_${id}`))) {
                            canvas.addMarker(el.id, 'ai-changed-highlight');
                        }
                    });
                }

                // Vue de départ lisible : le diagramme à la largeur du cadre, depuis le haut (un
                // diagramme haut, mis en entier dans le cadre, devenait illisible) ; on descend à
                // la molette, et le zoom reste disponible
                // cadre encore sans taille (panneau en train de s'ouvrir) : bpmn-js lève « Failed to execute 'inverse'
                // on 'SVGMatrix' » ; le cadrage est cosmétique, le ResizeObserver recadre quand le cadre apparaît
                try { canvas.zoom('fit-viewport'); } catch { /* cadre sans taille */ }
                setTimeout(() => fitWidth(false), 50);
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

    // Le panneau change de largeur (glissement, chat masqué, plein écran) : le diagramme se
    // recadre à la nouvelle largeur en gardant sa position verticale (sinon il restait minuscule)
    useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        let lastWidth = el.clientWidth;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const ro = new ResizeObserver(() => {
            const w = el.clientWidth;
            if (Math.abs(w - lastWidth) < 24) return;
            lastWidth = w;
            clearTimeout(timer);
            timer = setTimeout(() => fitWidth(true), 150);
        });
        ro.observe(el);
        return () => { ro.disconnect(); clearTimeout(timer); };
    }, []);

    /** Diagramme à la largeur du cadre (couloirs et début visibles), depuis le haut ou en
     *  gardant la position verticale. Sans effet tant que le cadre est caché (largeur nulle) :
     *  le ResizeObserver recadre quand il apparaît. */
    function fitWidth(keepY: boolean) {
        const canvas = modelerRef.current?.get?.('canvas');
        const el = containerRef.current;
        if (!canvas || !el) return;
        try {
            const box = el.getBoundingClientRect();
            if (box.width < 40 || box.height < 40) return;
            const vb = canvas.viewbox();
            const inner = vb.inner;
            if (!inner?.width) return;
            // La palette d'outils recouvre le bord gauche du canevas : on commence après elle
            const palette = el.querySelector('.djs-palette')?.getBoundingClientRect();
            const left = (palette && palette.width > 0 ? Math.max(0, palette.right - box.left) : 0) + 20;
            const zoom = Math.min(0.9, (box.width - left - 20) / inner.width);
            if (!(zoom > 0)) return;
            canvas.zoom(zoom);
            canvas.viewbox({ x: inner.x - left / zoom, y: keepY ? vb.y : inner.y - 20 / zoom, width: box.width / zoom, height: box.height / zoom });
        } catch { /* diagramme en cours de chargement */ }
    }

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
            try { modelerRef.current.get('canvas').zoom('fit-viewport'); } catch { /* cadre sans taille */ }
            fitWidth(false);
        },
        zoomIn: () => {
            const c = modelerRef.current?.get('canvas');
            if (c) c.zoom(c.zoom() + 0.15);
        },
        zoomOut: () => {
            const c = modelerRef.current?.get('canvas');
            if (c) c.zoom(Math.max(0.2, c.zoom() - 0.15));
        },
        zoomFit: () => fitWidth(false),
        undo: () => modelerRef.current?.get('commandStack')?.undo(),
        redo: () => modelerRef.current?.get('commandStack')?.redo(),
    }));

    return (
        <div className={`relative w-full h-full bg-white ${paletteOpen ? '' : 'pm-palette-hidden'}`}>
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
                onDrop={async (e) => {
                    if (!e.dataTransfer.types.includes('processmate/tool')) return;
                    e.preventDefault();

                    const modeler = modelerRef.current;
                    if (!modeler) return;

                    // Convertir coordonnées écran → coordonnées canvas — capturé avant
                    // le prompt (synchrone) pour rester valide après l'attente async.
                    const canvas = modeler.get('canvas');
                    const rect = containerRef.current!.getBoundingClientRect();
                    const viewbox = canvas.viewbox();
                    const canvasX = (e.clientX - rect.left) / viewbox.scale + viewbox.x;
                    const canvasY = (e.clientY - rect.top) / viewbox.scale + viewbox.y;

                    // Résolution contre le référentiel (voir referentiel-outils.md) —
                    // pas de shape "Outil" générique à renommer à la main : on demande
                    // le nom tout de suite et on le fait passer par
                    // toolsApi.createOrGet, qui dédoublonne (recherche insensible à la
                    // casse côté backend) plutôt que de laisser passer du texte libre.
                    const typed = window.prompt('Nom de l\'applicatif :', '');
                    if (!typed || !typed.trim()) return; // annulé — ne rien créer

                    let toolName = typed.trim();
                    try {
                        const { toolsApi } = await import('@/lib/toolsApi');
                        const res = await toolsApi.createOrGet(toolName);
                        toolName = res.tool.name;
                    } catch {
                        // Référentiel indisponible — on garde la saisie plutôt que de
                        // bloquer l'utilisateur (même repli que ToolPicker.tsx).
                    }

                    try {
                        const modeling = modeler.get('modeling');
                        const elementFactory = modeler.get('elementFactory');
                        const moddle = modeler.get('moddle');

                        const toolId = `Tool_${Date.now()}`;
                        const bo = moddle.create('bpmn:ServiceTask', {
                            id: toolId,
                            name: toolName,
                        });

                        const shape = elementFactory.createShape({
                            type: 'bpmn:ServiceTask',
                            id: toolId,
                            businessObject: bo,
                            width: 140,
                            height: 28,
                        });

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

                /* ── Palette : masquable, jamais plus haute que le diagramme ── */
                .pm-palette-hidden .djs-palette { display: none; }
                .djs-palette { max-height: calc(100% - 40px); overflow-y: auto; overflow-x: hidden; }

                /* ── Palette : groupe ProcessMate (icônes bpmn-js standard) ── */
                .djs-palette .entry[data-action="processmate.tool"] { color: #1a7a5e; }
                .djs-palette .entry.pm-entry-active { color: #2C7BE5 !important; background: #eff6ff; }
                .pm-link-mode .djs-hit { cursor: crosshair !important; }
                .djs-shape.pm-link-source .djs-visual > rect { stroke: #2C7BE5 !important; stroke-width: 2.5px !important; stroke-dasharray: 4 2; }

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

                /* ── Surbrillance : élément récemment modifié par l'IA ── */
                .djs-element.ai-changed-highlight .djs-visual > rect,
                .djs-element.ai-changed-highlight .djs-visual > circle,
                .djs-element.ai-changed-highlight .djs-visual > polygon {
                    stroke: #0B6E80 !important;
                    stroke-width: 3px !important;
                    stroke-dasharray: 7 4 !important;
                }
            `}</style>
        </div>
    );
});

BpmnEditor.displayName = 'BpmnEditor';
export default BpmnEditor;
// Rendu ProcessMate des logigrammes (celui du Studio) : en-têtes de couloirs colorés, couloirs externes en gris,
// tâches externes en orange, applicatifs (barre verte et roue, ou capsule en Vue IT), liens d'applicatif pleins.
// Partagé par l'éditeur (BpmnEditor) et les vues en lecture (StepLinkedDiagram : Vue d'ensemble, Irritants et
// pistes), pour qu'un logigramme ait partout la même allure.

/** Modules bpmn-js à passer en `additionalModules` (Modeler ou Viewer). Chargement côté client seulement. */
export async function loadPmRenderModules(): Promise<{ laneHeaderModule: any; linkRendererModule: any }> {
    const [{ default: BaseRenderer }, { is }, { attr: svgAttr, create: svgCreate }] = await Promise.all([
        import('diagram-js/lib/draw/BaseRenderer'),
        import('bpmn-js/lib/util/ModelUtil'),
        import('tiny-svg'),
    ]);

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

    // ── Couleur lane externe ──────────────────────────────
    const LANE_EXTERNE_COLOR = '#94a3b8'; // slate-400, unique pour tous les acteurs externes

    // ── Couleur outil HOPEX ──────────────────────────────
    const TOOL_COLOR = '#1a7a5e';   // vert foncé style HOPEX
    const TOOL_STROKE = '#1a7a5e';

    // SVG path roue dentée 12×12 centrée sur (6,6)
    const GEAR_PATH = 'M7.5 4.5A1.5 1.5 0 0 0 6 3a1.5 1.5 0 0 0-1.5 1.5 1.5 1.5 0 0 0 1.5 1.5 1.5 1.5 0 0 0 1.5-1.5zM6 1c.3 0 .6.03.88.08l.34 1.02a.85.85 0 0 0 1.06.54l1-.38c.46.35.84.79 1.12 1.3l-.6.88a.85.85 0 0 0 .18 1.14l.9.65c.04.27.06.55.06.83s-.02.56-.06.83l-.9.65a.85.85 0 0 0-.18 1.14l.6.88c-.28.51-.66.95-1.12 1.3l-1-.38a.85.85 0 0 0-1.06.54l-.34 1.02A5 5 0 0 1 6 13a5 5 0 0 1-.88-.08l-.34-1.02a.85.85 0 0 0-1.06-.54l-1 .38c-.46-.35-.84-.79-1.12-1.3l.6-.88a.85.85 0 0 0-.18-1.14l-.9-.65A5 5 0 0 1 1 7c0-.28.02-.56.06-.83l.9-.65A.85.85 0 0 0 2.14 4.38l-.6-.88C1.82 3 2.2 2.56 2.66 2.21l1 .38a.85.85 0 0 0 1.06-.54l.34-1.02A5 5 0 0 1 6 1z';

    function isToolElement(element: any): boolean {
        return (
            is(element, 'bpmn:ServiceTask') &&
            typeof element.id === 'string' &&
            // Tool_ = satellite annoté sous une tâche métier (comportement
            // existant, ToolConnectionBehavior plus bas le convertit en
            // association dès qu'une connexion le touche). ToolNode_ = nœud
            // principal de la Vue outillage (generateBPMNOutillage.ts) — un
            // préfixe DÉLIBÉRÉMENT différent : s'il partageait "Tool_", chaque
            // sequenceFlow réel touchant ce nœud se ferait supprimer et
            // remplacer par une association auto-routée (ligne diagonale) par
            // ToolConnectionBehavior, qui ne sait pas faire la distinction.
            (element.id.startsWith('Tool_') || element.id.startsWith('ToolNode_'))
        );
    }

    // Un Tool_ "satellite" (annoté sous une tâche métier, ~140×28) contre un
    // Tool_ "nœud principal" (Vue outillage : generateBPMNOutillage.ts, taille
    // d'une tâche) — même id/type, styles volontairement différents : le
    // satellite reste discret sous la tâche, le nœud principal doit se voir de
    // loin comme "ce n'est pas une tâche".
    function isLargeToolNode(element: any): boolean {
        return (element.height || 0) > 40;
    }

    // Couleur par identité d'outil — mêmes noms connus que
    // ApplicatifsPanel.tsx/GrapheApplicatifs.tsx (à garder cohérent visuellement
    // avec la Cartographie applicative), plus un repli par hash de nom pour tout
    // outil non répertorié, pour ne pas retomber sur une couleur unique partout.
    const KNOWN_TOOL_COLORS: [string, string][] = [
        ['nov@', '#059669'], ['nova', '#059669'],
        ['swift', '#1e40af'],
        ['ti+', '#7c3aed'], ['tiplus', '#7c3aed'],
        ['evolan', '#0891b2'],
        ['email', '#d97706'], ['mail', '#d97706'], ['outlook', '#d97706'],
        ['sap', '#ca8a04'],
        ['docflow', '#db2777'],
        ['crm', '#4f46e5'],
    ];
    const FALLBACK_PALETTE = ['#0d9488', '#65a30d', '#9333ea', '#e11d48', '#0369a1', '#a16207'];
    function colorForTool(name: string): string {
        const lower = (name || '').toLowerCase();
        for (const [key, color] of KNOWN_TOOL_COLORS) {
            if (lower.includes(key)) return color;
        }
        let hash = 0;
        for (let i = 0; i < lower.length; i++) hash = (hash * 31 + lower.charCodeAt(i)) >>> 0;
        return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
    }

    // Détecte si une lane est externe via la convention Lane_ext_
    function isExternalLane(element: any): boolean {
        return (
            is(element, 'bpmn:Lane') &&
            typeof element.id === 'string' &&
            element.id.startsWith('Lane_ext_')
        );
    }

    // Détecte si un élément Task est dans une lane externe
    function isExternalTask(element: any): boolean {
        if (!is(element, 'bpmn:UserTask') && !is(element, 'bpmn:Task')) return false;
        const lane = element.parent;
        return isExternalLane(lane);
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
                isToolElement(element) ||
                isExternalTask(element)   // ← AJOUT
            );
        }

        drawShape(parentNode: SVGElement, element: any) {
            // ── Outil, nœud principal (Vue outillage) : capsule colorée sans
            // bordure — pas un rectangle de tâche. Couleur par identité d'outil,
            // roue blanche, texte blanc centré.
            if (isToolElement(element) && isLargeToolNode(element)) {
                while (parentNode.firstChild) parentNode.removeChild(parentNode.firstChild);
                const w = element.width || 220;
                const h = element.height || 60;
                const label = element.businessObject?.name || '';
                const color = colorForTool(label);

                const capsule = svgCreate('rect') as SVGRectElement;
                svgAttr(capsule, {
                    x: 0, y: 0, width: w, height: h,
                    rx: h / 2, ry: h / 2, // capsule, pas un rectangle à angles droits
                    fill: color,
                    stroke: 'none',
                });
                parentNode.appendChild(capsule);

                const gearGroup = svgCreate('g') as SVGGElement;
                svgAttr(gearGroup, { transform: `translate(${h / 2 - 8}, ${h / 2 - 8}) scale(1.3)`, 'pointer-events': 'none' });
                const gearIcon = svgCreate('path') as SVGPathElement;
                svgAttr(gearIcon, { d: GEAR_PATH, fill: '#ffffff', 'fill-opacity': '0.85' });
                gearGroup.appendChild(gearIcon);
                parentNode.appendChild(gearGroup);

                const text = svgCreate('text') as SVGTextElement;
                svgAttr(text, {
                    x: w / 2 + 8, y: h / 2 + 1,
                    fill: '#ffffff', 'font-size': '13', 'font-weight': '700',
                    'font-family': 'system-ui, sans-serif',
                    'text-anchor': 'middle', 'dominant-baseline': 'central',
                    'pointer-events': 'none',
                });
                text.textContent = label;
                parentNode.appendChild(text);

                return parentNode as any;
            }
            // ── Outil, satellite (annoté sous une tâche métier) : barre verte +
            // roue + texte noir ──
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
            // ── Tâche externe : fond orange ──
            if (isExternalTask(element)) {
                const shape = this.bpmnRenderer.drawShape(parentNode, element);
                setTimeout(() => {
                    const rect = parentNode.querySelector('.djs-visual rect');
                    if (rect) {
                        rect.setAttribute('fill', '#f97316');
                        rect.setAttribute('fill-opacity', '0.15');
                        rect.setAttribute('stroke', '#f97316');
                        rect.setAttribute('stroke-width', '2');
                    }
                }, 20);
                return shape;
            }

            const shape = this.bpmnRenderer.drawShape(parentNode, element);

            if (is(element, 'bpmn:Lane')) {
                const external = isExternalLane(element);
                const fillColor = external
                    ? LANE_EXTERNE_COLOR
                    : LANE_COLORS[this._getLaneIndex(element) % LANE_COLORS.length].fill;
                const isVertical = element.height > element.width;

                const rect = svgCreate('rect') as SVGRectElement;
                svgAttr(rect, {
                    x: 0,
                    y: 0,
                    width: isVertical ? element.width : 30,
                    height: isVertical ? 30 : element.height,
                    fill: fillColor,
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
                    .filter((c: any) => is(c, 'bpmn:Lane') && !isExternalLane(c))
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

    return { laneHeaderModule, linkRendererModule };
}

/** Styles qui accompagnent le rendu (liens d'applicatif pleins, sans flèche ; mention bpmn.io masquée). */
export const PM_DIAGRAM_CSS = `
    .bjs-powered-by { display: none !important; }
    .djs-connection[data-element-id^="ToolAssoc_"] .djs-visual path {
        stroke: #000000 !important; stroke-dasharray: 0 !important; stroke-width: 1.5px !important; fill: none !important;
    }
    .djs-connection[data-element-id^="ToolAssoc_"] .djs-visual path[marker-end] { marker-end: url(#none) !important; }
`;

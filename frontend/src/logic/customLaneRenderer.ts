// customLaneRenderer.ts - CUSTOM RENDERER POUR LANES COLORÉES
// Approche officielle bpmn-js pour personnaliser le rendu des lanes

import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import { append as svgAppend, create as svgCreate, attr as svgAttr, classes as svgClasses } from 'tiny-svg';
import { LANE_COLORS } from './bpmnConstants';

const HIGH_PRIORITY = 1500; // Plus prioritaire que le renderer par défaut (1000)

/**
 * Custom Renderer pour les lanes BPMN
 * - Ajoute des headers colorés en haut de chaque lane
 * - Change la couleur du texte en blanc
 * - Intégré au cycle de rendu de bpmn-js (pas de manipulation DOM après coup)
 */
class CustomLaneRenderer extends BaseRenderer {
    private bpmnRenderer: any;
    private canvas: any;
    private laneColorMap: Map<string, { stroke: string; strokeWidth: string }>;
    private laneIndexMap: Map<string, number>;

    constructor(eventBus: any, bpmnRenderer: any, canvas: any) {
        super(eventBus, HIGH_PRIORITY);

        this.bpmnRenderer = bpmnRenderer;
        this.canvas = canvas;
        this.laneColorMap = new Map();
        this.laneIndexMap = new Map();
    }

    /**
     * Détermine si ce renderer doit gérer cet élément
     */
    canRender(element: any): boolean {
        // On ne gère QUE les lanes
        return element.type === 'bpmn:Lane';
    }

    /**
     * Dessine la lane avec son header coloré
     */
    drawShape(parentNode: any, element: any): any {
        // 1. Laisser le renderer par défaut dessiner la structure de base
        const shape = this.bpmnRenderer.drawShape(parentNode, element);

        // 2. Obtenir la couleur pour cette lane
        const color = this.getLaneColor(element);
        const laneIndex = this.getLaneIndex(element);

        // 3. Créer le rectangle de header coloré
        const headerHeight = 100;
        const headerRect = svgCreate('rect');

        svgAttr(headerRect, {
            x: 0,
            y: 0,
            width: element.width,
            height: headerHeight,
            fill: color.stroke,
            opacity: '0.95',
        });

        // Ajouter une classe pour le ciblage CSS
        svgClasses(headerRect).add('lane-header-bg');
        svgClasses(headerRect).add(`lane-header-${laneIndex}`);

        // 4. Insérer le header AVANT la bordure de la lane
        parentNode.insertBefore(headerRect, parentNode.firstChild);

        // 5. Modifier le style du texte pour qu'il soit blanc
        this.styleLaneLabel(parentNode, element);

        return shape;
    }

    /**
     * Style le label de la lane (texte en blanc)
     */
    private styleLaneLabel(parentNode: any, element: any): void {
        const labelGroup = parentNode.querySelector('.djs-label');

        if (!labelGroup) return;

        // Texte principal
        const textElement = labelGroup.querySelector('text');
        if (textElement) {
            svgAttr(textElement, {
                fill: '#ffffff',
                'font-weight': '700',
                'font-size': '18px'
            });
        }

        // Tous les tspans (lignes multiples)
        const tspans = labelGroup.querySelectorAll('tspan');
        tspans.forEach((tspan: any) => {
            svgAttr(tspan, {
                fill: '#ffffff',
                'font-weight': '700'
            });
        });
    }

    /**
     * Obtient la couleur assignée à cette lane (avec cache)
     */
    private getLaneColor(laneElement: any): { stroke: string; strokeWidth: string } {
        // Utiliser le cache si disponible
        if (this.laneColorMap.has(laneElement.id)) {
            return this.laneColorMap.get(laneElement.id)!;
        }

        // Calculer l'index et la couleur
        const laneIndex = this.getLaneIndex(laneElement);
        const color = LANE_COLORS[laneIndex % LANE_COLORS.length];

        // Mettre en cache
        this.laneColorMap.set(laneElement.id, color);

        return color;
    }

    /**
     * Obtient l'index de la lane (position horizontale de gauche à droite)
     */
    private getLaneIndex(laneElement: any): number {
        // Utiliser le cache si disponible
        if (this.laneIndexMap.has(laneElement.id)) {
            return this.laneIndexMap.get(laneElement.id)!;
        }

        // Récupérer toutes les lanes et les trier par position X
        const allLanes = this.getAllLanes();
        const index = allLanes.findIndex((lane: any) => lane.id === laneElement.id);

        // Mettre en cache
        if (index !== -1) {
            this.laneIndexMap.set(laneElement.id, index);
        }

        return index !== -1 ? index : 0;
    }

    /**
     * Récupère toutes les lanes du diagramme, triées par position X
     */
    private getAllLanes(): any[] {
        const elementRegistry = this.canvas._elementRegistry;

        const lanes = elementRegistry.filter((element: any) => {
            return element.type === 'bpmn:Lane';
        });

        // Trier par position X (de gauche à droite)
        lanes.sort((a: any, b: any) => a.x - b.x);

        return lanes;
    }
}

/**
 * Module bpmn-js pour intégrer le Custom Renderer
 * Usage: additionalModules: [customLaneRendererModule]
 */
export const customLaneRendererModule = {
    __init__: ['customLaneRenderer'],
    customLaneRenderer: ['type', CustomLaneRenderer]
};

export default CustomLaneRenderer;
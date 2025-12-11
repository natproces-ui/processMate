// index.ts - Point d'entrée unifié pour tous les modules BPMN

// ============================================================================
// CONSTANTES
// ============================================================================
export {
    DEFAULT_DIMENSIONS,
    LANE_COLORS,
    BPMN_ELEMENT_PREFIXES,
    BPMN_TYPES
} from './bpmnConstants';

// ============================================================================
// UTILITAIRES
// ============================================================================
export {
    getLaneId,
    escapeXml,
    getElementId,
    getElementIdFromString,
    formatLaneNameForDisplay,
    getCenterPosition,
    isChangingLane,
    isBackwardFlow,
    calculateLaneChangeWaypoints,
    calculateBackwardWaypoints
} from './bpmnUtils';

export type { ElementDimensions } from './bpmnUtils';

// ============================================================================
// STYLES
// ============================================================================
export { BPMN_VIEWER_STYLES } from './bpmnStyles';

// ============================================================================
// MOTEUR DE LAYOUT
// ============================================================================
export {
    BPMNLayoutEngine
} from './bpmnLayoutEngine';

export type {
    Table1Row,
    NodePosition,
    LayoutConfig
} from './bpmnLayoutEngine';

// ============================================================================
// GÉNÉRATEUR BPMN
// ============================================================================
export {
    BPMNGenerator,
    generateBPMN
} from './bpmnGenerator';

export type {
    Table1Row as BPMNRow // Alias pour éviter confusion
} from './bpmnGenerator';

// ============================================================================
// VIEWER REACT
// ============================================================================
export { default as BPMNViewer } from '@/components/BPMNViewer';

// ============================================================================
// EXEMPLE D'UTILISATION COMPLÈTE
// ============================================================================

/**
 * @example
 * // Import des composants principaux
 * import { BPMNGenerator, BPMNViewer, DEFAULT_DIMENSIONS } from './bpmn';
 * 
 * // Génération de BPMN
 * const data: Table1Row[] = [
 *   { id: '1', étape: 'Début', typeBpmn: 'StartEvent', ... }
 * ];
 * 
 * const generator = new BPMNGenerator({
 *   laneWidth: DEFAULT_DIMENSIONS.LANE_WIDTH,
 *   nodeWidth: DEFAULT_DIMENSIONS.NODE_WIDTH
 * });
 * 
 * const xml = generator.generate(data);
 * 
 * // Affichage dans React
 * function App() {
 *   return <BPMNViewer xml={xml} height="800px" />;
 * }
 */

/**
 * @example
 * // Import des utilitaires uniquement
 * import { getLaneId, escapeXml, LANE_COLORS } from './bpmn';
 * 
 * const laneId = getLaneId("Service Client");
 * // => "Lane_Service_Client"
 * 
 * const safeText = escapeXml("<tag>");
 * // => "&lt;tag&gt;"
 * 
 * const color = LANE_COLORS[0];
 * // => { fill: 'transparent', stroke: '#c3ccd4ff', ... }
 */

/**
 * @example
 * // Import du layout engine uniquement
 * import { BPMNLayoutEngine, type NodePosition } from './bpmn';
 * 
 * const engine = new BPMNLayoutEngine();
 * const positions: Map<string, NodePosition> = engine.calculateLayout(data);
 * 
 * const pos = positions.get('1');
 * // => { x: 150, y: 200, layer: 0, laneIndex: 0, acteur: "Service Client" }
 */
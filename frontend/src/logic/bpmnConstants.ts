// bpmnConstants.ts - Constantes partagées BPMN

export const DEFAULT_DIMENSIONS = {
    LANE_WIDTH: 450,
    NODE_WIDTH: 180,
    NODE_HEIGHT: 90,
    GATEWAY_SIZE: 65,
    EVENT_SIZE: 46,
    VERTICAL_SPACING: 120,
    HORIZONTAL_SPACING: 80,
    MARGIN_LEFT: 150,
    MARGIN_TOP: 100,
    LANE_LABEL_OFFSET: 150, // Offset pour le label de lane
    ANNOTATION_WIDTH: 120,
    ANNOTATION_HEIGHT: 45,
    ANNOTATION_OFFSET: 12,
} as const;

export const LANE_COLORS = [
    { fill: 'transparent', stroke: '#c3ccd4ff', strokeWidth: '4', labelBg: '#e5e7eb' },
    { fill: 'transparent', stroke: '#F57C00', strokeWidth: '4', labelBg: '#FFF3E0' },
    { fill: 'transparent', stroke: '#7B1FA2', strokeWidth: '4', labelBg: '#F3E5F5' },
    { fill: 'transparent', stroke: '#388E3C', strokeWidth: '4', labelBg: '#E8F5E9' },
    { fill: 'transparent', stroke: '#C2185B', strokeWidth: '4', labelBg: '#FCE4EC' },
    { fill: 'transparent', stroke: '#F9A825', strokeWidth: '4', labelBg: '#FFF9C4' },
] as const;

export const BPMN_ELEMENT_PREFIXES = {
    START: 'Start_',
    END: 'End_',
    TASK: 'Task_',
    GATEWAY: 'Gateway_',
    ANNOTATION: 'Annotation_',
    LANE: 'Lane_',
    FLOW: 'Flow_',
    ASSOCIATION: 'Association_',
} as const;

export const BPMN_TYPES = {
    START_EVENT: 'StartEvent',
    END_EVENT: 'EndEvent',
    USER_TASK: 'UserTask',
    TASK: 'Task',
    EXCLUSIVE_GATEWAY: 'ExclusiveGateway',
} as const;
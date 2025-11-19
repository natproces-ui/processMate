// Types pour le flowchart
export interface LayerData {
    component?: string;
    description: string;
    input?: any;
    output?: any;
    calls?: string[];
    error_handling?: string;
}

export interface WorkflowStep {
    étape: string;
    acteur: string;
    output?: string;
    calls?: string;
    conditions?: Condition[];
}

export interface Condition {
    if: string;
    then: string;
}

export interface FlowchartData {
    process_name: string;
    objectif_metier?: string;
    layers: Record<string, LayerData>;
    gestion_campagnes: Record<string, WorkflowStep[]>;
    conditions_globales: Condition[];
}

export interface NodeStyle {
    background: string;
    borderRadius?: string;
    padding: string;
    border: string;
}

export type NodeStyleMap = Record<string, NodeStyle>;
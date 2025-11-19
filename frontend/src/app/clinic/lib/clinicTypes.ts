// Types et interfaces pour Clinic

// ---- STATISTICS ----
export interface Statistics {
    total_lines: number;
    statement_count: number;
    root_type: string;
    filename: string;
    procedures_count: number;
    global_variables_count: number;
    functions_called_count: number;
    file_size?: number;
    parsed_at: string;
}

// ---- BUSINESS INFO ----
export interface BusinessProcedure {
    name: string;
    parameters: string[];
    body_statements: number;
}

export interface DataStructure {
    name: string;
    type: string;
}

export interface BusinessInfo {
    global_variables: string[];
    functions_called: string[];
    procedures: BusinessProcedure[];
    api_calls: string[];
    business_functions: string[];
    data_structures: DataStructure[];
}

// ---- PARSED DATA ----
export interface ParsedData {
    ast: any;
    statistics: Statistics;
    business_info: BusinessInfo;
}

// ---- BPMN ----
export interface BPMNActor {
    id: string;
    name: string;
    type: string;
}

export interface BPMNActivity {
    id: string;
    name: string;
    type: string;
    actor: string;
    description: string;
}

export interface BPMNFlow {
    id: string;
    source: string;
    target: string;
    condition?: string;
}

export interface BPMNProcess {
    id: string;
    name: string;
    description: string;
    category: string;
    actors: BPMNActor[];
    activities: BPMNActivity[];
    flows: BPMNFlow[];
}

export interface BPMNInsights {
    total_processes: number;
    complexity: string;
    recommendations: string[];
}

export interface BPMNData {
    processes: BPMNProcess[];
    insights: BPMNInsights;
}

// ---- UI STATES ----
export type ProcessingStep =
    | 'idle'
    | 'parsing'
    | 'generating'
    | 'analyzing_docs'
    | 'completed';

export type Mode = 'flowchart' | 'bpmn';

// ---- FLOWCHART GENERATION PARAMS ----
export interface GenerateFlowchartParams {
    file: File;
    setCurrentStep: (step: ProcessingStep) => void;
    setParsedData: (data: ParsedData | null) => void;
    setFlowchartImageUrl: (url: string) => void;
    setDotSource: (source: string) => void;
    setCurrentFileName: (name: string) => void;
    setSuccess: (message: string) => void;
    setError: (message: string) => void;
}

// ---- BPMN GENERATION PARAMS ----
export interface GenerateBPMNParams {
    files: File[];
    setCurrentStep: (step: ProcessingStep) => void;
    setBpmnData: (data: BPMNData | null) => void;
    setBpmnXml: (xml: string) => void;
    setSuccess: (message: string) => void;
    setError: (message: string) => void;
}
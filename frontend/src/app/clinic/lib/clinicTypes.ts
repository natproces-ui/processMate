// Types et interfaces pour Clinic

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

export interface BusinessInfo {
    global_variables: string[];
    functions_called: string[];
    procedures: Array<{
        name: string;
        parameters: string[];
        body_statements: number;
    }>;
    api_calls: string[];
    business_functions: string[];
    data_structures: Array<{
        name: string;
        type: string;
    }>;
}

export interface ParsedData {
    ast: any;
    statistics: Statistics;
    business_info: BusinessInfo;
}

export interface BPMNProcess {
    id: string;
    name: string;
    description: string;
    category: string;
    actors: Array<{
        id: string;
        name: string;
        type: string;
    }>;
    activities: Array<{
        id: string;
        name: string;
        type: string;
        actor: string;
        description: string;
    }>;
    flows: Array<{
        id: string;
        source: string;
        target: string;
        condition?: string;
    }>;
}

export interface BPMNData {
    processes: BPMNProcess[];
    insights: {
        total_processes: number;
        complexity: string;
        recommendations: string[];
    };
}

export type ProcessingStep = 'idle' | 'parsing' | 'generating' | 'analyzing_docs' | 'completed';
export type Mode = 'flowchart' | 'bpmn';

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

export interface GenerateBPMNParams {
    files: File[];
    setCurrentStep: (step: ProcessingStep) => void;
    setBpmnData: (data: BPMNData | null) => void;
    setBpmnXml: (xml: string) => void;
    setSuccess: (message: string) => void;
    setError: (message: string) => void;
}
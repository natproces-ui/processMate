import { API_CONFIG } from './api-config';
const BASE = API_CONFIG.baseUrl;

export type IntentType = 'regulatory_impact' | 'compliance_check' | 'gap_analysis' | 'comparison' | 'coverage_check' | 'general_analysis';
export type CoverageStatus = 'couvert' | 'partiel' | 'manquant' | 'non_applicable';
export type Criticality = 'low' | 'medium' | 'high' | 'critical';
export type Partie = 'caracteristiques' | 'qualite' | 'diagramme' | 'descriptions' | 'outils';

export interface ProcedureCandidate {
    id: string;
    session_id?: string;
    nom: string;
    ref?: string;
    category?: string;
    description?: string;
    version?: number;
    created_at?: string;
}

export interface AnalysisSession {
    id: string; title: string; procedure_ids: string[];
    artifact_count: number; created_at: string; updated_at: string;
    messages?: AnalysisMessage[];
}
export interface AnalysisMessage {
    id: string; session_id: string; role: 'user' | 'assistant';
    content: string; sources_meta: SourceMeta[];
    artifact_id?: string | null; created_at: string;
}
export interface SourceMeta { filename: string; mime_type: string; size: number; mode?: string; }
export interface AnalysisArtifact {
    id: string; session_id: string; intent_type: IntentType;
    intent_label: string; instruction_summary: string;
    analysis_json?: AnalysisJSON; procedure_ids: string[];
    excel_template: string; created_at: string;
}
export interface AnalysisJSON {
    intent?: { type: string; label: string; confidence: number; instruction_summary: string };
    summary?: { global_assessment: string; sources_identified: string[]; procedures_impacted_count: number; procedures_not_impacted: string[] };
    analysis?: AnalysisItem[];
    analysis_log?: AnalysisLogEntry[];
    open_questions?: OpenQuestion[];
}
export interface AnalysisItem {
    impact_id?: string; impact_theme?: string; partie?: Partie;
    procedure_id: string; procedure_nom: string; procedure_ref: string;
    source_element: string; source_ref: string; coverage_status: CoverageStatus;
    procedure_section: string; gap?: string | null; business_impact: string;
    si_impact: string; impacted_systems: string[];
    modification?: Modification;
    recommended_actions: RecommendedAction[];
    external_dependency?: string | null; criticality: Criticality;
    confidence: number; rationale: string;
}
export interface Modification {
    title?: string;
    target_step_id?: string | null;
    target_field?: string;
    operation_type?: 'add' | 'update' | 'delete' | 'move' | 'relink';
    current_value?: string | null;
    proposed_value?: string;
    rationale?: string;
    // Uniquement si operation_type=add : description complète de la nouvelle étape,
    // trop riche pour tenir dans le champ scalaire proposed_value.
    new_row?: NewRow;
    after_id?: string;
    // Uniquement si operation_type=relink : nouveaux liens sortants de l'étape.
    outputs?: { targetId: string; label: string }[];
}
export interface NewRow {
    id: string;
    étape: string;
    typeBpmn: 'StartEvent' | 'EndEvent' | 'Task' | 'UserTask' | 'ExclusiveGateway' | 'ParallelGateway' | 'InclusiveGateway';
    acteur: string;
    département?: string;
    typeActeur?: 'interne' | 'externe' | '';
    condition?: string;
    outputs?: { targetId: string; label: string }[];
    outil?: string;
}
export interface RecommendedAction { title: string; description?: string; owner_type?: string; priority?: Criticality; }
export interface AnalysisLogEntry { procedure_id?: string; procedure_nom?: string; examined_sections?: string[]; findings?: string; points_analyzed?: number; rationale?: string; }
export interface OpenQuestion { question: string; target?: string; blocking?: boolean; }
async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
    if (!res.ok) { const err = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(err.detail ?? `Erreur ${res.status}`); }
    return res.json();
}

export const analysisApi = {
    listSessions: () => fetchJSON<{ success: boolean; sessions: AnalysisSession[]; total: number }>('/api/analysis/sessions'),
    createSession: (title: string, procedure_ids: string[] = []) => fetchJSON<{ success: boolean; session: AnalysisSession }>('/api/analysis/sessions', { method: 'POST', body: JSON.stringify({ title, procedure_ids }) }),
    getSession: (sessionId: string) => fetchJSON<{ success: boolean; session: AnalysisSession }>(`/api/analysis/sessions/${sessionId}`),
    updateSession: (sessionId: string, body: { title?: string; procedure_ids?: string[] }) => fetchJSON<{ success: boolean }>(`/api/analysis/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteSession: (sessionId: string) => fetchJSON<{ success: boolean }>(`/api/analysis/sessions/${sessionId}`, { method: 'DELETE' }),

    analyze: async (sessionId: string, instruction: string, procedureIds: string[], files: File[]) => {
        const form = new FormData();
        form.append('instruction', instruction);
        form.append('procedure_ids', JSON.stringify(procedureIds));
        for (const file of files) form.append('files', file);
        const res = await fetch(`${BASE}/api/analysis/sessions/${sessionId}/analyze`, { method: 'POST', body: form });
        if (!res.ok) { const err = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(err.detail ?? `Erreur ${res.status}`); }
        return res.json() as Promise<{ success: boolean; artifact: AnalysisArtifact; message: AnalysisMessage; model_used?: string; sources_meta: SourceMeta[] }>;
    },

    listMessages: (sessionId: string) => fetchJSON<{ success: boolean; messages: AnalysisMessage[] }>(`/api/analysis/sessions/${sessionId}/messages`),

    chatStreamUrl: (sessionId: string, message: string, artifactId?: string) => {
        const params = new URLSearchParams({ message });
        if (artifactId) params.set('artifact_id', artifactId);
        return `${BASE}/api/analysis/sessions/${sessionId}/chat/stream?${params}`;
    },

    listArtifacts: (sessionId: string) => fetchJSON<{ success: boolean; artifacts: AnalysisArtifact[] }>(`/api/analysis/sessions/${sessionId}/artifacts`),
    getArtifact: (artifactId: string) => fetchJSON<{ success: boolean; artifact: AnalysisArtifact }>(`/api/analysis/artifacts/${artifactId}`),

    createTasks: async (
        artifactId: string,
        body: { assigned_by: string; default_assigned_to: string; only_high_priority?: boolean }
    ) => {
        const res = await fetch(`${BASE}/api/analysis/artifacts/${artifactId}/create-tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(err.detail ?? `Erreur ${res.status}`);
        }
        return res.json() as Promise<{ success: boolean; tasks: unknown[]; total: number }>;
    },

    exportExcel: async (artifactId: string, filename: string) => {
        const res = await fetch(`${BASE}/api/analysis/artifacts/${artifactId}/export-excel`);
        if (!res.ok) { const err = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(err.detail ?? `Erreur ${res.status}`); }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename || 'analyse.xlsx';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    },
};

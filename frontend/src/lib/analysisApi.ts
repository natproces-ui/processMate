import { API_CONFIG } from './api-config';
const BASE = API_CONFIG.baseUrl;

export type IntentType = 'regulatory_impact' | 'compliance_check' | 'gap_analysis' | 'comparison' | 'coverage_check' | 'general_analysis';
export type CoverageStatus = 'couvert' | 'partiel' | 'manquant' | 'non_applicable';
export type Criticality = 'low' | 'medium' | 'high' | 'critical';

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
    procedure_id: string; procedure_nom: string; procedure_ref: string;
    source_element: string; source_ref: string; coverage_status: CoverageStatus;
    procedure_section: string; gap?: string | null; business_impact: string;
    si_impact: string; impacted_systems: string[];
    recommended_actions: RecommendedAction[];
    external_dependency?: string | null; criticality: Criticality;
    confidence: number; rationale: string;
}
export interface RecommendedAction { title: string; description?: string; owner_type?: string; priority?: Criticality; }
export interface AnalysisLogEntry { procedure_id?: string; procedure_nom?: string; examined_sections?: string[]; findings?: string; points_analyzed?: number; rationale?: string; }
export interface OpenQuestion { question: string; target?: string; blocking?: boolean; }
export type TaskCandidateStatus = 'suggested' | 'selected' | 'converted' | 'dismissed';
export interface TaskCandidate {
    id: string;
    source_key: string;
    artifact_id: string;
    analysis_item_index: number;
    task_index: number;
    procedure_id: string;
    procedure_nom?: string;
    procedure_ref?: string;
    procedure_section?: string;
    title: string;
    description: string;
    owner_type?: string;
    raci_role?: 'R' | 'A' | 'C' | 'I';
    task_type?: 'formalization' | 'review' | 'validation' | 'consultation' | 'information' | 'correction' | 'other';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    criticality?: Criticality;
    status: TaskCandidateStatus;
    task_id?: string | null;
    dismissed_reason?: string | null;
}

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
    listTaskCandidates: (artifactId: string) =>
        fetchJSON<{ success: boolean; candidates: TaskCandidate[]; total: number }>(
            `/api/analysis/artifacts/${artifactId}/task-candidates`
        ),
    updateTaskCandidate: (artifactId: string, candidateId: string, body: { status?: TaskCandidateStatus; task_id?: string; dismissed_reason?: string }) =>
        fetchJSON<{ success: boolean; candidate: TaskCandidate }>(
            `/api/analysis/artifacts/${artifactId}/task-candidates/${candidateId}`,
            { method: 'PATCH', body: JSON.stringify(body) }
        ),

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

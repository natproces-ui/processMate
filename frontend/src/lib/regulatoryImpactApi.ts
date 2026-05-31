import { API_CONFIG } from './api-config';

const BASE = API_CONFIG.baseUrl;

export type CampaignStatus = 'draft' | 'ready' | 'analyzing' | 'analyzed' | 'archived';
export type SourceType = 'text' | 'pdf' | 'mixed';
export type ImpactStatus = 'draft' | 'to_review' | 'validated' | 'rejected' | 'converted';
export type ImpactCriticality = 'low' | 'medium' | 'high' | 'critical';

export interface RegulatoryProcedureCandidate {
  id: string;
  session_id?: string;
  nom: string;
  ref?: string;
  category?: string;
  description?: string;
  version?: number;
  created_at?: string;
}

export interface RegulatoryAnalysisQuestion {
  target?: string;
  question?: string;
  blocking?: boolean;
}

export interface RegulatoryAnalysisSummary {
  global_assessment?: string;
  regulatory_subject?: string;
  procedures_impacted_count?: number;
  procedures_not_impacted?: string[];
  dependencies?: string[];
}

export interface AnalysisLogEntry {
  procedure_id?: string;
  procedure_nom?: string;
  examined_sections?: string[];
  findings?: string;
  impacts_created?: number;
  rationale?: string;
}

export interface RegulatoryLastAnalysis {
  procedure_ids?: string[];
  procedures_analyzed?: Array<{ id: string; nom: string; steps_count: number }>;
  model_used?: string;
  summary?: RegulatoryAnalysisSummary;
  analysis_log?: AnalysisLogEntry[];
  open_questions?: RegulatoryAnalysisQuestion[];
  impacts_count?: number;
  raw_impacts_count?: number;
  unresolved_impacts?: Array<Record<string, unknown>>;
}

export interface RegulatoryCampaign {
  id: string;
  title: string;
  description: string;
  source_type: SourceType;
  law_text?: string;
  source_filename?: string | null;
  source_mime?: string | null;
  source_storage_path?: string | null;
  status: CampaignStatus;
  created_by: string;
  metadata?: Record<string, unknown> & { last_analysis?: RegulatoryLastAnalysis };
  impacts?: RegulatoryImpact[];
  created_at?: string;
  updated_at?: string;
}

export interface RecommendedAction {
  title: string;
  description?: string;
  owner_type?: 'metier' | 'si' | 'juridique' | 'organisation' | 'externe';
  priority?: ImpactCriticality;
}

export interface RegulatoryImpact {
  id: string;
  campaign_id: string;
  procedure_id?: string | null;
  procedure_nom: string;
  procedure_ref?: string;
  category: string;
  theme: string;
  regulatory_change: string;
  business_impact: string;
  si_impact: string;
  impacted_systems: string[];
  recommended_actions: RecommendedAction[];
  external_dependency?: string | null;
  criticality: ImpactCriticality;
  confidence: number;
  law_reference: string;
  procedure_section: string;
  rationale: string;
  status: ImpactStatus;
  source: string;
  reviewer_comment?: string | null;
  reviews?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ImpactChatMessage {
  id?: string;
  impact_id?: string;
  role: 'user' | 'assistant';
  content: string;
  intent?: string;
  created_at?: string;
}

export interface AnalysisResult {
  success: boolean;
  summary: Record<string, unknown>;
  analysis_log?: AnalysisLogEntry[];
  open_questions: Array<Record<string, unknown>>;
  impacts: RegulatoryImpact[];
  model_used?: string;
}

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `Erreur ${res.status}`);
  }
  return res.json();
}

export const regulatoryImpactApi = {
  listProcedures: () =>
    fetchJSON<{ success: boolean; procedures: RegulatoryProcedureCandidate[]; total: number }>(
      '/api/orchestration/procedures'
    ),

  listCampaigns: (status?: CampaignStatus) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return fetchJSON<{ success: boolean; campaigns: RegulatoryCampaign[]; total: number }>(
      `/api/regulatory-impact/campaigns${query}`
    );
  },

  createCampaign: (body: {
    title: string;
    description?: string;
    source_type?: SourceType;
    law_text?: string;
    created_by?: string;
  }) =>
    fetchJSON<{ success: boolean; campaign: RegulatoryCampaign }>(
      '/api/regulatory-impact/campaigns',
      { method: 'POST', body: JSON.stringify(body) }
    ),

  getCampaign: (campaignId: string, withImpacts = true) =>
    fetchJSON<{ success: boolean; campaign: RegulatoryCampaign }>(
      `/api/regulatory-impact/campaigns/${campaignId}?with_impacts=${withImpacts}`
    ),

  updateSourceText: (campaignId: string, law_text: string) =>
    fetchJSON<{ success: boolean }>(
      `/api/regulatory-impact/campaigns/${campaignId}/source-text`,
      { method: 'POST', body: JSON.stringify({ law_text }) }
    ),

  uploadSourceFile: async (campaignId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/api/regulatory-impact/campaigns/${campaignId}/source-file`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail ?? `Erreur ${res.status}`);
    }
    return res.json() as Promise<{ success: boolean; mode: string; filename: string; storage_path?: string }>;
  },

  analyzeCampaign: (campaignId: string, procedure_ids: string[]) =>
    fetchJSON<AnalysisResult>(
      `/api/regulatory-impact/campaigns/${campaignId}/analyze`,
      { method: 'POST', body: JSON.stringify({ procedure_ids }) }
    ),

  listImpacts: (campaignId: string, status?: ImpactStatus) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return fetchJSON<{ success: boolean; impacts: RegulatoryImpact[]; total: number }>(
      `/api/regulatory-impact/campaigns/${campaignId}/impacts${query}`
    );
  },

  updateImpact: (impactId: string, body: Partial<RegulatoryImpact>) =>
    fetchJSON<{ success: boolean }>(
      `/api/regulatory-impact/impacts/${impactId}`,
      { method: 'PATCH', body: JSON.stringify(body) }
    ),

  reviewImpact: (impactId: string, body: { status: ImpactStatus; reviewer?: string; comment?: string }) =>
    fetchJSON<{ success: boolean }>(
      `/api/regulatory-impact/impacts/${impactId}/review`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  // ─── Approfondir ──────────────────────────────────────────

  getImpactMessages: (impactId: string) =>
    fetchJSON<{ success: boolean; messages: ImpactChatMessage[] }>(
      `/api/regulatory-impact/impacts/${impactId}/messages`
    ),

  approfondirStreamUrl: (impactId: string, message: string) =>
    `${BASE}/api/regulatory-impact/impacts/${impactId}/approfondir/stream?message=${encodeURIComponent(message)}`,

  // ─── Export Excel ────────────────────────────────────────

  exportExcelUrl: (campaignId: string) =>
    `${BASE}/api/regulatory-impact/campaigns/${campaignId}/export-excel`,

  exportExcel: async (campaignId: string, filename: string) => {
    const res = await fetch(`${BASE}/api/regulatory-impact/campaigns/${campaignId}/export-excel`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail ?? `Erreur ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'analyse_impact.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // ─── Tâches ───────────────────────────────────────────────

  createTasks: (
    campaignId: string,
    body: { assigned_by: string; default_assigned_to: string; impact_ids?: string[]; only_validated?: boolean }
  ) =>
    fetchJSON<{ success: boolean; tasks: unknown[]; total: number }>(
      `/api/regulatory-impact/campaigns/${campaignId}/create-tasks`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
};
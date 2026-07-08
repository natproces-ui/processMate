// lib/orchestrationApi.ts
import { API_CONFIG } from './api-config';

const BASE = API_CONFIG.baseUrl;

// ─── Types ────────────────────────────────────────────────────

export interface LifecycleStage {
  id: string;
  title: string;
  description: string;
  workshop: string;
  workshop_done: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  completed_at: string | null;
  notes: string;
}

export interface Remark {
  id: string;
  author: string;
  content: string;
  type: 'remark' | 'modification_request' | 'approval';
  created_at: string;
  resolved: boolean;
  resolved_at?: string;
}

export interface RACIData {
  people: string[];
  matrix: Record<string, string>;
}

export interface ProcedureVersion {
  id: string;
  version: number;
  date: string;
  status: string;
}

export interface Procedure {
  id: string;
  session_id: string;
  nom: string;
  ref: string;
  version: number;
  status: string;
  category: string;
  description: string;
  lastModified: string;
  is_finalized: boolean;
  finalized_at: string | null;
  remarks_count: number;
  has_unsaved_changes?: boolean;
  taxonomy_id?: string | null;
  lifecycle_stages: LifecycleStage[];
  raci: RACIData;
  metadata: Record<string, unknown>;
  versions?: ProcedureVersion[];
  workflow_json?: any[];
  enrichments_json?: Record<string, any>;
}

export interface OrchestrationStats {
  total: number;
  en_cours: number;
  en_validation: number;
  en_revision: number;
  validees: number;
  bloquees: number;
  finalisees: number;
  by_status: Record<string, number>;
}

export interface ExtractedWorkflowStep {
  id: string;
  étape: string;
  typeBpmn: string;
  département: string;
  acteur: string;
  typeActeur: string;
  condition: string;
  outputs: Array<{ targetId: string; label: string }>;
  outil: string;
}

export interface ExtractedEnrichment {
  id: string;
  descriptif: string;
  applicatif: string;
  declencheur: string;
  duree_estimee: string;
  frequence: string;
  kpi: string;
}

export interface ExtractedProcedureMeta {
  nom?: string;
  ref?: string;
  version?: string;
  pole?: string;
  direction?: string;
  objet?: string;
  perimeter?: string;
  regles_gestion?: string | string[];
  abbreviations?: Array<{ abrv: string; signification: string }>;
  definitions?: Array<{ terme: string; definition: string }>;
  responsabilites_internes?: string[];
  responsabilites_externes?: string[];
  references?: string;
}

export interface ExtractedProcedure {
  title: string;
  procedureMetadata: ExtractedProcedureMeta;
  workflow: ExtractedWorkflowStep[];
  enrichments: Record<string, ExtractedEnrichment>;
  source_filename?: string;
}

export const VALID_STATUSES = [
  'Brouillon', 'En cours', 'En validation',
  'Retours reçus', 'En révision', 'Validée', 'Rejetée', 'Bloquée',
] as const;

export type ProcedureStatus = typeof VALID_STATUSES[number];

export const RACI_ROLES = ['R', 'A', 'C', 'I', '-'] as const;
export type RACIRole = typeof RACI_ROLES[number];

export const PROCEDURE_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Validée:          { bg: 'bg-green-100',  text: 'text-green-800' },
  'En validation':  { bg: 'bg-blue-100',   text: 'text-blue-800' },
  'En révision':    { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'En cours':       { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  Brouillon:        { bg: 'bg-gray-100',   text: 'text-gray-600' },
  Rejetée:          { bg: 'bg-red-100',    text: 'text-red-800' },
  'Retours reçus':  { bg: 'bg-orange-100', text: 'text-orange-800' },
  Bloquée:          { bg: 'bg-red-200',    text: 'text-red-900' },
};

export const procedureStatusCls = (status: string): string => {
  const c = PROCEDURE_STATUS_COLORS[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
  return `${c.bg} ${c.text}`;
};

export const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

export const fmtDateTime = (d: string | null | undefined): string => {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  display_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  job_title?: string | null;
  department?: string | null;
  entity?: string | null;
  global_role: 'admin' | 'process_owner' | 'validator' | 'contributor' | 'viewer';
  status: 'active' | 'invited' | 'suspended';
  manager_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ProcedureAssignment {
  id?: string;
  procedure_id?: string;
  user_id: string;
  raci_role?: 'R' | 'A' | 'C' | 'I' | null;
  assignment_type: 'owner' | 'validator' | 'reviewer' | 'contributor' | 'observer';
  stage_id?: string | null;
  workflow_step_id?: string | null;
  is_required?: boolean;
  due_date?: string | null;
  user_profiles?: UserProfile;
}

export interface RACIProcedure {
  id: string;
  nom: string;
  people: string[];
  matrix: Record<string, string>;
  assignments?: Array<{
    assignment_id?: string;
    user_id: string;
    name: string;
    email?: string | null;
    job_title?: string | null;
    department?: string | null;
    raci_role?: 'R' | 'A' | 'C' | 'I' | null;
    assignment_type?: string;
    stage_id?: string | null;
    workflow_step_id?: string | null;
    is_required?: boolean;
    due_date?: string | null;
  }>;
  is_finalized: boolean;
  source?: 'metadata_json' | 'procedure_assignments';
}

export interface ValidationReview {
  id?: string;
  procedure_id: string;
  reviewer_id: string;
  decision: 'pending' | 'approved' | 'changes_requested' | 'rejected';
  comment?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  user_profiles?: UserProfile;
}

// ─── Client ────────────────────────────────────────────────────

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      signal: options?.signal ?? controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail ?? `Erreur ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(tid);
  }
}

export const orchestrationApi = {
  // ── Liste & Stats ──
  listProcedures: () =>
    fetchJSON<{ success: boolean; procedures: Procedure[]; total: number }>('/api/orchestration/procedures'),

  getStats: () =>
    fetchJSON<{ success: boolean; stats: OrchestrationStats }>('/api/orchestration/stats'),

  // ── Détail ──
  getProcedure: (id: string) =>
    fetchJSON<{ success: boolean; procedure: Procedure }>(`/api/orchestration/procedures/${id}`),

  // ── CRUD ──
  createProcedure: (body: { nom: string; ref?: string; category?: string; description?: string; taxonomy_id?: string }) =>
    fetchJSON<{ success: boolean; procedure: Procedure }>('/api/orchestration/procedures', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateProcedure: (id: string, body: { nom?: string; ref?: string; category?: string; description?: string; status?: string }) =>
    fetchJSON<{ success: boolean }>(`/api/orchestration/procedures/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteProcedure: (id: string) =>
    fetchJSON<{ success: boolean }>(`/api/orchestration/procedures/${id}`, { method: 'DELETE' }),

  // ── Statut ──
  updateStatus: (id: string, status: ProcedureStatus, comment?: string) =>
    fetchJSON<{ success: boolean; status: string }>(`/api/orchestration/procedures/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, comment }),
    }),

  // ── Remarques ──
  getRemarks: (id: string) =>
    fetchJSON<{ success: boolean; remarks: Remark[] }>(`/api/orchestration/procedures/${id}/remarks`),

  addRemark: (id: string, body: { author: string; content: string; type?: string }) =>
    fetchJSON<{ success: boolean; remark: Remark }>(`/api/orchestration/procedures/${id}/remarks`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  resolveRemark: (id: string, remarkId: string) =>
    fetchJSON<{ success: boolean }>(`/api/orchestration/procedures/${id}/remarks/${remarkId}/resolve`, {
      method: 'PATCH',
    }),

  // ── RACI ──
  getGlobalRaci: () =>
    fetchJSON<{ success: boolean; all_people: string[]; procedures: RACIProcedure[] }>('/api/orchestration/raci'),

  updateRaci: (id: string, people: string[], matrix: Record<string, string>) =>
    fetchJSON<{ success: boolean; mode?: string; count?: number }>(`/api/orchestration/procedures/${id}/raci`, {
      method: 'PATCH',
      body: JSON.stringify({ people, matrix }),
    }),

  updateRaciAssignments: (id: string, assignments: ProcedureAssignment[]) =>
    fetchJSON<{ success: boolean; mode?: string; count?: number }>(`/api/orchestration/procedures/${id}/raci`, {
      method: 'PATCH',
      body: JSON.stringify({ assignments }),
    }),

  // ── Utilisateurs & validations ──
  listUsers: (filters?: { q?: string; department?: string; role?: string; active_only?: boolean }) => {
    const params = new URLSearchParams();
    if (filters?.q) params.set('q', filters.q);
    if (filters?.department) params.set('department', filters.department);
    if (filters?.role) params.set('role', filters.role);
    if (filters?.active_only !== undefined) params.set('active_only', String(filters.active_only));

    const query = params.toString();
    return fetchJSON<{ success: boolean; users: UserProfile[]; total: number }>(
      `/api/orchestration/users${query ? `?${query}` : ''}`
    );
  },

  updateUserProfile: (id: string, body: Partial<UserProfile>) =>
    fetchJSON<{ success: boolean }>(`/api/orchestration/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  getProcedureAssignments: (id: string) =>
    fetchJSON<{ success: boolean; assignments: ProcedureAssignment[]; total: number }>(
      `/api/orchestration/procedures/${id}/assignments`
    ),

  updateProcedureAssignments: (id: string, assignments: ProcedureAssignment[]) =>
    fetchJSON<{ success: boolean; count: number }>(`/api/orchestration/procedures/${id}/assignments`, {
      method: 'PATCH',
      body: JSON.stringify({ assignments }),
    }),

  getValidationReviews: (id: string) =>
    fetchJSON<{ success: boolean; reviews: ValidationReview[]; total: number }>(
      `/api/orchestration/procedures/${id}/validation-reviews`
    ),

  upsertValidationReview: (
    id: string,
    body: { reviewer_id: string; decision: ValidationReview['decision']; comment?: string | null }
  ) =>
    fetchJSON<{ success: boolean; review: ValidationReview }>(
      `/api/orchestration/procedures/${id}/validation-reviews`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  // ── Cycle de vie ──
  updateLifecycle: (id: string, stages: Array<{ id: string; status: string; workshop_done: boolean; notes: string; completed_at?: string }>) =>
    fetchJSON<{ success: boolean; lifecycle_stages: LifecycleStage[] }>(`/api/orchestration/procedures/${id}/lifecycle`, {
      method: 'PATCH',
      body: JSON.stringify({ stages }),
    }),

  // ── Évolution ──
  getEvolution: () =>
    fetchJSON<{ success: boolean; evolution: Array<{ month: string; validated: number; inProgress: number; pending: number }> }>('/api/orchestration/evolution'),

  // ── Sauvegarde workflow ──
  saveWorkflowData: (id: string, workflow_json: unknown[], enrichments_json: Record<string, unknown>, procedure_metadata_json?: Record<string, unknown>, bpmn_xml?: string | null) =>
    fetchJSON<{ success: boolean; workflow_id: string }>(`/api/orchestration/procedures/${id}/workflow`, {
      method: 'PATCH',
      body: JSON.stringify({ workflow_json, enrichments_json, procedure_metadata_json, bpmn_xml }),
    }),

  // ── Finalisation ──
  finalizeProcedure: (id: string) =>
    fetchJSON<{ success: boolean; finalized_at: string }>(`/api/orchestration/procedures/${id}/finalize`, {
      method: 'POST',
    }),

  getCategories: () =>
    fetchJSON<{ success: boolean; categories: string[] }>('/api/orchestration/categories'),

  // ── Irritants ──
  listIrritants: (filters?: { categorie?: string; criticite?: string; statut?: string }) => {
    const params = new URLSearchParams();
    if (filters?.categorie) params.set('categorie', filters.categorie);
    if (filters?.criticite) params.set('criticite', filters.criticite);
    if (filters?.statut) params.set('statut', filters.statut);
    return fetchJSON<{ success: boolean; irritants: any[]; total: number }>(`/api/irritants?${params}`);
  },

  createIrritant: (body: {
    titre: string; description?: string; categorie: string;
    procedure_id?: string; procedure_nom?: string; etape_liee?: string;
    criticite?: string; statut?: string;
  }) =>
    fetchJSON<{ success: boolean; irritant: any }>('/api/irritants', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateIrritant: (id: string, body: Record<string, unknown>) =>
    fetchJSON<{ success: boolean }>(`/api/irritants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteIrritant: (id: string) =>
    fetchJSON<{ success: boolean }>(`/api/irritants/${id}`, { method: 'DELETE' }),

  addCommentaire: (id: string, auteur: string, contenu: string) =>
    fetchJSON<{ success: boolean; commentaires: any[] }>(`/api/irritants/${id}/commentaires`, {
      method: 'POST',
      body: JSON.stringify({ auteur, contenu }),
    }),

  detectIrritantsUrl: (procedureId: string) =>
    `${BASE}/api/irritants/detect/${procedureId}/stream`,

  listIrritantsByProcedure: () =>
    fetchJSON<{ success: boolean; groups: any[]; total: number }>('/api/irritants/by-procedure'),

  // ── Import PDF (two-step) ──
  extractPdf: async (file: File): Promise<{ success: boolean; extracted: ExtractedProcedure; steps_count: number }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/api/orchestration/procedures/extract-pdf`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail ?? `Erreur ${res.status}`);
    }
    return res.json();
  },

  importFromExtraction: (nom: string, categorie: string, source_filename: string, extracted: ExtractedProcedure) =>
    fetchJSON<{ success: boolean; procedure: Procedure; steps_count: number }>('/api/orchestration/procedures/import-pdf', {
      method: 'POST',
      body: JSON.stringify({ nom, categorie, source_filename, extracted }),
    }),

  getProcedureJourney: (id: string) =>
    fetchJSON<{
      success: boolean;
      procedure_id: string;
      events: any[];
      total: number;
      current_status: string | null;
      lifecycle_stages: Array<{
        id: string; title: string; description: string;
        workshop: string; workshop_done: boolean;
        status: 'pending' | 'in_progress' | 'completed';
        completed_at: string | null; notes: string;
      }>;
      pause_reason?: string;
      arbitrage_reason?: string;
      arbitrage_escalated_to?: string;
    }>(`/api/orchestration/procedures/${id}/journey`),

  pauseProcedure: (id: string, reason: string, actorId?: string) =>
    fetchJSON<{ success: boolean; status: string }>(`/api/orchestration/procedures/${id}/pause`, {
      method: 'POST',
      body: JSON.stringify({ reason, actor_id: actorId }),
    }),

  resumeProcedure: (id: string, actorId?: string, comment?: string) =>
    fetchJSON<{ success: boolean; status: string }>(`/api/orchestration/procedures/${id}/resume`, {
      method: 'POST',
      body: JSON.stringify({ actor_id: actorId, comment }),
    }),

  requestArbitrage: (id: string, reason: string, actorId?: string, escalatedTo?: string) =>
    fetchJSON<{ success: boolean; status: string }>(`/api/orchestration/procedures/${id}/arbitrage`, {
      method: 'POST',
      body: JSON.stringify({ reason, actor_id: actorId, escalated_to: escalatedTo }),
    }),

  resolveArbitrage: (id: string, resolution: string, resumeStatus: string, actorId?: string) =>
    fetchJSON<{ success: boolean; status: string }>(`/api/orchestration/procedures/${id}/arbitrage/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution, resume_status: resumeStatus, actor_id: actorId }),
    }),

  migrateLifecycleStages: () =>
    fetchJSON<{ success: boolean; updated: number; total: number }>(
      '/api/orchestration/procedures/migrate-lifecycle-stages',
      { method: 'POST' }
    ),
};

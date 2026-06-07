'use client';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
      signal: init?.signal ?? controller.signal,
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

// ─── Types ────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'active' | 'completed' | 'archived' | 'blocked' | 'on_hold';
export type CampaignProcedureStatus = 'pending' | 'in_progress' | 'formalized' | 'validated' | 'skipped';

export interface CampaignProcedure {
  id: string;
  campaign_id: string;
  procedure_id: string;
  procedure_nom: string;
  procedure_ref: string;
  status: CampaignProcedureStatus;
  assigned_to: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignStats {
  total: number;
  done: number;
  in_progress: number;
  pending: number;
  progress_pct: number;
}

export interface Campaign {
  id: string;
  title: string;
  description: string | null;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  coordinator_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  procedures?: CampaignProcedure[];
  stats: CampaignStats;
}

// ─── API ──────────────────────────────────────────────────────

export const campaignsApi = {
  list: () =>
    fetchJSON<{ success: boolean; campaigns: Campaign[] }>('/api/campaigns'),

  get: (id: string) =>
    fetchJSON<{ success: boolean; campaign: Campaign }>(`/api/campaigns/${id}`),

  create: (body: { title: string; description?: string; start_date?: string; end_date?: string; coordinator_id?: string }) =>
    fetchJSON<{ success: boolean; campaign: Campaign }>('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (id: string, body: { title?: string; description?: string; start_date?: string; end_date?: string; coordinator_id?: string; status?: CampaignStatus }) =>
    fetchJSON<{ success: boolean }>(`/api/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: (id: string) =>
    fetchJSON<{ success: boolean }>(`/api/campaigns/${id}`, { method: 'DELETE' }),

  launch: (id: string) =>
    fetchJSON<{ success: boolean; status: string }>(`/api/campaigns/${id}/launch`, { method: 'POST' }),

  close: (id: string) =>
    fetchJSON<{ success: boolean; status: string }>(`/api/campaigns/${id}/close`, { method: 'POST' }),

  block: (id: string) =>
    fetchJSON<{ success: boolean; status: string }>(`/api/campaigns/${id}/block`, { method: 'POST' }),

  pause: (id: string) =>
    fetchJSON<{ success: boolean; status: string }>(`/api/campaigns/${id}/pause`, { method: 'POST' }),

  resume: (id: string) =>
    fetchJSON<{ success: boolean; status: string }>(`/api/campaigns/${id}/resume`, { method: 'POST' }),

  sync: (id: string) =>
    fetchJSON<{ success: boolean; synced: number }>(`/api/campaigns/${id}/sync`, { method: 'POST' }),

  addProcedures: (id: string, procedure_ids: string[]) =>
    fetchJSON<{ success: boolean; added: number; skipped: number }>(`/api/campaigns/${id}/procedures`, {
      method: 'POST',
      body: JSON.stringify({ procedure_ids }),
    }),

  removeProcedure: (campaignId: string, procedureId: string) =>
    fetchJSON<{ success: boolean }>(`/api/campaigns/${campaignId}/procedures/${procedureId}`, { method: 'DELETE' }),

  updateProcedure: (campaignId: string, procedureId: string, body: { status?: CampaignProcedureStatus; assigned_to?: string; notes?: string }) =>
    fetchJSON<{ success: boolean }>(`/api/campaigns/${campaignId}/procedures/${procedureId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};

// ─── Helpers ──────────────────────────────────────────────────

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft:     'Brouillon',
  active:    'En cours',
  completed: 'Terminé',
  archived:  'Archivé',
  blocked:   'Bloqué',
  on_hold:   'En pause',
};

export const CAMPAIGN_STATUS_COLORS: Record<CampaignStatus, { bg: string; text: string; dot: string }> = {
  draft:     { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
  active:    { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500'   },
  completed: { bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500'  },
  archived:  { bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-400'  },
  blocked:   { bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-500'    },
  on_hold:   { bg: 'bg-purple-50',  text: 'text-purple-700', dot: 'bg-purple-400' },
};

export const PROC_STATUS_LABELS: Record<CampaignProcedureStatus, string> = {
  pending:    'En attente',
  in_progress:'En cours',
  formalized: 'Formalisée',
  validated:  'Validée',
  skipped:    'Ignorée',
};

export const PROC_STATUS_COLORS: Record<CampaignProcedureStatus, { bg: string; text: string }> = {
  pending:    { bg: 'bg-gray-100',   text: 'text-gray-600' },
  in_progress:{ bg: 'bg-blue-100',   text: 'text-blue-700' },
  formalized: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  validated:  { bg: 'bg-green-100',  text: 'text-green-700' },
  skipped:    { bg: 'bg-amber-50',   text: 'text-amber-600' },
};

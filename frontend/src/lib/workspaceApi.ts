'use client';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 120_000);
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

export type RevisionDiagnostic = 'bon' | 'acceptable' | 'a_ameliorer' | 'insuffisant';
export type RevisionPointType   = 'lacune' | 'ambiguite' | 'non_conformite' | 'amelioration' | 'erreur';
export type RevisionPointStatus = 'pending' | 'noted' | 'dismissed';
export type RevisionCriticite   = 'haute' | 'moyenne' | 'faible';

export interface RevisionPoint {
  id: string;
  section: string;
  type: RevisionPointType;
  constat: string;
  suggestion: string;
  criticite: RevisionCriticite;
  status: RevisionPointStatus;
}

export interface RevisionSession {
  session_id: string;
  procedure_id: string;
  procedure_nom: string;
  diagnostic_global: RevisionDiagnostic;
  resume: string;
  points: RevisionPoint[];
}

export interface RevisionRequest {
  procedure_id: string;
  nom: string;
  ref?: string;
  objet?: string;
  perimetre?: string;
  acteurs?: string;
  regles_gestion?: string[];
  workflow_steps?: Record<string, unknown>[];
  enrichments?: Record<string, unknown>;
  lifecycle_stages?: Record<string, unknown>[];
}

// ─── API ──────────────────────────────────────────────────────

export const workspaceApi = {
  revise: (req: RevisionRequest) =>
    fetchJSON<RevisionSession & { success: boolean }>('/api/workspace/revise', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  updateRevisionPoint: (sessionId: string, pointId: string, status: RevisionPointStatus) =>
    fetchJSON<{ success: boolean }>(`/api/workspace/revise/${sessionId}/points/${pointId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};

// ─── Helpers visuels ──────────────────────────────────────────

export const DIAGNOSTIC_CONFIG: Record<RevisionDiagnostic, { label: string; color: string; bg: string }> = {
  bon:          { label: 'Bon',          color: 'text-green-700',  bg: 'bg-green-50 border-green-200'  },
  acceptable:   { label: 'Acceptable',   color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200'    },
  a_ameliorer:  { label: 'À améliorer',  color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200'},
  insuffisant:  { label: 'Insuffisant',  color: 'text-red-700',    bg: 'bg-red-50 border-red-200'      },
};

export const POINT_TYPE_LABELS: Record<RevisionPointType, string> = {
  lacune:         'Lacune',
  ambiguite:      'Ambiguïté',
  non_conformite: 'Non-conformité',
  amelioration:   'Amélioration',
  erreur:         'Erreur',
};

export const POINT_TYPE_COLORS: Record<RevisionPointType, string> = {
  lacune:         'bg-orange-50 text-orange-700',
  ambiguite:      'bg-yellow-50 text-yellow-700',
  non_conformite: 'bg-red-50 text-red-700',
  amelioration:   'bg-blue-50 text-blue-700',
  erreur:         'bg-red-100 text-red-800',
};

export const CRIT_BADGE: Record<RevisionCriticite, string> = {
  haute:   'bg-red-100 text-red-700',
  moyenne: 'bg-orange-50 text-orange-700',
  faible:  'bg-gray-100 text-gray-600',
};

export const POINT_STATUS_COLORS: Record<RevisionPointStatus, string> = {
  pending:   'bg-orange-50 text-orange-700',
  noted:     'bg-green-50 text-green-700',
  dismissed: 'bg-gray-100 text-gray-400',
};

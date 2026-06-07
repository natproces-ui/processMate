'use client';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 180_000); // 3 min pour l'analyse IA
  try {
    const res = await fetch(`${BASE}${path}`, {
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

export type RemarkType =
  | 'surlignement' | 'manuscrit' | 'rature' | 'soulignement'
  | 'encadrement' | 'diagramme' | 'commentaire';

export type RemarkStatus = 'pending' | 'treated' | 'ignored';
export type RemarkCriticite = 'haute' | 'moyenne' | 'faible';

export interface Remark {
  id: string;
  page: number;
  type: RemarkType;
  zone: string;
  texte_concerne: string;
  interpretation: string;
  suggestion: string;
  criticite: RemarkCriticite;
  status: RemarkStatus;
}

export interface CorrectionsSession {
  session_id: string;
  filename: string;
  document_title: string;
  total_pages: number;
  remarks: Remark[];
  synthese: string;
}

// ─── API ──────────────────────────────────────────────────────

export const correctionsApi = {
  analyze: async (file: File): Promise<CorrectionsSession> => {
    const form = new FormData();
    form.append('file', file);
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 180_000);
    try {
      const res = await fetch(`${BASE}/api/corrections/analyze`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? `Erreur ${res.status}`);
      }
      return res.json();
    } finally {
      clearTimeout(tid);
    }
  },

  getSession: (sessionId: string) =>
    fetchJSON<CorrectionsSession & { success: boolean }>(`/api/corrections/sessions/${sessionId}`),

  updateRemarkStatus: (sessionId: string, remarkId: string, status: RemarkStatus) =>
    fetchJSON<{ success: boolean }>(`/api/corrections/sessions/${sessionId}/remarks/${remarkId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),

  downloadReport: async (sessionId: string, title: string) => {
    const res = await fetch(`${BASE}/api/corrections/sessions/${sessionId}/report`);
    if (!res.ok) throw new Error('Erreur lors de la génération du rapport');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `corrections_${title.replace(/\s+/g, '_').slice(0, 40)}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

// ─── Helpers ──────────────────────────────────────────────────

export const REMARK_TYPE_LABELS: Record<RemarkType, string> = {
  surlignement: 'Surlignement',
  manuscrit:    'Manuscrit',
  rature:       'Rature',
  soulignement: 'Soulignement',
  encadrement:  'Encadrement',
  diagramme:    'Diagramme',
  commentaire:  'Commentaire',
};

export const REMARK_TYPE_COLORS: Record<RemarkType, { bg: string; text: string; dot: string }> = {
  surlignement: { bg: 'bg-yellow-50',  text: 'text-yellow-800', dot: 'bg-yellow-400' },
  manuscrit:    { bg: 'bg-blue-50',    text: 'text-blue-800',   dot: 'bg-blue-500'   },
  rature:       { bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-400'    },
  soulignement: { bg: 'bg-purple-50',  text: 'text-purple-700', dot: 'bg-purple-400' },
  encadrement:  { bg: 'bg-orange-50',  text: 'text-orange-700', dot: 'bg-orange-400' },
  diagramme:    { bg: 'bg-teal-50',    text: 'text-teal-700',   dot: 'bg-teal-400'   },
  commentaire:  { bg: 'bg-gray-100',   text: 'text-gray-700',   dot: 'bg-gray-400'   },
};

export const CRITICITE_COLORS: Record<RemarkCriticite, { text: string; badge: string }> = {
  haute:   { text: 'text-red-600',    badge: 'bg-red-50 text-red-700'    },
  moyenne: { text: 'text-orange-600', badge: 'bg-orange-50 text-orange-700' },
  faible:  { text: 'text-green-600',  badge: 'bg-green-50 text-green-700' },
};

export const STATUS_LABELS: Record<RemarkStatus, string> = {
  pending:  'En attente',
  treated:  'Traité',
  ignored:  'Ignoré',
};

export const STATUS_COLORS: Record<RemarkStatus, string> = {
  pending:  'bg-orange-50 text-orange-700',
  treated:  'bg-green-50 text-green-700',
  ignored:  'bg-gray-100 text-gray-500',
};

'use client';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 120_000); // 2min pour la génération Gemini
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScopeType = 'theme' | 'category' | 'subcategory' | 'procedures';
export type SpecStatus = 'draft' | 'validated' | 'archived';

export interface SpecificationSummary {
  id: string;
  scope_type: ScopeType;
  scope_id: string | null;
  scope_name: string;
  title: string;
  style: string;
  status: SpecStatus;
  version: number;
  procedure_ids: string[];
  generated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Specification extends SpecificationSummary {
  sfd_json: Record<string, unknown>;
  chat_history: ChatMessage[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SFDTheme {
  name: string;
  label: string;
}

export interface GenerateRequest {
  scope_type: ScopeType;
  scope_id?: string;
  procedure_ids?: string[];
  title?: string;
  style?: string;
  user_instructions?: string;
  source_files?: File[];
  source_urls?: string[];
}

export interface GenerateResponse {
  success: boolean;
  specification: Specification;
  procedure_count: number;
}

export interface ChatRequest {
  message: string;
  chat_history?: ChatMessage[];
}

export interface ChatResponse {
  success: boolean;
  agent_message: string;
  sections_modified: string[];
  sfd_json: Record<string, unknown>;
}

// ─── API Client ───────────────────────────────────────────────────────────────

const API = '/api/orchestration/specifications';

export const specificationsApi = {
  /** Lister les specs (allégé, sans sfd_json) */
  list(params?: { status?: SpecStatus; scope_type?: ScopeType }) {
    const qs = new URLSearchParams();
    if (params?.status)     qs.set('status', params.status);
    if (params?.scope_type) qs.set('scope_type', params.scope_type);
    const query = qs.toString() ? `?${qs}` : '';
    return fetchJSON<{ success: boolean; specifications: SpecificationSummary[] }>(
      `${API}${query}`
    );
  },

  /** Générer un nouveau SFD depuis un scope (multipart/form-data) */
  generate(body: GenerateRequest) {
    const fd = new FormData();
    fd.append('scope_type', body.scope_type);
    if (body.scope_id)          fd.append('scope_id', body.scope_id);
    if (body.procedure_ids)     fd.append('procedure_ids', JSON.stringify(body.procedure_ids));
    if (body.title)             fd.append('title', body.title);
    if (body.style)             fd.append('style', body.style);
    if (body.user_instructions) fd.append('user_instructions', body.user_instructions);
    if (body.source_urls?.length) fd.append('source_urls', JSON.stringify(body.source_urls));
    for (const f of body.source_files ?? []) fd.append('source_files', f);

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 120_000);
    return fetch(`${BASE}${API}/generate`, { method: 'POST', body: fd, signal: controller.signal })
      .then(async res => {
        clearTimeout(tid);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error((err as any).detail ?? `Erreur ${res.status}`);
        }
        return res.json() as Promise<GenerateResponse>;
      })
      .catch(err => { clearTimeout(tid); throw err; });
  },

  /** Récupérer une spec complète (avec sfd_json) */
  get(id: string) {
    return fetchJSON<{ success: boolean; specification: Specification }>(`${API}/${id}`);
  },

  /** URL du preview HTML (à utiliser dans un <iframe> ou window.open) */
  previewUrl(id: string) {
    return `${BASE}${API}/${id}/preview`;
  },

  /** Exporter en Word — ouvre le téléchargement */
  async exportDocx(id: string, title: string) {
    const res = await fetch(`${BASE}${API}/${id}/export`, { method: 'POST' });
    if (!res.ok) throw new Error(`Export échoué (${res.status})`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${title.replace(/\s+/g, '_').slice(0, 60)}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /** Chat de raffinement */
  chat(id: string, body: ChatRequest) {
    return fetchJSON<ChatResponse>(`${API}/${id}/chat`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  /** Changer le thème visuel */
  updateStyle(id: string, style: string) {
    return fetchJSON<{ success: boolean; style: string }>(`${API}/${id}/style`, {
      method: 'PATCH',
      body: JSON.stringify({ style }),
    });
  },

  /** Changer le statut */
  updateStatus(id: string, status: SpecStatus) {
    return fetchJSON<{ success: boolean; status: SpecStatus }>(
      `${API}/${id}/status?status=${status}`,
      { method: 'PATCH' }
    );
  },

  /** Supprimer */
  delete(id: string) {
    return fetchJSON<{ success: boolean }>(`${API}/${id}`, { method: 'DELETE' });
  },

  /** Lister les thèmes */
  themes() {
    return fetchJSON<{ success: boolean; themes: SFDTheme[] }>(`${API}/themes`);
  },
};

// lib/toolsApi.ts — Référentiel d'outils (voir referentiel-outils.md).
// Même conventions que orchestrationApi.ts (fetchJSON, API_CONFIG).

import { API_CONFIG } from './api-config';

const BASE = API_CONFIG.baseUrl;

// ─── Types ────────────────────────────────────────────────────

export interface Tool {
  id: string;
  name: string;
  color: string | null;
}

export type ToolFieldType = 'texte' | 'nombre' | 'date' | 'liste';

export interface ToolScreenField {
  id: string;
  screen_id: string;
  name: string;
  field_type: ToolFieldType;
  required: boolean;
  example_value: string | null;
  sort_order: number;
}

export interface ToolScreen {
  id: string;
  tool_id: string;
  name: string;
  description: string | null;
  screenshot_path: string | null;
  fields: ToolScreenField[];
}

export type ToolCodeType = 'transaction' | 'produit' | 'erreur' | 'informatique';

export interface ToolCode {
  id: string;
  tool_id: string;
  code_type: ToolCodeType;
  code: string;
  /** Pertinent seulement pour code_type === 'informatique' (ex: SQL, COBOL, API REST). */
  language: string | null;
  description: string | null;
}

export interface ToolDetail {
  tool: Tool;
  screens: ToolScreen[];
  codes: ToolCode[];
}

export interface ExtractedField {
  name: string;
  field_type: ToolFieldType;
  required: boolean;
  example_value: string;
}

// ─── Fetch helper — même pattern que orchestrationApi.ts ──────

async function fetchJSON<T>(path: string, options?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
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

export const toolsApi = {
  // ── Outils : recherche / chercher-ou-créer (picker) ──
  search: (q: string, limit = 20) => {
    const params = new URLSearchParams({ q, limit: String(limit) });
    return fetchJSON<{ success: boolean; tools: Tool[]; total: number }>(`/api/tools?${params}`);
  },

  createOrGet: (name: string, color?: string) =>
    fetchJSON<{ success: boolean; tool: Tool; created: boolean }>('/api/tools', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),

  getDetail: (toolId: string) =>
    fetchJSON<{ success: boolean } & ToolDetail>(`/api/tools/${toolId}`),

  // ── Écrans ──
  addScreen: async (toolId: string, name: string, description: string, screenshot?: File) => {
    const form = new FormData();
    form.append('name', name);
    form.append('description', description);
    if (screenshot) form.append('screenshot', screenshot);
    // Upload multipart — pas fetchJSON, qui force Content-Type: application/json et
    // casserait le boundary multipart (voir MultiDocUpload.tsx pour le même pattern).
    const res = await fetch(`${BASE}/api/tools/${toolId}/screens`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail ?? `Erreur ${res.status}`);
    return data as { success: boolean; screen: ToolScreen };
  },

  screenshotUrl: (screenId: string) => `${BASE}/api/tools/screens/${screenId}/screenshot`,

  deleteScreen: (screenId: string) =>
    fetchJSON<{ success: boolean }>(`/api/tools/screens/${screenId}`, { method: 'DELETE' }),

  // ── Champs ──
  addField: (screenId: string, field: Omit<ToolScreenField, 'id' | 'screen_id' | 'sort_order'>) =>
    fetchJSON<{ success: boolean; field: ToolScreenField }>(`/api/tools/screens/${screenId}/fields`, {
      method: 'POST',
      body: JSON.stringify(field),
    }),

  updateField: (fieldId: string, patch: Partial<Omit<ToolScreenField, 'id' | 'screen_id'>>) =>
    fetchJSON<{ success: boolean; field: ToolScreenField }>(`/api/tools/fields/${fieldId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  deleteField: (fieldId: string) =>
    fetchJSON<{ success: boolean }>(`/api/tools/fields/${fieldId}`, { method: 'DELETE' }),

  // ── Extraction des champs assistée par IA — propose, ne sauvegarde rien ──
  // Timeout allongé (pas les 10s par défaut) : le backend peut tenter jusqu'à deux
  // modèles (GeminiModelManager, fallback Flash → Flash Lite) à 45s chacun côté
  // serveur — un timeout client à 10s abortait la requête avant toute réponse
  // possible ("signal is aborted without reason").
  extractFields: (screenId: string) =>
    fetchJSON<{ success: boolean; fields: ExtractedField[] }>(`/api/tools/screens/${screenId}/extract-fields`, {
      method: 'POST',
    }, 100_000),

  // ── Codes (catalogue par outil) ──
  addCode: (toolId: string, code: Omit<ToolCode, 'id' | 'tool_id'>) =>
    fetchJSON<{ success: boolean; code: ToolCode }>(`/api/tools/${toolId}/codes`, {
      method: 'POST',
      body: JSON.stringify(code),
    }),

  deleteCode: (codeId: string) =>
    fetchJSON<{ success: boolean }>(`/api/tools/codes/${codeId}`, { method: 'DELETE' }),
};

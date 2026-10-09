'use client';

import type { Procedure } from '@/lib/orchestrationApi';
import { API_CONFIG } from '@/lib/api-config';

const BASE = API_CONFIG.baseUrl;

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 15_000);
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

export interface BianScenarioSummary {
  id: string;
  version: string;
  view_id: string;
  title: string;
  category: string | null;
  url: string;
  status: 'available' | 'imported';
  participants: string[];
  steps_count: number;
  scraped_at: string;
}

export interface BianScenarioStep {
  order: number;
  action: string;
  from: string | null;
  to: string | null;
}

export interface BianScenarioDetail extends BianScenarioSummary {
  steps: BianScenarioStep[];
  imported_as_workflow_id: string | null;
}

// ─── Client ───────────────────────────────────────────────────

export const bianScenariosApi = {
  list: (params?: { category?: string; version?: string; status?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.version) qs.set('version', params.version);
    if (params?.status) qs.set('status', params.status);
    if (params?.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return fetchJSON<{ success: boolean; scenarios: BianScenarioSummary[]; total: number; categories: string[] }>(
      `${API_CONFIG.endpoints.bianScenarios}${suffix}`
    );
  },

  get: (id: string) =>
    fetchJSON<{ success: boolean; scenario: BianScenarioDetail }>(`${API_CONFIG.endpoints.bianScenarios}/${id}`),

  import: (id: string, nom: string, categorie?: string) =>
    fetchJSON<{ success: boolean; procedure: Procedure; steps_count: number }>(
      `${API_CONFIG.endpoints.bianScenarios}/${id}/import`,
      { method: 'POST', body: JSON.stringify({ nom, categorie }) }
    ),
};

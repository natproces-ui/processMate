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
      throw new Error(err.detail ?? 'Erreur API');
    }
    return res.json();
  } finally {
    clearTimeout(tid);
  }
}

// ─── Types ────────────────────────────────────────────────────

export type TaxonomyLevel = 'theme' | 'category' | 'subcategory';

export interface TaxonomyNode {
  id: string;
  name: string;
  description: string;
  level: TaxonomyLevel;
  parent_id: string | null;
  order_index: number;
  procedure_count?: number;
  created_at: string;
  updated_at: string;
  children: TaxonomyNode[];
}

export interface TaxonomyFlat extends Omit<TaxonomyNode, 'children'> {}

// ─── API ──────────────────────────────────────────────────────

export const taxonomyApi = {
  getTree: () =>
    fetchJSON<{ success: boolean; tree: TaxonomyNode[] }>('/api/orchestration/taxonomy'),

  getFlat: () =>
    fetchJSON<{ success: boolean; nodes: TaxonomyFlat[] }>('/api/orchestration/taxonomy?flat=true'),

  create: (body: { name: string; level: TaxonomyLevel; parent_id?: string | null; description?: string }) =>
    fetchJSON<{ success: boolean; node: TaxonomyNode }>('/api/orchestration/taxonomy', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (id: string, body: { name?: string; description?: string; order_index?: number }) =>
    fetchJSON<{ success: boolean }>(`/api/orchestration/taxonomy/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: (id: string) =>
    fetchJSON<{ success: boolean; detached_procedures: number }>(`/api/orchestration/taxonomy/${id}`, {
      method: 'DELETE',
    }),

  migrate: (themeName?: string, categoryName?: string) => {
    const params = new URLSearchParams();
    if (themeName) params.set('theme_name', themeName);
    if (categoryName) params.set('category_name', categoryName);
    return fetchJSON<{ success: boolean; created: unknown; procedures_linked: number }>(
      `/api/orchestration/taxonomy/migrate?${params}`,
      { method: 'POST' }
    );
  },

  seedBian: (force = false) =>
    fetchJSON<{
      success: boolean;
      seeded: boolean;
      message?: string;
      themes_created: number;
      categories_created: number;
      subcategories_created: number;
    }>(`/api/orchestration/taxonomy/seed-bian${force ? '?force=true' : ''}`, { method: 'POST' }),
};

// ─── Helpers ──────────────────────────────────────────────────

export const LEVEL_LABELS: Record<TaxonomyLevel, string> = {
  theme: 'Thème',
  category: 'Catégorie',
  subcategory: 'Sous-catégorie',
};

export const LEVEL_CHILD: Record<TaxonomyLevel, TaxonomyLevel | null> = {
  theme: 'category',
  category: 'subcategory',
  subcategory: null,
};

export const LEVEL_COLORS: Record<TaxonomyLevel, { bg: string; text: string; border: string; dot: string }> = {
  theme:       { bg: 'bg-indigo-50',  text: 'text-indigo-800', border: 'border-indigo-200', dot: 'bg-indigo-500' },
  category:    { bg: 'bg-blue-50',    text: 'text-blue-800',   border: 'border-blue-200',   dot: 'bg-blue-400'   },
  subcategory: { bg: 'bg-gray-50',    text: 'text-gray-700',   border: 'border-gray-200',   dot: 'bg-gray-400'   },
};

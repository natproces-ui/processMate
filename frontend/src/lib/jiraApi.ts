'use client';

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

// 'regulatory_impact' retiré : jamais exploité, Analyse IA couvre déjà ce
// besoin (cf. ArtifactDetail.tsx). 'procedure_task' créé automatiquement
// côté serveur (orchestration_tasks_router.py) — pas de bouton manuel pour
// ce type, voir JiraLinkButton `manual` prop.
export type JiraEntityType = 'procedure_task' | 'campaign_procedure' | 'tool_issue';

export interface JiraLink {
  id: string;
  entity_type: JiraEntityType;
  entity_id: string;
  jira_issue_key: string;
  jira_issue_url: string;
  jira_status: string | null;
  jira_priority: string | null;
  jira_due_date: string | null;
  jira_labels: string[] | null;
  jira_assignee_email: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JiraLinkCreateParams {
  entity_type: JiraEntityType;
  entity_id: string;
  summary: string;
  description?: string;
  priority?: string;
  labels?: string[];
  due_date?: string;
  assignee_email?: string;
  created_by?: string;
}

// ─── Client ───────────────────────────────────────────────────

export const jiraApi = {
  getLink: (entityType: JiraEntityType, entityId: string) =>
    fetchJSON<{ success: boolean; link: JiraLink | null }>(
      `${API_CONFIG.endpoints.jiraLink}/${entityType}/${encodeURIComponent(entityId)}`
    ),

  createLink: (params: JiraLinkCreateParams) =>
    fetchJSON<{ success: boolean; link: JiraLink; already_existed: boolean }>(API_CONFIG.endpoints.jiraLink, {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  // task_status : rempli uniquement quand entityType === 'procedure_task' ET
  // que le statut Jira mappé constituait une transition légale — voir
  // sync_task_status_from_jira côté serveur (peut rester null sans que ce
  // soit une erreur : transition déjà à jour, ou non autorisée depuis le
  // statut actuel de la tâche).
  sync: (entityType: JiraEntityType, entityId: string) =>
    fetchJSON<{ success: boolean; jira_status: string; task_status: string | null }>(
      `${API_CONFIG.endpoints.jiraLinkSync}/${entityType}/${encodeURIComponent(entityId)}/sync`,
      { method: 'POST' }
    ),

  syncAllTasks: () =>
    fetchJSON<{ success: boolean; checked: number; transitioned: number; errors: { task_id: string; error: string }[] }>(
      '/api/orchestration/tasks/sync-jira',
      { method: 'POST' }
    ),

  unlink: (entityType: JiraEntityType, entityId: string) =>
    fetchJSON<{ success: boolean }>(`${API_CONFIG.endpoints.jiraLink}/${entityType}/${encodeURIComponent(entityId)}`, {
      method: 'DELETE',
    }),
};

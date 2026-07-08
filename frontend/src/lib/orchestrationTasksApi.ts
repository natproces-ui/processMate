import { API_CONFIG } from './api-config';

const BASE = API_CONFIG.baseUrl;

export type ActorRole = 'admin' | 'user';

export interface TaskActor {
  id: string;
  name: string;
  email?: string | null;
  job_title?: string | null;
  department?: string | null;
  role: ActorRole;
  global_role?: string;
}

export type ProcedureTaskStatus =
  | 'todo'
  | 'in_progress'
  | 'submitted'
  | 'changes_requested'
  | 'waiting_info'
  | 'blocked'
  | 'completed'
  | 'validated'
  | 'cancelled';

export type ProcedureTaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ProcedureTaskType = 'formalization' | 'review' | 'validation' | 'consultation' | 'information' | 'correction' | 'other';
export type RaciRole = 'R' | 'A' | 'C' | 'I';

export interface ProcedureTask {
  id: string;
  procedure_id: string;
  procedure_name?: string;
  title: string;
  description?: string | null;
  assigned_to: string;
  assigned_to_name?: string;
  assigned_by: string;
  assigned_by_name?: string;
  raci_role?: RaciRole | null;
  task_type: ProcedureTaskType;
  status: ProcedureTaskStatus;
  priority: ProcedureTaskPriority;
  due_date?: string | null;
  workflow_stage_id?: string | null;
  workflow_step_id?: string | null;
  started_at?: string | null;
  submitted_at?: string | null;
  completed_at?: string | null;
  validated_at?: string | null;
  created_at: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
}

export interface ProcedureTaskEvent {
  id: string;
  task_id?: string | null;
  procedure_id: string;
  actor_id?: string | null;
  actor_name?: string | null;
  event_type: string;
  message?: string | null;
  from_status?: ProcedureTaskStatus | null;
  to_status?: ProcedureTaskStatus | null;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface ProcedureTaskComment {
  id: string;
  task_id: string;
  procedure_id: string;
  author_id: string;
  author_name?: string;
  comment: string;
  visibility: 'internal' | 'assignee' | 'public';
  created_at: string;
}

export interface ProcedureNotification {
  id: string;
  procedure_id?: string | null;
  user_id: string;
  type: string;
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown>;
  read_at?: string | null;
  created_at: string;
}

export interface ListTasksFilters {
  actor_id?: string;
  assigned_by?: string;
  procedure_id?: string;
  status?: ProcedureTaskStatus;
  role?: RaciRole;
  overdue_only?: boolean;
}

export interface CreateProcedureTaskInput {
  title: string;
  description?: string;
  assigned_to: string;
  assigned_by: string;
  raci_role?: RaciRole | null;
  task_type?: ProcedureTaskType;
  priority?: ProcedureTaskPriority;
  due_date?: string | null;
  workflow_stage_id?: string | null;
  workflow_step_id?: string | null;
  force?: boolean;
}

export interface ActiveTaskBlock {
  id: string;
  title: string;
  status: string;
  assigned_to_name: string;
  task_type: string;
}

export interface TransitionTaskInput {
  actor_id: string;
  status: ProcedureTaskStatus;
  message?: string;
  payload?: Record<string, unknown>;
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

function buildQuery(filters?: object) {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export interface EnrichedTask extends ProcedureTask {
  procedure_name: string;
  taxonomy_id?: string | null;
  taxonomy_breadcrumb?: string;
  campaign_id?: string | null;
  campaign_name?: string | null;
}

export interface EnrichedTaskEvent extends ProcedureTaskEvent {
  task_title?: string;
  task_type?: string;
  raci_role?: string;
  procedure_name?: string;
}

export const orchestrationTasksApi = {
  getMyTasks: (userId: string) =>
    fetchJSON<{ success: boolean; tasks: EnrichedTask[]; total: number }>(
      `/api/orchestration/tasks/my?user_id=${encodeURIComponent(userId)}`
    ),

  listRecentEvents: (params?: { limit?: number; procedure_id?: string }) =>
    fetchJSON<{ success: boolean; events: EnrichedTaskEvent[]; total: number }>(
      `/api/orchestration/events${buildQuery(params)}`
    ),

  listTasks: (filters?: ListTasksFilters) =>
    fetchJSON<{ success: boolean; tasks: ProcedureTask[]; total: number }>(
      `/api/orchestration/tasks${buildQuery(filters)}`
    ),

  getProcedureTasks: (procedureId: string) =>
    fetchJSON<{ success: boolean; tasks: ProcedureTask[]; total: number }>(
      `/api/orchestration/procedures/${procedureId}/tasks`
    ),

  getTask: (taskId: string) =>
    fetchJSON<{ success: boolean; task: ProcedureTask }>(
      `/api/orchestration/tasks/${taskId}`
    ),

  createTask: (procedureId: string, body: CreateProcedureTaskInput) =>
    fetchJSON<{ success: boolean; task?: ProcedureTask; blocked?: boolean; active_tasks?: ActiveTaskBlock[]; message?: string }>(
      `/api/orchestration/procedures/${procedureId}/tasks`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  updateTask: (taskId: string, body: Partial<CreateProcedureTaskInput & { status: ProcedureTaskStatus }>) =>
    fetchJSON<{ success: boolean; task: ProcedureTask }>(
      `/api/orchestration/tasks/${taskId}`,
      { method: 'PATCH', body: JSON.stringify(body) }
    ),

  transitionTask: (taskId: string, body: TransitionTaskInput) =>
    fetchJSON<{ success: boolean; task: ProcedureTask }>(
      `/api/orchestration/tasks/${taskId}/transition`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  addTaskComment: (taskId: string, body: { author_id: string; comment: string; visibility?: 'internal' | 'assignee' | 'public' }) =>
    fetchJSON<{ success: boolean; comment: ProcedureTaskComment }>(
      `/api/orchestration/tasks/${taskId}/comments`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  getTaskComments: (taskId: string) =>
    fetchJSON<{ success: boolean; comments: ProcedureTaskComment[]; total: number }>(
      `/api/orchestration/tasks/${taskId}/comments`
    ),

  getTaskEvents: (taskId: string) =>
    fetchJSON<{ success: boolean; events: ProcedureTaskEvent[]; total: number }>(
      `/api/orchestration/tasks/${taskId}/events`
    ),

  listNotifications: (userId: string) =>
    fetchJSON<{ success: boolean; notifications: ProcedureNotification[]; total: number }>(
      `/api/orchestration/notifications${buildQuery({ user_id: userId })}`
    ),

  markNotificationRead: (id: string, actorId: string) =>
    fetchJSON<{ success: boolean }>(
      `/api/orchestration/notifications/${id}/read`,
      { method: 'PATCH', body: JSON.stringify({ actor_id: actorId }) }
    ),
};

// ─── Email notifications (best-effort, silent on error) ──────

export async function notifyTaskAssignedByEmail(params: {
  toEmail: string;
  toName: string;
  assignedByName: string;
  taskTitle: string;
  procedureName?: string;
  taskType: string;
  dueDate?: string | null;
  workspaceUrl?: string;
  taskDescription?: string;
}): Promise<void> {
  try {
    await fetch('/api/notify/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch {
    // silent — email is best-effort
  }
}

'use client';

import type { ProcedureTaskPriority, ProcedureTaskStatus, ProcedureTaskType } from '@/lib/orchestrationTasksApi';

// ─── Workflow state labels (used in expand row) ─────────────────────────────

export const TASK_STATUS_LABELS: Record<ProcedureTaskStatus, string> = {
  todo:              'À faire',
  in_progress:       'En cours',
  submitted:         'Soumis',
  changes_requested: 'En attente',
  waiting_info:      'En attente',
  blocked:           'Bloqué',
  completed:         'Terminé',
  validated:         'Validé',
  cancelled:         'Annulé',
};

// Small dot color per workflow state
const STATUS_DOT: Record<ProcedureTaskStatus, string> = {
  todo:              'bg-gray-300',
  in_progress:       'bg-blue-400',
  submitted:         'bg-indigo-400',
  changes_requested: 'bg-orange-400',
  waiting_info:      'bg-amber-400',
  blocked:           'bg-red-500',
  completed:         'bg-emerald-400',
  validated:         'bg-green-500',
  cancelled:         'bg-slate-300',
};

// ─── Task type config (primary badge) ───────────────────────────────────────

const TYPE_CONFIG: Record<ProcedureTaskType, { label: string; text: string; bg: string; dot: string }> = {
  formalization: { label: 'Formalisation', text: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-100', dot: 'bg-indigo-400' },
  review:        { label: 'Vérification',  text: 'text-violet-700', bg: 'bg-violet-50 border-violet-100', dot: 'bg-violet-400' },
  validation:    { label: 'Validation',    text: 'text-green-700',  bg: 'bg-green-50 border-green-100',   dot: 'bg-green-500'  },
  correction:    { label: 'Correction',    text: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-400' },
  consultation:  { label: 'Consultation',  text: 'text-teal-700',   bg: 'bg-teal-50 border-teal-100',     dot: 'bg-teal-400'   },
  information:   { label: 'Information',   text: 'text-gray-600',   bg: 'bg-gray-50 border-gray-200',     dot: 'bg-gray-400'   },
  other:         { label: 'Autre',         text: 'text-slate-600',  bg: 'bg-slate-50 border-slate-200',   dot: 'bg-slate-400'  },
};

// ─── Priority config ─────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<ProcedureTaskPriority, { label: string; text: string; bg: string }> = {
  low:    { label: 'Basse',   text: 'text-slate-500',  bg: 'bg-slate-50 border-slate-200'  },
  normal: { label: 'Normale', text: 'text-gray-600',   bg: 'bg-gray-50 border-gray-200'    },
  high:   { label: 'Haute',   text: 'text-orange-700', bg: 'bg-orange-50 border-orange-200'},
  urgent: { label: 'Urgente', text: 'text-red-700',    bg: 'bg-red-50 border-red-200'      },
};

// ─── Components ──────────────────────────────────────────────────────────────

/** Primary badge: shows task type (Formalisation / Vérification / Validation / Correction …) */
export function TaskTypeBadge({ taskType, status }: { taskType: ProcedureTaskType; status: ProcedureTaskStatus }) {
  const cfg = TYPE_CONFIG[taskType] ?? TYPE_CONFIG.other;
  const dot = STATUS_DOT[status] ?? 'bg-gray-300';
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-semibold whitespace-nowrap w-fit ${cfg.text} ${cfg.bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
        {cfg.label}
      </span>
      <span className="inline-flex items-center gap-1 pl-0.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        <span className="text-[10px] text-gray-400 whitespace-nowrap">{TASK_STATUS_LABELS[status]}</span>
      </span>
    </div>
  );
}

/** Standalone workflow-state badge (used in expand row) */
export function TaskStatusBadge({ status }: { status: ProcedureTaskStatus }) {
  const dot = STATUS_DOT[status] ?? 'bg-gray-300';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

export function TaskPriorityBadge({ priority }: { priority: ProcedureTaskPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium whitespace-nowrap ${cfg.text} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

'use client';

import React, { useState } from 'react';
import { Calendar, ChevronDown, ChevronRight, Clock, ExternalLink, FolderOpen } from 'lucide-react';
import type { ProcedureTask, TaskActor } from '@/lib/orchestrationTasksApi';
import { TaskPriorityBadge, TaskTypeBadge } from './TaskStatusBadge';

interface Props {
  tasks: ProcedureTask[];
  currentActor?: TaskActor;
  actors?: TaskActor[];
  onOpenTask?: (task: ProcedureTask) => void;
  onOpenProcedure?: (procedureId: string) => void;
  highlightTaskId?: string;
}

const TASK_TYPE_LABELS: Record<string, string> = {
  formalization: 'Formalisation',
  review: 'Vérification',
  validation: 'Validation',
  correction: 'Correction',
  consultation: 'Consultation',
  information: 'Information',
  other: 'Autre',
};

// Left-strip accent color follows task TYPE so colors are coherent per row
const TYPE_STRIP: Record<string, string> = {
  formalization: 'bg-indigo-400',
  review:        'bg-violet-400',
  validation:    'bg-green-500',
  correction:    'bg-orange-400',
  consultation:  'bg-teal-400',
  information:   'bg-gray-300',
  other:         'bg-slate-300',
};

function daysOpen(task: ProcedureTask) {
  const start = new Date(task.started_at || task.created_at).getTime();
  return Math.max(0, Math.floor((Date.now() - start) / 86400000));
}

function isOverdue(task: ProcedureTask) {
  if (!task.due_date || ['completed', 'validated', 'cancelled'].includes(task.status)) return false;
  return new Date(task.due_date).getTime() < Date.now();
}

function resolvedName(actors: TaskActor[] | undefined, id: string, fallback?: string) {
  if (fallback) return fallback;
  return actors?.find(a => a.id === id)?.name || '—';
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold shrink-0">
      {letters}
    </span>
  );
}

export default function TaskTable({ tasks, actors, onOpenTask, onOpenProcedure, highlightTaskId }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (tasks.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-14 text-center">
        <p className="font-semibold text-gray-400">Aucune tâche pour cette vue.</p>
        <p className="text-sm text-gray-300 mt-1">Les affectations apparaîtront ici dès qu&apos;elles seront créées.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm table-fixed">
        <colgroup>
          <col className="w-1" />
          <col className="w-8" />
          <col />
          <col className="w-40" />
          <col className="w-36" />
          <col className="w-36" />
          <col className="w-24" />
          <col className="w-14" />
          <col className="w-28" />
        </colgroup>

        <thead>
          <tr className="border-b border-gray-100">
            <th className="p-0" />
            <th className="p-0" />
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Tâche</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Assigné</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Par</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Statut</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Délai</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Âge</th>
            <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-50">
          {tasks.map(task => {
            const isHighlighted = task.id === highlightTaskId;
            const isExpanded = expandedIds.has(task.id);
            const overdue = isOverdue(task);
            const assignedName = resolvedName(actors, task.assigned_to, task.assigned_to_name);
            const assignedByName = resolvedName(actors, task.assigned_by, task.assigned_by_name);
            const strip = TYPE_STRIP[task.task_type] || 'bg-gray-300';

            return (
              <React.Fragment key={task.id}>
                {/* ── Main row ── */}
                <tr
                  id={`task-${task.id}`}
                  className={`h-12 transition-colors group ${
                    isHighlighted
                      ? 'bg-blue-50'
                      : isExpanded
                      ? 'bg-gray-50/80'
                      : 'hover:bg-gray-50/60'
                  }`}
                >
                  {/* Status left strip */}
                  <td className="p-0">
                    <div className={`h-full w-0.5 ${strip}`} style={{ minHeight: '48px' }} />
                  </td>

                  {/* Chevron */}
                  <td className="pl-2 pr-0">
                    <button
                      type="button"
                      onClick={() => toggle(task.id)}
                      title={isExpanded ? 'Réduire' : 'Détails'}
                      className="p-1 rounded text-gray-300 hover:text-gray-600 transition-colors"
                    >
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5" />
                        : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  </td>

                  {/* Title */}
                  <td className="px-4 py-0 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenTask?.(task)}
                        title={task.title}
                        className="truncate font-medium text-gray-800 hover:text-blue-700 text-left flex-1 min-w-0 text-sm"
                      >
                        {task.title}
                      </button>
                      {isHighlighted && (
                        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                          Nouveau
                        </span>
                      )}
                      {task.raci_role && (
                        <span className="shrink-0 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                          {task.raci_role}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Assigned to */}
                  <td className="px-3 py-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {assignedName !== '—' && <Initials name={assignedName} />}
                      <span className="truncate text-sm text-gray-700">{assignedName}</span>
                    </div>
                  </td>

                  {/* Assigned by */}
                  <td className="px-3 py-0">
                    <span className="truncate block text-sm text-gray-400">{assignedByName}</span>
                  </td>

                  {/* Status — type badge + workflow state */}
                  <td className="px-3 py-0">
                    <TaskTypeBadge taskType={task.task_type} status={task.status} />
                  </td>

                  {/* Due date */}
                  <td className="px-3 py-0">
                    {task.due_date ? (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                        overdue ? 'text-red-600' : 'text-gray-400'
                      }`}>
                        <Calendar className="w-3 h-3 shrink-0" />
                        {new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-200">—</span>
                    )}
                  </td>

                  {/* Age */}
                  <td className="px-3 py-0">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-300">
                      <Clock className="w-3 h-3 shrink-0" />{daysOpen(task)}j
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-0 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenTask?.(task)}
                        title="Ouvrir la tâche"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        Ouvrir
                      </button>
                      {onOpenProcedure && (
                        <button
                          type="button"
                          onClick={() => onOpenProcedure(task.procedure_id)}
                          title="Ouvrir la procédure"
                          className="p-1.5 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* ── Expanded detail row ── */}
                {isExpanded && (
                  <tr className="bg-gray-50/60 border-t-0">
                    <td className="p-0">
                      <div className={`${strip} opacity-20`} style={{ minHeight: '100%', width: '2px' }} />
                    </td>
                    <td />
                    <td colSpan={7} className="px-4 pb-4 pt-3">
                      <div className="flex flex-wrap items-start gap-x-8 gap-y-3 text-xs text-gray-600">

                        {task.procedure_name && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Procédure</p>
                            <p className="font-medium text-gray-800">{task.procedure_name}</p>
                          </div>
                        )}

                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Type</p>
                          <p className="text-gray-700">{TASK_TYPE_LABELS[task.task_type] || task.task_type}</p>
                        </div>

                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Priorité</p>
                          <TaskPriorityBadge priority={task.priority} />
                        </div>

                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Assigné à</p>
                          <p className="font-medium text-gray-800">{assignedName}</p>
                        </div>

                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Assigné par</p>
                          <p className="text-gray-600">{assignedByName}</p>
                        </div>

                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Créé le</p>
                          <p className="text-gray-600">
                            {new Date(task.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        </div>

                        {task.description && (
                          <div className="w-full mt-1 pt-3 border-t border-gray-100">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</p>
                            <p className="text-gray-600 leading-relaxed max-w-2xl">{task.description}</p>
                          </div>
                        )}
                      </div>

                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => onOpenTask?.(task)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          Ouvrir la tâche complète
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

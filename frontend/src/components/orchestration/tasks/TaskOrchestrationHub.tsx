// components/orchestration/tasks/TaskOrchestrationHub.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Filter, Loader2, OctagonAlert, Plus, RefreshCw, Search, User, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import type { Procedure } from '@/lib/orchestrationApi';
import {
  orchestrationTasksApi,
  type ProcedureTask,
  type ProcedureTaskStatus,
  type TaskActor,
} from '@/lib/orchestrationTasksApi';
import TaskBatchCreateDrawer from './TaskBatchCreateDrawer';
import TaskDetailDrawer from './TaskDetailDrawer';
import TaskTable from './TaskTable';

interface Props {
  actors: TaskActor[];
  currentActor: TaskActor;
  procedures: Procedure[];
  onActorChange: (actor: TaskActor) => void;
  onOpenProcedure?: (procedureId: string) => void;
  initialProcedureFilter?: string[] | null;
  onClearFilter?: () => void;
}

function isActiveForActor(task: ProcedureTask, actor: TaskActor) {
  if (actor.role === 'admin') return true;
  return task.assigned_to === actor.id;
}

function isOverdue(task: ProcedureTask) {
  if (!task.due_date || ['completed', 'validated', 'cancelled'].includes(task.status)) return false;
  return new Date(task.due_date).getTime() < Date.now();
}

const STATUS_LABELS: Record<string, string> = {
  todo: 'À faire', in_progress: 'En cours', submitted: 'Soumis',
  changes_requested: 'Corrections', waiting_info: 'En attente',
  blocked: 'Bloqué', completed: 'Terminé', validated: 'Validé', cancelled: 'Annulé',
};

export default function TaskOrchestrationHub({ actors, currentActor, procedures, onActorChange, onOpenProcedure, initialProcedureFilter, onClearFilter }: Props) {
  const searchParams = useSearchParams();
  const highlightTaskId = searchParams.get('task_id');

  const [tasks, setTasks] = useState<ProcedureTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchDrawerOpen, setBatchDrawerOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<ProcedureTask | null>(null);
  const [filterStatus, setFilterStatus] = useState<ProcedureTaskStatus | 'all'>('all');
  const [filterPerson, setFilterPerson] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    orchestrationTasksApi
      .listTasks(currentActor.role === 'admin' ? undefined : { actor_id: currentActor.id })
      .then(res => setTasks(res.tasks))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [currentActor.id, currentActor.role]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!highlightTaskId) return;
    if (!tasks.find(t => t.id === highlightTaskId)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightTaskId]);

  useEffect(() => {
    if (!highlightTaskId || tasks.length === 0) return;
    const target = tasks.find(t => t.id === highlightTaskId);
    if (target) setDetailTask(target);
  }, [highlightTaskId, tasks]);

  const visibleTasks = useMemo(
    () => tasks.filter(task => isActiveForActor(task, currentActor)),
    [tasks, currentActor]
  );

  const filteredTasks = useMemo(() => {
    let result = visibleTasks;
    if (initialProcedureFilter?.length) result = result.filter(t => initialProcedureFilter.includes(t.procedure_id));
    if (filterStatus !== 'all') result = result.filter(t => t.status === filterStatus);
    if (filterPerson !== 'all') result = result.filter(t => t.assigned_to === filterPerson);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.procedure_name || '').toLowerCase().includes(q) ||
        (t.assigned_to_name || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [visibleTasks, filterStatus, filterPerson, searchQuery, initialProcedureFilter]);

  const stats = {
    open: visibleTasks.filter(t => !['completed', 'validated', 'cancelled'].includes(t.status)).length,
    overdue: visibleTasks.filter(isOverdue).length,
    submitted: visibleTasks.filter(t => t.status === 'submitted').length,
    blocked: visibleTasks.filter(t => t.status === 'blocked').length,
    changesRequested: visibleTasks.filter(t => t.status === 'changes_requested').length,
    validated: visibleTasks.filter(t => t.status === 'validated').length,
  };

  // Points d'attention — tasks that need immediate action
  const attentionItems = useMemo(() => {
    const items: { task: ProcedureTask; reason: string; color: string }[] = [];
    visibleTasks.forEach(t => {
      if (isOverdue(t)) items.push({ task: t, reason: 'En retard', color: 'bg-red-50 border-red-200 text-red-700' });
      else if (t.status === 'blocked') items.push({ task: t, reason: 'Bloqué', color: 'bg-red-50 border-red-200 text-red-700' });
      else if (t.status === 'changes_requested') items.push({ task: t, reason: 'Corrections demandées', color: 'bg-orange-50 border-orange-200 text-orange-700' });
      else if (t.status === 'submitted') items.push({ task: t, reason: `Chez ${t.assigned_to_name || 'assigné'}`, color: 'bg-indigo-50 border-indigo-200 text-indigo-700' });
    });
    return items.slice(0, 10);
  }, [visibleTasks]);

  // Unique people for filter
  const peopleOptions = useMemo(() => {
    const map = new Map<string, string>();
    visibleTasks.forEach(t => {
      if (t.assigned_to && t.assigned_to_name) map.set(t.assigned_to, t.assigned_to_name);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [visibleTasks]);

  const hasExternalFilter = !!initialProcedureFilter?.length;
  const hasFilters = filterStatus !== 'all' || filterPerson !== 'all' || searchQuery.trim() || hasExternalFilter;

  const updateTaskInList = (updatedTask: ProcedureTask) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    setDetailTask(updatedTask);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <div className="shrink-0 p-6 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Suivi des tâches</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {currentActor.role === 'admin' ? 'Vue globale' : 'Mes affectations'} · {visibleTasks.length} tâche{visibleTasks.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {currentActor.role === 'admin' && (
              <button type="button" onClick={() => setBatchDrawerOpen(true)}
                disabled={procedures.length === 0 || actors.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                <Plus className="w-4 h-4" /> Créer des tâches
              </button>
            )}
            <button type="button" onClick={load} title="Actualiser" className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
          {[
            { label: 'Ouvertes', value: stats.open, color: 'text-gray-900', bg: 'bg-gray-50', icon: Clock },
            { label: 'En retard', value: stats.overdue, color: 'text-red-600', bg: stats.overdue > 0 ? 'bg-red-50' : 'bg-gray-50', icon: AlertTriangle },
            { label: 'Bloquées', value: stats.blocked, color: 'text-red-600', bg: stats.blocked > 0 ? 'bg-red-50' : 'bg-gray-50', icon: OctagonAlert },
            { label: 'Corrections', value: stats.changesRequested, color: 'text-orange-600', bg: stats.changesRequested > 0 ? 'bg-orange-50' : 'bg-gray-50', icon: AlertTriangle },
            { label: 'Soumises', value: stats.submitted, color: 'text-indigo-600', bg: 'bg-indigo-50', icon: Clock },
            { label: 'Validées', value: stats.validated, color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2 },
          ].map(s => (
            <button key={s.label} type="button"
              onClick={() => {
                const statusMap: Record<string, ProcedureTaskStatus> = { 'En retard': 'todo', 'Bloquées': 'blocked', 'Corrections': 'changes_requested', 'Soumises': 'submitted', 'Validées': 'validated' };
                const mapped = statusMap[s.label];
                if (mapped) setFilterStatus(prev => prev === mapped ? 'all' : mapped);
              }}
              className={`${s.bg} rounded-xl p-3 text-left transition-colors hover:shadow-sm`}>
              <div className="flex items-center gap-1.5 mb-1">
                <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                <span className="text-[11px] text-gray-500">{s.label}</span>
              </div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher tâche, procédure, personne…"
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
            title="Filtrer par statut"
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
            <option value="all">Tous les statuts</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {currentActor.role === 'admin' && (
            <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)}
              title="Filtrer par personne"
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
              <option value="all">Toutes les personnes</option>
              {peopleOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
          {hasFilters && (
            <button type="button" onClick={() => { setFilterStatus('all'); setFilterPerson('all'); setSearchQuery(''); onClearFilter?.(); }}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1.5">
              <X className="w-3 h-3" /> Effacer les filtres
            </button>
          )}
        </div>
        {hasExternalFilter && (
          <div className="flex items-center gap-2 px-6 py-2 bg-blue-50 border-b border-blue-100">
            <Filter className="w-3 h-3 text-blue-500 shrink-0" />
            <span className="text-xs text-blue-700 font-medium flex-1">Filtré depuis Procédures — {initialProcedureFilter!.length} procédure(s)</span>
            <button type="button" title="Retirer le filtre" onClick={() => onClearFilter?.()} className="text-xs text-blue-500 hover:text-blue-700 font-medium">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Points d'attention */}
      {attentionItems.length > 0 && !hasFilters && (
        <div className="shrink-0 px-6 py-3 bg-amber-50/50 border-b border-amber-100">
          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" /> Points d&apos;attention ({attentionItems.length})
          </p>
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
            {attentionItems.map(({ task, reason, color }) => (
              <button key={task.id} type="button" onClick={() => setDetailTask(task)}
                className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors hover:shadow-sm ${color}`}>
                <span className="truncate max-w-[150px]">{task.title}</span>
                <span className="text-[10px] opacity-75 shrink-0">· {reason}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Task table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement…
          </div>
        ) : (
          <TaskTable
            tasks={filteredTasks}
            currentActor={currentActor}
            actors={actors}
            onOpenTask={setDetailTask}
            onOpenProcedure={onOpenProcedure}
            highlightTaskId={highlightTaskId || undefined}
          />
        )}
      </div>

      {batchDrawerOpen && currentActor.role === 'admin' && (
        <TaskBatchCreateDrawer
          procedures={procedures}
          actors={actors}
          assignedBy={currentActor}
          onCreated={load}
          onClose={() => setBatchDrawerOpen(false)}
        />
      )}

      {detailTask && (
        <TaskDetailDrawer
          task={detailTask}
          actor={currentActor}
          actors={actors}
          onClose={() => setDetailTask(null)}
          onChanged={updateTaskInList}
        />
      )}
    </div>
  );
}
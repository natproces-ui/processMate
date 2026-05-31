// components/orchestration/tasks/TaskOrchestrationHub.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Plus, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import type { Procedure } from '@/lib/orchestrationApi';
import {
  orchestrationTasksApi,
  type ProcedureTask,
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
}

function isActiveForActor(task: ProcedureTask, actor: TaskActor) {
  if (actor.role === 'admin') return true;
  return task.assigned_to === actor.id;
}

function isOverdue(task: ProcedureTask) {
  if (!task.due_date || ['completed', 'validated', 'cancelled'].includes(task.status)) return false;
  return new Date(task.due_date).getTime() < Date.now();
}

export default function TaskOrchestrationHub({ actors, currentActor, procedures, onActorChange, onOpenProcedure }: Props) {
  const searchParams = useSearchParams();
  const highlightTaskId = searchParams.get('task_id');

  const [tasks, setTasks] = useState<ProcedureTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchDrawerOpen, setBatchDrawerOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<ProcedureTask | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    orchestrationTasksApi
      .listTasks(currentActor.role === 'admin' ? undefined : { actor_id: currentActor.id })
      .then(res => setTasks(res.tasks))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [currentActor.id, currentActor.role]);

  // Chargement initial + polling 30s pour découvrir les nouvelles tâches créées par transitions
  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // Quand on navigue depuis une notification (task_id dans l'URL), recharger si la tâche
  // n'est pas encore dans la liste (elle vient d'être créée par une transition)
  useEffect(() => {
    if (!highlightTaskId) return;
    const found = tasks.find(t => t.id === highlightTaskId);
    if (!found) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightTaskId]);

  // Ouvrir le drawer dès que la tâche ciblée est disponible dans la liste
  useEffect(() => {
    if (!highlightTaskId || tasks.length === 0) return;
    const target = tasks.find(t => t.id === highlightTaskId);
    if (target) setDetailTask(target);
  }, [highlightTaskId, tasks]);

  const visibleTasks = useMemo(
    () => tasks.filter(task => isActiveForActor(task, currentActor)),
    [tasks, currentActor]
  );

  const stats = {
    open: visibleTasks.filter(t => !['completed', 'validated', 'cancelled'].includes(t.status)).length,
    overdue: visibleTasks.filter(isOverdue).length,
    submitted: visibleTasks.filter(t => t.status === 'submitted').length,
    validated: visibleTasks.filter(t => t.status === 'validated').length,
  };

  const updateTaskInList = (updatedTask: ProcedureTask) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    setDetailTask(updatedTask);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {currentActor.role === 'admin' ? 'Suivi global des tâches' : 'Mes tâches'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Pilotage des affectations, délais, retours et traces d&apos;exécution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {currentActor.role === 'admin' && (
            <button
              type="button"
              onClick={() => setBatchDrawerOpen(true)}
              disabled={procedures.length === 0 || actors.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Créer des tâches
            </button>
          )}
          <button type="button" onClick={load} title="Actualiser" className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { icon: Clock, color: 'text-gray-500', bold: 'text-gray-900', label: 'Ouvertes', value: stats.open },
          { icon: AlertTriangle, color: 'text-red-500', bold: 'text-red-600', label: 'En retard', value: stats.overdue },
          { icon: Clock, color: 'text-indigo-500', bold: 'text-indigo-600', label: 'Soumises', value: stats.submitted },
          { icon: CheckCircle2, color: 'text-green-600', bold: 'text-green-600', label: 'Validées', value: stats.validated },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className={`flex items-center gap-2 text-sm ${s.color}`}>
              <s.icon className="w-4 h-4" />{s.label}
            </div>
            <p className={`text-2xl font-bold mt-2 ${s.bold}`}>{s.value}</p>
          </div>
        ))}
      </div>


      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 flex justify-center text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Chargement des tâches...
        </div>
      ) : (
        <TaskTable
          tasks={visibleTasks}
          currentActor={currentActor}
          actors={actors}
          onOpenTask={setDetailTask}
          onOpenProcedure={onOpenProcedure}
          highlightTaskId={highlightTaskId || undefined}
        />
      )}

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
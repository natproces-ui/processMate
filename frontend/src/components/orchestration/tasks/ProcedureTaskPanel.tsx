'use client';

import { useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import {
  orchestrationTasksApi,
  notifyTaskAssignedByEmail,
  type CreateProcedureTaskInput,
  type ProcedureTask,
  type TaskActor,
} from '@/lib/orchestrationTasksApi';
import TaskDetailDrawer from './TaskDetailDrawer';
import TaskFormDrawer from './TaskFormDrawer';
import TaskTable from './TaskTable';

interface Props {
  procedureId: string;
  procedureName?: string;
  actors: TaskActor[];
  currentActor: TaskActor;
  onOpenProcedure?: (procedureId: string) => void;
}

export default function ProcedureTaskPanel({
  procedureId,
  procedureName,
  actors,
  currentActor,
  onOpenProcedure,
}: Props) {
  const [tasks, setTasks] = useState<ProcedureTask[]>([]);
  const [detailTask, setDetailTask] = useState<ProcedureTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const canManage = currentActor.role === 'admin';

  const load = () => {
    setLoading(true);
    orchestrationTasksApi
      .getProcedureTasks(procedureId)
      .then(res => setTasks(res.tasks))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procedureId]);

  const createTask = async (id: string, input: CreateProcedureTaskInput) => {
    await orchestrationTasksApi.createTask(id, input);
    const assignedActor = actors.find(a => a.id === input.assigned_to);
    if (assignedActor?.email) {
      notifyTaskAssignedByEmail({
        toEmail: assignedActor.email,
        toName: assignedActor.name,
        assignedByName: currentActor.name,
        taskTitle: input.title,
        procedureName: procedureName,
        taskType: input.task_type ?? 'other',
        dueDate: input.due_date,
      });
    }
    load();
  };

  const updateTaskInList = (updatedTask: ProcedureTask) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    setDetailTask(updatedTask);
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Tâches de procédure</h2>
          {procedureName && (
            <p className="text-sm text-gray-500 mt-0.5">{procedureName}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            title="Actualiser"
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Nouvelle tâche
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 flex justify-center text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Chargement...
        </div>
      ) : (
        <TaskTable
          tasks={tasks}
          currentActor={currentActor}
          actors={actors}
          onOpenTask={setDetailTask}
          onOpenProcedure={onOpenProcedure}
        />
      )}

      {/* Drawer création */}
      {drawerOpen && canManage && (
        <TaskFormDrawer
          procedureId={procedureId}
          actors={actors}
          assignedBy={currentActor}
          onClose={() => setDrawerOpen(false)}
          onSubmit={createTask}
        />
      )}

      {/* Drawer détail — onChanged corrigé (était oonChanged) */}
      {detailTask && (
        <TaskDetailDrawer
          task={detailTask}
          actor={currentActor}
          actors={actors}
          onClose={() => setDetailTask(null)}
          onChanged={(updatedTask) => {
            updateTaskInList(updatedTask);
            load();
          }}
        />
      )}
    </div>
  );
}
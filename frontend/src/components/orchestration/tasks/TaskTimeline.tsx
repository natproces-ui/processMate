// src/components/orchestration/tasks/TaskTimeline.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { Clock, MessageSquare, RefreshCw } from 'lucide-react';
import {
  orchestrationTasksApi,
  type ProcedureTaskEvent,
  type ProcedureTaskStatus,
} from '@/lib/orchestrationTasksApi';
import { TASK_STATUS_LABELS } from './TaskStatusBadge';

interface Props {
  taskId: string;
}

function formatStatus(status?: ProcedureTaskStatus | null) {
  return status ? TASK_STATUS_LABELS[status] : '';
}

export default function TaskTimeline({ taskId }: Props) {
  const [events, setEvents] = useState<ProcedureTaskEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    orchestrationTasksApi.getTaskEvents(taskId)
      .then(res => setEvents(res.events))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Chargement de la tracabilite...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-4">
        Aucun evenement trace pour cette tache.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map(event => (
        <div key={event.id} className="flex gap-3">
          <div className="mt-0.5 w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            {event.message ? <MessageSquare className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
          </div>
          <div className="min-w-0 flex-1 border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{event.actor_name || 'Systeme'}</span>
              <span className="text-xs text-gray-400">{new Date(event.created_at).toLocaleString('fr-FR')}</span>
            </div>
            <p className="text-sm text-gray-700 mt-0.5">
              {event.message || event.event_type}
              {event.from_status && event.to_status && (
                <span className="text-gray-400">
                  {' '}({formatStatus(event.from_status)} vers {formatStatus(event.to_status)})
                </span>
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

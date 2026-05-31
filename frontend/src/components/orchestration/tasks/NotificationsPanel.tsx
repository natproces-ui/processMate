// src/components/orchestration/tasks/NotificationsPanel.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import {
  orchestrationTasksApi,
  type ProcedureNotification,
  type TaskActor,
} from '@/lib/orchestrationTasksApi';

interface Props {
  actor: TaskActor;
}

export default function NotificationsPanel({ actor }: Props) {
  const [notifications, setNotifications] = useState<ProcedureNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    orchestrationTasksApi.listNotifications(actor.id)
      .then(res => setNotifications(res.notifications))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, [actor.id]);

  const markRead = async (id: string) => {
    setMarking(id);
    try {
      await orchestrationTasksApi.markNotificationRead(id, actor.id);
      setNotifications(prev => prev.map(item => (
        item.id === id ? { ...item, read_at: new Date().toISOString() } : item
      )));
    } finally {
      setMarking(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-2 text-sm text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Chargement des notifications...
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Bell className="w-4 h-4 text-blue-600" />
        <h3 className="font-semibold text-gray-900">Notifications</h3>
        <span className="ml-auto text-xs text-gray-400">{notifications.filter(item => !item.read_at).length} non lue(s)</span>
      </div>

      {notifications.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          Aucune notification pour cet utilisateur.
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {notifications.map(item => (
            <div key={item.id} className={`px-4 py-3 ${item.read_at ? 'bg-white opacity-70' : 'bg-blue-50/60'}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-2 h-2 rounded-full ${item.read_at ? 'bg-gray-300' : 'bg-blue-600'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                  {item.body && <p className="text-sm text-gray-600 mt-0.5">{item.body}</p>}
                  <p className="text-xs text-gray-400 mt-1">{new Date(item.created_at).toLocaleString('fr-FR')}</p>
                </div>
                {!item.read_at && (
                  <button
                    type="button"
                    onClick={() => markRead(item.id)}
                    disabled={marking === item.id}
                    title="Marquer comme lu"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-green-700 hover:bg-green-50 disabled:opacity-50"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

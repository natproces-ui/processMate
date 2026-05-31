'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, CheckCircle2, Clock, ExternalLink, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
    orchestrationTasksApi,
    type ProcedureNotification,
} from '@/lib/orchestrationTasksApi';

interface Props {
    actorId?: string;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
    task: <Clock className="h-3.5 w-3.5 text-blue-500" />,
    validation: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
    default: <Bell className="h-3.5 w-3.5 text-gray-400" />,
};

function notifIcon(type?: string) {
    return TYPE_ICON[type || 'default'] ?? TYPE_ICON.default;
}

export default function NotificationBell({ actorId }: Props) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState<ProcedureNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const [markingId, setMarkingId] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const unread = notifications.filter(n => !n.read_at).length;

    const load = useCallback(async () => {
        if (!actorId) return;
        setLoading(true);
        try {
            const res = await orchestrationTasksApi.listNotifications(actorId);
            setNotifications(res.notifications);
        } catch { /* silencieux */ }
        finally { setLoading(false); }
    }, [actorId]);

    // Charger au montage et toutes les 60s
    useEffect(() => {
        load();
        const interval = setInterval(load, 60_000);
        return () => clearInterval(interval);
    }, [load]);

    const markRead = async (id: string) => {
        if (!actorId) return;
        setMarkingId(id);
        try {
            await orchestrationTasksApi.markNotificationRead(id, actorId);
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
            );
        } finally { setMarkingId(null); }
    };

    const markAllRead = async () => {
        if (!actorId) return;
        const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id);
        if (unreadIds.length === 0) return;
        // Mise à jour locale immédiate — les appels API partent en arrière-plan
        setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
        await Promise.allSettled(
            unreadIds.map(id => orchestrationTasksApi.markNotificationRead(id, actorId))
        );
    };

    // Fermer le panneau et marquer tout comme lu (l'utilisateur a vu les notifications)
    const closeAndMarkRead = () => {
        setOpen(false);
        if (actorId) {
            const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id);
            if (unreadIds.length > 0) {
                setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
                Promise.allSettled(
                    unreadIds.map(id => orchestrationTasksApi.markNotificationRead(id, actorId))
                );
            }
        }
    };

    // Fermer si clic en dehors — aussi marquer comme lu
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                closeAndMarkRead();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, notifications, actorId]);

    const goToTask = (notif: ProcedureNotification) => {
        // Marquer comme lu au clic sur "Voir la tâche"
        if (!notif.read_at && actorId) {
            markRead(notif.id);
        }
        const taskId = notif.metadata?.task_id;
        if (taskId) {
            router.push(`/orchestration?tab=tasks&task_id=${taskId}`);
            setOpen(false);
        }
    };

    return (
        <div className="relative" ref={panelRef}>
            {/* Cloche */}
            <button
                type="button"
                onClick={() => { setOpen(v => !v); if (!open) load(); }}
                title="Notifications"
                className="relative p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
                <Bell className="w-4 h-4" />
                {unread > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute right-0 top-full mt-2 w-96 max-h-[520px] flex flex-col bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999]">

                    {/* Header dropdown */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
                        <div className="flex items-center gap-2">
                            <Bell className="h-4 w-4 text-blue-600" />
                            <span className="text-sm font-bold text-gray-900">Notifications</span>
                            {unread > 0 && (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                                    {unread} non lue{unread > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {unread > 0 && (
                                <button
                                    type="button"
                                    onClick={markAllRead}
                                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                                    title="Tout marquer comme lu"
                                >
                                    <CheckCheck className="h-3.5 w-3.5" />
                                    Tout lire
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={closeAndMarkRead}
                                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Liste */}
                    <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                        {loading && notifications.length === 0 ? (
                            <div className="flex items-center justify-center py-10 text-xs text-gray-400">
                                Chargement…
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
                                <Bell className="h-8 w-8 opacity-20" />
                                <p className="text-xs">Aucune notification</p>
                            </div>
                        ) : (
                            notifications.map(notif => {
                                const isUnread = !notif.read_at;
                                const isExpanded = expanded === notif.id;
                                const taskId = notif.metadata?.task_id as string | undefined;
                                const PREVIEW_LENGTH = 100;
                                const bodyLong = (notif.body || '').length > PREVIEW_LENGTH;
                                const bodyPreview = bodyLong && !isExpanded
                                    ? (notif.body || '').slice(0, PREVIEW_LENGTH) + '…'
                                    : (notif.body || '');

                                return (
                                    <div
                                        key={notif.id}
                                        className={`px-4 py-3 transition-colors ${isUnread ? 'bg-blue-50/50' : 'bg-white'}`}
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Indicateur non lu */}
                                            <div className="mt-1.5 shrink-0">
                                                {isUnread
                                                    ? <span className="block h-2 w-2 rounded-full bg-blue-600" />
                                                    : <span className="block h-2 w-2 rounded-full bg-gray-200" />
                                                }
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                {/* Icône + titre */}
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    {notifIcon(notif.type)}
                                                    <p className={`text-xs font-semibold leading-snug ${isUnread ? 'text-gray-900' : 'text-gray-600'}`}>
                                                        {notif.title}
                                                    </p>
                                                </div>

                                                {/* Corps */}
                                                {notif.body && (
                                                    <div>
                                                        <p className="text-xs text-gray-500 leading-5 whitespace-pre-wrap">
                                                            {bodyPreview}
                                                        </p>
                                                        {bodyLong && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setExpanded(isExpanded ? null : notif.id)}
                                                                className="text-xs text-blue-600 hover:underline mt-0.5"
                                                            >
                                                                {isExpanded ? 'Voir moins' : 'Voir plus'}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Date + actions */}
                                                <div className="flex items-center justify-between mt-1.5 gap-2">
                                                    <span className="text-[11px] text-gray-400">
                                                        {new Date(notif.created_at).toLocaleString('fr-FR', {
                                                            day: '2-digit', month: '2-digit',
                                                            hour: '2-digit', minute: '2-digit',
                                                        })}
                                                    </span>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        {!!taskId && (
                                                            <button
                                                                type="button"
                                                                onClick={() => goToTask(notif)}
                                                                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-blue-600 hover:bg-blue-50 font-medium"
                                                                title="Voir la tâche"
                                                            >
                                                                <ExternalLink className="h-3 w-3" />
                                                                Voir la tâche
                                                            </button>
                                                        )}
                                                        {isUnread && (
                                                            <button
                                                                type="button"
                                                                onClick={() => markRead(notif.id)}
                                                                disabled={markingId === notif.id}
                                                                className="rounded p-0.5 text-gray-400 hover:text-green-600 hover:bg-green-50"
                                                                title="Marquer comme lu"
                                                            >
                                                                <CheckCheck className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 0 && (
                        <div className="shrink-0 border-t border-gray-100 px-4 py-2 text-center">
                            <button
                                type="button"
                                onClick={() => { router.push('/orchestration?tab=tasks'); setOpen(false); }}
                                className="text-xs text-blue-600 hover:underline font-medium"
                            >
                                Voir toutes les tâches →
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, MessageSquare, RefreshCw, Send, UserRound, X } from 'lucide-react';
import {
  orchestrationTasksApi,
  type ProcedureTask,
  type ProcedureTaskComment,
  type TaskActor,
} from '@/lib/orchestrationTasksApi';
import TaskActionBar from './TaskActionBar';
import { TaskPriorityBadge, TaskStatusBadge } from './TaskStatusBadge';
import TaskTimeline from './TaskTimeline';

interface Props {
  task: ProcedureTask;
  actor: TaskActor;
  actors: TaskActor[];
  onClose: () => void;
  onChanged?: (task: ProcedureTask) => void;
}

function actorName(actors: TaskActor[], id: string, fallback?: string) {
  return fallback || actors.find(actor => actor.id === id)?.name || id;
}

function actorMeta(actors: TaskActor[], id: string) {
  const actor = actors.find(item => item.id === id);
  return [actor?.job_title, actor?.department, actor?.email].filter(Boolean).join(' · ');
}

export default function TaskDetailDrawer({ task: initialTask, actor, actors, onClose, onChanged }: Props) {
  const [task, setTask] = useState(initialTask);
  const [comments, setComments] = useState<ProcedureTaskComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [comment, setComment] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timelineKey, setTimelineKey] = useState(0);

  useEffect(() => {
    setTask(initialTask);
  }, [initialTask]);

  const loadComments = () => {
    setLoadingComments(true);
    orchestrationTasksApi.getTaskComments(task.id)
      .then(res => setComments(res.comments))
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false));
  };

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  const canComment = useMemo(() => (
    actor.role === 'admin' || actor.id === task.assigned_to || actor.id === task.assigned_by
  ), [actor, task]);

  const handleChanged = (nextTask: ProcedureTask) => {
    setTask(nextTask);
    setTimelineKey(prev => prev + 1);
    onChanged?.(nextTask);
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setSavingComment(true);
    setError(null);
    try {
      await orchestrationTasksApi.addTaskComment(task.id, {
        author_id: actor.id,
        comment: comment.trim(),
        visibility: 'public',
      });
      setComment('');
      setTimelineKey(prev => prev + 1);
      loadComments();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur ajout commentaire');
    } finally {
      setSavingComment(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="w-full max-w-3xl h-full bg-white shadow-xl flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <TaskStatusBadge status={task.status} />
              <TaskPriorityBadge priority={task.priority} />
              {task.raci_role && (
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                  {task.raci_role}
                </span>
              )}
            </div>
            <h3 className="font-bold text-gray-900 text-lg mt-2">{task.title}</h3>
            {task.procedure_name && <p className="text-sm text-gray-500 mt-0.5">{task.procedure_name}</p>}
          </div>
          <button type="button" onClick={onClose} title="Fermer" className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <UserRound className="w-4 h-4" />
                Assigne a
              </div>
              <p className="font-semibold text-gray-900 mt-2">{actorName(actors, task.assigned_to, task.assigned_to_name)}</p>
              {actorMeta(actors, task.assigned_to) && <p className="text-xs text-gray-400 mt-0.5">{actorMeta(actors, task.assigned_to)}</p>}
            </div>

            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <Calendar className="w-4 h-4" />
                Delai
              </div>
              <p className="font-semibold text-gray-900 mt-2">
                {task.due_date ? new Date(task.due_date).toLocaleDateString('fr-FR') : 'Non defini'}
              </p>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-4">
            <h4 className="font-semibold text-gray-900">Description</h4>
            <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
              {task.description || <span className="text-gray-400">Aucune description.</span>}
            </p>
          </div>

          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <h4 className="font-semibold text-gray-900">Message pour l&apos;action</h4>
            <textarea
              value={actionMessage}
              onChange={event => setActionMessage(event.target.value)}
              rows={3}
              placeholder="Commentaire optionnel lie a la prochaine action..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
            <TaskActionBar
              task={task}
              actor={actor}
              message={actionMessage}
              onChanged={handleChanged}
              onError={setError}
            />
          </div>

          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <h4 className="font-semibold text-gray-900">Commentaires</h4>
            </div>

            {canComment && (
              <div className="flex gap-2">
                <input
                  value={comment}
                  onChange={event => setComment(event.target.value)}
                  placeholder="Ajouter un commentaire..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <button
                  type="button"
                  onClick={addComment}
                  disabled={savingComment || !comment.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  Envoyer
                </button>
              </div>
            )}

            {loadingComments ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Chargement...
              </div>
            ) : comments.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">Aucun commentaire.</p>
            ) : (
              <div className="space-y-2">
                {comments.map(item => (
                  <div key={item.id} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{actorName(actors, item.author_id, item.author_name)}</span>
                      <span className="text-xs text-gray-400">{new Date(item.created_at).toLocaleString('fr-FR')}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{item.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded-xl p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Tracabilite</h4>
            <TaskTimeline key={`${task.id}-${timelineKey}`} taskId={task.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

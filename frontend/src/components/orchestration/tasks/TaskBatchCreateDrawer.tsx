'use client';

import React, { useMemo, useState } from 'react';
import { AlertCircle, Plus, Send, Trash2, X } from 'lucide-react';
import type { Procedure } from '@/lib/orchestrationApi';
import {
  orchestrationTasksApi,
  notifyTaskAssignedByEmail,
  type CreateProcedureTaskInput,
  type ProcedureTaskPriority,
  type ProcedureTaskType,
  type RaciRole,
  type TaskActor,
} from '@/lib/orchestrationTasksApi';

interface Props {
  procedures: Procedure[];
  actors: TaskActor[];
  assignedBy: TaskActor;
  onCreated: () => void;
  onClose: () => void;
}

interface TaskDraft {
  id: string;
  procedure_id: string;
  title: string;
  description: string;
  assigned_to: string;
  raci_role: RaciRole;
  task_type: ProcedureTaskType;
  priority: ProcedureTaskPriority;
  due_date: string;
}

const RACI_ROLES: Array<{ value: RaciRole; label: string }> = [
  { value: 'R', label: 'R - Responsable' },
  { value: 'A', label: 'A - Approbateur' },
  { value: 'C', label: 'C - Verificateur' },
  { value: 'I', label: 'I - Informe' },
];

const TASK_TYPES: Array<{ value: ProcedureTaskType; label: string }> = [
  { value: 'formalization', label: 'Formalisation' },
  { value: 'review', label: 'Verification' },
  { value: 'validation', label: 'Validation' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'information', label: 'Information' },
  { value: 'correction', label: 'Correction' },
  { value: 'other', label: 'Autre' },
];

const PRIORITIES: Array<{ value: ProcedureTaskPriority; label: string }> = [
  { value: 'low', label: 'Basse' },
  { value: 'normal', label: 'Normale' },
  { value: 'high', label: 'Haute' },
  { value: 'urgent', label: 'Urgente' },
];

function taskTypeForRole(role: RaciRole): ProcedureTaskType {
  if (role === 'A') return 'validation';
  if (role === 'C') return 'review';
  if (role === 'I') return 'information';
  return 'formalization';
}

function actorLabel(actor?: TaskActor) {
  if (!actor) return '';
  return `${actor.name}${actor.role === 'admin' ? ' (Admin)' : ''}`;
}

function draftId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function TaskBatchCreateDrawer({
  procedures,
  actors,
  assignedBy,
  onCreated,
  onClose,
}: Props) {
  const firstProcedure = procedures[0]?.id || '';
  const firstActor = actors[0]?.id || '';

  const [draft, setDraft] = useState<TaskDraft>({
    id: draftId(),
    procedure_id: firstProcedure,
    title: '',
    description: '',
    assigned_to: firstActor,
    raci_role: 'R',
    task_type: 'formalization',
    priority: 'normal',
    due_date: '',
  });
  const [batch, setBatch] = useState<TaskDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const procedureById = useMemo(
    () => new Map(procedures.map(procedure => [procedure.id, procedure])),
    [procedures]
  );
  const actorById = useMemo(
    () => new Map(actors.map(actor => [actor.id, actor])),
    [actors]
  );

  const canAdd = Boolean(draft.procedure_id && draft.assigned_to && draft.title.trim());
  const totalToCreate = batch.length + (canAdd ? 1 : 0);

  const updateDraft = (updates: Partial<TaskDraft>) => {
    setDraft(prev => ({ ...prev, ...updates }));
  };

  const addDraft = () => {
    if (!canAdd) return;
    setBatch(prev => [...prev, { ...draft, title: draft.title.trim(), description: draft.description.trim() }]);
    setDraft(prev => ({
      ...prev,
      id: draftId(),
      title: '',
      description: '',
    }));
  };

  const removeDraft = (id: string) => {
    setBatch(prev => prev.filter(item => item.id !== id));
  };

  const toInput = (item: TaskDraft): CreateProcedureTaskInput => ({
    title: item.title.trim(),
    description: item.description.trim(),
    assigned_to: item.assigned_to,
    assigned_by: assignedBy.id,
    raci_role: item.raci_role,
    task_type: item.task_type,
    priority: item.priority,
    due_date: item.due_date || null,
  });

  const submit = async () => {
    const items = canAdd
      ? [...batch, { ...draft, title: draft.title.trim(), description: draft.description.trim() }]
      : batch;
    if (items.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      for (const item of items) {
        await orchestrationTasksApi.createTask(item.procedure_id, toInput(item));
        const assignedActor = actorById.get(item.assigned_to);
        if (assignedActor?.email) {
          notifyTaskAssignedByEmail({
            toEmail: assignedActor.email,
            toName: assignedActor.name,
            assignedByName: assignedBy.name,
            taskTitle: item.title.trim(),
            procedureName: procedureById.get(item.procedure_id)?.nom,
            taskType: item.task_type,
            dueDate: item.due_date || null,
          });
        }
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur creation des taches');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="font-bold text-gray-900">Creer des taches</h3>
            <p className="mt-0.5 text-xs text-gray-400">
              Les affectations creent aussi le lien RACI correspondant sur la procedure.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Fermer"
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Procedure</span>
                <select
                  value={draft.procedure_id}
                  onChange={event => updateDraft({ procedure_id: event.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {procedures.map(procedure => (
                    <option key={procedure.id} value={procedure.id}>
                      {procedure.nom}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Assigne a</span>
                <select
                  value={draft.assigned_to}
                  onChange={event => updateDraft({ assigned_to: event.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {actors.map(actor => (
                    <option key={actor.id} value={actor.id}>
                      {actorLabel(actor)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-3 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Titre</span>
              <input
                value={draft.title}
                onChange={event => updateDraft({ title: event.target.value })}
                placeholder="Ex: Formaliser la procedure"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Description</span>
              <textarea
                value={draft.description}
                onChange={event => updateDraft({ description: event.target.value })}
                rows={3}
                placeholder="Preciser le travail attendu..."
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>

            <div className="mt-3 grid grid-cols-4 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Role</span>
                <select
                  value={draft.raci_role}
                  onChange={event => {
                    const role = event.target.value as RaciRole;
                    updateDraft({ raci_role: role, task_type: taskTypeForRole(role) });
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {RACI_ROLES.map(role => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Type</span>
                <select
                  value={draft.task_type}
                  onChange={event => updateDraft({ task_type: event.target.value as ProcedureTaskType })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {TASK_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Priorite</span>
                <select
                  value={draft.priority}
                  onChange={event => updateDraft({ priority: event.target.value as ProcedureTaskPriority })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {PRIORITIES.map(priority => (
                    <option key={priority.value} value={priority.value}>{priority.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Echeance</span>
                <input
                  type="date"
                  value={draft.due_date}
                  onChange={event => updateDraft({ due_date: event.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={addDraft}
                disabled={!canAdd}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Ajouter au lot
              </button>
            </div>
          </div>

          {batch.length > 0 && (
            <div className="rounded-xl border border-gray-200">
              <div className="border-b border-gray-100 px-4 py-3">
                <h4 className="text-sm font-bold text-gray-900">Lot a creer ({batch.length})</h4>
              </div>
              <div className="divide-y divide-gray-100">
                {batch.map(item => {
                  const procedure = procedureById.get(item.procedure_id);
                  const actor = actorById.get(item.assigned_to);
                  return (
                    <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{item.title}</p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {procedure?.nom || 'Procedure'} - {actorLabel(actor)} - {item.raci_role} / {item.task_type}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDraft(item.id)}
                        title="Retirer"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-400">
            {canAdd ? 'La ligne en cours sera aussi creee.' : 'Ajoutez une tache ou remplissez la ligne en cours.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving || totalToCreate === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {saving ? 'Creation...' : `Creer ${totalToCreate} tache${totalToCreate > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

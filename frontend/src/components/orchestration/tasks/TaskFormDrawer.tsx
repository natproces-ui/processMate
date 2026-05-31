// components/orchestration/tasks/TaskFormDrawer.tsx
'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import type {
  CreateProcedureTaskInput,
  ProcedureTaskPriority,
  ProcedureTaskType,
  RaciRole,
  TaskActor,
} from '@/lib/orchestrationTasksApi';

interface Props {
  procedureId: string;
  actors: TaskActor[];
  assignedBy: TaskActor;
  initialTask?: Partial<CreateProcedureTaskInput>;
  onClose: () => void;
  onSubmit: (procedureId: string, input: CreateProcedureTaskInput) => Promise<void>;
}

const TASK_TYPES: Array<{ value: ProcedureTaskType; label: string }> = [
  { value: 'formalization', label: 'Formalisation' },
  { value: 'review', label: 'Relecture' },
  { value: 'validation', label: 'Validation' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'information', label: 'Information' },
  { value: 'correction', label: 'Correction' },
  { value: 'other', label: 'Autre' },
];

const RACI_ROLES: Array<{ value: RaciRole; label: string }> = [
  { value: 'R', label: 'R - Responsable' },
  { value: 'A', label: 'A - Approbateur' },
  { value: 'C', label: 'C - Consulte' },
  { value: 'I', label: 'I - Informe' },
];

export default function TaskFormDrawer({ procedureId, actors, assignedBy, initialTask, onClose, onSubmit }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: initialTask?.title || '',
    description: initialTask?.description || '',
    assigned_to: initialTask?.assigned_to || actors[0]?.id || '',
    raci_role: (initialTask?.raci_role || 'R') as RaciRole,
    task_type: (initialTask?.task_type || 'formalization') as ProcedureTaskType,
    priority: (initialTask?.priority || 'normal') as ProcedureTaskPriority,
    due_date: initialTask?.due_date || '',
    workflow_stage_id: initialTask?.workflow_stage_id || '',
    workflow_step_id: initialTask?.workflow_step_id || '',
  });

  const submit = async () => {
    if (!form.title.trim() || !form.assigned_to) return;
    setSaving(true);
    try {
      await onSubmit(procedureId, {
        title: form.title.trim(),
        description: form.description.trim(),
        assigned_to: form.assigned_to,
        assigned_by: assignedBy.id,
        raci_role: form.raci_role,
        task_type: form.task_type,
        priority: form.priority,
        due_date: form.due_date || null,
        workflow_stage_id: form.workflow_stage_id || null,
        workflow_step_id: form.workflow_step_id || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="w-full max-w-lg h-full bg-white shadow-xl flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">Nouvelle tache</h3>
            <p className="text-xs text-gray-400 mt-0.5">Affectation manuelle liee a la procedure</p>
          </div>
          <button type="button" onClick={onClose} title="Fermer" className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
            <input
              value={form.title}
              onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))}
              placeholder="Ex: Formaliser la procedure a partir de l'existant"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))}
              rows={4}
              placeholder="Preciser le travail attendu, les sections a revoir, la directive a prendre en compte..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assigne a</label>
              <select
                value={form.assigned_to}
                onChange={event => setForm(prev => ({ ...prev, assigned_to: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {actors.map(actor => (
                  <option key={actor.id} value={actor.id}>{actor.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role RACI</label>
              <select
                value={form.raci_role}
                onChange={event => setForm(prev => ({ ...prev, raci_role: event.target.value as RaciRole }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {RACI_ROLES.map(role => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={form.task_type}
                onChange={event => setForm(prev => ({ ...prev, task_type: event.target.value as ProcedureTaskType }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {TASK_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priorite</label>
              <select
                value={form.priority}
                onChange={event => setForm(prev => ({ ...prev, priority: event.target.value as ProcedureTaskPriority }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="low">Basse</option>
                <option value="normal">Normale</option>
                <option value="high">Haute</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date limite</label>
            <input
              type="date"
              value={form.due_date}
              onChange={event => setForm(prev => ({ ...prev, due_date: event.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !form.title.trim() || !form.assigned_to}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Creation...' : 'Creer la tache'}
          </button>
        </div>
      </div>
    </div>
  );
}

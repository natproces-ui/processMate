'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2, CirclePlay, RotateCcw, Search,
  Send, ShieldCheck, XCircle,
} from 'lucide-react';
import {
  orchestrationTasksApi,
  type ProcedureTask,
  type ProcedureTaskStatus,
  type TaskActor,
} from '@/lib/orchestrationTasksApi';
import { orchestrationApi, type UserProfile } from '@/lib/orchestrationApi';

interface Props {
  task: ProcedureTask;
  actor: TaskActor;
  actors?: TaskActor[];
  message?: string;
  onChanged: (task: ProcedureTask) => void;
  onError?: (message: string) => void;
}

interface ActionConfig {
  status: ProcedureTaskStatus;
  label: string;
  tone: string;
  icon: React.ElementType;
  needsRecipient?: boolean;
}

const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  todo: new Set(['in_progress', 'submitted', 'changes_requested', 'validated', 'completed', 'blocked', 'cancelled']),
  in_progress: new Set(['submitted', 'changes_requested', 'completed', 'blocked', 'cancelled']),
  submitted: new Set(['changes_requested', 'validated', 'completed', 'cancelled']),
  changes_requested: new Set(['in_progress', 'submitted', 'blocked', 'cancelled']),
  waiting_info: new Set(['in_progress', 'submitted', 'completed', 'blocked', 'cancelled']),
  blocked: new Set(['in_progress', 'cancelled']),
  completed: new Set(['validated', 'changes_requested']),
  validated: new Set(),
  cancelled: new Set(),
};

const ALL_ACTIONS: ActionConfig[] = [
  { status: 'in_progress', label: 'Démarrer', tone: 'bg-blue-600 hover:bg-blue-700 text-white', icon: CirclePlay },
  { status: 'submitted', label: 'Soumettre', tone: 'bg-indigo-600 hover:bg-indigo-700 text-white', icon: Send, needsRecipient: true },
  { status: 'validated', label: 'Valider', tone: 'bg-emerald-600 hover:bg-emerald-700 text-white', icon: ShieldCheck },
  { status: 'changes_requested', label: 'Demander correction', tone: 'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200', icon: RotateCcw, needsRecipient: true },
  { status: 'completed', label: 'Terminer', tone: 'bg-green-600 hover:bg-green-700 text-white', icon: CheckCircle2 },
  { status: 'blocked', label: 'Bloquer', tone: 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200', icon: XCircle },
  { status: 'cancelled', label: 'Annuler', tone: 'bg-gray-100 hover:bg-gray-200 text-gray-700', icon: XCircle },
];

const ACTIONS_BY_ROLE: Record<string, ProcedureTaskStatus[]> = {
  R: ['in_progress', 'submitted', 'completed', 'blocked', 'cancelled'],
  A: ['validated', 'changes_requested', 'blocked', 'cancelled'],
  C: ['submitted', 'changes_requested', 'completed', 'blocked'],
  I: ['completed'],
};

// Rôles destinataires selon l'action ET le rôle de l'acteur
const RECIPIENT_ROLES_BY_ACTOR: Record<string, Record<string, Array<{ value: string; label: string; description: string }>>> = {
  submitted: {
    R: [
      { value: 'C', label: 'Vérifieur', description: 'Contrôle la cohérence avant validation' },
      { value: 'A', label: 'Valideur', description: 'Approuve directement sans vérification' },
    ],
    C: [
      { value: 'A', label: 'Valideur', description: 'Approuve officiellement la procédure' },
    ],
  },
  changes_requested: {
    A: [
      { value: 'R', label: 'Responsable', description: 'Corrige et resoumet la procédure' },
      { value: 'C', label: 'Vérifieur', description: 'Revérifie avant de repasser en validation' },
    ],
    C: [
      { value: 'R', label: 'Responsable', description: 'Corrige les points relevés puis resoumet' },
    ],
  },
};

function getRecipientRoles(status: ProcedureTaskStatus, actorRole: string) {
  const byStatus = RECIPIENT_ROLES_BY_ACTOR[status];
  if (!byStatus) return [];
  return byStatus[actorRole] ?? byStatus['R'] ?? byStatus['A'] ?? Object.values(byStatus)[0] ?? [];
}

function isTerminal(status: string) {
  return status === 'validated' || status === 'cancelled';
}

function effectiveRole(task: ProcedureTask, actor: TaskActor): string {
  if (actor.role === 'admin') {
    if (['todo', 'in_progress', 'changes_requested'].includes(task.status)) return 'R';
    if (['submitted', 'completed'].includes(task.status)) return 'A';
    return 'R';
  }
  if (task.raci_role) return task.raci_role;
  const typeToRole: Record<string, string> = {
    formalization: 'R', correction: 'R', review: 'C',
    validation: 'A', consultation: 'C', information: 'I', other: 'R',
  };
  return typeToRole[task.task_type] || 'R';
}

function actionsFor(task: ProcedureTask, actor: TaskActor): ActionConfig[] {
  if (!task?.status) return [];
  if (isTerminal(task.status)) return [];
  const role = effectiveRole(task, actor);
  const allowedStatuses = ACTIONS_BY_ROLE[role] || [];
  const transitions = ALLOWED_TRANSITIONS[task.status] || new Set();
  return ALL_ACTIONS.filter(a =>
    allowedStatuses.includes(a.status) && transitions.has(a.status)
  );
}

// ─── RecipientPicker ─────────────────────────────────────────

interface RecipientPickerProps {
  action: ActionConfig;
  actorRole: string;
  procedureId: string;
  actorId: string;
  onConfirm: (recipientId: string, recipientRole: string) => void;
  onCancel: () => void;
}

function UserRow({
  user,
  isSelected,
  raciRoles,
  onSelect,
}: {
  user: UserProfile;
  isSelected: boolean;
  raciRoles: string[];
  onSelect: () => void;
}) {
  const name = user.display_name || user.full_name || user.email;
  const ini = name.split(' ').filter(Boolean).map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full px-5 py-3 text-left flex items-center gap-3 transition-colors ${
        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
        isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
      }`}>
        {ini}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>
            {name}
          </span>
          {raciRoles.map(r => (
            <span key={r} className="text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 px-1.5 py-0.5 rounded shrink-0">
              {r}
            </span>
          ))}
          {user.global_role === 'admin' && (
            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">Admin</span>
          )}
        </div>
        <p className="text-xs text-gray-400 truncate mt-0.5">
          {[user.job_title, user.department].filter(Boolean).join(' · ') || user.email}
        </p>
      </div>
      {isSelected && <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />}
    </button>
  );
}

function RecipientPicker({ action, actorRole, procedureId, actorId, onConfirm, onCancel }: RecipientPickerProps) {
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  // user_id → roles RACI de cet utilisateur sur cette procédure
  const [raciRoleMap, setRaciRoleMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  const roles = getRecipientRoles(action.status, actorRole);
  const [selectedRole, setSelectedRole] = useState(roles[0]?.value || 'A');

  useEffect(() => {
    Promise.all([
      orchestrationApi.listUsers({ active_only: true }),
      orchestrationApi.getProcedureAssignments(procedureId),
    ])
      .then(([usersRes, assignRes]) => {
        setAllUsers(usersRes.users);
        // Construire la map user_id → [raci_roles] à partir des assignments
        const map: Record<string, string[]> = {};
        for (const a of assignRes.assignments) {
          if (!a.user_id) continue;
          if (!map[a.user_id]) map[a.user_id] = [];
          if (a.raci_role && !map[a.user_id].includes(a.raci_role)) {
            map[a.user_id].push(a.raci_role);
          }
        }
        setRaciRoleMap(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [procedureId]);

  // Quand le rôle change, réinitialiser la sélection si l'utilisateur choisi
  // n'a pas ce rôle dans le RACI (pour éviter une sélection incohérente)
  useEffect(() => {
    if (!selectedUserId) return;
    // on garde la sélection — l'utilisateur peut choisir n'importe qui
  }, [selectedRole, selectedUserId]);

  const q = search.toLowerCase();
  const matchesSearch = (u: UserProfile) => {
    if (!q) return true;
    return (
      (u.display_name || u.full_name || '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.job_title || '').toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q)
    );
  };

  // Exclure l'acteur courant de la liste
  const candidates = allUsers.filter(u => u.id !== actorId && matchesSearch(u));

  // Séparer : dans le RACI avec le rôle cible / tous les autres
  const inRaci = candidates.filter(u => raciRoleMap[u.id]?.includes(selectedRole));
  const notInRaci = candidates.filter(u => !raciRoleMap[u.id]?.includes(selectedRole));

  const selectedRoleCfg = roles.find(r => r.value === selectedRole);
  const selectedUser = allUsers.find(u => u.id === selectedUserId);
  const selectedUserIsRaci = selectedUserId ? !!raciRoleMap[selectedUserId]?.includes(selectedRole) : false;

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[500px] max-h-[90vh] flex flex-col overflow-hidden">

        {/* En-tête */}
        <div className="px-5 py-4 border-b border-gray-200">
          <h4 className="font-bold text-gray-900">
            {action.status === 'submitted' ? 'Soumettre à...' : 'Renvoyer pour correction à...'}
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Les personnes déjà dans le RACI de la procédure apparaissent en tête.
          </p>
        </div>

        {/* Sélection du rôle destinataire */}
        {roles.length > 0 && (
          <div className="px-5 py-3 border-b border-gray-100 flex gap-2">
            {roles.map(r => (
              <button
                key={r.value}
                type="button"
                onClick={() => setSelectedRole(r.value)}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-left transition-all ${
                  selectedRole === r.value
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    selectedRole === r.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {r.value}
                  </span>
                  <span className={`text-sm font-semibold ${selectedRole === r.value ? 'text-blue-700' : 'text-gray-700'}`}>
                    {r.label}
                  </span>
                  {/* Nombre de personnes RACI pour ce rôle */}
                  {(() => {
                    const count = allUsers.filter(u => u.id !== actorId && raciRoleMap[u.id]?.includes(r.value)).length;
                    return count > 0 ? (
                      <span className="ml-auto text-[10px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                        {count}
                      </span>
                    ) : null;
                  })()}
                </div>
                <p className="text-xs text-gray-400">{r.description}</p>
              </button>
            ))}
          </div>
        )}

        {/* Recherche */}
        <div className="px-5 py-2.5 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              placeholder="Rechercher un utilisateur..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400 text-sm gap-2">
              <span className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
              Chargement...
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">Aucun utilisateur trouvé</div>
          ) : (
            <>
              {/* Section RACI */}
              {inRaci.length > 0 && (
                <>
                  <div className="px-5 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
                    <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide">
                      Dans la procédure — rôle {selectedRole}
                    </span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold">
                      {inRaci.length}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {inRaci.map(u => (
                      <UserRow
                        key={u.id}
                        user={u}
                        isSelected={selectedUserId === u.id}
                        raciRoles={raciRoleMap[u.id] || []}
                        onSelect={() => setSelectedUserId(u.id)}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Section hors RACI */}
              {notInRaci.length > 0 && (
                <>
                  <div className="px-5 py-2 bg-gray-50 border-y border-gray-100 flex items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                      {inRaci.length > 0 ? 'Autres utilisateurs' : 'Tous les utilisateurs'}
                    </span>
                    {inRaci.length === 0 && (
                      <span className="text-[10px] text-gray-400 normal-case font-normal">
                        — aucun {selectedRoleCfg?.label.toLowerCase()} défini dans le RACI
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-gray-50">
                    {notInRaci.map(u => (
                      <UserRow
                        key={u.id}
                        user={u}
                        isSelected={selectedUserId === u.id}
                        raciRoles={raciRoleMap[u.id] || []}
                        onSelect={() => setSelectedUserId(u.id)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Récapitulatif + confirmation */}
        <div className="px-5 py-4 border-t border-gray-200 bg-gray-50">
          {selectedUser && selectedRoleCfg ? (
            <p className="text-xs text-gray-600 mb-3">
              <span className="font-semibold text-gray-900">
                {selectedUser.display_name || selectedUser.full_name || selectedUser.email}
              </span>
              {' '}recevra la tâche en tant que{' '}
              <span className="font-semibold text-blue-700">{selectedRoleCfg.label} ({selectedRole})</span>
              {!selectedUserIsRaci && (
                <span className="text-amber-600"> — sera ajouté au RACI</span>
              )}
              .
            </p>
          ) : (
            <p className="text-xs text-gray-400 mb-3">Sélectionnez un destinataire.</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={!selectedUserId}
              onClick={() => onConfirm(selectedUserId, selectedRole)}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-blue-700"
            >
              Confirmer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TaskActionBar ─────────────────────────────────────────────

function transitionIntent(status: ProcedureTaskStatus, recipientRole?: string) {
  if (status === 'submitted') {
    return recipientRole === 'C' ? 'submit_for_review' : 'submit_for_validation';
  }
  if (status === 'changes_requested') {
    return recipientRole === 'C' ? 'return_to_review' : 'request_correction';
  }
  return status;
}

export default function TaskActionBar({ task, actor, message, onChanged, onError }: Props) {
  const [savingStatus, setSavingStatus] = useState<ProcedureTaskStatus | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionConfig | null>(null);

  if (!task) return null;

  const role = effectiveRole(task, actor);
  const actions = actionsFor(task, actor);

  const transition = async (
    status: ProcedureTaskStatus,
    overrideRecipientId?: string,
    overrideRecipientRole?: string,
  ) => {
    setSavingStatus(status);
    setPendingAction(null);
    try {
      const payload: Record<string, unknown> = {};
      if (overrideRecipientId) payload.override_recipient_id = overrideRecipientId;
      if (overrideRecipientRole) payload.override_recipient_role = overrideRecipientRole;
      payload.transition_intent = transitionIntent(status, overrideRecipientRole);

      const res = await orchestrationTasksApi.transitionTask(task.id, {
        actor_id: actor.id,
        status,
        message: message || undefined,
        payload,
      });
      onChanged(res.task);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Erreur transition de tâche');
    } finally {
      setSavingStatus(null);
    }
  };

  const handleAction = (action: ActionConfig) => {
    if (action.needsRecipient) {
      setPendingAction(action);
    } else {
      transition(action.status);
    }
  };

  if (actions.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">
        {isTerminal(task.status)
          ? `Tâche ${task.status === 'validated' ? 'validée' : 'annulée'} — aucune action possible.`
          : 'Aucune action disponible pour cette tâche.'}
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map(action => {
          const Icon = action.icon;
          const isSaving = savingStatus === action.status;
          return (
            <button
              key={action.status}
              type="button"
              onClick={() => handleAction(action)}
              disabled={savingStatus !== null || task.status === action.status}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors ${action.tone}`}
            >
              {isSaving
                ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : <Icon className="w-4 h-4" />}
              {isSaving ? 'Traitement...' : action.label}
            </button>
          );
        })}
      </div>

      {pendingAction && (
        <RecipientPicker
          action={pendingAction}
          actorRole={role}
          procedureId={task.procedure_id}
          actorId={actor.id}
          onConfirm={(recipientId, recipientRole) =>
            transition(pendingAction.status, recipientId, recipientRole)
          }
          onCancel={() => setPendingAction(null)}
        />
      )}
    </>
  );
}     
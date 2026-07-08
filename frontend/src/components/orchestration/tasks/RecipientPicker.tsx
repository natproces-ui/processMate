'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Search } from 'lucide-react';
import { orchestrationApi, type UserProfile } from '@/lib/orchestrationApi';

export interface RecipientRole {
  value: string;
  label: string;
  description: string;
}

export interface RecipientPickerProps {
  title: string;
  subtitle?: string;
  procedureId: string;
  actorId: string;
  roles?: RecipientRole[];
  defaultRole?: string;
  showMessage?: boolean;
  confirmLabel?: string;
  onConfirm: (recipientId: string, recipientRole: string, message: string) => void;
  onCancel: () => void;
}

function UserRow({
  user, isSelected, raciRoles, onSelect,
}: {
  user: UserProfile; isSelected: boolean; raciRoles: string[]; onSelect: () => void;
}) {
  const name = user.display_name || user.full_name || user.email;
  const ini = name.split(' ').filter(Boolean).map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  return (
    <button type="button" onClick={onSelect}
      className={`w-full px-5 py-3 text-left flex items-center gap-3 transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{ini}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>{name}</span>
          {raciRoles.map(r => (
            <span key={r} className="text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 px-1.5 py-0.5 rounded shrink-0">{r}</span>
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

export default function RecipientPicker({
  title, subtitle, procedureId, actorId,
  roles = [], defaultRole, showMessage = false, confirmLabel = 'Confirmer',
  onConfirm, onCancel,
}: RecipientPickerProps) {
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [raciRoleMap, setRaciRoleMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [message, setMessage] = useState('');

  const [selectedRole, setSelectedRole] = useState(defaultRole || roles[0]?.value || 'C');

  useEffect(() => {
    Promise.all([
      orchestrationApi.listUsers({ active_only: true }),
      orchestrationApi.getProcedureAssignments(procedureId).catch(() => ({ assignments: [] })),
    ]).then(([usersRes, assignRes]) => {
      setAllUsers(usersRes.users);
      const map: Record<string, string[]> = {};
      for (const a of (assignRes.assignments || [])) {
        if (!a.user_id) continue;
        if (!map[a.user_id]) map[a.user_id] = [];
        if (a.raci_role && !map[a.user_id].includes(a.raci_role)) {
          map[a.user_id].push(a.raci_role);
        }
      }
      setRaciRoleMap(map);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [procedureId]);

  const q = search.toLowerCase();
  const matchesSearch = (u: UserProfile) => {
    if (!q) return true;
    return (u.display_name || u.full_name || '').toLowerCase().includes(q)
      || u.email.toLowerCase().includes(q)
      || (u.job_title || '').toLowerCase().includes(q)
      || (u.department || '').toLowerCase().includes(q);
  };

  const candidates = allUsers.filter(u => u.id !== actorId && matchesSearch(u));
  const inRaci = candidates.filter(u => raciRoleMap[u.id]?.includes(selectedRole));
  const notInRaci = candidates.filter(u => !raciRoleMap[u.id]?.includes(selectedRole));

  const selectedRoleCfg = roles.find(r => r.value === selectedRole);
  const selectedUser = allUsers.find(u => u.id === selectedUserId);
  const selectedUserIsRaci = selectedUserId ? !!raciRoleMap[selectedUserId]?.includes(selectedRole) : false;

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[500px] max-h-[90vh] flex flex-col overflow-hidden">

        <div className="px-5 py-4 border-b border-gray-200">
          <h4 className="font-bold text-gray-900">{title}</h4>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>

        {roles.length > 1 && (
          <div className="px-5 py-3 border-b border-gray-100 flex gap-2">
            {roles.map(r => (
              <button key={r.value} type="button" onClick={() => setSelectedRole(r.value)}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-left transition-all ${selectedRole === r.value ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${selectedRole === r.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{r.value}</span>
                  <span className={`text-sm font-semibold ${selectedRole === r.value ? 'text-blue-700' : 'text-gray-700'}`}>{r.label}</span>
                  {(() => {
                    const count = allUsers.filter(u => u.id !== actorId && raciRoleMap[u.id]?.includes(r.value)).length;
                    return count > 0 ? <span className="ml-auto text-[10px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">{count}</span> : null;
                  })()}
                </div>
                <p className="text-xs text-gray-400">{r.description}</p>
              </button>
            ))}
          </div>
        )}

        <div className="px-5 py-2.5 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} autoFocus
              placeholder="Rechercher un utilisateur..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
        </div>

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
              {inRaci.length > 0 && (
                <>
                  <div className="px-5 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
                    <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide">Dans la procédure — rôle {selectedRole}</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold">{inRaci.length}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {inRaci.map(u => <UserRow key={u.id} user={u} isSelected={selectedUserId === u.id} raciRoles={raciRoleMap[u.id] || []} onSelect={() => setSelectedUserId(u.id)} />)}
                  </div>
                </>
              )}
              {notInRaci.length > 0 && (
                <>
                  <div className="px-5 py-2 bg-gray-50 border-y border-gray-100 flex items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                      {inRaci.length > 0 ? 'Autres utilisateurs' : 'Tous les utilisateurs'}
                    </span>
                    {inRaci.length === 0 && selectedRoleCfg && (
                      <span className="text-[10px] text-gray-400 normal-case font-normal">— aucun {selectedRoleCfg.label.toLowerCase()} défini dans le RACI</span>
                    )}
                  </div>
                  <div className="divide-y divide-gray-50">
                    {notInRaci.map(u => <UserRow key={u.id} user={u} isSelected={selectedUserId === u.id} raciRoles={raciRoleMap[u.id] || []} onSelect={() => setSelectedUserId(u.id)} />)}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {showMessage && (
          <div className="px-5 py-3 border-t border-gray-100">
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Message au destinataire (optionnel)…" rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>
        )}

        <div className="px-5 py-4 border-t border-gray-200 bg-gray-50">
          {selectedUser && selectedRoleCfg ? (
            <p className="text-xs text-gray-600 mb-3">
              <span className="font-semibold text-gray-900">{selectedUser.display_name || selectedUser.full_name || selectedUser.email}</span>
              {' '}recevra la tâche en tant que{' '}
              <span className="font-semibold text-blue-700">{selectedRoleCfg.label} ({selectedRole})</span>
              {!selectedUserIsRaci && <span className="text-amber-600"> — sera ajouté au RACI</span>}.
            </p>
          ) : (
            <p className="text-xs text-gray-400 mb-3">Sélectionnez un destinataire.</p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">Annuler</button>
            <button type="button" disabled={!selectedUserId} onClick={() => onConfirm(selectedUserId, selectedRole, message)}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-blue-700">{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

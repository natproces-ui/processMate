'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Plus, X, RefreshCw, Lock, AlertCircle, Save, Check, Search } from 'lucide-react';
import { orchestrationApi, UserProfile } from '@/lib/orchestrationApi';
import type { TaskActor } from '@/lib/orchestrationTasksApi';
import { ProcedureTaskPanel } from '@/components/orchestration/tasks';

interface RaciPerson {
  user_id: string;
  name: string;
  email?: string | null;
  job_title?: string | null;
  department?: string | null;
  assignment_type?: string;
  legacy?: boolean;
}

interface ProcRaci {
  id: string;
  nom: string;
  people: RaciPerson[];
  matrix: Record<string, string>;
  is_finalized: boolean;
  source?: string;
}

interface RACIMatrixProps {
  currentActor: TaskActor;
  filterProcedureId?: string;
}

const ROLES = ['R', 'A', 'C', 'I', '-'] as const;
type Role = typeof ROLES[number];

const ROLE_CFG: Record<Role, { active: string; inactive: string; label: string }> = {
  R: { active: 'bg-blue-600 text-white border-blue-600', inactive: 'bg-white text-blue-400 border-blue-200 hover:bg-blue-50', label: 'Responsable' },
  A: { active: 'bg-red-600 text-white border-red-600', inactive: 'bg-white text-red-400 border-red-200 hover:bg-red-50', label: 'Approbateur' },
  C: { active: 'bg-green-600 text-white border-green-600', inactive: 'bg-white text-green-400 border-green-200 hover:bg-green-50', label: 'Consulté' },
  I: { active: 'bg-yellow-500 text-white border-yellow-500', inactive: 'bg-white text-yellow-500 border-yellow-200 hover:bg-yellow-50', label: 'Informé' },
  '-': { active: 'bg-gray-300 text-gray-600 border-gray-300', inactive: 'bg-white text-gray-300 border-gray-200 hover:bg-gray-50', label: 'Aucun' },
};

function displayName(user: UserProfile) {
  return user.display_name || user.full_name || user.email;
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function mapUserToActor(user: UserProfile): TaskActor {
  return {
    id: user.id,
    name: displayName(user),
    email: user.email,
    job_title: user.job_title,
    department: user.department,
    role: user.global_role === 'admin' ? 'admin' : 'user',
  };
}

export default function RACIMatrix({ currentActor, filterProcedureId }: RACIMatrixProps) {
  const canEdit = currentActor.role === 'admin';
  const [procedures, setProcedures] = useState<ProcRaci[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [localMatrix, setLocalMatrix] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [taskPanelProcedure, setTaskPanelProcedure] = useState<ProcRaci | null>(null);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await orchestrationApi.listUsers({ active_only: true });
      setUsers(res.users);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await orchestrationApi.getGlobalRaci();
      const mat: Record<string, Record<string, string>> = {};

      const procs: ProcRaci[] = res.procedures.map(p => {
        mat[p.id] = p.matrix || {};

        const assignmentPeople: RaciPerson[] = (p.assignments || []).map(a => ({
          user_id: a.user_id,
          name: a.name,
          email: a.email,
          job_title: a.job_title,
          department: a.department,
          assignment_type: a.assignment_type,
        }));

        const legacyPeople: RaciPerson[] = p.people
          .filter(name => !assignmentPeople.some(a => a.name === name))
          .map(name => ({
            user_id: name,
            name,
            legacy: true,
          }));

        return {
          id: p.id,
          nom: p.nom,
          people: assignmentPeople.length > 0 ? assignmentPeople : legacyPeople,
          matrix: p.matrix || {},
          is_finalized: p.is_finalized,
          source: p.source,
        };
      });

      setProcedures(procs);
      setLocalMatrix(mat);
      setSavedIds(new Set(procs.map(p => p.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadUsers();
  }, [load, loadUsers]);

  const visibleProcedures = useMemo(() =>
    filterProcedureId ? procedures.filter(p => p.id === filterProcedureId) : procedures,
    [procedures, filterProcedureId]
  );

  const taskActors = useMemo(() => users.map(mapUserToActor), [users]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;

    return users.filter(user => (
      displayName(user).toLowerCase().includes(q)
      || user.email.toLowerCase().includes(q)
      || (user.job_title || '').toLowerCase().includes(q)
      || (user.department || '').toLowerCase().includes(q)
    ));
  }, [users, userSearch]);

  const setRole = (procId: string, personName: string, role: Role) => {
    setLocalMatrix(prev => ({
      ...prev,
      [procId]: { ...(prev[procId] || {}), [personName]: role },
    }));
    setSavedIds(prev => {
      const s = new Set(prev);
      s.delete(procId);
      return s;
    });
  };

  const saveRaci = async (procId: string) => {
    const proc = procedures.find(p => p.id === procId);
    if (!proc) return;

    const hasLegacyPeople = proc.people.some(p => p.legacy);

    setSaving(procId);
    try {
      if (hasLegacyPeople) {
        const people = proc.people.map(p => p.name);
        await orchestrationApi.updateRaci(procId, people, localMatrix[procId] || {});
      } else {
        const assignments = proc.people
          .map(person => {
            const role = localMatrix[procId]?.[person.name];
            return {
              user_id: person.user_id,
              raci_role: role && role !== '-' ? role as 'R' | 'A' | 'C' | 'I' : null,
              assignment_type: person.assignment_type === 'owner' || role === 'R' ? 'owner' as const : 'contributor' as const,
              is_required: true,
              stage_id: null,
              workflow_step_id: null,
              due_date: null,
            };
          })
          .filter(item => item.raci_role);

        await orchestrationApi.updateRaciAssignments(procId, assignments);
      }

      setSavedIds(prev => new Set([...prev, procId]));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur sauvegarde');
    } finally {
      setSaving(null);
    }
  };

  const addUser = (procId: string, user: UserProfile) => {
    const name = displayName(user);

    setProcedures(prev => prev.map(proc => {
      if (proc.id !== procId) return proc;
      if (proc.people.some(p => p.user_id === user.id || p.name === name)) return proc;

      return {
        ...proc,
        people: [
          ...proc.people,
          {
            user_id: user.id,
            name,
            email: user.email,
            job_title: user.job_title,
            department: user.department,
            assignment_type: 'contributor',
          },
        ],
      };
    }));

    setLocalMatrix(prev => ({
      ...prev,
      [procId]: {
        ...(prev[procId] || {}),
        [name]: prev[procId]?.[name] || 'R',
      },
    }));

    setSavedIds(prev => {
      const s = new Set(prev);
      s.delete(procId);
      return s;
    });

    setAddingFor(null);
    setUserSearch('');
  };

  const removePerson = (procId: string, person: RaciPerson) => {
    setProcedures(prev => prev.map(proc => (
      proc.id === procId
        ? { ...proc, people: proc.people.filter(p => p.user_id !== person.user_id || p.name !== person.name) }
        : proc
    )));

    setLocalMatrix(prev => {
      const updatedMatrix = { ...(prev[procId] || {}) };
      delete updatedMatrix[person.name];
      return { ...prev, [procId]: updatedMatrix };
    });

    setSavedIds(prev => {
      const s = new Set(prev);
      s.delete(procId);
      return s;
    });
  };

  if (loading) return (
    <div className="p-8 flex items-center justify-center h-64 text-gray-400">
      <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-400" /> Chargement RACI...
    </div>
  );

  if (error) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
        <p className="flex-1 text-red-700 text-sm">{error}</p>
        <button type="button" onClick={load} className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200">
          Réessayer
        </button>
      </div>
    </div>
  );

  return (
    <div className={filterProcedureId ? 'p-4 space-y-4' : 'p-8 space-y-6'}>
      {!filterProcedureId && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Matrice RACI</h2>
              <p className="text-sm text-gray-500 mt-0.5">Assignez un rôle à chaque utilisateur par procédure</p>
            </div>
            <button type="button" onClick={load} title="Actualiser"
              className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-600">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            {(Object.entries(ROLE_CFG) as [Role, typeof ROLE_CFG[Role]][]).filter(([r]) => r !== '-').map(([role, cfg]) => (
              <div key={role} className="flex items-center gap-1.5">
                <span className={`w-6 h-6 rounded border flex items-center justify-center font-bold text-xs ${cfg.active}`}>{role}</span>
                <span className="text-gray-600">{cfg.label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {visibleProcedures.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aucune procédure</p>
          <p className="text-sm mt-1">Créez des procédures dans l&apos;onglet Procédures.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleProcedures.map(proc => {
            const isSaved = savedIds.has(proc.id);
            const matrix = localMatrix[proc.id] || {};
            const selectedUserIds = new Set(proc.people.filter(p => !p.legacy).map(p => p.user_id));

            return (
              <div key={proc.id} className={`relative bg-white rounded-xl border shadow-sm overflow-visible ${proc.is_finalized ? 'border-green-200' : 'border-gray-200'}`}>

                <div className={`px-5 py-3 flex items-center justify-between gap-4 ${proc.is_finalized ? 'bg-green-50' : 'bg-gray-50'} border-b ${proc.is_finalized ? 'border-green-100' : 'border-gray-100'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {proc.is_finalized && <Lock className="w-4 h-4 text-green-600 shrink-0" />}
                    <h3 className="font-semibold text-gray-900 truncate">{proc.nom}</h3>
                    {proc.is_finalized && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">Finalisée</span>}
                    {proc.source === 'metadata_json' && proc.people.length > 0 && (
                      <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                        RACI historique
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setTaskPanelProcedure(proc)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-blue-700 border border-blue-200 hover:bg-blue-50"
                    >
                      Gérer les tâches
                    </button>

                    {canEdit && !proc.is_finalized && (
                      <button type="button" onClick={() => saveRaci(proc.id)}
                        disabled={saving === proc.id || isSaved}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isSaved
                          ? 'bg-green-50 text-green-600 border border-green-200 cursor-default'
                          : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                          }`}>
                        {saving === proc.id
                          ? <RefreshCw className="w-3 h-3 animate-spin" />
                          : isSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                        {isSaved ? 'Sauvegardé' : 'Sauvegarder'}
                      </button>
                    )}
                  </div>
                </div>

                {canEdit && !proc.is_finalized && (
                  <div className="px-5 py-2.5 bg-white border-b border-gray-50 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400 font-medium">Utilisateurs :</span>
                    {proc.people.length === 0 && (
                      <span className="text-xs text-gray-400 italic">Aucun utilisateur affecté</span>
                    )}
                    {proc.people.map(person => (
                      <span key={`${person.user_id}-${person.name}`} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-0.5 text-xs text-gray-700">
                        {person.name}
                        {person.department && <span className="text-gray-400">· {person.department}</span>}
                        {person.legacy && <span className="text-amber-600">historique</span>}
                        <button type="button" onClick={() => removePerson(proc.id, person)}
                          className="text-gray-300 hover:text-red-500 ml-0.5 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}

                    {addingFor === proc.id ? (
                      <div className="relative z-50 flex items-center gap-1.5">
                        <div className="relative z-50">
                          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={userSearch}
                            onChange={e => setUserSearch(e.target.value)}
                            autoFocus
                            placeholder="Rechercher un utilisateur..."
                            className="pl-7 pr-2.5 py-1 border border-blue-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 w-56"
                          />

                          <div className="absolute left-0 top-full mt-1 w-80 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-50">
                            {usersLoading ? (
                              <div className="px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
                                <RefreshCw className="w-3 h-3 animate-spin" /> Chargement...
                              </div>
                            ) : filteredUsers.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-gray-400">Aucun utilisateur trouvé</div>
                            ) : (
                              filteredUsers
                                .filter(user => !selectedUserIds.has(user.id))
                                .slice(0, 20)
                                .map(user => (
                                  <button
                                    key={user.id}
                                    type="button"
                                    title={`Ajouter ${displayName(user)}`}
                                    onClick={() => addUser(proc.id, user)}
                                    className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center gap-2 border-b border-gray-50 last:border-b-0"
                                  >
                                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                                      {initials(displayName(user))}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-xs font-medium text-gray-800 truncate">{displayName(user)}</div>
                                      <div className="text-[11px] text-gray-400 truncate">
                                        {[user.job_title, user.department, user.email].filter(Boolean).join(' · ')}
                                      </div>
                                    </div>
                                  </button>
                                ))
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          title="Fermer"
                          onClick={() => { setAddingFor(null); setUserSearch(''); }}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setAddingFor(proc.id); setUserSearch(''); }}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded-full px-2.5 py-0.5 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Ajouter
                      </button>
                    )}

                  </div>
                )}

                {proc.people.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-gray-400">
                    Ajoutez des utilisateurs pour construire la matrice.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-64">
                            Utilisateur
                          </th>
                          {ROLES.filter(r => r !== '-').map(role => (
                            <th key={role} className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`w-6 h-6 rounded border flex items-center justify-center font-bold ${ROLE_CFG[role as Role].active}`}>{role}</span>
                                <span className="normal-case font-normal text-gray-400">{ROLE_CFG[role as Role].label}</span>
                              </div>
                            </th>
                          ))}
                          <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-400 text-xs">—</span>
                              <span className="normal-case font-normal text-gray-400">Aucun</span>
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {proc.people.map(person => {
                          const currentRole = matrix[person.name] || '';
                          return (
                            <tr key={`${person.user_id}-${person.name}`} className="hover:bg-gray-50 transition-colors">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">
                                    {initials(person.name)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-gray-800 truncate">{person.name}</div>
                                    <div className="text-xs text-gray-400 truncate">
                                      {[person.job_title, person.department, person.email].filter(Boolean).join(' · ')}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              {ROLES.map(role => {
                                const isActive = currentRole === role;
                                const cfg = ROLE_CFG[role as Role];
                                return (
                                  <td key={role} className="px-3 py-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => canEdit && !proc.is_finalized && setRole(proc.id, person.name, role as Role)}
                                      disabled={!canEdit || proc.is_finalized}
                                      title={!canEdit ? 'Lecture seule' : proc.is_finalized ? 'Procédure finalisée' : `Assigner rôle ${role} — ${cfg.label}`}
                                      className={`w-8 h-8 rounded-lg border font-bold text-xs transition-all ${isActive ? cfg.active : cfg.inactive
                                        } ${canEdit && !proc.is_finalized ? 'cursor-pointer hover:scale-110' : 'cursor-default opacity-70'}`}
                                    >
                                      {role === '-' ? '—' : role}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {taskPanelProcedure && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-xl shadow-xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Gestion des tâches</h3>
                <p className="text-sm text-gray-500">{taskPanelProcedure.nom}</p>
              </div>
              <button
                type="button"
                onClick={() => setTaskPanelProcedure(null)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
              >
                Fermer
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <ProcedureTaskPanel
                procedureId={taskPanelProcedure.id}
                procedureName={taskPanelProcedure.nom}
                actors={taskActors}
                currentActor={currentActor}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

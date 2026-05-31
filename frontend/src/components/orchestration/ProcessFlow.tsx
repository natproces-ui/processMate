'use client';

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2, Clock, AlertCircle, MapPin, RefreshCw,
  Calendar, ChevronDown, X, Users, CheckCheck, Info,
  AlertTriangle,
} from 'lucide-react';
import {
  orchestrationApi, Procedure, LifecycleStage,
  ProcedureAssignment, procedureStatusCls, fmtDate,
} from '@/lib/orchestrationApi';
import { orchestrationTasksApi, ProcedureTask } from '@/lib/orchestrationTasksApi';

const STAGE_CFG = {
  completed:   { color: 'bg-green-500',  text: 'text-green-700',  badge: 'bg-green-100 text-green-800',  label: '✓ Complété',   Icon: CheckCircle2 },
  in_progress: { color: 'bg-blue-500',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-800',    label: '⟳ En cours',   Icon: Clock },
  blocked:     { color: 'bg-red-500',    text: 'text-red-700',    badge: 'bg-red-100 text-red-800',      label: '⚠ Bloqué',     Icon: AlertCircle },
  pending:     { color: 'bg-gray-200',   text: 'text-gray-400',   badge: 'bg-gray-100 text-gray-500',    label: '○ En attente', Icon: Clock },
};

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'À faire', in_progress: 'En cours', submitted: 'Soumis',
  changes_requested: 'Révision', waiting_info: 'En attente',
  blocked: 'Bloqué', completed: 'Terminé', validated: 'Validé', cancelled: 'Annulé',
};

const TASK_STATUS_COLORS: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  submitted: 'bg-purple-100 text-purple-700',
  changes_requested: 'bg-orange-100 text-orange-700',
  waiting_info: 'bg-yellow-100 text-yellow-700',
  blocked: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
  validated: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-400',
};

const RACI_LABELS: Record<string, string> = { R: 'Responsable', A: 'Approbateur', C: 'Consulté', I: 'Informé' };

const RACI_STYLE: Record<string, { badge: string }> = {
  R: { badge: 'bg-blue-100 text-blue-800'   },
  A: { badge: 'bg-green-100 text-green-800' },
  C: { badge: 'bg-amber-100 text-amber-800' },
  I: { badge: 'bg-gray-100 text-gray-600'   },
};

// Maps task_type (always set at creation) → lifecycle stage title
const TASK_TYPE_TO_STAGE: Record<string, string> = {
  formalization: 'Formalisation',
  review:        'Vérification',
  correction:    'Vérification',
  validation:    'Validation',
  consultation:  'Création',
  information:   'Publication',
};

// ─── Modal détail étape ────────────────────────────────────────

function StageModal({
  stage, allTasks, allAssignments, onClose,
}: {
  stage: LifecycleStage;
  allTasks: ProcedureTask[];
  allAssignments: ProcedureAssignment[];
  onClose: () => void;
}) {
  const cfg = STAGE_CFG[stage.status] || STAGE_CFG.pending;
  const workshopDone = stage.workshop_done || stage.status === 'completed';

  const tasks = allTasks.filter(t => TASK_TYPE_TO_STAGE[t.task_type] === stage.title);
  const assignments = allAssignments;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-6 rounded-t-2xl ${stage.status === 'completed' ? 'bg-green-50' : stage.status === 'in_progress' ? 'bg-blue-50' : stage.status === 'blocked' ? 'bg-red-50' : 'bg-gray-50'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
              <h2 className={`text-xl font-bold mt-2 ${cfg.text}`}>{stage.title}</h2>
              {stage.description && <p className="text-sm text-gray-500 mt-1">{stage.description}</p>}
            </div>
            <button type="button" onClick={onClose} title="Fermer" className="p-1.5 rounded-lg hover:bg-black/10 transition-colors shrink-0">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">

          {/* Atelier */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Atelier
            </h3>
            <div className={`flex items-center gap-3 p-3 rounded-xl ${workshopDone ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${workshopDone ? 'bg-green-100' : 'bg-amber-100'}`}>
                {workshopDone
                  ? <CheckCheck className="w-4 h-4 text-green-600" />
                  : <Calendar className="w-4 h-4 text-amber-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${workshopDone ? 'text-green-800' : 'text-amber-800'}`}>{stage.workshop}</p>
                <p className={`text-xs mt-0.5 ${workshopDone ? 'text-green-600' : 'text-amber-600'}`}>
                  {workshopDone ? '✓ Réalisé' : 'À planifier'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-5">
              {/* Personnes impliquées — tâches de l'étape */}
              {tasks.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Intervenants — étape {stage.title}
                  </h3>
                  <div className="space-y-2">
                    {tasks.map(t => (
                      <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-blue-700">
                            {(t.assigned_to_name ?? t.assigned_to).slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{t.assigned_to_name ?? t.assigned_to}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {t.raci_role ? `${RACI_LABELS[t.raci_role] ?? t.raci_role} · ` : ''}
                            {t.title}
                          </p>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${TASK_STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {TASK_STATUS_LABELS[t.status] ?? t.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Matrice RACI */}
              {assignments.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Matrice RACI
                  </h3>
                  <div className="rounded-xl border border-gray-200 overflow-hidden text-sm">
                    {/* En-tête */}
                    <div className="grid grid-cols-[1fr_repeat(4,2.5rem)] bg-gray-50 border-b border-gray-200">
                      <div className="px-3 py-2 text-xs font-semibold text-gray-500">Personne</div>
                      {(['R', 'A', 'C', 'I'] as const).map(role => (
                        <div key={role} className={`py-2 text-center text-xs font-bold ${RACI_STYLE[role].badge} border-l border-gray-200`} title={RACI_LABELS[role]}>
                          {role}
                        </div>
                      ))}
                    </div>
                    {/* Lignes */}
                    {assignments.map((a, i) => {
                      const name = a.user_profiles?.full_name ?? a.user_profiles?.display_name ?? a.user_id;
                      const job = a.user_profiles?.job_title;
                      const initials = name.slice(0, 2).toUpperCase();
                      return (
                        <div key={i} className={`grid grid-cols-[1fr_repeat(4,2.5rem)] items-center ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'} border-b border-gray-100 last:border-0`}>
                          <div className="flex items-center gap-2 px-3 py-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                              <span className="text-[11px] font-bold text-indigo-700">{initials}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 truncate leading-tight">{name}</p>
                              {job && <p className="text-[11px] text-gray-400 truncate leading-tight">{job}</p>}
                            </div>
                          </div>
                          {(['R', 'A', 'C', 'I'] as const).map(role => (
                            <div key={role} className="flex items-center justify-center border-l border-gray-100 py-2.5">
                              {a.raci_role === role
                                ? <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${RACI_STYLE[role].badge}`}>{role}</span>
                                : <span className="text-gray-200 text-xs">—</span>}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  {/* Légende */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {(['R', 'A', 'C', 'I'] as const).map(role => (
                      <span key={role} className="text-[11px] text-gray-400">
                        <span className={`font-bold ${RACI_STYLE[role].badge.split(' ')[1]}`}>{role}</span> {RACI_LABELS[role]}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {tasks.length === 0 && assignments.length === 0 && (
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <Info className="w-4 h-4 text-gray-300 shrink-0" />
                  <p className="text-sm text-gray-400">Aucune personne assignée à cette étape</p>
                </div>
              )}
          </div>

          {/* Notes */}
          {stage.notes && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Notes
              </h3>
              <p className="text-sm text-gray-700 bg-yellow-50 border border-yellow-100 rounded-xl p-3 italic">{stage.notes}</p>
            </div>
          )}

          {/* Date complétion */}
          {stage.completed_at && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl p-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Complété le {fmtDate(stage.completed_at)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────

export default function ProcessFlow() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSelector, setShowSelector] = useState(false);
  const [popupStage, setPopupStage] = useState<LifecycleStage | null>(null);
  const [procTasks, setProcTasks] = useState<ProcedureTask[]>([]);
  const [procAssignments, setProcAssignments] = useState<ProcedureAssignment[]>([]);

  useEffect(() => {
    orchestrationApi.listProcedures()
      .then(res => {
        setProcedures(res.procedures);
        if (res.procedures.length > 0) setSelected(res.procedures[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    Promise.all([
      orchestrationTasksApi.getProcedureTasks(selected),
      orchestrationApi.getProcedureAssignments(selected),
    ])
      .then(([tasksRes, assignRes]) => {
        setProcTasks(tasksRes.tasks);
        setProcAssignments(assignRes.assignments);
      })
      .catch(() => {});
  }, [selected]);

  const proc = procedures.find(p => p.id === selected);
  const stages: LifecycleStage[] = proc?.lifecycle_stages ?? [];
  const completed = stages.filter(s => s.status === 'completed').length;
  const currentIdx = stages.findIndex(s => s.status === 'in_progress' || s.status === 'blocked');
  const pct = stages.length > 0 ? Math.round((completed / stages.length) * 100) : 0;

  if (loading) return (
    <div className="p-8 flex items-center justify-center h-64 text-gray-400">
      <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-400" /> Chargement...
    </div>
  );

  if (procedures.length === 0) return (
    <div className="p-8 text-center text-gray-400">
      <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p className="font-medium">Aucune procédure</p>
      <p className="text-sm mt-1">Créez des procédures dans l&apos;onglet Procédures.</p>
    </div>
  );

  return (
    <>
      <div className="p-8 space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Cycle de Vie — Roadmap</h2>

        {/* Sélecteur */}
        <div className="relative">
          <button type="button" onClick={() => setShowSelector(!showSelector)}
            className="w-full max-w-sm flex items-center justify-between gap-3 bg-white border border-gray-300 rounded-xl px-4 py-3 hover:border-blue-400 transition-colors text-left">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{proc?.nom ?? 'Sélectionner...'}</p>
              {proc && <p className="text-xs text-gray-400">{proc.ref || proc.category || proc.id.slice(0, 8)}</p>}
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${showSelector ? 'rotate-180' : ''}`} />
          </button>
          {showSelector && (
            <div className="absolute top-full mt-1 left-0 w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden max-h-60 overflow-y-auto">
              {procedures.map(p => (
                <button key={p.id} type="button"
                  onClick={() => { setSelected(p.id); setShowSelector(false); }}
                  className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 ${selected === p.id ? 'bg-blue-50' : ''}`}>
                  <p className="font-medium text-gray-900 text-sm truncate">{p.nom}</p>
                  <p className="text-xs text-gray-400">{p.status} · v{p.version}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {proc && (
          <>
            {/* Progression */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900">{proc.nom}</h3>
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${procedureStatusCls(proc.status)}`}>{proc.status}</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Progression globale</span>
                  <span>{completed}/{stages.length} étapes — {pct}%</span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>

            {/* Étapes */}
            {stages.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">Aucune étape de cycle de vie définie.</div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="space-y-0">
                  {stages.map((stage, idx) => {
                    const cfg = STAGE_CFG[stage.status] || STAGE_CFG.pending;
                    const isCurrent = idx === currentIdx;
                    const isLast = idx === stages.length - 1;
                    const workshopDone = stage.workshop_done || stage.status === 'completed';

                    return (
                      <div key={stage.id}>
                        <div className="flex gap-5">
                          <div className="flex flex-col items-center">
                            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold shadow-sm ${cfg.color} ${isCurrent ? 'ring-4 ring-blue-200' : ''} shrink-0`}>
                              {isCurrent ? <MapPin className="w-5 h-5" /> : stage.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <span className="text-sm">{idx + 1}</span>}
                            </div>
                            {!isLast && <div className="w-0.5 flex-1 bg-gray-200 my-1 min-h-[1.5rem]" />}
                          </div>

                          <div className={`flex-1 pb-5 ${isLast ? 'pb-0' : ''}`}>
                            <button
                              type="button"
                              onClick={() => setPopupStage(stage)}
                              className={`w-full text-left rounded-xl border p-4 space-y-2 transition-all hover:shadow-md hover:-translate-y-px ${
                                isCurrent      ? 'border-blue-300 bg-blue-50 hover:border-blue-400' :
                                stage.status === 'completed' ? 'border-green-200 bg-green-50 hover:border-green-300' :
                                stage.status === 'blocked'   ? 'border-red-200 bg-red-50 hover:border-red-300' :
                                'border-gray-200 bg-gray-50 hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <h4 className={`font-bold ${cfg.text}`}>{stage.title}</h4>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                    <Info className="w-3 h-3" /> Voir détails
                                  </span>
                                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                                </div>
                              </div>
                              <p className="text-xs text-gray-500">{stage.description}</p>

                              <div className={`flex items-center gap-2 p-2 rounded-lg ${workshopDone ? 'bg-green-100' : 'bg-amber-50 border border-amber-200'}`}>
                                <Calendar className={`w-3.5 h-3.5 shrink-0 ${workshopDone ? 'text-green-600' : 'text-amber-600'}`} />
                                <span className={`text-xs ${workshopDone ? 'text-green-800' : 'text-amber-800'}`}>{stage.workshop}</span>
                                <span className={`ml-auto text-xs font-medium ${workshopDone ? 'text-green-700' : 'text-amber-700'}`}>
                                  {workshopDone ? '✓ Réalisé' : 'À planifier'}
                                </span>
                              </div>

                              {stage.completed_at && (
                                <p className="text-xs text-green-600">Complété le {fmtDate(stage.completed_at)}</p>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Légende */}
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              {Object.entries(STAGE_CFG).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded-full ${cfg.color}`} />
                  <span>{cfg.label.replace(/[✓⟳⚠○] /, '')}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {popupStage && proc && (
        <StageModal
          stage={popupStage}
          allTasks={procTasks}
          allAssignments={procAssignments}
          onClose={() => setPopupStage(null)}
        />
      )}
    </>
  );
}

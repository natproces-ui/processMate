'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  MessageSquare,
  CheckCheck,
  UserCheck,
  XCircle,
  Clock,
} from 'lucide-react';
import {
  orchestrationApi,
  Procedure,
  Remark,
  ProcedureAssignment,
  ValidationReview,
  procedureStatusCls,
} from '@/lib/orchestrationApi';
import type { TaskActor } from '@/lib/orchestrationTasksApi';

const VALIDATION_STATUSES = new Set(['En validation', 'En révision', 'Retours reçus', 'Validée']);

const REVIEW_LABELS: Record<ValidationReview['decision'], string> = {
  pending: 'En attente',
  approved: 'Validé',
  changes_requested: 'Modifications demandées',
  rejected: 'Rejeté',
};

const REVIEW_STYLES: Record<ValidationReview['decision'], string> = {
  pending: 'bg-gray-100 text-gray-600 border-gray-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  changes_requested: 'bg-orange-100 text-orange-700 border-orange-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

const REVIEW_ICONS = {
  pending: Clock,
  approved: CheckCircle2,
  changes_requested: AlertTriangle,
  rejected: XCircle,
};

type Decision = ValidationReview['decision'];

interface ValidationState {
  assignments: ProcedureAssignment[];
  reviews: ValidationReview[];
}

function userName(assignment: ProcedureAssignment) {
  const profile = assignment.user_profiles;
  return profile?.display_name || profile?.full_name || profile?.email || assignment.user_id;
}

function userMeta(assignment: ProcedureAssignment) {
  const profile = assignment.user_profiles;
  return [profile?.job_title, profile?.department, profile?.email].filter(Boolean).join(' · ');
}

function findReview(reviews: ValidationReview[], reviewerId: string) {
  return reviews.find(r => r.reviewer_id === reviewerId);
}

interface ValidationHubProps {
  currentActor?: TaskActor;
}

export default function ValidationHub({ currentActor }: ValidationHubProps) {
  const canDecide = currentActor?.role === 'admin' || currentActor?.global_role === 'validator';
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [remarks, setRemarks] = useState<Record<string, Remark[]>>({});
  const [validationData, setValidationData] = useState<Record<string, ValidationState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [savingDecision, setSavingDecision] = useState<string | null>(null);
  const [decisionComments, setDecisionComments] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await orchestrationApi.listProcedures();
      setProcedures(res.procedures.filter(p => VALIDATION_STATUSES.has(p.status)));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadProcedureDetails = useCallback(async (id: string) => {
    setLoadingDetails(id);
    try {
      const [remarkRes, assignmentRes, reviewRes] = await Promise.all([
        orchestrationApi.getRemarks(id),
        orchestrationApi.getProcedureAssignments(id),
        orchestrationApi.getValidationReviews(id),
      ]);

      const validationAssignments = assignmentRes.assignments.filter(a =>
        a.assignment_type === 'validator' || a.assignment_type === 'reviewer' || a.raci_role === 'A'
      );

      setRemarks(prev => ({ ...prev, [id]: remarkRes.remarks }));
      setValidationData(prev => ({
        ...prev,
        [id]: {
          assignments: validationAssignments,
          reviews: reviewRes.reviews,
        },
      }));
    } finally {
      setLoadingDetails(null);
    }
  }, []);

  const toggleExpand = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }

    setExpanded(id);

    if (!remarks[id] || !validationData[id]) {
      await loadProcedureDetails(id);
    }
  };

  const handleResolve = async (procId: string, remarkId: string) => {
    try {
      await orchestrationApi.resolveRemark(procId, remarkId);
      setRemarks(prev => ({
        ...prev,
        [procId]: (prev[procId] ?? []).map(r => r.id === remarkId ? { ...r, resolved: true } : r),
      }));
    } catch {
      // silent
    }
  };

  const handleDecision = async (procId: string, reviewerId: string, decision: Decision) => {
    const key = `${procId}:${reviewerId}`;
    setSavingDecision(key);

    try {
      const res = await orchestrationApi.upsertValidationReview(procId, {
        reviewer_id: reviewerId,
        decision,
        comment: decisionComments[key] || null,
      });

      setValidationData(prev => {
        const current = prev[procId] || { assignments: [], reviews: [] };
        const exists = current.reviews.some(r => r.reviewer_id === reviewerId);

        return {
          ...prev,
          [procId]: {
            ...current,
            reviews: exists
              ? current.reviews.map(r => r.reviewer_id === reviewerId ? res.review : r)
              : [...current.reviews, res.review],
          },
        };
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur validation');
    } finally {
      setSavingDecision(null);
    }
  };

  const stats = {
    validation: procedures.filter(p => p.status === 'En validation').length,
    revision: procedures.filter(p => p.status === 'En révision' || p.status === 'Retours reçus').length,
    validee: procedures.filter(p => p.status === 'Validée').length,
  };

  return (
    <div className="p-8 space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-gray-900">Hub de Validation</h2>
        <p className="text-sm text-gray-500">Suivi des procédures en validation, des valideurs et des remarques</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.validation}</p>
          <p className="text-sm text-gray-500 mt-0.5">En validation</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
          <p className="text-2xl font-bold text-yellow-600">{stats.revision}</p>
          <p className="text-sm text-gray-500 mt-0.5">En révision</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.validee}</p>
          <p className="text-sm text-gray-500 mt-0.5">Validées</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-400" /> Chargement...
        </div>
      ) : procedures.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aucune procédure en validation</p>
          <p className="text-xs mt-1">Passez des procédures au statut &quot;En validation&quot; pour les voir ici.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {procedures.map(proc => {
            const procRemarks = remarks[proc.id] || [];
            const open = procRemarks.filter(r => !r.resolved);
            const isExpanded = expanded === proc.id;
            const data = validationData[proc.id];
            const validators = data?.assignments || [];
            const reviews = data?.reviews || [];

            const approvedCount = reviews.filter(r => r.decision === 'approved').length;
            const rejectedCount = reviews.filter(r => r.decision === 'rejected').length;
            const changesCount = reviews.filter(r => r.decision === 'changes_requested').length;

            return (
              <div key={proc.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                <button type="button"
                  onClick={() => toggleExpand(proc.id)}
                  className="w-full p-4 flex justify-between items-center hover:bg-gray-50 text-left">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h3 className="font-semibold text-gray-900 truncate">{proc.nom}</h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${procedureStatusCls(proc.status)}`}>
                        {proc.status}
                      </span>

                      {data && validators.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                          <UserCheck className="w-3 h-3" />
                          {validators.length} valideur{validators.length > 1 ? 's' : ''}
                        </span>
                      )}

                      {approvedCount > 0 && (
                        <span className="text-xs text-green-600 font-medium">{approvedCount} validé{approvedCount > 1 ? 's' : ''}</span>
                      )}
                      {changesCount > 0 && (
                        <span className="text-xs text-orange-600 font-medium">{changesCount} retour{changesCount > 1 ? 's' : ''}</span>
                      )}
                      {rejectedCount > 0 && (
                        <span className="text-xs text-red-600 font-medium">{rejectedCount} rejet{rejectedCount > 1 ? 's' : ''}</span>
                      )}

                      {proc.remarks_count > 0 && (
                        <span className="flex items-center gap-1 text-xs text-orange-600 font-medium">
                          <MessageSquare className="w-3 h-3" />
                          {proc.remarks_count} remarque{proc.remarks_count > 1 ? 's' : ''}
                          {open.length > 0 && ` (${open.length} ouverte${open.length > 1 ? 's' : ''})`}
                        </span>
                      )}
                    </div>

                    {proc.lifecycle_stages.length > 0 && (() => {
                      const done = proc.lifecycle_stages.filter(s => s.status === 'completed').length;
                      const pct = Math.round((done / proc.lifecycle_stages.length) * 100);
                      return (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 shrink-0">{pct}%</span>
                        </div>
                      );
                    })()}
                  </div>
                  <ChevronDown className={`w-5 h-5 text-gray-400 ml-3 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
                    {loadingDetails === proc.id ? (
                      <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Chargement des détails...
                      </div>
                    ) : (
                      <>
                        <div className="bg-white rounded-xl border border-gray-200 p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <UserCheck className="w-4 h-4 text-blue-600" />
                            <h4 className="font-semibold text-sm text-gray-900">Valideurs assignés</h4>
                          </div>

                          {validators.length === 0 ? (
                            <p className="text-sm text-gray-400">
                              Aucun valideur assigné. Ajoutez un utilisateur avec le rôle A ou le type validator dans la matrice RACI.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {validators.map(assignment => {
                                const review = findReview(reviews, assignment.user_id);
                                const decision = review?.decision || 'pending';
                                const Icon = REVIEW_ICONS[decision];
                                const key = `${proc.id}:${assignment.user_id}`;
                                const busy = savingDecision === key;

                                return (
                                  <div key={assignment.id || assignment.user_id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <p className="font-medium text-sm text-gray-900 truncate">{userName(assignment)}</p>
                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${REVIEW_STYLES[decision]}`}>
                                            <Icon className="w-3 h-3" />
                                            {REVIEW_LABELS[decision]}
                                          </span>
                                        </div>
                                        {userMeta(assignment) && (
                                          <p className="text-xs text-gray-400 mt-0.5">{userMeta(assignment)}</p>
                                        )}
                                        {review?.comment && (
                                          <p className="text-xs text-gray-600 mt-2 bg-white border border-gray-100 rounded p-2">
                                            {review.comment}
                                          </p>
                                        )}
                                      </div>

                                      {canDecide && (
                                        <div className="flex gap-1 shrink-0">
                                          <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => handleDecision(proc.id, assignment.user_id, 'approved')}
                                            className="px-2 py-1 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
                                          >
                                            Valider
                                          </button>
                                          <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => handleDecision(proc.id, assignment.user_id, 'changes_requested')}
                                            className="px-2 py-1 text-xs rounded bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50"
                                          >
                                            Retour
                                          </button>
                                          <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => handleDecision(proc.id, assignment.user_id, 'rejected')}
                                            className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                                          >
                                            Rejeter
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    {canDecide && (
                                      <textarea
                                        value={decisionComments[key] || ''}
                                        onChange={e => setDecisionComments(prev => ({ ...prev, [key]: e.target.value }))}
                                        placeholder="Commentaire de validation..."
                                        rows={2}
                                        className="mt-3 w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none bg-white"
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm text-gray-900">Remarques</h4>

                          {procRemarks.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-4 bg-white rounded-xl border border-gray-200">
                              Aucune remarque pour cette procédure.
                            </p>
                          ) : (
                            procRemarks.map(remark => (
                              <div key={remark.id} className={`p-3 rounded-lg border ${remark.resolved ? 'bg-gray-50 border-gray-200 opacity-60' : remark.type === 'modification_request' ? 'bg-orange-50 border-orange-200' : remark.type === 'approval' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                                <div className="flex items-start gap-2">
                                  {remark.type === 'modification_request'
                                    ? <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                                    : remark.type === 'approval'
                                      ? <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                      : <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="text-xs font-semibold text-gray-800">{remark.author}</span>
                                      <span className="text-xs text-gray-400">{new Date(remark.created_at).toLocaleString('fr-FR')}</span>
                                      {remark.resolved && <span className="text-xs text-green-600">Résolu</span>}
                                    </div>
                                    <p className="text-sm text-gray-700">{remark.content}</p>
                                  </div>
                                  {!remark.resolved && canDecide && (
                                    <button type="button" onClick={() => handleResolve(proc.id, remark.id)}
                                      title="Marquer résolu" className="p-1 hover:bg-white/50 rounded shrink-0">
                                      <CheckCheck className="w-4 h-4 text-gray-400 hover:text-green-600" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

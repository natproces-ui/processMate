'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckSquare, ChevronDown, ChevronRight, Download, ExternalLink, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type {
  AnalysisArtifact,
  AnalysisItem,
  CoverageStatus,
  Criticality,
  OpenQuestion,
  RecommendedAction,
  TaskCandidate,
} from '@/lib/analysisApi';
import { analysisApi } from '@/lib/analysisApi';
import TaskFormDrawer from '@/components/orchestration/tasks/TaskFormDrawer';
import {
  orchestrationTasksApi,
  type CreateProcedureTaskInput,
  type TaskActor,
} from '@/lib/orchestrationTasksApi';

const COVERAGE_STYLE: Record<CoverageStatus, { bg: string; text: string; label: string }> = {
  couvert: { bg: 'bg-green-100', text: 'text-green-800', label: 'Couvert' },
  partiel: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Partiel' },
  manquant: { bg: 'bg-red-100', text: 'text-red-800', label: 'Manquant' },
  non_applicable: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'N/A' },
};
const CRIT_STYLE: Record<Criticality, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-red-100', text: 'text-red-800', label: 'Critique' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Élevé' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Moyen' },
  low: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Faible' },
};

type ExtendedAction = RecommendedAction & { effort?: string; procedure_step_target?: string };
type PotentialTask = { title?: string; description?: string; assigned_to_type?: string; priority?: Criticality };
type ExtendedAnalysisItem = AnalysisItem & {
  impact_type?: string; procedure_step?: string;
  operational_risk?: string; irritant_detected?: string;
  impacted_actors?: string[]; potential_tasks?: PotentialTask[];
  recommended_actions: ExtendedAction[];
};
type Summary = { global_assessment?: string; key_findings?: string[] };

interface TaskDraft {
  procedureId: string;
  input: Partial<CreateProcedureTaskInput>;
  candidateId?: string;
}

interface Props {
  artifact: AnalysisArtifact;
  actors: TaskActor[];
  currentActor: TaskActor | null;
  onClose: () => void;
}

function normalizePriority(value?: string): Criticality {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') return value;
  return 'medium';
}

export function ArtifactDetail({ artifact, actors, currentActor, onClose }: Props) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [tasksCreated, setTasksCreated] = useState<number>(0);
  const [taskCandidates, setTaskCandidates] = useState<TaskCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'analyse' | 'tasks' | 'log' | 'questions'>('analyse');

  const aj = artifact.analysis_json || {};
  const summary = (aj.summary || {}) as Summary;
  const analysis = (aj.analysis || []) as ExtendedAnalysisItem[];
  const log = aj.analysis_log || [];
  const questions = (aj.open_questions || []) as OpenQuestion[];

  const assignee = useMemo(() => actors.find(a => a.role !== 'admin') || actors[0], [actors]);
  const canCreateTasks = currentActor?.role === 'admin';

  const stats = useMemo(() => ({
    points: analysis.length,
    covered: analysis.filter(i => i.coverage_status === 'couvert').length,
    partial: analysis.filter(i => i.coverage_status === 'partiel').length,
    missing: analysis.filter(i => i.coverage_status === 'manquant').length,
  }), [analysis]);

  // Candidats en attente
  const pendingCount = taskCandidates.filter(c => c.status === 'suggested').length;
  const convertedCount = taskCandidates.filter(c => c.status === 'converted').length;

  useEffect(() => {
    setLoadingCandidates(true);
    analysisApi.listTaskCandidates(artifact.id)
      .then(res => setTaskCandidates(res.candidates))
      .catch(() => setTaskCandidates([]))
      .finally(() => setLoadingCandidates(false));
  }, [artifact.id]);

  const doExport = async () => {
    setExporting(true);
    try {
      const safe = (artifact.instruction_summary || 'analyse').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
      await analysisApi.exportExcel(artifact.id, `${safe}_analyse.xlsx`);
    } finally { setExporting(false); }
  };

  const openCandidateForm = (candidate: TaskCandidate) => {
    if (candidate.status === 'converted' || !assignee) return;
    setTaskDraft({
      procedureId: candidate.procedure_id,
      candidateId: candidate.id,
      input: {
        title: candidate.title,
        description: candidate.description,
        assigned_to: assignee.id,
        raci_role: candidate.raci_role || 'R',
        task_type: candidate.task_type || 'correction',
        priority: candidate.priority,
      },
    });
  };

  const submitTask = async (procedureId: string, input: CreateProcedureTaskInput) => {
    const result = await orchestrationTasksApi.createTask(procedureId, input);
    if (taskDraft?.candidateId) {
      const updated = await analysisApi.updateTaskCandidate(artifact.id, taskDraft.candidateId, {
        status: 'converted',
        task_id: result.task.id,
      });
      setTaskCandidates(prev =>
        prev.map(c => c.id === updated.candidate.id ? updated.candidate : c)
      );
    }
    setTasksCreated(prev => prev + 1);
    setTaskDraft(null);
  };

  const goToTask = (taskId: string) => {
    router.push(`/orchestration?tab=tasks&task_id=${taskId}`);
  };

  return (
    <div className="flex min-h-full flex-col bg-white">

      {/* ── HEADER ─────────────────────────────────────── */}
      <div className="shrink-0 space-y-3 border-b border-slate-200 px-5 pb-0 pt-4">

        {/* Ligne 1 : badge + date + fermer */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
              {artifact.intent_label}
            </span>
            <span className="text-xs text-slate-400">
              {new Date(artifact.created_at).toLocaleString('fr-FR')}
            </span>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Ligne 2 : titre */}
        <h2 className="text-sm font-bold leading-snug text-slate-900">{artifact.instruction_summary}</h2>

        {/* Ligne 3 : boutons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={doExport}
            disabled={exporting}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Excel
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            disabled={analysis.length === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-3 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {tasksCreated > 0
              ? `${tasksCreated} tâche${tasksCreated > 1 ? 's' : ''} créée${tasksCreated > 1 ? 's' : ''}`
              : `Suggestions de tâches${pendingCount > 0 ? ` (${pendingCount})` : ''}`
            }
          </button>
        </div>

        {/* Ligne 4 : stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Points', value: stats.points, color: 'text-slate-700' },
            { label: 'Couverts', value: stats.covered, color: 'text-green-700' },
            { label: 'Partiels', value: stats.partial, color: 'text-amber-700' },
            { label: 'Manquants', value: stats.missing, color: 'text-red-700' },
          ].map(s => (
            <div key={s.label} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-center">
              <div className={`text-base font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Synthèse */}
        {summary.global_assessment && (
          <p className="text-xs leading-5 text-slate-600">{summary.global_assessment}</p>
        )}

        {/* Key findings */}
        {(summary.key_findings || []).length > 0 && (
          <div className="space-y-0.5">
            {summary.key_findings!.map((f, i) => (
              <p key={i} className="text-xs text-slate-500">• {f}</p>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="-mb-px flex gap-0 pt-1">
          {([
            { key: 'analyse', label: `Analyse (${analysis.length})` },
            { key: 'tasks', label: `Tâches (${taskCandidates.length})${convertedCount > 0 ? ` · ${convertedCount} créée${convertedCount > 1 ? 's' : ''}` : ''}` },
            { key: 'log', label: `Journal (${log.length})` },
            { key: 'questions', label: `Questions (${questions.length})` },
          ] as const).map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${activeTab === tab.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENU ────────────────────────────────────── */}
      <div className="space-y-2 px-4 py-3">

        {/* Tab: Analyse */}
        {activeTab === 'analyse' && analysis.map((item, i) => {
          const cov = COVERAGE_STYLE[item.coverage_status] || COVERAGE_STYLE.manquant;
          const crit = CRIT_STYLE[item.criticality] || CRIT_STYLE.medium;
          const key = `${item.procedure_id}-${i}`;
          const expanded = expandedItem === key;
          const itemAny = item as any;

          return (
            <div key={key} className={`rounded-lg border transition-all ${expanded ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200 bg-white'}`}>
              <button
                type="button"
                onClick={() => setExpandedItem(expanded ? null : key)}
                className="flex w-full items-start gap-2 p-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cov.bg} ${cov.text}`}>{cov.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${crit.bg} ${crit.text}`}>{crit.label}</span>
                    {itemAny.impact_type && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{itemAny.impact_type}</span>}
                    {item.external_dependency && <span className="text-xs font-medium text-amber-600">⚠ {item.external_dependency}</span>}
                  </div>
                  <p className="text-sm font-semibold leading-snug text-slate-900">{item.source_element}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {item.procedure_ref} {item.procedure_nom} · {itemAny.procedure_step || item.procedure_section}
                  </p>
                </div>
                {expanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
              </button>

              {expanded && (
                <div className="space-y-3 border-t border-slate-200 px-3 pb-3 pt-2">
                  {itemAny.operational_risk && (
                    <div className="rounded border border-red-200 bg-red-50 px-2.5 py-2">
                      <p className="mb-0.5 text-xs font-semibold text-red-700">⚠ Risque opérationnel</p>
                      <p className="text-xs text-red-800">{itemAny.operational_risk}</p>
                    </div>
                  )}
                  {itemAny.irritant_detected && (
                    <div className="rounded border border-orange-200 bg-orange-50 px-2.5 py-2">
                      <p className="mb-0.5 text-xs font-semibold text-orange-700">⚡ Irritant détecté</p>
                      <p className="text-xs text-orange-800">{itemAny.irritant_detected}</p>
                    </div>
                  )}
                  {item.gap && <DetailRow label="Écart identifié" value={item.gap} highlight />}
                  <DetailRow label="Réf. source" value={item.source_ref} />
                  <DetailRow label="Impact métier" value={item.business_impact} />
                  <DetailRow label="Impact SI" value={item.si_impact} />
                  <DetailRow label="Étape / Règle" value={itemAny.procedure_step || item.procedure_section} />
                  <DetailRow label="Justification" value={item.rationale} />

                  {(itemAny.impacted_actors || []).length > 0 && (
                    <ChipList label="Acteurs" values={itemAny.impacted_actors} tone="purple" />
                  )}
                  {(item.impacted_systems || []).length > 0 && (
                    <ChipList label="Systèmes" values={item.impacted_systems} />
                  )}

                  {(item.recommended_actions || []).length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Actions</p>
                      <div className="space-y-1.5">
                        {item.recommended_actions.map((a, ai) => (
                          <ActionCard key={ai} action={a} />
                        ))}
                      </div>
                    </div>
                  )}

                  {(itemAny.potential_tasks || []).length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Tâches potentielles ({itemAny.potential_tasks.length})
                      </p>
                      <div className="space-y-1">
                        {(itemAny.potential_tasks as PotentialTask[]).map((t, ti) => (
                          <PotentialTaskCard key={ti} task={t} />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-right text-xs text-slate-400">
                    Confiance IA : {Math.round((item.confidence || 0) * 100)}%
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Tab: Tâches */}
        {activeTab === 'tasks' && (
          loadingCandidates ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Chargement des suggestions...
            </div>
          ) : taskCandidates.length === 0 ? (
            <EmptyTab text="Aucune suggestion de tâche disponible." />
          ) : (
            <div className="space-y-2">
              {/* Résumé en haut */}
              {convertedCount > 0 && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-green-800 font-medium">
                    {convertedCount} tâche{convertedCount > 1 ? 's' : ''} créée{convertedCount > 1 ? 's' : ''} · {pendingCount} suggestion{pendingCount > 1 ? 's' : ''} restante{pendingCount > 1 ? 's' : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push('/orchestration?tab=tasks')}
                    className="inline-flex items-center gap-1 text-xs text-green-700 font-medium hover:underline shrink-0"
                  >
                    Voir dans Tâches <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              )}

              {taskCandidates.map(candidate => (
                <TaskCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  canCreate={Boolean(canCreateTasks && assignee)}
                  onCreate={() => openCandidateForm(candidate)}
                  onGoToTask={goToTask}
                  onDismiss={async () => {
                    const updated = await analysisApi.updateTaskCandidate(artifact.id, candidate.id, { status: 'dismissed' });
                    setTaskCandidates(prev => prev.map(c => c.id === candidate.id ? updated.candidate : c));
                  }}
                />
              ))}
            </div>
          )
        )}

        {/* Tab: Journal */}
        {activeTab === 'log' && (
          log.length === 0 ? <EmptyTab text="Aucun journal disponible." /> :
            log.map((entry, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate text-sm font-semibold text-slate-900">{entry.procedure_nom}</span>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${(entry.points_analyzed ?? 0) > 0 ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'
                    }`}>
                    {entry.points_analyzed ?? 0} pt{(entry.points_analyzed ?? 0) > 1 ? 's' : ''}
                  </span>
                </div>
                {(entry.examined_sections || []).length > 0 && (
                  <ChipList values={entry.examined_sections || []} />
                )}
                {entry.findings && <p className="text-xs leading-5 text-slate-700">{entry.findings}</p>}
                {entry.rationale && <p className="mt-1 text-xs italic text-slate-400">{entry.rationale}</p>}
              </div>
            ))
        )}

        {/* Tab: Questions */}
        {activeTab === 'questions' && (
          questions.length === 0 ? <EmptyTab text="Aucune question ouverte." /> :
            questions.map((q, i) => (
              <div key={i} className={`rounded-lg border px-3 py-2.5 ${q.blocking ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                <p className={`mb-1 text-xs font-semibold ${q.blocking ? 'text-red-800' : 'text-amber-800'}`}>
                  {q.blocking ? '🔴 Bloquant' : '🟡 À clarifier'}{q.target ? ` — ${q.target}` : ''}
                </p>
                <p className="text-sm text-slate-800">{q.question}</p>
              </div>
            ))
        )}
      </div>

      {/* Formulaire tâche */}
      {taskDraft && currentActor && (
        <TaskFormDrawer
          procedureId={taskDraft.procedureId}
          actors={actors}
          assignedBy={currentActor}
          initialTask={taskDraft.input}
          onClose={() => setTaskDraft(null)}
          onSubmit={submitTask}
        />
      )}
    </div>
  );
}

// ── Sous-composants ───────────────────────────────────────────

function TaskCandidateCard({
  candidate, canCreate, onCreate, onGoToTask, onDismiss,
}: {
  candidate: TaskCandidate;
  canCreate: boolean;
  onCreate: () => void;
  onGoToTask: (taskId: string) => void;
  onDismiss: () => void;
}) {
  const isConverted = candidate.status === 'converted';
  const isDismissed = candidate.status === 'dismissed';

  return (
    <div className={`rounded-lg border p-3 transition-colors ${isConverted ? 'border-green-200 bg-green-50' :
        isDismissed ? 'border-slate-200 bg-slate-50 opacity-60' :
          'border-slate-200 bg-white'
      }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Badges */}
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {isConverted && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                ✓ Tâche créée
              </span>
            )}
            {isDismissed && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                Ignorée
              </span>
            )}
            {!isConverted && !isDismissed && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                À traiter
              </span>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {candidate.owner_type || 'métier'}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CRIT_STYLE[normalizePriority(candidate.priority) as Criticality]?.bg} ${CRIT_STYLE[normalizePriority(candidate.priority) as Criticality]?.text}`}>
              {candidate.priority}
            </span>
          </div>

          {/* Titre */}
          <p className="text-sm font-semibold text-slate-900">{candidate.title}</p>

          {/* Procédure + section */}
          <p className="mt-0.5 text-xs text-slate-400">
            {[candidate.procedure_ref, candidate.procedure_nom].filter(Boolean).join(' ')}
            {candidate.procedure_section ? ` · ${candidate.procedure_section}` : ''}
          </p>

          {/* Description */}
          {candidate.description && !isConverted && (
            <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
              {candidate.description}
            </p>
          )}

          {/* Lien vers tâche créée */}
          {isConverted && candidate.task_id && (
            <button
              type="button"
              onClick={() => onGoToTask(candidate.task_id!)}
              className="mt-2 inline-flex items-center gap-1 text-xs text-green-700 font-medium hover:underline"
            >
              Voir la tâche dans Suivi des tâches <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Boutons action */}
        {!isConverted && !isDismissed && (
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              onClick={onCreate}
              disabled={!canCreate}
              title={!canCreate ? 'Seul un admin peut créer une tâche' : 'Ouvrir le formulaire prérempli'}
              className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Créer
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
            >
              Ignorer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionCard({ action }: { action: ExtendedAction }) {
  const style = CRIT_STYLE[normalizePriority(action.priority)];
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${style.bg} ${style.text}`}>{action.priority || 'medium'}</span>
        <span className="text-xs font-semibold text-slate-800">{action.title}</span>
        {action.effort && <span className="ml-auto text-xs text-slate-400">Effort : {action.effort}</span>}
      </div>
      {action.description && <p className="mt-1 text-xs leading-5 text-slate-600">{action.description}</p>}
      {action.procedure_step_target && <p className="mt-0.5 text-xs text-blue-600">→ {action.procedure_step_target}</p>}
    </div>
  );
}

function PotentialTaskCard({ task }: { task: PotentialTask }) {
  const style = CRIT_STYLE[normalizePriority(task.priority)];
  return (
    <div className="rounded border border-blue-100 bg-blue-50 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${style.bg} ${style.text}`}>{task.priority || 'medium'}</span>
        <span className="text-xs font-medium text-slate-800">{task.title}</span>
        {task.assigned_to_type && <span className="ml-auto text-xs text-slate-400">{task.assigned_to_type}</span>}
      </div>
      {task.description && <p className="mt-0.5 text-xs text-slate-600">{task.description}</p>}
    </div>
  );
}

function ChipList({ label, values, tone = 'slate' }: { label?: string; values: string[]; tone?: 'slate' | 'purple' }) {
  const cls = tone === 'purple' ? 'bg-purple-50 border-purple-100 text-purple-700' : 'bg-slate-100 border-slate-100 text-slate-700';
  return (
    <div>
      {label && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>}
      <div className="flex flex-wrap gap-1">
        {values.map(v => <span key={v} className={`rounded border px-2 py-0.5 text-xs ${cls}`}>{v}</span>)}
      </div>
    </div>
  );
}

function DetailRow({ label, value, highlight = false }: { label: string; value?: string | null; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 whitespace-pre-wrap text-xs leading-5 ${highlight ? 'rounded bg-red-50 px-2 py-1 text-red-800' : 'text-slate-700'}`}>{value}</p>
    </div>
  );
}

function EmptyTab({ text }: { text: string }) {
  return <p className="py-8 text-center text-xs text-slate-400">{text}</p>;
}
'use client';

import React, { useMemo, useState } from 'react';
import {
  AlignLeft, BookOpen, Check, ChevronDown, ChevronRight,
  Download, ExternalLink, FileText, GitBranch, Loader2, Settings2, Wrench, X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type {
  AnalysisArtifact,
  AnalysisItem,
  CoverageStatus,
  Criticality,
  Modification,
  OpenQuestion,
  Partie,
  RecommendedAction,
} from '@/lib/analysisApi';
import { analysisApi } from '@/lib/analysisApi';
import ModificationCard from './ModificationCard';
import { applyModificationsBatch } from '@/logic/applyModification';
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
// Même taxonomie que les onglets de ProcedureEditor.tsx (caracteristiques|qualite|diagramme|descriptions|outils)
// pour que l'analyse et l'édition de procédure parlent le même langage.
const PARTIE_META: Record<Partie, { label: string; icon: React.ReactNode; taskTitle: string }> = {
  caracteristiques: { label: 'Caractéristiques', icon: <FileText className="h-3 w-3" />, taskTitle: 'Mettre à jour les caractéristiques' },
  qualite: { label: 'Règles de gestion', icon: <Settings2 className="h-3 w-3" />, taskTitle: 'Revoir les règles de gestion' },
  diagramme: { label: 'Logigramme', icon: <GitBranch className="h-3 w-3" />, taskTitle: 'Modifier le logigramme' },
  descriptions: { label: 'Descriptions', icon: <AlignLeft className="h-3 w-3" />, taskTitle: 'Revoir les descriptions' },
  outils: { label: 'Outils', icon: <Wrench className="h-3 w-3" />, taskTitle: 'Mettre à jour les outils' },
};

type ExtendedAction = RecommendedAction & { effort?: string; procedure_step_target?: string };
type ExtendedAnalysisItem = AnalysisItem & {
  impact_type?: string; procedure_step?: string;
  operational_risk?: string; irritant_detected?: string;
  impacted_actors?: string[];
  recommended_actions: ExtendedAction[];
};
type Summary = { global_assessment?: string; key_findings?: string[] };
type Entry = { item: ExtendedAnalysisItem; index: number };

interface TaskDraft {
  procedureId: string;
  input: Partial<CreateProcedureTaskInput>;
  metadata?: Record<string, unknown>;
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
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'impacts' | 'modifications' | 'log' | 'questions'>('impacts');
  const [itemStatuses, setItemStatuses] = useState<Record<number, 'accepted' | 'rejected'>>({});

  // ── Sélection de modifications (partagée entre "Créer les tâches" et "Appliquer") ──
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [appliedIndexes, setAppliedIndexes] = useState<Set<number>>(new Set());
  const [confirmingApplyProcedureId, setConfirmingApplyProcedureId] = useState<string | null>(null);
  const [applyingBatch, setApplyingBatch] = useState(false);
  const [batchResult, setBatchResult] = useState<{ procedureId: string; appliedCount: number; skipped: { index: number; reason: string }[] } | null>(null);
  const [taskResult, setTaskResult] = useState<{ procedureId: string; title: string } | null>(null);

  const aj = artifact.analysis_json || {};
  const summary = (aj.summary || {}) as Summary;
  const analysis = (aj.analysis || []) as ExtendedAnalysisItem[];
  const log = aj.analysis_log || [];
  const questions = (aj.open_questions || []) as OpenQuestion[];

  const assignee = useMemo(() => actors.find(a => a.role !== 'admin') || actors[0], [actors]);

  const stats = useMemo(() => ({
    points: analysis.length,
    covered: analysis.filter(i => i.coverage_status === 'couvert').length,
    partial: analysis.filter(i => i.coverage_status === 'partiel').length,
    missing: analysis.filter(i => i.coverage_status === 'manquant').length,
  }), [analysis]);

  const modificationsCount = useMemo(
    () => analysis.filter(i => i.modification && i.partie).length,
    [analysis]
  );

  // Regroupe les points d'analyse d'abord par procédure (on ne modifie jamais qu'une
  // procédure à la fois), puis par impact à l'intérieur (un même constat peut toucher
  // plusieurs parties — logigramme, règles de gestion, caractéristiques...).
  // On conserve l'index d'origine dans `analysis` car itemStatuses/sélection y sont liés.
  const groupedByProcedure = useMemo(() => {
    const procMap = new Map<string, { procedureId: string; procedureNom: string; entries: Entry[] }>();
    analysis.forEach((item, index) => {
      const pid = item.procedure_id || '__unknown';
      if (!procMap.has(pid)) {
        procMap.set(pid, { procedureId: pid, procedureNom: item.procedure_nom || item.procedure_ref || 'Procédure', entries: [] });
      }
      procMap.get(pid)!.entries.push({ item, index });
    });
    return Array.from(procMap.values()).map(proc => {
      const impactMap = new Map<string, { impactId: string; impactTheme: string; entries: Entry[] }>();
      proc.entries.forEach(entry => {
        const impactId = entry.item.impact_id || `__solo_${entry.index}`;
        if (!impactMap.has(impactId)) {
          impactMap.set(impactId, {
            impactId,
            impactTheme: entry.item.impact_theme || entry.item.source_element || 'Constat',
            entries: [],
          });
        }
        impactMap.get(impactId)!.entries.push(entry);
      });
      return { ...proc, impactGroups: Array.from(impactMap.values()) };
    });
  }, [analysis]);

  const toggleSelected = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const buildTaskDefaults = (selected: Entry[]): { title: string; description: string } => {
    const parties = new Set(selected.map(e => e.item.partie).filter(Boolean) as Partie[]);
    const title = parties.size === 1
      ? PARTIE_META[[...parties][0]].taskTitle
      : 'Modifier la procédure';
    const description = selected
      .map(e => `- ${e.item.modification?.title || e.item.modification?.proposed_value || e.item.source_element}`)
      .join('\n');
    return { title, description };
  };

  const openCreateTaskForm = (procedureId: string, entries: Entry[]) => {
    if (!assignee) return;
    const selected = entries.filter(e => selectedIndices.has(e.index) && e.item.modification && e.item.partie);
    if (selected.length === 0) return;
    const { title, description } = buildTaskDefaults(selected);
    setTaskDraft({
      procedureId,
      input: {
        title, description,
        assigned_to: assignee.id,
        raci_role: 'R',
        task_type: 'correction',
        priority: 'normal',
      },
      metadata: {
        source: 'analysis_modifications',
        artifact_id: artifact.id,
        proposed_patch: selected.map(e => ({ partie: e.item.partie, modification: e.item.modification })),
      },
    });
  };

  const submitTask = async (procedureId: string, input: CreateProcedureTaskInput) => {
    const payload = taskDraft?.metadata ? { ...input, metadata: taskDraft.metadata } : input;
    await orchestrationTasksApi.createTask(procedureId, payload);
    setTasksCreated(prev => prev + 1);
    setTaskResult({ procedureId, title: input.title });
    setSelectedIndices(new Set());
    setTaskDraft(null);
  };

  const confirmBatchApply = async (procedureId: string, entries: Entry[]) => {
    setApplyingBatch(true);
    try {
      const items = entries
        .filter(e => selectedIndices.has(e.index) && e.item.modification && e.item.partie)
        .map(e => ({
          index: e.index,
          partie: e.item.partie!,
          target_step_id: e.item.modification!.target_step_id,
          target_field: e.item.modification!.target_field,
          operation_type: e.item.modification!.operation_type,
          proposed_value: e.item.modification!.proposed_value,
          current_value: e.item.modification!.current_value,
        }));
      const result = await applyModificationsBatch(procedureId, items);
      setAppliedIndexes(prev => {
        const next = new Set(prev);
        result.applied.forEach(i => next.add(i));
        return next;
      });
      setBatchResult({ procedureId, appliedCount: result.applied.length, skipped: result.skipped });
      setSelectedIndices(prev => {
        const next = new Set(prev);
        result.applied.forEach(i => next.delete(i));
        return next;
      });
      setConfirmingApplyProcedureId(null);
    } catch (e) {
      setBatchResult({
        procedureId, appliedCount: 0,
        skipped: [{ index: -1, reason: e instanceof Error ? e.message : 'Erreur lors de l’application du lot' }],
      });
    } finally {
      setApplyingBatch(false);
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const safe = (artifact.instruction_summary || 'analyse').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
      await analysisApi.exportExcel(artifact.id, `${safe}_analyse.xlsx`);
    } finally { setExporting(false); }
  };

  const handleItemStatus = (itemIndex: number, status: 'accepted' | 'rejected') => {
    const current = itemStatuses[itemIndex];
    const next = current === status ? undefined : status;
    setItemStatuses(prev => {
      const updated = { ...prev };
      if (next === undefined) delete updated[itemIndex];
      else updated[itemIndex] = next;
      return updated;
    });
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
          {tasksCreated > 0 && (
            <button
              type="button"
              onClick={() => router.push('/orchestration?tab=tasks')}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-green-200 bg-green-50 px-3 text-xs font-medium text-green-700 hover:bg-green-100"
            >
              {tasksCreated} tâche{tasksCreated > 1 ? 's' : ''} créée{tasksCreated > 1 ? 's' : ''} <ExternalLink className="h-3 w-3" />
            </button>
          )}
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
            { key: 'impacts', label: `Impacts identifiés (${analysis.length})` },
            { key: 'modifications', label: `Modifications proposées (${modificationsCount})` },
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

        {/* Tab: Impacts identifiés — regroupé par procédure puis par impact */}
        {activeTab === 'impacts' && groupedByProcedure.map(proc => (
          <div key={proc.procedureId} className="mb-4 space-y-1.5">
            <p className="px-1 pt-2 text-sm font-bold text-slate-800">{proc.procedureNom}</p>

            {proc.impactGroups.map(group => (
              <div key={group.impactId} className="space-y-1.5">
                {group.entries.length > 1 && (
                  <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {group.impactTheme} · {group.entries.length} partie{group.entries.length > 1 ? 's' : ''} touchée{group.entries.length > 1 ? 's' : ''}
                  </p>
                )}
                {group.entries.map(({ item, index: i }) => {
                  const cov = COVERAGE_STYLE[item.coverage_status] || COVERAGE_STYLE.manquant;
                  const crit = CRIT_STYLE[item.criticality] || CRIT_STYLE.medium;
                  const partieMeta = item.partie ? PARTIE_META[item.partie] : null;
                  const key = `${item.procedure_id}-${i}`;
                  const expanded = expandedItem === key;
                  const itemAny = item as any;
                  const itemStatus = itemStatuses[i];

                  return (
                    <div key={key} className={`rounded-lg border transition-all ${
                      itemStatus === 'accepted' ? 'border-green-300 bg-green-50/30' :
                      itemStatus === 'rejected' ? 'border-red-200 bg-red-50/20 opacity-60' :
                      expanded ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200 bg-white'
                    }`}>
                      <button
                        type="button"
                        onClick={() => setExpandedItem(expanded ? null : key)}
                        className="flex w-full items-start gap-2 p-3 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            {partieMeta && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                                {partieMeta.icon} {partieMeta.label}
                              </span>
                            )}
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

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-slate-400">
                              Confiance IA : {Math.round((item.confidence || 0) * 100)}%
                            </span>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); handleItemStatus(i, 'accepted'); }}
                                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                                  itemStatuses[i] === 'accepted'
                                    ? 'bg-green-600 text-white'
                                    : 'border border-green-300 text-green-700 hover:bg-green-50'
                                }`}
                              >
                                <Check className="h-3 w-3" /> Conserver
                              </button>
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); handleItemStatus(i, 'rejected'); }}
                                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                                  itemStatuses[i] === 'rejected'
                                    ? 'bg-red-500 text-white'
                                    : 'border border-red-200 text-red-500 hover:bg-red-50'
                                }`}
                              >
                                <X className="h-3 w-3" /> Rejeter
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
        {activeTab === 'impacts' && analysis.length === 0 && <EmptyTab text="Aucun impact identifié." />}

        {/* Tab: Modifications proposées — regroupé par procédure, sélection persistante */}
        {activeTab === 'modifications' && groupedByProcedure.map(proc => {
          const modEntries = proc.entries.filter(e => e.item.modification && e.item.partie);
          if (modEntries.length === 0) return null;
          const selectedCount = modEntries.filter(e => selectedIndices.has(e.index)).length;

          return (
            <div key={proc.procedureId} className="mb-4 space-y-1.5">
              <p className="px-1 pt-2 text-sm font-bold text-slate-800">{proc.procedureNom}</p>

              {batchResult && batchResult.procedureId === proc.procedureId && (
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  {batchResult.appliedCount} modification{batchResult.appliedCount > 1 ? 's' : ''} appliquée{batchResult.appliedCount > 1 ? 's' : ''}
                  {batchResult.skipped.length > 0 && ` · ${batchResult.skipped.length} ignorée${batchResult.skipped.length > 1 ? 's' : ''} : ${batchResult.skipped.map(s => s.reason).join(' — ')}`}
                </div>
              )}
              {taskResult && taskResult.procedureId === proc.procedureId && (
                <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                  Tâche « {taskResult.title} » créée
                </div>
              )}

              {proc.impactGroups.map(group => {
                const groupModEntries = group.entries.filter(e => e.item.modification && e.item.partie);
                if (groupModEntries.length === 0) return null;
                return (
                  <div key={group.impactId} className="space-y-1.5">
                    {group.entries.length > 1 && (
                      <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {group.impactTheme}
                      </p>
                    )}
                    {groupModEntries.map(({ item, index: i }) => (
                      <ModificationCard
                        key={i}
                        modification={item.modification as Modification}
                        partie={item.partie}
                        procedureId={item.procedure_id}
                        applied={appliedIndexes.has(i)}
                        selectable
                        selected={selectedIndices.has(i)}
                        onToggleSelected={() => toggleSelected(i)}
                      />
                    ))}
                  </div>
                );
              })}

              <div className="flex items-center gap-2 pt-1">
                {confirmingApplyProcedureId === proc.procedureId ? (
                  <>
                    <span className="text-xs font-medium text-blue-800">Confirmer l'application de {selectedCount} modification(s) ?</span>
                    <button
                      type="button"
                      onClick={() => confirmBatchApply(proc.procedureId, proc.entries)}
                      disabled={applyingBatch}
                      className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {applyingBatch ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Confirmer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingApplyProcedureId(null)}
                      disabled={applyingBatch}
                      className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50"
                    >
                      Annuler
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => openCreateTaskForm(proc.procedureId, proc.entries)}
                      disabled={selectedCount === 0 || !assignee}
                      className="inline-flex items-center gap-1 rounded border border-blue-300 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selectedCount === 0 ? 'Sélectionner au moins une modification' : `Créer les tâches (${selectedCount})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingApplyProcedureId(proc.procedureId)}
                      disabled={selectedCount === 0}
                      className="inline-flex items-center gap-1 rounded border border-blue-300 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selectedCount === 0 ? 'Sélectionner au moins une modification' : `Appliquer les modifications (${selectedCount})`}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {activeTab === 'modifications' && modificationsCount === 0 && <EmptyTab text="Aucune modification proposée." />}

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

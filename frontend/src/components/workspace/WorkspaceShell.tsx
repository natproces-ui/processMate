'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle, AlertTriangle, BookOpen, CheckCircle2, ChevronRight,
  Clock, Download, ExternalLink, FileText, Filter, Loader2, PenLine,
  Plus, RefreshCw, RotateCcw, Search, Upload, Wand2, X, FileSearch,
} from 'lucide-react';
import { orchestrationApi, type Procedure } from '@/lib/orchestrationApi';
import {
  orchestrationTasksApi, notifyTaskAssignedByEmail,
  type ProcedureTask, type ProcedureTaskStatus,
} from '@/lib/orchestrationTasksApi';
import { useAuth } from '@/context/AuthContext';
import { generateBPMNSimple } from '@/logic/bpmnGeneratorSimple';

const BpmnViewer = dynamic(
  () => import('@/components/new-way/BpmnEditor').then(m => ({ default: m.default })),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-gray-300 text-xs"><Loader2 className="w-4 h-4 animate-spin mr-2" />Chargement du diagramme…</div> }
);
import { taxonomyApi, type TaxonomyNode } from '@/lib/taxonomyApi';
import { useProceduresStore } from '@/store/proceduresStore';
import {
  workspaceApi,
  type RevisionSession, type RevisionPoint, type RevisionPointStatus,
  DIAGNOSTIC_CONFIG, POINT_TYPE_LABELS, POINT_TYPE_COLORS, CRIT_BADGE, POINT_STATUS_COLORS,
} from '@/lib/workspaceApi';
import {
  correctionsApi,
  type CorrectionsSession, type Remark, type RemarkStatus,
  REMARK_TYPE_LABELS, REMARK_TYPE_COLORS, CRITICITE_COLORS, STATUS_LABELS, STATUS_COLORS,
} from '@/lib/correctionsApi';
import { CAMPAIGN_STATUS_LABELS } from '@/lib/campaignsApi';

// ─── Helpers ──────────────────────────────────────────────────

function str(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join('\n');
  return String(v);
}

// ─── Document Center ──────────────────────────────────────────

const SECTIONS = [
  { id: 'objet',            label: 'Objet' },
  { id: 'perimetre',        label: 'Périmètre' },
  { id: 'acteurs',          label: 'Acteurs' },
  { id: 'regles_gestion',   label: 'Règles de gestion' },
  { id: 'workflow',         label: 'Workflow' },
  { id: 'logigramme',       label: 'Logigramme' },
];

function DocumentCenter({
  procedure,
  highlightSection,
  onProcedureUpdated,
}: {
  procedure: Procedure;
  highlightSection: string | null;
  onProcedureUpdated?: (updated: Partial<Procedure>) => void;
}) {
  const meta = procedure.metadata || {};
  const steps: any[] = (procedure as any).workflow_json || [];
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [bpmnXml, setBpmnXml] = useState<string | null>(null);
  const [showDiagram, setShowDiagram] = useState(true);

  // État édition par section
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (steps.length > 0) {
      try {
        const xml = generateBPMNSimple(steps, procedure.nom);
        setBpmnXml(xml);
      } catch { /* pas de diagramme */ }
    }
  }, [procedure.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (field: string, value: any) => {
    setEditing(field);
    setDraft({ [field]: typeof value === 'string' ? value : JSON.parse(JSON.stringify(value)) });
  };

  const cancelEdit = () => { setEditing(null); setDraft({}); };

  const saveEdit = async (field: string) => {
    setSaving(true);
    try {
      const updatedMeta = { ...(procedure.metadata || {}), [field]: draft[field] };
      await orchestrationApi.saveWorkflowData(
        procedure.id,
        (procedure as any).workflow_json || [],
        (procedure as any).enrichments_json || {},
        updatedMeta,
      );
      onProcedureUpdated?.({ metadata: updatedMeta });
      setEditing(null);
      setDraft({});
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (highlightSection) {
      const el = sectionRefs.current[highlightSection];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightSection]);

  const sectionCls = (id: string) =>
    `rounded-xl border p-4 mb-4 transition-all duration-300 ${
      highlightSection === id
        ? 'border-yellow-400 bg-yellow-50 shadow-md ring-2 ring-yellow-200'
        : 'border-gray-100 bg-white'
    }`;

  const setRef = (id: string) => (el: HTMLDivElement | null) => {
    sectionRefs.current[id] = el;
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      {/* Titre procédure */}
      <div className="mb-6 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">{procedure.nom}</h1>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
          {procedure.ref && <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{procedure.ref}</span>}
          {procedure.version && <span>v{procedure.version}</span>}
          <span className={`px-2 py-0.5 rounded-full font-medium ${
            procedure.status === 'Validée' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
          }`}>{procedure.status}</span>
        </div>
      </div>

      {/* Objet */}
      <div ref={setRef('objet')} className={sectionCls('objet')}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Objet</p>
          {editing !== 'objet'
            ? <button type="button" onClick={() => startEdit('objet', str(meta.objet))} className="text-[10px] font-medium text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-50">Modifier</button>
            : <div className="flex gap-1.5"><button type="button" onClick={() => saveEdit('objet')} disabled={saving} className="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded font-semibold disabled:opacity-50">{saving ? '…' : 'Enregistrer'}</button><button type="button" onClick={cancelEdit} className="text-[10px] px-2 py-0.5 border border-gray-200 rounded text-gray-500">Annuler</button></div>
          }
        </div>
        {editing === 'objet'
          ? <textarea autoFocus rows={4} value={draft.objet || ''} onChange={e => setDraft({ objet: e.target.value })} className="w-full text-sm border border-blue-300 rounded-lg px-3 py-2 focus:outline-none resize-none leading-relaxed" />
          : <p className="text-sm text-gray-800 leading-relaxed">{str(meta.objet) || <span className="text-gray-300 italic">Non renseigné</span>}</p>
        }
      </div>

      {/* Périmètre */}
      <div ref={setRef('perimetre')} className={sectionCls('perimetre')}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Périmètre</p>
          {editing !== 'perimetre'
            ? <button type="button" onClick={() => startEdit('perimetre', str(meta.perimetre))} className="text-[10px] font-medium text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-50">Modifier</button>
            : <div className="flex gap-1.5"><button type="button" onClick={() => saveEdit('perimetre')} disabled={saving} className="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded font-semibold disabled:opacity-50">{saving ? '…' : 'Enregistrer'}</button><button type="button" onClick={cancelEdit} className="text-[10px] px-2 py-0.5 border border-gray-200 rounded text-gray-500">Annuler</button></div>
          }
        </div>
        {editing === 'perimetre'
          ? <textarea autoFocus rows={4} value={draft.perimetre || ''} onChange={e => setDraft({ perimetre: e.target.value })} className="w-full text-sm border border-blue-300 rounded-lg px-3 py-2 focus:outline-none resize-none leading-relaxed" />
          : <p className="text-sm text-gray-800 leading-relaxed">{str(meta.perimetre) || <span className="text-gray-300 italic">Non renseigné</span>}</p>
        }
      </div>

      {/* Acteurs */}
      <div ref={setRef('acteurs')} className={sectionCls('acteurs')}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Acteurs</p>
          {editing !== 'acteurs'
            ? <button type="button" onClick={() => startEdit('acteurs', str(meta.acteurs))} className="text-[10px] font-medium text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-50">Modifier</button>
            : <div className="flex gap-1.5"><button type="button" onClick={() => saveEdit('acteurs')} disabled={saving} className="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded font-semibold disabled:opacity-50">{saving ? '…' : 'Enregistrer'}</button><button type="button" onClick={cancelEdit} className="text-[10px] px-2 py-0.5 border border-gray-200 rounded text-gray-500">Annuler</button></div>
          }
        </div>
        {editing === 'acteurs'
          ? <textarea autoFocus rows={3} value={draft.acteurs || ''} onChange={e => setDraft({ acteurs: e.target.value })} className="w-full text-sm border border-blue-300 rounded-lg px-3 py-2 focus:outline-none resize-none whitespace-pre-line leading-relaxed" />
          : <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{str(meta.acteurs) || <span className="text-gray-300 italic">Non renseigné</span>}</p>
        }
      </div>

      {/* Règles de gestion */}
      <div ref={setRef('regles_gestion')} className={sectionCls('regles_gestion')}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Règles de gestion</p>
          {editing !== 'regles_gestion'
            ? <button type="button" onClick={() => startEdit('regles_gestion', Array.isArray(meta.regles_gestion) ? [...meta.regles_gestion] : [])} className="text-[10px] font-medium text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-50">Modifier</button>
            : <div className="flex gap-1.5"><button type="button" onClick={() => saveEdit('regles_gestion')} disabled={saving} className="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded font-semibold disabled:opacity-50">{saving ? '…' : 'Enregistrer'}</button><button type="button" onClick={cancelEdit} className="text-[10px] px-2 py-0.5 border border-gray-200 rounded text-gray-500">Annuler</button></div>
          }
        </div>
        {editing === 'regles_gestion' ? (
          <div className="space-y-1.5">
            {(draft.regles_gestion as string[]).map((r: string, i: number) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center mt-1">{i + 1}</span>
                <input value={r} onChange={e => { const arr = [...draft.regles_gestion]; arr[i] = e.target.value; setDraft({ regles_gestion: arr }); }}
                  className="flex-1 text-sm border border-blue-200 rounded px-2 py-1 focus:outline-none" />
                <button type="button" onClick={() => setDraft({ regles_gestion: draft.regles_gestion.filter((_: any, j: number) => j !== i) })} className="text-gray-300 hover:text-red-500 mt-1">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setDraft({ regles_gestion: [...draft.regles_gestion, ''] })}
              className="text-[11px] text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-1">
              <Plus className="w-3 h-3" /> Ajouter une règle
            </button>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {Array.isArray(meta.regles_gestion) && meta.regles_gestion.length > 0
              ? (meta.regles_gestion as string[]).map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-800">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span className="leading-relaxed">{r}</span>
                  </li>
                ))
              : <span className="text-gray-300 italic text-sm">Aucune règle</span>
            }
          </ul>
        )}
      </div>

      {/* Workflow */}
      {steps.length > 0 && (
        <div ref={setRef('workflow')} className={sectionCls('workflow')}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Workflow ({steps.length} étapes)
            </p>
            <a href={`/orchestration?tab=procedures&id=${procedure.id}`} target="_blank" rel="noreferrer"
              className="text-[10px] font-medium text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-50 flex items-center gap-1">
              <ExternalLink className="w-2.5 h-2.5" /> Modifier dans l&apos;éditeur
            </a>
          </div>
          <div className="space-y-1.5">
            {steps.map((step: any, i: number) => {
              // Champs Table1Row (accents) + fallbacks anciens formats
              const actor = step['acteur'] || step['département'] || step.actor || step.departement || '';
              const task  = step['étape']  || step.task || step.tache || step.label || step.title || '';
              if (!task) return null;
              return (
                <div key={i} className="flex gap-3 items-start py-1.5 border-b border-gray-50 last:border-0">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center mt-0.5">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 leading-snug">{task}</p>
                    {actor && <p className="text-[11px] text-gray-400 mt-0.5">{actor}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Logigramme BPMN */}
      {bpmnXml && (
        <div
          ref={setRef('logigramme')}
          className={`rounded-xl border mb-4 overflow-hidden transition-all duration-300 ${
            highlightSection === 'logigramme'
              ? 'border-yellow-400 shadow-md ring-2 ring-yellow-200'
              : 'border-gray-100'
          }`}
        >
          <button
            type="button"
            onClick={() => setShowDiagram(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
          >
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Logigramme</p>
            <span className="text-[10px] text-gray-400">{showDiagram ? '▲ Réduire' : '▼ Afficher'}</span>
          </button>
          {showDiagram && (
            <div className="h-[420px] bg-gray-50 border-t border-gray-100">
              <BpmnViewer
                initialXml={bpmnXml}
                onModelerReady={(modeler: any) => {
                  // Re-fit après que le container a sa taille réelle
                  setTimeout(() => {
                    try { modeler.get('canvas').zoom('fit-viewport'); } catch { /* silent */ }
                  }, 150);
                }}
              />
            </div>
          )}
        </div>
      )}

      {!str(meta.objet) && !str(meta.perimetre) && steps.length === 0 && (
        <div className="text-center py-12 text-gray-300">
          <FileText className="w-10 h-10 mx-auto mb-3" />
          <p className="text-sm">Aucun contenu disponible pour cette procédure</p>
        </div>
      )}
    </div>
  );
}

// ─── Outil Révision IA ────────────────────────────────────────

function RevisionTool({
  procedure,
  session,
  loading,
  onRun,
  selectedId,
  onSelect,
  onCreateTask,
}: {
  procedure: Procedure;
  session: RevisionSession | null;
  loading: boolean;
  onRun: () => void;
  selectedId: string | null;
  onSelect: (point: RevisionPoint) => void;
  onCreateTask: (point: RevisionPoint) => void;
}) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [localSession, setLocalSession] = useState(session);
  useEffect(() => { setLocalSession(session); }, [session]);

  const handleStatus = async (point: RevisionPoint, status: RevisionPointStatus) => {
    if (!localSession) return;
    setUpdatingId(point.id);
    try {
      await workspaceApi.updateRevisionPoint(localSession.session_id, point.id, status);
      setLocalSession(prev => prev ? {
        ...prev,
        points: prev.points.map(p => p.id === point.id ? { ...p, status } : p),
      } : prev);
    } catch { /* silent */ }
    finally { setUpdatingId(null); }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 p-6">
      <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
      <p className="text-sm text-center">Gemini révise la procédure…</p>
      <p className="text-[11px] text-gray-300 text-center">20 à 60 secondes</p>
    </div>
  );

  if (!localSession) return (
    <div className="flex flex-col items-center justify-center h-full gap-5 p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
        <Wand2 className="w-7 h-7 text-blue-500" />
      </div>
      <div>
        <p className="font-semibold text-gray-800 text-sm">Révision IA</p>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
          Gemini analyse la procédure et identifie les lacunes, ambiguïtés et points d&apos;amélioration
        </p>
      </div>
      <button type="button" onClick={onRun}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
        <Wand2 className="w-4 h-4" /> Lancer la révision
      </button>
    </div>
  );

  const diag = DIAGNOSTIC_CONFIG[localSession.diagnostic_global];
  const pending = localSession.points.filter(p => p.status === 'pending').length;

  return (
    <div className="flex flex-col h-full">
      {/* Diagnostic global */}
      <div className={`shrink-0 mx-3 mt-3 rounded-xl border px-4 py-3 ${diag.bg}`}>
        <div className="flex items-center justify-between mb-1">
          <span className={`text-xs font-bold ${diag.color}`}>{diag.label}</span>
          <button type="button" onClick={onRun} title="Relancer"
            className="p-1 rounded-lg hover:bg-white/50 text-gray-500">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        <p className="text-[11px] text-gray-700 leading-relaxed">{localSession.resume}</p>
        <p className="text-[10px] text-gray-400 mt-1.5">{pending} point(s) en attente · {localSession.points.length} total</p>
      </div>

      {/* Liste des points */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {localSession.points.length === 0 ? (
          <div className="text-center py-8 text-gray-300">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p className="text-sm text-green-600 font-medium">Aucun point à réviser</p>
            <p className="text-xs text-gray-400 mt-1">La procédure semble complète</p>
          </div>
        ) : (
          localSession.points.map(point => {
            const dim = point.status === 'dismissed';
            const active = point.id === selectedId;
            return (
              <div
                key={point.id}
                onClick={() => onSelect(point)}
                className={`rounded-xl border p-3 cursor-pointer transition-all ${
                  active   ? 'border-blue-400 bg-blue-50 shadow-sm' :
                  dim      ? 'border-gray-100 bg-gray-50 opacity-40' :
                             'border-gray-100 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-2 mb-1.5 flex-wrap">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${POINT_TYPE_COLORS[point.type]}`}>
                    {POINT_TYPE_LABELS[point.type]}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CRIT_BADGE[point.criticite]}`}>
                    {point.criticite}
                  </span>
                  <span className="text-[10px] text-gray-400 ml-auto">{point.section}</span>
                </div>
                <p className="text-xs text-gray-700 leading-snug line-clamp-2">{point.constat}</p>

                {/* Actions inline */}
                {active && (
                  <div className="mt-2.5 pt-2 border-t border-gray-100">
                    <p className="text-[10px] text-gray-500 mb-1.5 font-medium">Suggestion :</p>
                    <p className="text-[11px] text-gray-700 leading-relaxed mb-2.5">{point.suggestion}</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {point.status !== 'noted' && (
                        <button type="button" disabled={updatingId === point.id}
                          onClick={e => { e.stopPropagation(); handleStatus(point, 'noted'); }}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-600 text-white text-[10px] font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
                          {updatingId === point.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          Noté
                        </button>
                      )}
                      <button type="button"
                        onClick={e => { e.stopPropagation(); onCreateTask(point); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 border border-blue-200 text-blue-700 text-[10px] font-semibold rounded-lg hover:bg-blue-50">
                        <Plus className="w-3 h-3" /> Tâche
                      </button>
                      {point.status !== 'dismissed' && (
                        <button type="button" disabled={updatingId === point.id}
                          onClick={e => { e.stopPropagation(); handleStatus(point, 'dismissed'); }}
                          className="px-2.5 py-1.5 border border-gray-200 text-gray-500 text-[10px] rounded-lg hover:bg-gray-50 disabled:opacity-50">
                          Ignorer
                        </button>
                      )}
                      {point.status !== 'pending' && (
                        <button type="button" disabled={updatingId === point.id}
                          onClick={e => { e.stopPropagation(); handleStatus(point, 'pending'); }}
                          title="Remettre en attente"
                          className="p-1.5 border border-gray-200 text-gray-400 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Outil Corrections ────────────────────────────────────────

function CorrectionsTool({
  session,
  analyzing,
  onFile,
  selectedId,
  onSelect,
  onStatusChange,
}: {
  session: CorrectionsSession | null;
  analyzing: boolean;
  onFile: (f: File) => void;
  selectedId: string | null;
  onSelect: (r: Remark) => void;
  onStatusChange: (id: string, status: RemarkStatus) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleStatus = async (remark: Remark, status: RemarkStatus) => {
    if (!session) return;
    setUpdatingId(remark.id);
    try {
      await correctionsApi.updateRemarkStatus(session.session_id, remark.id, status);
      onStatusChange(remark.id, status);
    } catch { /* silent */ }
    finally { setUpdatingId(null); }
  };

  if (analyzing) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 p-6">
      <Loader2 className="w-7 h-7 animate-spin text-rose-500" />
      <p className="text-sm text-center">Analyse des annotations…</p>
    </div>
  );

  if (!session) return (
    <div className="flex flex-col items-center justify-center h-full gap-5 p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center">
        <PenLine className="w-7 h-7 text-rose-500" />
      </div>
      <div>
        <p className="font-semibold text-gray-800 text-sm">Corrections depuis un PDF annoté</p>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
          Uploadez le PDF retourné avec annotations — l&apos;IA détecte les surlignements, manuscrits, ratures
        </p>
      </div>
      <button type="button" onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white text-sm font-semibold rounded-xl hover:bg-rose-700">
        <Upload className="w-4 h-4" /> Charger le PDF annoté
      </button>
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
        title="Sélectionner un PDF annoté"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );

  const remarks = session.remarks;
  const pending = remarks.filter(r => r.status === 'pending').length;

  return (
    <div className="flex flex-col h-full">
      {/* Synthèse */}
      <div className="shrink-0 mx-3 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-rose-700">{remarks.length} remarque(s) détectée(s)</span>
          <button type="button" onClick={() => inputRef.current?.click()} title="Charger un autre PDF"
            className="p-1 rounded-lg hover:bg-white/50 text-gray-500">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        {session.synthese && <p className="text-[11px] text-gray-700 leading-relaxed">{session.synthese}</p>}
        <p className="text-[10px] text-gray-400 mt-1">{pending} en attente · {remarks.filter(r => r.status === 'treated').length} traitée(s)</p>
        <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
          title="Sélectionner un autre PDF annoté"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </div>

      {/* Remarques */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {remarks.length === 0 ? (
          <div className="text-center py-8 text-gray-300">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p className="text-sm text-green-600 font-medium">Aucune annotation détectée</p>
            <p className="text-xs text-gray-400 mt-1">Le document ne présente pas de marques de correction visibles</p>
          </div>
        ) : (
          [...remarks].sort((a, b) => a.page - b.page).map(remark => {
            const dim = remark.status === 'ignored';
            const active = remark.id === selectedId;
            const tc = REMARK_TYPE_COLORS[remark.type] ?? REMARK_TYPE_COLORS.commentaire;
            return (
              <div
                key={remark.id}
                onClick={() => onSelect(remark)}
                className={`rounded-xl border p-3 cursor-pointer transition-all ${
                  active ? 'border-rose-400 bg-rose-50 shadow-sm' :
                  dim    ? 'border-gray-100 opacity-40' :
                           'border-gray-100 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-gray-400">P.{remark.page}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tc.bg} ${tc.text}`}>
                    {REMARK_TYPE_LABELS[remark.type]}
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto ${CRITICITE_COLORS[remark.criticite]?.badge}`}>
                    {remark.criticite}
                  </span>
                </div>
                <p className="text-xs text-gray-700 line-clamp-2 leading-snug">
                  {remark.texte_concerne || remark.zone || '—'}
                </p>

                {active && (
                  <div className="mt-2.5 pt-2 border-t border-gray-100">
                    {remark.interpretation && (
                      <p className="text-[10px] text-gray-500 mb-1">
                        <span className="font-medium">Remarque :</span> {remark.interpretation}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-500 mb-2 font-medium">Suggestion :</p>
                    <p className="text-[11px] text-gray-700 leading-relaxed mb-2.5">{remark.suggestion}</p>
                    <div className="flex gap-1.5">
                      {remark.status !== 'treated' && (
                        <button type="button" disabled={updatingId === remark.id}
                          onClick={e => { e.stopPropagation(); handleStatus(remark, 'treated'); }}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-600 text-white text-[10px] font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
                          <CheckCircle2 className="w-3 h-3" /> Traité
                        </button>
                      )}
                      {remark.status !== 'ignored' && (
                        <button type="button" disabled={updatingId === remark.id}
                          onClick={e => { e.stopPropagation(); handleStatus(remark, 'ignored'); }}
                          className="px-3 py-1.5 border border-gray-200 text-gray-500 text-[10px] rounded-lg hover:bg-gray-50">
                          Ignorer
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Sélecteur de procédure ───────────────────────────────────

function ProcedureSelector({
  onSelect,
  onClose,
}: {
  onSelect: (p: Procedure) => void;
  onClose: () => void;
}) {
  const { procedures } = useProceduresStore();
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [tree, setTree] = useState<TaxonomyNode[]>([]);
  const [path, setPath] = useState<TaxonomyNode[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    taxonomyApi.getTree().then(r => setTree(r.tree)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const currentNode: TaxonomyNode | null = path.length > 0 ? path[path.length - 1] : null;

  // Noeuds enfants à afficher pour la navigation
  const children = currentNode ? (currentNode.children || []) : tree;
  const isLeaf = children.length === 0;

  // IDs du sous-arbre du nœud courant
  const subtreeIds = useMemo(() => {
    if (!currentNode) return new Set<string>();
    const ids = new Set<string>();
    const collect = (n: TaxonomyNode) => { ids.add(n.id); n.children?.forEach(collect); };
    collect(currentNode);
    return ids;
  }, [currentNode]);

  // Procédures correspondant au nœud (par taxonomy_id)
  const nodeProcedures = useMemo(() => {
    if (!currentNode) return [];
    return procedures.filter(p => p.taxonomy_id && subtreeIds.has(p.taxonomy_id));
  }, [currentNode, procedures, subtreeIds]);

  // Si aucune procédure liée, fallback sur toutes (filtrées par recherche)
  const hasTaxoMatch = nodeProcedures.length > 0;

  const displayedProcedures = useMemo(() => {
    const pool = (isLeaf && !hasTaxoMatch) ? procedures : (currentNode ? nodeProcedures : []);
    if (!search.trim()) return pool;
    const q = search.toLowerCase();
    return pool.filter(p => p.nom.toLowerCase().includes(q) || (p.ref || '').toLowerCase().includes(q));
  }, [isLeaf, hasTaxoMatch, procedures, currentNode, nodeProcedures, search]);

  // Recherche globale sans nœud sélectionné
  const globalSearchResults = useMemo(() => {
    if (currentNode || !search.trim()) return [];
    const q = search.toLowerCase();
    return procedures.filter(p => p.nom.toLowerCase().includes(q) || (p.ref || '').toLowerCase().includes(q)).slice(0, 25);
  }, [currentNode, search, procedures]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-blue-500 shrink-0" />
          <h2 className="font-bold text-gray-900 text-sm flex-1">Ouvrir une procédure</h2>
          <button type="button" onClick={onClose} title="Fermer" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-gray-100">
          {[{ id: 'library', label: 'Bibliothèque', icon: BookOpen }, { id: 'upload', label: 'Importer', icon: Upload }].map(t => (
            <button key={t.id} type="button"
              onClick={() => setTab(t.id as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'library' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Recherche */}
            <div className="shrink-0 px-4 py-2.5 border-b border-gray-50">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" placeholder="Rechercher une procédure…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
              </div>
            </div>

            {/* Fil d'Ariane */}
            {path.length > 0 && (
              <div className="shrink-0 px-4 py-2 border-b border-gray-50 flex items-center gap-1 text-xs text-gray-500 flex-wrap">
                <button type="button" onClick={() => setPath([])} className="hover:text-blue-600">Racine</button>
                {path.map((n, i) => (
                  <React.Fragment key={n.id}>
                    <ChevronRight className="w-3 h-3 text-gray-300" />
                    <button type="button" onClick={() => setPath(path.slice(0, i + 1))} className="hover:text-blue-600 truncate max-w-[120px]">{n.name}</button>
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Contenu */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>
              ) : (
                <>
                  {/* Noeuds enfants (navigation taxonomie) */}
                  {!search.trim() && children.map(node => (
                    <button key={node.id} type="button"
                      onClick={() => setPath([...path, node])}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left mb-1">
                      <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <ChevronRight className="w-3.5 h-3.5 text-blue-500" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{node.name}</p>
                        {node.procedure_count ? <p className="text-[10px] text-gray-400">{node.procedure_count} procédure(s)</p> : null}
                      </div>
                    </button>
                  ))}

                  {/* Note fallback si aucune procédure liée mais on affiche tout */}
                  {isLeaf && !hasTaxoMatch && currentNode && !search.trim() && procedures.length > 0 && (
                    <p className="text-[11px] text-gray-400 italic px-1 mb-2">
                      Aucune procédure liée à cette catégorie — toutes les procédures affichées
                    </p>
                  )}

                  {/* Procédures */}
                  {(currentNode ? displayedProcedures : globalSearchResults).map(p => (
                    <button key={p.id} type="button" onClick={() => onSelect(p)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 text-left mb-1 border border-transparent hover:border-blue-200 transition-colors">
                      <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <FileText className="w-3.5 h-3.5 text-gray-500" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.nom}</p>
                        <p className="text-[10px] text-gray-400">{[p.ref, p.status, p.category].filter(Boolean).join(' · ')}</p>
                      </div>
                    </button>
                  ))}

                  {/* Vide */}
                  {!loading && currentNode && displayedProcedures.length === 0 && !isLeaf && (
                    <p className="text-xs text-gray-400 text-center py-6">Naviguez dans les catégories pour trouver des procédures</p>
                  )}
                  {!loading && !currentNode && !search.trim() && (
                    <p className="text-xs text-gray-400 text-center py-6">Sélectionnez une catégorie ou recherchez une procédure</p>
                  )}
                  {!loading && !currentNode && search.trim() && globalSearchResults.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-6">Aucun résultat pour « {search} »</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'upload' && (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-gray-400">
            <div>
              <Upload className="w-8 h-8 mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">Import PDF depuis l&apos;outil Corrections</p>
              <p className="text-xs mt-1">Ouvrez d&apos;abord une procédure depuis la bibliothèque,<br />puis chargez un PDF annoté dans l&apos;outil Corrections.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── WorkspaceShell principal ─────────────────────────────────

type ActiveTool = 'revision' | 'corrections';

// ─── Modal création de tâche ──────────────────────────────────

function CreateTaskModal({
  procedure,
  sourcePoint,
  currentUserName,
  currentUserId,
  onCreated,
  onClose,
}: {
  procedure: Procedure;
  sourcePoint: RevisionPoint | null;
  currentUserName: string;
  currentUserId: string;
  onCreated: (task: ProcedureTask) => void;
  onClose: () => void;
}) {
  const [title, setTitle]       = useState(sourcePoint ? `Corriger : ${sourcePoint.section}` : '');
  const [description, setDesc]  = useState(sourcePoint ? `${sourcePoint.constat}\n\nSuggestion : ${sourcePoint.suggestion}` : '');
  const [assignedTo, setAssign] = useState('');
  const [taskType, setType]     = useState<'correction' | 'review' | 'validation'>('correction');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [dueDate, setDueDate]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [actors, setActors]     = useState<{ id: string; full_name: string; email: string }[]>([]);

  useEffect(() => {
    // Charge les utilisateurs pour l'assignation
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
    fetch(`${BASE}/api/orchestration/users`)
      .then(r => r.json())
      .then(d => setActors(d.users || []))
      .catch(() => {});
  }, []);

  const workspaceUrl = `${window.location.origin}/orchestration?tab=workspace&procedure_id=${procedure.id}`;

  const handleSubmit = async () => {
    if (!title.trim() || !assignedTo) return;
    setSaving(true);
    try {
      const res = await orchestrationTasksApi.createTask(procedure.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        assigned_to: assignedTo,
        assigned_by: currentUserId,
        task_type: taskType,
        priority,
        due_date: dueDate || null,
      });
      // Envoi email avec deep link
      const actor = actors.find(a => a.id === assignedTo);
      if (actor?.email) {
        await notifyTaskAssignedByEmail({
          toEmail:       actor.email,
          toName:        actor.full_name || actor.email,
          assignedByName: currentUserName,
          taskTitle:     title.trim(),
          procedureName: procedure.nom,
          taskType,
          dueDate:       dueDate || null,
          workspaceUrl,
          taskDescription: description.trim() || undefined,
        });
      }
      onCreated(res.task);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <Plus className="w-4 h-4 text-blue-500" />
          <h2 className="font-bold text-gray-900 text-sm flex-1">Créer une tâche</h2>
          <button type="button" onClick={onClose} title="Fermer" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {sourcePoint && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-[11px] text-blue-700">
              Point de révision : <strong>{sourcePoint.section}</strong> — {sourcePoint.type}
            </div>
          )}
          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Titre *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Description</label>
            <textarea value={description} onChange={e => setDesc(e.target.value)} rows={3}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Assigné à *</label>
            <select value={assignedTo} onChange={e => setAssign(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 bg-white">
              <option value="">Sélectionner…</option>
              {actors.map(a => <option key={a.id} value={a.id}>{a.full_name || a.email}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Type</label>
              <select value={taskType} onChange={e => setType(e.target.value as any)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none bg-white">
                <option value="correction">Correction</option>
                <option value="review">Vérification</option>
                <option value="validation">Validation</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Priorité</label>
              <select value={priority} onChange={e => setPriority(e.target.value as any)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none bg-white">
                <option value="normal">Normale</option>
                <option value="high">Haute</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Échéance</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none" />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <FileSearch className="w-3 h-3" /> Le mail contiendra un lien direct vers le workspace
          </p>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200">
            Annuler
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving || !title.trim() || !assignedTo}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Créer et notifier
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Statuts tâches ───────────────────────────────────────────

const TASK_STATUS_LABELS: Record<ProcedureTaskStatus, string> = {
  todo:               'À faire',
  in_progress:        'En cours',
  submitted:          'Soumis',
  changes_requested:  'Corrections',
  waiting_info:       'En attente',
  blocked:            'Bloqué',
  completed:          'Terminé',
  validated:          'Validé',
  cancelled:          'Annulé',
};

const TASK_STATUS_COLORS: Record<ProcedureTaskStatus, string> = {
  todo:               'bg-gray-100 text-gray-600',
  in_progress:        'bg-blue-50 text-blue-700',
  submitted:          'bg-indigo-50 text-indigo-700',
  changes_requested:  'bg-orange-50 text-orange-700',
  waiting_info:       'bg-yellow-50 text-yellow-700',
  blocked:            'bg-red-50 text-red-700',
  completed:          'bg-green-50 text-green-700',
  validated:          'bg-emerald-50 text-emerald-700',
  cancelled:          'bg-gray-50 text-gray-400',
};

export default function WorkspaceShell() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const [procedure, setProcedure] = useState<Procedure | null>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);

  // Révision
  const [revisionSession, setRevisionSession] = useState<RevisionSession | null>(null);
  const [revisingLoading, setRevisingLoading] = useState(false);

  // Corrections
  const [correctionsSession, setCorrectionsSession] = useState<CorrectionsSession | null>(null);
  const [correctionsAnalyzing, setCorrectionsAnalyzing] = useState(false);

  // Tâches
  const [tasks, setTasks] = useState<ProcedureTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [taskSourcePoint, setTaskSourcePoint] = useState<RevisionPoint | null>(null);

  // Projet lié
  const [linkedProject, setLinkedProject] = useState<{ id: string; title: string; status: string; progress_pct: number } | null>(null);

  // Navigation
  const [activeTool, setActiveTool] = useState<ActiveTool>('revision');
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [selectedCorrectionId, setSelectedCorrectionId] = useState<string | null>(null);
  const [highlightSection, setHighlightSection] = useState<string | null>(null);

  // Deep link : charge la procédure depuis l'URL au montage
  useEffect(() => {
    const pid = searchParams.get('procedure_id');
    if (!pid || procedure) return;
    setInitialLoading(true);
    orchestrationApi.getProcedure(pid)
      .then(res => setProcedure(res.procedure))
      .catch(() => {})
      .finally(() => setInitialLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Charge les tâches + projet lié quand la procédure change
  useEffect(() => {
    if (!procedure) return;

    setTasksLoading(true);
    orchestrationTasksApi.getProcedureTasks(procedure.id)
      .then(res => setTasks(res.tasks || []))
      .catch(() => setTasks([]))
      .finally(() => setTasksLoading(false));

    // Cherche si cette procédure appartient à un projet
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
    fetch(`${BASE}/api/campaigns`)
      .then(r => r.json())
      .then((data: { campaigns?: any[] }) => {
        const allProjects = data.campaigns || [];
        // Cherche le projet actif qui contient cette procédure
        const found = allProjects.find((proj: any) => {
          const procs: any[] = proj.procedures || [];
          return procs.some((p: any) => p.procedure_id === procedure.id);
        });
        if (found) {
          setLinkedProject({
            id: found.id,
            title: found.title,
            status: found.status,
            progress_pct: found.stats?.progress_pct ?? 0,
          });
        } else {
          setLinkedProject(null);
        }
      })
      .catch(() => setLinkedProject(null));
  }, [procedure?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lancement révision
  const handleRevise = useCallback(async () => {
    if (!procedure) return;
    setRevisingLoading(true);
    setRevisionSession(null);
    setSelectedRevisionId(null);
    setHighlightSection(null);
    try {
      const meta = procedure.metadata || {};
      const result = await workspaceApi.revise({
        procedure_id: procedure.id,
        nom:           procedure.nom,
        ref:           procedure.ref,
        objet:         str(meta.objet),
        perimetre:     str(meta.perimetre),
        acteurs:       str(meta.acteurs),
        regles_gestion: Array.isArray(meta.regles_gestion) ? meta.regles_gestion as string[] : [],
        workflow_steps: (procedure as any).workflow_json || [],
        lifecycle_stages: procedure.lifecycle_stages as any || [],
      });
      setRevisionSession(result);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur lors de la révision');
    } finally {
      setRevisingLoading(false);
    }
  }, [procedure]);

  // Sélection d'un point de révision → highlight section dans le doc
  const SECTION_MAP: Record<string, string> = {
    'Objet':              'objet',
    'Périmètre':          'perimetre',
    'Acteurs':            'acteurs',
    'Règles de gestion':  'regles_gestion',
    'Workflow':           'workflow',
  };

  const handleRevisionSelect = useCallback((point: RevisionPoint) => {
    setSelectedRevisionId(prev => prev === point.id ? null : point.id);
    const sec = SECTION_MAP[point.section] || (point.section.startsWith('Étape') ? 'workflow' : null);
    setHighlightSection(sec);
  }, []);

  // Sélection d'une correction → highlight workflow (les corrections portent sur le texte)
  const handleCorrectionSelect = useCallback((remark: Remark) => {
    setSelectedCorrectionId(prev => prev === remark.id ? null : remark.id);
    setHighlightSection('workflow');
  }, []);

  // Upload PDF annoté pour corrections
  const handleCorrectionFile = useCallback(async (file: File) => {
    setCorrectionsAnalyzing(true);
    setCorrectionsSession(null);
    setSelectedCorrectionId(null);
    try {
      const result = await correctionsApi.analyze(file);
      setCorrectionsSession(result);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur lors de l\'analyse');
    } finally {
      setCorrectionsAnalyzing(false);
    }
  }, []);

  const handleCorrectionStatusChange = useCallback((id: string, status: RemarkStatus) => {
    setCorrectionsSession(prev => {
      if (!prev) return prev;
      return { ...prev, remarks: prev.remarks.map(r => r.id === id ? { ...r, status } : r) };
    });
  }, []);

  // Chargement d'une procédure
  const handleSelectProcedure = useCallback(async (p: Procedure) => {
    setShowSelector(false);
    try {
      const res = await orchestrationApi.getProcedure(p.id);
      setProcedure(res.procedure);
    } catch {
      setProcedure(p);
    }
    setRevisionSession(null);
    setCorrectionsSession(null);
    setSelectedRevisionId(null);
    setSelectedCorrectionId(null);
    setHighlightSection(null);
    // Met à jour l'URL sans rechargement
    const url = new URL(window.location.href);
    url.searchParams.set('procedure_id', p.id);
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Créer une tâche depuis un point de révision
  const handleCreateTaskFromPoint = useCallback((point: RevisionPoint) => {
    setTaskSourcePoint(point);
    setShowCreateTask(true);
  }, []);

  const handleTaskCreated = useCallback((task: ProcedureTask) => {
    setTasks(prev => [task, ...prev]);
    setShowCreateTask(false);
    setTaskSourcePoint(null);
  }, []);

  const handleOpenInEditor = useCallback(() => {
    if (!procedure) return;
    window.open(`/orchestration?tab=procedures&id=${procedure.id}`, '_blank');
  }, [procedure]);

  // ── Chargement initial depuis URL ──────────────────────────
  if (initialLoading) return (
    <div className="h-full flex items-center justify-center gap-3 text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      <span className="text-sm">Chargement de la procédure…</span>
    </div>
  );

  // ── Écran d'accueil ─────────────────────────────────────────
  if (!procedure) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center mx-auto mb-4">
            <FileSearch className="w-8 h-8 text-blue-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Espace de travail</h2>
          <p className="text-sm text-gray-400 mt-1.5 max-w-xs">
            Ouvrez une procédure pour lancer une révision IA ou traiter les corrections d&apos;un document annoté
          </p>
        </div>
        <button type="button" onClick={() => setShowSelector(true)}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 shadow-sm">
          <BookOpen className="w-4 h-4" /> Ouvrir une procédure
        </button>
        {showSelector && <ProcedureSelector onSelect={handleSelectProcedure} onClose={() => setShowSelector(false)} />}
      </div>
    );
  }

  // ── Workspace principal ─────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-white">

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2.5 border-b border-gray-100 bg-white flex items-center gap-3">
        {/* Fil d'Ariane + titre */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-0.5 flex-wrap">
            <span>Workspace</span>
            <ChevronRight className="w-2.5 h-2.5" />
            {procedure.category && <><span>{procedure.category}</span><ChevronRight className="w-2.5 h-2.5" /></>}
            <span className="text-gray-600 font-medium truncate max-w-[200px]">{procedure.nom}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              procedure.status === 'Validée' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
            }`}>{procedure.status}</span>
            {procedure.ref && <span className="text-[10px] font-mono text-gray-400">{procedure.ref}</span>}
            {procedure.version && <span className="text-[10px] text-gray-400">v{procedure.version}</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={handleOpenInEditor} title="Ouvrir dans l'éditeur complet"
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50">
            <ExternalLink className="w-3.5 h-3.5" /> Éditeur
          </button>
          <button type="button" onClick={() => setShowSelector(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50">
            <BookOpen className="w-3.5 h-3.5" /> Changer
          </button>
        </div>
      </div>

      {/* ── CORPS 3 COLONNES ────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT SIDEBAR */}
        <div className="w-[220px] shrink-0 flex flex-col border-r border-gray-100 bg-gray-50 overflow-y-auto">
          <div className="shrink-0 px-3 pt-3 pb-2 border-b border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Sections</p>
            {SECTIONS.map(s => (
              <button key={s.id} type="button"
                onClick={() => setHighlightSection(s.id)}
                className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg mb-0.5 transition-colors ${
                  highlightSection === s.id ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
                }`}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Projet lié */}
          {linkedProject && (
            <div className="shrink-0 px-3 py-3 border-b border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Projet</p>
              <div className="rounded-lg border border-orange-100 bg-orange-50 px-2.5 py-2">
                <p className="text-[11px] font-semibold text-orange-800 truncate leading-snug">{linkedProject.title}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 bg-orange-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-1.5 bg-orange-400 rounded-full" {...{ style: { width: `${linkedProject.progress_pct}%` } }} />
                  </div>
                  <span className="text-[10px] font-bold text-orange-700 shrink-0">{linkedProject.progress_pct}%</span>
                </div>
                <span className={`mt-1 inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                  linkedProject.status === 'blocked' ? 'bg-red-100 text-red-700' :
                  linkedProject.status === 'on_hold' ? 'bg-purple-100 text-purple-700' :
                  linkedProject.status === 'active'  ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {CAMPAIGN_STATUS_LABELS[linkedProject.status as keyof typeof CAMPAIGN_STATUS_LABELS] ?? linkedProject.status}
                </span>
              </div>
            </div>
          )}

          {/* Tâches liées */}
          <div className="shrink-0 px-3 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tâches</p>
              {tasksLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
            </div>
            {tasks.length === 0 && !tasksLoading ? (
              <p className="text-[11px] text-gray-300 italic">Aucune tâche</p>
            ) : (
              <div className="space-y-1">
                {tasks.slice(0, 5).map(task => (
                  <div key={task.id} className="rounded-lg border border-gray-100 bg-white px-2.5 py-2">
                    <p className="text-[11px] font-medium text-gray-800 truncate leading-snug">{task.title}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${TASK_STATUS_COLORS[task.status]}`}>
                        {TASK_STATUS_LABELS[task.status]}
                      </span>
                      {task.due_date && (
                        <span className="text-[9px] text-gray-400 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {tasks.length > 5 && (
                  <p className="text-[10px] text-gray-400 text-center pt-1">+{tasks.length - 5} autres</p>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 px-3 pt-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Outils</p>
            {([
              { id: 'revision',    label: 'Révision IA',  icon: Wand2,    color: 'text-blue-600',  count: revisionSession?.points.filter(p => p.status === 'pending').length },
              { id: 'corrections', label: 'Corrections',  icon: PenLine,  color: 'text-rose-600',  count: correctionsSession?.remarks.filter(r => r.status === 'pending').length },
            ] as const).map(tool => (
              <button key={tool.id} type="button"
                onClick={() => setActiveTool(tool.id)}
                className={`w-full flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg mb-1 transition-colors ${
                  activeTool === tool.id ? 'bg-white shadow-sm border border-gray-200 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-100'
                }`}>
                <tool.icon className={`w-3.5 h-3.5 shrink-0 ${tool.color}`} />
                <span className="flex-1 text-left">{tool.label}</span>
                {tool.count != null && tool.count > 0 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">{tool.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* CENTER - DOCUMENT */}
        <div className="flex-1 overflow-hidden bg-gray-50">
          <DocumentCenter
            procedure={procedure}
            highlightSection={highlightSection}
            onProcedureUpdated={updates => setProcedure(prev => prev ? { ...prev, ...updates } : prev)}
          />
        </div>

        {/* RIGHT PANEL - OUTIL ACTIF */}
        <div className="w-[300px] shrink-0 flex flex-col border-l border-gray-100 bg-white overflow-hidden">
          <div className="shrink-0 px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            {activeTool === 'revision' ? (
              <><Wand2 className="w-3.5 h-3.5 text-blue-500" /><span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Révision IA</span></>
            ) : (
              <><PenLine className="w-3.5 h-3.5 text-rose-500" /><span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Corrections</span></>
            )}
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTool === 'revision' ? (
              <RevisionTool
                procedure={procedure}
                session={revisionSession}
                loading={revisingLoading}
                onRun={handleRevise}
                selectedId={selectedRevisionId}
                onSelect={handleRevisionSelect}
                onCreateTask={handleCreateTaskFromPoint}
              />
            ) : (
              <CorrectionsTool
                session={correctionsSession}
                analyzing={correctionsAnalyzing}
                onFile={handleCorrectionFile}
                selectedId={selectedCorrectionId}
                onSelect={handleCorrectionSelect}
                onStatusChange={handleCorrectionStatusChange}
              />
            )}
          </div>
        </div>

      </div>

      {showSelector && <ProcedureSelector onSelect={handleSelectProcedure} onClose={() => setShowSelector(false)} />}

      {showCreateTask && procedure && (
        <CreateTaskModal
          procedure={procedure}
          sourcePoint={taskSourcePoint}
          currentUserName={profile?.full_name || profile?.display_name || profile?.email || 'Utilisateur'}
          currentUserId={profile?.id || ''}
          onCreated={handleTaskCreated}
          onClose={() => { setShowCreateTask(false); setTaskSourcePoint(null); }}
        />
      )}
    </div>
  );
}

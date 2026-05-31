'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Clock, Gavel, Loader2, PauseCircle, PlayCircle, RefreshCw, X,
} from 'lucide-react';
import { orchestrationApi } from '@/lib/orchestrationApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LifecycleStage {
  id: string;
  title: string;
  description: string;
  workshop: string;
  workshop_done: boolean;
  status: 'pending' | 'in_progress' | 'completed';
  completed_at: string | null;
  notes: string;
}

interface JourneyTask {
  id: string; title: string; task_type: string; raci_role: string;
  status: string; priority: string; assigned_to: string; assigned_to_name?: string;
}

interface JourneyEvent {
  id: string; procedure_id: string; event_type: string;
  from_status: string | null; to_status: string | null;
  actor_id: string | null; actor_name: string;
  task_id: string | null; task: JourneyTask | null;
  stage_id: string | null; message: string | null;
  payload: Record<string, unknown>; created_at: string;
  duration_from_previous_seconds: number | null;
}

interface Props {
  procedureId: string;
  procedureName: string;
  isAdmin?: boolean;
  currentActorId?: string;
  onClose: () => void;
}

// ─── Event config ─────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  procedure_created:      'Procédure créée',
  procedure_imported:     'Importée depuis PDF',
  procedure_finalized:    'Finalisée',
  procedure_validated:    'Validée',
  status_changed:         'Statut modifié',
  task_created:           'Tâche créée',
  task_in_progress:       'Tâche en cours',
  task_submitted:         'Tâche soumise',
  task_validated:         'Tâche validée',
  task_changes_requested: 'Corrections demandées',
  task_completed:         'Tâche complétée',
  task_blocked:           'Tâche bloquée',
  task_cancelled:         'Tâche annulée',
  review_task_created:    'Vérification initiée',
  validation_task_created:'Validation initiée',
  correction_task_created:'Correction demandée',
  information_task_created:'Information envoyée',
  comment_added:          'Commentaire ajouté',
  procedure_paused:       'Mise en pause',
  procedure_resumed:      'Reprise',
  arbitrage_requested:    'Arbitrage demandé',
  arbitrage_resolved:     'Arbitrage résolu',
};

const EVENT_COLORS: Record<string, string> = {
  procedure_created:      'bg-blue-100 text-blue-700',
  procedure_imported:     'bg-indigo-100 text-indigo-700',
  procedure_finalized:    'bg-emerald-100 text-emerald-700',
  procedure_validated:    'bg-emerald-100 text-emerald-700',
  status_changed:         'bg-amber-100 text-amber-700',
  task_created:           'bg-blue-100 text-blue-700',
  task_submitted:         'bg-indigo-100 text-indigo-700',
  task_validated:         'bg-emerald-100 text-emerald-700',
  task_changes_requested: 'bg-orange-100 text-orange-700',
  review_task_created:    'bg-indigo-100 text-indigo-700',
  validation_task_created:'bg-violet-100 text-violet-700',
  correction_task_created:'bg-red-100 text-red-700',
  comment_added:          'bg-slate-100 text-slate-600',
  procedure_paused:       'bg-amber-100 text-amber-800',
  procedure_resumed:      'bg-teal-100 text-teal-700',
  arbitrage_requested:    'bg-orange-100 text-orange-800',
  arbitrage_resolved:     'bg-purple-100 text-purple-700',
};

// ─── Stage visual config ──────────────────────────────────────────────────────

// 0=Création 1=Formalisation 2=Vérification 3=Validation 4=Signature 5=Publication
const STAGE_ICONS: Record<number, string> = { 0: '✦', 1: '✎', 2: '✓', 3: '☑', 4: '✍', 5: '◉' };

const STAGE_COLORS: Record<number, { stroke: string; fill: string; bg: string; text: string }> = {
  0: { stroke: '#3b82f6', fill: '#eff6ff', bg: 'bg-blue-50',   text: 'text-blue-700'   },
  1: { stroke: '#7c3aed', fill: '#f5f3ff', bg: 'bg-violet-50', text: 'text-violet-700' },
  2: { stroke: '#0891b2', fill: '#ecfeff', bg: 'bg-cyan-50',   text: 'text-cyan-700'   },
  3: { stroke: '#d97706', fill: '#fffbeb', bg: 'bg-amber-50',  text: 'text-amber-700'  },
  4: { stroke: '#0d9488', fill: '#f0fdfa', bg: 'bg-teal-50',   text: 'text-teal-700'   },
  5: { stroke: '#059669', fill: '#ecfdf5', bg: 'bg-emerald-50',text: 'text-emerald-700'},
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
function formatDuration(s: number) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}min`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}j`;
}

const STATUS_TO_STAGE: Record<string, number> = {
  'Brouillon':       0,
  'En cours':        1,
  'En vérification': 2,
  'Retours reçus':   1,
  'En révision':     2,
  'En validation':   3,
  'Validée':         4,
};

function currentStageIndex(stages: LifecycleStage[], events?: JourneyEvent[], currentStatus?: string | null): number {
  // Priority 1: explicit in_progress stage
  const ip = stages.findIndex(s => s.status === 'in_progress');
  if (ip !== -1) return ip;

  // Priority 2: last completed stage + 1
  let lastCompleted = -1;
  stages.forEach((s, i) => { if (s.status === 'completed') lastCompleted = i; });
  if (lastCompleted !== -1) return Math.min(lastCompleted + 1, stages.length - 1);

  // Priority 3: infer from procedure status field
  if (currentStatus && currentStatus in STATUS_TO_STAGE) {
    return Math.min(STATUS_TO_STAGE[currentStatus], stages.length - 1);
  }

  // Priority 4: infer from events (fallback for legacy data)
  if (events && events.length > 0) {
    let lastIdx = 0;
    for (const ev of events) {
      const idx = eventToStageIdx(ev.event_type, ev.payload ?? undefined);
      if (idx !== null && idx < stages.length) lastIdx = Math.max(lastIdx, idx);
    }
    return lastIdx;
  }

  return 0;
}

// ─── Event→Stage mapping (best effort) ───────────────────────────────────────

function eventToStageIdx(eventType: string, payload?: Record<string, unknown>): number | null {
  switch (eventType) {
    case 'procedure_created':
    case 'procedure_imported':
      return 0;
    case 'task_created':
      if (payload?.raci_role === 'R' || payload?.task_type === 'formalization') return 1;
      return null;
    case 'review_task_created':
      return 2;
    case 'validation_task_created':
      return 3;
    case 'correction_task_created':
      return 1;
    case 'task_validated':
      if (payload?.raci_role === 'A' || payload?.task_type === 'validation') return 4;
      return null;
    case 'procedure_validated':
      return 4;
    case 'procedure_finalized':
      return 5;
    default:
      return null;
  }
}

// ─── Arc builder ─────────────────────────────────────────────────────────────

interface TrajectoryArc {
  fromIdx: number; toIdx: number;
  isReturn: boolean; isSpecial: boolean;
  label: string; color: string;
  event: JourneyEvent;
}

function buildArcs(events: JourneyEvent[], n: number): TrajectoryArc[] {
  const arcs: TrajectoryArc[] = [];
  let prevIdx: number | null = null;

  for (const ev of events) {
    // Special events → pause/arbitrage arcs shown inline
    if (ev.event_type === 'procedure_paused' || ev.event_type === 'arbitrage_requested') {
      if (prevIdx !== null) {
        arcs.push({
          fromIdx: prevIdx, toIdx: prevIdx,
          isReturn: false, isSpecial: true,
          label: ev.event_type === 'procedure_paused' ? 'Stand-by' : 'Arbitrage',
          color: ev.event_type === 'procedure_paused' ? '#d97706' : '#9333ea',
          event: ev,
        });
      }
      continue;
    }
    if (ev.event_type === 'procedure_resumed' || ev.event_type === 'arbitrage_resolved') {
      continue; // reprise = no arc, just shown in timeline
    }

    const idx = eventToStageIdx(ev.event_type, ev.payload ?? undefined);
    if (idx === null || idx >= n) continue;

    if (prevIdx !== null && prevIdx !== idx) {
      const isReturn = idx < prevIdx;
      let label = '';
      if (isReturn) {
        label = ev.event_type === 'correction_task_created' ? 'Correction' : 'Retour';
      } else {
        if (idx - prevIdx > 1) label = 'Transfert direct';
        else if (ev.event_type === 'review_task_created') label = 'Soumis vérif.';
        else if (ev.event_type === 'validation_task_created') label = 'Soumis valid.';
      }
      arcs.push({
        fromIdx: prevIdx, toIdx: idx,
        isReturn, isSpecial: false,
        label, color: isReturn ? '#ef4444' : '#3b82f6',
        event: ev,
      });
    }
    prevIdx = idx;
  }
  return arcs;
}

// ─── Metro SVG ────────────────────────────────────────────────────────────────

const SVG_W   = 900;
const NODE_R  = 26;
const NODE_Y  = 120;
const LABEL_Y = NODE_Y + NODE_R + 18;

function MetroSvg({
  events, stages, currentStatus,
}: {
  events: JourneyEvent[];
  stages: LifecycleStage[];
  currentStatus: string | null;
}) {
  const [hoveredArc,  setHoveredArc]  = useState<number | null>(null);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const [selectedArc, setSelectedArc] = useState<TrajectoryArc | null>(null);

  const n       = stages.length;
  const padding = 80;
  const spacing = (SVG_W - padding * 2) / Math.max(n - 1, 1);
  const nodeX   = (i: number) => padding + i * spacing;
  const curIdx  = currentStageIndex(stages, events, currentStatus);

  const isPaused    = currentStatus === 'En pause';
  const isArbitrage = currentStatus === 'En arbitrage';

  const arcs = buildArcs(events, n);

  const retGroups: Record<string, number> = {};
  const fwdGroups: Record<string, number> = {};

  // Dynamic height
  const retCount = arcs.filter(a => a.isReturn).length;
  const fwdDepth = arcs.filter(a => !a.isReturn && !a.isSpecial)
    .reduce((m, a) => Math.max(m, 38 + (a.toIdx - a.fromIdx - 1) * 22), 0);
  const svgH = 200 + Math.min(retCount, 4) * 28 + (fwdDepth > 0 ? fwdDepth + 30 : 0);

  return (
    <div className="space-y-3">
      <svg width="100%" viewBox={`0 0 ${SVG_W} ${svgH}`}
        style={{ display: 'block', overflow: 'visible' }}>

        {/* ── Baseline ── */}
        <line x1={nodeX(0)} y1={NODE_Y} x2={nodeX(n - 1)} y2={NODE_Y}
          stroke="#e2e8f0" strokeWidth={6} strokeLinecap="round" />

        {/* ── Segments colorés (segments atteints) ── */}
        {stages.slice(0, -1).map((stage, i) => {
          const reached = stage.status === 'completed' ||
            stages.slice(i + 1).some(s => s.status !== 'pending');
          if (!reached) return null;
          const col = STAGE_COLORS[i]?.stroke ?? '#94a3b8';
          return (
            <line key={i} x1={nodeX(i)} y1={NODE_Y} x2={nodeX(i + 1)} y2={NODE_Y}
              stroke={col} strokeWidth={6} strokeLinecap="round" opacity={0.6} />
          );
        })}

        {/* ── Forward arcs (soumissions) ── */}
        {arcs.filter(a => !a.isReturn && !a.isSpecial).map((arc, idx) => {
          const key = `${arc.fromIdx}-${arc.toIdx}`;
          fwdGroups[key] = (fwdGroups[key] || 0) + 1;
          const stack = fwdGroups[key];
          const depth = 38 + (arc.toIdx - arc.fromIdx - 1) * 22 + (stack - 1) * 18;
          const x1 = nodeX(arc.fromIdx), x2 = nodeX(arc.toIdx);
          const mx = (x1 + x2) / 2;
          const cy = NODE_Y + NODE_R + depth;
          const isHov = hoveredArc === idx;
          const markerId = `afwd-${idx}`;
          return (
            <g key={`fwd-${idx}`}
              onMouseEnter={() => setHoveredArc(idx)}
              onMouseLeave={() => setHoveredArc(null)}
              onClick={() => setSelectedArc(selectedArc?.event.id === arc.event.id ? null : arc)}
              style={{ cursor: 'pointer' }}>
              <defs>
                <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="5" markerHeight="5" orient="auto">
                  <path d="M1 1L9 5L1 9" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" />
                </marker>
              </defs>
              <path d={`M${x1} ${NODE_Y + NODE_R} Q${mx} ${cy} ${x2} ${NODE_Y + NODE_R}`}
                fill="none" stroke="transparent" strokeWidth={12} />
              <path d={`M${x1} ${NODE_Y + NODE_R} Q${mx} ${cy} ${x2} ${NODE_Y + NODE_R}`}
                fill="none" stroke="#059669" strokeWidth={isHov ? 3 : 2}
                strokeDasharray="6,4" markerEnd={`url(#${markerId})`}
                opacity={isHov ? 1 : 0.6} />
              {arc.label && (
                <text x={mx} y={cy + 13} textAnchor="middle"
                  fontSize={9} fontWeight={600} fill="#059669" opacity={isHov ? 1 : 0.75}>
                  {arc.label}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Return arcs ── */}
        {arcs.filter(a => a.isReturn && !a.isSpecial).map((arc, idx) => {
          const key = `${arc.fromIdx}-${arc.toIdx}`;
          retGroups[key] = (retGroups[key] || 0) + 1;
          const stack = retGroups[key];
          const arcH = 50 + stack * 28;
          const x1 = nodeX(arc.fromIdx), x2 = nodeX(arc.toIdx);
          const mx = (x1 + x2) / 2;
          const cy = NODE_Y - arcH;
          const isHov = hoveredArc === 1000 + idx;
          const markerId = `aret-${idx}`;
          return (
            <g key={`ret-${idx}`}
              onMouseEnter={() => setHoveredArc(1000 + idx)}
              onMouseLeave={() => setHoveredArc(null)}
              onClick={() => setSelectedArc(selectedArc?.event.id === arc.event.id ? null : arc)}
              style={{ cursor: 'pointer' }}>
              <defs>
                <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="5" markerHeight="5" orient="auto">
                  <path d="M1 1L9 5L1 9" fill="none" stroke={arc.color} strokeWidth="2" strokeLinecap="round" />
                </marker>
              </defs>
              <path d={`M${x1} ${NODE_Y - NODE_R} Q${mx} ${cy} ${x2} ${NODE_Y - NODE_R}`}
                fill="none" stroke={arc.color} strokeWidth={isHov ? 3 : 2}
                strokeDasharray="6,4" markerEnd={`url(#${markerId})`}
                opacity={isHov ? 1 : 0.7} />
              {arc.label && (
                <text x={mx} y={cy - 6} textAnchor="middle"
                  fontSize={9} fontWeight={600} fill={arc.color} opacity={0.9}>
                  {arc.label}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Nodes ── */}
        {stages.map((stage, i) => {
          const x       = nodeX(i);
          const cfg     = STAGE_COLORS[i] ?? STAGE_COLORS[5];
          const done    = stage.status === 'completed';
          const active  = i === curIdx;
          const reached = done || active;
          const isHov   = hoveredNode === i;
          const icon    = STAGE_ICONS[i] ?? '○';

          return (
            <g key={stage.id}
              onMouseEnter={() => setHoveredNode(i)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: 'default' }}>

              {/* Pulsing ring on current active node */}
              {active && !isPaused && !isArbitrage && (
                <circle cx={x} cy={NODE_Y} r={NODE_R + 11}
                  fill="none" stroke={cfg.stroke} strokeWidth={2}
                  strokeDasharray="5 3" opacity={0.45} />
              )}

              {/* Stand-by ring */}
              {active && isPaused && (
                <circle cx={x} cy={NODE_Y} r={NODE_R + 11}
                  fill="none" stroke="#d97706" strokeWidth={2.5}
                  strokeDasharray="4 3" opacity={0.6} />
              )}

              {/* Arbitrage ring */}
              {active && isArbitrage && (
                <circle cx={x} cy={NODE_Y} r={NODE_R + 11}
                  fill="none" stroke="#9333ea" strokeWidth={2.5}
                  strokeDasharray="4 3" opacity={0.6} />
              )}

              {/* Glow */}
              {reached && (
                <circle cx={x} cy={NODE_Y} r={NODE_R + 5}
                  fill={cfg.stroke} opacity={isHov ? 0.1 : 0.05} />
              )}

              {/* Main circle */}
              <circle cx={x} cy={NODE_Y} r={NODE_R}
                fill={reached ? cfg.fill : '#f8fafc'}
                stroke={
                  active && isPaused ? '#d97706' :
                  active && isArbitrage ? '#9333ea' :
                  reached ? cfg.stroke : '#cbd5e1'
                }
                strokeWidth={active ? 3 : reached ? 2.5 : 1.5}
              />

              {/* Done checkmark overlay */}
              {done && (
                <circle cx={x + NODE_R - 5} cy={NODE_Y - NODE_R + 5} r={8}
                  fill={cfg.stroke} />
              )}
              {done && (
                <text x={x + NODE_R - 5} y={NODE_Y - NODE_R + 5}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={8} fontWeight={700} fill="white">✓</text>
              )}

              {/* Icon */}
              <text x={x} y={NODE_Y} textAnchor="middle" dominantBaseline="central"
                fontSize={14} fontWeight={700}
                fill={reached ? cfg.stroke : '#94a3b8'}>
                {icon}
              </text>

              {/* Stage title */}
              <text x={x} y={LABEL_Y} textAnchor="middle"
                fontSize={10} fontWeight={active ? 700 : reached ? 600 : 400}
                fill={active ? cfg.stroke : reached ? '#374151' : '#94a3b8'}>
                {stage.title}
              </text>

              {/* Stage status sub-label */}
              <text x={x} y={LABEL_Y + 14} textAnchor="middle"
                fontSize={8.5}
                fill={
                  done ? '#059669' :
                  active && isPaused ? '#d97706' :
                  active && isArbitrage ? '#9333ea' :
                  active ? cfg.stroke : '#cbd5e1'
                }>
                {done ? '✓ Terminée' :
                 active && isPaused ? '⏸ En pause' :
                 active && isArbitrage ? '⚖ Arbitrage' :
                 active ? '● En cours' : '○ En attente'}
              </text>

              {/* Tooltip on hover */}
              {isHov && reached && (
                <g>
                  <rect x={x - 80} y={NODE_Y - NODE_R - 52} width={160} height={44}
                    rx={6} fill="white" stroke={cfg.stroke} strokeWidth={1.5}
                    filter="drop-shadow(0 2px 4px rgba(0,0,0,0.12))" />
                  <text x={x} y={NODE_Y - NODE_R - 38} textAnchor="middle"
                    fontSize={9} fontWeight={700} fill={cfg.stroke}>
                    {stage.title}
                  </text>
                  <text x={x} y={NODE_Y - NODE_R - 24} textAnchor="middle"
                    fontSize={8} fill="#64748b">
                    {stage.workshop}
                    {stage.completed_at ? ` · ${formatDate(stage.completed_at)}` : ''}
                  </text>
                  {stage.notes && (
                    <text x={x} y={NODE_Y - NODE_R - 12} textAnchor="middle"
                      fontSize={7.5} fill="#94a3b8">
                      {stage.notes.slice(0, 40)}{stage.notes.length > 40 ? '…' : ''}
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* ── Selected arc detail ── */}
      {selectedArc && (() => {
        const isRet = selectedArc.isReturn;
        const ev = selectedArc.event;
        const p  = ev.payload || {};
        const from = stages[selectedArc.fromIdx];
        const to   = stages[selectedArc.toIdx];
        const recipientName = (p.validator || p.reviewer || p.responsible || '') as string;
        const taskTitle = ev.task?.title || (p.task_title as string) || '';
        const message   = (p.reason as string) || ev.message || '';
        const border = isRet ? 'border-red-200' : 'border-emerald-200';
        const bg     = isRet ? 'bg-red-50' : 'bg-emerald-50';
        const accent = isRet ? 'text-red-700' : 'text-emerald-700';
        const badge  = isRet ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800';
        return (
          <div className={`rounded-xl border ${border} ${bg} px-4 py-3 text-xs`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-bold text-sm ${accent}`}>
                    {selectedArc.label || (isRet ? 'Retour' : 'Soumission')}
                  </span>
                  <span className="text-gray-400">
                    {from?.title} → {to?.title}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${badge}`}>
                    {formatDate(ev.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-4 flex-wrap text-gray-700">
                  <span><span className="text-gray-400">Par </span><span className="font-semibold">{ev.actor_name}</span></span>
                  {recipientName && (
                    <span><span className="text-gray-400">Vers </span><span className="font-semibold">{recipientName}</span></span>
                  )}
                </div>
                {taskTitle && <p className="text-gray-500 italic truncate">{taskTitle}</p>}
                {message   && <p className={`${accent} font-medium`}>{message}</p>}
              </div>
              <button type="button" onClick={() => setSelectedArc(null)} title="Fermer"
                className="text-gray-400 hover:text-gray-600 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Action modals ────────────────────────────────────────────────────────────

function PauseModal({ onConfirm, onClose, loading }: {
  onConfirm: (reason: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <PauseCircle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h4 className="font-bold text-gray-900">Mettre en pause</h4>
            <p className="text-xs text-gray-400">La procédure sera suspendue temporairement</p>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Raison du stand-by <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Décrivez pourquoi la procédure est suspendue…"
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
          />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button type="button" disabled={!reason.trim() || loading}
            onClick={() => onConfirm(reason.trim())}
            className="flex-1 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'En cours…' : 'Confirmer la pause'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ArbitrageModal({ onConfirm, onClose, loading }: {
  onConfirm: (reason: string, escalatedTo: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [reason,      setReason]      = useState('');
  const [escalatedTo, setEscalatedTo] = useState('');
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
            <Gavel className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h4 className="font-bold text-gray-900">Demander un arbitrage</h4>
            <p className="text-xs text-gray-400">Escalade vers un décideur en cas de désaccord</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Motif du désaccord <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Décrivez le point de blocage ou de désaccord…"
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Escalade vers (nom ou fonction)
            </label>
            <input
              type="text"
              value={escalatedTo}
              onChange={e => setEscalatedTo(e.target.value)}
              placeholder="Ex : Directeur DOA, Comité de direction…"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button type="button" disabled={!reason.trim() || loading}
            onClick={() => onConfirm(reason.trim(), escalatedTo.trim())}
            className="flex-1 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'En cours…' : 'Déclencher l\'arbitrage'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResolveArbitrageModal({ onConfirm, onClose, loading }: {
  onConfirm: (resolution: string, resumeStatus: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [resolution,    setResolution]    = useState('');
  const [resumeStatus,  setResumeStatus]  = useState('En cours');
  const STATUSES = ['En cours', 'En validation', 'En révision', 'Validée'];
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h4 className="font-bold text-gray-900">Résoudre l&apos;arbitrage</h4>
            <p className="text-xs text-gray-400">Enregistrer la décision et reprendre</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Décision prise <span className="text-red-500">*</span>
            </label>
            <textarea
              value={resolution}
              onChange={e => setResolution(e.target.value)}
              placeholder="Décrivez la décision d'arbitrage…"
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Reprendre à l&apos;étape
            </label>
            <select value={resumeStatus} onChange={e => setResumeStatus(e.target.value)}
              title="Statut de reprise après arbitrage"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300">
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button type="button" disabled={!resolution.trim() || loading}
            onClick={() => onConfirm(resolution.trim(), resumeStatus)}
            className="flex-1 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'En cours…' : 'Valider et reprendre'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProcedureJourney({
  procedureId, procedureName, isAdmin, currentActorId, onClose,
}: Props) {
  const [events,          setEvents]          = useState<JourneyEvent[]>([]);
  const [stages,          setStages]          = useState<LifecycleStage[]>([]);
  const [currentStatus,   setCurrentStatus]   = useState<string | null>(null);
  const [pauseReason,     setPauseReason]      = useState<string | undefined>();
  const [arbitrageReason, setArbitrageReason]  = useState<string | undefined>();
  const [arbitrageEscTo,  setArbitrageEscTo]   = useState<string | undefined>();
  const [loading,         setLoading]          = useState(true);
  const [actionLoading,   setActionLoading]    = useState(false);
  const [error,           setError]            = useState<string | null>(null);
  const [selectedEvent,   setSelectedEvent]    = useState<JourneyEvent | null>(null);
  const [showPauseModal,      setShowPauseModal]      = useState(false);
  const [showArbitrageModal,  setShowArbitrageModal]  = useState(false);
  const [showResolveModal,    setShowResolveModal]     = useState(false);
  const [expandHistory,       setExpandHistory]        = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await orchestrationApi.getProcedureJourney(procedureId);
      setEvents(res.events);
      setStages(res.lifecycle_stages ?? []);
      setCurrentStatus(res.current_status ?? null);
      setPauseReason(res.pause_reason);
      setArbitrageReason(res.arbitrage_reason);
      setArbitrageEscTo(res.arbitrage_escalated_to);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement');
    } finally {
      setLoading(false);
    }
  }, [procedureId]);

  useEffect(() => { load(); }, [load]);

  const isPaused    = currentStatus === 'En pause';
  const isArbitrage = currentStatus === 'En arbitrage';
  const corrections = events.filter(e => e.event_type === 'correction_task_created').length;
  const statusChanges = events.filter(e => e.event_type === 'status_changed').length;
  const curIdx = stages.length > 0 ? currentStageIndex(stages, events, currentStatus) : -1;
  const curStage = curIdx >= 0 ? stages[curIdx] : null;

  const handlePause = async (reason: string) => {
    setActionLoading(true);
    try {
      await orchestrationApi.pauseProcedure(procedureId, reason, currentActorId);
      setShowPauseModal(false);
      await load();
    } catch (e) { /* silent */ } finally { setActionLoading(false); }
  };

  const handleResume = async () => {
    setActionLoading(true);
    try {
      await orchestrationApi.resumeProcedure(procedureId, currentActorId);
      await load();
    } catch (e) { /* silent */ } finally { setActionLoading(false); }
  };

  const handleArbitrage = async (reason: string, escalatedTo: string) => {
    setActionLoading(true);
    try {
      await orchestrationApi.requestArbitrage(procedureId, reason, currentActorId, escalatedTo || undefined);
      setShowArbitrageModal(false);
      await load();
    } catch (e) { /* silent */ } finally { setActionLoading(false); }
  };

  const handleResolveArbitrage = async (resolution: string, resumeStatus: string) => {
    setActionLoading(true);
    try {
      await orchestrationApi.resolveArbitrage(procedureId, resolution, resumeStatus, currentActorId);
      setShowResolveModal(false);
      await load();
    } catch (e) { /* silent */ } finally { setActionLoading(false); }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

          {/* Header */}
          <div className="shrink-0 px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 text-base">Parcours de la procédure</h3>
              <p className="text-sm text-gray-500 mt-0.5 truncate max-w-xl">{procedureName}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={load} title="Actualiser"
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" onClick={onClose} title="Fermer"
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Status banner — pause ou arbitrage */}
          {(isPaused || isArbitrage) && !loading && (
            <div className={`shrink-0 px-6 py-3 border-b flex items-center gap-3 ${
              isPaused ? 'bg-amber-50 border-amber-200' : 'bg-purple-50 border-purple-200'
            }`}>
              {isPaused
                ? <PauseCircle className="w-5 h-5 text-amber-600 shrink-0" />
                : <Gavel className="w-5 h-5 text-purple-600 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${isPaused ? 'text-amber-800' : 'text-purple-800'}`}>
                  {isPaused ? 'Procédure en pause (Stand-by)' : 'Arbitrage en cours'}
                </p>
                {(pauseReason || arbitrageReason) && (
                  <p className={`text-xs mt-0.5 truncate ${isPaused ? 'text-amber-600' : 'text-purple-600'}`}>
                    {isPaused ? pauseReason : arbitrageReason}
                    {isArbitrage && arbitrageEscTo && ` — escaladé vers : ${arbitrageEscTo}`}
                  </p>
                )}
              </div>
              {isAdmin && isPaused && (
                <button type="button" disabled={actionLoading}
                  onClick={handleResume}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50">
                  <PlayCircle className="w-3.5 h-3.5" />
                  Reprendre
                </button>
              )}
              {isAdmin && isArbitrage && (
                <button type="button" disabled={actionLoading}
                  onClick={() => setShowResolveModal(true)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Résoudre
                </button>
              )}
            </div>
          )}

          {/* Stats + actions */}
          {!loading && events.length > 0 && (
            <div className="shrink-0 flex items-center gap-0 border-b border-gray-200">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-px bg-gray-200 flex-1">
                {[
                  { label: 'Événements',        value: events.length,  color: 'text-gray-900' },
                  { label: 'Changements statut', value: statusChanges,  color: 'text-amber-700' },
                  { label: 'Corrections',        value: corrections,    color: 'text-red-600' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 px-4 py-2.5 text-center">
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-gray-400">{s.label}</p>
                  </div>
                ))}
              </div>
              {/* Current stage pill */}
              {curStage && (
                <div className="px-4 text-center shrink-0">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Position</p>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                    STAGE_COLORS[curIdx]?.bg ?? 'bg-gray-50'
                  } ${STAGE_COLORS[curIdx]?.text ?? 'text-gray-700'}`}
                    style={{ borderColor: STAGE_COLORS[curIdx]?.stroke ?? '#94a3b8' }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: STAGE_COLORS[curIdx]?.stroke ?? '#94a3b8' }} />
                    {curStage.title}
                  </span>
                </div>
              )}
              {/* Action buttons */}
              {isAdmin && !isPaused && !isArbitrage && (
                <div className="flex items-center gap-2 px-4 shrink-0">
                  <button type="button" disabled={actionLoading}
                    onClick={() => setShowPauseModal(true)}
                    title="Mettre en pause"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors disabled:opacity-50">
                    <PauseCircle className="w-3.5 h-3.5" />
                    Stand-by
                  </button>
                  <button type="button" disabled={actionLoading}
                    onClick={() => setShowArbitrageModal(true)}
                    title="Demander un arbitrage"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 text-xs font-semibold hover:bg-purple-100 transition-colors disabled:opacity-50">
                    <Gavel className="w-3.5 h-3.5" />
                    Arbitrage
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                <span className="text-sm">Chargement du parcours…</span>
              </div>
            ) : error ? (
              <div className="m-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
                <p className="text-sm">Aucun événement enregistré pour cette procédure.</p>
              </div>
            ) : (
              <div className="space-y-0">

                {/* Metro diagram */}
                {stages.length > 0 && (
                  <div className="px-6 pt-6 pb-4">
                    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-black text-gray-800">Trajectoire</h4>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Nœuds colorés = atteints · anneau pulsant = stade actuel · badge ✓ = complété
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] text-gray-400">
                          <span className="flex items-center gap-1.5">
                            <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#3b82f6" strokeWidth={3} strokeLinecap="round" /></svg>
                            Progression
                          </span>
                          <span className="flex items-center gap-1.5">
                            <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#059669" strokeWidth={2} strokeDasharray="5,4" /></svg>
                            Soumission
                          </span>
                          <span className="flex items-center gap-1.5">
                            <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#ef4444" strokeWidth={2} strokeDasharray="5,4" /></svg>
                            Retour
                          </span>
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                            Stand-by
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Gavel className="w-3 h-3 text-purple-500" />
                            Arbitrage
                          </span>
                        </div>
                      </div>
                      <div className="px-4 py-6 overflow-x-auto">
                        <MetroSvg events={events} stages={stages} currentStatus={currentStatus} />
                      </div>
                    </div>
                  </div>
                )}

                {/* History */}
                <div className="px-6 pb-6">
                  <button
                    type="button"
                    onClick={() => setExpandHistory(h => !h)}
                    className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 hover:text-gray-600 transition-colors"
                  >
                    {expandHistory
                      ? <ChevronDown className="w-3.5 h-3.5" />
                      : <ChevronRight className="w-3.5 h-3.5" />}
                    Historique chronologique ({events.length} événements)
                  </button>
                  {expandHistory && (
                    <div className="space-y-2">
                      {events.map((ev, i) => {
                        const isSelected = selectedEvent?.id === ev.id;
                        const colorCls   = EVENT_COLORS[ev.event_type] || 'bg-gray-100 text-gray-600';
                        const isPauseEv  = ev.event_type === 'procedure_paused';
                        const isArbEv    = ev.event_type === 'arbitrage_requested' || ev.event_type === 'arbitrage_resolved';
                        return (
                          <div key={ev.id}
                            onClick={() => setSelectedEvent(isSelected ? null : ev)}
                            className={`rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                              isPauseEv ? 'border-amber-200 bg-amber-50/60' :
                              isArbEv   ? 'border-purple-200 bg-purple-50/60' :
                              isSelected? 'border-blue-300 bg-blue-50' :
                              'border-gray-200 bg-white hover:border-gray-300'
                            }`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <span className="text-xs text-gray-400 shrink-0 w-5 text-right">{i + 1}</span>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${colorCls}`}>
                                  {EVENT_LABELS[ev.event_type] || ev.event_type}
                                </span>
                                {ev.from_status && ev.to_status && (
                                  <span className="text-xs text-gray-500 truncate">
                                    {ev.from_status} → <span className="font-semibold text-gray-800">{ev.to_status}</span>
                                  </span>
                                )}
                                {ev.message && !ev.from_status && (
                                  <span className="text-xs text-gray-600 truncate">{ev.message}</span>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-xs text-gray-500 font-medium">{ev.actor_name}</p>
                                <p className="text-xs text-gray-400">{formatDate(ev.created_at)}</p>
                                {ev.duration_from_previous_seconds !== null && (
                                  <p className="text-xs text-gray-300 flex items-center gap-0.5 justify-end">
                                    <Clock className="w-2.5 h-2.5" />
                                    +{formatDuration(ev.duration_from_previous_seconds)}
                                  </p>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <div className="mt-3 pt-3 border-t border-blue-200 space-y-2">
                                {ev.task && (
                                  <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
                                    <p className="text-xs text-gray-400 mb-1">Tâche associée</p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-semibold text-gray-900">{ev.task.title}</span>
                                      {ev.task.raci_role && (
                                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                                          {ev.task.raci_role}
                                        </span>
                                      )}
                                      {ev.task.assigned_to_name && (
                                        <span className="text-xs text-gray-500">→ {ev.task.assigned_to_name}</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {Object.keys(ev.payload || {}).length > 0 && (
                                  <div className="rounded-lg bg-gray-50 px-3 py-2">
                                    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                                      {Object.entries(ev.payload).map(([k, v]) =>
                                        v !== null && v !== undefined && String(v) !== '' ? (
                                          <span key={k} className="text-xs text-gray-500">
                                            <span className="text-gray-400">{k}:</span> {String(v)}
                                          </span>
                                        ) : null
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showPauseModal && (
        <PauseModal
          onConfirm={handlePause}
          onClose={() => setShowPauseModal(false)}
          loading={actionLoading}
        />
      )}
      {showArbitrageModal && (
        <ArbitrageModal
          onConfirm={handleArbitrage}
          onClose={() => setShowArbitrageModal(false)}
          loading={actionLoading}
        />
      )}
      {showResolveModal && (
        <ResolveArbitrageModal
          onConfirm={handleResolveArbitrage}
          onClose={() => setShowResolveModal(false)}
          loading={actionLoading}
        />
      )}
    </>
  );
}

'use client';

import { useMemo, useRef, useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { Procedure } from '@/lib/orchestrationApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolNode {
  id: string;
  color: string;
  procedureIds: string[];
  procedureInfo: Map<string, { nom: string; status: string }>;
  totalEtapes: number;
  x: number;
  y: number;
  r: number;
}

interface ToolEdge {
  source: string;
  target: string;
  shared: { id: string; nom: string; status: string }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CX = 380, CY = 290;
const LAYOUT_R = 220;
const MIN_R = 22, MAX_R = 60;

const PALETTE = [
  '#2563eb', '#7c3aed', '#0891b2', '#059669',
  '#dc2626', '#d97706', '#db2777', '#4f46e5',
  '#0d9488', '#65a30d', '#9333ea', '#e11d48',
];

const STATUS_COLOR: Record<string, string> = {
  'Validée':       '#10b981',
  'En validation': '#3b82f6',
  'En révision':   '#f59e0b',
  'En cours':      '#6366f1',
  'Brouillon':     '#94a3b8',
  'Rejetée':       '#ef4444',
  'Bloquée':       '#dc2626',
  'Retours reçus': '#f97316',
};

function toolColor(name: string, i: number): string {
  const l = name.toLowerCase();
  if (l.includes('swift'))           return '#1e40af';
  if (l.includes('ti+') || l.includes('tiplus')) return '#7c3aed';
  if (l.includes('nov@'))            return '#059669';
  if (l.includes('email') || l.includes('mail')) return '#d97706';
  if (l.includes('evolan'))          return '#0891b2';
  if (l.includes('docflow'))         return '#db2777';
  return PALETTE[i % PALETTE.length];
}

// ─── Graph builder ────────────────────────────────────────────────────────────

function buildGraph(procedures: Procedure[]): { nodes: ToolNode[]; edges: ToolEdge[] } {
  const toolMap = new Map<string, {
    pids: Set<string>;
    pinfo: Map<string, { nom: string; status: string }>;
    etapes: number;
  }>();

  for (const proc of procedures) {
    const steps = ((proc as any).workflow_json || []) as any[];
    for (const step of steps) {
      const outil = (step.outil || '').trim();
      if (!outil) continue;
      if (!toolMap.has(outil)) toolMap.set(outil, { pids: new Set(), pinfo: new Map(), etapes: 0 });
      const t = toolMap.get(outil)!;
      t.pids.add(proc.id);
      t.pinfo.set(proc.id, { nom: proc.nom, status: proc.status || '' });
      t.etapes++;
    }
  }

  const sorted = Array.from(toolMap.entries()).sort((a, b) => b[1].etapes - a[1].etapes);
  const maxEtapes = sorted[0]?.[1].etapes ?? 1;
  const n = sorted.length;

  const nodes: ToolNode[] = sorted.map(([name, data], i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    const r = MIN_R + (data.etapes / maxEtapes) * (MAX_R - MIN_R);
    return {
      id: name,
      color: toolColor(name, i),
      procedureIds: Array.from(data.pids),
      procedureInfo: data.pinfo,
      totalEtapes: data.etapes,
      x: CX + LAYOUT_R * Math.cos(angle),
      y: CY + LAYOUT_R * Math.sin(angle),
      r,
    };
  });

  const edges: ToolEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const shared = a.procedureIds
        .filter(pid => b.procedureIds.includes(pid))
        .map(pid => ({
          id: pid,
          nom: a.procedureInfo.get(pid)?.nom ?? pid,
          status: a.procedureInfo.get(pid)?.status ?? '',
        }));
      if (shared.length > 0) edges.push({ source: a.id, target: b.id, shared });
    }
  }

  return { nodes, edges };
}

function chordPath(sx: number, sy: number, tx: number, ty: number, pull = 0.38): string {
  const mx = (sx + tx) / 2 * (1 - pull) + CX * pull;
  const my = (sy + ty) / 2 * (1 - pull) + CY * pull;
  return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GrapheLiaisons({ procedures }: { procedures: Procedure[] }) {
  const { nodes, edges } = useMemo(() => buildGraph(procedures), [procedures]);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan,  setPan]  = useState({ x: 0, y: 0 });
  const panRef = useRef<{ on: boolean; lx: number; ly: number }>({ on: false, lx: 0, ly: 0 });

  const selectedNode   = nodes.find(n => n.id === selected) ?? null;
  const connectedEdges = selected ? edges.filter(e => e.source === selected || e.target === selected) : [];
  const connectedIds   = new Set(connectedEdges.flatMap(e => [e.source, e.target]));
  const maxShared      = Math.max(...edges.map(e => e.shared.length), 1);

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('.node-g')) return;
    panRef.current = { on: true, lx: e.clientX, ly: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!panRef.current.on) return;
    setPan(p => ({ x: p.x + e.clientX - panRef.current.lx, y: p.y + e.clientY - panRef.current.ly }));
    panRef.current = { ...panRef.current, lx: e.clientX, ly: e.clientY };
  };
  const onMouseUp = () => { panRef.current.on = false; };
  const onWheel   = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.25, Math.min(3, z * (e.deltaY < 0 ? 1.1 : 0.91))));
  };

  const hasData = nodes.length > 0;

  return (
    <div className="flex gap-4" style={{ height: 560 }}>

      {/* ── Graph canvas ── */}
      <div className="flex-1 bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden relative">

        <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
          <button type="button" title="Zoom avant" onClick={() => setZoom(z => Math.min(3, z * 1.15))}
            className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
            <ZoomIn className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <button type="button" title="Zoom arrière" onClick={() => setZoom(z => Math.max(0.25, z / 1.15))}
            className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
            <ZoomOut className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <button type="button" title="Réinitialiser la vue" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
            <RotateCcw className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>

        {hasData && (
          <div className="absolute top-3 left-3 z-10">
            <span className="px-3 py-1 bg-white/90 border border-gray-200 rounded-full text-xs text-gray-500 shadow-sm backdrop-blur-sm">
              {nodes.length} outils · {edges.length} liaison{edges.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {hasData && (
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 px-3 py-2 bg-white/90 border border-gray-100 rounded-xl shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-gray-300 rounded" />
              <span className="text-[10px] text-gray-400">1 proc.</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-1 bg-gray-400 rounded" />
              <span className="text-[10px] text-gray-400">{maxShared} proc.</span>
            </div>
            <div className="w-px h-3 bg-gray-200" />
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full border border-gray-400 bg-gray-100" />
              <span className="text-[10px] text-gray-400">taille ∝ étapes</span>
            </div>
          </div>
        )}

        {!hasData ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center">
              <span className="text-lg text-gray-300">○</span>
            </div>
            <p className="text-sm">Aucune donnée d&apos;outil dans les procédures</p>
          </div>
        ) : (
          <svg
            width="100%" height="100%"
            style={{ cursor: panRef.current.on ? 'grabbing' : 'grab', display: 'block' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
          >
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

              {/* Edges */}
              {edges.map((edge, i) => {
                const src = nodes.find(n => n.id === edge.source)!;
                const tgt = nodes.find(n => n.id === edge.target)!;
                const isHighlighted = !selected || (connectedIds.has(edge.source) && connectedIds.has(edge.target));
                const w = 1 + (edge.shared.length / maxShared) * 4.5;
                return (
                  <path
                    key={i}
                    d={chordPath(src.x, src.y, tgt.x, tgt.y)}
                    fill="none"
                    stroke={isHighlighted ? src.color : '#e2e8f0'}
                    strokeWidth={isHighlighted ? w : 0.8}
                    strokeOpacity={isHighlighted ? (selected ? 0.75 : 0.25) : 0.4}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-opacity 0.25s, stroke-width 0.25s, stroke 0.25s' }}
                  />
                );
              })}

              {/* Nodes */}
              {nodes.map(node => {
                const isSel    = node.id === selected;
                const isActive = !selected || connectedIds.has(node.id);
                const labelFits  = node.r >= 30;
                const shortName  = node.id.length > 11 ? node.id.slice(0, 10) + '…' : node.id;
                const bottomLabel = node.id.length > 16 ? node.id.slice(0, 15) + '…' : node.id;
                return (
                  <g
                    key={node.id}
                    className="node-g"
                    style={{ cursor: 'pointer', opacity: isActive ? 1 : 0.18, transition: 'opacity 0.25s' }}
                    onClick={() => setSelected(s => s === node.id ? null : node.id)}
                  >
                    {isSel && (
                      <circle cx={node.x} cy={node.y} r={node.r + 9}
                        fill="none" stroke={node.color} strokeWidth={1.5}
                        strokeDasharray="5 3" opacity={0.5}
                      />
                    )}
                    <circle cx={node.x} cy={node.y} r={node.r + 3}
                      fill={node.color} opacity={isSel ? 0.12 : 0.06}
                      style={{ transition: 'opacity 0.2s' }}
                    />
                    <circle cx={node.x} cy={node.y} r={node.r}
                      fill={node.color + '1a'}
                      stroke={node.color}
                      strokeWidth={isSel ? 2.5 : 1.5}
                      style={{ transition: 'stroke-width 0.2s' }}
                    />
                    {labelFits && (
                      <>
                        <text x={node.x} y={node.y - 5}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize={Math.min(12, node.r * 0.36)} fontWeight="700"
                          fill={node.color}
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {shortName}
                        </text>
                        <text x={node.x} y={node.y + 8}
                          textAnchor="middle" fontSize={8.5}
                          fill={node.color} opacity={0.65}
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {node.totalEtapes} ét.
                        </text>
                      </>
                    )}
                    {!labelFits && (
                      <text x={node.x} y={node.y}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={10} fontWeight="700" fill={node.color}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {node.id.slice(0, 3).toUpperCase()}
                      </text>
                    )}
                    <text x={node.x} y={node.y + node.r + 13}
                      textAnchor="middle" fontSize={10}
                      fontWeight={isSel ? '700' : '500'}
                      fill={isSel ? node.color : '#6b7280'}
                      style={{ pointerEvents: 'none', userSelect: 'none', transition: 'fill 0.2s' }}
                    >
                      {bottomLabel}
                    </text>
                    <text x={node.x} y={node.y + node.r + 25}
                      textAnchor="middle" fontSize={8.5} fill="#9ca3af"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {node.procedureIds.length} proc. · {node.totalEtapes} étapes
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>

      {/* ── Side panel ── */}
      <div className="w-72 flex flex-col gap-3 overflow-hidden">
        {!selectedNode ? (
          <div className="flex-1 bg-white border border-gray-200 rounded-2xl flex flex-col items-center justify-center text-center px-6 py-10 gap-4">
            <div className="w-14 h-14 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-dashed border-gray-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">Sélectionnez un outil</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Les liaisons indiquent les outils utilisés dans les mêmes procédures
              </p>
            </div>
            {nodes.length > 0 && (
              <div className="w-full border-t border-gray-100 pt-4 space-y-1.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Tous les outils</p>
                {nodes.slice(0, 8).map(n => (
                  <button
                    type="button"
                    key={n.id}
                    title={n.id}
                    onClick={() => setSelected(n.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-left transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: n.color }} />
                    <span className="text-xs text-gray-700 flex-1 truncate">{n.id}</span>
                    <span className="text-[10px] text-gray-400">{n.totalEtapes}</span>
                  </button>
                ))}
                {nodes.length > 8 && (
                  <p className="text-[10px] text-gray-400 text-center pt-1">+{nodes.length - 8} autres</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shrink-0">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: selectedNode.color }}
                >
                  {selectedNode.id.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{selectedNode.id}</p>
                  <p className="text-xs text-gray-400">
                    {selectedNode.procedureIds.length} procédures · {selectedNode.totalEtapes} étapes
                  </p>
                </div>
                <button
                  type="button"
                  title="Fermer"
                  onClick={() => setSelected(null)}
                  className="ml-auto shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-400 text-xs transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                  <p className="text-xl font-bold text-gray-800">{connectedEdges.length}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">liaison{connectedEdges.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                  <p className="text-xl font-bold text-gray-800">
                    {connectedEdges.reduce((s, e) => s + e.shared.length, 0)}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">proc. partagées</p>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 bg-white border border-gray-200 rounded-2xl overflow-y-auto">
              <div className="p-4 space-y-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Liaisons bijectives
                </p>
                {connectedEdges.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-xs text-gray-400">Aucune liaison avec d&apos;autres outils</p>
                  </div>
                ) : (
                  connectedEdges
                    .sort((a, b) => b.shared.length - a.shared.length)
                    .map(edge => {
                      const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                      const other   = nodes.find(n => n.id === otherId)!;
                      return (
                        <button
                          type="button"
                          key={otherId}
                          title={otherId}
                          className="w-full text-left rounded-xl border border-gray-100 hover:border-gray-200 p-3 transition-colors"
                          onClick={() => setSelected(otherId)}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                              style={{ backgroundColor: other.color }}
                            >
                              {other.id.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="text-xs font-semibold text-gray-700 flex-1 truncate">{other.id}</span>
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ backgroundColor: other.color + '18', color: other.color }}
                            >
                              {edge.shared.length} proc.
                            </span>
                          </div>
                          <div className="space-y-1 pl-8">
                            {edge.shared.map(p => (
                              <div key={p.id} className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: STATUS_COLOR[p.status] || '#94a3b8' }}
                                />
                                <span className="text-[10px] text-gray-500 truncate">{p.nom}</span>
                              </div>
                            ))}
                          </div>
                        </button>
                      );
                    })
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

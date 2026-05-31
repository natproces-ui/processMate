'use client';

import { useMemo, useRef, useState } from 'react';
import { RotateCcw, Search, ZoomIn, ZoomOut } from 'lucide-react';
import type { Procedure } from '@/lib/orchestrationApi';

// ─── Internal types ───────────────────────────────────────────────────────────

interface ToolData {
  name: string;
  color: string;
  procedures: ProcData[];
  totalEtapes: number;
  score: number;
}

interface ProcData {
  id: string;
  nom: string;
  status: string;
  etapes: EtapeData[];
}

interface EtapeData {
  id: string;
  nom: string;
  acteur: string;
}

interface ProcNode extends ProcData {
  angle: number;
  r: number;
  x: number;
  y: number;
  color: string;
  lx: number;   // label position x
  ly: number;   // label position y
  anchor: 'start' | 'middle' | 'end';
}

interface EtapeNode extends EtapeData {
  procId: string;
  procColor: string;
  x: number;
  y: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VW = 740, VH = 520;
const CX = VW / 2, CY = VH / 2;

const PROC_MIN_R = 13, PROC_MAX_R = 27;
const ETAPE_R    = 5;

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

const PALETTE = [
  '#2563eb', '#7c3aed', '#0891b2', '#059669',
  '#dc2626', '#d97706', '#db2777', '#4f46e5',
  '#0d9488', '#65a30d', '#9333ea', '#e11d48',
];

const KNOWN_TOOLS: [string, string][] = [
  ['swift',   '#1e40af'],
  ['ti+',     '#7c3aed'],
  ['tiplus',  '#7c3aed'],
  ['nov@',    '#059669'],
  ['email',   '#d97706'],
  ['mail',    '#d97706'],
  ['evolan',  '#0891b2'],
  ['docflow', '#db2777'],
];

function getToolColor(name: string, idx: number): string {
  const l = name.toLowerCase();
  for (const [key, color] of KNOWN_TOOLS) {
    if (l.includes(key)) return color;
  }
  return PALETTE[idx % PALETTE.length];
}

function getProcColor(status: string): string {
  return STATUS_COLOR[status] || '#6b7280';
}

// ─── Data extraction ──────────────────────────────────────────────────────────

function extractTools(procedures: Procedure[]): ToolData[] {
  const map = new Map<string, { procs: Map<string, ProcData>; totalEtapes: number }>();

  for (const proc of procedures) {
    const steps = ((proc as any).workflow_json || []) as any[];
    for (const step of steps) {
      const outil = (step.outil || '').trim();
      if (!outil) continue;
      if (!map.has(outil)) map.set(outil, { procs: new Map(), totalEtapes: 0 });
      const t = map.get(outil)!;
      if (!t.procs.has(proc.id)) {
        t.procs.set(proc.id, { id: proc.id, nom: proc.nom, status: proc.status || '', etapes: [] });
      }
      t.procs.get(proc.id)!.etapes.push({
        id: step.id || `${proc.id}-e${t.totalEtapes}`,
        nom: step.étape || step.etape || step.nom || '',
        acteur: step.acteur || '',
      });
      t.totalEtapes++;
    }
  }

  return Array.from(map.entries())
    .map(([name, data], i) => ({
      name,
      color: getToolColor(name, i),
      procedures: Array.from(data.procs.values()),
      totalEtapes: data.totalEtapes,
      score: data.procs.size * data.totalEtapes,
    }))
    .sort((a, b) => b.score - a.score);
}

// ─── Radial layout ────────────────────────────────────────────────────────────

function buildLayout(
  tool: ToolData,
): { toolR: number; procs: ProcNode[]; etapes: EtapeNode[] } {
  const n = tool.procedures.length;
  const maxE = Math.max(...tool.procedures.map(p => p.etapes.length), 1);

  const procLayoutR  = Math.min(190, 115 + n * 7);
  const etapeLayoutR = procLayoutR + Math.max(70, 105 - n * 2);
  const toolR        = Math.min(48, 28 + (tool.totalEtapes / 30) * 20);
  const slice        = n > 0 ? (2 * Math.PI) / n : 0;

  const procs: ProcNode[] = tool.procedures.map((proc, i) => {
    const angle  = slice * i - Math.PI / 2;
    const r      = PROC_MIN_R + (proc.etapes.length / maxE) * (PROC_MAX_R - PROC_MIN_R);
    const x      = CX + procLayoutR  * Math.cos(angle);
    const y      = CY + procLayoutR  * Math.sin(angle);
    const lx     = CX + (procLayoutR + r + 13) * Math.cos(angle);
    const ly     = CY + (procLayoutR + r + 13) * Math.sin(angle);
    const cosA   = Math.cos(angle);
    const anchor: 'start' | 'middle' | 'end' =
      cosA < -0.35 ? 'end' : cosA > 0.35 ? 'start' : 'middle';
    return { ...proc, angle, r, x, y, lx, ly, anchor, color: getProcColor(proc.status) };
  });

  const etapes: EtapeNode[] = [];
  for (const proc of procs) {
    const numE     = proc.etapes.length;
    const maxSpread = Math.min(slice * 0.72, Math.PI * 0.45);
    const spread   = numE <= 1 ? 0 : Math.min(maxSpread, numE * 0.2);

    proc.etapes.forEach((e, j) => {
      const ea = numE === 1
        ? proc.angle
        : proc.angle - spread / 2 + (j / (numE - 1)) * spread;
      etapes.push({
        ...e,
        procId:    proc.id,
        procColor: proc.color,
        x: CX + etapeLayoutR * Math.cos(ea),
        y: CY + etapeLayoutR * Math.sin(ea),
      });
    });
  }

  return { toolR, procs, etapes };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GrapheApplicatifs({
  procedures,
  onOpenProcedure,
}: {
  procedures: Procedure[];
  onOpenProcedure?: (id: string) => void;
}) {
  const tools = useMemo(() => extractTools(procedures), [procedures]);

  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [search,       setSearch]       = useState('');
  const [hoveredProc,  setHoveredProc]  = useState<string | null>(null);
  const [hoveredEtape, setHoveredEtape] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan,  setPan]  = useState({ x: 0, y: 0 });
  const panRef = useRef<{ on: boolean; lx: number; ly: number }>({ on: false, lx: 0, ly: 0 });

  const tool   = tools.find(t => t.name === selectedTool) ?? null;
  const layout = useMemo(() => tool ? buildLayout(tool) : null, [tool]);

  const filteredTools = useMemo(
    () => tools.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase())),
    [tools, search],
  );

  const maxScore         = tools[0]?.score || 1;
  const hoveredProcNode  = hoveredProc  ? layout?.procs.find(p => p.id === hoveredProc)  : null;
  const hoveredEtapeNode = hoveredEtape ? layout?.etapes.find(e => e.id === hoveredEtape) : null;

  const selectTool = (name: string) => {
    setSelectedTool(s => s === name ? null : name);
    setZoom(1); setPan({ x: 0, y: 0 });
    setHoveredProc(null); setHoveredEtape(null);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('.rn')) return;
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
    setZoom(z => Math.max(0.3, Math.min(3, z * (e.deltaY < 0 ? 1.1 : 0.91))));
  };

  return (
    <div className="flex gap-4" style={{ height: 560 }}>

      {/* ── Tool list ────────────────────────────────────────────── */}
      <div className="w-60 flex flex-col bg-white border border-gray-200 rounded-2xl overflow-hidden shrink-0">

        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Filtrer…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredTools.map((t, i) => {
            const isSel = selectedTool === t.name;
            const pct   = Math.round((t.score / maxScore) * 100);
            return (
              <button
                key={t.name}
                type="button"
                title={t.name}
                onClick={() => selectTool(t.name)}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-50 transition-colors ${
                  isSel ? 'bg-amber-50 border-l-2 border-l-amber-400' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  <span className={`text-xs font-semibold flex-1 truncate ${isSel ? 'text-amber-700' : 'text-gray-700'}`}>
                    {t.name}
                  </span>
                  <span className="text-[10px] text-gray-400 shrink-0">#{i + 1}</span>
                </div>
                <div className="flex items-center gap-2 pl-4">
                  <div className="flex-1 h-0.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: t.color + '99' }} />
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0 whitespace-nowrap">
                    {t.procedures.length}p · {t.totalEtapes}é
                  </span>
                </div>
              </button>
            );
          })}
          {filteredTools.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">Aucun outil</p>
          )}
        </div>

        {/* Status legend */}
        <div className="p-3 border-t border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Statuts procédures</p>
          <div className="space-y-1">
            {Object.entries(STATUS_COLOR).map(([s, c]) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c }} />
                <span className="text-[10px] text-gray-500 truncate">{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Canvas ───────────────────────────────────────────────── */}
      <div className="flex-1 rounded-2xl border border-gray-200 overflow-hidden relative" style={{ background: '#faf9f7' }}>

        {/* Zoom controls */}
        <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
          <button type="button" title="Zoom avant"
            onClick={() => setZoom(z => Math.min(3, z * 1.15))}
            className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
            <ZoomIn className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <button type="button" title="Zoom arrière"
            onClick={() => setZoom(z => Math.max(0.3, z / 1.15))}
            className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
            <ZoomOut className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <button type="button" title="Réinitialiser la vue"
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
            <RotateCcw className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>

        {/* Hover info */}
        {(hoveredProcNode || hoveredEtapeNode) && (
          <div className="absolute bottom-3 left-3 z-10 px-3 py-2 bg-white/95 border border-gray-200 rounded-xl shadow-sm backdrop-blur-sm max-w-[230px]">
            {hoveredProcNode && (
              <>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hoveredProcNode.color }} />
                  <span className="text-xs font-semibold text-gray-800 truncate">{hoveredProcNode.nom}</span>
                </div>
                <p className="text-[10px] text-gray-400 pl-3.5">
                  {hoveredProcNode.status} · {hoveredProcNode.etapes.length} étape{hoveredProcNode.etapes.length > 1 ? 's' : ''}
                  {onOpenProcedure && <span className="ml-1 text-blue-400">— clic pour ouvrir</span>}
                </p>
              </>
            )}
            {hoveredEtapeNode && (
              <>
                <p className="text-xs font-semibold text-gray-800 truncate">
                  {hoveredEtapeNode.nom || '(étape sans nom)'}
                </p>
                {hoveredEtapeNode.acteur && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{hoveredEtapeNode.acteur}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Stats overlay */}
        {tool && layout && (
          <div className="absolute top-3 left-3 z-10">
            <span className="px-3 py-1 bg-white/90 border border-gray-200 rounded-full text-xs text-gray-500 shadow-sm backdrop-blur-sm">
              {tool.procedures.length} procédure{tool.procedures.length > 1 ? 's' : ''} · {tool.totalEtapes} étape{tool.totalEtapes > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {!tool ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="relative w-28 h-28">
              {/* Dashed outer ring */}
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-amber-200" />
              {/* Inner ring */}
              <div className="absolute inset-4 rounded-full border border-amber-100" />
              {/* Center */}
              <div className="absolute inset-8 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-amber-300" />
              </div>
              {/* Satellite dots */}
              {[0, 60, 120, 180, 240, 300].map(deg => (
                <div
                  key={deg}
                  className="absolute w-3.5 h-3.5 rounded-full bg-gray-100 border border-gray-200"
                  style={{
                    left:      `${50 + 46 * Math.cos((deg - 90) * Math.PI / 180)}%`,
                    top:       `${50 + 46 * Math.sin((deg - 90) * Math.PI / 180)}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              ))}
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-500">Sélectionnez un outil</p>
              <p className="text-xs text-gray-400 mt-1 max-w-[220px] leading-relaxed">
                L&apos;arbre radial affichera ses procédures (1er anneau) et étapes (2e anneau)
              </p>
            </div>
          </div>

        ) : layout ? (
          <svg
            width="100%" height="100%"
            viewBox={`0 0 ${VW} ${VH}`}
            style={{ cursor: panRef.current.on ? 'grabbing' : 'grab', display: 'block' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
          >
            <defs>
              <radialGradient id="rg-tool" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#fef9c3" />
                <stop offset="100%" stopColor="#fef3c7" />
              </radialGradient>
            </defs>

            {/* Zoom around center: translate(pan + CX*(1-z), pan + CY*(1-z)) scale(z) */}
            <g transform={`translate(${pan.x + CX * (1 - zoom)},${pan.y + CY * (1 - zoom)}) scale(${zoom})`}>

              {/* proc → etape lines (dashed) */}
              {layout.procs.map(proc =>
                layout.etapes
                  .filter(e => e.procId === proc.id)
                  .map(et => (
                    <line
                      key={`pe-${et.id}`}
                      x1={proc.x} y1={proc.y} x2={et.x} y2={et.y}
                      stroke={proc.color}
                      strokeWidth={hoveredProc === proc.id ? 1.4 : 0.8}
                      strokeOpacity={hoveredProc === proc.id ? 0.45 : 0.2}
                      strokeDasharray="3 2.5"
                      style={{ transition: 'stroke-width 0.12s, stroke-opacity 0.12s' }}
                    />
                  ))
              )}

              {/* center → proc lines (solid) */}
              {layout.procs.map(proc => (
                <line
                  key={`cp-${proc.id}`}
                  x1={CX} y1={CY} x2={proc.x} y2={proc.y}
                  stroke={proc.color}
                  strokeWidth={hoveredProc === proc.id ? 2 : 1.1}
                  strokeOpacity={hoveredProc === proc.id ? 0.65 : 0.3}
                  style={{ transition: 'stroke-width 0.12s, stroke-opacity 0.12s' }}
                />
              ))}

              {/* Etape nodes */}
              {layout.etapes.map((et, idx) => {
                const isHov = hoveredEtape === et.id;
                return (
                  <g
                    key={`${et.procId}-${et.id}-${idx}`}
                    className="rn"
                    style={{ cursor: 'default' }}
                    onMouseEnter={() => { setHoveredEtape(et.id); setHoveredProc(null); }}
                    onMouseLeave={() => setHoveredEtape(null)}
                  >
                    {/* Hit area */}
                    <circle cx={et.x} cy={et.y} r={ETAPE_R + 5} fill="transparent" />
                    <circle
                      cx={et.x} cy={et.y} r={ETAPE_R}
                      fill={et.procColor + '22'}
                      stroke={et.procColor}
                      strokeWidth={isHov ? 1.5 : 1}
                      opacity={isHov ? 1 : 0.65}
                      style={{ transition: 'opacity 0.12s, stroke-width 0.12s' }}
                    />
                  </g>
                );
              })}

              {/* Procedure nodes */}
              {layout.procs.map(proc => {
                const isHov  = hoveredProc === proc.id;
                const label  = proc.nom.length > 18 ? proc.nom.slice(0, 17) + '…' : proc.nom;
                return (
                  <g
                    key={proc.id}
                    className="rn"
                    style={{ cursor: onOpenProcedure ? 'pointer' : 'default' }}
                    onMouseEnter={() => { setHoveredProc(proc.id); setHoveredEtape(null); }}
                    onMouseLeave={() => setHoveredProc(null)}
                    onClick={() => onOpenProcedure?.(proc.id)}
                  >
                    {/* Glow */}
                    <circle cx={proc.x} cy={proc.y} r={proc.r + 7}
                      fill={proc.color} opacity={isHov ? 0.1 : 0.04}
                      style={{ transition: 'opacity 0.12s' }}
                    />
                    {/* Circle */}
                    <circle cx={proc.x} cy={proc.y} r={proc.r}
                      fill={proc.color + '20'}
                      stroke={proc.color}
                      strokeWidth={isHov ? 2.5 : 1.5}
                      style={{ transition: 'stroke-width 0.12s' }}
                    />
                    {/* Etape count */}
                    <text
                      x={proc.x} y={proc.y}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={9} fontWeight="700"
                      fill={proc.color}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {proc.etapes.length}
                    </text>
                    {/* Label — placed radially outside */}
                    <text
                      x={proc.lx} y={proc.ly}
                      textAnchor={proc.anchor}
                      dominantBaseline="middle"
                      fontSize={8.5}
                      fontWeight={isHov ? '600' : '400'}
                      fill={isHov ? proc.color : '#6b7280'}
                      style={{ pointerEvents: 'none', userSelect: 'none', transition: 'fill 0.12s' }}
                    >
                      {label}
                    </text>
                  </g>
                );
              })}

              {/* Tool node — center */}
              <g className="rn">
                <circle cx={CX} cy={CY} r={layout.toolR + 15} fill="#f59e0b" opacity={0.06} />
                <circle cx={CX} cy={CY} r={layout.toolR + 7}
                  fill="none" stroke="#f59e0b" strokeWidth={1.5}
                  strokeDasharray="5 3" opacity={0.35}
                />
                <circle cx={CX} cy={CY} r={layout.toolR}
                  fill="url(#rg-tool)" stroke="#f59e0b" strokeWidth={2.5}
                />
                <text
                  x={CX} y={CY - 7}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={Math.min(13, layout.toolR * 0.38)}
                  fontWeight="800" fill="#92400e"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {tool.name.length > 12 ? tool.name.slice(0, 11) + '…' : tool.name}
                </text>
                <text
                  x={CX} y={CY + 8}
                  textAnchor="middle" fontSize={7.5}
                  fill="#b45309" opacity={0.8}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {tool.procedures.length} proc. · {tool.totalEtapes} ét.
                </text>
              </g>

            </g>
          </svg>
        ) : null}
      </div>
    </div>
  );
}

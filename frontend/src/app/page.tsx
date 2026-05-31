'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import {
  Zap, ChevronRight, ArrowLeft, GripVertical,
  PenLine, Upload, Mic,
  Pencil, CheckSquare, GitBranch, Workflow,
  LayoutDashboard, ListChecks, Users,
  AlertTriangle, BarChart2, Shield, Map as MapIcon, BrainCircuit,
  Code2, AlignLeft, Table2,
  Gauge, Settings2, FileText, Megaphone, List,
} from 'lucide-react';
import {
  DndContext, type DragEndEvent,
  PointerSensor, useSensor, useSensors,
  useDraggable,
} from '@dnd-kit/core';

// ─── Types ────────────────────────────────────────────────────

type Option = { label: string; desc: string; href: string; icon: React.ReactNode };
type Group  = {
  label: string;
  icon: React.ReactNode;
  tileBg: string;
  ringBorder: string;
  ringText: string;
  options: Option[];
};
type Module = {
  id: string;
  name: string;
  tagline: string;
  iconBg: string;
  icon: React.ReactNode;
  activeRing: string;
  activeBg: string;
  activeDot: string;
  groups: Group[];
};

// ─── Data ─────────────────────────────────────────────────────

const ic = 'w-4 h-4';

const MODULES: Module[] = [
  {
    id: 'processmate',
    name: 'ProcessMate',
    tagline: 'Formaliser, gérer et piloter vos procédures métier',
    iconBg: 'bg-blue-50',
    icon: <Workflow className="w-7 h-7 text-blue-600" />,
    activeRing: 'border-blue-300',
    activeBg: 'bg-blue-50',
    activeDot: 'bg-blue-500',
    groups: [
      {
        label: 'Formaliser vos procédures',
        icon: <PenLine className={ic} />,
        tileBg: 'bg-blue-50',
        ringBorder: 'border-blue-200',
        ringText: 'text-blue-600',
        options: [
          { label: 'Partir de zéro',            desc: 'Dessiner votre procédure dans le Studio BPMN vide',   href: '/orchestration?module=stt', icon: <PenLine className={ic} /> },
          { label: 'Partir de documents',        desc: 'Extraire la procédure depuis un PDF, Word ou texte', href: '/orchestration?module=stt', icon: <Upload className={ic} />  },
          { label: "Partir d'un enregistrement", desc: 'Transcrire une procédure dictée au micro',           href: '/orchestration?module=stt', icon: <Mic className={ic} />     },
        ],
      },
      {
        label: 'Gérer vos procédures',
        icon: <Settings2 className={ic} />,
        tileBg: 'bg-sky-50',
        ringBorder: 'border-sky-200',
        ringText: 'text-sky-600',
        options: [
          { label: 'Liste des procédures',   desc: 'Consulter toutes les procédures et leur statut',   href: '/orchestration?tab=procedures', icon: <List className={ic} />        },
          { label: 'Modifier une procédure', desc: 'Ouvrir et éditer une procédure existante',         href: '/orchestration?tab=procedures', icon: <Pencil className={ic} />      },
          { label: 'Valider',                desc: 'Soumettre une procédure au circuit de validation', href: '/orchestration?tab=validation', icon: <CheckSquare className={ic} /> },
          { label: 'Suivre le pipeline',     desc: "Visualiser l'avancement global des procédures",    href: '/orchestration?tab=pipeline',   icon: <GitBranch className={ic} />   },
          { label: 'Gérer les flux',         desc: 'Orchestrer les étapes et acteurs du flux',         href: '/orchestration?tab=workflow',   icon: <Workflow className={ic} />    },
          { label: 'Campagnes',              desc: 'Lancer et suivre des campagnes de formalisation',  href: '/orchestration?tab=campaigns',  icon: <Megaphone className={ic} />   },
        ],
      },
      {
        label: 'Piloter les tâches',
        icon: <Gauge className={ic} />,
        tileBg: 'bg-indigo-50',
        ringBorder: 'border-indigo-200',
        ringText: 'text-indigo-600',
        options: [
          { label: 'Tableau de bord',            desc: 'Vue globale et KPIs de vos procédures',      href: '/orchestration?tab=dashboard', icon: <LayoutDashboard className={ic} /> },
          { label: 'Suivre les tâches',          desc: 'Suivi des tâches par acteur et procédure',   href: '/orchestration?tab=tasks',     icon: <ListChecks className={ic} />      },
          { label: 'Définir les responsabilités',desc: 'Visualiser et éditer la matrice RACI',       href: '/orchestration?tab=raci',      icon: <Users className={ic} />           },
        ],
      },
      {
        label: 'Analyser les processus',
        icon: <BrainCircuit className={ic} />,
        tileBg: 'bg-violet-50',
        ringBorder: 'border-violet-200',
        ringText: 'text-violet-600',
        options: [
          { label: 'Identifier les irritants', desc: 'Repérer et prioriser les points de friction',          href: '/orchestration?tab=irritants',         icon: <AlertTriangle className={ic} />   },
          { label: 'Mesurer la complexité',    desc: 'Évaluer la complexité et les risques par procédure',   href: '/orchestration?tab=complexity',        icon: <BarChart2 className={ic} />       },
          { label: "Analyser l'impact",        desc: 'Évaluer la conformité et les impacts réglementaires',  href: '/orchestration?tab=regulatory-impact', icon: <Shield className={ic} />          },
          { label: 'Cartographier les apps',   desc: 'Visualiser les systèmes et applications liés',        href: '/orchestration?tab=applicatifs',       icon: <MapIcon className={ic} />         },
          { label: 'Analyse IA',               desc: "Obtenir une analyse intelligente de vos processus",   href: '/orchestration?tab=analysis',          icon: <BrainCircuit className={ic} />    },
          { label: 'Carte BIAN',               desc: 'Explorer le référentiel BIAN Service Landscape v4.0', href: '/orchestration?tab=bian',              icon: <FileText className={ic} />        },
        ],
      },
    ],
  },
  {
    id: 'clinic',
    name: 'Clinic',
    tagline: 'Extraire la logique métier depuis des codes legacy et documents',
    iconBg: 'bg-teal-50',
    icon: <Code2 className="w-7 h-7 text-teal-600" />,
    activeRing: 'border-teal-300',
    activeBg: 'bg-teal-50',
    activeDot: 'bg-teal-500',
    groups: [
      {
        label: 'Extraire la logique métier',
        icon: <Code2 className={ic} />,
        tileBg: 'bg-teal-50',
        ringBorder: 'border-teal-200',
        ringText: 'text-teal-600',
        options: [
          { label: 'Analyse du code', desc: 'Extraire la logique depuis du code legacy : COBOL, ABAP, WinDev…', href: '/clinic?mode=flowchart', icon: <Code2 className={ic} /> },
        ],
      },
    ],
  },
  {
    id: 'sfd',
    name: 'SFD Generator',
    tagline: 'Produire des spécifications fonctionnelles détaillées à partir de vos sources',
    iconBg: 'bg-amber-50',
    icon: <AlignLeft className="w-7 h-7 text-amber-600" />,
    activeRing: 'border-amber-300',
    activeBg: 'bg-amber-50',
    activeDot: 'bg-amber-500',
    groups: [
      {
        label: 'Créer un SFD',
        icon: <AlignLeft className={ic} />,
        tileBg: 'bg-amber-50',
        ringBorder: 'border-amber-200',
        ringText: 'text-amber-600',
        options: [
          { label: 'Depuis fichiers / URLs', desc: 'Analyser des documents ou pages web pour rédiger le SFD', href: '/orchestration?module=sfd', icon: <Upload className={ic} />    },
          { label: 'Depuis une description', desc: 'Décrire le besoin en texte libre et générer le document', href: '/orchestration?module=sfd', icon: <AlignLeft className={ic} /> },
        ],
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────

function bezierH(fx: number, fy: number, tx: number, ty: number): string {
  const mx = (fx + tx) / 2;
  return `M${fx},${fy} C${mx},${fy} ${mx},${ty} ${tx},${ty}`;
}

function initPositions(): Map<string, { x: number; y: number }> {
  return new Map(MODULES.map((m, i) => [m.id, { x: 0, y: i * 86 }]));
}

// ─── Draggable module card ─────────────────────────────────────

type CardProps = {
  mod: Module;
  pos: { x: number; y: number };
  isActive: boolean;
  onClick: () => void;
  onRef: (el: HTMLElement | null) => void;
};

function DraggableModuleCard({ mod, pos, isActive, onClick, onRef }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: mod.id });

  const x = pos.x + (transform?.x ?? 0);
  const y = pos.y + (transform?.y ?? 0);

  return (
    <div
      ref={el => { setNodeRef(el); onRef(el); }}
      style={{ position: 'absolute', left: x, top: y, width: 220, zIndex: isDragging ? 30 : 10 }}
    >
      <div className={`flex items-center rounded-xl border transition-all ${
        isActive
          ? `${mod.activeRing} ${mod.activeBg} shadow-sm`
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      } ${isDragging ? 'shadow-xl' : ''}`}>
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="pl-3 pr-1 py-3 cursor-grab active:cursor-grabbing text-gray-200 hover:text-gray-400 shrink-0 transition-colors touch-none"
          title="Déplacer"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        {/* Click zone */}
        <button
          type="button"
          onClick={onClick}
          className="flex items-center gap-2.5 flex-1 py-3 pr-3 text-left"
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${mod.iconBg}`}>
            {mod.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 leading-tight line-clamp-2">{mod.tagline}</p>
            <p className="text-sm font-semibold text-gray-800 leading-tight mt-1">{mod.name}</p>
          </div>
          {isActive
            ? <div className={`w-1.5 h-1.5 rounded-full ${mod.activeDot} shrink-0`} />
            : <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
          }
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

type SvgPath = { d: string; key: string };


export default function Home() {
  const { user, loading: authLoading } = useAuth();


  const [mode, setMode] = useState<'grid' | 'tree'>('grid');
  const [activeModuleIds, setActiveModuleIds]   = useState<Set<string>>(new Set());
  const [activeGroupLabels, setActiveGroupLabels] = useState<Set<string>>(new Set());
  const [modulePositions, setModulePositions]   = useState<Map<string, { x: number; y: number }>>(initPositions);

  const containerRef = useRef<HTMLDivElement>(null);
  const moduleRefs   = useRef<Map<string, HTMLElement>>(new Map());
  const groupRefs    = useRef<Map<string, HTMLElement>>(new Map());
  const optionRefs   = useRef<Map<string, HTMLElement>>(new Map());

  const [svgPaths, setSvgPaths] = useState<SvgPath[]>([]);
  const [svgSize, setSvgSize]   = useState({ w: 0, h: 0 });

  // Canvas height — grows with content and drag positions
  const canvasHeight = useMemo(() => {
    const maxModY = Math.max(...MODULES.map(m => modulePositions.get(m.id)?.y ?? 0));
    const activeGroupCount = MODULES.filter(m => activeModuleIds.has(m.id))
      .reduce((s, m) => s + m.groups.length, 0);
    const activeOptCount = MODULES.flatMap(m => m.groups)
      .filter(g => activeGroupLabels.has(g.label))
      .reduce((s, g) => s + g.options.length, 0);
    const rightH = Math.max(activeGroupCount * 62, activeOptCount * 84);
    return Math.max(maxModY + 140, rightH + 160, 420);
  }, [modulePositions, activeModuleIds, activeGroupLabels]);

  const recalc = useCallback(() => {
    const container = containerRef.current;
    if (!container || mode !== 'tree') return;

    const cr = container.getBoundingClientRect();
    setSvgSize({ w: cr.width, h: cr.height });

    const paths: SvgPath[] = [];

    activeModuleIds.forEach(moduleId => {
      const modEl = moduleRefs.current.get(moduleId);
      const activeMod = MODULES.find(m => m.id === moduleId);
      if (!modEl || !activeMod) return;

      const mr = modEl.getBoundingClientRect();
      const fx = mr.right  - cr.left;
      const fy = mr.top    - cr.top + mr.height / 2;

      activeMod.groups.forEach(group => {
        const grpEl = groupRefs.current.get(group.label);
        if (!grpEl) return;
        const gr = grpEl.getBoundingClientRect();
        const tx = gr.left - cr.left;
        const ty = gr.top  - cr.top + gr.height / 2;
        paths.push({ d: bezierH(fx, fy, tx, ty), key: `mg-${moduleId}-${group.label}` });

        if (activeGroupLabels.has(group.label)) {
          group.options.forEach(opt => {
            const optEl = optionRefs.current.get(`${group.label}:${opt.label}`);
            if (!optEl) return;
            const or = optEl.getBoundingClientRect();
            paths.push({
              d: bezierH(gr.right - cr.left, ty, or.left - cr.left, or.top - cr.top + or.height / 2),
              key: `go-${group.label}-${opt.label}`,
            });
          });
        }
      });
    });

    setSvgPaths(paths);
  }, [mode, activeModuleIds, activeGroupLabels]);

  useEffect(() => {
    const r = requestAnimationFrame(recalc);
    const t = setTimeout(recalc, 260);
    return () => { cancelAnimationFrame(r); clearTimeout(t); };
  }, [recalc]);

  useEffect(() => {
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [recalc]);

  // ── Drag ──────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragMove = useCallback(() => {
    requestAnimationFrame(recalc);
  }, [recalc]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, delta } = event;
    setModulePositions(prev => {
      const next = new Map(prev);
      const p = next.get(active.id as string) ?? { x: 0, y: 0 };
      next.set(active.id as string, { x: p.x + delta.x, y: p.y + delta.y });
      return next;
    });
    setTimeout(recalc, 30);
  }, [recalc]);

  // ── Module / group toggles ────────────────────────────────────
  const handleModuleClick = (moduleId: string) => {
    if (mode === 'grid') setMode('tree');
    setActiveModuleIds(prev => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
        const mod = MODULES.find(m => m.id === moduleId);
        setActiveGroupLabels(prevG => {
          const nextG = new Set(prevG);
          mod?.groups.forEach(g => nextG.delete(g.label));
          return nextG;
        });
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const handleGroupClick = (label: string) => {
    setActiveGroupLabels(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const goGrid = () => {
    setMode('grid');
    setActiveModuleIds(new Set());
    setActiveGroupLabels(new Set());
    setModulePositions(initPositions());
  };

  // Active modules sorted by current y position (visual order for group column)
  const activeModulesSorted = MODULES
    .filter(m => activeModuleIds.has(m.id))
    .sort((a, b) => (modulePositions.get(a.id)?.y ?? 0) - (modulePositions.get(b.id)?.y ?? 0));

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <button type="button" onClick={goGrid} className="flex items-center gap-2 cursor-pointer">
            <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-900">ProcessMate</span>
          </button>

          {mode === 'tree' && (
            <nav className="flex items-center gap-1.5 text-xs text-gray-400 animate-fade-in-up">
              <button type="button" onClick={goGrid} className="hover:text-gray-700 transition-colors">Accueil</button>
              {activeModuleIds.size > 0 && (
                <><span>/</span>
                <span className="text-gray-700 font-medium">
                  {activeModuleIds.size} module{activeModuleIds.size > 1 ? 's' : ''} ouvert{activeModuleIds.size > 1 ? 's' : ''}
                </span></>
              )}
            </nav>
          )}

          <nav className="flex items-center gap-2">
            {!authLoading && (
              user
                ? <Link href="/orchestration" className="px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm">Mon espace →</Link>
                : <Link href="/auth/login" className="px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm">Se connecter</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6">

        {/* ── Grid mode ── */}
        {mode === 'grid' && (
          <div className="animate-fade-in-up">
            <section className="pt-16 pb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-xs font-semibold text-blue-600 mb-6">
                <Zap className="w-3 h-3" />
                Plateforme de gestion des procédures métier
              </div>
              <h1 className="text-5xl font-extrabold text-gray-900 leading-tight mb-3">
                Que souhaitez-vous<br />faire ?
              </h1>
              <p className="text-base text-gray-500 max-w-lg">
                Choisissez un module et explorez ses fonctionnalités.
              </p>
            </section>

            <section className="pb-12">
              <div className="grid md:grid-cols-3 gap-5">
                {MODULES.map(mod => (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => handleModuleClick(mod.id)}
                    className="text-left rounded-2xl border-2 border-gray-100 bg-white p-7 hover:border-blue-200 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 group"
                  >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${mod.iconBg} mb-5`}>
                      {mod.icon}
                    </div>
                    <p className="text-base font-bold text-gray-900 leading-relaxed mb-3">{mod.tagline}</p>
                    <p className="text-2xl font-extrabold text-gray-400">{mod.name}</p>
                    <div className="mt-5 flex items-center gap-1 text-sm font-semibold text-gray-400 group-hover:text-blue-500 transition-colors">
                      Explorer <ChevronRight className="w-4 h-4" />
                    </div>
                  </button>
                ))}
              </div>

              <Link
                href="/scv-test"
                className="mt-5 flex items-center justify-between rounded-2xl border-2 border-emerald-100 bg-emerald-50/60 px-7 py-5 hover:border-emerald-200 hover:shadow-md transition-all duration-200 group"
              >
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Table2 className="w-7 h-7 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-gray-900">Générez et validez vos fichiers SCV pour les transactions bancaires</p>
                    <p className="text-2xl font-extrabold text-gray-400 mt-1">ScvMaker</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm font-semibold text-emerald-600 group-hover:text-emerald-700 whitespace-nowrap ml-6 transition-colors">
                  Accéder <ChevronRight className="w-4 h-4" />
                </div>
              </Link>
            </section>
          </div>
        )}

        {/* ── Tree mode ── */}
        {mode === 'tree' && (
          <div className="pt-10 pb-16 animate-fade-in-up">
            <button
              type="button"
              onClick={goGrid}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mb-8"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Retour à l'accueil
            </button>

            {/* Canvas */}
            <DndContext sensors={sensors} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
              <div
                ref={containerRef}
                className="relative"
                style={{ height: canvasHeight }}
              >
                {/* SVG connectors */}
                <svg
                  className="absolute inset-0 pointer-events-none overflow-visible"
                  width={svgSize.w || '100%'}
                  height={svgSize.h || '100%'}
                  aria-hidden
                >
                  {svgPaths.map(p => (
                    <path
                      key={p.key}
                      d={p.d}
                      fill="none"
                      stroke="#cbd5e1"
                      strokeWidth="1.5"
                      strokeDasharray="5 4"
                    />
                  ))}
                </svg>

                {/* Module cards — freely draggable */}
                {MODULES.map(mod => (
                  <DraggableModuleCard
                    key={mod.id}
                    mod={mod}
                    pos={modulePositions.get(mod.id) ?? { x: 0, y: 0 }}
                    isActive={activeModuleIds.has(mod.id)}
                    onClick={() => handleModuleClick(mod.id)}
                    onRef={el => {
                      if (el) moduleRefs.current.set(mod.id, el);
                      else moduleRefs.current.delete(mod.id);
                    }}
                  />
                ))}

                {/* ScvMaker — fixed at bottom of module zone */}
                <div className="absolute left-0 top-[270px] w-[220px] z-10">
                  <Link
                    href="/scv-test"
                    className="flex items-center gap-2.5 px-3 py-3 rounded-xl border border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm transition-all"
                  >
                    <span className="w-3.5 shrink-0" />
                    <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Table2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <span className="text-sm font-semibold text-gray-500 flex-1">ScvMaker</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  </Link>
                </div>

                {/* Column 2 — Groups (sorted by module y position) */}
                {activeModuleIds.size > 0 && (
                  <div className="absolute top-0 left-60 flex flex-col gap-2.5 z-10">
                    {activeModulesSorted.flatMap(mod =>
                      mod.groups.map(group => (
                        <button
                          key={`${mod.id}-${group.label}`}
                          type="button"
                          ref={el => {
                            if (el) groupRefs.current.set(group.label, el);
                            else groupRefs.current.delete(group.label);
                          }}
                          onClick={() => handleGroupClick(group.label)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all w-48 text-left ${
                            activeGroupLabels.has(group.label)
                              ? `${group.ringBorder} ${group.tileBg} shadow-sm`
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                          }`}
                        >
                          <span className={`shrink-0 ${activeGroupLabels.has(group.label) ? group.ringText : 'text-gray-400'}`}>
                            {group.icon}
                          </span>
                          <span className="text-sm font-medium text-gray-800 flex-1 text-left">{group.label}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">{group.options.length}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {/* Column 3 — Options */}
                {activeGroupLabels.size > 0 && (
                  <div className="absolute top-0 left-[472px] flex flex-col gap-2.5 z-10">
                    {MODULES.flatMap(mod =>
                      mod.groups
                        .filter(g => activeGroupLabels.has(g.label))
                        .flatMap(group =>
                          group.options.map(opt => {
                            const refKey = `${group.label}:${opt.label}`;
                            return (
                              <div
                                key={refKey}
                                ref={el => {
                                  if (el) optionRefs.current.set(refKey, el);
                                  else optionRefs.current.delete(refKey);
                                }}
                              >
                                <Link
                                  href={opt.href}
                                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all group w-56 block"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className={`shrink-0 ${group.ringText} opacity-80`}>{opt.icon}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-gray-800 leading-tight">{opt.label}</p>
                                      <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{opt.desc}</p>
                                    </div>
                                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
                                  </div>
                                </Link>
                              </div>
                            );
                          })
                        )
                    )}
                  </div>
                )}

              </div>
            </DndContext>
          </div>
        )}

      </main>

      <footer className="border-t border-gray-100 py-6 mt-auto">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <p className="text-xs text-gray-400">© 2025 ProcessMate</p>
          <div className="flex items-center gap-4">
            <Link href="/orchestration" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Orchestration</Link>
            <Link href="/clinic"        className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Clinic</Link>
            <Link href="/orchestration?module=sfd" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">SFD Generator</Link>
            <Link href="/scv-test"      className="text-xs text-gray-400 hover:text-gray-600 transition-colors">ScvMaker</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}

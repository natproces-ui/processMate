'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import WorkflowPipeline from '@/components/orchestration/WorkflowPipeline';
import {
  Zap, ArrowRight,
  PenLine, Upload, Mic, Pencil, Workflow, GitBranch,
  LayoutDashboard, ListChecks, Users, AlertTriangle,
  BarChart2, Shield, Map as MapIcon, BrainCircuit,
  Code2, AlignLeft, Table2, Gauge, Settings2,
  FileText, Megaphone, CheckCircle2,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════ */

const ic = 'w-4 h-4';

interface ModuleOption {
  label: string;
  desc: string;
  href: string;
  icon: React.ReactNode;
}

interface ModuleGroup {
  label: string;
  icon: React.ReactNode;
  options: ModuleOption[];
}

interface ProductModule {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: React.ReactNode;
  color: {
    bg: string;
    text: string;
    border: string;
    lightBg: string;
    ring: string;
    dot: string;
    tab: string;
    gradient: string;
  };
  groups: ModuleGroup[];
  cta: { label: string; href: string };
}

const PRODUCTS: ProductModule[] = [
  {
    id: 'processmate',
    name: 'ProcessMate',
    tagline: 'Orchestration des procédures',
    description:
      'Formalisez, gérez et pilotez vos procédures métier de bout en bout. De la collecte des sources à la publication, en passant par l\'analyse et le suivi des tâches.',
    icon: <Workflow className="w-6 h-6" />,
    color: {
      bg: 'bg-blue-600',
      text: 'text-blue-600',
      border: 'border-blue-200',
      lightBg: 'bg-blue-50',
      ring: 'ring-blue-600',
      dot: 'bg-blue-600',
      tab: 'text-blue-600 border-blue-600',
      gradient: 'from-blue-600 to-blue-400',
    },
    cta: { label: 'Ouvrir ProcessMate', href: '/orchestration' },
    groups: [
      {
        label: 'Créer vos procédures',
        icon: <PenLine className={ic} />,
        options: [
          { label: 'Partir de zéro', desc: 'Studio BPMN vierge', href: '/orchestration?module=stt', icon: <PenLine className={ic} /> },
          { label: 'Partir de documents', desc: 'Extraction depuis PDF, Word, texte', href: '/orchestration?module=stt', icon: <Upload className={ic} /> },
          { label: "Partir d'un enregistrement", desc: 'Transcription dictée au micro', href: '/orchestration?module=stt', icon: <Mic className={ic} /> },
        ],
      },
      {
        label: 'Modifier et piloter',
        icon: <Settings2 className={ic} />,
        options: [
          { label: 'Éditer une procédure', desc: 'Ouvrir et modifier une procédure existante', href: '/orchestration?tab=procedures', icon: <Pencil className={ic} /> },
          { label: 'Espace de travail', desc: 'Révision et corrections par procédure', href: '/orchestration?tab=workspace', icon: <FileText className={ic} /> },
          { label: 'Gérer les flux', desc: 'Orchestrer étapes et acteurs', href: '/orchestration?tab=workflow', icon: <Workflow className={ic} /> },
          { label: 'Campagnes', desc: 'Organiser les campagnes de formalisation', href: '/orchestration?tab=campaigns', icon: <Megaphone className={ic} /> },
        ],
      },
      {
        label: 'Analyser',
        icon: <BrainCircuit className={ic} />,
        options: [
          { label: 'Pipeline', desc: 'Avancement global des procédures', href: '/orchestration?tab=pipeline', icon: <GitBranch className={ic} /> },
          { label: 'Irritants', desc: 'Points de friction et priorités', href: '/orchestration?tab=irritants', icon: <AlertTriangle className={ic} /> },
          { label: 'Complexité', desc: 'Évaluation des risques', href: '/orchestration?tab=complexity', icon: <BarChart2 className={ic} /> },
          { label: 'Impact réglementaire', desc: 'Conformité et impacts', href: '/orchestration?tab=regulatory-impact', icon: <Shield className={ic} /> },
          { label: 'Cartographie apps', desc: 'Systèmes et applications liés', href: '/orchestration?tab=applicatifs', icon: <MapIcon className={ic} /> },
          { label: 'Analyse IA', desc: 'Analyse intelligente', href: '/orchestration?tab=analysis', icon: <BrainCircuit className={ic} /> },
          { label: 'Carte BIAN', desc: 'Référentiel BIAN v4.0', href: '/orchestration?tab=bian', icon: <FileText className={ic} /> },
        ],
      },
      {
        label: 'Piloter les tâches',
        icon: <Gauge className={ic} />,
        options: [
          { label: 'Tableau de bord', desc: 'KPIs et vue globale', href: '/orchestration?tab=dashboard', icon: <LayoutDashboard className={ic} /> },
          { label: 'Suivi des tâches', desc: 'Par acteur et procédure', href: '/orchestration?tab=tasks', icon: <ListChecks className={ic} /> },
          { label: 'Matrice RACI', desc: 'Responsabilités et rôles', href: '/orchestration?tab=raci', icon: <Users className={ic} /> },
          { label: 'Portfolio', desc: 'Vue globale admin', href: '/orchestration?tab=portfolio', icon: <BarChart2 className={ic} /> },
        ],
      },
    ],
  },
  {
    id: 'clinic',
    name: 'Clinic',
    tagline: 'Reverse engineering métier',
    description:
      'Extrayez la logique métier enfouie dans vos codes legacy — COBOL, ABAP, WinDev — et transformez-la en procédures exploitables.',
    icon: <Code2 className="w-6 h-6" />,
    color: {
      bg: 'bg-teal-600',
      text: 'text-teal-600',
      border: 'border-teal-200',
      lightBg: 'bg-teal-50',
      ring: 'ring-teal-600',
      dot: 'bg-teal-600',
      tab: 'text-teal-600 border-teal-600',
      gradient: 'from-teal-600 to-teal-400',
    },
    cta: { label: 'Ouvrir Clinic', href: '/clinic' },
    groups: [
      {
        label: 'Extraction de code',
        icon: <Code2 className={ic} />,
        options: [
          { label: 'Analyse du code', desc: 'COBOL, ABAP, WinDev, PL/SQL…', href: '/clinic?mode=flowchart', icon: <Code2 className={ic} /> },
          { label: 'Génération flowchart', desc: 'Diagramme de flux depuis le code', href: '/clinic?mode=flowchart', icon: <GitBranch className={ic} /> },
          { label: 'Export procédure', desc: 'Transformer en procédure formalisée', href: '/clinic?mode=flowchart', icon: <FileText className={ic} /> },
        ],
      },
    ],
  },
  {
    id: 'sfd',
    name: 'SFD Generator',
    tagline: 'Spécifications fonctionnelles',
    description:
      'Produisez des spécifications fonctionnelles détaillées à partir de vos documents, URLs ou descriptions textuelles. Génération assistée par IA.',
    icon: <AlignLeft className="w-6 h-6" />,
    color: {
      bg: 'bg-amber-500',
      text: 'text-amber-600',
      border: 'border-amber-200',
      lightBg: 'bg-amber-50',
      ring: 'ring-amber-500',
      dot: 'bg-amber-500',
      tab: 'text-amber-600 border-amber-500',
      gradient: 'from-amber-500 to-amber-400',
    },
    cta: { label: 'Ouvrir SFD Generator', href: '/orchestration?module=sfd' },
    groups: [
      {
        label: 'Générer un SFD',
        icon: <AlignLeft className={ic} />,
        options: [
          { label: 'Depuis fichiers / URLs', desc: 'Analyser des documents ou pages web', href: '/orchestration?module=sfd', icon: <Upload className={ic} /> },
          { label: 'Depuis une description', desc: 'Texte libre → document SFD complet', href: '/orchestration?module=sfd', icon: <AlignLeft className={ic} /> },
        ],
      },
    ],
  },
  {
    id: 'scvmaker',
    name: 'ScvMaker',
    tagline: 'Fichiers SCV bancaires',
    description:
      'Générez et validez vos fichiers SCV pour les transactions bancaires. Conformité garantie, validation automatique des formats.',
    icon: <Table2 className="w-6 h-6" />,
    color: {
      bg: 'bg-emerald-600',
      text: 'text-emerald-600',
      border: 'border-emerald-200',
      lightBg: 'bg-emerald-50',
      ring: 'ring-emerald-600',
      dot: 'bg-emerald-600',
      tab: 'text-emerald-600 border-emerald-600',
      gradient: 'from-emerald-600 to-emerald-400',
    },
    cta: { label: 'Ouvrir ScvMaker', href: '/scv-test' },
    groups: [
      {
        label: 'Créer un fichier SCV',
        icon: <Table2 className={ic} />,
        options: [
          { label: 'Nouveau fichier', desc: 'Générer un SCV depuis zéro', href: '/scv-test', icon: <PenLine className={ic} /> },
          { label: 'Valider un fichier', desc: 'Contrôler un SCV existant', href: '/scv-test', icon: <CheckCircle2 className={ic} /> },
        ],
      },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

function ModuleContent({ product }: { product: ProductModule }) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(
    product.groups[0]?.label ?? null,
  );

  return (
    <div className="landing-fade-in">
      {/* Module header */}
      <div className="flex items-start gap-4 mb-8">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 ${product.color.bg}`}
        >
          {product.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-gray-900">
            {product.name}
          </h3>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            {product.description}
          </p>
        </div>
        <Link
          href={product.cta.href}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90 shadow-md shrink-0 ${product.color.bg}`}
          style={{ color: '#ffffff' }}
        >
          {product.cta.label}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Groups as horizontal tabs + options below */}
      <div className="space-y-6">
        {/* Group tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {product.groups.map((group) => {
            const isActive = expandedGroup === group.label;
            return (
              <button
                key={group.label}
                type="button"
                onClick={() =>
                  setExpandedGroup(isActive ? null : group.label)
                }
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
                  isActive
                    ? `bg-gray-900 text-white shadow-sm`
                    : 'bg-white text-gray-500 border border-gray-200/80 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                <span className={isActive ? 'text-white' : 'text-gray-400'}>
                  {group.icon}
                </span>
                {group.label}
              </button>
            );
          })}
        </div>

        {/* Options grid — full width */}
        <div className="min-h-[160px]">
          {product.groups
            .filter((g) => g.label === expandedGroup)
            .map((group) => (
              <div
                key={group.label}
                className={`rounded-2xl p-5 landing-fade-in ${product.color.lightBg}`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {group.options.map((opt) => (
                    <Link
                      key={opt.label}
                      href={opt.href}
                      className={`group flex items-start gap-3.5 p-5 rounded-2xl bg-white/80 backdrop-blur-sm border shadow-sm hover:bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${product.color.border}`}
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white ${product.color.bg}`}
                      >
                        {opt.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 leading-tight">
                          {opt.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                          {opt.desc}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}

          {!expandedGroup && (
            <div className="flex items-center justify-center h-full text-sm text-gray-400 py-8">
              Sélectionnez un groupe pour voir les fonctionnalités
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [activeProduct, setActiveProduct] = useState(PRODUCTS[0].id);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  const currentProduct = PRODUCTS.find((p) => p.id === activeProduct)!;

  const moveIndicator = useCallback(() => {
    const bar = tabBarRef.current;
    const indicator = indicatorRef.current;
    if (!bar || !indicator) return;
    const activeBtn = bar.querySelector<HTMLButtonElement>(
      `[data-tab-id="${activeProduct}"]`,
    );
    if (!activeBtn) return;
    const barRect = bar.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    indicator.style.left = `${btnRect.left - barRect.left}px`;
    indicator.style.width = `${btnRect.width}px`;
  }, [activeProduct]);

  useEffect(() => {
    moveIndicator();
    window.addEventListener('resize', moveIndicator);
    return () => window.removeEventListener('resize', moveIndicator);
  }, [moveIndicator]);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <Zap className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-base font-bold text-gray-900 tracking-tight">
              ProcessMate
            </span>
          </Link>

          {/* Nav pills — desktop */}
          <nav className="hidden md:flex items-center gap-1 bg-gray-50 rounded-full px-1.5 py-1">
            {PRODUCTS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setActiveProduct(p.id);
                  document
                    .getElementById('modules-section')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  activeProduct === p.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.name}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {!authLoading &&
              (user ? (
                <Link
                  href="/orchestration"
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                >
                  Mon espace
                </Link>
              ) : (
                <Link
                  href="/auth/login"
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                >
                  Se connecter
                </Link>
              ))}
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          {/* Subtle gradient bg */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-50/40 via-white to-white pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-100/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-16 lg:pt-28 lg:pb-20">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-xs font-semibold text-blue-600 mb-6">
                <Zap className="w-3 h-3" />
                Plateforme unifiée
              </div>
              <h1 className="text-4xl lg:text-6xl font-extrabold text-gray-900 leading-[1.1] tracking-tight">
                Accélérez la{' '}
                <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
                  formalisation de vos procédures
                </span>
              </h1>
              <p className="mt-5 text-lg text-gray-500 leading-relaxed max-w-xl">
                Concevez, formalisez, analysez et pilotez vos procédures dans
                une plateforme unique, en amont de vos outils industriels.
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-8">
                <Link
                  href="/orchestration"
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
                >
                  Démarrer maintenant
                </Link>
                <a
                  href="#pipeline-section"
                  className="px-6 py-3 border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-semibold rounded-xl transition-colors"
                >
                  Découvrir le cycle de production
                </a>
              </div>
            </div>

          </div>
        </section>

        {/* ── Module Tabs + Content ── */}
        <section id="modules-section" className="border-t border-gray-100">
          {/* Tab bar */}
          <div className="sticky top-16 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-6">
              <div ref={tabBarRef} className="relative flex items-center gap-0">
                {/* Animated indicator */}
                <div
                  ref={indicatorRef}
                  className="absolute bottom-0 h-0.5 bg-current transition-all duration-300 ease-out"
                  style={{
                    color:
                      currentProduct.color.text === 'text-blue-600'
                        ? '#2563eb'
                        : currentProduct.color.text === 'text-teal-600'
                          ? '#0d9488'
                          : currentProduct.color.text === 'text-amber-600'
                            ? '#d97706'
                            : '#059669',
                  }}
                />
                {PRODUCTS.map((p) => {
                  const isActive = activeProduct === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-tab-id={p.id}
                      onClick={() => setActiveProduct(p.id)}
                      className={`relative flex items-center gap-2 px-5 py-4 text-sm font-semibold transition-colors whitespace-nowrap ${
                        isActive
                          ? `${p.color.text}`
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                          isActive
                            ? `${p.color.bg} text-white`
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        <span className="scale-75">{p.icon}</span>
                      </div>
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="bg-gray-50/40">
            <div className="max-w-7xl mx-auto px-6 py-10">
              <ModuleContent key={currentProduct.id} product={currentProduct} />
            </div>
          </div>
        </section>

        {/* ── Pipeline ── */}
        <section
          id="pipeline-section"
          className="border-t border-gray-100 bg-gray-50/50"
        >
          <div className="max-w-7xl mx-auto px-6 pt-12 pb-4">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-xs font-semibold text-blue-600 mb-4">
                  <GitBranch className="w-3 h-3" />
                  Pipeline
                </div>
                <h2 className="text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
                  Le cycle complet de production
                </h2>
                <p className="mt-2 text-sm text-gray-500 max-w-2xl leading-relaxed">
                  Suivez chaque procédure de bout en bout : collecte, formalisation,
                  vérification, validation, puis diagnostic, gestion et livrables.
                </p>
              </div>
            </div>
          </div>
          <div className="max-w-7xl mx-auto">
            <WorkflowPipeline />
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-bold text-gray-900">
                  ProcessMate
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Plateforme unifiée de gestion des procédures métier.
              </p>
            </div>

            {/* Modules */}
            {PRODUCTS.map((p) => (
              <div key={p.id}>
                <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-3">
                  {p.name}
                </h4>
                <ul className="space-y-2">
                  {p.groups.map((g) => (
                    <li key={g.label}>
                      <Link
                        href={g.options[0]?.href ?? '#'}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {g.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 mt-8 pt-6 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              © {new Date().getFullYear()} ProcessMate
            </p>
            <div className="flex items-center gap-4">
              {PRODUCTS.map((p) => (
                <Link
                  key={p.id}
                  href={p.cta.href}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {p.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* Animation styles */}
      <style jsx>{`
        .landing-fade-in {
          animation: landingFadeIn 0.3s ease-out;
        }
        @keyframes landingFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

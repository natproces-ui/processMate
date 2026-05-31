'use client';

import React, { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import Sidebar from '@/components/orchestration/Sidebar';
import { useProceduresStore } from '@/store/proceduresStore';
import { orchestrationApi, Procedure } from '@/lib/orchestrationApi';
import type { ActorRole, TaskActor } from '@/lib/orchestrationTasksApi';
import { X, FileText, List, Loader2 } from 'lucide-react';

// ─── Loader skeleton commun ───────────────────────────────────

function PanelSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-gray-50">
      <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
    </div>
  );
}

// ─── Imports dynamiques — code-split + montage différé ────────
// Chaque composant lourd est téléchargé uniquement au premier accès.
// ssr:false évite l'hydratation côté serveur pour les composants
// qui utilisent D3, bpmn-js, ou des APIs browser uniquement.

const Dashboard = dynamic(
  () => import('@/components/orchestration/Dashboard'),
  { loading: PanelSkeleton }
);

const ProcedureList = dynamic(
  () => import('@/components/orchestration/ProcedureList'),
  { loading: PanelSkeleton }
);

const ProcedureEditor = dynamic(
  () => import('@/components/orchestration/ProcedureEditor'),
  { loading: PanelSkeleton }
);

const ProcessFlow = dynamic(
  () => import('@/components/orchestration/ProcessFlow'),
  { loading: PanelSkeleton, ssr: false }
);

const RACIMatrix = dynamic(
  () => import('@/components/orchestration/RACIMatrix'),
  { loading: PanelSkeleton }
);

const ValidationHub = dynamic(
  () => import('@/components/orchestration/ValidationHub'),
  { loading: PanelSkeleton }
);

const ProcedureDetail = dynamic(
  () => import('@/components/orchestration/ProcedureDetail'),
  { loading: PanelSkeleton }
);

const IrritantsPanel = dynamic(
  () => import('@/components/orchestration/IrritantsPanel'),
  { loading: PanelSkeleton }
);

const ComplexityPanel = dynamic(
  () => import('@/components/orchestration/ComplexityPanel'),
  { loading: PanelSkeleton }
);

const ApplicatifsPanel = dynamic(
  () => import('@/components/orchestration/ApplicatifsPanel'),
  { loading: PanelSkeleton }
);

// WorkflowPipeline contient D3 — ssr:false obligatoire
const WorkflowPipeline = dynamic(
  () => import('@/components/orchestration/WorkflowPipeline'),
  { loading: PanelSkeleton, ssr: false }
);

// IrritantsDashboard contient D3 — ssr:false obligatoire
// (déjà importé dans IrritantsPanel mais on isole au cas où)
const TaskOrchestrationHub = dynamic(
  () => import('@/components/orchestration/tasks').then(m => ({ default: m.TaskOrchestrationHub })),
  { loading: PanelSkeleton }
);

const RegulatoryImpactWorkspace = dynamic(
  () => import('@/components/regulatory-impact/RegulatoryImpactWorkspace'),
  { loading: PanelSkeleton }
);

const AnalysisWorkspace = dynamic(
  () => import('@/components/analysis/AnalysisWorkspace'),
  { loading: PanelSkeleton }
);

// ─── Types ────────────────────────────────────────────────────

type Tab =
  | 'dashboard' | 'procedures' | 'pipeline' | 'workflow'
  | 'raci' | 'validation' | 'tasks' | 'irritants'
  | 'complexity' | 'applicatifs' | 'settings'
  | 'regulatory-impact' | 'analysis';

interface ProcedureTab {
  id: string;
  procedure: Procedure;
}

function mapGlobalRoleToActorRole(globalRole: string): ActorRole {
  return globalRole === 'admin' ? 'admin' : 'user';
}

// ─── LazyPanel ────────────────────────────────────────────────
// Montage différé : le contenu ne se monte qu'au premier accès,
// puis reste en mémoire (show/hide CSS) pour éviter les re-renders.

function LazyPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (active && !mounted) setMounted(true);
  }, [active, mounted]);

  if (!mounted) return null;

  return (
    <div className={
      active
        ? 'absolute inset-0 overflow-y-auto bg-gray-50'
        : 'absolute inset-0 overflow-y-auto bg-gray-50 invisible pointer-events-none'
    }>
      {children}
    </div>
  );
}

// ─── OrchestrationInner ───────────────────────────────────────

function OrchestrationInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { procedures, fetchProcedures } = useProceduresStore();

  const [actors, setActors] = useState<TaskActor[]>([]);
  const [currentActor, setCurrentActor] = useState<TaskActor | null>(null);
  const [actorsLoading, setActorsLoading] = useState(true);

  useEffect(() => { fetchProcedures(); }, []);

  useEffect(() => {
    setActorsLoading(true);
    orchestrationApi.listUsers({ active_only: true })
      .then(res => {
        const mapped: TaskActor[] = res.users.map(user => ({
          id: user.id,
          name: user.display_name || user.full_name || user.email,
          email: user.email,
          job_title: user.job_title,
          department: user.department,
          role: mapGlobalRoleToActorRole(user.global_role),
        }));
        setActors(mapped);
        setCurrentActor(mapped.find(a => a.role === 'admin') || mapped[0] || null);
      })
      .catch(() => { setActors([]); setCurrentActor(null); })
      .finally(() => setActorsLoading(false));
  }, []);

  const initialTab = (searchParams.get('tab') as Tab) || 'dashboard';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [detailProcedureId, setDetailProcedureId] = useState<string | null>(null);
  const [detailProcedure, setDetailProcedure] = useState<Procedure | null>(null);
  const [procedureTabs, setProcedureTabs] = useState<ProcedureTab[]>([]);
  const [activeProcedureTabId, setActiveProcedureTabId] = useState<string | null>(null);

  useEffect(() => {
    const tab = searchParams.get('tab') as Tab | null;
    if (tab && tab !== activeTab) setActiveTab(tab);
  }, [searchParams, activeTab]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as Tab);
    setDetailProcedure(null);
    router.replace(`/orchestration?tab=${tab}`, { scroll: false });
  };

  const handleOpenProcedure = (procedure: Procedure) => {
    const existing = procedureTabs.find(t => t.id === procedure.id);
    if (existing) {
      setActiveProcedureTabId(procedure.id);
    } else {
      setProcedureTabs(prev => [...prev, { id: procedure.id, procedure }]);
      setActiveProcedureTabId(procedure.id);
    }
    setActiveTab('procedures');
    setDetailProcedure(null);
  };

  const handleOpenProcedureFromTask = (procedureId: string) => {
    const procedure = procedures.find(p => p.id === procedureId);
    if (procedure) { handleOpenProcedure(procedure); return; }
    handleTabChange('procedures');
  };

  const handleInstruire = (procedureId: string) => {
    router.push(`/stt?workflow_id=${procedureId}`);
  };

  const handleCloseProcedureTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProcedureTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (activeProcedureTabId === id)
        setActiveProcedureTabId(next.length > 0 ? next[next.length - 1].id : null);
      return next;
    });
  };

  // Actors guard — affiche un loader si pas encore prêt
  const withActors = (content: React.ReactNode) => {
    if (actorsLoading) return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-blue-500" />
        Chargement des utilisateurs...
      </div>
    );
    if (!currentActor) return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Aucun utilisateur actif trouvé.
      </div>
    );
    return content;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        {!detailProcedure && (
          <div className="shrink-0 bg-blue-50 border-b border-blue-200 shadow-sm">
            <div className="px-8 py-5 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-blue-900">ProcessMate Orchestration</h1>
                <p className="text-blue-700 mt-1 text-sm">Gestion centralisée des procédures</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm text-gray-500">{currentActor?.job_title || 'Utilisateur ProcessMate'}</p>
                  <p className="text-base font-semibold text-gray-900">{currentActor?.name || 'Chargement...'}</p>
                </div>
                <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center font-bold text-white text-sm">
                  {(currentActor?.name || 'PM').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden flex flex-col">
          {detailProcedure ? (
            <ProcedureDetail
              procedureId={detailProcedure.id}
              onClose={() => setDetailProcedure(null)}
              onStatusChange={() => { }}
            />
          ) : (
            <>
              {/* Sous-onglets procédures */}
              {activeTab === 'procedures' && (
                <div className="shrink-0 flex items-end gap-0 px-4 pt-2 bg-white border-b border-gray-200 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setActiveProcedureTabId(null)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors flex-shrink-0 ${activeProcedureTabId === null
                        ? 'border-blue-600 text-blue-700 bg-white'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    Procédures
                  </button>
                  {procedureTabs.map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveProcedureTabId(tab.id)}
                      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors flex-shrink-0 group/tab ${activeProcedureTabId === tab.id
                          ? 'border-blue-600 text-blue-700 bg-white'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                      <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="max-w-[160px] truncate">
                        {tab.procedure.nom.length > 24 ? tab.procedure.nom.slice(0, 24) + '…' : tab.procedure.nom}
                      </span>
                      <span
                        role="button"
                        onClick={e => handleCloseProcedureTab(tab.id, e)}
                        className="ml-1 p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 opacity-0 group-hover/tab:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* ── Panneaux ── */}
              <div className="flex-1 relative overflow-hidden">

                {/* Dashboard — premier onglet, monté immédiatement */}
                <LazyPanel active={activeTab === 'dashboard'}>
                  <Dashboard />
                </LazyPanel>

                {/* Procédures — structure complexe avec sous-onglets */}
                <div className={
                  activeTab === 'procedures'
                    ? 'absolute inset-0 overflow-hidden flex flex-col'
                    : 'absolute inset-0 overflow-hidden flex flex-col invisible pointer-events-none'
                }>
                  <div className={
                    activeProcedureTabId === null
                      ? 'absolute inset-0 overflow-y-auto bg-gray-50'
                      : 'absolute inset-0 overflow-y-auto bg-gray-50 invisible pointer-events-none'
                  }>
                    <ProcedureList
                      onOpenDetail={(p) => setDetailProcedure(p)}
                      onOpenProcedure={handleOpenProcedure}
                    />
                  </div>
                  {procedureTabs.map(tab => (
                    <div key={tab.id} className={
                      activeProcedureTabId === tab.id
                        ? 'absolute inset-0 overflow-hidden'
                        : 'absolute inset-0 overflow-hidden invisible pointer-events-none'
                    }>
                      <ProcedureEditor procedure={tab.procedure} />
                    </div>
                  ))}
                </div>

                {/* Pipeline — D3, code-split + montage différé */}
                <LazyPanel active={activeTab === 'pipeline'}>
                  <WorkflowPipeline
                    onCreateAI={() => router.push('/stt')}
                    onCreateForm={() => handleTabChange('procedures')}
                    onFormalize={() => handleTabChange('procedures')}
                    onWorkflow={() => handleTabChange('workflow')}
                    onIrritants={() => handleTabChange('irritants')}
                    onValidation={() => handleTabChange('validation')}
                    onRaci={() => handleTabChange('raci')}
                    onComplexity={() => handleTabChange('complexity')}
                    onTasks={() => handleTabChange('tasks')}
                    onApplicatifs={() => handleTabChange('applicatifs')}
                    onAnalysis={() => handleTabChange('analysis')}
                    onSfd={() => router.push('/sfd')}
                  />
                </LazyPanel>

                <LazyPanel active={activeTab === 'workflow'}>
                  <ProcessFlow />
                </LazyPanel>

                <LazyPanel active={activeTab === 'raci'}>
                  {withActors(<RACIMatrix currentActor={currentActor!} />)}
                </LazyPanel>

                <LazyPanel active={activeTab === 'validation'}>
                  <ValidationHub />
                </LazyPanel>

                <LazyPanel active={activeTab === 'tasks'}>
                  {withActors(
                    <TaskOrchestrationHub
                      actors={actors}
                      currentActor={currentActor!}
                      procedures={procedures}
                      onActorChange={setCurrentActor}
                      onOpenProcedure={handleOpenProcedureFromTask}
                    />
                  )}
                </LazyPanel>

                <LazyPanel active={activeTab === 'irritants'}>
                  <IrritantsPanel onInstruire={handleInstruire} />
                </LazyPanel>

                <LazyPanel active={activeTab === 'complexity'}>
                  <ComplexityPanel />
                </LazyPanel>

                <LazyPanel active={activeTab === 'applicatifs'}>
                  <ApplicatifsPanel />
                </LazyPanel>

                <LazyPanel active={activeTab === 'regulatory-impact'}>
                  <RegulatoryImpactWorkspace />
                </LazyPanel>

                <LazyPanel active={activeTab === 'analysis'}>
                  <AnalysisWorkspace actors={actors} currentActor={currentActor} />
                </LazyPanel>

                <LazyPanel active={activeTab === 'settings'}>
                  <SettingsPanel />
                </LazyPanel>

              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Export avec Suspense ─────────────────────────────────────

export default function OrchestrationPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
      </div>
    }>
      <OrchestrationInner />
    </Suspense>
  );
}

// ─── Settings ─────────────────────────────────────────────────

function SettingsPanel() {
  return (
    <div className="p-8 max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Paramètres</h2>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="p-5">
          <h3 className="font-semibold text-gray-800 mb-1">Module</h3>
          <p className="text-sm text-gray-500">ProcessMate Orchestration v1.0.0</p>
        </div>
        <div className="p-5">
          <h3 className="font-semibold text-gray-800 mb-3">Statuts disponibles</h3>
          <div className="flex flex-wrap gap-2">
            {['Brouillon', 'En cours', 'En validation', 'Retours reçus', 'En révision', 'Validée', 'Rejetée', 'Bloquée'].map(s => (
              <span key={s} className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded-full">{s}</span>
            ))}
          </div>
        </div>
        <div className="p-5">
          <h3 className="font-semibold text-gray-800 mb-3">Étapes du cycle de vie</h3>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            {[
              'Initialisation — Atelier de cadrage',
              'Formalisation — Atelier de rédaction',
              'Validation Interne — Atelier de relecture',
              'Révision Légale — Atelier juridique',
              "Approbation Direction — Comité d'approbation",
              'Publication & Formation — Atelier de formation',
            ].map(s => <li key={s}>{s}</li>)}
          </ol>
        </div>
        <div className="p-5">
          <h3 className="font-semibold text-gray-800 mb-1">Source de données</h3>
          <p className="text-sm text-gray-500">Supabase — table <code className="bg-gray-100 px-1 rounded">workflows</code></p>
        </div>
      </div>
    </div>
  );
}
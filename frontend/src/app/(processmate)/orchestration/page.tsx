'use client';

// app/(processmate)/orchestration/page.tsx
// Shell principal ProcessMate — utilise ProcessMateSidebar + ProcessMateHeader
// Plus de double header, plus de "ProcessMate Orchestration" comme titre de page

import React, { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import ProcessMateSidebar, { type ActiveModule } from '@/components/processmate/ProcessMateSidebar';
import ProcessMateHeader from '@/components/processmate/Header';
import { useProceduresStore } from '@/store/proceduresStore';
import { orchestrationApi } from '@/lib/orchestrationApi';
import type { ActorRole, TaskActor } from '@/lib/orchestrationTasksApi';
import { useAuth } from '@/context/AuthContext';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { taxonomyApi } from '@/lib/taxonomyApi';

// ─── Skeleton commun ──────────────────────────────────────────

function PanelSkeleton() {
    return (
        <div className="flex h-full items-center justify-center bg-gray-50">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </div>
    );
}

// ─── Imports dynamiques ───────────────────────────────────────

// ── Main new panels ──
const ProceduresLibrary   = dynamic(() => import('@/components/orchestration/ProceduresLibrary'),   { loading: PanelSkeleton });
const ProceduresDrilldown = dynamic(() => import('@/components/orchestration/ProceduresDrilldown'), { loading: PanelSkeleton });
const AnalyserPanel       = dynamic(() => import('@/components/orchestration/AnalyserPanel'),       { loading: PanelSkeleton });
const WorkspaceShell      = dynamic(() => import('@/components/workspace/WorkspaceShell'),           { loading: PanelSkeleton });
const TaskOrchestrationHub = dynamic(
    () => import('@/components/orchestration/tasks').then(m => ({ default: m.TaskOrchestrationHub })),
    { loading: PanelSkeleton }
);
const DashboardPanel = dynamic(() => import('@/components/orchestration/DashboardPanel'), { loading: PanelSkeleton });
const SpecificationsPanel = dynamic(() => import('@/components/orchestration/SpecificationsPanel'), { loading: PanelSkeleton });

// ── Legacy panels (accessible via deep-link or internal navigation) ──
const Dashboard         = dynamic(() => import('@/components/orchestration/Dashboard'),               { loading: PanelSkeleton });
const CampaignsPanel    = dynamic(() => import('@/components/orchestration/CampaignsPanel'),         { loading: PanelSkeleton });
const CorrectionsPanel  = dynamic(() => import('@/components/orchestration/CorrectionsPanel'),       { loading: PanelSkeleton });
const ProjectsPortfolio = dynamic(() => import('@/components/orchestration/ProjectsPortfolio'),      { loading: PanelSkeleton });
const TaxonomyTree      = dynamic(() => import('@/components/orchestration/TaxonomyTree'),           { loading: PanelSkeleton });
const BianServiceMap    = dynamic(() => import('@/components/orchestration/BianServiceMap'),         { loading: PanelSkeleton });

// Modules externes — montés dans le même shell
const SttPanel = dynamic(() => import('@/components/processmate/SttPanel'), { loading: PanelSkeleton, ssr: false });
const SfdPanel = dynamic(() => import('@/components/processmate/SfdPanel'), { loading: PanelSkeleton });
const ClinicPanel = dynamic(() => import('@/components/processmate/ClinicPanel'), { loading: PanelSkeleton, ssr: false });

// ─── Types ────────────────────────────────────────────────────

type OrchestraTab =
    // Primary navigation (sidebar)
    | 'procedures' | 'campagnes' | 'analyser' | 'taches' | 'workspace' | 'tableau-de-bord' | 'specifications'
    // Legacy deep-links (no sidebar item, still accessible via URL)
    | 'dashboard' | 'campaigns' | 'corrections' | 'portfolio' | 'taxonomy'
    | 'pipeline' | 'irritants' | 'complexity' | 'applicatifs'
    | 'regulatory-impact' | 'analysis' | 'bian' | 'workflow'
    | 'raci' | 'validation' | 'tasks' | 'settings';

function mapRole(globalRole: string): ActorRole {
    return globalRole === 'admin' ? 'admin' : 'user';
}

// ─── LazyPanel ────────────────────────────────────────────────

function LazyPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { if (active && !mounted) setMounted(true); }, [active, mounted]);
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

// ─── Procedures Panel (Créer / Modifier) ─────────────────────

function ProceduresPanel({
    onOpenEditor, onOpenTasks, onAssignToCampaign, onOpenStudio,
    onGoToWorkspace, isAdmin,
}: {
    onOpenEditor: (pid: string) => void;
    onOpenTasks: (filter: { procedureIds?: string[] }) => void;
    onAssignToCampaign: () => void;
    onOpenStudio: (pid?: string) => void;
    onGoToWorkspace: () => void;
    isAdmin: boolean;
}) {
    const [subTab, setSubTab] = useState<'modifier' | 'creer'>('modifier');
    const [creatingFor, setCreatingFor] = useState<{ id: string; name: string } | null>(null);
    const [newProcName, setNewProcName] = useState('');
    const [saving, setSaving] = useState(false);
    const [expandToNode, setExpandToNode] = useState<string | null>(null);
    const { fetchProcedures } = useProceduresStore();

    const handleCreateProcedure = (subcategoryId: string, subcategoryName: string) => {
        setCreatingFor({ id: subcategoryId, name: subcategoryName });
        setNewProcName('');
    };

    const handleSubmitCreate = async () => {
        if (!newProcName.trim() || !creatingFor) return;
        setSaving(true);
        try {
            const res = await orchestrationApi.createProcedure({
                nom: newProcName.trim(),
                taxonomy_id: creatingFor.id,
            });
            const subcatId = creatingFor.id;
            setCreatingFor(null);
            setNewProcName('');
            await fetchProcedures(true);
            setExpandToNode(subcatId);
            setSubTab('modifier');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-gray-50">
            <div className="shrink-0 bg-white border-b border-gray-200 flex items-end gap-0 px-4 pt-2">
                {([
                    { id: 'modifier' as const, label: 'Modifier' },
                    { id: 'creer' as const, label: 'Créer' },
                ]).map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSubTab(tab.id)}
                        className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                            subTab === tab.id
                                ? 'border-blue-600 text-blue-700'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Formulaire création procédure */}
            {creatingFor && (
                <div className="shrink-0 bg-emerald-50 border-b border-emerald-200 px-5 py-3 flex items-center gap-3">
                    <span className="text-sm text-emerald-800 font-medium shrink-0">
                        Nouvelle procédure dans <strong>{creatingFor.name}</strong>
                    </span>
                    <input
                        autoFocus
                        type="text"
                        value={newProcName}
                        onChange={e => setNewProcName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSubmitCreate(); if (e.key === 'Escape') setCreatingFor(null); }}
                        placeholder="Nom de la procédure…"
                        className="flex-1 px-3 py-1.5 text-sm border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    <button type="button" onClick={handleSubmitCreate} disabled={!newProcName.trim() || saving}
                        className="px-4 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Créer'}
                    </button>
                    <button type="button" onClick={() => setCreatingFor(null)}
                        className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Annuler</button>
                </div>
            )}

            <div className="flex-1 relative overflow-hidden">
                <div className={subTab === 'modifier' ? 'absolute inset-0 overflow-y-auto' : 'absolute inset-0 overflow-y-auto invisible pointer-events-none'}>
                    <ProceduresLibrary
                        onOpenEditor={onOpenEditor}
                        onOpenTasks={onOpenTasks}
                        onAssignToCampaign={onAssignToCampaign}
                        onOpenStudio={onOpenStudio}
                        expandToNodeId={expandToNode}
                    />
                </div>
                <div className={subTab === 'creer' ? 'absolute inset-0 overflow-y-auto' : 'absolute inset-0 overflow-y-auto invisible pointer-events-none'}>
                    <BianServiceMap
                        onGoToProcedures={() => setSubTab('modifier')}
                        onGoToWorkspace={onGoToWorkspace}
                        isAdmin={isAdmin}
                        onCreateProcedure={handleCreateProcedure}
                    />
                </div>
            </div>
        </div>
    );
}

// ─── Inner ────────────────────────────────────────────────────

function ProcessMateInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { profile, user } = useAuth();
    const { procedures, fetchProcedures } = useProceduresStore();

    // Module actif (orchestration / stt / sfd / clinic) — initialisé depuis ?module=
    const validModules: ActiveModule[] = ['orchestration', 'stt', 'sfd', 'clinic'];
    const paramModule = searchParams.get('module') as ActiveModule;
    const [activeModule, setActiveModule] = useState<ActiveModule>(
        validModules.includes(paramModule) ? paramModule : 'orchestration'
    );

    const [actors, setActors] = useState<TaskActor[]>([]);
    const [workspaceProcedureId, setWorkspaceProcedureId] = useState<string | null>(null);
    const [studioProcedureId, setStudioProcedureId] = useState<string | null>(null);
    const [studioReturnContext, setStudioReturnContext] = useState<{ tab: OrchestraTab; procedureId?: string } | null>(null);
    const [currentActor, setCurrentActor] = useState<TaskActor | null>(null);
    const [actorsLoading, setActorsLoading] = useState(true);
    const [taskFilterProcIds, setTaskFilterProcIds] = useState<string[] | null>(null);

    useEffect(() => { fetchProcedures(); }, []);

    useEffect(() => {
        if (!profile) return;

        const actorFromProfile = (): TaskActor => ({
            id: profile.id,
            name: profile.display_name || profile.full_name || profile.email,
            email: profile.email,
            job_title: profile.job_title ?? undefined,
            department: profile.department ?? undefined,
            role: mapRole(profile.global_role),
            global_role: profile.global_role,
        });

        orchestrationApi.listUsers({ active_only: true })
            .then(res => {
                const mapped: TaskActor[] = res.users.map(u => ({
                    id: u.id,
                    name: u.display_name || u.full_name || u.email,
                    email: u.email,
                    job_title: u.job_title,
                    department: u.department,
                    role: mapRole(u.global_role),
                    global_role: u.global_role,
                }));
                setActors(mapped);

                // The logged-in user is always the current actor
                // Role comes from Supabase profile (authoritative), not the backend list
                const matched = mapped.find(a => a.email === profile.email);
                setCurrentActor(matched
                    ? { ...matched, role: mapRole(profile.global_role) }
                    : actorFromProfile()
                );
            })
            .catch(() => {
                setActors([]);
                setCurrentActor(actorFromProfile());
            })
            .finally(() => setActorsLoading(false));
    }, [profile]);

    const initialTab = (searchParams.get('tab') as OrchestraTab) || 'procedures';
    const [activeTab, setActiveTab] = useState<OrchestraTab>(initialTab);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const LEGACY_REDIRECTS: Record<string, OrchestraTab> = {
        campaigns: 'campagnes',
        dashboard: 'tableau-de-bord',
        portfolio: 'tableau-de-bord',
    };

    useEffect(() => {
        const raw = searchParams.get('tab');
        const tab = (raw ? (LEGACY_REDIRECTS[raw] ?? raw) : null) as OrchestraTab | null;
        if (tab && tab !== activeTab) {
            setActiveTab(tab);
            if (raw && LEGACY_REDIRECTS[raw]) router.replace(`/orchestration?tab=${tab}`, { scroll: false });
        }
    }, [searchParams, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleTabChange = (tab: string) => {
        setActiveTab(tab as OrchestraTab);
        router.replace(`/orchestration?tab=${tab}`, { scroll: false });
    };

    const handleModuleChange = (module: ActiveModule) => {
        setActiveModule(module);
        if (module === 'orchestration') setActiveTab('procedures');
    };

    const handleOpenProcedureFromTask = (procedureId: string) => {
        setWorkspaceProcedureId(procedureId);
        handleTabChange('workspace');
    };

    const handleOpenStudio = (procedureId?: string) => {
        setStudioReturnContext({ tab: activeTab, procedureId: workspaceProcedureId ?? undefined });
        setStudioProcedureId(procedureId ?? null);
        setActiveModule('stt');
    };

    const handleStudioBack = () => {
        setActiveModule('orchestration');
        if (studioReturnContext) {
            setActiveTab(studioReturnContext.tab);
            if (studioReturnContext.procedureId) setWorkspaceProcedureId(studioReturnContext.procedureId);
            setStudioReturnContext(null);
        }
        fetchProcedures(true);
    };

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

    // workflow_id passé en param pour le studio
    const studioWorkflowId = searchParams.get('studio') || undefined;

    return (
        <div className="flex h-screen overflow-hidden bg-white">

            {/* ── Sidebar ProcessMate unifiée ── */}
            <ProcessMateSidebar
                activeTab={activeTab}
                activeModule={activeModule}
                setActiveTab={handleTabChange}
                setActiveModule={handleModuleChange}
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                userRole={profile?.global_role}
            />

            {/* ── Zone principale ── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

                {/* Header compact */}
                <ProcessMateHeader
                    activeModule={activeModule}
                    activeTab={activeModule === 'orchestration' ? activeTab : undefined}
                    currentActorName={profile?.display_name || profile?.full_name || currentActor?.name || user?.email?.split('@')[0]}
                    currentActorTitle={profile?.job_title || currentActor?.job_title || undefined}
                    currentActorId={currentActor?.id}
                    onSettingsClick={() => handleTabChange('settings')}
                    onOpenStudio={() => handleOpenStudio()}
                />

                <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="flex-1 relative overflow-hidden">

                        {/* ══ Module Orchestration ══ */}
                        {activeModule === 'orchestration' && (
                            <>
                                {/* ─ Panneaux principaux (sidebar) ─ */}
                                <LazyPanel active={activeTab === 'procedures'}>
                                    <ProceduresPanel
                                        onOpenEditor={pid => {
                                            setWorkspaceProcedureId(pid);
                                            handleTabChange('workspace');
                                        }}
                                        onOpenTasks={filter => {
                                            setTaskFilterProcIds(filter.procedureIds ?? null);
                                            handleTabChange('taches');
                                        }}
                                        onAssignToCampaign={() => handleTabChange('campagnes')}
                                        onOpenStudio={pid => handleOpenStudio(pid)}
                                        onGoToWorkspace={() => handleTabChange('workspace')}
                                        isAdmin={profile?.global_role === 'admin' || profile?.global_role === 'process_owner'}
                                    />
                                </LazyPanel>

                                <LazyPanel active={activeTab === 'campagnes'}>
                                    <ProceduresDrilldown
                                        isAdmin={profile?.global_role === 'admin' || profile?.global_role === 'process_owner'}
                                        onOpenStudio={wfId => handleOpenStudio(wfId)}
                                        onOpenWorkspace={pid => {
                                            setWorkspaceProcedureId(pid);
                                            handleTabChange('workspace');
                                        }}
                                    />
                                </LazyPanel>

                                <LazyPanel active={activeTab === 'analyser'}>
                                    <AnalyserPanel
                                        actors={actors}
                                        currentActor={currentActor}
                                        isAdmin={profile?.global_role === 'admin' || profile?.global_role === 'process_owner'}
                                        onOpenStudio={() => handleOpenStudio()}
                                        onGoToProcedures={() => handleTabChange('procedures')}
                                        onGoToWorkspace={() => handleTabChange('workspace')}
                                        initialSubTab={(searchParams.get('subtab') as import('@/components/orchestration/AnalyserPanel').AnalyserTab) ?? undefined}
                                    />
                                </LazyPanel>

                                <LazyPanel active={activeTab === 'taches'}>
                                    {withActors(currentActor ? (
                                        <TaskOrchestrationHub
                                            actors={actors}
                                            currentActor={currentActor}
                                            procedures={procedures}
                                            onActorChange={setCurrentActor}
                                            onOpenProcedure={handleOpenProcedureFromTask}
                                            initialProcedureFilter={taskFilterProcIds}
                                            onClearFilter={() => setTaskFilterProcIds(null)}
                                        />
                                    ) : null)}
                                </LazyPanel>

                                <LazyPanel active={activeTab === 'workspace'}>
                                    <WorkspaceShell openProcedureId={workspaceProcedureId}
                                        onNavigateBack={() => handleTabChange('procedures')}
                                        onOpenStudio={pid => handleOpenStudio(pid)} />
                                </LazyPanel>
                                <LazyPanel active={activeTab === 'tableau-de-bord'}><DashboardPanel /></LazyPanel>
                                <LazyPanel active={activeTab === 'specifications'}><SpecificationsPanel /></LazyPanel>

                                {/* ─ Legacy / deep-link panels ─ */}
                                <LazyPanel active={activeTab === 'dashboard'}><Dashboard /></LazyPanel>
                                <LazyPanel active={activeTab === 'campaigns'}>
                                    <CampaignsPanel onOpenProcedure={pid => {
                                        setWorkspaceProcedureId(pid);
                                        handleTabChange('workspace');
                                    }} />
                                </LazyPanel>
                                <LazyPanel active={activeTab === 'corrections'}><CorrectionsPanel /></LazyPanel>
                                <LazyPanel active={activeTab === 'portfolio'}><ProjectsPortfolio /></LazyPanel>
                                <LazyPanel active={activeTab === 'taxonomy'}><TaxonomyTree /></LazyPanel>
                                <LazyPanel active={activeTab === 'settings'}><SettingsPanel /></LazyPanel>
                            </>
                        )}

                        {/* ══ Module BPMN Studio ══ */}
                        {activeModule === 'stt' && (
                            <div className="absolute inset-0 overflow-hidden">
                                <SttPanel
                                    workflowId={studioProcedureId ?? studioWorkflowId}
                                    onBack={handleStudioBack}
                                    currentActorId={currentActor?.id}
                                    fromClinic={searchParams.get('from') === 'clinic'}
                                />
                            </div>
                        )}

                        {/* ══ Module SFD ══ */}
                        {activeModule === 'sfd' && (
                            <div className="absolute inset-0 overflow-hidden">
                                <SfdPanel />
                            </div>
                        )}

                        {/* ══ Module Clinic ══ */}
                        {activeModule === 'clinic' && (
                            <div className="absolute inset-0 overflow-hidden">
                                <ClinicPanel />
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Export ───────────────────────────────────────────────────

export default function ProcessMatePage() {
    return (
        <Suspense fallback={
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
            </div>
        }>
            <ProcessMateInner />
        </Suspense>
    );
}

// ─── Settings ─────────────────────────────────────────────────

function SettingsPanel() {
    const { profile } = useAuth();
    const [migrating, setMigrating] = useState(false);
    const [migrateResult, setMigrateResult] = useState<{ updated: number; total: number } | null>(null);
    const [migrateError, setMigrateError] = useState<string | null>(null);
    const [taxMigrating, setTaxMigrating] = useState(false);
    const [taxMigrateDone, setTaxMigrateDone] = useState(false);
    const [taxMigrateResult, setTaxMigrateResult] = useState<{ procedures_linked: number } | null>(null);
    const [taxMigrateError, setTaxMigrateError] = useState<string | null>(null);
    const [bianSeeding, setBianSeeding] = useState(false);
    const [bianSeedDone, setBianSeedDone] = useState(false);
    const [bianSeedResult, setBianSeedResult] = useState<{ themes_created: number; categories_created: number; subcategories_created: number } | null>(null);
    const [bianSeedError, setBianSeedError] = useState<string | null>(null);

    useEffect(() => {
        taxonomyApi.getFlat()
            .then(res => {
                if (res.nodes.some(n => n.level === 'theme')) setTaxMigrateDone(true);
                if (res.nodes.some(n => n.name === 'Reference Data' && n.level === 'theme')) setBianSeedDone(true);
            })
            .catch(() => {});
    }, []);

    if (profile?.global_role !== 'admin') {
        return (
            <div className="p-8 h-full flex items-center justify-center">
                <div className="text-center">
                    <p className="text-gray-400 font-medium">Accès réservé aux administrateurs.</p>
                </div>
            </div>
        );
    }

    const handleMigrate = async () => {
        if (!confirm('Mettre à jour les noms et statuts du cycle de vie pour TOUTES les procédures existantes ?')) return;
        setMigrating(true); setMigrateResult(null); setMigrateError(null);
        try {
            const res = await orchestrationApi.migrateLifecycleStages();
            setMigrateResult({ updated: res.updated, total: res.total });
        } catch (e) {
            setMigrateError(e instanceof Error ? e.message : 'Erreur');
        } finally {
            setMigrating(false);
        }
    };

    const handleTaxMigrate = async () => {
        if (!confirm('Migrer les domaines existants vers la taxonomie Thème → Catégorie → Sous-catégorie ? Cette opération ne peut être lancée qu\'une seule fois.')) return;
        setTaxMigrating(true); setTaxMigrateResult(null); setTaxMigrateError(null);
        try {
            const res = await taxonomyApi.migrate();
            setTaxMigrateResult({ procedures_linked: res.procedures_linked });
            setTaxMigrateDone(true);
        } catch (e) {
            setTaxMigrateError(e instanceof Error ? e.message : 'Erreur');
        } finally {
            setTaxMigrating(false);
        }
    };

    const handleBianSeed = async (force = false) => {
        const msg = force
            ? 'Remplacer les données BIAN existantes par le référentiel v4.0 corrigé ?'
            : 'Charger le référentiel BIAN Service Landscape v4.0 dans la taxonomie ?';
        if (!confirm(msg)) return;
        setBianSeeding(true); setBianSeedResult(null); setBianSeedError(null);
        try {
            const res = await taxonomyApi.seedBian(force);
            setBianSeedResult({ themes_created: res.themes_created, categories_created: res.categories_created, subcategories_created: res.subcategories_created });
            setBianSeedDone(true);
        } catch (e) {
            setBianSeedError(e instanceof Error ? e.message : 'Erreur');
        } finally {
            setBianSeeding(false);
        }
    };

    return (
        <div className="p-8 max-w-2xl space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Paramètres</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                <div className="p-5">
                    <h3 className="font-semibold text-gray-800 mb-1">Module</h3>
                    <p className="text-sm text-gray-500">ProcessMate v2.0</p>
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
                    <h3 className="font-semibold text-gray-800 mb-1">Source de données</h3>
                    <p className="text-sm text-gray-500">Supabase — table <code className="bg-gray-100 px-1 rounded">workflows</code></p>
                </div>
                <div className="p-5 space-y-3">
                    <h3 className="font-semibold text-gray-800">Migration cycle de vie</h3>
                    <p className="text-sm text-gray-500">
                        Renomme les étapes (anciens noms → Création, Formalisation, Vérification, Validation, Signature, Publication)
                        et synchronise les statuts <code className="bg-gray-100 px-1 rounded">pending/in_progress/completed</code> pour toutes les procédures existantes.
                    </p>
                    {migrateResult && (
                        <p className="text-sm font-semibold text-emerald-700">
                            Migration réussie : {migrateResult.updated}/{migrateResult.total} procédures mises à jour.
                        </p>
                    )}
                    {migrateError && (
                        <p className="text-sm text-red-600">{migrateError}</p>
                    )}
                    <button
                        type="button"
                        disabled={migrating}
                        onClick={handleMigrate}
                        className="px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {migrating ? 'Migration en cours…' : 'Lancer la migration'}
                    </button>
                </div>

                <div className="p-5 space-y-3">
                    <h3 className="font-semibold text-gray-800">Migration Taxonomie</h3>
                    <p className="text-sm text-gray-500">
                        Crée la structure <span className="font-medium text-gray-700">Thème → Catégorie → Sous-catégorie</span> à partir
                        des domaines existants et lie chaque procédure à sa sous-catégorie via la table{' '}
                        <code className="bg-gray-100 px-1 rounded">process_taxonomy</code>.
                        Cette opération est idempotente mais ne doit être lancée qu&apos;une seule fois.
                    </p>
                    {taxMigrateDone && !taxMigrateResult && (
                        <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium">
                            <CheckCircle2 className="w-4 h-4" /> Taxonomie déjà initialisée.
                        </div>
                    )}
                    {taxMigrateResult && (
                        <div className="flex items-center gap-2 text-sm text-emerald-700 font-semibold">
                            <CheckCircle2 className="w-4 h-4" />
                            Migration réussie — {taxMigrateResult.procedures_linked} procédure(s) liée(s).
                        </div>
                    )}
                    {taxMigrateError && <p className="text-sm text-red-600">{taxMigrateError}</p>}
                    <button
                        type="button"
                        disabled={taxMigrating || taxMigrateDone}
                        onClick={handleTaxMigrate}
                        className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {taxMigrating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {taxMigrating ? 'Migration en cours…' : taxMigrateDone ? 'Déjà effectuée ✓' : 'Lancer la migration taxonomie'}
                    </button>
                </div>

                <div className="p-5 space-y-3">
                    <h3 className="font-semibold text-gray-800">Référentiel BIAN</h3>
                    <p className="text-sm text-gray-500">
                        Charge le référentiel{' '}
                        <span className="font-medium text-gray-700">BIAN Service Landscape v4.0</span>{' '}
                        dans la taxonomie : 5 domaines, ~20 catégories et plus de 100 domaines de service.
                        L&apos;opération est idempotente — elle ne duplique pas les données si déjà chargées.
                    </p>
                    {bianSeedResult && (
                        <div className="flex items-center gap-2 text-sm text-cyan-700 font-semibold">
                            <CheckCircle2 className="w-4 h-4" />
                            {bianSeedResult.themes_created > 0
                                ? `Chargé — ${bianSeedResult.themes_created} domaines, ${bianSeedResult.categories_created} catégories, ${bianSeedResult.subcategories_created} domaines de service.`
                                : 'Référentiel BIAN déjà à jour.'}
                        </div>
                    )}
                    {bianSeedError && <p className="text-sm text-red-600">{bianSeedError}</p>}
                    <div className="flex gap-2 flex-wrap">
                        <button
                            type="button"
                            disabled={bianSeeding}
                            onClick={() => handleBianSeed(false)}
                            className="px-4 py-2 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {bianSeeding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {bianSeeding ? 'Chargement…' : 'Charger le référentiel BIAN'}
                        </button>
                        {bianSeedDone && (
                            <button
                                type="button"
                                disabled={bianSeeding}
                                onClick={() => handleBianSeed(true)}
                                className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {bianSeeding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Remplacer (corrige les noms)
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
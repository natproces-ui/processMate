'use client';

// components/processmate/Sidebar.tsx
// Sidebar unifiée ProcessMate — remplace orchestration/Sidebar.tsx
// Inclut tous les modules : Orchestration + BPMN Studio + SFD + Clinic
// Notifications et Paramètres sont retirés de la sidebar (dans le header)

import React from 'react';
import {
    ChevronLeft,
    BarChart3,
    FileText,
    GitBranch,
    Users,
    AlertCircle,
    TriangleAlert,
    Workflow,
    Server,
    CheckSquare,
    FileSearch,
    MessageSquare,
    Gauge,
    PenTool,
    Code2,
    Layers,
    Map,
    Megaphone,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

export type ActiveModule = 'orchestration' | 'stt' | 'sfd' | 'clinic';

interface SidebarProps {
    activeTab: string;
    activeModule: ActiveModule;
    setActiveTab: (tab: string) => void;
    setActiveModule: (module: ActiveModule) => void;
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    userRole?: string;
}

// ─── Structure des items ──────────────────────────────────────

interface NavItem {
    id: string;
    label: string;
    icon: React.ElementType;
    color: string;
    module: ActiveModule;
    isModuleHeader?: boolean;
}

const MODULES: { id: ActiveModule; label: string; icon: React.ElementType; color: string }[] = [
    { id: 'orchestration', label: 'Orchestration', icon: Workflow, color: 'text-blue-600' },
    { id: 'stt', label: 'BPMN Studio', icon: PenTool, color: 'text-violet-600' },
    { id: 'sfd', label: 'SFD Generator', icon: Layers, color: 'text-indigo-600' },
    { id: 'clinic', label: 'Clinic', icon: Code2, color: 'text-teal-600' },
];

const ORCHESTRATION_ITEMS: NavItem[] = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: BarChart3, color: 'text-blue-600', module: 'orchestration' },
    { id: 'pipeline', label: 'Pipeline', icon: Workflow, color: 'text-blue-600', module: 'orchestration' },
    { id: 'procedures', label: 'Procédures', icon: FileText, color: 'text-blue-700', module: 'orchestration' },
    { id: 'workflow', label: 'Flux de Travail', icon: GitBranch, color: 'text-blue-600', module: 'orchestration' },
    { id: 'raci', label: 'Responsabilités', icon: Users, color: 'text-blue-700', module: 'orchestration' },
    { id: 'validation', label: 'Validation', icon: AlertCircle, color: 'text-blue-600', module: 'orchestration' },
    { id: 'tasks', label: 'Suivi des tâches', icon: CheckSquare, color: 'text-blue-600', module: 'orchestration' },
    { id: 'irritants', label: 'Irritants', icon: TriangleAlert, color: 'text-orange-500', module: 'orchestration' },
    { id: 'complexity', label: 'Complexité', icon: Gauge, color: 'text-orange-600', module: 'orchestration' },
    { id: 'regulatory-impact', label: "Analyse d'impact", icon: FileSearch, color: 'text-indigo-600', module: 'orchestration' },
    { id: 'applicatifs', label: 'Cartographie Applicative', icon: Server, color: 'text-teal-600', module: 'orchestration' },
    { id: 'analysis', label: 'Analyse IA', icon: MessageSquare, color: 'text-purple-600', module: 'orchestration' },
    { id: 'bian', label: 'Carte BIAN', icon: Map, color: 'text-cyan-600', module: 'orchestration' },
    { id: 'campaigns', label: 'Campagnes', icon: Megaphone, color: 'text-orange-500', module: 'orchestration' },
];

// ─── Composant principal ──────────────────────────────────────

export default function ProcessMateSidebar({
    activeTab,
    activeModule,
    setActiveTab,
    setActiveModule,
    sidebarOpen,
    setSidebarOpen,
    userRole,
}: SidebarProps) {

    const canSeeRegulatoryImpact = userRole === 'admin' || userRole === 'validator';
    const visibleOrchestrationItems = ORCHESTRATION_ITEMS.filter(item =>
        item.id !== 'regulatory-impact' || canSeeRegulatoryImpact
    );

    const handleModuleChange = (moduleId: ActiveModule) => {
        setActiveModule(moduleId);
        // Reset tab selon le module
        if (moduleId === 'orchestration') setActiveTab('dashboard');
    };

    return (
        <div className={`
      ${sidebarOpen ? 'w-64' : 'w-16'}
      h-full shrink-0 bg-white border-r border-gray-200
      transition-all duration-300 flex flex-col shadow-sm
    `}>

            {/* ── Header sidebar ── */}
            <div className="shrink-0 h-14 flex items-center justify-between px-3 border-b border-gray-200 bg-blue-600">
                {sidebarOpen && (
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 bg-white/20 rounded-md flex items-center justify-center flex-shrink-0">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <span className="text-sm font-bold text-white truncate">ProcessMate</span>
                    </div>
                )}
                {!sidebarOpen && (
                    <div className="w-full flex justify-center">
                        <div className="w-6 h-6 bg-white/20 rounded-md flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="text-white/70 hover:text-white transition-colors p-1 flex-shrink-0"
                    title={sidebarOpen ? 'Réduire' : 'Développer'}
                >
                    <ChevronLeft className={`w-4 h-4 transition-transform ${!sidebarOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* ── Sélecteur de module ── */}
            <div className={`shrink-0 border-b border-gray-100 ${sidebarOpen ? 'p-2' : 'p-1.5'}`}>
                {sidebarOpen ? (
                    // Mode étendu — grid 2×2
                    <div className="grid grid-cols-2 gap-1">
                        {MODULES.map(mod => {
                            const Icon = mod.icon;
                            const isActive = activeModule === mod.id;
                            return (
                                <button
                                    key={mod.id}
                                    type="button"
                                    onClick={() => handleModuleChange(mod.id)}
                                    title={mod.label}
                                    className={`
                    flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-center
                    transition-all duration-150 text-xs font-medium
                    ${isActive
                                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                        }
                  `}
                                >
                                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : mod.color} opacity-80`} />
                                    <span className="truncate w-full text-center leading-tight">{mod.label}</span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    // Mode réduit — icônes verticales
                    <div className="flex flex-col gap-1">
                        {MODULES.map(mod => {
                            const Icon = mod.icon;
                            const isActive = activeModule === mod.id;
                            return (
                                <button
                                    key={mod.id}
                                    type="button"
                                    onClick={() => handleModuleChange(mod.id)}
                                    title={mod.label}
                                    className={`
                    flex items-center justify-center w-full py-2 rounded-lg
                    transition-all duration-150
                    ${isActive
                                            ? 'bg-blue-50 text-blue-600'
                                            : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
                                        }
                  `}
                                >
                                    <Icon className="w-4 h-4" />
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Navigation du module actif ── */}
            <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">

                {/* Label section si étendu */}
                {sidebarOpen && (
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        {MODULES.find(m => m.id === activeModule)?.label}
                    </p>
                )}

                {/* Items Orchestration */}
                {activeModule === 'orchestration' && visibleOrchestrationItems.map(item => (
                    <NavButton
                        key={item.id}
                        item={item}
                        active={activeTab === item.id}
                        expanded={sidebarOpen}
                        onClick={() => setActiveTab(item.id)}
                    />
                ))}

                {/* BPMN Studio — pas de sous-items, le contenu est géré dans la page */}
                {activeModule === 'stt' && (
                    <div className={`${sidebarOpen ? 'px-2 py-3' : 'py-2'} text-center`}>
                        {sidebarOpen ? (
                            <p className="text-xs text-gray-400">
                                Les outils du Studio sont disponibles dans la barre contextuelle à droite.
                            </p>
                        ) : (
                            <PenTool className="w-4 h-4 text-violet-400 mx-auto" />
                        )}
                    </div>
                )}

                {/* SFD — pas de sous-items */}
                {activeModule === 'sfd' && (
                    <div className={`${sidebarOpen ? 'px-2 py-3' : 'py-2'} text-center`}>
                        {sidebarOpen ? (
                            <p className="text-xs text-gray-400">
                                Navigation interne au SFD Generator disponible dans le panneau gauche.
                            </p>
                        ) : (
                            <Layers className="w-4 h-4 text-indigo-400 mx-auto" />
                        )}
                    </div>
                )}

                {/* Clinic — pas de sous-items */}
                {activeModule === 'clinic' && (
                    <div className={`${sidebarOpen ? 'px-2 py-3' : 'py-2'} text-center`}>
                        {sidebarOpen ? (
                            <p className="text-xs text-gray-400">
                                Clinic s'ouvre en plein écran dans la zone de contenu.
                            </p>
                        ) : (
                            <Code2 className="w-4 h-4 text-teal-400 mx-auto" />
                        )}
                    </div>
                )}

            </nav>

        </div>
    );
}

// ─── NavButton ────────────────────────────────────────────────

function NavButton({
    item,
    active,
    expanded,
    onClick,
}: {
    item: NavItem;
    active: boolean;
    expanded: boolean;
    onClick: () => void;
}) {
    const Icon = item.icon;

    return (
        <button
            type="button"
            onClick={onClick}
            title={item.label}
            className={`
        w-full flex items-center gap-3 rounded-lg transition-all duration-150 text-sm font-medium
        ${expanded ? 'px-3 py-2' : 'px-0 py-2.5 justify-center'}
        ${active
                    ? 'bg-blue-50 text-blue-900 border-l-4 border-blue-600 pl-2'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }
      `}
        >
            <Icon className={`w-4 h-4 shrink-0 ${active ? item.color : 'text-gray-400'}`} />
            {expanded && <span className="truncate text-left">{item.label}</span>}
        </button>
    );
}
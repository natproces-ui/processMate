'use client';

import React from 'react';
import { ChevronLeft, BarChart3, FileText, Workflow, CheckSquare, PenTool, PenLine, Megaphone, BookOpen, Compass, Zap } from 'lucide-react';
import type { MainModule } from '@/lib/processmate-navigation';

export type ActiveModule = MainModule;

interface SidebarProps {
    activeTab: string;
    activeModule: ActiveModule;
    setActiveTab: (tab: string) => void;
    setActiveModule: (module: ActiveModule) => void;
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    userRole?: string;
}

const SPACES = [
    { id: 'orchestration' as const, label: 'Orchestration', icon: Workflow },
    { id: 'stt' as const, label: 'Studio', icon: PenTool },
];

const ORCHESTRATION_ITEMS = [
    { id: 'procedures', label: 'Procédures', icon: FileText },
    { id: 'workspace', label: 'Mon espace de travail', icon: PenLine },
    { id: 'taches', label: 'Suivi des tâches', icon: CheckSquare },
    { id: 'campagnes', label: 'Campagnes', icon: Megaphone },
    { id: 'analyser', label: 'Analyse', icon: BarChart3 },
    { id: 'specifications', label: 'Spécifications', icon: BookOpen },
    { id: 'tableau-de-bord', label: 'Tableau de bord', icon: BarChart3 },
];

export default function ProcessMateSidebar({ activeTab, activeModule, setActiveTab, setActiveModule, sidebarOpen, setSidebarOpen }: SidebarProps) {
    return (
        <aside aria-label="Navigation ProcessMate" className={[sidebarOpen ? 'w-56' : 'w-14', 'h-full shrink-0 bg-white border-r border-slate-200 flex flex-col transition-[width] duration-200'].join(' ')}>
            <div className="shrink-0 h-14 flex items-center gap-2 px-3 border-b border-blue-500 bg-blue-600">
                {sidebarOpen && <><Zap className="w-5 h-5 text-white shrink-0" /><span className="text-sm font-bold text-white flex-1 truncate">ProcessMate</span></>}
                <button type="button" onClick={() => setSidebarOpen(!sidebarOpen)}
                    aria-label={sidebarOpen ? 'Réduire la navigation' : 'Développer la navigation'} aria-expanded={sidebarOpen}
                    title={sidebarOpen ? 'Réduire la navigation' : 'Développer la navigation'}
                    className="p-1 text-white/80 hover:text-white rounded hover:bg-white/10">
                    <ChevronLeft className={['w-4 h-4', !sidebarOpen ? 'rotate-180' : ''].join(' ')} />
                </button>
            </div>
            <nav aria-label="Espaces de travail" className="shrink-0 p-2 space-y-1 border-b border-slate-100">
                {SPACES.map(space => {
                    const Icon = space.icon;
                    const selected = activeModule === space.id;
                    return (
                        <button key={space.id} type="button" onClick={() => setActiveModule(space.id)}
                            aria-label={space.label} aria-current={selected ? 'page' : undefined} title={space.label}
                            className={['w-full flex items-center gap-2.5 rounded-lg py-2 text-sm font-semibold transition-colors', sidebarOpen ? 'px-2.5' : 'justify-center', selected ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'].join(' ')}>
                            <Icon className="w-4 h-4 shrink-0" />
                            {sidebarOpen && <span>{space.label}</span>}
                        </button>
                    );
                })}
            </nav>
            <nav aria-label="Rubriques Orchestration" className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {sidebarOpen && <p className="px-2.5 pt-2 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Orchestration</p>}
                {ORCHESTRATION_ITEMS.map(item => {
                    const Icon = item.icon;
                    const selected = activeModule === 'orchestration' && (activeTab === item.id || (item.id === 'specifications' && activeTab === 'mockups'));
                    return (
                        <button key={item.id} type="button" onClick={() => setActiveTab(item.id)}
                            aria-label={item.label} aria-current={selected ? 'page' : undefined} title={item.label}
                            className={['w-full flex items-center gap-2.5 rounded-lg py-2 text-xs font-medium transition-colors', sidebarOpen ? 'px-2.5' : 'justify-center', selected ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'].join(' ')}>
                            <Icon className="w-4 h-4 shrink-0" />
                            {sidebarOpen && <span className="truncate">{item.label}</span>}
                        </button>
                    );
                })}
            </nav>
            <div className="shrink-0 p-2 border-t border-slate-100">
                <button type="button" onClick={() => setActiveTab('guide')} aria-label="Guide d’utilisation" title="Guide d’utilisation"
                    aria-current={activeModule === 'orchestration' && activeTab === 'guide' ? 'page' : undefined}
                    className={['w-full flex items-center gap-2.5 rounded-lg py-2 text-xs font-medium text-slate-600 hover:bg-slate-50', sidebarOpen ? 'px-2.5' : 'justify-center'].join(' ')}>
                    <Compass className="w-4 h-4 shrink-0" />
                    {sidebarOpen && <span>Guide d’utilisation</span>}
                </button>
            </div>
        </aside>
    );
}

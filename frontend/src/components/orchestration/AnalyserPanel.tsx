'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
    TriangleAlert, Gauge, Server, MessageSquare, Map, Loader2,
} from 'lucide-react';
import type { TaskActor } from '@/lib/orchestrationTasksApi';

function PanelSkeleton() {
    return (
        <div className="flex h-full items-center justify-center bg-gray-50">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </div>
    );
}

// ── Dynamic imports (only load when first visited) ─────────────
const IrritantsPanel         = dynamic(() => import('@/components/orchestration/IrritantsPanel'),                 { loading: PanelSkeleton });
const ComplexityPanel        = dynamic(() => import('@/components/orchestration/ComplexityPanel'),                { loading: PanelSkeleton });
const ApplicatifsPanel       = dynamic(() => import('@/components/orchestration/ApplicatifsPanel'),              { loading: PanelSkeleton });
const AnalysisWorkspace      = dynamic(() => import('@/components/analysis/AnalysisWorkspace'),                   { loading: PanelSkeleton });
const BianServiceMap         = dynamic(() => import('@/components/orchestration/BianServiceMap'),                 { loading: PanelSkeleton });

// ── Types ──────────────────────────────────────────────────────

export type AnalyserTab = 'irritants' | 'complexity' | 'applicatifs' | 'ia' | 'bian';

interface AnalyserPanelProps {
    actors: TaskActor[];
    currentActor: TaskActor | null;
    isAdmin: boolean;
    onOpenStudio: () => void;
    onGoToProcedures: () => void;
    onGoToWorkspace: () => void;
    initialSubTab?: AnalyserTab;
}

const TABS: { id: AnalyserTab; label: string; icon: React.ElementType }[] = [
    { id: 'irritants',   label: 'Irritants',           icon: TriangleAlert },
    { id: 'complexity',  label: 'Complexité',          icon: Gauge        },
    { id: 'applicatifs', label: 'Applicatifs',         icon: Server       },
    { id: 'ia',          label: 'Analyse IA',          icon: MessageSquare },
    { id: 'bian',        label: 'Carte BIAN',          icon: Map          },
];

// ── Lazy sub-panel (mounts once, stays mounted) ────────────────

function SubPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { if (active && !mounted) setMounted(true); }, [active, mounted]);
    if (!mounted) return null;
    return (
        <div className={active ? 'absolute inset-0 overflow-auto' : 'absolute inset-0 overflow-auto invisible pointer-events-none'}>
            {children}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────

export default function AnalyserPanel({
    actors,
    currentActor,
    isAdmin,
    onOpenStudio,
    onGoToProcedures,
    onGoToWorkspace,
    initialSubTab,
}: AnalyserPanelProps) {
    const [activeTab, setActiveTab] = useState<AnalyserTab>(initialSubTab ?? 'irritants');

    return (
        <div className="h-full flex flex-col bg-gray-50 min-w-0">

            {/* Tab bar */}
            <div className="shrink-0 bg-white border-b border-gray-200 flex items-end gap-0 px-4 pt-2 overflow-x-auto scrollbar-none">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                                active
                                    ? 'border-blue-600 text-blue-700'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Sub-panels */}
            <div className="flex-1 relative overflow-hidden">
                <SubPanel active={activeTab === 'irritants'}>
                    <IrritantsPanel onInstruire={onOpenStudio} />
                </SubPanel>

                <SubPanel active={activeTab === 'complexity'}>
                    <ComplexityPanel />
                </SubPanel>

                <SubPanel active={activeTab === 'applicatifs'}>
                    <ApplicatifsPanel />
                </SubPanel>

                <SubPanel active={activeTab === 'ia'}>
                    <AnalysisWorkspace actors={actors} currentActor={currentActor} />
                </SubPanel>

                <SubPanel active={activeTab === 'bian'}>
                    <BianServiceMap
                        onGoToProcedures={onGoToProcedures}
                        onGoToWorkspace={onGoToWorkspace}
                        isAdmin={isAdmin}
                    />
                </SubPanel>
            </div>
        </div>
    );
}

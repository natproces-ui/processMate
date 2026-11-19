'use client';

import Link from 'next/link';
import { Settings, ExternalLink, Zap } from 'lucide-react';
import type { ActiveModule } from './ProcessMateSidebar';
import NotificationBell from '@/components/processmate/NotificationBell';
import LogoutButton from '@/components/auth/LogoutButton';
import { useAuth } from '@/context/AuthContext';

interface HeaderProps {
    activeModule: ActiveModule;
    activeTab?: string;
    currentActorName?: string;
    currentActorTitle?: string;
    currentActorId?: string;
    onSettingsClick?: () => void;
    onOpenStudio?: () => void;
}

const MODULE_LABELS: Record<ActiveModule, string> = {
    orchestration: 'Orchestration',
    stt: 'Studio',
};

const TAB_LABELS: Record<string, string> = {
    specifications: 'Spécifications',
    mockups: 'Spécifications / Maquettes',
    procedures: 'Procédures',
    campagnes: 'Campagnes',
    taches: 'Suivi des tâches',
    workspace: 'Mon espace',
    analyser: 'Analyse',
    'tableau-de-bord': 'Tableau de bord',
    dashboard: 'Tableau de bord',
    pipeline: 'Pipeline',
    workflow: 'Flux de travail',
    raci: 'Responsabilités',
    validation: 'Validation',
    tasks: 'Suivi des tâches',
    irritants: 'Irritants',
    complexity: 'Complexité',
    'regulatory-impact': "Analyse d'impact",
    applicatifs: 'Cartographie applicative',
    analysis: 'Analyse IA',
    settings: 'Paramètres',
    guide: "Guide d'utilisation",
};

export default function ProcessMateHeader({
    activeModule,
    activeTab,
    currentActorName,
    currentActorTitle,
    currentActorId,
    onSettingsClick,
    onOpenStudio,
}: HeaderProps) {
    const moduleLabel = MODULE_LABELS[activeModule];
    const tabLabel = activeTab ? TAB_LABELS[activeTab] : null;

    const { profile } = useAuth();

    const initials = (currentActorName || 'PM')
        .split(' ')
        .map(p => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    return (
        <div className="shrink-0 h-14 bg-white border-b border-neutral-200 flex items-center justify-between px-6">

            {/* Gauche : logo + breadcrumb */}
            <div className="flex items-center gap-3 min-w-0">
                <Link href="/" className="flex items-center gap-1.5 shrink-0 group" title="Accueil">
                    <div className="w-6 h-6 bg-neutral-900 rounded-md flex items-center justify-center group-hover:bg-neutral-700 transition-colors">
                        <Zap className="w-3.5 h-3.5 text-white" />
                    </div>
                </Link>
                <span className="text-neutral-400 shrink-0">/</span>
                <span className="text-sm font-semibold text-neutral-900 shrink-0">{moduleLabel}</span>
                {tabLabel && (
                    <>
                        <span className="text-neutral-400 shrink-0">/</span>
                        <span className="text-sm font-medium text-neutral-900 truncate">{tabLabel}</span>
                    </>
                )}
            </div>

            {/* Droite : actions + avatar */}
            <div className="flex items-center gap-2 shrink-0">

                {onOpenStudio && activeModule === 'orchestration' && (
                    <button
                        type="button"
                        onClick={onOpenStudio}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-900 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition-colors"
                        title="Ouvrir BPMN Studio"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Studio
                    </button>
                )}

                {/* Cloche avec dropdown notifications */}
                <NotificationBell actorId={currentActorId} />

                {/* Paramètres */}
                <button
                    type="button"
                    onClick={onSettingsClick}
                    title="Paramètres"
                    className="p-2 text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                    <Settings className="w-4 h-4" />
                </button>

                <div className="w-px h-6 bg-neutral-200" />

                {/* Avatar + nom */}
                <Link href="/profile" className="flex items-center gap-2.5 group">
                    <div className="text-right hidden sm:block">
                        <p className="text-xs text-neutral-500 leading-none">{currentActorTitle || 'Utilisateur'}</p>
                        <p className="text-sm font-semibold text-neutral-900 leading-tight mt-0.5 group-hover:underline transition-colors">
                            {currentActorName || 'ProcessMate'}
                        </p>
                    </div>
                    <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-bold text-white text-xs shrink-0 bg-neutral-900 ring-2 ring-transparent group-hover:ring-neutral-300 transition-all">
                        {profile?.avatar_url
                            ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                            : initials
                        }
                    </div>
                </Link>

                <div className="w-px h-6 bg-neutral-200" />
                <LogoutButton iconOnly className="p-2 text-neutral-900 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" />
            </div>
        </div>
    );
}
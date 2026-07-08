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
    orchestration: 'ProcessMate',
    stt: 'BPMN Studio',
    sfd: 'SFD Generator',
    clinic: 'Clinic',
};

const TAB_LABELS: Record<string, string> = {
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
        <div className="shrink-0 h-14 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between px-6">

            {/* Gauche : logo + breadcrumb */}
            <div className="flex items-center gap-3 min-w-0">
                <Link href="/" className="flex items-center gap-1.5 shrink-0 group" title="Accueil">
                    <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center group-hover:bg-blue-700 transition-colors">
                        <Zap className="w-3.5 h-3.5 text-white" />
                    </div>
                </Link>
                <span className="text-gray-200 shrink-0">/</span>
                <span className="text-sm font-bold text-blue-700 shrink-0">{moduleLabel}</span>
                {tabLabel && (
                    <>
                        <span className="text-gray-300 shrink-0">/</span>
                        <span className="text-sm font-medium text-gray-700 truncate">{tabLabel}</span>
                    </>
                )}
            </div>

            {/* Droite : actions + avatar */}
            <div className="flex items-center gap-2 shrink-0">

                {onOpenStudio && activeModule === 'orchestration' && (
                    <button
                        type="button"
                        onClick={onOpenStudio}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg transition-colors"
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
                    className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <Settings className="w-4 h-4" />
                </button>

                <div className="w-px h-6 bg-gray-200" />

                {/* Avatar + nom */}
                <Link href="/profile" className="flex items-center gap-2.5 group">
                    <div className="text-right hidden sm:block">
                        <p className="text-xs text-gray-400 leading-none">{currentActorTitle || 'Utilisateur'}</p>
                        <p className="text-sm font-semibold text-gray-800 leading-tight mt-0.5 group-hover:text-blue-600 transition-colors">
                            {currentActorName || 'ProcessMate'}
                        </p>
                    </div>
                    <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-bold text-white text-xs shrink-0 bg-blue-600 ring-2 ring-transparent group-hover:ring-blue-300 transition-all">
                        {profile?.avatar_url
                            ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                            : initials
                        }
                    </div>
                </Link>

                <div className="w-px h-6 bg-gray-200" />
                <LogoutButton iconOnly className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" />
            </div>
        </div>
    );
}
'use client';

/**
 * Coquille de l'application (comme Claude / ChatGPT) : barre latérale avec nouvelle conversation,
 * recherche, projets, épinglés, récents (actions sur chaque conversation), espace de
 * l'organisation ; en-tête avec le compte. Partagée par le chat, la liste et la page des projets.
 *
 * Hors du chat (pages projets), ouvrir une conversation renvoie vers le chat (/?c=…).
 * Charte : texte, icônes et contours noirs ; gris pour les informations secondaires.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { CONVERSATIONS_ENABLED, conversationsApi, type ConversationSummary } from '@/lib/conversationsApi';
import { projectsApi, type Project } from '@/lib/projectsApi';
import { inboxApi } from '@/lib/inboxApi';
import OnboardingCard from '@/components/home/OnboardingCard';
import InvitationBanner from '@/components/home/InvitationBanner';
import { ConversationRow, SearchDialog } from '@/components/home/ConversationItems';
import {
    Zap, SquarePen, FolderKanban, FileText, CheckSquare, Megaphone, BarChart3, PenTool, Search,
    BookOpen, Newspaper, Compass, Menu, X, LogOut, Users, Clock, Building2, ChevronDown, FolderOpen,
} from 'lucide-react';

export interface AppShellProps {
    children: React.ReactNode;
    /** contenu à gauche de l'en-tête (ex. projet courant) */
    headerLeft?: React.ReactNode;
    activeConversationId?: string | null;
    /** ouvrir une conversation ; par défaut : aller au chat */
    onOpenConversation?: (id: string, projectId: string | null) => void;
    onNewConversation?: () => void;
    /** une conversation a été supprimée (le chat se vide si c'était la conversation ouverte) */
    onConversationDeleted?: (id: string) => void;
    /** incrémenter pour recharger projets et récents (après création, renommage…) */
    refreshKey?: number;
    activeNav?: 'projets';
}

export default function AppShell({
    children, headerLeft, activeConversationId = null, onOpenConversation, onNewConversation,
    onConversationDeleted, refreshKey = 0, activeNav,
}: AppShellProps) {
    const { user, signOut, access } = useAuth();
    const member = !!access?.member;
    const persistent = CONVERSATIONS_ENABLED && !!user;
    const [navOpen, setNavOpen] = useState(false);
    const [recents, setRecents] = useState<ConversationSummary[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [recentsOpen, setRecentsOpen] = useState(true);
    const [searchOpen, setSearchOpen] = useState(false);
    const [todo, setTodo] = useState<{ ouvertes: number; en_retard: number } | null>(null);

    useEffect(() => {
        if (!member || !access?.organisations_mode) return;
        inboxApi.counter().then(setTodo).catch(() => setTodo(null));
    }, [member, access?.organisations_mode]);

    const loadRecents = useCallback(async () => {
        if (!persistent) return;
        try { setRecents(await conversationsApi.list({ limit: 50 })); } catch { /* facultatif */ }
    }, [persistent]);
    const loadProjects = useCallback(async () => {
        if (!persistent) return;
        try { setProjects(await projectsApi.list()); } catch { /* facultatif */ }
    }, [persistent]);
    useEffect(() => { void loadRecents(); void loadProjects(); }, [loadRecents, loadProjects, refreshKey]);

    // Le chat signale une conversation créée ou terminée ; les pages projets signalent leurs changements
    useEffect(() => {
        const onConv = () => { void loadRecents(); };
        const onProj = () => { void loadProjects(); };
        window.addEventListener('processmate:conversation', onConv);
        window.addEventListener('processmate:projects', onProj);
        return () => { window.removeEventListener('processmate:conversation', onConv); window.removeEventListener('processmate:projects', onProj); };
    }, [loadRecents, loadProjects]);

    useEffect(() => {
        if (!persistent) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [persistent]);

    const openConv = (id: string) => {
        setNavOpen(false);
        setSearchOpen(false);
        const conv = recents.find(c => c.id === id);
        if (onOpenConversation) onOpenConversation(id, conv?.project_id ?? null);
        else window.location.href = `/?c=${id}${conv?.project_id ? `&projet=${conv.project_id}` : ''}`;
    };
    const newConv = () => {
        setNavOpen(false);
        if (onNewConversation) onNewConversation(); else window.location.href = '/';
    };
    const onChanged = (id: string) => (next: ConversationSummary | null) => {
        setRecents(prev => (next ? prev.map(c => (c.id === id ? next : c)) : prev.filter(c => c.id !== id)));
        if (!next) onConversationDeleted?.(id);
        window.dispatchEvent(new CustomEvent('processmate:conversation-list', { detail: { id, deleted: !next } }));
    };

    const pinnedConvs = useMemo(() => recents.filter(c => c.pinned_at), [recents]);
    const otherConvs = useMemo(() => recents.filter(c => !c.pinned_at), [recents]);
    const pinnedProjects = useMemo(() => projects.filter(p => p.pinned_at), [projects]);
    const sectionLabel = 'px-2 pb-1 text-xs font-medium text-neutral-500';

    const nav = (
        <nav aria-label="Navigation" className="h-full flex flex-col bg-neutral-50 border-r border-neutral-200 w-72 text-neutral-900">
            <div className="h-14 shrink-0 flex items-center justify-between px-3">
                <Link href="/" className="flex items-center gap-2 text-[17px] font-semibold text-neutral-900">
                    <span className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center"><Zap className="w-4 h-4 text-white" /></span>
                    ProcessMate
                </Link>
                <button type="button" onClick={() => setNavOpen(false)} aria-label="Fermer le menu" className="md:hidden p-1.5 rounded-lg text-neutral-900 hover:bg-neutral-200"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-2 space-y-0.5">
                <NavButton onClick={newConv} icon={<SquarePen />} label="Nouvelle conversation" />
                {persistent && <NavButton onClick={() => setSearchOpen(true)} icon={<Search />} label="Rechercher" hint="Ctrl K" />}
                {persistent && <NavLink href="/projets" icon={<FolderKanban />} label="Projets" active={activeNav === 'projets'} />}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-4 space-y-5">
                {persistent && (pinnedConvs.length > 0 || pinnedProjects.length > 0) && (
                    <section aria-label="Épinglés">
                        <p className={sectionLabel}>Épinglés</p>
                        <ul className="space-y-0.5">
                            {pinnedProjects.map(p => (
                                <li key={p.id}><NavLink href={`/projet/?id=${p.id}`} icon={<FolderOpen />} label={p.name} /></li>
                            ))}
                            {pinnedConvs.map(c => (
                                <ConversationRow key={c.id} conv={c} active={c.id === activeConversationId} onOpen={openConv} onChanged={onChanged(c.id)} />
                            ))}
                        </ul>
                    </section>
                )}
                <section aria-label="Conversations récentes">
                    <button type="button" onClick={() => setRecentsOpen(o => !o)} aria-expanded={recentsOpen}
                        className={`${sectionLabel} flex items-center gap-1 hover:text-neutral-900`}>
                        Récents <ChevronDown className={`w-3 h-3 transition-transform ${recentsOpen ? '' : '-rotate-90'}`} />
                    </button>
                    {recentsOpen && (!user ? (
                        <p className="px-2 text-sm text-neutral-700 leading-relaxed">
                            <Link href="/auth/login/" className="font-medium text-neutral-900 underline">Connectez-vous</Link> pour retrouver vos conversations.
                        </p>
                    ) : !CONVERSATIONS_ENABLED ? (
                        <p className="px-2 text-sm text-neutral-600">Historique bientôt disponible.</p>
                    ) : otherConvs.length === 0 ? (
                        <p className="px-2 text-sm text-neutral-600">Aucune conversation pour l&apos;instant.</p>
                    ) : (
                        <ul className="space-y-0.5">
                            {otherConvs.map(c => (
                                <ConversationRow key={c.id} conv={c} active={c.id === activeConversationId} onOpen={openConv} onChanged={onChanged(c.id)} />
                            ))}
                        </ul>
                    ))}
                </section>
                {user && member && (
                    <section aria-label="Espace de l'organisation" className="space-y-0.5">
                        <p className={`${sectionLabel} truncate`} title={access?.organisation?.nom ?? undefined}>
                            {access?.organisation?.nom || 'Organisation'}
                        </p>
                        <NavLink href="/orchestration?tab=procedures" icon={<FileText />} label="Référentiel" />
                        <NavLink href="/orchestration?tab=taches" icon={<CheckSquare />} label="À faire"
                            badge={todo ? { count: todo.ouvertes, late: todo.en_retard } : undefined} />
                        <NavLink href="/orchestration?tab=campagnes" icon={<Megaphone />} label="Campagnes" />
                        <NavLink href="/orchestration?tab=analyser" icon={<BarChart3 />} label="Analyse" />
                        <NavLink href="/orchestration?module=stt" icon={<PenTool />} label="Studio complet" />
                        {access?.is_admin && <NavLink href="/admin" icon={<Users />} label="Utilisateurs" />}
                    </section>
                )}
                {user && access?.is_admin && access.organisations_mode && <OnboardingCard />}
                {user && !member && <InvitationBanner />}
                {user && access?.is_platform_admin && (
                    <section aria-label="Plateforme" className="space-y-0.5">
                        <NavLink href="/plateforme" icon={<Building2 />} label="Plateforme processMate" />
                    </section>
                )}
                {user && access && !member && !access.is_platform_admin && (
                    <p className="flex gap-2 rounded-lg bg-neutral-100 px-2.5 py-2 text-sm text-neutral-700">
                        <Clock className="w-4 h-4 shrink-0 mt-0.5 text-neutral-900" />
                        <span>L&apos;accès au référentiel de l&apos;organisation est donné par un administrateur.</span>
                    </p>
                )}
            </div>
            <div className="shrink-0 border-t border-neutral-200 p-2 space-y-0.5">
                <NavLink href="/decouvrir" icon={<Compass />} label="Découvrir ProcessMate" />
                <NavLink href="/guide" icon={<BookOpen />} label="Guide" />
                <NavLink href="/blog" icon={<Newspaper />} label="Blog" />
            </div>
        </nav>
    );

    return (
        <div className="h-screen flex bg-white overflow-hidden">
            <div className="hidden md:block shrink-0">{nav}</div>
            {navOpen && (
                <div className="md:hidden fixed inset-0 z-50 flex">
                    <div className="shrink-0 shadow-xl">{nav}</div>
                    <button type="button" aria-label="Fermer le menu" className="flex-1 bg-black/30" onClick={() => setNavOpen(false)} />
                </div>
            )}
            <div className="flex-1 min-w-0 flex flex-col">
                <header className="h-14 shrink-0 flex items-center justify-between gap-2 border-b border-neutral-200 px-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <button type="button" onClick={() => setNavOpen(true)} aria-label="Ouvrir le menu" className="md:hidden p-1.5 rounded-lg text-neutral-900 hover:bg-neutral-100">
                            <Menu className="w-5 h-5" />
                        </button>
                        {headerLeft}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        {user ? (
                            <>
                                <span className="hidden sm:inline text-sm text-neutral-900 truncate max-w-[220px]">{user.email}</span>
                                <button type="button" onClick={() => signOut()} title="Se déconnecter" aria-label="Se déconnecter"
                                    className="p-1.5 rounded-lg text-neutral-900 hover:bg-neutral-100"><LogOut className="w-4 h-4" /></button>
                            </>
                        ) : (
                            <>
                                <Link href="/auth/login/" className="px-3 py-1.5 rounded-lg font-medium text-neutral-900 hover:bg-neutral-100">Connexion</Link>
                                <Link href="/auth/signup/" className="px-3 py-1.5 rounded-lg bg-neutral-900 font-medium text-white hover:bg-neutral-700">Inscription</Link>
                            </>
                        )}
                    </div>
                </header>
                {children}
            </div>
            {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} onOpen={openConv} />}
        </div>
    );
}

const itemCls = 'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-neutral-900 hover:bg-neutral-200/70 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:shrink-0';

function NavButton({ onClick, icon, label, hint }: { onClick: () => void; icon: React.ReactNode; label: string; hint?: string }) {
    return (
        <button type="button" onClick={onClick} className={itemCls}>
            {icon}<span className="truncate">{label}</span>
            {hint && <span className="ml-auto text-[11px] text-neutral-500">{hint}</span>}
        </button>
    );
}

function NavLink({ href, icon, label, badge, active }: { href: string; icon: React.ReactNode; label: string; badge?: { count: number; late: number }; active?: boolean }) {
    return (
        <Link href={href} className={`${itemCls} ${active ? 'bg-neutral-200' : ''}`} aria-current={active ? 'page' : undefined}>
            {icon}<span className="truncate">{label}</span>
            {badge && badge.count > 0 && (
                <span aria-label={`${badge.count} tâche(s) à faire${badge.late ? `, dont ${badge.late} en retard` : ''}`}
                    className={`ml-auto min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-semibold ${badge.late ? 'bg-red-100 text-red-700' : 'bg-neutral-200 text-neutral-900'}`}>
                    {badge.count}
                </span>
            )}
        </Link>
    );
}

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
import { ConversationHeader, ConversationRow, SearchDialog } from '@/components/home/ConversationItems';
import {
    Zap, SquarePen, FolderKanban, FileText, CheckSquare, Megaphone, BarChart3, PenTool, Search,
    BookOpen, Newspaper, Compass, Menu, X, LogOut, Users, Clock, Building2, ChevronDown, FolderOpen,
    PanelLeftClose, PanelLeftOpen, Home, PenLine, Settings, MoreHorizontal, LayoutDashboard, Pin,
} from 'lucide-react';
import NotificationBell from '@/components/processmate/NotificationBell';

const SIDEBAR_KEY = 'processmate-sidebar';
const MIN_W = 220, MAX_W = 420, DEFAULT_W = 288;

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
    /** entrée active de la barre : 'projets', 'espace', 'equipe', ou 'tab:<onglet>' de l'Orchestration */
    activeNav?: string;
}

/** Pages de l'organisation (membres). La barre n'affiche que celles qu'on a épinglées ; « Plus » les liste toutes,
 *  chacune épinglable (comme ChatGPT). Les épingles restent dans le navigateur de chacun. */
interface OrgPage { key: string; href: string; label: string; icon: typeof FileText; admin?: boolean }
const ORG_PAGES: OrgPage[] = [
    { key: 'tab:procedures', href: '/orchestration?tab=procedures', label: 'Référentiel', icon: FileText },
    { key: 'tab:campagnes', href: '/orchestration?tab=campagnes', label: 'Campagnes', icon: Megaphone },
    { key: 'tab:analyser', href: '/orchestration?tab=analyser', label: 'Analyse', icon: BarChart3 },
    { key: 'tab:workspace', href: '/orchestration?tab=workspace', label: 'Espace de travail', icon: PenLine },
    { key: 'equipe', href: '/admin', label: 'Équipe', icon: Users, admin: true },
    { key: 'tab:specifications', href: '/orchestration?tab=specifications', label: 'Spécifications', icon: BookOpen },
    { key: 'tab:tableau-de-bord', href: '/orchestration?tab=tableau-de-bord', label: 'Tableau de bord', icon: LayoutDashboard },
    { key: 'stt', href: '/orchestration?module=stt', label: 'Studio complet', icon: PenTool },
    { key: 'tab:settings', href: '/orchestration?tab=settings', label: 'Paramètres', icon: Settings, admin: true },
];
const DEFAULT_PINS = ['tab:procedures', 'tab:campagnes', 'tab:analyser', 'tab:workspace'];
const PINS_KEY = 'pm-sidebar-pins';
function readPins(): string[] {
    try { const v = JSON.parse(localStorage.getItem(PINS_KEY) || 'null'); return Array.isArray(v) ? v : DEFAULT_PINS; }
    catch { return DEFAULT_PINS; }
}

export default function AppShell({
    children, headerLeft, activeConversationId = null, onOpenConversation, onNewConversation,
    onConversationDeleted, refreshKey = 0, activeNav,
}: AppShellProps) {
    const { user, signOut, access, profile } = useAuth();
    const member = !!access?.member;
    const persistent = CONVERSATIONS_ENABLED && !!user;
    const [navOpen, setNavOpen] = useState(false);
    const [recents, setRecents] = useState<ConversationSummary[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [recentsOpen, setRecentsOpen] = useState(true);
    const [moreOpen, setMoreOpen] = useState(false);
    // position du menu « Plus » dans la fenêtre : la barre latérale défile et couperait un menu placé dedans
    const [morePos, setMorePos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
    const openMore = (btn: HTMLElement) => {
        const r = btn.getBoundingClientRect();
        const below = window.innerHeight - r.bottom;
        setMorePos(below >= 380 ? { left: r.left + 8, top: r.bottom + 4 } : { left: r.left + 8, bottom: window.innerHeight - r.top + 4 });
        setMoreOpen(true);
    };
    const [pins, setPins] = useState<string[]>(DEFAULT_PINS);
    useEffect(() => { setPins(readPins()); }, []);
    const togglePin = (key: string) => setPins(prev => {
        const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
        try { localStorage.setItem(PINS_KEY, JSON.stringify(next)); } catch { /* navigation privée */ }
        return next;
    });
    const orgPages = ORG_PAGES.filter(pg => !pg.admin || access?.is_admin);
    // épinglées, dans l'ordre du catalogue, plus la page en cours si elle ne l'est pas (on sait où l'on est)
    const shownPages = orgPages.filter(pg => pins.includes(pg.key) || pg.key === activeNav);
    const [searchOpen, setSearchOpen] = useState(false);
    const [todo, setTodo] = useState<{ ouvertes: number; en_retard: number } | null>(null);
    // Barre latérale : l'utilisateur la replie (colonne d'icônes) ou l'élargit ; rien n'est automatique
    const [collapsed, setCollapsed] = useState(false);
    const [width, setWidth] = useState(DEFAULT_W);
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(SIDEBAR_KEY) || '{}');
            if (typeof saved.collapsed === 'boolean') setCollapsed(saved.collapsed);
            if (typeof saved.width === 'number') setWidth(Math.min(MAX_W, Math.max(MIN_W, saved.width)));
        } catch { /* préférence facultative */ }
    }, []);
    const saveSidebar = (patch: { collapsed?: boolean; width?: number }) => {
        try { localStorage.setItem(SIDEBAR_KEY, JSON.stringify({ collapsed, width, ...patch })); } catch { /* facultatif */ }
    };
    const toggleCollapsed = useCallback(() => {
        setCollapsed(c => { saveSidebar({ collapsed: !c }); return !c; });
    }, [width]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleCollapsed(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [toggleCollapsed]);
    const startResize = (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX, startW = width;
        let w = startW;
        const onMove = (ev: MouseEvent) => { w = Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX)); setWidth(w); };
        const onUp = () => {
            saveSidebar({ width: w });
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = ''; document.body.style.userSelect = '';
        };
        document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

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
        window.addEventListener('processmate:conversation-refresh', onConv); // titre trouvé après la réponse
        window.addEventListener('processmate:projects', onProj);
        return () => {
            window.removeEventListener('processmate:conversation', onConv);
            window.removeEventListener('processmate:conversation-refresh', onConv);
            window.removeEventListener('processmate:projects', onProj);
        };
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
        if (onNewConversation) onNewConversation(); else window.location.href = '/?nouvelle=1';
    };
    const onChanged = (id: string) => (next: ConversationSummary | null) => {
        setRecents(prev => (next ? prev.map(c => (c.id === id ? next : c)) : prev.filter(c => c.id !== id)));
        if (!next) onConversationDeleted?.(id);
        window.dispatchEvent(new CustomEvent('processmate:conversation-list', { detail: { id, deleted: !next } }));
    };

    const pinnedConvs = useMemo(() => recents.filter(c => c.pinned_at), [recents]);
    const activeConv = activeConversationId ? recents.find(c => c.id === activeConversationId) : undefined;
    const otherConvs = useMemo(() => recents.filter(c => !c.pinned_at), [recents]);
    const pinnedProjects = useMemo(() => projects.filter(p => p.pinned_at), [projects]);
    const sectionLabel = 'px-2 pb-1 text-xs font-medium text-neutral-500';

    const nav = (
        <nav aria-label="Navigation" style={{ width }} className="h-full flex flex-col bg-neutral-50 border-r border-neutral-200 text-neutral-900 max-w-[85vw]">
            <div className="h-14 shrink-0 flex items-center justify-between px-3">
                <Link href={member ? '/espace' : '/'} className="flex items-center gap-2 text-[17px] font-semibold text-neutral-900">
                    <span className="w-7 h-7 rounded-lg bg-neutral-900 flex items-center justify-center"><Zap className="w-4 h-4 text-white" /></span>
                    ProcessMate
                </Link>
                <button type="button" onClick={() => setNavOpen(false)} aria-label="Fermer le menu" className="md:hidden p-1.5 rounded-lg text-neutral-900 hover:bg-neutral-200"><X className="w-4 h-4" /></button>
                <button type="button" onClick={toggleCollapsed} aria-label="Replier la barre latérale" title="Replier (Ctrl B)"
                    className="hidden md:inline-flex p-1.5 rounded-lg text-neutral-900 hover:bg-neutral-200"><PanelLeftClose className="w-4 h-4" /></button>
            </div>
            <div className="px-2 space-y-0.5">
                <NavButton onClick={newConv} icon={<SquarePen />} label="Nouvelle conversation" />
                {persistent && <NavButton onClick={() => setSearchOpen(true)} icon={<Search />} label="Rechercher" hint="Ctrl K" />}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-4 space-y-5">
                {((user && member) || persistent) && (
                    <section aria-label="Mon travail" className="space-y-0.5">
                        <p className={sectionLabel}>Mon travail</p>
                        {user && member && <NavLink href="/espace" icon={<Home />} label="Accueil" active={activeNav === 'espace'} />}
                        {user && member && <NavLink href="/orchestration?tab=taches" icon={<CheckSquare />} label="À faire" active={activeNav === 'tab:taches'}
                            badge={todo ? { count: todo.ouvertes, late: todo.en_retard } : undefined} />}
                        {persistent && <NavLink href="/projets" icon={<FolderKanban />} label="Projets" active={activeNav === 'projets'} />}
                    </section>
                )}
                {user && member && (
                    <section aria-label="Espace de l'organisation" className="space-y-0.5">
                        <p className={`${sectionLabel} truncate`} title={access?.organisation?.nom ?? undefined}>
                            {access?.organisation?.nom || 'Organisation'}
                        </p>
                        {shownPages.map(pg => <NavLink key={pg.key} href={pg.href} icon={<pg.icon />} label={pg.label} active={activeNav === pg.key} />)}
                        <div className="relative">
                            <button type="button" onClick={e => { if (moreOpen) setMoreOpen(false); else openMore(e.currentTarget); }} aria-expanded={moreOpen} aria-haspopup="menu" className={itemCls}>
                                <MoreHorizontal /><span className="truncate">Plus</span>
                            </button>
                            {moreOpen && (
                                <>
                                    <button type="button" aria-label="Fermer le menu" tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setMoreOpen(false)} />
                                    <div role="menu" aria-label="Toutes les pages" onKeyDown={e => { if (e.key === 'Escape') setMoreOpen(false); }}
                                        style={morePos ? { left: morePos.left, top: morePos.top, bottom: morePos.bottom } : undefined}
                                        className="fixed z-50 max-h-[calc(100vh-16px)] w-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg">
                                        {orgPages.map(pg => {
                                            const pinned = pins.includes(pg.key);
                                            return (
                                                <div key={pg.key} className="flex items-center rounded-lg hover:bg-neutral-100">
                                                    <Link href={pg.href} role="menuitem" onClick={() => setMoreOpen(false)}
                                                        className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-sm text-neutral-900 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-petrole">
                                                        <pg.icon /><span className="truncate">{pg.label}</span>
                                                    </Link>
                                                    <button type="button" onClick={() => togglePin(pg.key)} aria-pressed={pinned}
                                                        title={pinned ? 'Retirer de la barre' : 'Épingler dans la barre'} aria-label={`${pinned ? 'Retirer' : 'Épingler'} ${pg.label}`}
                                                        className={`mr-1 rounded-md p-1.5 hover:bg-neutral-200 ${pinned ? 'text-petrole' : 'text-neutral-400'}`}>
                                                        <Pin className={`h-3.5 w-3.5 ${pinned ? 'fill-current' : ''}`} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </section>
                )}
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
                {!user && <NavLink href="/decouvrir" icon={<Compass />} label="Découvrir ProcessMate" />}
                <NavLink href="/guide" icon={<BookOpen />} label="Guide" />
                {!user && <NavLink href="/blog" icon={<Newspaper />} label="Blog" />}
            </div>
        </nav>
    );

    const rail = (
        <nav aria-label="Navigation" className="h-full w-14 flex flex-col items-center gap-1 bg-neutral-50 border-r border-neutral-200 py-3 text-neutral-900">
            <button type="button" onClick={toggleCollapsed} aria-label="Déplier la barre latérale" title="Déplier (Ctrl B)"
                className="mb-2 p-2 rounded-lg hover:bg-neutral-200"><PanelLeftOpen className="w-5 h-5" /></button>
            <RailButton label="Nouvelle conversation" onClick={newConv}><SquarePen /></RailButton>
            {persistent && <RailButton label="Rechercher (Ctrl K)" onClick={() => setSearchOpen(true)}><Search /></RailButton>}
            {persistent && <RailLink label="Projets" href="/projets"><FolderKanban /></RailLink>}
            {user && member && <>
                <div className="my-2 h-px w-8 bg-neutral-200" />
                <RailLink label="Accueil" href="/espace"><Home /></RailLink>
                <RailLink label="À faire" href="/orchestration?tab=taches"><CheckSquare /></RailLink>
                {shownPages.map(pg => <RailLink key={pg.key} label={pg.label} href={pg.href}><pg.icon /></RailLink>)}
            </>}
        </nav>
    );

    return (
        <div className="h-screen flex bg-white overflow-hidden">
            <div className="hidden md:block shrink-0 relative">
                {collapsed ? rail : nav}
                {!collapsed && (
                    <div role="separator" aria-orientation="vertical" aria-label="Redimensionner la barre latérale" title="Glisser pour redimensionner"
                        onMouseDown={startResize} onDoubleClick={() => { setWidth(DEFAULT_W); saveSidebar({ width: DEFAULT_W }); }}
                        className="absolute top-0 -right-1 h-full w-2 cursor-col-resize z-10 hover:bg-neutral-900/20" />
                )}
            </div>
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
                        {headerLeft ?? (activeConv && (
                            <ConversationHeader key={activeConv.id} conv={activeConv}
                                projectName={projects.find(p => p.id === activeConv.project_id)?.name}
                                onChanged={onChanged(activeConv.id)} />
                        ))}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        {user ? (
                            <>
                                {member && profile?.id && <NotificationBell actorId={profile.id} />}
                                <Link href="/profile" title="Mon profil" className="hidden sm:inline text-sm text-neutral-900 truncate max-w-[220px] rounded-lg px-1.5 py-1 hover:bg-neutral-100">{user.email}</Link>
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

const itemCls = 'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-neutral-900 hover:bg-neutral-200/70 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:shrink-0 [&_svg]:text-petrole';

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
        <Link href={href} className={`${itemCls} ${active ? 'bg-petrole-tint font-semibold hover:bg-petrole-tint' : ''}`} aria-current={active ? 'page' : undefined}>
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

function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} aria-label={label} title={label}
            className="p-2 rounded-lg text-petrole hover:bg-neutral-200 [&_svg]:w-5 [&_svg]:h-5">{children}</button>
    );
}

function RailLink({ label, href, children }: { label: string; href: string; children: React.ReactNode }) {
    return (
        <Link href={href} aria-label={label} title={label}
            className="p-2 rounded-lg text-petrole hover:bg-neutral-200 [&_svg]:w-5 [&_svg]:h-5">{children}</Link>
    );
}

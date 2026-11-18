'use client';

// Page d'accueil « chat d'abord » (lot 4) : comme Claude ou ChatGPT, on arrive dans le chat.
// Sans compte : une première procédure est possible, rien n'est enregistré (limites invité).
// Avec un compte : conversations enregistrées, projets, et accès à l'espace ProcessMate existant.
// Le chat et le panneau de procédure sont ceux du Studio (SttPanel) : pas de troisième éditeur.

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { CONVERSATIONS_ENABLED, conversationsApi, readConversationParam, writeConversationParam, type ConversationSummary } from '@/lib/conversationsApi';
import { guestStore, GUEST_CONVERSATION_KEY, type GuestConversation } from '@/lib/guestStore';
import OnboardingCard from '@/components/home/OnboardingCard';
import {
    Zap, PenLine, FolderKanban, FileText, CheckSquare, Megaphone, BarChart3, PenTool,
    BookOpen, Newspaper, Compass, Menu, X, Loader2, RotateCw, LogOut, MessageSquare, Users, Clock, Building2,
} from 'lucide-react';

const SttPanel = dynamic(() => import('@/components/processmate/SttPanel'), {
    ssr: false,
    loading: () => <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>,
});

export default function ChatHome() {
    const { user, loading, signOut, access } = useAuth();
    const member = !!access?.member;
    const [navOpen, setNavOpen] = useState(false);
    const [panelKey, setPanelKey] = useState(0);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [projectId, setProjectId] = useState<string | undefined>();
    /** Procédure du référentiel ouverte depuis une campagne (?procedure=) */
    const [procedureId, setProcedureId] = useState<string | undefined>();
    const [recents, setRecents] = useState<ConversationSummary[]>([]);
    const [recentsLoading, setRecentsLoading] = useState(false);
    const [guestWork, setGuestWork] = useState<GuestConversation | null>(null);
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const persistent = CONVERSATIONS_ENABLED && !!user;

    useEffect(() => {
        setActiveId(readConversationParam());
        const params = new URLSearchParams(window.location.search);
        const p = params.get('projet');
        if (p) setProjectId(p);
        const proc = params.get('procedure');
        if (proc) setProcedureId(proc);
    }, []);

    const loadRecents = useCallback(async () => {
        if (!persistent) return;
        setRecentsLoading(true);
        try { setRecents(await conversationsApi.list({ limit: 30 })); } catch { /* liste facultative */ }
        finally { setRecentsLoading(false); }
    }, [persistent]);

    useEffect(() => { loadRecents(); }, [loadRecents, panelKey]);

    // Travail fait en invité dans ce navigateur : proposé à la reprise une fois connecté
    useEffect(() => {
        if (!user || !CONVERSATIONS_ENABLED) return;
        guestStore.get(GUEST_CONVERSATION_KEY).then(saved => { if (saved?.messages?.length) setGuestWork(saved); });
    }, [user]);

    const open = (id: string | null) => {
        writeConversationParam(id);
        setActiveId(id);
        setPanelKey(k => k + 1); // le chat relit ?c= à son montage
        setNavOpen(false);
    };

    const importGuest = async () => {
        if (!guestWork) return;
        setImporting(true);
        setImportError(null);
        try {
            const conv = await conversationsApi.importGuest({ messages: guestWork.messages });
            await guestStore.remove(GUEST_CONVERSATION_KEY);
            setGuestWork(null);
            open(conv.id);
        } catch (err: unknown) {
            setImportError(err instanceof Error ? err.message : 'Reprise impossible');
        } finally {
            setImporting(false);
        }
    };

    const ignoreGuest = async () => {
        await guestStore.remove(GUEST_CONVERSATION_KEY);
        setGuestWork(null);
    };

    if (loading) {
        return <div className="h-screen flex items-center justify-center bg-white"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>;
    }

    const nav = (
        <nav aria-label="Navigation" className="h-full flex flex-col bg-slate-50 border-r border-slate-200 w-64">
            <div className="h-12 shrink-0 flex items-center justify-between px-3">
                <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
                    <span className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center"><Zap className="w-4 h-4 text-white" /></span>
                    ProcessMate
                </Link>
                <button type="button" onClick={() => setNavOpen(false)} aria-label="Fermer le menu" className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-200"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-3 pb-2">
                <button type="button" onClick={() => open(null)}
                    className="w-full flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                    <PenLine className="w-4 h-4" /> Nouvelle conversation
                </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 space-y-4">
                {persistent && (
                    <NavLink href="/projets" icon={<FolderKanban className="w-4 h-4" />} label="Projets" />
                )}
                <section aria-label="Conversations récentes">
                    <div className="flex items-center justify-between px-2 pb-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Récents</p>
                        {persistent && (
                            <button type="button" onClick={loadRecents} aria-label="Actualiser les conversations" className="p-1 rounded text-slate-400 hover:text-slate-700">
                                <RotateCw className={`w-3 h-3 ${recentsLoading ? 'animate-spin' : ''}`} />
                            </button>
                        )}
                    </div>
                    {!user ? (
                        <p className="px-2 text-xs text-slate-500 leading-relaxed">
                            <Link href="/auth/login/" className="text-blue-600 hover:underline">Connectez-vous</Link> pour retrouver vos conversations.
                        </p>
                    ) : !CONVERSATIONS_ENABLED ? (
                        <p className="px-2 text-xs text-slate-400">Historique bientôt disponible.</p>
                    ) : recents.length === 0 ? (
                        <p className="px-2 text-xs text-slate-400">Aucune conversation pour l&apos;instant.</p>
                    ) : (
                        <ul className="space-y-0.5">
                            {recents.map(c => (
                                <li key={c.id}>
                                    <button type="button" onClick={() => open(c.id)} title={c.title}
                                        aria-current={c.id === activeId ? 'page' : undefined}
                                        className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${c.id === activeId ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}>
                                        <MessageSquare className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                        <span className="truncate">{c.title}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
                {user && member && (
                    <section aria-label="Espace de l'organisation" className="space-y-0.5">
                        <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 truncate" title={access?.organisation?.nom ?? undefined}>
                            {access?.organisation?.nom || 'Organisation'}
                        </p>
                        <NavLink href="/orchestration?tab=procedures" icon={<FileText className="w-4 h-4" />} label="Référentiel" />
                        <NavLink href="/orchestration?tab=taches" icon={<CheckSquare className="w-4 h-4" />} label="À faire" />
                        <NavLink href="/orchestration?tab=campagnes" icon={<Megaphone className="w-4 h-4" />} label="Campagnes" />
                        <NavLink href="/orchestration?tab=analyser" icon={<BarChart3 className="w-4 h-4" />} label="Analyse" />
                        <NavLink href="/orchestration?module=stt" icon={<PenTool className="w-4 h-4" />} label="Studio complet" />
                        {access?.is_admin && <NavLink href="/admin" icon={<Users className="w-4 h-4" />} label="Utilisateurs" />}
                    </section>
                )}
                {user && access?.is_admin && access.organisations_mode && <OnboardingCard />}
                {user && access?.is_platform_admin && (
                    <section aria-label="Plateforme" className="space-y-0.5">
                        <NavLink href="/plateforme" icon={<Building2 className="w-4 h-4" />} label="Plateforme processMate" />
                    </section>
                )}
                {user && access && !member && !access.is_platform_admin && (
                    <p className="flex gap-2 rounded-lg bg-slate-100 px-2.5 py-2 text-xs text-slate-600">
                        <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                        <span>L&apos;accès au référentiel de l&apos;organisation est donné par un administrateur.</span>
                    </p>
                )}
            </div>
            <div className="shrink-0 border-t border-slate-200 p-2 space-y-0.5">
                <NavLink href="/decouvrir" icon={<Compass className="w-4 h-4" />} label="Découvrir ProcessMate" />
                <NavLink href="/guide" icon={<BookOpen className="w-4 h-4" />} label="Guide" />
                <NavLink href="/blog" icon={<Newspaper className="w-4 h-4" />} label="Blog" />
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
                <header className="h-12 shrink-0 flex items-center justify-between gap-2 border-b border-slate-200 px-3">
                    <button type="button" onClick={() => setNavOpen(true)} aria-label="Ouvrir le menu" className="md:hidden p-1.5 rounded-lg text-slate-600 hover:bg-slate-100">
                        <Menu className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-slate-500 truncate">{projectId ? 'Conversation de projet' : ''}</span>
                    <div className="flex items-center gap-2 text-sm">
                        {user ? (
                            <>
                                <span className="hidden sm:inline text-xs text-slate-500 truncate max-w-[200px]">{user.email}</span>
                                <button type="button" onClick={() => signOut()} title="Se déconnecter" aria-label="Se déconnecter"
                                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><LogOut className="w-4 h-4" /></button>
                            </>
                        ) : (
                            <>
                                <Link href="/auth/login/" className="px-3 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100">Connexion</Link>
                                <Link href="/auth/signup/" className="px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700">Inscription</Link>
                            </>
                        )}
                    </div>
                </header>
                {guestWork && (
                    <div className="shrink-0 border-b border-blue-200 bg-blue-50 px-4 py-2.5 flex flex-wrap items-center gap-2 text-sm text-blue-900">
                        <span>Vous avez commencé une conversation sans compte dans ce navigateur. La reprendre dans votre compte ?</span>
                        <button type="button" onClick={importGuest} disabled={importing}
                            className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                            {importing ? 'Reprise…' : 'Reprendre'}
                        </button>
                        <button type="button" onClick={ignoreGuest} disabled={importing} className="rounded-lg px-3 py-1 text-xs text-blue-700 hover:bg-blue-100">Ignorer</button>
                        {importError && <span className="text-xs text-red-600">{importError}</span>}
                    </div>
                )}
                <div className="flex-1 min-h-0">
                    <SttPanel key={panelKey} chatFirst guestMode={!user} projectId={projectId}
                        workflowId={member ? procedureId : undefined}
                        librarySave={member && !access?.read_only} />
                </div>
            </div>
        </div>
    );
}

function NavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
        <Link href={href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">
            <span className="text-slate-400">{icon}</span>{label}
        </Link>
    );
}

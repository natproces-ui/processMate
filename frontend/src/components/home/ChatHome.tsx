'use client';

// Page d'accueil « chat d'abord » : comme Claude ou ChatGPT, on arrive dans le chat.
// Sans compte : une première procédure est possible, rien n'est enregistré (limites invité).
// Avec un compte : conversations et projets (barre latérale partagée : AppShell).
// Le chat et le panneau de procédure sont ceux du Studio (SttPanel) : pas de troisième éditeur.

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { CONVERSATIONS_ENABLED, conversationsApi, readConversationParam, writeConversationParam } from '@/lib/conversationsApi';
import { projectsApi, type Project } from '@/lib/projectsApi';
import { guestStore, GUEST_CONVERSATION_KEY, type GuestConversation } from '@/lib/guestStore';
import AppShell from '@/components/home/AppShell';
import { FolderOpen, Loader2 } from 'lucide-react';

const SttPanel = dynamic(() => import('@/components/processmate/SttPanel'), {
    ssr: false,
    loading: () => <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-neutral-900" /></div>,
});

export default function ChatHome() {
    const { user, loading, access } = useAuth();
    const member = !!access?.member;
    const [panelKey, setPanelKey] = useState(0);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [projectId, setProjectId] = useState<string | undefined>();
    const [project, setProject] = useState<Project | null>(null);
    /** Procédure du référentiel ouverte depuis une campagne (?procedure=) */
    const [procedureId, setProcedureId] = useState<string | undefined>();
    /** Premier message tapé depuis la page d'un projet (?message=), envoyé tout seul */
    const [initialMessage, setInitialMessage] = useState<string | undefined>();
    const [refreshKey, setRefreshKey] = useState(0);
    const [guestWork, setGuestWork] = useState<GuestConversation | null>(null);
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    useEffect(() => {
        setActiveId(readConversationParam());
        const params = new URLSearchParams(window.location.search);
        const p = params.get('projet');
        if (p) setProjectId(p);
        const proc = params.get('procedure');
        if (proc) setProcedureId(proc);
        const msg = params.get('message');
        if (msg) {
            setInitialMessage(msg);
            params.delete('message'); // pas de second envoi au rechargement
            window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
        }
    }, []);

    // Projet de la conversation (nom affiché dans l'en-tête)
    useEffect(() => {
        if (!projectId || !user || !CONVERSATIONS_ENABLED) { setProject(null); return; }
        projectsApi.get(projectId).then(r => setProject(r.project)).catch(() => setProject(null));
    }, [projectId, user]);

    // Le chat a créé ou terminé une conversation
    useEffect(() => {
        const onConv = (e: Event) => {
            const id = (e as CustomEvent<{ id: string | null }>).detail?.id ?? null;
            if (id) setActiveId(id);
        };
        window.addEventListener('processmate:conversation', onConv);
        return () => window.removeEventListener('processmate:conversation', onConv);
    }, []);

    // Travail fait en invité dans ce navigateur : proposé à la reprise une fois connecté
    useEffect(() => {
        if (!user || !CONVERSATIONS_ENABLED) return;
        guestStore.get(GUEST_CONVERSATION_KEY).then(saved => { if (saved?.messages?.length) setGuestWork(saved); });
    }, [user]);

    const open = useCallback((id: string | null, project?: string | null) => {
        writeConversationParam(id);
        const params = new URLSearchParams(window.location.search);
        if (project) params.set('projet', project); else params.delete('projet');
        params.delete('procedure');
        window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
        setActiveId(id);
        setInitialMessage(undefined);
        setProcedureId(undefined);
        setProjectId(project ?? undefined);
        setPanelKey(k => k + 1); // le chat relit ?c= à son montage
    }, []);

    const importGuest = async () => {
        if (!guestWork) return;
        setImporting(true);
        setImportError(null);
        try {
            const conv = await conversationsApi.importGuest({ messages: guestWork.messages });
            await guestStore.remove(GUEST_CONVERSATION_KEY);
            setGuestWork(null);
            setRefreshKey(k => k + 1);
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
        return <div className="h-screen flex items-center justify-center bg-white"><Loader2 className="w-6 h-6 animate-spin text-neutral-900" /></div>;
    }

    return (
        <AppShell
            activeConversationId={activeId}
            refreshKey={refreshKey}
            onOpenConversation={(id, proj) => open(id, proj)}
            onNewConversation={() => open(null, null)}
            onConversationDeleted={id => { if (id === activeId) open(null, null); }}
            headerLeft={!activeId && project && (
                <Link href={`/projet/?id=${project.id}`} className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-neutral-900 hover:bg-neutral-100">
                    <FolderOpen className="w-4 h-4 shrink-0" /><span className="truncate">{project.name}</span>
                </Link>
            )}>
            {guestWork && (
                <div className="shrink-0 border-b border-blue-200 bg-blue-50 px-4 py-2.5 flex flex-wrap items-center gap-2 text-sm text-neutral-900">
                    <span>Vous avez commencé une conversation sans compte dans ce navigateur. La reprendre dans votre compte ?</span>
                    <button type="button" onClick={importGuest} disabled={importing}
                        className="rounded-lg bg-neutral-900 px-3 py-1 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
                        {importing ? 'Reprise…' : 'Reprendre'}
                    </button>
                    <button type="button" onClick={ignoreGuest} disabled={importing} className="rounded-lg px-3 py-1 text-xs font-medium text-neutral-900 hover:bg-blue-100">Ignorer</button>
                    {importError && <span className="text-xs text-red-600">{importError}</span>}
                </div>
            )}
            <div className="flex-1 min-h-0">
                <SttPanel key={panelKey} chatFirst guestMode={!user} projectId={projectId}
                    workflowId={member ? procedureId : undefined}
                    librarySave={member && !access?.read_only}
                    initialMessage={initialMessage} />
            </div>
        </AppShell>
    );
}

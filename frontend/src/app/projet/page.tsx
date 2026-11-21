'use client';

// Page d'un projet (comme Claude) : /projet/?id=<id> (export statique : pas de route dynamique).
// Nouvelle conversation directement depuis le projet, récents, instructions, contexte, campagne.
import StartComposer from '@/components/home/StartComposer';
import { setPendingTurn } from '@/lib/pendingTurn';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/auth/AuthGuard';
import AppShell from '@/components/home/AppShell';
import { conversationsApi, type ConversationSummary } from '@/lib/conversationsApi';
import { projectsApi, type Project, type ProjectCampaign, type ProjectSource } from '@/lib/projectsApi';
import { ConversationRow } from '@/components/home/ConversationItems';
import { ConfirmDialog, Modal, btnGhost, btnPrimary, field, type MenuItem } from '@/components/home/ui';
import { RenameProjectDialog, notifyProjects } from '@/components/home/ProjectDialogs';
import {
    Archive, ArchiveRestore, ArrowUp, ChevronDown, FileText, Files, Loader2, Lock, Megaphone, NotebookPen,
    PenLine, Pencil, Pin, PinOff, Trash2, X,
} from 'lucide-react';

const PROC_STATUS: Record<string, string> = {
    pending: 'À faire', in_progress: 'En cours', submitted: 'Soumise', in_review: 'En relecture',
    formalized: 'Formalisée', validated: 'Validée', skipped: 'Écartée',
};

export default function ProjetPage() {
    return (
        <AuthGuard>
            <ProjectPage />
        </AuthGuard>
    );
}

function ProjectPage() {
    const router = useRouter();
    const [id, setId] = useState<string | null>(null);
    const [project, setProject] = useState<Project | null>(null);
    const [sources, setSources] = useState<ProjectSource[]>([]);
    const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
    const [campaign, setCampaign] = useState<ProjectCampaign | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editingDesc, setEditingDesc] = useState(false);
    const [descValue, setDescValue] = useState('');
    const [instructionsOpen, setInstructionsOpen] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async (pid: string) => {
        try {
            const data = await projectsApi.get(pid);
            setProject(data.project);
            setSources(data.sources);
            setCampaign(data.campaign ?? null);
            setConversations(await conversationsApi.list({ projectId: pid, limit: 100 }));
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Projet introuvable');
        }
    }, []);

    useEffect(() => {
        const pid = new URLSearchParams(window.location.search).get('id');
        setId(pid);
        if (pid) void load(pid); else setError('Projet non précisé');
    }, [load]);

    // Une conversation déplacée ou supprimée depuis la barre latérale
    useEffect(() => {
        const refresh = () => { if (id) conversationsApi.list({ projectId: id, limit: 100 }).then(setConversations).catch(() => undefined); };
        window.addEventListener('processmate:conversation-list', refresh);
        return () => window.removeEventListener('processmate:conversation-list', refresh);
    }, [id]);

    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [menuOpen]);

    const canEdit = !!project && project.my_role !== 'viewer';

    const patch = async (body: Parameters<typeof projectsApi.update>[1], optimistic: Partial<Project>) => {
        if (!project) return;
        const before = project;
        setProject({ ...project, ...optimistic });
        try { await projectsApi.update(project.id, body); notifyProjects(); }
        catch (e) { setProject(before); setError(e instanceof Error ? e.message : 'Modification impossible'); }
    };

    // Texte et fichiers passent au chat, qui les envoie aussitôt dans le projet
    const startConversation = (text: string, files: File[]) => {
        if (!project || (!text && !files.length)) return;
        setPendingTurn({ text, files });
        router.push(`/?projet=${project.id}&depart=1`);
    };

    const upload = async (files: File[]) => {
        if (!id || files.length === 0) return;
        setUploading(true);
        setError(null);
        try { await projectsApi.addSources(id, files); const data = await projectsApi.get(id); setSources(data.sources); }
        catch (e: unknown) { setError(e instanceof Error ? e.message : 'Ajout impossible'); }
        finally { setUploading(false); }
    };

    const removeSource = async (sourceId: string) => {
        if (!id) return;
        setSources(s => s.filter(x => x.id !== sourceId));
        try { await projectsApi.removeSource(id, sourceId); }
        catch (e: unknown) { setError(e instanceof Error ? e.message : 'Retrait impossible'); void load(id); }
    };

    const menuItems: MenuItem[] = project ? [
        ...(canEdit ? [{ label: 'Renommer', icon: <Pencil />, onSelect: () => setRenaming(true) }] : []),
        ...(canEdit ? [project.pinned_at
            ? { label: 'Désépingler', icon: <PinOff />, onSelect: () => void patch({ pinned: false }, { pinned_at: null }) }
            : { label: 'Épingler', icon: <Pin />, onSelect: () => void patch({ pinned: true }, { pinned_at: new Date().toISOString() }) }] : []),
        ...(canEdit ? [project.archived_at
            ? { label: 'Restaurer', icon: <ArchiveRestore />, onSelect: () => void patch({ archived: false }, { archived_at: null }) }
            : { label: 'Archiver', icon: <Archive />, onSelect: () => void patch({ archived: true }, { archived_at: new Date().toISOString() }) }] : []),
        ...(project.my_role === 'owner' ? [{ label: 'Supprimer le projet', icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: () => setDeleting(true) }] : []),
    ] : [];

    return (
        <AppShell headerLeft={project && (
            <nav aria-label="Fil d’Ariane" className="flex min-w-0 items-center gap-1.5 text-sm text-neutral-900">
                <Link href="/projets" className="rounded-md px-1.5 py-1 hover:bg-neutral-100">Projets</Link>
                <span className="text-neutral-400">/</span>
                <div ref={menuRef} className="relative min-w-0">
                    <button type="button" onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen}
                        className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 font-medium hover:bg-neutral-100">
                        <span className="truncate">{project.name}</span><ChevronDown className="w-4 h-4 shrink-0" />
                    </button>
                    {menuOpen && menuItems.length > 0 && (
                        <div role="menu" className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg">
                            {menuItems.map((it, i) => (
                                <div key={i}>
                                    {it.separatorBefore && <div className="my-1 h-px bg-neutral-200" />}
                                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); it.onSelect(); }}
                                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-neutral-100 ${it.danger ? 'text-red-600' : 'text-neutral-900'} [&_svg]:w-4 [&_svg]:h-4`}>
                                        {it.icon}{it.label}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </nav>
        )}>
            <div className="flex-1 min-h-0 overflow-y-auto">
                {error && !project ? <p className="mx-auto max-w-5xl px-6 py-10 text-sm text-red-600">{error}</p>
                    : !project ? <Loader2 className="mx-auto mt-16 w-6 h-6 animate-spin text-neutral-900" />
                    : (
                        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_340px]">
                            <div className="min-w-0">
                                <h1 className="font-serif text-3xl text-neutral-900">{project.name}</h1>
                                {project.archived_at && (
                                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-medium text-neutral-900">
                                        <Archive className="w-3.5 h-3.5" /> Archivé
                                    </p>
                                )}
                                {editingDesc ? (
                                    <div className="mt-2">
                                        <textarea autoFocus value={descValue} onChange={e => setDescValue(e.target.value)} rows={3} maxLength={2000}
                                            aria-label="Description du projet" className={field} />
                                        <div className="mt-2 flex gap-2">
                                            <button type="button" className={btnPrimary} onClick={() => { setEditingDesc(false); void patch({ description: descValue.trim() }, { description: descValue.trim() }); }}>Enregistrer</button>
                                            <button type="button" className={btnGhost} onClick={() => setEditingDesc(false)}>Annuler</button>
                                        </div>
                                    </div>
                                ) : project.description ? (
                                    <p onClick={() => { if (canEdit) { setDescValue(project.description || ''); setEditingDesc(true); } }}
                                        className={`mt-2 text-[15px] text-neutral-700 ${canEdit ? 'cursor-text rounded-md hover:bg-neutral-50' : ''}`}>{project.description}</p>
                                ) : canEdit && (
                                    <button type="button" onClick={() => { setDescValue(''); setEditingDesc(true); }} className="mt-2 text-[15px] text-neutral-500 hover:text-neutral-900">
                                        Ajouter une description…
                                    </button>
                                )}

                                <div className="mt-8">
                                    <StartComposer placeholder={`Nouvelle conversation dans ${project.name}`} onSend={startConversation} />
                                </div>

                                <h2 className="mt-10 text-sm font-medium text-neutral-500">Récents</h2>
                                {conversations === null ? <Loader2 className="mt-3 w-5 h-5 animate-spin text-neutral-900" />
                                    : conversations.length === 0 ? <p className="mt-3 text-sm text-neutral-700">Aucune conversation dans ce projet pour l&apos;instant.</p>
                                    : (
                                        <ul className="mt-1">
                                            {conversations.map(c => (
                                                <ConversationRow key={c.id} conv={c} variant="list"
                                                    onOpen={cid => router.push(`/?c=${cid}&projet=${project.id}`)}
                                                    onChanged={next => {
                                                        setConversations(prev => (prev || [])
                                                            .map(x => (x.id === c.id ? next : x))
                                                            .filter((x): x is ConversationSummary => !!x && x.project_id === project.id));
                                                        window.dispatchEvent(new CustomEvent('processmate:conversation'));
                                                    }} />
                                            ))}
                                        </ul>
                                    )}
                                {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
                            </div>

                            <aside className="space-y-1 lg:pt-14">
                                <SideRow icon={<NotebookPen />} label="Instructions"
                                    detail={project.instructions ? project.instructions.slice(0, 60) + (project.instructions.length > 60 ? '…' : '') : undefined}
                                    action={canEdit ? 'Modifier' : 'Voir'} onAction={() => setInstructionsOpen(true)} />
                                <SideRow icon={<Files />} label="Contexte" detail={`${sources.length} fichier${sources.length > 1 ? 's' : ''}`}
                                    action={canEdit ? (uploading ? 'Ajout…' : 'Ajouter') : undefined} onAction={() => fileRef.current?.click()} />
                                <input ref={fileRef} type="file" multiple hidden accept=".pdf,.docx,.pptx,image/png,image/jpeg,image/webp"
                                    onChange={e => { void upload(Array.from(e.target.files || [])); e.target.value = ''; }} />
                                {sources.length > 0 && (
                                    <ul className="space-y-0.5 pb-2 pl-9">
                                        {sources.map(s => (
                                            <li key={s.id} className="group flex items-center gap-2 rounded-md px-2 py-1 text-sm text-neutral-900 hover:bg-neutral-100">
                                                <FileText className="w-4 h-4 shrink-0" /><span className="truncate">{s.filename}</span>
                                                {canEdit && (
                                                    <button type="button" onClick={() => void removeSource(s.id)} aria-label={`Retirer ${s.filename}`}
                                                        className="ml-auto p-0.5 rounded text-neutral-900 opacity-0 group-hover:opacity-100 hover:bg-neutral-200"><X className="w-3.5 h-3.5" /></button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <p className="flex items-center gap-2 px-2 pt-3 text-sm text-neutral-500">
                                    <Lock className="w-4 h-4" />
                                    {project.campaign_id ? 'Partagé avec les membres de la campagne' : project.my_role === 'owner' ? 'Privé' : 'Partagé avec vous'}
                                </p>
                                {campaign && <div className="pt-4"><CampaignBlock campaign={campaign} projectId={project.id} /></div>}
                            </aside>
                        </div>
                    )}
            </div>

            {instructionsOpen && project && (
                <InstructionsDialog project={project} canEdit={canEdit} onClose={() => setInstructionsOpen(false)}
                    onSaved={instructions => { setInstructionsOpen(false); setProject({ ...project, instructions }); }} />
            )}
            {renaming && project && <RenameProjectDialog project={project} onClose={() => setRenaming(false)}
                onSaved={p => { setRenaming(false); setProject({ ...project, name: p.name }); }} />}
            {deleting && project && (
                <ConfirmDialog title="Supprimer le projet"
                    message={`« ${project.name} », ses instructions et ses documents seront supprimés. Ses conversations sont conservées, sans projet.`}
                    onClose={() => setDeleting(false)}
                    onConfirm={async () => { await projectsApi.remove(project.id); notifyProjects(); router.push('/projets'); }} />
            )}
        </AppShell>
    );
}

function SideRow({ icon, label, detail, action, onAction }: {
    icon: React.ReactNode; label: string; detail?: string; action?: string; onAction?: () => void;
}) {
    return (
        <div className="flex items-center gap-3 border-b border-neutral-200 px-2 py-3.5 text-neutral-900 [&>svg]:w-5 [&>svg]:h-5">
            {icon}
            <span className="text-[15px] font-medium">{label}</span>
            {detail && <span className="min-w-0 truncate text-sm text-neutral-500">{detail}</span>}
            {action && onAction && (
                <button type="button" onClick={onAction} className="ml-auto shrink-0 rounded-md px-2 py-1 text-sm font-medium text-neutral-900 hover:bg-neutral-100">{action}</button>
            )}
        </div>
    );
}

function InstructionsDialog({ project, canEdit, onClose, onSaved }: {
    project: Project; canEdit: boolean; onClose: () => void; onSaved: (instructions: string) => void;
}) {
    const [value, setValue] = useState(project.instructions || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const save = async () => {
        setBusy(true);
        try { await projectsApi.update(project.id, { instructions: value }); onSaved(value); }
        catch (e) { setError(e instanceof Error ? e.message : 'Enregistrement impossible'); setBusy(false); }
    };
    return (
        <Modal title="Instructions du projet" wide onClose={onClose} footer={canEdit ? <>
            <button type="button" onClick={onClose} className={btnGhost}>Annuler</button>
            <button type="button" onClick={() => void save()} disabled={busy} className={btnPrimary}>Enregistrer</button>
        </> : undefined}>
            <p className="text-sm text-neutral-700">
                Données à l&apos;assistant au début de chaque conversation du projet : conventions, vocabulaire, périmètre, acteurs…
            </p>
            <textarea value={value} onChange={e => setValue(e.target.value)} rows={12} disabled={!canEdit} aria-label="Instructions du projet"
                className={`mt-3 resize-y disabled:bg-neutral-50 ${field}`} />
            {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        </Modal>
    );
}

/** Campagne liée : ce qu'il faut livrer. Le projet, lui, est l'endroit où l'on travaille. */
function CampaignBlock({ campaign, projectId }: { campaign: ProjectCampaign; projectId: string }) {
    const [showAll, setShowAll] = useState(false);
    const mine = campaign.procedures.filter(p => p.mine);
    const list = showAll || mine.length === 0 ? campaign.procedures : mine;
    return (
        <section aria-labelledby="campaign-title" className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3 text-neutral-900">
            <div>
                <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-500"><Megaphone className="w-3.5 h-3.5" /> Campagne de formalisation</p>
                <h2 id="campaign-title" className="mt-0.5 text-[15px] font-semibold">{campaign.title}</h2>
                {campaign.end_date && <p className="text-sm text-neutral-500">Échéance : {new Date(campaign.end_date).toLocaleDateString('fr-FR')}</p>}
                <Link href="/orchestration?tab=campagnes" className="text-sm font-medium underline">Pilotage de la campagne</Link>
            </div>
            <div>
                <div className="flex justify-between text-sm text-neutral-700">
                    <span>{campaign.stats.done} / {campaign.stats.total} formalisées</span>
                    <span>{campaign.stats.progress_pct} %</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-neutral-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={campaign.stats.progress_pct}>
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${campaign.stats.progress_pct}%` }} />
                </div>
            </div>
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">{mine.length > 0 && !showAll ? 'Mes procédures' : 'Procédures'}</h3>
                {mine.length > 0 && mine.length < campaign.procedures.length && (
                    <button type="button" onClick={() => setShowAll(v => !v)} className="text-sm text-neutral-500 hover:text-neutral-900">
                        {showAll ? 'Les miennes' : `Toutes (${campaign.procedures.length})`}
                    </button>
                )}
            </div>
            {list.length === 0 ? <p className="text-sm text-neutral-500">Aucune procédure dans la campagne.</p> : (
                <ul className="divide-y divide-neutral-200">
                    {list.map(p => (
                        <li key={p.id || p.procedure_id || p.procedure_nom} className="flex items-center gap-2 py-2">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm">{p.procedure_nom || 'Procédure sans nom'}</p>
                                <p className="text-xs text-neutral-500">{[p.procedure_ref, PROC_STATUS[p.status] || p.status].filter(Boolean).join(' · ')}</p>
                            </div>
                            {p.procedure_id ? (
                                <Link href={`/?projet=${projectId}&procedure=${p.procedure_id}`}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-neutral-900 px-2 py-1 text-xs font-medium hover:bg-neutral-100">
                                    <PenLine className="w-3.5 h-3.5" /> Formaliser
                                </Link>
                            ) : <span className="shrink-0 text-xs text-neutral-500">au lancement</span>}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

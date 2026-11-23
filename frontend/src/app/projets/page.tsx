'use client';

// Projets (comme Claude) : vos projets / archivés, recherche, tri, épingler, renommer, archiver, supprimer.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/auth/AuthGuard';
import AppShell from '@/components/home/AppShell';
import { CONVERSATIONS_ENABLED } from '@/lib/conversationsApi';
import { projectsApi, type Project } from '@/lib/projectsApi';
import { ConfirmDialog, RowMenu, btnPrimary, timeAgo, type MenuItem } from '@/components/home/ui';
import { NewProjectDialog, RenameProjectDialog, notifyProjects } from '@/components/home/ProjectDialogs';
import { Archive, ArchiveRestore, ArrowDown, FolderOpen, Loader2, Pencil, Pin, Plus, Search, Trash2 } from 'lucide-react';

export default function ProjetsPage() {
    return (
        <AuthGuard>
            <AppShell activeNav="projets">
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <ProjectsList />
                </div>
            </AppShell>
        </AuthGuard>
    );
}

type Sort = 'recent' | 'nom';

function ProjectsList() {
    const router = useRouter();
    const [tab, setTab] = useState<'actifs' | 'archives'>('actifs');
    const [projects, setProjects] = useState<Project[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [q, setQ] = useState('');
    const [sort, setSort] = useState<Sort>('recent');
    const [creating, setCreating] = useState(false);
    const [renaming, setRenaming] = useState<Project | null>(null);
    const [deleting, setDeleting] = useState<Project | null>(null);

    useEffect(() => {
        setProjects(null);
        projectsApi.list(tab === 'archives').then(setProjects).catch(e => setError(e instanceof Error ? e.message : 'Projets indisponibles'));
    }, [tab]);

    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase();
        const list = (projects || []).filter(p => !needle || `${p.name} ${p.description || ''}`.toLowerCase().includes(needle));
        return [...list].sort((a, b) => {
            if (!!a.pinned_at !== !!b.pinned_at) return a.pinned_at ? -1 : 1;
            return sort === 'nom' ? a.name.localeCompare(b.name, 'fr') : (b.updated_at || '').localeCompare(a.updated_at || '');
        });
    }, [projects, q, sort]);

    const patch = async (p: Project, body: Parameters<typeof projectsApi.update>[1], optimistic: Partial<Project>, removeFromList = false) => {
        setError(null);
        setProjects(prev => removeFromList ? (prev || []).filter(x => x.id !== p.id) : (prev || []).map(x => x.id === p.id ? { ...x, ...optimistic } : x));
        try { await projectsApi.update(p.id, body); notifyProjects(); }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Modification impossible');
            projectsApi.list(tab === 'archives').then(setProjects).catch(() => undefined);
        }
    };

    const menu = (p: Project): MenuItem[] => {
        const canEdit = p.my_role !== 'viewer';
        const items: MenuItem[] = [];
        if (canEdit) {
            items.push({ label: 'Renommer', icon: <Pencil />, onSelect: () => setRenaming(p) });
            items.push(p.archived_at
                ? { label: 'Restaurer', icon: <ArchiveRestore />, onSelect: () => void patch(p, { archived: false }, { archived_at: null }, true) }
                : { label: 'Archiver', icon: <Archive />, onSelect: () => void patch(p, { archived: true }, {}, true) });
        }
        if (p.my_role === 'owner') items.push({ label: 'Supprimer', icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: () => setDeleting(p) });
        return items;
    };

    if (!CONVERSATIONS_ENABLED) {
        return <p className="mx-auto max-w-5xl px-6 py-10 text-sm text-neutral-700">Les projets ne sont pas encore activés.</p>;
    }

    return (
        <div className="mx-auto max-w-6xl px-6 py-6">
            {/* une ligne : titre, recherche, créer */}
            <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold text-neutral-900">Projets</h1>
                <label className="ml-auto flex min-w-[240px] max-w-md flex-1 items-center gap-2 rounded-full border border-neutral-300 px-3.5 py-2 focus-within:border-neutral-900">
                    <Search className="w-4 h-4 shrink-0 text-neutral-500" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher des projets" aria-label="Rechercher des projets"
                        className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-500" />
                </label>
                <button type="button" onClick={() => setCreating(true)} className={`${btnPrimary} inline-flex items-center gap-1.5 rounded-full`}>
                    <Plus className="w-4 h-4" />Créer
                </button>
            </div>

            <div role="tablist" aria-label="Projets" className="mt-4 flex gap-1 border-b border-neutral-200">
                {([['actifs', 'Vos projets'], ['archives', 'Archivés']] as const).map(([id, label]) => (
                    <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
                        className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === id ? 'border-petrole text-neutral-900' : 'border-transparent text-neutral-600 hover:text-neutral-900'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}

            {projects === null ? (
                <Loader2 className="mt-10 w-6 h-6 animate-spin text-neutral-900" />
            ) : shown.length === 0 ? (
                <div className="mt-16 text-center">
                    <FolderOpen className="mx-auto w-8 h-8 text-petrole" />
                    <p className="mt-3 text-sm text-neutral-700">
                        {q ? 'Aucun projet ne correspond.' : tab === 'archives' ? 'Aucun projet archivé.' : 'Regroupez des conversations, des instructions et des documents autour d’un même sujet.'}
                    </p>
                    {!q && tab === 'actifs' && <button type="button" onClick={() => setCreating(true)} className={`${btnPrimary} mt-4`}>Créer un projet</button>}
                </div>
            ) : (
                <div className="mt-2">
                    {/* colonnes : un clic change le tri */}
                    <div className="flex items-center border-b border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600">
                        <button type="button" onClick={() => setSort('nom')} className={`flex-1 text-left hover:text-neutral-900 ${sort === 'nom' ? 'text-neutral-900' : ''}`}>
                            Nom{sort === 'nom' && <ArrowDown className="ml-1 inline w-3 h-3" />}
                        </button>
                        <button type="button" onClick={() => setSort('recent')} className={`w-32 text-left hover:text-neutral-900 ${sort === 'recent' ? 'text-neutral-900' : ''}`}>
                            Modifié{sort === 'recent' && <ArrowDown className="ml-1 inline w-3 h-3" />}
                        </button>
                        <span className="w-20" aria-hidden />
                    </div>
                    <ul>
                        {shown.map(p => (
                            <li key={p.id} className="border-b border-neutral-100">
                                <div role="link" tabIndex={0} onClick={() => router.push(`/projet/?id=${p.id}`)}
                                    onKeyDown={e => { if (e.key === 'Enter') router.push(`/projet/?id=${p.id}`); }}
                                    className="group flex cursor-pointer items-center gap-3 px-3 py-3 hover:bg-neutral-50">
                                    <FolderOpen className="w-4 h-4 shrink-0 text-petrole" />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2">
                                            <span className="truncate text-sm font-medium text-neutral-900">{p.name}</span>
                                            {p.campaign_id && <span className="shrink-0 rounded-full bg-petrole-tint px-2 py-0.5 text-[10px] font-semibold text-petrole">Campagne</span>}
                                        </span>
                                        {p.description && <span className="block truncate text-xs text-neutral-500">{p.description}</span>}
                                    </span>
                                    <span className="w-32 shrink-0 text-sm text-neutral-600">{timeAgo(p.updated_at)}</span>
                                    <span onClick={e => e.stopPropagation()} className="flex w-20 shrink-0 items-center justify-end gap-0.5">
                                        {menu(p).length > 0 && <RowMenu label={`Actions sur ${p.name}`} items={menu(p)} />}
                                        {p.my_role !== 'viewer' && (
                                            <button type="button" aria-label={p.pinned_at ? `Désépingler ${p.name}` : `Épingler ${p.name}`}
                                                title={p.pinned_at ? 'Désépingler' : 'Épingler'}
                                                onClick={() => void patch(p, { pinned: !p.pinned_at }, { pinned_at: p.pinned_at ? null : new Date().toISOString() })}
                                                className={`p-1 rounded-md hover:bg-neutral-200 ${p.pinned_at ? 'text-petrole' : 'text-neutral-500'}`}>
                                                <Pin className={`w-4 h-4 ${p.pinned_at ? 'fill-current' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`} />
                                            </button>
                                        )}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {creating && <NewProjectDialog onClose={() => setCreating(false)} onCreated={p => router.push(`/projet/?id=${p.id}`)} />}
            {renaming && <RenameProjectDialog project={renaming} onClose={() => setRenaming(null)}
                onSaved={p => { setRenaming(null); setProjects(prev => (prev || []).map(x => x.id === p.id ? { ...x, name: p.name } : x)); }} />}
            {deleting && (
                <ConfirmDialog title="Supprimer le projet"
                    message={`« ${deleting.name} », ses instructions et ses documents seront supprimés. Ses conversations sont conservées, sans projet.`}
                    onClose={() => setDeleting(null)}
                    onConfirm={async () => { await projectsApi.remove(deleting.id); notifyProjects(); setProjects(prev => (prev || []).filter(x => x.id !== deleting.id)); }} />
            )}
        </div>
    );
}

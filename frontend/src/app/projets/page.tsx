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
import { Archive, ArchiveRestore, ArrowUpDown, FolderOpen, Loader2, Pencil, Pin, Search, Trash2 } from 'lucide-react';

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
    const [searching, setSearching] = useState(false);
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
        <div className="mx-auto max-w-5xl px-6 py-10">
            <h1 className="font-serif text-3xl text-neutral-900">Projets</h1>
            <div className="mt-6 flex flex-wrap items-center gap-2">
                <div role="tablist" aria-label="Projets" className="flex gap-1">
                    {([['actifs', 'Vos projets'], ['archives', 'Archivés']] as const).map(([id, label]) => (
                        <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
                            className={`rounded-lg px-3.5 py-2 text-sm font-medium text-neutral-900 ${tab === id ? 'bg-neutral-200' : 'hover:bg-neutral-100'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className="ml-auto flex items-center gap-1">
                    {searching ? (
                        <label className="flex items-center gap-2 rounded-lg border border-neutral-900 px-2.5 py-1.5">
                            <Search className="w-4 h-4 text-neutral-900" />
                            <input autoFocus value={q} onChange={e => setQ(e.target.value)} onBlur={() => { if (!q) setSearching(false); }}
                                placeholder="Rechercher un projet" aria-label="Rechercher un projet"
                                className="w-44 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400" />
                        </label>
                    ) : (
                        <button type="button" onClick={() => setSearching(true)} aria-label="Rechercher un projet" className="p-2 rounded-lg text-neutral-900 hover:bg-neutral-100">
                            <Search className="w-5 h-5" />
                        </button>
                    )}
                    <button type="button" onClick={() => setSort(s => (s === 'recent' ? 'nom' : 'recent'))}
                        title={sort === 'recent' ? 'Trié par activité récente — trier par nom' : 'Trié par nom — trier par activité récente'}
                        aria-label="Changer le tri" className="p-2 rounded-lg text-neutral-900 hover:bg-neutral-100">
                        <ArrowUpDown className="w-5 h-5" />
                    </button>
                    <button type="button" onClick={() => setCreating(true)} className={`${btnPrimary} ml-2`}>Nouveau projet</button>
                </div>
            </div>

            {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}

            {projects === null ? (
                <Loader2 className="mt-10 w-6 h-6 animate-spin text-neutral-900" />
            ) : shown.length === 0 ? (
                <div className="mt-16 text-center">
                    <FolderOpen className="mx-auto w-8 h-8 text-neutral-900" />
                    <p className="mt-3 text-sm text-neutral-700">
                        {q ? 'Aucun projet ne correspond.' : tab === 'archives' ? 'Aucun projet archivé.' : 'Regroupez des conversations, des instructions et des documents autour d’un même sujet.'}
                    </p>
                    {!q && tab === 'actifs' && <button type="button" onClick={() => setCreating(true)} className={`${btnPrimary} mt-4`}>Créer un projet</button>}
                </div>
            ) : (
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {shown.map(p => (
                        <li key={p.id}>
                            <div role="link" tabIndex={0} onClick={() => router.push(`/projet/?id=${p.id}`)}
                                onKeyDown={e => { if (e.key === 'Enter') router.push(`/projet/?id=${p.id}`); }}
                                className="group flex cursor-pointer items-center gap-3 rounded-2xl bg-neutral-100 px-4 py-4 hover:bg-neutral-200/70">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-200 text-neutral-900"><FolderOpen className="w-5 h-5" /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2">
                                        <span className="truncate text-[15px] font-medium text-neutral-900">{p.name}</span>
                                        {p.campaign_id && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Campagne</span>}
                                    </span>
                                    <span className="block truncate text-sm text-neutral-500">{timeAgo(p.updated_at)}{p.description ? ` · ${p.description}` : ''}</span>
                                </span>
                                <span onClick={e => e.stopPropagation()} className="flex shrink-0 items-center gap-0.5">
                                    {menu(p).length > 0 && <RowMenu label={`Actions sur ${p.name}`} items={menu(p)} />}
                                    {p.my_role !== 'viewer' && (
                                        <button type="button" aria-label={p.pinned_at ? `Désépingler ${p.name}` : `Épingler ${p.name}`}
                                            title={p.pinned_at ? 'Désépingler' : 'Épingler'}
                                            onClick={() => void patch(p, { pinned: !p.pinned_at }, { pinned_at: p.pinned_at ? null : new Date().toISOString() })}
                                            className="p-1 rounded-md text-neutral-900 hover:bg-neutral-300/60">
                                            {p.pinned_at ? <Pin className="w-4 h-4 fill-neutral-900" /> : <Pin className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                                        </button>
                                    )}
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
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

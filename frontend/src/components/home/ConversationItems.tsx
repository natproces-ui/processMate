'use client';

/** Conversations : ligne avec actions (comme Claude / ChatGPT), déplacer vers un projet, recherche. */
import { useEffect, useState } from 'react';
import { FolderInput, FolderMinus, FolderOpen, Loader2, MessageSquare, Pencil, Pin, PinOff, Search, Trash2 } from 'lucide-react';
import { conversationsApi, type ConversationSummary } from '@/lib/conversationsApi';
import { projectsApi, type Project } from '@/lib/projectsApi';
import { ConfirmDialog, InlineRename, Modal, RowMenu, timeAgo, type MenuItem } from '@/components/home/ui';

/** Ligne d'une conversation. onChanged : la conversation a changé (null = supprimée). */
export function ConversationRow({ conv, active, onOpen, onChanged, variant = 'sidebar' }: {
    conv: ConversationSummary;
    active?: boolean;
    onOpen: (id: string) => void;
    onChanged: (conv: ConversationSummary | null) => void;
    variant?: 'sidebar' | 'list';
}) {
    const [renaming, setRenaming] = useState(false);
    const [moving, setMoving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const update = async (body: Parameters<typeof conversationsApi.update>[1], optimistic: Partial<ConversationSummary>) => {
        setError(null);
        onChanged({ ...conv, ...optimistic });
        try { onChanged(await conversationsApi.update(conv.id, body)); }
        catch (e) { onChanged(conv); setError(e instanceof Error ? e.message : 'Modification impossible'); }
    };

    const items: MenuItem[] = [
        conv.pinned_at
            ? { label: 'Désépingler', icon: <PinOff />, onSelect: () => void update({ pinned: false }, { pinned_at: null }) }
            : { label: 'Épingler', icon: <Pin />, onSelect: () => void update({ pinned: true }, { pinned_at: new Date().toISOString() }) },
        { label: 'Renommer', icon: <Pencil />, onSelect: () => setRenaming(true) },
        { label: conv.project_id ? 'Changer de projet' : 'Ajouter à un projet', icon: <FolderInput />, onSelect: () => setMoving(true) },
        ...(conv.project_id ? [{ label: 'Retirer du projet', icon: <FolderMinus />, onSelect: () => void update({ project_id: '' }, { project_id: null }) }] : []),
        { label: 'Supprimer', icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: () => setDeleting(true) },
    ];

    const sidebar = variant === 'sidebar';
    return (
        <li className="group relative">
            {renaming ? (
                <div className="flex items-center gap-2 rounded-lg px-2 py-1">
                    <MessageSquare className="w-4 h-4 shrink-0 text-neutral-900" />
                    <InlineRename value={conv.title} onCancel={() => setRenaming(false)}
                        onSave={title => { setRenaming(false); void update({ title }, { title }); }} />
                </div>
            ) : (
                <div className={`flex items-center rounded-lg ${active ? 'bg-neutral-200' : 'hover:bg-neutral-100'} ${sidebar ? '' : 'border-b border-neutral-200 rounded-none'}`}>
                    <button type="button" onClick={() => onOpen(conv.id)} title={conv.title} aria-current={active ? 'page' : undefined}
                        className={`min-w-0 flex-1 flex items-center gap-2 text-left text-neutral-900 ${sidebar ? 'px-2 py-1.5 text-sm' : 'px-1 py-3 text-[15px]'}`}>
                        {sidebar && (conv.pinned_at ? <Pin className="w-3.5 h-3.5 shrink-0" /> : <MessageSquare className="w-4 h-4 shrink-0" />)}
                        <span className="truncate">{conv.title}</span>
                        {!sidebar && <span className="ml-auto shrink-0 pl-3 text-sm text-neutral-500">{timeAgo(conv.updated_at)}</span>}
                    </button>
                    <RowMenu label={`Actions sur ${conv.title}`} items={items}
                        className={sidebar ? 'pr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100' : 'pl-2'} />
                </div>
            )}
            {error && <p role="alert" className="px-2 text-xs text-red-600">{error}</p>}
            {moving && (
                <MoveToProjectDialog current={conv.project_id} onClose={() => setMoving(false)}
                    onPick={projectId => { setMoving(false); void update({ project_id: projectId }, { project_id: projectId }); }} />
            )}
            {deleting && (
                <ConfirmDialog title="Supprimer la conversation"
                    message={`« ${conv.title} » et ses messages seront supprimés définitivement. Les procédures enregistrées dans le référentiel ne sont pas touchées.`}
                    onClose={() => setDeleting(false)}
                    onConfirm={async () => { await conversationsApi.remove(conv.id); onChanged(null); }} />
            )}
        </li>
    );
}

export function MoveToProjectDialog({ current, onPick, onClose }: {
    current: string | null; onPick: (projectId: string) => void; onClose: () => void;
}) {
    const [projects, setProjects] = useState<Project[] | null>(null);
    useEffect(() => { projectsApi.list().then(setProjects).catch(() => setProjects([])); }, []);
    return (
        <Modal title="Ajouter à un projet" onClose={onClose}>
            {projects === null ? <Loader2 className="w-5 h-5 animate-spin text-neutral-900" /> : projects.length === 0 ? (
                <p className="text-sm text-neutral-700">Aucun projet. Créez-en un depuis la page Projets.</p>
            ) : (
                <ul className="pb-3">
                    {projects.filter(p => p.my_role !== 'viewer').map(p => (
                        <li key={p.id}>
                            <button type="button" disabled={p.id === current} onClick={() => onPick(p.id)}
                                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-neutral-900 hover:bg-neutral-100 disabled:opacity-40">
                                <FolderOpen className="w-4 h-4" /> <span className="truncate">{p.name}</span>
                                {p.id === current && <span className="ml-auto text-xs text-neutral-500">actuel</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Modal>
    );
}

export function SearchDialog({ onOpen, onClose }: { onOpen: (id: string) => void; onClose: () => void }) {
    const [q, setQ] = useState('');
    const [results, setResults] = useState<ConversationSummary[] | null>(null);
    const [active, setActive] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => {
            conversationsApi.list({ q, limit: 30 }).then(r => { setResults(r); setActive(0); }).catch(() => setResults([]));
        }, q ? 200 : 0);
        return () => clearTimeout(t);
    }, [q]);
    return (
        <Modal title="Rechercher" onClose={onClose}>
            <label className="flex items-center gap-2 rounded-lg border border-neutral-900 px-3 py-2">
                <Search className="w-4 h-4 text-neutral-900" />
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher dans vos conversations…"
                    aria-label="Rechercher dans vos conversations"
                    onKeyDown={e => {
                        if (!results?.length) return;
                        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
                        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
                        if (e.key === 'Enter') onOpen(results[active].id);
                    }}
                    className="w-full bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400" />
            </label>
            <ul className="mt-2 pb-3 max-h-[50vh] overflow-y-auto">
                {results === null ? <li className="p-2"><Loader2 className="w-4 h-4 animate-spin text-neutral-900" /></li>
                    : results.length === 0 ? <li className="p-2 text-sm text-neutral-600">Aucune conversation trouvée.</li>
                    : results.map((c, i) => (
                        <li key={c.id}>
                            <button type="button" onClick={() => onOpen(c.id)} onMouseEnter={() => setActive(i)}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-neutral-900 ${i === active ? 'bg-neutral-100' : ''}`}>
                                <MessageSquare className="w-4 h-4 shrink-0" /><span className="truncate">{c.title}</span>
                                <span className="ml-auto shrink-0 text-xs text-neutral-500">{timeAgo(c.updated_at)}</span>
                            </button>
                        </li>
                    ))}
            </ul>
        </Modal>
    );
}

/** En-tête du chat : « Projet / Titre ▾ » avec les actions de la conversation (comme Claude). */
export function ConversationHeader({ conv, projectName, onChanged }: {
    conv: ConversationSummary; projectName?: string | null; onChanged: (conv: ConversationSummary | null) => void;
}) {
    const [renaming, setRenaming] = useState(false);
    const [title, setTitle] = useState(conv.title);
    const [moving, setMoving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const update = async (body: Parameters<typeof conversationsApi.update>[1], optimistic: Partial<ConversationSummary>) => {
        onChanged({ ...conv, ...optimistic });
        try { onChanged(await conversationsApi.update(conv.id, body)); } catch { onChanged(conv); }
    };
    const items: MenuItem[] = [
        { label: 'Renommer', icon: <Pencil />, onSelect: () => { setTitle(conv.title); setRenaming(true); } },
        conv.pinned_at
            ? { label: 'Désépingler', icon: <PinOff />, onSelect: () => void update({ pinned: false }, { pinned_at: null }) }
            : { label: 'Épingler', icon: <Pin />, onSelect: () => void update({ pinned: true }, { pinned_at: new Date().toISOString() }) },
        { label: conv.project_id ? 'Changer de projet' : 'Ajouter à un projet', icon: <FolderInput />, onSelect: () => setMoving(true) },
        { label: 'Supprimer', icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: () => setDeleting(true) },
    ];
    return (
        <div className="flex min-w-0 items-center gap-1 text-sm text-neutral-900">
            {projectName && conv.project_id && (
                <>
                    <a href={`/projet/?id=${conv.project_id}`} className="max-w-[180px] truncate rounded-md px-1.5 py-1 hover:bg-neutral-100">{projectName}</a>
                    <span className="text-neutral-400">/</span>
                </>
            )}
            {renaming ? (
                <InlineRename value={conv.title} className="max-w-[320px]" onCancel={() => setRenaming(false)}
                    onSave={t => { setRenaming(false); setTitle(t); void update({ title: t }, { title: t }); }} />
            ) : (
                <span className="flex min-w-0 items-center">
                    <button type="button" onClick={() => setRenaming(true)} title="Renommer"
                        className="max-w-[360px] truncate rounded-md px-1.5 py-1 font-medium hover:bg-neutral-100">{title || conv.title}</button>
                    <RowMenu label="Actions sur la conversation" items={items} align="left" />
                </span>
            )}
            {moving && (
                <MoveToProjectDialog current={conv.project_id} onClose={() => setMoving(false)}
                    onPick={projectId => { setMoving(false); void update({ project_id: projectId }, { project_id: projectId }); }} />
            )}
            {deleting && (
                <ConfirmDialog title="Supprimer la conversation"
                    message={`« ${conv.title} » et ses messages seront supprimés définitivement.`}
                    onClose={() => setDeleting(false)}
                    onConfirm={async () => { await conversationsApi.remove(conv.id); onChanged(null); }} />
            )}
        </div>
    );
}

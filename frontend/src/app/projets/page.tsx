'use client';

// Liste des projets (lot 4). Un projet = instructions + sources partagées + conversations.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/auth/AuthGuard';
import PublicShell from '@/components/home/PublicShell';
import { CONVERSATIONS_ENABLED } from '@/lib/conversationsApi';
import { projectsApi, type Project } from '@/lib/projectsApi';
import { FolderKanban, Loader2, Plus } from 'lucide-react';

export default function ProjetsPage() {
    return (
        <AuthGuard>
            <PublicShell>
                <ProjectsList />
            </PublicShell>
        </AuthGuard>
    );
}

function ProjectsList() {
    const [projects, setProjects] = useState<Project[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (!CONVERSATIONS_ENABLED) return;
        projectsApi.list().then(setProjects).catch(e => setError(e.message));
    }, []);

    const create = async () => {
        if (!name.trim()) return;
        setCreating(true);
        try {
            const p = await projectsApi.create({ name: name.trim() });
            window.location.href = `/projet/?id=${p.id}`;
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Création impossible');
            setCreating(false);
        }
    };

    if (!CONVERSATIONS_ENABLED) {
        return <p className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-500">Les projets ne sont pas encore activés.</p>;
    }

    return (
        <div className="mx-auto max-w-3xl px-4 py-10">
            <h1 className="text-2xl font-bold text-slate-900">Projets</h1>
            <p className="mt-1 text-sm text-slate-500">
                Regroupez des sources, des instructions et des conversations. L&apos;assistant d&apos;une conversation du projet voit ses instructions et ses sources, rien d&apos;autre.
            </p>
            <div className="mt-6 flex gap-2">
                <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }}
                    placeholder="Nom du nouveau projet" aria-label="Nom du nouveau projet"
                    className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                <button type="button" onClick={create} disabled={!name.trim() || creating}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Créer
                </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            {projects === null && !error ? (
                <Loader2 className="mt-8 w-5 h-5 animate-spin text-slate-300" />
            ) : (
                <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                    {(projects || []).map(p => (
                        <li key={p.id}>
                            <Link href={`/projet/?id=${p.id}`} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-sm">
                                <FolderKanban className="w-5 h-5 shrink-0 text-blue-600" />
                                <span className="min-w-0">
                                    <span className="block font-medium text-slate-900 truncate">{p.name}</span>
                                    <span className="block text-xs text-slate-500 line-clamp-2">{p.instructions || 'Aucune instruction'}</span>
                                </span>
                            </Link>
                        </li>
                    ))}
                    {projects?.length === 0 && <li className="text-sm text-slate-400">Aucun projet pour l&apos;instant.</li>}
                </ul>
            )}
        </div>
    );
}

'use client';

// Détail d'un projet (lot 4) : /projet/?id=<id> (export statique : pas de route dynamique).
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/auth/AuthGuard';
import PublicShell from '@/components/home/PublicShell';
import { projectsApi, type Project, type ProjectSource } from '@/lib/projectsApi';
import { Loader2, MessageSquare, Paperclip, Plus, Trash2, X } from 'lucide-react';

export default function ProjetPage() {
    return (
        <AuthGuard>
            <PublicShell>
                <ProjectDetail />
            </PublicShell>
        </AuthGuard>
    );
}

function ProjectDetail() {
    const [id, setId] = useState<string | null>(null);
    const [project, setProject] = useState<Project | null>(null);
    const [sources, setSources] = useState<ProjectSource[]>([]);
    const [conversations, setConversations] = useState<{ id: string; title: string; updated_at: string }[]>([]);
    const [instructions, setInstructions] = useState('');
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const load = async (pid: string) => {
        try {
            const data = await projectsApi.get(pid);
            setProject(data.project);
            setInstructions(data.project.instructions || '');
            setSources(data.sources);
            setConversations(data.conversations);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Projet introuvable');
        }
    };

    useEffect(() => {
        const pid = new URLSearchParams(window.location.search).get('id');
        setId(pid);
        if (pid) load(pid); else setError('Projet non précisé');
    }, []);

    const canEdit = !!project && project.my_role !== 'viewer';

    const saveInstructions = async () => {
        if (!id) return;
        setSaving(true); setMessage(null);
        try { await projectsApi.update(id, { instructions }); setMessage('Instructions enregistrées'); }
        catch (e: unknown) { setError(e instanceof Error ? e.message : 'Enregistrement impossible'); }
        finally { setSaving(false); }
    };

    const upload = async (files: File[]) => {
        if (!id || files.length === 0) return;
        setUploading(true); setError(null);
        try { await projectsApi.addSources(id, files); await load(id); }
        catch (e: unknown) { setError(e instanceof Error ? e.message : 'Ajout impossible'); }
        finally { setUploading(false); }
    };

    const removeSource = async (sourceId: string) => {
        if (!id) return;
        try { await projectsApi.removeSource(id, sourceId); setSources(s => s.filter(x => x.id !== sourceId)); }
        catch (e: unknown) { setError(e instanceof Error ? e.message : 'Retrait impossible'); }
    };

    const removeProject = async () => {
        if (!id || !window.confirm('Supprimer ce projet et ses sources ? Les conversations sont conservées, sans projet.')) return;
        try { await projectsApi.remove(id); window.location.href = '/projets/'; }
        catch (e: unknown) { setError(e instanceof Error ? e.message : 'Suppression impossible'); }
    };

    if (error && !project) return <p className="mx-auto max-w-3xl px-4 py-10 text-sm text-red-600">{error}</p>;
    if (!project) return <Loader2 className="mx-auto mt-10 w-5 h-5 animate-spin text-slate-300" />;

    return (
        <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
            <div>
                <Link href="/projets" className="text-sm text-blue-600 hover:underline">← Projets</Link>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
                    <Link href={`/?projet=${project.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
                        <Plus className="w-4 h-4" /> Nouvelle conversation dans ce projet
                    </Link>
                </div>
            </div>

            <section aria-labelledby="instructions-title" className="space-y-2">
                <h2 id="instructions-title" className="text-sm font-semibold text-slate-800">Instructions</h2>
                <p className="text-xs text-slate-500">Données à l&apos;assistant au début de chaque conversation du projet (conventions, vocabulaire, périmètre…).</p>
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)} disabled={!canEdit} rows={6}
                    aria-label="Instructions du projet"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-50" />
                {canEdit && (
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={saveInstructions} disabled={saving}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                            {saving ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                        {message && <span className="text-xs text-emerald-600">{message}</span>}
                    </div>
                )}
            </section>

            <section aria-labelledby="sources-title" className="space-y-2">
                <div className="flex items-center justify-between">
                    <h2 id="sources-title" className="text-sm font-semibold text-slate-800">Sources partagées</h2>
                    {canEdit && (
                        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />} Ajouter
                        </button>
                    )}
                    <input ref={fileRef} type="file" multiple hidden accept=".pdf,.docx,.pptx,image/png,image/jpeg,image/webp"
                        onChange={e => { upload(Array.from(e.target.files || [])); e.target.value = ''; }} />
                </div>
                {sources.length === 0 ? <p className="text-xs text-slate-400">Aucune source.</p> : (
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                        {sources.map(s => (
                            <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                                <span className="truncate text-slate-700">{s.filename}</span>
                                {canEdit && (
                                    <button type="button" onClick={() => removeSource(s.id)} aria-label={`Retirer ${s.filename}`}
                                        className="p-1 rounded text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section aria-labelledby="conv-title" className="space-y-2">
                <h2 id="conv-title" className="text-sm font-semibold text-slate-800">Mes conversations du projet</h2>
                {conversations.length === 0 ? <p className="text-xs text-slate-400">Aucune conversation.</p> : (
                    <ul className="space-y-1">
                        {conversations.map(c => (
                            <li key={c.id}>
                                <Link href={`/?c=${c.id}&projet=${project.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                                    <MessageSquare className="w-4 h-4 text-slate-400" /><span className="truncate">{c.title}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {project.my_role === 'owner' && (
                <button type="button" onClick={removeProject} className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:underline">
                    <Trash2 className="w-3.5 h-3.5" /> Supprimer le projet
                </button>
            )}
        </div>
    );
}

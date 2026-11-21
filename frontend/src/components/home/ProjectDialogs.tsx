'use client';

/** Fenêtres des projets : créer (avec contexte facultatif), renommer. */
import { useRef, useState } from 'react';
import { FileText, Loader2, Plus, X } from 'lucide-react';
import { projectsApi, type Project } from '@/lib/projectsApi';
import { Modal, btnGhost, btnPrimary, field } from '@/components/home/ui';

export const notifyProjects = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('processmate:projects'));
};

export function NewProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const create = async () => {
        if (!name.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const p = await projectsApi.create({ name: name.trim(), description: description.trim() });
            if (files.length) await projectsApi.addSources(p.id, files);
            notifyProjects();
            onCreated(p);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Création impossible');
            setBusy(false);
        }
    };

    return (
        <Modal title="Créer un projet" onClose={onClose} footer={<>
            <button type="button" onClick={onClose} className={btnGhost}>Annuler</button>
            <button type="button" onClick={() => void create()} disabled={busy || !name.trim()} className={btnPrimary}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Créer un projet
            </button>
        </>}>
            <div className="space-y-4 pb-2">
                <label className="block text-sm font-medium text-neutral-900">Sur quoi travaillez-vous ?
                    <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={120}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) void create(); }}
                        placeholder="Ex. Procédures crédit immobilier" className={`mt-1.5 ${field}`} />
                </label>
                <label className="block text-sm font-medium text-neutral-900">Qu&apos;essayez-vous de faire ?
                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} maxLength={2000}
                        placeholder="Décrivez votre projet, vos objectifs, le périmètre…" className={`mt-1.5 resize-y ${field}`} />
                </label>
                <div>
                    <p className="text-sm font-medium text-neutral-900">Contexte <span className="font-normal text-neutral-500">facultatif</span></p>
                    {files.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                            {files.map((f, i) => (
                                <li key={i} className="flex items-center gap-2 rounded-lg bg-neutral-100 px-2.5 py-1.5 text-sm text-neutral-900">
                                    <FileText className="w-4 h-4 shrink-0" /><span className="truncate">{f.name}</span>
                                    <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} aria-label={`Retirer ${f.name}`}
                                        className="ml-auto p-0.5 rounded text-neutral-900 hover:bg-neutral-200"><X className="w-3.5 h-3.5" /></button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <button type="button" onClick={() => fileRef.current?.click()} className={`mt-1.5 ${btnGhost} px-3 py-1.5`}>
                        <Plus className="w-4 h-4" /> Ajouter du contexte
                    </button>
                    <input ref={fileRef} type="file" multiple hidden accept=".pdf,.docx,.pptx,.xlsx,.xlsm,.csv,.txt,.md,image/png,image/jpeg,image/webp"
                        onChange={e => { setFiles(prev => [...prev, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
                </div>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            </div>
        </Modal>
    );
}

export function RenameProjectDialog({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: (p: Project) => void }) {
    const [name, setName] = useState(project.name);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const save = async () => {
        if (!name.trim() || name.trim() === project.name) { onClose(); return; }
        setBusy(true);
        try { const p = await projectsApi.update(project.id, { name: name.trim() }); notifyProjects(); onSaved({ ...project, ...p }); }
        catch (e) { setError(e instanceof Error ? e.message : 'Renommage impossible'); setBusy(false); }
    };
    return (
        <Modal title="Renommer le projet" onClose={onClose} footer={<>
            <button type="button" onClick={onClose} className={btnGhost}>Annuler</button>
            <button type="button" onClick={() => void save()} disabled={busy || !name.trim()} className={btnPrimary}>Enregistrer</button>
        </>}>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={120} aria-label="Nom du projet"
                onFocus={e => e.currentTarget.select()} onKeyDown={e => { if (e.key === 'Enter') void save(); }} className={field} />
            {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        </Modal>
    );
}

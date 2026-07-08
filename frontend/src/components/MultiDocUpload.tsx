'use client';

import { useState, useRef, useCallback } from 'react';
import { API_CONFIG } from '@/lib/api-config';
import {
    Upload, X, FileText, Image as ImageIcon,
    Loader2, Sparkles, RotateCcw, BookOpen, Target,
    ChevronDown, ChevronUp, MessageSquare
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface UploadedFile {
    id: string;
    file: File;
    previewUrl?: string;
    type: 'pdf' | 'image';
}

export interface ProcessCard {
    process_id: string;
    title: string;
    description: string;
    sources: { file_id: string; filename: string; source_type: string }[];
    confidence: number;
    estimated_steps: number;
    category: 'instructed' | 'discovered';
}

interface MultiDocUploadProps {
    /** `files` = tous les fichiers uploadés (références + sources), conservés pour un usage ultérieur (ex: capture d'annexe) */
    onDiscoveryComplete: (sessionId: string, cards: ProcessCard[], files: File[]) => void;
    onError: (msg: string) => void;
    onSuccess: (msg: string) => void;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const ACCEPTED: Record<string, 'pdf' | 'image'> = {
    'application/pdf': 'pdf',
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/jpg': 'image',
    'image/webp': 'image',
};

function formatSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────────────────────
// DROP ZONE
// ─────────────────────────────────────────────────────────────

function DropZone({
    label, sublabel, icon, accentColor, files, onAdd, onRemove, maxFiles = 5,
}: {
    label: string;
    sublabel: string;
    icon: React.ReactNode;
    accentColor: 'blue' | 'violet';
    files: UploadedFile[];
    onAdd: (files: File[]) => void;
    onRemove: (id: string) => void;
    maxFiles?: number;
}) {
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const accent = accentColor === 'blue' ? {
        border: dragActive ? 'border-blue-400 bg-blue-50' : 'border-blue-200 hover:border-blue-300 hover:bg-blue-50/50',
        icon: 'bg-blue-50 text-blue-500',
        label: 'text-blue-700',
        badge: 'bg-blue-100 text-blue-700',
    } : {
        border: dragActive ? 'border-violet-400 bg-violet-50' : 'border-violet-200 hover:border-violet-300 hover:bg-violet-50/50',
        icon: 'bg-violet-50 text-violet-500',
        label: 'text-violet-700',
        badge: 'bg-violet-100 text-violet-700',
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        onAdd(Array.from(e.dataTransfer.files));
    };

    return (
        <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center ${accent.icon}`}>
                    {icon}
                </div>
                <div>
                    <p className={`text-sm font-semibold ${accent.label}`}>{label}</p>
                    <p className="text-xs text-slate-400">{sublabel}</p>
                </div>
                {files.length > 0 && (
                    <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${accent.badge}`}>
                        {files.length} fichier{files.length > 1 ? 's' : ''}
                    </span>
                )}
            </div>

            <div
                onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => files.length < maxFiles && inputRef.current?.click()}
                className={`
                    border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer min-h-[80px]
                    ${files.length >= maxFiles ? 'opacity-50 cursor-not-allowed' : accent.border}
                `}
            >
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept=".pdf,image/png,image/jpeg,image/webp"
                    onChange={e => {
                        if (e.target.files) onAdd(Array.from(e.target.files));
                        e.target.value = '';
                    }}
                    className="hidden"
                />

                {files.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-2">
                        <Upload className="w-5 h-5 text-slate-300" />
                        <p className="text-xs text-slate-400">Déposer ou cliquer</p>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {files.map(f => (
                            <div
                                key={f.id}
                                onClick={e => e.stopPropagation()}
                                className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-left"
                            >
                                {f.type === 'image' && f.previewUrl
                                    ? <img src={f.previewUrl} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                                    : <div className="w-7 h-7 rounded bg-red-50 flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-3.5 h-3.5 text-red-400" />
                                    </div>
                                }
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-slate-700 truncate">{f.file.name}</p>
                                    <p className="text-xs text-slate-400">{formatSize(f.file.size)}</p>
                                </div>
                                <button
                                    onClick={() => onRemove(f.id)}
                                    className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                        {files.length < maxFiles && (
                            <p className="text-xs text-slate-400 pt-1">+ Ajouter un fichier</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function MultiDocUpload({
    onDiscoveryComplete,
    onError,
    onSuccess,
}: MultiDocUploadProps) {

    const [refFiles, setRefFiles] = useState<UploadedFile[]>([]);
    const [srcFiles, setSrcFiles] = useState<UploadedFile[]>([]);
    const [manualInstructions, setManualInstructions] = useState('');
    const [showInstructions, setShowInstructions] = useState(false);
    const [loading, setLoading] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    // ── File helpers ─────────────────────────────────────────

    const makeFiles = (incoming: File[], existing: UploadedFile[], max: number): UploadedFile[] => {
        const remaining = max - existing.length;
        const toAdd = incoming.slice(0, remaining);
        const result: UploadedFile[] = [];
        for (const file of toAdd) {
            const type = ACCEPTED[file.type];
            if (!type) { onError(`Format non supporté : ${file.name}`); continue; }
            if (file.size > 20 * 1024 * 1024) { onError(`Fichier trop lourd : ${file.name}`); continue; }
            result.push({ id: crypto.randomUUID(), file, type });
        }
        return result;
    };

    const addRefFiles = useCallback((incoming: File[]) => {
        const newFiles = makeFiles(incoming, refFiles, 5);
        newFiles.forEach(entry => {
            if (entry.type === 'image') {
                const reader = new FileReader();
                reader.onload = e => setRefFiles(prev =>
                    prev.map(f => f.id === entry.id ? { ...f, previewUrl: e.target?.result as string } : f)
                );
                reader.readAsDataURL(entry.file);
            }
        });
        setRefFiles(prev => [...prev, ...newFiles]);
    }, [refFiles]);

    const addSrcFiles = useCallback((incoming: File[]) => {
        const newFiles = makeFiles(incoming, srcFiles, 5);
        newFiles.forEach(entry => {
            if (entry.type === 'image') {
                const reader = new FileReader();
                reader.onload = e => setSrcFiles(prev =>
                    prev.map(f => f.id === entry.id ? { ...f, previewUrl: e.target?.result as string } : f)
                );
                reader.readAsDataURL(entry.file);
            }
        });
        setSrcFiles(prev => [...prev, ...newFiles]);
    }, [srcFiles]);

    const removeRef = (id: string) => setRefFiles(prev => prev.filter(f => f.id !== id));
    const removeSrc = (id: string) => setSrcFiles(prev => prev.filter(f => f.id !== id));

    const totalFiles = refFiles.length + srcFiles.length;
    const canGenerate = totalFiles > 0;

    // ── Discover ─────────────────────────────────────────────

    const handleGenerate = async () => {
        if (!canGenerate || loading) return;
        setLoading(true);

        try {
            const form = new FormData();
            refFiles.forEach(f => form.append('ref_files', f.file));
            srcFiles.forEach(f => form.append('src_files', f.file));
            if (manualInstructions.trim()) {
                form.append('instructions', manualInstructions.trim());
            }

            const discoverRes = await fetch(
                API_CONFIG.getFullUrl(API_CONFIG.endpoints.discoveryAnalyze),
                { method: 'POST', body: form }
            );
            const discoverData = await discoverRes.json();
            if (!discoverRes.ok) throw new Error(discoverData.detail || 'Erreur analyse');

            const processes: ProcessCard[] = discoverData.processes || [];
            if (processes.length === 0) throw new Error('Aucun processus détecté');

            onSuccess(`${processes.length} processus détecté${processes.length > 1 ? 's' : ''}`);
            const allFiles = [...refFiles, ...srcFiles].map(f => f.file);
            onDiscoveryComplete(discoverData.session_id, processes, allFiles);
            setCollapsed(true);

        } catch (err: any) {
            onError(err.message || 'Erreur lors de l\'analyse');
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setRefFiles([]);
        setSrcFiles([]);
        setManualInstructions('');
        setShowInstructions(false);
        setCollapsed(false);
    };

    // ─────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

            {/* Header */}
            <div
                role="button"
                tabIndex={0}
                onClick={() => setCollapsed(c => !c)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed(c => !c); } }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer"
            >
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center">
                        <Upload className="w-4 h-4 text-white" />
                    </div>
                    <div className="text-left">
                        <p className="text-sm font-semibold text-slate-800">Import de documents</p>
                        <p className="text-xs text-slate-400">
                            {totalFiles > 0
                                ? `${refFiles.length} référence${refFiles.length > 1 ? 's' : ''} · ${srcFiles.length} source${srcFiles.length > 1 ? 's' : ''}`
                                : 'Références + sources → procédure générée automatiquement'
                            }
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {totalFiles > 0 && !collapsed && (
                        <button
                            onClick={e => { e.stopPropagation(); reset(); }}
                            className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                        >
                            <RotateCcw className="w-3 h-3" />
                            Vider
                        </button>
                    )}
                    {collapsed
                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                        : <ChevronUp className="w-4 h-4 text-slate-400" />
                    }
                </div>
            </div>

            {!collapsed && (
                <div className="p-4 space-y-4">

                    {/* Deux zones */}
                    <div className="flex gap-4">
                        <DropZone
                            label="Références"
                            sublabel="Modèles, templates, procédures de style"
                            icon={<BookOpen className="w-3.5 h-3.5" />}
                            accentColor="violet"
                            files={refFiles}
                            onAdd={addRefFiles}
                            onRemove={removeRef}
                            maxFiles={5}
                        />
                        <DropZone
                            label="Sources"
                            sublabel="Documents contenant les données"
                            icon={<Target className="w-3.5 h-3.5" />}
                            accentColor="blue"
                            files={srcFiles}
                            onAdd={addSrcFiles}
                            onRemove={removeSrc}
                            maxFiles={5}
                        />
                    </div>

                    <p className="text-xs text-slate-400">
                        Les <span className="text-violet-600 font-medium">références</span> donnent le style et la formulation.
                        Les <span className="text-blue-600 font-medium">sources</span> contiennent les données du nouveau processus.
                        Vous pouvez n'utiliser qu'une seule zone.
                    </p>

                    {/* Instructions manuelles */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <button
                            onClick={() => setShowInstructions(v => !v)}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-xs font-medium text-slate-600">Instructions supplémentaires</span>
                                {manualInstructions.trim() && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                        configurées
                                    </span>
                                )}
                            </div>
                            {showInstructions
                                ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                                : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            }
                        </button>

                        {showInstructions && (
                            <div className="border-t border-slate-100 p-3 space-y-2 bg-slate-50">
                                <p className="text-xs text-slate-500">
                                    Précisez des contraintes supplémentaires pour guider la génération.
                                </p>
                                <p className="text-xs text-slate-400 italic">
                                    Ex : "Le remboursement anticipé et à échéance sont un seul processus unifié, ne pas diviser."
                                </p>
                                <textarea
                                    value={manualInstructions}
                                    onChange={e => setManualInstructions(e.target.value)}
                                    placeholder="Instructions supplémentaires optionnelles…"
                                    rows={3}
                                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 bg-white"
                                />
                            </div>
                        )}
                    </div>

                    {/* Bouton générer */}
                    <button
                        onClick={handleGenerate}
                        disabled={!canGenerate || loading}
                        className={`
                            w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm
                            transition-all duration-200
                            ${!canGenerate || loading
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-slate-800 text-white hover:bg-slate-700 active:scale-[0.99]'
                            }
                        `}
                    >
                        {loading
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération en cours…</>
                            : <><Sparkles className="w-4 h-4" /> Générer la procédure</>
                        }
                    </button>
                </div>
            )}
        </div>
    );
}
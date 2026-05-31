
'use client';

import { useRef, useState, useCallback } from 'react';
import { Upload, FileText, Plus, Sparkles, Loader2 } from 'lucide-react';

interface DropZoneProps {
    onFileLoaded: (xml: string, name: string) => void;
    onNewDiagram: () => void;
}

const BACKEND_URL = 'http://localhost:8002';

export default function DropZone({ onFileLoaded, onNewDiagram }: DropZoneProps) {
    const bpmnInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<string | null>(null);

    // ── Ouvrir un .bpmn existant ─────────────────────────────
    const handleBpmnFile = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const xml = e.target?.result as string;
            if (xml) onFileLoaded(xml, file.name);
        };
        reader.readAsText(file);
    }, [onFileLoaded]);

    // ── Générer depuis PDF/image via backend ──────────────────
    const handleGenerateFromDoc = useCallback(async (file: File) => {
        setGenerating(true);
        setError(null);
        setProgress('Analyse du document en cours…');

        try {
            const formData = new FormData();
            formData.append('file', file);

            setProgress('Génération du logigramme par Gemini…');

            const res = await fetch(`${BACKEND_URL}/generate-bpmn`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || 'Erreur serveur');
            }

            const data = await res.json();
            setProgress('Chargement du diagramme…');
            onFileLoaded(data.xml, data.filename);

        } catch (err: any) {
            setError(err.message || 'Erreur lors de la génération');
        } finally {
            setGenerating(false);
            setProgress(null);
        }
    }, [onFileLoaded]);

    // ── Drag & drop ───────────────────────────────────────────
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (!file) return;

        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'bpmn' || ext === 'xml') {
            handleBpmnFile(file);
        } else if (['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext || '')) {
            handleGenerateFromDoc(file);
        }
    }, [handleBpmnFile, handleGenerateFromDoc]);

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
    const handleDragLeave = () => setDragging(false);

    return (
        <div
            className={`
                w-full h-full flex items-center justify-center
                transition-colors duration-200
                ${dragging ? 'bg-blue-50' : 'bg-slate-50'}
            `}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
        >
            <div className="flex flex-col items-center gap-8 max-w-xl w-full px-8">

                {/* Icône centrale */}
                <div className={`
                    w-20 h-20 rounded-2xl flex items-center justify-center
                    transition-colors duration-200
                    ${dragging ? 'bg-blue-100' : 'bg-white border border-slate-200 shadow-sm'}
                `}>
                    <Upload className={`w-8 h-8 ${dragging ? 'text-blue-500' : 'text-slate-400'}`} />
                </div>

                <div className="text-center">
                    <p className="text-slate-700 font-medium text-lg">
                        {dragging ? 'Déposez le fichier ici' : 'BPMN Studio'}
                    </p>
                    <p className="text-slate-400 text-sm mt-1">
                        Ouvrez un fichier .bpmn ou générez un logigramme depuis un PDF
                    </p>
                </div>

                {/* Progression génération */}
                {generating && (
                    <div className="w-full bg-white border border-blue-200 rounded-xl p-5 flex items-center gap-4">
                        <Loader2 className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-slate-700">Génération en cours</p>
                            <p className="text-xs text-slate-400 mt-0.5">{progress}</p>
                        </div>
                    </div>
                )}

                {/* Erreur */}
                {error && !generating && (
                    <div className="w-full bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600 flex items-start gap-2">
                        <span className="mt-0.5">⚠</span>
                        <span>{error}</span>
                    </div>
                )}

                {/* Actions */}
                {!generating && (
                    <div className="flex flex-col gap-3 w-full">

                        {/* Générer depuis PDF/image */}
                        <button
                            onClick={() => docInputRef.current?.click()}
                            className="
                                w-full flex items-center gap-3 px-5 py-4 rounded-xl
                                bg-blue-500 hover:bg-blue-600 text-white
                                transition-colors duration-150 shadow-sm
                            "
                        >
                            <Sparkles className="w-5 h-5 flex-shrink-0" />
                            <div className="text-left">
                                <p className="text-sm font-semibold">Générer depuis un document</p>
                                <p className="text-xs text-blue-100 mt-0.5">PDF, PNG, JPG — Gemini analyse et génère le BPMN</p>
                            </div>
                        </button>

                        {/* Séparateur */}
                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-slate-200" />
                            <span className="text-xs text-slate-400">ou</span>
                            <div className="flex-1 h-px bg-slate-200" />
                        </div>

                        {/* Ouvrir .bpmn existant */}
                        <button
                            onClick={() => bpmnInputRef.current?.click()}
                            className="
                                w-full flex items-center gap-3 px-5 py-3 rounded-xl
                                bg-white border border-slate-200 hover:border-slate-300
                                text-slate-700 hover:bg-slate-50
                                transition-colors duration-150
                            "
                        >
                            <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <span className="text-sm font-medium">Ouvrir un fichier .bpmn</span>
                        </button>

                        {/* Nouveau diagramme vide */}
                        <button
                            onClick={onNewDiagram}
                            className="
                                w-full flex items-center gap-3 px-5 py-3 rounded-xl
                                bg-white border border-slate-200 hover:border-slate-300
                                text-slate-700 hover:bg-slate-50
                                transition-colors duration-150
                            "
                        >
                            <Plus className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <span className="text-sm font-medium">Nouveau diagramme vide</span>
                        </button>
                    </div>
                )}

                {/* Hint drop */}
                {!generating && (
                    <p className="text-xs text-slate-300 text-center">
                        Déposez directement un .bpmn ou un PDF sur cette zone
                    </p>
                )}
            </div>

            {/* Inputs cachés */}
            <input
                ref={bpmnInputRef}
                type="file"
                accept=".bpmn,.xml"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleBpmnFile(f);
                    e.target.value = '';
                }}
            />
            <input
                ref={docInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleGenerateFromDoc(f);
                    e.target.value = '';
                }}
            />
        </div>
    );
}
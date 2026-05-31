'use client';

import { useCallback, useRef, useState } from 'react';
import {
    X, Upload, FileText, Loader2, CheckCircle2,
    Plus, ChevronDown, AlertCircle, RefreshCw, FolderOpen,
} from 'lucide-react';
import { orchestrationApi, ExtractedProcedure, Procedure } from '@/lib/orchestrationApi';
import { useProceduresStore } from '@/store/proceduresStore';

type ItemStatus = 'queued' | 'extracting' | 'ready' | 'saving' | 'saved' | 'error';

interface FileItem {
    id: string;
    file: File;
    status: ItemStatus;
    extracted?: ExtractedProcedure;
    stepsCount?: number;
    nom: string;
    category: string;
    isNewCategory: boolean;
    newCategoryValue: string;
    error?: string;
    savedProcedure?: Procedure;
}

interface Props {
    onClose: () => void;
    onImported?: (procedure: Procedure, category: string) => void;
    onOpenImported?: (procedure: Procedure) => void;
    onCreateNew?: () => void;
}

const MAX_CONCURRENT = 3;

function makeItem(file: File): FileItem {
    return {
        id: crypto.randomUUID(),
        file,
        status: 'queued',
        nom: file.name.replace(/\.pdf$/i, ''),
        category: '',
        isNewCategory: false,
        newCategoryValue: '',
    };
}

function StatusBadge({ status }: { status: ItemStatus }) {
    const map: Record<ItemStatus, { label: string; cls: string }> = {
        queued: { label: 'En attente', cls: 'bg-slate-100 text-slate-500' },
        extracting: { label: 'Analyse…', cls: 'bg-blue-100 text-blue-700' },
        ready: { label: 'Prêt', cls: 'bg-amber-100 text-amber-700' },
        saving: { label: 'Création…', cls: 'bg-indigo-100 text-indigo-700' },
        saved: { label: 'Créée ✓', cls: 'bg-green-100 text-green-700' },
        error: { label: 'Erreur', cls: 'bg-red-100 text-red-700' },
    };
    const s = map[status];
    return (
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 ${s.cls}`}>
            {s.label}
        </span>
    );
}

function CategorySelector({ categories, item, onChange }: {
    categories: string[];
    item: FileItem;
    onChange: (patch: Partial<FileItem>) => void;
}) {
    const effective = item.isNewCategory ? item.newCategoryValue.trim() : item.category;
    return (
        <div className="space-y-1.5">
            {!item.isNewCategory ? (
                <div className="relative">
                    <select
                        value={item.category}
                        onChange={e => onChange({ category: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                        <option value="">Choisir une catégorie…</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                </div>
            ) : (
                <input
                    value={item.newCategoryValue}
                    onChange={e => onChange({ newCategoryValue: e.target.value })}
                    placeholder="Nouvelle catégorie…"
                    autoFocus
                    className="w-full px-2.5 py-1.5 border border-blue-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
            )}
            <button
                type="button"
                onClick={() => onChange({ isNewCategory: !item.isNewCategory, category: '', newCategoryValue: '' })}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
                <Plus className="h-3 w-3" />
                {item.isNewCategory ? 'Choisir existante' : 'Nouvelle catégorie'}
            </button>
            {effective && (
                <div className="flex items-center gap-1 rounded bg-slate-50 border border-slate-100 px-2 py-1">
                    <FolderOpen className="h-3 w-3 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-500 truncate">
                        <span className="font-semibold text-slate-700">{effective}</span> / {item.nom}
                    </span>
                </div>
            )}
        </div>
    );
}

export default function ImportPdfModal({ onClose, onImported, onOpenImported }: Props) {
    const { fetchProcedures } = useProceduresStore();
    const [items, setItems] = useState<FileItem[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const runningRef = useRef(0);
    const queueRef = useRef<string[]>([]);
    // Ref pour tracker les IDs en cours de sauvegarde — guard anti-doublon
    const savingRef = useRef<Set<string>>(new Set());

    const patchItem = useCallback((id: string, patch: Partial<FileItem>) => {
        setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
    }, []);

    const loadCategories = useCallback(async () => {
        try {
            const res = await orchestrationApi.getCategories();
            setCategories(res.categories);
        } catch { /* silencieux */ }
    }, []);

    const runNext = useCallback((allItems: FileItem[]) => {
        while (runningRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
            const id = queueRef.current.shift()!;
            const item = allItems.find(it => it.id === id);
            if (!item) continue;

            runningRef.current++;
            patchItem(id, { status: 'extracting' });

            orchestrationApi.extractPdf(item.file)
                .then(res => {
                    const meta = res.extracted.procedureMetadata || {};
                    patchItem(id, {
                        status: 'ready',
                        extracted: res.extracted,
                        stepsCount: res.steps_count,
                        nom: meta.nom || res.extracted.title || item.file.name.replace(/\.pdf$/i, ''),
                    });
                })
                .catch(e => {
                    patchItem(id, {
                        status: 'error',
                        error: e instanceof Error ? e.message : 'Extraction échouée',
                    });
                })
                .finally(() => {
                    runningRef.current--;
                    setItems(current => { runNext(current); return current; });
                });
        }
    }, [patchItem]);

    const addFiles = useCallback((files: FileList | File[]) => {
        const pdfs = Array.from(files).filter(f => f.type === 'application/pdf');
        if (pdfs.length === 0) return;
        const newItems = pdfs.map(makeItem);
        queueRef.current.push(...newItems.map(it => it.id));
        setItems(prev => {
            const next = [...prev, ...newItems];
            loadCategories();
            runNext(next);
            return next;
        });
    }, [loadCategories, runNext]);

    // ── saveItem : guard synchrone + async hors setState ─────────
    const saveItem = useCallback((id: string) => {
        // 1. Guard immédiat : si déjà en cours, on sort
        if (savingRef.current.has(id)) return;
        savingRef.current.add(id);

        // 2. Capturer l'item et passer à 'saving' dans setState
        //    On stocke une copie locale pour l'appel async
        let snapshot: FileItem | null = null;

        setItems(prev => {
            const item = prev.find(it => it.id === id);
            // Vérifications — si l'item n'est pas 'ready', libérer le guard
            if (!item || item.status !== 'ready' || !item.extracted) {
                savingRef.current.delete(id);
                return prev;
            }
            const category = item.isNewCategory ? item.newCategoryValue.trim() : item.category;
            if (!category || !item.nom.trim()) {
                savingRef.current.delete(id);
                return prev;
            }
            // Capturer une copie immuable pour l'usage async
            snapshot = { ...item };
            return prev.map(it => it.id === id ? { ...it, status: 'saving' as ItemStatus } : it);
        });

        // 3. Lancer l'appel API dans un microtask — jamais dans un setState callback
        //    Promise.resolve() garantit l'exécution après le flush React
        Promise.resolve().then(() => {
            if (!snapshot) {
                savingRef.current.delete(id);
                return;
            }
            const item = snapshot as FileItem;
            const category = item.isNewCategory ? item.newCategoryValue.trim() : item.category;

            orchestrationApi.importFromExtraction(
                item.nom.trim(),
                category,
                item.file.name,
                item.extracted!
            )
                .then(async res => {
                    await fetchProcedures(true);
                    patchItem(id, { status: 'saved', savedProcedure: res.procedure });
                    onImported?.(res.procedure, category);
                    loadCategories();
                })
                .catch(e => {
                    patchItem(id, {
                        status: 'ready',
                        error: e instanceof Error ? e.message : 'Erreur création',
                    });
                })
                .finally(() => {
                    savingRef.current.delete(id);
                });
        });
    }, [patchItem, fetchProcedures, onImported, loadCategories]);

    const retryItem = useCallback((id: string) => {
        setItems(prev => {
            const item = prev.find(it => it.id === id);
            if (!item) return prev;
            queueRef.current.push(id);
            const next = prev.map(it => it.id === id ? { ...it, status: 'queued' as ItemStatus, error: undefined } : it);
            runNext(next);
            return next;
        });
    }, [runNext]);

    const removeItem = useCallback((id: string) => {
        setItems(prev => prev.filter(it => it.id !== id));
        queueRef.current = queueRef.current.filter(qid => qid !== id);
    }, []);

    const ready = items.filter(it => it.status === 'ready').length;
    const saved = items.filter(it => it.status === 'saved').length;
    const errors = items.filter(it => it.status === 'error').length;
    const running = items.filter(it => it.status === 'extracting').length;
    const canSaveAll = items.filter(it => {
        if (it.status !== 'ready') return false;
        const cat = it.isNewCategory ? it.newCategoryValue.trim() : it.category;
        return Boolean(cat && it.nom.trim());
    }).length;

    const saveAll = () => {
        items.forEach(it => {
            if (it.status !== 'ready') return;
            const cat = it.isNewCategory ? it.newCategoryValue.trim() : it.category;
            if (cat && it.nom.trim()) saveItem(it.id);
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                            <FileText className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-900">Importer des procédures PDF</p>
                            <p className="text-xs text-slate-400">
                                {items.length === 0
                                    ? 'Glissez un ou plusieurs fichiers'
                                    : `${items.length} fichier${items.length > 1 ? 's' : ''} · ${saved} créé${saved > 1 ? 's' : ''} · ${ready} prêt${ready > 1 ? 's' : ''} · ${running} en cours${errors > 0 ? ` · ${errors} erreur${errors > 1 ? 's' : ''}` : ''}`
                                }
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>

                {/* Zone de dépôt */}
                <div
                    className={`shrink-0 mx-6 mt-4 border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                        }`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                    onClick={() => inputRef.current?.click()}
                >
                    <div className="flex items-center justify-center gap-3">
                        <Upload className="h-5 w-5 text-blue-400 shrink-0" />
                        <div className="text-left">
                            <p className="text-sm font-semibold text-slate-700">
                                {items.length === 0 ? 'Glissez vos PDFs ici' : "Ajouter d'autres PDFs"}
                            </p>
                            <p className="text-xs text-slate-400">ou cliquez pour parcourir · plusieurs fichiers acceptés</p>
                        </div>
                    </div>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="application/pdf"
                        multiple
                        className="hidden"
                        onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                    />
                </div>

                {/* Liste */}
                {items.length > 0 && (
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 min-h-0">
                        {items.map(item => (
                            <div
                                key={item.id}
                                className={`rounded-xl border p-4 transition-colors ${item.status === 'saved' ? 'border-green-200 bg-green-50' :
                                    item.status === 'error' ? 'border-red-200 bg-red-50' :
                                        item.status === 'extracting' ? 'border-blue-200 bg-blue-50/30' :
                                            'border-slate-200 bg-white'
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="shrink-0 mt-0.5">
                                        {item.status === 'extracting' || item.status === 'saving' ? (
                                            <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                                        ) : item.status === 'saved' ? (
                                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                                        ) : item.status === 'error' ? (
                                            <AlertCircle className="h-4 w-4 text-red-500" />
                                        ) : (
                                            <FileText className="h-4 w-4 text-slate-400" />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0 space-y-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <StatusBadge status={item.status} />
                                            {item.stepsCount !== undefined && (
                                                <span className="text-xs text-slate-400">
                                                    {item.stepsCount} étape{item.stepsCount > 1 ? 's' : ''}
                                                </span>
                                            )}
                                            <span className="text-xs text-slate-400 truncate max-w-48">{item.file.name}</span>
                                        </div>

                                        {(item.status === 'ready' || item.status === 'saving') && (
                                            <input
                                                value={item.nom}
                                                onChange={e => patchItem(item.id, { nom: e.target.value })}
                                                disabled={item.status === 'saving'}
                                                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-60"
                                                placeholder="Nom de la procédure"
                                            />
                                        )}

                                        {item.status === 'saved' && (
                                            <p className="text-sm font-semibold text-green-800">{item.nom}</p>
                                        )}

                                        {item.status === 'ready' && (
                                            <CategorySelector
                                                categories={categories}
                                                item={item}
                                                onChange={patch => patchItem(item.id, patch)}
                                            />
                                        )}

                                        {item.status === 'saved' && (
                                            <p className="text-xs text-green-700">
                                                {item.isNewCategory ? item.newCategoryValue : item.category}
                                            </p>
                                        )}

                                        {item.error && (
                                            <p className="text-xs text-red-700">{item.error}</p>
                                        )}
                                    </div>

                                    <div className="shrink-0 flex flex-col gap-1">
                                        {item.status === 'ready' && (() => {
                                            const cat = item.isNewCategory ? item.newCategoryValue.trim() : item.category;
                                            const canSave = Boolean(cat && item.nom.trim());
                                            return (
                                                <button
                                                    type="button"
                                                    onClick={() => saveItem(item.id)}
                                                    disabled={!canSave}
                                                    className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    Créer
                                                </button>
                                            );
                                        })()}

                                        {item.status === 'saved' && onOpenImported && item.savedProcedure && (
                                            <button
                                                type="button"
                                                onClick={() => { onOpenImported(item.savedProcedure!); onClose(); }}
                                                className="rounded-lg border border-green-200 bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-200"
                                            >
                                                Ouvrir
                                            </button>
                                        )}

                                        {item.status === 'error' && (
                                            <button
                                                type="button"
                                                onClick={() => retryItem(item.id)}
                                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                                            >
                                                <RefreshCw className="h-3 w-3" /> Réessayer
                                            </button>
                                        )}

                                        {item.status !== 'extracting' && item.status !== 'saving' && (
                                            <button
                                                type="button"
                                                onClick={() => removeItem(item.id)}
                                                className="rounded-lg p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                title="Retirer"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Footer */}
                <div className="shrink-0 border-t border-slate-100 px-6 py-4 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-400">
                        Extraction parallèle · max {MAX_CONCURRENT} simultanés
                    </p>
                    <div className="flex items-center gap-2">
                        {canSaveAll > 1 && (
                            <button
                                type="button"
                                onClick={saveAll}
                                className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                            >
                                Créer les {canSaveAll} prêtes
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                            {saved > 0 ? 'Fermer' : 'Annuler'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
} 
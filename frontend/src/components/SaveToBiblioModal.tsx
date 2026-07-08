'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, FolderOpen, Plus, BookMarked, ChevronDown, ChevronRight, Layers, Tag, Loader2, Check } from 'lucide-react';
import { taxonomyApi, type TaxonomyNode, type TaxonomyLevel } from '@/lib/taxonomyApi';

interface SaveToBiblioModalProps {
    open: boolean;
    initialNom: string;
    onClose: () => void;
    onConfirm: (nom: string, category: string, taxonomyId?: string) => Promise<void>;
}

const LEVEL_ICONS: Record<string, typeof FolderOpen> = { theme: FolderOpen, category: Tag, subcategory: Layers };
const LEVEL_COLORS: Record<string, string> = { theme: 'text-indigo-500', category: 'text-blue-400', subcategory: 'text-violet-400' };

function buildBreadcrumb(tree: TaxonomyNode[], targetId: string): string {
    const find = (nodes: TaxonomyNode[], path: string[]): string[] | null => {
        for (const n of nodes) {
            const cur = [...path, n.name];
            if (n.id === targetId) return cur;
            const found = find(n.children || [], cur);
            if (found) return found;
        }
        return null;
    };
    return (find(tree, []) || []).join(' / ');
}

export default function SaveToBiblioModal({ open, initialNom, onClose, onConfirm }: SaveToBiblioModalProps) {
    const [nom, setNom] = useState(initialNom);
    const [tree, setTree] = useState<TaxonomyNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedLevel, setSelectedLevel] = useState<TaxonomyLevel | null>(null);
    const [creating, setCreating] = useState<{ parentId: string | null; level: TaxonomyLevel } | null>(null);
    const [newName, setNewName] = useState('');
    const [creatingLoading, setCreatingLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setNom(initialNom);
        setSelectedId(null);
        setSelectedLevel(null);
        setCreating(null);
        setNewName('');
        setLoading(true);
        taxonomyApi.getTree()
            .then(res => {
                setTree(res.tree);
                const allIds = new Set<string>();
                const collect = (nodes: TaxonomyNode[]) => { nodes.forEach(n => { allIds.add(n.id); collect(n.children || []); }); };
                collect(res.tree);
                setExpanded(allIds);
            })
            .catch(() => setTree([]))
            .finally(() => setLoading(false));
    }, [open, initialNom]);

    const breadcrumb = useMemo(() => {
        if (!selectedId) return '';
        return buildBreadcrumb(tree, selectedId);
    }, [tree, selectedId]);

    const canConfirm = nom.trim().length > 0 && selectedId && selectedLevel === 'subcategory' && !saving;

    const handleConfirm = async () => {
        if (!canConfirm || !selectedId) return;
        setSaving(true);
        try {
            await onConfirm(nom.trim(), breadcrumb, selectedId);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    const handleCreate = async () => {
        if (!newName.trim() || !creating || creatingLoading) return;
        setCreatingLoading(true);
        try {
            const res = await taxonomyApi.create({
                name: newName.trim(),
                level: creating.level,
                parent_id: creating.parentId,
            });
            const treeRes = await taxonomyApi.getTree();
            setTree(treeRes.tree);
            setSelectedId(res.node.id);
            setSelectedLevel(creating.level);
            setExpanded(prev => { const next = new Set(prev); if (creating.parentId) next.add(creating.parentId); next.add(res.node.id); return next; });
            setCreating(null);
            setNewName('');
        } catch { }
        finally { setCreatingLoading(false); }
    };

    const toggle = (id: string) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const selectNode = (node: TaxonomyNode) => {
        setSelectedId(node.id);
        setSelectedLevel(node.level as TaxonomyLevel);
        if (node.children?.length) {
            setExpanded(prev => { const next = new Set(prev); next.add(node.id); return next; });
        }
    };

    const childLevel = (level: string): TaxonomyLevel | null =>
        level === 'theme' ? 'category' : level === 'category' ? 'subcategory' : null;

    const LEVEL_LABELS: Record<string, string> = { theme: 'thème', category: 'catégorie', subcategory: 'sous-catégorie' };

    function renderNode(node: TaxonomyNode, depth: number) {
        const isExp = expanded.has(node.id);
        const isSelected = selectedId === node.id;
        const Icon = LEVEL_ICONS[node.level] || Layers;
        const color = LEVEL_COLORS[node.level] || 'text-gray-400';
        const hasChildren = (node.children || []).length > 0 || node.level !== 'subcategory';
        const nextLevel = childLevel(node.level);
        const isCreatingHere = creating?.parentId === node.id;

        return (
            <div key={node.id} style={{ marginLeft: depth * 14 }}>
                <div
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}
                    onClick={() => selectNode(node)}
                >
                    {hasChildren ? (
                        <button type="button" onClick={e => { e.stopPropagation(); toggle(node.id); }} className="shrink-0 p-0.5 text-gray-400 hover:text-gray-600">
                            {isExp ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                    ) : <span className="w-4" />}
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                    <span className={`text-xs flex-1 truncate ${isSelected ? 'font-semibold text-blue-800' : 'text-gray-700'}`}>{node.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </div>
                {isExp && (
                    <div>
                        {(node.children || []).map(child => renderNode(child, depth + 1))}
                        {isCreatingHere && (
                            <div style={{ marginLeft: 14 }} className="flex items-center gap-1.5 py-1 px-2">
                                <input autoFocus type="text" value={newName} onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(null); setNewName(''); } }}
                                    placeholder={`Nouvelle ${LEVEL_LABELS[creating!.level]}…`}
                                    className="flex-1 px-2 py-1 text-xs border border-blue-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                <button type="button" title="Créer" onClick={handleCreate} disabled={!newName.trim() || creatingLoading}
                                    className="px-2 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50">
                                    {creatingLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'OK'}
                                </button>
                                <button type="button" title="Annuler" onClick={() => { setCreating(null); setNewName(''); }}
                                    className="px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-md">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        )}
                        {nextLevel && isExp && !isCreatingHere && (
                            <button type="button"
                                onClick={e => { e.stopPropagation(); setCreating({ parentId: node.id, level: nextLevel }); setExpanded(prev => { const next = new Set(prev); next.add(node.id); return next; }); }}
                                style={{ marginLeft: 14 }}
                                className="flex items-center gap-1 px-2 py-1 text-[11px] text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors mt-0.5">
                                <Plus className="w-3 h-3" /> Nouvelle {LEVEL_LABELS[nextLevel]}
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                            <BookMarked className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-slate-800">Enregistrer dans la bibliothèque</p>
                            <p className="text-xs text-slate-400">Choisissez l'emplacement dans la taxonomie</p>
                        </div>
                    </div>
                    <button type="button" title="Fermer" onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors">
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">

                    {/* Nom */}
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                            Nom de la procédure <span className="text-red-400">*</span>
                        </label>
                        <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                            placeholder="Ex. Ouverture de compte client"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                    </div>

                    {/* Taxonomie */}
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                            Emplacement <span className="text-red-400">*</span>
                        </label>
                        <div className="border border-slate-200 rounded-lg max-h-[240px] overflow-y-auto p-2">
                            {loading ? (
                                <div className="flex items-center justify-center py-6">
                                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                                </div>
                            ) : tree.length === 0 ? (
                                <div className="text-center py-6">
                                    <p className="text-xs text-gray-400 mb-2">Aucun thème. Créez-en un pour commencer.</p>
                                </div>
                            ) : (
                                <div className="space-y-0.5">
                                    {tree.map(node => renderNode(node, 0))}
                                </div>
                            )}
                            {/* Create theme at root */}
                            {!creating && (
                                <button type="button"
                                    onClick={() => setCreating({ parentId: null, level: 'theme' })}
                                    className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors mt-1 w-full">
                                    <Plus className="w-3 h-3" /> Nouveau thème
                                </button>
                            )}
                            {creating?.parentId === null && (
                                <div className="flex items-center gap-1.5 py-1 px-2 mt-1">
                                    <input autoFocus type="text" value={newName} onChange={e => setNewName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(null); setNewName(''); } }}
                                        placeholder="Nouveau thème…"
                                        className="flex-1 px-2 py-1 text-xs border border-blue-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                    <button type="button" title="Créer" onClick={handleCreate} disabled={!newName.trim() || creatingLoading}
                                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50">
                                        {creatingLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'OK'}
                                    </button>
                                    <button type="button" title="Annuler" onClick={() => { setCreating(null); setNewName(''); }}
                                        className="px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-md">
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                        {selectedId && selectedLevel !== 'subcategory' && (
                            <p className="text-[11px] text-amber-600 mt-1.5">Sélectionnez une sous-catégorie pour enregistrer la procédure.</p>
                        )}
                    </div>

                    {/* Breadcrumb */}
                    {nom.trim() && breadcrumb && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                            <FolderOpen className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <p className="text-xs text-slate-500 truncate">
                                <span className="font-medium text-slate-700">{breadcrumb}</span>
                                <span className="mx-1.5 text-slate-300">/</span>
                                {nom.trim()}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors">
                        Annuler
                    </button>
                    <button type="button" onClick={handleConfirm} disabled={!canConfirm}
                        className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5">
                        <BookMarked className="w-3.5 h-3.5" />
                        {saving ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                </div>
            </div>
        </div>
    );
}

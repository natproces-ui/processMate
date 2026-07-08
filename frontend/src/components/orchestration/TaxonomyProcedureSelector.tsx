'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown, FolderOpen, Tag, Layers, FileText, Search, Loader2 } from 'lucide-react';
import { taxonomyApi, type TaxonomyNode } from '@/lib/taxonomyApi';

interface Props {
    procedures: Array<{ id: string; nom: string; ref?: string; category?: string; taxonomy_id?: string | null }>;
    selected: string[];
    onChange: (ids: string[]) => void;
    maxHeight?: string;
}

export default function TaxonomyProcedureSelector({ procedures, selected, onChange, maxHeight = '300px' }: Props) {
    const [tree, setTree] = useState<TaxonomyNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');

    useEffect(() => {
        taxonomyApi.getTree().then(r => setTree(r.tree)).catch(() => {}).finally(() => setLoading(false));
    }, []);

    const selectedSet = useMemo(() => new Set(selected), [selected]);

    const toggle = (id: string) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    // Procedures grouped by taxonomy_id
    const procsByTaxId = useMemo(() => {
        const map: Record<string, typeof procedures> = {};
        procedures.forEach(p => {
            const tid = p.taxonomy_id || '__unclassified__';
            if (!map[tid]) map[tid] = [];
            map[tid].push(p);
        });
        return map;
    }, [procedures]);

    // Get all procedure IDs under a taxonomy node (recursive)
    const getProcsUnder = useCallback((node: TaxonomyNode): string[] => {
        const direct = (procsByTaxId[node.id] || []).map(p => p.id);
        const nested = (node.children || []).flatMap(c => getProcsUnder(c));
        return [...direct, ...nested];
    }, [procsByTaxId]);

    // Count procedures under a node
    const countUnder = useCallback((node: TaxonomyNode): number => {
        return getProcsUnder(node).length;
    }, [getProcsUnder]);

    // Check state for a node: 'all' | 'some' | 'none'
    const checkState = useCallback((node: TaxonomyNode): 'all' | 'some' | 'none' => {
        const ids = getProcsUnder(node);
        if (ids.length === 0) return 'none';
        const checked = ids.filter(id => selectedSet.has(id)).length;
        if (checked === ids.length) return 'all';
        if (checked > 0) return 'some';
        return 'none';
    }, [getProcsUnder, selectedSet]);

    // Toggle all procedures under a node
    const toggleNode = useCallback((node: TaxonomyNode) => {
        const ids = getProcsUnder(node);
        const state = checkState(node);
        if (state === 'all') {
            onChange(selected.filter(id => !ids.includes(id)));
        } else {
            const toAdd = ids.filter(id => !selectedSet.has(id));
            onChange([...selected, ...toAdd]);
        }
    }, [getProcsUnder, checkState, selected, selectedSet, onChange]);

    // Toggle a single procedure
    const toggleProc = useCallback((procId: string) => {
        if (selectedSet.has(procId)) {
            onChange(selected.filter(id => id !== procId));
        } else {
            onChange([...selected, procId]);
        }
    }, [selected, selectedSet, onChange]);

    // Search results
    const searchResults = useMemo(() => {
        if (!search.trim()) return null;
        const q = search.toLowerCase();
        return procedures.filter(p =>
            p.nom.toLowerCase().includes(q) ||
            (p.ref || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q)
        );
    }, [search, procedures]);

    const ICONS = { theme: FolderOpen, category: Tag, subcategory: Layers };
    const COLORS = { theme: 'text-indigo-500', category: 'text-blue-400', subcategory: 'text-violet-400' };

    function renderNode(node: TaxonomyNode, depth: number) {
        const count = countUnder(node);
        if (count === 0) return null;
        const isExp = expanded.has(node.id);
        const Icon = ICONS[node.level as keyof typeof ICONS] || Layers;
        const color = COLORS[node.level as keyof typeof COLORS] || 'text-gray-400';
        const state = checkState(node);
        const isLeaf = node.level === 'subcategory';
        const procs = procsByTaxId[node.id] || [];

        return (
            <div key={node.id} style={{ paddingLeft: depth * 14 }}>
                <div className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-gray-50 group">
                    <button type="button" onClick={() => toggle(node.id)} className="shrink-0 text-gray-400 p-0.5">
                        {isExp ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    <input type="checkbox"
                        checked={state === 'all'}
                        ref={el => { if (el) el.indeterminate = state === 'some'; }}
                        onChange={() => toggleNode(node)}
                        className="w-3.5 h-3.5 rounded text-blue-600 shrink-0 cursor-pointer"
                    />
                    <Icon className={`w-3 h-3 shrink-0 ${color}`} />
                    <span className="flex-1 text-xs font-medium text-gray-700 truncate">{node.name}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{count}</span>
                </div>
                {isExp && (
                    <div>
                        {(node.children || []).map(child => renderNode(child, depth + 1))}
                        {isLeaf && procs.map(proc => (
                            <div key={proc.id} style={{ paddingLeft: (depth + 1) * 14 }}
                                className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-blue-50">
                                <span className="w-3 h-3 shrink-0" />
                                <input type="checkbox"
                                    checked={selectedSet.has(proc.id)}
                                    onChange={() => toggleProc(proc.id)}
                                    className="w-3.5 h-3.5 rounded text-blue-600 shrink-0 cursor-pointer"
                                />
                                <FileText className="w-3 h-3 text-gray-400 shrink-0" />
                                <span className="flex-1 text-xs text-gray-600 truncate">{proc.nom}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    const unclassified = procsByTaxId['__unclassified__'] || [];

    return (
        <div>
            {/* Search */}
            <div className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 mb-1.5">
                <Search className="h-3 w-3 text-gray-400 shrink-0" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Filtrer procédures…"
                    className="flex-1 text-xs outline-none bg-transparent" />
            </div>

            {/* Selection count */}
            <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[10px] text-gray-400">{selected.length} sélectionnée{selected.length !== 1 ? 's' : ''}</span>
                {selected.length > 0 && (
                    <button type="button" onClick={() => onChange([])} className="text-[10px] text-blue-600 hover:underline">Tout effacer</button>
                )}
            </div>

            {/* Tree or search results */}
            <div className="overflow-y-auto" style={{ maxHeight }}>
                {loading ? (
                    <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-blue-400" /></div>
                ) : searchResults ? (
                    searchResults.map(proc => (
                        <label key={proc.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-blue-50 cursor-pointer">
                            <input type="checkbox"
                                checked={selectedSet.has(proc.id)}
                                onChange={() => toggleProc(proc.id)}
                                className="w-3.5 h-3.5 rounded text-blue-600 shrink-0"
                            />
                            <FileText className="w-3 h-3 text-gray-400 shrink-0" />
                            <span className="text-xs text-gray-700 truncate flex-1">{proc.nom}</span>
                            {proc.ref && <span className="text-[10px] text-gray-400 shrink-0">{proc.ref}</span>}
                        </label>
                    ))
                ) : (
                    <>
                        {tree.map(node => renderNode(node, 0))}
                        {unclassified.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                                <p className="text-[10px] text-gray-400 px-1 mb-1">Non classées ({unclassified.length})</p>
                                {unclassified.map(proc => (
                                    <label key={proc.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-blue-50 cursor-pointer">
                                        <input type="checkbox"
                                            checked={selectedSet.has(proc.id)}
                                            onChange={() => toggleProc(proc.id)}
                                            className="w-3.5 h-3.5 rounded text-blue-600 shrink-0"
                                        />
                                        <FileText className="w-3 h-3 text-gray-400 shrink-0" />
                                        <span className="text-xs text-gray-600 truncate flex-1">{proc.nom}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

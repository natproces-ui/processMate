'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
    ChevronRight, ChevronDown, FolderOpen, Tag, Layers, FileText,
    Plus, Search, Loader2, MoreVertical, X, PenLine, Users,
    GitBranch, ListChecks, Megaphone, Pencil, Trash2, RefreshCw, Workflow, Wand2, MessageSquare,
} from 'lucide-react';
import { taxonomyApi, type TaxonomyNode } from '@/lib/taxonomyApi';
import { orchestrationApi, type Procedure } from '@/lib/orchestrationApi';
import { campaignsApi, type Campaign, CAMPAIGN_STATUS_COLORS, CAMPAIGN_STATUS_LABELS } from '@/lib/campaignsApi';
import { useProceduresStore } from '@/store/proceduresStore';
import { useAuth } from '@/context/AuthContext';
import { referentialApi } from '@/lib/referentialApi';

/** Premier message proposé dans le chat : on joint ses sources et on l'adapte avant d'envoyer */
const SOURCES_DRAFT = 'Construis le référentiel de nos processus à partir de ces documents (cartographie, manuels, code…) : '
    + 'thèmes, catégories, sous-catégories et noms des procédures, avec tes remarques.';
import type { TaskActor } from '@/lib/orchestrationTasksApi';

const ProcedureJourney = dynamic(
    () => import('@/components/orchestration/ProcedureJourney'),
    { loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-neutral-400" /></div> }
);

const ProcedureDetail = dynamic(
    () => import('@/components/orchestration/ProcedureDetail'),
    { loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-neutral-400" /></div> }
);

// ── Types ─────────────────────────────────────────────────────

interface ProceduresLibraryProps {
    /** titre de l'écran (« Référentiel · nom de l'organisation ») */
    title?: string;
    onOpenEditor?: (procedureId: string) => void;
    onOpenTasks?: (filter: { procedureIds?: string[]; label: string }) => void;
    onAssignToCampaign?: (procedureId: string) => void;
    onOpenStudio?: (procedureId: string) => void;
    expandToNodeId?: string | null;
}

type ModalState =
    | null
    | { type: 'raci'; procedureId: string; procedureName: string }
    | { type: 'journey'; procedureId: string; procedureName: string }
    | { type: 'workflow'; procedureId: string; procedureName: string }
    | { type: 'assign-campaign'; procedureId: string; procedureName: string }
    | { type: 'create-node'; parentId: string | null; level: 'theme' | 'category' | 'subcategory' }
    | { type: 'create-proc'; subcategoryId: string }
    | { type: 'rename-node'; nodeId: string; currentName: string; level: string }
    | { type: 'confirm-delete'; nodeId: string; nodeName: string; level: string };

// ── Context menu ──────────────────────────────────────────────

interface MenuPos { x: number; y: number }
interface MenuTarget {
    kind: 'theme' | 'category' | 'subcategory' | 'procedure';
    id: string;
    name: string;
    parentId?: string | null;
}

function ContextMenu({ pos, target, isAdmin, onAction, onClose }: {
    pos: MenuPos;
    target: MenuTarget;
    isAdmin: boolean;
    onAction: (action: string, target: MenuTarget) => void;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const items: { label: string; action: string; icon: React.ReactNode; admin?: boolean; divider?: boolean }[] = [];

    if (target.kind === 'procedure') {
        items.push(
            { label: "Ouvrir dans l'éditeur", action: 'open-editor', icon: <PenLine className="w-3.5 h-3.5" /> },
            { label: 'Ouvrir dans le chat', action: 'open-studio', icon: <MessageSquare className="w-3.5 h-3.5" /> },
            { label: 'Voir le RACI', action: 'show-raci', icon: <Users className="w-3.5 h-3.5" /> },
            { label: 'Voir le parcours', action: 'show-journey', icon: <GitBranch className="w-3.5 h-3.5" /> },
            { label: 'Flux de travail', action: 'show-workflow', icon: <Workflow className="w-3.5 h-3.5" /> },
            { label: 'Voir les tâches', action: 'show-tasks', icon: <ListChecks className="w-3.5 h-3.5" /> },
            { label: 'Assigner à une campagne', action: 'assign-campaign', icon: <Megaphone className="w-3.5 h-3.5" />, admin: true, divider: true },
            { label: 'Renommer', action: 'rename', icon: <Pencil className="w-3.5 h-3.5" />, admin: true },
            { label: 'Supprimer', action: 'delete', icon: <Trash2 className="w-3.5 h-3.5" />, admin: true },
        );
    } else {
        items.push(
            { label: 'Voir les tâches', action: 'show-tasks', icon: <ListChecks className="w-3.5 h-3.5" /> },
        );
        if (target.kind === 'theme') {
            items.push({ label: 'Créer une catégorie', action: 'create-child', icon: <Plus className="w-3.5 h-3.5" />, admin: true, divider: true });
        } else if (target.kind === 'category') {
            items.push({ label: 'Créer une sous-catégorie', action: 'create-child', icon: <Plus className="w-3.5 h-3.5" />, admin: true, divider: true });
        } else if (target.kind === 'subcategory') {
            // une procédure se range toujours dans une sous-catégorie (thème › catégorie › sous-catégorie)
            items.push({ label: 'Créer une procédure', action: 'create-proc', icon: <Plus className="w-3.5 h-3.5" />, admin: true, divider: true });
        }
        items.push(
            { label: 'Renommer', action: 'rename', icon: <Pencil className="w-3.5 h-3.5" />, admin: true },
            { label: 'Supprimer', action: 'delete', icon: <Trash2 className="w-3.5 h-3.5" />, admin: true },
        );
    }

    const visibleItems = items.filter(i => !i.admin || isAdmin);

    return (
        <div ref={ref} className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 py-1.5 w-56"
            style={{ left: Math.min(pos.x, window.innerWidth - 240), top: Math.min(pos.y, window.innerHeight - 300) }}>
            {visibleItems.map((item, i) => (
                <React.Fragment key={item.action}>
                    {item.divider && i > 0 && <div className="my-1 border-t border-gray-100" />}
                    <button type="button"
                        onClick={() => { onAction(item.action, target); onClose(); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors text-left">
                        <span className="text-gray-400">{item.icon}</span>
                        {item.label}
                    </button>
                </React.Fragment>
            ))}
        </div>
    );
}

// ── Inline create form ────────────────────────────────────────

function InlineCreateForm({ placeholder, onSubmit, onCancel }: {
    placeholder: string; onSubmit: (name: string) => void; onCancel: () => void;
}) {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const handleSubmit = async () => {
        if (!name.trim()) return;
        setSaving(true);
        await onSubmit(name.trim());
        setSaving(false);
    };
    return (
        <div className="flex items-center gap-2 py-1.5 px-2">
            <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel(); }}
                placeholder={placeholder}
                className="flex-1 px-3 py-1.5 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-300" />
            <button type="button" onClick={handleSubmit} disabled={!name.trim() || saving}
                className="px-3 py-1.5 bg-neutral-900 text-white text-xs font-semibold rounded-lg hover:bg-neutral-700 disabled:opacity-50">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Créer'}
            </button>
            <button type="button" onClick={onCancel}
                className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Annuler</button>
        </div>
    );
}

// ── Status badge ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const c = status === 'Validée' ? 'bg-green-100 text-green-700'
        : status === 'En validation' ? 'bg-indigo-100 text-indigo-700'
        : status === 'En vérification' ? 'bg-violet-100 text-violet-700'
        : status === 'En cours' ? 'bg-blue-100 text-blue-700'
        : status === 'Retours reçus' ? 'bg-orange-100 text-orange-700'
        : status === 'En révision' ? 'bg-amber-100 text-amber-700'
        : status === 'Bloquée' ? 'bg-red-100 text-red-700'
        : status === 'Rejetée' ? 'bg-red-100 text-red-700'
        : status === 'En pause' ? 'bg-purple-100 text-purple-700'
        : 'bg-gray-100 text-gray-600';
    return <span className={`shrink-0 whitespace-nowrap text-[10px] font-semibold px-2 py-0.5 rounded-full ${c}`}>{status}</span>;
}

// ── Raci Modal (editable, single-procedure) ──────────────────

const RACIMatrix = dynamic(() => import('@/components/orchestration/RACIMatrix'), {
    loading: () => <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-neutral-400" /></div>,
});

function RaciModalLazy({ procedureId, procedureName, isAdmin, onClose, currentActor }: {
    procedureId: string; procedureName: string; isAdmin: boolean; onClose: () => void;
    currentActor?: TaskActor;
}) {
    const actor: TaskActor = currentActor || { id: '', name: '', email: '', role: isAdmin ? 'admin' : 'user' };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[85vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <Users className="w-4 h-4 text-neutral-900" />
                            <span className="text-[11px] font-bold text-neutral-900 uppercase tracking-widest">Matrice RACI</span>
                        </div>
                        <h2 className="text-sm font-bold text-gray-900 leading-snug">{procedureName}</h2>
                    </div>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <RACIMatrix currentActor={actor} filterProcedureId={procedureId} />
                </div>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────

export default function ProceduresLibrary({ onOpenEditor, onOpenTasks, onAssignToCampaign, onOpenStudio, expandToNodeId, title }: ProceduresLibraryProps) {
    const { profile, access } = useAuth();
    const { procedures, fetchProcedures, removeProcedure } = useProceduresStore();
    // Structurer le référentiel (branches, procédures, campagnes) : admin et pilote
    const isAdmin = !!access?.can_manage_campaigns || profile?.global_role === 'admin' || profile?.global_role === 'process_owner';

    const [tree, setTree] = useState<TaxonomyNode[]>([]);
    // Branches sans procédure : masquées par défaut (le référentiel montre ce qui existe) ; préférence mémorisée
    const [showEmpty, setShowEmpty] = useState(() => { try { return localStorage.getItem('processmate-ref-vides') === '1'; } catch { return false; } });
    const toggleEmpty = (v: boolean) => { setShowEmpty(v); try { localStorage.setItem('processmate-ref-vides', v ? '1' : '0'); } catch { /* facultatif */ } };
    /** branches créées pendant la session : restent visibles même vides, le temps d'y ranger quelque chose */
    const [justCreated, setJustCreated] = useState<Set<string>>(new Set());
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');
    const [modal, setModal] = useState<ModalState>(null);
    const [menu, setMenu] = useState<{ pos: MenuPos; target: MenuTarget } | null>(null);
    const [creating, setCreating] = useState<{ parentId: string | null; level: 'theme' | 'category' | 'subcategory' | 'procedure' } | null>(null);

    const loadTree = useCallback(async () => {
        setLoading(true);
        try {
            const res = await taxonomyApi.getTree();
            setTree(res.tree);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadTree(); fetchProcedures(); }, [loadTree, fetchProcedures]);

    // Un petit référentiel s'ouvre en entier : pas de page blanche sous un seul thème replié
    const autoExpanded = useRef(false);
    useEffect(() => {
        if (autoExpanded.current || tree.length === 0 || procedures.length === 0 || procedures.length > 30) return;
        autoExpanded.current = true;
        const ids: string[] = [];
        const walk = (nodes: TaxonomyNode[]) => nodes.forEach(n => { ids.push(n.id); if (n.children) walk(n.children); });
        walk(tree);
        setExpanded(prev => new Set([...Array.from(prev), ...ids]));
    }, [tree, procedures.length]);

    useEffect(() => {
        if (!expandToNodeId || tree.length === 0) return;
        const path: string[] = [];
        const find = (nodes: TaxonomyNode[]): boolean => {
            for (const n of nodes) {
                if (n.id === expandToNodeId) { path.push(n.id); return true; }
                if (n.children && find(n.children)) { path.push(n.id); return true; }
            }
            return false;
        };
        find(tree);
        if (path.length > 0) setExpanded(prev => { const next = new Set(prev); path.forEach(id => next.add(id)); return next; });
    }, [expandToNodeId, tree]);

    const toggle = (id: string) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    // Collect all subcategory IDs under a node for procedure filtering
    const getDescendantIds = useCallback((node: TaxonomyNode): string[] => {
        const ids = [node.id];
        (node.children || []).forEach(c => ids.push(...getDescendantIds(c)));
        return ids;
    }, []);

    // Search filtering
    const searchResults = useMemo(() => {
        if (!search.trim()) return null;
        const q = search.toLowerCase();
        return procedures.filter(p =>
            p.nom.toLowerCase().includes(q) ||
            (p.ref || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q)
        );
    }, [search, procedures]);

    // Procedures by taxonomy_id
    const procsByTaxId = useMemo(() => {
        const map: Record<string, Procedure[]> = {};
        procedures.forEach(p => {
            const tid = p.taxonomy_id || '__unclassified__';
            if (!map[tid]) map[tid] = [];
            map[tid].push(p);
        });
        return map;
    }, [procedures]);

    const unclassifiedProcs = procsByTaxId['__unclassified__'] || [];

    // Count procedures under a node (recursive)
    const countProcs = useCallback((node: TaxonomyNode): number => {
        const direct = (procsByTaxId[node.id] || []).length;
        return direct + (node.children || []).reduce((s, c) => s + countProcs(c), 0);
    }, [procsByTaxId]);

    // ── Context menu actions ──────────────────────────────────────

    const handleMenuAction = useCallback((action: string, target: MenuTarget) => {
        switch (action) {
            case 'open-editor':
                onOpenEditor?.(target.id);
                break;
            case 'show-raci':
                setModal({ type: 'raci', procedureId: target.id, procedureName: target.name });
                break;
            case 'show-journey':
                setModal({ type: 'journey', procedureId: target.id, procedureName: target.name });
                break;
            case 'show-workflow':
                setModal({ type: 'workflow', procedureId: target.id, procedureName: target.name });
                break;
            case 'show-tasks': {
                if (target.kind === 'procedure') {
                    onOpenTasks?.({ procedureIds: [target.id], label: target.name });
                } else {
                    const node = findNode(tree, target.id);
                    if (node) {
                        const ids = getDescendantIds(node);
                        const procIds = procedures.filter(p => p.taxonomy_id && ids.includes(p.taxonomy_id)).map(p => p.id);
                        onOpenTasks?.({ procedureIds: procIds, label: target.name });
                    }
                }
                break;
            }
            case 'open-studio':
                onOpenStudio?.(target.id);
                break;
            case 'assign-campaign':
                setModal({ type: 'assign-campaign', procedureId: target.id, procedureName: target.name });
                break;
            case 'create-child': {
                const childLevel = target.kind === 'theme' ? 'category' : 'subcategory';
                setCreating({ parentId: target.id, level: childLevel });
                setExpanded(prev => new Set(prev).add(target.id));
                break;
            }
            case 'create-proc':
                setCreating({ parentId: target.id, level: 'procedure' });
                setExpanded(prev => new Set(prev).add(target.id));
                break;
            case 'rename':
                setModal({ type: 'rename-node', nodeId: target.id, currentName: target.name, level: target.kind });
                break;
            case 'delete':
                setModal({ type: 'confirm-delete', nodeId: target.id, nodeName: target.name, level: target.kind });
                break;
        }
    }, [onOpenEditor, onOpenTasks, onAssignToCampaign, tree, procedures, getDescendantIds]);

    const findNode = (nodes: TaxonomyNode[], id: string): TaxonomyNode | null => {
        for (const n of nodes) {
            if (n.id === id) return n;
            const found = findNode(n.children || [], id);
            if (found) return found;
        }
        return null;
    };

    // ── Create handlers ───────────────────────────────────────────

    const handleCreateNode = async (name: string) => {
        if (!creating) return;
        if (creating.level === 'procedure') {
            const res = await orchestrationApi.createProcedure({ nom: name, taxonomy_id: creating.parentId || undefined });
            if (res.procedure) {
                fetchProcedures(true);
                onOpenEditor?.(res.procedure.id);
            }
        } else {
            const res = await taxonomyApi.create({ name, level: creating.level, parent_id: creating.parentId });
            if (res.node?.id) setJustCreated(prev => new Set(prev).add(res.node.id));
            await loadTree();
        }
        setCreating(null);
    };

    const handleRename = async (newName: string) => {
        if (modal?.type !== 'rename-node' || !newName.trim()) return;
        if (modal.level === 'procedure') {
            await orchestrationApi.updateProcedure(modal.nodeId, { nom: newName.trim() });
            setModal(null);
            await fetchProcedures(true);
            return;
        }
        await taxonomyApi.update(modal.nodeId, { name: newName.trim() });
        setModal(null);
        await loadTree();
    };

    const handleDelete = async () => {
        if (modal?.type !== 'confirm-delete') return;
        if (modal.level === 'procedure') {
            await orchestrationApi.deleteProcedure(modal.nodeId);
            removeProcedure(modal.nodeId);
            setModal(null);
            await fetchProcedures(true);
            return;
        }
        const node = findNode(tree, modal.nodeId);
        const inside = node ? countProcs(node) : 0;
        try {
            await taxonomyApi.delete(modal.nodeId, inside > 0);
        } catch (e) {
            setDeleteError(e instanceof Error ? e.message : 'Suppression impossible');
            return;
        }
        setModal(null);
        await loadTree();
        if (inside) await fetchProcedures(true);
    };

    // ── Open context menu ─────────────────────────────────────────

    const openMenu = (e: React.MouseEvent, target: MenuTarget) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({ pos: { x: e.clientX, y: e.clientY }, target });
    };

    // ── Render tree node ──────────────────────────────────────────

    const ICONS = { theme: FolderOpen, category: Tag, subcategory: Layers };
    const COLORS = { theme: 'text-neutral-900', category: 'text-neutral-600', subcategory: 'text-neutral-500' };
    const LEVEL_LABELS = { theme: 'thème', category: 'catégorie', subcategory: 'sous-catégorie' };

    const emptyCount = useMemo(() => {
        let n = 0;
        const walk = (nodes: TaxonomyNode[]) => nodes.forEach(x => { if (countProcs(x) === 0) n++; walk(x.children || []); });
        walk(tree);
        return n;
    }, [tree, countProcs]);
    const visibleNode = (node: TaxonomyNode): boolean =>
        showEmpty || countProcs(node) > 0 || justCreated.has(node.id) || (node.children || []).some(visibleNode)
        || creating?.parentId === node.id;

    function renderNode(node: TaxonomyNode, depth: number) {
        const isExp = expanded.has(node.id);
        const Icon = ICONS[node.level as keyof typeof ICONS] || Layers;
        const color = COLORS[node.level as keyof typeof COLORS] || 'text-gray-400';
        const count = countProcs(node);
        const procs = procsByTaxId[node.id] || [];
        const hasChildren = (node.children || []).length > 0;
        const creatingHere = creating?.parentId === node.id;

        return (
            <div key={node.id} style={{ marginLeft: depth * 16 }}>
                {/* Node row */}
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 group transition-colors">
                    <button type="button" onClick={() => toggle(node.id)} className="shrink-0 p-0.5 text-gray-400 hover:text-gray-600">
                        {isExp ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    <Icon className={`w-4 h-4 shrink-0 ${color}`} />
                    <span className="text-sm font-medium text-gray-900 truncate min-w-0">{node.name}</span>
                    <span className="text-[10px] font-semibold text-gray-700 shrink-0 ml-2">{count}</span>
                    <button type="button" title="Actions" onClick={e => openMenu(e, { kind: node.level as any, id: node.id, name: node.name, parentId: node.parent_id })}
                        className="p-1 rounded text-gray-700 hover:text-neutral-900 hover:bg-neutral-100 shrink-0 ml-1">
                        <MoreVertical className="w-4 h-4" />
                    </button>
                </div>

                {/* Children */}
                {isExp && (
                    <div>
                        {(node.children || []).filter(visibleNode).map(child => renderNode(child, depth + 1))}

                        {/* Procedures at leaf level */}
                        {/* procédures de ce nœud ; normalement une sous-catégorie, mais un rangement plus haut (ancien
                            ou importé) reste visible au lieu de disparaître */}
                        {procs.map(proc => (
                            <div key={proc.id}
                                style={{ marginLeft: (depth + 1) * 16 }}
                                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
                                onClick={() => onOpenEditor?.(proc.id)}>
                                <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                <span className="text-sm text-gray-900 truncate min-w-0">{proc.nom}</span>
                                <button type="button" title="Actions"
                                    onClick={e => { e.stopPropagation(); openMenu(e, { kind: 'procedure', id: proc.id, name: proc.nom }); }}
                                    className="p-1 rounded text-gray-700 hover:text-neutral-900 hover:bg-neutral-100 shrink-0">
                                    <MoreVertical className="w-4 h-4" />
                                </button>
                                {proc.has_unsaved_changes && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 shrink-0">Modifié</span>}
                                {proc.tobe_id && <span title={`Ce processus a une version TO BE (${proc.tobe_status || 'Brouillon'})`} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-petrole-tint text-petrole shrink-0">TO BE</span>}
                                <StatusBadge status={proc.status} />
                                {proc.ref && <span className="text-[10px] text-gray-400 font-mono shrink-0">{proc.ref}</span>}
                            </div>
                        ))}

                        {/* Inline create form */}
                        {creatingHere && (
                            <div style={{ marginLeft: (depth + 1) * 16 }}>
                                <InlineCreateForm
                                    placeholder={creating.level === 'procedure' ? 'Nom de la procédure…' : `Nom de la ${LEVEL_LABELS[creating.level as keyof typeof LEVEL_LABELS] || 'élément'}…`}
                                    onSubmit={handleCreateNode}
                                    onCancel={() => setCreating(null)}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // ── JSX ───────────────────────────────────────────────────────

    return (
        <div className="h-full flex flex-col bg-gray-50 min-w-0">

            {/* En-tête sur une ligne : décompte, recherche, actions (le titre est déjà dans le bandeau de l'application) */}
            <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-xs text-neutral-600 whitespace-nowrap" title={title || undefined}>
                    {procedures.length} procédure{procedures.length !== 1 ? 's' : ''}, {tree.length} thème{tree.length !== 1 ? 's' : ''}
                </span>
                <div className="relative min-w-[220px] flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Rechercher une procédure, une référence ou un domaine…"
                        className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:border-neutral-900" />
                    {search && (
                        <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
                {emptyCount > 0 && (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-neutral-700 whitespace-nowrap">
                        <input type="checkbox" className="accent-neutral-900" checked={showEmpty} onChange={e => toggleEmpty(e.target.checked)} />
                        Branches vides ({emptyCount})
                    </label>
                )}
                <button type="button" onClick={() => { loadTree(); fetchProcedures(true); }} title="Actualiser" aria-label="Actualiser"
                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                    <RefreshCw className="w-4 h-4" />
                </button>
                {isAdmin && (
                    <button type="button" onClick={() => setCreating({ parentId: null, level: 'theme' })}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-700">
                        <Plus className="w-3.5 h-3.5" /> Nouveau thème
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                    </div>
                ) : searchResults ? (
                    /* Search results */
                    <div>
                        <p className="text-xs text-gray-400 px-2 mb-2">{searchResults.length} résultat{searchResults.length !== 1 ? 's' : ''}</p>
                        {searchResults.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <Search className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                                <p className="text-sm">Aucun résultat pour « {search} »</p>
                            </div>
                        ) : searchResults.map(proc => (
                            <div key={proc.id}
                                className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 group transition-all cursor-pointer mb-1"
                                onClick={() => onOpenEditor?.(proc.id)}>
                                <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{proc.nom}</p>
                                    <p className="text-[11px] text-gray-400 truncate">{[proc.ref, proc.category].filter(Boolean).join(', ')}</p>
                                </div>
                                <button type="button" title="Actions"
                                    onClick={e => { e.stopPropagation(); openMenu(e, { kind: 'procedure', id: proc.id, name: proc.nom }); }}
                                    className="p-1 rounded text-gray-700 hover:text-neutral-900 hover:bg-neutral-100 shrink-0">
                                    <MoreVertical className="w-4 h-4" />
                                </button>
                                {proc.has_unsaved_changes && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 shrink-0">Modifié</span>}
                                {proc.tobe_id && <span title={`Ce processus a une version TO BE (${proc.tobe_status || 'Brouillon'})`} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-petrole-tint text-petrole shrink-0">TO BE</span>}
                                <StatusBadge status={proc.status} />
                            </div>
                        ))}
                    </div>
                ) : (
                    /* Tree view */
                    <div className="space-y-0.5">
                        {tree.filter(visibleNode).map(node => renderNode(node, 0))}

                        {/* Aucune procédure rangée : on ne laisse pas un écran vide, on dit par où commencer */}
                        {!creating && tree.length > 0 && !tree.some(visibleNode) && (
                            <div className="mx-auto max-w-xl rounded-xl border border-neutral-200 bg-white px-5 py-5">
                                <p className="text-sm font-semibold text-neutral-900">Aucune procédure n’est encore rangée dans ce référentiel.</p>
                                <p className="mt-1 text-sm text-neutral-600">
                                    La structure par défaut ({tree.length} thème{tree.length > 1 ? 's' : ''}, organisés comme le paysage BIAN) est masquée tant
                                    qu’elle est vide. Pour commencer :
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <a href={`/?brouillon=${encodeURIComponent(SOURCES_DRAFT)}`}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700">
                                        Partir de mes sources
                                    </a>
                                    <button type="button" onClick={() => toggleEmpty(true)}
                                        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50">
                                        Voir la structure par défaut
                                    </button>
                                    {isAdmin && (
                                        <button type="button" onClick={async () => {
                                            if (!window.confirm('Supprimer toute la structure par défaut pour construire la vôtre ? Aucune procédure n’y est rangée.')) return;
                                            try { await referentialApi.empty(); await loadTree(); } catch (e) { window.alert(e instanceof Error ? e.message : 'Action impossible'); }
                                        }} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50">
                                            Partir de rien
                                        </button>
                                    )}
                                </div>
                                <p className="mt-3 text-xs text-neutral-500">
                                    « Partir de mes sources » ouvre une conversation : joignez votre cartographie, vos manuels ou votre code,
                                    l’assistant propose une structure que vous appliquez ici.
                                </p>
                            </div>
                        )}
                        {!creating && tree.length === 0 && (
                            <div className="mx-auto max-w-xl rounded-xl border border-neutral-200 bg-white px-5 py-5">
                                <p className="text-sm font-semibold text-neutral-900">Le référentiel est vide.</p>
                                <p className="mt-1 text-sm text-neutral-600">Créez vos thèmes avec « Nouveau thème », ou partez de vos sources.</p>
                                <a href={`/?brouillon=${encodeURIComponent(SOURCES_DRAFT)}`}
                                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700">
                                    Partir de mes sources
                                </a>
                            </div>
                        )}

                        {/* Create theme form (at root) */}
                        {creating?.parentId === null && creating.level === 'theme' && (
                            <div className="mt-2">
                                <InlineCreateForm placeholder="Nom du thème…" onSubmit={handleCreateNode} onCancel={() => setCreating(null)} />
                            </div>
                        )}

                        {/* Unclassified procedures */}
                        {unclassifiedProcs.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">
                                    Non classées ({unclassifiedProcs.length})
                                </p>
                                {unclassifiedProcs.map(proc => (
                                    <div key={proc.id}
                                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
                                        onClick={() => onOpenEditor?.(proc.id)}>
                                        <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                        <span className="text-sm text-gray-900 truncate min-w-0">{proc.nom}</span>
                                        <button type="button" title="Actions"
                                            onClick={e => { e.stopPropagation(); openMenu(e, { kind: 'procedure', id: proc.id, name: proc.nom }); }}
                                            className="p-1 rounded text-gray-700 hover:text-neutral-900 hover:bg-neutral-100 shrink-0">
                                            <MoreVertical className="w-4 h-4" />
                                        </button>
                                        {proc.has_unsaved_changes && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 shrink-0">Modifié</span>}
                                {proc.tobe_id && <span title={`Ce processus a une version TO BE (${proc.tobe_status || 'Brouillon'})`} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-petrole-tint text-petrole shrink-0">TO BE</span>}
                                        <StatusBadge status={proc.status} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Context menu */}
            {menu && (
                <ContextMenu pos={menu.pos} target={menu.target} isAdmin={isAdmin}
                    onAction={handleMenuAction} onClose={() => setMenu(null)} />
            )}

            {/* Modals */}
            {modal?.type === 'raci' && (
                <RaciModalLazy procedureId={modal.procedureId} procedureName={modal.procedureName}
                    isAdmin={isAdmin} onClose={() => setModal(null)} />
            )}
            {modal?.type === 'journey' && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
                        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100">
                            <div>
                                <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest">Parcours</span>
                                <h2 className="text-sm font-bold text-gray-900">{modal.procedureName}</h2>
                            </div>
                            <button type="button" onClick={() => setModal(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <ProcedureJourney procedureId={modal.procedureId} procedureName={modal.procedureName}
                                isAdmin={isAdmin} currentActorId={profile?.id} onClose={() => setModal(null)} />
                        </div>
                    </div>
                </div>
            )}
            {modal?.type === 'workflow' && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
                        <ProcedureDetail procedureId={modal.procedureId}
                            onClose={() => setModal(null)}
                            onStatusChange={() => fetchProcedures(true)} />
                    </div>
                </div>
            )}
            {modal?.type === 'assign-campaign' && (
                <CampaignPickerModal procedureId={modal.procedureId} procedureName={modal.procedureName}
                    onDone={() => { setModal(null); fetchProcedures(true); }}
                    onCancel={() => setModal(null)} />
            )}
            {modal?.type === 'rename-node' && (
                <RenameModal currentName={modal.currentName} level={modal.level}
                    onSave={handleRename} onCancel={() => setModal(null)} />
            )}
            {modal?.type === 'confirm-delete' && (
                <ConfirmDeleteModal name={modal.nodeName} level={modal.level} error={deleteError}
                    procCount={modal.level === 'procedure' ? 0 : (() => { const n = findNode(tree, modal.nodeId); return n ? countProcs(n) : 0; })()}
                    onConfirm={handleDelete} onCancel={() => { setModal(null); setDeleteError(null); }} />
            )}
        </div>
    );
}

// ── Small modals ──────────────────────────────────────────────

function RenameModal({ currentName, level, onSave, onCancel }: { currentName: string; level: string; onSave: (n: string) => void; onCancel: () => void }) {
    const [name, setName] = useState(currentName);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="text-base font-bold text-gray-900 mb-4">Renommer</h3>
                <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name.trim()); if (e.key === 'Escape') onCancel(); }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-300 mb-4" />
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Annuler</button>
                    <button type="button" onClick={() => name.trim() && onSave(name.trim())} disabled={!name.trim()}
                        className="px-4 py-2 text-sm font-semibold text-white bg-neutral-900 rounded-lg hover:bg-neutral-700 disabled:opacity-50">Enregistrer</button>
                </div>
            </div>
        </div>
    );
}

function ConfirmDeleteModal({ name, level, procCount = 0, error, onConfirm, onCancel }: { name: string; level: string; procCount?: number; error?: string | null; onConfirm: () => void; onCancel: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="text-base font-bold text-gray-900 mb-2">Supprimer</h3>
                <p className="text-sm text-gray-500 mb-6">
                    {level === 'procedure'
                        ? <>Supprimer définitivement « {name} » ? Ses versions, tâches, affectations, irritants et historique seront aussi supprimés. Action irréversible.</>
                        : procCount > 0
                            ? <>Supprimer « {name} », ses sous-branches et {procCount === 1 ? 'la procédure' : `les ${procCount} procédures`} qu’elle contient ? Seules des procédures vides (non rédigées, hors campagne) partent ainsi ; une procédure rédigée se déplace d’abord.</>
                            : <>Supprimer « {name} » et ses sous-branches ? Elles ne contiennent aucune procédure.</>}
                </p>
                {error && <p role="alert" className="-mt-3 mb-4 text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Annuler</button>
                    <button type="button" onClick={onConfirm} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700">Supprimer</button>
                </div>
            </div>
        </div>
    );
}

function CampaignPickerModal({ procedureId, procedureName, onDone, onCancel }: {
    procedureId: string; procedureName: string; onDone: () => void; onCancel: () => void;
}) {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState<string | null>(null);

    useEffect(() => {
        campaignsApi.list()
            .then(res => setCampaigns((res.campaigns || []).filter(c => c.status !== 'completed' && c.status !== 'archived')))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const handlePick = async (campaignId: string) => {
        setAdding(campaignId);
        try {
            await campaignsApi.addProcedures(campaignId, [procedureId]);
            onDone();
        } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); setAdding(null); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[60vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="text-sm font-bold text-gray-900">Assigner à une campagne</h3>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{procedureName}</p>
                    </div>
                    <button type="button" title="Fermer" onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-neutral-400" /></div>
                    ) : campaigns.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            <Megaphone className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                            <p className="text-sm">Aucune campagne active</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50">
                            {campaigns.map(c => {
                                const sc = CAMPAIGN_STATUS_COLORS[c.status];
                                const isAdding = adding === c.id;
                                return (
                                    <button key={c.id} type="button" onClick={() => handlePick(c.id)} disabled={!!adding}
                                        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-neutral-100 transition-colors disabled:opacity-50">
                                        <Megaphone className="w-4 h-4 text-orange-400 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-800 truncate">{c.title}</p>
                                            <p className="text-[11px] text-gray-400">{c.stats.total} procédures, {c.stats.progress_pct} %</p>
                                        </div>
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc?.bg} ${sc?.text}`}>
                                            {CAMPAIGN_STATUS_LABELS[c.status]}
                                        </span>
                                        {isAdding && <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400 shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

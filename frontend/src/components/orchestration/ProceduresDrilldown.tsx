'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ChevronRight, ChevronDown, Plus, RefreshCw, Loader2, X, FileText, Users,
    CheckCircle2, AlertTriangle, Clock, Megaphone, FolderOpen, Tag, Layers,
    PenLine, Search, Save, LayoutDashboard, Pencil, Trash2, Trash, TrendingUp, Download,
} from 'lucide-react';
import {
    campaignsApi, type Campaign, type CampaignProcedure, type CampaignProcedureStatus,
    CAMPAIGN_STATUS_COLORS, CAMPAIGN_STATUS_LABELS,
    PROC_STATUS_LABELS, PROC_STATUS_COLORS,
} from '@/lib/campaignsApi';
import { taxonomyApi } from '@/lib/taxonomyApi';
import { orchestrationApi, type Procedure, type UserProfile } from '@/lib/orchestrationApi';
import { orchestrationTasksApi } from '@/lib/orchestrationTasksApi';
import { useProceduresStore } from '@/store/proceduresStore';
import { useAuth } from '@/context/AuthContext';
import TaxonomyProcedureSelector from '@/components/orchestration/TaxonomyProcedureSelector';

// ── Types ──────────────────────────────────────────────────────

interface TaxNode { id: string; name: string; level: string; parent_id: string | null }

interface SubcategoryGroup {
    subcategoryId: string; subcategoryName: string;
    procedures: EnrichedProcedure[];
}
interface CategoryGroup {
    categoryId: string; categoryName: string;
    subcategories: SubcategoryGroup[];
    total: number; done: number;
}
interface ThemeGroup {
    themeId: string; themeName: string;
    categories: CategoryGroup[]; total: number; done: number;
}
interface EnrichedProcedure extends CampaignProcedure { taxonomy_id?: string | null }

interface ProceduresDrilldownProps {
    isAdmin: boolean;
    onOpenStudio?: (workflowId: string) => void;
    onOpenWorkspace?: (procedureId: string) => void;
}

// ── Utilities ──────────────────────────────────────────────────

function pct(done: number, total: number) { return total > 0 ? Math.round((done / total) * 100) : 0; }

function aggregateStatus(procs: EnrichedProcedure[]): string {
    if (!procs.length) return 'pending';
    if (procs.every(p => p.status === 'validated')) return 'validated';
    if (procs.some(p => ['validated', 'formalized', 'in_progress'].includes(p.status))) return 'in_progress';
    return 'pending';
}

function computeThemeGroups(campaign: Campaign | null, taxNodes: TaxNode[], storeProcedures: Procedure[]): ThemeGroup[] {
    const procs = campaign?.procedures ?? [];
    if (!procs.length || !taxNodes.length) return [];
    const byId: Record<string, TaxNode> = {};
    taxNodes.forEach(n => { byId[n.id] = n; });

    // Walk up the parent chain to find the nearest ancestor at the given level
    const ancestor = (taxId: string | null | undefined, level: string): TaxNode | null => {
        let node = byId[taxId ?? ''];
        while (node) {
            if (node.level === level) return node;
            node = byId[node.parent_id ?? ''];
        }
        return null;
    };

    const themeMap: Record<string, ThemeGroup> = {};

    procs.forEach(cp => {
        const taxId = storeProcedures.find(p => p.id === cp.procedure_id)?.taxonomy_id
            ?? (cp as EnrichedProcedure).taxonomy_id;

        const theme  = ancestor(taxId, 'theme');
        const cat    = ancestor(taxId, 'category');
        const subcat = ancestor(taxId, 'subcategory');

        const themeId  = theme?.id  ?? '__unclassified__';
        const catId    = cat?.id    ?? '__none__';
        const subcatId = subcat?.id ?? catId;

        if (!themeMap[themeId]) {
            themeMap[themeId] = { themeId, themeName: theme?.name ?? 'Non classifié', categories: [], total: 0, done: 0 };
        }
        let catGroup = themeMap[themeId].categories.find(c => c.categoryId === catId);
        if (!catGroup) {
            catGroup = { categoryId: catId, categoryName: cat?.name ?? 'Général', subcategories: [], total: 0, done: 0 };
            themeMap[themeId].categories.push(catGroup);
        }
        let subcatGroup = catGroup.subcategories.find(s => s.subcategoryId === subcatId);
        if (!subcatGroup) {
            subcatGroup = { subcategoryId: subcatId, subcategoryName: subcat?.name ?? cat?.name ?? 'Général', procedures: [] };
            catGroup.subcategories.push(subcatGroup);
        }

        subcatGroup.procedures.push({ ...cp, taxonomy_id: taxId ?? null });
        catGroup.total++;
        themeMap[themeId].total++;
        if (cp.status === 'validated' || cp.status === 'formalized') {
            catGroup.done++;
            themeMap[themeId].done++;
        }
    });

    return Object.values(themeMap);
}

// ── Small UI ───────────────────────────────────────────────────

function ProgressBar({ value, total }: { value: number; total: number }) {
    const p = pct(value, total);
    const color = p >= 80 ? 'bg-green-500' : p >= 40 ? 'bg-blue-500' : p > 0 ? 'bg-blue-400' : 'bg-gray-200';
    return (
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${p}%` }} />
        </div>
    );
}

function CampaignStatusBadge({ status }: { status: string }) {
    const c = CAMPAIGN_STATUS_COLORS[status as keyof typeof CAMPAIGN_STATUS_COLORS] ?? { dot: 'bg-gray-400', bg: 'bg-gray-100', text: 'text-gray-600' };
    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
            {CAMPAIGN_STATUS_LABELS[status as keyof typeof CAMPAIGN_STATUS_LABELS] ?? status}
        </span>
    );
}

function ProcStatusBadge({ status }: { status: string }) {
    const c = PROC_STATUS_COLORS[status as keyof typeof PROC_STATUS_COLORS] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.bg} ${c.text}`}>
            {PROC_STATUS_LABELS[status as keyof typeof PROC_STATUS_LABELS] ?? status}
        </span>
    );
}

function KpiCard({ label, value, sub, colorClass, icon: Icon }: { label: string; value: number | string; sub?: string; colorClass: string; icon: React.ElementType }) {
    return (
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
                <div className="text-xl font-bold text-gray-900">{value}</div>
                <div className="text-xs font-medium text-gray-600 leading-tight">{label}</div>
                {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
            </div>
        </div>
    );
}

// ── RACI types & constants ─────────────────────────────────────

const RACI_COLS = ['R', 'A', 'C', 'I'] as const;
type RaciRole = typeof RACI_COLS[number];
const RACI_COL_CONFIG: Record<RaciRole, { label: string; active: string; header: string }> = {
    R: { label: 'Responsable', active: 'bg-blue-600 text-white shadow-sm', header: 'text-blue-600' },
    A: { label: 'Approbateur', active: 'bg-red-600 text-white shadow-sm', header: 'text-red-600' },
    C: { label: 'Consulté', active: 'bg-green-600 text-white shadow-sm', header: 'text-green-600' },
    I: { label: 'Informé', active: 'bg-amber-500 text-white shadow-sm', header: 'text-amber-600' },
};
interface RaciAssignment { assignment_id?: string; user_id: string; name: string; email?: string | null; job_title?: string | null; raci_role?: RaciRole | null; assignment_type?: string; }

// ── RACI Modal ─────────────────────────────────────────────────

function RaciModal({ procedureId, procedureName, isAdmin, onClose }: { procedureId: string; procedureName: string; isAdmin: boolean; onClose: () => void; }) {
    const [assignments, setAssignments] = useState<RaciAssignment[]>([]);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [localMatrix, setLocalMatrix] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [addingUser, setAddingUser] = useState(false);
    const [taskContrib, setTaskContrib] = useState<Record<string, { total: number; done: number }>>({});

    useEffect(() => {
        Promise.all([
            orchestrationApi.getProcedureAssignments(procedureId),
            orchestrationApi.listUsers({ active_only: true }),
            orchestrationTasksApi.getProcedureTasks(procedureId),
        ]).then(([assignRes, userRes, taskRes]) => {
            const allUsers = userRes.users || [];
            setUsers(allUsers);
            const userMap: Record<string, UserProfile> = {};
            allUsers.forEach(u => { userMap[u.id] = u; });
            const asgns: RaciAssignment[] = (assignRes.assignments || []).filter(a => a.raci_role).map(a => {
                const profile = a.user_profiles ?? userMap[a.user_id];
                return {
                    assignment_id: a.id, user_id: a.user_id,
                    name: profile ? (profile.display_name || profile.full_name || profile.email) : a.user_id,
                    email: profile?.email ?? null, job_title: profile?.job_title ?? null,
                    raci_role: a.raci_role as RaciRole, assignment_type: a.assignment_type,
                };
            });
            setAssignments(asgns);
            const init: Record<string, string> = {};
            asgns.forEach(a => { if (a.raci_role) init[a.user_id] = a.raci_role; });
            setLocalMatrix(init);
            // Compute per-user task contribution
            const contrib: Record<string, { total: number; done: number }> = {};
            (taskRes.tasks || []).forEach(t => {
                if (!t.assigned_to) return;
                if (!contrib[t.assigned_to]) contrib[t.assigned_to] = { total: 0, done: 0 };
                contrib[t.assigned_to].total++;
                if (['completed', 'validated'].includes(t.status)) contrib[t.assigned_to].done++;
            });
            setTaskContrib(contrib);
        }).catch(() => {}).finally(() => setLoading(false));
    }, [procedureId]);

    const handleToggleRole = (userId: string, role: RaciRole) => {
        setLocalMatrix(prev => ({ ...prev, [userId]: prev[userId] === role ? '' : role }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const asgns = assignments.filter(a => localMatrix[a.user_id]).map(a => ({
                user_id: a.user_id,
                raci_role: localMatrix[a.user_id] as RaciRole,
                assignment_type: (a.assignment_type || 'contributor') as 'owner' | 'validator' | 'reviewer' | 'contributor' | 'observer',
            }));
            await orchestrationApi.updateRaciAssignments(procedureId, asgns);
            setAssignments(prev => prev.map(a => ({ ...a, raci_role: (localMatrix[a.user_id] as RaciRole) || null })));
            setEditing(false);
        } catch { /* silent */ } finally { setSaving(false); }
    };

    const handleCancel = () => {
        const init: Record<string, string> = {};
        assignments.forEach(a => { if (a.raci_role) init[a.user_id] = a.raci_role; });
        setLocalMatrix(init); setEditing(false); setAddingUser(false); setSearch('');
    };

    const handleAddUser = (user: UserProfile) => {
        if (assignments.find(a => a.user_id === user.id)) return;
        setAssignments(prev => [...prev, { user_id: user.id, name: user.display_name || user.full_name || user.email, email: user.email, job_title: user.job_title, raci_role: null, assignment_type: 'contributor' }]);
        setAddingUser(false); setSearch('');
    };

    const handleRemove = (userId: string) => {
        setAssignments(prev => prev.filter(a => a.user_id !== userId));
        setLocalMatrix(prev => { const n = { ...prev }; delete n[userId]; return n; });
    };

    const filteredUsers = users.filter(u => !assignments.find(a => a.user_id === u.id) && (u.display_name || u.full_name || u.email).toLowerCase().includes(search.toLowerCase()));
    const roleCounts = useMemo(() => {
        const counts: Record<string, number> = { R: 0, A: 0, C: 0, I: 0 };
        assignments.forEach(a => { if (a.raci_role) counts[a.raci_role] = (counts[a.raci_role] || 0) + 1; });
        return counts;
    }, [assignments]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
                <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <Users className="w-4 h-4 text-blue-600 shrink-0" />
                            <span className="text-[11px] font-bold text-blue-600 uppercase tracking-widest">Matrice RACI</span>
                        </div>
                        <h2 className="text-sm font-bold text-gray-900 leading-snug max-w-lg">{procedureName}</h2>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                        {isAdmin && !editing && <button type="button" onClick={() => setEditing(true)} className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100">Modifier</button>}
                        {editing && (
                            <>
                                <button type="button" onClick={handleCancel} className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Annuler</button>
                                <button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Enregistrer
                                </button>
                            </>
                        )}
                        <button type="button" title="Fermer" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
                    </div>
                </div>
                {!editing && !loading && assignments.length > 0 && (
                    <div className="flex items-center gap-4 px-6 py-2.5 bg-gray-50 border-b border-gray-100">
                        {RACI_COLS.map(r => (
                            <div key={r} className="flex items-center gap-1.5 text-xs text-gray-600">
                                <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${RACI_COL_CONFIG[r].active}`}>{r}</span>
                                <span>{RACI_COL_CONFIG[r].label}</span>
                                <span className="text-gray-400">({roleCounts[r] ?? 0})</span>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>
                    ) : assignments.length === 0 && !editing ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Users className="w-10 h-10 mb-3 text-gray-200" />
                            <p className="text-sm text-gray-400">Aucune responsabilité définie</p>
                            {isAdmin && <button type="button" onClick={() => setEditing(true)} className="mt-3 text-xs text-blue-600 hover:underline font-medium">Définir les responsabilités</button>}
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-100">
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 w-full">Membre</th>
                                    {RACI_COLS.map(r => (
                                        <th key={r} className="px-4 py-3 text-center w-24">
                                            <div className={`text-sm font-bold ${RACI_COL_CONFIG[r].header}`}>{r}</div>
                                            <div className="text-[10px] text-gray-400 font-normal mt-0.5 whitespace-nowrap">{RACI_COL_CONFIG[r].label}</div>
                                        </th>
                                    ))}
                                    <th className="px-4 py-3 text-center w-28">
                                        <div className="text-sm font-bold text-purple-600">Contrib.</div>
                                        <div className="text-[10px] text-gray-400 font-normal mt-0.5 whitespace-nowrap">Tâches</div>
                                    </th>
                                    {editing && <th className="w-8 pr-4" />}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {assignments.map(a => {
                                    const contrib = taskContrib[a.user_id];
                                    const contribPct = contrib && contrib.total > 0 ? Math.round((contrib.done / contrib.total) * 100) : 0;
                                    return (
                                        <tr key={a.user_id} className="hover:bg-gray-50/50">
                                            <td className="px-6 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">{(a.name || '?')[0].toUpperCase()}</div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-gray-800 leading-tight">{a.name}</p>
                                                        {a.job_title && <p className="text-[11px] text-gray-400 truncate">{a.job_title}</p>}
                                                    </div>
                                                </div>
                                            </td>
                                            {RACI_COLS.map(role => {
                                                const isActive = editing ? localMatrix[a.user_id] === role : a.raci_role === role;
                                                return (
                                                    <td key={role} className="px-4 py-3 text-center">
                                                        {editing ? (
                                                            <button type="button" onClick={() => handleToggleRole(a.user_id, role)}
                                                                className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${isActive ? RACI_COL_CONFIG[role].active : 'bg-gray-100 text-gray-300 hover:bg-gray-200 hover:text-gray-500'}`}>{role}</button>
                                                        ) : isActive ? (
                                                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${RACI_COL_CONFIG[role].active}`}>{role}</span>
                                                        ) : (
                                                            <span className="inline-block w-2 h-2 rounded-full bg-gray-100" />
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-4 py-3">
                                                {contrib && contrib.total > 0 ? (
                                                    <div className="flex flex-col gap-1 min-w-[56px]">
                                                        <div className="flex items-center justify-between text-[10px]">
                                                            <span className="font-semibold text-gray-700">{contrib.done}/{contrib.total}</span>
                                                            <span className="text-gray-400">{contribPct}%</span>
                                                        </div>
                                                        <ProgressBar value={contrib.done} total={contrib.total} />
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] text-gray-300">—</span>
                                                )}
                                            </td>
                                            {editing && (
                                                <td className="pr-4 py-3">
                                                    <button type="button" title="Retirer" onClick={() => handleRemove(a.user_id)} className="p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50"><X className="w-3.5 h-3.5" /></button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                                {editing && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-3">
                                            {!addingUser ? (
                                                <button type="button" onClick={() => setAddingUser(true)} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                                                    <Plus className="w-3.5 h-3.5" /> Ajouter un membre
                                                </button>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                                        <input autoFocus type="text" placeholder="Rechercher un utilisateur…" value={search} onChange={e => setSearch(e.target.value)}
                                                            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                                    </div>
                                                    <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50 bg-white shadow-sm">
                                                        {filteredUsers.slice(0, 8).map(u => (
                                                            <button key={u.id} type="button" onClick={() => handleAddUser(u)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left hover:bg-blue-50">
                                                                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">{(u.display_name || u.full_name || u.email)[0].toUpperCase()}</div>
                                                                <div className="min-w-0">
                                                                    <p className="font-medium text-gray-800 truncate text-xs">{u.display_name || u.full_name || u.email}</p>
                                                                    {u.job_title && <p className="text-[11px] text-gray-400 truncate">{u.job_title}</p>}
                                                                </div>
                                                            </button>
                                                        ))}
                                                        {filteredUsers.length === 0 && <p className="text-xs text-gray-400 px-3 py-2">Aucun utilisateur trouvé</p>}
                                                    </div>
                                                    <button type="button" onClick={() => { setAddingUser(false); setSearch(''); }} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
                {editing && assignments.length > 0 && (
                    <div className="px-6 py-3 bg-blue-50 border-t border-blue-100 rounded-b-2xl">
                        <p className="text-xs text-blue-700">Cliquez sur un rôle pour l&apos;activer — un seul rôle RACI par membre.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Create Campaign Modal ──────────────────────────────────────

function CreateCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Campaign) => void }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [endDate, setEndDate] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        setSaving(true); setError(null);
        try {
            const res = await campaignsApi.create({ title: title.trim(), description: description.trim() || undefined, end_date: endDate || undefined });
            onCreated(res.campaign);
        } catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div className="flex items-center gap-2"><Megaphone className="w-4 h-4 text-orange-500" /><h2 className="text-base font-bold text-gray-900">Nouvelle campagne</h2></div>
                    <button type="button" title="Fermer" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Titre *</label>
                        <input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Campagne Q2 2025"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Objectif de la campagne…"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Date de fin</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    {error && <p className="text-xs text-red-600">{error}</p>}
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Annuler</button>
                        <button type="submit" disabled={saving || !title.trim()} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Créer
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Confirm Modal ──────────────────────────────────────────────

function ConfirmModal({ title, message, confirmLabel = 'Supprimer', onConfirm, onCancel }: { title: string; message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="text-base font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 mb-6">{message}</p>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Annuler</button>
                    <button type="button" onClick={onConfirm} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700">{confirmLabel}</button>
                </div>
            </div>
        </div>
    );
}

// ── Rename Modal ───────────────────────────────────────────────

function RenameModal({ currentName, label, onSave, onCancel }: { currentName: string; label: string; onSave: (name: string) => void; onCancel: () => void; }) {
    const [name, setName] = useState(currentName);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="text-base font-bold text-gray-900 mb-4">Renommer {label}</h3>
                <input autoFocus type="text" aria-label="Nouveau nom" value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') onSave(name.trim()); if (e.key === 'Escape') onCancel(); }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4" />
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Annuler</button>
                    <button type="button" onClick={() => onSave(name.trim())} disabled={!name.trim()} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">Enregistrer</button>
                </div>
            </div>
        </div>
    );
}

// ── Add Procedure Modal ────────────────────────────────────────

function AddProcedureModal({ campaignId, existingIds, storeProcedures, onAdd, onClose }: {
    campaignId: string; existingIds: Set<string>; storeProcedures: Procedure[]; onAdd: () => void; onClose: () => void;
}) {
    const available = useMemo(() => storeProcedures.filter(p => !existingIds.has(p.id)), [storeProcedures, existingIds]);
    const [selected, setSelected] = useState<string[]>([]);
    const [adding, setAdding] = useState(false);

    const handleAdd = async () => {
        if (!selected.length) return;
        setAdding(true);
        try { await campaignsApi.addProcedures(campaignId, selected); onAdd(); }
        catch { /* silent */ } finally { setAdding(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[75vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="text-base font-bold text-gray-900">Ajouter des procédures</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Cochez un thème, une catégorie ou des procédures individuelles</p>
                    </div>
                    <button type="button" title="Fermer" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-hidden p-4">
                    <TaxonomyProcedureSelector
                        procedures={available}
                        selected={selected}
                        onChange={setSelected}
                        maxHeight="350px"
                    />
                </div>
                <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-xs text-gray-400">{selected.length} sélectionnée{selected.length !== 1 ? 's' : ''}</span>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Annuler</button>
                        <button type="button" onClick={handleAdd} disabled={!selected.length || adding} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                            {adding && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Ajouter ({selected.length})
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Campaign Card ──────────────────────────────────────────────

function CampaignCard({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
    const p = pct(campaign.stats?.done ?? 0, campaign.stats?.total ?? 0);
    const isOverdue = campaign.end_date && campaign.status === 'active' && new Date(campaign.end_date) < new Date();
    return (
        <div onClick={onClick} className="bg-white rounded-xl border border-gray-100 p-5 cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all group">
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center shrink-0"><Megaphone className="w-3.5 h-3.5 text-orange-500" /></div>
                    <h3 className="text-sm font-bold text-gray-900 truncate group-hover:text-blue-700 transition-colors">{campaign.title}</h3>
                </div>
                <CampaignStatusBadge status={campaign.status} />
            </div>
            {campaign.description && <p className="text-xs text-gray-400 mb-3 line-clamp-2">{campaign.description}</p>}
            <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">{campaign.stats?.done ?? 0}/{campaign.stats?.total ?? 0} procédures</span>
                    <span className="text-xs font-semibold text-gray-700">{p}%</span>
                </div>
                <ProgressBar value={campaign.stats?.done ?? 0} total={campaign.stats?.total ?? 0} />
            </div>
            {campaign.end_date && (
                <div className={`flex items-center gap-1 mt-2 text-[11px] ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                    <Clock className="w-3 h-3" />
                    {isOverdue ? 'En retard · ' : ''}{new Date(campaign.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
            )}
        </div>
    );
}

// ── Campaigns List (default tab) ──────────────────────────────

function CampaignsList({ campaigns, loading, error, onOpenCampaign, onCreateCampaign, onRefresh, isAdmin, currentUserId }: {
    campaigns: Campaign[]; loading: boolean; error: string | null; isAdmin: boolean; currentUserId: string | null;
    onOpenCampaign: (c: Campaign) => void; onCreateCampaign: () => void; onRefresh: () => void;
}) {
    const visibleCampaigns = isAdmin
        ? campaigns
        : campaigns.filter(c => (c.procedures ?? []).some(p => p.assigned_to === currentUserId));

    const active = visibleCampaigns.filter(c => c.status === 'active').length;
    const completed = visibleCampaigns.filter(c => c.status === 'completed').length;
    const blocked = visibleCampaigns.filter(c => c.status === 'blocked').length;
    const totalProcs = visibleCampaigns.reduce((s, c) => s + (c.stats?.total ?? 0), 0);
    const doneProcs = visibleCampaigns.reduce((s, c) => s + (c.stats?.done ?? 0), 0);

    if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>;
    if (error) return (
        <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-sm text-red-500">{error}</p>
            <button type="button" onClick={onRefresh} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">Réessayer</button>
        </div>
    );

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Campagnes</h2>
                        <p className="text-sm text-gray-400 mt-0.5">{visibleCampaigns.length} campagne{visibleCampaigns.length !== 1 ? 's' : ''} · {totalProcs} procédures</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" title="Actualiser" onClick={onRefresh} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><RefreshCw className="w-4 h-4" /></button>
                        {isAdmin && (
                            <button type="button" onClick={onCreateCampaign} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-orange-500 rounded-xl hover:bg-orange-600">
                                <Plus className="w-4 h-4" /> Nouvelle campagne
                            </button>
                        )}
                    </div>
                </div>

                {/* KPIs campagnes uniquement */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <KpiCard label="Total" value={visibleCampaigns.length} colorClass="bg-gray-50 text-gray-500" icon={Megaphone} />
                    <KpiCard label="En cours" value={active} sub="actives" colorClass="bg-blue-50 text-blue-500" icon={TrendingUp} />
                    <KpiCard label="Terminées" value={completed} colorClass="bg-green-50 text-green-500" icon={CheckCircle2} />
                    <KpiCard label="Bloquées" value={blocked} colorClass="bg-red-50 text-red-500" icon={AlertTriangle} />
                    <KpiCard label="Avancement" value={`${pct(doneProcs, totalProcs)}%`} sub={`${doneProcs}/${totalProcs} formalisées`} colorClass="bg-green-50 text-green-500" icon={CheckCircle2} />
                </div>

                {/* Campaigns grid */}
                {visibleCampaigns.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
                        <Megaphone className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                        <p className="text-sm text-gray-400">{isAdmin ? 'Aucune campagne' : 'Aucune campagne ne vous est assignée'}</p>
                        {isAdmin && <button type="button" onClick={onCreateCampaign} className="mt-3 text-sm text-orange-500 hover:underline font-medium">Créer la première campagne</button>}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {visibleCampaigns.map(c => <CampaignCard key={c.id} campaign={c} onClick={() => onOpenCampaign(c)} />)}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Procedure Row ──────────────────────────────────────────────

const PROC_STATUSES: CampaignProcedureStatus[] = ['pending', 'in_progress', 'formalized', 'validated', 'skipped'];

function ProcedureRow({ procedure, campaignId, isAdmin, onOpenWorkspace, onRaciOpen, onRefresh }: {
    procedure: EnrichedProcedure; campaignId: string; isAdmin: boolean;
    onOpenWorkspace?: (id: string) => void; onRaciOpen: (p: EnrichedProcedure) => void; onRefresh: () => void;
}) {
    const [confirm, setConfirm] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const { procedures: storeProcedures, removeProcedure } = useProceduresStore();
    const isFinalized = storeProcedures.find(p => p.id === procedure.procedure_id)?.is_finalized ?? false;

    const handleRemove = async () => {
        try { await campaignsApi.removeProcedure(campaignId, procedure.procedure_id); onRefresh(); }
        catch { /* silent */ } finally { setConfirm(false); }
    };

    const handleDeleteForever = async () => {
        setDeleting(true);
        try {
            await orchestrationApi.deleteProcedure(procedure.procedure_id);
            removeProcedure(procedure.procedure_id);
            onRefresh();
        } catch { /* silent */ } finally { setDeleting(false); setDeleteConfirm(false); }
    };

    const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newStatus = e.target.value as CampaignProcedureStatus;
        if (newStatus === procedure.status) return;
        setUpdatingStatus(true);
        try { await campaignsApi.updateProcedure(campaignId, procedure.procedure_id, { status: newStatus }); onRefresh(); }
        catch { /* silent */ } finally { setUpdatingStatus(false); }
    };

    const sc = PROC_STATUS_COLORS[procedure.status as keyof typeof PROC_STATUS_COLORS] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };

    return (
        <>
            <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-gray-100 group hover:border-blue-100 hover:bg-blue-50/20 transition-all">
                <FileText className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-800 font-medium truncate block">{procedure.procedure_nom}</span>
                    {procedure.procedure_ref && <span className="text-[10px] text-gray-400 font-mono">{procedure.procedure_ref}</span>}
                </div>
                {/* Inline status selector — available to all users */}
                <div className="relative shrink-0">
                    {updatingStatus
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                        : (
                            <select
                                value={procedure.status}
                                onChange={handleStatusChange}
                                aria-label="Statut de la procédure"
                                onClick={e => e.stopPropagation()}
                                className={`appearance-none text-[10px] font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${sc.bg} ${sc.text}`}
                            >
                                {PROC_STATUSES.map(s => (
                                    <option key={s} value={s}>{PROC_STATUS_LABELS[s]}</option>
                                ))}
                            </select>
                        )
                    }
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button type="button" onClick={() => onRaciOpen(procedure)} title="RACI"
                        className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-500 bg-gray-100 rounded hover:bg-gray-200">
                        <Users className="w-3 h-3" /> RACI
                    </button>
                    {onOpenWorkspace && (
                        <button type="button" onClick={() => onOpenWorkspace(procedure.procedure_id)}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
                            <PenLine className="w-3 h-3" /> Modifier
                        </button>
                    )}
                    {isAdmin && (
                        <button type="button" onClick={() => setConfirm(true)} title="Retirer de la campagne"
                            className="p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {isAdmin && !isFinalized && (
                        <button type="button" onClick={() => setDeleteConfirm(true)} title="Supprimer définitivement la procédure"
                            className="p-1 rounded text-gray-300 hover:text-red-600 hover:bg-red-100">
                            <Trash className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
            {confirm && (
                <ConfirmModal title="Retirer la procédure" message={`Retirer "${procedure.procedure_nom}" de cette campagne ?`} confirmLabel="Retirer"
                    onConfirm={handleRemove} onCancel={() => setConfirm(false)} />
            )}
            {deleteConfirm && (
                <ConfirmModal title="Supprimer la procédure" confirmLabel={deleting ? 'Suppression…' : 'Supprimer'}
                    message={`Supprimer définitivement "${procedure.procedure_nom}" ? Cette action est irréversible et retire la procédure de toutes les campagnes.`}
                    onConfirm={handleDeleteForever} onCancel={() => setDeleteConfirm(false)} />
            )}
        </>
    );
}

// ── Subcategory Accordion ──────────────────────────────────────

function SubcategoryAccordion({ subcat, campaignId, isAdmin, expanded, onToggle, onOpenWorkspace, onRaciOpen, onRefresh }: {
    subcat: SubcategoryGroup; campaignId: string; isAdmin: boolean;
    expanded: boolean; onToggle: () => void;
    onOpenWorkspace?: (id: string) => void; onRaciOpen: (p: EnrichedProcedure) => void; onRefresh: () => void;
}) {
    const [renaming, setRenaming] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [addProc, setAddProc] = useState(false);
    const { procedures: storeProcedures } = useProceduresStore();
    const status = aggregateStatus(subcat.procedures);
    const existingIds = useMemo(() => new Set(subcat.procedures.map(p => p.procedure_id)), [subcat.procedures]);
    const canEdit = isAdmin && !subcat.subcategoryId.startsWith('__');

    const handleRename = async (name: string) => { await taxonomyApi.update(subcat.subcategoryId, { name }); setRenaming(false); onRefresh(); };
    const handleDelete = async () => { await taxonomyApi.delete(subcat.subcategoryId); setConfirming(false); onRefresh(); };

    return (
        <div className="ml-5">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-violet-50/20 border border-transparent hover:border-violet-100 group transition-all cursor-pointer"
                onClick={onToggle}>
                <span className="shrink-0 text-gray-300">{expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}</span>
                <Layers className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="text-xs font-medium text-gray-600 flex-1 truncate">{subcat.subcategoryName}</span>
                <ProcStatusBadge status={status} />
                <span className="text-xs text-gray-400 shrink-0">{subcat.procedures.length}</span>
                {canEdit && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <button type="button" title="Ajouter une procédure" onClick={() => setAddProc(true)} className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"><Plus className="w-3 h-3" /></button>
                        <button type="button" title="Renommer" onClick={() => setRenaming(true)} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"><Pencil className="w-3 h-3" /></button>
                        <button type="button" title="Supprimer" onClick={() => setConfirming(true)} className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-50"><Trash2 className="w-3 h-3" /></button>
                    </div>
                )}
            </div>
            {expanded && (
                <div className="ml-5 mt-1 space-y-1">
                    {subcat.procedures.map(p => (
                        <ProcedureRow key={p.id} procedure={p} campaignId={campaignId} isAdmin={isAdmin}
                            onOpenWorkspace={onOpenWorkspace} onRaciOpen={onRaciOpen} onRefresh={onRefresh} />
                    ))}
                    {subcat.procedures.length === 0 && <div className="px-4 py-2 text-xs text-gray-400 italic">Aucune procédure</div>}
                </div>
            )}
            {renaming && <RenameModal currentName={subcat.subcategoryName} label="la sous-catégorie" onSave={handleRename} onCancel={() => setRenaming(false)} />}
            {confirming && <ConfirmModal title="Supprimer la sous-catégorie" message={`Supprimer "${subcat.subcategoryName}" ? Les procédures liées ne seront pas supprimées.`} onConfirm={handleDelete} onCancel={() => setConfirming(false)} />}
            {addProc && <AddProcedureModal campaignId={campaignId} existingIds={existingIds} storeProcedures={storeProcedures} onAdd={() => { setAddProc(false); onRefresh(); }} onClose={() => setAddProc(false)} />}
        </div>
    );
}

// ── Category Accordion ─────────────────────────────────────────

function CategoryAccordion({ category, campaignId, isAdmin, expanded, onToggle, expandedSubcategories, onToggleSubcategory, onOpenWorkspace, onRaciOpen, onRefresh }: {
    category: CategoryGroup; campaignId: string; isAdmin: boolean;
    expanded: boolean; onToggle: () => void;
    expandedSubcategories: Set<string>; onToggleSubcategory: (id: string) => void;
    onOpenWorkspace?: (id: string) => void; onRaciOpen: (p: EnrichedProcedure) => void; onRefresh: () => void;
}) {
    const [renaming, setRenaming] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [addingSubcat, setAddingSubcat] = useState(false);
    const [newSubcatName, setNewSubcatName] = useState('');
    const [savingSubcat, setSavingSubcat] = useState(false);
    const status = aggregateStatus(category.subcategories.flatMap(s => s.procedures));
    const canEdit = isAdmin && category.categoryId !== '__none__';

    const handleRename = async (name: string) => { await taxonomyApi.update(category.categoryId, { name }); setRenaming(false); onRefresh(); };
    const handleDelete = async () => { await taxonomyApi.delete(category.categoryId); setConfirming(false); onRefresh(); };
    const handleAddSubcat = async () => {
        if (!newSubcatName.trim()) return;
        setSavingSubcat(true);
        try { await taxonomyApi.create({ name: newSubcatName.trim(), level: 'subcategory', parent_id: category.categoryId }); setAddingSubcat(false); setNewSubcatName(''); onRefresh(); }
        catch { /* silent */ } finally { setSavingSubcat(false); }
    };

    return (
        <div className="ml-5">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 group hover:border-blue-100 hover:bg-blue-50/10 transition-all cursor-pointer"
                onClick={onToggle}>
                <span className="shrink-0 text-gray-400">{expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</span>
                <Tag className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-sm font-medium text-gray-700 flex-1 truncate">{category.categoryName}</span>
                <ProcStatusBadge status={status} />
                <span className="text-xs text-gray-400 shrink-0">{category.total} · {pct(category.done, category.total)}%</span>
                {canEdit && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <button type="button" title="Ajouter une sous-catégorie" onClick={() => setAddingSubcat(true)} className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"><Plus className="w-3.5 h-3.5" /></button>
                        <button type="button" title="Renommer" onClick={() => setRenaming(true)} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" title="Supprimer" onClick={() => setConfirming(true)} className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                )}
            </div>
            {expanded && (
                <div className="mt-1 space-y-1">
                    {category.subcategories.map(s => (
                        <SubcategoryAccordion key={s.subcategoryId} subcat={s} campaignId={campaignId} isAdmin={isAdmin}
                            expanded={expandedSubcategories.has(s.subcategoryId)} onToggle={() => onToggleSubcategory(s.subcategoryId)}
                            onOpenWorkspace={onOpenWorkspace} onRaciOpen={onRaciOpen} onRefresh={onRefresh} />
                    ))}
                    {addingSubcat && (
                        <div className="ml-5 flex items-center gap-2 py-1" onClick={e => e.stopPropagation()}>
                            <input autoFocus type="text" value={newSubcatName} onChange={e => setNewSubcatName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddSubcat(); if (e.key === 'Escape') { setAddingSubcat(false); setNewSubcatName(''); } }}
                                placeholder="Nom de la sous-catégorie…"
                                className="flex-1 px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <button type="button" title="Enregistrer" onClick={handleAddSubcat} disabled={!newSubcatName.trim() || savingSubcat} className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                                {savingSubcat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            </button>
                            <button type="button" title="Annuler" onClick={() => { setAddingSubcat(false); setNewSubcatName(''); }} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200"><X className="w-3.5 h-3.5" /></button>
                        </div>
                    )}
                </div>
            )}
            {renaming && <RenameModal currentName={category.categoryName} label="la catégorie" onSave={handleRename} onCancel={() => setRenaming(false)} />}
            {confirming && <ConfirmModal title="Supprimer la catégorie" message={`Supprimer "${category.categoryName}" ? Les sous-catégories et procédures liées ne seront pas supprimées.`} onConfirm={handleDelete} onCancel={() => setConfirming(false)} />}
        </div>
    );
}

// ── Theme Accordion ────────────────────────────────────────────

function ThemeAccordion({ theme, campaignId, isAdmin, expanded, onToggle, expandedCategories, onToggleCategory, expandedSubcategories, onToggleSubcategory, onOpenWorkspace, onRaciOpen, onRefresh }: {
    theme: ThemeGroup; campaignId: string; isAdmin: boolean;
    expanded: boolean; onToggle: () => void;
    expandedCategories: Set<string>; onToggleCategory: (id: string) => void;
    expandedSubcategories: Set<string>; onToggleSubcategory: (id: string) => void;
    onOpenWorkspace?: (id: string) => void; onRaciOpen: (p: EnrichedProcedure) => void; onRefresh: () => void;
}) {
    const [renaming, setRenaming] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [addingCat, setAddingCat] = useState(false);
    const [newCatName, setNewCatName] = useState('');
    const [savingCat, setSavingCat] = useState(false);
    const status = aggregateStatus(theme.categories.flatMap(c => c.subcategories.flatMap(s => s.procedures)));
    const canEdit = isAdmin && theme.themeId !== '__unclassified__';

    const handleRename = async (name: string) => { await taxonomyApi.update(theme.themeId, { name }); setRenaming(false); onRefresh(); };
    const handleDelete = async () => { await taxonomyApi.delete(theme.themeId); setConfirming(false); onRefresh(); };
    const handleAddCat = async () => {
        if (!newCatName.trim()) return;
        setSavingCat(true);
        try { await taxonomyApi.create({ name: newCatName.trim(), level: 'category', parent_id: theme.themeId }); setAddingCat(false); setNewCatName(''); onRefresh(); }
        catch { /* silent */ } finally { setSavingCat(false); }
    };

    return (
        <div>
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-gray-100 group hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer"
                onClick={onToggle}>
                <span className="shrink-0 text-gray-400">{expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
                <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-sm font-semibold text-gray-800 flex-1 truncate">{theme.themeName}</span>
                <ProcStatusBadge status={status} />
                <span className="text-xs text-gray-400 shrink-0">{theme.total} proc. · {pct(theme.done, theme.total)}%</span>
                {canEdit && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <button type="button" title="Ajouter une catégorie" onClick={() => setAddingCat(true)} className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"><Plus className="w-4 h-4" /></button>
                        <button type="button" title="Renommer" onClick={() => setRenaming(true)} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"><Pencil className="w-4 h-4" /></button>
                        <button type="button" title="Supprimer" onClick={() => setConfirming(true)} className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                    </div>
                )}
            </div>
            {expanded && (
                <div className="mt-1 space-y-1">
                    {theme.categories.map(cat => (
                        <CategoryAccordion key={cat.categoryId} category={cat} campaignId={campaignId} isAdmin={isAdmin}
                            expanded={expandedCategories.has(cat.categoryId)} onToggle={() => onToggleCategory(cat.categoryId)}
                            expandedSubcategories={expandedSubcategories} onToggleSubcategory={onToggleSubcategory}
                            onOpenWorkspace={onOpenWorkspace} onRaciOpen={onRaciOpen} onRefresh={onRefresh} />
                    ))}
                    {addingCat && (
                        <div className="ml-5 flex items-center gap-2 py-1" onClick={e => e.stopPropagation()}>
                            <input autoFocus type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddCat(); if (e.key === 'Escape') { setAddingCat(false); setNewCatName(''); } }}
                                placeholder="Nom de la catégorie…"
                                className="flex-1 px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <button type="button" title="Enregistrer" onClick={handleAddCat} disabled={!newCatName.trim() || savingCat} className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                                {savingCat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            </button>
                            <button type="button" title="Annuler" onClick={() => { setAddingCat(false); setNewCatName(''); }} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200"><X className="w-3.5 h-3.5" /></button>
                        </div>
                    )}
                </div>
            )}
            {renaming && <RenameModal currentName={theme.themeName} label="le thème" onSave={handleRename} onCancel={() => setRenaming(false)} />}
            {confirming && <ConfirmModal title="Supprimer le thème" message={`Supprimer "${theme.themeName}" et toutes ses catégories ?`} onConfirm={handleDelete} onCancel={() => setConfirming(false)} />}
        </div>
    );
}

// ── Campaign View ──────────────────────────────────────────────

function CampaignView({ campaign, isAdmin, onOpenWorkspace, taxNodes, storeProcedures, onRaciOpen, onCampaignUpdated, onCampaignDeleted }: {
    campaign: Campaign; isAdmin: boolean;
    onOpenWorkspace?: (id: string) => void;
    taxNodes: TaxNode[]; storeProcedures: Procedure[];
    onRaciOpen: (p: EnrichedProcedure) => void;
    onCampaignUpdated: (c: Campaign) => void;
    onCampaignDeleted: () => void;
}) {
    const [detail, setDetail] = useState<Campaign>(campaign);
    const [refreshing, setRefreshing] = useState(false);
    const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());
    const [renaming, setRenaming] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [showAddProcs, setShowAddProcs] = useState(false);

    const handleDownloadReport = async () => {
        setDownloading(true);
        try {
            const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
            const res = await fetch(`${BASE}/api/campaigns/${campaign.id}/report`);
            if (!res.ok) throw new Error('Erreur lors de la génération du rapport');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rapport_${detail.title.replace(/\s+/g, '_').slice(0, 50)}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
        finally { setDownloading(false); }
    };

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try { const res = await campaignsApi.get(campaign.id); setDetail(res.campaign); onCampaignUpdated(res.campaign); }
        catch { /* silent */ } finally { setRefreshing(false); }
    }, [campaign.id, onCampaignUpdated]);

    useEffect(() => { refresh(); }, [refresh]);

    const themeGroups = useMemo(() => computeThemeGroups(detail, taxNodes, storeProcedures), [detail, taxNodes, storeProcedures]);

    const toggleTheme = (id: string) => setExpandedThemes(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleCategory = (id: string) => setExpandedCategories(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleSubcategory = (id: string) => setExpandedSubcategories(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const handleAction = async (action: 'launch' | 'close' | 'block' | 'resume') => {
        try { await campaignsApi[action](campaign.id); refresh(); } catch { /* silent */ }
    };
    const handleRename = async (name: string) => { await campaignsApi.update(campaign.id, { title: name }); setRenaming(false); refresh(); };

    const handleDelete = async () => {
        setDeleting(true);
        try { await campaignsApi.delete(campaign.id); onCampaignDeleted(); }
        catch { /* silent */ } finally { setDeleting(false); setDeleteConfirm(false); }
    };

    const procs = detail.procedures ?? [];
    const totalProcs = detail.stats?.total ?? 0;
    const doneProcs = detail.stats?.done ?? 0;
    const themeCount = themeGroups.length;
    const catCount = themeGroups.reduce((s, t) => s + t.categories.length, 0);
    const subcatCount = themeGroups.reduce((s, t) => s + t.categories.reduce((sc, c) => sc + c.subcategories.length, 0), 0);
    const statusBreakdown = ['validated', 'formalized', 'in_progress', 'pending', 'skipped']
        .map(s => ({ status: s, count: procs.filter(p => p.status === s).length }))
        .filter(s => s.count > 0);

    return (
        <div className="h-full overflow-y-auto">
            {/* Campaign header card */}
            <div className="px-6 pt-6 pb-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center shrink-0"><Megaphone className="w-4 h-4 text-orange-500" /></div>
                            <div className="min-w-0">
                                <h2 className="text-base font-bold text-gray-900 truncate">{detail.title}</h2>
                                {detail.description && <p className="text-xs text-gray-400 truncate">{detail.description}</p>}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                            <CampaignStatusBadge status={detail.status} />
                            <button type="button" onClick={handleDownloadReport} disabled={downloading} title="Générer le rapport Word"
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50">
                                {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                Rapport
                            </button>
                            {isAdmin && detail.status !== 'completed' && detail.status !== 'archived' && (
                                <button type="button" onClick={() => setShowAddProcs(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                                    <Plus className="w-3 h-3" /> Ajouter procédures
                                </button>
                            )}
                            {isAdmin && detail.status === 'draft' && <button type="button" onClick={() => handleAction('launch')} className="px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 rounded-lg hover:bg-green-100">Lancer</button>}
                            {isAdmin && detail.status === 'active' && (
                                <>
                                    <button type="button" onClick={() => handleAction('close')} className="px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 rounded-lg hover:bg-green-100">Clôturer</button>
                                    <button type="button" onClick={() => handleAction('block')} className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 rounded-lg hover:bg-red-100">Bloquer</button>
                                    <button type="button" onClick={() => { campaignsApi.pause(campaign.id).then(refresh); }} className="px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100">Pause</button>
                                </>
                            )}
                            {isAdmin && (detail.status === 'blocked' || detail.status === 'on_hold') && <button type="button" onClick={() => handleAction('resume')} className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100">Reprendre</button>}
                            {isAdmin && <button type="button" title="Renommer" onClick={() => setRenaming(true)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><Pencil className="w-3.5 h-3.5" /></button>}
                            {isAdmin && <button type="button" title="Supprimer" onClick={() => setDeleteConfirm(true)} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                            {refreshing && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                        <div className="bg-gray-50 rounded-lg px-3 py-2 text-center"><div className="text-lg font-bold text-gray-900">{themeCount}</div><div className="text-[11px] text-gray-500">Thèmes</div></div>
                        <div className="bg-gray-50 rounded-lg px-3 py-2 text-center"><div className="text-lg font-bold text-gray-900">{catCount}</div><div className="text-[11px] text-gray-500">Catégories</div></div>
                        <div className="bg-gray-50 rounded-lg px-3 py-2 text-center"><div className="text-lg font-bold text-gray-900">{subcatCount}</div><div className="text-[11px] text-gray-500">Sous-cat.</div></div>
                        <div className="bg-gray-50 rounded-lg px-3 py-2 text-center"><div className="text-lg font-bold text-gray-900">{totalProcs}</div><div className="text-[11px] text-gray-500">Procédures</div></div>
                        <div className="bg-green-50 rounded-lg px-3 py-2 text-center"><div className="text-lg font-bold text-green-700">{doneProcs}</div><div className="text-[11px] text-green-600">Formalisées</div></div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1"><span>Avancement</span><span className="font-semibold">{pct(doneProcs, totalProcs)}%</span></div>
                    <ProgressBar value={doneProcs} total={totalProcs} />

                    {statusBreakdown.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                            {statusBreakdown.map(({ status, count }) => (
                                <div key={status} className="flex items-center gap-1.5 text-[11px]">
                                    <ProcStatusBadge status={status} />
                                    <span className="font-semibold text-gray-600">{count}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {detail.end_date && (
                        <div className={`mt-3 flex items-center gap-1.5 text-xs ${new Date(detail.end_date) < new Date() && detail.status === 'active' ? 'text-red-500' : 'text-gray-400'}`}>
                            <Clock className="w-3.5 h-3.5" />
                            Échéance : {new Date(detail.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                    )}
                </div>
            </div>

            {/* Theme accordion */}
            <div className="px-6 pb-6 space-y-2">
                <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{themeGroups.length} thème{themeGroups.length !== 1 ? 's' : ''}</p>
                    <button type="button" title="Actualiser" onClick={refresh} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><RefreshCw className="w-3.5 h-3.5" /></button>
                </div>
                {themeGroups.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
                        <FolderOpen className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                        <p className="text-sm text-gray-400">Aucune procédure dans cette campagne</p>
                    </div>
                ) : themeGroups.map(theme => (
                    <ThemeAccordion key={theme.themeId} theme={theme} campaignId={detail.id} isAdmin={isAdmin}
                        expanded={expandedThemes.has(theme.themeId)} onToggle={() => toggleTheme(theme.themeId)}
                        expandedCategories={expandedCategories} onToggleCategory={toggleCategory}
                        expandedSubcategories={expandedSubcategories} onToggleSubcategory={toggleSubcategory}
                        onOpenWorkspace={onOpenWorkspace} onRaciOpen={onRaciOpen} onRefresh={refresh} />
                ))}
            </div>

            {renaming && <RenameModal currentName={detail.title} label="la campagne" onSave={handleRename} onCancel={() => setRenaming(false)} />}
            {deleteConfirm && (
                <ConfirmModal
                    title="Supprimer la campagne"
                    message={`Supprimer "${detail.title}" effacera définitivement tous les thèmes, catégories et procédures associés. Cette action est irréversible.`}
                    confirmLabel={deleting ? 'Suppression…' : 'Supprimer définitivement'}
                    onConfirm={handleDelete}
                    onCancel={() => setDeleteConfirm(false)}
                />
            )}
            {showAddProcs && (
                <AddProcedureModal
                    campaignId={detail.id}
                    existingIds={new Set(procs.map(p => p.procedure_id))}
                    storeProcedures={storeProcedures}
                    onAdd={() => { setShowAddProcs(false); refresh(); }}
                    onClose={() => setShowAddProcs(false)}
                />
            )}
        </div>
    );
}

// ── Main: ProceduresDrilldown ──────────────────────────────────

export default function ProceduresDrilldown({ isAdmin, onOpenWorkspace }: ProceduresDrilldownProps) {
    const { profile } = useAuth();
    const { procedures: storeProcedures, fetchProcedures } = useProceduresStore();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [taxNodes, setTaxNodes] = useState<TaxNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openTabs, setOpenTabs] = useState<Campaign[]>([]);
    const [activeTab, setActiveTab] = useState<'dashboard' | string>('dashboard');
    const [showCreate, setShowCreate] = useState(false);
    const [raciTarget, setRaciTarget] = useState<EnrichedProcedure | null>(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const [cr, tr] = await Promise.all([campaignsApi.list(), taxonomyApi.getFlat()]);
            setCampaigns(cr.campaigns || []);
            setTaxNodes(tr.nodes || []);
        } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); fetchProcedures(); }, [load, fetchProcedures]);

    const openCampaignTab = (c: Campaign) => {
        setOpenTabs(prev => prev.find(t => t.id === c.id) ? prev : [...prev, c]);
        setActiveTab(c.id);
    };
    const closeCampaignTab = (id: string) => {
        setOpenTabs(prev => prev.filter(t => t.id !== id));
        if (activeTab === id) setActiveTab('dashboard');
    };
    const updateTab = useCallback((c: Campaign) => {
        setOpenTabs(prev => prev.map(t => t.id === c.id ? c : t));
        setCampaigns(prev => prev.map(t => t.id === c.id ? c : t));
    }, []);

    return (
        <div className="h-full flex flex-col bg-gray-50 min-w-0">
            {/* ── Tab bar ── */}
            <div className="shrink-0 bg-white border-b border-gray-200 flex items-end overflow-x-auto scrollbar-none">
                <button type="button" onClick={() => setActiveTab('dashboard')}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors shrink-0 ${activeTab === 'dashboard' ? 'border-orange-500 text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                    <Megaphone className="w-3.5 h-3.5 shrink-0" /> Campagnes
                </button>
                {openTabs.map(tab => (
                    <button type="button" key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`group flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors max-w-[200px] shrink-0 ${activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                        <Megaphone className="w-3 h-3 shrink-0 text-orange-400" />
                        <span className="truncate">{tab.title}</span>
                        <button type="button" title="Fermer cet onglet"
                            onClick={e => { e.stopPropagation(); closeCampaignTab(tab.id); }}
                            className="ml-1 p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 opacity-0 group-hover:opacity-100 shrink-0">
                            <X className="w-3 h-3" />
                        </button>
                    </button>
                ))}
                <div className="ml-auto px-3 pb-1 shrink-0">
                    <button type="button" onClick={() => setShowCreate(true)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg whitespace-nowrap">
                        <Plus className="w-3.5 h-3.5" /> Nouvelle
                    </button>
                </div>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'dashboard' && (
                    <CampaignsList campaigns={campaigns}
                        loading={loading} error={error} onOpenCampaign={openCampaignTab}
                        onCreateCampaign={() => setShowCreate(true)} onRefresh={load}
                        isAdmin={isAdmin} currentUserId={profile?.id ?? null} />
                )}
                {openTabs.map(tab => (
                    <div key={tab.id} className={`h-full overflow-hidden ${activeTab === tab.id ? '' : 'hidden'}`}>
                        <CampaignView campaign={tab} isAdmin={isAdmin} onOpenWorkspace={onOpenWorkspace}
                            taxNodes={taxNodes} storeProcedures={storeProcedures}
                            onRaciOpen={setRaciTarget} onCampaignUpdated={updateTab}
                            onCampaignDeleted={() => { closeCampaignTab(tab.id); setCampaigns(prev => prev.filter(c => c.id !== tab.id)); }} />
                    </div>
                ))}
            </div>

            {raciTarget && <RaciModal procedureId={raciTarget.procedure_id} procedureName={raciTarget.procedure_nom} isAdmin={isAdmin} onClose={() => setRaciTarget(null)} />}
            {showCreate && (
                <CreateCampaignModal onClose={() => setShowCreate(false)} onCreated={c => { setCampaigns(prev => [c, ...prev]); setShowCreate(false); openCampaignTab(c); }} />
            )}
        </div>
    );
}

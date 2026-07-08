'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BarChart2, CheckCircle2, Clock, Download, FileText, Loader2, Megaphone,
    Pause, RefreshCw, TrendingUp, Users, AlertTriangle, OctagonAlert,
} from 'lucide-react';
import { campaignsApi, type Campaign, CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_COLORS } from '@/lib/campaignsApi';
import { orchestrationTasksApi, type ProcedureTask, type EnrichedTaskEvent } from '@/lib/orchestrationTasksApi';
import { useProceduresStore } from '@/store/proceduresStore';
import { useAuth } from '@/context/AuthContext';

function pct(a: number, b: number) { return b > 0 ? Math.round((a / b) * 100) : 0; }

function KpiCard({ label, value, sub, icon: Icon, bg }: { label: string; value: number | string; sub?: string; icon: React.ElementType; bg: string }) {
    return (
        <div className={`${bg} rounded-xl p-4`}>
            <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4 opacity-60" />
                <span className="text-xs font-medium text-gray-600">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
    );
}

function ProgressBar({ value, total, color = 'bg-blue-500' }: { value: number; total: number; color?: string }) {
    const p = pct(value, total);
    return (
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${p}%` }} />
        </div>
    );
}

interface ContributorStat {
    id: string;
    name: string;
    total: number;
    completed: number;
    overdue: number;
    inProgress: number;
}

export default function DashboardPanel() {
    const { profile } = useAuth();
    const { procedures, fetchProcedures } = useProceduresStore();
    const isAdmin = profile?.global_role === 'admin';

    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [tasks, setTasks] = useState<ProcedureTask[]>([]);
    const [events, setEvents] = useState<EnrichedTaskEvent[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [cr, tr, ev] = await Promise.all([
                campaignsApi.list(),
                isAdmin
                    ? orchestrationTasksApi.listTasks()
                    : orchestrationTasksApi.listTasks({ actor_id: profile?.id }),
                orchestrationTasksApi.listRecentEvents({ limit: 15 }),
            ]);
            setCampaigns(cr.campaigns || []);
            setTasks(tr.tasks || []);
            setEvents(ev.events || []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [isAdmin, profile?.id]);

    useEffect(() => { load(); fetchProcedures(); }, [load, fetchProcedures]);

    // ── Computed stats ────────────────────────────────────────────

    // User: only procedures where they have tasks
    const myProcIds = useMemo(() => {
        if (isAdmin) return null;
        return new Set(tasks.map(t => t.procedure_id));
    }, [tasks, isAdmin]);

    const procStats = useMemo(() => {
        const pool = myProcIds ? procedures.filter(p => myProcIds.has(p.id)) : procedures;
        const total = pool.length;
        const validated = pool.filter(p => ['Validée', 'validated'].includes(p.status)).length;
        const inProgress = pool.filter(p => ['En cours', 'En validation', 'En révision', 'En vérification', 'in_progress', 'formalized'].includes(p.status)).length;
        const draft = pool.filter(p => ['Brouillon', 'draft', 'pending'].includes(p.status)).length;
        return { total, validated, inProgress, draft };
    }, [procedures, myProcIds]);

    const campaignStats = useMemo(() => {
        const visible = isAdmin ? campaigns : campaigns.filter(c =>
            (c.procedures ?? []).some(p => p.assigned_to === profile?.id)
        );
        return {
            total: visible.length,
            active: visible.filter(c => c.status === 'active').length,
            completed: visible.filter(c => c.status === 'completed').length,
            blocked: visible.filter(c => c.status === 'blocked').length,
            draft: visible.filter(c => c.status === 'draft').length,
            campaigns: visible,
        };
    }, [campaigns, isAdmin, profile?.id]);

    const taskStats = useMemo(() => {
        const active = tasks.filter(t => !['completed', 'validated', 'cancelled'].includes(t.status));
        const now = Date.now();
        const overdue = active.filter(t => t.due_date && new Date(t.due_date).getTime() < now);
        const blocked = active.filter(t => t.status === 'blocked');
        const submitted = active.filter(t => t.status === 'submitted');
        return { total: tasks.length, active: active.length, overdue: overdue.length, blocked: blocked.length, submitted: submitted.length };
    }, [tasks]);

    // Team members for non-admin — who's working on the same procedures
    const teamMembers = useMemo(() => {
        if (isAdmin) return [];
        const map = new Map<string, { id: string; name: string; role?: string; lastAction?: string; procName?: string }>();
        tasks.forEach(t => {
            if (!t.assigned_to || t.assigned_to === profile?.id) return;
            if (!map.has(t.assigned_to)) {
                map.set(t.assigned_to, {
                    id: t.assigned_to,
                    name: t.assigned_to_name || t.assigned_to,
                    role: t.raci_role || undefined,
                    lastAction: t.status === 'submitted' ? 'A soumis' : t.status === 'validated' ? 'A validé' : t.status === 'in_progress' ? 'Travaille' : undefined,
                    procName: t.procedure_name,
                });
            }
        });
        return [...map.values()].slice(0, 10);
    }, [tasks, isAdmin, profile?.id]);

    const contributors = useMemo<ContributorStat[]>(() => {
        if (!isAdmin) return [];
        const map = new Map<string, ContributorStat>();
        const now = Date.now();
        tasks.forEach(t => {
            if (!t.assigned_to) return;
            if (!map.has(t.assigned_to)) {
                map.set(t.assigned_to, { id: t.assigned_to, name: t.assigned_to_name || t.assigned_to, total: 0, completed: 0, overdue: 0, inProgress: 0 });
            }
            const s = map.get(t.assigned_to)!;
            s.total++;
            if (['completed', 'validated'].includes(t.status)) s.completed++;
            else if (t.due_date && new Date(t.due_date).getTime() < now && !['cancelled'].includes(t.status)) s.overdue++;
            else if (['in_progress', 'submitted', 'changes_requested'].includes(t.status)) s.inProgress++;
        });
        return [...map.values()].sort((a, b) => b.total - a.total);
    }, [tasks, isAdmin]);

    const statusDist = useMemo(() => [
        { label: 'Validées', count: procStats.validated, color: 'bg-green-500' },
        { label: 'En cours', count: procStats.inProgress, color: 'bg-blue-500' },
        { label: 'Brouillon', count: procStats.draft, color: 'bg-gray-300' },
    ].filter(d => d.count > 0), [procStats]);

    const [downloadingReport, setDownloadingReport] = useState(false);
    const handleGlobalReport = async () => {
        setDownloadingReport(true);
        try {
            const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
            const res = await fetch(`${BASE}/api/campaigns/portfolio/report`);
            if (!res.ok) throw new Error('Erreur lors de la génération');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'portfolio_projets_formalisation.docx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
        finally { setDownloadingReport(false); }
    };

    const alerts = useMemo(() => {
        const items: { label: string; detail: string; color: string; icon: React.ElementType }[] = [];
        campaignStats.campaigns.forEach(c => {
            if (c.status === 'blocked') items.push({ label: c.title, detail: 'Bloqué', color: 'bg-red-50 border-red-200 text-red-700', icon: OctagonAlert });
            else if (c.status === 'on_hold') items.push({ label: c.title, detail: 'En pause', color: 'bg-purple-50 border-purple-200 text-purple-700', icon: Pause });
            else if (c.status === 'active' && c.end_date && new Date(c.end_date) < new Date()) items.push({ label: c.title, detail: 'En retard', color: 'bg-red-50 border-red-200 text-red-700', icon: AlertTriangle });
        });
        return items;
    }, [campaignStats.campaigns]);

    // Sort campaigns: blocked → on_hold → active → draft → completed
    const sortedCampaigns = useMemo(() => {
        const priority: Record<string, number> = { blocked: 0, on_hold: 1, active: 2, draft: 3, completed: 4, archived: 5 };
        return [...campaignStats.campaigns].sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9));
    }, [campaignStats.campaigns]);

    if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>;

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-6 space-y-8 max-w-6xl">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Tableau de bord</h2>
                        <p className="text-sm text-gray-400 mt-0.5">
                            {isAdmin ? 'Vue globale — toutes les procédures et campagnes' : `Mon périmètre — ${procStats.total} procédure${procStats.total !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={load} title="Actualiser"
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                            <button type="button" onClick={handleGlobalReport} disabled={downloadingReport || campaigns.length === 0}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                                {downloadingReport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                Rapport global
                            </button>
                        )}
                    </div>
                </div>

                {/* Alerts */}
                {alerts.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Points d&apos;attention ({alerts.length})
                        </p>
                        <div className="flex gap-2 flex-wrap">
                            {alerts.map((a, i) => (
                                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${a.color}`}>
                                    <a.icon className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate max-w-[200px]">{a.label}</span>
                                    <span className="text-[10px] opacity-75">· {a.detail}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* KPIs procédures */}
                <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Procédures</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <KpiCard label="Total" value={procStats.total} icon={FileText} bg="bg-gray-50" />
                        <KpiCard label="Validées" value={procStats.validated} sub={`${pct(procStats.validated, procStats.total)}%`} icon={CheckCircle2} bg="bg-green-50" />
                        <KpiCard label="En cours" value={procStats.inProgress} icon={TrendingUp} bg="bg-blue-50" />
                        <KpiCard label="Brouillon" value={procStats.draft} icon={Clock} bg="bg-gray-50" />
                    </div>
                    {statusDist.length > 0 && (
                        <div className="mt-3 bg-white rounded-xl border border-gray-100 p-4">
                            <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mb-3">
                                {statusDist.map(d => <div key={d.label} className={`${d.color} rounded-full`} style={{ width: `${pct(d.count, procStats.total)}%` }} />)}
                            </div>
                            <div className="flex flex-wrap gap-4">
                                {statusDist.map(d => (
                                    <div key={d.label} className="flex items-center gap-1.5 text-xs">
                                        <span className={`w-2 h-2 rounded-full ${d.color}`} />
                                        <span className="text-gray-600">{d.label}</span>
                                        <span className="font-semibold text-gray-800">{d.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* KPIs tâches */}
                <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Tâches</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <KpiCard label="Total" value={taskStats.total} icon={BarChart2} bg="bg-gray-50" />
                        <KpiCard label="Actives" value={taskStats.active} icon={TrendingUp} bg="bg-blue-50" />
                        <KpiCard label="En retard" value={taskStats.overdue} icon={AlertTriangle} bg={taskStats.overdue > 0 ? 'bg-red-50' : 'bg-gray-50'} />
                        <KpiCard label="Bloquées" value={taskStats.blocked} icon={OctagonAlert} bg={taskStats.blocked > 0 ? 'bg-red-50' : 'bg-gray-50'} />
                        <KpiCard label="En validation" value={taskStats.submitted} icon={Clock} bg="bg-indigo-50" />
                    </div>
                </div>

                {/* Campagnes */}
                <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Campagnes</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                        <KpiCard label="Total" value={campaignStats.total} icon={Megaphone} bg="bg-gray-50" />
                        <KpiCard label="Actives" value={campaignStats.active} icon={TrendingUp} bg="bg-blue-50" />
                        <KpiCard label="Brouillon" value={campaignStats.draft} icon={Clock} bg="bg-gray-50" />
                        <KpiCard label="Terminées" value={campaignStats.completed} icon={CheckCircle2} bg="bg-green-50" />
                        <KpiCard label="Bloquées" value={campaignStats.blocked} icon={OctagonAlert} bg={campaignStats.blocked > 0 ? 'bg-red-50' : 'bg-gray-50'} />
                    </div>
                    {sortedCampaigns.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Projet</th>
                                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">Statut</th>
                                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Procédures</th>
                                        <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 w-40">Avancement</th>
                                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Échéance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {sortedCampaigns.map(c => {
                                        const isOverdue = c.end_date && c.status === 'active' && new Date(c.end_date) < new Date();
                                        const sc = CAMPAIGN_STATUS_COLORS[c.status];
                                        return (
                                            <tr key={c.id} className={`hover:bg-gray-50/50 ${isOverdue ? 'bg-red-50/30' : ''}`}>
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-gray-800 truncate max-w-[250px]">{c.title}</p>
                                                    {c.description && <p className="text-[11px] text-gray-400 truncate max-w-[250px]">{c.description}</p>}
                                                </td>
                                                <td className="px-3 py-3">
                                                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc?.bg} ${sc?.text}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${sc?.dot}`} />
                                                        {CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-center">
                                                    <p className="font-semibold text-gray-800">{c.stats.total}</p>
                                                    <p className="text-[10px] text-gray-400">{c.stats.done} faites · {c.stats.pending} en att.</p>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <ProgressBar value={c.stats.done} total={c.stats.total}
                                                            color={c.stats.progress_pct >= 80 ? 'bg-green-500' : c.stats.progress_pct > 0 ? 'bg-orange-400' : 'bg-gray-200'} />
                                                        <span className="text-xs font-semibold text-gray-700 w-8 text-right shrink-0">{c.stats.progress_pct}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {c.end_date ? (
                                                        <span className={`text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                                                            {new Date(c.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })}
                                                        </span>
                                                    ) : <span className="text-xs text-gray-300">—</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Performances contributeurs (admin only) */}
                {/* Équipe impliquée (user) */}
                {!isAdmin && teamMembers.length > 0 && (
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                            <Users className="w-3 h-3 inline mr-1" />
                            Équipe impliquée
                        </p>
                        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
                            {teamMembers.map(m => (
                                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
                                        {(m.name || '?')[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">{m.name}</p>
                                        {m.procName && <p className="text-[11px] text-gray-400 truncate">{m.procName}</p>}
                                    </div>
                                    {m.role && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                            m.role === 'R' ? 'bg-blue-100 text-blue-700' :
                                            m.role === 'A' ? 'bg-red-100 text-red-700' :
                                            m.role === 'C' ? 'bg-green-100 text-green-700' :
                                            'bg-amber-100 text-amber-700'
                                        }`}>{m.role}</span>
                                    )}
                                    {m.lastAction && (
                                        <span className="text-[10px] text-gray-400 shrink-0">{m.lastAction}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Activité récente (filtered to user's procedures if not admin) */}
                {events.length > 0 && (
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                            Activité récente
                        </p>
                        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
                            {(myProcIds ? events.filter(ev => ev.procedure_id && myProcIds.has(ev.procedure_id)) : events).slice(0, 8).map(ev => (
                                <div key={ev.id} className="flex items-start gap-2.5 px-4 py-2.5">
                                    <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">
                                        {(ev.actor_name || 'S').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-gray-700">
                                            <span className="font-semibold">{ev.actor_name || 'Système'}</span>
                                            {' — '}
                                            {ev.event_type === 'task_created' ? 'a créé une tâche' :
                                             ev.event_type === 'status_changed' ? 'a changé le statut' :
                                             ev.event_type === 'validation_task_created' ? 'a demandé une validation' :
                                             ev.event_type === 'review_task_created' ? 'a demandé une vérification' :
                                             ev.event_type === 'correction_task_created' ? 'a demandé une correction' :
                                             ev.event_type === 'comment_added' ? 'a commenté' :
                                             ev.event_type}
                                        </p>
                                        {ev.procedure_name && <p className="text-[10px] text-gray-400 truncate">{ev.procedure_name}</p>}
                                    </div>
                                    <span className="text-[10px] text-gray-300 shrink-0">
                                        {new Date(ev.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Performances contributeurs (admin only) */}
                {isAdmin && contributors.length > 0 && (
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                            <Users className="w-3 h-3 inline mr-1" />
                            Performances contributeurs
                        </p>
                        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Contributeur</th>
                                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Total</th>
                                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-green-600">Terminées</th>
                                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-blue-600">En cours</th>
                                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-red-600">En retard</th>
                                        <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 w-32">Avancement</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {contributors.map(c => {
                                        const completionPct = pct(c.completed, c.total);
                                        return (
                                            <tr key={c.id} className="hover:bg-gray-50/50">
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700 shrink-0">
                                                            {(c.name || '?')[0].toUpperCase()}
                                                        </div>
                                                        <span className="font-medium text-gray-800 truncate">{c.name}</span>
                                                    </div>
                                                </td>
                                                <td className="text-center px-3 py-2.5 font-semibold text-gray-700">{c.total}</td>
                                                <td className="text-center px-3 py-2.5 font-semibold text-green-700">{c.completed}</td>
                                                <td className="text-center px-3 py-2.5 font-semibold text-blue-700">{c.inProgress}</td>
                                                <td className="text-center px-3 py-2.5 font-semibold text-red-700">{c.overdue || '—'}</td>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <ProgressBar value={c.completed} total={c.total} color={completionPct >= 80 ? 'bg-green-500' : 'bg-blue-400'} />
                                                        <span className="text-[11px] font-semibold text-gray-600 w-8 text-right shrink-0">{completionPct}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

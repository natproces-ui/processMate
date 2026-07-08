'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    AlertTriangle, Plus, RefreshCw, Filter, X, Sparkles, Loader2,
    BarChart2, List, Megaphone, ChevronDown, ChevronRight,
} from 'lucide-react';
import { orchestrationApi, Procedure } from '@/lib/orchestrationApi';
import { campaignsApi, type Campaign } from '@/lib/campaignsApi';
import { IrritantCard, IrritantForm, EMPTY_FORM, Irritant, CRITICITES, STATUTS, CATEGORIES, CATEGORIE_CONFIG } from './IrritantCard';
import IrritantsDashboard from './IrritantsDashboard';
import { API_CONFIG } from '@/lib/api-config';

// ─── StatBar — ligne de stats compacte ───────────────────────

function StatBar({ stats, total }: {
    stats: { label: string; value: number; color: string }[];
    total: number;
}) {
    return (
        <div className="flex items-center gap-0 bg-white border border-gray-200 rounded-xl overflow-hidden text-sm divide-x divide-gray-100">
            {stats.map((s, i) => (
                <div key={s.label} className="flex items-center gap-2 px-4 py-2.5 flex-1 min-w-0">
                    <span className={`font-bold text-lg leading-none ${s.color}`}>{s.value}</span>
                    <span className="text-xs text-gray-400 font-medium uppercase tracking-wide whitespace-nowrap">{s.label}</span>
                </div>
            ))}
        </div>
    );
}

// ─── ScoreBadge ───────────────────────────────────────────────

function ScoreBadge({ score, count }: { score: number; count: number }) {
    if (count === 0) return <span className="text-xs text-gray-300 italic">Aucune analyse</span>;
    const level = score >= 15 ? 'high' : score >= 7 ? 'medium' : 'low';
    const styles = {
        high: 'bg-red-100 text-red-700 border border-red-200',
        medium: 'bg-orange-100 text-orange-700 border border-orange-200',
        low: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    };
    return (
        <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${styles[level]}`}>Score {score}</span>
            <span className="text-xs text-gray-400">{count} irritant{count > 1 ? 's' : ''}</span>
        </div>
    );
}

// ─── ProcedureRow ─────────────────────────────────────────────

function ProcedureRow({ procedure, irritants, score, expanded, onToggle, onDetect,
    detecting, detectCount, onIrritantUpdated, onIrritantDeleted, procedures, onInstruire }: {
        procedure: Procedure; irritants: Irritant[]; score: number;
        expanded: boolean; onToggle: () => void; onDetect: () => void;
        detecting: boolean; detectCount: number;
        onIrritantUpdated: (i: Irritant) => void;
        onIrritantDeleted: (id: string) => void;
        procedures: { id: string; nom: string }[];
        onInstruire: (procedureId: string) => void;
    }) {
    const hasWorkflow = !!(procedure as any).workflow_json?.length;
    const majeurs = irritants.filter(i => i.criticite === 'Majeur').length;

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="flex items-center gap-3 px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors">
                <button type="button" onClick={onToggle}
                    className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-bold text-base transition-colors ${expanded
                        ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                        : 'bg-white text-gray-500 hover:bg-gray-200 border border-gray-200'
                        }`}>
                    {expanded ? '−' : '+'}
                </button>
                <button type="button" onClick={onToggle} className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold text-gray-900 truncate">{procedure.nom}</p>
                    {procedure.category && (
                        <p className="text-xs text-gray-400 mt-0.5">{procedure.category}</p>
                    )}
                </button>
                <div className="flex items-center gap-3 flex-shrink-0">
                    {majeurs > 0 && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                            {majeurs} majeur{majeurs > 1 ? 's' : ''}
                        </span>
                    )}
                    <ScoreBadge score={score} count={irritants.length} />
                </div>
                <button type="button" onClick={onDetect}
                    disabled={detecting || !hasWorkflow}
                    title={!hasWorkflow ? 'Workflow non généré' : "Détecter les irritants avec l'IA"}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${detecting
                        ? 'bg-violet-100 text-violet-600 cursor-wait'
                        : !hasWorkflow
                            ? 'bg-gray-50 text-gray-300 cursor-not-allowed border border-gray-200'
                            : 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm'
                        }`}>
                    {detecting
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analyse… {detectCount > 0 && `(${detectCount})`}</>
                        : <><Sparkles className="w-3.5 h-3.5" />Analyser</>}
                </button>
            </div>
            {expanded && (
                <div className="border-t border-gray-100 bg-gray-50/30">
                    {irritants.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            <AlertTriangle className="w-7 h-7 mx-auto mb-2 opacity-20" />
                            <p className="text-xs font-medium">Aucun irritant détecté</p>
                            <p className="text-xs mt-0.5 opacity-70">Lancez l'analyse IA ou créez-en un manuellement.</p>
                        </div>
                    ) : (
                        <div className="p-3 pl-14 space-y-2">
                            {irritants.map((irritant, idx) => (
                                <IrritantCard
                                    key={irritant.id}
                                    irritant={irritant}
                                    numero={idx + 1}
                                    procedures={procedures}
                                    onUpdated={onIrritantUpdated}
                                    onDeleted={onIrritantDeleted}
                                    onInstruire={onInstruire}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── IrritantsPanel ───────────────────────────────────────────

type Tab = 'overview' | 'list';

interface Props {
    procedures?: Procedure[];
    onInstruire: (procedureId: string) => void;
}

export default function IrritantsPanel({ procedures: propProcedures, onInstruire }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>('list');
    const [irritants, setIrritants] = useState<Irritant[]>([]);
    const [procedures, setProcedures] = useState<Procedure[]>(propProcedures || []);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedProcs, setExpandedProcs] = useState<Set<string>>(new Set());
    const [expandedCamps, setExpandedCamps] = useState<Set<string>>(new Set());
    const [detectingId, setDetectingId] = useState<string | null>(null);
    const [detectCount, setDetectCount] = useState(0);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [filterCrit, setFilterCrit] = useState('all');
    const [filterStatut, setFilterStatut] = useState('all');
    const [filterCat, setFilterCat] = useState('all');
    const esRef = useRef<EventSource | null>(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const [irrRes, campRes] = await Promise.all([
                orchestrationApi.listIrritants(),
                campaignsApi.list(),
            ]);
            setIrritants(irrRes.irritants as Irritant[]);
            setCampaigns(campRes.campaigns ?? []);
            if (!propProcedures || propProcedures.length === 0) {
                const procRes = await orchestrationApi.listProcedures();
                setProcedures(procRes.procedures);
            }
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    }, [propProcedures]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (propProcedures && propProcedures.length > 0) setProcedures(propProcedures);
    }, [propProcedures]);

    const handleDetect = (procedure: Procedure) => {
        if (detectingId) return;
        setDetectingId(procedure.id);
        setDetectCount(0);
        setExpandedProcs(prev => new Set([...prev, procedure.id]));
        setActiveTab('list');
        setIrritants(prev => prev.filter(
            i => !(i.procedure_id === procedure.id && i.statut === 'ASIS')
        ));
        const url = `${API_CONFIG.baseUrl}/api/irritants/detect/${procedure.id}/stream`;
        const es = new EventSource(url);
        esRef.current = es;
        es.addEventListener('irritant', (e) => {
            const data = JSON.parse((e as MessageEvent).data);
            setIrritants(prev => [data.irritant as Irritant, ...prev]);
            setDetectCount(c => c + 1);
        });
        es.addEventListener('done', () => {
            setDetectingId(null); setDetectCount(0);
            es.close(); esRef.current = null;
        });
        es.addEventListener('error', (e) => {
            try { setError(JSON.parse((e as MessageEvent).data).message); } catch { }
            setDetectingId(null); setDetectCount(0);
            es.close(); esRef.current = null;
        });
        es.onerror = () => {
            if (esRef.current) {
                setDetectingId(null); setDetectCount(0);
                es.close(); esRef.current = null;
            }
        };
    };

    const handleCreate = async (form: typeof EMPTY_FORM) => {
        setCreating(true);
        try {
            const res = await orchestrationApi.createIrritant(form);
            setIrritants(prev => [res.irritant as Irritant, ...prev]);
            setShowCreate(false);
            setActiveTab('list');
        } catch (e: any) { alert(e.message); }
        finally { setCreating(false); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Supprimer cet irritant ?')) return;
        try {
            await orchestrationApi.deleteIrritant(id);
            setIrritants(prev => prev.filter(i => i.id !== id));
        } catch (e: any) { alert(e.message); }
    };

    const handleUpdated = (updated: Irritant) =>
        setIrritants(prev => prev.map(i => i.id === updated.id ? updated : i));

    const toggleProc = (id: string) => {
        setExpandedProcs(prev => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    };

    const filtered = irritants.filter(i => {
        if (filterCrit !== 'all' && i.criticite !== filterCrit) return false;
        if (filterStatut !== 'all' && i.statut !== filterStatut) return false;
        if (filterCat !== 'all' && i.categorie !== filterCat) return false;
        return true;
    });

    const byProc = filtered.reduce((acc, irr) => {
        const pid = irr.procedure_id || '__manual__';
        if (!acc[pid]) acc[pid] = [];
        acc[pid].push(irr);
        return acc;
    }, {} as Record<string, Irritant[]>);

    const scoreOf = (list: Irritant[]) => {
        const w: Record<string, number> = { Majeur: 3, Moyen: 2, Mineur: 1 };
        return list.reduce((s, i) => s + (w[i.criticite] || 1), 0);
    };

    const sortedProcs = [...procedures].sort(
        (a, b) => scoreOf(byProc[b.id] || []) - scoreOf(byProc[a.id] || [])
    );
    const procList = procedures.map(p => ({ id: p.id, nom: p.nom }));

    // ── Regroupement par campagne ───────────────────────────────
    const procToCampaign = useMemo(() => {
        const map: Record<string, Campaign> = {};
        campaigns.forEach(c => {
            (c.procedures ?? []).forEach(cp => { map[cp.procedure_id] = c; });
        });
        return map;
    }, [campaigns]);

    type CampaignGroup = {
        campaignId: string;
        campaign: Campaign | null;
        procs: Procedure[];
        totalScore: number;
        totalIrritants: number;
    };

    const campaignGroups = useMemo((): CampaignGroup[] => {
        const map: Record<string, CampaignGroup> = {};
        sortedProcs.forEach(proc => {
            const camp = procToCampaign[proc.id] ?? null;
            const key = camp?.id ?? '__none__';
            if (!map[key]) map[key] = { campaignId: key, campaign: camp, procs: [], totalScore: 0, totalIrritants: 0 };
            const irrs = byProc[proc.id] ?? [];
            map[key].procs.push(proc);
            map[key].totalScore += scoreOf(irrs);
            map[key].totalIrritants += irrs.length;
        });
        // Handle __manual__ irritants (no procedure)
        if (byProc['__manual__']?.length) {
            const key = '__manual__';
            if (!map[key]) map[key] = { campaignId: key, campaign: null, procs: [], totalScore: 0, totalIrritants: 0 };
            map[key].totalScore += scoreOf(byProc['__manual__']);
            map[key].totalIrritants += byProc['__manual__'].length;
        }
        return Object.values(map).sort((a, b) => b.totalScore - a.totalScore);
    }, [sortedProcs, procToCampaign, byProc]);

    const toggleCamp = (id: string) => setExpandedCamps(prev => {
        const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });

    const analysees = procedures.filter(p => irritants.some(i => i.procedure_id === p.id)).length;
    const stats = {
        total: irritants.length,
        majeur: irritants.filter(i => i.criticite === 'Majeur').length,
        moyen: irritants.filter(i => i.criticite === 'Moyen').length,
        mineur: irritants.filter(i => i.criticite === 'Mineur').length,
        asis: irritants.filter(i => i.statut === 'ASIS').length,
        tobe: irritants.filter(i => i.statut === 'TOBE').length,
        resolus: irritants.filter(i => i.statut === 'Résolu').length,
    };

    if (loading) return (
        <div className="p-8 flex items-center justify-center h-64">
            <div className="text-center text-gray-400">
                <RefreshCw className="w-7 h-7 animate-spin mx-auto mb-2 text-blue-400" />
                <p className="text-sm">Chargement…</p>
            </div>
        </div>
    );

    if (error) return (
        <div className="p-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
                <button onClick={load} className="ml-auto px-3 py-1 bg-red-100 rounded text-xs">Réessayer</button>
            </div>
        </div>
    );

    return (
        <div className="p-8 space-y-5">

            {/* ── Header ── */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Irritants</h2>
                    <p className="text-sm text-gray-400 mt-0.5">
                        {procedures.length} procédure{procedures.length > 1 ? 's' : ''} · {analysees} analysée{analysees > 1 ? 's' : ''}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={load} title="Actualiser"
                        className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                        <RefreshCw className="w-4 h-4 text-gray-400" />
                    </button>
                    <button onClick={() => { setShowCreate(true); setActiveTab('list'); }}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-semibold transition-colors shadow-sm">
                        <Plus className="w-4 h-4" /> Créer manuellement
                    </button>
                </div>
            </div>

            {/* ── Ligne stats compacte ── */}
            <div className="flex items-center gap-px bg-white border border-gray-200 rounded-xl overflow-hidden divide-x divide-gray-100">
                {[
                    { label: 'Total', value: stats.total, color: 'text-gray-800' },
                    { label: 'Majeurs', value: stats.majeur, color: 'text-red-600' },
                    { label: 'Moyens', value: stats.moyen, color: 'text-orange-500' },
                    { label: 'Mineurs', value: stats.mineur, color: 'text-green-600' },
                    { label: 'ASIS', value: stats.asis, color: 'text-gray-500' },
                    { label: 'TOBE', value: stats.tobe, color: 'text-violet-600' },
                    { label: 'Résolus', value: stats.resolus, color: 'text-emerald-600' },
                ].map(s => (
                    <div key={s.label} className="flex items-center gap-2 px-4 py-3 flex-1">
                        <span className={`text-xl font-bold leading-none ${s.color}`}>{s.value}</span>
                        <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{s.label}</span>
                    </div>
                ))}
            </div>

            {/* ── Onglets ── */}
            <div className="flex gap-1 border-b border-gray-200">
                {([
                    { key: 'list' as Tab, label: 'Liste des irritants', icon: <List className="w-4 h-4" />, badge: irritants.length > 0 ? irritants.length : null },
                    { key: 'overview' as Tab, label: "Vue d'ensemble", icon: <BarChart2 className="w-4 h-4" />, badge: null },
                ]).map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === tab.key
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}>
                        {tab.icon}
                        {tab.label}
                        {tab.badge !== null && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                                }`}>
                                {tab.badge}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ══ Onglet Vue d'ensemble ══ */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Catégories cliquables */}
                    <div className="grid grid-cols-6 gap-3">
                        {CATEGORIES.map(cat => {
                            const cfg = CATEGORIE_CONFIG[cat];
                            const count = irritants.filter(i => i.categorie === cat).length;
                            return (
                                <div key={cat}
                                    title="Cliquer pour filtrer la liste"
                                    className={`rounded-xl border px-4 py-3 ${cfg.bg} cursor-pointer transition-all hover:shadow-sm active:scale-95 select-none`}
                                    onClick={() => {
                                        setFilterCat(cat);
                                        setFilterCrit('all');
                                        setFilterStatut('all');
                                        setActiveTab('list');
                                    }}>
                                    <div className={`flex items-center gap-1.5 mb-2 ${cfg.color}`}>
                                        {cfg.icon}
                                        <p className="text-[10px] font-semibold uppercase tracking-wide truncate">{cat}</p>
                                    </div>
                                    <p className={`text-3xl font-bold ${cfg.color}`}>{count}</p>
                                </div>
                            );
                        })}
                    </div>

                    {/* Matrice + graphe */}
                    <IrritantsDashboard irritants={irritants} procedures={procedures} />
                </div>
            )}

            {/* ══ Onglet Liste ══ */}
            {activeTab === 'list' && (
                <div className="space-y-4">

                    {/* Formulaire création */}
                    {showCreate && (
                        <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-sm font-bold text-gray-900">Nouvel irritant</p>
                                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <IrritantForm procedures={procList} onSave={handleCreate}
                                onCancel={() => setShowCreate(false)} saving={creating} />
                        </div>
                    )}

                    {/* Filtres */}
                    <div className="flex gap-2 flex-wrap items-center bg-white border border-gray-200 rounded-xl px-4 py-2.5">
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <Filter className="w-3.5 h-3.5" />
                            <span className="font-medium">Filtres</span>
                        </div>
                        <div className="w-px h-4 bg-gray-200 mx-1" />
                        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none">
                            <option value="all">Toutes catégories</option>
                            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                        <select value={filterCrit} onChange={e => setFilterCrit(e.target.value)}
                            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none">
                            <option value="all">Toutes criticités</option>
                            {CRITICITES.map(c => <option key={c}>{c}</option>)}
                        </select>
                        <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}
                            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none">
                            <option value="all">Tous statuts</option>
                            {STATUTS.map(s => <option key={s}>{s}</option>)}
                        </select>
                        {(filterCrit !== 'all' || filterStatut !== 'all' || filterCat !== 'all') && (
                            <button onClick={() => { setFilterCrit('all'); setFilterStatut('all'); setFilterCat('all'); }}
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                                <X className="w-3 h-3" /> Réinitialiser
                            </button>
                        )}
                        {filtered.length !== irritants.length && (
                            <span className="ml-auto text-xs text-gray-400">
                                {filtered.length} / {irritants.length} irritant{irritants.length > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>

                    {/* Liste groupée par campagne */}
                    <div className="space-y-4">
                        {campaignGroups.map(group => {
                            const isNone = group.campaignId === '__none__';
                            const isManual = group.campaignId === '__manual__';
                            const campExpanded = expandedCamps.has(group.campaignId);
                            const campLabel = isManual
                                ? 'Sans procédure liée'
                                : isNone
                                    ? 'Sans campagne'
                                    : group.campaign!.title;

                            return (
                                <div key={group.campaignId} className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                                    {/* En-tête campagne */}
                                    <div
                                        className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none transition-colors ${campExpanded ? 'bg-orange-50 border-b border-orange-100' : 'bg-gray-50 hover:bg-gray-100'}`}
                                        onClick={() => toggleCamp(group.campaignId)}
                                    >
                                        {campExpanded
                                            ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                                            : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                                        }
                                        {!isNone && !isManual
                                            ? <Megaphone className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                                            : <AlertTriangle className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                                        }
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{campLabel}</p>
                                            {!isNone && !isManual && group.campaign?.status && (
                                                <p className="text-xs text-gray-400">{group.procs.length} procédure{group.procs.length > 1 ? 's' : ''}</p>
                                            )}
                                        </div>
                                        <ScoreBadge score={group.totalScore} count={group.totalIrritants} />
                                    </div>

                                    {/* Contenu campagne */}
                                    {campExpanded && (
                                        <div className="divide-y divide-gray-100 bg-white">
                                            {/* Procédures de la campagne */}
                                            {group.procs.map(proc => (
                                                <div key={proc.id} className="px-3 py-2">
                                                    <ProcedureRow
                                                        procedure={proc}
                                                        irritants={byProc[proc.id] || []}
                                                        score={scoreOf(byProc[proc.id] || [])}
                                                        expanded={expandedProcs.has(proc.id)}
                                                        onToggle={() => toggleProc(proc.id)}
                                                        onDetect={() => handleDetect(proc)}
                                                        detecting={detectingId === proc.id}
                                                        detectCount={detectingId === proc.id ? detectCount : 0}
                                                        onIrritantUpdated={handleUpdated}
                                                        onIrritantDeleted={handleDelete}
                                                        procedures={procList}
                                                        onInstruire={onInstruire}
                                                    />
                                                </div>
                                            ))}

                                            {/* Irritants manuels (groupe __manual__) */}
                                            {isManual && (byProc['__manual__'] ?? []).length > 0 && (
                                                <div className="p-3 pl-8 space-y-2">
                                                    {byProc['__manual__'].map((irritant, idx) => (
                                                        <IrritantCard
                                                            key={irritant.id}
                                                            irritant={irritant}
                                                            numero={idx + 1}
                                                            procedures={procList}
                                                            onUpdated={handleUpdated}
                                                            onDeleted={handleDelete}
                                                            onInstruire={onInstruire}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* État vide */}
                        {campaignGroups.length === 0 && (
                            <div className="text-center py-16 text-gray-400">
                                <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium">Aucun irritant</p>
                                <p className="text-xs mt-1 opacity-70">
                                    {filterCat !== 'all' || filterCrit !== 'all' || filterStatut !== 'all'
                                        ? 'Aucun résultat pour les filtres sélectionnés.'
                                        : "Lancez l'analyse IA sur une procédure ou créez un irritant manuellement."}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
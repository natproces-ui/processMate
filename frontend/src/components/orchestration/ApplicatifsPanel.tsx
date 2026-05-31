'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    RefreshCw, AlertCircle, ExternalLink,
    Layers, ChevronRight, X, Search,
    Wrench, FileText, Share2,
} from 'lucide-react';
import { useProceduresStore } from '@/store/proceduresStore';
import { Procedure } from '@/lib/orchestrationApi';
import GrapheApplicatifs from '@/components/orchestration/GrapheApplicatifs';
import GrapheLiaisons from '@/components/orchestration/GrapheLiaisons';

// ─── Types ────────────────────────────────────────────────────

interface ToolUsage {
    outil: string;
    procedures: {
        id: string;
        nom: string;
        category: string;
        status: string;
        etapes: { id: string; nom: string; acteur: string }[];
    }[];
    totalEtapes: number;
    score: number; // nb_procedures * nb_etapes_total
}

// ─── Couleurs outils ──────────────────────────────────────────

const TOOL_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
    'Nov@': { bg: 'bg-emerald-100', text: 'text-emerald-800', dot: '#10b981' },
    'SWIFT': { bg: 'bg-blue-100', text: 'text-blue-800', dot: '#3b82f6' },
    'Swift': { bg: 'bg-blue-100', text: 'text-blue-800', dot: '#3b82f6' },
    'TI+': { bg: 'bg-violet-100', text: 'text-violet-800', dot: '#8b5cf6' },
    'TIPLUS': { bg: 'bg-violet-100', text: 'text-violet-800', dot: '#8b5cf6' },
    'Evolan': { bg: 'bg-cyan-100', text: 'text-cyan-800', dot: '#06b6d4' },
    'Email': { bg: 'bg-orange-100', text: 'text-orange-800', dot: '#f97316' },
    'Outlook': { bg: 'bg-orange-100', text: 'text-orange-800', dot: '#f97316' },
    'SAP': { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: '#eab308' },
    'DOCFLOW': { bg: 'bg-pink-100', text: 'text-pink-800', dot: '#ec4899' },
    'default': { bg: 'bg-gray-100', text: 'text-gray-700', dot: '#6b7280' },
};

function getToolColor(outil: string) {
    for (const [key, val] of Object.entries(TOOL_COLORS)) {
        if (key !== 'default' && outil.toLowerCase().includes(key.toLowerCase())) return val;
    }
    return TOOL_COLORS.default;
}

// ─── Extraction des outils depuis workflow_json ───────────────

function extractToolUsages(procedures: Procedure[]): ToolUsage[] {
    const toolMap = new Map<string, ToolUsage>();

    for (const proc of procedures) {
        const workflow: any[] = (proc as any).workflow_json || [];
        if (!workflow.length) continue;

        for (const step of workflow) {
            const outil = (step.outil || '').trim();
            if (!outil) continue;

            if (!toolMap.has(outil)) {
                toolMap.set(outil, { outil, procedures: [], totalEtapes: 0, score: 0 });
            }
            const tu = toolMap.get(outil)!;

            let procEntry = tu.procedures.find(p => p.id === proc.id);
            if (!procEntry) {
                procEntry = { id: proc.id, nom: proc.nom, category: proc.category, status: proc.status, etapes: [] };
                tu.procedures.push(procEntry);
            }
            procEntry.etapes.push({ id: step.id, nom: step.étape || step.etape || '', acteur: step.acteur || '' });
            tu.totalEtapes++;
        }
    }

    // Calculer les scores
    for (const tu of toolMap.values()) {
        tu.score = tu.procedures.length * tu.totalEtapes;
    }

    return Array.from(toolMap.values()).sort((a, b) => b.score - a.score);
}

// ─── Vue 1 : Matrice outil × procédure ───────────────────────

function MatriceView({ toolUsages, procedures, onSelectTool }: {
    toolUsages: ToolUsage[];
    procedures: Procedure[];
    onSelectTool: (outil: string) => void;
}) {
    const [search, setSearch] = useState('');
    const filteredTools = toolUsages.filter(tu =>
        tu.outil.toLowerCase().includes(search.toLowerCase())
    );
    const procsWithWorkflow = procedures.filter(p => ((p as any).workflow_json || []).length > 0);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Filtrer les outils…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                </div>
                <p className="text-sm text-gray-400">
                    {filteredTools.length} outil{filteredTools.length > 1 ? 's' : ''} — {procsWithWorkflow.length} procédure{procsWithWorkflow.length > 1 ? 's' : ''}
                </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-auto shadow-sm">
                <table className="text-xs w-full">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-3 font-bold text-gray-600 uppercase tracking-wide min-w-[200px]">
                                Outil
                            </th>
                            <th className="px-3 py-3 text-center font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                                Score
                            </th>
                            <th className="px-3 py-3 text-center font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                                Procédures
                            </th>
                            <th className="px-3 py-3 text-center font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                                Étapes
                            </th>
                            {procsWithWorkflow.slice(0, 12).map(proc => (
                                <th key={proc.id} className="px-2 py-3 font-medium text-gray-500 text-center max-w-[100px]">
                                    <div className="truncate max-w-[90px] mx-auto" title={proc.nom}>
                                        {proc.nom.length > 18 ? proc.nom.slice(0, 18) + '…' : proc.nom}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredTools.map(tu => {
                            const color = getToolColor(tu.outil);
                            const maxScore = toolUsages[0]?.score || 1;
                            const pct = Math.round((tu.score / maxScore) * 100);
                            return (
                                <tr key={tu.outil}
                                    className="hover:bg-blue-50/30 cursor-pointer transition-colors"
                                    onClick={() => onSelectTool(tu.outil)}
                                >
                                    <td className="sticky left-0 z-10 bg-white px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${color.bg} ${color.text}`}>
                                                {tu.outil}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                        <div className="flex items-center gap-1.5 justify-center">
                                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className="font-bold text-gray-700">{tu.score}</span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                        <span className="font-semibold text-blue-700">{tu.procedures.length}</span>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                        <span className="font-semibold text-gray-700">{tu.totalEtapes}</span>
                                    </td>
                                    {procsWithWorkflow.slice(0, 12).map(proc => {
                                        const found = tu.procedures.find(p => p.id === proc.id);
                                        return (
                                            <td key={proc.id} className="px-2 py-3 text-center">
                                                {found ? (
                                                    <div className="flex items-center justify-center">
                                                        <div
                                                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                                            style={{ backgroundColor: color.dot }}
                                                            title={`${found.etapes.length} étape${found.etapes.length > 1 ? 's' : ''}`}
                                                        >
                                                            {found.etapes.length}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-200">·</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {filteredTools.length === 0 && (
                    <div className="text-center py-12 text-gray-400 text-sm">
                        Aucun outil trouvé
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Vue 4 : Détail par outil ─────────────────────────────────

function DetailView({ toolUsages, selectedOutil, onSelectTool, onClearTool, onOpenStudio }: {
    toolUsages: ToolUsage[];
    selectedOutil: string | null;
    onSelectTool: (outil: string) => void;
    onClearTool: () => void;
    onOpenStudio: (id: string) => void;
}) {
    const [expandedProc, setExpandedProc] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const selected = selectedOutil ? toolUsages.find(tu => tu.outil === selectedOutil) : null;
    const filteredTools = toolUsages.filter(tu =>
        tu.outil.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex gap-5 h-full">
            {/* Liste outils */}
            <div className="w-72 flex-shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-gray-100">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Rechercher…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                    </div>
                </div>
                <div className="overflow-y-auto flex-1">
                    {filteredTools.map(tu => {
                        const color = getToolColor(tu.outil);
                        const isSelected = selectedOutil === tu.outil;
                        const maxScore = toolUsages[0]?.score || 1;
                        const pct = Math.round((tu.score / maxScore) * 100);
                        return (
                            <button
                                key={tu.outil}
                                type="button"
                                onClick={() => { onSelectTool(tu.outil); setExpandedProc(null); }}
                                className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'}`}
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${color.bg} ${color.text}`}>
                                        {tu.outil}
                                    </span>
                                    <span className="text-xs text-gray-400 font-bold">#{toolUsages.indexOf(tu) + 1}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-[10px] text-gray-400">
                                        {tu.procedures.length}p · {tu.totalEtapes}e
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Détail */}
            <div className="flex-1 overflow-y-auto">
                {!selected ? (
                    <div className="h-64 flex items-center justify-center text-gray-400">
                        <div className="text-center">
                            <Wrench className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p className="text-sm">Sélectionnez un outil pour voir son détail</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Header outil */}
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className={`text-sm font-bold px-3 py-1 rounded-lg ${getToolColor(selected.outil).bg} ${getToolColor(selected.outil).text}`}>
                                            {selected.outil}
                                        </span>
                                        <span className="text-xs text-gray-400">Rang #{toolUsages.indexOf(selected) + 1} par criticité</span>
                                    </div>
                                    <div className="flex items-center gap-6 mt-3">
                                        {[
                                            { label: 'Score criticité', value: selected.score, color: 'text-blue-700' },
                                            { label: 'Procédures', value: selected.procedures.length, color: 'text-indigo-700' },
                                            { label: 'Étapes totales', value: selected.totalEtapes, color: 'text-gray-700' },
                                        ].map(stat => (
                                            <div key={stat.label} className="text-center">
                                                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                                                <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <button type="button" onClick={onClearTool}
                                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                                    <X className="w-4 h-4 text-gray-400" />
                                </button>
                            </div>
                        </div>

                        {/* Procédures concernées */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-bold text-gray-700 px-1">
                                Procédures concernées ({selected.procedures.length})
                            </h4>
                            {selected.procedures.map(proc => (
                                <div key={proc.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div
                                        className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
                                        onClick={() => setExpandedProc(expandedProc === proc.id ? null : proc.id)}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{proc.nom}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">{proc.category} · {proc.status}</p>
                                        </div>
                                        <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                                            {proc.etapes.length} étape{proc.etapes.length > 1 ? 's' : ''}
                                        </span>
                                        <button
                                            type="button"
                                            title="Ouvrir dans le Studio"
                                            onClick={e => { e.stopPropagation(); onOpenStudio(proc.id); }}
                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors flex-shrink-0"
                                        >
                                            <ExternalLink className="w-3 h-3" />Studio
                                        </button>
                                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expandedProc === proc.id ? 'rotate-90' : ''}`} />
                                    </div>

                                    {expandedProc === proc.id && (
                                        <div className="border-t border-gray-100 bg-gray-50/50">
                                            {proc.etapes.map((etape, idx) => (
                                                <div key={etape.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-100 last:border-0">
                                                    <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                                        {idx + 1}
                                                    </span>
                                                    <p className="flex-1 text-sm text-gray-800">{etape.nom}</p>
                                                    {etape.acteur && (
                                                        <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full flex-shrink-0">
                                                            {etape.acteur}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── ApplicatifsPanel ─────────────────────────────────────────

type View = 'matrice' | 'liaisons' | 'graphe' | 'detail';

export default function ApplicatifsPanel() {
    const router = useRouter();
    const { procedures, loading, error, fetchProcedures } = useProceduresStore();
    const [view, setView] = useState<View>('matrice');
    const [selectedOutil, setSelectedOutil] = useState<string | null>(null);

    useEffect(() => { fetchProcedures(); }, []);

    const toolUsages = useMemo(() => extractToolUsages(procedures), [procedures]);

    const handleSelectTool = (outil: string) => {
        setSelectedOutil(outil);
        setView('detail');
    };

    const handleOpenStudio = (id: string) => {
        router.push(`/stt?workflow_id=${id}`);
    };

    const VIEWS: { id: View; label: string; icon: React.ReactNode }[] = [
        { id: 'matrice',  label: 'Matrice',   icon: <Layers className="w-4 h-4" /> },
        { id: 'liaisons', label: 'Liaisons',  icon: <Share2 className="w-4 h-4" /> },
        { id: 'graphe',   label: 'Arbre',     icon: <FileText className="w-4 h-4" /> },
        { id: 'detail',   label: 'Détail',    icon: <Wrench className="w-4 h-4" /> },
    ];

    if (loading && procedures.length === 0) return (
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
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                <button onClick={() => fetchProcedures(true)} className="ml-auto px-3 py-1 bg-red-100 rounded text-xs">Réessayer</button>
            </div>
        </div>
    );

    const totalEtapes = toolUsages.reduce((s, t) => s + t.totalEtapes, 0);
    const procsWithWorkflow = procedures.filter(p => ((p as any).workflow_json || []).length > 0).length;

    return (
        <div className="p-8 space-y-4 h-full flex flex-col">

            {/* ── Header compact ── */}
            <div className="flex items-start justify-between gap-4 flex-shrink-0">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Cartographie Applicative</h2>
                    {/* Stats inline sous le titre */}
                    {toolUsages.length > 0 ? (
                        <div className="flex items-center flex-wrap gap-2 mt-1.5">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-50 border border-blue-100 rounded-full text-xs font-semibold text-blue-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                {toolUsages.length} outils
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-red-50 border border-red-100 rounded-full text-xs font-semibold text-red-600">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                                {toolUsages[0]?.outil} — critique
                            </span>
                            <span className="text-xs text-gray-400">
                                {totalEtapes.toLocaleString('fr-FR')} étapes
                                · {procsWithWorkflow} procédure{procsWithWorkflow > 1 ? 's' : ''}
                                · score max {toolUsages[0]?.score.toLocaleString('fr-FR')}
                            </span>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-400 mt-0.5">Aucun outil détecté dans les workflows</p>
                    )}
                </div>

                {/* Tabs + refresh sur la même ligne */}
                <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                        {VIEWS.map(v => (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => setView(v.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                    view === v.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {v.icon}{v.label}
                            </button>
                        ))}
                    </div>
                    <button type="button" title="Actualiser" onClick={() => fetchProcedures(true)}
                        className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors bg-white">
                        <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Contenu */}
            {toolUsages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                    <div className="text-center">
                        <Wrench className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p className="font-medium">Aucun outil détecté</p>
                        <p className="text-sm mt-1">Les outils sont extraits automatiquement depuis les workflows formalisés.</p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-auto min-h-0">
                    {view === 'matrice' && (
                        <MatriceView
                            toolUsages={toolUsages}
                            procedures={procedures}
                            onSelectTool={handleSelectTool}
                        />
                    )}
                    {view === 'liaisons' && (
                        <GrapheLiaisons procedures={procedures} />
                    )}
                    {view === 'graphe' && (
                        <GrapheApplicatifs procedures={procedures} onOpenProcedure={handleOpenStudio} />
                    )}
                    {view === 'detail' && (
                        <DetailView
                            toolUsages={toolUsages}
                            selectedOutil={selectedOutil}
                            onSelectTool={setSelectedOutil}
                            onClearTool={() => setSelectedOutil(null)}
                            onOpenStudio={handleOpenStudio}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
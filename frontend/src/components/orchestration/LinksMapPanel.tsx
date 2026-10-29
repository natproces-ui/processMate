'use client';

// components/orchestration/LinksMapPanel.tsx
//
// Carte des liens (Analyse) : on choisit une procédure, on la voit au centre avec les
// procédures qu'elle appelle, déclenche ou nécessite, et celles qui la sollicitent, sur 1, 2
// niveaux ou toute la chaîne. Les procédures appelées ou déclenchées sont à droite, celles
// qui y mènent à gauche. Liens lus en base (GET /links), voir lib/processLinks.ts.

import { useEffect, useMemo, useState } from 'react';
// Même import que clinic/EditorView.tsx (les types du paquet ne se résolvent pas sous ce
// tsconfig, d'où les signatures explicites plus bas)
import ReactFlow, { Background, Controls, MiniMap, MarkerType, Handle, Position, type Edge, type Node, type NodeProps } from 'reactflow';
import 'reactflow/dist/style.css';
import { Search, Loader2, Play, Network, ChevronRight, X } from 'lucide-react';
import { orchestrationApi, type Procedure } from '@/lib/orchestrationApi';
import { LINK_LABELS, type LinkType } from '@/lib/processLinks';
import ScreenFlow from '@/components/orchestration/ScreenFlow';

interface LinkEdge { source: string; target: string; type: LinkType; step_id: string | null; step_name: string | null }

const EDGE_COLORS: Record<LinkType, string> = { fait_appel_a: '#7c3aed', declenche: '#d97706', necessite: '#0284c7' };
const COL_GAP = 290, ROW_GAP = 110;

type Depth = 1 | 2 | 99;

interface NodeData { procedure: Procedure; selected: boolean; links: number }

function ProcedureNode({ data }: NodeProps<NodeData>) {
    return (
        <div className={`w-[230px] rounded-xl border bg-white px-3.5 py-3 shadow-sm transition-colors ${data.selected
            ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300'}`}>
            <Handle type="target" position={Position.Left} className="!bg-slate-300 !border-0 !w-2 !h-2" />
            <p className="text-[11px] font-mono text-slate-400">{data.procedure.ref || '—'}</p>
            <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{data.procedure.nom}</p>
            <p className="mt-1 text-[11px] text-slate-500 truncate">{data.procedure.category || 'Sans catégorie'} · {data.links} lien{data.links > 1 ? 's' : ''}</p>
            <Handle type="source" position={Position.Right} className="!bg-slate-300 !border-0 !w-2 !h-2" />
        </div>
    );
}

const nodeTypes = { procedure: ProcedureNode };

export default function LinksMapPanel() {
    const [procedures, setProcedures] = useState<Procedure[] | null>(null);
    const [edges, setEdges] = useState<LinkEdge[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<string | null>(null); // session_id
    const [focus, setFocus] = useState<string | null>(null);       // procédure dont la fiche est ouverte
    const [depth, setDepth] = useState<Depth>(2);
    const [flowOf, setFlowOf] = useState<Procedure | null>(null);
    const [openingFlow, setOpeningFlow] = useState(false);

    useEffect(() => {
        Promise.all([orchestrationApi.listProcedures(), orchestrationApi.getAllLinks()])
            .then(([p, l]) => { setProcedures(p.procedures); setEdges(l.edges); })
            .catch(e => setError(e.message || 'Chargement impossible'));
    }, []);

    const bySession = useMemo(() => new Map((procedures ?? []).map(p => [p.session_id, p])), [procedures]);
    const linkCount = useMemo(() => {
        const m = new Map<string, number>();
        edges.forEach(e => { m.set(e.source, (m.get(e.source) || 0) + 1); m.set(e.target, (m.get(e.target) || 0) + 1); });
        return m;
    }, [edges]);

    // Liste à gauche : procédures groupées par catégorie, celles qui ont des liens d'abord
    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = (procedures ?? []).filter(p => !q || `${p.ref} ${p.nom}`.toLowerCase().includes(q));
        const map = new Map<string, Procedure[]>();
        list.forEach(p => { const k = p.category || 'Sans catégorie'; map.set(k, [...(map.get(k) || []), p]); });
        map.forEach(arr => arr.sort((a, b) => (linkCount.get(b.session_id) || 0) - (linkCount.get(a.session_id) || 0) || (a.ref || a.nom).localeCompare(b.ref || b.nom)));
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [procedures, query, linkCount]);

    useEffect(() => {
        if (selected || !procedures?.length) return;
        const first = [...linkCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (first && bySession.has(first)) { setSelected(first); setFocus(first); }
    }, [procedures, linkCount, bySession, selected]);

    // Graphe : colonnes = distance orientée depuis la procédure choisie
    const graph = useMemo(() => {
        if (!selected) return { nodes: [] as Node<NodeData>[], edges: [] as Edge[] };
        const column = new Map<string, number>([[selected, 0]]);
        const walk = (dir: 1 | -1) => {
            let frontier = [selected];
            for (let d = 1; d <= depth && frontier.length; d++) {
                const next: string[] = [];
                frontier.forEach(sid => edges.forEach(e => {
                    const [from, to] = dir === 1 ? [e.source, e.target] : [e.target, e.source];
                    if (from === sid && !column.has(to) && bySession.has(to)) { column.set(to, d * dir); next.push(to); }
                }));
                frontier = next;
            }
        };
        walk(1); walk(-1);
        const cols = new Map<number, string[]>();
        column.forEach((c, sid) => cols.set(c, [...(cols.get(c) || []), sid]));
        const nodes: Node<NodeData>[] = [];
        cols.forEach((sids, c) => sids.forEach((sid, i) => nodes.push({
            id: sid, type: 'procedure',
            position: { x: c * COL_GAP, y: (i - (sids.length - 1) / 2) * ROW_GAP },
            data: { procedure: bySession.get(sid)!, selected: sid === focus, links: linkCount.get(sid) || 0 },
        })));
        const rfEdges: Edge[] = edges
            .filter(e => column.has(e.source) && column.has(e.target))
            .map((e, i) => ({
                id: `${e.source}-${e.target}-${e.type}-${i}`, source: e.source, target: e.target, type: 'smoothstep',
                label: LINK_LABELS[e.type].label,
                labelStyle: { fill: EDGE_COLORS[e.type], fontSize: 11, fontWeight: 600 },
                labelBgStyle: { fill: '#ffffff' }, labelBgPadding: [6, 3] as [number, number], labelBgBorderRadius: 4,
                style: { stroke: EDGE_COLORS[e.type], strokeWidth: 1.6, strokeDasharray: e.type === 'necessite' ? '5 4' : undefined },
                markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS[e.type], width: 16, height: 16 },
            }));
        return { nodes, edges: rfEdges };
    }, [selected, focus, depth, edges, bySession, linkCount]);

    const focused = focus ? bySession.get(focus) : null;
    const focusOut = edges.filter(e => e.source === focus);
    const focusIn = edges.filter(e => e.target === focus);

    const openFlow = async (p: Procedure) => {
        setOpeningFlow(true);
        try { setFlowOf((await orchestrationApi.getProcedure(p.id)).procedure); }
        catch (e: any) { setError(e.message || 'Ouverture impossible'); }
        finally { setOpeningFlow(false); }
    };

    if (error && !procedures) return <div className="p-8 text-sm text-rose-600">{error}</div>;
    if (!procedures) return <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>;

    return (
        <div className="h-full flex bg-slate-50 min-w-0">

            {/* Procédures */}
            <aside className="w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col min-h-0">
                <div className="p-3 border-b border-slate-100 space-y-2">
                    <div className="flex items-center gap-2 px-2.5 h-9 rounded-lg border border-slate-200 focus-within:border-blue-400">
                        <Search className="w-4 h-4 text-slate-400" />
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher une procédure"
                            className="flex-1 min-w-0 text-sm outline-none bg-transparent" />
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                        <span className="text-slate-500 mr-1">Niveaux de liens</span>
                        {([1, 2, 99] as Depth[]).map(d => (
                            <button key={d} type="button" onClick={() => setDepth(d)} title={d === 99 ? 'Toute la chaîne' : `${d} niveau${d > 1 ? 'x' : ''} de liens`}
                                className={`px-2 py-1 rounded-md font-medium ${depth === d ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                                {d === 99 ? 'Tout' : d}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto py-2">
                    {groups.map(([cat, list]) => (
                        <div key={cat} className="mb-2">
                            <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{cat}</p>
                            {list.map(p => {
                                const n = linkCount.get(p.session_id) || 0;
                                const on = selected === p.session_id;
                                return (
                                    <button key={p.id} type="button" onClick={() => { setSelected(p.session_id); setFocus(p.session_id); }}
                                        className={`w-full text-left px-4 py-2 flex items-start gap-2 border-l-2 ${on ? 'bg-blue-50 border-blue-600' : 'border-transparent hover:bg-slate-50'}`}>
                                        <span className="min-w-0 flex-1">
                                            {p.ref && <span className="block text-[11px] font-mono text-slate-400">{p.ref}</span>}
                                            <span className={`block text-sm leading-snug ${on ? 'text-blue-800 font-medium' : 'text-slate-700'}`}>{p.nom}</span>
                                        </span>
                                        {n > 0 && <span className="mt-0.5 text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 flex-shrink-0">{n}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </aside>

            {/* Carte */}
            <main className="flex-1 min-w-0" style={{ position: 'relative' }}>
                {graph.nodes.length <= 1 && selected && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-500 shadow-sm">
                        Aucune procédure liée à celle-ci pour l&apos;instant.
                    </div>
                )}
                <ReactFlow
                    key={`${selected}-${depth}`}
                    nodes={graph.nodes}
                    edges={graph.edges}
                    nodeTypes={nodeTypes}
                    onNodeClick={(_: unknown, n: { id: string }) => setFocus(n.id)}
                    onNodeDoubleClick={(_: unknown, n: { id: string }) => { setSelected(n.id); setFocus(n.id); }}
                    nodesConnectable={false}
                    fitView
                    fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
                    proOptions={{ hideAttribution: true }}
                >
                    <Background color="#e2e8f0" gap={20} />
                    <Controls showInteractive={false} />
                    <MiniMap pannable zoomable nodeColor={(n: { data: NodeData }) => n.data.selected ? '#3b82f6' : '#cbd5e1'} />
                </ReactFlow>
                <div className="absolute left-4 bottom-4 z-10 flex items-center gap-3 px-3 py-2 rounded-lg bg-white/95 border border-slate-200 text-[11px] text-slate-600">
                    {(Object.keys(EDGE_COLORS) as LinkType[]).map(t => (
                        <span key={t} className="flex items-center gap-1.5">
                            <span className="w-4 h-0.5" style={{ background: EDGE_COLORS[t] }} />{LINK_LABELS[t].label}
                        </span>
                    ))}
                    <span className="text-slate-400">· double-clic : centrer sur la procédure</span>
                </div>
            </main>

            {/* Fiche */}
            {focused && (
                <aside className="w-80 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col min-h-0">
                    <div className="p-4 border-b border-slate-100">
                        <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-mono text-slate-400">{focused.ref}</p>
                                <p className="text-base font-bold text-slate-800 leading-snug">{focused.nom}</p>
                                <p className="mt-0.5 text-xs text-slate-500">{focused.category}</p>
                            </div>
                            <button type="button" onClick={() => setFocus(null)} className="p-1 rounded text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="mt-3 flex gap-2">
                            <button type="button" onClick={() => openFlow(focused)} disabled={openingFlow}
                                className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                                {openingFlow ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" fill="currentColor" />}Défiler les écrans
                            </button>
                            {selected !== focused.session_id && (
                                <button type="button" onClick={() => setSelected(focused.session_id)}
                                    className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50">
                                    <Network className="w-3.5 h-3.5" />Centrer
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-5">
                        <LinkList title="Cette procédure" items={focusOut.map(e => ({ e, other: e.target, label: LINK_LABELS[e.type].label }))}
                            bySession={bySession} onPick={sid => setFocus(sid)} empty="Elle n'appelle, ne déclenche ni ne nécessite aucune autre procédure." />
                        <LinkList title="Vers cette procédure" items={focusIn.map(e => ({ e, other: e.source, label: LINK_LABELS[e.type].inverse }))}
                            bySession={bySession} onPick={sid => setFocus(sid)} empty="Aucune procédure ne mène à celle-ci." />
                    </div>
                </aside>
            )}

            {flowOf && <ScreenFlow procedure={flowOf} onClose={() => setFlowOf(null)} />}
        </div>
    );
}

function LinkList({ title, items, bySession, onPick, empty }: {
    title: string;
    items: { e: LinkEdge; other: string; label: string }[];
    bySession: Map<string, Procedure>;
    onPick: (sid: string) => void;
    empty: string;
}) {
    return (
        <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">{title}</p>
            {items.length === 0 ? <p className="text-xs text-slate-400">{empty}</p> : (
                <div className="space-y-1.5">
                    {items.map(({ e, other, label }, i) => {
                        const p = bySession.get(other);
                        return (
                            <button key={i} type="button" onClick={() => p && onPick(other)}
                                className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:border-slate-300 hover:bg-slate-50">
                                <span className="text-[11px] font-semibold" style={{ color: EDGE_COLORS[e.type] }}>{label}</span>
                                <span className="flex items-center gap-1 text-sm text-slate-800 leading-snug">
                                    <span className="flex-1">{p ? p.nom : 'Procédure supprimée'}</span><ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                                </span>
                                {e.step_name && <span className="block mt-0.5 text-xs text-slate-500">à l&apos;étape « {e.step_name} »</span>}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

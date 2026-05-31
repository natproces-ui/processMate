'use client';

import { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { Irritant, CATEGORIES, CATEGORIE_CONFIG, CRITICITE_STYLE } from './IrritantCard';

// ─── Types ────────────────────────────────────────────────────

interface Props {
    irritants: Irritant[];
    procedures: { id: string; nom: string }[];
}

// ─── Couleurs catégories pour D3 ─────────────────────────────

const CAT_COLORS: Record<string, string> = {
    "Rupture d'information": '#f43f5e',
    'Automatisation': '#f59e0b',
    'Délai / Attente': '#f97316',
    'Outil / Système': '#3b82f6',
    'Organisation': '#14b8a6',
    'Autre': '#9ca3af',
};

const CRIT_DOT: Record<string, string> = {
    Majeur: 'bg-red-500',
    Moyen: 'bg-orange-400',
    Mineur: 'bg-green-500',
};

// ─── Matrice ──────────────────────────────────────────────────

function MatriceView({ irritants, procedures }: Props) {
    // Procédures qui ont au moins 1 irritant
    const activeProcs = procedures.filter(p =>
        irritants.some(i => i.procedure_id === p.id)
    );

    const cell = (cat: string, procId: string) =>
        irritants.filter(i => i.categorie === cat && i.procedure_id === procId);

    const rowTotal = (cat: string) =>
        irritants.filter(i => i.categorie === cat).length;

    const colTotal = (procId: string) =>
        irritants.filter(i => i.procedure_id === procId).length;

    const dominantCrit = (list: Irritant[]) => {
        if (list.some(i => i.criticite === 'Majeur')) return 'Majeur';
        if (list.some(i => i.criticite === 'Moyen')) return 'Moyen';
        if (list.length > 0) return 'Mineur';
        return null;
    };

    if (activeProcs.length === 0) {
        return (
            <div className="text-center py-10 text-gray-400 text-sm">
                Aucune procédure analysée pour l'instant.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
                <thead>
                    <tr>
                        <th className="text-left px-3 py-2.5 font-semibold text-gray-500 bg-gray-50 border border-gray-200 w-44 sticky left-0 z-10">
                            Catégorie
                        </th>
                        {activeProcs.map(p => (
                            <th key={p.id}
                                className="px-2 py-2.5 font-semibold text-gray-600 bg-gray-50 border border-gray-200 text-center max-w-[120px]">
                                <span className="block truncate max-w-[110px] mx-auto" title={p.nom}>
                                    {p.nom}
                                </span>
                            </th>
                        ))}
                        <th className="px-3 py-2.5 font-bold text-gray-700 bg-gray-100 border border-gray-200 text-center">
                            Total
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {CATEGORIES.map(cat => {
                        const cfg = CATEGORIE_CONFIG[cat];
                        const total = rowTotal(cat);
                        return (
                            <tr key={cat} className="hover:bg-gray-50/50 transition-colors">
                                {/* Catégorie label */}
                                <td className={`px-3 py-2.5 border border-gray-200 sticky left-0 z-10 bg-white`}>
                                    <div className="flex items-center gap-2">
                                        <span className={cfg.color}>{cfg.icon}</span>
                                        <span className="font-medium text-gray-700 truncate">{cat}</span>
                                    </div>
                                </td>
                                {/* Cellules procédures */}
                                {activeProcs.map(p => {
                                    const list = cell(cat, p.id);
                                    const crit = dominantCrit(list);
                                    return (
                                        <td key={p.id}
                                            className="px-2 py-2 border border-gray-200 text-center align-middle">
                                            {list.length > 0 ? (
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className={`
                                                        inline-flex items-center justify-center
                                                        w-7 h-7 rounded-lg font-bold text-sm
                                                        ${crit === 'Majeur' ? 'bg-red-100 text-red-700' :
                                                            crit === 'Moyen' ? 'bg-orange-100 text-orange-700' :
                                                                'bg-green-100 text-green-700'}
                                                    `}>
                                                        {list.length}
                                                    </span>
                                                    <div className="flex gap-0.5">
                                                        {(['Majeur', 'Moyen', 'Mineur'] as const).map(c => {
                                                            const n = list.filter(i => i.criticite === c).length;
                                                            return n > 0 ? (
                                                                <span key={c}
                                                                    title={`${n} ${c}`}
                                                                    className={`w-1.5 h-1.5 rounded-full ${CRIT_DOT[c]}`}
                                                                />
                                                            ) : null;
                                                        })}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-gray-200">—</span>
                                            )}
                                        </td>
                                    );
                                })}
                                {/* Total ligne */}
                                <td className="px-3 py-2 border border-gray-200 text-center bg-gray-50">
                                    {total > 0 ? (
                                        <span className="font-bold text-gray-700">{total}</span>
                                    ) : (
                                        <span className="text-gray-300">0</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                    {/* Ligne totaux colonnes */}
                    <tr className="bg-gray-50">
                        <td className="px-3 py-2.5 border border-gray-200 font-bold text-gray-700 sticky left-0 bg-gray-100 z-10">
                            Total
                        </td>
                        {activeProcs.map(p => (
                            <td key={p.id} className="px-2 py-2 border border-gray-200 text-center font-bold text-gray-700">
                                {colTotal(p.id) || <span className="text-gray-300 font-normal">0</span>}
                            </td>
                        ))}
                        <td className="px-3 py-2 border border-gray-200 text-center font-bold text-gray-900 bg-gray-100">
                            {irritants.length}
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* Légende criticité */}
            <div className="flex items-center gap-4 mt-3 px-1">
                <span className="text-xs text-gray-400">Criticité dominante :</span>
                {(['Majeur', 'Moyen', 'Mineur'] as const).map(c => (
                    <div key={c} className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${CRIT_DOT[c]}`} />
                        <span className="text-xs text-gray-500">{c}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Graphe Force-Directed ────────────────────────────────────

function ForceGraph({ irritants, procedures }: Props) {
    const svgRef = useRef<SVGSVGElement>(null);

    // Construire nœuds + liens
    const { nodes, links } = useMemo(() => {
        const activeProcs = procedures.filter(p =>
            irritants.some(i => i.procedure_id === p.id)
        );

        const nodes: any[] = [
            // Nœuds catégories
            ...CATEGORIES.map(cat => ({
                id: `cat_${cat}`,
                label: cat,
                type: 'category',
                color: CAT_COLORS[cat] || '#9ca3af',
                count: irritants.filter(i => i.categorie === cat).length,
            })).filter(n => n.count > 0),
            // Nœuds procédures
            ...activeProcs.map(p => ({
                id: `proc_${p.id}`,
                label: p.nom,
                type: 'procedure',
                color: '#6366f1',
                count: irritants.filter(i => i.procedure_id === p.id).length,
            })),
        ];

        const links: any[] = [];
        CATEGORIES.forEach(cat => {
            activeProcs.forEach(p => {
                const count = irritants.filter(
                    i => i.categorie === cat && i.procedure_id === p.id
                ).length;
                if (count > 0) {
                    links.push({
                        source: `cat_${cat}`,
                        target: `proc_${p.id}`,
                        value: count,
                        color: CAT_COLORS[cat] || '#9ca3af',
                    });
                }
            });
        });

        return { nodes, links };
    }, [irritants, procedures]);

    useEffect(() => {
        if (!svgRef.current || nodes.length === 0) return;

        const svg = d3.select(svgRef.current);
        const W = svgRef.current.clientWidth || 700;
        const H = svgRef.current.clientHeight || 480;
        const maxVal = d3.max(links, (d: any) => d.value) || 1;

        svg.selectAll('*').remove();

        // Zoom + pan
        const g = svg.append('g');
        svg.call(
            d3.zoom<SVGSVGElement, unknown>()
                .scaleExtent([0.3, 3])
                .on('zoom', (event) => g.attr('transform', event.transform))
        );

        // Simulation
        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links)
                .id((d: any) => d.id)
                .distance((d: any) => 120 + d.value * 8)
                .strength(0.6)
            )
            .force('charge', d3.forceManyBody().strength(-320))
            .force('center', d3.forceCenter(W / 2, H / 2))
            .force('collision', d3.forceCollide().radius((d: any) =>
                d.type === 'category' ? 42 : 36
            ));

        // Liens
        const link = g.append('g').selectAll('line')
            .data(links)
            .join('line')
            .attr('stroke', (d: any) => d.color)
            .attr('stroke-opacity', 0.45)
            .attr('stroke-width', (d: any) => 1.5 + (d.value / maxVal) * 5);

        // Groupes nœuds
        const node = g.append('g').selectAll('g')
            .data(nodes)
            .join('g')
            .attr('cursor', 'grab')
            .call(
                d3.drag<SVGGElement, any>()
                    .on('start', (event, d) => {
                        if (!event.active) simulation.alphaTarget(0.3).restart();
                        d.fx = d.x; d.fy = d.y;
                    })
                    .on('drag', (event, d) => {
                        d.fx = event.x; d.fy = event.y;
                    })
                    .on('end', (event, d) => {
                        if (!event.active) simulation.alphaTarget(0);
                        d.fx = null; d.fy = null;
                    })
            );

        // Cercles
        node.append('circle')
            .attr('r', (d: any) => d.type === 'category' ? 30 + d.count * 1.5 : 22 + d.count * 1.2)
            .attr('fill', (d: any) => d.color)
            .attr('fill-opacity', (d: any) => d.type === 'category' ? 0.15 : 0.1)
            .attr('stroke', (d: any) => d.color)
            .attr('stroke-width', (d: any) => d.type === 'category' ? 2.5 : 1.5);

        // Badge count
        node.append('text')
            .text((d: any) => d.count)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('dy', '-0.3em')
            .attr('font-size', (d: any) => d.type === 'category' ? '14px' : '11px')
            .attr('font-weight', '700')
            .attr('fill', (d: any) => d.color);

        // Label
        node.append('text')
            .text((d: any) => {
                const label = d.label as string;
                return label.length > 16 ? label.slice(0, 15) + '…' : label;
            })
            .attr('text-anchor', 'middle')
            .attr('dy', (d: any) => d.type === 'category' ? '1.1em' : '1em')
            .attr('font-size', (d: any) => d.type === 'category' ? '10px' : '9px')
            .attr('font-weight', (d: any) => d.type === 'category' ? '600' : '400')
            .attr('fill', '#374151');

        // Tooltip title
        node.append('title').text((d: any) => `${d.label}\n${d.count} irritant${d.count > 1 ? 's' : ''}`);

        // Tick
        simulation.on('tick', () => {
            link
                .attr('x1', (d: any) => d.source.x)
                .attr('y1', (d: any) => d.source.y)
                .attr('x2', (d: any) => d.target.x)
                .attr('y2', (d: any) => d.target.y);

            node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
        });

        return () => { simulation.stop(); };
    }, [nodes, links]);

    if (nodes.length === 0) {
        return (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                Aucune donnée à afficher.
            </div>
        );
    }

    return (
        <div className="relative">
            <svg
                ref={svgRef}
                className="w-full rounded-xl border border-gray-100 bg-gray-50/40"
                style={{ height: 480 }}
            />
            {/* Légende */}
            <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-200 flex flex-col gap-1.5 text-xs">
                <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-rose-500 bg-rose-500/10 inline-block" />
                    <span className="text-gray-600 font-medium">Catégorie</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-indigo-500 bg-indigo-500/10 inline-block" />
                    <span className="text-gray-600 font-medium">Procédure</span>
                </div>
                <div className="text-gray-400 mt-0.5">Taille ∝ nombre d'irritants</div>
                <div className="text-gray-400">Drag pour déplacer · Scroll pour zoomer</div>
            </div>
        </div>
    );
}

// ─── Dashboard principal ──────────────────────────────────────

export default function IrritantsDashboard({ irritants, procedures }: Props) {
    return (
        <div className="space-y-6">

            {/* ── Matrice ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-gray-800">Matrice Catégories × Procédures</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                        Nombre d'irritants par croisement — point coloré = criticité dominante
                    </p>
                </div>
                <div className="p-5">
                    <MatriceView irritants={irritants} procedures={procedures} />
                </div>
            </div>

            {/* ── Graphe ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-gray-800">Graphe de relations</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                        Catégories reliées aux procédures concernées — épaisseur du lien ∝ nombre d'irritants
                    </p>
                </div>
                <div className="p-4">
                    <ForceGraph irritants={irritants} procedures={procedures} />
                </div>
            </div>

        </div>
    );
}
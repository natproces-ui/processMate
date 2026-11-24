'use client';

// Vue d'ensemble : le logigramme et le détail de chaque étape affichés ensemble, reliés dans les deux sens.
// Cliquer une forme du logigramme amène son étape dans le détail ; cliquer une étape la montre sur le logigramme.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Diamond, Play, Scan, Square, ZoomIn, ZoomOut, Circle } from 'lucide-react';
import type { Table1Row } from '@/logic/types';
import type { TaskEnrichment } from '@/logic/bpmnTypes';
import StepLinkedDiagram, { type StepLinkedDiagramHandle } from '@/components/shared/StepLinkedDiagram';
import SourceCitation from '@/components/shared/SourceCitation';

const isGateway = (t: string) => /Gateway/.test(t);
const isEvent = (t: string) => /Event/.test(t);

function TypeIcon({ type }: { type: string }) {
    const cls = 'h-3.5 w-3.5 shrink-0';
    if (isGateway(type)) return <Diamond className={cls} aria-label="Décision" />;
    if (type === 'StartEvent') return <Play className={cls} aria-label="Début" />;
    if (type === 'EndEvent') return <Circle className={cls} aria-label="Fin" />;
    return <Square className={cls} aria-label="Tâche" />;
}

export default function ProcedureOverview({ xml, rows, enrichments, diagramRef, diff }: {
    xml: string;
    /** TO BE : ce qui change par rapport à l'AS IS (étape nouvelle ou modifiée), coloré sur le dessin et dans le détail */
    diff?: Record<string, 'nouvelle' | 'modifiee' | 'supprimee'>;
    /** zoom piloté de l'extérieur (barre de commandes) : les boutons sur le dessin disparaissent */
    diagramRef?: RefObject<StepLinkedDiagramHandle | null>;
    rows: Table1Row[];
    enrichments: Map<string, TaskEnrichment>;
}) {
    const [selected, setSelected] = useState<string | null>(null);
    const ownDiagram = useRef<StepLinkedDiagramHandle>(null);
    const diagram = diagramRef ?? ownDiagram;
    const cardRefs = useRef<Record<string, HTMLLIElement | null>>({});
    const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);

    // l'étape choisie sur le logigramme est amenée dans le détail
    useEffect(() => {
        if (selected) cardRefs.current[selected]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selected]);

    const actors = new Set(rows.map(r => r.acteur).filter(Boolean)).size;

    return (
        <div className="flex h-full min-h-[480px] flex-col gap-3 lg:flex-row">
            {/* Logigramme */}
            <div className="relative min-h-[360px] min-w-0 flex-1 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <StepLinkedDiagram ref={diagram} xml={xml} selectedIds={selected ? [selected] : []} onSelect={setSelected} diff={diff} />
                {!diagramRef && <div className="absolute right-3 top-3 flex overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-sm">
                    <button type="button" aria-label="Dézoomer" onClick={() => diagram.current?.zoomOut()} className="border-r border-neutral-300 p-1.5 hover:bg-neutral-100"><ZoomOut className="h-4 w-4" /></button>
                    <button type="button" aria-label="Zoomer" onClick={() => diagram.current?.zoomIn()} className="border-r border-neutral-300 p-1.5 hover:bg-neutral-100"><ZoomIn className="h-4 w-4" /></button>
                    <button type="button" aria-label="Ajuster" onClick={() => diagram.current?.fit()} className="p-1.5 hover:bg-neutral-100"><Scan className="h-4 w-4" /></button>
                </div>}
            </div>

            {/* Détail des étapes */}
            <section aria-label="Détail des étapes" className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white lg:w-[400px] lg:shrink-0">
                <div className="flex items-baseline justify-between border-b border-neutral-200 px-4 py-2.5">
                    <h3 className="text-sm font-semibold text-petrole">Détail des étapes</h3>
                    <span className="text-[11px] text-neutral-500">{rows.length} étape{rows.length > 1 ? 's' : ''}, {actors} acteur{actors > 1 ? 's' : ''}</span>
                </div>
                {diff && Object.keys(diff).length > 0 && (() => {
                    const n = Object.values(diff).filter(v => v === 'nouvelle').length;
                    const m = Object.values(diff).filter(v => v === 'modifiee').length;
                    return (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-200 px-4 py-1.5 text-[11px] text-neutral-700">
                            <span>Par rapport à l’AS IS :</span>
                            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border-[3px] border-petrole bg-petrole-tint" />{n} nouvelle{n > 1 ? 's' : ''}</span>
                            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border-2 border-dashed border-petrole" />{m} modifiée{m > 1 ? 's' : ''}</span>
                        </div>
                    );
                })()}
                <ol className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
                    {rows.map(r => {
                        const e = enrichments.get(r.id);
                        const active = selected === r.id;
                        const outs = (r.outputs || []).map(o => {
                            const target = byId.get(o.targetId);
                            return `${o.label ? `si ${o.label.toLowerCase()}, ` : ''}${target ? `${o.targetId}. ${target.étape}` : o.targetId}`;
                        });
                        return (
                            <li key={r.id} ref={el => { cardRefs.current[r.id] = el; }}>
                                <button type="button" onClick={() => setSelected(active ? null : r.id)} aria-pressed={active}
                                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${active ? 'border-petrole bg-petrole-tint' : 'border-petrole/25 hover:bg-petrole-tint/50'} ${isEvent(r.typeBpmn) ? 'opacity-80' : ''}`}>
                                    <span className="flex items-start gap-2">
                                        <span className="mt-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-petrole px-1 text-[10px] font-bold text-white">{r.id}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-900">
                                                <TypeIcon type={r.typeBpmn} />
                                                <span className="min-w-0">{isGateway(r.typeBpmn) ? (r.condition || r.étape) : r.étape}</span>
                                                {diff?.[r.id] === 'nouvelle' && <span className="shrink-0 rounded-full bg-petrole px-1.5 py-px text-[10px] font-semibold text-white">Nouvelle</span>}
                                                {diff?.[r.id] === 'modifiee' && <span className="shrink-0 rounded-full border border-dashed border-petrole px-1.5 py-px text-[10px] font-semibold text-petrole">Modifiée</span>}
                                            </span>
                                            <span className="mt-0.5 block text-xs text-neutral-600">
                                                {[r.acteur, r.département && r.département !== r.acteur ? r.département : '', r.outil].filter(Boolean).join(', ')}
                                            </span>
                                            {e?.descriptif && (
                                                <span className={`mt-1 block whitespace-pre-line text-xs leading-relaxed text-neutral-800 ${active ? '' : 'line-clamp-2'}`}>{e.descriptif}</span>
                                            )}
                                            {active && (
                                                <span className="mt-1.5 block space-y-1">
                                                    {outs.length > 0 && <span className="block text-[11px] text-neutral-500">Suite : {outs.join(' ; ')}</span>}
                                                    {e?.source?.fichier && <span className="block"><SourceCitation source={e.source} /></span>}
                                                </span>
                                            )}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ol>
            </section>
        </div>
    );
}

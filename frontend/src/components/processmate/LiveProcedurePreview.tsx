'use client';

/**
 * Aperçu d'une procédure pendant sa génération.
 *
 * Les étapes arrivent une à une (événement procedure_row) : le tableau s'allonge et le
 * BPMN est recalculé depuis le tableau, au plus toutes les 1,5 s. Lecture seule : la
 * version définitive remplace l'aperçu dès que la génération est terminée.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Table1Row } from '@/logic/types';
import { generateBPMNSimple } from '@/logic/bpmnGeneratorSimple';

const BPMN_REFRESH_MS = 1500;

const TYPE_LABEL: Record<string, string> = {
    StartEvent: 'Début', EndEvent: 'Fin', Task: 'Tâche',
    ExclusiveGateway: 'Décision', ParallelGateway: 'Parallèle', InclusiveGateway: 'Inclusive',
};

export function LiveHeader({ title, count }: { title: string; count: number }) {
    return (
        <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-700">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span className="min-w-0 truncate">
                Génération de <strong className="font-semibold">{title}</strong> — {count} étape{count > 1 ? 's' : ''} reçue{count > 1 ? 's' : ''}, la suite arrive…
            </span>
        </div>
    );
}

export function LiveTable({ rows }: { rows: Table1Row[] }) {
    const endRef = useRef<HTMLTableRowElement>(null);
    useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [rows.length]);
    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                        <th className="w-10 px-3 py-2 font-semibold">N°</th>
                        <th className="px-3 py-2 font-semibold">Étape</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Acteur</th>
                        <th className="px-3 py-2 font-semibold">Outil</th>
                        <th className="px-3 py-2 font-semibold">Suite</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                    {rows.map(r => (
                        <tr key={r.id} className="pm-rise">
                            <td className="px-3 py-2 font-mono text-slate-400">{r.id}</td>
                            <td className="px-3 py-2 font-medium text-slate-800">{r.étape}{r.condition && r.condition !== r.étape ? <span className="block font-normal text-slate-500">{r.condition}</span> : null}</td>
                            <td className="px-3 py-2 text-slate-500">{TYPE_LABEL[r.typeBpmn] || r.typeBpmn}</td>
                            <td className="px-3 py-2">{r.acteur}</td>
                            <td className="px-3 py-2 text-slate-500">{r.outil}</td>
                            <td className="px-3 py-2 font-mono text-slate-400">{(r.outputs || []).map(o => o.label ? `${o.targetId} (${o.label})` : o.targetId).join(', ')}</td>
                        </tr>
                    ))}
                    <tr ref={endRef}>
                        <td colSpan={6} className="px-3 py-2"><span className="pm-shimmer block h-3 rounded bg-slate-100" /></td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

/** Diagramme partiel : les liens vers des étapes pas encore reçues sont ignorés. */
function partialXml(rows: Table1Row[], title: string): string | null {
    const ids = new Set(rows.map(r => r.id));
    const safe = rows.map(r => ({ ...r, outputs: (r.outputs || []).filter(o => ids.has(o.targetId)) }));
    try {
        return generateBPMNSimple(safe, title);
    } catch {
        return null;   // état intermédiaire non dessinable : on garde le dernier diagramme
    }
}

export function LiveBpmn({ rows, title }: { rows: Table1Row[]; title: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const rowsRef = useRef(rows);
    const lastDrawn = useRef(0);
    const [tick, setTick] = useState(0);
    rowsRef.current = rows;

    // Limite le recalcul : au plus un dessin toutes les BPMN_REFRESH_MS
    useEffect(() => {
        const wait = Math.max(0, BPMN_REFRESH_MS - (Date.now() - lastDrawn.current));
        const t = setTimeout(() => setTick(n => n + 1), wait);
        return () => clearTimeout(t);
    }, [rows.length]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!containerRef.current || rowsRef.current.length === 0) return;
            const xml = partialXml(rowsRef.current, title);
            if (!xml) return;
            lastDrawn.current = Date.now();
            if (!viewerRef.current) {
                const Viewer = (await import('bpmn-js/lib/NavigatedViewer')).default;
                if (cancelled || !containerRef.current) return;
                viewerRef.current = new Viewer({ container: containerRef.current });
            }
            try {
                await viewerRef.current.importXML(xml);
                if (!cancelled) (viewerRef.current.get('canvas') as any).zoom('fit-viewport', 'auto');
            } catch { /* diagramme intermédiaire refusé : le suivant le remplacera */ }
        })();
        return () => { cancelled = true; };
    }, [tick, title]);

    useEffect(() => () => { viewerRef.current?.destroy(); viewerRef.current = null; }, []);

    return <div ref={containerRef} className="min-h-[420px] flex-1 rounded-xl border border-slate-200 bg-white" />;
}

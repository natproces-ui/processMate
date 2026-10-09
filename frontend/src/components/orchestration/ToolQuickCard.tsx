'use client';

// components/orchestration/ToolQuickCard.tsx
//
// Carte flottante — aperçu rapide d'un outil (écrans/champs/codes/règles/données) au clic
// sur un nœud outil dans la Vue IT (frontend/src/components/new-way/BpmnEditor.tsx,
// diagramme généré par bpmnGeneratorOutillage.ts). Volontairement léger : un
// résumé, pas l'édition complète — le bouton "Gérer l'outil" ouvre ToolDetailPanel
// (la vraie fiche, avec upload d'écran, extraction IA, ajout de code) pour qui
// veut aller plus loin. Positionnée près du clic, contrairement à ToolDetailPanel
// qui est une modale centrée — les deux se complètent, pas de doublon d'UI.

import { useEffect, useState } from 'react';
import { ClipboardList, Code2, Database, Loader2, Monitor, X } from 'lucide-react';
import { toolsApi, type ToolDetail } from '@/lib/toolsApi';

interface Props {
    toolName: string;
    /** Coordonnées écran du clic (clientX/clientY) — la carte se positionne à
     * côté, en se recalant si elle déborderait de la fenêtre. */
    anchor: { x: number; y: number };
    onClose: () => void;
    onManage: () => void;
}

const CODE_TYPE_LABELS: Record<string, string> = {
    transaction: 'Transaction', produit: 'Produit', erreur: 'Erreur', informatique: 'Informatique',
};

const CARD_WIDTH = 300;

export default function ToolQuickCard({ toolName, anchor, onClose, onManage }: Props) {
    const [detail, setDetail] = useState<ToolDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null); setDetail(null);
        (async () => {
            try {
                const res = await toolsApi.createOrGet(toolName);
                if (cancelled) return;
                const d = await toolsApi.getDetail(res.tool.id);
                if (!cancelled) setDetail(d);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur de chargement');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [toolName]);

    const fieldsCount = detail?.screens.reduce((n, s) => n + s.fields.length, 0) ?? 0;
    const codesByType = new Map<string, number>();
    for (const c of detail?.codes ?? []) codesByType.set(c.code_type, (codesByType.get(c.code_type) ?? 0) + 1);

    // Se recale pour ne jamais déborder de la fenêtre (approximatif — pas de mesure
    // réelle de la hauteur avant montage, mais une marge généreuse suffit ici).
    const left = typeof window !== 'undefined' ? Math.min(anchor.x + 12, window.innerWidth - CARD_WIDTH - 16) : anchor.x;
    const top = typeof window !== 'undefined' ? Math.min(anchor.y + 12, window.innerHeight - 320) : anchor.y;

    return (
        <>
            <div className="fixed inset-0 z-40" onClick={onClose} />
            <div
                className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
                style={{ left: Math.max(8, left), top: Math.max(8, top), width: CARD_WIDTH }}
            >
                <div className="px-3.5 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2 bg-gray-50">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Outil</p>
                        <p className="font-bold text-gray-900 text-sm truncate">{toolName}</p>
                    </div>
                    <button type="button" onClick={onClose} className="shrink-0 p-1 hover:bg-gray-200 rounded">
                        <X className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                </div>

                <div className="p-3.5 space-y-3">
                    {loading ? (
                        <div className="flex items-center justify-center py-6 text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Chargement…
                        </div>
                    ) : error ? (
                        <p className="text-xs text-red-600">{error}</p>
                    ) : (
                        <>
                            <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                                <span className="inline-flex items-center gap-1.5">
                                    <Monitor className="w-3.5 h-3.5 text-gray-400" />
                                    {detail?.screens.length ?? 0} écran{(detail?.screens.length ?? 0) > 1 ? 's' : ''}
                                </span>
                                <span>{fieldsCount} champ{fieldsCount > 1 ? 's' : ''}</span>
                                <span className="inline-flex items-center gap-1.5">
                                    <Code2 className="w-3.5 h-3.5 text-gray-400" />
                                    {detail?.codes.length ?? 0} code{(detail?.codes.length ?? 0) > 1 ? 's' : ''}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <ClipboardList className="w-3.5 h-3.5 text-gray-400" />
                                    {detail?.business_rules.length ?? 0} règle{(detail?.business_rules.length ?? 0) > 1 ? 's' : ''}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <Database className="w-3.5 h-3.5 text-gray-400" />
                                    {detail?.data_entities.length ?? 0} donnée{(detail?.data_entities.length ?? 0) > 1 ? 's' : ''}
                                </span>
                            </div>

                            {(detail?.screens.length ?? 0) > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {detail!.screens.slice(0, 4).map(s => (
                                        <span key={s.id} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{s.name}</span>
                                    ))}
                                    {detail!.screens.length > 4 && (
                                        <span className="text-[10px] text-gray-400">+{detail!.screens.length - 4}</span>
                                    )}
                                </div>
                            )}

                            {codesByType.size > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {[...codesByType.entries()].map(([type, n]) => (
                                        <span key={type} className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                                            {CODE_TYPE_LABELS[type] ?? type} ({n})
                                        </span>
                                    ))}
                                </div>
                            )}

                            {(detail?.screens.length ?? 0) === 0 && (detail?.codes.length ?? 0) === 0
                                && (detail?.business_rules.length ?? 0) === 0 && (detail?.data_entities.length ?? 0) === 0 && (
                                <p className="text-xs text-gray-400">Rien renseigné pour cet outil pour l&apos;instant.</p>
                            )}
                        </>
                    )}

                    <button
                        type="button"
                        onClick={onManage}
                        className="w-full text-center text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg py-2 transition-colors"
                    >
                        Gérer l&apos;outil
                    </button>
                </div>
            </div>
        </>
    );
}

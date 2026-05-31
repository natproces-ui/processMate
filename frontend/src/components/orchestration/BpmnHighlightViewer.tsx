'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import type { Finding } from './FindingCard';

// Couleurs par catégorie
const CATEGORY_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
    automatisable: { bg: '#FEF3C7', border: '#F59E0B', dot: '#D97706' },
    aller_retour: { bg: '#FEE2E2', border: '#EF4444', dot: '#DC2626' },
    notification: { bg: '#E0F2FE', border: '#0EA5E9', dot: '#0284C7' },
    interfacage: { bg: '#EDE9FE', border: '#8B5CF6', dot: '#7C3AED' },
    autre: { bg: '#CCFBF1', border: '#14B8A6', dot: '#0D9488' },
};

const LABELS: Record<string, string> = {
    automatisable: 'Automatisable',
    aller_retour: 'Aller-retour',
    notification: 'Notification',
    interfacage: 'Interfaçage',
    autre: 'Autre amélioration',
};

function getColor(categorie: string | undefined) {
    if (!categorie) return CATEGORY_COLORS.autre;
    return CATEGORY_COLORS[categorie] ?? CATEGORY_COLORS.autre;
}

function getLabel(categorie: string | undefined) {
    if (!categorie) return 'Autre amélioration';
    return LABELS[categorie] ?? categorie.replace(/_/g, ' ');
}

export interface HighlightStep {
    step: string;
    categorie: Finding['categorie'];
}

interface Props {
    xml: string;
    highlightedSteps: HighlightStep[];
}

// ─── Normalisation robuste ────────────────────────────────────
// Gère les deux formats :
// - "Étape 3: Procéder aux contrôles"  → "proceder aux controles"
// - "Procéder au contrôle de la demande" → "proceder au controle de la demande"
// - "Contrôle concluant ?"             → "controle concluant"

function normalize(text: string): string {
    return text
        .toLowerCase()
        // Retirer le préfixe "Etape N:" ou "Étape N :"
        .replace(/^[eé]tape\s*\d+\s*[:\-–]\s*/i, '')
        // Accents
        .replace(/[éèêë]/g, 'e')
        .replace(/[àâä]/g, 'a')
        .replace(/[ùûü]/g, 'u')
        .replace(/[îï]/g, 'i')
        .replace(/[ôö]/g, 'o')
        .replace(/ç/g, 'c')
        // Ponctuation → espace
        .replace(/[:\-–_?!.,;()/\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Score de similarité entre deux chaînes normalisées
// Retourne true si les deux textes se correspondent "bien"
function isMatch(normA: string, normB: string): boolean {
    if (normA === normB) return true;
    if (normA.length === 0 || normB.length === 0) return false;

    // Inclusion directe
    if (normA.includes(normB) || normB.includes(normA)) return true;

    // Mots en commun — au moins 60% des mots du plus court sont dans le plus long
    const wordsA = normA.split(' ').filter(w => w.length > 2);
    const wordsB = normB.split(' ').filter(w => w.length > 2);
    if (wordsA.length === 0 || wordsB.length === 0) return false;

    const [shorter, longer] = wordsA.length <= wordsB.length
        ? [wordsA, wordsB]
        : [wordsB, wordsA];

    const longerStr = longer.join(' ');
    const matchCount = shorter.filter(w => longerStr.includes(w)).length;
    const ratio = matchCount / shorter.length;

    return ratio >= 0.6;
}

// Charger les CSS bpmn-js une seule fois (NavigatedViewer ne les charge pas automatiquement)
let bpmnCssLoaded = false;
function loadBpmnViewerCss() {
    if (bpmnCssLoaded || typeof document === 'undefined') return;
    bpmnCssLoaded = true;
    const hrefs = [
        'https://unpkg.com/bpmn-js@17.11.1/dist/assets/bpmn-js.css',
        'https://unpkg.com/bpmn-js@17.11.1/dist/assets/diagram-js.css',
        'https://unpkg.com/bpmn-js@17.11.1/dist/assets/bpmn-font/css/bpmn.css',
    ];
    hrefs.forEach(href => {
        if (document.querySelector(`link[href="${href}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    });
}

export default function BpmnHighlightViewer({ xml, highlightedSteps }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [matchCount, setMatchCount] = useState(0);

    const stepsKey = highlightedSteps.map(s => `${s.categorie}:${s.step}`).join('|');

    useEffect(() => {
        if (!containerRef.current || !xml) return;
        let cancelled = false;

        const init = async () => {
            setLoading(true);
            setError(null);
            setMatchCount(0);
            loadBpmnViewerCss();

            try {
                const BpmnJS = (await import('bpmn-js/lib/NavigatedViewer')).default;

                if (viewerRef.current) {
                    viewerRef.current.destroy();
                    viewerRef.current = null;
                }
                if (cancelled) return;

                const viewer = new BpmnJS({ container: containerRef.current });
                viewerRef.current = viewer;

                await viewer.importXML(xml);
                if (cancelled) return;

                const canvas = viewer.get('canvas') as any;
                const elementRegistry = viewer.get('elementRegistry') as any;
                const overlays = viewer.get('overlays') as any;

                canvas.zoom('fit-viewport', 'auto');

                if (highlightedSteps.length === 0) {
                    setLoading(false);
                    return;
                }

                // Pré-calculer les versions normalisées des étapes à surligner
                const normalizedTarget = highlightedSteps.map(s => ({
                    ...s,
                    norm: normalize(s.step),
                }));

                const ARROW_CATEGORIES = new Set(['aller_retour', 'notification']);
                const highlightedIdsByCategorie = new Map<string, Finding['categorie']>();
                let found = 0;

                const allElements = elementRegistry.getAll();

                // Passe 1 — nœuds
                allElements.forEach((element: any) => {
                    const name: string = element.businessObject?.name || '';
                    if (!name) return;

                    const nameNorm = normalize(name);

                    // Trouver le meilleur match parmi les étapes à surligner
                    const match = normalizedTarget.find(({ norm }) => isMatch(nameNorm, norm));
                    if (!match) return;

                    found++;
                    const color = getColor(match.categorie);
                    highlightedIdsByCategorie.set(element.id, match.categorie);

                    // Badge coloré
                    overlays.add(element.id, {
                        position: { top: -10, left: -10 },
                        html: `<div style="
                            width: 18px; height: 18px;
                            background: ${color.dot};
                            border: 2.5px solid white;
                            border-radius: 50%;
                            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
                            z-index: 10;
                            pointer-events: none;
                        " title="${name}"></div>`,
                    });

                    // Colorer le nœud SVG directement
                    const gfx = elementRegistry.getGraphics(element.id);
                    if (gfx) {
                        // Tous les types de formes BPMN
                        const shapes = gfx.querySelectorAll('rect, circle, polygon, ellipse, path');
                        shapes.forEach((shape: SVGElement) => {
                            // Ne pas colorier les paths qui sont des icônes internes
                            const tagName = shape.tagName.toLowerCase();
                            if (tagName === 'path') {
                                // Appliquer uniquement si c'est la forme principale (grande)
                                const bbox = (shape as SVGGraphicsElement).getBBox?.();
                                if (!bbox || (bbox.width < 20 && bbox.height < 20)) return;
                            }
                            shape.style.fill = color.bg;
                            shape.style.stroke = color.border;
                            shape.style.strokeWidth = '2.5px';
                        });

                        // Pour les tâches : cibler rect en priorité
                        const rect = gfx.querySelector('rect');
                        if (rect) {
                            rect.style.fill = color.bg;
                            rect.style.stroke = color.border;
                            rect.style.strokeWidth = '2.5px';
                        }
                    }
                });

                // Passe 2 — flèches entre nœuds surlignés (aller_retour, notification)
                allElements.forEach((element: any) => {
                    if (element.type !== 'bpmn:SequenceFlow') return;

                    const sourceId = element.businessObject?.sourceRef?.id;
                    const targetId = element.businessObject?.targetRef?.id;
                    if (!sourceId || !targetId) return;

                    const sourceCat = highlightedIdsByCategorie.get(sourceId);
                    const targetCat = highlightedIdsByCategorie.get(targetId);
                    if (!sourceCat || !targetCat) return;
                    if (!ARROW_CATEGORIES.has(sourceCat) && !ARROW_CATEGORIES.has(targetCat)) return;

                    const color = getColor(sourceCat);
                    const gfx = elementRegistry.getGraphics(element.id);
                    if (!gfx) return;

                    const path = gfx.querySelector('path, polyline');
                    if (path) {
                        path.style.stroke = color.dot;
                        path.style.strokeWidth = '2.5px';
                    }
                });

                setMatchCount(found);
                setLoading(false);
            } catch (e: any) {
                if (!cancelled) {
                    setError(e.message || 'Erreur chargement BPMN');
                    setLoading(false);
                }
            }
        };

        init();

        return () => {
            cancelled = true;
            if (viewerRef.current) {
                viewerRef.current.destroy();
                viewerRef.current = null;
            }
        };
    }, [xml, stepsKey]);

    const legendCats = [...new Set(highlightedSteps.map(s => s.categorie || 'autre'))];

    return (
        <div className="relative w-full h-full bg-white rounded-xl overflow-hidden border border-gray-200">
            {/* CSS de protection — force la visibilité des textes bpmn-js */}
            <style>{`
                .bjs-powered-by { display: none !important; }
                /* Forcer la visibilité des labels dans le viewer */
                .djs-label,
                .djs-label text,
                .djs-label tspan,
                .djs-visual text,
                .djs-visual tspan {
                    fill: #1e293b !important;
                    color: #1e293b !important;
                    font-size: 12px !important;
                    font-family: system-ui, sans-serif !important;
                    visibility: visible !important;
                    display: block !important;
                }
                /* Contenu des shapes */
                .djs-shape .djs-visual text,
                .djs-shape .djs-visual tspan {
                    fill: #1e293b !important;
                }
                /* Labels des lanes */
                .djs-shape[data-element-id^="Lane_"] .djs-visual text,
                .djs-shape[data-element-id^="Lane_"] .djs-visual tspan {
                    fill: #ffffff !important;
                    font-weight: 700 !important;
                }
                /* Labels des séquences */
                .djs-connection .djs-label text,
                .djs-connection .djs-label tspan {
                    fill: #64748b !important;
                    font-size: 11px !important;
                }
            `}</style>
            <div ref={containerRef} className="w-full h-full" />

            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                        <p className="text-xs text-gray-400">Chargement du logigramme…</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/90">
                    <div className="flex flex-col items-center gap-2 text-red-500">
                        <AlertCircle className="w-6 h-6" />
                        <p className="text-xs text-center px-4">{error}</p>
                    </div>
                </div>
            )}

            {!loading && !error && matchCount === 0 && highlightedSteps.length > 0 && (
                <div className="absolute top-2 right-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] text-amber-700">Aucune étape trouvée sur le diagramme</p>
                </div>
            )}

            {!loading && !error && legendCats.length > 0 && (
                <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-2 border border-gray-200 shadow-sm">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Types détectés</p>
                    <div className="space-y-1">
                        {legendCats.map((cat) => {
                            const color = getColor(cat);
                            return (
                                <div key={cat} className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color.dot }} />
                                    <span className="text-[10px] text-gray-600">{getLabel(cat)}</span>
                                </div>
                            );
                        })}
                    </div>
                    {matchCount > 0 && (
                        <p className="text-[10px] text-gray-400 mt-1.5 border-t border-gray-100 pt-1.5">
                            {matchCount} nœud{matchCount > 1 ? 's' : ''} coloré{matchCount > 1 ? 's' : ''}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
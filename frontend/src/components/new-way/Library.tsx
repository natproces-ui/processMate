'use client';

/**
 * Library.tsx — Panneau éléments ProcessMate
 *
 * Panneau latéral gauche avec les éléments custom ProcessMate :
 *   • Outil  — drag-and-drop sur le canvas → crée un Tool_ serviceTask
 *   • Link   — click → active le mode connect pour lier une tâche à un outil
 *
 * Usage dans la page new-way :
 *   <Library modelerRef={modelerRef} />
 *
 * Le composant communique directement avec l'instance bpmn-js via modelerRef.
 */

import { useRef, useState, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface LibraryProps {
    /** Ref vers l'instance BpmnModeler (modelerRef.current de BpmnEditor) */
    modelerRef: React.MutableRefObject<any>;
}

// ─────────────────────────────────────────────────────────────
// SVG ICONS
// ─────────────────────────────────────────────────────────────

// Barre verte + roue dentée — identique au rendu canvas
function ToolIcon() {
    return (
        <svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
            {/* Barre verticale verte */}
            <line x1="7" y1="4" x2="7" y2="28" stroke="#1a7a5e" strokeWidth="2.5" strokeLinecap="round" />
            {/* Roue dentée verte décalée à droite */}
            <g transform="translate(10, 4) scale(0.85)">
                <path
                    d="M7.5 4.5A1.5 1.5 0 0 0 6 3a1.5 1.5 0 0 0-1.5 1.5 1.5 1.5 0 0 0 1.5 1.5 1.5 1.5 0 0 0 1.5-1.5zM6 1c.3 0 .6.03.88.08l.34 1.02a.85.85 0 0 0 1.06.54l1-.38c.46.35.84.79 1.12 1.3l-.6.88a.85.85 0 0 0 .18 1.14l.9.65c.04.27.06.55.06.83s-.02.56-.06.83l-.9.65a.85.85 0 0 0-.18 1.14l.6.88c-.28.51-.66.95-1.12 1.3l-1-.38a.85.85 0 0 0-1.06.54l-.34 1.02A5 5 0 0 1 6 13a5 5 0 0 1-.88-.08l-.34-1.02a.85.85 0 0 0-1.06-.54l-1 .38c-.46-.35-.84-.79-1.12-1.3l.6-.88a.85.85 0 0 0-.18-1.14l-.9-.65A5 5 0 0 1 1 7c0-.28.02-.56.06-.83l.9-.65A.85.85 0 0 0 2.14 4.38l-.6-.88C1.82 3 2.2 2.56 2.66 2.21l1 .38a.85.85 0 0 0 1.06-.54l.34-1.02A5 5 0 0 1 6 1z"
                    fill="#1a7a5e"
                />
            </g>
        </svg>
    );
}

// Icône chaîne pour le Link
function LinkIcon({ active }: { active: boolean }) {
    const color = active ? '#2C7BE5' : '#64748b';
    return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
            stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            xmlns="http://www.w3.org/2000/svg">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
    );
}

// ─────────────────────────────────────────────────────────────
// COMPOSANT
// ─────────────────────────────────────────────────────────────

export default function Library({ modelerRef }: LibraryProps) {
    const [linkMode, setLinkMode] = useState(false);
    const [dragging, setDragging] = useState(false);
    const linkSourceRef = useRef<any>(null);

    // ── OUTIL : drag depuis la librairie ─────────────────────
    const handleToolDragStart = useCallback((e: React.DragEvent) => {
        setDragging(true);
        e.dataTransfer.setData('processmate/tool', 'true');
        e.dataTransfer.effectAllowed = 'copy';

        // Ghost image custom — barre+roue dans un canvas temporaire
        const ghost = document.createElement('div');
        ghost.style.cssText = `
            position: fixed; top: -999px; left: -999px;
            background: #f0fdf4; border: 1.5px dashed #1a7a5e;
            border-radius: 4px; padding: 4px 10px;
            font-size: 11px; font-weight: 600; color: #1a7a5e;
            white-space: nowrap; font-family: system-ui, sans-serif;
        `;
        ghost.textContent = '⚙ Outil';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 40, 14);
        setTimeout(() => document.body.removeChild(ghost), 0);
    }, []);

    const handleToolDragEnd = useCallback(() => {
        setDragging(false);
    }, []);

    // ── LINK : mode connect ──────────────────────────────────
    const handleLinkClick = useCallback(() => {
        const modeler = modelerRef.current;
        if (!modeler) return;

        if (linkMode) {
            // Désactiver le mode link
            setLinkMode(false);
            linkSourceRef.current = null;
            // Retirer le curseur custom
            modeler.get('canvas').getContainer().style.cursor = '';
            return;
        }

        setLinkMode(true);

        // Passer en mode "connect" — l'utilisateur clique sur la source
        // puis sur la cible, bpmn-js gère le reste via ToolConnectionBehavior
        const canvas = modeler.get('canvas');
        const container = canvas.getContainer();
        container.style.cursor = 'crosshair';

        // Écouter le premier click sur le canvas = source
        const eventBus = modeler.get('eventBus');

        const onElementClick = (event: any) => {
            const element = event.element;
            if (!element) return;

            const isTool = element.id?.startsWith('Tool_');
            const isTask = element.type === 'bpmn:UserTask' ||
                element.type === 'bpmn:Task' ||
                element.type === 'bpmn:ServiceTask';

            if (!isTask && !isTool) return;

            if (!linkSourceRef.current) {
                // Premier click = source
                linkSourceRef.current = element;
                container.style.cursor = 'cell';

                // Feedback visuel sur la source
                const elementRegistry = modeler.get('elementRegistry');
                const graphicsFactory = modeler.get('graphicsFactory');
                try {
                    const gfx = elementRegistry.getGraphics(element);
                    if (gfx) {
                        const outline = gfx.querySelector('.djs-outline');
                        if (outline) {
                            outline.setAttribute('stroke', '#2C7BE5');
                            outline.setAttribute('stroke-width', '2');
                            outline.setAttribute('stroke-dasharray', '4,2');
                        }
                    }
                } catch { /* ignore */ }

            } else {
                // Deuxième click = cible → créer l'association
                const source = linkSourceRef.current;
                const target = element;

                if (source.id !== target.id) {
                    try {
                        const modeling = modeler.get('modeling');
                        const moddle = modeler.get('moddle');
                        const assocId = `ToolAssoc_${Date.now()}`;

                        const bo = moddle.create('bpmn:Association', {
                            id: assocId,
                            name: 'link',
                            associationDirection: 'None',
                            sourceRef: source.businessObject,
                            targetRef: target.businessObject,
                        });

                        modeling.createConnection(source, target, {
                            type: 'bpmn:Association',
                            id: assocId,
                            businessObject: bo,
                        }, source.parent);

                    } catch (err) {
                        console.warn('Library link error:', err);
                    }
                }

                // Reset
                setLinkMode(false);
                linkSourceRef.current = null;
                container.style.cursor = '';
                eventBus.off('element.click', onElementClick);
            }
        };

        eventBus.on('element.click', onElementClick);

        // Annuler avec Escape
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setLinkMode(false);
                linkSourceRef.current = null;
                container.style.cursor = '';
                eventBus.off('element.click', onElementClick);
                document.removeEventListener('keydown', onKeyDown);
            }
        };
        document.addEventListener('keydown', onKeyDown);

    }, [linkMode, modelerRef]);

    // ─────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────

    return (
        <aside className="
            w-[72px] flex-shrink-0 bg-white border-r border-slate-200
            flex flex-col items-center pt-3 pb-4 gap-1 select-none
            z-10
        ">
            {/* Section titre */}
            <div className="w-full px-2 mb-2">
                <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest text-center">
                    PM
                </span>
                <div className="mt-1 h-px bg-slate-100 w-full" />
            </div>

            {/* ── Item Outil ── */}
            <div
                draggable
                onDragStart={handleToolDragStart}
                onDragEnd={handleToolDragEnd}
                title="Outil / Applicatif — glisser sur le diagramme"
                className={`
                    w-14 h-14 rounded-lg flex flex-col items-center justify-center gap-1
                    cursor-grab active:cursor-grabbing
                    border transition-all duration-150
                    ${dragging
                        ? 'border-emerald-300 bg-emerald-50 scale-95'
                        : 'border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50'
                    }
                `}
            >
                <ToolIcon />
                <span className="text-[8px] font-semibold text-emerald-700 tracking-tight">
                    Outil
                </span>
            </div>

            {/* ── Item Link ── */}
            <div
                onClick={handleLinkClick}
                title={linkMode
                    ? 'Mode Link actif — cliquez sur la source puis la cible (Échap pour annuler)'
                    : 'Link — relier une tâche à un outil'}
                className={`
                    w-14 h-14 rounded-lg flex flex-col items-center justify-center gap-1
                    cursor-pointer
                    border transition-all duration-150
                    ${linkMode
                        ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50'
                    }
                `}
            >
                <LinkIcon active={linkMode} />
                <span className={`text-[8px] font-semibold tracking-tight ${linkMode ? 'text-blue-600' : 'text-slate-500'
                    }`}>
                    {linkMode ? 'Actif…' : 'Link'}
                </span>
            </div>

            {/* Indicateur mode link actif */}
            {linkMode && (
                <div className="
                    mx-1 mt-1 px-1.5 py-1 rounded bg-blue-50 border border-blue-200
                    text-[8px] text-blue-600 text-center leading-tight
                ">
                    Cliquez<br />source<br />puis cible<br />
                    <span className="text-blue-400">Échap ✕</span>
                </div>
            )}

            <div className="flex-1" />

            {/* Séparateur bas */}
            <div className="h-px bg-slate-100 w-10 mb-1" />
            <span className="text-[7px] text-slate-300 font-medium tracking-widest">
                ProcessMate
            </span>
        </aside>
    );
}
'use client';

// components/orchestration/ScreenHover.tsx
//
// Aperçu des écrans d'une étape au survol (diagramme, tableaux d'étapes). La carte est en
// position fixe, ancrée au rectangle survolé, pour ne pas être coupée par un tableau qui
// défile. Rien ne s'affiche pour une étape sans écran.

import { useEffect, useRef, useState } from 'react';
import type { ToolDetail } from '@/lib/toolsApi';
import { loadToolDetail } from '@/components/orchestration/StepScreensPicker';
import ScreenFrame from '@/components/orchestration/ScreenFrame';

const CARD_WIDTH = 380;

export function ScreenHoverCard({ toolName, screenIds, anchor }: {
    toolName: string;
    screenIds: string[];
    anchor: DOMRect;
}) {
    const [detail, setDetail] = useState<ToolDetail | null>(null);

    useEffect(() => {
        let cancelled = false;
        loadToolDetail(toolName).then(d => { if (!cancelled) setDetail(d); }).catch(() => { });
        return () => { cancelled = true; };
    }, [toolName]);

    const screens = (detail?.screens ?? []).filter(s => screenIds.includes(s.id));
    if (!detail || screens.length === 0) return null;

    // À droite de l'élément s'il y a la place, sinon à gauche ; jamais hors de la fenêtre
    const right = anchor.right + 12 + CARD_WIDTH < window.innerWidth;
    const left = right ? anchor.right + 12 : Math.max(8, anchor.left - 12 - CARD_WIDTH);
    const top = Math.max(8, Math.min(anchor.top - 8, window.innerHeight - 320 * screens.length - 16));

    return (
        <div className="fixed z-[80] pointer-events-none rounded-xl bg-white shadow-2xl ring-1 ring-slate-900/10 p-2 space-y-2"
            style={{ left, top, width: CARD_WIDTH }}>
            {screens.slice(0, 2).map(s => (
                <div key={s.id}>
                    <div className="rounded-lg overflow-hidden ring-1 ring-slate-200">
                        <ScreenFrame screen={s} css={detail.tool.design_css} toolName={toolName} cropHeight={800} />
                    </div>
                    <p className="px-1 pt-1.5 text-xs font-medium text-slate-700 truncate">{s.name}</p>
                </div>
            ))}
            {screens.length > 2 && <p className="px-1 text-[11px] text-slate-400">+ {screens.length - 2} autre(s) écran(s)</p>}
        </div>
    );
}

/** Enveloppe un élément (ligne, libellé d'étape) : l'aperçu apparaît après un court survol. */
export function ScreenHoverTarget({ toolName, screenIds, children, className }: {
    toolName: string;
    screenIds: string[] | undefined;
    children: React.ReactNode;
    className?: string;
}) {
    const ref = useRef<HTMLSpanElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const active = !!toolName && !!screenIds && screenIds.length > 0;

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    if (!active) return <span className={className}>{children}</span>;
    return (
        <span ref={ref} className={className}
            onMouseEnter={() => { timer.current = setTimeout(() => ref.current && setAnchor(ref.current.getBoundingClientRect()), 250); }}
            onMouseLeave={() => { if (timer.current) clearTimeout(timer.current); setAnchor(null); }}>
            {children}
            {anchor && <ScreenHoverCard toolName={toolName} screenIds={screenIds!} anchor={anchor} />}
        </span>
    );
}

'use client';

// Largeur d'un volet réglable à la souris (liste à côté d'un logigramme), retenue dans ce navigateur.
import { useCallback, useEffect, useRef, useState } from 'react';

export function usePaneWidth(storageKey: string, initial: number, min: number, max: number) {
    const [width, setWidth] = useState(initial);
    useEffect(() => {
        try {
            const saved = Number(localStorage.getItem(storageKey));
            if (saved >= min && saved <= max) setWidth(saved);
        } catch { /* stockage indisponible : largeur par défaut */ }
    }, [storageKey, min, max]);
    const set = useCallback((w: number) => {
        const v = Math.round(Math.min(max, Math.max(min, w)));
        setWidth(v);
        try { localStorage.setItem(storageKey, String(v)); } catch { /* sans effet */ }
    }, [storageKey, min, max]);
    return [width, set] as const;
}

/** Poignée verticale entre deux volets : glisser pour régler, double-clic pour revenir à la largeur par défaut.
 *  `grows` : sens dans lequel le volet réglé grandit quand on tire vers la droite (+1 volet à gauche, -1 volet à droite). */
export function PaneHandle({ width, setWidth, grows, initial, label }: {
    width: number; setWidth: (w: number) => void; grows: 1 | -1; initial: number; label: string;
}) {
    const start = useRef<{ x: number; w: number } | null>(null);
    return (
        <div role="separator" aria-orientation="vertical" aria-label={label} tabIndex={0}
            title="Glisser pour régler la largeur ; double-clic pour revenir à la largeur par défaut"
            onPointerDown={e => { start.current = { x: e.clientX, w: width }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
            onPointerMove={e => { if (start.current) setWidth(start.current.w + grows * (e.clientX - start.current.x)); }}
            onPointerUp={() => { start.current = null; }}
            onDoubleClick={() => setWidth(initial)}
            onKeyDown={e => {
                if (e.key === 'ArrowLeft') setWidth(width - grows * 24);
                if (e.key === 'ArrowRight') setWidth(width + grows * 24);
            }}
            className="group hidden w-3 shrink-0 cursor-col-resize items-center justify-center lg:flex">
            <span className="h-10 w-1 rounded-full bg-neutral-300 transition-colors group-hover:bg-petrole group-focus-visible:bg-petrole" />
        </div>
    );
}

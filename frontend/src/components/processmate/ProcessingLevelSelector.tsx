'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { isProcessingLevel, PROCESSING_LEVELS, type ProcessingLevel } from '@/lib/processing-level';

// v2 : défaut passé de « Rapide » à « Normale » (l'ancien défaut avait été enregistré chez tous)
const STORAGE_KEY = 'processmate-studio-processing-level-v2';

export function useProcessingLevel() {
    const [level, setLevel] = useState<ProcessingLevel>('normal');
    const [ready, setReady] = useState(false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (isProcessingLevel(saved)) setLevel(saved);
        } catch { /* La préférence reste utilisable si le stockage est indisponible. */ }
        setReady(true);
    }, []);

    useEffect(() => {
        if (!ready) return;
        try { localStorage.setItem(STORAGE_KEY, level); } catch { /* Stockage facultatif. */ }
    }, [level, ready]);

    return [level, setLevel] as const;
}

export default function ProcessingLevelSelector({ value, onChange }: {
    value: ProcessingLevel;
    onChange: (level: ProcessingLevel) => void;
}) {
    const groupName = useId();
    const menuRef = useRef<HTMLDetailsElement>(null);
    const [menuAbove, setMenuAbove] = useState(false);
    const selected = PROCESSING_LEVELS.find(option => option.value === value)!;

    useEffect(() => {
        const closeOutside = (event: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) menuRef.current.open = false;
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, []);

    return (
        <details ref={menuRef} className="relative" onToggle={() => {
            const menu = menuRef.current;
            if (!menu?.open) return;
            let top = 0, bottom = window.innerHeight;
            for (let parent = menu.parentElement; parent; parent = parent.parentElement) {
                if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)) {
                    const bounds = parent.getBoundingClientRect();
                    top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
                }
            }
            const bounds = menu.querySelector('summary')!.getBoundingClientRect();
            const menuHeight = menu.querySelector('fieldset')!.getBoundingClientRect().height;
            const above = bounds.top - top, below = bottom - bounds.bottom;
            setMenuAbove(above >= menuHeight + 8 || above > below);
        }} onKeyDown={e => { if (e.key === 'Escape' && menuRef.current) { menuRef.current.open = false; menuRef.current.querySelector('summary')?.focus(); } }}>
            <summary aria-label={`Niveau d’analyse : ${selected.label}`} title={selected.description}
                className="list-none inline-flex items-center gap-1.5 cursor-pointer rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">
                {selected.label}<ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </summary>
            <fieldset className={["absolute right-0 z-40 w-64 max-w-[calc(100vw-2rem)] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg", menuAbove ? "bottom-full mb-2" : "top-full mt-2"].join(" ")}>
                <legend className="sr-only">Niveau d’analyse</legend>
                {PROCESSING_LEVELS.map(option => (
                    <label key={option.value}
                        className={['relative flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2.5 text-sm transition-colors', value === option.value ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'].join(' ')}>
                        <input type="radio" name={groupName} value={option.value} checked={value === option.value}
                            aria-label={option.label} aria-describedby={`${groupName}-${option.value}-description`}
                            onChange={() => { onChange(option.value); if (menuRef.current) { menuRef.current.open = false; menuRef.current.querySelector('summary')?.focus(); } }}
                            className="peer sr-only" />
                        <span className="flex-1 rounded peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-blue-500">
                            <span className="block font-medium">{option.label}</span>
                            <span id={`${groupName}-${option.value}-description`} className="block mt-0.5 text-xs text-slate-500">{option.description}</span>
                        </span>
                        {value === option.value && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
                    </label>
                ))}
            </fieldset>
        </details>
    );
}

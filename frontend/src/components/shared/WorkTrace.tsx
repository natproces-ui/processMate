'use client';

/**
 * Trace de travail d'une réponse (comme « A réfléchi pendant 16 s » chez Claude).
 * Pendant le travail : chaque étape (ce que l'assistant a compris, lit, rédige…), le
 * chronomètre de l'étape en cours et du total, et une explication si c'est long.
 * Une fois fini : une ligne repliée « A travaillé pendant 42 s », dépliable.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, CircleStop, Loader2 } from 'lucide-react';

export interface TraceStep { id: string; label: string; state: 'running' | 'done' | 'stopped'; startedAt?: number; endedAt?: number }

const fmt = (ms: number) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
};

export default function WorkTrace({ steps, running, startedAt, endedAt, open, onToggle }: {
    steps: TraceStep[]; running: boolean; startedAt?: number; endedAt?: number;
    open: boolean; onToggle: () => void;
}) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!running) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [running]);

    const total = startedAt ? (running ? now : (endedAt ?? now)) - startedAt : 0;
    const longWait = running && total > 20_000;

    if (!running) {
        return (
            <div>
                <button type="button" onClick={onToggle} aria-expanded={open}
                    className="flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900">
                    <ChevronRight className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} />
                    {startedAt && endedAt ? `A travaillé pendant ${fmt(endedAt - startedAt)}` : `${steps.length} étape${steps.length > 1 ? 's' : ''}`}
                </button>
                {open && <StepList steps={steps} now={now} className="mt-2" />}
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5" aria-live="polite">
            <p className="flex items-center gap-2 text-sm text-neutral-900">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="font-medium">Travail en cours</span>
                {startedAt && <span className="tabular-nums text-neutral-500">· {fmt(total)}</span>}
            </p>
            <StepList steps={steps} now={now} className="mt-2" />
            {longWait && (
                <p className="mt-2 text-xs text-neutral-500">
                    Un document long ou le niveau Approfondi peut demander jusqu&apos;à une minute. Vous pouvez continuer à lire ou travailler pendant ce temps.
                </p>
            )}
        </div>
    );
}

function StepList({ steps, now, className = '' }: { steps: TraceStep[]; now: number; className?: string }) {
    return (
        <ul className={`space-y-1.5 ${className}`} aria-label="Étapes">
            {steps.map(s => {
                const dur = s.startedAt ? (s.endedAt ?? (s.state === 'running' ? now : s.startedAt)) - s.startedAt : 0;
                return (
                    <li key={s.id} className="flex items-start gap-2 text-sm text-neutral-900">
                        <span className="mt-0.5 shrink-0">
                            {s.state === 'running' ? <Loader2 className="w-4 h-4 animate-spin text-neutral-900" />
                                : s.state === 'stopped' ? <CircleStop className="w-4 h-4 text-neutral-400" />
                                : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        </span>
                        <span className={`min-w-0 flex-1 ${s.state === 'done' ? 'text-neutral-700' : ''}`}>{s.label}</span>
                        {dur >= 1000 && <span className="shrink-0 tabular-nums text-xs text-neutral-500">{fmt(dur)}</span>}
                    </li>
                );
            })}
        </ul>
    );
}

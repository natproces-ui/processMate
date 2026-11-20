'use client';

/**
 * Trace de travail d'une réponse (comme « A réfléchi pendant 16 s » chez Claude).
 * Pendant le travail : en tête, ce que l'assistant est en train de faire (sa dernière pensée, en
 * quelques mots) ; dessous, ses étapes et ses pensées, dans l'ordre. Les pensées sont écrites par
 * le modèle lui-même (résumés de sa réflexion), les étapes sont les grandes phases du travail.
 * Une fois fini : une ligne repliée « A travaillé pendant 42 s », dépliable.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, CircleStop, Loader2 } from 'lucide-react';

export interface TraceStep {
    id: string; label: string; state: 'running' | 'done' | 'stopped'; startedAt?: number; endedAt?: number;
    /** 'thought' : une pensée du modèle (texte), pas une étape */
    kind?: 'thought';
}

const fmt = (ms: number) => {
    const s = Math.max(1, Math.round(ms / 1000));
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

    if (!running) {
        // Titre replié : ce qui a été fait (« Procédure modifiée · 10 changements, procédure relue »),
        // sinon la dernière pensée, sinon la durée — jamais un libellé fixe
        const actions = steps.filter(st => st.kind !== 'thought' && st.state !== 'running' && st.label).map(st => st.label);
        const lastThought = [...steps].reverse().find(st => st.kind === 'thought');
        const duration = startedAt && endedAt ? fmt(endedAt - startedAt) : null;
        const title = actions.length
            ? actions.slice(0, 3).map((l, i) => (i === 0 ? l : l.charAt(0).toLowerCase() + l.slice(1))).join(', ')
            : lastThought?.label || (duration ? `A réfléchi pendant ${duration}` : `${steps.length} étape${steps.length > 1 ? 's' : ''}`);
        return (
            <div>
                <button type="button" onClick={onToggle} aria-expanded={open} title={title}
                    className="flex max-w-full items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900">
                    <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                    <span className="truncate">{title}</span>
                </button>
                {open && (
                    <div className="mt-2 rounded-xl border border-neutral-200 px-3.5 py-2.5">
                        {duration && <p className="mb-2 text-xs text-neutral-500">A travaillé pendant {duration}</p>}
                        <StepList steps={steps} now={now} />
                    </div>
                )}
            </div>
        );
    }

    // En tête : ce qui se passe maintenant (dernière pensée, sinon l'étape en cours)
    const lastThought = [...steps].reverse().find(s => s.kind === 'thought');
    const current = [...steps].reverse().find(s => s.state === 'running');
    const headline = lastThought?.label || current?.label || 'Je réfléchis';

    return (
        <div className="rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5" aria-live="polite">
            <p className="flex items-start gap-2 text-sm text-neutral-900">
                <Loader2 className="mt-0.5 w-4 h-4 shrink-0 animate-spin" />
                <span className="min-w-0 flex-1 font-medium">{headline}</span>
                {startedAt && <span className="shrink-0 tabular-nums text-neutral-500">{fmt(total)}</span>}
            </p>
            <StepList steps={steps} now={now} className="mt-2" />
        </div>
    );
}

function StepList({ steps, now, className = '' }: { steps: TraceStep[]; now: number; className?: string }) {
    return (
        <ul className={`space-y-1.5 ${className}`} aria-label="Étapes">
            {steps.map(s => {
                if (s.kind === 'thought') {
                    // pensée : du texte, comme une phrase de l'assistant
                    return (
                        <li key={s.id} className="flex items-start gap-2 text-sm text-neutral-600">
                            <span aria-hidden className="mt-2 ml-1.5 mr-1 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                            <span className="min-w-0 flex-1">{s.label}</span>
                        </li>
                    );
                }
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

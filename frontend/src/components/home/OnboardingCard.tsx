'use client';

/**
 * Premiers pas d'un nouvel espace, pour son admin : taxonomie, comptes, première campagne.
 * Disparaît quand tout est fait, ou quand l'admin le masque.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { API_CONFIG } from '@/lib/api-config';

type Steps = { taxonomie: boolean; comptes: boolean; campagne: boolean };
const KEY = 'processmate-demarrage-masque';

const ITEMS: { id: keyof Steps; label: string; href: string }[] = [
    { id: 'taxonomie', label: 'Organiser la taxonomie des processus', href: '/orchestration?tab=procedures' },
    { id: 'comptes', label: 'Créer les comptes de l’équipe', href: '/admin' },
    { id: 'campagne', label: 'Lancer une première campagne', href: '/orchestration?tab=campagnes' },
];

export default function OnboardingCard() {
    const [steps, setSteps] = useState<Steps | null>(null);
    const [hidden, setHidden] = useState(true);

    useEffect(() => {
        try { setHidden(localStorage.getItem(KEY) === '1'); } catch { setHidden(false); }
        fetch(API_CONFIG.getFullUrl('/api/organisation/demarrage'))
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (d?.etapes) setSteps(d.etapes); })
            .catch(() => { /* encart facultatif */ });
    }, []);

    if (hidden || !steps) return null;
    const done = ITEMS.filter(i => steps[i.id]).length;
    if (done === ITEMS.length) return null;

    const hide = () => {
        setHidden(true);
        try { localStorage.setItem(KEY, '1'); } catch { /* navigation privée */ }
    };

    return (
        <section aria-label="Premiers pas" className="rounded-lg border border-blue-100 bg-blue-50/60 p-2.5">
            <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-800">Premiers pas · {done}/{ITEMS.length}</p>
                <button type="button" onClick={hide} aria-label="Masquer les premiers pas" className="p-0.5 rounded text-slate-400 hover:text-slate-700">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
            <ul className="mt-1.5 space-y-1">
                {ITEMS.map(i => (
                    <li key={i.id}>
                        <Link href={i.href} className="flex items-start gap-1.5 text-xs text-slate-700 hover:text-blue-700">
                            {steps[i.id]
                                ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" />
                                : <Circle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />}
                            <span className={steps[i.id] ? 'line-through text-slate-400' : ''}>{i.label}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

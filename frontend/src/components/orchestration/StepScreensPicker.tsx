'use client';

// components/orchestration/StepScreensPicker.tsx
//
// Choix des écrans utilisés par une étape, parmi ceux de son outil (Table1Row.outil).
// Les écrans appartiennent à l'outil (référentiel), l'étape ne fait que les sélectionner
// (TaskEnrichment.ecrans). Partagé par le Studio (DetailModal) et l'espace de travail
// (ProcedureEditor > Outils).

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toolsApi, type ToolScreen, type ToolDetail } from '@/lib/toolsApi';

// Plusieurs étapes partagent souvent le même outil : une seule requête par outil,
// gardée peu de temps pour voir les écrans ajoutés entre-temps dans la fiche outil.
const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { at: number; promise: Promise<ToolDetail | null> }>();

/** Fiche d'un applicatif par son nom (charte + écrans), null s'il n'est pas au référentiel. */
export function loadToolDetail(toolName: string): Promise<ToolDetail | null> {
    const key = toolName.trim().toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
    // Recherche seule, jamais createOrGet : afficher une étape ne doit pas créer
    // l'applicatif dans le référentiel. Absent du référentiel = aucun écran.
    const promise = toolsApi.search(toolName)
        .then(res => res.tools.find(t => t.name.trim().toLowerCase() === key))
        .then(tool => tool ? toolsApi.getDetail(tool.id) : null);
    promise.catch(() => cache.delete(key));
    cache.set(key, { at: Date.now(), promise });
    return promise;
}

export function loadScreens(toolName: string): Promise<ToolScreen[]> {
    return loadToolDetail(toolName).then(detail => detail?.screens ?? []);
}

interface Props {
    toolName: string;
    value: string[];
    onChange?: (ids: string[]) => void;
    readOnly?: boolean;
}

export default function StepScreensPicker({ toolName, value, onChange, readOnly }: Props) {
    const [screens, setScreens] = useState<ToolScreen[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!toolName) { setScreens([]); return; }
        let cancelled = false;
        setScreens(null);
        setError(null);
        loadScreens(toolName)
            .then(s => { if (!cancelled) setScreens(s); })
            .catch(e => { if (!cancelled) setError(e.message || 'Référentiel indisponible'); });
        return () => { cancelled = true; };
    }, [toolName]);

    if (!toolName) {
        return readOnly ? null : (
            <p className="text-xs text-gray-500 italic">Choisissez d'abord l'applicatif de cette étape.</p>
        );
    }
    if (error) return <p className="text-xs text-red-600">{error}</p>;
    if (!screens) return <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />;

    if (readOnly) {
        const selected = screens.filter(s => value.includes(s.id));
        if (selected.length === 0) return null;
        return (
            <div className="flex flex-wrap gap-1">
                {selected.map(s => (
                    <span key={s.id} className="text-[11px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">
                        {s.name}
                    </span>
                ))}
            </div>
        );
    }

    if (screens.length === 0) {
        return (
            <p className="text-xs text-gray-500 italic">
                Aucun écran déclaré pour cet applicatif. Ajoutez-en depuis la fiche applicatif.
            </p>
        );
    }

    const toggle = (id: string) =>
        onChange?.(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);

    return (
        <div className="space-y-1">
            {screens.map(screen => (
                <label key={screen.id}
                    className="flex items-start gap-2 px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={value.includes(screen.id)} onChange={() => toggle(screen.id)} className="mt-0.5" />
                    <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800">{screen.name}</div>
                        <div className="text-xs text-gray-500">
                            {screen.fields.length} champ{screen.fields.length > 1 ? 's' : ''}
                            {screen.description ? ` · ${screen.description}` : ''}
                        </div>
                    </div>
                </label>
            ))}
        </div>
    );
}

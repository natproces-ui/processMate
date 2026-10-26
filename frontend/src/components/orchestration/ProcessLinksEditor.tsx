'use client';

// components/orchestration/ProcessLinksEditor.tsx
//
// Saisie des liens sortants vers d'autres procédures (voir lib/processLinks.ts).
// Sert pour les liens d'étape (fait_appel_a / declenche) comme pour « nécessite »
// au niveau de la procédure : l'appelant choisit les types proposés. Partagé par le
// Studio (DetailModal) et l'espace de travail (ProcedureEditor > Liens).

import { useEffect, useState } from 'react';
import { Plus, X, HelpCircle } from 'lucide-react';
import { orchestrationApi } from '@/lib/orchestrationApi';
import { LINK_HELP, LINK_LABELS, type LinkType } from '@/lib/processLinks';

export interface LinkItem {
    type: LinkType;
    cible: string; // session_id
}

interface ProcedureOption {
    session_id: string;
    nom: string;
}

const CACHE_TTL_MS = 30_000;
let cache: { at: number; promise: Promise<ProcedureOption[]> } | null = null;

export function loadProcedureOptions(): Promise<ProcedureOption[]> {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.promise;
    const promise = orchestrationApi.listProcedures().then(res =>
        res.procedures
            .map(p => ({ session_id: p.session_id, nom: p.nom }))
            .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    );
    promise.catch(() => { cache = null; });
    cache = { at: Date.now(), promise };
    return promise;
}

interface Props {
    value: LinkItem[];
    onChange?: (items: LinkItem[]) => void;
    types: LinkType[];
    /** La procédure en cours : exclue des cibles possibles. */
    excludeSessionId?: string;
    readOnly?: boolean;
}

export default function ProcessLinksEditor({ value, onChange, types, excludeSessionId, readOnly }: Props) {
    const [options, setOptions] = useState<ProcedureOption[] | null>(null);
    const [newType, setNewType] = useState<LinkType>(types[0]);
    const [newCible, setNewCible] = useState('');

    useEffect(() => {
        let cancelled = false;
        loadProcedureOptions()
            .then(o => { if (!cancelled) setOptions(o); })
            .catch(() => { if (!cancelled) setOptions([]); });
        return () => { cancelled = true; };
    }, []);

    const nameOf = (sid: string) =>
        options?.find(o => o.session_id === sid)?.nom ?? (options ? 'Procédure supprimée' : '…');

    const add = () => {
        if (!newCible) return;
        if (value.some(v => v.type === newType && v.cible === newCible)) return;
        onChange?.([...value, { type: newType, cible: newCible }]);
        setNewCible('');
    };

    const remove = (i: number) => onChange?.(value.filter((_, idx) => idx !== i));

    const available = (options ?? []).filter(o => o.session_id !== excludeSessionId);

    return (
        <div className="space-y-1.5">
            {value.length === 0 && readOnly && (
                <p className="text-xs text-gray-400 italic">Aucun lien</p>
            )}
            {value.map((item, i) => (
                <div key={`${item.type}-${item.cible}`} className="flex items-center gap-2 text-sm">
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${LINK_LABELS[item.type].color}`}>
                        {LINK_LABELS[item.type].label}
                    </span>
                    <span className="text-gray-800 truncate">{nameOf(item.cible)}</span>
                    {!readOnly && (
                        <button type="button" onClick={() => remove(i)} title="Retirer le lien"
                            className="ml-auto p-1 text-gray-300 hover:text-red-500 shrink-0">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            ))}

            {!readOnly && (
                <div className="flex items-center gap-2 pt-1">
                    {types.length > 1 ? (
                        <select value={newType} onChange={e => setNewType(e.target.value as LinkType)}
                            className="text-xs px-2 py-1.5 border border-gray-300 rounded-lg bg-white">
                            {types.map(t => <option key={t} value={t}>{LINK_LABELS[t].label}</option>)}
                        </select>
                    ) : (
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${LINK_LABELS[types[0]].color}`}>
                            {LINK_LABELS[types[0]].label}
                        </span>
                    )}
                    <select value={newCible} onChange={e => setNewCible(e.target.value)}
                        disabled={!options}
                        className="flex-1 min-w-0 text-xs px-2 py-1.5 border border-gray-300 rounded-lg bg-white">
                        <option value="">{options ? 'Choisir une procédure…' : 'Chargement…'}</option>
                        {available.map(o => <option key={o.session_id} value={o.session_id}>{o.nom}</option>)}
                    </select>
                    <button type="button" onClick={add} disabled={!newCible}
                        className="flex items-center gap-1 px-2 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 shrink-0">
                        <Plus className="w-3.5 h-3.5" />Lier
                    </button>
                    <span title={LINK_HELP} className="text-gray-400 cursor-help shrink-0">
                        <HelpCircle className="w-4 h-4" />
                    </span>
                </div>
            )}
        </div>
    );
}

'use client';

// components/orchestration/ToolPicker.tsx
//
// Picker chercher-ou-créer pour le référentiel d'outils (voir referentiel-outils.md).
// Même esprit que le sélecteur d'utilisateur de RACIMatrix.tsx : on tape, une liste
// filtrée du référentiel apparaît, et si rien ne correspond une ligne "Créer « X »"
// permet d'ajouter un nouvel outil. Toujours résolu vers un nom canonique via
// toolsApi.createOrGet — jamais de texte libre non passé par le référentiel.
//
// Travaille uniquement avec des noms (string), pas des ids : Table1Row.outil reste un
// string partout ailleurs dans le code (généré tel quel dans le XML BPMN, comparé tel
// quel dans ApplicatifsPanel/ComplexityPanel) — inutile et risqué d'y toucher. Le picker
// garantit juste que ce string vient du référentiel plutôt que d'être tapé à la main.

import { useEffect, useRef, useState } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { toolsApi, type Tool } from '@/lib/toolsApi';

interface ToolPickerProps {
    value: string;
    onChange: (name: string) => void;
    placeholder?: string;
    className?: string;
}

export default function ToolPicker({ value, onChange, placeholder, className }: ToolPickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Tool[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        const t = setTimeout(() => {
            toolsApi.search(query)
                .then(res => setResults(res.tools))
                .catch(() => setResults([]))
                .finally(() => setLoading(false));
        }, 200);
        return () => clearTimeout(t);
    }, [query, open]);

    useEffect(() => {
        if (!open) return;
        function onClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open]);

    const select = async (name: string) => {
        setSaving(true);
        try {
            const res = await toolsApi.createOrGet(name.trim());
            onChange(res.tool.name);
        } catch {
            // Le référentiel est indisponible — ne pas bloquer l'utilisateur, on garde
            // au moins la saisie telle quelle plutôt que de perdre l'information.
            onChange(name.trim());
        } finally {
            setSaving(false);
            setOpen(false);
            setQuery('');
        }
    };

    const exactMatch = results.some(t => t.name.toLowerCase() === query.trim().toLowerCase());

    return (
        <div ref={containerRef} className={`relative ${className ?? ''}`}>
            {open ? (
                <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        autoFocus
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Rechercher un outil…"
                        className="w-full pl-7 pr-6 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <button type="button" onClick={() => { setOpen(false); setQuery(''); }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                        <X className="w-3.5 h-3.5" />
                    </button>

                    <div className="absolute left-0 top-full mt-1 w-64 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-50">
                        {loading ? (
                            <div className="px-3 py-2 text-xs text-gray-400">Recherche…</div>
                        ) : (
                            <>
                                {results.map(t => (
                                    <button key={t.id} type="button" onClick={() => select(t.name)}
                                        disabled={saving}
                                        className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center gap-2 border-b border-gray-50 last:border-b-0 disabled:opacity-50">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color ?? '#94a3b8' }} />
                                        {t.name}
                                    </button>
                                ))}
                                {results.length === 0 && !query.trim() && (
                                    <div className="px-3 py-2 text-xs text-gray-400 italic">Tapez pour rechercher ou créer un outil</div>
                                )}
                                {query.trim() && !exactMatch && (
                                    <button type="button" onClick={() => select(query)} disabled={saving}
                                        className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2 disabled:opacity-50">
                                        <Plus className="w-3.5 h-3.5" />Créer « {query.trim()} »
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            ) : (
                // Double-clic, pas simple clic : la recherche-ou-création ne doit se
                // déclencher que pour ajouter/changer un outil, pas au moindre clic sur
                // une case déjà remplie — un simple clic ne fait donc rien ici.
                <button type="button" onDoubleClick={() => setOpen(true)}
                    title="Double-cliquez pour choisir ou créer un outil"
                    className="w-full text-left px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 transition-colors truncate">
                    {value || <span className="text-gray-400 italic">{placeholder ?? 'Choisir un outil… (double-clic)'}</span>}
                </button>
            )}
        </div>
    );
}

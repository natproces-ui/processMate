'use client';

// components/orchestration/BianScenarioMap.tsx
//
// "Vraie carte" pour naviguer la bibliothèque de scénarios BIAN — même
// langage visuel que BianServiceMap.tsx (tuiles jaunes, en-têtes bleu marine),
// mais sur les catégories réelles issues du scraping (clinic/scripts/bian_scraper.py),
// pas sur l'arbre taxonomique français de BianServiceMap : les deux jeux de
// catégories ne correspondent pas terme à terme (l'un est la taxonomie interne
// ProcessMate, l'autre les catégories BIAN d'origine, en anglais) — les mélanger
// aurait produit un mapping inventé. Clique une tuile → ouvre BianScenarioPicker
// déjà filtré sur cette catégorie.

import { useEffect, useMemo, useState } from 'react';
import { Layers, Loader2, Search, X } from 'lucide-react';
import { bianScenariosApi, type BianScenarioSummary } from '@/lib/bianScenariosApi';
import BianScenarioPicker from '@/components/orchestration/BianScenarioPicker';
import type { Procedure } from '@/lib/orchestrationApi';

const C = {
    tileBg: 'bg-[#FFFFCC]',
    tileText: 'text-gray-900',
    tileBorder: 'border border-[#c8c870]',
    headerBg: 'bg-[#001489]',
    headerText: 'text-white',
};

interface Props {
    onClose: () => void;
    onImported?: (procedure: Procedure, category: string) => void;
    onOpenImported?: (procedure: Procedure) => void;
}

export default function BianScenarioMap({ onClose, onImported, onOpenImported }: Props) {
    const [scenarios, setScenarios] = useState<BianScenarioSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [openCategory, setOpenCategory] = useState<string | null>(null);

    useEffect(() => {
        bianScenariosApi.list()
            .then(res => setScenarios(res.scenarios))
            .catch(e => setError(e instanceof Error ? e.message : 'Erreur de chargement'))
            .finally(() => setLoading(false));
    }, []);

    const categoryCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const s of scenarios) {
            const cat = s.category || 'Sans catégorie';
            counts.set(cat, (counts.get(cat) ?? 0) + 1);
        }
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .filter(([name]) => !query.trim() || name.toLowerCase().includes(query.trim().toLowerCase()));
    }, [scenarios, query]);

    if (openCategory) {
        return (
            <BianScenarioPicker
                onClose={onClose}
                initialCategory={openCategory}
                onImported={onImported}
                onOpenImported={onOpenImported}
            />
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                            <Layers className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-900">Carte des scénarios BIAN</p>
                            <p className="text-xs text-slate-400">
                                {scenarios.length} scénario{scenarios.length > 1 ? 's' : ''} · {categoryCounts.length} catégorie{categoryCounts.length > 1 ? 's' : ''} — cliquez une catégorie
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>

                {/* Search */}
                <div className="px-6 py-3 border-b border-slate-100 shrink-0">
                    <div className="relative max-w-sm">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Filtrer les catégories…"
                            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                    </div>
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-auto p-6 bg-gray-100">
                    {loading ? (
                        <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                    ) : error ? (
                        <p className="text-sm text-red-600">{error}</p>
                    ) : categoryCounts.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center">Aucune catégorie</p>
                    ) : (
                        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                            {categoryCounts.map(([name, count]) => (
                                <button
                                    key={name}
                                    type="button"
                                    onClick={() => setOpenCategory(name)}
                                    className="text-left rounded-md overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                                >
                                    <div className={`${C.headerBg} ${C.headerText} px-2.5 py-1 text-[10px] font-bold flex items-center justify-between gap-1`}>
                                        <span className="truncate">Service Domain</span>
                                        <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-px">{count}</span>
                                    </div>
                                    <div className={`${C.tileBg} ${C.tileText} ${C.tileBorder} px-2.5 py-2.5 text-xs font-medium leading-snug min-h-[3.2rem] flex items-center`}>
                                        {name}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

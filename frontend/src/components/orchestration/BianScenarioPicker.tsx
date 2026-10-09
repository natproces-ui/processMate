'use client';

// components/orchestration/BianScenarioPicker.tsx
//
// "Partir d'un scénario BIAN" — parcourt la bibliothèque de 343 Business
// Scenarios scrapés depuis bian.org (clinic/scripts/bian_scraper.py) et
// convertit le choix en procédure ProcessMate normale (brouillon), sur le
// même modèle que ImportPdfModal mais sans passer par un fichier ni l'IA.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Layers, Loader2, Search, Users, X } from 'lucide-react';
import { bianScenariosApi, type BianScenarioDetail, type BianScenarioSummary } from '@/lib/bianScenariosApi';
import type { Procedure } from '@/lib/orchestrationApi';
import type { Table1Row } from '@/logic/types';
import { generateBPMNSimple } from '@/logic/bpmnGeneratorSimple';
import BpmnHighlightViewer from '@/components/orchestration/BpmnHighlightViewer';

// Même mapping que clinic/routers/bian_scenarios_router.py::_scenario_to_workflow —
// tenu côté client pour prévisualiser le diagramme avant de créer quoi que ce soit.
// BIAN n'a pas de notion de rôle humain : chaque étape devient à la fois `acteur`
// (lane) et `outil`, portée par le participant "to" (celui qui exécute l'action).
function scenarioToTable1Rows(scenario: BianScenarioDetail): Table1Row[] {
    const mkRow = (id: string, étape: string, typeBpmn: Table1Row['typeBpmn'], acteur = '', outil = ''): Table1Row => ({
        id, étape, typeBpmn, département: scenario.category || '', acteur, typeActeur: '', condition: '', outputs: [], outil,
    });

    const rows: Table1Row[] = [];
    const startId = crypto.randomUUID();
    rows.push(mkRow(startId, 'Début', 'StartEvent'));

    let prevId = startId;
    for (const step of scenario.steps) {
        const id = crypto.randomUUID();
        const actor = step.to || step.from || 'Système';
        rows.push(mkRow(id, step.action || 'TBD', 'Task', actor, actor));
        const prev = rows.find(r => r.id === prevId)!;
        prev.outputs = [{ targetId: id, label: '' }];
        prevId = id;
    }

    const endId = crypto.randomUUID();
    rows.push(mkRow(endId, 'Fin', 'EndEvent'));
    const prev = rows.find(r => r.id === prevId)!;
    prev.outputs = [{ targetId: endId, label: '' }];

    return rows;
}

interface Props {
    onClose: () => void;
    onImported?: (procedure: Procedure, category: string) => void;
    onOpenImported?: (procedure: Procedure) => void;
    initialCategory?: string;
}

export default function BianScenarioPicker({ onClose, onImported, onOpenImported, initialCategory }: Props) {
    const [scenarios, setScenarios] = useState<BianScenarioSummary[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [category, setCategory] = useState(initialCategory ?? '');
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selected, setSelected] = useState<BianScenarioDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [previewXml, setPreviewXml] = useState<string | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [nom, setNom] = useState('');
    const [importing, setImporting] = useState(false);
    const [imported, setImported] = useState<Procedure | null>(null);
    const [importError, setImportError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await bianScenariosApi.list({ category: category || undefined, q: query || undefined });
            setScenarios(res.scenarios);
            setCategories(res.categories);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erreur de chargement');
        } finally {
            setLoading(false);
        }
    }, [category, query]);

    useEffect(() => { load(); }, [load]);

    const openDetail = async (s: BianScenarioSummary) => {
        setLoadingDetail(true);
        setNom(s.title);
        setImported(null);
        setImportError(null);
        setPreviewXml(null);
        setPreviewError(null);
        try {
            const res = await bianScenariosApi.get(s.id);
            setSelected(res.scenario);
            try {
                const rows = scenarioToTable1Rows(res.scenario);
                setPreviewXml(generateBPMNSimple(rows, res.scenario.title));
            } catch (e) {
                setPreviewError(e instanceof Error ? e.message : 'Impossible de générer le diagramme');
            }
        } catch (e) {
            setImportError(e instanceof Error ? e.message : 'Erreur de chargement');
        } finally {
            setLoadingDetail(false);
        }
    };

    const handleImport = async () => {
        if (!selected || !nom.trim()) return;
        setImporting(true); setImportError(null);
        try {
            const res = await bianScenariosApi.import(selected.id, nom.trim(), selected.category ?? undefined);
            setImported(res.procedure);
            onImported?.(res.procedure, res.procedure.category);
        } catch (e) {
            setImportError(e instanceof Error ? e.message : 'Erreur de création');
        } finally {
            setImporting(false);
        }
    };

    const filtered = useMemo(() => scenarios, [scenarios]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                            <Layers className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-900">Partir d&apos;un scénario BIAN</p>
                            <p className="text-xs text-slate-400">
                                {scenarios.length} scénario{scenarios.length > 1 ? 's' : ''} de référence · à retravailler après création
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Liste + filtres */}
                    <div className="w-1/2 border-r border-slate-100 flex flex-col overflow-hidden">
                        <div className="p-3 border-b border-slate-100 space-y-2 shrink-0">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                <input
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Rechercher un scénario…"
                                    className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                />
                            </div>
                            <select
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            >
                                <option value="">Toutes les catégories</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {loading ? (
                                <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                            ) : error ? (
                                <p className="text-xs text-red-600 p-3">{error}</p>
                            ) : filtered.length === 0 ? (
                                <p className="text-xs text-slate-400 p-3 text-center">Aucun scénario</p>
                            ) : filtered.map(s => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => openDetail(s)}
                                    className={`w-full text-left p-2.5 rounded-lg border transition-colors ${selected?.id === s.id ? 'border-indigo-300 bg-indigo-50' : 'border-transparent hover:bg-slate-50'
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-medium text-slate-800 leading-snug">{s.title}</p>
                                        {s.status === 'imported' && (
                                            <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">déjà utilisé</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                                        {s.category && <span>{s.category}</span>}
                                        <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{s.participants.length}</span>
                                        <span>{s.steps_count} étape{s.steps_count > 1 ? 's' : ''}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Détail + import */}
                    <div className="w-1/2 flex flex-col overflow-hidden">
                        {!selected ? (
                            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                                Sélectionnez un scénario
                            </div>
                        ) : loadingDetail ? (
                            <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                        ) : imported ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                                <p className="text-sm font-semibold text-green-800">Procédure créée : {imported.nom}</p>
                                {onOpenImported && (
                                    <button
                                        type="button"
                                        onClick={() => { onOpenImported(imported); onClose(); }}
                                        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                                    >
                                        Ouvrir la procédure <ArrowRight className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto p-5 space-y-4">
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{selected.category}</p>
                                    <h3 className="text-base font-bold text-slate-900 mt-0.5">{selected.title}</h3>
                                </div>

                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Participants</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {selected.participants.map(p => (
                                            <span key={p} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{p}</span>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                        Processus ({selected.steps.length} étape{selected.steps.length > 1 ? 's' : ''})
                                    </p>
                                    <div className="h-72 rounded-lg border border-slate-200 overflow-hidden">
                                        {previewError ? (
                                            <div className="h-full flex items-center justify-center px-4 text-center text-xs text-red-600">
                                                {previewError}
                                            </div>
                                        ) : previewXml ? (
                                            <BpmnHighlightViewer xml={previewXml} highlightedSteps={[]} />
                                        ) : (
                                            <div className="h-full flex items-center justify-center">
                                                <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                                            </div>
                                        )}
                                    </div>
                                    <p className="mt-1 text-[10px] text-slate-400">
                                        Aperçu — les lanes correspondent aux Service Domains BIAN, à retravailler après création.
                                    </p>
                                </div>

                                <div className="border-t border-slate-100 pt-4">
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nom de la procédure</label>
                                    <input
                                        value={nom}
                                        onChange={e => setNom(e.target.value)}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                    />
                                    {importError && <p className="mt-1.5 text-xs text-red-600">{importError}</p>}
                                    <button
                                        type="button"
                                        onClick={handleImport}
                                        disabled={importing || !nom.trim()}
                                        className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        Utiliser ce scénario
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

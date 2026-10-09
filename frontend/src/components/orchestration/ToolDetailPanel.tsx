'use client';

// components/orchestration/ToolDetailPanel.tsx
//
// "Fiche outil" — gère écrans, champs (avec extraction IA) et codes d'un outil du
// référentiel. Voir referentiel-outils.md, Prompt 5 : c'était la pièce manquante
// (les endpoints existaient déjà côté toolsApi.ts, mais aucun écran pour les utiliser).
// Ouverte comme modale depuis trois endroits : ApplicatifsPanel (niveau outil),
// ProcessTable (niveau tableau), ProcedureEditor > Outils (niveau procédure).

import { useEffect, useState } from 'react';
import {
    X, Plus, Trash2, Sparkles, Loader2, Upload, Monitor,
    AlertCircle, Check, Hash, ClipboardList, Database,
} from 'lucide-react';
import {
    toolsApi, type ToolDetail, type ToolScreen, type ToolCode,
    type ToolFieldType, type ToolCodeType, type ExtractedField,
    type ToolRuleType, type ToolDataNature,
    type ToolBusinessRule, type ToolDataEntity,
} from '@/lib/toolsApi';
import ReportToolIssueButton from '@/components/shared/ReportToolIssueButton';

interface ToolDetailPanelProps {
    toolName: string;
    onClose: () => void;
}

const FIELD_TYPES: ToolFieldType[] = ['texte', 'nombre', 'date', 'liste'];
const CODE_TYPES: { value: ToolCodeType; label: string }[] = [
    { value: 'transaction', label: 'Transaction' },
    { value: 'produit', label: 'Produit / référence' },
    { value: 'erreur', label: 'Erreur / retour' },
    { value: 'informatique', label: 'Code informatique' },
];
const RULE_TYPES: { value: ToolRuleType; label: string }[] = [
    { value: 'validation', label: 'Validation' },
    { value: 'calcul', label: 'Calcul' },
    { value: 'controle', label: 'Contrôle' },
    { value: 'autre', label: 'Autre' },
];
const DATA_NATURES: { value: ToolDataNature; label: string }[] = [
    { value: 'entree', label: 'Entrée' },
    { value: 'sortie', label: 'Sortie' },
    { value: 'reference', label: 'Référence' },
];

export default function ToolDetailPanel({ toolName, onClose }: ToolDetailPanelProps) {
    const [toolId, setToolId] = useState<string | null>(null);
    const [detail, setDetail] = useState<ToolDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = async (id: string) => {
        setLoading(true);
        try {
            const res = await toolsApi.getDetail(id);
            setDetail(res);
            setError(null);
        } catch (e: any) {
            setError(e.message || 'Erreur de chargement');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // Résout le nom vers l'entrée du référentiel — createOrGet plutôt que
                // search seul : si l'outil a été tapé avant l'existence du référentiel
                // (données historiques), on le fait exister plutôt que d'échouer.
                const res = await toolsApi.createOrGet(toolName);
                if (cancelled) return;
                setToolId(res.tool.id);
                await load(res.tool.id);
            } catch (e: any) {
                if (!cancelled) { setError(e.message || 'Référentiel indisponible'); setLoading(false); }
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toolName]);

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-xl shadow-xl overflow-hidden flex flex-col">
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Fiche outil</p>
                        <h3 className="font-bold text-gray-900 text-lg">{toolName}</h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <ReportToolIssueButton toolName={toolName} />
                        <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
                            <X className="w-4 h-4 text-gray-500" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    {loading && (
                        <div className="flex items-center justify-center py-12 text-gray-400">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />Chargement…
                        </div>
                    )}
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
                            <AlertCircle className="w-4 h-4 shrink-0" />{error}
                        </div>
                    )}

                    {detail && toolId && (
                        <>
                            <ScreensSection toolId={toolId} screens={detail.screens} onReload={() => load(toolId)} />
                            <CodesSection toolId={toolId} codes={detail.codes} onReload={() => load(toolId)} />
                            <RulesSection toolId={toolId} rules={detail.business_rules} onReload={() => load(toolId)} />
                            <DataEntitiesSection toolId={toolId} entities={detail.data_entities} onReload={() => load(toolId)} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Écrans ─────────────────────────────────────────────────────

function ScreensSection({ toolId, screens, onReload }: {
    toolId: string; screens: ToolScreen[]; onReload: () => void;
}) {
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            await toolsApi.addScreen(toolId, name.trim(), description.trim(), file ?? undefined);
            setName(''); setDescription(''); setFile(null); setAdding(false);
            onReload();
        } catch { /* laissé visible via l'absence de nouvel écran — pas de blocage silencieux */ }
        finally { setSaving(false); }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                    <Monitor className="w-4 h-4 text-blue-500" />Écrans ({screens.length})
                </h4>
                {!adding && (
                    <button type="button" onClick={() => setAdding(true)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                        <Plus className="w-3.5 h-3.5" />Ajouter un écran
                    </button>
                )}
            </div>

            {adding && (
                <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-3 space-y-2">
                    <input type="text" value={name} onChange={e => setName(e.target.value)}
                        placeholder="Nom de l'écran (ex : Saisie virement)"
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg" autoFocus />
                    <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                        placeholder="Description (optionnel)"
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg" />
                    <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        {file ? file.name : 'Joindre une capture d\'écran (optionnel)'}
                        <input type="file" accept="image/*" className="hidden"
                            onChange={e => setFile(e.target.files?.[0] ?? null)} />
                    </label>
                    <div className="flex justify-end gap-2 pt-1">
                        <button type="button" onClick={() => { setAdding(false); setName(''); setDescription(''); setFile(null); }}
                            className="px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Annuler</button>
                        <button type="button" onClick={submit} disabled={!name.trim() || saving}
                            className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                            {saving ? 'Ajout…' : 'Ajouter'}
                        </button>
                    </div>
                </div>
            )}

            {screens.length === 0 && !adding && (
                <p className="text-xs text-gray-400 italic px-1">Aucun écran renseigné pour cet outil.</p>
            )}

            <div className="space-y-3">
                {screens.map(screen => (
                    <ScreenCard key={screen.id} screen={screen} onReload={onReload} />
                ))}
            </div>
        </div>
    );
}

function ScreenCard({ screen, onReload }: { screen: ToolScreen; onReload: () => void }) {
    const [extracting, setExtracting] = useState(false);
    const [proposed, setProposed] = useState<ExtractedField[] | null>(null);
    const [extractError, setExtractError] = useState<string | null>(null);
    const [addingField, setAddingField] = useState(false);
    const [fieldName, setFieldName] = useState('');
    const [fieldType, setFieldType] = useState<ToolFieldType>('texte');
    const [fieldRequired, setFieldRequired] = useState(false);

    const [selectedProposed, setSelectedProposed] = useState<Set<number>>(new Set());
    const [addingSelection, setAddingSelection] = useState(false);

    const extract = async () => {
        setExtracting(true); setExtractError(null);
        try {
            const res = await toolsApi.extractFields(screen.id);
            setProposed(res.fields);
            setSelectedProposed(new Set(res.fields.map((_, i) => i))); // tout coché par défaut, à décocher au besoin
        } catch (e: any) {
            setExtractError(e.message || 'Extraction impossible');
        } finally {
            setExtracting(false);
        }
    };

    const toggleProposed = (i: number) => {
        setSelectedProposed(prev => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i); else next.add(i);
            return next;
        });
    };

    const addSelectedProposed = async () => {
        if (!proposed || selectedProposed.size === 0) return;
        setAddingSelection(true);
        try {
            const toAdd = proposed.filter((_, i) => selectedProposed.has(i));
            for (const f of toAdd) {
                await toolsApi.addField(screen.id, {
                    name: f.name, field_type: f.field_type, required: f.required, example_value: f.example_value,
                });
            }
            setProposed(prev => prev ? prev.filter((_, i) => !selectedProposed.has(i)) : prev);
            setSelectedProposed(new Set());
            onReload();
        } finally {
            setAddingSelection(false);
        }
    };

    const addManualField = async () => {
        if (!fieldName.trim()) return;
        await toolsApi.addField(screen.id, {
            name: fieldName.trim(), field_type: fieldType, required: fieldRequired, example_value: '',
        });
        setFieldName(''); setFieldType('texte'); setFieldRequired(false); setAddingField(false);
        onReload();
    };

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{screen.name}</p>
                    {screen.description && <p className="text-xs text-gray-400 truncate">{screen.description}</p>}
                </div>
                <button type="button" onClick={() => toolsApi.deleteScreen(screen.id).then(onReload)}
                    className="p-1 text-gray-300 hover:text-red-500 shrink-0" title="Supprimer l'écran">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="p-4 space-y-3">
                {screen.screenshot_path && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={toolsApi.screenshotUrl(screen.id)} alt={screen.name}
                        className="max-h-48 rounded-lg border border-gray-200" />
                )}

                {/* Champs déjà enregistrés */}
                {screen.fields.length > 0 && (
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-left text-gray-400 uppercase tracking-wide">
                                <th className="pb-1 font-semibold">Champ</th>
                                <th className="pb-1 font-semibold w-20">Type</th>
                                <th className="pb-1 font-semibold w-16">Obligatoire</th>
                                <th className="pb-1 font-semibold">Exemple</th>
                                <th className="pb-1 w-6" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {screen.fields.map(f => (
                                <tr key={f.id}>
                                    <td className="py-1.5 font-medium text-gray-700">{f.name}</td>
                                    <td className="py-1.5 text-gray-500">{f.field_type}</td>
                                    <td className="py-1.5 text-gray-500">{f.required ? 'Oui' : 'Non'}</td>
                                    <td className="py-1.5 text-gray-400">{f.example_value || '—'}</td>
                                    <td className="py-1.5">
                                        <button type="button" onClick={() => toolsApi.deleteField(f.id).then(onReload)}
                                            className="text-gray-300 hover:text-red-500">
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Champs proposés par l'IA — cochés par défaut, jamais sauvegardés
                    automatiquement : décochez ce qui ne convient pas puis ajoutez la
                    sélection en un seul geste. */}
                {proposed && proposed.length > 0 && (
                    <div className="bg-violet-50 border border-violet-200 rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] font-semibold text-violet-700 uppercase tracking-wide">
                                Proposés par l&apos;IA — décochez ce qui ne convient pas
                            </p>
                            <div className="flex items-center gap-2 text-[11px]">
                                <button type="button" onClick={() => setSelectedProposed(new Set(proposed.map((_, i) => i)))}
                                    className="text-violet-600 hover:text-violet-800 font-medium">Tout cocher</button>
                                <button type="button" onClick={() => setSelectedProposed(new Set())}
                                    className="text-gray-500 hover:text-gray-700 font-medium">Tout décocher</button>
                            </div>
                        </div>
                        {proposed.map((f, i) => (
                            <label key={i} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 text-xs cursor-pointer">
                                <input type="checkbox" checked={selectedProposed.has(i)} onChange={() => toggleProposed(i)}
                                    className="shrink-0" />
                                <span className="text-gray-700 truncate flex-1">
                                    <strong>{f.name}</strong> — {f.field_type}{f.required ? ' · obligatoire' : ''}
                                    {f.example_value && <span className="text-gray-400"> · ex: {f.example_value}</span>}
                                </span>
                            </label>
                        ))}
                        <div className="flex justify-end pt-1">
                            <button type="button" onClick={addSelectedProposed} disabled={selectedProposed.size === 0 || addingSelection}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-40">
                                {addingSelection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                Ajouter la sélection ({selectedProposed.size})
                            </button>
                        </div>
                    </div>
                )}
                {proposed && proposed.length === 0 && (
                    <p className="text-xs text-gray-400 italic">Tous les champs proposés ont été traités.</p>
                )}
                {extractError && (
                    <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{extractError}</p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                    <button type="button" onClick={extract} disabled={extracting || !screen.screenshot_path}
                        title={!screen.screenshot_path ? 'Ajoutez une capture pour pouvoir extraire les champs' : undefined}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg text-xs font-medium hover:bg-violet-100 disabled:opacity-40">
                        {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Extraire les champs avec l&apos;IA
                    </button>
                    <button type="button" onClick={() => setAddingField(a => !a)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50">
                        <Plus className="w-3.5 h-3.5" />Champ manuel
                    </button>
                </div>

                {addingField && (
                    <div className="flex items-center gap-2 flex-wrap bg-gray-50 rounded-lg p-2">
                        <input type="text" value={fieldName} onChange={e => setFieldName(e.target.value)}
                            placeholder="Nom du champ" className="flex-1 min-w-[120px] px-2 py-1 text-xs border border-gray-200 rounded" autoFocus />
                        <select value={fieldType} onChange={e => setFieldType(e.target.value as ToolFieldType)}
                            className="px-2 py-1 text-xs border border-gray-200 rounded">
                            {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <label className="flex items-center gap-1 text-xs text-gray-500">
                            <input type="checkbox" checked={fieldRequired} onChange={e => setFieldRequired(e.target.checked)} />
                            Obligatoire
                        </label>
                        <button type="button" onClick={addManualField} disabled={!fieldName.trim()}
                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded disabled:opacity-50">Ajouter</button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Codes ──────────────────────────────────────────────────────

function CodesSection({ toolId, codes, onReload }: {
    toolId: string; codes: ToolCode[]; onReload: () => void;
}) {
    const [adding, setAdding] = useState(false);
    const [codeType, setCodeType] = useState<ToolCodeType>('transaction');
    const [code, setCode] = useState('');
    const [language, setLanguage] = useState('');
    const [description, setDescription] = useState('');
    const isSnippet = codeType === 'informatique';

    const submit = async () => {
        if (!code.trim()) return;
        await toolsApi.addCode(toolId, {
            code_type: codeType, code: code.trim(),
            language: isSnippet ? (language.trim() || null) : null,
            description: description.trim() || null,
        });
        setCode(''); setLanguage(''); setDescription(''); setAdding(false);
        onReload();
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                    <Hash className="w-4 h-4 text-emerald-500" />Codes ({codes.length})
                </h4>
                {!adding && (
                    <button type="button" onClick={() => setAdding(true)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                        <Plus className="w-3.5 h-3.5" />Ajouter un code
                    </button>
                )}
            </div>

            {adding && (
                <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <select value={codeType} onChange={e => setCodeType(e.target.value as ToolCodeType)}
                            className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg">
                            {CODE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        {isSnippet && (
                            <input type="text" value={language} onChange={e => setLanguage(e.target.value)}
                                placeholder="Langage (SQL, COBOL, API REST…)"
                                className="flex-1 min-w-[140px] px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg" />
                        )}
                        {!isSnippet && (
                            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                                placeholder="Description (optionnel)"
                                className="flex-1 min-w-[140px] px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg" />
                        )}
                    </div>

                    {isSnippet ? (
                        <textarea value={code} onChange={e => setCode(e.target.value)}
                            placeholder="Collez le code ici…" rows={6}
                            className="w-full px-2.5 py-1.5 text-xs font-mono border border-gray-200 rounded-lg resize-y" autoFocus />
                    ) : (
                        <input type="text" value={code} onChange={e => setCode(e.target.value)}
                            placeholder="Code" className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg" autoFocus />
                    )}
                    {isSnippet && (
                        <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                            placeholder="Description (optionnel) — à quoi sert ce code, où il est utilisé…"
                            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg" />
                    )}

                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setAdding(false)} className="px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Annuler</button>
                        <button type="button" onClick={submit} disabled={!code.trim()}
                            className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Ajouter</button>
                    </div>
                </div>
            )}

            {codes.length === 0 && !adding && (
                <p className="text-xs text-gray-400 italic px-1">Aucun code renseigné pour cet outil.</p>
            )}

            {CODE_TYPES.map(({ value, label }) => {
                const group = codes.filter(c => c.code_type === value);
                if (group.length === 0) return null;
                return (
                    <div key={value} className="space-y-1">
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
                        {value === 'informatique' ? (
                            <div className="space-y-2">
                                {group.map(c => (
                                    <div key={c.id} className="bg-gray-900 rounded-lg p-3 relative group">
                                        <button type="button" onClick={() => toolsApi.deleteCode(c.id).then(onReload)}
                                            className="absolute top-2 right-2 text-gray-500 hover:text-red-400">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                        <div className="flex items-center gap-2 mb-1.5">
                                            {c.language && (
                                                <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded">
                                                    {c.language}
                                                </span>
                                            )}
                                            {c.description && <span className="text-[11px] text-gray-400">{c.description}</span>}
                                        </div>
                                        <pre className="text-xs font-mono text-gray-100 whitespace-pre-wrap overflow-x-auto">{c.code}</pre>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-1.5">
                                {group.map(c => (
                                    <span key={c.id} title={c.description || undefined}
                                        className="inline-flex items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-full px-2.5 py-1 text-xs text-gray-700">
                                        {c.code}
                                        <button type="button" onClick={() => toolsApi.deleteCode(c.id).then(onReload)}
                                            className="text-gray-300 hover:text-red-500">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Règles de gestion (ce que l'outil impose/vérifie) ─────────

function RulesSection({ toolId, rules, onReload }: {
    toolId: string; rules: ToolBusinessRule[]; onReload: () => void;
}) {
    const [adding, setAdding] = useState(false);
    const [ruleType, setRuleType] = useState<ToolRuleType>('validation');
    const [rule, setRule] = useState('');
    const [description, setDescription] = useState('');

    const submit = async () => {
        if (!rule.trim()) return;
        await toolsApi.addRule(toolId, {
            rule: rule.trim(), rule_type: ruleType, description: description.trim() || null,
        });
        setRule(''); setDescription(''); setAdding(false);
        onReload();
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                    <ClipboardList className="w-4 h-4 text-amber-500" />Règles de gestion ({rules.length})
                </h4>
                {!adding && (
                    <button type="button" onClick={() => setAdding(true)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                        <Plus className="w-3.5 h-3.5" />Ajouter une règle
                    </button>
                )}
            </div>

            {adding && (
                <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-3 space-y-2">
                    <select value={ruleType} onChange={e => setRuleType(e.target.value as ToolRuleType)}
                        className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg">
                        {RULE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <textarea value={rule} onChange={e => setRule(e.target.value)}
                        placeholder="Ce que l'outil impose ou vérifie (ex : le montant ne peut pas dépasser le plafond journalier)"
                        rows={2} className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg resize-y" autoFocus />
                    <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                        placeholder="Contexte (optionnel)"
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg" />
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setAdding(false)} className="px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Annuler</button>
                        <button type="button" onClick={submit} disabled={!rule.trim()}
                            className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Ajouter</button>
                    </div>
                </div>
            )}

            {rules.length === 0 && !adding && (
                <p className="text-xs text-gray-400 italic px-1">Aucune règle de gestion renseignée pour cet outil.</p>
            )}

            <div className="space-y-2">
                {rules.map(r => (
                    <div key={r.id} className="bg-amber-50/40 border border-amber-100 rounded-lg p-3 relative group">
                        <button type="button" onClick={() => toolsApi.deleteRule(r.id).then(onReload)}
                            className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                            {RULE_TYPES.find(t => t.value === r.rule_type)?.label ?? r.rule_type}
                        </span>
                        <p className="text-sm text-gray-800 mt-1.5">{r.rule}</p>
                        {r.description && <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Données (entités/objets métier manipulés par l'outil) ─────

function DataEntitiesSection({ toolId, entities, onReload }: {
    toolId: string; entities: ToolDataEntity[]; onReload: () => void;
}) {
    const [adding, setAdding] = useState(false);
    const [nature, setNature] = useState<ToolDataNature>('reference');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    const submit = async () => {
        if (!name.trim()) return;
        await toolsApi.addDataEntity(toolId, {
            name: name.trim(), nature, description: description.trim() || null,
        });
        setName(''); setDescription(''); setAdding(false);
        onReload();
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-teal-500" />Données ({entities.length})
                </h4>
                {!adding && (
                    <button type="button" onClick={() => setAdding(true)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                        <Plus className="w-3.5 h-3.5" />Ajouter une donnée
                    </button>
                )}
            </div>

            {adding && (
                <div className="bg-teal-50/50 border border-teal-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <select value={nature} onChange={e => setNature(e.target.value as ToolDataNature)}
                            className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg">
                            {DATA_NATURES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <input type="text" value={name} onChange={e => setName(e.target.value)}
                            placeholder="Nom de la donnée (ex : Compte client, Dossier de crédit)"
                            className="flex-1 min-w-[160px] px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg" autoFocus />
                    </div>
                    <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                        placeholder="Description (optionnel)"
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg" />
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setAdding(false)} className="px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Annuler</button>
                        <button type="button" onClick={submit} disabled={!name.trim()}
                            className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Ajouter</button>
                    </div>
                </div>
            )}

            {entities.length === 0 && !adding && (
                <p className="text-xs text-gray-400 italic px-1">Aucune donnée renseignée pour cet outil.</p>
            )}

            <div className="flex flex-wrap gap-1.5">
                {entities.map(d => (
                    <span key={d.id} title={d.description || undefined}
                        className="inline-flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded-full px-2.5 py-1 text-xs text-teal-800">
                        <span className="text-[9px] font-semibold uppercase text-teal-500">{DATA_NATURES.find(t => t.value === d.nature)?.label ?? d.nature}</span>
                        {d.name}
                        <button type="button" onClick={() => toolsApi.deleteDataEntity(d.id).then(onReload)}
                            className="text-teal-300 hover:text-red-500">
                            <X className="w-3 h-3" />
                        </button>
                    </span>
                ))}
            </div>
        </div>
    );
}

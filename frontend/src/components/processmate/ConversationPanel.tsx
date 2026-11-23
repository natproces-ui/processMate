'use client';

// Panneau de la conversation, à la manière de Claude : ce qu'elle a produit (« Sorties » : les procédures, leur état
// et leurs versions) et ce qu'elle a utilisé (sources jointes). docs/conversation-serveur.md.
import { Download, FileText, Globe, History, Image as ImageIcon, Layers, Loader2, Presentation, RotateCcw, Search, Table2, Workflow, X } from 'lucide-react';
import type { ConversationSource, WebSearch } from '@/lib/conversationsApi';


export interface ConversationOutput {
    key: string;
    title: string;
    steps: number;
    status: 'generating' | 'ready' | 'error';
    archived?: boolean;
    version?: number;
    saved_version?: number | null;
    workflow_db_id?: string;
}

/** État d'une procédure de la conversation par rapport au référentiel */
export function outputState(p: ConversationOutput): { label: string; tone: string } {
    if (p.archived) return { label: 'Remplacée', tone: 'bg-neutral-100 text-neutral-500' };
    if (p.status === 'generating') return { label: 'En cours', tone: 'bg-amber-50 text-amber-700' };
    if (p.status === 'error') return { label: 'Erreur', tone: 'bg-red-50 text-red-700' };
    if (p.workflow_db_id && p.saved_version != null && p.version != null && p.version > p.saved_version)
        return { label: 'Modifiée depuis l’enregistrement', tone: 'bg-amber-50 text-amber-800' };
    if (p.workflow_db_id) return { label: 'Enregistrée', tone: 'bg-emerald-50 text-emerald-700' };
    return { label: 'Brouillon', tone: 'bg-neutral-100 text-neutral-600' };
}

const SOURCE_ICON: Record<string, typeof FileText> = { image: ImageIcon, pptx: Presentation, xlsx: Table2 };

/** Procédures à enregistrer d'un coup : jamais enregistrées, ou modifiées depuis l'enregistrement */
export function toSave(outputs: ConversationOutput[]): ConversationOutput[] {
    return outputs.filter(o => !o.archived && o.status === 'ready' && o.steps > 0 &&
        (!o.workflow_db_id || outputState(o).label.startsWith('Modifiée')));
}

export default function ConversationPanel({ outputs, activeKey, sources, references = [], searches = [], citations = {}, canSave, versionsEnabled, onOpen, onRestore, onUpdate,
    onVersions, onSaveAll, canDownload = false, downloading = false, onDownloadAll, onClose }: {
    outputs: ConversationOutput[];
    activeKey?: string | null;
    sources: ConversationSource[];
    /** fichiers désignés comme modèles de style (forme, formulation), pas comme sources de contenu */
    references?: string[];
    /** recherches sur internet faites dans la conversation */
    searches?: WebSearch[];
    /** nombre d'étapes (procédures actives) qui citent chaque fichier */
    citations?: Record<string, number>;
    canSave: boolean;
    versionsEnabled: boolean;
    onOpen: (key: string) => void;
    onRestore: (key: string) => void;
    onUpdate: (key: string) => void;
    onVersions: (key: string) => void;
    onSaveAll: () => void;
    canDownload?: boolean;
    downloading?: boolean;
    onDownloadAll?: () => void;
    onClose: () => void;
}) {
    const pending = toSave(outputs);
    const active = outputs.filter(o => !o.archived);
    const archived = outputs.filter(o => o.archived);
    const saved = active.filter(o => o.workflow_db_id).length;
    return (
        <aside aria-label="Cette conversation" className="absolute inset-y-0 right-0 z-30 w-full sm:w-96 bg-white border-l border-neutral-200 shadow-xl flex flex-col">
            <div className="px-4 py-3 border-b border-neutral-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-neutral-900" />
                <h2 className="text-sm font-semibold text-neutral-900">Cette conversation</h2>
                <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
                <section className="px-4 py-3">
                    <div className="flex items-baseline justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Sorties</h3>
                        <span className="flex items-center gap-2">
                            {active.length > 0 && <span className="text-[11px] text-neutral-500">{saved}/{active.length} enregistrée{saved > 1 ? 's' : ''}</span>}
                            {canDownload && onDownloadAll && active.some(o => o.status === 'ready' && o.steps > 0) && (
                                <button type="button" onClick={onDownloadAll} disabled={downloading} aria-label="Tout télécharger"
                                    title="Tout télécharger : pour chaque procédure, sa fiche Word, son logigramme et son tableau Excel (une archive .zip)"
                                    className="p-1 rounded-md text-neutral-700 hover:bg-neutral-100 disabled:opacity-40">
                                    {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                </button>
                            )}
                        </span>
                    </div>
                    {active.length === 0 && <p className="mt-2 text-xs text-neutral-500">Aucune procédure pour l’instant.</p>}
                    <ul className="mt-2 space-y-1">
                        {active.map(o => {
                            const st = outputState(o);
                            const modified = st.label.startsWith('Modifiée');
                            return (
                                <li key={o.key} className={`group rounded-lg border ${o.key === activeKey ? 'border-neutral-900' : 'border-neutral-200'} hover:bg-neutral-50`}>
                                    <button type="button" onClick={() => onOpen(o.key)} className="w-full text-left px-3 pt-2 pb-1.5 flex items-start gap-2">
                                        <Workflow className="w-4 h-4 mt-0.5 shrink-0 text-neutral-900" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-medium text-neutral-900 truncate" title={o.title}>{o.title}</span>
                                            <span className="block text-[11px] text-neutral-500">{o.steps} étape{o.steps > 1 ? 's' : ''}{o.version ? `, version ${o.version}` : ''}</span>
                                        </span>
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.tone}`}>{st.label}</span>
                                    </button>
                                    {(modified && canSave) || (versionsEnabled && o.version) ? (
                                        <div className="px-3 pb-2 flex gap-3 pl-9">
                                            {modified && canSave && (
                                                <button type="button" onClick={() => onUpdate(o.key)} className="text-[11px] font-semibold text-neutral-900 underline underline-offset-2">
                                                    Mettre à jour le référentiel
                                                </button>
                                            )}
                                            {versionsEnabled && !!o.version && (
                                                <button type="button" onClick={() => onVersions(o.key)} className="inline-flex items-center gap-1 text-[11px] text-neutral-600 hover:text-neutral-900">
                                                    <History className="w-3 h-3" />Versions
                                                </button>
                                            )}
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                    {canSave && pending.length > 1 && (
                        <button type="button" onClick={onSaveAll}
                            className="mt-3 w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700">
                            Tout enregistrer ({pending.length})
                        </button>
                    )}
                    {archived.length > 0 && (
                        <>
                            <h4 className="mt-3 text-[11px] font-semibold text-neutral-500">Remplacées ou retirées</h4>
                            <ul className="mt-1 space-y-1">
                                {archived.map(o => (
                                    <li key={o.key} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-neutral-500">
                                        <Workflow className="w-4 h-4 shrink-0" />
                                        <span className="min-w-0 flex-1 truncate text-sm" title={o.title}>{o.title}</span>
                                        <button type="button" onClick={() => onRestore(o.key)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-900 hover:underline">
                                            <RotateCcw className="w-3 h-3" />Rétablir
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </section>
                <section className="px-4 py-3 border-t border-neutral-100">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Utilisés dans cette conversation</h3>
                    <p className="mt-2 text-[11px] font-semibold text-neutral-700">Sources jointes{sources.length ? ` (${sources.length})` : ''}</p>
                    {sources.length === 0 && <p className="mt-1 text-xs text-neutral-500">Aucune source jointe.</p>}
                    <ul className="mt-1 space-y-0.5">
                        {sources.map(s => {
                            const Icon = SOURCE_ICON[s.type] || FileText;
                            return (
                                <li key={s.id} className="flex items-center gap-2 py-1 text-sm text-neutral-800">
                                    <Icon className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                                    <span className="min-w-0 flex-1 truncate" title={s.filename}>{s.filename}</span>
                                    {citations[s.filename] ? (
                                        <span title="Étapes des procédures de la conversation qui citent ce fichier"
                                            className="shrink-0 text-[10px] text-neutral-500">{citations[s.filename]} étape{citations[s.filename] > 1 ? 's' : ''}</span>
                                    ) : null}
                                    {references.includes(s.filename) && (
                                        <span title="Utilisé comme modèle de style, pas comme source de contenu"
                                            className="shrink-0 rounded-full bg-neutral-100 px-1.5 text-[10px] font-semibold text-neutral-700">modèle</span>
                                    )}
                                    <span className="shrink-0 text-[10px] uppercase text-neutral-400">{s.type}</span>
                                </li>
                            );
                        })}
                    </ul>
                    {searches.length > 0 && (() => {
                        const queries = Array.from(new Set(searches.flatMap(s => s.queries)));
                        const seen = new Set<string>();
                        const srcs = searches.flatMap(s => s.sources).filter(s => !seen.has(s.uri) && seen.add(s.uri));
                        return (
                            <>
                                <p className="mt-3 text-[11px] font-semibold text-neutral-700">Recherche sur internet ({queries.length} requête{queries.length > 1 ? 's' : ''})</p>
                                <ul className="mt-1 space-y-0.5">
                                    {queries.map(q => (
                                        <li key={q} className="flex items-center gap-2 py-1 text-sm text-neutral-800">
                                            <Search className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                                            <span className="min-w-0 flex-1 truncate" title={q}>{q}</span>
                                        </li>
                                    ))}
                                </ul>
                                {srcs.length > 0 && <p className="mt-2 text-[11px] font-semibold text-neutral-700">Sources citées ({srcs.length})</p>}
                                <ul className="mt-1 space-y-0.5">
                                    {srcs.map(s => (
                                        <li key={s.uri}>
                                            <a href={s.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-1 text-sm text-neutral-800 hover:underline">
                                                <Globe className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                                                <span className="min-w-0 flex-1 truncate" title={s.title}>{s.domain || s.title}</span>
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        );
                    })()}
                </section>
            </div>
        </aside>
    );
}

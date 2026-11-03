'use client';

import { FileText, FileDown, RotateCcw, Trash2, Network, Wand2, SearchCheck, MoreHorizontal, Plus } from 'lucide-react';

interface SttToolbarProps {
    /** Sans encadré : intégré dans l’en-tête du Studio */
    bare?: boolean;
    dataLength: number;
    detectingInterfaces?: boolean;
    bpmnXml: string;
    isEditingBpmn: boolean;
    revisionOpen: boolean;
    revisionCount: number;
    /** Bouton « Générer / Régénérer BPMN » visible ; sinon l’action passe dans « ⋯ » */
    showGenerate?: boolean;
    onGenerateBPMN: () => void;
    onDownloadBPMN: () => void;
    onResetToDefault: () => void;
    onClearTable: () => void;
    /** Actions absentes du menu tant qu’elles ne sont pas branchées */
    onDetectInterfaces?: () => void;
    onAnalyseErrors?: () => void;
    onToggleRevision: () => void;
    onNewProcedure?: () => void;
    /** Contrôles affichés avant « ⋯ » (zoom du diagramme…) */
    extraControls?: React.ReactNode;
    /** Actions du diagramme, ajoutées dans la section « Diagramme » du menu « ⋯ » */
    extraMenu?: React.ReactNode;
}

type Variant = 'default' | 'primary' | 'secondary' | 'toggle' | 'danger';

export default function SttToolbar({
    bare = false,
    dataLength, detectingInterfaces = false,
    bpmnXml, isEditingBpmn, revisionOpen, revisionCount, showGenerate = true,
    onGenerateBPMN, onDownloadBPMN,
    onResetToDefault, onClearTable, onDetectInterfaces, onAnalyseErrors,
    onToggleRevision, onNewProcedure, extraControls, extraMenu,
}: SttToolbarProps) {
    const generateLabel = isEditingBpmn ? 'Régénérer le BPMN' : 'Générer le BPMN';
    const hasDiagramSection = !showGenerate || extraMenu || bpmnXml;
    const hasChecks = onDetectInterfaces || onAnalyseErrors;
    return (
        <div role="toolbar" aria-label="Outils du Studio" className={bare ? '' : 'bg-white rounded-xl border border-slate-200 px-3 py-2'}>
            <div className="flex flex-wrap items-center gap-1.5">
                <ToolBtn icon={<Wand2 className="w-4 h-4" />} label="Révision" active={revisionOpen} onClick={onToggleRevision}
                    variant="toggle" badge={revisionCount > 0 ? revisionCount : undefined} />
                <div className="ml-auto flex items-center gap-1.5">
                    {showGenerate && (
                        <ToolBtn icon={<FileText className="w-4 h-4" />} label={generateLabel}
                            onClick={onGenerateBPMN} disabled={dataLength === 0} variant={isEditingBpmn ? 'secondary' : 'primary'} />
                    )}
                    {extraControls}
                    <details className="relative" onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.open = false; }}>
                        <summary aria-label="Autres actions du Studio" title="Autres actions"
                            className="list-none cursor-pointer p-2 text-slate-500 hover:bg-slate-100 rounded-lg [&::-webkit-details-marker]:hidden">
                            <MoreHorizontal className="w-4 h-4" />
                        </summary>
                        <div className="absolute right-0 top-full mt-1 z-40 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                            {hasDiagramSection && (
                                <>
                                    <MenuTitle>Diagramme</MenuTitle>
                                    {!showGenerate && (
                                        <MenuAction icon={<FileText className="w-4 h-4" />} label={`${generateLabel} depuis le tableau`}
                                            onClick={onGenerateBPMN} disabled={dataLength === 0} />
                                    )}
                                    {extraMenu}
                                    {bpmnXml && <MenuAction icon={<FileDown className="w-4 h-4" />} label="Exporter le BPMN (.bpmn)" onClick={onDownloadBPMN} />}
                                    <MenuSeparator />
                                </>
                            )}
                            {hasChecks && (
                                <>
                                    <MenuTitle>Vérifier</MenuTitle>
                                    {onDetectInterfaces && (
                                        <MenuAction icon={<Network className="w-4 h-4" />} label={detectingInterfaces ? 'Détection…' : 'Détecter les interfaces'}
                                            onClick={onDetectInterfaces} disabled={dataLength === 0 || detectingInterfaces} />
                                    )}
                                    {onAnalyseErrors && (
                                        <MenuAction icon={<SearchCheck className="w-4 h-4" />} label="Analyser les erreurs" onClick={onAnalyseErrors} disabled={dataLength === 0} />
                                    )}
                                    <MenuSeparator />
                                </>
                            )}
                            <MenuTitle>Procédure</MenuTitle>
                            {onNewProcedure && <MenuAction icon={<Plus className="w-4 h-4" />} label="Nouvelle procédure" onClick={onNewProcedure} />}
                            <MenuAction icon={<RotateCcw className="w-4 h-4" />} label="Réinitialiser le Studio" onClick={onResetToDefault} />
                            <MenuAction icon={<Trash2 className="w-4 h-4" />} label="Vider le tableau" onClick={onClearTable} danger />
                        </div>
                    </details>
                </div>
            </div>
        </div>
    );
}

function ToolBtn({ icon, label, active, onClick, disabled = false, variant = 'default', badge }: {
    icon: React.ReactNode; label: string; active?: boolean; onClick: () => void;
    disabled?: boolean; variant?: Variant; badge?: number;
}) {
    const style = variant === 'primary' ? 'bg-slate-800 text-white hover:bg-slate-700'
        : variant === 'secondary' ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
        : variant === 'danger' ? 'bg-red-500 text-white hover:bg-red-600'
        : active ? 'bg-violet-50 text-violet-700 border-violet-200'
        : 'text-slate-600 hover:bg-slate-50 border-transparent';
    return (
        <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
            aria-pressed={variant === 'toggle' ? !!active : undefined}
            className={['inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors', style, disabled ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}>
            {icon}<span className="whitespace-nowrap">{label}</span>
            {badge !== undefined && <span className="text-[10px] rounded-full bg-violet-100 px-1.5">{badge}</span>}
        </button>
    );
}

function MenuTitle({ children }: { children: React.ReactNode }) {
    return <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{children}</p>;
}

function MenuSeparator() {
    return <div className="my-1 border-t border-slate-100" />;
}

function MenuAction({ icon, label, onClick, disabled, danger }: {
    icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
    return (
        <button type="button" disabled={disabled} onClick={e => { e.currentTarget.closest('details')?.removeAttribute('open'); onClick(); }}
            className={['w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-left hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed', danger ? 'text-red-600' : 'text-slate-600'].join(' ')}>
            {icon}{label}
        </button>
    );
}

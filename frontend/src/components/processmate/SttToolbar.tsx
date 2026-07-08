'use client';

// components/processmate/SttToolbar.tsx
// Toolbar contextuelle BPMN Studio — positionnée à GAUCHE du contenu.
// Comportement identique à la sidebar globale :
//   - expanded  : largeur ~180px avec icône + label
//   - collapsed : largeur ~48px  avec icône seule + tooltip hover
// Toggle par bouton chevron en haut.

import { useState } from 'react';
import {
    FileText, Mic, Square, FileDown, RotateCcw, Trash2,
    Network, Loader2, Upload, Wand2, SearchCheck,
    MessageSquare, ChevronLeft, X, Code,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

interface SttToolbarProps {
    dataLength: number;
    recording: boolean;
    processing: boolean;
    detectingInterfaces?: boolean;
    bpmnXml: string;
    isEditingBpmn: boolean;
    uploadOpen: boolean;
    chatOpen: boolean;
    revisionOpen: boolean;
    revisionCount: number;
    codeSourceOpen: boolean;
    onToggleRecording: () => void;
    onCancelRecording?: () => void;
    onGenerateBPMN: () => void;
    onDownloadBPMN: () => void;
    onResetToDefault: () => void;
    onClearTable: () => void;
    onDetectInterfaces: () => void;
    onAnalyseErrors: () => void;
    onToggleUpload: () => void;
    onToggleChat: () => void;
    onToggleRevision: () => void;
    onToggleCodeSource: () => void;
}

type Variant = 'default' | 'primary' | 'toggle' | 'ghost' | 'danger' | 'danger-ghost';

// ─── Composant principal ──────────────────────────────────────

export default function SttToolbar({
    dataLength, recording, processing, detectingInterfaces = false,
    bpmnXml, isEditingBpmn, uploadOpen, chatOpen, revisionOpen, revisionCount,
    codeSourceOpen,
    onToggleRecording, onCancelRecording, onGenerateBPMN, onDownloadBPMN,
    onResetToDefault, onClearTable, onDetectInterfaces, onAnalyseErrors,
    onToggleUpload, onToggleChat, onToggleRevision, onToggleCodeSource,
}: SttToolbarProps) {
    const [expanded, setExpanded] = useState(false);

    return (
        <aside className={`
            ${expanded ? 'w-44' : 'w-12'}
            flex-shrink-0 flex flex-col
            bg-white border-r border-slate-200 shadow-sm
            transition-all duration-200 ease-in-out
            h-full
        `}>

            {/* ── Header toolbar ── */}
            <div className={`
                shrink-0 flex items-center border-b border-slate-200 bg-violet-600
                ${expanded ? 'justify-between px-3' : 'justify-center'}
                h-14
            `}>
                {expanded && (
                    <span className="text-xs font-bold text-white truncate">Studio</span>
                )}
                <button
                    type="button"
                    onClick={() => setExpanded(e => !e)}
                    className="text-white/70 hover:text-white transition-colors p-1 flex-shrink-0"
                    title={expanded ? 'Réduire' : 'Développer'}
                >
                    <ChevronLeft className={`w-4 h-4 transition-transform duration-200 ${!expanded ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* ── Navigation ── */}
            <nav className="flex flex-col p-1.5 gap-0.5 flex-1 overflow-y-auto">

                {/* Panneaux */}
                <ToolBtn icon={<Upload className="w-4 h-4" />} label="Documents" expanded={expanded} active={uploadOpen} onClick={onToggleUpload} variant="toggle" />
                <ToolBtn icon={<MessageSquare className="w-4 h-4" />} label="Assistant" expanded={expanded} active={chatOpen} onClick={onToggleChat} variant="toggle" />
                <ToolBtn
                    icon={<Wand2 className="w-4 h-4" />}
                    label="Révision"
                    expanded={expanded}
                    active={revisionOpen}
                    onClick={onToggleRevision}
                    variant="toggle"
                    badge={revisionCount > 0 ? revisionCount : undefined}
                />
                <ToolBtn icon={<Code className="w-4 h-4" />} label="Code source" expanded={expanded} active={codeSourceOpen} onClick={onToggleCodeSource} variant="toggle" />

                <Divider />

                {/* Actions BPMN */}
                <ToolBtn
                    icon={recording ? <Square className="w-4 h-4" /> : processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                    label={recording ? 'Arrêter' : processing ? 'Traitement…' : 'Enregistrer'}
                    expanded={expanded}
                    onClick={onToggleRecording}
                    disabled={processing}
                    variant={recording ? 'danger' : 'default'}
                />
                {recording && onCancelRecording && (
                    <ToolBtn
                        icon={<X className="w-4 h-4" />}
                        label="Annuler"
                        expanded={expanded}
                        onClick={onCancelRecording}
                        variant="ghost"
                    />
                )}
                <ToolBtn
                    icon={<FileText className="w-4 h-4" />}
                    label={isEditingBpmn ? 'Régénérer' : 'Générer BPMN'}
                    expanded={expanded}
                    onClick={onGenerateBPMN}
                    disabled={dataLength === 0}
                    variant="primary"
                />
                {bpmnXml && (
                    <ToolBtn icon={<FileDown className="w-4 h-4" />} label="Télécharger" expanded={expanded} onClick={onDownloadBPMN} variant="default" />
                )}

                <Divider />

                {/* Analyse */}
                <ToolBtn
                    icon={detectingInterfaces ? <Loader2 className="w-4 h-4 animate-spin" /> : <Network className="w-4 h-4" />}
                    label={detectingInterfaces ? 'Détection…' : 'Interfaces'}
                    expanded={expanded}
                    onClick={onDetectInterfaces}
                    disabled={dataLength === 0 || detectingInterfaces}
                    variant="default"
                />
                <ToolBtn
                    icon={<SearchCheck className="w-4 h-4" />}
                    label="Erreurs"
                    expanded={expanded}
                    onClick={onAnalyseErrors}
                    disabled={dataLength === 0}
                    variant="default"
                />

                <Divider />

                {/* Utilitaires */}
                <ToolBtn icon={<RotateCcw className="w-4 h-4" />} label="Réinitialiser" expanded={expanded} onClick={onResetToDefault} variant="ghost" />
                <ToolBtn icon={<Trash2 className="w-4 h-4" />} label="Vider" expanded={expanded} onClick={onClearTable} variant="danger-ghost" />

            </nav>

            {/* ── Compteur étapes ── */}
            {dataLength > 0 && (
                <div className={`shrink-0 border-t border-slate-100 p-2`}>
                    <div className="bg-slate-50 rounded-lg py-1.5 text-center">
                        {expanded ? (
                            <p className="text-xs text-slate-500">
                                <span className="font-bold text-slate-700">{dataLength}</span> étape{dataLength > 1 ? 's' : ''}
                            </p>
                        ) : (
                            <p className="text-xs font-bold text-slate-600">{dataLength}</p>
                        )}
                    </div>
                </div>
            )}
        </aside>
    );
}

// ─── ToolBtn ─────────────────────────────────────────────────

function ToolBtn({
    icon, label, expanded, active, onClick, disabled = false, variant = 'default', badge,
}: {
    icon: React.ReactNode;
    label: string;
    expanded: boolean;
    active?: boolean;
    onClick: () => void;
    disabled?: boolean;
    variant?: Variant;
    badge?: number;
}) {
    const styles: Record<Variant, string> = {
        default: 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
        primary: 'bg-slate-800 text-white hover:bg-slate-700',
        toggle: active ? 'bg-violet-50 text-violet-700 border border-violet-200' : 'text-slate-600 hover:bg-slate-100',
        ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
        danger: 'bg-red-500 text-white hover:bg-red-600',
        'danger-ghost': 'text-red-500 hover:bg-red-50 hover:text-red-600',
    };

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={!expanded ? label : undefined}
            className={`
                relative flex items-center rounded-lg transition-all duration-150 group w-full
                ${expanded ? 'px-2.5 py-2 gap-2.5' : 'py-2 justify-center'}
                ${disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : styles[variant]}
            `}
        >
            {/* Icône */}
            <span className="flex-shrink-0 flex items-center justify-center w-5 h-5">
                {icon}
            </span>

            {/* Label — visible uniquement en mode expanded */}
            {expanded && (
                <span className="text-xs font-medium truncate flex-1 text-left">{label}</span>
            )}

            {/* Badge */}
            {badge !== undefined && (
                <span className={`
                    flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none
                    ${variant === 'toggle' && active ? 'bg-violet-200 text-violet-800' : 'bg-slate-200 text-slate-600'}
                    ${expanded ? '' : 'absolute top-0.5 right-0.5'}
                `}>
                    {badge}
                </span>
            )}

            {/* Tooltip — uniquement en mode collapsed */}
            {!expanded && (
                <span className="
                    absolute left-full ml-2 z-50
                    bg-slate-800 text-white text-xs font-medium
                    px-2 py-1 rounded-md whitespace-nowrap
                    opacity-0 group-hover:opacity-100
                    pointer-events-none transition-opacity duration-150
                ">
                    {label}{badge !== undefined ? ` (${badge})` : ''}
                </span>
            )}
        </button>
    );
}

function Divider() {
    return <div className="h-px bg-slate-100 my-1 mx-1" />;
}
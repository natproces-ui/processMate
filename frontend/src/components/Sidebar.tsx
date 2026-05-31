'use client';

import { useState } from 'react';
import {
    FileText, Mic, Square, FileDown, RotateCcw, Trash2,
    Network, Loader2, Upload, Wand2, SearchCheck,
    ChevronRight, ChevronLeft, MessageSquare, X,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface SidebarProps {
    dataLength: number;
    recording: boolean;
    processing: boolean;
    detectingInterfaces: boolean;
    bpmnXml: string;
    isEditingBpmn: boolean;
    uploadOpen: boolean;
    chatOpen: boolean;
    revisionOpen: boolean;
    revisionCount: number;
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
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────

export default function Sidebar({
    dataLength, recording, processing, detectingInterfaces,
    bpmnXml, isEditingBpmn, uploadOpen, chatOpen, revisionOpen, revisionCount,
    onToggleRecording, onCancelRecording, onGenerateBPMN, onDownloadBPMN,
    onResetToDefault, onClearTable, onDetectInterfaces, onAnalyseErrors,
    onToggleUpload, onToggleChat, onToggleRevision,
}: SidebarProps) {
    const [expanded, setExpanded] = useState(false);

    const w = expanded ? 'w-52' : 'w-14';

    return (
        <aside className={`${w} flex-shrink-0 transition-all duration-200 ease-in-out`}>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

                {/* Toggle expand */}
                <button
                    onClick={() => setExpanded(e => !e)}
                    className="w-full flex items-center justify-end px-3 py-2.5 border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    title={expanded ? 'Réduire' : 'Développer'}
                >
                    {expanded
                        ? <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                        : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    }
                </button>

                <nav className="flex flex-col p-1.5 gap-0.5">

                    {/* Documents */}
                    <Item
                        icon={<Upload className="w-4 h-4" />}
                        label="Documents"
                        expanded={expanded}
                        active={uploadOpen}
                        onClick={onToggleUpload}
                        variant="toggle"
                    />

                    {/* Chat */}
                    <Item
                        icon={<MessageSquare className="w-4 h-4" />}
                        label="Assistant"
                        expanded={expanded}
                        active={chatOpen}
                        onClick={onToggleChat}
                        variant="toggle"
                    />

                    {/* Révision */}
                    <Item
                        icon={<Wand2 className="w-4 h-4" />}
                        label="Révision"
                        expanded={expanded}
                        active={revisionOpen}
                        onClick={onToggleRevision}
                        variant="toggle"
                        badge={revisionCount > 0 ? revisionCount : undefined}
                    />

                    <Divider />

                    {/* Enregistrer / Arrêter / Annuler */}
                    <Item
                        icon={recording
                            ? <Square className="w-4 h-4" />
                            : processing
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Mic className="w-4 h-4" />
                        }
                        label={recording ? 'Arrêter' : processing ? 'Traitement…' : 'Enregistrer'}
                        expanded={expanded}
                        onClick={onToggleRecording}
                        disabled={processing}
                        variant={recording ? 'danger' : 'default'}
                    />
                    {recording && onCancelRecording && (
                        <Item
                            icon={<X className="w-4 h-4" />}
                            label="Annuler"
                            expanded={expanded}
                            onClick={onCancelRecording}
                            variant="default"
                        />
                    )}

                    {/* Générer BPMN */}
                    <Item
                        icon={<FileText className="w-4 h-4" />}
                        label={isEditingBpmn ? 'Régénérer' : 'Générer BPMN'}
                        expanded={expanded}
                        onClick={onGenerateBPMN}
                        disabled={dataLength === 0}
                        variant="primary"
                    />

                    {/* Télécharger BPMN */}
                    {bpmnXml && (
                        <Item
                            icon={<FileDown className="w-4 h-4" />}
                            label="Télécharger"
                            expanded={expanded}
                            onClick={onDownloadBPMN}
                            variant="default"
                        />
                    )}

                    <Divider />

                    {/* Interfaces */}
                    <Item
                        icon={detectingInterfaces
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Network className="w-4 h-4" />
                        }
                        label={detectingInterfaces ? 'Détection…' : 'Interfaces'}
                        expanded={expanded}
                        onClick={onDetectInterfaces}
                        disabled={dataLength === 0 || detectingInterfaces}
                        variant="default"
                    />

                    {/* Analyser erreurs */}
                    <Item
                        icon={<SearchCheck className="w-4 h-4" />}
                        label="Erreurs"
                        expanded={expanded}
                        onClick={onAnalyseErrors}
                        disabled={dataLength === 0}
                        variant="default"
                    />

                    <Divider />

                    {/* Réinitialiser */}
                    <Item
                        icon={<RotateCcw className="w-4 h-4" />}
                        label="Réinitialiser"
                        expanded={expanded}
                        onClick={onResetToDefault}
                        variant="ghost"
                    />

                    {/* Vider */}
                    <Item
                        icon={<Trash2 className="w-4 h-4" />}
                        label="Vider"
                        expanded={expanded}
                        onClick={onClearTable}
                        variant="danger-ghost"
                    />

                </nav>

                {/* Compteur étapes */}
                {dataLength > 0 && (
                    <div className="px-2 pb-2 pt-1">
                        <div className="bg-slate-50 rounded-lg py-1.5 text-center">
                            {expanded ? (
                                <p className="text-xs text-slate-500">
                                    <span className="font-semibold text-slate-700">{dataLength}</span> étape{dataLength > 1 ? 's' : ''}
                                </p>
                            ) : (
                                <p className="text-xs font-semibold text-slate-600">{dataLength}</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

type ItemVariant = 'default' | 'primary' | 'toggle' | 'ghost' | 'danger' | 'danger-ghost';

function Item({
    icon, label, expanded, active, onClick, disabled = false, variant = 'default', badge
}: {
    icon: React.ReactNode;
    label: string;
    expanded: boolean;
    active?: boolean;
    onClick: () => void;
    disabled?: boolean;
    variant?: ItemVariant;
    badge?: number;
}) {
    const base = 'relative flex items-center rounded-lg transition-all duration-150 cursor-pointer select-none group';
    const size = expanded ? 'px-2.5 py-2 gap-2.5' : 'px-0 py-2 justify-center';

    const styles: Record<ItemVariant, string> = {
        default: 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
        primary: 'bg-slate-800 text-white hover:bg-slate-700',
        toggle: active
            ? 'bg-blue-50 text-blue-700 border border-blue-200'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
        ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
        danger: 'bg-red-500 text-white hover:bg-red-600',
        'danger-ghost': 'text-red-500 hover:bg-red-50 hover:text-red-600',
    };

    const disabledStyle = 'opacity-40 cursor-not-allowed pointer-events-none';

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`${base} ${size} ${disabled ? disabledStyle : styles[variant]} w-full`}
            title={!expanded ? label : undefined}
        >
            <span className="flex-shrink-0 flex items-center justify-center w-5 h-5">
                {icon}
            </span>

            {expanded && (
                <span className="text-xs font-medium truncate flex-1 text-left">{label}</span>
            )}

            {badge !== undefined && (
                <span className={`
                    flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none
                    ${variant === 'toggle' && active
                        ? 'bg-blue-200 text-blue-800'
                        : 'bg-slate-200 text-slate-600'
                    }
                `}>
                    {badge}
                </span>
            )}

            {!expanded && (
                <span className="
                    absolute left-full ml-2 z-50
                    bg-slate-800 text-white text-xs font-medium
                    px-2 py-1 rounded-md whitespace-nowrap
                    opacity-0 group-hover:opacity-100
                    pointer-events-none
                    transition-opacity duration-150
                ">
                    {label}
                    {badge !== undefined && ` (${badge})`}
                </span>
            )}
        </button>
    );
}

function Divider() {
    return <div className="h-px bg-slate-100 my-1 mx-1" />;
}
'use client';

import React from 'react';
import {
    ArrowRight, CheckCircle2, ClipboardCheck, Code2,
    FileAudio, FileImage, FileText, FileType,
    GitBranch, Layers3, Mic, PenTool, Route,
    SearchCheck, Settings2, ShieldCheck, Sparkles, Users,
} from 'lucide-react';
import ProcessFlowDiagram from './ProcessFlowDiagram';

export interface PipelineCallbacks {
    onCreateForm?: () => void;
    onCreateAI?: () => void;
    onFormalize?: () => void;
    onWorkflow?: () => void;
    onIrritants?: () => void;
    onValidation?: () => void;
    onRaci?: () => void;
    onComplexity?: () => void;
    onTasks?: () => void;
    onApplicatifs?: () => void;
    onAnalysis?: () => void;
    onSfd?: () => void;
}

interface Props extends PipelineCallbacks { activeProcedureName?: string; }

type StationTone = 'blue' | 'green' | 'purple' | 'orange' | 'slate';
interface Station { id: string; label: string; icon?: React.ElementType; onClick?: () => void; strong?: boolean; }

const TONE: Record<StationTone, { line: string; dot: string; text: string; soft: string; border: string }> = {
    blue: { line: 'bg-blue-600', dot: 'border-blue-600 text-blue-700 bg-white', text: 'text-blue-700', soft: 'bg-blue-50 text-blue-700 border-blue-100', border: 'border-blue-200' },
    green: { line: 'bg-emerald-600', dot: 'border-emerald-600 text-emerald-700 bg-white', text: 'text-emerald-700', soft: 'bg-emerald-50 text-emerald-700 border-emerald-100', border: 'border-emerald-200' },
    purple: { line: 'bg-violet-600', dot: 'border-violet-600 text-violet-700 bg-white', text: 'text-violet-700', soft: 'bg-violet-50 text-violet-700 border-violet-100', border: 'border-violet-200' },
    orange: { line: 'bg-orange-500', dot: 'border-orange-500 text-orange-700 bg-white', text: 'text-orange-700', soft: 'bg-orange-50 text-orange-700 border-orange-100', border: 'border-orange-200' },
    slate: { line: 'bg-slate-500', dot: 'border-slate-500 text-slate-700 bg-white', text: 'text-slate-700', soft: 'bg-slate-50 text-slate-700 border-slate-200', border: 'border-slate-200' },
};

function SourceChip({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
    return (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <Icon className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-semibold text-gray-700">{label}</span>
        </div>
    );
}

function StationButton({ station, tone }: { station: Station; tone: StationTone }) {
    const Icon = station.icon;
    const cfg = TONE[tone];
    return (
        <button type="button" onClick={station.onClick} disabled={!station.onClick}
            className={`group flex min-w-[112px] flex-col items-center gap-2 text-center ${station.onClick ? 'cursor-pointer' : 'cursor-default'}`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full border-[3px] shadow-sm transition-transform ${cfg.dot} ${station.onClick ? 'group-hover:scale-110' : ''}`}>
                {Icon ? <Icon className="h-4 w-4" /> : <span className="h-2.5 w-2.5 rounded-full bg-current" />}
            </span>
            <span className={`text-xs font-bold leading-tight ${station.strong ? cfg.text : 'text-gray-700'}`}>
                {station.label}
            </span>
        </button>
    );
}

function MetroLine({ title, subtitle, tone, stations }: {
    title: string; subtitle: string; tone: StationTone; stations: Station[];
}) {
    const cfg = TONE[tone];
    return (
        <section className={`relative rounded-2xl border bg-white p-5 shadow-sm ${cfg.border}`}>
            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <h3 className={`text-base font-black ${cfg.text}`}>{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500">{subtitle}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${cfg.soft}`}>{stations.length} stations</span>
            </div>
            <div className="relative">
                <div className={`absolute left-8 right-8 top-4 h-1.5 rounded-full ${cfg.line}`} />
                <div className="relative grid grid-flow-col auto-cols-fr gap-3">
                    {stations.map(s => <StationButton key={s.id} station={s} tone={tone} />)}
                </div>
            </div>
        </section>
    );
}



export default function WorkflowPipeline({
    activeProcedureName,
    onCreateForm, onCreateAI, onFormalize, onWorkflow,
    onIrritants, onValidation, onRaci, onComplexity,
    onTasks, onApplicatifs, onAnalysis, onSfd,
}: Props) {

    const mainLine: Station[] = [
        { id: 'collecte', label: 'Collecte', icon: Layers3, onClick: onCreateAI, strong: true },
        { id: 'extract', label: 'Analyse & Extraction', icon: Sparkles, onClick: onCreateAI, strong: true },
        { id: 'formalize', label: 'Formalisation', icon: PenTool, onClick: onFormalize, strong: true },
        { id: 'verify', label: 'Verification', icon: SearchCheck, onClick: onWorkflow },
        { id: 'validate', label: 'Validation', icon: ShieldCheck, onClick: onValidation },
        { id: 'referentiel', label: 'Referentiel Procedures', icon: ClipboardCheck, onClick: onCreateForm, strong: true },
    ];

    const diagnosticLine: Station[] = [
        { id: 'complexity', label: 'Complexite', icon: Settings2, onClick: onComplexity },
        { id: 'irritants', label: 'Irritants', icon: GitBranch, onClick: onIrritants },
        { id: 'impact', label: 'Impact', icon: SearchCheck, onClick: onAnalysis },
        { id: 'cartography', label: 'Cartographie applicative', icon: Route, onClick: onApplicatifs },
    ];

    const managementLine: Station[] = [
        { id: 'raci', label: 'RACI', icon: Users, onClick: onRaci },
        { id: 'tasks', label: 'Taches', icon: CheckCircle2, onClick: onTasks },
        { id: 'tracking', label: 'Suivi', icon: GitBranch, onClick: onWorkflow },
        { id: 'decisions', label: 'Decisions', icon: ShieldCheck, onClick: onValidation },
    ];

    const deliverableLine: Station[] = [
        { id: 'documentation', label: 'Documentation', icon: FileText, onClick: onFormalize },
        { id: 'sfd', label: 'SFD', icon: FileType, onClick: onSfd },
        { id: 'word', label: 'Export Word', icon: FileText, onClick: onSfd },
        { id: 'publication', label: 'Publication', icon: CheckCircle2, onClick: onValidation },
    ];

    return (
        <div className="p-8 space-y-6">

            {/* ── Header ── */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Pipeline Globale</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-500">
                        Visualisez le cycle logique d une procedure : collecte des sources, extraction, formalisation,
                        verification, validation, puis diagnostic et pilotage depuis le referentiel.
                    </p>
                </div>
                {activeProcedureName && (
                    <div className="inline-flex max-w-xs items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{activeProcedureName}</span>
                    </div>
                )}
            </div>

            {/* ── Sources collectées ── */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-wide text-gray-500">Sources collectees</h3>
                        <p className="mt-1 text-sm text-gray-500">La collecte regroupe les donnees ASIS, legacy et sources metier avant extraction.</p>
                    </div>
                    <button type="button" onClick={onCreateAI}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                        Demarrer une collecte
                        <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
                <div className="grid grid-cols-6 gap-3">
                    <SourceChip icon={FileImage} label="Images" />
                    <SourceChip icon={FileType} label="PDF" />
                    <SourceChip icon={FileText} label="Word" />
                    <SourceChip icon={Code2} label="Code" />
                    <SourceChip icon={FileAudio} label="Notes" />
                    <SourceChip icon={Mic} label="Audio" />
                </div>
            </div>

            {/* ── Cycle principal ── */}
            <MetroLine title="Cycle principal" subtitle="Le chemin de production d une procedure maitrisee." tone="blue" stations={mainLine} />

            {/* ── Branches ── */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <MetroLine title="Diagnostiquer l'existant" subtitle="Comprendre ce qui existe et prioriser les ameliorations." tone="green" stations={diagnosticLine} />
                <MetroLine title="Piloter la formalisation" subtitle="Coordonner les roles, actions, suivis et decisions." tone="purple" stations={managementLine} />
                <MetroLine title="Produire les livrables" subtitle="Generer et diffuser la documentation formalisee." tone="orange" stations={deliverableLine} />
            </div>

            {/* ── Séparateur ── */}
            <div className="flex items-center gap-4 pt-2">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                    Flux conditionnel détaillé
                </span>
                <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* ── Flux conditionnel SVG ── */}
            <ProcessFlowDiagram
                onCollecte={onCreateAI}
                onFormalize={onFormalize}
                onWorkflow={onWorkflow}
                onValidation={onValidation}
                onIrritants={onIrritants}
                onRaci={onRaci}
                onSfd={onSfd}
                onAnalysis={onAnalysis}
                onComplexity={onComplexity}
            />

        </div>
    );
}
'use client';

import React from 'react';
import { AlertTriangle, BookOpen, MessageSquare } from 'lucide-react';
import type {
    AnalysisLogEntry,
    RegulatoryImpact,
    ImpactStatus,
    RegulatoryCampaign,
} from '@/lib/regulatoryImpactApi';

const CRITICALITY_STYLE: Record<string, string> = {
    low: 'bg-slate-100 text-slate-600',
    medium: 'bg-amber-100 text-amber-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
};
const CRITICALITY_LABEL: Record<string, string> = {
    low: 'Faible', medium: 'Moyen', high: 'Élevé', critical: 'Critique',
};
const STATUS_LABEL: Record<ImpactStatus, string> = {
    draft: 'Brouillon', to_review: 'À revoir', validated: 'Validé',
    rejected: 'Rejeté', converted: 'Transformé',
};

// ─── ImpactsList ──────────────────────────────────────────────

interface ImpactsListProps {
    impacts: RegulatoryImpact[];
    selectedImpact: RegulatoryImpact | null;
    onSelect: (impact: RegulatoryImpact) => void;
    activeTab: 'impacts' | 'log';
    onTabChange: (tab: 'impacts' | 'log') => void;
    analysisLog: AnalysisLogEntry[];
    analysisSummary: any;
    analysisQuestions: any[];
    lastAnalysis: any;
    campaign: RegulatoryCampaign | null;
    analyzing: boolean;
}

export function ImpactsList({
    impacts,
    selectedImpact,
    onSelect,
    activeTab,
    onTabChange,
    analysisLog,
    analysisSummary,
    analysisQuestions,
    lastAnalysis,
    campaign,
    analyzing,
}: ImpactsListProps) {
    return (
        <div className="flex h-full flex-col min-h-0">
            {/* Onglets */}
            <div className="shrink-0 flex border-b border-slate-200 bg-white px-2">
                <button
                    type="button"
                    onClick={() => onTabChange('impacts')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'impacts'
                            ? 'border-blue-600 text-blue-700'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                >
                    Impacts ({impacts.length})
                </button>
                {(analysisLog.length > 0 || campaign?.status === 'analyzed') && (
                    <button
                        type="button"
                        onClick={() => onTabChange('log')}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'log'
                                ? 'border-blue-600 text-blue-700'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Journal
                        {analysisLog.length > 0 && (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                                {analysisLog.length}
                            </span>
                        )}
                    </button>
                )}
            </div>

            {/* Contenu */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {analyzing && (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                        <p className="text-sm font-medium">Analyse en cours...</p>
                        <p className="text-xs text-slate-400 text-center">Gemini examine les procédures<br />30 à 90 secondes</p>
                    </div>
                )}

                {!analyzing && activeTab === 'impacts' && (
                    impacts.length === 0
                        ? <EmptyImpacts campaign={campaign} analysisSummary={analysisSummary} analysisQuestions={analysisQuestions} lastAnalysis={lastAnalysis} />
                        : impacts.map(impact => (
                            <ImpactCard
                                key={impact.id}
                                impact={impact}
                                selected={selectedImpact?.id === impact.id}
                                onClick={() => onSelect(impact)}
                            />
                        ))
                )}

                {!analyzing && activeTab === 'log' && (
                    <AnalysisLog log={analysisLog} summary={analysisSummary} questions={analysisQuestions} />
                )}
            </div>
        </div>
    );
}

// ─── ImpactCard ───────────────────────────────────────────────

function ImpactCard({ impact, selected, onClick }: {
    impact: RegulatoryImpact;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full rounded-lg border bg-white p-3 text-left transition-all hover:shadow-sm ${selected
                    ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CRITICALITY_STYLE[impact.criticality]}`}>
                            {CRITICALITY_LABEL[impact.criticality]}
                        </span>
                        <span className="text-xs text-slate-400">{STATUS_LABEL[impact.status]}</span>
                        {impact.external_dependency && (
                            <span className="text-xs text-amber-600">⚠ {impact.external_dependency}</span>
                        )}
                    </div>
                    <h3 className="mt-1.5 text-sm font-semibold text-slate-900 leading-snug">{impact.theme}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500 line-clamp-2">{impact.regulatory_change}</p>
                    <p className="mt-1.5 text-xs text-slate-400 truncate font-medium">
                        {impact.procedure_ref || ''} {impact.procedure_nom}
                    </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-xs font-medium text-slate-500">{Math.round((impact.confidence || 0) * 100)}%</span>
                    <MessageSquare className="h-3.5 w-3.5 text-slate-300" />
                </div>
            </div>
        </button>
    );
}

// ─── EmptyImpacts ─────────────────────────────────────────────

function EmptyImpacts({ campaign, analysisSummary, analysisQuestions, lastAnalysis }: {
    campaign: RegulatoryCampaign | null;
    analysisSummary: any;
    analysisQuestions: any[];
    lastAnalysis: any;
}) {
    return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm">
            <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">
                        {campaign?.status === 'analyzed' ? 'Aucun impact généré' : 'Aucun impact disponible'}
                    </p>
                    {analysisSummary?.global_assessment
                        ? <p className="mt-1.5 text-xs leading-5 text-slate-600">{analysisSummary.global_assessment}</p>
                        : <p className="mt-1.5 text-xs leading-5 text-slate-500">Chargez une source et lancez l&apos;analyse.</p>
                    }
                    {analysisSummary?.regulatory_subject && (
                        <div className="mt-2 rounded bg-slate-50 px-2 py-1.5 text-xs">
                            <span className="font-medium">Sujet : </span>{analysisSummary.regulatory_subject}
                        </div>
                    )}
                    {analysisQuestions.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                            {analysisQuestions.map((q: any, i: number) => (
                                <div key={i} className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
                                    <p className="text-xs font-semibold text-amber-800">
                                        {q.blocking ? '🔴 Bloquant' : '🟡 À clarifier'}{q.target ? ` — ${q.target}` : ''}
                                    </p>
                                    <p className="mt-0.5 text-xs text-slate-700">{q.question}</p>
                                </div>
                            ))}
                        </div>
                    )}
                    {lastAnalysis && (
                        <div className="mt-3 grid grid-cols-3 gap-1.5 text-xs text-slate-500">
                            <div className="rounded bg-slate-50 px-2 py-1 text-center">
                                <div className="font-semibold text-slate-700">{lastAnalysis.raw_impacts_count ?? 0}</div>
                                <div>Bruts</div>
                            </div>
                            <div className="rounded bg-slate-50 px-2 py-1 text-center">
                                <div className="font-semibold text-slate-700">{lastAnalysis.impacts_count ?? 0}</div>
                                <div>Créés</div>
                            </div>
                            <div className="rounded bg-slate-50 px-2 py-1 text-center">
                                <div className="font-semibold text-slate-700">{lastAnalysis.unresolved_impacts?.length ?? 0}</div>
                                <div>Non liés</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── AnalysisLog ──────────────────────────────────────────────

function AnalysisLog({ log, summary, questions }: {
    log: AnalysisLogEntry[];
    summary: any;
    questions: any[];
}) {
    if (log.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-500">
                Aucun journal disponible. Lancez une analyse pour voir le raisonnement de l&apos;IA.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {summary && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-1">Synthèse</p>
                    <p className="text-sm text-blue-900 leading-5">{summary.global_assessment}</p>
                    {summary.procedures_not_impacted?.length > 0 && (
                        <p className="mt-1.5 text-xs text-blue-600">
                            Non impactées : {summary.procedures_not_impacted.join(', ')}
                        </p>
                    )}
                </div>
            )}

            {log.map((entry, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <BookOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="text-sm font-semibold text-slate-900 truncate">{entry.procedure_nom}</span>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${(entry.impacts_created ?? 0) > 0 ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'
                            }`}>
                            {entry.impacts_created ?? 0} impact{(entry.impacts_created ?? 0) > 1 ? 's' : ''}
                        </span>
                    </div>
                    {entry.examined_sections && entry.examined_sections.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                            {entry.examined_sections.map((s, j) => (
                                <span key={j} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{s}</span>
                            ))}
                        </div>
                    )}
                    {entry.findings && (
                        <p className="text-xs leading-5 text-slate-700">{entry.findings}</p>
                    )}
                    {entry.rationale && (
                        <p className="mt-1 text-xs text-slate-400 italic">{entry.rationale}</p>
                    )}
                </div>
            ))}

            {questions.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 px-1">Questions ouvertes</p>
                    {questions.map((q: any, i: number) => (
                        <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <p className="text-xs font-semibold text-amber-800">
                                {q.blocking ? '🔴 Bloquant' : '🟡 À clarifier'}{q.target ? ` — ${q.target}` : ''}
                            </p>
                            <p className="mt-0.5 text-sm text-slate-800">{q.question}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
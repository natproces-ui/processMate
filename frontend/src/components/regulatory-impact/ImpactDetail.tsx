'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, MessageSquare, Send, X, BookOpen } from 'lucide-react';
import {
    regulatoryImpactApi,
    type ImpactChatMessage,
    type ImpactStatus,
    type RegulatoryImpact,
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

// ─── ImpactDetail ─────────────────────────────────────────────

interface ImpactDetailProps {
    impact: RegulatoryImpact;
    onReview: (impact: RegulatoryImpact, status: ImpactStatus) => Promise<void>;
    onClose: () => void;
}

export function ImpactDetail({ impact, onReview, onClose }: ImpactDetailProps) {
    const [saving, setSaving] = useState(false);
    const [activeSection, setActiveSection] = useState<'detail' | 'chat'>('detail');

    const rawMeta = (impact.metadata || {}) as Record<string, unknown>;
    const activity = (rawMeta.activity as string) || impact.category || '';
    const siComment = (rawMeta.si_comment as string) || '';
    const extDep = impact.external_dependency || (rawMeta.external_dependency as string) || '';

    const review = async (status: ImpactStatus) => {
        setSaving(true);
        try { await onReview(impact, status); } finally { setSaving(false); }
    };

    return (
        <div className="flex h-full flex-col bg-white">

            {/* Header fixe */}
            <div className="shrink-0 border-b border-slate-200 px-5 pt-4 pb-0">
                <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${CRITICALITY_STYLE[impact.criticality]}`}>
                                {CRITICALITY_LABEL[impact.criticality]}
                            </span>
                            <span className="text-xs text-slate-500">{STATUS_LABEL[impact.status]}</span>
                            {extDep && (
                                <span className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs text-amber-700">
                                    ⚠ {extDep}
                                </span>
                            )}
                        </div>
                        <h2 className="mt-2 text-base font-bold text-slate-900 leading-snug">{impact.theme}</h2>
                        <p className="mt-0.5 text-xs text-slate-400 truncate">
                            {[impact.procedure_ref, impact.procedure_nom].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="shrink-0 rounded p-1.5 hover:bg-slate-100 text-slate-400">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Tabs collés au bas du header */}
                <div className="flex gap-0 -mb-px">
                    <button
                        type="button"
                        onClick={() => setActiveSection('detail')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeSection === 'detail'
                            ? 'border-blue-600 text-blue-700'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Détail
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveSection('chat')}
                        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeSection === 'chat'
                            ? 'border-blue-600 text-blue-700'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Approfondir
                    </button>
                </div>
            </div>

            {/* Contenu scrollable — prend toute la hauteur restante */}
            {activeSection === 'detail' && (
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    <DetailBlock title="Activité" value={activity} />
                    <DetailBlock title="Changement réglementaire" value={impact.regulatory_change} />
                    <DetailBlock title="Impact métier" value={impact.business_impact} />
                    <DetailBlock title="Impact SI" value={impact.si_impact} />
                    {siComment && <DetailBlock title="Commentaire SI" value={siComment} />}
                    <DetailBlock title="Référence loi" value={impact.law_reference} />
                    <DetailBlock title="Section procédure" value={impact.procedure_section} />
                    <DetailBlock title="Justification" value={impact.rationale} />
                    <DetailBlock title="Confiance IA" value={`${Math.round((impact.confidence || 0) * 100)}%`} />

                    {(impact.impacted_systems || []).length > 0 && (
                        <div>
                            <SectionTitle>Systèmes impactés</SectionTitle>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {impact.impacted_systems.map(s => (
                                    <span key={s} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{s}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {(impact.recommended_actions || []).length > 0 && (
                        <div>
                            <SectionTitle>Actions recommandées</SectionTitle>
                            <div className="mt-1.5 space-y-2">
                                {impact.recommended_actions.map((a, i) => (
                                    <div key={i} className="rounded border border-slate-200 bg-slate-50 p-3">
                                        <div className="flex items-start gap-2">
                                            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${CRITICALITY_STYLE[a.priority || 'medium']}`}>
                                                {a.priority || 'medium'}
                                            </span>
                                            <div>
                                                <p className="text-xs font-semibold text-slate-800">{a.title}</p>
                                                {a.description && <p className="mt-0.5 text-xs text-slate-600 leading-5">{a.description}</p>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeSection === 'chat' && (
                <ApprofondirChat impactId={impact.id} />
            )}

            {/* Footer actions */}
            <div className="shrink-0 border-t border-slate-200 px-5 py-3">
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() => review('validated')}
                        disabled={saving || impact.status === 'validated'}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                        <Check className="h-4 w-4" />
                        Valider
                    </button>
                    <button
                        type="button"
                        onClick={() => review('rejected')}
                        disabled={saving || impact.status === 'rejected'}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                    >
                        Rejeter
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── ApprofondirChat ──────────────────────────────────────────

const SUGGESTIONS = [
    'Quels systèmes sont réellement impactés ?',
    'Détaille les actions SI à prioriser',
    'Y a-t-il des risques non identifiés ?',
    'Propose une reformulation de l\'impact métier',
];

function ApprofondirChat({ impactId }: { impactId: string }) {
    const [messages, setMessages] = useState<ImpactChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [streaming, setStreaming] = useState(false);
    const [typingText, setTypingText] = useState('');
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const esRef = useRef<EventSource | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = useCallback((force = false) => {
        const el = scrollRef.current;
        if (!el) return;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        if (force || nearBottom) el.scrollTop = el.scrollHeight;
    }, []);

    useEffect(() => {
        setLoadingHistory(true);
        setMessages([]);
        regulatoryImpactApi.getImpactMessages(impactId)
            .then(res => setMessages(res.messages.map(m => ({
                role: m.role, content: m.content, intent: m.intent,
            }))))
            .catch(() => { })
            .finally(() => setLoadingHistory(false));
        return () => {
            esRef.current?.close();
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [impactId]);

    useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

    const startTypewriter = useCallback((fullText: string, onDone: () => void) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        const chunkSize = Math.max(1, Math.ceil(fullText.length / 160));
        let pos = 0;
        requestAnimationFrame(() => scrollToBottom(true));
        const tick = () => {
            pos = Math.min(pos + chunkSize, fullText.length);
            setTypingText(fullText.slice(0, pos));
            if (pos < fullText.length) {
                timerRef.current = setTimeout(tick, 16);
            } else {
                timerRef.current = null;
                onDone();
            }
        };
        tick();
    }, [scrollToBottom]);

    const sendMessage = (text: string) => {
        if (!text.trim() || streaming) return;
        setInput('');
        setError(null);
        setMessages(prev => [...prev, { role: 'user', content: text }]);
        setStreaming(true);

        const url = regulatoryImpactApi.approfondirStreamUrl(impactId, text);
        const es = new EventSource(url);
        esRef.current = es;
        let closed = false;

        const closeEs = () => {
            if (!closed) {
                closed = true;
                es.close();
                if (esRef.current === es) esRef.current = null;
            }
        };

        es.onmessage = (e: MessageEvent) => {
            try {
                const data = JSON.parse(e.data);
                if (data.error) { setError(data.error); setStreaming(false); setTypingText(''); closeEs(); return; }
                if (data.done) { closeEs(); return; }
                if (data.content) {
                    startTypewriter(data.content, () => {
                        setTypingText('');
                        setMessages(prev => [...prev, { role: 'assistant', content: data.content, intent: data.intent }]);
                        setStreaming(false);
                    });
                }
            } catch { /* ignore */ }
        };

        es.onerror = () => {
            setError('Erreur de connexion');
            setStreaming(false);
            setTypingText('');
            closeEs();
        };
    };

    const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
    };

    return (
        <div className="flex flex-1 flex-col overflow-hidden min-h-0">
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {loadingHistory ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="space-y-2">
                        <p className="text-center text-xs text-slate-400 pb-1">
                            Posez vos questions pour approfondir l&apos;analyse.
                        </p>
                        {SUGGESTIONS.map((s, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => sendMessage(s)}
                                disabled={streaming}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                ) : (
                    messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-br-sm'
                                : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                                }`}>
                                {msg.content}
                            </div>
                        </div>
                    ))
                )}

                {typingText && (
                    <div className="flex justify-start">
                        <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2.5 text-sm leading-relaxed text-slate-800">
                            {typingText}
                            <span className="inline-block w-1 h-3.5 bg-slate-400 ml-0.5 animate-pulse rounded-sm" />
                        </div>
                    </div>
                )}

                {streaming && !typingText && (
                    <div className="flex justify-start">
                        <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3">
                            <div className="flex gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
                )}
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-slate-200 px-4 py-3">
                <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 focus-within:border-blue-500 focus-within:bg-white transition-colors">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKey}
                        placeholder="Poser une question... (Entrée pour envoyer)"
                        rows={2}
                        disabled={streaming}
                        className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-slate-400 disabled:opacity-50"
                    />
                    <button
                        type="button"
                        onClick={() => sendMessage(input)}
                        disabled={!input.trim() || streaming}
                        className="shrink-0 rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                    >
                        <Send className="h-4 w-4" />
                    </button>
                </div>
                <p className="mt-1 text-center text-xs text-slate-400">Entrée pour envoyer · Maj+Entrée pour nouvelle ligne</p>
            </div>
        </div>
    );
}

// ─── Sous-composants ──────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;
}

function DetailBlock({ title, value, highlight = false }: {
    title: string;
    value?: string | null;
    highlight?: boolean;
}) {
    if (!value) return null;
    return (
        <div>
            <SectionTitle>{title}</SectionTitle>
            <p className={`mt-1 whitespace-pre-wrap text-sm leading-6 ${highlight ? 'rounded bg-amber-50 px-3 py-2 text-amber-800' : 'text-slate-700'
                }`}>
                {value}
            </p>
        </div>
    );
}
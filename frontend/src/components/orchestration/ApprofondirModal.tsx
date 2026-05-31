'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    X, Send, Loader2, CheckCircle2, XCircle, Pencil,
    Sparkles, BookOpen, AlertCircle,
} from 'lucide-react';
import { API_CONFIG } from '@/lib/api-config';

// ─── Types ────────────────────────────────────────────────────

export interface Piste {
    id: string;
    finding_id: string;
    titre: string;
    description: string;
    statut: 'proposée' | 'retenue' | 'rejetée' | 'en_cours';
    source: 'ia' | 'manual';
    ordre: number;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    intent?: string;
}

interface ApprofondirModalProps {
    piste: Piste;
    findingCategorie: string;
    findingConstat: string;
    findingEtapes: string[];
    onClose: () => void;
    onPisteUpdated: (piste: Piste) => void;
}

// ─── Config intent ────────────────────────────────────────────

const INTENT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    approfondir: { label: 'Approfondissement', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
    corriger: { label: 'Correction', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
    valider: { label: 'Validation', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
    rejeter: { label: 'Rejet', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
    referencer: { label: 'Références', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
    clarifier: { label: 'Clarification', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' },
};

const STATUT_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
    proposée: { label: 'Proposée', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-600 border-gray-200' },
    retenue: { label: 'Retenue', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    rejetée: { label: 'Rejetée', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700 border-red-200' },
    en_cours: { label: 'En cours', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
};

// ─── Suggestions rapides ──────────────────────────────────────

const QUICK_SUGGESTIONS = [
    'Donne-moi les étapes d\'implémentation détaillées',
    'Quel est le ROI estimé de cette piste ?',
    'Quelles sont les références sectorielles applicables ?',
    'Quels sont les risques et points de vigilance ?',
    'Propose une version corrigée de cette piste',
];

// ─── Markdown renderer ────────────────────────────────────────

function inlineMarkdown(text: string): React.ReactNode[] {
    return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g).map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
            return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*'))
            return <em key={i}>{part.slice(1, -1)}</em>;
        if (part.startsWith('`') && part.endsWith('`'))
            return <code key={i} className="bg-black/10 px-1 py-0.5 rounded text-[11px] font-mono">{part.slice(1, -1)}</code>;
        return part;
    });
}

function MarkdownContent({ text, cursor }: { text: string; cursor?: boolean }) {
    const lines = text.split('\n');
    const nodes: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith('### ')) {
            nodes.push(
                <p key={i} className="font-extrabold text-[13px] text-gray-900 mt-3 mb-0.5">
                    {inlineMarkdown(line.slice(4))}
                </p>
            );
        } else if (line.startsWith('## ')) {
            nodes.push(
                <p key={i} className="font-extrabold text-sm text-gray-900 mt-3 mb-0.5">
                    {inlineMarkdown(line.slice(3))}
                </p>
            );
        } else if (line.startsWith('# ')) {
            nodes.push(
                <p key={i} className="font-black text-sm text-gray-900 mt-3 mb-1">
                    {inlineMarkdown(line.slice(2))}
                </p>
            );
        } else if (/^[-*] /.test(line)) {
            const items: React.ReactNode[] = [];
            while (i < lines.length && /^[-*] /.test(lines[i])) {
                items.push(<li key={i}>{inlineMarkdown(lines[i].slice(2))}</li>);
                i++;
            }
            nodes.push(
                <ul key={`ul${i}`} className="list-disc list-inside space-y-0.5 my-1 text-[12.5px]">
                    {items}
                </ul>
            );
            continue;
        } else if (/^\d+\. /.test(line)) {
            const items: React.ReactNode[] = [];
            while (i < lines.length && /^\d+\. /.test(lines[i])) {
                items.push(<li key={i}>{inlineMarkdown(lines[i].replace(/^\d+\. /, ''))}</li>);
                i++;
            }
            nodes.push(
                <ol key={`ol${i}`} className="list-decimal list-inside space-y-0.5 my-1 text-[12.5px]">
                    {items}
                </ol>
            );
            continue;
        } else if (line.trim() === '') {
            nodes.push(<div key={i} className="h-2" />);
        } else {
            const isLast = i === lines.length - 1;
            nodes.push(
                <p key={i} className="text-[12.5px] leading-relaxed">
                    {inlineMarkdown(line)}
                    {cursor && isLast && (
                        <span className="inline-block w-[2px] h-[13px] bg-current align-middle ml-0.5 animate-pulse" />
                    )}
                </p>
            );
        }
        i++;
    }

    return <>{nodes}</>;
}

// ─── ApprofondirModal ─────────────────────────────────────────

export default function ApprofondirModal({
    piste, findingCategorie, findingConstat, findingEtapes,
    onClose, onPisteUpdated,
}: ApprofondirModalProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [waitingResponse, setWaitingResponse] = useState(false);
    const [typingText, setTypingText] = useState('');
    const [typingIntent, setTypingIntent] = useState<string | undefined>();
    const [error, setError] = useState<string | null>(null);
    const [localPiste, setLocalPiste] = useState<Piste>(piste);
    const [pisteFinaleSuggested, setPisteFinaleSuggested] = useState<string | null>(null);
    const [loadingHistory, setLoadingHistory] = useState(true);

    const streaming = waitingResponse || typingText.length > 0;

    // FIX 1 — esRef stocke l'ES courant uniquement pour cleanup au unmount.
    // La fermeture de l'ES se fait via la variable locale `es` capturée en closure,
    // pas via esRef, pour éviter la race condition si deux envois se chevauchent.
    const esRef = useRef<EventSource | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // FIX 3 — ref sur la zone scroll, pas sur un élément fantôme en bas
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const inputRef = useRef<HTMLTextAreaElement>(null);

    // FIX 3 — scroll vers le bas uniquement si l'utilisateur est déjà en bas
    // (threshold 80px). Pendant le typewriter on ne scroll PAS à chaque tick —
    // on laisse l'utilisateur lire. On scroll seulement une fois à la fin.
    const scrollToBottom = useCallback((force = false) => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (force || atBottom) {
            el.scrollTop = el.scrollHeight;
        }
    }, []);

    // Charger l'historique existant
    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(
                    `${API_CONFIG.baseUrl}/api/irritants/pistes/${piste.id}/messages`
                );
                const data = await res.json();
                if (data.success) {
                    setMessages(data.messages.map((m: { role: string; content: string; intent?: string }) => ({
                        role: m.role,
                        content: m.content,
                        intent: m.intent,
                    })));
                }
            } catch { /* ignore */ }
            finally { setLoadingHistory(false); }
        };
        load();
        return () => {
            // Cleanup au unmount — fermer l'ES courant si actif
            esRef.current?.close();
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [piste.id]);

    // Scroll après ajout de messages finalisés (pas pendant le typewriter)
    useEffect(() => {
        if (messages.length > 0) scrollToBottom(true);
    }, [messages, scrollToBottom]);

    // FIX 3 — Typewriter : scroll forcé une seule fois au démarrage pour
    // révéler le bubble, puis on ne scroll plus pendant l'animation.
    const startTypewriter = useCallback((
        fullText: string,
        onDone: () => void,
    ) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        const steps = 160;
        const chunkSize = Math.max(1, Math.ceil(fullText.length / steps));
        let pos = 0;

        // Scroll initial pour révéler le début du bubble typewriter
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

    const sendMessage = async (text: string) => {
        if (!text.trim() || streaming) return;
        setInput('');
        setError(null);
        setPisteFinaleSuggested(null);

        setMessages(prev => [...prev, { role: 'user', content: text }]);
        setWaitingResponse(true);

        const url = `${API_CONFIG.baseUrl}/api/irritants/pistes/${piste.id}/approfondir/stream`
            + `?message=${encodeURIComponent(text)}`;

        // FIX 1 — `es` est capturé en closure. Toutes les fermetures passent
        // par cette variable locale — jamais par esRef — pour éviter qu'un
        // second envoi écrase esRef avant que le premier soit fermé.
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

        es.addEventListener('response', (e) => {
            const data = JSON.parse((e as MessageEvent).data);
            setWaitingResponse(false);
            setTypingIntent(data.intent);

            startTypewriter(data.content, () => {
                setTypingText('');
                setTypingIntent(undefined);
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.content,
                    intent: data.intent,
                }]);
                if (data.piste_finale) setPisteFinaleSuggested(data.piste_finale);
            });
        });

        es.addEventListener('done', (e) => {
            const data = JSON.parse((e as MessageEvent).data);
            closeEs();

            if (data.piste_statut) {
                const updated = {
                    ...localPiste,
                    statut: data.piste_statut as Piste['statut'],
                    ...(data.piste_finale ? { description: data.piste_finale } : {}),
                };
                setLocalPiste(updated);
                onPisteUpdated(updated);
            }
        });

        es.addEventListener('error', (e) => {
            try { setError(JSON.parse((e as MessageEvent).data).message); }
            catch { setError('Erreur de connexion'); }
            setWaitingResponse(false);
            closeEs();
        });

        es.onerror = () => {
            setError('Connexion interrompue');
            setWaitingResponse(false);
            closeEs();
        };
    };

    // Actions directes sans chat
    const handleRetenir = async () => {
        try {
            await fetch(`${API_CONFIG.baseUrl}/api/irritants/pistes/${piste.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ statut: 'retenue' }),
            });
            const updated = { ...localPiste, statut: 'retenue' as const };
            setLocalPiste(updated);
            onPisteUpdated(updated);
        } catch { setError('Erreur lors de la mise à jour'); }
    };

    const handleRejeter = async () => {
        try {
            await fetch(`${API_CONFIG.baseUrl}/api/irritants/pistes/${piste.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ statut: 'rejetée' }),
            });
            const updated = { ...localPiste, statut: 'rejetée' as const };
            setLocalPiste(updated);
            onPisteUpdated(updated);
        } catch { setError('Erreur lors de la mise à jour'); }
    };

    const handleAccepterSuggestion = async () => {
        if (!pisteFinaleSuggested) return;
        try {
            await fetch(`${API_CONFIG.baseUrl}/api/irritants/pistes/${piste.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: pisteFinaleSuggested, statut: 'retenue' }),
            });
            const updated = { ...localPiste, description: pisteFinaleSuggested, statut: 'retenue' as const };
            setLocalPiste(updated);
            onPisteUpdated(updated);
            setPisteFinaleSuggested(null);
        } catch { setError('Erreur lors de la mise à jour'); }
    };

    // FIX 2 — Pré-remplir l'input au lieu d'envoyer directement un message incomplet
    const handleModifierSuggestion = () => {
        setInput('Modifie la suggestion comme suit : ');
        setPisteFinaleSuggested(null);
        setTimeout(() => {
            inputRef.current?.focus();
            // Placer le curseur en fin de texte
            const len = inputRef.current?.value.length ?? 0;
            inputRef.current?.setSelectionRange(len, len);
        }, 50);
    };

    const statutCfg = STATUT_CONFIG[localPiste.statut] ?? STATUT_CONFIG['proposée'];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden"
                style={{ maxHeight: '90vh' }}>

                {/* ── Header ── */}
                <div className="flex-shrink-0 px-6 py-4 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <Sparkles className="w-4 h-4 text-violet-600 flex-shrink-0" />
                                <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">
                                    Approfondissement de piste
                                </p>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border flex items-center gap-1 ${statutCfg.badge}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${statutCfg.dot}`} />
                                    {statutCfg.label}
                                </span>
                            </div>
                            <p className="text-sm font-bold text-gray-900 truncate">{localPiste.titre || 'Piste de résolution'}</p>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{localPiste.description}</p>
                        </div>
                        <button onClick={onClose} title="Fermer"
                            className="flex-shrink-0 p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-700 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Contexte finding */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                            {findingCategorie}
                        </span>
                        {findingEtapes.slice(0, 3).map((e, i) => (
                            <span key={i} className="text-xs bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-mono">
                                {e.length > 30 ? e.slice(0, 30) + '…' : e}
                            </span>
                        ))}
                    </div>

                    {/* Actions directes */}
                    {localPiste.statut === 'proposée' && (
                        <div className="mt-3 flex gap-2">
                            <button onClick={handleRetenir}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Retenir telle quelle
                            </button>
                            <button onClick={handleRejeter}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors">
                                <XCircle className="w-3.5 h-3.5" />
                                Rejeter
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Zone chat ── */}
                {/* FIX 3 — ref sur ce div, pas sur un bottomRef fantôme */}
                <div
                    ref={scrollContainerRef}
                    className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
                    style={{ minHeight: 0 }}
                >
                    {loadingHistory ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        </div>
                    ) : messages.length === 0 && !typingText && !waitingResponse ? (
                        <div className="text-center py-6">
                            <div className="w-12 h-12 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <BookOpen className="w-6 h-6 text-violet-600" />
                            </div>
                            <p className="text-sm font-semibold text-gray-700 mb-1">Démarrez l'analyse</p>
                            <p className="text-xs text-gray-400">
                                Posez une question ou choisissez une suggestion ci-dessous.
                            </p>
                        </div>
                    ) : (
                        <>
                            {messages.map((msg, i) => (
                                <MessageBubble key={i} msg={msg} />
                            ))}
                        </>
                    )}

                    {/* Waiting for API */}
                    {waitingResponse && (
                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center">
                                <Loader2 className="w-3.5 h-3.5 text-violet-600 animate-spin" />
                            </div>
                            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-gray-100">
                                <div className="flex gap-1">
                                    {[0, 1, 2].map(j => (
                                        <span key={j} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                                            style={{ animationDelay: `${j * 0.15}s` }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Typewriter bubble */}
                    {typingText && (
                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700">
                                IA
                            </div>
                            <div className="flex-1 max-w-[85%] flex flex-col gap-1">
                                {typingIntent && INTENT_CONFIG[typingIntent] && (
                                    <span className={`self-start text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${INTENT_CONFIG[typingIntent].bg} ${INTENT_CONFIG[typingIntent].color}`}>
                                        {INTENT_CONFIG[typingIntent].label}
                                    </span>
                                )}
                                <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-gray-100 text-gray-800">
                                    <MarkdownContent text={typingText} cursor />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Spacer en bas pour que le dernier message ne soit pas collé au bord */}
                    <div className="h-2" />
                </div>

                {/* ── Suggestion de piste finale ── */}
                {pisteFinaleSuggested && (
                    <div className="flex-shrink-0 mx-6 mb-3 rounded-xl border border-emerald-300 bg-emerald-50 overflow-hidden">
                        <div className="px-4 py-2 border-b border-emerald-200 flex items-center justify-between">
                            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
                                Version suggérée par l'IA
                            </p>
                            <button onClick={() => setPisteFinaleSuggested(null)} title="Fermer"
                                className="text-emerald-400 hover:text-emerald-700 transition-colors">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="px-4 py-3">
                            <p className="text-sm text-gray-800 leading-relaxed">{pisteFinaleSuggested}</p>
                        </div>
                        <div className="px-4 pb-3 flex gap-2">
                            <button onClick={handleAccepterSuggestion}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Accepter et retenir
                            </button>
                            {/* FIX 2 — pré-remplir l'input au lieu d'envoyer directement */}
                            <button onClick={handleModifierSuggestion}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-50 transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                                Modifier
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Erreur ── */}
                {error && (
                    <div className="flex-shrink-0 mx-6 mb-2 flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        {error}
                        <button onClick={() => setError(null)} title="Fermer" className="ml-auto">
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                )}

                {/* ── Suggestions rapides ── */}
                {messages.length === 0 && !loadingHistory && (
                    <div className="flex-shrink-0 px-6 pb-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Suggestions</p>
                        <div className="flex flex-wrap gap-1.5">
                            {QUICK_SUGGESTIONS.map((s, i) => (
                                <button key={i} onClick={() => sendMessage(s)}
                                    disabled={streaming}
                                    className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 hover:bg-violet-100 hover:text-violet-700 transition-colors border border-gray-200 hover:border-violet-200 disabled:opacity-40">
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Input ── */}
                <div className="flex-shrink-0 px-6 pb-5 pt-2 border-t border-gray-100">
                    <div className="flex gap-2 items-end">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage(input);
                                }
                            }}
                            placeholder="Posez une question ou donnez une instruction… (Entrée pour envoyer)"
                            rows={2}
                            disabled={streaming}
                            className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 resize-none disabled:opacity-50 leading-relaxed"
                        />
                        <button
                            onClick={() => sendMessage(input)}
                            disabled={!input.trim() || streaming}
                            className="flex-shrink-0 p-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-40 transition-colors"
                        >
                            {streaming
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Send className="w-4 h-4" />
                            }
                        </button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">
                        Shift+Entrée pour sauter une ligne · Les modifications sont sauvegardées automatiquement
                    </p>
                </div>
            </div>
        </div>
    );
}

// ─── MessageBubble ────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
    return (
        <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-violet-100 text-violet-700'
                }`}>
                {msg.role === 'user' ? 'V' : 'IA'}
            </div>

            <div className={`flex-1 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                {msg.role === 'assistant' && msg.intent && INTENT_CONFIG[msg.intent] && (
                    <span className={`self-start text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${INTENT_CONFIG[msg.intent].bg} ${INTENT_CONFIG[msg.intent].color}`}>
                        {INTENT_CONFIG[msg.intent].label}
                    </span>
                )}
                <div className={`px-4 py-3 rounded-2xl text-sm ${msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-sm text-[12.5px] leading-relaxed'
                        : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}>
                    {msg.role === 'user'
                        ? msg.content
                        : <MarkdownContent text={msg.content} />
                    }
                </div>
            </div>
        </div>
    );
}
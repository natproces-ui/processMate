'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Table1Row } from '@/logic/types';
import { TaskEnrichment } from '@/logic/bpmnTypes';
import { applyOperations } from '@/logic/workflowOperations';
import { API_CONFIG } from '@/lib/api-config';
import { processingLevelHeaders, type ProcessingLevel } from '@/lib/processing-level';
import ProcessingLevelSelector from '@/components/processmate/ProcessingLevelSelector';
import {
    ArrowUp, Paperclip, X, FileText, Image as ImageIcon,
    Loader2, PenLine, Plus, ChevronDown, ChevronUp,
    Sparkles, Wand2, RefreshCw, Globe, HelpCircle, BookOpen, Code, Mic, Square
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type Intent = 'generate' | 'patch' | 'regen' | 'web_search' | 'clarify' | 'transcribe' | 'explain';

interface AttachedFile {
    id: string;
    file: File;
    type: 'pdf' | 'image';
    previewUrl?: string;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'clarify';
    content: string;
    intent?: Intent;
    totalSteps?: number;
    title?: string;
    operationsCount?: number;
    createdAt: Date;
}

interface ChatInterfaceProps {
    processingLevel?: ProcessingLevel;
    onProcessingLevelChange?: (level: ProcessingLevel) => void;
    inputContext?: React.ReactNode;
    inputContextVisible?: boolean;
    onOpenDocuments?: () => void;
    onOpenCode?: () => void;
    recording?: boolean;
    processing?: boolean;
    onToggleRecording?: () => void;
    onCancelRecording?: () => void;
    onNewConversation?: () => void;
    /** Texte dicté à insérer dans le champ (id change à chaque dictée) */
    insertText?: { id: number; text: string };
    currentWorkflow: Table1Row[];
    currentEnrichments?: Map<string, TaskEnrichment>;
    currentProcedureMetadata?: Record<string, unknown> | null;
    onWorkflowGenerated: (
        workflow: Table1Row[],
        title: string,
        enrichments: Map<string, TaskEnrichment>,
        procedureMetadata?: any
    ) => void;
    onError: (msg: string) => void;
    onSuccess: (msg: string) => void;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const ACCEPTED_TYPES: Record<string, 'pdf' | 'image'> = {
    'application/pdf': 'pdf',
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/jpg': 'image',
    'image/webp': 'image',
};

function formatTime(date: Date) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function IntentBadge({ intent }: { intent: Intent }) {
    const config: Record<Intent, { icon: React.ReactNode; label: string; color: string }> = {
        generate: {
            icon: <Sparkles className="w-3 h-3" />,
            label: 'Génération',
            color: 'bg-blue-100 text-blue-700'
        },
        patch: {
            icon: <Wand2 className="w-3 h-3" />,
            label: 'Révision',
            color: 'bg-violet-100 text-violet-700'
        },
        regen: {
            icon: <RefreshCw className="w-3 h-3" />,
            label: 'Regénération',
            color: 'bg-amber-100 text-amber-700'
        },
        web_search: {
            icon: <Globe className="w-3 h-3" />,
            label: 'Recherche web',
            color: 'bg-green-100 text-green-700'
        },
        clarify: {
            icon: <HelpCircle className="w-3 h-3" />,
            label: 'Clarification',
            color: 'bg-slate-100 text-slate-600'
        },
        transcribe: {
            icon: <FileText className="w-3 h-3" />,
            label: 'Transcription',
            color: 'bg-teal-100 text-teal-700'
        },
        explain: {
            icon: <BookOpen className="w-3 h-3" />,
            label: 'Explication',
            color: 'bg-indigo-100 text-indigo-700'
        },
    };

    const c = config[intent];
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${c.color}`}>
            {c.icon}
            {c.label}
        </span>
    );
}

// ─────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────

export default function ChatInterface({
    processingLevel, onProcessingLevelChange, inputContext, inputContextVisible = true, onOpenDocuments, onOpenCode,
    recording = false, processing = false, onToggleRecording, onCancelRecording, onNewConversation, insertText,
    currentWorkflow,
    currentEnrichments,
    currentProcedureMetadata,
    onWorkflowGenerated,
    onError,
    onSuccess,
}: ChatInterfaceProps) {

    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [initialized, setInitialized] = useState(false);

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [addMenuOpen, setAddMenuOpen] = useState(false);

    // Dictée : le texte arrive dans le champ, l'utilisateur relit puis envoie
    useEffect(() => {
        if (!insertText?.text) return;
        setInput(prev => (prev.trim() ? `${prev.trimEnd()} ${insertText.text}` : insertText.text));
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            el.setSelectionRange(el.value.length, el.value.length);
        });
    }, [insertText?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    const addMenuRef = useRef<HTMLDivElement>(null);

    // Menu « + » : se ferme au clic extérieur ou avec Échap (plus besoin de recliquer sur +)
    useEffect(() => {
        if (!addMenuOpen) return;
        const onPointer = (e: MouseEvent) => {
            if (!addMenuRef.current?.contains(e.target as Node)) setAddMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAddMenuOpen(false); };
        document.addEventListener('mousedown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [addMenuOpen]);

    useEffect(() => {
        if (messages.length === 0 && !loading) return;
        const container = messagesContainerRef.current;
        container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }, [messages, loading]);

    useEffect(() => {
        initSession();
    }, []);

    const initSession = async () => {
        try {
            const res = await fetch(API_CONFIG.getFullUrl(API_CONFIG.endpoints.chatSession), {
                method: 'POST'
            });
            const data = await res.json();
            if (!res.ok || !data.success || !data.session?.id) throw new Error("Session indisponible");
            setSessionId(data.session.id);
            setInitialized(true);
        } catch {
            setSessionId(crypto.randomUUID());
            setInitialized(true);
        }
    };

    // ── Gestion fichiers ─────────────────────────────────────
    const addFiles = useCallback((incoming: File[]) => {
        const toAdd = incoming.slice(0, 3 - attachedFiles.length);
        const newFiles: AttachedFile[] = [];

        for (const file of toAdd) {
            const type = ACCEPTED_TYPES[file.type];
            if (!type) { onError(`Format non supporté : ${file.name}`); continue; }
            if (file.size > 20 * 1024 * 1024) { onError(`Fichier trop lourd : ${file.name}`); continue; }

            const entry: AttachedFile = { id: crypto.randomUUID(), file, type };

            if (type === 'image') {
                const reader = new FileReader();
                reader.onload = e => {
                    setAttachedFiles(prev =>
                        prev.map(f => f.id === entry.id
                            ? { ...f, previewUrl: e.target?.result as string }
                            : f
                        )
                    );
                };
                reader.readAsDataURL(file);
            }

            newFiles.push(entry);
        }

        setAttachedFiles(prev => [...prev, ...newFiles]);
    }, [attachedFiles, onError]);

    const removeFile = (id: string) =>
        setAttachedFiles(prev => prev.filter(f => f.id !== id));

    // ── Construction de l'historique à envoyer ───────────────
    const buildHistory = () => messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
        }));

    // ── Envoi message ────────────────────────────────────────
    const sendMessage = async (overrideInput?: string) => {
        const text = overrideInput ?? input;
        if (!text.trim() && attachedFiles.length === 0) return;
        if (!sessionId || loading) return;

        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text.trim() || `${attachedFiles.length} fichier(s) joint(s)`,
            createdAt: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        if (!overrideInput) setInput('');
        setLoading(true);

        try {
            const form = new FormData();
            form.append('session_id', sessionId);
            form.append('message', text.trim() || 'Analyse ces fichiers et génère le workflow');
            form.append('history', JSON.stringify(buildHistory()));

            if (currentWorkflow && currentWorkflow.length > 0) {
                form.append('current_workflow', JSON.stringify(currentWorkflow));
            }

            if (currentEnrichments && currentEnrichments.size > 0) {
                const enrichObj: Record<string, unknown> = {};
                currentEnrichments.forEach((v, k) => { enrichObj[k] = v; });
                form.append('current_enrichments', JSON.stringify(enrichObj));
            }

            if (currentProcedureMetadata) {
                form.append('current_procedure_metadata', JSON.stringify(currentProcedureMetadata));
            }

            for (const f of attachedFiles) {
                form.append('files', f.file);
            }

            const res = await fetch(
                API_CONFIG.getFullUrl(API_CONFIG.endpoints.chatMessage),
                { method: 'POST', headers: processingLevelHeaders(processingLevel), body: form }
            );

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Erreur serveur');

            const intent: Intent = data.intent || 'generate';

            // ── CAS CLARIFY ──────────────────────────────────
            if (intent === 'clarify') {
                const clarifyMsg: ChatMessage = {
                    id: crypto.randomUUID(),
                    role: 'clarify',
                    content: data.clarify_question || 'Pouvez-vous préciser votre demande ?',
                    intent: 'clarify',
                    createdAt: new Date()
                };
                setMessages(prev => [...prev, clarifyMsg]);
                setAttachedFiles([]);
                return;
            }

            // ── CAS EXPLAIN : réponse textuelle, pas de modification ──
            if (intent === 'explain') {
                const explainMsg: ChatMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: data.answer || '',
                    intent: 'explain',
                    createdAt: new Date()
                };
                setMessages(prev => [...prev, explainMsg]);
                setAttachedFiles([]);
                return;
            }

            // ── CAS PATCH ────────────────────────────────────
            if (intent === 'patch') {
                const revised = applyOperations(currentWorkflow, data.operations || []);

                const assistantMsg: ChatMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: data.explanation || 'Modifications appliquées',
                    intent: 'patch',
                    operationsCount: data.operations_count || 0,
                    createdAt: new Date()
                };
                setMessages(prev => [...prev, assistantMsg]);

                const enrichMap = new Map<string, TaskEnrichment>();
                onWorkflowGenerated(revised, '', enrichMap, null);
                onSuccess(`✓ ${data.explanation}`);
                setAttachedFiles([]);
                return;
            }

            // ── CAS GENERATE / REGEN / WEB_SEARCH / TRANSCRIBE ──
            const totalSteps = data.workflow?.length || 0;
            const assistantMsg: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: buildAssistantMessage(intent, data.title, totalSteps),
                intent,
                totalSteps,
                title: data.title,
                createdAt: new Date()
            };

            setMessages(prev => [...prev, assistantMsg]);

            const enrichMap = new Map<string, TaskEnrichment>();
            if (data.enrichments) {
                Object.entries(data.enrichments).forEach(([id, enr]: [string, any]) => {
                    enrichMap.set(id, enr);
                });
            }

            onWorkflowGenerated(
                data.workflow,
                data.title,
                enrichMap,
                data.procedureMetadata || null
            );

            onSuccess(`✓ ${totalSteps} étapes — "${data.title}"`);
            setAttachedFiles([]);

        } catch (err: any) {
            onError(err.message || 'Erreur lors du traitement');
            setMessages(prev => prev.filter(m => m.id !== userMessage.id));
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const newSession = async () => {
        if (loading || !initialized) return;
        setInitialized(false);
        setMessages([]);
        setInput('');
        setAttachedFiles([]);
        setCollapsed(false);
        onNewConversation?.();
        setSessionId(null);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        await initSession();
        requestAnimationFrame(() => textareaRef.current?.focus());
    };

    // ─────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────

    return (
        <section aria-label="Assistant ProcessMate" className="w-full max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800">{messages.length === 0 ? 'Que souhaitez-vous formaliser ?' : 'Assistant ProcessMate'}</h3>
                    {currentWorkflow.length > 0 && <p className="text-xs text-slate-400 mt-0.5">Processus actuel : {currentWorkflow.length} étapes</p>}
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={newSession} disabled={loading || !initialized}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-white hover:text-slate-800 disabled:opacity-40"
                        title="Démarrer une nouvelle conversation">
                        <PenLine className="w-3.5 h-3.5" /> Nouvelle conversation
                    </button>
                    <button type="button" aria-label={collapsed ? 'Ouvrir l’assistant' : 'Réduire l’assistant'} aria-expanded={!collapsed}
                        onClick={() => setCollapsed(c => !c)} className="p-1.5 rounded-lg hover:bg-white text-slate-400">
                        {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                </div>
            </div>
            <div hidden={collapsed}>
                <div ref={messagesContainerRef} hidden={messages.length === 0 && !loading}
                    className="overflow-y-auto max-h-[40vh] h-64 px-3 py-3 space-y-3 mb-2 rounded-xl bg-white/60">
                        {messages.map(msg => (
                            <div key={msg.id}>
                                {/* Message utilisateur */}
                                {msg.role === 'user' && (
                                    <div className="flex justify-end">
                                        <div className="max-w-[80%] bg-blue-600 text-white rounded-xl rounded-br-sm px-3 py-2 text-sm">
                                            <p className="leading-relaxed">{msg.content}</p>
                                            <p className="text-xs text-blue-200 mt-1">{formatTime(msg.createdAt)}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Message assistant (résultat ou explication) */}
                                {msg.role === 'assistant' && (
                                    <div className="flex justify-start">
                                        <div className="max-w-[80%] bg-white border border-slate-200 rounded-xl rounded-bl-sm px-3 py-2 text-sm shadow-sm">
                                            {msg.intent && (
                                                <div className="mb-1.5">
                                                    <IntentBadge intent={msg.intent} />
                                                </div>
                                            )}
                                            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                            {msg.totalSteps !== undefined && msg.totalSteps > 0 && (
                                                <p className="text-xs text-emerald-600 font-medium mt-1">
                                                    ✓ {msg.totalSteps} étape{msg.totalSteps > 1 ? 's' : ''}
                                                </p>
                                            )}
                                            {msg.operationsCount !== undefined && msg.intent === 'patch' && (
                                                <p className="text-xs text-violet-600 font-medium mt-1">
                                                    ✓ {msg.operationsCount} opération{msg.operationsCount > 1 ? 's' : ''} appliquée{msg.operationsCount > 1 ? 's' : ''}
                                                </p>
                                            )}
                                            <p className="text-xs text-slate-400 mt-1">{formatTime(msg.createdAt)}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Message clarification */}
                                {msg.role === 'clarify' && (
                                    <div className="flex justify-start">
                                        <div className="max-w-[85%] bg-amber-50 border border-amber-200 rounded-xl rounded-bl-sm px-3 py-2.5 text-sm">
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                                                <span className="text-xs font-medium text-amber-700">Précision nécessaire</span>
                                            </div>
                                            <p className="text-slate-700 leading-relaxed">{msg.content}</p>
                                            <p className="text-xs text-slate-400 mt-1">{formatTime(msg.createdAt)}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-slate-200 rounded-xl rounded-bl-sm px-4 py-3 shadow-sm">
                                    <div className="flex items-center gap-2 text-slate-500">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span className="text-xs">Analyse en cours…</span>
                                    </div>
                                </div>
                            </div>
                        )}


                </div>
                <div aria-label="Composeur" className="rounded-2xl border border-slate-300 bg-white shadow-sm focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
                    {inputContext && <div hidden={!inputContextVisible} className="border-b border-slate-100 p-3 bg-slate-50/50 rounded-t-2xl">{inputContext}</div>}
                    <div className="px-3 py-2">
                    {/* ── Fichiers attachés ─────────────────── */}
                    {attachedFiles.length > 0 && (
                        <div className="pb-2 flex gap-2 flex-wrap">
                            {attachedFiles.map(f => (
                                <div
                                    key={f.id}
                                    className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1"
                                >
                                    {f.type === 'image' && f.previewUrl
                                        ? <img src={f.previewUrl} alt="" className="w-5 h-5 rounded object-cover" />
                                        : f.type === 'pdf'
                                            ? <FileText className="w-3.5 h-3.5 text-red-500" />
                                            : <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                                    }
                                    <span className="text-xs text-slate-600 max-w-[100px] truncate">
                                        {f.file.name}
                                    </span>
                                    <button
                                        aria-label={`Retirer ${f.file.name}`}
                                        onClick={() => removeFile(f.id)}
                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}


                            <textarea
                                ref={textareaRef}
                                aria-label="Message à l’assistant"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={
                                    currentWorkflow.length > 0
                                        ? 'Posez une question ou modifiez le workflow…'
                                        : 'Décrivez votre processus ou joignez un fichier…'
                                }
                                disabled={loading || !initialized}
                                rows={1}
                                className="block w-full min-w-0 text-sm bg-transparent px-1 py-2 resize-none focus:outline-none disabled:opacity-50 min-h-[52px] max-h-[120px]"
                                title="Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne"
                                style={{ height: 'auto' }}
                                onInput={e => {
                                    const el = e.target as HTMLTextAreaElement;
                                    el.style.height = 'auto';
                                    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                                }}
                            />


                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-1">
                            {onOpenDocuments || onOpenCode ? (
                                <div ref={addMenuRef} className="relative shrink-0">
                                    <button type="button" aria-label="Ajouter un contenu" title="Ajouter un contenu"
                                        aria-haspopup="menu" aria-expanded={addMenuOpen}
                                        onClick={() => setAddMenuOpen(o => !o)}
                                        className={`p-2 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${addMenuOpen ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>
                                        <Plus className={`w-4 h-4 transition-transform ${addMenuOpen ? 'rotate-45' : ''}`} />
                                    </button>
                                    {addMenuOpen && (
                                        <div role="menu" className="absolute bottom-full left-0 mb-2 z-40 w-60 p-1.5 bg-white border border-slate-200 rounded-xl shadow-lg">
                                            {onOpenDocuments && <ComposerMenuAction icon={<BookOpen className="w-4 h-4" />} label="Sources et références" onClick={() => { setAddMenuOpen(false); onOpenDocuments(); }} />}
                                            <ComposerMenuAction icon={<Paperclip className="w-4 h-4" />} label="Joindre au message" onClick={() => { setAddMenuOpen(false); fileInputRef.current?.click(); }} disabled={attachedFiles.length >= 3} />
                                            {onOpenCode && <ComposerMenuAction icon={<Code className="w-4 h-4" />} label="Code source" onClick={() => { setAddMenuOpen(false); onOpenCode(); }} />}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={attachedFiles.length >= 3}
                                    className="p-2 rounded-lg text-slate-500 hover:text-blue-600 disabled:opacity-40 shrink-0" title="Joindre un fichier">
                                    <Paperclip className="w-4 h-4" />
                                </button>
                            )}

                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept=".pdf,image/png,image/jpeg,image/webp"
                                onChange={e => {
                                    if (e.target.files) addFiles(Array.from(e.target.files));
                                    e.target.value = '';
                                }}
                                className="hidden"
                            />


                                {onToggleRecording && <button type="button" onClick={onToggleRecording} disabled={processing}
                                    aria-pressed={recording}
                                    className={['inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-50', recording ? 'bg-red-50 text-red-600' : 'text-slate-600 hover:bg-slate-100'].join(' ')}>
                                    {recording ? <Square className="w-4 h-4" /> : processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                                    {recording ? 'Arrêter le vocal' : processing ? 'Traitement vocal…' : 'Vocal'}
                                </button>}
                                {recording && onCancelRecording && <button type="button" onClick={onCancelRecording} className="text-xs text-slate-500 hover:text-red-600">Annuler le vocal</button>}

                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                {processingLevel && onProcessingLevelChange && <ProcessingLevelSelector value={processingLevel} onChange={onProcessingLevelChange} />}
                            <button
                                aria-label="Envoyer le message"
                                title="Envoyer (Entrée)"
                                type="button"
                                onClick={() => sendMessage()}
                                disabled={loading || !initialized || (!input.trim() && attachedFiles.length === 0)}
                                className={`
                                    w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors
                                    focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300
                                    ${loading || (!input.trim() && attachedFiles.length === 0)
                                        ? 'bg-slate-200 text-white cursor-not-allowed'
                                        : 'bg-slate-900 text-white hover:bg-slate-700'
                                    }
                                `}
                            >
                                {loading
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                                }
                            </button>

                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────
// HELPERS LOCAUX
// ─────────────────────────────────────────────────────────────

function buildAssistantMessage(intent: Intent, title: string, totalSteps: number): string {
    switch (intent) {
        case 'generate':
            return `Processus "${title}" généré — ${totalSteps} étapes`;
        case 'regen':
            return `Processus "${title}" regénéré — ${totalSteps} étapes`;
        case 'web_search':
            return `Processus "${title}" constitué depuis les connaissances réglementaires — ${totalSteps} étapes`;
        case 'transcribe':
            return `Processus "${title}" transcrit — ${totalSteps} étapes`;
        default:
            return `"${title}" — ${totalSteps} étapes`;
    }
}
function ComposerMenuAction({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
    return <button type="button" disabled={disabled} onClick={onClick} role="menuitem"
        className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-left text-slate-600 hover:bg-slate-50 disabled:opacity-40">{icon}{label}</button>;
}

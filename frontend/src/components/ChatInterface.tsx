'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Table1Row } from '@/logic/bpmnGenerator';
import { TaskEnrichment } from '@/logic/bpmnTypes';
import { API_CONFIG } from '@/lib/api-config';
import {
    Send, Paperclip, X, FileText, Image as ImageIcon,
    Loader2, MessageSquare, Plus, ChevronDown, ChevronUp,
    Sparkles, Wand2, RefreshCw, Globe, HelpCircle, BookOpen
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
    currentWorkflow: Table1Row[];
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
    currentWorkflow,
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

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        initSession();
    }, []);

    const initSession = async () => {
        try {
            const res = await fetch(API_CONFIG.getFullUrl(API_CONFIG.endpoints.chatSession), {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                setSessionId(data.session.id);
                setInitialized(true);
            }
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

            for (const f of attachedFiles) {
                form.append('files', f.file);
            }

            const res = await fetch(
                API_CONFIG.getFullUrl(API_CONFIG.endpoints.chatMessage),
                { method: 'POST', body: form }
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
        setMessages([]);
        setAttachedFiles([]);
        setSessionId(null);
        await initSession();
        onSuccess('Nouvelle session démarrée');
    };

    // ─────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────

    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">

            {/* ── Header ───────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                        <MessageSquare className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-slate-800">Assistant ProcessMate</h3>
                        <p className="text-xs text-slate-400">
                            {currentWorkflow.length > 0
                                ? `Workflow actuel : ${currentWorkflow.length} étapes`
                                : 'Décrivez votre processus ou joignez un fichier'
                            }
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={newSession}
                        className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500 hover:text-slate-700"
                        title="Nouvelle session"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setCollapsed(c => !c)}
                        className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500"
                    >
                        {collapsed
                            ? <ChevronDown className="w-4 h-4" />
                            : <ChevronUp className="w-4 h-4" />
                        }
                    </button>
                </div>
            </div>

            {!collapsed && (
                <>
                    {/* ── Messages ─────────────────────────── */}
                    <div className="h-64 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/50">

                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                                    <Sparkles className="w-5 h-5 text-blue-500" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-700">Prêt à formaliser</p>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        Génération, correction, amélioration — dites simplement ce que vous voulez
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2 justify-center mt-1">
                                    {[
                                        'Extrais le processus de ce document',
                                        'Ajoute une étape de validation entre 3 et 4',
                                        'Inspire-toi de ce template pour reformater',
                                    ].map(suggestion => (
                                        <button
                                            key={suggestion}
                                            onClick={() => setInput(suggestion)}
                                            className="text-xs bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full hover:border-blue-300 hover:text-blue-600 transition-colors"
                                        >
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

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

                        <div ref={messagesEndRef} />
                    </div>

                    {/* ── Fichiers attachés ─────────────────── */}
                    {attachedFiles.length > 0 && (
                        <div className="px-4 py-2 border-t border-slate-100 flex gap-2 flex-wrap bg-white">
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
                                        onClick={() => removeFile(f.id)}
                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Input ────────────────────────────── */}
                    <div className="px-4 py-3 border-t border-slate-200 bg-white">
                        <div className="flex gap-2 items-end">

                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={attachedFiles.length >= 3}
                                className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                                title="Joindre un fichier"
                            >
                                <Paperclip className="w-4 h-4" />
                            </button>

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

                            <textarea
                                ref={textareaRef}
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
                                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 disabled:opacity-50 min-h-[38px] max-h-[120px]"
                                style={{ height: 'auto' }}
                                onInput={e => {
                                    const el = e.target as HTMLTextAreaElement;
                                    el.style.height = 'auto';
                                    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                                }}
                            />

                            <button
                                onClick={() => sendMessage()}
                                disabled={loading || !initialized || (!input.trim() && attachedFiles.length === 0)}
                                className={`
                                    p-2 rounded-lg flex items-center justify-center flex-shrink-0 transition-all
                                    ${loading || (!input.trim() && attachedFiles.length === 0)
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }
                                `}
                            >
                                {loading
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <Send className="w-4 h-4" />
                                }
                            </button>
                        </div>

                        <p className="text-xs text-slate-400 mt-1.5">
                            Entrée pour envoyer · Maj+Entrée pour nouvelle ligne
                        </p>
                    </div>
                </>
            )}
        </div>
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

type Operation = {
    type: 'add' | 'update' | 'delete' | 'move' | 'relink';
    id?: string;
    after_id?: string;
    row?: any;
    fields?: any;
    acteur?: string;
    département?: string;
    outputs?: { targetId: string; label: string }[];
    reconnect?: boolean;
};

function applyOperations(workflow: Table1Row[], operations: Operation[]): Table1Row[] {
    let result = [...workflow];

    const maxId = result.reduce((max, row) => {
        const num = parseInt(row.id, 10);
        return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    let nextId = maxId + 1;

    const idMapping: Record<string, string> = {};
    operations.forEach(op => {
        if (op.type === 'add' && op.row?.id?.startsWith('NEW_')) {
            idMapping[op.row.id] = String(nextId++);
        }
    });

    const resolveId = (id: string) => idMapping[id] || id;
    const resolveOutputs = (outputs?: { targetId: string; label: string }[]) =>
        outputs?.map(o => ({ ...o, targetId: resolveId(o.targetId) })) || [];

    for (const op of operations) {
        switch (op.type) {
            case 'add': {
                if (!op.row) break;
                const newRow: Table1Row = {
                    id: resolveId(op.row.id || 'NEW_0'),
                    étape: op.row.étape || '',
                    typeBpmn: op.row.typeBpmn || 'Task',
                    département: op.row.département || '',
                    acteur: op.row.acteur || '',
                    condition: op.row.condition || '',
                    outputs: resolveOutputs(op.row.outputs),
                    outil: op.row.outil || '',
                };
                if (!op.after_id) {
                    result = [newRow, ...result];
                } else {
                    const idx = result.findIndex(r => r.id === op.after_id);
                    result = idx === -1
                        ? [...result, newRow]
                        : [...result.slice(0, idx + 1), newRow, ...result.slice(idx + 1)];
                }
                break;
            }
            case 'update': {
                if (!op.id || !op.fields) break;
                result = result.map(row => {
                    if (row.id !== op.id) return row;
                    const updated = { ...row };
                    Object.entries(op.fields).forEach(([key, value]) => {
                        (updated as any)[key] = key === 'outputs'
                            ? resolveOutputs(value as any)
                            : value;
                    });
                    return updated;
                });
                break;
            }
            case 'delete': {
                if (!op.id) break;
                const toDelete = result.find(r => r.id === op.id);
                if (op.reconnect && toDelete) {
                    const deletedTargets = toDelete.outputs.map(o => o.targetId);
                    result = result.map(row => {
                        if (!row.outputs.some(o => o.targetId === op.id)) return row;
                        return {
                            ...row,
                            outputs: row.outputs.flatMap(o =>
                                o.targetId === op.id
                                    ? deletedTargets.map(t => ({ targetId: t, label: o.label }))
                                    : [o]
                            )
                        };
                    });
                }
                result = result.filter(r => r.id !== op.id);
                break;
            }
            case 'move': {
                if (!op.id) break;
                result = result.map(row =>
                    row.id !== op.id ? row : {
                        ...row,
                        acteur: op.acteur ?? row.acteur,
                        département: op.département ?? row.département,
                    }
                );
                break;
            }
            case 'relink': {
                if (!op.id) break;
                result = result.map(row =>
                    row.id !== op.id ? row : { ...row, outputs: resolveOutputs(op.outputs) }
                );
                break;
            }
        }
    }

    return result;
}
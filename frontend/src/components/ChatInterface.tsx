'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Table1Row } from '@/logic/types';
import { TaskEnrichment } from '@/logic/bpmnTypes';
import { applyOperations } from '@/logic/workflowOperations';
import { API_CONFIG } from '@/lib/api-config';
import { processingLevelHeaders, type ProcessingLevel } from '@/lib/processing-level';
import ProcessingLevelSelector from '@/components/processmate/ProcessingLevelSelector';
import MiniMarkdown from '@/components/shared/MiniMarkdown';
import {
    ArrowUp, Paperclip, X, FileText, Image as ImageIcon,
    Loader2, PenLine, Plus, ChevronDown, ChevronUp,
    Sparkles, Wand2, RefreshCw, Globe, HelpCircle, BookOpen, Code, Mic, Square, CheckCircle2, AlertCircle, CircleStop, PanelLeftClose, Copy, Check, RotateCcw, Pencil, ChevronRight
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

// ── Conversation en flux (/api/studio) ─────────────────────────
interface SentAttachment { name: string; type: 'pdf' | 'image'; previewUrl?: string; size?: number }

interface TurnStep { id: string; label: string; state: 'running' | 'done' | 'stopped' }
export interface TurnProcedure {
    id: string; title: string; description?: string;
    sources?: { file: string; pages?: string | null }[]; estimated_steps?: number;
}
interface TurnProposal { procedures: TurnProcedure[]; selected: string[]; submitted?: boolean }
interface TurnGeneration { key: string; title: string; status: 'generating' | 'ready' | 'error' | 'stopped'; steps?: number; error?: string }
/** Procédure générée, transmise au Studio (key unique dans la conversation) */
export interface GeneratedProcedure {
    key: string; title: string; workflow: Table1Row[];
    enrichments: Map<string, TaskEnrichment>; procedureMetadata: Record<string, unknown>;
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
    attachments?: SentAttachment[];
    steps?: TurnStep[];
    proposal?: TurnProposal;
    generations?: TurnGeneration[];
    streaming?: boolean;
    startedAt?: number;
    /** Relecture après génération (Markdown, en flux) et actions proposées */
    remarks?: string;
    suggestions?: string[];
    endedAt?: number;
    /** Fichiers d'origine d'un message utilisateur (pour réessayer / modifier) */
    files?: File[];
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
    /** Génération de procédures depuis la conversation (un onglet par procédure) */
    onProcedureStarted?: (key: string, title: string) => void;
    onProcedureReady?: (proc: GeneratedProcedure) => void;
    onProcedureError?: (key: string, message: string) => void;
    onSelectProcedure?: (key: string) => void;
    /** 'sidebar' : colonne pleine hauteur, composeur en bas (Studio) */
    variant?: 'inline' | 'sidebar';
    /** Masquer l’assistant (mode colonne) */
    onCollapse?: () => void;
    /** Fichiers envoyés (pour la capture d'annexes à l'export) */
    onFilesSent?: (files: File[]) => void;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const MAX_ATTACHMENTS = 10; // même limite que /api/studio/turn

const ACCEPTED_TYPES: Record<string, 'pdf' | 'image'> = {
    'application/pdf': 'pdf',
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/jpg': 'image',
    'image/webp': 'image',
};

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
    onProcedureStarted,
    onProcedureReady,
    onProcedureError,
    onSelectProcedure,
    variant = 'inline',
    onCollapse,
    onFilesSent,
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
    const [dragging, setDragging] = useState(false);

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

    // Identifiant de conversation local : plus de session créée en base à chaque ouverture
    const initSession = async () => {
        setSessionId(crypto.randomUUID());
        setInitialized(true);
    };

    // ── Gestion fichiers ─────────────────────────────────────
    const addFiles = useCallback((incoming: File[]) => {
        const toAdd = incoming.slice(0, MAX_ATTACHMENTS - attachedFiles.length);
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

    const abortRef = useRef<AbortController | null>(null);

    const updateMsg = (id: string, fn: (m: ChatMessage) => ChatMessage) =>
        setMessages(prev => prev.map(m => (m.id === id ? fn(m) : m)));

    // ── Résultat du chat existant (modifier, expliquer, préciser, générer depuis un texte) ──
    const applyChatResult = (data: any, msgId: string) => {
        const intent: Intent = data.intent || 'generate';

        if (intent === 'clarify') {
            updateMsg(msgId, m => ({ ...m, role: 'clarify', intent: 'clarify', content: data.clarify_question || 'Pouvez-vous préciser votre demande ?' }));
            return;
        }
        if (intent === 'explain') {
            updateMsg(msgId, m => ({ ...m, intent: 'explain', content: data.answer || '' }));
            return;
        }
        if (intent === 'patch') {
            const revised = applyOperations(currentWorkflow, data.operations || []);
            updateMsg(msgId, m => ({ ...m, intent: 'patch', content: data.explanation || 'Modifications appliquées', operationsCount: data.operations_count || 0 }));
            onWorkflowGenerated(revised, '', new Map<string, TaskEnrichment>(), null);
            onSuccess(`✓ ${data.explanation}`);
            return;
        }
        // generate / regen / web_search / transcribe
        const totalSteps = data.workflow?.length || 0;
        updateMsg(msgId, m => ({ ...m, intent, totalSteps, title: data.title, content: buildAssistantMessage(intent, data.title, totalSteps) }));
        const enrichMap = new Map<string, TaskEnrichment>();
        if (data.enrichments) Object.entries(data.enrichments).forEach(([id, enr]: [string, any]) => enrichMap.set(id, enr));
        onWorkflowGenerated(data.workflow, data.title, enrichMap, data.procedureMetadata || null);
        onSuccess(`✓ ${totalSteps} étapes — "${data.title}"`);
    };

    // ── Événements du flux ──
    const handleEvent = (msgId: string, ev: any) => {
        const key = (id: string) => `${msgId}:${id}`; // unique dans la conversation (p1 peut revenir à chaque tour)
        switch (ev.type) {
            case 'status':
                updateMsg(msgId, m => {
                    const steps = [...(m.steps || [])];
                    const i = steps.findIndex(s => s.id === ev.id);
                    const step: TurnStep = { id: ev.id, label: ev.label, state: ev.state };
                    if (i >= 0) steps[i] = step; else steps.push(step);
                    return { ...m, steps };
                });
                break;
            case 'message':
                updateMsg(msgId, m => ({ ...m, content: m.content ? `${m.content}\n\n${ev.text}` : ev.text }));
                break;
            case 'proposal':
                updateMsg(msgId, m => ({ ...m, proposal: { procedures: ev.procedures, selected: ev.selected } }));
                break;
            case 'procedure_started':
                updateMsg(msgId, m => ({ ...m, generations: [...(m.generations || []), { key: key(ev.id), title: ev.title, status: 'generating' }] }));
                onProcedureStarted?.(key(ev.id), ev.title);
                break;
            case 'procedure_ready': {
                const enrichMap = new Map<string, TaskEnrichment>();
                Object.entries(ev.enrichments || {}).forEach(([id, enr]: [string, any]) => enrichMap.set(id, enr));
                updateMsg(msgId, m => ({ ...m, generations: (m.generations || []).map(g => g.key === key(ev.id) ? { ...g, title: ev.title, status: 'ready', steps: ev.workflow?.length || 0 } : g) }));
                onProcedureReady?.({ key: key(ev.id), title: ev.title, workflow: ev.workflow || [], enrichments: enrichMap, procedureMetadata: ev.procedureMetadata || {} });
                break;
            }
            case 'procedure_error':
                updateMsg(msgId, m => ({ ...m, generations: (m.generations || []).map(g => g.key === key(ev.id) ? { ...g, status: 'error', error: ev.message } : g) }));
                onProcedureError?.(key(ev.id), ev.message);
                onError(`« ${ev.title} » : ${ev.message}`);
                break;
            case 'remarks_delta':
                updateMsg(msgId, m => ({ ...m, remarks: (m.remarks || '') + ev.text }));
                break;
            case 'suggestions':
                updateMsg(msgId, m => ({ ...m, suggestions: ev.items || [] }));
                break;
            case 'chat_result':
                applyChatResult(ev.result, msgId);
                break;
            case 'error':
                updateMsg(msgId, m => ({ ...m, content: m.content || 'Une erreur est survenue.' }));
                onError(ev.message || 'Erreur lors du traitement');
                break;
        }
    };

    // Lit un flux text/event-stream (lignes `data: {...}` séparées par une ligne vide)
    const streamEvents = async (url: string, init: RequestInit, msgId: string) => {
        const controller = new AbortController();
        abortRef.current = controller;
        updateMsg(msgId, m => ({ ...m, streaming: true, startedAt: Date.now() }));
        setLoading(true);
        try {
            const res = await fetch(url, { ...init, signal: controller.signal });
            if (!res.ok || !res.body) {
                const detail = await res.json().then(d => d.detail).catch(() => null);
                throw new Error(detail || `Erreur serveur (${res.status})`);
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let sep: number;
                while ((sep = buffer.indexOf('\n\n')) >= 0) {
                    const chunk = buffer.slice(0, sep);
                    buffer = buffer.slice(sep + 2);
                    for (const line of chunk.split('\n')) {
                        if (!line.startsWith('data: ')) continue;
                        try { handleEvent(msgId, JSON.parse(line.slice(6))); } catch { /* événement illisible ignoré */ }
                    }
                }
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                let stoppedKeys: string[] = [];
                setMessages(prev => prev.map(m => {
                    if (m.id !== msgId) return m;
                    stoppedKeys = (m.generations || []).filter(g => g.status === 'generating').map(g => g.key);
                    return {
                        ...m,
                        content: m.content || 'Arrêté.',
                        steps: (m.steps || []).map(s => s.state === 'running' ? { ...s, state: 'stopped' } : s),
                        generations: (m.generations || []).map(g => g.status === 'generating' ? { ...g, status: 'stopped' } : g),
                    };
                }));
                setTimeout(() => stoppedKeys.forEach(k => onProcedureError?.(k, 'Arrêté')), 0);
            } else {
                updateMsg(msgId, m => ({ ...m, content: m.content || 'Une erreur est survenue.' }));
                onError(err?.message || 'Erreur lors du traitement');
            }
        } finally {
            abortRef.current = null;
            updateMsg(msgId, m => ({ ...m, streaming: false, endedAt: Date.now() }));
            setLoading(false);
        }
    };

    const stopStreaming = () => abortRef.current?.abort();

    const newAssistantMessage = (): string => {
        const id = crypto.randomUUID();
        setMessages(prev => [...prev, { id, role: 'assistant', content: '', createdAt: new Date(), steps: [] }]);
        return id;
    };

    const sendMessage = async (overrideInput?: string, override?: { files: File[]; attachments: SentAttachment[] }) => {
        const text = overrideInput ?? input;
        const files = override ? override.files : attachedFiles.map(f => f.file);
        if (!text.trim() && files.length === 0) return;
        if (!sessionId || loading) return;

        setMessages(prev => [...prev, {
            id: crypto.randomUUID(), role: 'user', content: text.trim(), files,
            attachments: override ? override.attachments : attachedFiles.map(f => ({ name: f.file.name, type: f.type, previewUrl: f.previewUrl, size: f.file.size })),
            createdAt: new Date(),
        }]);
        if (overrideInput === undefined) setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';

        const form = new FormData();
        form.append('session_id', sessionId);
        form.append('message', text.trim());
        form.append('history', JSON.stringify(buildHistory()));
        if (currentWorkflow && currentWorkflow.length > 0) form.append('current_workflow', JSON.stringify(currentWorkflow));
        if (currentEnrichments && currentEnrichments.size > 0) {
            const enrichObj: Record<string, unknown> = {};
            currentEnrichments.forEach((v, k) => { enrichObj[k] = v; });
            form.append('current_enrichments', JSON.stringify(enrichObj));
        }
        if (currentProcedureMetadata) form.append('current_procedure_metadata', JSON.stringify(currentProcedureMetadata));
        for (const f of files) form.append('files', f);
        if (files.length > 0 && !override) onFilesSent?.(files);
        if (!override) setAttachedFiles([]);

        const msgId = newAssistantMessage();
        await streamEvents(API_CONFIG.getFullUrl(API_CONFIG.endpoints.studioTurn),
            { method: 'POST', headers: processingLevelHeaders(processingLevel), body: form }, msgId);
    };

    // Choix dans une proposition : générer la sélection ou la fusionner en une seule procédure
    const submitProposal = async (proposalMsgId: string, merge: boolean) => {
        const source = messages.find(m => m.id === proposalMsgId)?.proposal;
        if (!source || !sessionId || loading || source.selected.length === 0) return;
        updateMsg(proposalMsgId, m => ({ ...m, proposal: m.proposal && { ...m.proposal, submitted: true } }));
        const n = source.selected.length;
        setMessages(prev => [...prev, {
            id: crypto.randomUUID(), role: 'user', createdAt: new Date(),
            content: merge ? `Fusionner les ${n} procédures sélectionnées en une seule` : `Générer ${n > 1 ? `les ${n} procédures sélectionnées` : 'la procédure sélectionnée'}`,
        }]);
        const msgId = newAssistantMessage();
        await streamEvents(API_CONFIG.getFullUrl(API_CONFIG.endpoints.studioGenerate), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...processingLevelHeaders(processingLevel) },
            body: JSON.stringify({ session_id: sessionId, procedure_ids: source.selected, merge }),
        }, msgId);
    };

    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [openSteps, setOpenSteps] = useState<Set<string>>(new Set());

    const copyMessage = async (m: ChatMessage) => {
        try { await navigator.clipboard.writeText([m.content, m.remarks].filter(Boolean).join('\n\n')); setCopiedId(m.id); setTimeout(() => setCopiedId(null), 1500); }
        catch { onError('Copie impossible'); }
    };
    // Réessayer : renvoie la demande qui a produit cette réponse (texte et fichiers)
    const retryFrom = (assistantId: string) => {
        const idx = messages.findIndex(m => m.id === assistantId);
        const user = [...messages.slice(0, idx)].reverse().find(m => m.role === 'user');
        if (!user || loading) return;
        sendMessage(user.content, { files: user.files || [], attachments: user.attachments || [] });
    };
    // Modifier : la demande revient dans le champ, avec ses fichiers
    const editMessage = (m: ChatMessage) => {
        setInput(m.content);
        setAttachedFiles((m.files || []).map((file, i) => ({
            id: crypto.randomUUID(), file, type: ACCEPTED_TYPES[file.type] || 'pdf', previewUrl: m.attachments?.[i]?.previewUrl,
        })));
        requestAnimationFrame(() => textareaRef.current?.focus());
    };

    const toggleProposalItem = (msgId: string, procId: string) =>
        updateMsg(msgId, m => {
            if (!m.proposal || m.proposal.submitted) return m;
            const sel = m.proposal.selected.includes(procId) ? m.proposal.selected.filter(x => x !== procId) : [...m.proposal.selected, procId];
            return { ...m, proposal: { ...m.proposal, selected: sel } };
        });

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

    const isSidebar = variant === 'sidebar';

    return (
        <section aria-label="Assistant ProcessMate" className={isSidebar ? 'relative h-full flex flex-col min-h-0 bg-white' : 'relative w-full max-w-4xl mx-auto'}
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
            onDrop={e => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files || [])); }}>
            {dragging && (
                <div className="absolute inset-2 z-30 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/90 flex flex-col items-center justify-center text-blue-700 pointer-events-none">
                    <Paperclip className="w-6 h-6 mb-2" />
                    <p className="text-sm font-semibold">Déposez vos fichiers</p>
                    <p className="text-xs text-blue-500 mt-0.5">PDF ou images, jusqu&apos;à {MAX_ATTACHMENTS}</p>
                </div>
            )}
            <div className={isSidebar ? 'shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200' : 'flex flex-wrap items-center justify-between gap-2 mb-2 px-1'}>
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800 truncate">{isSidebar || messages.length > 0 ? 'Assistant' : 'Que souhaitez-vous formaliser ?'}</h3>
                    {currentWorkflow.length > 0 && <p className="text-xs text-slate-400 mt-0.5">Procédure ouverte : {currentWorkflow.length} étapes</p>}
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={newSession} disabled={loading || !initialized}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
                        title="Démarrer une nouvelle conversation">
                        <PenLine className="w-3.5 h-3.5" /> Nouvelle conversation
                    </button>
                    {isSidebar && onCollapse && (
                        <button type="button" onClick={onCollapse} title="Masquer l’assistant" aria-label="Masquer l’assistant"
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                            <PanelLeftClose className="w-4 h-4" />
                        </button>
                    )}
                    {!isSidebar && <button type="button" aria-label={collapsed ? 'Ouvrir l’assistant' : 'Réduire l’assistant'} aria-expanded={!collapsed}
                        onClick={() => setCollapsed(c => !c)} className="p-1.5 rounded-lg hover:bg-white text-slate-400">
                        {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>}
                </div>
            </div>
            <div hidden={!isSidebar && collapsed} className={isSidebar ? 'flex-1 min-h-0 flex flex-col' : undefined}>
                <div ref={messagesContainerRef} hidden={!isSidebar && messages.length === 0 && !loading}
                    className={isSidebar
                        ? 'flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4'
                        : 'overflow-y-auto max-h-[40vh] h-64 px-3 py-3 space-y-3 mb-2 rounded-xl bg-white/60'}>
                        {isSidebar && messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center px-6 text-slate-400">
                                <Sparkles className="w-6 h-6 mb-3 text-slate-300" />
                                <p className="text-base text-slate-700 font-semibold">Que souhaitez-vous formaliser ?</p>
                                <p className="text-sm text-slate-500 mt-1">Joignez des documents, dictez ou décrivez une procédure.</p>
                                <p className="text-xs mt-1.5 leading-relaxed">Je repère les procédures qu&apos;ils contiennent : une seule est générée directement, plusieurs vous sont proposées. Vous pouvez aussi demander de tout fusionner.</p>
                            </div>
                        )}
                        {messages.map(msg => (
                            <div key={msg.id}>
                                {/* Message utilisateur */}
                                {msg.role === 'user' && (
                                    <div className="group flex flex-col items-end gap-1">
                                        {msg.attachments && msg.attachments.length > 0 && (
                                            <div className="flex flex-wrap justify-end gap-1.5 max-w-[90%]">
                                                {msg.attachments.map((a, i) => <FileChip key={`${a.name}-${i}`} name={a.name} type={a.type} previewUrl={a.previewUrl} size={a.size} />)}
                                            </div>
                                        )}
                                        {msg.content && (
                                            <div className="max-w-[85%] bg-slate-100 text-slate-800 rounded-2xl rounded-br-md px-3 py-2 text-sm">
                                                <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                            </div>
                                        )}
                                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                            {msg.content && <MsgAction label={copiedId === msg.id ? 'Copié' : 'Copier'} onClick={() => copyMessage(msg)}>{copiedId === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}</MsgAction>}
                                            <MsgAction label="Modifier" onClick={() => editMessage(msg)} disabled={loading}><Pencil className="w-3.5 h-3.5" /></MsgAction>
                                        </div>
                                    </div>
                                )}

                                {/* Réponse de l'assistant */}
                                {msg.role === 'assistant' && (
                                    <div className="text-sm text-slate-700 space-y-2">
                                        {msg.steps && msg.steps.length > 0 && !msg.streaming && !openSteps.has(msg.id) ? (
                                            <button type="button" onClick={() => setOpenSteps(s => new Set(s).add(msg.id))}
                                                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
                                                <ChevronRight className="w-3.5 h-3.5" />
                                                {msg.steps.length} étape{msg.steps.length > 1 ? 's' : ''}
                                                {msg.startedAt && msg.endedAt ? ` · ${Math.max(1, Math.round((msg.endedAt - msg.startedAt) / 1000))} s` : ''}
                                            </button>
                                        ) : msg.steps && msg.steps.length > 0 && (
                                            <ul className="space-y-1" aria-label="Progression">
                                                {msg.steps.map(s => (
                                                    <li key={s.id} className="flex items-center gap-2 text-xs text-slate-500">
                                                        {s.state === 'running'
                                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                                                            : s.state === 'stopped'
                                                                ? <CircleStop className="w-3.5 h-3.5 text-slate-400" />
                                                                : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                                        <span>{s.label}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {msg.intent && msg.intent !== 'explain' && <IntentBadge intent={msg.intent} />}
                                        {msg.content && <MiniMarkdown text={msg.content} />}
                                        {msg.totalSteps !== undefined && msg.totalSteps > 0 && (
                                            <p className="text-xs text-emerald-600 font-medium">✓ {msg.totalSteps} étape{msg.totalSteps > 1 ? 's' : ''}</p>
                                        )}
                                        {msg.operationsCount !== undefined && msg.intent === 'patch' && (
                                            <p className="text-xs text-violet-600 font-medium">
                                                ✓ {msg.operationsCount} opération{msg.operationsCount > 1 ? 's' : ''} appliquée{msg.operationsCount > 1 ? 's' : ''}
                                            </p>
                                        )}

                                        {/* Proposition : tout coché, l'utilisateur décoche */}
                                        {msg.proposal && (
                                            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                                                <ul>
                                                    {msg.proposal.procedures.map(p => {
                                                        const checked = msg.proposal!.selected.includes(p.id);
                                                        return (
                                                            <li key={p.id} className="border-b border-slate-100 last:border-b-0">
                                                                <label className={`flex items-start gap-2.5 px-3 py-2.5 ${msg.proposal!.submitted ? 'opacity-70' : 'cursor-pointer hover:bg-slate-50'}`}>
                                                                    <input type="checkbox" className="mt-0.5 accent-slate-900" checked={checked}
                                                                        disabled={msg.proposal!.submitted} onChange={() => toggleProposalItem(msg.id, p.id)} />
                                                                    <span className="min-w-0">
                                                                        <span className="block text-sm text-slate-800 font-medium">{p.title}</span>
                                                                        <span className="block text-[11px] text-slate-400 truncate">
                                                                            {(p.sources || []).map(s => s.pages ? `${s.file} · p. ${s.pages}` : s.file).join(' — ')}
                                                                            {p.estimated_steps ? ` · ~${p.estimated_steps} étapes` : ''}
                                                                        </span>
                                                                    </span>
                                                                </label>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                                {!msg.proposal.submitted && (
                                                    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-slate-50 border-t border-slate-100">
                                                        <button type="button" disabled={loading || msg.proposal.selected.length === 0}
                                                            onClick={() => submitProposal(msg.id, false)}
                                                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40">
                                                            Générer {msg.proposal.selected.length > 1 ? `les ${msg.proposal.selected.length}` : 'la sélection'}
                                                        </button>
                                                        <button type="button" disabled={loading || msg.proposal.selected.length < 2}
                                                            onClick={() => submitProposal(msg.id, true)}
                                                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">
                                                            Fusionner en une seule
                                                        </button>
                                                        <span className="text-[11px] text-slate-400">ou répondez par écrit (« prends la 2 et la 4 »)</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Générations : chaque procédure arrive dès qu'elle est prête */}
                                        {msg.generations && msg.generations.length > 0 && (
                                            <ul className="space-y-1.5">
                                                {msg.generations.map(g => (
                                                    <li key={g.key}>
                                                        <button type="button" disabled={g.status !== 'ready'} onClick={() => onSelectProcedure?.(g.key)}
                                                            className="w-full flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left enabled:hover:border-slate-300 enabled:hover:bg-slate-50">
                                                            {g.status === 'generating' && <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />}
                                                            {g.status === 'ready' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                                                            {g.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
                                                            {g.status === 'stopped' && <CircleStop className="w-4 h-4 text-slate-400 shrink-0" />}
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block text-sm text-slate-800 truncate">{g.title}</span>
                                                                <span className="block text-[11px] text-slate-400">
                                                                    {g.status === 'generating' && 'Génération…'}
                                                                    {g.status === 'ready' && `${g.steps} étape${(g.steps || 0) > 1 ? 's' : ''} · ouvrir`}
                                                                    {g.status === 'error' && (g.error || 'Échec de la génération')}
                                                                    {g.status === 'stopped' && 'Arrêtée'}
                                                                </span>
                                                            </span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {/* Relecture : remarques puis suggestions cliquables */}
                                        {msg.remarks && (
                                            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Remarques et suggestions</p>
                                                <MiniMarkdown text={msg.remarks} className="text-[13px]" />
                                            </div>
                                        )}
                                        {msg.suggestions && msg.suggestions.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5" aria-label="Suggestions">
                                                {msg.suggestions.map(sug => (
                                                    <button key={sug} type="button" disabled={loading} onClick={() => sendMessage(sug, { files: [], attachments: [] })}
                                                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 text-left hover:border-slate-400 hover:bg-slate-50 disabled:opacity-40">
                                                        {sug}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {msg.streaming && (!msg.steps || msg.steps.length === 0) && !msg.content && (
                                            <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Réflexion…</div>
                                        )}
                                        {!msg.streaming && (msg.content || (msg.generations && msg.generations.length > 0)) && (
                                            <div className="flex gap-0.5 -ml-1.5">
                                                {msg.content && <MsgAction label={copiedId === msg.id ? 'Copié' : 'Copier'} onClick={() => copyMessage(msg)}>{copiedId === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}</MsgAction>}
                                                {msg.id === [...messages].reverse().find(m => m.role === 'assistant')?.id && (
                                                    <MsgAction label="Réessayer" onClick={() => retryFrom(msg.id)} disabled={loading}><RotateCcw className="w-3.5 h-3.5" /></MsgAction>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Message clarification */}
                                {msg.role === 'clarify' && (
                                    <div className="max-w-[90%] bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-sm">
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                                            <span className="text-xs font-medium text-amber-700">Précision nécessaire</span>
                                        </div>
                                        <p className="text-slate-700 leading-relaxed">{msg.content}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                </div>
                <div aria-label="Composeur" className={(isSidebar ? 'shrink-0 m-3 mt-1 ' : '') + "rounded-2xl border border-slate-300 bg-white shadow-sm focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100"}>
                    {inputContext && <div hidden={!inputContextVisible} className="border-b border-slate-100 p-3 bg-slate-50/50 rounded-t-2xl">{inputContext}</div>}
                    <div className="px-3 py-2">
                    {/* ── Fichiers attachés ─────────────────── */}
                    {attachedFiles.length > 0 && (
                        <div className="pb-2 pt-1 flex gap-2 flex-wrap">
                            {attachedFiles.map(f => (
                                <FileChip key={f.id} name={f.file.name} type={f.type} previewUrl={f.previewUrl} size={f.file.size} onRemove={() => removeFile(f.id)} />
                            ))}
                        </div>
                    )}


                            <textarea
                                ref={textareaRef}
                                aria-label="Message à l’assistant"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onPaste={e => {
                                    const pasted = Array.from(e.clipboardData.files || []);
                                    if (pasted.length > 0) { e.preventDefault(); addFiles(pasted); }
                                }}
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
                                            <ComposerMenuAction icon={<Paperclip className="w-4 h-4" />} label="Joindre des fichiers (PDF, images)" onClick={() => { setAddMenuOpen(false); fileInputRef.current?.click(); }} disabled={attachedFiles.length >= MAX_ATTACHMENTS} />
                                            {onOpenCode && <ComposerMenuAction icon={<Code className="w-4 h-4" />} label="Code source" onClick={() => { setAddMenuOpen(false); onOpenCode(); }} />}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={attachedFiles.length >= MAX_ATTACHMENTS}
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
                                aria-label={loading ? 'Arrêter' : 'Envoyer le message'}
                                title={loading ? 'Arrêter' : 'Envoyer (Entrée)'}
                                type="button"
                                onClick={() => (loading ? stopStreaming() : sendMessage())}
                                disabled={!loading && (!initialized || (!input.trim() && attachedFiles.length === 0))}
                                className={`
                                    w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors
                                    focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300
                                    ${!loading && (!input.trim() && attachedFiles.length === 0)
                                        ? 'bg-slate-200 text-white cursor-not-allowed'
                                        : 'bg-slate-900 text-white hover:bg-slate-700'
                                    }
                                `}
                            >
                                {loading
                                    ? <Square className="w-3 h-3 fill-current" />
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
function MsgAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
    return (
        <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40">
            {children}
        </button>
    );
}

function formatSize(bytes?: number) {
    if (!bytes) return '';
    return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

/** Vignette de fichier (composeur et messages envoyés), façon Claude */
function FileChip({ name, type, previewUrl, size, onRemove }: { name: string; type: 'pdf' | 'image'; previewUrl?: string; size?: number; onRemove?: () => void }) {
    return (
        <div className="group relative flex items-center gap-2 rounded-xl border border-slate-200 bg-white pl-1.5 pr-3 py-1.5 max-w-[220px] shadow-sm">
            {type === 'image' && previewUrl
                ? <img src={previewUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                : <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${type === 'pdf' ? 'bg-red-50' : 'bg-blue-50'}`}>
                    {type === 'pdf' ? <FileText className="w-4 h-4 text-red-500" /> : <ImageIcon className="w-4 h-4 text-blue-500" />}
                  </div>}
            <div className="min-w-0 text-left">
                <p className="text-xs font-medium text-slate-700 truncate">{name}</p>
                <p className="text-[10px] text-slate-400">{type === 'pdf' ? 'PDF' : 'Image'}{size ? ` · ${formatSize(size)}` : ''}</p>
            </div>
            {onRemove && (
                <button type="button" aria-label={`Retirer ${name}`} onClick={onRemove}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                    <X className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}

function ComposerMenuAction({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
    return <button type="button" disabled={disabled} onClick={onClick} role="menuitem"
        className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-left text-slate-600 hover:bg-slate-50 disabled:opacity-40">{icon}{label}</button>;
}

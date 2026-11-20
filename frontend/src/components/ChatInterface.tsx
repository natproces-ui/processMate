'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Table1Row } from '@/logic/types';
import { TaskEnrichment } from '@/logic/bpmnTypes';
import { applyOperations, type Operation } from '@/logic/workflowOperations';
import { API_CONFIG } from '@/lib/api-config';
import { getAuthHeaders } from '@/lib/authHeaders';
import { GUEST_LIMITS } from '@/lib/features';
import { guestStore, GUEST_CONVERSATION_KEY } from '@/lib/guestStore';
import { CONVERSATIONS_ENABLED, conversationsApi, readConversationParam, writeConversationParam, type ConversationSource, type StoredMessage, type StoredProcedure } from '@/lib/conversationsApi';
import { processingLevelHeaders, type ProcessingLevel } from '@/lib/processing-level';
import ProcessingLevelSelector from '@/components/processmate/ProcessingLevelSelector';
import MiniMarkdown from '@/components/shared/MiniMarkdown';
import WorkTrace from '@/components/shared/WorkTrace';
import ChangeSummary, { diffWorkflows, type StepChange } from '@/components/shared/ChangeSummary';
import DemoFilesPicker from '@/components/processmate/DemoFilesPicker';
import { useAuth } from '@/context/AuthContext';
import {
    ArrowUp, ArrowDown, Paperclip, X, FileText, Image as ImageIcon,
    Loader2, PenLine, Plus, ChevronDown, ChevronUp,
    Sparkles, HelpCircle, Code, Mic, Square, CheckCircle2, AlertCircle, CircleStop, PanelLeftClose, Copy, Check, RotateCcw, Pencil, ArrowUpRight, Workflow, Presentation, FolderOpen, Undo2
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type Intent = 'generate' | 'patch' | 'regen' | 'web_search' | 'clarify' | 'transcribe' | 'explain';

interface AttachedFile {
    id: string;
    file: File;
    type: FileKind;
    previewUrl?: string;
}

// ── Conversation en flux (/api/studio) ─────────────────────────
type FileKind = 'pdf' | 'image' | 'docx' | 'pptx';
interface SentAttachment { name: string; type: FileKind; previewUrl?: string; size?: number }

interface TurnStep { id: string; label: string; state: 'running' | 'done' | 'stopped'; startedAt?: number; endedAt?: number }
export interface TurnProcedure {
    id: string; title: string; description?: string;
    sources?: { file: string; pages?: string | null }[]; estimated_steps?: number;
}
interface TurnProposal { procedures: TurnProcedure[]; selected: string[]; submitted?: boolean }
interface TurnGeneration { key: string; title: string; status: 'generating' | 'ready' | 'error' | 'stopped'; steps?: number; error?: string; phase?: string; rows?: number }
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
    /** Modification : étapes ajoutées, modifiées, supprimées (carte « N étapes modifiées ») */
    changes?: StepChange[];
    /** Procédure de la conversation visée par le message, quand ce n'était pas celle affichée */
    targetTitle?: string;
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
    /** Mode invité : procédures générées complètes, gardées dans le navigateur */
    generated?: StoredGenerated[];
    /** Lot 5 : état de la procédure juste avant la modification faite par ce message */
    checkpoint?: unknown;
    restored?: boolean;
    /** Lot 6 : propositions de l'agent, à accepter ou refuser */
    agentProposals?: AgentProposal[];
}

interface AgentProposal {
    proposal_id: string;
    kind: 'modification' | 'point_ouvert' | 'reponse_point';
    explanation: string;
    operations?: Operation[];
    point?: Record<string, unknown>;
    point_id?: string;
    answer?: string;
    /** historique = proposition d'une conversation rouverte, plus actionnable */
    decision?: 'accepted' | 'refused' | 'historique';
}

interface StoredGenerated {
    id: string; title: string; workflow: Table1Row[];
    enrichments: Record<string, TaskEnrichment>; procedureMetadata: Record<string, unknown>;
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
    /** Message envoyé tout seul à l'ouverture (« Nouvelle conversation dans <projet> ») */
    autoSendText?: { id: number; text: string };
    currentWorkflow: Table1Row[];
    currentEnrichments?: Map<string, TaskEnrichment>;
    currentProcedureMetadata?: Record<string, unknown> | null;
    onWorkflowGenerated: (
        workflow: Table1Row[],
        title: string,
        enrichments: Map<string, TaskEnrichment>,
        procedureMetadata?: any,
        /** isNew : une autre procédure (création, transcription), à ajouter sans écraser celle affichée ;
         *  procedureKey : la procédure de la conversation que le message visait (si ce n'est pas l'affichée) */
        options?: { isNew?: boolean; procedureKey?: string }
    ) => void;
    onError: (msg: string) => void;
    onSuccess: (msg: string) => void;
    /** Génération de procédures depuis la conversation (un onglet par procédure) */
    onProcedureStarted?: (key: string, title: string) => void;
    /** Étape reçue pendant la génération (aperçu, remplacé par la version finale). */
    onProcedureRow?: (key: string, row: Table1Row) => void;
    /** Procédure décrite en texte : les étapes s'affichent pendant l'écriture ([] : aperçu effacé) */
    onWorkflowPreview?: (rows: Table1Row[], options?: { isNew?: boolean; procedureKey?: string }) => void;
    /** Procédures de la conversation (au moins deux) : le serveur comprend de laquelle parle le message */
    conversationProcedures?: StoredProcedure[];
    activeProcedureKey?: string | null;
    /** Le message parle d'une autre procédure : l'afficher avant de la modifier */
    onTargetProcedure?: (key: string) => void;
    /** Bouton « Nouvelle conversation » (stylo) : inutile quand la barre latérale en a déjà un */
    showNewConversation?: boolean;
    onProcedureReady?: (proc: GeneratedProcedure) => void;
    onProcedureError?: (key: string, message: string) => void;
    onSelectProcedure?: (key: string) => void;
    /** 'sidebar' : colonne pleine hauteur, composeur en bas (Studio) */
    variant?: 'inline' | 'sidebar';
    /** Masquer l’assistant (mode colonne) */
    onCollapse?: () => void;
    /** Fichiers envoyés (pour la capture d'annexes à l'export) */
    onFilesSent?: (files: File[]) => void;
    /** Clic sur « étape N » dans une réponse : surligner ces étapes dans le tableau */
    onFocusSteps?: (ids: string[]) => void;
    /** Carte d'une procédure créée : l'afficher dans le panneau (par son titre) */
    onOpenProcedure?: (title: string) => void;
    /** Activité (nombre de messages, réponse en cours) : indicateur quand l'assistant est masqué */
    onActivity?: (activity: { messages: number; busy: boolean }) => void;
    /** Conversations enregistrées : procédure enregistrée liée (rouvre sa dernière conversation) */
    procedureId?: string;
    /** Conversation courante (null = pas encore enregistrée) */
    onConversationChange?: (conversationId: string | null) => void;
    /** Conversation rouverte avec ses procédures enregistrées : le panneau les reprend telles quelles */
    onRestoreProcedures?: (procedures: StoredProcedure[], active: string | null) => void;
    /** Rouvrir les onglets des procédures générées en rechargeant une conversation */
    restoreGenerated?: boolean;
    /** Refléter la conversation dans l'URL (?c=) — un seul chat par page doit le faire */
    syncUrl?: boolean;
    /** Projet de la conversation créée (lot 4) */
    projectId?: string;
    /** Invité : garder la conversation dans le navigateur et appliquer les limites avant envoi */
    guestPersistence?: boolean;
    /** Lot 5 : instantané de la procédure pris juste avant une modification par le chat */
    onCheckpoint?: (procedureKey?: string) => unknown;
    /** Lot 5 : revenir à un instantané (bouton « Restaurer l'état d'avant ») */
    onRestore?: (snapshot: unknown) => void;
    /** Lot 5 : points ouverts relevés pour une procédure générée */
    onOpenPoints?: (key: string, points: unknown[]) => void;
    /** Lot 6 : point ouvert proposé par l'agent et accepté */
    onAgentOpenPoint?: (point: Record<string, unknown>) => void;
    /** Lot 6 : réponse à un point ouvert proposée par l'agent et acceptée */
    onAgentAnswerPoint?: (pointId: string, answer: string) => void;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const MAX_ATTACHMENTS = 10; // même limite que /api/studio/turn

const ACCEPTED_TYPES: Record<string, FileKind> = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/pdf': 'pdf',
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/jpg': 'image',
    'image/webp': 'image',
};

// ─────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────

export default function ChatInterface({
    processingLevel, onProcessingLevelChange, inputContext, inputContextVisible = true, onOpenDocuments, onOpenCode,
    recording = false, processing = false, onToggleRecording, onCancelRecording, onNewConversation, insertText, autoSendText,
    currentWorkflow,
    currentEnrichments,
    currentProcedureMetadata,
    onWorkflowGenerated,
    onError,
    onSuccess,
    onProcedureStarted,
    onProcedureRow,
    onWorkflowPreview,
    onProcedureReady,
    onProcedureError,
    onSelectProcedure,
    variant = 'inline',
    onCollapse,
    onFilesSent,
    onFocusSteps,
    onOpenProcedure,
    onActivity,
    procedureId,
    onConversationChange,
    onRestoreProcedures,
    restoreGenerated = true,
    syncUrl = false,
    projectId,
    guestPersistence = false,
    onCheckpoint,
    conversationProcedures,
    activeProcedureKey,
    onTargetProcedure,
    showNewConversation = true,
    onRestore,
    onOpenPoints,
    onAgentOpenPoint,
    onAgentAnswerPoint,
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
    const [demoFilesOpen, setDemoFilesOpen] = useState(false);
    const { profile, user, loading: authLoading } = useAuth();
    const guestMode = guestPersistence && !authLoading && !user;
    // Conversations enregistrées : drapeau + utilisateur connecté. Sinon, comportement d'avant.
    const persistent = CONVERSATIONS_ENABLED && !!user;
    const [conversationId, setConversationIdState] = useState<string | null>(null);
    const conversationIdRef = useRef<string | null>(null);
    const [sources, setSources] = useState<ConversationSource[]>([]);
    const [sourcesOpen, setSourcesOpen] = useState(false);
    const sourcesRef = useRef<HTMLDivElement>(null);
    // la liste des sources se ferme au clic ailleurs ou avec Échap
    useEffect(() => {
        if (!sourcesOpen) return;
        const onDown = (e: MouseEvent) => { if (!sourcesRef.current?.contains(e.target as Node)) setSourcesOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSourcesOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [sourcesOpen]);
    const loadedConversationRef = useRef(false);
    const isAdmin = profile?.global_role === 'admin';
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

    // Envoi automatique d'un premier message (page d'un projet → nouvelle conversation)
    const autoSentRef = useRef<number | null>(null);
    useEffect(() => {
        if (!autoSendText?.text.trim() || autoSentRef.current === autoSendText.id) return;
        autoSentRef.current = autoSendText.id;
        const t = setTimeout(() => { void sendMessage(autoSendText.text); }, 0);
        return () => clearTimeout(t);
    }, [autoSendText?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Défilement : on suit la réponse seulement si l'utilisateur est en bas (ou vient d'envoyer) ;
    // s'il remonte pour relire, on ne le ramène pas de force — un bouton « ↓ » apparaît.
    const atBottomRef = useRef(true);
    const [showScrollDown, setShowScrollDown] = useState(false);
    const onMessagesScroll = () => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        atBottomRef.current = atBottom;
        setShowScrollDown(!atBottom);
    };
    const scrollToBottom = (smooth = true) => {
        const el = messagesContainerRef.current;
        el?.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
        atBottomRef.current = true;
        setShowScrollDown(false);
    };
    useEffect(() => {
        if (messages.length === 0 && !loading) return;
        const last = messages[messages.length - 1];
        if (last?.role === 'user') atBottomRef.current = true; // on vient d'envoyer
        if (atBottomRef.current) scrollToBottom();
        else setShowScrollDown(true);
    }, [messages, loading]);

    useEffect(() => {
        initSession();
    }, []);

    useEffect(() => {
        onActivity?.({ messages: messages.length, busy: loading });
    }, [messages.length, loading]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Conversations enregistrées ───────────────────────────
    const setConversation = (id: string | null) => {
        conversationIdRef.current = id;
        setConversationIdState(id);
        if (id) setSessionId(id); // la conversation sert de session au Studio
        if (syncUrl) writeConversationParam(id);
        onConversationChange?.(id);
        // La barre latérale (récents) se met à jour sans rechargement
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('processmate:conversation', { detail: { id } }));
    };

    // Fin d'une réponse : le titre de la conversation a pu être donné par le serveur
    const wasLoadingRef = useRef(false);
    useEffect(() => {
        if (wasLoadingRef.current && !loading && conversationIdRef.current && typeof window !== 'undefined') {
            const id = conversationIdRef.current;
            window.dispatchEvent(new CustomEvent('processmate:conversation', { detail: { id } }));
            // le titre trouvé juste après la réponse arrive dans la barre latérale quelques secondes plus tard
            setTimeout(() => window.dispatchEvent(new CustomEvent('processmate:conversation-refresh', { detail: { id } })), 5000);
        }
        wasLoadingRef.current = loading;
    }, [loading]);

    /** Inverse de toChatMessage : ce qui est gardé d'un message (sans les fichiers eux-mêmes) */
    const toPayload = (m: ChatMessage): Record<string, unknown> => {
        if (m.role === 'user') return m.attachments?.length ? { attachments: m.attachments.map(({ name, type, size }) => ({ name, type, size })) } : {};
        return {
            intent: m.intent, steps: m.steps, totalSteps: m.totalSteps, title: m.title, operationsCount: m.operationsCount,
            changes: m.changes, targetTitle: m.targetTitle, proposal: m.proposal, remarks: m.remarks, suggestions: m.suggestions,
            generations: m.generations?.map(g => ({ id: g.key.slice(g.key.indexOf(':') + 1), title: g.title, status: g.status, steps: g.steps, error: g.error })),
            generated: m.generated,
            agentProposals: m.agentProposals,
        };
    };

    const toChatMessage = (m: StoredMessage): ChatMessage => {
        const p = m.payload || {};
        const base: ChatMessage = { id: m.id, role: m.role, content: m.content || '', createdAt: new Date(m.created_at) };
        if (m.role === 'user') {
            return { ...base, attachments: (p.attachments || []).map((a: { name: string; type: FileKind; size?: number }) => ({ name: a.name, type: a.type, size: a.size })) };
        }
        return {
            ...base,
            intent: p.intent, steps: p.steps, totalSteps: p.totalSteps, title: p.title, operationsCount: p.operationsCount,
            changes: p.changes, targetTitle: p.targetTitle, proposal: p.proposal ? { procedures: p.proposal.procedures || [], selected: p.proposal.selected || [], submitted: p.proposal.submitted ?? true } : undefined,
            generations: (p.generations || []).map((g: { id: string; title: string; status: TurnGeneration['status']; steps?: number; error?: string }) => ({
                key: `${m.id}:${g.id}`, title: g.title, status: g.status === 'generating' ? 'stopped' : g.status, steps: g.steps, error: g.error,
            })),
            remarks: p.remarks, suggestions: p.suggestions,
            agentProposals: (p.agentProposals || []).map((a: AgentProposal) => ({ ...a, decision: a.decision || 'historique' })),
        };
    };

    /** Affiche des messages enregistrés et rouvre les onglets de leurs procédures générées */
    const showStored = (stored: StoredMessage[], keepGenerated: boolean, skipGenerated = false) => {
        const msgs = stored.map(toChatMessage);
        // La dernière proposition reste modifiable si rien n'a suivi
        const last = msgs[msgs.length - 1];
        if (last?.proposal && stored[stored.length - 1]?.payload?.proposal?.submitted !== true) {
            last.proposal = { ...last.proposal, submitted: false };
        }
        if (keepGenerated) stored.forEach((m, i) => { if (m.payload?.generated) msgs[i].generated = m.payload.generated; });
        setMessages(msgs);
        if (restoreGenerated && !skipGenerated) {
            for (const m of stored) {
                for (const g of (m.payload?.generated || []) as StoredGenerated[]) {
                    const key = `${m.id}:${g.id}`;
                    onProcedureStarted?.(key, g.title);
                    onProcedureReady?.({ key, title: g.title, workflow: g.workflow || [], enrichments: new Map(Object.entries(g.enrichments || {})), procedureMetadata: g.procedureMetadata || {} });
                }
            }
        }
    };

    const openConversation = async (id: string) => {
        try {
            const data = await conversationsApi.get(id);
            // procédures enregistrées avec la conversation (dernier état, modifications comprises) ;
            // sinon, anciennes conversations : celles produites au fil des messages
            const saved = restoreGenerated && onRestoreProcedures && data.procedures?.length ? data.procedures : null;
            showStored(data.messages, false, !!saved);
            setSources(data.sources);
            setConversation(id);
            // après setConversation : les procédures reprises appartiennent à cette conversation
            if (saved) onRestoreProcedures!(saved, data.active_procedure ?? null);
        } catch (err: unknown) {
            if (syncUrl) writeConversationParam(null);
            onError(`Conversation introuvable : ${err instanceof Error ? err.message : ''}`.trim());
        }
    };

    const refreshSources = async (id: string) => {
        try { setSources((await conversationsApi.get(id)).sources); } catch { /* affichage seulement */ }
    };

    const removeSource = async (sourceId: string) => {
        const id = conversationIdRef.current;
        if (!id) return;
        try {
            await conversationsApi.removeSource(id, sourceId);
            setSources(prev => prev.filter(s => s.id !== sourceId));
        } catch (err: unknown) {
            onError(err instanceof Error ? err.message : 'Retrait impossible');
        }
    };

    // Ouverture : ?c= dans l'URL (Studio), sinon la dernière conversation de la procédure ouverte
    useEffect(() => {
        if (!persistent || loadedConversationRef.current) return;
        loadedConversationRef.current = true;
        (async () => {
            let id = syncUrl ? readConversationParam() : null;
            if (!id && procedureId) id = (await conversationsApi.latestForProcedure(procedureId).catch(() => null))?.id ?? null;
            if (id) await openConversation(id);
        })();
    }, [persistent, procedureId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Mode invité : la conversation reste dans ce navigateur ──
    const guestRestoreStartedRef = useRef(false);
    const guestRestoredRef = useRef(false);
    useEffect(() => {
        if (!guestMode || guestRestoreStartedRef.current) return;
        guestRestoreStartedRef.current = true;
        guestStore.get(GUEST_CONVERSATION_KEY).then(saved => {
            // Sauvegarde autorisée seulement une fois la lecture terminée : sinon la liste encore
            // vide du montage effacerait la conversation avant qu'elle soit restaurée.
            guestRestoredRef.current = true;
            if (!saved?.messages?.length) return;
            showStored(saved.messages.map(m => ({ ...m, id: crypto.randomUUID(), created_at: saved.savedAt, payload: m.payload as Record<string, any> })), true); // eslint-disable-line @typescript-eslint/no-explicit-any
        });
    }, [guestMode]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        // Liste vide : on n'efface rien ici (« Nouvelle conversation » s'en charge explicitement)
        if (!guestMode || !guestRestoredRef.current || loading || messages.length === 0) return;
        guestStore.set(GUEST_CONVERSATION_KEY, {
            savedAt: new Date().toISOString(),
            messages: messages.map(m => ({ role: m.role, content: m.content, payload: toPayload(m) })),
        });
    }, [messages, loading, guestMode]);

    // Identifiant de conversation local : plus de session créée en base à chaque ouverture
    const initSession = async () => {
        setSessionId(crypto.randomUUID());
        setInitialized(true);
    };

    // ── Gestion fichiers ─────────────────────────────────────
    const addFiles = useCallback((incoming: File[]) => {
        const maxFiles = guestMode ? GUEST_LIMITS.maxFiles : MAX_ATTACHMENTS;
        if (guestMode && attachedFiles.length + incoming.length > maxFiles) {
            onError(`Mode invité : ${maxFiles} fichier${maxFiles > 1 ? 's' : ''} à la fois. Créez un compte pour en joindre davantage.`);
        }
        if (guestMode) {
            const tooBig = incoming.find(f => f.size > GUEST_LIMITS.maxFileMb * 1024 * 1024);
            if (tooBig) { onError(`Mode invité : « ${tooBig.name} » dépasse ${GUEST_LIMITS.maxFileMb} Mo.`); return; }
        }
        const toAdd = incoming.slice(0, Math.max(0, maxFiles - attachedFiles.length));
        const newFiles: AttachedFile[] = [];

        for (const file of toAdd) {
            const ext = file.name.toLowerCase().split('.').pop() || '';
            const type = ACCEPTED_TYPES[file.type] || ({ pdf: 'pdf', docx: 'docx', pptx: 'pptx' } as Record<string, FileKind>)[ext];
            if (!type && (ext === 'doc' || ext === 'ppt')) { onError(`Ancien format Office : ${file.name}. Enregistrez-le en .docx ou .pptx.`); continue; }
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
    }, [attachedFiles, onError, guestMode]);

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
        // Procédure visée par le message (autre que celle affichée au moment de l'envoi)
        const target = targetRef.current?.msgId === msgId ? targetRef.current : null;
        const baseWorkflow = target?.workflow ?? currentWorkflow;
        // Point de restauration : l'état d'avant, pris avant que la modification ne s'applique
        const preview = previewRef.current?.msgId === msgId ? previewRef.current : null;
        if (preview) preview.final = true;
        if (preview && preview.rows.length > 0) {
            if (preview.checkpoint !== undefined) updateMsg(msgId, m => ({ ...m, checkpoint: preview.checkpoint }));
        } else if (baseWorkflow.length > 0 && onCheckpoint && !isNewProcedure(intent)) {
            const snapshot = onCheckpoint(target?.key);
            updateMsg(msgId, m => ({ ...m, checkpoint: snapshot }));
        }
        if (intent === 'patch') {
            const operations = data.operations || [];
            const applied = applyOperations(baseWorkflow, operations);
            // Le patch porte les descriptions dans un champ `description` (revision_prompt) :
            // on les range dans les enrichments, et on ne les laisse pas dans la ligne.
            const revised = applied.map(({ description: _d, ...row }: any) => row as Table1Row);
            const described = new Map<string, TaskEnrichment>();
            operations.forEach((op: any) => {
                const desc = op.fields?.description ?? op.row?.description;
                if (!desc) return;
                let id: string | undefined = op.id ?? op.row?.id;
                // ligne ajoutée : son id NEW_x a été renuméroté, on la retrouve par son libellé
                if (!revised.some(r => r.id === id) && op.row) id = revised.find(r => r.étape === op.row.étape)?.id;
                if (id) described.set(id, { id_tache: id, descriptif: desc } as TaskEnrichment);
            });
            const changes = diffWorkflows(baseWorkflow, revised);
            updateMsg(msgId, m => ({ ...m, intent: 'patch', content: data.explanation || 'Modifications appliquées', operationsCount: data.operations_count || 0, changes }));
            onWorkflowGenerated(revised, '', described, null, { procedureKey: target?.key });
            return;
        }
        // generate / regen / web_search / transcribe
        const totalSteps = data.workflow?.length || 0;
        updateMsg(msgId, m => ({ ...m, intent, totalSteps, title: data.title, content: buildAssistantMessage(intent, data.title, totalSteps) }));
        const enrichMap = new Map<string, TaskEnrichment>();
        if (data.enrichments) Object.entries(data.enrichments).forEach(([id, enr]: [string, any]) => enrichMap.set(id, enr));
        onWorkflowGenerated(data.workflow, data.title, enrichMap, data.procedureMetadata || null,
            { isNew: isNewProcedure(intent), procedureKey: isNewProcedure(intent) ? undefined : target?.key });
    };

    // Aperçu d'une procédure écrite en direct : point de retour pris avant la première ligne
    const previewRef = useRef<{ msgId: string; rows: Table1Row[]; checkpoint?: unknown; final?: boolean; isNew?: boolean } | null>(null);
    /** Procédure de la conversation visée par le message en cours (événement target_procedure) */
    const targetRef = useRef<{ msgId: string; key: string; workflow: Table1Row[] } | null>(null);

    // ── Événements du flux ──
    const handleEvent = (msgId: string, ev: any) => {
        const key = (id: string) => `${msgId}:${id}`; // unique dans la conversation (p1 peut revenir à chaque tour)
        switch (ev.type) {
            case 'workflow_preview': {
                if (previewRef.current?.msgId !== msgId) {
                    // nouvelle procédure : celle affichée n'est pas touchée, rien à restaurer
                    const isNew = ev.new === true;
                    const tgt = targetRef.current?.msgId === msgId ? targetRef.current : null;
                    const checkpoint = !isNew && (tgt?.workflow ?? currentWorkflow).length > 0 && onCheckpoint ? onCheckpoint(tgt?.key) : undefined;
                    previewRef.current = { msgId, rows: [], checkpoint, isNew };
                }
                const pv = previewRef.current;
                if (pv && !pv.rows.some(r => r.id === ev.row?.id)) {
                    pv.rows = [...pv.rows, ev.row];
                    onWorkflowPreview?.(pv.rows, { isNew: pv.isNew, procedureKey: pv.isNew ? undefined : (targetRef.current?.msgId === msgId ? targetRef.current.key : undefined) });
                }
                break;
            }
            case 'target_procedure': {
                // le chat a compris que le message parle d'une autre procédure de la conversation
                const proc = conversationProcedures?.find(p => p.key === ev.key);
                if (proc) {
                    targetRef.current = { msgId, key: proc.key, workflow: (proc.workflow || []) as Table1Row[] };
                    updateMsg(msgId, m => ({ ...m, targetTitle: proc.title }));
                    onTargetProcedure?.(proc.key);
                }
                break;
            }
            case 'workflow_preview_reset':
                if (previewRef.current?.msgId === msgId) {
                    previewRef.current.rows = [];
                    onWorkflowPreview?.([], { isNew: previewRef.current.isNew });
                }
                break;
            case 'conversation_title':
                // vrai titre trouvé par le serveur : en-tête et barre latérale se mettent à jour
                if (conversationIdRef.current && typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('processmate:conversation', { detail: { id: conversationIdRef.current, title: ev.title } }));
                }
                break;
            case 'status':
                updateMsg(msgId, m => {
                    const steps = [...(m.steps || [])];
                    const i = steps.findIndex(s => s.id === ev.id);
                    const now = Date.now();
                    const prev = i >= 0 ? steps[i] : undefined;
                    // chaque étape garde son heure de début et de fin (chronomètre de la trace)
                    const step: TurnStep = {
                        id: ev.id, label: ev.label, state: ev.state,
                        startedAt: prev?.startedAt ?? now,
                        endedAt: ev.state === 'running' ? undefined : (prev?.endedAt ?? now),
                    };
                    if (i >= 0) steps[i] = step; else steps.push(step);
                    return { ...m, steps };
                });
                break;
            case 'text_delta':
                // réponse écrite au fil de l'eau ; la réponse complète la remplacera à la fin
                updateMsg(msgId, m => ({ ...m, content: (m.content || '') + (ev.text || '') }));
                break;
            case 'text_reset':
                updateMsg(msgId, m => ({ ...m, content: '' }));
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
            case 'procedure_progress':
                updateMsg(msgId, m => ({ ...m, generations: (m.generations || []).map(g => g.key === key(ev.id) ? { ...g, phase: ev.label } : g) }));
                break;
            case 'procedure_row':
                updateMsg(msgId, m => ({ ...m, generations: (m.generations || []).map(g => g.key === key(ev.id) ? { ...g, rows: (g.rows || 0) + 1 } : g) }));
                onProcedureRow?.(key(ev.id), ev.row);
                break;
            case 'procedure_ready': {
                const enrichMap = new Map<string, TaskEnrichment>();
                Object.entries(ev.enrichments || {}).forEach(([id, enr]: [string, any]) => enrichMap.set(id, enr));
                updateMsg(msgId, m => ({
                    ...m, generations: (m.generations || []).map(g => g.key === key(ev.id) ? { ...g, title: ev.title, status: 'ready', steps: ev.workflow?.length || 0 } : g),
                    ...(guestMode ? { generated: [...(m.generated || []), { id: ev.id, title: ev.title, workflow: ev.workflow || [], enrichments: ev.enrichments || {}, procedureMetadata: ev.procedureMetadata || {} }] } : {}),
                }));
                onProcedureReady?.({ key: key(ev.id), title: ev.title, workflow: ev.workflow || [], enrichments: enrichMap, procedureMetadata: ev.procedureMetadata || {} });
                break;
            }
            case 'procedure_error':
                updateMsg(msgId, m => ({ ...m, generations: (m.generations || []).map(g => g.key === key(ev.id) ? { ...g, status: 'error', error: ev.message } : g) }));
                onProcedureError?.(key(ev.id), ev.message);
                onError(`« ${ev.title} » : ${ev.message}`);
                break;
            case 'open_points':
                onOpenPoints?.(key(ev.id), ev.points || []);
                break;
            case 'agent_proposal':
                updateMsg(msgId, m => ({ ...m, agentProposals: [...(m.agentProposals || []), ev as AgentProposal] }));
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
                // la raison dans le chat (pas seulement dans une notification qui disparaît)
                updateMsg(msgId, m => ({ ...m, content: ev.limit ? ev.message : (m.content || (ev.message ? `Une erreur est survenue : ${ev.message}` : 'Une erreur est survenue.')) }));
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
            const headers = { ...(await getAuthHeaders()), ...((init.headers as Record<string, string>) || {}) };
            const res = await fetch(url, { ...init, headers, signal: controller.signal });
            if (!res.ok || !res.body) {
                const detail = await res.json().then(d => d.detail).catch(() => null);
                // 401 (session expirée), 413 et 429 (limites du mode invité) : message lisible tel quel
                const err: Error & { userFacing?: boolean } = new Error(detail || `Erreur serveur (${res.status})`);
                err.userFacing = [401, 413, 429].includes(res.status) && !!detail;
                throw err;
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
                updateMsg(msgId, m => ({ ...m, content: m.content || (err?.userFacing ? err.message : 'Une erreur est survenue.') }));
                onError(err?.message || 'Erreur lors du traitement');
            }
        } finally {
            abortRef.current = null;
            const pv = previewRef.current;
            if (pv?.msgId === msgId) {
                if (!pv.final && pv.rows.length > 0) {
                    if (pv.checkpoint !== undefined && onRestore) onRestore(pv.checkpoint); else onWorkflowPreview?.([]);
                }
                previewRef.current = null;
            }
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

        let sid = sessionId;
        if (persistent && !conversationIdRef.current) {
            try {
                const created = await conversationsApi.create({ procedure_ids: procedureId ? [procedureId] : [], project_id: projectId || null });
                sid = created.id;
                setConversation(created.id);
            } catch (err: unknown) {
                onError(`Conversation non enregistrée : ${err instanceof Error ? err.message : ''}`);
            }
        }

        const form = new FormData();
        form.append('session_id', sid);
        form.append('message', text.trim());
        form.append('history', JSON.stringify(buildHistory()));
        if (currentWorkflow && currentWorkflow.length > 0) form.append('current_workflow', JSON.stringify(currentWorkflow));
        if (currentEnrichments && currentEnrichments.size > 0) {
            const enrichObj: Record<string, unknown> = {};
            currentEnrichments.forEach((v, k) => { enrichObj[k] = v; });
            form.append('current_enrichments', JSON.stringify(enrichObj));
        }
        if (currentProcedureMetadata) form.append('current_procedure_metadata', JSON.stringify(currentProcedureMetadata));
        if (conversationProcedures && conversationProcedures.length >= 2) {
            form.append('conversation_procedures', JSON.stringify(conversationProcedures));
            if (activeProcedureKey) form.append('active_procedure', activeProcedureKey);
        }
        for (const f of files) form.append('files', f);
        if (files.length > 0 && !override) onFilesSent?.(files);
        if (!override) setAttachedFiles([]);

        const msgId = newAssistantMessage();
        await streamEvents(API_CONFIG.getFullUrl(API_CONFIG.endpoints.studioTurn),
            { method: 'POST', headers: processingLevelHeaders(processingLevel), body: form }, msgId);
        if (persistent && conversationIdRef.current && files.length > 0) refreshSources(conversationIdRef.current);
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

    // ── Lot 6 : décisions sur les propositions de l'agent ──
    const decide = (msgId: string, proposalId: string, decision: 'accepted' | 'refused') =>
        updateMsg(msgId, m => ({ ...m, agentProposals: (m.agentProposals || []).map(a => a.proposal_id === proposalId ? { ...a, decision } : a) }));

    const acceptProposal = (msgId: string, a: AgentProposal) => {
        if (a.kind === 'modification' && a.operations?.length) {
            if (currentWorkflow.length > 0 && onCheckpoint) {
                const snapshot = onCheckpoint();
                updateMsg(msgId, m => ({ ...m, checkpoint: snapshot, restored: false }));
            }
            // Les descriptions éventuelles des opérations ne restent pas dans les lignes du tableau
            const revised = applyOperations(currentWorkflow, a.operations).map(row => {
                const copy = { ...row } as Record<string, unknown>;
                delete copy.description;
                return copy as unknown as Table1Row;
            });
            onWorkflowGenerated(revised, '', new Map(), null);
            onSuccess('Modification appliquée');
        } else if (a.kind === 'point_ouvert' && a.point) {
            onAgentOpenPoint?.(a.point);
        } else if (a.kind === 'reponse_point' && a.point_id) {
            onAgentAnswerPoint?.(a.point_id, a.answer || '');
        }
        decide(msgId, a.proposal_id, 'accepted');
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
            id: crypto.randomUUID(), file, type: ACCEPTED_TYPES[file.type] || ({ docx: 'docx', pptx: 'pptx' } as Record<string, FileKind>)[file.name.toLowerCase().split('.').pop() || ''] || 'pdf', previewUrl: m.attachments?.[i]?.previewUrl,
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
        setSources([]);
        if (conversationIdRef.current) setConversation(null);
        if (guestMode) guestStore.remove(GUEST_CONVERSATION_KEY);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        await initSession();
        requestAnimationFrame(() => textareaRef.current?.focus());
    };

    // ─────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────

    const isSidebar = variant === 'sidebar';

    return (
        <section aria-label="Conversation" className={isSidebar ? 'relative h-full flex flex-col min-h-0 bg-white' : 'relative w-full max-w-4xl mx-auto'}
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
            onDrop={e => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files || [])); }}>
            {dragging && (
                <div className="absolute inset-2 z-30 rounded-2xl border-2 border-dashed border-neutral-900 bg-white/90 flex flex-col items-center justify-center text-neutral-900 pointer-events-none">
                    <Paperclip className="w-6 h-6 mb-2" />
                    <p className="text-sm font-semibold">Déposez vos fichiers</p>
                    <p className="text-xs text-neutral-600 mt-0.5">PDF, Word, PowerPoint ou images, jusqu&apos;à {MAX_ATTACHMENTS}</p>
                </div>
            )}
            {/* Pas de bandeau « Assistant » (comme Claude / ChatGPT) : deux icônes discrètes */}
            <div className={isSidebar ? 'shrink-0 flex h-10 items-center justify-end gap-0.5 bg-white px-2' : 'flex flex-wrap items-center justify-between gap-2 mb-2 px-1'}>
                {!isSidebar && (
                    <h3 className="text-sm font-semibold text-neutral-900 truncate">{messages.length > 0 ? 'Conversation' : 'Que souhaitez-vous formaliser ?'}</h3>
                )}
                <div className="flex items-center gap-0.5">
                    {showNewConversation && (
                        <button type="button" onClick={newSession} disabled={loading || !initialized}
                            className="p-1.5 rounded-lg text-neutral-900 hover:bg-neutral-100 disabled:opacity-40"
                            title="Nouvelle conversation" aria-label="Nouvelle conversation">
                            <PenLine className="w-4 h-4" />
                        </button>
                    )}
                    {isSidebar && onCollapse && (
                        <button type="button" onClick={onCollapse} title="Masquer la conversation" aria-label="Masquer la conversation"
                            className="hidden lg:inline-flex p-1.5 rounded-lg text-neutral-900 hover:bg-neutral-100">
                            <PanelLeftClose className="w-4 h-4" />
                        </button>
                    )}
                    {!isSidebar && <button type="button" aria-label={collapsed ? 'Ouvrir l’assistant' : 'Réduire l’assistant'} aria-expanded={!collapsed}
                        onClick={() => setCollapsed(c => !c)} className="p-1.5 rounded-lg hover:bg-white text-neutral-500">
                        {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>}
                </div>
            </div>
            <div hidden={!isSidebar && collapsed} className={isSidebar ? 'flex-1 min-h-0 flex flex-col' : undefined}>
                <div ref={messagesContainerRef} onScroll={onMessagesScroll} hidden={!isSidebar && messages.length === 0 && !loading}
                    className={isSidebar
                        ? 'flex-1 min-h-0 overflow-y-auto px-4 pt-1 pb-5 space-y-5 bg-white'
                        : 'overflow-y-auto max-h-[40vh] h-64 px-3 py-3 space-y-3 mb-2 rounded-xl bg-white/60'}>
                        {isSidebar && messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center px-6 text-neutral-600">
                                <Sparkles className="w-6 h-6 mb-3 text-neutral-900" />
                                <p className="text-xl text-neutral-900 font-semibold">Que souhaitez-vous formaliser ?</p>
                                <p className="text-[15px] text-neutral-900 mt-1">Joignez des documents, dictez ou décrivez une procédure.</p>
                                <p className="text-sm mt-1.5 leading-relaxed">Je repère les procédures qu&apos;ils contiennent : une seule est générée directement, plusieurs vous sont proposées. Vous pouvez aussi demander de tout fusionner.</p>
                            </div>
                        )}
                        {messages.map(msg => (
                            <div key={msg.id} className="pm-rise">
                                {/* Message utilisateur */}
                                {msg.role === 'user' && (
                                    <div className="group flex flex-col items-end gap-1">
                                        {msg.attachments && msg.attachments.length > 0 && (
                                            <div className="flex flex-wrap justify-end gap-1.5 max-w-[90%]">
                                                {msg.attachments.map((a, i) => <FileChip key={`${a.name}-${i}`} name={a.name} type={a.type} previewUrl={a.previewUrl} size={a.size} />)}
                                            </div>
                                        )}
                                        {msg.content && (
                                            <div className="max-w-[85%] bg-neutral-900 text-white rounded-2xl rounded-br-md px-3.5 py-2.5 text-[15px] shadow-sm">
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
                                    <div className="text-[15px] text-neutral-900 space-y-3">
                                        {msg.steps && msg.steps.length > 0 && (
                                            <WorkTrace steps={msg.steps} running={!!msg.streaming}
                                                startedAt={msg.startedAt} endedAt={msg.endedAt}
                                                open={openSteps.has(msg.id)}
                                                onToggle={() => setOpenSteps(s => { const n = new Set(s); if (n.has(msg.id)) n.delete(msg.id); else n.add(msg.id); return n; })} />
                                        )}
                                        {msg.content && (isProcedureNotice(msg)
                                            /* procédure créée : une carte qui l'ouvre, plutôt qu'une phrase qui répète le suivi */
                                            ? <ProcedureCard title={msg.title!} steps={msg.totalSteps ?? 0} intent={msg.intent!}
                                                onOpen={onOpenProcedure ? () => onOpenProcedure(msg.title!) : undefined} />
                                            : <MiniMarkdown text={msg.content} onStepClick={onFocusSteps} />)}
                                        {msg.intent === 'patch' && msg.changes && msg.changes.length > 0 ? (
                                            <ChangeSummary changes={msg.changes} undone={msg.restored} disabled={loading} procedure={msg.targetTitle}
                                                onShow={onFocusSteps}
                                                onUndo={msg.checkpoint !== undefined && onRestore ? () => { onRestore(msg.checkpoint); updateMsg(msg.id, m => ({ ...m, restored: true })); } : undefined} />
                                        ) : msg.operationsCount !== undefined && msg.intent === 'patch' && (
                                            <p className="text-xs text-neutral-600">
                                                ✓ {msg.operationsCount} opération{msg.operationsCount > 1 ? 's' : ''} appliquée{msg.operationsCount > 1 ? 's' : ''}
                                            </p>
                                        )}

                                        {/* Proposition : tout coché, l'utilisateur décoche */}
                                        {msg.proposal && (
                                            <div className="rounded-2xl border border-neutral-300 bg-white overflow-hidden shadow-sm">
                                                <ul>
                                                    {msg.proposal.procedures.map(p => {
                                                        const checked = msg.proposal!.selected.includes(p.id);
                                                        return (
                                                            <li key={p.id} className="border-b border-neutral-200 last:border-b-0">
                                                                <label className={`flex items-start gap-2.5 px-3 py-2.5 ${msg.proposal!.submitted ? 'opacity-70' : 'cursor-pointer hover:bg-neutral-50'}`}>
                                                                    <input type="checkbox" className="mt-0.5 accent-neutral-900" checked={checked}
                                                                        disabled={msg.proposal!.submitted} onChange={() => toggleProposalItem(msg.id, p.id)} />
                                                                    <span className="min-w-0">
                                                                        <span className="block text-sm text-neutral-900 font-medium">{p.title}</span>
                                                                        <span className="block text-[11px] text-neutral-500 truncate">
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
                                                    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-neutral-50 border-t border-neutral-200">
                                                        <button type="button" disabled={loading || msg.proposal.selected.length === 0}
                                                            onClick={() => submitProposal(msg.id, false)}
                                                            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40">
                                                            Générer {msg.proposal.selected.length > 1 ? `les ${msg.proposal.selected.length}` : 'la sélection'}
                                                        </button>
                                                        <button type="button" disabled={loading || msg.proposal.selected.length < 2}
                                                            onClick={() => submitProposal(msg.id, true)}
                                                            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-100 disabled:opacity-40">
                                                            Fusionner en une seule
                                                        </button>
                                                        <span className="text-[11px] text-neutral-500">ou répondez par écrit (« prends la 2 et la 4 »)</span>
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
                                                            className={`group relative w-full overflow-hidden flex items-center gap-3 rounded-2xl border bg-white px-3.5 py-3 text-left shadow-sm transition-all ${g.status === 'ready' ? 'border-neutral-300 hover:-translate-y-0.5 hover:shadow-md hover:border-neutral-900' : g.status === 'error' ? 'border-red-200' : 'border-neutral-300'}`}>
                                                            {g.status === 'generating' && <span aria-hidden className="pm-shimmer absolute inset-0" />}
                                                            <span className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${g.status === 'ready' ? 'bg-neutral-900 text-white' : g.status === 'error' ? 'bg-red-50 text-red-500' : 'bg-neutral-100 text-neutral-500'}`}>
                                                                {g.status === 'generating' ? <Loader2 className="w-4 h-4 animate-spin text-neutral-900" />
                                                                    : g.status === 'error' ? <AlertCircle className="w-4 h-4" />
                                                                    : g.status === 'stopped' ? <CircleStop className="w-4 h-4" />
                                                                    : <Workflow className="w-4 h-4" />}
                                                            </span>
                                                            <span className="relative min-w-0 flex-1">
                                                                <span className="block text-[15px] font-medium text-neutral-900 truncate">{g.title}</span>
                                                                <span className="flex items-center gap-1 text-xs text-neutral-700">
                                                                    {g.status === 'generating' && <span className="truncate">{`${g.phase || 'Génération en cours'}…`}{g.rows ? ` · ${g.rows} étape${g.rows > 1 ? 's' : ''}` : ''}</span>}
                                                                    {g.status === 'ready' && <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />{`${g.steps} étape${(g.steps || 0) > 1 ? 's' : ''}`}</>}
                                                                    {g.status === 'error' && (g.error || 'Échec de la génération')}
                                                                    {g.status === 'stopped' && 'Arrêtée'}
                                                                </span>
                                                            </span>
                                                            {g.status === 'ready' && <span className="relative text-xs font-medium text-neutral-900 opacity-0 group-hover:opacity-100 transition-opacity">Ouvrir</span>}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {/* Relecture : texte naturel (comme une réponse), étapes cliquables */}
                                        {msg.remarks && (
                                            <div className={msg.streaming && !msg.suggestions ? 'pm-caret' : undefined}>
                                                <MiniMarkdown text={msg.remarks} onStepClick={onFocusSteps} />
                                            </div>
                                        )}
                                        {/* Suggestions : seules à être présentées en cartes */}
                                        {msg.suggestions && msg.suggestions.length > 0 && (
                                            <div className="grid gap-2 pt-1" aria-label="Suggestions">
                                                {msg.suggestions.map((sug, i) => (
                                                    <button key={sug} type="button" disabled={loading} onClick={() => sendMessage(sug, { files: [], attachments: [] })}
                                                        style={{ animationDelay: `${i * 60}ms` }}
                                                        className="pm-rise group flex items-center gap-3 rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-neutral-900 hover:shadow-md disabled:opacity-40 disabled:hover:translate-y-0">
                                                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-900 group-hover:bg-neutral-900 group-hover:text-white transition-colors">
                                                            <Sparkles className="w-4 h-4" />
                                                        </span>
                                                        <span className="flex-1 text-[14px] leading-snug text-neutral-900 group-hover:text-neutral-900">{sug}</span>
                                                        <ArrowUpRight className="w-4 h-4 shrink-0 text-neutral-400 group-hover:text-neutral-900" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {/* Lot 6 : propositions de l'agent — rien n'est appliqué sans accord */}
                                        {msg.agentProposals && msg.agentProposals.length > 0 && (
                                            <div className="space-y-2" aria-label="Propositions de l'assistant">
                                                {msg.agentProposals.map(a => (
                                                    <div key={a.proposal_id} className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 shadow-sm">
                                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                                                            {a.kind === 'modification' ? `Modification proposée · ${a.operations?.length || 0} opération${(a.operations?.length || 0) > 1 ? 's' : ''}`
                                                                : a.kind === 'point_ouvert' ? 'Point à confirmer proposé' : 'Réponse à un point ouvert'}
                                                        </p>
                                                        <p className="mt-0.5 text-sm text-neutral-900">{a.explanation}</p>
                                                        {a.decision === 'accepted' ? <p className="mt-1.5 text-xs text-emerald-600">Acceptée</p>
                                                            : a.decision === 'refused' ? <p className="mt-1.5 text-xs text-neutral-500">Refusée</p>
                                                            : a.decision === 'historique' ? <p className="mt-1.5 text-xs text-neutral-500">Proposition d&apos;un échange précédent</p>
                                                            : (
                                                                <div className="mt-2 flex gap-2">
                                                                    <button type="button" onClick={() => acceptProposal(msg.id, a)} disabled={loading || (a.kind === 'modification' && currentWorkflow.length === 0)}
                                                                        className="rounded-lg bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40">Accepter</button>
                                                                    <button type="button" onClick={() => decide(msg.id, a.proposal_id, 'refused')} disabled={loading}
                                                                        className="rounded-lg border border-neutral-300 px-3 py-1 text-xs text-neutral-900 hover:bg-neutral-50 disabled:opacity-40">Refuser</button>
                                                                </div>
                                                            )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {msg.streaming && (!msg.steps || msg.steps.length === 0) && !msg.content && (
                                            <div className="flex items-center gap-2 text-xs text-neutral-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Réflexion…</div>
                                        )}
                                        {!msg.streaming && (msg.content || (msg.generations && msg.generations.length > 0)) && (
                                            <div className="flex gap-0.5 -ml-1.5">
                                                {msg.content && <MsgAction label={copiedId === msg.id ? 'Copié' : 'Copier'} onClick={() => copyMessage(msg)}>{copiedId === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}</MsgAction>}
                                                {msg.id === [...messages].reverse().find(m => m.role === 'assistant')?.id && (
                                                    <MsgAction label="Réessayer" onClick={() => retryFrom(msg.id)} disabled={loading}><RotateCcw className="w-3.5 h-3.5" /></MsgAction>
                                                )}
                                                {msg.checkpoint !== undefined && onRestore && !(msg.intent === 'patch' && msg.changes?.length) && (
                                                    msg.restored
                                                        ? <span className="self-center px-1.5 text-[11px] text-neutral-500">État d&apos;avant restauré</span>
                                                        : <button type="button" disabled={loading}
                                                            onClick={() => { onRestore(msg.checkpoint); updateMsg(msg.id, m => ({ ...m, restored: true })); onSuccess('État d’avant restauré'); }}
                                                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40">
                                                            <Undo2 className="w-3.5 h-3.5" /> Restaurer l&apos;état d&apos;avant
                                                        </button>
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
                                        <p className="text-neutral-900 leading-relaxed">{msg.content}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                        {showScrollDown && messages.length > 0 && (
                            <div className="sticky bottom-1 flex justify-center pointer-events-none">
                                <button type="button" onClick={() => scrollToBottom()} aria-label="Revenir en bas de la conversation"
                                    className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-900 shadow-md hover:bg-neutral-100">
                                    <ArrowDown className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                </div>
                <div aria-label="Composeur" className={(isSidebar ? 'shrink-0 m-3 mt-1 ' : '') + "rounded-2xl border border-neutral-900/70 bg-white shadow-sm focus-within:border-neutral-900"}>
                    {inputContext && <div hidden={!inputContextVisible} className="border-b border-neutral-200 p-3 bg-neutral-50/50 rounded-t-2xl">{inputContext}</div>}
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
                            {onOpenDocuments || onOpenCode || isAdmin ? (
                                <div ref={addMenuRef} className="relative shrink-0">
                                    <button type="button" aria-label="Ajouter un contenu" title="Ajouter un contenu"
                                        aria-haspopup="menu" aria-expanded={addMenuOpen}
                                        onClick={() => setAddMenuOpen(o => !o)}
                                        className={`p-2 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${addMenuOpen ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-900 hover:bg-neutral-100'}`}>
                                        <Plus className={`w-4 h-4 transition-transform ${addMenuOpen ? 'rotate-45' : ''}`} />
                                    </button>
                                    {addMenuOpen && (
                                        <div role="menu" className="absolute bottom-full left-0 mb-2 z-40 w-60 p-1.5 bg-white border border-neutral-300 rounded-xl shadow-lg">
                                            <ComposerMenuAction icon={<Paperclip className="w-4 h-4" />} label="Joindre des fichiers (PDF, Word, PowerPoint, images)" onClick={() => { setAddMenuOpen(false); fileInputRef.current?.click(); }} disabled={attachedFiles.length >= MAX_ATTACHMENTS} />
                                            {isAdmin && <ComposerMenuAction icon={<FolderOpen className="w-4 h-4" />} label="Fichiers de démo" onClick={() => { setAddMenuOpen(false); setDemoFilesOpen(true); }} disabled={attachedFiles.length >= MAX_ATTACHMENTS} />}
                                            {onOpenCode && <ComposerMenuAction icon={<Code className="w-4 h-4" />} label="Code source" onClick={() => { setAddMenuOpen(false); onOpenCode(); }} />}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={attachedFiles.length >= MAX_ATTACHMENTS}
                                    className="p-2 rounded-lg text-neutral-900 hover:bg-neutral-100 disabled:opacity-40 shrink-0" title="Joindre un fichier">
                                    <Paperclip className="w-4 h-4" />
                                </button>
                            )}

                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept=".pdf,.docx,.pptx,image/png,image/jpeg,image/webp"
                                onChange={e => {
                                    if (e.target.files) addFiles(Array.from(e.target.files));
                                    e.target.value = '';
                                }}
                                className="hidden"
                            />
                            {isAdmin && <DemoFilesPicker open={demoFilesOpen} onClose={() => setDemoFilesOpen(false)}
                                onAttach={addFiles} maxSelect={MAX_ATTACHMENTS - attachedFiles.length} onError={onError} />}


                                {onToggleRecording && <button type="button" onClick={onToggleRecording} disabled={processing}
                                    aria-pressed={recording}
                                    className={['inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-50', recording ? 'bg-red-50 text-red-600' : 'text-neutral-900 hover:bg-neutral-100'].join(' ')}>
                                    {recording ? <Square className="w-4 h-4" /> : processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                                    {recording ? 'Arrêter le vocal' : processing ? 'Traitement vocal…' : 'Vocal'}
                                </button>}
                                {recording && onCancelRecording && <button type="button" onClick={onCancelRecording} className="text-xs text-neutral-700 hover:text-red-600">Annuler le vocal</button>}
                                {/* Sources de la conversation : déjà lues, gardées d'un message à l'autre. Un bouton
                                    discret (pas des pièces jointes en attente d'envoi), la liste s'ouvre au clic */}
                                {persistent && conversationId && sources.length > 0 && (
                                    <div ref={sourcesRef} className="relative">
                                        <button type="button" onClick={() => setSourcesOpen(o => !o)} aria-expanded={sourcesOpen}
                                            title="Fichiers déjà joints à cette conversation"
                                            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-100">
                                            <Paperclip className="w-4 h-4" />
                                            {sources.length} source{sources.length > 1 ? 's' : ''}
                                        </button>
                                        {sourcesOpen && (
                                            <div role="dialog" aria-label="Sources de la conversation"
                                                className="absolute bottom-full left-0 z-40 mb-2 w-72 max-w-[80vw] rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
                                                <p className="px-1 pb-1.5 text-[11px] text-neutral-500">Déjà lues par l&apos;assistant ; gardées pour toute la conversation.</p>
                                                <ul className="max-h-60 overflow-y-auto">
                                                    {sources.map(src => (
                                                        <li key={src.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm text-neutral-900 hover:bg-neutral-50">
                                                            <FileText className="w-4 h-4 shrink-0" />
                                                            <span className="min-w-0 flex-1 truncate" title={src.filename}>{src.filename}</span>
                                                            <button type="button" aria-label={`Retirer la source ${src.filename}`} title="Retirer cette source"
                                                                onClick={() => removeSource(src.id)} disabled={loading}
                                                                className="p-1 rounded text-neutral-500 hover:text-red-600 hover:bg-white disabled:opacity-40">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}

                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                {guestMode && (
                                    <span className="hidden sm:inline text-[11px] text-neutral-500" title="Créez un compte pour conserver votre travail et lever ces limites">
                                        Invité · {GUEST_LIMITS.maxFiles} fichier, {GUEST_LIMITS.maxFileMb} Mo, {GUEST_LIMITS.maxPages} pages max · rien n&apos;est enregistré
                                    </span>
                                )}
                                {processingLevel && onProcessingLevelChange && <ProcessingLevelSelector value={processingLevel} onChange={onProcessingLevelChange} />}
                            <button
                                aria-label={loading ? 'Arrêter' : 'Envoyer le message'}
                                title={loading ? 'Arrêter' : 'Envoyer (Entrée)'}
                                type="button"
                                onClick={() => (loading ? stopStreaming() : sendMessage())}
                                disabled={!loading && (!initialized || (!input.trim() && attachedFiles.length === 0))}
                                className={`
                                    w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors
                                    focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400
                                    ${!loading && (!input.trim() && attachedFiles.length === 0)
                                        ? 'bg-neutral-300 text-white cursor-not-allowed'
                                        : 'bg-neutral-900 text-white hover:bg-neutral-700'
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

/** Création, recherche réglementaire, transcription : une autre procédure (la réécriture remplace) */
const isNewProcedure = (intent: Intent) => intent === 'generate' || intent === 'web_search' || intent === 'transcribe';

const PROCEDURE_VERB: Partial<Record<Intent, string>> = {
    generate: 'Créée', regen: 'Réécrite', web_search: 'Constituée depuis la réglementation', transcribe: 'Transcrite',
};

/** Message automatique « Processus … généré — N étapes » (aussi les anciens, rechargés) */
function isProcedureNotice(m: { intent?: Intent; title?: string; totalSteps?: number; content: string; streaming?: boolean }): boolean {
    if (m.streaming || !m.intent || !PROCEDURE_VERB[m.intent] || !m.title) return false;
    const local = buildAssistantMessage(m.intent, m.title, m.totalSteps ?? 0);
    // le serveur enregistre la même phrase avec des guillemets « » (turn_recorder._chat_summary)
    const stored = local.replace(`"${m.title}"`, `« ${m.title} »`);
    return m.content.trim() === local || m.content.trim() === stored;
}

function ProcedureCard({ title, steps, intent, onOpen }: { title: string; steps: number; intent: Intent; onOpen?: () => void }) {
    const body = (
        <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-300 bg-white">
                <Workflow className="h-4 w-4 text-neutral-900" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-neutral-900">{title}</span>
                <span className="block text-xs text-neutral-600">{PROCEDURE_VERB[intent]} · {steps} étape{steps > 1 ? 's' : ''}</span>
            </span>
            {onOpen && <span className="shrink-0 text-xs font-medium text-neutral-900">Ouvrir</span>}
        </>
    );
    const cls = 'flex w-full max-w-md items-center gap-3 rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-left';
    return onOpen
        ? <button type="button" onClick={onOpen} title="Afficher cette procédure" className={`${cls} hover:bg-neutral-100`}>{body}</button>
        : <div className={cls}>{body}</div>;
}

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
const KIND_STYLE: Record<FileKind, { label: string; tile: string; icon: string }> = {
    pdf: { label: 'PDF', tile: 'bg-red-50', icon: 'text-red-500' },
    docx: { label: 'Word', tile: 'bg-blue-50', icon: 'text-blue-600' },
    pptx: { label: 'PowerPoint', tile: 'bg-orange-50', icon: 'text-orange-500' },
    image: { label: 'Image', tile: 'bg-blue-50', icon: 'text-blue-500' },
};

function FileChip({ name, type, previewUrl, size, onRemove }: { name: string; type: FileKind; previewUrl?: string; size?: number; onRemove?: () => void }) {
    const kind = KIND_STYLE[type] || KIND_STYLE.pdf;
    return (
        <div className="group relative flex items-center gap-2 rounded-xl border border-slate-200 bg-white pl-1.5 pr-3 py-1.5 max-w-[220px] shadow-sm">
            {type === 'image' && previewUrl
                ? <img src={previewUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                : <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${kind.tile}`}>
                    {type === 'pptx' ? <Presentation className={`w-4 h-4 ${kind.icon}`} /> : type === 'image' ? <ImageIcon className={`w-4 h-4 ${kind.icon}`} /> : <FileText className={`w-4 h-4 ${kind.icon}`} />}
                  </div>}
            <div className="min-w-0 text-left">
                <p className="text-xs font-medium text-slate-700 truncate">{name}</p>
                <p className="text-[10px] text-slate-400">{kind.label}{size ? ` · ${formatSize(size)}` : ''}</p>
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

/**
 * Conversations enregistrées (lot 3 de la refonte du chat).
 * Actives si NEXT_PUBLIC_CONVERSATIONS_ENABLED=true ET utilisateur connecté (le backend
 * doit aussi avoir CONVERSATIONS_ENABLED=true). Un tour de conversation passe par
 * /api/studio/turn avec session_id = id de la conversation.
 * Pas de mémoire implicite : l'assistant ne voit que les messages et les sources affichés ici.
 */
import { API_CONFIG } from '@/lib/api-config';
import { getAuthHeaders } from '@/lib/authHeaders';

// Activé par défaut ; NEXT_PUBLIC_CONVERSATIONS_ENABLED=false pour couper en urgence
export const CONVERSATIONS_ENABLED = process.env.NEXT_PUBLIC_CONVERSATIONS_ENABLED !== 'false';

export interface ConversationSummary {
    id: string;
    title: string;
    procedure_ids: string[];
    project_id: string | null;
    created_at: string;
    updated_at: string;
    archived_at: string | null;
    pinned_at?: string | null;
}

export interface StoredMessage {
    id: string;
    role: 'user' | 'assistant' | 'clarify';
    content: string;
    payload: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    created_at: string;
}

/** Procédure de la conversation telle que l'utilisateur l'a laissée (rouverte avec elle) */
export interface StoredProcedure {
    key: string;
    title: string;
    workflow: unknown[];
    enrichments?: Record<string, unknown>;
    procedureMetadata?: Record<string, unknown> | null;
    bpmnXml?: string | null;
    workflow_db_id?: string | null;
}

export interface ConversationSource {
    id: string;
    filename: string;
    type: 'pdf' | 'image' | 'docx' | 'pptx';
    size: number;
    pages: number | null;
    added_at: string;
}

const base = () => API_CONFIG.getFullUrl('/api/conversations');

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(base() + path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()), ...((init.headers as Record<string, string>) || {}) },
    });
    if (!res.ok) {
        const detail = await res.json().then(d => d.detail).catch(() => null);
        throw new Error(detail || `Erreur ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export const conversationsApi = {
    list: (params: { limit?: number; procedureId?: string; projectId?: string; archived?: boolean; q?: string } = {}) => {
        const q = new URLSearchParams();
        if (params.q?.trim()) q.set('q', params.q.trim());
        if (params.limit) q.set('limit', String(params.limit));
        if (params.procedureId) q.set('procedure_id', params.procedureId);
        if (params.projectId) q.set('project_id', params.projectId);
        if (params.archived) q.set('archived', 'true');
        const qs = q.toString();
        return call<{ conversations: ConversationSummary[] }>(qs ? `?${qs}` : '').then(r => r.conversations);
    },
    create: (body: { title?: string; procedure_ids?: string[]; project_id?: string | null } = {}) =>
        call<{ conversation: ConversationSummary }>('', { method: 'POST', body: JSON.stringify(body) }).then(r => r.conversation),
    get: (id: string) =>
        call<{ conversation: ConversationSummary; messages: StoredMessage[]; sources: ConversationSource[];
            procedures?: StoredProcedure[]; active_procedure?: string | null }>(`/${id}`),
    saveProcedures: (id: string, procedures: StoredProcedure[], active: string | null) =>
        call<{ success: boolean }>(`/${id}/procedures`, { method: 'PUT', body: JSON.stringify({ procedures, active }) }),
    latestForProcedure: (procedureId: string) =>
        call<{ conversation: ConversationSummary | null }>(`/latest?procedure_id=${encodeURIComponent(procedureId)}`).then(r => r.conversation),
    update: (id: string, body: { title?: string; archived?: boolean; link_procedure_id?: string; project_id?: string | null; pinned?: boolean }) =>
        call<{ conversation: ConversationSummary }>(`/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then(r => r.conversation),
    remove: (id: string) => call<{ success: boolean }>(`/${id}`, { method: 'DELETE' }),
    removeSource: (id: string, sourceId: string) => call<{ success: boolean }>(`/${id}/sources/${sourceId}`, { method: 'DELETE' }),
    /** Reprend dans le compte une conversation faite en mode invité */
    importGuest: (body: { title?: string; messages: { role: string; content: string; payload: Record<string, unknown> }[] }) =>
        call<{ conversation: ConversationSummary }>('/import', { method: 'POST', body: JSON.stringify(body) }).then(r => r.conversation),
};

/** Paramètre d'URL ?c=<id> : rouvrir une conversation par lien, sans recharger la page. */
export function readConversationParam(): string | null {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('c');
}

export function writeConversationParam(id: string | null): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('c', id); else url.searchParams.delete('c');
    window.history.replaceState(window.history.state, '', url.toString());
}

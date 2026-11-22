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
    /** remplacée ou retirée par le chat : gardée dans la conversation, rétablissable */
    archived?: boolean;
    title: string;
    workflow: unknown[];
    enrichments?: Record<string, unknown>;
    procedureMetadata?: Record<string, unknown> | null;
    bpmnXml?: string | null;
    workflow_db_id?: string | null;
    /** côté serveur (docs/conversation-serveur.md) : version courante et version enregistrée dans le référentiel */
    version?: number;
    saved_version?: number | null;
}

/** Une version d'une procédure de la conversation (sans son contenu) */
export interface ConversationVersion {
    version: number; title: string; origine: string; resume: string | null; created_at: string;
    courante: boolean; enregistree: boolean;
}

/** Une correction à la main partait d'une version dépassée : le serveur renvoie la version à jour */
export class ProcedureConflict extends Error {
    constructor(message: string, public procedure: StoredProcedure) { super(message); }
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
            procedures?: StoredProcedure[]; active_procedure?: string | null; procedures_serveur?: boolean }>(`/${id}`),
    saveProcedures: (id: string, procedures: StoredProcedure[], active: string | null) =>
        call<{ success: boolean }>(`/${id}/procedures`, { method: 'PUT', body: JSON.stringify({ procedures, active }) }),
    /** Correction à la main d'une procédure de la conversation, à partir de la version `base_version` */
    editProcedure: async (id: string, key: string, body: { base_version: number; title: string; workflow: unknown[];
        enrichments: Record<string, unknown>; procedureMetadata?: Record<string, unknown> | null; bpmnXml?: string | null }) => {
        const res = await fetch(`${base()}/${id}/procedures/${encodeURIComponent(key)}`, {
            method: 'PUT', body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data?.detail?.procedure) throw new ProcedureConflict(data.detail.message, data.detail.procedure);
        if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : `Erreur ${res.status}`);
        return data.procedure as StoredProcedure;
    },
    archiveProcedure: (id: string, key: string, archived: boolean) =>
        call<{ procedures: StoredProcedure[] }>(`/${id}/procedures/${encodeURIComponent(key)}/archive`,
            { method: 'POST', body: JSON.stringify({ archived }) }).then(r => r.procedures),
    procedureSaved: (id: string, key: string, workflowDbId: string, version?: number) =>
        call<{ procedure: StoredProcedure }>(`/${id}/procedures/${encodeURIComponent(key)}/saved`,
            { method: 'POST', body: JSON.stringify({ workflow_db_id: workflowDbId, version: version ?? null }) }).then(r => r.procedure),
    procedureVersions: (id: string, key: string) =>
        call<{ versions: ConversationVersion[] }>(`/${id}/procedures/${encodeURIComponent(key)}/versions`).then(r => r.versions),
    procedureVersion: (id: string, key: string, version: number) =>
        call<{ procedure: StoredProcedure }>(`/${id}/procedures/${encodeURIComponent(key)}/versions/${version}`).then(r => r.procedure),
    restoreProcedureVersion: (id: string, key: string, version: number) =>
        call<{ procedure: StoredProcedure }>(`/${id}/procedures/${encodeURIComponent(key)}/versions/${version}/restore`,
            { method: 'POST' }).then(r => r.procedure),
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

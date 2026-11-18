/**
 * Projets (lot 4) : instructions + sources partagées par les conversations du projet.
 * Pas de mémoire implicite : l'assistant d'une conversation du projet voit les instructions
 * et les sources affichées ici, rien d'autre.
 */
import { API_CONFIG } from '@/lib/api-config';
import { getAuthHeaders } from '@/lib/authHeaders';

export interface Project {
    id: string;
    name: string;
    instructions: string;
    campaign_id: string | null;
    created_at: string;
    updated_at: string;
    archived_at: string | null;
    my_role: 'owner' | 'editor' | 'viewer' | 'member';
}

export interface ProjectSource { id: string; filename: string; type: string; size: number; added_at: string }

/** Campagne liée à un projet de travail : ce qu'il faut livrer (le projet = où l'on travaille) */
export interface ProjectCampaign {
    id: string;
    title: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    stats: { total: number; done: number; in_progress: number; pending: number; progress_pct: number };
    procedures: { id?: string; procedure_id: string | null; procedure_nom: string; procedure_ref: string; status: string; echeance?: string | null; mine: boolean }[];
}

const base = () => API_CONFIG.getFullUrl('/api/projects');

async function call<T>(path: string, init: RequestInit = {}, json = true): Promise<T> {
    const res = await fetch(base() + path, {
        ...init,
        headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(await getAuthHeaders()), ...((init.headers as Record<string, string>) || {}) },
    });
    if (!res.ok) {
        const detail = await res.json().then(d => d.detail).catch(() => null);
        throw new Error(detail || `Erreur ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export const projectsApi = {
    list: () => call<{ projects: Project[] }>('').then(r => r.projects),
    create: (body: { name: string; instructions?: string }) =>
        call<{ project: Project }>('', { method: 'POST', body: JSON.stringify(body) }).then(r => r.project),
    get: (id: string) =>
        call<{ project: Project; sources: ProjectSource[]; conversations: { id: string; title: string; updated_at: string }[]; campaign?: ProjectCampaign | null }>(`/${id}`),
    /** Espace de travail d'une campagne (créé à la première ouverture) */
    forCampaign: (campaignId: string) =>
        call<{ project: Project }>(`/for-campaign/${campaignId}`, { method: 'POST' }).then(r => r.project),
    update: (id: string, body: { name?: string; instructions?: string; archived?: boolean }) =>
        call<{ project: Project }>(`/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then(r => r.project),
    remove: (id: string) => call<{ success: boolean }>(`/${id}`, { method: 'DELETE' }),
    addSources: (id: string, files: File[]) => {
        const form = new FormData();
        files.forEach(f => form.append('files', f));
        return call<{ added: ProjectSource[] }>(`/${id}/sources`, { method: 'POST', body: form }, false).then(r => r.added);
    },
    removeSource: (id: string, sourceId: string) => call<{ success: boolean }>(`/${id}/sources/${sourceId}`, { method: 'DELETE' }),
};

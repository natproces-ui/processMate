/**
 * Emplacements de campagne (« procédures attendues ») — clinic/manager/campaign_items.py.
 * Actif avec NEXT_PUBLIC_CAMPAIGN_SLOTS_ENABLED (et CAMPAIGN_SLOTS_ENABLED côté backend).
 */
import { API_CONFIG } from '@/lib/api-config';

export const CAMPAIGN_SLOTS_ENABLED = process.env.NEXT_PUBLIC_CAMPAIGN_SLOTS_ENABLED === 'true';

export type SlotStatus = 'pending' | 'in_progress' | 'submitted' | 'in_review' | 'formalized' | 'validated' | 'skipped';
export type SlotOrigin = 'referentiel' | 'document' | 'bian' | 'analyse' | 'proposition' | 'saisie';

export interface Raci { R: string[]; A: string | null; C: string[]; I: string[] }

export interface Slot {
    id: string;
    campaign_id: string;
    procedure_id: string | null;
    procedure_nom: string;
    procedure_ref: string | null;
    taxonomy_id: string | null;
    equipe_id: string | null;
    echeance: string | null;
    status: SlotStatus;
    origine: SlotOrigin;
    notes: string | null;
    raci: Raci;
}

export interface LaunchProblem { emplacement: string | null; titre?: string; probleme: string }
export interface Duplicate { ou: 'campagne' | 'referentiel'; titre: string; reference?: string | null; procedure_id?: string }

export interface SlotEntry {
    titre?: string;
    reference?: string;
    procedure_id?: string;
    taxonomy_id?: string;
    equipe_id?: string;
    echeance?: string;
    origine?: SlotOrigin;
}

export const SLOT_STATUS_LABELS: Record<SlotStatus, string> = {
    pending: 'À faire', in_progress: 'En cours', submitted: 'Soumise', in_review: 'En relecture',
    formalized: 'Formalisée', validated: 'Validée', skipped: 'Écartée',
};

export const SLOT_ORIGIN_LABELS: Record<SlotOrigin, string> = {
    referentiel: 'Référentiel', document: 'Document', bian: 'BIAN', analyse: 'Analyse', proposition: 'Proposition', saisie: 'Saisie',
};

export class SlotsError extends Error {
    details: unknown;
    constructor(message: string, details?: unknown) { super(message); this.details = details; }
}

async function call<T>(path: string, init: RequestInit = {}, json = true): Promise<T> {
    const res = await fetch(API_CONFIG.getFullUrl('/api/campaigns' + path), {
        ...init,
        headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...((init.headers as Record<string, string>) || {}) },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const d = body?.detail;
        if (d && typeof d === 'object') throw new SlotsError(d.message || `Erreur ${res.status}`, d.details);
        throw new SlotsError(d || `Erreur ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export const campaignSlotsApi = {
    list: (cid: string) => call<{ emplacements: Slot[]; problemes_lancement: LaunchProblem[] }>(`/${cid}/emplacements`),
    create: (cid: string, entries: SlotEntry[], force = false) =>
        call<{ created: string[]; doublons: Duplicate[] }>(`/${cid}/emplacements`, { method: 'POST', body: JSON.stringify({ entries, force }) }),
    update: (cid: string, id: string, body: Partial<Pick<Slot, 'procedure_nom' | 'procedure_ref' | 'echeance' | 'status' | 'notes' | 'equipe_id' | 'taxonomy_id'>> & { procedure_id?: string; unlink?: boolean }) =>
        call<{ emplacement: Slot }>(`/${cid}/emplacements/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    bulk: (cid: string, ids: string[], body: { echeance?: string; equipe_id?: string; status?: SlotStatus }) =>
        call<{ count: number }>(`/${cid}/emplacements`, { method: 'PATCH', body: JSON.stringify({ ids, ...body }) }),
    setRaci: (cid: string, ids: string[], raci: Partial<Raci>, partial = true) =>
        call<{ count: number }>(`/${cid}/emplacements/raci`, { method: 'PUT', body: JSON.stringify({ ids, raci, partial }) }),
    remove: (cid: string, id: string) => call<{ success: boolean }>(`/${cid}/emplacements/${id}`, { method: 'DELETE' }),
    fromDocument: (cid: string, files: File[]) => {
        const form = new FormData();
        files.forEach(f => form.append('files', f));
        return call<{ candidats: { titre: string; resume: string }[]; doublons: Duplicate[]; fichiers: string[] }>(
            `/${cid}/emplacements/depuis-document`, { method: 'POST', body: form }, false);
    },
    launch: (cid: string) =>
        call<{ procedures_creees: number; taches_creees: number; taches_non_creees: { titre: string; raison: string }[] }>(
            `/${cid}/launch`, { method: 'POST' }),
};

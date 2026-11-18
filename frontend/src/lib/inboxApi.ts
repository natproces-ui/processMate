/** À faire, points ouverts adressés, préférences d'e-mail, couverture BIAN — clinic/routers/inbox_router.py */
import { API_CONFIG } from '@/lib/api-config';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(API_CONFIG.getFullUrl('/api' + path), {
        ...init, headers: { 'Content-Type': 'application/json', ...((init.headers as Record<string, string>) || {}) },
    });
    if (!res.ok) {
        const detail = await res.json().then(d => d.detail).catch(() => null);
        throw new Error(typeof detail === 'string' ? detail : `Erreur ${res.status}`);
    }
    return res.json() as Promise<T>;
}
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export interface BianDomain { domaine: string; categories: string[]; etat: 'couvert' | 'en_cours' | 'non_couvert'; procedures: number }
export interface BianMapping { id: string; domaine: string; statut: 'suggere' | 'accepte'; source: 'manuel' | 'assistant' }

export const inboxApi = {
    counter: () => call<{ ouvertes: number; en_retard: number }>('/taches/compteur'),
    addressPoint: (procedureId: string, pointId: string, target: { user_id?: string; equipe_id?: string }) =>
        call<{ point: { destinataires: string[] } }>(`/points/${procedureId}/${pointId}/adresser`, json('POST', target)).then(r => r.point),
    notifications: () => call<{ email_taches: boolean }>('/me/notifications'),
    setNotifications: (email_taches: boolean) => call<{ email_taches: boolean }>('/me/notifications', json('PUT', { email_taches })),
    coverage: () => call<{ domaines: BianDomain[] }>('/bian/couverture').then(r => r.domaines),
    mappings: (procedureId: string) => call<{ correspondances: BianMapping[] }>(`/bian/procedures/${procedureId}`).then(r => r.correspondances),
    addMapping: (procedureId: string, domaine: string) => call<{ correspondance: BianMapping }>(`/bian/procedures/${procedureId}`, json('POST', { domaine })),
    suggest: (procedureId: string) => call<{ suggestions: BianMapping[] }>(`/bian/procedures/${procedureId}/suggestions`, json('POST')).then(r => r.suggestions),
    decide: (mappingId: string, accept: boolean) => call<{ success: boolean }>(`/bian/correspondances/${mappingId}/${accept ? 'accepter' : 'refuser'}`, json('POST')),
    slotsFromGaps: (campaignId: string, domaines: string[]) =>
        call<{ created: string[] }>('/bian/couverture/emplacements', json('POST', { campaign_id: campaignId, domaines })),
};

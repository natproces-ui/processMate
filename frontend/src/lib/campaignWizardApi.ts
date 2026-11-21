/** Campagne guidée depuis l'accueil de l'organisation — clinic/routers/campaigns_router.py (/guidee) */
import { API_CONFIG } from '@/lib/api-config';

export interface WizardRaci { R: string[]; A: string | null; C: string[]; I: string[] }
export interface WizardSuggestion {
    procedure_id: string; titre: string; chemin: string; equipe: string | null; raci: WizardRaci;
    /** procedure : son RACI ; equipe : responsable de l'équipe de la branche ; aucune : à désigner */
    source: 'procedure' | 'equipe' | 'aucune';
    deja_en_campagne: string[];
}
export interface WizardResult {
    campaign: { id: string; title: string; status: string };
    lancee: boolean;
    taches_creees?: number;
    procedures_creees?: number;
    problemes?: string | { message?: string; details?: { titre?: string; probleme: string }[] };
}

async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(API_CONFIG.getFullUrl('/api/campaigns/guidee' + path), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) {
        const detail = await res.json().then(d => d.detail).catch(() => null);
        const msg = typeof detail === 'string' ? detail : detail?.message;
        throw new Error(msg || `Erreur ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export const campaignWizardApi = {
    suggest: (procedure_ids: string[], coordinator_id?: string) =>
        post<{ procedures: WizardSuggestion[] }>('/proposition', { procedure_ids, coordinator_id: coordinator_id || null }).then(r => r.procedures),
    create: (body: { title: string; end_date?: string; coordinator_id?: string; lancer: boolean;
        procedures: { procedure_id: string; raci: WizardRaci }[] }) =>
        post<WizardResult>('', { ...body, end_date: body.end_date || null, coordinator_id: body.coordinator_id || null }),
};

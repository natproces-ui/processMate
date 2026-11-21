/** Accueil de l'organisation, adapté au rôle — clinic/manager/home.py (GET /api/accueil) */
import { API_CONFIG } from '@/lib/api-config';
import type { ReferentialState } from '@/lib/referentialApi';

export interface HomeTask {
    id: string; titre: string | null; procedure_id: string | null; procedure: string | null;
    echeance: string | null; statut: string; en_retard: boolean;
}
export interface HomeCampaign {
    id: string; titre: string; statut: string; echeance: string | null;
    total: number; faites: number; avancement: number; en_retard: boolean;
}
export interface HomeData {
    role: string | null;
    taches: { ouvertes: number; en_retard: number; prochaines: HomeTask[] };
    procedures: { total: number; liste: { id: string; nom: string; role: 'R' | 'A' }[] };
    pilotage?: {
        propositions: number; validations: number; taches_en_retard: number;
        campagnes: HomeCampaign[]; referentiel: ReferentialState;
    };
}

export async function fetchHome(): Promise<HomeData> {
    const res = await fetch(API_CONFIG.getFullUrl('/api/accueil'));
    if (!res.ok) {
        const detail = await res.json().then(d => d.detail).catch(() => null);
        throw new Error(typeof detail === 'string' ? detail : `Erreur ${res.status}`);
    }
    return res.json() as Promise<HomeData>;
}

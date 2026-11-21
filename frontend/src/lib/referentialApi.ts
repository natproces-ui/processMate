/** Référentiel de l'organisation : état, partir de rien, référentiel par défaut — clinic/routers/taxonomy_router.py */
import { API_CONFIG } from '@/lib/api-config';

export interface ReferentialState {
    themes: number;
    categories: number;
    sous_categories: number;
    procedures: number;
    procedures_classees: number;
    procedures_redigees: number;
    /** vide ; defaut : structure BIAN telle que chargée ; personnalise : adapté ou construit */
    origine: 'vide' | 'defaut' | 'personnalise';
    peut_vider: boolean;
    campagnes: { total: number; en_cours: number };
}

async function call<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
    const res = await fetch(API_CONFIG.getFullUrl('/api/orchestration/referentiel' + path), { method });
    if (!res.ok) {
        const detail = await res.json().then(d => d.detail).catch(() => null);
        throw new Error(typeof detail === 'string' ? detail : `Erreur ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export const referentialApi = {
    state: () => call<ReferentialState>('/etat'),
    empty: () => call<{ supprimes: number; etat: ReferentialState }>('/vider', 'POST'),
    loadDefault: () => call<{ seeded: boolean; etat: ReferentialState }>('/defaut', 'POST'),
};

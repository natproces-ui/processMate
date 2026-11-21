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
    apply: (arbre: ReferentialNode[]) => applyReferential(arbre),
};

// ── Proposition de référentiel (chat, « Partir de mes sources ») ──

export interface ReferentialNode { nom: string; procedures: { nom: string; source?: string }[]; enfants: ReferentialNode[] }
export interface ReferentialProposal {
    titre: string;
    arbre: ReferentialNode[];
    remarques: { type: 'doublon' | 'manque' | 'incoherence' | 'conseil'; texte: string }[];
    stats: { themes: number; categories: number; sous_categories: number; procedures: number };
}
export interface ApplyResult {
    crees: { themes: number; categories: number; sous_categories: number; procedures: number };
    branches_reprises: number;
    procedures_deja_presentes: string[];
    etat: ReferentialState;
}

export const applyReferential = async (arbre: ReferentialNode[]): Promise<ApplyResult> => {
    const res = await fetch(API_CONFIG.getFullUrl('/api/orchestration/referentiel/appliquer'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ arbre }),
    });
    if (!res.ok) {
        const detail = await res.json().then(d => d.detail).catch(() => null);
        throw new Error(typeof detail === 'string' ? detail : `Erreur ${res.status}`);
    }
    return res.json() as Promise<ApplyResult>;
};

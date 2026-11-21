/** Où enregistrer une procédure : campagnes (dossiers) puis thèmes — clinic/routers/save_target_router.py */
import { API_CONFIG } from '@/lib/api-config';

export interface SaveTaxonomyNode { id: string; parent_id: string | null; name: string; level: string; order_index?: number }

export interface SaveSlot {
    /** id de l'emplacement de campagne */
    id: string;
    procedure_id: string | null;
    titre: string;
    taxonomy_id: string | null;
    statut: string;
    ecriture: boolean;
}

export interface SaveCampaign {
    id: string; titre: string; statut: string; lecture_seule: boolean; emplacements: SaveSlot[];
}

export interface SaveOther { procedure_id: string; titre: string; taxonomy_id: string | null; ecriture: boolean }

export interface SaveSuggestion {
    campaign_id: string | null; emplacement_id: string | null; procedure_id: string | null; titre: string;
}

export interface SaveTree {
    taxonomie: SaveTaxonomyNode[];
    campagnes: SaveCampaign[];
    hors_campagne: SaveOther[];
    /** directe : le pilotage crée ; proposition : un contributeur propose au pilote ; null : rien */
    creation: 'directe' | 'proposition' | null;
    suggestion: SaveSuggestion | null;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(API_CONFIG.getFullUrl('/api/enregistrement' + path), {
        ...init, headers: { 'Content-Type': 'application/json', ...((init.headers as Record<string, string>) || {}) },
    });
    if (!res.ok) {
        const detail = await res.json().then(d => d.detail).catch(() => null);
        throw new Error(typeof detail === 'string' ? detail : `Erreur ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export const saveTargetsApi = {
    tree: (titre?: string) => call<SaveTree>(`/arbre${titre ? `?titre=${encodeURIComponent(titre)}` : ''}`),
    /** Emplacement sans procédure (campagne en brouillon) : la procédure est créée et reliée */
    attachSlot: (slotId: string) => call<{ procedure_id: string; titre: string }>(`/emplacements/${slotId}`, { method: 'POST' }),
    create: (body: {
        titre: string; taxonomy_id?: string | null; campaign_id?: string | null;
        workflow_json?: unknown[]; enrichments_json?: Record<string, unknown>; metadata?: Record<string, unknown>; message?: string;
    }) => call<{ resultat: 'creee' | 'proposee'; procedure_id?: string; proposition_id?: string; titre: string }>(
        '/nouvelle', { method: 'POST', body: JSON.stringify(body) }),
};

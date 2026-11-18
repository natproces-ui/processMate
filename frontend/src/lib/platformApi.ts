/** Console plateforme (super-admin processMate) — voir clinic/routers/platform_router.py */
import { API_CONFIG } from '@/lib/api-config';

export interface Usage { appels: number; jetons_entree: number; jetons_sortie: number }

export interface PlatformOrg {
    id: string;
    nom: string;
    slug: string;
    statut: 'active' | 'suspendue';
    created_at: string;
    membres: number;
    membres_actifs: number;
    admins: { id: string; email: string | null; full_name: string | null; statut: string }[];
    consommation_mois: Usage;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(API_CONFIG.getFullUrl('/api/plateforme' + path), {
        ...init,
        headers: { 'Content-Type': 'application/json', ...((init.headers as Record<string, string>) || {}) },
    });
    if (!res.ok) {
        const detail = await res.json().then(d => d.detail).catch(() => null);
        throw new Error(detail || `Erreur ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export const platformApi = {
    list: () => call<{ organisations: PlatformOrg[]; hors_organisation_mois: Usage }>('/organisations'),
    create: (body: { nom: string; slug?: string; admin_nom: string; admin_email: string }) =>
        call<{ organisation: PlatformOrg; admin_id: string; lien: string; compte_existant: boolean }>(
            '/organisations', { method: 'POST', body: JSON.stringify(body) }),
    newAdminLink: (orgId: string, adminId: string) =>
        call<{ lien: string }>(`/organisations/${orgId}/lien`, { method: 'POST', body: JSON.stringify({ admin_id: adminId }) }),
    setStatus: (orgId: string, statut: 'active' | 'suspendue') =>
        call<{ organisation: PlatformOrg }>(`/organisations/${orgId}`, { method: 'PATCH', body: JSON.stringify({ statut }) }),
};

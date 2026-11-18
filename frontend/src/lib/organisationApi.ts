/**
 * Organisation de l'utilisateur connecté (ORGANISATIONS_ENABLED côté backend).
 * L'organisation est déduite du compte par le backend : aucun identifiant d'organisation
 * n'est jamais envoyé d'ici.
 */
import { API_CONFIG } from '@/lib/api-config';
import type { OrgRole } from '@/context/AuthContext';

export type MemberStatut = 'active' | 'invitee' | 'suspendue';

export interface OrgMember {
    id: string;
    email: string | null;
    full_name: string | null;
    display_name: string | null;
    job_title: string | null;
    department: string | null;
    role: OrgRole;
    statut: MemberStatut;
    created_at?: string;
}

export const ORG_ROLES: { id: OrgRole; label: string; hint: string }[] = [
    { id: 'lecteur', label: 'Lecteur', hint: 'Consulte le référentiel publié' },
    { id: 'contributeur', label: 'Contributeur', hint: 'Formalise, relit et valide ce qui lui est confié' },
    { id: 'pilote', label: 'Pilote', hint: 'Crée et pilote les campagnes' },
    { id: 'admin', label: 'Administrateur', hint: 'Comptes, équipes, rôles et paramètres de l’espace' },
];

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(API_CONFIG.getFullUrl('/api/organisation' + path), {
        ...init,
        headers: { 'Content-Type': 'application/json', ...((init.headers as Record<string, string>) || {}) },
    });
    if (!res.ok) {
        const detail = await res.json().then(d => d.detail).catch(() => null);
        throw new Error(detail || `Erreur ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export const organisationApi = {
    get: () => call<{ organisation: { id: string; nom: string; slug: string; statut: string }; my_role: OrgRole }>(''),
    members: () => call<{ members: OrgMember[] }>('/members').then(r => r.members),
    updateMember: (userId: string, body: { role?: OrgRole; statut?: MemberStatut }) =>
        call<{ member: OrgMember }>(`/members/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }).then(r => r.member),
};

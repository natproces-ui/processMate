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

export interface Team {
    id: string;
    nom: string;
    responsable_id: string | null;
    membres: string[];
    branches: string[];
}

export interface PendingInvitation { id: string; email: string; role: OrgRole; created_at: string }

export interface OpenTask { id: string; title: string; procedure_id: string; status: string; due_date?: string | null }

export const organisationApi = {
    get: () => call<{ organisation: { id: string; nom: string; slug: string; statut: string }; my_role: OrgRole }>(''),
    members: () => call<{ members: OrgMember[] }>('/members').then(r => r.members),
    updateMember: (userId: string, body: { role?: OrgRole; statut?: MemberStatut }) =>
        call<{ member: OrgMember }>(`/members/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }).then(r => r.member),
    /** Compte nouveau → lien à transmettre ; compte déjà inscrit → invitation qu'il doit accepter */
    createMember: (body: { email: string; full_name: string; role: OrgRole; job_title?: string; department?: string; equipes?: string[] }) =>
        call<{ invitation: boolean; id?: string; lien?: string; email?: string }>('/members', { method: 'POST', body: JSON.stringify(body) }),
    memberLink: (userId: string) => call<{ lien: string }>(`/members/${userId}/lien`, { method: 'POST' }).then(r => r.lien),
    removeMember: (userId: string) =>
        call<{ taches_a_reaffecter: OpenTask[] }>(`/members/${userId}`, { method: 'DELETE' }).then(r => r.taches_a_reaffecter),
    invitations: () => call<{ invitations: PendingInvitation[] }>('/invitations').then(r => r.invitations),
    cancelInvitation: (id: string) => call<{ success: boolean }>(`/invitations/${id}`, { method: 'DELETE' }),
    teams: () => call<{ equipes: Team[] }>('/equipes').then(r => r.equipes),
    createTeam: (body: Partial<Omit<Team, 'id'>>) =>
        call<{ equipe: Team }>('/equipes', { method: 'POST', body: JSON.stringify(body) }).then(r => r.equipe),
    updateTeam: (id: string, body: Partial<Omit<Team, 'id'>>) =>
        call<{ equipe: Team }>(`/equipes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then(r => r.equipe),
    deleteTeam: (id: string) => call<{ success: boolean }>(`/equipes/${id}`, { method: 'DELETE' }),
};

/** Invitations reçues par un compte libre (il doit les accepter) */
export const invitationsApi = {
    answer: async (id: string, accept: boolean) => {
        const res = await fetch(API_CONFIG.getFullUrl(`/api/invitations/${id}/${accept ? 'accepter' : 'refuser'}`), { method: 'POST' });
        if (!res.ok) {
            const detail = await res.json().then(d => d.detail).catch(() => null);
            throw new Error(detail || `Erreur ${res.status}`);
        }
    },
};

/** Circuit d'une procédure (soumettre, relire, valider) et propositions — clinic/routers/circuit_router.py */
import { API_CONFIG } from '@/lib/api-config';

export interface CircuitPerson { id: string; nom: string | null }

export interface CircuitContext {
    procedure_id: string;
    campagne: { id: string; title: string; status: string; echeance: string | null; emplacement_id: string; emplacement_statut: string } | null;
    raci: { R: CircuitPerson[]; A: CircuitPerson | null; C: CircuitPerson[]; I: CircuitPerson[] };
    mes_roles: ('R' | 'A' | 'C' | 'I')[];
    action: 'soumettre' | 'relire' | 'valider' | null;
    circuit: { etape?: string; soumise_par_nom?: string; soumise_le?: string; relue_par_nom?: string };
    validation: { nom: string; le: string; commentaire?: string; version?: number | null } | null;
}

export interface Proposition {
    id: string; titre: string; message: string | null; propose_par: string; propose_par_nom: string | null;
    statut: 'en_attente' | 'acceptee' | 'refusee'; decision: string | null; motif: string | null; created_at: string;
    campaign_id?: string | null;
    /** Endroit choisi par la personne qui propose (taxonomie, campagne) */
    cible?: { taxonomy_id: string | null; campaign_id: string | null; chemin: string; campagne: string | null } | null;
}

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

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const circuitApi = {
    context: (pid: string) => call<CircuitContext>(`/circuit/procedures/${pid}`),
    submit: (pid: string, message?: string) => call<CircuitContext>(`/circuit/procedures/${pid}/soumettre`, post({ message })),
    review: (pid: string, decision: 'transmettre' | 'renvoyer', message?: string) =>
        call<CircuitContext>(`/circuit/procedures/${pid}/relecture`, post({ decision, message })),
    validate: (pid: string, decision: 'valider' | 'renvoyer', message?: string) =>
        call<CircuitContext>(`/circuit/procedures/${pid}/validation`, post({ decision, message })),
    propose: (body: { titre: string; workflow_json: unknown[]; enrichments_json?: Record<string, unknown>; metadata?: Record<string, unknown>; message?: string }) =>
        call<{ proposition: { id: string } }>('/propositions', post(body)),
    propositions: () => call<{ propositions: Proposition[] }>('/propositions').then(r => r.propositions),
    treat: (id: string, body: { decision: 'campagne' | 'referentiel' | 'refuser'; campaign_id?: string; motif?: string }) =>
        call<{ statut: string; procedure_id?: string }>(`/propositions/${id}/traiter`, post(body)),
};

export const formatValidation = (v: { nom: string; le: string }) =>
    `Validée par ${v.nom} le ${new Date(v.le).toLocaleDateString('fr-FR')}`;

/**
 * Versions de procédure (lot 5). Actives si NEXT_PUBLIC_VERSIONS_ENABLED=true (et
 * VERSIONS_ENABLED côté backend). Une version est créée à chaque enregistrement ;
 * restaurer crée une nouvelle version, rien n'est détruit.
 */
import { API_CONFIG } from '@/lib/api-config';
import { getAuthHeaders } from '@/lib/authHeaders';
import type { Table1Row } from '@/logic/types';

export const VERSIONS_ENABLED = process.env.NEXT_PUBLIC_VERSIONS_ENABLED === 'true';

export interface VersionSummary {
    id: string; version: number; source: 'initial' | 'manuel' | 'ia' | 'restauration';
    author_id: string | null; created_at: string; steps: number;
}
export interface VersionDetail extends Omit<VersionSummary, 'steps'> {
    workflow_json: Table1Row[];
    enrichments_json: Record<string, unknown>;
    bpmn_xml: string | null;
    metadata: Record<string, unknown>;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(API_CONFIG.getFullUrl(`/api/procedures${path}`), {
        ...init, headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    });
    if (!res.ok) {
        const detail = await res.json().then(d => d.detail).catch(() => null);
        throw new Error(detail || `Erreur ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export const versionsApi = {
    list: (procedureId: string) => call<{ versions: VersionSummary[] }>(`/${procedureId}/versions`).then(r => r.versions),
    get: (procedureId: string, versionId: string) => call<{ version: VersionDetail }>(`/${procedureId}/versions/${versionId}`).then(r => r.version),
    restore: (procedureId: string, versionId: string) =>
        call<{ success: boolean }>(`/${procedureId}/versions/${versionId}/restore`, { method: 'POST' }),
};

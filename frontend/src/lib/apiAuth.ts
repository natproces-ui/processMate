/**
 * Ajoute automatiquement le jeton de session (et l'identifiant d'appareil) à TOUS les
 * appels vers le backend clinic, quelle que soit la manière dont ils sont écrits
 * (fetch direct, fetchJSON des modules lib/*Api.ts, flux SSE du chat…).
 *
 * Le backend refuse les appels sans jeton (manager/access_control.py, AUTH_MODE=enforce) :
 * un seul point d'installation évite d'oublier un appel parmi les dizaines existants.
 * Les requêtes vers d'autres domaines (Supabase, etc.) ne sont jamais modifiées.
 *
 * Un 401/403 du backend est signalé par l'événement « processmate:access-denied » pour
 * que l'interface puisse proposer de se reconnecter.
 */
import { API_CONFIG } from '@/lib/api-config';
import { getAuthHeaders } from '@/lib/authHeaders';

let installed = false;

function targetsBackend(url: string): boolean {
    const base = API_CONFIG.baseUrl.replace(/\/$/, '');
    return url === base || url.startsWith(base + '/');
}

export function installApiAuth(): void {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    const original = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!targetsBackend(url)) return original(input, init);

        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        const extra = await getAuthHeaders();
        for (const [name, value] of Object.entries(extra)) {
            if (!headers.has(name)) headers.set(name, value);
        }
        const response = await original(input, { ...init, headers });
        if (response.status === 401 || response.status === 403) {
            window.dispatchEvent(new CustomEvent('processmate:access-denied', {
                detail: { status: response.status, url },
            }));
        }
        return response;
    };
}

/**
 * En-têtes communs des appels au backend clinic.
 * - Authorization : jeton de la session Supabase (absent pour un invité).
 * - X-Device-Id : identifiant aléatoire gardé dans le navigateur, sert à compter les
 *   limites du mode invité (aucune donnée personnelle).
 */
import { supabase } from '@/lib/supabaseClient';

const DEVICE_KEY = 'processmate-device-id';
let memoryDeviceId: string | null = null;

export function getDeviceId(): string {
    try {
        let id = localStorage.getItem(DEVICE_KEY);
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem(DEVICE_KEY, id);
        }
        return id;
    } catch {
        // Navigation privée ou stockage bloqué : identifiant valable pour cet onglet
        memoryDeviceId ??= crypto.randomUUID();
        return memoryDeviceId;
    }
}

/**
 * Jeton de la session courante, tenu à jour par AuthContext (connexion, rafraîchissement,
 * déconnexion). On évite ainsi d'appeler supabase.auth.getSession() à chaque requête :
 * appelé pendant un rappel onAuthStateChange, il attend un verrou déjà tenu et la page
 * reste bloquée indéfiniment (piège documenté de supabase-js).
 * undefined = pas encore connu (premier rendu) ; null = invité.
 */
let currentToken: string | null | undefined;

export function setAccessToken(token: string | null): void {
    currentToken = token;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'X-Device-Id': getDeviceId() };
    let token = currentToken;
    if (token === undefined) {
        try {
            // Premier appel avant qu'AuthContext ait lu la session : lecture bornée à 3 s
            const session = await Promise.race([
                supabase.auth.getSession().then(r => r.data.session),
                new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
            ]);
            token = session?.access_token ?? null;
        } catch { token = null; }
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

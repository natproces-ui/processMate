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

export async function getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'X-Device-Id': getDeviceId() };
    try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) headers.Authorization = `Bearer ${token}`;
    } catch { /* invité */ }
    return headers;
}

/**
 * Fichiers de démo — bibliothèque partagée entre admins (bucket Supabase, préfixe demo/).
 * Seule API du backend qui vérifie l'appelant : on envoie le jeton Supabase de la session.
 */
import { API_CONFIG } from '@/lib/api-config';
import { supabase } from '@/lib/supabaseClient';

export interface DemoFile { name: string; size: number | null; updated_at: string | null }

const BASE = `${API_CONFIG.baseUrl}/api/demo-files`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function check(res: Response): Promise<Response> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `Erreur ${res.status}`);
  }
  return res;
}

export async function listDemoFiles(): Promise<DemoFile[]> {
  const res = await check(await fetch(BASE, { headers: await authHeaders() }));
  return (await res.json()).files;
}

/** Télécharge le fichier et le renvoie en File, prêt à être joint comme un dépôt manuel. */
export async function fetchDemoFile(name: string): Promise<File> {
  const res = await check(await fetch(`${BASE}/${encodeURIComponent(name)}`, { headers: await authHeaders() }));
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type });
}

export async function uploadDemoFile(file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  await check(await fetch(BASE, { method: 'POST', headers: await authHeaders(), body: form }));
}

export async function deleteDemoFile(name: string): Promise<void> {
  await check(await fetch(`${BASE}/${encodeURIComponent(name)}`, { method: 'DELETE', headers: await authHeaders() }));
}

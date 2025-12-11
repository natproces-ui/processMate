// Votre fichier api.ts corrigé

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

export const api = {
  async getRefs() {
    const res = await fetch(`${API_URL}/refs`);
    if (!res.ok) throw new Error('Failed to fetch refs');
    return res.json();
  },

  async generateFull() {
    const res = await fetch(`${API_URL}/generate/full`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to generate full JSON');
    const json = await res.json();
    // ✅ Backend retourne {count, data}, on extrait data
    return json.data || json;  // Fallback si pas de wrapper
  },

  async generateDeposant() {
    const res = await fetch(`${API_URL}/generate/deposant`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to generate deposant');
    return res.json();
  },

  // ✅ CORRECTION: Ajout du paramètre total
  async generateHeritier(index: number = 0, total: number = 4) {
    const res = await fetch(
      `${API_URL}/generate/heritier?index=${index}&total=${total}`,
      { method: 'POST' }
    );
    if (!res.ok) throw new Error('Failed to generate heritier');
    return res.json();
  },

  async generateRepresentantLegal() {
    const res = await fetch(`${API_URL}/generate/representant`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to generate representant legal');
    return res.json();
  },

  async generateCompte(deposantId?: string) {
    const url = deposantId
      ? `${API_URL}/generate/compte?deposant_id=${deposantId}`
      : `${API_URL}/generate/compte`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to generate compte');
    return res.json();
  },

  async validate(data: any) {
    const res = await fetch(`${API_URL}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Validation failed');
    return res.json();
  }
};
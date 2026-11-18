/**
 * Travail du mode invité, gardé uniquement dans ce navigateur (IndexedDB).
 * Rien n'est envoyé au serveur tant que la personne n'a pas de compte ; à la connexion,
 * elle peut reprendre ce travail dans son compte (/api/conversations/import).
 * Toutes les opérations échouent en silence (navigation privée, stockage bloqué) :
 * le chat fonctionne alors normalement, sans conservation.
 */

const DB_NAME = 'processmate-guest';
const STORE = 'kv';
export const GUEST_CONVERSATION_KEY = 'conversation';

export interface GuestConversation {
    savedAt: string;
    messages: { role: 'user' | 'assistant' | 'clarify'; content: string; payload: Record<string, unknown> }[];
}

function open(): Promise<IDBDatabase | null> {
    return new Promise(resolve => {
        try {
            if (typeof indexedDB === 'undefined') return resolve(null);
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
    const db = await open();
    if (!db) return null;
    return new Promise(resolve => {
        try {
            const req = fn(db.transaction(STORE, mode).objectStore(STORE));
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

export const guestStore = {
    get: (key: string) => run<GuestConversation>('readonly', s => s.get(key)),
    set: (key: string, value: GuestConversation) => run('readwrite', s => s.put(value, key)),
    remove: (key: string) => run('readwrite', s => s.delete(key)),
};

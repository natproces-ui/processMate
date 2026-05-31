// store/proceduresStore.ts
/**
 * Store Zustand global — Procédures ProcessMate
 *
 * Chargé une seule fois, accessible depuis stt ET orchestration.
 * Invalidation manuelle après toute mutation (create/update/delete).
 */

import { create } from 'zustand';
import { orchestrationApi, Procedure } from '@/lib/orchestrationApi';

interface ProceduresStore {
    // ─── State ──────────────────────────────────────────────
    procedures: Procedure[];
    loading: boolean;
    error: string | null;
    lastFetchedAt: number | null;   // timestamp ms — pour éviter refetch trop fréquent

    // ─── Actions ─────────────────────────────────────────────
    fetchProcedures: (force?: boolean) => Promise<void>;
    invalidate: () => void;
    upsertProcedure: (procedure: Procedure) => void;
    removeProcedure: (id: string) => void;
    updateProcedureStatus: (id: string, status: string) => void;
}

const STALE_MS = 5_000;
const POLL_MS = 30_000;  // slowed down — reduces noise when backend is slow
const MAX_POLL_ERRORS = 3;
let pollingInterval: NodeJS.Timeout | null = null;
let consecutiveErrors = 0;

export const useProceduresStore = create<ProceduresStore>((set, get) => ({
    procedures: [],
    loading: false,
    error: null,
    lastFetchedAt: null,

    fetchProcedures: async (force = false) => {
        const { loading, lastFetchedAt } = get();
        if (loading) return;

        if (!force && lastFetchedAt && Date.now() - lastFetchedAt < STALE_MS) return;

        set({ loading: true, error: null });
        try {
            const res = await orchestrationApi.listProcedures();
            consecutiveErrors = 0;
            set({
                procedures: res.procedures,
                loading: false,
                lastFetchedAt: Date.now(),
            });
            if (!pollingInterval) {
                pollingInterval = setInterval(() => {
                    get().fetchProcedures();
                }, POLL_MS);
            }
        } catch (e: any) {
            consecutiveErrors++;
            set({ error: e.message, loading: false });
            // Stop polling after repeated failures to avoid flooding a down backend
            if (consecutiveErrors >= MAX_POLL_ERRORS && pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
        }
    },

    invalidate: () => {
        // Force le prochain fetchProcedures à recharger depuis Supabase
        set({ lastFetchedAt: null });
        // Recharge immédiatement après mutation
        get().fetchProcedures(true);
    },

    upsertProcedure: (procedure) => {
        set(state => {
            const exists = state.procedures.find(p => p.id === procedure.id);
            return {
                procedures: exists
                    ? state.procedures.map(p => p.id === procedure.id ? procedure : p)
                    : [procedure, ...state.procedures],
            };
        });
    },

    removeProcedure: (id) => {
        set(state => ({ procedures: state.procedures.filter(p => p.id !== id) }));
    },

    updateProcedureStatus: (id, status) => {
        set(state => ({
            procedures: state.procedures.map(p =>
                p.id === id ? { ...p, status } : p
            ),
        }));
    },
}));
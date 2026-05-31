import { useState, useEffect, useCallback } from 'react';
import { orchestrationApi, Procedure, OrchestrationStats, ProcedureStatus } from '@/lib/orchestrationApi';

interface OrchestrationData {
  procedures: Procedure[];
  stats: OrchestrationStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  updateStatus: (id: string, status: ProcedureStatus) => Promise<void>;
}

export function useOrchestrationData(): OrchestrationData {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [stats, setStats] = useState<OrchestrationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [procRes, statsRes] = await Promise.all([
        orchestrationApi.listProcedures(),
        orchestrationApi.getStats(),
      ]);
      setProcedures(procRes.procedures);
      setStats(statsRes.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = useCallback(async (id: string, status: ProcedureStatus) => {
    await orchestrationApi.updateStatus(id, status);
    setProcedures(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    const statsRes = await orchestrationApi.getStats();
    setStats(statsRes.stats);
  }, []);

  return { procedures, stats, loading, error, refresh: load, updateStatus };
}

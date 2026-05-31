import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { orchestrationApi, Procedure } from '@/lib/orchestrationApi';

const BLOCKED_STATUSES = new Set(['Bloquée', 'Rejetée', 'Retours reçus']);

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

export default function BottleneckAnalysis() {
  const [blocked, setBlocked] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orchestrationApi.listProcedures()
      .then(res => setBlocked(res.procedures.filter(p => BLOCKED_STATUSES.has(p.status))))
      .catch(() => setBlocked([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-shadow">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          Blocages Identifiés
        </h3>
        {!loading && (
          <span className={`text-xs px-3 py-1 rounded-full font-semibold ${blocked.length > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {blocked.length} blocage{blocked.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Chargement...
        </div>
      ) : blocked.length === 0 ? (
        <div className="text-center py-8 text-green-600">
          <p className="text-2xl mb-1">✓</p>
          <p className="font-medium">Aucun blocage détecté</p>
          <p className="text-xs text-gray-400 mt-1">Toutes les procédures avancent normalement.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {blocked.map(proc => {
            const days = daysSince(proc.lastModified);
            const isHigh = proc.status === 'Bloquée' || proc.status === 'Rejetée';
            return (
              <div key={proc.id} className={`p-4 rounded-lg border-l-4 ${isHigh ? 'bg-red-50 border-red-500' : 'bg-yellow-50 border-yellow-500'}`}>
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{proc.nom}</p>
                    {proc.description && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{proc.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-sm font-semibold text-orange-600 shrink-0 ml-2">
                    <Clock className="w-4 h-4" />
                    {days}j
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isHigh ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {proc.status}
                  </span>
                  {proc.ref && <span className="text-xs text-gray-500 font-mono">{proc.ref}</span>}
                  {proc.category && <span className="text-xs text-gray-400">{proc.category}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

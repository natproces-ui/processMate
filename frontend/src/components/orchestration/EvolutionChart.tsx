import React, { useEffect, useState } from 'react';
import { TrendingUp, RefreshCw } from 'lucide-react';
import BarColumn from './BarColumn';
import { orchestrationApi } from '@/lib/orchestrationApi';

interface MonthData {
  month: string;
  validated: number;
  inProgress: number;
  pending: number;
}

export default function EvolutionChart() {
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orchestrationApi.getEvolution()
      .then(res => setData(res.evolution))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  const maxValue = Math.max(1, ...data.map(d => d.validated + d.inProgress + d.pending));
  const totalValidated = data.reduce((s, d) => s + d.validated, 0);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-slate-200 hover:shadow-xl transition-shadow">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Évolution sur 6 mois
        </h3>
        {!loading && totalValidated > 0 && (
          <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-semibold">
            {totalValidated} validée{totalValidated > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Chargement...
        </div>
      ) : data.every(d => d.validated === 0 && d.inProgress === 0 && d.pending === 0) ? (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          Aucune procédure sur les 6 derniers mois.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="h-48 flex items-end gap-2 bg-slate-50 p-4 rounded-lg">
            {data.map((item, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full h-36 flex items-end gap-0.5">
                  <BarColumn value={item.validated}  max={maxValue} color="from-green-500 to-green-400"  label={`Validées: ${item.validated}`} />
                  <BarColumn value={item.inProgress} max={maxValue} color="from-blue-500 to-blue-400"   label={`En cours: ${item.inProgress}`} />
                  <BarColumn value={item.pending}    max={maxValue} color="from-orange-500 to-orange-400" label={`En attente: ${item.pending}`} />
                </div>
                <span className="text-xs font-semibold text-slate-600">{item.month}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-6 text-xs">
            {[['from-green-500 to-green-400', 'Validées'], ['from-blue-500 to-blue-400', 'En cours'], ['from-orange-500 to-orange-400', 'En attente']].map(([color, label]) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 bg-gradient-to-r ${color} rounded`} />
                <span className="text-slate-600">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

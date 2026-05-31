import React from 'react';
import { AlertCircle, CheckCircle2, Clock, AlertTriangle, BarChart3, RefreshCw } from 'lucide-react';
import KPICard from './KPICard';
import EvolutionChart from './EvolutionChart';
import BottleneckAnalysis from './BottleneckAnalysis';
import TeamPerformance from './TeamPerformance';
import { useOrchestrationData } from '@/hooks/useOrchestrationData';

export default function Dashboard() {
  const { procedures, stats, loading, error, refresh } = useOrchestrationData();

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="text-center text-gray-500">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />
          <p>Chargement des procédures...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-red-800">Impossible de charger les procédures</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
          <button
            onClick={refresh}
            className="px-3 py-1.5 bg-red-100 text-red-800 rounded hover:bg-red-200 text-sm font-medium"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // Calcul catégories depuis les vraies procédures
  const byCategory = procedures.reduce<Record<string, { total: number; validated: number; inProgress: number; pending: number }>>(
    (acc, p) => {
      const cat = p.category || 'Non classé';
      if (!acc[cat]) acc[cat] = { total: 0, validated: 0, inProgress: 0, pending: 0 };
      acc[cat].total++;
      if (p.status === 'Validée') acc[cat].validated++;
      else if (p.status === 'En cours' || p.status === 'Brouillon') acc[cat].inProgress++;
      else acc[cat].pending++;
      return acc;
    },
    {}
  );

  const categoryRows = Object.entries(byCategory).slice(0, 4);

  // Actions prioritaires : procédures bloquées ou en retours reçus
  const priorityActions = procedures
    .filter((p) => ['Bloquée', 'Rejetée', 'Retours reçus'].includes(p.status))
    .slice(0, 3);

  return (
    <div className="p-8 space-y-8">
      {/* Header avec refresh */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{stats?.total ?? 0} procédure(s) au total</p>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
        >
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </button>
      </div>

      {/* KPIs réels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Procédures en Cours"
          value={String(stats?.en_cours ?? 0)}
          change={0}
          icon={Clock}
          color="from-blue-500 to-blue-600"
          bgIcon="bg-blue-100"
          iconColor="text-blue-600"
        />
        <KPICard
          title="En Validation"
          value={String(stats?.en_validation ?? 0)}
          change={0}
          icon={CheckCircle2}
          color="from-green-500 to-green-600"
          bgIcon="bg-green-100"
          iconColor="text-green-600"
        />
        <KPICard
          title="En Attente / Révision"
          value={String(stats?.en_revision ?? 0)}
          change={0}
          icon={AlertCircle}
          color="from-yellow-500 to-yellow-600"
          bgIcon="bg-yellow-100"
          iconColor="text-yellow-600"
        />
        <KPICard
          title="Bloquées / Rejetées"
          value={String(stats?.bloquees ?? 0)}
          change={0}
          icon={AlertTriangle}
          color="from-red-500 to-red-600"
          bgIcon="bg-red-100"
          iconColor="text-red-600"
          isAlert={(stats?.bloquees ?? 0) > 0}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <EvolutionChart />
        <BottleneckAnalysis />
      </div>

      {/* Performance & Catégories */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <TeamPerformance />

        {/* Statistiques par Domaine — données réelles */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-shadow">
          <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Procédures par Domaine
          </h3>
          {categoryRows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucune procédure trouvée</p>
          ) : (
            <div className="space-y-4">
              {categoryRows.map(([name, data], idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-700">{name}</span>
                    <span className="text-sm text-gray-500">{data.validated}/{data.total}</span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600"
                      style={{ width: `${data.total > 0 ? (data.validated / data.total) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-green-600">✓ {data.validated}</span>
                    <span className="text-blue-600">⟳ {data.inProgress}</span>
                    <span className="text-amber-600">⊘ {data.pending}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions Prioritaires — données réelles */}
      {priorityActions.length > 0 && (
        <div className="bg-blue-50 rounded-xl shadow-lg p-6 border-l-4 border-blue-600">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Actions Prioritaires</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {priorityActions.map((p) => (
              <div
                key={p.id}
                className={`p-4 rounded-lg border-l-4 ${
                  p.status === 'Bloquée' || p.status === 'Rejetée'
                    ? 'bg-red-50 border-red-500 text-red-900'
                    : 'bg-yellow-50 border-yellow-500 text-yellow-900'
                }`}
              >
                <p className="font-semibold text-sm">{p.nom}</p>
                <p className="text-xs mt-1 opacity-70">{p.ref || p.id}</p>
                <p className="text-xs mt-2">
                  {p.status === 'Bloquée' || p.status === 'Rejetée' ? '🔴 Urgente' : '🟡 En attente'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

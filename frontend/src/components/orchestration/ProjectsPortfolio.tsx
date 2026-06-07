'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, BarChart2, CheckCircle2, Clock, Download,
  Loader2, Megaphone, PauseCircle, RefreshCw, TrendingUp, XCircle,
} from 'lucide-react';
import { campaignsApi, type Campaign, CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_COLORS } from '@/lib/campaignsApi';

// ─── Helpers ──────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-blue-500' : pct > 0 ? 'bg-orange-400' : 'bg-gray-200';
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`h-2 rounded-full transition-all ${color}`}
        {...{ style: { width: `${Math.min(pct, 100)}%` } }} />
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const c = CAMPAIGN_STATUS_COLORS[status as keyof typeof CAMPAIGN_STATUS_COLORS] ?? { dot: 'bg-gray-400', bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {CAMPAIGN_STATUS_LABELS[status as keyof typeof CAMPAIGN_STATUS_LABELS] ?? status}
    </span>
  );
}

// ─── Carte KPI ────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-xs font-medium text-gray-600">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────

export default function ProjectsPortfolio() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await campaignsApi.list();
      setCampaigns(res.campaigns || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── KPIs agrégés ──────────────────────────────────────────
  const total      = campaigns.length;
  const active     = campaigns.filter(c => c.status === 'active').length;
  const blocked    = campaigns.filter(c => c.status === 'blocked').length;
  const completed  = campaigns.filter(c => c.status === 'completed').length;
  const onHold     = campaigns.filter(c => c.status === 'on_hold').length;
  const totalProcs = campaigns.reduce((s, c) => s + (c.stats?.total ?? 0), 0);
  const doneProcs  = campaigns.reduce((s, c) => s + (c.stats?.done ?? 0), 0);
  const avgPct     = total > 0
    ? Math.round(campaigns.reduce((s, c) => s + (c.stats?.progress_pct ?? 0), 0) / total)
    : 0;

  // Projets en retard
  const overdue = campaigns.filter(c =>
    c.status === 'active' && c.end_date && new Date(c.end_date) < new Date()
  );

  // ── Rapport global ────────────────────────────────────────
  const handleGlobalReport = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${BASE}/api/campaigns/portfolio/report`);
      if (!res.ok) throw new Error('Erreur lors de la génération du rapport portfolio');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio_projets_formalisation.docx`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return (
    <div className="h-full flex items-center justify-center gap-2 text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      <span className="text-sm">Chargement du portfolio…</span>
    </div>
  );

  if (error) return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <p className="text-red-500 text-sm">{error}</p>
      <button type="button" onClick={load} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">Réessayer</button>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-y-auto">

      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-900">Portfolio des Projets</h1>
          <p className="text-xs text-gray-400 mt-0.5">Vue globale — Administration uniquement</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={load} title="Actualiser"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button type="button" onClick={handleGlobalReport} disabled={downloading || campaigns.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Rapport global
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-5 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Projets actifs"    value={active}    icon={TrendingUp}   color="bg-blue-50 text-blue-600"   sub={`sur ${total} projets`} />
          <KpiCard label="Procédures total"  value={totalProcs} icon={BarChart2}   color="bg-indigo-50 text-indigo-600" sub={`${doneProcs} formalisées`} />
          <KpiCard label="Avancement moyen"  value={`${avgPct}%`} icon={CheckCircle2} color="bg-green-50 text-green-600" sub={`${completed} terminé(s)`} />
          <KpiCard label="Points d'attention" value={blocked + overdue.length} icon={AlertTriangle} color="bg-red-50 text-red-600" sub={`${blocked} bloqué(s) · ${overdue.length} en retard`} />
        </div>

        {/* Alertes */}
        {(blocked > 0 || overdue.length > 0 || onHold > 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">Points d&apos;attention</p>
            {overdue.map(c => (
              <div key={c.id} className="flex items-center gap-2 text-xs text-amber-900">
                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <strong>{c.title}</strong> — échéance dépassée ({new Date(c.end_date!).toLocaleDateString('fr-FR')}) · {c.stats.progress_pct}% avancement
              </div>
            ))}
            {campaigns.filter(c => c.status === 'blocked').map(c => (
              <div key={c.id} className="flex items-center gap-2 text-xs text-red-800">
                <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <strong>{c.title}</strong> — bloqué · {c.stats.total} procédures · {c.stats.progress_pct}% avancement
              </div>
            ))}
            {campaigns.filter(c => c.status === 'on_hold').map(c => (
              <div key={c.id} className="flex items-center gap-2 text-xs text-purple-800">
                <PauseCircle className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <strong>{c.title}</strong> — en pause
              </div>
            ))}
          </div>
        )}

        {/* Tableau de tous les projets */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-orange-500" />
            <h2 className="text-sm font-bold text-gray-800">Tous les projets ({total})</h2>
          </div>

          {campaigns.length === 0 ? (
            <div className="py-12 text-center text-gray-300">
              <Megaphone className="w-10 h-10 mx-auto mb-3" />
              <p className="text-sm">Aucun projet créé</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Projet</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Procédures</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Avancement</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Échéance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {campaigns
                    .slice()
                    .sort((a, b) => {
                      const order = { blocked: 0, on_hold: 1, active: 2, draft: 3, completed: 4, archived: 5 };
                      return (order[a.status as keyof typeof order] ?? 9) - (order[b.status as keyof typeof order] ?? 9);
                    })
                    .map(c => {
                      const isOverdueRow = c.status === 'active' && c.end_date && new Date(c.end_date) < new Date();
                      return (
                        <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${isOverdueRow ? 'bg-red-50/30' : ''}`}>
                          <td className="px-5 py-3.5">
                            <p className="font-medium text-gray-900">{c.title}</p>
                            {c.description && <p className="text-xs text-gray-400 truncate max-w-xs mt-0.5">{c.description}</p>}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <StatusDot status={c.status} />
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <p className="font-bold text-gray-900">{c.stats.total}</p>
                            <p className="text-[11px] text-gray-400">{c.stats.done} faites · {c.stats.pending} en att.</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <ProgressBar pct={c.stats.progress_pct} />
                              <span className="text-xs font-bold text-gray-700 shrink-0 w-8 text-right">{c.stats.progress_pct}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {c.end_date ? (
                              <span className={`text-xs font-medium ${isOverdueRow ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                {isOverdueRow && '⚠ '}
                                {new Date(c.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                              </span>
                            ) : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight, ClipboardList, Download, Info,
  Loader2, RefreshCw, Search, Upload, X,
} from 'lucide-react';
import {
  regulatoryImpactApi,
  type AnalysisLogEntry,
  type ImpactStatus,
  type RegulatoryCampaign,
  type RegulatoryImpact,
  type RegulatoryProcedureCandidate,
} from '@/lib/regulatoryImpactApi';
import { ImpactsList } from '@/components/regulatory-impact/ImpactsList';
import { ImpactDetail } from '@/components/regulatory-impact/ImpactDetail';



export default function RegulatoryImpactWorkspace() {
  const [campaigns, setCampaigns] = useState<RegulatoryCampaign[]>([]);
  const [procedures, setProcedures] = useState<RegulatoryProcedureCandidate[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<RegulatoryCampaign | null>(null);
  const [selectedProcedures, setSelectedProcedures] = useState<string[]>([]);
  const [selectedImpact, setSelectedImpact] = useState<RegulatoryImpact | null>(null);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('Nouvelle campagne');
  const [lawText, setLawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'impacts' | 'log'>('impacts');
  const [showCampaigns, setShowCampaigns] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);

  const impacts = useMemo(() => activeCampaign?.impacts || [], [activeCampaign?.impacts]);
  const lastAnalysis = (activeCampaign?.metadata as any)?.last_analysis;
  const analysisLog: AnalysisLogEntry[] = lastAnalysis?.analysis_log || [];
  const analysisSummary = lastAnalysis?.summary;
  const analysisQuestions = lastAnalysis?.open_questions || [];

  const stats = useMemo(() => ({
    total: impacts.length,
    validated: impacts.filter(i => i.status === 'validated').length,
    blocked: impacts.filter(i => i.external_dependency).length,
    critical: impacts.filter(i => ['high', 'critical'].includes(i.criticality)).length,
  }), [impacts]);

  const filteredProcedures = useMemo(() => {
    const n = query.trim().toLowerCase();
    if (!n) return procedures;
    return procedures.filter(p =>
      [p.nom, p.ref, p.category, p.description].filter(Boolean).some(v => String(v).toLowerCase().includes(n))
    );
  }, [procedures, query]);

  const sourceLabel = activeCampaign?.source_filename || (activeCampaign?.law_text ? `Texte (${activeCampaign.law_text.length} car.)` : null);
  const sourceReady = activeCampaign?.status === 'ready' || activeCampaign?.status === 'analyzed';

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [cR, pR] = await Promise.all([regulatoryImpactApi.listCampaigns(), regulatoryImpactApi.listProcedures()]);
      setCampaigns(cR.campaigns); setProcedures(pR.procedures);
      if (!activeCampaign && cR.campaigns[0]) {
        const d = await regulatoryImpactApi.getCampaign(cR.campaigns[0].id);
        setActiveCampaign(d.campaign);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  }, [activeCampaign]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  const openCampaign = async (c: RegulatoryCampaign) => {
    setLoading(true); setSelectedImpact(null);
    try { const d = await regulatoryImpactApi.getCampaign(c.id); setActiveCampaign(d.campaign); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  };

  const createCampaign = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const cr = await regulatoryImpactApi.createCampaign({ title, law_text: lawText, source_type: 'text' });
      setCampaigns(prev => [cr.campaign, ...prev]);
      const d = await regulatoryImpactApi.getCampaign(cr.campaign.id);
      setActiveCampaign(d.campaign); setLawText('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  };

  const saveText = async () => {
    if (!activeCampaign || !lawText.trim()) return;
    setLoading(true);
    try {
      await regulatoryImpactApi.updateSourceText(activeCampaign.id, lawText);
      const d = await regulatoryImpactApi.getCampaign(activeCampaign.id);
      setActiveCampaign(d.campaign); setLawText('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  };

  const uploadFile = async (file?: File) => {
    if (!activeCampaign || !file) return;
    setLoading(true);
    try {
      await regulatoryImpactApi.uploadSourceFile(activeCampaign.id, file);
      const d = await regulatoryImpactApi.getCampaign(activeCampaign.id);
      setActiveCampaign(d.campaign);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur upload'); }
    finally { setLoading(false); }
  };

  const analyze = async () => {
    if (!activeCampaign || selectedProcedures.length === 0 || !sourceReady) return;
    setAnalyzing(true); setSelectedImpact(null); setConfigOpen(false);
    try {
      await regulatoryImpactApi.analyzeCampaign(activeCampaign.id, selectedProcedures);
      const d = await regulatoryImpactApi.getCampaign(activeCampaign.id);
      setActiveCampaign(d.campaign);
      const first = (d.campaign.impacts || [])[0];
      if (first) setSelectedImpact(first);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur analyse'); }
    finally { setAnalyzing(false); }
  };

  const reviewImpact = async (impact: RegulatoryImpact, status: ImpactStatus) => {
    await regulatoryImpactApi.reviewImpact(impact.id, { status });
    if (!activeCampaign) return;
    const d = await regulatoryImpactApi.getCampaign(activeCampaign.id);
    setActiveCampaign(d.campaign);
    setSelectedImpact((d.campaign.impacts || []).find(i => i.id === impact.id) || null);
  };

  const [exporting, setExporting] = useState(false);

  const exportExcel = async () => {
    if (!activeCampaign) return;
    setExporting(true);
    try {
      const safeTitle = activeCampaign.title
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'analyse';
      await regulatoryImpactApi.exportExcel(activeCampaign.id, `${safeTitle}_analyse_impact.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur export Excel');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50">

      {/* Topbar */}
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" title="Campagnes" onClick={() => setShowCampaigns(v => !v)} className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-100">
            <ClipboardList className="h-4 w-4" />
          </button>
          <span className="text-sm font-bold text-slate-900">Analyse d&apos;impact IA</span>
          {activeCampaign && <span className="hidden sm:inline text-xs text-slate-400 truncate">· {activeCampaign.title}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={exportExcel} disabled={!activeCampaign || impacts.length === 0 || exporting} className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-medium hover:bg-slate-50 disabled:opacity-40">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Excel
          </button>
          <button type="button" title="Actualiser" onClick={load} className="h-8 inline-flex items-center rounded border border-slate-300 bg-white px-2.5 text-xs hover:bg-slate-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 flex items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-1.5 text-xs text-red-700">
          <span className="flex-1 truncate">{error}</span>
          <button type="button" title="Fermer" onClick={() => setError(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Layout 3 colonnes */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* COL 1 — Campagnes */}
        {showCampaigns && (
          <aside className="hidden sm:flex w-52 xl:w-60 shrink-0 flex-col border-r border-slate-200 bg-white overflow-hidden">
            <div className="shrink-0 border-b border-slate-100 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nouvelle</p>
              <input value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-blue-500" placeholder="Titre..." />
              <button type="button" onClick={createCampaign} disabled={loading || !title.trim()} className="w-full rounded border border-blue-200 bg-blue-50 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                Créer
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <p className="px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Campagnes</p>
              <div className="space-y-0.5">
                {campaigns.map(c => (
                  <button key={c.id} type="button" onClick={() => openCampaign(c)} className={`w-full rounded-lg px-2 py-2 text-left transition-colors ${activeCampaign?.id === c.id ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100'}`}>
                    <div className="truncate text-xs font-semibold">{c.title}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{c.status}</div>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* COL 2 — Impacts */}
        <div
          className="flex min-w-0 flex-col overflow-hidden border-r border-slate-200"
          style={{ width: selectedImpact ? '320px' : undefined, flex: selectedImpact ? '0 0 320px' : '1 1 0' }}
        >
          {/* Stats compactes */}
          <div className="shrink-0 grid grid-cols-4 border-b border-slate-200 bg-white">
            {[
              { label: 'Impacts', value: stats.total },
              { label: 'Validés', value: stats.validated },
              { label: 'Dépend.', value: stats.blocked },
              { label: 'Priorit.', value: stats.critical },
            ].map((s, i) => (
              <div key={i} className={`px-3 py-2 ${i < 3 ? 'border-r border-slate-100' : ''}`}>
                <div className="text-xs text-slate-400">{s.label}</div>
                <div className="text-base font-bold text-slate-900">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Config collapsible */}
          <div className="shrink-0 border-b border-slate-200 bg-white">
            <div role="button" tabIndex={0} onClick={() => setConfigOpen(v => !v)} onKeyDown={e => e.key === 'Enter' && setConfigOpen(v => !v)} className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition-colors cursor-pointer select-none">
              <div className="flex items-center gap-1.5 min-w-0">
                <Upload className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="font-medium text-slate-600">Source &amp; Procédures</span>
                {sourceLabel && (
                  <span className={`rounded px-1.5 py-0.5 text-xs truncate max-w-20 ${sourceReady ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {sourceLabel}
                  </span>
                )}
                {selectedProcedures.length > 0 && (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 shrink-0">{selectedProcedures.length}p</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); void analyze(); }}
                  disabled={!activeCampaign || selectedProcedures.length === 0 || analyzing || !sourceReady}
                  className="inline-flex h-6 items-center gap-1 rounded bg-slate-900 px-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
                  Analyser
                </button>
                <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${configOpen ? 'rotate-90' : ''}`} />
              </div>
            </div>

            {configOpen && (
              <div className="border-t border-slate-100 px-3 pb-3 pt-2 space-y-2.5">
                <div className="flex gap-2">
                  <textarea
                    value={lawText}
                    onChange={e => setLawText(e.target.value)}
                    placeholder="Coller le texte réglementaire... (optionnel si PDF)"
                    rows={3}
                    className="flex-1 rounded border border-slate-300 px-2.5 py-2 text-xs outline-none focus:border-blue-500 resize-none"
                  />
                  <div className="flex flex-col gap-1.5">
                    <button type="button" onClick={saveText} disabled={!activeCampaign || !lawText.trim()} className="rounded border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50">Sauver</button>
                    <label className="inline-flex cursor-pointer items-center justify-center gap-1 rounded border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50">
                      <Upload className="h-3 w-3" />PDF
                      <input type="file" accept="application/pdf,text/plain" onChange={e => uploadFile(e.target.files?.[0])} className="hidden" />
                    </label>
                  </div>
                </div>
                {activeCampaign && (
                  <div className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-xs ${sourceReady ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                    <Info className="h-3 w-3 shrink-0" />
                    {sourceLabel ? `Source : ${sourceLabel}` : 'Aucune source chargée'}
                  </div>
                )}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Procédures ({selectedProcedures.length} sél.)</span>
                    <div className="flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5">
                      <Search className="h-3 w-3 text-slate-400" />
                      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filtrer..." className="w-20 text-xs outline-none bg-transparent" />
                    </div>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {filteredProcedures.map(proc => (
                      <label key={proc.id} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 px-2 py-1.5 hover:border-blue-300 hover:bg-blue-50">
                        <input type="checkbox" checked={selectedProcedures.includes(proc.id)} onChange={() => setSelectedProcedures(prev => prev.includes(proc.id) ? prev.filter(id => id !== proc.id) : [...prev, proc.id])} className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-slate-800">{proc.nom}</span>
                          <span className="block truncate text-xs text-slate-400">{proc.ref || proc.category}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Liste impacts — flex-1 pour prendre tout l'espace restant */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ImpactsList
              impacts={impacts}
              selectedImpact={selectedImpact}
              onSelect={impact => setSelectedImpact(prev => prev?.id === impact.id ? null : impact)}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              analysisLog={analysisLog}
              analysisSummary={analysisSummary}
              analysisQuestions={analysisQuestions}
              lastAnalysis={lastAnalysis}
              campaign={activeCampaign}
              analyzing={analyzing}
            />
          </div>
        </div>

        {/* COL 3 — Détail impact, prend tout l'espace restant en hauteur */}
        {selectedImpact && (
          <div className="flex-1 min-w-0 overflow-hidden">
            <ImpactDetail
              impact={selectedImpact}
              onReview={reviewImpact}
              onClose={() => setSelectedImpact(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
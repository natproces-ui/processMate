// components/analysis/AnalysisWorkspace.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { MessageSquare, Plus, RefreshCw, Trash2, X } from 'lucide-react';

const TaxonomyProcedureSelector = dynamic(() => import('@/components/orchestration/TaxonomyProcedureSelector'), { ssr: false });
import { analysisApi, type AnalysisArtifact, type AnalysisMessage, type AnalysisSession } from '@/lib/analysisApi';
import { regulatoryImpactApi } from '@/lib/regulatoryImpactApi';
import type { ProcedureCandidate } from '@/lib/analysisApi';
import type { TaskActor } from '@/lib/orchestrationTasksApi';
import { AnalysisChatPanel } from '@/components/analysis/AnalysisChatPanel';
import { ArtifactDetail } from '@/components/analysis/ArtifactDetail';

interface Props {
  actors?: TaskActor[];
  currentActor?: TaskActor | null;
}

export default function AnalysisWorkspace({ actors = [], currentActor = null }: Props) {
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [activeSession, setActiveSession] = useState<AnalysisSession | null>(null);
  const [procedures, setProcedures] = useState<ProcedureCandidate[]>([]);
  const [selectedProcedures, setSelectedProcedures] = useState<string[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<AnalysisArtifact | null>(null);
  const [sessionArtifacts, setSessionArtifacts] = useState<AnalysisArtifact[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [procQuery, setProcQuery] = useState('');
  const [showProcedures, setShowProcedures] = useState(false);

  const filteredProcedures = useMemo(() => {
    const n = procQuery.trim().toLowerCase();
    if (!n) return procedures;
    return procedures.filter(p =>
      [p.nom, p.ref, p.category].filter(Boolean).some(v => String(v).toLowerCase().includes(n))
    );
  }, [procedures, procQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.all([
        analysisApi.listSessions(),
        regulatoryImpactApi.listProcedures(),
      ]);
      setSessions(sRes.sessions);
      setProcedures(pRes.procedures);
      if (!activeSession && sRes.sessions[0]) {
        setActiveSession(sRes.sessions[0]);
        setSelectedProcedures(sRes.sessions[0].procedure_ids || []);
        loadArtifacts(sRes.sessions[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [activeSession]);

  const loadArtifacts = async (sessionId: string): Promise<AnalysisArtifact[]> => {
    try {
      const res = await analysisApi.listArtifacts(sessionId);
      setSessionArtifacts(res.artifacts);
      return res.artifacts;
    } catch { return []; }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const createSession = async () => {
    const title = newTitle.trim() || 'Nouvelle analyse';
    setLoading(true);
    try {
      const res = await analysisApi.createSession(title, selectedProcedures);
      setSessions(prev => [res.session, ...prev]);
      setActiveSession(res.session);
      setSessionArtifacts([]);
      setSelectedArtifact(null);
      setNewTitle('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const openSession = async (s: AnalysisSession) => {
    setActiveSession(s);
    setSelectedProcedures(s.procedure_ids || []);
    setSelectedArtifact(null);
    const artifacts = await loadArtifacts(s.id);
    if (artifacts.length > 0) {
      // Charger le détail complet du dernier artifact (analysis_json inclus)
      try {
        const detail = await analysisApi.getArtifact(artifacts[0].id);
        setSelectedArtifact(detail.artifact);
      } catch { setSelectedArtifact(artifacts[0]); }
    }
  };

  const deleteSession = async (s: AnalysisSession, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Supprimer "${s.title}" ?`)) return;
    await analysisApi.deleteSession(s.id);
    setSessions(prev => prev.filter(x => x.id !== s.id));
    if (activeSession?.id === s.id) { setActiveSession(null); setSelectedArtifact(null); }
  };

  const toggleProcedure = (id: string) => {
    setSelectedProcedures(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (activeSession) {
        analysisApi.updateSession(activeSession.id, { procedure_ids: next }).catch(() => { });
      }
      return next;
    });
  };

  const handleArtifactCreated = (artifact: AnalysisArtifact) => {
    setSessionArtifacts(prev => [artifact, ...prev]);
    setSelectedArtifact(artifact);
    setSessions(prev => prev.map(s =>
      s.id === activeSession?.id ? { ...s, artifact_count: (s.artifact_count || 0) + 1, updated_at: new Date().toISOString() } : s
    ));
  };

  const handleMessageAdded = (_msg: AnalysisMessage) => {
    if (activeSession) {
      setSessions(prev => prev.map(s =>
        s.id === activeSession.id ? { ...s, updated_at: new Date().toISOString() } : s
      ));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50">

      {/* Topbar */}
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="text-sm font-bold text-slate-900">Analyse IA</span>
          {activeSession && <span className="hidden sm:inline text-xs text-slate-400 truncate">· {activeSession.title}</span>}
        </div>
        <button type="button" onClick={load} className="h-8 inline-flex items-center rounded border border-slate-300 bg-white px-2.5 text-xs hover:bg-slate-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="shrink-0 flex items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-1.5 text-xs text-red-700">
          <span className="flex-1 truncate">{error}</span>
          <button type="button" onClick={() => setError(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Layout 3 colonnes */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* COL 1 — Sessions + procédures */}
        <aside className="hidden sm:flex w-56 xl:w-64 shrink-0 flex-col border-r border-slate-200 bg-white overflow-hidden">

          {/* Nouvelle session */}
          <div className="shrink-0 border-b border-slate-100 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nouvelle session</p>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createSession()}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
              placeholder="Titre de l'analyse..."
            />
            <button
              type="button"
              onClick={createSession}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 rounded border border-blue-200 bg-blue-50 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />Créer
            </button>
          </div>

          {/* Sessions */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-2 space-y-0.5">
              <p className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Sessions</p>
              {sessions.length === 0 && (
                <p className="px-2 py-3 text-xs text-slate-400 text-center">Aucune session</p>
              )}
              {sessions.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openSession(s)}
                  className={`group w-full flex items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors ${activeSession?.id === s.id ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs font-semibold">{s.title}</div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {s.artifact_count || 0} résultat{(s.artifact_count || 0) > 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={e => deleteSession(s, e)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </button>
              ))}
            </div>

            {/* Procédures */}
            <div className="border-t border-slate-100 p-2">
              <button
                type="button"
                onClick={() => setShowProcedures(v => !v)}
                className="flex w-full items-center justify-between px-1 py-1"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Procédures ({selectedProcedures.length} sél.)
                </p>
                <span className="text-xs text-slate-400">{showProcedures ? '▲' : '▼'}</span>
              </button>

              {showProcedures && (
                <div className="mt-1">
                  <TaxonomyProcedureSelector
                    procedures={procedures}
                    selected={selectedProcedures}
                    onChange={setSelectedProcedures}
                    maxHeight="250px"
                  />
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* COL 2 — Chat */}
        <div
          className="flex min-w-0 flex-col overflow-hidden border-r border-slate-200"
          style={{ width: selectedArtifact ? '380px' : undefined, flex: selectedArtifact ? '0 0 380px' : '1 1 0' }}
        >
          {activeSession ? (
            <>
              {/* Artifacts de la session */}
              {sessionArtifacts.length > 0 && (
                <div className="shrink-0 border-b border-slate-200 bg-white">
                  <div className="flex gap-1 overflow-x-auto px-3 py-2">
                    {sessionArtifacts.map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={async () => {
                          if (selectedArtifact?.id === a.id) { setSelectedArtifact(null); return; }
                          try {
                            const detail = await analysisApi.getArtifact(a.id);
                            setSelectedArtifact(detail.artifact);
                          } catch { setSelectedArtifact(a); }
                        }}
                        className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${selectedArtifact?.id === a.id
                          ? 'border-blue-400 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                      >
                        {a.intent_label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-hidden">
                <AnalysisChatPanel
                  session={activeSession}
                  procedures={procedures}
                  selectedProcedures={selectedProcedures}
                  onArtifactCreated={handleArtifactCreated}
                  onMessageAdded={handleMessageAdded}
                />
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400 p-8">
              <MessageSquare className="h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-500 text-center">
                Créez une session ou sélectionnez-en une existante pour commencer
              </p>
              <button
                type="button"
                onClick={createSession}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />Nouvelle session
              </button>
            </div>
          )}
        </div>

        {/* COL 3 — Détail artifact */}
        {selectedArtifact && (
          <div className="flex-1 min-w-0 overflow-y-auto">
            <ArtifactDetail
              artifact={selectedArtifact}
              actors={actors}
              currentActor={currentActor}
              onClose={() => setSelectedArtifact(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useCallback, useRef, useState, useMemo } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Download, FileText,
  Loader2, Upload, X, RotateCcw, Eye, EyeOff, Filter,
} from 'lucide-react';
import {
  correctionsApi,
  type CorrectionsSession, type Remark, type RemarkStatus, type RemarkType,
  REMARK_TYPE_LABELS, REMARK_TYPE_COLORS, CRITICITE_COLORS, STATUS_LABELS, STATUS_COLORS,
} from '@/lib/correctionsApi';

// ─── Types locaux ─────────────────────────────────────────────

type FilterStatus = 'all' | RemarkStatus;
type FilterType   = 'all' | RemarkType;

// ─── Badge type d'annotation ──────────────────────────────────

function TypeBadge({ type }: { type: RemarkType }) {
  const c = REMARK_TYPE_COLORS[type] ?? REMARK_TYPE_COLORS.commentaire;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      {REMARK_TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ─── Carte d'une remarque (sidebar gauche) ────────────────────

function RemarkCard({
  remark, selected, onClick,
}: {
  remark: Remark;
  selected: boolean;
  onClick: () => void;
}) {
  const crit = CRITICITE_COLORS[remark.criticite] ?? CRITICITE_COLORS.moyenne;
  const dim = remark.status === 'ignored';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all mb-1.5 ${
        selected
          ? 'border-blue-400 bg-blue-50 shadow-sm'
          : 'border-gray-100 bg-white hover:border-gray-300 hover:bg-gray-50'
      } ${dim ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-gray-400 shrink-0">P.{remark.page}</span>
          <TypeBadge type={remark.type} />
        </div>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${crit.badge} shrink-0`}>
          {remark.criticite.toUpperCase()}
        </span>
      </div>
      <p className="text-xs text-gray-700 line-clamp-2 leading-snug">
        {remark.texte_concerne || remark.zone || '—'}
      </p>
      {remark.status !== 'pending' && (
        <span className={`mt-1.5 inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[remark.status]}`}>
          {STATUS_LABELS[remark.status]}
        </span>
      )}
    </button>
  );
}

// ─── Panel de suggestion (sidebar droite) ─────────────────────

function SuggestionPanel({
  remark, sessionId, onStatusChange,
}: {
  remark: Remark | null;
  sessionId: string;
  onStatusChange: (id: string, status: RemarkStatus) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleStatus = async (status: RemarkStatus) => {
    if (!remark) return;
    setLoading(true);
    try {
      await correctionsApi.updateRemarkStatus(sessionId, remark.id, status);
      onStatusChange(remark.id, status);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  if (!remark) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-300 p-6">
        <ChevronRight className="w-8 h-8" />
        <p className="text-sm text-center">Sélectionnez une remarque pour voir la suggestion de correction</p>
      </div>
    );
  }

  const crit = CRITICITE_COLORS[remark.criticite];

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
      {/* En-tête */}
      <div className="shrink-0">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <TypeBadge type={remark.type} />
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${crit.badge}`}>
            Criticité {remark.criticite}
          </span>
          <span className="ml-auto text-xs text-gray-400">Page {remark.page}</span>
        </div>
        {remark.zone && (
          <p className="text-[11px] text-gray-400 italic">Zone : {remark.zone}</p>
        )}
      </div>

      {/* Texte concerné */}
      <div className="shrink-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Texte concerné</p>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-800 leading-relaxed">
            {remark.texte_concerne || remark.zone || '—'}
          </p>
        </div>
      </div>

      {/* Interprétation */}
      <div className="shrink-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Remarque de l&apos;annotateur</p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-700 leading-relaxed">{remark.interpretation || '—'}</p>
        </div>
      </div>

      {/* Suggestion IA */}
      <div className="flex-1">
        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1.5">
          Suggestion de correction (IA)
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
          <p className="text-xs text-gray-800 leading-relaxed">{remark.suggestion || '—'}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex flex-col gap-2 pt-2 border-t border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Statut actuel :
          <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] ${STATUS_COLORS[remark.status]}`}>
            {STATUS_LABELS[remark.status]}
          </span>
        </p>
        <div className="flex gap-2">
          {remark.status !== 'treated' && (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleStatus('treated')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Marquer traité
            </button>
          )}
          {remark.status !== 'ignored' && (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleStatus('ignored')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 text-gray-500 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />}
              Ignorer
            </button>
          )}
          {remark.status !== 'pending' && (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleStatus('pending')}
              title="Remettre en attente"
              className="p-2 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Zone d'upload ────────────────────────────────────────────

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type === 'application/pdf') onFile(file);
  }, [onFile]);

  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`w-full max-w-md border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-all ${
          drag ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
        }`}
      >
        <div className={`p-4 rounded-full ${drag ? 'bg-blue-100' : 'bg-gray-100'}`}>
          <Upload className={`w-8 h-8 ${drag ? 'text-blue-600' : 'text-gray-400'}`} />
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-800 text-sm">Glisser-déposer un PDF</p>
          <p className="text-xs text-gray-400 mt-1">ou cliquer pour sélectionner un fichier</p>
          <p className="text-[11px] text-gray-300 mt-3">PDF uniquement · Max 30 Mo</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        title="Sélectionner un fichier PDF"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────

export default function CorrectionsPanel() {
  const [session, setSession] = useState<CorrectionsSession | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [downloading, setDownloading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Upload + analyse
  const handleFile = useCallback(async (file: File) => {
    setAnalyzing(true);
    setError(null);
    setSession(null);
    setSelectedId(null);
    setCurrentPage(1);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    const url = URL.createObjectURL(file);
    setPdfUrl(url);

    try {
      const result = await correctionsApi.analyze(file);
      setSession(result);
      if (result.remarks.length > 0) setSelectedId(result.remarks[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'analyse');
      setPdfUrl(null);
    } finally {
      setAnalyzing(false);
    }
  }, [pdfUrl]);

  // Mise à jour statut d'une remarque localement
  const handleStatusChange = useCallback((id: string, status: RemarkStatus) => {
    setSession(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        remarks: prev.remarks.map(r => r.id === id ? { ...r, status } : r),
      };
    });
  }, []);

  // Navigation vers page PDF
  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
    if (iframeRef.current && pdfUrl) {
      iframeRef.current.src = `${pdfUrl}#page=${page}`;
    }
  }, [pdfUrl]);

  // Sélection d'une remarque
  const selectRemark = useCallback((remark: Remark) => {
    setSelectedId(remark.id);
    goToPage(remark.page);
  }, [goToPage]);

  const handleDownload = async () => {
    if (!session) return;
    setDownloading(true);
    try { await correctionsApi.downloadReport(session.session_id, session.document_title); }
    catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
    finally { setDownloading(false); }
  };

  const reset = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setSession(null); setPdfUrl(null); setError(null);
    setSelectedId(null); setCurrentPage(1);
  };

  // Remarques filtrées
  const filteredRemarks = useMemo(() => {
    if (!session) return [];
    return session.remarks.filter(r => {
      const okStatus = filterStatus === 'all' || r.status === filterStatus;
      const okType   = filterType   === 'all' || r.type   === filterType;
      return okStatus && okType;
    });
  }, [session, filterStatus, filterType]);

  const selectedRemark = session?.remarks.find(r => r.id === selectedId) ?? null;

  const stats = useMemo(() => {
    if (!session) return null;
    const total   = session.remarks.length;
    const treated = session.remarks.filter(r => r.status === 'treated').length;
    const pending = session.remarks.filter(r => r.status === 'pending').length;
    const haute   = session.remarks.filter(r => r.criticite === 'haute').length;
    return { total, treated, pending, haute };
  }, [session]);

  // ── Écran d'analyse en cours ────────────────────────────────
  if (analyzing) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-gray-500">
        <div className="relative">
          <FileText className="w-12 h-12 text-blue-200" />
          <Loader2 className="w-5 h-5 animate-spin text-blue-500 absolute -bottom-1 -right-1" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-700 text-sm">Analyse en cours…</p>
          <p className="text-xs text-gray-400 mt-1">Gemini examine les annotations du document</p>
          <p className="text-[11px] text-gray-300 mt-2">Cela peut prendre 20 à 60 secondes</p>
        </div>
      </div>
    );
  }

  // ── Écran d'erreur ──────────────────────────────────────────
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
        <AlertTriangle className="w-10 h-10 text-red-400" />
        <div className="text-center">
          <p className="font-semibold text-red-600 text-sm">{error}</p>
        </div>
        <button type="button" onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">
          Réessayer
        </button>
      </div>
    );
  }

  // ── Écran d'upload (pas encore de session) ──────────────────
  if (!session || !pdfUrl) {
    return (
      <div className="h-full flex flex-col">
        <div className="shrink-0 px-5 py-3 border-b border-gray-100 bg-white">
          <h2 className="text-sm font-bold text-gray-900">Corrections & Révisions</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Uploadez un PDF annoté — l&apos;IA détecte les surlignements, manuscrits, ratures et annotations
          </p>
        </div>
        <UploadZone onFile={handleFile} />
      </div>
    );
  }

  // ── Layout 3 colonnes ───────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-white">

      {/* Top bar */}
      <div className="shrink-0 px-4 py-2.5 border-b border-gray-100 bg-white flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{session.document_title}</p>
          <p className="text-[11px] text-gray-400">
            {stats?.total} remarque(s) · {stats?.treated} traitée(s) · {stats?.pending} en attente
            {stats?.haute ? ` · ${stats.haute} critique(s)` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={handleDownload} disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-50 disabled:opacity-50">
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Rapport
          </button>
          <button type="button" onClick={reset} title="Nouveau document"
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Synthèse */}
      {session.synthese && (
        <div className="shrink-0 px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-800">
          <span className="font-semibold">Synthèse :</span> {session.synthese}
        </div>
      )}

      {/* Corps 3 colonnes */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Colonne gauche : remarques ─────────────────────── */}
        <div className="w-[260px] shrink-0 flex flex-col border-r border-gray-100 bg-gray-50">

          {/* Filtres */}
          <div className="shrink-0 p-2.5 border-b border-gray-100 bg-white flex gap-1.5 flex-wrap">
            <select
              title="Filtrer par statut"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as FilterStatus)}
              className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
            >
              <option value="all">Tous statuts</option>
              <option value="pending">En attente</option>
              <option value="treated">Traités</option>
              <option value="ignored">Ignorés</option>
            </select>
            <select
              title="Filtrer par type"
              value={filterType}
              onChange={e => setFilterType(e.target.value as FilterType)}
              className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
            >
              <option value="all">Tous types</option>
              <option value="surlignement">Surlignement</option>
              <option value="manuscrit">Manuscrit</option>
              <option value="rature">Rature</option>
              <option value="soulignement">Soulignement</option>
              <option value="encadrement">Encadrement</option>
              <option value="diagramme">Diagramme</option>
              <option value="commentaire">Commentaire</option>
            </select>
          </div>

          {/* Liste des remarques */}
          <div className="flex-1 overflow-y-auto p-2.5">
            {filteredRemarks.length === 0 ? (
              <div className="text-center py-8 text-gray-300">
                <Filter className="w-6 h-6 mx-auto mb-2" />
                <p className="text-xs">Aucune remarque</p>
              </div>
            ) : (
              filteredRemarks
                .slice()
                .sort((a, b) => a.page - b.page)
                .map(r => (
                  <RemarkCard
                    key={r.id}
                    remark={r}
                    selected={r.id === selectedId}
                    onClick={() => selectRemark(r)}
                  />
                ))
            )}
          </div>
        </div>

        {/* ── Colonne centrale : PDF viewer ─────────────────── */}
        <div className="flex-1 flex flex-col bg-gray-200 overflow-hidden">
          <iframe
            ref={iframeRef}
            src={`${pdfUrl}#page=${currentPage}`}
            title="Aperçu du document"
            className="flex-1 w-full border-0"
          />
        </div>

        {/* ── Colonne droite : suggestion ────────────────────── */}
        <div className="w-[300px] shrink-0 flex flex-col border-l border-gray-100 bg-white">
          <div className="shrink-0 px-4 py-2.5 border-b border-gray-100">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Suggestion de correction</p>
          </div>
          <div className="flex-1 overflow-hidden">
            <SuggestionPanel
              remark={selectedRemark}
              sessionId={session.session_id}
              onStatusChange={handleStatusChange}
            />
          </div>
        </div>

      </div>
    </div>
  );
}

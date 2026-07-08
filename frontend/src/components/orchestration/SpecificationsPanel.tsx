'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, Clock, Download, Eye,
  Loader2, MessageSquare, RefreshCw, Search, Sparkles,
  Trash2, X, AlertCircle, Send, ChevronRight,
  Link, Paperclip, Plus,
} from 'lucide-react';
import {
  specificationsApi,
  type GenerateRequest,
  type Specification,
  type SpecificationSummary,
  type SpecStatus,
  type ScopeType,
  type ChatMessage,
  type SFDTheme,
} from '@/lib/specificationsApi';
import { taxonomyApi, type TaxonomyFlat } from '@/lib/taxonomyApi';
import { useProceduresStore } from '@/store/proceduresStore';
import TaxonomyProcedureSelector from '@/components/orchestration/TaxonomyProcedureSelector';

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<ScopeType, string> = {
  theme: 'Thème',
  category: 'Catégorie',
  subcategory: 'Sous-catégorie',
  procedures: 'Procédures',
};

const STATUS_STYLES: Record<SpecStatus, { bg: string; text: string; label: string }> = {
  draft:     { bg: 'bg-amber-50',  text: 'text-amber-700',  label: 'Brouillon' },
  validated: { bg: 'bg-green-50',  text: 'text-green-700',  label: 'Validé' },
  archived:  { bg: 'bg-gray-100',  text: 'text-gray-500',   label: 'Archivé' },
};

function StatusBadge({ status }: { status: SpecStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function ScopeBadge({ scope }: { scope: ScopeType }) {
  return (
    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700">
      {SCOPE_LABELS[scope] ?? scope}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── ONGLETS ──────────────────────────────────────────────────────────────────

type SubTab = 'generate' | 'library';

function TabBar({ active, onChange }: { active: SubTab; onChange: (t: SubTab) => void }) {
  const tabs: { id: SubTab; label: string; icon: React.ElementType }[] = [
    { id: 'generate', label: 'Générer',      icon: Sparkles },
    { id: 'library',  label: 'Bibliothèque', icon: BookOpen },
  ];
  return (
    <div className="flex border-b border-gray-200 bg-white px-4">
      {tabs.map(t => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isActive
                ? 'border-amber-500 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── MODAL PREVIEW ────────────────────────────────────────────────────────────

interface SFDPreviewModalProps {
  summary: SpecificationSummary;
  onClose: () => void;
  onDeleted?: () => void;
}

function SFDPreviewModal({ summary, onClose, onDeleted }: SFDPreviewModalProps) {
  const [spec, setSpec]               = useState<Specification | null>(null);
  const [loading, setLoading]         = useState(true);
  const [previewKey, setPreviewKey]   = useState(0);
  const [chatInput, setChatInput]     = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [panel, setPanel]             = useState<'preview' | 'chat'>('preview');
  const [exporting, setExporting]     = useState(false);

  useEffect(() => {
    setLoading(true);
    specificationsApi.get(summary.id)
      .then(r => {
        setSpec(r.specification);
        setChatHistory(r.specification.chat_history ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [summary.id]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleExport = async () => {
    if (!spec) return;
    setExporting(true);
    try { await specificationsApi.exportDocx(spec.id, spec.title); }
    catch (e: any) { alert(e.message); }
    finally { setExporting(false); }
  };

  const handleChat = async () => {
    if (!spec || !chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatLoading(true);
    const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: msg }];
    setChatHistory(newHistory);
    try {
      const res = await specificationsApi.chat(spec.id, { message: msg, chat_history: newHistory });
      setChatHistory(h => [...h, { role: 'assistant', content: res.agent_message }]);
      setSpec(s => s ? { ...s, sfd_json: res.sfd_json } : s);
      setPreviewKey(k => k + 1);
    } catch (e: any) {
      setChatHistory(h => [...h, { role: 'assistant', content: `Erreur : ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const previewUrl = spec ? specificationsApi.previewUrl(spec.id) : '';

  return (
    /* backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      {/* panel — stop propagation so clicks inside don't close */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-[90vw] h-[90vh] max-w-[1400px]"
        onClick={e => e.stopPropagation()}
      >
        {/* ── header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <StatusBadge status={summary.status} />
            <ScopeBadge scope={summary.scope_type} />
            <span className="font-semibold text-gray-800 truncate text-sm">{summary.title}</span>
            <span className="text-xs text-gray-400 shrink-0 hidden sm:block">{summary.scope_name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {/* panel toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setPanel('preview')}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${
                  panel === 'preview' ? 'bg-amber-50 text-amber-700' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Aperçu
              </button>
              <button
                type="button"
                onClick={() => setPanel('chat')}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-medium border-l border-gray-200 transition-colors ${
                  panel === 'chat' ? 'bg-amber-50 text-amber-700' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Chat
                {chatHistory.length > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                    {Math.floor(chatHistory.length / 2)}
                  </span>
                )}
              </button>
            </div>

            {/* export */}
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || !spec}
              title="Exporter en Word"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              .docx
            </button>

            {/* full-screen */}
            {spec && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                Plein écran
              </a>
            )}

            {/* close */}
            <button
              type="button"
              onClick={onClose}
              title="Fermer"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── body ── */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            </div>
          ) : !spec ? (
            <div className="flex flex-col items-center justify-center h-full text-red-400 gap-2">
              <AlertCircle className="w-8 h-8" />
              <p className="text-sm">Impossible de charger la spécification</p>
            </div>
          ) : panel === 'preview' ? (
            <iframe
              key={previewKey}
              src={previewUrl}
              className="w-full h-full border-0"
              title={spec.title}
            />
          ) : (
            /* chat */
            <div className="flex flex-col h-full max-w-2xl mx-auto">
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {chatHistory.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Demandez une modification ou posez une question sur le SFD</p>
                  </div>
                ) : chatHistory.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                      m.role === 'user'
                        ? 'bg-amber-600 text-white rounded-br-sm'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                    }`}>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-gray-100">
                <div className="flex items-end gap-2">
                  <textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat(); } }}
                    placeholder="Demandez une modification… (Entrée pour envoyer)"
                    rows={2}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    type="button"
                    onClick={handleChat}
                    disabled={!chatInput.trim() || chatLoading}
                    title="Envoyer"
                    className="p-2.5 bg-amber-600 text-white rounded-xl hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ONGLET GÉNÉRER ───────────────────────────────────────────────────────────

function GenerateTab({ onGenerated }: { onGenerated: (spec: SpecificationSummary) => void }) {
  const { procedures, fetchProcedures } = useProceduresStore();
  const [procedureIds, setProcIds]      = useState<string[]>([]);
  const [title, setTitle]               = useState('');
  const [style, setStyle]               = useState('corporate_blue');
  const [themes, setThemes]             = useState<SFDTheme[]>([]);
  const [taxonomy, setTaxonomy]         = useState<TaxonomyFlat[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  // ── Sources enrichies ──
  const [userInstructions, setInstructions] = useState('');
  const [sourceFiles, setSourceFiles]       = useState<File[]>([]);
  const [sourceUrls, setSourceUrls]         = useState<string[]>([]);
  const [urlInput, setUrlInput]             = useState('');

  useEffect(() => {
    fetchProcedures();
    taxonomyApi.getFlat().then(r => setTaxonomy(r.nodes ?? [])).catch(() => {});
    specificationsApi.themes().then(r => setThemes(r.themes)).catch(() => {});
  }, [fetchProcedures]);

  // ─── Résolution auto du scope ───
  const childrenMap = useMemo(() => {
    const map: Record<string, TaxonomyFlat[]> = {};
    taxonomy.forEach(n => {
      const pid = n.parent_id || '__root__';
      if (!map[pid]) map[pid] = [];
      map[pid].push(n);
    });
    return map;
  }, [taxonomy]);

  const procsByTaxId = useMemo(() => {
    const map: Record<string, string[]> = {};
    procedures.forEach(p => {
      if (!p.taxonomy_id) return;
      if (!map[p.taxonomy_id]) map[p.taxonomy_id] = [];
      map[p.taxonomy_id].push(p.id);
    });
    return map;
  }, [procedures]);

  const getProcsUnder = useCallback((nodeId: string): string[] => {
    const direct = procsByTaxId[nodeId] || [];
    const nested = (childrenMap[nodeId] || []).flatMap(c => getProcsUnder(c.id));
    return [...direct, ...nested];
  }, [procsByTaxId, childrenMap]);

  const resolveScope = useCallback((): { scope_type: ScopeType; scope_id?: string; scope_name: string } => {
    const selSet = new Set(procedureIds);
    for (const level of ['subcategory', 'category', 'theme'] as const) {
      for (const node of taxonomy.filter(n => n.level === level)) {
        const under = getProcsUnder(node.id);
        if (under.length > 0 && under.length === selSet.size && under.every(id => selSet.has(id))) {
          return { scope_type: level, scope_id: node.id, scope_name: node.name };
        }
      }
    }
    return { scope_type: 'procedures', scope_name: 'Sélection de procédures' };
  }, [procedureIds, taxonomy, getProcsUnder]);

  const scopePreview = resolveScope();

  const addUrl = () => {
    const u = urlInput.trim();
    if (u && !sourceUrls.includes(u)) setSourceUrls(s => [...s, u]);
    setUrlInput('');
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    setSourceFiles(s => [...s, ...files]);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const scope = resolveScope();
      const body: GenerateRequest = {
        scope_type:        scope.scope_type,
        scope_id:          scope.scope_id,
        procedure_ids:     scope.scope_type === 'procedures' ? procedureIds : undefined,
        title,
        style,
        user_instructions: userInstructions || undefined,
        source_files:      sourceFiles.length  ? sourceFiles  : undefined,
        source_urls:       sourceUrls.length   ? sourceUrls   : undefined,
      };
      const res = await specificationsApi.generate(body);
      onGenerated(res.specification);
    } catch (e: any) {
      setError(e.message ?? 'Erreur de génération');
    } finally {
      setLoading(false);
    }
  };

  const hasExtras = userInstructions.trim() || sourceFiles.length > 0 || sourceUrls.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Compact header */}
      <div className="shrink-0 px-4 py-2 border-b border-gray-100 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span className="text-xs font-semibold text-gray-700">
          Sélectionnez les procédures — cochez un nœud pour tout inclure, ou dépliez pour affiner
        </span>
      </div>

      {/* Two-column body */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── Colonne gauche : sélecteur taxonomique ── */}
        <div className="flex-1 min-w-0 border-r border-gray-100 p-3 overflow-y-auto">
          <TaxonomyProcedureSelector
            procedures={procedures}
            selected={procedureIds}
            onChange={setProcIds}
            maxHeight="calc(100vh - 240px)"
          />
        </div>

        {/* ── Colonne droite : options ── */}
        <div className="w-72 shrink-0 flex flex-col p-4 gap-3 overflow-y-auto">

          {/* Scope détecté */}
          <div className={`rounded-lg px-3 py-2.5 border transition-all ${
            procedureIds.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'
          }`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Périmètre détecté</p>
            {procedureIds.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Aucune sélection</p>
            ) : (
              <>
                <p className="text-xs font-semibold text-amber-800">{SCOPE_LABELS[scopePreview.scope_type]}</p>
                <p className="text-xs text-gray-600 truncate">{scopePreview.scope_name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{procedureIds.length} procédure{procedureIds.length > 1 ? 's' : ''}</p>
              </>
            )}
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Instructions <span className="font-normal normal-case text-gray-400">(optionnel)</span>
            </label>
            <textarea
              value={userInstructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="Ex : focalise sur les règles métier, inclus les cas d'erreur, adapte au contexte bancaire…"
              rows={3}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Sources — fichiers */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Sources <span className="font-normal normal-case text-gray-400">(PDF, image, Excel)</span>
            </label>
            <div
              onDrop={handleFileDrop}
              onDragOver={e => e.preventDefault()}
              className="border border-dashed border-gray-300 rounded-lg p-2 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-colors"
              onClick={() => document.getElementById('sfd-file-input')?.click()}
            >
              <Paperclip className="w-4 h-4 text-gray-400 mx-auto mb-1" />
              <p className="text-[10px] text-gray-400">Glisser ou cliquer pour ajouter</p>
              <input
                id="sfd-file-input"
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.xlsm"
                className="hidden"
                aria-label="Ajouter des fichiers sources"
                onChange={e => setSourceFiles(s => [...s, ...Array.from(e.target.files ?? [])])}
              />
            </div>
            {sourceFiles.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {sourceFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded text-xs text-gray-700">
                    <Paperclip className="w-3 h-3 text-gray-400 shrink-0" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <button type="button" title="Retirer ce fichier" onClick={() => setSourceFiles(s => s.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-500 shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sources — URLs */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              URLs <span className="font-normal normal-case text-gray-400">(optionnel)</span>
            </label>
            <div className="flex gap-1">
              <input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }}
                placeholder="https://…"
                className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button type="button" title="Ajouter cette URL" onClick={addUrl}
                className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {sourceUrls.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {sourceUrls.map((u, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded text-xs text-gray-700">
                    <Link className="w-3 h-3 text-gray-400 shrink-0" />
                    <span className="flex-1 truncate">{u}</span>
                    <button type="button" title="Retirer cette URL" onClick={() => setSourceUrls(s => s.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-500 shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Titre */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Titre <span className="font-normal normal-case text-gray-400">(optionnel)</span>
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={scopePreview.scope_name || 'Titre du SFD…'}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Thème visuel */}
          {themes.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Thème visuel
              </label>
              <div className="flex flex-col gap-1">
                {themes.map(t => (
                  <button key={t.name} type="button" onClick={() => setStyle(t.name)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
                      style === t.name
                        ? 'bg-amber-50 border-amber-400 text-amber-800 font-semibold'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* spacer */}
          <div className="flex-1" />

          {/* Erreur */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Bouton */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={procedureIds.length === 0 || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg font-semibold text-sm hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Génération…</>
            ) : (
              <><Sparkles className="w-4 h-4" />Générer le SFD</>
            )}
          </button>

          {loading && (
            <p className="text-[10px] text-gray-400 text-center">
              30–90 s selon le périmètre{hasExtras ? ' et les sources' : ''}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ONGLET BIBLIOTHÈQUE ──────────────────────────────────────────────────────

function LibraryTab({ onPreview }: { onPreview: (spec: SpecificationSummary) => void }) {
  const [specs, setSpecs]     = useState<SpecificationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<SpecStatus | 'all'>('all');

  const load = useCallback(() => {
    setLoading(true);
    specificationsApi.list()
      .then(r => setSpecs(r.specifications))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Supprimer cette spécification ?')) return;
    await specificationsApi.delete(id);
    setSpecs(s => s.filter(x => x.id !== id));
  };

  const filtered = specs.filter(s => {
    const matchSearch = s.title.toLowerCase().includes(search.toLowerCase()) ||
                        s.scope_name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || s.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as any)}
          aria-label="Filtrer par statut"
          className="border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-600"
        >
          <option value="all">Tous les statuts</option>
          <option value="draft">Brouillon</option>
          <option value="validated">Validé</option>
          <option value="archived">Archivé</option>
        </select>
        <button type="button" onClick={load} title="Actualiser" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucune spécification</p>
            <p className="text-xs mt-1">Générez votre premier SFD depuis l'onglet Générer</p>
          </div>
        ) : filtered.map(spec => (
          <button
            key={spec.id}
            type="button"
            onClick={() => onPreview(spec)}
            className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-amber-300 hover:shadow-sm transition-all group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <StatusBadge status={spec.status} />
                  <ScopeBadge scope={spec.scope_type} />
                </div>
                <p className="font-semibold text-gray-800 truncate">{spec.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{spec.scope_name}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(spec.created_at)}
                  </span>
                  <span>{spec.procedure_ids?.length ?? 0} procédure{(spec.procedure_ids?.length ?? 0) > 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-gray-400 group-hover:text-amber-600 transition-colors hidden sm:block">Aperçu</span>
                <Eye className="w-4 h-4 text-gray-300 group-hover:text-amber-500 transition-colors" />
                <button
                  type="button"
                  onClick={e => handleDelete(spec.id, e)}
                  title="Supprimer cette spécification"
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors ml-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── COMPOSANT PRINCIPAL ──────────────────────────────────────────────────────

export default function SpecificationsPanel() {
  const [activeTab, setActiveTab]         = useState<SubTab>('generate');
  const [previewSpec, setPreviewSpec]     = useState<SpecificationSummary | null>(null);

  const handleGenerated = (spec: SpecificationSummary) => {
    setPreviewSpec(spec);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
            <BookOpen className="w-3.5 h-3.5 text-amber-700" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900">Spécifications fonctionnelles</h1>
            <p className="text-xs text-gray-400">SFD générés depuis les procédures ProcessMate</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'generate' && <GenerateTab onGenerated={handleGenerated} />}
        {activeTab === 'library'  && <LibraryTab  onPreview={setPreviewSpec} />}
      </div>

      {/* Modal preview */}
      {previewSpec && (
        <SFDPreviewModal
          summary={previewSpec}
          onClose={() => setPreviewSpec(null)}
        />
      )}
    </div>
  );
}

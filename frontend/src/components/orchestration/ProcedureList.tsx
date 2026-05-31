'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  FileText, Search, Plus, AlertCircle, RefreshCw,
  Trash2, Lock, Edit2, Check, X, MoreHorizontal,
  Send, ChevronRight, ChevronDown, ExternalLink, Upload, GitBranch,
} from 'lucide-react';
import { useProceduresStore } from '@/store/proceduresStore';
import { orchestrationApi, VALID_STATUSES, ProcedureStatus, Procedure, PROCEDURE_STATUS_COLORS } from '@/lib/orchestrationApi';
import { taxonomyApi, TaxonomyFlat, TaxonomyLevel } from '@/lib/taxonomyApi';
import ImportPdfModal from '@/components/orchestration/ImportPdfModal';
import ProcedureJourney from '@/components/orchestration/ProcedureJourney';

function StatusBadge({ status }: { status: string }) {
  const s = PROCEDURE_STATUS_COLORS[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      {status}
    </span>
  );
}

interface Props {
  onOpenDetail: (procedure: Procedure) => void;
  onOpenProcedure: (procedure: Procedure) => void;
  isAdmin?: boolean;
}

function ActionMenu({ proc, onRename, onStatusModal, onClose }: {
  proc: Procedure; onRename: () => void; onStatusModal: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const handler = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onClose();
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, 50);
    return () => clearTimeout(t);
  }, [onClose]);

  if (proc.is_finalized) {
    return (
      <div ref={ref} className="absolute right-0 bottom-full mb-1 z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 py-2 min-w-[180px]">
        <div className="px-4 py-2 text-xs text-gray-400 flex items-center gap-2">
          <Lock className="w-3 h-3" /> Procédure finalisée
        </div>
      </div>
    );
  }
  return (
    <div ref={ref} className="absolute right-0 bottom-full mb-1 z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 py-2 min-w-[180px]">
      <button onClick={() => { onRename(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
        <Edit2 className="w-3.5 h-3.5 text-gray-400" /> Renommer
      </button>
      <button onClick={() => { onStatusModal(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
        <Send className="w-3.5 h-3.5 text-gray-400" /> Changer le statut
      </button>
    </div>
  );
}

function ProcedureRow({ proc, onOpenDetail, onOpenProcedure, onDeleteConfirm, onStatusModal,
  onShowJourney, isAdmin, onStartRename,
  renaming, renameValue, setRenameValue, onRenameSubmit, onRenameCancel }: {
    proc: Procedure;
    onOpenDetail: (p: Procedure) => void;
    onOpenProcedure: (p: Procedure) => void;
    onDeleteConfirm: (p: Procedure) => void;
    onStatusModal: (p: Procedure) => void;
    onShowJourney: (p: Procedure) => void;
    onStartRename: () => void;
    isAdmin: boolean;
    renaming: boolean;
    renameValue: string;
    setRenameValue: (v: string) => void;
    onRenameSubmit: () => void;
    onRenameCancel: () => void;
  }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group flex items-stretch border-b border-gray-100 last:border-b-0 hover:bg-blue-50/30 transition-colors">
      {/* Tree connector */}
      <div className="flex-shrink-0 flex flex-col items-center w-8">
        <div className="w-px flex-1 bg-blue-100 group-hover:bg-blue-300 transition-colors" />
        <div className="w-3 h-px bg-blue-100 group-hover:bg-blue-300 transition-colors mt-auto mb-auto self-end" />
      </div>

      {/* Icon */}
      <div className="flex-shrink-0 flex items-center pr-3 py-3">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${proc.is_finalized ? 'bg-emerald-50' : 'bg-blue-50'}`}>
          {proc.is_finalized
            ? <Lock className="w-3.5 h-3.5 text-emerald-500" />
            : <FileText className="w-3.5 h-3.5 text-blue-400" />}
        </div>
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0 py-3 pr-2">
        {renaming ? (
          <div className="flex items-center gap-2">
            <input type="text" value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onRenameSubmit(); if (e.key === 'Escape') onRenameCancel(); }}
              autoFocus className="flex-1 px-2 py-1 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <button type="button" onClick={onRenameSubmit} title="Valider" className="text-emerald-600 hover:text-emerald-800 p-1"><Check className="w-4 h-4" /></button>
            <button type="button" onClick={onRenameCancel} title="Annuler" className="text-gray-400 hover:text-gray-600 p-1"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <>
            <button type="button" onClick={() => onOpenProcedure(proc)}
              className="text-[13.5px] font-semibold text-gray-800 hover:text-blue-700 transition-colors text-left leading-snug block max-w-xl truncate">
              {proc.nom}
            </button>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <StatusBadge status={proc.status} />
              {proc.ref && <span className="text-[11px] text-gray-400 font-mono">{proc.ref}</span>}
              <span className="text-[11px] text-gray-300">·</span>
              <span className="text-[11px] text-gray-400">v{proc.version}</span>
              {proc.remarks_count > 0 && (
                <span className="text-[11px] font-semibold text-orange-600">⚠ {proc.remarks_count} remarque{proc.remarks_count > 1 ? 's' : ''}</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Actions — toujours visibles */}
      {!renaming && (
        <div className="flex-shrink-0 flex items-center gap-1.5 px-3">
          {isAdmin && (
            <button type="button" title="Voir le parcours" onClick={() => onShowJourney(proc)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-colors whitespace-nowrap">
              <GitBranch className="w-3 h-3" /> Parcours
            </button>
          )}
          <a href={`/stt?workflow_id=${proc.id}`} title="Ouvrir dans Studio"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap">
            <ExternalLink className="w-3 h-3" /> Studio
          </a>
          <button type="button" title="Voir la fiche" onClick={() => onOpenDetail(proc)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <FileText className="w-4 h-4" />
          </button>
          {!proc.is_finalized && isAdmin && (
            <button type="button" title="Supprimer" onClick={() => onDeleteConfirm(proc)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen(o => !o)}
              className={`p-1.5 rounded-lg transition-colors ${menuOpen ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'}`}>
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <ActionMenu proc={proc} onRename={() => { onStartRename(); setMenuOpen(false); }} onStatusModal={() => { onStatusModal(proc); setMenuOpen(false); }} onClose={() => setMenuOpen(false)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface BlockSharedProps {
  onOpenDetail: (p: Procedure) => void;
  onOpenProcedure: (p: Procedure) => void;
  onDeleteConfirm: (p: Procedure) => void;
  onStatusModal: (p: Procedure) => void;
  onShowJourney: (p: Procedure) => void;
  isAdmin: boolean;
  renaming: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onRenameSubmit: (id: string) => void;
  onRenameCancel: () => void;
  onStartRename: (id: string) => void;
}

function ProcList({ items, shared }: { items: Procedure[]; shared: BlockSharedProps }) {
  return (
    <>
      {items.map(proc => (
        <ProcedureRow
          key={proc.id} proc={proc}
          onOpenDetail={shared.onOpenDetail} onOpenProcedure={shared.onOpenProcedure}
          onDeleteConfirm={shared.onDeleteConfirm} onStatusModal={shared.onStatusModal}
          onShowJourney={shared.onShowJourney} isAdmin={shared.isAdmin}
          renaming={shared.renaming === proc.id} renameValue={shared.renameValue}
          setRenameValue={shared.setRenameValue}
          onRenameSubmit={() => shared.onRenameSubmit(proc.id)}
          onRenameCancel={shared.onRenameCancel}
          onStartRename={() => shared.onStartRename(proc.id)}
        />
      ))}
    </>
  );
}

function CategoryBlock({ cat, items, open, onToggle, shared }: {
  cat: string; items: Procedure[]; open: boolean; onToggle: () => void; shared: BlockSharedProps;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors rounded-xl">
        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
          {open ? <ChevronDown className="w-4 h-4 text-blue-500" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </span>
        <div className={`w-1 h-5 rounded-full flex-shrink-0 ${open ? 'bg-blue-500' : 'bg-gray-300'}`} />
        <span className={`flex-1 text-left font-bold text-[15px] ${open ? 'text-blue-700' : 'text-gray-700'}`}>{cat}</span>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 ${open ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
          {items.length}
        </span>
      </button>
      {open && (
        <div className="border-t border-gray-100 overflow-visible">
          <ProcList items={items} shared={shared} />
        </div>
      )}
    </div>
  );
}

export default function ProcedureList({ onOpenDetail, onOpenProcedure, isAdmin = false }: Props) {
  const { procedures, loading, error, fetchProcedures, removeProcedure, updateProcedureStatus, upsertProcedure } =
    useProceduresStore();

  useEffect(() => { fetchProcedures(); }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [showImportModal, setShowImportModal] = useState(false);
  const [statusModal, setStatusModal] = useState<Procedure | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ nom: '', ref: '', description: '' });
  const [createTaxonomyId, setCreateTaxonomyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [taxNodes, setTaxNodes] = useState<TaxonomyFlat[]>([]);
  const [selTheme, setSelTheme] = useState('');
  const [selCategory, setSelCategory] = useState('');
  const [selSubcat, setSelSubcat] = useState('');
  const [quickCreate, setQuickCreate] = useState<{ level: TaxonomyLevel; value: string } | null>(null);
  const [quickCreating, setQuickCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Procedure | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [journeyProcedure, setJourneyProcedure] = useState<Procedure | null>(null);

  const themes = taxNodes.filter(n => n.level === 'theme');
  const catOptions = taxNodes.filter(n => n.level === 'category' && n.parent_id === selTheme);
  const subcatOptions = taxNodes.filter(n => n.level === 'subcategory' && n.parent_id === selCategory);

  useEffect(() => {
    taxonomyApi.getFlat()
      .then(res => setTaxNodes(res.nodes))
      .catch(() => setTaxNodes([]));
  }, []);


  const closeCreate = () => {
    setShowCreate(false);
    setCreateForm({ nom: '', ref: '', description: '' });
    setCreateTaxonomyId(null);
    setSelTheme(''); setSelCategory(''); setSelSubcat('');
    setQuickCreate(null);
  };

  const handleQuickCreate = async () => {
    if (!quickCreate?.value.trim()) return;
    setQuickCreating(true);
    try {
      const parentId =
        quickCreate.level === 'category' ? selTheme :
        quickCreate.level === 'subcategory' ? selCategory : null;
      const res = await taxonomyApi.create({
        name: quickCreate.value.trim(),
        level: quickCreate.level,
        parent_id: parentId || null,
      });
      const { nodes } = await taxonomyApi.getFlat();
      setTaxNodes(nodes);
      if (quickCreate.level === 'theme') {
        setSelTheme(res.node.id); setSelCategory(''); setSelSubcat(''); setCreateTaxonomyId(null);
      } else if (quickCreate.level === 'category') {
        setSelCategory(res.node.id); setSelSubcat(''); setCreateTaxonomyId(null);
      } else {
        setSelSubcat(res.node.id); setCreateTaxonomyId(res.node.id);
      }
      setQuickCreate(null);
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur création'); }
    finally { setQuickCreating(false); }
  };

  const effectiveSubcatName = taxNodes.find(n => n.id === selSubcat)?.name ?? '';

  const filtered = procedures.filter(p =>
    p.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.ref.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const grouped = filtered.reduce((acc, p) => {
    const cat = p.category || 'Non classé';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {} as Record<string, Procedure[]>);

  const categories = Object.keys(grouped).sort();

  // ── Taxonomy-aware hierarchy ──────────────────────────────
  const nodeById = Object.fromEntries(taxNodes.map(n => [n.id, n]));
  const procsBySubcat: Record<string, Procedure[]> = {};
  const uncategorized: Procedure[] = [];
  for (const proc of filtered) {
    let subcatId: string | null = null;
    if (proc.taxonomy_id) {
      const node = nodeById[proc.taxonomy_id];
      if (node?.level === 'subcategory') subcatId = node.id;
    }
    if (!subcatId && proc.category) {
      const match = taxNodes.find(n => n.level === 'subcategory' && n.name === proc.category);
      if (match) subcatId = match.id;
    }
    if (subcatId) { (procsBySubcat[subcatId] ??= []).push(proc); }
    else { uncategorized.push(proc); }
  }
  const taxThemes = taxNodes
    .filter(n => n.level === 'theme')
    .sort((a, b) => a.order_index - b.order_index);
  const hasTaxonomy = taxThemes.length > 0;

  const toggleCat = (cat: string) => {
    setExpandedCats(prev => {
      const n = new Set(prev);
      n.has(cat) ? n.delete(cat) : n.add(cat);
      return n;
    });
  };

  const toggleTheme = (id: string) => {
    setExpandedThemes(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const handleStatusChange = async (status: ProcedureStatus) => {
    if (!statusModal) return;
    setUpdatingId(statusModal.id);
    try {
      await orchestrationApi.updateStatus(statusModal.id, status);
      updateProcedureStatus(statusModal.id, status);
      setStatusModal(null);
    } catch { alert('Erreur mise à jour statut'); }
    finally { setUpdatingId(null); }
  };

  const handleCreate = async () => {
    if (!createForm.nom.trim() || !effectiveSubcatName) return;
    setCreating(true);
    try {
      const res = await orchestrationApi.createProcedure({
        ...createForm,
        category: effectiveSubcatName,
        taxonomy_id: createTaxonomyId ?? undefined,
      });
      upsertProcedure(res.procedure);
      closeCreate();
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur création'); }
    finally { setCreating(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await orchestrationApi.deleteProcedure(deleteConfirm.id);
      removeProcedure(deleteConfirm.id);
      setDeleteConfirm(null);
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur suppression'); }
    finally { setDeleting(false); }
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) { setRenaming(null); return; }
    try {
      await orchestrationApi.updateProcedure(id, { nom: renameValue });
      upsertProcedure({ ...procedures.find(p => p.id === id)!, nom: renameValue });
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur renommage'); }
    finally { setRenaming(null); }
  };

  if (loading && procedures.length === 0) return (
    <div className="p-8 flex items-center justify-center h-64">
      <div className="text-center text-gray-500">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />
        <p>Chargement...</p>
      </div>
    </div>
  );

  if (error && procedures.length === 0) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
        <p className="flex-1 text-red-800">{error}</p>
        <button type="button" onClick={() => fetchProcedures(true)} className="px-3 py-1.5 bg-red-100 text-red-800 rounded text-sm font-medium">Réessayer</button>
      </div>
    </div>
  );

  return (
    <div className="p-8 space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Procédures <span className="text-sm font-normal text-gray-400">({procedures.length})</span>
        </h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => fetchProcedures(true)} title="Actualiser"
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors">
            <Upload className="w-4 h-4" /> Importer PDF
          </button>
          <button type="button" onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Nouvelle procédure
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Rechercher par nom ou référence..."
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
      </div>

      {(() => {
        const shared: BlockSharedProps = {
          onOpenDetail, onOpenProcedure,
          onDeleteConfirm: p => setDeleteConfirm(p),
          onStatusModal: p => setStatusModal(p),
          onShowJourney: p => setJourneyProcedure(p),
          isAdmin,
          renaming, renameValue, setRenameValue,
          onRenameSubmit: handleRename,
          onRenameCancel: () => setRenaming(null),
          onStartRename: id => { setRenaming(id); setRenameValue(procedures.find(p => p.id === id)?.nom ?? ''); },
        };

        if (filtered.length === 0) return (
          <div className="text-center py-16 text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-base">Aucune procédure</p>
            <p className="text-sm mt-1">Créez une procédure ou importez depuis un PDF.</p>
          </div>
        );

        if (!hasTaxonomy) return (
          /* ── Vue plate (fallback sans taxonomie) ── */
          <div className="space-y-3">
            {categories.map(cat => (
              <CategoryBlock key={cat} cat={cat} items={grouped[cat]}
                open={expandedCats.has(cat)} onToggle={() => toggleCat(cat)} shared={shared} />
            ))}
          </div>
        );

        /* ── Vue hiérarchique Thème → Catégorie → Sous-catégorie ── */
        return (
          <div className="space-y-3">
            {taxThemes.map(theme => {
              const themeCats = taxNodes
                .filter(n => n.level === 'category' && n.parent_id === theme.id)
                .sort((a, b) => a.order_index - b.order_index);
              const themeCount = themeCats.reduce((acc, cat) => {
                const subcats = taxNodes.filter(n => n.level === 'subcategory' && n.parent_id === cat.id);
                return acc + subcats.reduce((a, sc) => a + (procsBySubcat[sc.id]?.length ?? 0), 0);
              }, 0);
              if (themeCount === 0 && searchTerm) return null;
              const themeOpen = expandedThemes.has(theme.id);
              return (
                <div key={theme.id} className="bg-white rounded-xl border border-indigo-200 shadow-sm overflow-visible">
                  {/* ── Niveau 1: Thème — pl-5, text ≈ 64px from card left ── */}
                  <button type="button" onClick={() => toggleTheme(theme.id)}
                    className={`w-full flex items-center gap-3 px-5 py-4 transition-colors rounded-xl ${themeOpen ? 'bg-indigo-50/60' : 'hover:bg-gray-50'}`}>
                    {themeOpen ? <ChevronDown className="w-4 h-4 text-indigo-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    <div className={`w-[4px] h-6 rounded-full flex-shrink-0 ${themeOpen ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                    <span className={`flex-1 text-left font-extrabold text-[15px] tracking-tight ${themeOpen ? 'text-indigo-900' : 'text-gray-700'}`}>{theme.name}</span>
                    <span className={`min-w-[28px] h-6 flex items-center justify-center text-xs font-bold rounded-full px-2 ${themeOpen ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {themeCount}
                    </span>
                  </button>

                  {themeOpen && (
                    <div className="border-t border-indigo-100">
                      {themeCats.map(cat => {
                        const subcats = taxNodes
                          .filter(n => n.level === 'subcategory' && n.parent_id === cat.id)
                          .sort((a, b) => a.order_index - b.order_index);
                        const catCount = subcats.reduce((a, sc) => a + (procsBySubcat[sc.id]?.length ?? 0), 0);
                        if (catCount === 0 && searchTerm) return null;
                        const catOpen = expandedCats.has(cat.id);
                        return (
                          <div key={cat.id} className="border-b border-gray-100 last:border-b-0">
                            {/* ── Niveau 2: Catégorie — pl-14 → text ≈ 82px from card left ── */}
                            <button type="button" onClick={() => toggleCat(cat.id)}
                              className="w-full flex items-center gap-2.5 pl-14 pr-5 py-3 hover:bg-blue-50/30 transition-colors">
                              {catOpen ? <ChevronDown className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
                              <span className={`flex-1 text-left font-semibold text-[13.5px] ${catOpen ? 'text-blue-700' : 'text-gray-500'}`}>{cat.name}</span>
                              <span className={`min-w-[24px] h-5 flex items-center justify-center text-[11px] font-semibold rounded-full px-1.5 ${catOpen ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                                {catCount}
                              </span>
                            </button>

                            {catOpen && (
                              /* Sous-catégories démarrent à pl-12 (48px) → card à 48px, text ≈ 104px */
                              <div className="pl-12 pr-4 py-2 space-y-2 bg-slate-50/60 border-t border-blue-50">
                                {subcats.map(sc => {
                                  const procs = procsBySubcat[sc.id] ?? [];
                                  if (procs.length === 0 && searchTerm) return null;
                                  const scOpen = expandedCats.has(sc.id);
                                  return (
                                    <div key={sc.id} className="rounded-lg border border-gray-200 bg-white overflow-visible shadow-sm">
                                      {/* ── Niveau 3: Sous-catégorie ── */}
                                      <button type="button" onClick={() => toggleCat(sc.id)}
                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-blue-50/40 transition-colors rounded-lg">
                                        {scOpen ? <ChevronDown className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                                        <div className={`w-[3px] h-4 rounded-full flex-shrink-0 ${scOpen ? 'bg-blue-500' : 'bg-gray-300'}`} />
                                        <span className={`flex-1 text-left font-semibold text-[13px] ${scOpen ? 'text-blue-800' : 'text-gray-700'}`}>{sc.name}</span>
                                        <span className={`min-w-[22px] h-5 flex items-center justify-center text-[11px] font-semibold rounded-full px-1.5 ${scOpen ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                          {procs.length}
                                        </span>
                                      </button>
                                      {/* ── Niveau 4: Procédures ── */}
                                      {scOpen && (
                                        <div className="border-t border-gray-100 rounded-b-lg overflow-hidden">
                                          <ProcList items={procs} shared={shared} />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {uncategorized.length > 0 && (
              <CategoryBlock cat="Non classé" items={uncategorized}
                open={expandedCats.has('__uncategorized__')} onToggle={() => toggleCat('__uncategorized__')} shared={shared} />
            )}
          </div>
        );
      })()}

      {/* Modale Parcours */}
      {journeyProcedure && (
        <ProcedureJourney
          procedureId={journeyProcedure.id}
          procedureName={journeyProcedure.nom}
          onClose={() => setJourneyProcedure(null)}
        />
      )}

      {showImportModal && (
        <ImportPdfModal
          onClose={() => setShowImportModal(false)}
          onImported={(procedure, category) => {
            setExpandedCats(prev => new Set([...prev, category]));
          }}
          onOpenImported={onOpenProcedure}
          onCreateNew={() => { setShowImportModal(false); setShowCreate(true); }}
        />
      )}

      {showCreate && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={closeCreate} />
          <div className="fixed right-0 top-0 bottom-0 w-[440px] bg-white shadow-2xl z-50 flex flex-col">
            <div className="shrink-0 p-5 border-b flex justify-between items-center bg-blue-50">
              <h3 className="font-bold text-blue-900 text-lg">Nouvelle procédure</h3>
              <button type="button" onClick={closeCreate} title="Fermer" className="text-gray-400 hover:text-gray-700 p-1"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Nom */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                <input type="text" value={createForm.nom}
                  onChange={e => setCreateForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="Ex: Caution Douanière Export"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>

              {/* Référence */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Référence</label>
                <input type="text" value={createForm.ref}
                  onChange={e => setCreateForm(f => ({ ...f, ref: e.target.value }))}
                  placeholder="Ex: CAU-2025-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>

              {/* Taxonomie */}
              <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Classification</p>

                {/* Thème */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Thème *</label>
                  <div className="flex gap-2">
                    <select value={selTheme} title="Thème"
                      onChange={e => { setSelTheme(e.target.value); setSelCategory(''); setSelSubcat(''); setCreateTaxonomyId(null); setQuickCreate(null); }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                      <option value="">{themes.length === 0 ? 'Aucun thème — créez-en un →' : 'Sélectionner…'}</option>
                      {themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <button type="button" title="Nouveau thème"
                      onClick={() => setQuickCreate(q => q?.level === 'theme' ? null : { level: 'theme', value: '' })}
                      className={`px-2.5 rounded-lg border transition-colors text-sm ${quickCreate?.level === 'theme' ? 'bg-blue-100 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}`}>
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {quickCreate?.level === 'theme' && (
                    <div className="mt-2 flex gap-2">
                      <input autoFocus value={quickCreate.value}
                        onChange={e => setQuickCreate(q => q ? { ...q, value: e.target.value } : null)}
                        onKeyDown={e => { if (e.key === 'Enter') handleQuickCreate(); if (e.key === 'Escape') setQuickCreate(null); }}
                        placeholder="Nom du thème" className="flex-1 px-3 py-1.5 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      <button type="button" onClick={handleQuickCreate} disabled={quickCreating || !quickCreate.value.trim()}
                        className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                        {quickCreating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </button>
                      <button type="button" onClick={() => setQuickCreate(null)} className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-100 text-sm"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>

                {/* Catégorie */}
                <div>
                  <label className={`block text-sm font-medium mb-1 ${selTheme ? 'text-gray-700' : 'text-gray-400'}`}>Catégorie *</label>
                  <div className="flex gap-2">
                    <select value={selCategory} title="Catégorie"
                      onChange={e => { setSelCategory(e.target.value); setSelSubcat(''); setCreateTaxonomyId(null); setQuickCreate(null); }}
                      disabled={!selTheme}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white disabled:opacity-40 disabled:cursor-not-allowed">
                      <option value="">{selTheme && catOptions.length === 0 ? 'Aucune — créez-en une →' : 'Sélectionner…'}</option>
                      {catOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button type="button" title="Nouvelle catégorie" disabled={!selTheme}
                      onClick={() => setQuickCreate(q => q?.level === 'category' ? null : { level: 'category', value: '' })}
                      className={`px-2.5 rounded-lg border transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed ${quickCreate?.level === 'category' ? 'bg-blue-100 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}`}>
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {quickCreate?.level === 'category' && (
                    <div className="mt-2 flex gap-2">
                      <input autoFocus value={quickCreate.value}
                        onChange={e => setQuickCreate(q => q ? { ...q, value: e.target.value } : null)}
                        onKeyDown={e => { if (e.key === 'Enter') handleQuickCreate(); if (e.key === 'Escape') setQuickCreate(null); }}
                        placeholder="Nom de la catégorie" className="flex-1 px-3 py-1.5 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      <button type="button" onClick={handleQuickCreate} disabled={quickCreating || !quickCreate.value.trim()}
                        className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                        {quickCreating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </button>
                      <button type="button" onClick={() => setQuickCreate(null)} className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-100 text-sm"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>

                {/* Sous-catégorie */}
                <div>
                  <label className={`block text-sm font-medium mb-1 ${selCategory ? 'text-gray-700' : 'text-gray-400'}`}>Sous-catégorie *</label>
                  <div className="flex gap-2">
                    <select value={selSubcat} title="Sous-catégorie"
                      onChange={e => { setSelSubcat(e.target.value); setCreateTaxonomyId(e.target.value || null); setQuickCreate(null); }}
                      disabled={!selCategory}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white disabled:opacity-40 disabled:cursor-not-allowed">
                      <option value="">{selCategory && subcatOptions.length === 0 ? 'Aucune — créez-en une →' : 'Sélectionner…'}</option>
                      {subcatOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button type="button" title="Nouvelle sous-catégorie" disabled={!selCategory}
                      onClick={() => setQuickCreate(q => q?.level === 'subcategory' ? null : { level: 'subcategory', value: '' })}
                      className={`px-2.5 rounded-lg border transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed ${quickCreate?.level === 'subcategory' ? 'bg-blue-100 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}`}>
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {quickCreate?.level === 'subcategory' && (
                    <div className="mt-2 flex gap-2">
                      <input autoFocus value={quickCreate.value}
                        onChange={e => setQuickCreate(q => q ? { ...q, value: e.target.value } : null)}
                        onKeyDown={e => { if (e.key === 'Enter') handleQuickCreate(); if (e.key === 'Escape') setQuickCreate(null); }}
                        placeholder="Nom de la sous-catégorie" className="flex-1 px-3 py-1.5 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      <button type="button" onClick={handleQuickCreate} disabled={quickCreating || !quickCreate.value.trim()}
                        className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                        {quickCreating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </button>
                      <button type="button" onClick={() => setQuickCreate(null)} className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-100 text-sm"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} placeholder="Objet de la procédure..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" />
              </div>
            </div>

            <div className="shrink-0 p-5 border-t bg-gray-50 flex justify-end gap-2">
              <button type="button" onClick={closeCreate} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100">Annuler</button>
              <button type="button" onClick={handleCreate}
                disabled={!createForm.nom.trim() || !effectiveSubcatName || creating}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {creating && <RefreshCw className="w-3 h-3 animate-spin" />}Créer la procédure
              </button>
            </div>
          </div>
        </>
      )}

      {statusModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-xs w-full">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Changer le statut</h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{statusModal.nom}</p>
              </div>
              <button type="button" onClick={() => setStatusModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 space-y-0.5">
              {VALID_STATUSES.map(s => (
                <button key={s} type="button" onClick={() => handleStatusChange(s)}
                  disabled={s === statusModal.status || updatingId === statusModal.id}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${s === statusModal.status ? 'bg-blue-50 text-blue-800 font-semibold cursor-default' : 'hover:bg-gray-50 text-gray-700'}`}>
                  {s} {s === statusModal.status && '✓'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-bold text-gray-900">Supprimer la procédure ?</h3>
            <p className="text-sm text-gray-600"><strong>{deleteConfirm.nom}</strong> et tout son historique seront supprimés définitivement.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                {deleting && <RefreshCw className="w-3 h-3 animate-spin" />}Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
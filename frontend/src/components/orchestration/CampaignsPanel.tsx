'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart2, Calendar, CheckCircle2, ChevronRight, Clock, Flag,
  FolderOpen, Loader2, Plus, RefreshCw, Search, Trash2, X,
  FileText, PlayCircle, CheckSquare, AlertCircle, RotateCcw,
  ChevronDown, Tag, Layers,
} from 'lucide-react';
import {
  campaignsApi,
  type Campaign, type CampaignProcedure, type CampaignProcedureStatus, type CampaignStatus,
  CAMPAIGN_STATUS_COLORS, CAMPAIGN_STATUS_LABELS, PROC_STATUS_COLORS, PROC_STATUS_LABELS,
} from '@/lib/campaignsApi';
import { taxonomyApi, type TaxonomyNode } from '@/lib/taxonomyApi';
import { useProceduresStore } from '@/store/proceduresStore';
import { useAuth } from '@/context/AuthContext';
import type { Procedure } from '@/lib/orchestrationApi';

// ─── Types internes ───────────────────────────────────────────

interface LifecycleSnapshot {
  workflow_status: string;
  lifecycle_stages: Array<{ id: string; title: string; status: string; workshop_done: boolean }>;
  stages_done: number;
  stages_total: number;
  formalisation_done: boolean;
  formalisation_in_progress: boolean;
  taxonomy_id?: string | null;
  category?: string;
}

// ─── Badges & utilitaires ─────────────────────────────────────

function StatusBadge({ status }: { status: CampaignStatus }) {
  const c = CAMPAIGN_STATUS_COLORS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {CAMPAIGN_STATUS_LABELS[status]}
    </span>
  );
}

function ProcStatusBadge({ status }: { status: CampaignProcedureStatus }) {
  const c = PROC_STATUS_COLORS[status];
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
      {PROC_STATUS_LABELS[status]}
    </span>
  );
}

function ProgressBar({ pct, size = 'md', color }: { pct: number; size?: 'sm' | 'md'; color?: string }) {
  const h = size === 'sm' ? 'h-1.5' : 'h-2';
  const bg = color ?? (pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-blue-400');
  return (
    <div className={`w-full bg-gray-100 rounded-full ${h} overflow-hidden`}>
      <div className={`${h} ${bg} rounded-full transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

/** Mini barre de progression du cycle de vie : 6 cases colorées */
function LifecycleBar({ stages }: { stages: Array<{ title: string; status: string }> }) {
  const all = ['Création', 'Formalisation', 'Vérification', 'Validation', 'Signature', 'Publication'];
  return (
    <div className="flex gap-0.5" title={`${stages.filter(s => s.status === 'completed').length}/${all.length} étapes`}>
      {all.map((label, i) => {
        const stage = stages.find(s => s.title === label);
        const status = stage?.status ?? 'pending';
        const isForm = label === 'Formalisation';
        return (
          <div
            key={label}
            title={label}
            className={`h-2 w-5 rounded-sm transition-colors ${
              status === 'completed'
                ? isForm ? 'bg-indigo-500' : 'bg-green-400'
                : status === 'in_progress'
                ? 'bg-blue-400'
                : 'bg-gray-200'
            }`}
          />
        );
      })}
    </div>
  );
}

// ─── Modale création campagne ─────────────────────────────────

function CreateCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Campaign) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await campaignsApi.create({ title: title.trim(), description: description.trim() || undefined, start_date: startDate || undefined, end_date: endDate || undefined });
      onCreated(res.campaign);
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Nouvelle campagne de formalisation</h3>
          <button type="button" title="Fermer" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Titre *</label>
            <input title="Titre" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="ex: Refonte des procédures crédit Q1, Correction format SFD…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
            <textarea title="Description" value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="Objectif, périmètre, contexte de la campagne…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Début</label>
              <input title="Date de début" type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Échéance</label>
              <input title="Date de fin" type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Annuler</button>
            <button type="submit" disabled={saving || !title.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Créer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modale ajout procédures — navigation taxonomique ─────────

function TaxonomyTreeNode({
  node,
  selectedId,
  onSelect,
  procedureCountByTaxonomy,
}: {
  node: TaxonomyNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  procedureCountByTaxonomy: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;
  const count = procedureCountByTaxonomy[node.id] ?? 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => { onSelect(node.id); if (hasChildren) setOpen(!open); }}
        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-colors text-sm ${
          isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'
        }`}
      >
        {hasChildren ? (
          <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''} text-gray-400`} />
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}
        <Tag className={`w-3.5 h-3.5 shrink-0 ${
          node.level === 'theme' ? 'text-indigo-500' : node.level === 'category' ? 'text-blue-400' : 'text-gray-400'
        }`} />
        <span className="flex-1 truncate">{node.name}</span>
        {count > 0 && (
          <span className="text-xs text-gray-400 font-normal shrink-0">{count}</span>
        )}
      </button>
      {open && hasChildren && (
        <div className="ml-4 border-l border-gray-100 pl-1 mt-0.5 space-y-0.5">
          {node.children.map(child => (
            <TaxonomyTreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              procedureCountByTaxonomy={procedureCountByTaxonomy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AddProceduresModal({
  campaignId,
  alreadyAdded,
  onClose,
  onAdded,
}: {
  campaignId: string;
  alreadyAdded: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { procedures } = useProceduresStore();
  const [tree, setTree] = useState<TaxonomyNode[]>([]);
  const [selectedTaxId, setSelectedTaxId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [showUnclassified, setShowUnclassified] = useState(false);

  useEffect(() => {
    taxonomyApi.getTree()
      .then(res => setTree(res.tree))
      .catch(() => {})
      .finally(() => setTreeLoading(false));
  }, []);

  // Compte par nœud taxonomique (récursif)
  const procedureCountByTaxonomy = useMemo(() => {
    const counts: Record<string, number> = {};
    const countNode = (nodeId: string): number => {
      // Procédures directement liées
      const direct = procedures.filter(p => p.taxonomy_id === nodeId && !alreadyAdded.has(p.id)).length;
      // + récursif dans les enfants (on compte depuis les procedures)
      counts[nodeId] = direct;
      return direct;
    };
    const walkTree = (nodes: TaxonomyNode[]) => {
      for (const n of nodes) {
        countNode(n.id);
        if (n.children?.length) walkTree(n.children);
      }
    };
    walkTree(tree);
    return counts;
  }, [tree, procedures, alreadyAdded]);

  // Procédures filtrées selon le nœud sélectionné et la recherche
  const filteredProcedures = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base: Procedure[];

    if (showUnclassified) {
      base = procedures.filter(p => !p.taxonomy_id && !alreadyAdded.has(p.id));
    } else if (selectedTaxId) {
      // Nœud sélectionné + tous ses descendants
      const allIds = new Set<string>();
      const collectIds = (nodes: TaxonomyNode[]) => {
        for (const n of nodes) {
          allIds.add(n.id);
          if (n.children?.length) collectIds(n.children);
        }
      };
      const findNode = (nodes: TaxonomyNode[], id: string): TaxonomyNode | null => {
        for (const n of nodes) {
          if (n.id === id) return n;
          const found = findNode(n.children ?? [], id);
          if (found) return found;
        }
        return null;
      };
      const node = findNode(tree, selectedTaxId);
      if (node) collectIds([node]);
      base = procedures.filter(p => p.taxonomy_id && allIds.has(p.taxonomy_id) && !alreadyAdded.has(p.id));
    } else {
      base = procedures.filter(p => !alreadyAdded.has(p.id));
    }

    if (!q) return base;
    return base.filter(p =>
      p.nom.toLowerCase().includes(q) ||
      (p.ref ?? '').toLowerCase().includes(q) ||
      (p.category ?? '').toLowerCase().includes(q)
    );
  }, [procedures, selectedTaxId, showUnclassified, query, alreadyAdded, tree]);

  const unclassifiedCount = useMemo(() =>
    procedures.filter(p => !p.taxonomy_id && !alreadyAdded.has(p.id)).length,
    [procedures, alreadyAdded]
  );

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const selectAll = () => setSelected(new Set(filteredProcedures.map(p => p.id)));
  const clearAll = () => setSelected(new Set());

  const handleAdd = async () => {
    if (!selected.size) return;
    setSaving(true); setError(null);
    try {
      await campaignsApi.addProcedures(campaignId, [...selected]);
      onAdded();
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); }
    finally { setSaving(false); }
  };

  const statusColor = (s: string) =>
    s === 'Validée' ? 'bg-green-100 text-green-700' :
    s === 'En cours' ? 'bg-blue-100 text-blue-700' :
    s === 'En validation' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
          <h3 className="text-base font-bold text-gray-900">Ajouter des procédures à la campagne</h3>
          <button type="button" title="Fermer" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Arbre taxonomique */}
          <div className="w-64 shrink-0 border-r border-gray-100 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Filtrer par domaine</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              <button type="button" onClick={() => { setSelectedTaxId(null); setShowUnclassified(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-sm transition-colors ${
                  !selectedTaxId && !showUnclassified ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50 text-gray-600'
                }`}>
                <Layers className="w-3.5 h-3.5 text-gray-400" />
                <span>Toutes les procédures</span>
                <span className="ml-auto text-xs text-gray-400">{procedures.filter(p => !alreadyAdded.has(p.id)).length}</span>
              </button>

              {treeLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
              ) : (
                tree.map(node => (
                  <TaxonomyTreeNode
                    key={node.id}
                    node={node}
                    selectedId={selectedTaxId}
                    onSelect={id => { setSelectedTaxId(id); setShowUnclassified(false); }}
                    procedureCountByTaxonomy={procedureCountByTaxonomy}
                  />
                ))
              )}

              {unclassifiedCount > 0 && (
                <button type="button" onClick={() => { setShowUnclassified(true); setSelectedTaxId(null); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-sm transition-colors ${
                    showUnclassified ? 'bg-amber-50 text-amber-700 font-semibold' : 'hover:bg-gray-50 text-gray-500'
                  }`}>
                  <span className="w-3.5 h-3.5" />
                  <Tag className="w-3.5 h-3.5 text-amber-400" />
                  <span>Non classées</span>
                  <span className="ml-auto text-xs text-gray-400">{unclassifiedCount}</span>
                </button>
              )}
            </div>
          </div>

          {/* Liste procédures */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-100 flex items-center gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input title="Rechercher" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Nom, référence, domaine…"
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="button" onClick={selectAll} className="text-xs text-blue-600 hover:underline font-medium px-2">Tout sélect.</button>
              <button type="button" onClick={clearAll} className="text-xs text-gray-500 hover:underline px-2">Effacer</button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredProcedures.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                  <p className="text-sm">{procedures.length === 0 ? 'Aucune procédure disponible' : 'Aucun résultat dans ce domaine'}</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Procédure</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Réf.</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Statut actuel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredProcedures.map(p => (
                      <tr key={p.id} onClick={() => toggle(p.id)}
                        className={`cursor-pointer hover:bg-gray-50 transition-colors ${selected.has(p.id) ? 'bg-blue-50' : ''}`}>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-800 truncate max-w-[220px]">{p.nom}</p>
                          {p.category && <p className="text-xs text-gray-400 truncate">{p.category}</p>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 font-mono">{p.ref || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(p.status)}`}>{p.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {error && <p className="px-5 py-2 text-xs text-red-600 shrink-0 border-t border-gray-100">{error}</p>}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 shrink-0">
          <span className="text-xs text-gray-500">{selected.size} procédure(s) sélectionnée(s)</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Annuler</button>
            <button type="button" onClick={handleAdd} disabled={saving || !selected.size}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Ajouter {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Détail d'une campagne ────────────────────────────────────

function CampaignDetail({
  campaign, onRefresh, onDelete, onOpenProcedure,
}: {
  campaign: Campaign;
  onRefresh: () => void;
  onDelete: () => void;
  onOpenProcedure?: (id: string) => void;
}) {
  const { profile } = useAuth();
  const { procedures: allProcedures } = useProceduresStore();
  const isAdmin = profile?.global_role === 'admin';
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<CampaignProcedureStatus | 'all'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const alreadyAdded = useMemo(() =>
    new Set((campaign.procedures ?? []).map(p => p.procedure_id)),
    [campaign.procedures]
  );

  // Enrichit les campaign_procedures avec les données réelles du store
  const enrichedProcedures = useMemo(() => {
    return (campaign.procedures ?? []).map(cp => {
      const real = allProcedures.find(p => p.id === cp.procedure_id);
      const lc = (cp as any).lifecycle as LifecycleSnapshot | null;
      return { cp, real, lc };
    });
  }, [campaign.procedures, allProcedures]);

  const filtered = useMemo(() => {
    return enrichedProcedures.filter(({ cp, real }) => {
      const matchStatus = filterStatus === 'all' || cp.status === filterStatus;
      const q = search.trim().toLowerCase();
      const name = cp.procedure_nom || real?.nom || '';
      const ref = cp.procedure_ref || real?.ref || '';
      const matchSearch = !q || name.toLowerCase().includes(q) || ref.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [enrichedProcedures, filterStatus, search]);

  const handleStatusChange = async (cp: CampaignProcedure, status: CampaignProcedureStatus) => {
    setUpdatingId(cp.procedure_id);
    try { await campaignsApi.updateProcedure(campaign.id, cp.procedure_id, { status }); onRefresh(); }
    finally { setUpdatingId(null); }
  };

  const handleRemove = async (cp: CampaignProcedure) => {
    if (!confirm(`Retirer "${cp.procedure_nom}" de la campagne ?`)) return;
    setUpdatingId(cp.procedure_id);
    try { await campaignsApi.removeProcedure(campaign.id, cp.procedure_id); onRefresh(); }
    finally { setUpdatingId(null); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try { await campaignsApi.sync(campaign.id); onRefresh(); }
    finally { setSyncing(false); }
  };

  const handleLaunch = async () => {
    if (!confirm('Lancer cette campagne ?')) return;
    setActionLoading(true);
    try { await campaignsApi.launch(campaign.id); onRefresh(); }
    finally { setActionLoading(false); }
  };

  const handleClose = async () => {
    if (!confirm('Clôturer cette campagne ?')) return;
    setActionLoading(true);
    try { await campaignsApi.close(campaign.id); onRefresh(); }
    finally { setActionLoading(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Supprimer définitivement "${campaign.title}" ?`)) return;
    setActionLoading(true);
    try { await campaignsApi.delete(campaign.id); onDelete(); }
    finally { setActionLoading(false); }
  };

  const stats = campaign.stats;
  const isOverdue = campaign.end_date && campaign.status === 'active' && new Date(campaign.end_date) < new Date();

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="shrink-0 p-5 bg-white border-b border-gray-100">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1.5 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900">{campaign.title}</h2>
              <StatusBadge status={campaign.status} />
              {isOverdue && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                  <AlertCircle className="w-3 h-3" /> En retard
                </span>
              )}
            </div>
            {campaign.description && <p className="text-sm text-gray-500 mb-2">{campaign.description}</p>}
            <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
              {campaign.start_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(campaign.start_date).toLocaleDateString('fr-FR')}</span>}
              {campaign.end_date && (
                <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500 font-semibold' : ''}`}>
                  <Flag className="w-3 h-3" /> {new Date(campaign.end_date).toLocaleDateString('fr-FR')}
                </span>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button type="button" onClick={handleSync} disabled={syncing} title="Synchroniser avec le cycle de vie réel"
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50">
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Synchroniser
              </button>
              {campaign.status === 'draft' && (
                <button type="button" onClick={handleLaunch} disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                  Lancer
                </button>
              )}
              {campaign.status === 'active' && (
                <button type="button" onClick={handleClose} disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5" />}
                  Clôturer
                </button>
              )}
              <button type="button" title="Supprimer la campagne" onClick={handleDelete} disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Progression globale */}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span className="font-semibold text-gray-700">Progression de la campagne</span>
            <span className="font-bold text-gray-800">{stats.progress_pct}%</span>
          </div>
          <ProgressBar pct={stats.progress_pct} />
          <div className="flex items-center gap-5 mt-2 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" />{stats.done} formalisée(s)</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />{stats.in_progress} en cours</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300" />{stats.pending} en attente</span>
            <span className="ml-auto font-semibold text-gray-700">{stats.total} procédure(s)</span>
          </div>
        </div>
      </div>

      {/* Barre d'outils */}
      <div className="shrink-0 px-5 py-3 bg-white border-b border-gray-100 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input title="Rechercher" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une procédure…"
            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select title="Filtrer par statut" value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">Tous les statuts</option>
          {(Object.keys(PROC_STATUS_LABELS) as CampaignProcedureStatus[]).map(s => (
            <option key={s} value={s}>{PROC_STATUS_LABELS[s]}</option>
          ))}
        </select>
        {isAdmin && campaign.status !== 'completed' && campaign.status !== 'archived' && (
          <button type="button" onClick={() => setShowAddModal(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Ajouter des procédures
          </button>
        )}
      </div>

      {/* Table procédures */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <FileText className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">{(campaign.procedures ?? []).length === 0 ? 'Aucune procédure dans cette campagne' : 'Aucun résultat'}</p>
            {isAdmin && (campaign.procedures ?? []).length === 0 && (
              <button type="button" onClick={() => setShowAddModal(true)} className="mt-3 text-sm text-blue-600 hover:underline font-medium">
                + Ajouter des procédures
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-gray-100 sticky top-0">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[30%]">Procédure</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cycle de vie</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut workflow</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut campagne</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Terminée</th>
                {isAdmin && <th className="px-3 py-3 w-16" scope="col"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(({ cp, real, lc }) => {
                const name = cp.procedure_nom || real?.nom || '—';
                const ref = cp.procedure_ref || real?.ref || '';
                const workflowStatus = lc?.workflow_status || real?.status || '—';
                const stages = lc?.lifecycle_stages || real?.lifecycle_stages || [];
                const wfStatusColor = workflowStatus === 'Validée' ? 'bg-green-100 text-green-700' :
                  workflowStatus === 'En cours' ? 'bg-blue-100 text-blue-700' :
                  workflowStatus === 'En validation' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600';
                return (
                  <tr key={cp.id} className="bg-white hover:bg-gray-50 transition-colors group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">{name}</p>
                          {ref && <p className="text-xs text-gray-400 font-mono">{ref}</p>}
                        </div>
                        {onOpenProcedure && (
                          <button type="button" title="Ouvrir la procédure"
                            onClick={() => onOpenProcedure(cp.procedure_id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-blue-50 text-blue-500 transition-all shrink-0">
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {stages.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          <LifecycleBar stages={stages} />
                          <p className="text-xs text-gray-400">
                            {stages.filter((s: any) => s.status === 'completed').length}/{stages.length} étapes
                          </p>
                        </div>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${wfStatusColor}`}>{workflowStatus}</span>
                    </td>
                    <td className="px-3 py-3">
                      {isAdmin && campaign.status !== 'archived' ? (
                        <select title="Statut campagne" value={cp.status}
                          onChange={e => handleStatusChange(cp, e.target.value as CampaignProcedureStatus)}
                          disabled={updatingId === cp.procedure_id}
                          className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer focus:ring-2 focus:ring-blue-500 ${PROC_STATUS_COLORS[cp.status].bg} ${PROC_STATUS_COLORS[cp.status].text}`}>
                          {(Object.keys(PROC_STATUS_LABELS) as CampaignProcedureStatus[]).map(s => (
                            <option key={s} value={s}>{PROC_STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      ) : <ProcStatusBadge status={cp.status} />}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-400">
                      {cp.completed_at ? new Date(cp.completed_at).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-3">
                        {updatingId === cp.procedure_id
                          ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          : <button type="button" title="Retirer de la campagne" onClick={() => handleRemove(cp)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-all">
                            <X className="w-4 h-4" />
                          </button>
                        }
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <AddProceduresModal campaignId={campaign.id} alreadyAdded={alreadyAdded}
          onClose={() => setShowAddModal(false)}
          onAdded={() => { setShowAddModal(false); onRefresh(); }} />
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────

interface CampaignsPanelProps {
  onOpenProcedure?: (id: string) => void;
}

export default function CampaignsPanel({ onOpenProcedure }: CampaignsPanelProps) {
  const { profile } = useAuth();
  const { fetchProcedures } = useProceduresStore();
  const isAdmin = profile?.global_role === 'admin';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<CampaignStatus | 'all'>('all');

  const loadCampaigns = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await campaignsApi.list();
      setCampaigns(res.campaigns);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  }, []);

  const refreshActive = useCallback(async () => {
    if (!activeCampaign) return;
    try {
      const res = await campaignsApi.get(activeCampaign.id);
      setActiveCampaign(res.campaign);
      setCampaigns(prev => prev.map(c => c.id === res.campaign.id
        ? { ...c, stats: res.campaign.stats, status: res.campaign.status } : c));
    } catch { /* silent */ }
  }, [activeCampaign]);

  useEffect(() => { loadCampaigns(); fetchProcedures(); }, []);

  const filteredCampaigns = useMemo(() => campaigns.filter(c => {
    const matchStatus = filterStatus === 'all' || c.status === filterStatus;
    const q = search.trim().toLowerCase();
    return matchStatus && (!q || c.title.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q));
  }), [campaigns, filterStatus, search]);

  const globalStats = useMemo(() => ({
    total: campaigns.length,
    active: campaigns.filter(c => c.status === 'active').length,
    completed: campaigns.filter(c => c.status === 'completed').length,
    doneProcs: campaigns.reduce((a, c) => a + c.stats.done, 0),
    totalProcs: campaigns.reduce((a, c) => a + c.stats.total, 0),
  }), [campaigns]);

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Liste ── */}
      <div className="w-72 shrink-0 flex flex-col border-r border-gray-100 bg-white">
        <div className="shrink-0 p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
                <BarChart2 className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-base font-bold text-gray-900">Campagnes</h1>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={loadCampaigns} title="Actualiser"
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><RefreshCw className="w-3.5 h-3.5" /></button>
              {isAdmin && (
                <button type="button" onClick={() => setShowCreate(true)}
                  className="p-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600"><Plus className="w-3.5 h-3.5" /></button>
              )}
            </div>
          </div>

          {!loading && campaigns.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[
                { label: 'Total', value: globalStats.total, color: 'text-gray-700' },
                { label: 'Actives', value: globalStats.active, color: 'text-blue-600' },
                { label: 'Terminées', value: globalStats.completed, color: 'text-green-600' },
              ].map(s => (
                <div key={s.label} className="text-center bg-gray-50 rounded-lg py-1.5">
                  <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input title="Rechercher" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <select title="Filtrer par statut" value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="all">Tous les statuts</option>
            {(['draft', 'active', 'completed', 'archived'] as CampaignStatus[]).map(s => (
              <option key={s} value={s}>{CAMPAIGN_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {loading ? (
            <div className="flex items-center justify-center h-24"><Loader2 className="w-5 h-5 animate-spin text-orange-400" /></div>
          ) : error ? (
            <div className="p-4 text-center">
              <p className="text-xs text-red-500">{error}</p>
              <button type="button" onClick={loadCampaigns} className="mt-2 text-xs text-blue-600 hover:underline">Réessayer</button>
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <FolderOpen className="w-7 h-7 mb-2 opacity-30" />
              <p className="text-xs">{campaigns.length === 0 ? 'Aucune campagne' : 'Aucun résultat'}</p>
              {isAdmin && campaigns.length === 0 && (
                <button type="button" onClick={() => setShowCreate(true)} className="mt-2 text-xs text-orange-500 hover:underline font-medium">
                  Créer la première campagne
                </button>
              )}
            </div>
          ) : filteredCampaigns.map(c => {
            const isActive = activeCampaign?.id === c.id;
            const overdue = c.end_date && c.status === 'active' && new Date(c.end_date) < new Date();
            return (
              <button key={c.id} type="button"
                onClick={async () => {
                  if (isActive) return;
                  setActiveCampaign({ ...c, procedures: [] });
                  const res = await campaignsApi.get(c.id).catch(() => null);
                  if (res) setActiveCampaign(res.campaign);
                }}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  isActive ? 'bg-orange-50 border-orange-200 shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className={`text-xs font-semibold leading-snug ${isActive ? 'text-orange-900' : 'text-gray-800'} line-clamp-2`}>{c.title}</p>
                  <StatusBadge status={c.status} />
                </div>
                <ProgressBar pct={c.stats.progress_pct} size="sm" color={c.stats.progress_pct >= 100 ? 'bg-green-500' : 'bg-orange-400'} />
                <div className="flex items-center justify-between mt-1.5 text-xs text-gray-400">
                  <span>{c.stats.done}/{c.stats.total} proc.</span>
                  <span className="font-semibold text-gray-600">{c.stats.progress_pct}%</span>
                </div>
                {c.end_date && (
                  <div className={`flex items-center gap-1 mt-1 text-xs ${overdue ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                    <Clock className="w-3 h-3" />
                    {overdue ? 'En retard · ' : ''}{new Date(c.end_date).toLocaleDateString('fr-FR')}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Détail ── */}
      <div className="flex-1 overflow-hidden">
        {activeCampaign ? (
          <CampaignDetail key={activeCampaign.id} campaign={activeCampaign}
            onRefresh={refreshActive}
            onDelete={() => { setActiveCampaign(null); loadCampaigns(); }}
            onOpenProcedure={onOpenProcedure}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center mb-4">
              <BarChart2 className="w-8 h-8 text-orange-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">Sélectionne une campagne</p>
            <p className="text-xs text-gray-400 mt-1">ou crée-en une nouvelle</p>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateCampaignModal onClose={() => setShowCreate(false)}
          onCreated={c => { setShowCreate(false); setCampaigns(prev => [c, ...prev]); setActiveCampaign(c); }} />
      )}
    </div>
  );
}

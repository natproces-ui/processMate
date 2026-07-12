'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle, ArrowLeft, BookOpen, CheckCircle2, ChevronDown, ChevronRight,
  Clock, ExternalLink, FileSearch, FileText, Filter, FolderOpen, History,
  Layers, Loader2, Megaphone, PenLine, Plus, RefreshCw, RotateCcw, Search,
  Tag, Trash2, Upload, Wand2, X,
} from 'lucide-react';
import { orchestrationApi, type Procedure, type LifecycleStage, type Remark as OrcheRemark } from '@/lib/orchestrationApi';
import {
  orchestrationTasksApi,
  type EnrichedTask, type EnrichedTaskEvent, type ProcedureTask,
  type ProcedureTaskStatus, type TaskActor,
} from '@/lib/orchestrationTasksApi';
import TaskTimeline from '@/components/orchestration/tasks/TaskTimeline';
import {
  campaignsApi, type Campaign, type CampaignProcedure, type CampaignProcedureStatus,
  type CampaignStatus,
  CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_COLORS, PROC_STATUS_LABELS, PROC_STATUS_COLORS,
} from '@/lib/campaignsApi';
import { taxonomyApi, type TaxonomyNode } from '@/lib/taxonomyApi';
import { useProceduresStore } from '@/store/proceduresStore';
import {
  workspaceApi,
  type RevisionSession, type RevisionPoint, type RevisionPointStatus,
  DIAGNOSTIC_CONFIG, POINT_TYPE_LABELS, POINT_TYPE_COLORS, CRIT_BADGE,
} from '@/lib/workspaceApi';
import {
  correctionsApi,
  type CorrectionsSession, type Remark, type RemarkStatus,
  REMARK_TYPE_LABELS, REMARK_TYPE_COLORS, CRITICITE_COLORS,
} from '@/lib/correctionsApi';
import { useAuth } from '@/context/AuthContext';
import TaskActionBar from '@/components/orchestration/tasks/TaskActionBar';

const ProcedureEditor = dynamic(
  () => import('@/components/orchestration/ProcedureEditor'),
  { loading: () => <div className="flex items-center justify-center h-full text-gray-300 text-xs"><Loader2 className="w-4 h-4 animate-spin mr-2" />Chargement…</div> }
);

const str = (v: unknown): string => (v == null ? '' : String(v));

// ─── Types ──────────────────────────────────────────────────────

interface TaxNode { id: string; name: string; level: string; parent_id: string | null }

type TabMode = 'detail' | 'editor';
type WorkspaceTab =
  | { id: 'backlog'; type: 'backlog' }
  | { id: 'activity'; type: 'activity' }
  | { id: string; type: 'task'; task: EnrichedTask; mode: TabMode; procedure?: Procedure }
  | { id: string; type: 'campaign'; campaign: Campaign }
  | { id: string; type: 'editor'; procedureId: string; procedure?: Procedure; procedureName?: string };

interface LeftFilter {
  label: string;
  filterType: 'campaign' | 'node';
  campaignId?: string;
  procedureIds?: Set<string>;
}

type ActiveTool = 'none' | 'revision' | 'corrections';

interface WsProcItem { procedureId: string; procedureName: string }
interface WsSubcatGroup { subcategoryId: string; subcategoryName: string; procedures: WsProcItem[] }
interface WsCatGroup { categoryId: string; categoryName: string; subcategories: WsSubcatGroup[] }
interface WsThemeGroup { themeId: string; themeName: string; categories: WsCatGroup[] }

// ─── Constants ──────────────────────────────────────────────────

const TASK_STATUS_LABELS: Record<ProcedureTaskStatus, string> = {
  todo:               'À faire',
  in_progress:        'En cours',
  submitted:          'Soumis',
  changes_requested:  'Corrections',
  waiting_info:       'En attente',
  blocked:            'Bloqué',
  completed:          'Terminé',
  validated:          'Validé',
  cancelled:          'Annulé',
};

const TASK_STATUS_COLORS: Record<ProcedureTaskStatus, string> = {
  todo:               'bg-gray-100 text-gray-600',
  in_progress:        'bg-blue-50 text-blue-700',
  submitted:          'bg-indigo-50 text-indigo-700',
  changes_requested:  'bg-orange-50 text-orange-700',
  waiting_info:       'bg-yellow-50 text-yellow-700',
  blocked:            'bg-red-50 text-red-700',
  completed:          'bg-green-50 text-green-700',
  validated:          'bg-emerald-50 text-emerald-700',
  cancelled:          'bg-gray-50 text-gray-400',
};

const TASK_TYPE_LABELS: Record<string, string> = {
  formalization: 'Formalisation',
  review:        'Vérification',
  validation:    'Validation',
  consultation:  'Consultation',
  information:   'Information',
  correction:    'Correction',
  other:         'Autre',
};

const PRIO_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high:   'bg-orange-100 text-orange-700',
  normal: 'bg-gray-100 text-gray-600',
  low:    'bg-blue-50 text-blue-600',
};

// ─── buildCampaignTree ─────────────────────────────────────────

function buildCampaignTree(
  campaign: Campaign,
  taxNodes: TaxNode[],
  storeProcedures: { id: string; taxonomy_id?: string | null }[],
): WsThemeGroup[] {
  const procs = campaign.procedures ?? [];
  if (!procs.length || !taxNodes.length) return [];

  const byId: Record<string, TaxNode> = {};
  taxNodes.forEach(n => { byId[n.id] = n; });

  const ancestor = (taxId: string | null | undefined, level: string): TaxNode | null => {
    let node = byId[taxId ?? ''];
    while (node) {
      if (node.level === level) return node;
      node = byId[node.parent_id ?? ''];
    }
    return null;
  };

  const themeMap: Record<string, WsThemeGroup> = {};
  procs.forEach(cp => {
    const taxId = storeProcedures.find(p => p.id === cp.procedure_id)?.taxonomy_id;
    const theme  = ancestor(taxId, 'theme');
    const cat    = ancestor(taxId, 'category');
    const subcat = ancestor(taxId, 'subcategory');
    const themeId  = theme?.id  ?? '__unclassified__';
    const catId    = cat?.id    ?? '__none__';
    const subcatId = subcat?.id ?? catId;

    if (!themeMap[themeId]) themeMap[themeId] = { themeId, themeName: theme?.name ?? 'Non classifié', categories: [] };
    let catGroup = themeMap[themeId].categories.find(c => c.categoryId === catId);
    if (!catGroup) { catGroup = { categoryId: catId, categoryName: cat?.name ?? 'Général', subcategories: [] }; themeMap[themeId].categories.push(catGroup); }
    let subcatGroup = catGroup.subcategories.find(s => s.subcategoryId === subcatId);
    if (!subcatGroup) { subcatGroup = { subcategoryId: subcatId, subcategoryName: subcat?.name ?? cat?.name ?? 'Général', procedures: [] }; catGroup.subcategories.push(subcatGroup); }
    subcatGroup.procedures.push({ procedureId: cp.procedure_id, procedureName: cp.procedure_nom ?? 'Procédure' });
  });

  return Object.values(themeMap);
}

// ─── CampaignDrilldown ────────────────────────────────────────

function CampaignDrilldown({
  campaign, taxNodes, storeProcedures, onOpenProcedure, isAdmin, onRefreshCampaign,
}: {
  campaign: Campaign;
  taxNodes: TaxNode[];
  storeProcedures: { id: string; taxonomy_id?: string | null }[];
  onOpenProcedure: (id: string) => void;
  isAdmin: boolean;
  onRefreshCampaign: () => void;
}) {
  const [path, setPath] = useState<Array<{ id: string; name: string }>>([]);
  const [actioning, setActioning] = useState(false);
  const [showAddProcs, setShowAddProcs] = useState(false);
  const tree = useMemo(() => buildCampaignTree(campaign, taxNodes, storeProcedures), [campaign, taxNodes, storeProcedures]);

  const stats = campaign.stats;
  const procCount = (campaign.procedures ?? []).length;
  const sc = CAMPAIGN_STATUS_COLORS[campaign.status];
  const alreadyAdded = useMemo(() => new Set((campaign.procedures ?? []).map(p => p.procedure_id)), [campaign.procedures]);
  const canAddProcs = isAdmin && campaign.status !== 'completed' && campaign.status !== 'archived';

  const doAction = async (fn: () => Promise<any>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setActioning(true);
    try { await fn(); onRefreshCampaign(); }
    finally { setActioning(false); }
  };

  type Item =
    | { kind: 'theme';      data: WsThemeGroup }
    | { kind: 'category';   data: WsCatGroup }
    | { kind: 'subcategory'; data: WsSubcatGroup }
    | { kind: 'procedure';  data: WsProcItem };

  const items: Item[] = useMemo(() => {
    if (path.length === 0) return tree.map(t => ({ kind: 'theme' as const, data: t }));
    if (path.length === 1) {
      const th = tree.find(t => t.themeId === path[0].id);
      return (th?.categories ?? []).map(c => ({ kind: 'category' as const, data: c }));
    }
    if (path.length === 2) {
      const th = tree.find(t => t.themeId === path[0].id);
      const ca = th?.categories.find(c => c.categoryId === path[1].id);
      return (ca?.subcategories ?? []).map(s => ({ kind: 'subcategory' as const, data: s }));
    }
    const th = tree.find(t => t.themeId === path[0].id);
    const ca = th?.categories.find(c => c.categoryId === path[1].id);
    const sc = ca?.subcategories.find(s => s.subcategoryId === path[2].id);
    return (sc?.procedures ?? []).map(p => ({ kind: 'procedure' as const, data: p }));
  }, [path, tree]);

  const handleClick = (item: Item) => {
    if (item.kind === 'procedure') { onOpenProcedure(item.data.procedureId); return; }
    if (item.kind === 'theme')      setPath([{ id: item.data.themeId,       name: item.data.themeName }]);
    if (item.kind === 'category')   setPath(p => [p[0], { id: item.data.categoryId,   name: item.data.categoryName }]);
    if (item.kind === 'subcategory') setPath(p => [...p.slice(0, 2), { id: item.data.subcategoryId, name: item.data.subcategoryName }]);
  };

  const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    theme: FolderOpen, category: Tag, subcategory: Layers, procedure: FileText,
  };
  const ICON_COLORS: Record<string, string> = {
    theme: 'text-indigo-400', category: 'text-blue-400', subcategory: 'text-violet-400', procedure: 'text-gray-400',
  };
  const countLabel = (item: Item) =>
    item.kind === 'theme'      ? `${item.data.categories.length} catégorie(s)` :
    item.kind === 'category'   ? `${item.data.subcategories.length} sous-cat.` :
    item.kind === 'subcategory'? `${item.data.procedures.length} procédure(s)` : '';
  const itemName = (item: Item) =>
    item.kind === 'theme'      ? item.data.themeName :
    item.kind === 'category'   ? item.data.categoryName :
    item.kind === 'subcategory'? item.data.subcategoryName : item.data.procedureName;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      {/* Campaign header with stats + actions */}
      <div className="shrink-0 bg-white border-b border-gray-100">
        {/* Status + stats bar */}
        <div className="px-5 pt-4 pb-2 flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
            {CAMPAIGN_STATUS_LABELS[campaign.status]}
          </span>
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            <span>{procCount} procédures</span>
            <span>·</span>
            <span className="font-semibold text-gray-700">{stats.progress_pct}%</span>
            <span className="text-gray-400">({stats.done} formalisée{stats.done !== 1 ? 's' : ''})</span>
          </div>
          <div className="h-1.5 flex-1 min-w-[80px] bg-gray-100 rounded-full overflow-hidden">
            <div className="h-1.5 bg-orange-400 rounded-full transition-all" style={{ width: `${stats.progress_pct}%` }} />
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              {canAddProcs && (
                <button type="button" onClick={() => setShowAddProcs(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  <Plus className="w-3 h-3" /> Ajouter procédures
                </button>
              )}
              {campaign.status === 'draft' && (
                <button type="button" onClick={() => doAction(() => campaignsApi.launch(campaign.id), 'Lancer ce projet ?')} disabled={actioning}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Lancer</button>
              )}
              {campaign.status === 'active' && (
                <>
                  <button type="button" onClick={() => doAction(() => campaignsApi.close(campaign.id), 'Clôturer ?')} disabled={actioning}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">Clôturer</button>
                  <button type="button" onClick={() => doAction(() => campaignsApi.pause(campaign.id), 'Pause ?')} disabled={actioning}
                    className="px-2.5 py-1 text-[11px] font-semibold border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-50 disabled:opacity-50">Pause</button>
                  <button type="button" onClick={() => doAction(() => campaignsApi.block(campaign.id), 'Bloquer ?')} disabled={actioning}
                    className="px-2.5 py-1 text-[11px] font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">Bloquer</button>
                </>
              )}
              {(campaign.status === 'blocked' || campaign.status === 'on_hold') && (
                <button type="button" onClick={() => doAction(() => campaignsApi.resume(campaign.id))} disabled={actioning}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Reprendre</button>
              )}
              <button type="button" onClick={() => doAction(() => campaignsApi.sync(campaign.id))} disabled={actioning} title="Synchroniser"
                className="p-1 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                {actioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              </button>
            </div>
          )}
        </div>
        {/* Breadcrumb */}
        <div className="px-5 py-2 flex items-center gap-1.5 flex-wrap border-t border-gray-50">
          <button onClick={() => setPath([])}
            className={`text-sm ${path.length === 0 ? 'font-bold text-gray-900' : 'text-blue-600 hover:underline font-medium'}`}>
            {campaign.title}
          </button>
          {path.map((p, i) => (
            <React.Fragment key={p.id}>
              <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              <button onClick={() => setPath(prev => prev.slice(0, i + 1))}
                className={`text-sm truncate max-w-[160px] ${i === path.length - 1 ? 'font-bold text-gray-900' : 'text-blue-600 hover:underline font-medium'}`}>
                {p.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>
      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <FileText className="w-8 h-8 mb-2 text-gray-200" />
            <p className="text-sm">Aucune procédure dans cette campagne</p>
            {canAddProcs && (
              <button type="button" onClick={() => setShowAddProcs(true)}
                className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="w-4 h-4" /> Ajouter des procédures
              </button>
            )}
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <p className="text-sm">Aucun élément à ce niveau</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map((item, idx) => {
              const Icon = ICONS[item.kind];
              const name = itemName(item);
              const count = countLabel(item);
              return (
                <button key={idx} type="button" onClick={() => handleClick(item)}
                  className="text-left bg-white rounded-xl border border-gray-100 p-4 hover:border-blue-200 hover:shadow-sm transition-all group">
                  <div className="flex items-start gap-3">
                    <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${ICON_COLORS[item.kind]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 leading-snug group-hover:text-blue-700 line-clamp-2">{name}</p>
                      {count && <p className="text-xs text-gray-400 mt-0.5">{count}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 shrink-0 mt-0.5" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {showAddProcs && (
        <HierarchicalPicker campaignId={campaign.id} alreadyAdded={alreadyAdded}
          onClose={() => setShowAddProcs(false)}
          onAdded={() => { setShowAddProcs(false); onRefreshCampaign(); }} />
      )}
    </div>
  );
}

// ─── HierarchicalPicker ───────────────────────────────────────

function HierarchicalPicker({
  campaignId, alreadyAdded, onClose, onAdded,
}: {
  campaignId: string;
  alreadyAdded: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { procedures: allProcs } = useProceduresStore();
  const [tree, setTree] = useState<TaxonomyNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [path, setPath] = useState<Array<{ id: string; name: string; level: string }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    taxonomyApi.getTree().then(r => setTree(r.tree)).catch(() => {}).finally(() => setTreeLoading(false));
  }, []);

  const LEVEL_SEQ = ['theme', 'category', 'subcategory', 'procedure'] as const;
  const currentLevel = LEVEL_SEQ[Math.min(path.length, 3)];

  const FR_LEVEL: Record<string, string> = {
    theme: 'Thème', category: 'Catégorie', subcategory: 'Sous-catégorie', procedure: 'Procédure',
  };
  const FR_NEXT: Record<string, string> = {
    theme: 'catégorie', category: 'sous-catégorie', subcategory: 'procédure', procedure: '',
  };

  const currentItems = useMemo(() => {
    if (currentLevel === 'theme') return tree;
    if (currentLevel === 'category') return tree.find(t => t.id === path[0].id)?.children ?? [];
    if (currentLevel === 'subcategory') {
      return tree.find(t => t.id === path[0].id)?.children.find(c => c.id === path[1].id)?.children ?? [];
    }
    const subcatId = path[2]?.id;
    return allProcs.filter(p => p.taxonomy_id === subcatId && !alreadyAdded.has(p.id));
  }, [tree, path, currentLevel, allProcs, alreadyAdded]);

  function getLeafIds(node: TaxonomyNode): string[] {
    return !node.children?.length ? [node.id] : node.children.flatMap(c => getLeafIds(c));
  }

  function procsUnder(nodeId: string): string[] {
    const find = (nodes: TaxonomyNode[]): TaxonomyNode | null => {
      for (const n of nodes) { if (n.id === nodeId) return n; const f = find(n.children ?? []); if (f) return f; }
      return null;
    };
    const node = find(tree);
    if (!node) return [];
    const leaves = new Set(getLeafIds(node));
    return allProcs.filter(p => p.taxonomy_id && leaves.has(p.taxonomy_id) && !alreadyAdded.has(p.id)).map(p => p.id);
  }

  const handleAdd = async () => {
    const ids = currentLevel === 'procedure' ? [...selected] : [...new Set([...selected].flatMap(id => procsUnder(id)))];
    if (!ids.length) { setErr('Aucune procédure dans la sélection'); return; }
    setSaving(true); setErr(null);
    try { await campaignsApi.addProcedures(campaignId, ids); onAdded(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Erreur'); setSaving(false); }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true); setErr(null);
    const parentId = path.length > 0 ? path[path.length - 1].id : undefined;
    try {
      if (currentLevel === 'procedure') {
        const res = await orchestrationApi.createProcedure({ nom: newName.trim(), taxonomy_id: parentId });
        await campaignsApi.addProcedures(campaignId, [res.procedure.id]);
        onAdded();
      } else {
        const res = await taxonomyApi.create({
          name: newName.trim(),
          level: currentLevel as 'theme' | 'category' | 'subcategory',
          parent_id: parentId ?? null,
        });
        const fresh = await taxonomyApi.getTree();
        setTree(fresh.tree);
        setCreating(false); setNewName('');
        setPath(prev => [...prev, { id: res.node.id, name: res.node.name, level: currentLevel }]);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Ajouter à la campagne</h3>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <button onClick={() => { setPath([]); setSelected(new Set()); }}
                className="text-xs text-blue-600 hover:underline font-medium">Racine</button>
              {path.map((p, i) => (
                <React.Fragment key={p.id}>
                  <ChevronRight className="w-3 h-3 text-gray-300" />
                  <button onClick={() => { setPath(prev => prev.slice(0, i + 1)); setSelected(new Set()); }}
                    className={`text-xs truncate max-w-[120px] ${i === path.length - 1 ? 'font-bold text-gray-800' : 'text-blue-600 hover:underline font-medium'}`}>
                    {p.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
          <button type="button" title="Fermer" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0"><X className="w-4 h-4" /></button>
        </div>
        {/* Level badge */}
        <div className="shrink-0 px-5 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-full px-2.5 py-0.5">
            {FR_LEVEL[currentLevel]}
          </span>
          {currentLevel !== 'procedure' && (
            <span className="text-xs text-gray-400">Cochez pour tout sélectionner, ou cliquez Descendre</span>
          )}
        </div>
        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {treeLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : (
            <>
              {(currentItems as any[]).map((item: any) => {
                const isProcedure = currentLevel === 'procedure';
                const id: string = item.id;
                const name: string = isProcedure ? item.nom : item.name;
                const childCount = !isProcedure && item.children ? (item.children as unknown[]).length : null;
                const isChecked = selected.has(id);
                return (
                  <div key={id}
                    className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors ${isChecked ? 'bg-blue-50' : ''}`}>
                    <input type="checkbox" checked={isChecked} aria-label={name}
                      onChange={() => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                      className="w-4 h-4 rounded text-blue-600 cursor-pointer shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                      {childCount !== null && <p className="text-xs text-gray-400">{childCount} {FR_NEXT[currentLevel]}(s)</p>}
                    </div>
                    {!isProcedure && (
                      <button type="button" onClick={() => {
                        setPath(prev => [...prev, { id: item.id, name: item.name, level: currentLevel }]);
                        setSelected(new Set()); setCreating(false); setNewName('');
                      }} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2.5 py-1 rounded-lg hover:bg-blue-50 shrink-0 font-medium">
                        Descendre <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
              {!(currentItems as any[]).length && !creating && (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <p className="text-sm">Aucun élément existant</p>
                  <p className="text-xs mt-0.5">Créez-en un ci-dessous</p>
                </div>
              )}
            </>
          )}
          {creating ? (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2">
              <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus
                placeholder={`Nom du ${FR_LEVEL[currentLevel].toLowerCase()}…`}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <button onClick={handleCreate} disabled={saving || !newName.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Créer
              </button>
              <button onClick={() => { setCreating(false); setNewName(''); }}
                className="px-3 py-1.5 text-xs text-gray-500 rounded-lg hover:bg-gray-100">Annuler</button>
            </div>
          ) : (
            <button type="button" onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100">
              <Plus className="w-4 h-4" /> Créer un(e) {FR_LEVEL[currentLevel].toLowerCase()}
            </button>
          )}
        </div>
        {err && <div className="shrink-0 px-5 py-2 bg-red-50 border-t border-red-100"><p className="text-xs text-red-600">{err}</p></div>}
        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">{selected.size} élément(s) sélectionné(s)</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200">Annuler</button>
            <button onClick={handleAdd} disabled={saving || selected.size === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Ajouter à la campagne
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── RevisionTool ─────────────────────────────────────────────

function RevisionTool({
  procedure, session, loading, onRun, selectedId, onSelect, onCreateTask,
}: {
  procedure: Procedure;
  session: RevisionSession | null;
  loading: boolean;
  onRun: () => void;
  selectedId: string | null;
  onSelect: (point: RevisionPoint) => void;
  onCreateTask: (point: RevisionPoint) => void;
}) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [localSession, setLocalSession] = useState(session);
  useEffect(() => { setLocalSession(session); }, [session]);

  const handleStatus = async (point: RevisionPoint, status: RevisionPointStatus) => {
    if (!localSession) return;
    setUpdatingId(point.id);
    try {
      await workspaceApi.updateRevisionPoint(localSession.session_id, point.id, status);
      setLocalSession(prev => prev ? {
        ...prev,
        points: prev.points.map(p => p.id === point.id ? { ...p, status } : p),
      } : prev);
    } catch { /* silent */ }
    finally { setUpdatingId(null); }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 p-6">
      <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
      <p className="text-sm text-center">Gemini révise la procédure…</p>
      <p className="text-[11px] text-gray-300 text-center">20 à 60 secondes</p>
    </div>
  );

  if (!localSession) return (
    <div className="flex flex-col items-center justify-center h-full gap-5 p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
        <Wand2 className="w-7 h-7 text-blue-500" />
      </div>
      <div>
        <p className="font-semibold text-gray-800 text-sm">Révision IA</p>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
          Gemini analyse la procédure et identifie les lacunes, ambiguïtés et points d&apos;amélioration
        </p>
      </div>
      <button type="button" onClick={onRun}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700">
        <Wand2 className="w-4 h-4" /> Lancer la révision
      </button>
    </div>
  );

  const diag = DIAGNOSTIC_CONFIG[localSession.diagnostic_global];
  const pending = localSession.points.filter(p => p.status === 'pending').length;

  return (
    <div className="flex flex-col h-full">
      <div className={`shrink-0 mx-3 mt-3 rounded-xl border px-4 py-3 ${diag.bg}`}>
        <div className="flex items-center justify-between mb-1">
          <span className={`text-xs font-bold ${diag.color}`}>{diag.label}</span>
          <button type="button" onClick={onRun} title="Relancer"
            className="p-1 rounded-lg hover:bg-white/50 text-gray-500">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        <p className="text-[11px] text-gray-700 leading-relaxed">{localSession.resume}</p>
        <p className="text-[10px] text-gray-400 mt-1.5">{pending} point(s) en attente · {localSession.points.length} total</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {localSession.points.length === 0 ? (
          <div className="text-center py-8 text-gray-300">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p className="text-sm text-green-600 font-medium">Aucun point à réviser</p>
            <p className="text-xs text-gray-400 mt-1">La procédure semble complète</p>
          </div>
        ) : (
          localSession.points.map(point => {
            const dim = point.status === 'dismissed';
            const active = point.id === selectedId;
            return (
              <div key={point.id} onClick={() => onSelect(point)}
                className={`rounded-xl border p-3 cursor-pointer transition-all ${
                  active ? 'border-blue-400 bg-blue-50 shadow-sm' :
                  dim    ? 'border-gray-100 bg-gray-50 opacity-40' :
                           'border-gray-100 bg-white hover:border-gray-300'
                }`}>
                <div className="flex items-start gap-2 mb-1.5 flex-wrap">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${POINT_TYPE_COLORS[point.type]}`}>
                    {POINT_TYPE_LABELS[point.type]}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CRIT_BADGE[point.criticite]}`}>
                    {point.criticite}
                  </span>
                  <span className="text-[10px] text-gray-400 ml-auto">{point.section}</span>
                </div>
                <p className="text-xs text-gray-700 leading-snug line-clamp-2">{point.constat}</p>
                {active && (
                  <div className="mt-2.5 pt-2 border-t border-gray-100">
                    <p className="text-[10px] text-gray-500 mb-1.5 font-medium">Suggestion :</p>
                    <p className="text-[11px] text-gray-700 leading-relaxed mb-2.5">{point.suggestion}</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {point.status !== 'noted' && (
                        <button type="button" disabled={updatingId === point.id}
                          onClick={e => { e.stopPropagation(); handleStatus(point, 'noted'); }}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-600 text-white text-[10px] font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
                          {updatingId === point.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          Noté
                        </button>
                      )}
                      <button type="button"
                        onClick={e => { e.stopPropagation(); onCreateTask(point); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 border border-blue-200 text-blue-700 text-[10px] font-semibold rounded-lg hover:bg-blue-50">
                        <Plus className="w-3 h-3" /> Tâche
                      </button>
                      {point.status !== 'dismissed' && (
                        <button type="button" disabled={updatingId === point.id}
                          onClick={e => { e.stopPropagation(); handleStatus(point, 'dismissed'); }}
                          className="px-2.5 py-1.5 border border-gray-200 text-gray-500 text-[10px] rounded-lg hover:bg-gray-50 disabled:opacity-50">
                          Ignorer
                        </button>
                      )}
                      {point.status !== 'pending' && (
                        <button type="button" disabled={updatingId === point.id}
                          onClick={e => { e.stopPropagation(); handleStatus(point, 'pending'); }}
                          title="Remettre en attente"
                          className="p-1.5 border border-gray-200 text-gray-400 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── CorrectionsTool ─────────────────────────────────────────

function CorrectionsTool({
  session, analyzing, onFile, selectedId, onSelect, onStatusChange,
}: {
  session: CorrectionsSession | null;
  analyzing: boolean;
  onFile: (f: File) => void;
  selectedId: string | null;
  onSelect: (r: Remark) => void;
  onStatusChange: (id: string, status: RemarkStatus) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleStatus = async (remark: Remark, status: RemarkStatus) => {
    if (!session) return;
    setUpdatingId(remark.id);
    try {
      await correctionsApi.updateRemarkStatus(session.session_id, remark.id, status);
      onStatusChange(remark.id, status);
    } catch { /* silent */ }
    finally { setUpdatingId(null); }
  };

  if (analyzing) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 p-6">
      <Loader2 className="w-7 h-7 animate-spin text-rose-500" />
      <p className="text-sm text-center">Analyse des annotations…</p>
    </div>
  );

  if (!session) return (
    <div className="flex flex-col items-center justify-center h-full gap-5 p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center">
        <PenLine className="w-7 h-7 text-rose-500" />
      </div>
      <div>
        <p className="font-semibold text-gray-800 text-sm">Corrections depuis un PDF annoté</p>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
          Uploadez le PDF retourné avec annotations — l&apos;IA détecte les surlignements, manuscrits, ratures
        </p>
      </div>
      <button type="button" onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white text-sm font-semibold rounded-xl hover:bg-rose-700">
        <Upload className="w-4 h-4" /> Charger le PDF annoté
      </button>
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
        title="Sélectionner un PDF annoté"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );

  const remarks = session.remarks;
  const pending = remarks.filter(r => r.status === 'pending').length;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 mx-3 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-rose-700">{remarks.length} remarque(s) détectée(s)</span>
          <button type="button" onClick={() => inputRef.current?.click()} title="Charger un autre PDF"
            className="p-1 rounded-lg hover:bg-white/50 text-gray-500">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        {session.synthese && <p className="text-[11px] text-gray-700 leading-relaxed">{session.synthese}</p>}
        <p className="text-[10px] text-gray-400 mt-1">{pending} en attente · {remarks.filter(r => r.status === 'treated').length} traitée(s)</p>
        <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
          title="Sélectionner un autre PDF annoté"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {remarks.length === 0 ? (
          <div className="text-center py-8 text-gray-300">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p className="text-sm text-green-600 font-medium">Aucune annotation détectée</p>
          </div>
        ) : (
          [...remarks].sort((a, b) => a.page - b.page).map(remark => {
            const dim = remark.status === 'ignored';
            const active = remark.id === selectedId;
            const tc = REMARK_TYPE_COLORS[remark.type] ?? REMARK_TYPE_COLORS.commentaire;
            return (
              <div key={remark.id} onClick={() => onSelect(remark)}
                className={`rounded-xl border p-3 cursor-pointer transition-all ${
                  active ? 'border-rose-400 bg-rose-50 shadow-sm' :
                  dim    ? 'border-gray-100 opacity-40' :
                           'border-gray-100 bg-white hover:border-gray-300'
                }`}>
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-gray-400">P.{remark.page}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tc.bg} ${tc.text}`}>
                    {REMARK_TYPE_LABELS[remark.type]}
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto ${CRITICITE_COLORS[remark.criticite]?.badge}`}>
                    {remark.criticite}
                  </span>
                </div>
                <p className="text-xs text-gray-700 line-clamp-2 leading-snug">
                  {remark.texte_concerne || remark.zone || '—'}
                </p>
                {active && (
                  <div className="mt-2.5 pt-2 border-t border-gray-100">
                    {remark.interpretation && (
                      <p className="text-[10px] text-gray-500 mb-1">
                        <span className="font-medium">Remarque :</span> {remark.interpretation}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-500 mb-2 font-medium">Suggestion :</p>
                    <p className="text-[11px] text-gray-700 leading-relaxed mb-2.5">{remark.suggestion}</p>
                    <div className="flex gap-1.5">
                      {remark.status !== 'treated' && (
                        <button type="button" disabled={updatingId === remark.id}
                          onClick={e => { e.stopPropagation(); handleStatus(remark, 'treated'); }}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-600 text-white text-[10px] font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
                          <CheckCircle2 className="w-3 h-3" /> Traité
                        </button>
                      )}
                      {remark.status !== 'ignored' && (
                        <button type="button" disabled={updatingId === remark.id}
                          onClick={e => { e.stopPropagation(); handleStatus(remark, 'ignored'); }}
                          className="px-3 py-1.5 border border-gray-200 text-gray-500 text-[10px] rounded-lg hover:bg-gray-50">
                          Ignorer
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── ProcedureSelector ────────────────────────────────────────

function ProcedureSelector({ onSelect, onClose }: { onSelect: (p: Procedure) => void; onClose: () => void }) {
  const { procedures } = useProceduresStore();
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [tree, setTree] = useState<TaxonomyNode[]>([]);
  const [path, setPath] = useState<TaxonomyNode[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    taxonomyApi.getTree().then(r => setTree(r.tree)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const currentNode: TaxonomyNode | null = path.length > 0 ? path[path.length - 1] : null;
  const children = currentNode ? (currentNode.children || []) : tree;
  const isLeaf = children.length === 0;

  const subtreeIds = useMemo(() => {
    if (!currentNode) return new Set<string>();
    const ids = new Set<string>();
    const collect = (n: TaxonomyNode) => { ids.add(n.id); n.children?.forEach(collect); };
    collect(currentNode);
    return ids;
  }, [currentNode]);

  const nodeProcedures = useMemo(() => {
    if (!currentNode) return [];
    return procedures.filter(p => p.taxonomy_id && subtreeIds.has(p.taxonomy_id));
  }, [currentNode, procedures, subtreeIds]);

  const hasTaxoMatch = nodeProcedures.length > 0;

  const displayedProcedures = useMemo(() => {
    const pool = (isLeaf && !hasTaxoMatch) ? procedures : (currentNode ? nodeProcedures : []);
    if (!search.trim()) return pool;
    const q = search.toLowerCase();
    return pool.filter(p => p.nom.toLowerCase().includes(q) || (p.ref || '').toLowerCase().includes(q));
  }, [isLeaf, hasTaxoMatch, procedures, currentNode, nodeProcedures, search]);

  const globalSearchResults = useMemo(() => {
    if (currentNode || !search.trim()) return [];
    const q = search.toLowerCase();
    return procedures.filter(p => p.nom.toLowerCase().includes(q) || (p.ref || '').toLowerCase().includes(q)).slice(0, 25);
  }, [currentNode, search, procedures]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
        <div className="shrink-0 px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-blue-500 shrink-0" />
          <h2 className="font-bold text-gray-900 text-sm flex-1">Ouvrir une procédure</h2>
          <button type="button" onClick={onClose} title="Fermer" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="shrink-0 flex border-b border-gray-100">
          {[{ id: 'library', label: 'Bibliothèque', icon: BookOpen }, { id: 'upload', label: 'Importer', icon: Upload }].map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>
        {tab === 'library' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="shrink-0 px-4 py-2.5 border-b border-gray-50">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" placeholder="Rechercher une procédure…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
              </div>
            </div>
            {path.length > 0 && (
              <div className="shrink-0 px-4 py-2 border-b border-gray-50 flex items-center gap-1 text-xs text-gray-500 flex-wrap">
                <button type="button" onClick={() => setPath([])} className="hover:text-blue-600">Racine</button>
                {path.map((n, i) => (
                  <React.Fragment key={n.id}>
                    <ChevronRight className="w-3 h-3 text-gray-300" />
                    <button type="button" onClick={() => setPath(path.slice(0, i + 1))} className="hover:text-blue-600 truncate max-w-[120px]">{n.name}</button>
                  </React.Fragment>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>
              ) : (
                <>
                  {!search.trim() && children.map(node => (
                    <button key={node.id} type="button" onClick={() => setPath([...path, node])}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left mb-1">
                      <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <ChevronRight className="w-3.5 h-3.5 text-blue-500" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{node.name}</p>
                        {node.procedure_count ? <p className="text-[10px] text-gray-400">{node.procedure_count} procédure(s)</p> : null}
                      </div>
                    </button>
                  ))}
                  {isLeaf && !hasTaxoMatch && currentNode && !search.trim() && procedures.length > 0 && (
                    <p className="text-[11px] text-gray-400 italic px-1 mb-2">
                      Aucune procédure liée à cette catégorie — toutes les procédures affichées
                    </p>
                  )}
                  {(currentNode ? displayedProcedures : globalSearchResults).map(p => (
                    <button key={p.id} type="button" onClick={() => onSelect(p)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 text-left mb-1 border border-transparent hover:border-blue-200 transition-colors">
                      <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <FileText className="w-3.5 h-3.5 text-gray-500" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.nom}</p>
                        <p className="text-[10px] text-gray-400">{[p.ref, p.status, p.category].filter(Boolean).join(' · ')}</p>
                      </div>
                    </button>
                  ))}
                  {!loading && !currentNode && !search.trim() && (
                    <p className="text-xs text-gray-400 text-center py-6">Sélectionnez une catégorie ou recherchez une procédure</p>
                  )}
                  {!loading && !currentNode && search.trim() && globalSearchResults.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-6">Aucun résultat pour « {search} »</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        {tab === 'upload' && (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-gray-400">
            <div>
              <Upload className="w-8 h-8 mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">Import PDF depuis l&apos;outil Corrections</p>
              <p className="text-xs mt-1">Ouvrez d&apos;abord une procédure depuis la bibliothèque,<br />puis chargez un PDF annoté dans l&apos;outil Corrections.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CreateTaskModal ──────────────────────────────────────────

function CreateTaskModal({
  procedure, sourcePoint, currentUserName, currentUserId, onCreated, onClose,
}: {
  procedure: Procedure;
  sourcePoint: RevisionPoint | null;
  currentUserName: string;
  currentUserId: string;
  onCreated: (task: ProcedureTask) => void;
  onClose: () => void;
}) {
  const [title, setTitle]       = useState(sourcePoint ? `Corriger : ${sourcePoint.section}` : '');
  const [description, setDesc]  = useState(sourcePoint ? `${sourcePoint.constat}\n\nSuggestion : ${sourcePoint.suggestion}` : '');
  const [assignedTo, setAssign] = useState('');
  const [taskType, setType]     = useState<'correction' | 'review' | 'validation'>('correction');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [dueDate, setDueDate]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [actors, setActors]     = useState<{ id: string; full_name: string; email: string }[]>([]);

  useEffect(() => {
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
    fetch(`${BASE}/api/orchestration/users`)
      .then(r => r.json()).then(d => setActors(d.users || [])).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!title.trim() || !assignedTo) return;
    setSaving(true);
    try {
      const res = await orchestrationTasksApi.createTask(procedure.id, {
        title: title.trim(), description: description.trim() || undefined,
        assigned_to: assignedTo, assigned_by: currentUserId,
        task_type: taskType, priority, due_date: dueDate || null,
      });
      onCreated(res.task);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur lors de la création');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <Plus className="w-4 h-4 text-blue-500" />
          <h2 className="font-bold text-gray-900 text-sm flex-1">Créer une tâche</h2>
          <button type="button" onClick={onClose} title="Fermer" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {sourcePoint && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-[11px] text-blue-700">
              Point de révision : <strong>{sourcePoint.section}</strong> — {sourcePoint.type}
            </div>
          )}
          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Titre *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              title="Titre de la tâche" placeholder="Titre de la tâche"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Description</label>
            <textarea value={description} onChange={e => setDesc(e.target.value)} rows={3}
              title="Description" placeholder="Description de la tâche…"
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Assigné à *</label>
            <select value={assignedTo} onChange={e => setAssign(e.target.value)}
              title="Assigné à"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 bg-white">
              <option value="">Sélectionner…</option>
              {actors.map(a => <option key={a.id} value={a.id}>{a.full_name || a.email}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Type</label>
              <select value={taskType} onChange={e => setType(e.target.value as any)}
                title="Type de tâche"
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none bg-white">
                <option value="correction">Correction</option>
                <option value="review">Vérification</option>
                <option value="validation">Validation</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Priorité</label>
              <select value={priority} onChange={e => setPriority(e.target.value as any)}
                title="Priorité"
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none bg-white">
                <option value="normal">Normale</option>
                <option value="high">Haute</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-gray-500 mb-1 block">Échéance</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                title="Date d'échéance"
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 focus:outline-none" />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <FileSearch className="w-3 h-3" /> Le mail contiendra un lien direct vers le workspace
          </p>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200">
            Annuler
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving || !title.trim() || !assignedTo}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Créer et notifier
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LeftPanelTree ────────────────────────────────────────────

function LeftPanelTree({
  campaigns, myTasks, currentUserId, isAdmin,
  filter, onSetFilter, onOpenEditor,
}: {
  campaigns: Campaign[];
  myTasks: EnrichedTask[];
  currentUserId: string | null;
  isAdmin: boolean;
  filter: LeftFilter | null;
  onSetFilter: (f: LeftFilter | null) => void;
  onOpenEditor: (procedureId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const tasksByProc = useMemo(() => {
    const map: Record<string, number> = {};
    myTasks.forEach(t => { map[t.procedure_id] = (map[t.procedure_id] || 0) + 1; });
    return map;
  }, [myTasks]);

  // Active campaigns where user has tasks (or all for admin)
  const activeCampaigns = useMemo(() => {
    const active = campaigns.filter(c => c.status === 'active' || c.status === 'draft');
    if (isAdmin) return active;
    return active.filter(c => myTasks.some(t => t.campaign_id === c.id));
  }, [campaigns, isAdmin, myTasks]);

  // Procedures grouped by campaign (flat list, no taxonomy nesting)
  const procsByCampaign = useMemo(() => {
    const map: Record<string, Array<{ id: string; nom: string }>> = {};
    activeCampaigns.forEach(c => {
      map[c.id] = (c.procedures ?? []).map(p => ({ id: p.procedure_id, nom: p.procedure_nom || 'Procédure' }));
    });
    return map;
  }, [activeCampaigns]);

  return (
    <div className="px-1.5 py-2">
      <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mes procédures</p>

      {activeCampaigns.length === 0 && (
        <p className="px-3 py-4 text-xs text-gray-400 text-center">Aucune campagne active</p>
      )}

      {activeCampaigns.map(campaign => {
        const cExp = expanded.has(campaign.id);
        const procs = procsByCampaign[campaign.id] || [];
        const taskCount = procs.reduce((s, p) => s + (tasksByProc[p.id] || 0), 0);
        const isCampFiltered = filter?.filterType === 'campaign' && filter.campaignId === campaign.id;

        return (
          <div key={campaign.id}>
            <div className={`flex items-center gap-1 px-1.5 py-1.5 rounded-lg group cursor-pointer ${isCampFiltered ? 'bg-orange-50' : 'hover:bg-gray-100'}`}
              onClick={() => toggle(campaign.id)}>
              {cExp ? <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />}
              <Megaphone className="w-3 h-3 text-orange-400 shrink-0" />
              <span className={`flex-1 text-[11px] font-semibold truncate min-w-0 ${isCampFiltered ? 'text-orange-700' : 'text-gray-700'}`}>{campaign.title}</span>
              {taskCount > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">{taskCount}</span>}
              <button type="button" title="Filtrer le backlog" onClick={e => { e.stopPropagation(); onSetFilter(isCampFiltered ? null : { label: campaign.title, filterType: 'campaign', campaignId: campaign.id }); }}
                className={`p-0.5 rounded opacity-0 group-hover:opacity-100 ${isCampFiltered ? 'text-orange-600 !opacity-100' : 'text-gray-400 hover:bg-gray-200'}`}>
                <Filter className="w-3 h-3" />
              </button>
            </div>

            {cExp && (
              <div className="ml-4">
                {procs.length === 0 && <p className="px-2 py-1.5 text-[10px] text-gray-400">Aucune procédure</p>}
                {procs.map(proc => {
                  const ptCount = tasksByProc[proc.id] || 0;
                  return (
                    <div key={proc.id}
                      onClick={() => onOpenEditor(proc.id)}
                      className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-blue-50 cursor-pointer group">
                      <FileText className="w-3 h-3 text-gray-400 shrink-0" />
                      <span className="flex-1 text-[10px] text-gray-600 truncate min-w-0">{proc.nom}</span>
                      {ptCount > 0 && <span className="text-[9px] font-bold px-1 py-0.5 rounded-full bg-gray-200 text-gray-600 shrink-0">{ptCount}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── MyStatsBlock ────────────────────────────────────────────

function MyStatsBlock({ tasks }: { tasks: EnrichedTask[] }) {
  const [open, setOpen] = useState(false);
  const completed = tasks.filter(t => ['completed', 'validated'].includes(t.status)).length;
  const active = tasks.filter(t => !['completed', 'validated', 'cancelled'].includes(t.status)).length;
  const pct = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;

  return (
    <div className="mb-3">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-xl bg-white border border-gray-100 hover:border-gray-200 transition-colors text-left">
        {open ? <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />}
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex-1">Mon avancement</span>
        <span className="text-xs font-bold text-gray-700">{pct}%</span>
        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0">
          <div className={`h-1.5 rounded-full transition-all ${pct >= 80 ? 'bg-green-500' : pct > 0 ? 'bg-blue-400' : 'bg-gray-200'}`}
            style={{ width: `${pct}%` }} />
        </div>
      </button>
      {open && (
        <div className="mt-1.5 grid grid-cols-3 gap-2 px-1">
          <div className="bg-white rounded-lg border border-gray-100 px-3 py-2 text-center">
            <p className="text-lg font-bold text-gray-900">{tasks.length}</p>
            <p className="text-[10px] text-gray-400">Total</p>
          </div>
          <div className="bg-green-50 rounded-lg border border-green-100 px-3 py-2 text-center">
            <p className="text-lg font-bold text-green-700">{completed}</p>
            <p className="text-[10px] text-green-600">Terminées</p>
          </div>
          <div className="bg-blue-50 rounded-lg border border-blue-100 px-3 py-2 text-center">
            <p className="text-lg font-bold text-blue-700">{active}</p>
            <p className="text-[10px] text-blue-600">En cours</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BacklogView ──────────────────────────────────────────────

function TaskCard({ task, onOpenTask, currentUserId, now }: { task: EnrichedTask; onOpenTask: (t: EnrichedTask) => void; currentUserId?: string | null; now: number }) {
  const isOverdue = task.due_date && new Date(task.due_date).getTime() < now;
  const isDueSoon = !isOverdue && task.due_date && (new Date(task.due_date).getTime() - now) < 3 * 86400000;
  return (
    <button type="button" onClick={() => onOpenTask(task)}
      className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl border border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PRIO_COLORS[task.priority] ?? PRIO_COLORS.normal}`}>
            {task.priority}
          </span>
          <span className="text-[10px] text-gray-400">{TASK_TYPE_LABELS[task.task_type] ?? task.task_type}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-auto ${TASK_STATUS_COLORS[task.status]}`}>
            {TASK_STATUS_LABELS[task.status]}
          </span>
        </div>
        <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
        <p className="text-[11px] text-gray-400 truncate">{task.procedure_name}</p>
        {task.campaign_name && (
          <p className="text-[10px] text-gray-300 truncate">{task.campaign_name}</p>
        )}
        {currentUserId && task.assigned_to !== currentUserId && task.assigned_to_name && (
          <p className="text-[10px] text-indigo-400 truncate">→ {task.assigned_to_name}</p>
        )}
      </div>
      {task.due_date && (
        <div className={`shrink-0 flex items-center gap-1 text-[10px] font-medium mt-0.5 ${isOverdue ? 'text-red-600' : isDueSoon ? 'text-orange-500' : 'text-gray-400'}`}>
          <Clock className="w-3 h-3" />
          {new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
        </div>
      )}
    </button>
  );
}

function BacklogView({
  tasks, loading, filter, onClearFilter, onOpenTask, currentUserId,
}: {
  tasks: EnrichedTask[];
  loading: boolean;
  filter: LeftFilter | null;
  onClearFilter: () => void;
  onOpenTask: (task: EnrichedTask) => void;
  currentUserId?: string | null;
}) {
  const [showSupervised, setShowSupervised] = useState(true);

  const filtered = useMemo(() => {
    if (!filter) return tasks;
    if (filter.filterType === 'campaign') return tasks.filter(t => t.campaign_id === filter.campaignId);
    return tasks.filter(t => filter.procedureIds!.has(t.procedure_id));
  }, [tasks, filter]);

  const myDirectTasks = useMemo(() =>
    filtered.filter(t => t.assigned_to === currentUserId),
    [filtered, currentUserId]
  );

  const supervisedTasks = useMemo(() =>
    filtered.filter(t => t.assigned_by === currentUserId && t.assigned_to !== currentUserId),
    [filtered, currentUserId]
  );

  const now = Date.now();
  const overdueCount = myDirectTasks.filter(t => t.due_date && new Date(t.due_date).getTime() < now).length;
  const urgentCount = myDirectTasks.filter(t => t.priority === 'urgent').length;
  const alertCount = overdueCount + urgentCount;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {filter && (
        <div className="shrink-0 px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
          <Filter className="w-3 h-3 text-blue-500 shrink-0" />
          <span className="text-xs text-blue-700 font-medium flex-1 truncate">{filter.label}</span>
          <button type="button" onClick={onClearFilter} title="Effacer le filtre" className="text-blue-400 hover:text-blue-700 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Urgences banner */}
      {!loading && alertCount > 0 && (
        <div className="shrink-0 mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100">
          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span className="text-xs text-red-700 font-medium flex-1">
            {overdueCount > 0 && <span>{overdueCount} en retard</span>}
            {overdueCount > 0 && urgentCount > 0 && <span> · </span>}
            {urgentCount > 0 && <span>{urgentCount} urgente(s)</span>}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          </div>
        ) : (
          <>
            {/* ── Mes performances (collapsible) ── */}
            {myDirectTasks.length > 0 && <MyStatsBlock tasks={myDirectTasks} />}

            {/* ── Mes tâches ── */}
            <div className="mb-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">
                Mes tâches ({myDirectTasks.length})
              </p>
              {myDirectTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle2 className="w-7 h-7 mb-2 text-green-400" />
                  <p className="text-sm text-gray-500 font-medium">Tout est à jour</p>
                  <p className="text-xs text-gray-400 mt-0.5">Aucune tâche en attente</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {myDirectTasks.map(task => (
                    <TaskCard key={task.id} task={task} onOpenTask={onOpenTask} currentUserId={currentUserId} now={now} />
                  ))}
                </div>
              )}
            </div>

            {/* ── Suivi — tâches assignées ── */}
            {supervisedTasks.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setShowSupervised(v => !v)}
                  className="flex items-center gap-1.5 px-1 mb-2 w-full text-left">
                  {showSupervised ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex-1">
                    Suivi — tâches assignées ({supervisedTasks.length})
                  </p>
                </button>
                {showSupervised && (
                  <div className="space-y-1.5">
                    {supervisedTasks.map(task => (
                      <TaskCard key={task.id} task={task} onOpenTask={onOpenTask} currentUserId={currentUserId} now={now} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── TaskDetailCenter ─────────────────────────────────────────

function TaskDetailCenter({
  tab, onSwitchToEditor, onSwitchToDetail, onTaskUpdated, currentActor,
}: {
  tab: WorkspaceTab & { type: 'task' };
  onSwitchToEditor: () => void;
  onSwitchToDetail: () => void;
  onTaskUpdated: (task: EnrichedTask) => void;
  currentActor: TaskActor | null;
}) {
  const { task, mode, procedure } = tab;
  const [message, setMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const now = Date.now();

  if (mode === 'editor') {
    if (!procedure) return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
      </div>
    );
    return (
      <div className="h-full flex flex-col">
        <div className="shrink-0 px-4 py-2.5 border-b border-gray-100 bg-white flex items-center gap-3">
          <button type="button" onClick={onSwitchToDetail}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" /> Retour à la tâche
          </button>
          <span className="text-xs text-gray-300">•</span>
          <span className="text-xs text-gray-600 font-medium truncate">{procedure.nom}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <ProcedureEditor key={procedure.id} procedure={procedure} hideHeader />
        </div>
      </div>
    );
  }

  const isOverdue = task.due_date && new Date(task.due_date).getTime() < now;

  return (
    <div className="h-full overflow-y-auto bg-gray-50 px-6 py-5 space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIO_COLORS[task.priority] ?? PRIO_COLORS.normal}`}>{task.priority}</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{TASK_TYPE_LABELS[task.task_type] ?? task.task_type}</span>
              {task.raci_role && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">RACI-{task.raci_role}</span>}
            </div>
            <h2 className="text-base font-bold text-gray-900">{task.title}</h2>
            {task.description && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{task.description}</p>}
          </div>
          <button type="button" onClick={onSwitchToEditor}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
            <PenLine className="w-3.5 h-3.5" /> Modifier
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-400 mb-0.5">Procédure</p>
            <p className="font-medium text-gray-700 truncate">{task.procedure_name}</p>
          </div>
          {task.campaign_name && (
            <div className="bg-orange-50 rounded-lg px-3 py-2">
              <p className="text-[10px] text-orange-400 mb-0.5">Campagne</p>
              <p className="font-medium text-orange-700 truncate">{task.campaign_name}</p>
            </div>
          )}
          {task.due_date && (
            <div className={`rounded-lg px-3 py-2 ${isOverdue ? 'bg-red-50' : 'bg-gray-50'}`}>
              <p className="text-[10px] text-gray-400 mb-0.5">Échéance</p>
              <p className={`font-medium ${isOverdue ? 'text-red-700' : 'text-gray-700'}`}>
                {new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </div>
          )}
          {task.assigned_by_name && (
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-400 mb-0.5">Assigné par</p>
              <p className="font-medium text-gray-700 truncate">{task.assigned_by_name}</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${TASK_STATUS_COLORS[task.status]}`}>
            {TASK_STATUS_LABELS[task.status]}
          </span>
          {task.taxonomy_breadcrumb && (
            <span className="text-[10px] text-gray-400 truncate">{task.taxonomy_breadcrumb}</span>
          )}
        </div>

        {currentActor && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2}
              placeholder="Message (optionnel)…"
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-300 resize-none" />
            <TaskActionBar
              task={task}
              actor={currentActor}
              message={message}
              onChanged={updated => { setMessage(''); onTaskUpdated({ ...task, ...updated }); }}
              onError={() => {}}
            />
          </div>
        )}
      </div>

      {/* Historique */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <button type="button"
          onClick={() => setShowHistory(v => !v)}
          className="flex items-center gap-2 w-full text-left">
          <History className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="text-xs font-semibold text-gray-600 flex-1">Historique</span>
          {showHistory
            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        </button>
        {showHistory && (
          <div className="mt-3">
            <TaskTimeline taskId={task.id} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DeadlinePanel ────────────────────────────────────────────

function DeadlinePanel({ tasks, onOpenTask }: { tasks: EnrichedTask[]; onOpenTask: (t: EnrichedTask) => void }) {
  const now = Date.now();
  const urgent = useMemo(() => {
    return tasks
      .filter(t => {
        if (t.priority === 'urgent' && !t.due_date) return true;
        if (!t.due_date) return false;
        return (new Date(t.due_date).getTime() - now) / 86400000 <= 3;
      })
      .slice(0, 8);
  }, [tasks, now]);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-3 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Priorités</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {urgent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="w-6 h-6 text-green-400 mb-2" />
            <p className="text-xs text-gray-400">Aucune urgence</p>
          </div>
        ) : (
          urgent.map(t => {
            const isOverdue = t.due_date && new Date(t.due_date).getTime() < now;
            return (
              <button key={t.id} type="button" onClick={() => onOpenTask(t)}
                className={`w-full text-left rounded-xl border px-2.5 py-2 transition-colors hover:shadow-sm ${isOverdue ? 'border-red-200 bg-red-50 hover:border-red-300' : 'border-orange-200 bg-orange-50 hover:border-orange-300'}`}>
                <p className="text-[11px] font-semibold text-gray-800 truncate">{t.title}</p>
                <p className="text-[10px] text-gray-500 truncate">{t.procedure_name}</p>
                {t.due_date && (
                  <div className={`flex items-center gap-1 mt-1 text-[10px] font-bold ${isOverdue ? 'text-red-700' : 'text-orange-700'}`}>
                    <Clock className="w-2.5 h-2.5" />
                    {new Date(t.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    {isOverdue && ' — En retard'}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── TaskInfoPanel ────────────────────────────────────────────

function TaskInfoPanel({
  task, onSwitchTool,
}: {
  task: EnrichedTask;
  onSwitchTool: (tool: 'revision' | 'corrections') => void;
}) {
  const now = Date.now();
  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-3 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex-1 truncate">Info tâche</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="space-y-2">
          <div>
            <p className="text-[9px] text-gray-400 mb-0.5">Titre</p>
            <p className="text-xs font-semibold text-gray-800">{task.title}</p>
          </div>
          {task.description && (
            <div>
              <p className="text-[9px] text-gray-400 mb-0.5">Description</p>
              <p className="text-[11px] text-gray-600 leading-relaxed">{task.description}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-gray-50 rounded-lg px-2 py-1.5">
              <p className="text-[9px] text-gray-400">Type</p>
              <p className="text-[11px] font-medium text-gray-700">{TASK_TYPE_LABELS[task.task_type] ?? task.task_type}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-2 py-1.5">
              <p className="text-[9px] text-gray-400">Statut</p>
              <p className={`text-[11px] font-semibold ${TASK_STATUS_COLORS[task.status].split(' ')[1] ?? 'text-gray-700'}`}>{TASK_STATUS_LABELS[task.status]}</p>
            </div>
            {task.due_date && (
              <div className={`rounded-lg px-2 py-1.5 col-span-2 ${new Date(task.due_date).getTime() < now ? 'bg-red-50' : 'bg-gray-50'}`}>
                <p className="text-[9px] text-gray-400">Échéance</p>
                <p className={`text-[11px] font-medium ${new Date(task.due_date).getTime() < now ? 'text-red-700' : 'text-gray-700'}`}>
                  {new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
            )}
            {task.raci_role && (
              <div className="bg-blue-50 rounded-lg px-2 py-1.5">
                <p className="text-[9px] text-gray-400">Rôle RACI</p>
                <p className="text-[11px] font-bold text-blue-700">{task.raci_role}</p>
              </div>
            )}
            {task.assigned_by_name && (
              <div className="bg-gray-50 rounded-lg px-2 py-1.5">
                <p className="text-[9px] text-gray-400">Assigné par</p>
                <p className="text-[11px] font-medium text-gray-700 truncate">{task.assigned_by_name}</p>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-2">Outils procédure</p>
          <button type="button" onClick={() => onSwitchTool('revision')}
            className="w-full flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg mb-1 text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition-colors">
            <Wand2 className="w-3.5 h-3.5 text-blue-500 shrink-0" /> Révision IA
          </button>
          <button type="button" onClick={() => onSwitchTool('corrections')}
            className="w-full flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg text-gray-600 hover:bg-rose-50 hover:text-rose-700 transition-colors">
            <PenLine className="w-3.5 h-3.5 text-rose-500 shrink-0" /> Corrections PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ActivityFeed ─────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  task_created:            'Tâche créée',
  status_changed:          'Statut modifié',
  review_task_created:     'Vérification demandée',
  validation_task_created: 'Validation demandée',
  correction_task_created: 'Correction demandée',
  information_task_created:'Information envoyée',
  comment_added:           'Commentaire',
};

function ActivityFeed() {
  const [events, setEvents] = useState<EnrichedTaskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await orchestrationTasksApi.listRecentEvents({ limit: 100 });
      setEvents(res.events ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(e =>
      (e.actor_name || '').toLowerCase().includes(q) ||
      (e.procedure_name || '').toLowerCase().includes(q) ||
      (e.task_title || '').toLowerCase().includes(q) ||
      (e.message || '').toLowerCase().includes(q)
    );
  }, [events, search]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="shrink-0 px-4 py-2.5 border-b border-gray-100 bg-white flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filtrer par acteur, procédure, action…"
          className="flex-1 text-xs focus:outline-none text-gray-700 placeholder-gray-400"
        />
        <button type="button" onClick={load} title="Rafraîchir" className="text-gray-400 hover:text-gray-600 p-0.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <History className="w-8 h-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">Aucune activité récente</p>
          </div>
        ) : filtered.map(event => {
          const roleColor =
            event.raci_role === 'R' ? 'bg-blue-100 text-blue-700' :
            event.raci_role === 'A' ? 'bg-green-100 text-green-700' :
            event.raci_role === 'C' ? 'bg-purple-100 text-purple-700' :
            'bg-gray-100 text-gray-500';
          const ini = (event.actor_name || 'S').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
          return (
            <div key={event.id} className="flex items-start gap-2.5 px-3 py-2.5 bg-white rounded-xl border border-gray-100">
              <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                {ini}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-gray-900 truncate">{event.actor_name || 'Système'}</span>
                  {event.raci_role && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${roleColor}`}>{event.raci_role}</span>
                  )}
                  <span className="text-[10px] text-gray-400 ml-auto shrink-0">
                    {new Date(event.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-gray-700">
                  {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}
                  {event.from_status && event.to_status && (
                    <span className="text-gray-400 font-normal">
                      {' — '}{TASK_STATUS_LABELS[event.from_status as ProcedureTaskStatus] || event.from_status}
                      {' → '}{TASK_STATUS_LABELS[event.to_status as ProcedureTaskStatus] || event.to_status}
                    </span>
                  )}
                </p>
                {event.task_title && (
                  <p className="text-[10px] text-indigo-600 truncate mt-0.5">{event.task_title}</p>
                )}
                {event.procedure_name && (
                  <p className="text-[10px] text-gray-400 truncate">{event.procedure_name}</p>
                )}
                {event.message && (
                  <p className="text-[10px] text-gray-500 mt-1 italic truncate">«{event.message}»</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WsCreateCampaignModal ────────────────────────────────────

function WsCreateCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Campaign) => void }) {
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
      const res = await campaignsApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      onCreated(res.campaign);
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">Nouveau projet de formalisation</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Titre *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
              placeholder="ex: Refonte procédures crédit Q1…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Début</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Échéance</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Annuler</button>
            <button type="submit" disabled={saving || !title.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Créer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── EditCampaignModal ────────────────────────────────────────

function EditCampaignModal({ campaign, onClose, onSaved }: { campaign: Campaign; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(campaign.title);
  const [description, setDescription] = useState(campaign.description ?? '');
  const [startDate, setStartDate] = useState(campaign.start_date?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(campaign.end_date?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true); setError(null);
    try {
      await campaignsApi.update(campaign.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      await onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">Modifier le projet</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Titre *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Début</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Échéance</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Annuler</button>
            <button type="submit" disabled={saving || !title.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── CampaignDetailPanel ──────────────────────────────────────

function CampaignDetailPanel({
  campaign: initialCampaign,
  isAdmin,
  onClose,
  onRefresh,
  onOpenProcedure,
}: {
  campaign: Campaign;
  isAdmin: boolean;
  onClose: () => void;
  onRefresh: (c: Campaign) => void;
  onOpenProcedure: (id: string) => void;
}) {
  const [campaign, setCampaign] = useState(initialCampaign);
  const [showEdit, setShowEdit] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    campaignsApi.get(initialCampaign.id)
      .then(r => setCampaign(r.campaign))
      .catch(() => {});
  }, [initialCampaign.id]);

  const refresh = async () => {
    const r = await campaignsApi.get(campaign.id).catch(() => null);
    if (r) { setCampaign(r.campaign); onRefresh(r.campaign); }
  };

  const doAction = async (fn: () => Promise<any>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setActioning(true);
    try { await fn(); await refresh(); }
    finally { setActioning(false); }
  };

  const c = CAMPAIGN_STATUS_COLORS[campaign.status];
  const procs = campaign.procedures ?? [];
  const alreadyAdded = useMemo(() => new Set(procs.map(p => p.procedure_id)), [procs]);
  const isOverdue = campaign.end_date && campaign.status === 'active' && new Date(campaign.end_date) < new Date();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-100">
        <div className="flex items-start gap-2 mb-2">
          <Megaphone className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-900 leading-snug line-clamp-2">{campaign.title}</p>
          </div>
          <button type="button" onClick={onClose} title="Fermer" className="p-0.5 rounded hover:bg-gray-100 text-gray-400 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${c.bg} ${c.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
            {CAMPAIGN_STATUS_LABELS[campaign.status]}
          </span>
          {isOverdue && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 flex items-center gap-1">
              <AlertCircle className="w-2.5 h-2.5" /> En retard
            </span>
          )}
        </div>
        {campaign.description && (
          <p className="text-[11px] text-gray-500 line-clamp-2 mb-2">{campaign.description}</p>
        )}
        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
          <span>{campaign.stats.done}/{campaign.stats.total} proc.</span>
          <span className="font-bold text-gray-700">{campaign.stats.progress_pct}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-1.5 bg-orange-400 rounded-full transition-all" style={{ width: `${campaign.stats.progress_pct}%` }} />
        </div>
      </div>

      {/* Admin actions */}
      {isAdmin && (
        <div className="shrink-0 px-3 py-2.5 border-b border-gray-100 space-y-2">
          {campaign.status !== 'completed' && campaign.status !== 'archived' && (
            <button type="button" onClick={() => setShowAdd(true)}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
              <Plus className="w-3.5 h-3.5" /> Ajouter des procédures
            </button>
          )}
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setShowEdit(true)}
              className="flex-1 px-2 py-1.5 border border-gray-200 text-gray-600 text-[11px] font-medium rounded-lg hover:bg-gray-50">
              Modifier
            </button>
            <button type="button" onClick={() => doAction(() => campaignsApi.sync(campaign.id))} disabled={actioning}
              title="Synchroniser"
              className="px-2.5 py-1.5 border border-gray-200 text-gray-600 text-[11px] rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1">
              {actioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            </button>
            <button type="button"
              onClick={() => doAction(() => campaignsApi.delete(campaign.id).then(onClose), `Supprimer "${campaign.title}" ?`)}
              disabled={actioning}
              className="px-2.5 py-1.5 border border-red-200 text-red-500 text-[11px] rounded-lg hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <div className="flex gap-1.5">
            {campaign.status === 'draft' && (
              <button type="button" onClick={() => doAction(() => campaignsApi.launch(campaign.id), 'Lancer ce projet ?')}
                disabled={actioning}
                className="flex-1 px-2 py-1.5 bg-blue-600 text-white text-[11px] font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                Lancer
              </button>
            )}
            {campaign.status === 'active' && (
              <>
                <button type="button" onClick={() => doAction(() => campaignsApi.close(campaign.id), 'Clôturer ?')}
                  disabled={actioning}
                  className="flex-1 px-2 py-1.5 bg-green-600 text-white text-[11px] font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
                  Clôturer
                </button>
                <button type="button" onClick={() => doAction(() => campaignsApi.pause(campaign.id), 'Mettre en pause ?')}
                  disabled={actioning}
                  className="flex-1 px-2 py-1.5 border border-purple-200 text-purple-700 text-[11px] rounded-lg hover:bg-purple-50 disabled:opacity-50">
                  Pause
                </button>
              </>
            )}
            {campaign.status === 'active' && (
              <button type="button" onClick={() => doAction(() => campaignsApi.block(campaign.id), 'Bloquer ?')}
                disabled={actioning}
                className="flex-1 px-2 py-1.5 border border-red-200 text-red-600 text-[11px] rounded-lg hover:bg-red-50 disabled:opacity-50">
                Bloquer
              </button>
            )}
            {(campaign.status === 'blocked' || campaign.status === 'on_hold') && (
              <button type="button" onClick={() => doAction(() => campaignsApi.resume(campaign.id))}
                disabled={actioning}
                className="flex-1 px-2 py-1.5 bg-blue-600 text-white text-[11px] font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                Reprendre
              </button>
            )}
          </div>
        </div>
      )}

      {/* Procedure list */}
      <div className="flex-1 overflow-y-auto">
        <p className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
          Procédures ({procs.length})
        </p>
        {procs.length === 0 ? (
          <p className="text-center text-[11px] text-gray-400 py-6">Aucune procédure</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {procs.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 group">
                <FileText className="w-3 h-3 text-gray-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-gray-700 truncate">{p.procedure_nom}</p>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${PROC_STATUS_COLORS[p.status].bg} ${PROC_STATUS_COLORS[p.status].text}`}>
                    {PROC_STATUS_LABELS[p.status]}
                  </span>
                </div>
                <button type="button" title="Ouvrir la procédure" onClick={() => onOpenProcedure(p.procedure_id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 text-gray-500 shrink-0">
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEdit && (
        <EditCampaignModal campaign={campaign}
          onClose={() => setShowEdit(false)}
          onSaved={async () => { setShowEdit(false); await refresh(); }} />
      )}
      {showAdd && (
        <HierarchicalPicker campaignId={campaign.id} alreadyAdded={alreadyAdded}
          onClose={() => setShowAdd(false)}
          onAdded={async () => { setShowAdd(false); await refresh(); }} />
      )}
    </div>
  );
}

// ─── WorkspaceShell ───────────────────────────────────────────

export default function WorkspaceShell({ openProcedureId, onNavigateBack, onOpenStudio }: { openProcedureId?: string | null; onNavigateBack?: () => void; onOpenStudio?: (procedureId: string) => void }) {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const { procedures: storeProcedures, fetchProcedures } = useProceduresStore();

  // ── Data ──────────────────────────────────────────────────────
  const [campaigns, setCampaigns]     = useState<Campaign[]>([]);
  const [taxNodes, setTaxNodes]       = useState<TaxNode[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [myTasks, setMyTasks]         = useState<EnrichedTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // ── Tabs ──────────────────────────────────────────────────────
  const [tabs, setTabs]           = useState<WorkspaceTab[]>([{ id: 'backlog', type: 'backlog' }]);
  const [activeTabId, setActiveTabId] = useState<string>('backlog');

  // ── Left filter ───────────────────────────────────────────────
  const [leftFilter, setLeftFilter] = useState<LeftFilter | null>(null);

  // ── Campaign UI ───────────────────────────────────────────────
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);

  // ── Procedure cache ───────────────────────────────────────────
  const [procCache, setProcCache] = useState<Record<string, Procedure>>({});

  // ── Tools ─────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');
  const [revisionSession, setRevisionSession] = useState<RevisionSession | null>(null);
  const [revisingLoading, setRevisingLoading] = useState(false);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [correctionsSession, setCorrectionsSession] = useState<CorrectionsSession | null>(null);
  const [correctionsAnalyzing, setCorrectionsAnalyzing] = useState(false);
  const [selectedCorrectionId, setSelectedCorrectionId] = useState<string | null>(null);

  // ── Right drawer ──────────────────────────────────────────────
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  // ── Modals ────────────────────────────────────────────────────
  const [showProcSelector, setShowProcSelector] = useState<'revision' | 'corrections' | null>(null);
  const [showCreateTask, setShowCreateTask]     = useState(false);
  const [taskSourcePoint, setTaskSourcePoint]   = useState<RevisionPoint | null>(null);

  // ── Computed ──────────────────────────────────────────────────
  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) ?? tabs[0], [tabs, activeTabId]);
  const activeTask = activeTab?.type === 'task' ? activeTab.task : null;
  const activeProcedureId =
    activeTab?.type === 'task'   ? activeTab.task.procedure_id :
    activeTab?.type === 'editor' ? activeTab.procedureId : null;
  const activeProcedure = activeProcedureId ? (procCache[activeProcedureId] ?? null) : null;

  const isAdmin = profile?.global_role === 'admin';

  const currentActor = useMemo<TaskActor | null>(() => {
    if (!profile) return null;
    return {
      id:          profile.id,
      name:        str(profile.full_name || profile.display_name || profile.email),
      email:       profile.email,
      role:        profile.global_role === 'admin' ? 'admin' : 'user',
      job_title:   profile.job_title ?? null,
      department:  profile.department ?? null,
      global_role: profile.global_role,
    };
  }, [profile]);

  // ── Right panel mode (derived) ────────────────────────────────
  const rightMode = useMemo(() => {
    if (activeTab.type === 'campaign') return 'campaign' as const;
    if (activeTab.type !== 'task') return 'deadline' as const;
    if (activeTool === 'revision')    return 'revision' as const;
    if (activeTool === 'corrections') return 'corrections' as const;
    return 'task-info' as const;
  }, [activeTab, activeTool]);

  // ── Auto-open/close right drawer based on context ──
  useEffect(() => {
    if (activeTab.type === 'task' || activeTab.type === 'campaign') {
      setRightDrawerOpen(true);
    } else {
      setRightDrawerOpen(false);
    }
  }, [activeTab.type, activeTab.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTool !== 'none') setRightDrawerOpen(true);
  }, [activeTool]);

  // ── Ajoute l'onglet Activité pour admin dès que le profil est connu ──
  useEffect(() => {
    if (!isAdmin) return;
    setTabs(prev => {
      if (prev.some(t => t.id === 'activity')) return prev;
      return [prev[0], { id: 'activity', type: 'activity' } as WorkspaceTab, ...prev.slice(1)];
    });
  }, [isAdmin]);

  // ── Refs for client-side enrichment (avoid callback deps) ────
  const storeProceduresRef = useRef(storeProcedures);
  const campaignsRef = useRef(campaigns);
  useEffect(() => { storeProceduresRef.current = storeProcedures; }, [storeProcedures]);
  useEffect(() => { campaignsRef.current = campaigns; }, [campaigns]);

  // ── Load data ─────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      setDataLoading(true);
      try {
        const [cr, tr] = await Promise.all([campaignsApi.list(), taxonomyApi.getFlat()]);
        setCampaigns(cr.campaigns ?? []);
        setTaxNodes((tr.nodes ?? []).map((n: any) => ({ id: n.id, name: n.name, level: n.level, parent_id: n.parent_id })));
      } catch { /* silent */ }
      finally { setDataLoading(false); }
    };
    init();
    fetchProcedures();
  }, [fetchProcedures]);

  const loadMyTasks = useCallback(async () => {
    if (!profile?.id) return;
    setTasksLoading(true);
    try {
      const adminUser = profile.global_role === 'admin';

      let rawTasks: ProcedureTask[];
      if (adminUser) {
        // Admin : tâches assignées PAR lui + tâches assignées À lui (merge + dédup)
        const [byAdmin, toAdmin] = await Promise.all([
          orchestrationTasksApi.listTasks({ assigned_by: profile.id }),
          orchestrationTasksApi.listTasks({ actor_id: profile.id }),
        ]);
        const seen = new Set<string>();
        rawTasks = [...(byAdmin.tasks ?? []), ...(toAdmin.tasks ?? [])].filter(t => {
          if (seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });
      } else {
        const res = await orchestrationTasksApi.listTasks({ actor_id: profile.id });
        rawTasks = res.tasks ?? [];
      }

      rawTasks = rawTasks.filter(t => t.status !== 'cancelled' && t.status !== 'validated');

      // Enrichissement client-side : campaign_id/name depuis les campagnes déjà chargées
      const camps = campaignsRef.current;
      const cpMap = new Map<string, { campaign_id: string; campaign_name: string }>();
      camps.forEach(c => {
        (c.procedures ?? []).forEach(p => {
          if (!cpMap.has(p.procedure_id)) {
            cpMap.set(p.procedure_id, { campaign_id: c.id, campaign_name: c.title });
          }
        });
      });

      const enriched: EnrichedTask[] = rawTasks.map(t => {
        const cp = cpMap.get(t.procedure_id);
        return {
          ...t,
          procedure_name: str(t.procedure_name) || 'Procédure',
          campaign_id: cp?.campaign_id ?? null,
          campaign_name: cp?.campaign_name ?? null,
        };
      });
      setMyTasks(enriched);
    } catch { /* silent */ }
    finally { setTasksLoading(false); }
  }, [profile?.id, profile?.global_role]);

  useEffect(() => { loadMyTasks(); }, [loadMyTasks]);

  // ── Handle openProcedureId prop ───────────────────────────────
  useEffect(() => {
    if (!openProcedureId) return;
    const tabId = `editor-${openProcedureId}`;
    if (tabs.some(t => t.id === tabId)) { setActiveTabId(tabId); return; }
    orchestrationApi.getProcedure(openProcedureId).then(res => {
      const proc = res.procedure;
      setProcCache(prev => ({ ...prev, [openProcedureId]: proc }));
      setTabs(prev => {
        if (prev.some(t => t.id === tabId)) return prev;
        return [...prev.filter(t => t.type !== 'campaign'), { id: tabId, type: 'editor', procedureId: openProcedureId, procedure: proc, procedureName: proc.nom }];
      });
      setActiveTabId(tabId);
    }).catch(() => {});
  }, [openProcedureId]); // eslint-disable-line

  // ── URL deep link on mount ────────────────────────────────────
  useEffect(() => {
    const pid = searchParams.get('procedure_id');
    if (!pid) return;
    const tabId = `editor-${pid}`;
    orchestrationApi.getProcedure(pid).then(res => {
      const proc = res.procedure;
      setProcCache(prev => ({ ...prev, [pid]: proc }));
      setTabs(prev => prev.some(t => t.id === tabId) ? prev : [...prev, { id: tabId, type: 'editor', procedureId: pid, procedure: proc, procedureName: proc.nom }]);
      setActiveTabId(tabId);
    }).catch(() => {});
  }, []); // eslint-disable-line

  // ── taskId deep link (depuis email) ───────────────────────────
  useEffect(() => {
    const taskId = searchParams.get('taskId');
    if (!taskId) return;
    const tabId = `task-${taskId}`;
    orchestrationTasksApi.getTask(taskId).then(res => {
      const t = res.task;
      const enriched: EnrichedTask = {
        ...t,
        procedure_name: str(t.procedure_name) || 'Procédure',
        campaign_id: null,
        campaign_name: null,
      };
      setTabs(prev => {
        if (prev.some(tab => tab.id === tabId)) return prev;
        return [...prev.filter(tab => tab.type !== 'campaign'), {
          id: tabId, type: 'task' as const, task: enriched, mode: 'detail' as const,
        }];
      });
      setActiveTabId(tabId);
    }).catch(() => {});
  }, []); // eslint-disable-line

  // ── Reset tool when leaving task tab ─────────────────────────
  useEffect(() => {
    if (activeTab.type !== 'task') setActiveTool('none');
  }, [activeTab.type]);

  // ── Tab management ────────────────────────────────────────────

  const loadProc = useCallback(async (procId: string): Promise<Procedure | null> => {
    if (procCache[procId]) return procCache[procId];
    try {
      const res = await orchestrationApi.getProcedure(procId);
      setProcCache(prev => ({ ...prev, [procId]: res.procedure }));
      return res.procedure;
    } catch { return null; }
  }, [procCache]);

  const openTaskTab = useCallback((task: EnrichedTask) => {
    const tabId = `task-${task.id}`;
    setTabs(prev => {
      if (prev.some(t => t.id === tabId)) return prev;
      return [...prev.filter(t => t.type !== 'campaign'), { id: tabId, type: 'task', task, mode: 'detail' }];
    });
    setActiveTabId(tabId);
    setActiveTool('none');
    setRevisionSession(null);
    setCorrectionsSession(null);
  }, []);

  const refreshCampaigns = useCallback(async () => {
    const res = await campaignsApi.list().catch(() => null);
    if (res) setCampaigns(res.campaigns ?? []);
  }, []);

  const openCampaignTab = useCallback((campaign: Campaign) => {
    const tabId = `campaign-${campaign.id}`;
    setTabs(prev => {
      if (prev.some(t => t.id === tabId)) return prev;
      return [...prev, { id: tabId, type: 'campaign', campaign }];
    });
    setActiveTabId(tabId);
    // Fetch fresh campaign data (with procedures) in background
    campaignsApi.get(campaign.id)
      .then(res => {
        setTabs(prev => prev.map(t =>
          t.id === tabId && t.type === 'campaign' ? { ...t, campaign: res.campaign } : t
        ));
      })
      .catch(() => {});
  }, []);

  const openNode = useCallback((campaign: Campaign) => {
    openCampaignTab(campaign);
  }, [openCampaignTab]);

  const openEditorTab = useCallback(async (procedureId: string) => {
    const tabId = `editor-${procedureId}`;
    const proc = await loadProc(procedureId);
    if (!proc) return;
    setTabs(prev => {
      if (prev.some(t => t.id === tabId)) return prev;
      return [...prev.filter(t => t.type !== 'campaign'), { id: tabId, type: 'editor', procedureId, procedure: proc, procedureName: proc.nom }];
    });
    setActiveTabId(tabId);
  }, [loadProc]);

  const closeTab = useCallback((tabId: string) => {
    if (tabId === 'backlog' || tabId === 'activity') return;
    setTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTabId === tabId) setActiveTabId('backlog');
  }, [activeTabId]);

  const switchToEditor = useCallback(async () => {
    if (activeTab?.type !== 'task') return;
    const tabId = activeTab.id;
    const proc = await loadProc(activeTab.task.procedure_id);
    if (!proc) return;
    setTabs(prev => prev.map(t =>
      t.id === tabId && t.type === 'task' ? { ...t, mode: 'editor' as const, procedure: proc } : t
    ));
  }, [activeTab, loadProc]);

  const switchToDetail = useCallback(() => {
    if (activeTab?.type !== 'task') return;
    setTabs(prev => prev.map(t =>
      t.id === activeTab.id && t.type === 'task' ? { ...t, mode: 'detail' as const } : t
    ));
  }, [activeTab]);

  const updateActiveTask = useCallback((updated: EnrichedTask) => {
    setTabs(prev => prev.map(t =>
      t.id === activeTabId && t.type === 'task' ? { ...t, task: updated } : t
    ));
    setMyTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
  }, [activeTabId]);

  // ── Tool activation ───────────────────────────────────────────

  const handleActivateTool = useCallback(async (tool: 'revision' | 'corrections') => {
    if (!activeProcedureId) { setShowProcSelector(tool); return; }
    await loadProc(activeProcedureId);
    setActiveTool(tool);
  }, [activeProcedureId, loadProc]);

  const handleRevise = useCallback(async () => {
    if (!activeProcedure) return;
    setRevisingLoading(true);
    setRevisionSession(null);
    setSelectedRevisionId(null);
    try {
      const meta = (activeProcedure as any).metadata || {};
      const reglesRaw = meta.regles_gestion;
      const regles_gestion: string[] = Array.isArray(reglesRaw)
        ? (reglesRaw as unknown[]).map(String).filter(Boolean)
        : typeof reglesRaw === 'string' && reglesRaw
          ? reglesRaw.split('\n').map((r: string) => r.trim()).filter(Boolean)
          : [];
      const result = await workspaceApi.revise({
        procedure_id: activeProcedure.id,
        nom:          activeProcedure.nom,
        ref:          activeProcedure.ref ?? '',
        objet:        str(meta.objet),
        perimetre:    str(meta.perimeter || meta.perimetre),
        acteurs:      str(meta.acteurs),
        regles_gestion,
        workflow_steps:  (activeProcedure as any).workflow_json || [],
        lifecycle_stages: (activeProcedure as any).lifecycle_stages || [],
      });
      setRevisionSession(result);
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
    finally { setRevisingLoading(false); }
  }, [activeProcedure]);

  const handleCorrectionFile = useCallback(async (file: File) => {
    setCorrectionsAnalyzing(true);
    setCorrectionsSession(null);
    try {
      const result = await correctionsApi.analyze(file);
      setCorrectionsSession(result);
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
    finally { setCorrectionsAnalyzing(false); }
  }, []);

  const handleCorrectionStatusChange = useCallback((id: string, status: RemarkStatus) => {
    setCorrectionsSession(prev =>
      prev ? { ...prev, remarks: prev.remarks.map(r => r.id === id ? { ...r, status } : r) } : prev
    );
  }, []);

  // ── Tab label ─────────────────────────────────────────────────

  const tabLabel = (tab: WorkspaceTab): string => {
    const trunc = (s: string) => s.length > 22 ? s.slice(0, 22) + '…' : s;
    if (tab.type === 'backlog')   return 'Backlog';
    if (tab.type === 'activity')  return 'Activité';
    if (tab.type === 'task')      return trunc(tab.task.title);
    if (tab.type === 'campaign')  return trunc(tab.campaign.title);
    if (tab.type === 'editor')    return trunc(tab.procedureName ?? tab.procedureId);
    return 'Onglet';
  };

  // ── Header ────────────────────────────────────────────────────

  const renderHeader = () => {
    if (activeTab.type === 'activity') return (
      <>
        <History className="w-4 h-4 text-indigo-500 shrink-0" />
        <span className="text-sm font-semibold text-gray-700 flex-1">Journal d'activité</span>
      </>
    );

    if (activeTab.type === 'backlog') return (
      <>
        <span className="text-sm font-semibold text-gray-700 flex-1">Espace de travail personnel</span>
        {leftFilter && (
          <span className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1 font-medium">
            <Filter className="w-3 h-3" /> {leftFilter.label}
            <button type="button" onClick={() => setLeftFilter(null)} title="Effacer le filtre" className="ml-0.5 text-blue-400 hover:text-blue-700"><X className="w-3 h-3" /></button>
          </span>
        )}
        <button type="button" onClick={loadMyTasks} title="Rafraîchir" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
          {tasksLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </>
    );

    if (activeTab.type === 'campaign') return (
      <>
        <Megaphone className="w-4 h-4 text-orange-500 shrink-0" />
        <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{activeTab.campaign.title}</span>
      </>
    );

    if (activeTab.type === 'editor') return (
      <>
        {onNavigateBack && (
          <button type="button" onClick={onNavigateBack}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium shrink-0 mr-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Procédures
          </button>
        )}
        <PenLine className="w-4 h-4 text-blue-500 shrink-0" />
        <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{activeTab.procedureName ?? activeTab.procedureId}</span>
        {onOpenStudio && (
          <button type="button" onClick={() => onOpenStudio(activeTab.procedureId)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg transition-colors shrink-0 ml-2">
            <Wand2 className="w-3.5 h-3.5" /> Studio IA
          </button>
        )}
      </>
    );

    if (activeTab.type === 'task') {
      const { task, mode } = activeTab;
      return (
        <>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${TASK_STATUS_COLORS[task.status]}`}>
              {TASK_STATUS_LABELS[task.status]}
            </span>
            <span className="text-sm font-medium text-gray-700 truncate">{task.procedure_name}</span>
          </div>
          {mode === 'detail' && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" onClick={() => handleActivateTool('revision')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 border text-xs rounded-lg transition-colors ${
                  activeTool === 'revision'
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700'
                }`}>
                <Wand2 className="w-3.5 h-3.5" /> Révision IA
              </button>
              <button type="button" onClick={() => handleActivateTool('corrections')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 border text-xs rounded-lg transition-colors ${
                  activeTool === 'corrections'
                    ? 'border-rose-400 bg-rose-50 text-rose-700'
                    : 'border-gray-200 text-gray-600 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700'
                }`}>
                <PenLine className="w-3.5 h-3.5" /> Corrections
              </button>
            </div>
          )}
        </>
      );
    }
    return null;
  };

  // ── JSX ───────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-white">

      {/* HEADER */}
      <div className="shrink-0 px-4 py-2 border-b border-gray-100 bg-white flex items-center gap-3 min-h-[44px]">
        {renderHeader()}
        {!rightDrawerOpen && activeTab.type !== 'activity' && (
          <button type="button" onClick={() => setRightDrawerOpen(true)} title="Ouvrir le panneau"
            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 border border-gray-200">
            <Layers className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* TAB BAR */}
      <div className="shrink-0 flex border-b border-gray-100 bg-white overflow-x-auto scrollbar-none">
        {tabs.map(tab => {
          const active = tab.id === activeTabId;
          return (
            <div key={tab.id}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 whitespace-nowrap cursor-pointer select-none transition-colors ${
                active ? 'border-blue-600 text-blue-700 bg-blue-50/40' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
              onClick={() => setActiveTabId(tab.id)}>
              {tab.type === 'backlog'   && <FileSearch className="w-3 h-3 shrink-0" />}
              {tab.type === 'activity'  && <History className="w-3 h-3 shrink-0" />}
              {tab.type === 'task'      && <CheckCircle2 className="w-3 h-3 shrink-0" />}
              {tab.type === 'campaign'  && <Megaphone className="w-3 h-3 shrink-0" />}
              {tab.type === 'editor'    && <PenLine className="w-3 h-3 shrink-0" />}
              <span className="text-[11px] font-medium">{tabLabel(tab)}</span>
              {tab.type !== 'backlog' && tab.type !== 'activity' && (
                <button type="button"
                  onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                  title="Fermer l'onglet"
                  className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* BODY: 3 columns */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT PANEL */}
        <div className="w-52 shrink-0 border-r border-gray-100 bg-gray-50/50 overflow-y-auto">
          {dataLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : (
            <LeftPanelTree
              campaigns={campaigns}
              myTasks={myTasks}
              currentUserId={profile?.id ?? null}
              isAdmin={isAdmin}
              filter={leftFilter}
              onSetFilter={setLeftFilter}
              onOpenEditor={openEditorTab}
            />
          )}
        </div>

        {/* CENTER */}
        <div className="flex-1 overflow-hidden">
          {activeTab.type === 'activity' && <ActivityFeed />}
          {activeTab.type === 'backlog' && (
            <BacklogView
              tasks={myTasks}
              loading={tasksLoading}
              filter={leftFilter}
              onClearFilter={() => setLeftFilter(null)}
              onOpenTask={openTaskTab}
              currentUserId={profile?.id}
            />
          )}
          {activeTab.type === 'task' && (
            <TaskDetailCenter
              tab={activeTab}
              onSwitchToEditor={switchToEditor}
              onSwitchToDetail={switchToDetail}
              onTaskUpdated={updateActiveTask}
              currentActor={currentActor}
            />
          )}
          {activeTab.type === 'campaign' && (
            <CampaignDrilldown
              campaign={activeTab.campaign}
              taxNodes={taxNodes}
              storeProcedures={storeProcedures}
              onOpenProcedure={openEditorTab}
              isAdmin={isAdmin}
              onRefreshCampaign={async () => {
                const res = await campaignsApi.get(activeTab.campaign.id).catch(() => null);
                if (res) {
                  setTabs(prev => prev.map(t =>
                    t.id === activeTab.id && t.type === 'campaign' ? { ...t, campaign: res.campaign } : t
                  ));
                  refreshCampaigns();
                }
              }}
            />
          )}
          {activeTab.type === 'editor' && (
            activeTab.procedure
              ? <ProcedureEditor key={activeTab.procedureId} procedure={activeTab.procedure} hideHeader />
              : <div className="flex items-center justify-center h-full bg-gray-50"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>
          )}
        </div>

        {/* RIGHT DRAWER (contextual) */}
        {rightDrawerOpen && (
          <div className="w-[280px] shrink-0 border-l border-gray-100 bg-white overflow-hidden flex flex-col">
            {/* Drawer close button */}
            <div className="shrink-0 flex items-center justify-end px-2 pt-2">
              <button type="button" onClick={() => { setRightDrawerOpen(false); if (activeTool !== 'none') setActiveTool('none'); }}
                title="Fermer le panneau"
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {rightMode === 'campaign' && activeTab.type === 'campaign' && (
              <CampaignDetailPanel
                campaign={activeTab.campaign}
                isAdmin={isAdmin}
                onClose={() => closeTab(activeTab.id)}
                onRefresh={updated => {
                  setTabs(prev => prev.map(t =>
                    t.id === activeTab.id && t.type === 'campaign' ? { ...t, campaign: updated } : t
                  ));
                  refreshCampaigns();
                }}
                onOpenProcedure={openEditorTab}
              />
            )}
            {rightMode === 'deadline' && <DeadlinePanel tasks={myTasks} onOpenTask={openTaskTab} />}
            {rightMode === 'task-info' && activeTask && (
              <TaskInfoPanel task={activeTask} onSwitchTool={handleActivateTool} />
            )}
            {rightMode === 'revision' && activeProcedure && (
              <RevisionTool
                procedure={activeProcedure}
                session={revisionSession}
                loading={revisingLoading}
                onRun={handleRevise}
                selectedId={selectedRevisionId}
                onSelect={point => setSelectedRevisionId(prev => prev === point.id ? null : point.id)}
                onCreateTask={point => { setTaskSourcePoint(point); setShowCreateTask(true); }}
              />
            )}
            {rightMode === 'corrections' && (
              <CorrectionsTool
                session={correctionsSession}
                analyzing={correctionsAnalyzing}
                onFile={handleCorrectionFile}
                selectedId={selectedCorrectionId}
                onSelect={remark => setSelectedCorrectionId(prev => prev === remark.id ? null : remark.id)}
                onStatusChange={handleCorrectionStatusChange}
              />
            )}
            {(rightMode === 'revision' && !activeProcedure) && (
              <div className="flex items-center justify-center flex-1">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODALS */}
      {showCreateCampaign && (
        <WsCreateCampaignModal
          onClose={() => setShowCreateCampaign(false)}
          onCreated={async c => {
            setShowCreateCampaign(false);
            await refreshCampaigns();
            openCampaignTab(c);
          }}
        />
      )}
      {showProcSelector && (
        <ProcedureSelector
          onSelect={async proc => {
            const tool = showProcSelector;
            setShowProcSelector(null);
            await loadProc(proc.id);
            setActiveTool(tool);
          }}
          onClose={() => setShowProcSelector(null)}
        />
      )}

      {showCreateTask && activeProcedure && (
        <CreateTaskModal
          procedure={activeProcedure}
          sourcePoint={taskSourcePoint}
          currentUserName={str(profile?.full_name || profile?.display_name || profile?.email || 'Utilisateur')}
          currentUserId={profile?.id || ''}
          onCreated={async task => {
            setShowCreateTask(false);
            setTaskSourcePoint(null);
            await loadMyTasks();
          }}
          onClose={() => { setShowCreateTask(false); setTaskSourcePoint(null); }}
        />
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { taxonomyApi, TaxonomyNode } from '@/lib/taxonomyApi';
import { Plus, Edit2, Trash2, FolderOpen, Loader2, Map, RefreshCw, FileSearch } from 'lucide-react';

// ─── BIAN uniform colours (matching the standard image) ───────

const C = {
  domainBg:   'bg-[#001489]',
  domainText: 'text-white',
  sectionBg:  'bg-[#001489]',   // "Product Specific Fulfillment" banner
  sectionText:'text-white',
  catBg:      'bg-[#1565C0]',
  catText:    'text-white',
  tileBg:     'bg-[#FFFFCC]',
  tileText:   'text-gray-900',
  tileBorder: 'border border-[#c8c870]',
  colBg:      'bg-gray-200',     // outer column background
};

// ─── Multi-column layout config ───────────────────────────────
// Defines how category groups are arranged into sub-columns per domain

interface Section {
  header: string | null;
  columns: string[][];          // category names, grouped by visual sub-column
}

const LAYOUT: Record<string, Section[]> = {
  'Ventes & Service Client': [
    {
      header: null,
      columns: [
        ['Canaux Spécifiques', 'Multi-Canal', 'Gestion Client', 'Service Client'],
        ['Marketing', 'Ventes'],
      ],
    },
  ],
  'Opérations & Exécution': [
    {
      header: 'Exécution Produits Spécifiques',
      columns: [
        ['Crédits & Dépôts', 'Cartes', 'Services aux Particuliers', 'Opérations de Marché'],
        ['Gestion des Investissements', 'Trading Corporate'],
        ['Banque de Commerce International', 'Financement & Conseil Entreprises'],
      ],
    },
    {
      header: 'Opérations Multi-Produits',
      columns: [
        ['Paiements', 'Gestion des Garanties'],
        ['Gestion des Comptes'],
        ['Services Opérationnels'],
      ],
    },
  ],
  'Fonctions Support': [
    {
      header: null,
      columns: [
        ['Gestion des Systèmes d\'Information', 'Services RH & Entreprise', 'Gestion Connaissances & Propriété Intellectuelle',
         'Bâtiments, Équipements & Installations', 'Relations Institutionnelles',
         'Pilotage & Contrôle', 'Direction Stratégique', 'Gestion Documentaire & Archives'],
        ['Finance', 'Gestion des Ressources Humaines'],
      ],
    },
  ],
};

// ─── Types ────────────────────────────────────────────────────

interface CtxMenu {
  x: number; y: number;
  node: TaxonomyNode;
  level: 'category' | 'subcategory';
}

interface Props {
  onGoToProcedures: () => void;
  onGoToWorkspace?: () => void;
  isAdmin: boolean;
}

// ─── Sub-components ───────────────────────────────────────────

function CategoryBlock({
  cat,
  isAdmin,
  renaming,
  setRenaming,
  onRename,
  onTileClick,
}: {
  cat: TaxonomyNode;
  isAdmin: boolean;
  renaming: { id: string; value: string } | null;
  setRenaming: React.Dispatch<React.SetStateAction<{ id: string; value: string } | null>>;
  onRename: () => void;
  onTileClick: (e: React.MouseEvent, node: TaxonomyNode, level: 'category' | 'subcategory') => void;
}) {
  return (
    <div className="mb-1.5">
      {/* Category header */}
      {renaming?.id === cat.id ? (
        <div className={`${C.catBg} px-1.5 py-1 flex gap-1`}>
          <input
            autoFocus
            title="Nouveau nom"
            className="flex-1 text-[10px] px-1.5 py-0.5 border border-blue-300 rounded bg-white text-gray-900 focus:outline-none"
            value={renaming.value}
            onChange={e => setRenaming(r => r ? { ...r, value: e.target.value } : null)}
            onKeyDown={e => { if (e.key === 'Enter') onRename(); if (e.key === 'Escape') setRenaming(null); }}
          />
          <button type="button" onClick={onRename} className="text-[9px] px-1 py-0.5 bg-white text-blue-800 rounded font-bold">✓</button>
          <button type="button" onClick={() => setRenaming(null)} className="text-[9px] px-1 py-0.5 bg-blue-800 text-white rounded">✕</button>
        </div>
      ) : (
        <div
          className={`${C.catBg} ${C.catText} px-2 py-1 text-[10px] font-bold text-center flex items-center justify-between gap-1 ${isAdmin ? 'cursor-pointer group' : ''}`}
          onClick={e => isAdmin && onTileClick(e, cat, 'category')}
        >
          <span className="flex-1 text-center leading-tight">{cat.name}</span>
          {isAdmin && <Edit2 className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />}
        </div>
      )}

      {/* Service domain tiles */}
      <div className="flex flex-col gap-px mt-px">
        {cat.children.map(sub => {
          const isRenaming = renaming?.id === sub.id;
          return (
            <div key={sub.id}>
              {isRenaming ? (
                <div className="flex gap-0.5 p-0.5 bg-white">
                  <input
                    autoFocus
                    title="Nouveau nom"
                    className="flex-1 text-[10px] px-1 py-0.5 border border-blue-400 rounded focus:outline-none"
                    value={renaming.value}
                    onChange={e => setRenaming(r => r ? { ...r, value: e.target.value } : null)}
                    onKeyDown={e => { if (e.key === 'Enter') onRename(); if (e.key === 'Escape') setRenaming(null); }}
                  />
                  <button type="button" onClick={onRename} className="text-[9px] px-1 py-0.5 bg-blue-600 text-white rounded font-bold">✓</button>
                  <button type="button" onClick={() => setRenaming(null)} className="text-[9px] px-1 py-0.5 bg-gray-300 rounded">✕</button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`w-full text-left text-[10px] px-2 py-0.5 ${C.tileBg} ${C.tileText} ${C.tileBorder} hover:brightness-95 transition-all flex items-center justify-between gap-1`}
                  onClick={e => onTileClick(e, sub, 'subcategory')}
                >
                  <span className="leading-snug">{sub.name}</span>
                  {sub.procedure_count ? (
                    <span className="shrink-0 text-[9px] font-bold px-1 py-px rounded bg-[#001489] text-white">
                      {sub.procedure_count}
                    </span>
                  ) : null}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────

export default function BianServiceMap({ onGoToProcedures, onGoToWorkspace, isAdmin }: Props) {
  const [themes, setThemes] = useState<TaxonomyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [deleteNode, setDeleteNode] = useState<TaxonomyNode | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position the context menu via ref to avoid inline-style lint warning
  useEffect(() => {
    if (menuRef.current && ctxMenu) {
      menuRef.current.style.left = `${ctxMenu.x}px`;
      menuRef.current.style.top  = `${ctxMenu.y}px`;
    }
  }, [ctxMenu]);

  const DOMAIN_ORDER = ['Données de Référence', 'Ventes & Service Client', 'Opérations & Exécution', 'Risque & Conformité', 'Fonctions Support'];

  const loadData = useCallback(async () => {
    try { setLoading(true); setError(null);
      const res = await taxonomyApi.getTree();
      const ordered = DOMAIN_ORDER.map(n => res.tree.find(t => t.name === n)).filter(Boolean) as TaxonomyNode[];
      setThemes(ordered.length > 0 ? ordered : res.tree);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setCtxMenu(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const openMenu = (e: React.MouseEvent, node: TaxonomyNode, level: 'category' | 'subcategory') => {
    e.preventDefault(); e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCtxMenu({ x: Math.min(r.left, window.innerWidth - 228), y: Math.min(r.bottom + 4, window.innerHeight - 180), node, level });
  };

  const handleRename = async () => {
    if (!renaming?.value.trim()) return;
    try { await taxonomyApi.update(renaming.id, { name: renaming.value.trim() }); await loadData(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
    setRenaming(null);
  };

  const handleDelete = async (node: TaxonomyNode) => {
    setDeleteNode(null);
    try { const r = await taxonomyApi.delete(node.id); if (r.detached_procedures > 0) alert(`${r.detached_procedures} procédure(s) détachée(s).`); await loadData(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
  };

  // ── Shared props for CategoryBlock ─────────────────────────

  const catProps = { isAdmin, renaming, setRenaming, onRename: handleRename, onTileClick: openMenu };

  // ── Render a single category by name ───────────────────────

  const renderCat = (catByName: Record<string, TaxonomyNode>, name: string) => {
    const cat = catByName[name];
    if (!cat) return null;
    return <CategoryBlock key={cat.id} cat={cat} {...catProps} />;
  };

  // ── Render a domain column ──────────────────────────────────

  const renderDomain = (theme: TaxonomyNode) => {
    const catByName: Record<string, TaxonomyNode> = {};
    for (const c of theme.children) catByName[c.name] = c;

    const layout = LAYOUT[theme.name];
    const totalSubs = theme.children.reduce((s, c) => s + c.children.length, 0);

    // Header width label
    const subColWidth = 'w-[168px]';

    return (
      <div key={theme.id} className={`${C.colBg} flex flex-col flex-shrink-0 border border-gray-400`}>
        {/* Domain header */}
        <div className={`${C.domainBg} ${C.domainText} px-3 py-2 text-center`}>
          <p className="text-[11px] font-extrabold uppercase tracking-wide leading-tight">{theme.name}</p>
          <p className="text-[9px] opacity-50 mt-0.5">{theme.children.length} categories · {totalSubs} service domains</p>
        </div>

        {/* Body */}
        {layout ? (
          /* ── Multi-column layout ── */
          <div className="flex flex-col">
            {layout.map((section, si) => (
              <div key={si}>
                {/* Section banner (e.g. "Product Specific Fulfillment") */}
                {section.header && (
                  <div className={`${C.sectionBg} ${C.sectionText} text-center py-1 text-[10px] font-semibold`}>
                    {section.header}
                  </div>
                )}
                {/* Sub-columns */}
                <div className="flex">
                  {section.columns.map((colNames, ci) => (
                    <div key={ci} className={`${subColWidth} flex-shrink-0 p-1.5 border-r border-gray-300 last:border-r-0`}>
                      {colNames.map(name => renderCat(catByName, name))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── Single-column layout ── */
          <div className={`${subColWidth} p-1.5`}>
            {theme.children.map(cat => (
              <CategoryBlock key={cat.id} cat={cat} {...catProps} />
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── States ─────────────────────────────────────────────────

  if (loading) return (
    <div className="h-full flex items-center justify-center gap-2 text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      <span className="text-sm">Chargement…</span>
    </div>
  );

  if (error) return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <p className="text-red-500 text-sm">{error}</p>
      <button type="button" onClick={loadData} className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg">Réessayer</button>
    </div>
  );

  if (themes.length === 0) return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-10 text-center">
      <Map className="w-14 h-14 text-gray-200" />
      <div>
        <p className="text-gray-700 font-semibold">Référentiel BIAN non chargé</p>
        <p className="text-sm text-gray-400 mt-1.5 max-w-sm">
          Rendez-vous dans <strong className="text-gray-600">Paramètres</strong> → <strong className="text-gray-600">Charger le référentiel BIAN</strong>.
        </p>
      </div>
    </div>
  );

  // ── Main render ─────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-gray-300">

      {/* Top bar */}
      <div className="shrink-0 px-5 py-2.5 border-b border-gray-300 bg-white flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900">The BIAN Service Landscape v4.0</h2>
          <p className="text-[11px] text-gray-400">Banking Industry Architecture Network — cliquez sur un service domain pour agir</p>
        </div>
        <button type="button" onClick={loadData} title="Actualiser" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Landscape — horizontal scroll */}
      <div className="flex-1 overflow-auto p-3">
        <div className="flex gap-1.5 min-w-max items-start">
          {themes.map(renderDomain)}
        </div>
      </div>

      {/* ── Context menu ──────────────────────────────────── */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
          <div
            ref={menuRef}
            className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 py-1 w-56 text-sm"
          >
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {ctxMenu.level === 'subcategory' ? 'Service Domain' : 'Business Area'}
              </p>
              <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">{ctxMenu.node.name}</p>
              {ctxMenu.node.procedure_count
                ? <p className="text-[10px] text-gray-400">{ctxMenu.node.procedure_count} procédure(s)</p>
                : null}
            </div>

            <button type="button"
              className="w-full text-left px-4 py-2 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
              onClick={() => { setCtxMenu(null); onGoToProcedures(); }}>
              <FolderOpen className="w-3.5 h-3.5 text-blue-500" /> Ouvrir les procédures
            </button>
            {onGoToWorkspace && (
              <button type="button"
                className="w-full text-left px-4 py-2 hover:bg-violet-50 hover:text-violet-700 flex items-center gap-2 transition-colors"
                onClick={() => { setCtxMenu(null); onGoToWorkspace(); }}>
                <FileSearch className="w-3.5 h-3.5 text-violet-500" /> Ouvrir dans le Workspace
              </button>
            )}

            {isAdmin && (<>
              <button type="button"
                className="w-full text-left px-4 py-2 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2 transition-colors"
                onClick={() => { setCtxMenu(null); onGoToProcedures(); }}>
                <Plus className="w-3.5 h-3.5 text-emerald-500" /> Créer une procédure
              </button>
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button type="button"
                  className="w-full text-left px-4 py-2 hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2 transition-colors"
                  onClick={() => { setCtxMenu(null); setRenaming({ id: ctxMenu.node.id, value: ctxMenu.node.name }); }}>
                  <Edit2 className="w-3.5 h-3.5 text-amber-500" /> Renommer
                </button>
                <button type="button"
                  className="w-full text-left px-4 py-2 hover:bg-red-50 hover:text-red-700 flex items-center gap-2 transition-colors"
                  onClick={() => { setCtxMenu(null); setDeleteNode(ctxMenu.node); }}>
                  <Trash2 className="w-3.5 h-3.5 text-red-400" /> Supprimer
                </button>
              </div>
            </>)}
          </div>
        </>
      )}

      {/* ── Delete confirm ────────────────────────────────── */}
      {deleteNode && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-gray-900 mb-2">Supprimer « {deleteNode.name} » ?</h3>
            <p className="text-sm text-gray-500 mb-5">Tous les nœuds enfants seront supprimés. Les procédures liées perdront leur classification.</p>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setDeleteNode(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 font-medium">Annuler</button>
              <button type="button" onClick={() => handleDelete(deleteNode)} className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 font-semibold">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

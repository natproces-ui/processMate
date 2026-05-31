'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronRight, ChevronDown, Plus, Pencil, Trash2,
  Check, X, Loader2, FolderOpen, Folder, FileText,
  AlertTriangle, RefreshCw, Database,
} from 'lucide-react';
import {
  taxonomyApi, TaxonomyNode, TaxonomyLevel,
  LEVEL_LABELS, LEVEL_CHILD, LEVEL_COLORS,
} from '@/lib/taxonomyApi';

// ─── Node row ─────────────────────────────────────────────────

function NodeRow({
  node,
  depth,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  node: TaxonomyNode;
  depth: number;
  onCreated: (n: TaxonomyNode) => void;
  onUpdated: (id: string, name: string, description: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [editDesc, setEditDesc] = useState(node.description ?? '');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const childLevel = LEVEL_CHILD[node.level];
  const colors = LEVEL_COLORS[node.level];
  const hasChildren = node.children.length > 0;

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await taxonomyApi.update(node.id, { name: editName.trim(), description: editDesc.trim() });
      onUpdated(node.id, editName.trim(), editDesc.trim());
      setEditing(false);
    } finally { setSaving(false); }
  };

  const handleAddChild = async () => {
    if (!newName.trim() || !childLevel) return;
    setSaving(true);
    try {
      const res = await taxonomyApi.create({
        name: newName.trim(),
        level: childLevel,
        parent_id: node.id,
      });
      onCreated(res.node);
      setNewName('');
      setAdding(false);
      setOpen(true);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await taxonomyApi.delete(node.id);
      onDeleted(node.id);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const indent = depth * 20;

  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 py-2 pr-3 rounded-lg hover:bg-gray-50 transition-colors ${editing ? 'bg-blue-50' : ''}`}
        style={{ paddingLeft: `${indent + 8}px` }}
      >
        {/* Toggle */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-5 h-5 flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-600"
        >
          {hasChildren || node.children.length > 0
            ? open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
            : <span className="w-3.5" />}
        </button>

        {/* Icône */}
        <span className={`w-4 h-4 rounded-full shrink-0 ${colors.dot}`} />

        {/* Nom ou champ édition */}
        {editing ? (
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <input
              ref={inputRef}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditing(false); }}
              className="flex-1 px-2 py-0.5 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <input
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              placeholder="Description (optionnel)"
              className="w-40 px-2 py-0.5 border border-gray-200 rounded text-xs text-gray-500 focus:outline-none"
            />
            <button type="button" onClick={handleSaveEdit} disabled={saving} className="p-1 text-emerald-600 hover:text-emerald-800">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="p-1 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-900 truncate block">{node.name}</span>
              {node.description && (
                <span className="text-xs text-gray-400 truncate block">{node.description}</span>
              )}
            </div>

            {/* Badges */}
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${colors.bg} ${colors.text}`}>
              {LEVEL_LABELS[node.level]}
            </span>
            {(node.procedure_count ?? 0) > 0 && (
              <span className="text-[10px] text-gray-400 shrink-0 flex items-center gap-0.5">
                <FileText className="w-3 h-3" />{node.procedure_count}
              </span>
            )}

            {/* Actions (visibles au hover) */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {childLevel && (
                <button type="button" title={`Ajouter ${LEVEL_LABELS[childLevel]}`}
                  onClick={() => { setAdding(true); setOpen(true); }}
                  className="p-1 text-gray-400 hover:text-blue-600 rounded">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
              <button type="button" title="Renommer"
                onClick={() => setEditing(true)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded">
                <Pencil className="w-3 h-3" />
              </button>
              {!confirmDelete ? (
                <button type="button" title="Supprimer"
                  onClick={() => setConfirmDelete(true)}
                  className="p-1 text-gray-400 hover:text-red-600 rounded">
                  <Trash2 className="w-3 h-3" />
                </button>
              ) : (
                <div className="flex items-center gap-0.5 bg-red-50 rounded px-1">
                  <span className="text-[10px] text-red-600 font-medium">Confirmer ?</span>
                  <button type="button" onClick={handleDelete} disabled={deleting}
                    className="p-0.5 text-red-600 hover:text-red-800">
                    {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="p-0.5 text-gray-400">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Formulaire ajout enfant */}
      {adding && childLevel && (
        <div className="flex items-center gap-2 py-1.5 pr-3" style={{ paddingLeft: `${indent + 8 + 20 + 8}px` }}>
          <span className={`w-3 h-3 rounded-full shrink-0 ${LEVEL_COLORS[childLevel].dot}`} />
          <input
            ref={inputRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddChild(); if (e.key === 'Escape') setAdding(false); }}
            placeholder={`Nom de la ${LEVEL_LABELS[childLevel].toLowerCase()}…`}
            className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button type="button" onClick={handleAddChild} disabled={saving || !newName.trim()}
            className="p-1 text-emerald-600 hover:text-emerald-800 disabled:opacity-40">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="p-1 text-gray-400">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Enfants */}
      {open && node.children.length > 0 && (
        <div>
          {node.children.map(child => (
            <NodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onCreated={onCreated}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────

export default function TaxonomyTree() {
  const [tree, setTree] = useState<TaxonomyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState('');
  const [addingTheme, setAddingTheme] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    taxonomyApi.getTree()
      .then(res => setTree(res.tree))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // ── Mutations ──────────────────────────────────────────────

  const handleCreated = (node: TaxonomyNode) => {
    // Recharger l'arbre complet pour simplicité
    load();
  };

  const handleUpdated = (id: string, name: string, description: string) => {
    const updateNode = (nodes: TaxonomyNode[]): TaxonomyNode[] =>
      nodes.map(n => n.id === id
        ? { ...n, name, description }
        : { ...n, children: updateNode(n.children) }
      );
    setTree(prev => updateNode(prev));
  };

  const handleDeleted = (id: string) => {
    const removeNode = (nodes: TaxonomyNode[]): TaxonomyNode[] =>
      nodes.filter(n => n.id !== id).map(n => ({ ...n, children: removeNode(n.children) }));
    setTree(prev => removeNode(prev));
  };

  const handleAddTheme = async () => {
    if (!newThemeName.trim()) return;
    setSaving(true);
    try {
      const res = await taxonomyApi.create({ name: newThemeName.trim(), level: 'theme' });
      setTree(prev => [...prev, { ...res.node, children: [] }]);
      setNewThemeName('');
      setAddingTheme(false);
    } finally { setSaving(false); }
  };

  const handleMigrate = async () => {
    setMigrating(true);
    setMigrateMsg('');
    try {
      const res = await taxonomyApi.migrate();
      setMigrateMsg(`✓ Migration réussie — ${res.procedures_linked} procédures liées`);
      load();
    } catch (e: unknown) {
      setMigrateMsg(`✗ ${e instanceof Error ? e.message : 'Erreur migration'}`);
    } finally { setMigrating(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
      <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
      <span className="text-sm">Chargement…</span>
    </div>
  );

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Taxonomie des processus</h2>
          <p className="text-sm text-gray-500 mt-0.5">Thème → Catégorie → Sous-catégorie → Procédures</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={load} title="Actualiser"
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-700">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setAddingTheme(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" /> Nouveau thème
          </button>
        </div>
      </div>

      {/* Arbre */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        {tree.length === 0 && !addingTheme ? (
          <div className="text-center py-10 text-gray-400 space-y-3">
            <FolderOpen className="w-12 h-12 mx-auto opacity-30" />
            <p className="font-medium">Aucune taxonomie définie</p>
            <p className="text-sm">
              Créez un thème ou lancez la migration pour importer les catégories existantes.
            </p>
          </div>
        ) : (
          <>
            {tree.map(node => (
              <NodeRow
                key={node.id}
                node={node}
                depth={0}
                onCreated={handleCreated}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
              />
            ))}
          </>
        )}

        {/* Formulaire nouveau thème */}
        {addingTheme && (
          <div className="flex items-center gap-2 p-2 mt-1 border border-dashed border-indigo-300 rounded-lg bg-indigo-50/50">
            <span className={`w-4 h-4 rounded-full shrink-0 bg-indigo-500`} />
            <input
              autoFocus
              value={newThemeName}
              onChange={e => setNewThemeName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddTheme(); if (e.key === 'Escape') setAddingTheme(false); }}
              placeholder="Nom du thème…"
              className="flex-1 px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <button type="button" onClick={handleAddTheme} disabled={saving || !newThemeName.trim()}
              className="p-1 text-emerald-600 hover:text-emerald-800 disabled:opacity-40">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button type="button" onClick={() => setAddingTheme(false)} className="p-1 text-gray-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-4">
        {(['theme', 'category', 'subcategory'] as TaxonomyLevel[]).map(lvl => (
          <div key={lvl} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`w-2.5 h-2.5 rounded-full ${LEVEL_COLORS[lvl].dot}`} />
            {LEVEL_LABELS[lvl]}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <FileText className="w-3 h-3" /> = nb procédures liées
        </div>
      </div>

      {/* Section migration */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Database className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Migration one-shot</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Importe les catégories existantes des procédures et crée automatiquement
              Thème &rarr; Catégorie &rarr; Sous-catégories. À exécuter une seule fois.
            </p>
          </div>
        </div>
        {migrateMsg && (
          <p className={`text-xs font-medium px-3 py-2 rounded-lg ${migrateMsg.startsWith('✓') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {migrateMsg}
          </p>
        )}
        <button
          type="button"
          onClick={handleMigrate}
          disabled={migrating}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {migrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Lancer la migration
        </button>
      </div>
    </div>
  );
}

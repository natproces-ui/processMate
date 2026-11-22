'use client';

/**
 * Enregistrer une procédure à sa place.
 * Les campagnes sont des dossiers (campagne › thème › catégorie › sous-catégorie › procédures),
 * puis viennent les thèmes hors campagne. On choisit la procédure à mettre à jour, ou un
 * endroit pour en créer une (pilotage) ou en proposer une (contributeur).
 * Ne sont listées que les procédures où l'on est R ou A (le pilotage voit tout).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, FileText, Folder, Loader2, Search, Sparkles, X } from 'lucide-react';
import { saveTargetsApi, type SaveTaxonomyNode, type SaveTree } from '@/lib/saveTargetsApi';

export type SaveChoice =
    | { kind: 'procedure'; procedureId: string; titre: string }
    | { kind: 'slot'; slotId: string; titre: string }
    | { kind: 'new'; titre: string; taxonomyId: string | null; campaignId: string | null; message?: string };

interface Item { key: string; titre: string; taxonomyId: string | null; procedureId: string | null; slotId: string | null; ecriture: boolean }
interface FolderData { key: string; label: string; note?: string; readOnly: boolean; campaignId: string | null; rootId: string | null; items: Item[] }

type Selection =
    | { type: 'item'; folder: FolderData; item: Item }
    | { type: 'place'; folder: FolderData; taxonomyId: string | null; path: string };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const STATUT_LABELS: Record<string, string> = { completed: 'Terminée', archived: 'Archivée', blocked: 'Bloquée', draft: 'Brouillon', on_hold: 'En pause' };

export default function SaveTargetModal({ open, titre, bulk, onClose, onConfirm }: {
    open: boolean;
    titre: string;
    /** « Tout enregistrer » : les titres des procédures à ranger au même endroit (chacune sous son nom) */
    bulk?: string[];
    onClose: () => void;
    onConfirm: (choice: SaveChoice) => Promise<void>;
}) {
    const [tree, setTree] = useState<SaveTree | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [q, setQ] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [sel, setSel] = useState<Selection | null>(null);
    const [newTitle, setNewTitle] = useState(titre);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);

    // Chargée à l'ouverture seulement (le titre change pendant l'enregistrement : pas de rechargement)
    useEffect(() => {
        if (!open) return;
        setTree(null); setError(null); setQ(''); setSel(null); setNewTitle(titre); setMessage('');
        saveTargetsApi.tree(titre).then(setTree).catch(e => setError(e instanceof Error ? e.message : 'Liste indisponible'));
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, busy, onClose]);

    const byId = useMemo(() => new Map((tree?.taxonomie || []).map(n => [n.id, n])), [tree]);
    const childrenOf = useMemo(() => {
        const m = new Map<string | null, SaveTaxonomyNode[]>();
        for (const n of tree?.taxonomie || []) {
            const p = n.parent_id && byId.has(n.parent_id) ? n.parent_id : null;
            m.set(p, [...(m.get(p) || []), n]);
        }
        return m;
    }, [tree, byId]);
    const rootOf = (id: string | null) => {
        let cur = id ? byId.get(id) : undefined;
        while (cur?.parent_id && byId.has(cur.parent_id)) cur = byId.get(cur.parent_id);
        return cur?.id ?? null;
    };
    const pathOf = (id: string | null) => {
        const parts: string[] = [];
        let cur = id ? byId.get(id) : undefined;
        while (cur) { parts.unshift(cur.name); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
        return parts.join(' › ');
    };

    // Dossiers : campagnes, puis un dossier par thème hors campagne
    const folders = useMemo<FolderData[]>(() => {
        if (!tree) return [];
        const out: FolderData[] = tree.campagnes.map(c => ({
            key: `c:${c.id}`, label: c.titre, readOnly: c.lecture_seule, campaignId: c.id, rootId: null,
            note: c.lecture_seule || c.statut === 'draft' ? STATUT_LABELS[c.statut] : undefined,
            items: c.emplacements.map(e => ({ key: `s:${e.id}`, titre: e.titre, taxonomyId: e.taxonomy_id,
                procedureId: e.procedure_id, slotId: e.id, ecriture: e.ecriture })),
        }));
        const themes = new Map<string | null, Item[]>();
        for (const o of tree.hors_campagne) {
            const root = rootOf(o.taxonomy_id);
            themes.set(root, [...(themes.get(root) || []), { key: `p:${o.procedure_id}`, titre: o.titre, taxonomyId: o.taxonomy_id,
                procedureId: o.procedure_id, slotId: null, ecriture: o.ecriture }]);
        }
        // le pilotage peut créer dans tout thème, même vide
        const roots = tree.creation === 'directe' ? (childrenOf.get(null) || []).map(n => n.id) : [];
        for (const id of [...(childrenOf.get(null) || []).map(n => n.id).filter(id => themes.has(id) || roots.includes(id))]) {
            out.push({ key: `t:${id}`, label: byId.get(id)!.name, readOnly: false, campaignId: null, rootId: id, items: themes.get(id) || [] });
        }
        if (themes.has(null)) out.push({ key: 't:none', label: 'Non classées', readOnly: false, campaignId: null, rootId: null, items: themes.get(null)! });
        return out;
    }, [tree, byId, childrenOf]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Clés des branches qui mènent à une procédure d'un dossier */
    const branchKeys = (f: FolderData, its: Item[] = f.items) => {
        const keys: string[] = [];
        for (const it of its) { let id = it.taxonomyId; while (id && byId.has(id)) { keys.push(`${f.key}|${id}`); id = byId.get(id)!.parent_id; } }
        return keys;
    };
    const isSuggested = (i: Item) => {
        const s = tree?.suggestion;
        return !!s && ((s.emplacement_id && i.slotId === s.emplacement_id) || (!s.emplacement_id && !i.slotId && i.procedureId === s.procedure_id));
    };

    // Ouverture : tout si c'est court ; les petits dossiers dépliés jusqu'à leurs procédures ; le chemin de la suggestion
    useEffect(() => {
        if (!tree) return;
        const next = new Set<string>();
        for (const f of folders) {
            if (folders.length <= 3) next.add(f.key);
            if (f.items.length <= 20) branchKeys(f).forEach(k => next.add(k));
            const sug = f.items.filter(isSuggested);
            if (sug.length) { next.add(f.key); branchKeys(f, sug).forEach(k => next.add(k)); }
        }
        setExpanded(next);
    }, [tree]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null;

    const needle = norm(q.trim());
    const matches = (it: Item) => !needle || norm(it.titre).includes(needle) || norm(pathOf(it.taxonomyId)).includes(needle);
    const canCreate = tree?.creation != null;
    const toggle = (k: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

    const pickSuggestion = () => {
        for (const f of folders) {
            const it = f.items.find(isSuggested);
            if (it) {
                setSel({ type: 'item', folder: f, item: it });
                setExpanded(prev => new Set([...prev, f.key, ...branchKeys(f, [it])]));
                return;
            }
        }
    };

    const confirm = async () => {
        if (!sel) return;
        setBusy(true);
        setError(null);
        try {
            if (sel.type === 'item') {
                const it = sel.item;
                await onConfirm(it.procedureId ? { kind: 'procedure', procedureId: it.procedureId, titre: it.titre }
                    : { kind: 'slot', slotId: it.slotId!, titre: it.titre });
            } else {
                if (!bulk && newTitle.trim().length < 2) { setError('Donnez un nom à la procédure.'); setBusy(false); return; }
                await onConfirm({ kind: 'new', titre: bulk ? '' : newTitle.trim(), taxonomyId: sel.taxonomyId, campaignId: sel.folder.campaignId,
                    message: message.trim() || undefined });
            }
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Enregistrement impossible');
        } finally {
            setBusy(false);
        }
    };

    // Branche de taxonomie d'un dossier : nœuds qui mènent à ses procédures (et, pour le pilotage, tout le thème)
    const renderFolder = (f: FolderData) => {
        const items = f.items.filter(matches);
        if (needle && items.length === 0 && !norm(f.label).includes(needle)) return null;
        const shown = needle ? items : f.items;
        const keep = new Set<string>();
        for (const it of shown) { let id = it.taxonomyId; while (id && byId.has(id)) { keep.add(id); id = byId.get(id)!.parent_id; } }
        const whole = f.rootId && tree?.creation === 'directe';
        const visible = (n: SaveTaxonomyNode): boolean => keep.has(n.id) || (!!whole && !needle);
        const open_ = expanded.has(f.key) || !!needle;
        const selectable = canCreate && !f.readOnly;

        const itemRow = (it: Item, depth: number) => {
            const active = sel?.type === 'item' && sel.item.key === it.key && sel.folder.key === f.key;
            const disabled = !it.ecriture || !!bulk;  // plusieurs procédures : on choisit un endroit, pas une procédure existante
            return (
                <li key={`${f.key}-${it.key}`}>
                    <button type="button" disabled={disabled} onClick={() => setSel({ type: 'item', folder: f, item: it })}
                        aria-pressed={active}
                        style={{ paddingLeft: 12 + depth * 16 }}
                        className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm ${active ? 'bg-neutral-900 text-white' : disabled ? 'text-neutral-400 cursor-not-allowed' : 'text-neutral-900 hover:bg-neutral-100'}`}>
                        <FileText className="w-4 h-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{it.titre}</span>
                        {!it.procedureId && <span className={`shrink-0 text-xs ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>à créer</span>}
                    </button>
                </li>
            );
        };

        const nodeRows = (parent: string | null, depth: number): ReactNode[] => {
            const kids = (parent === null && f.rootId ? [byId.get(f.rootId)!] : childrenOf.get(parent) || []).filter(Boolean).filter(visible);
            return kids.map(n => {
                const k = `${f.key}|${n.id}`;
                const isOpen = expanded.has(k) || !!needle;
                const here = shown.filter(i => i.taxonomyId === n.id);
                const active = sel?.type === 'place' && sel.folder.key === f.key && sel.taxonomyId === n.id;
                // pour un dossier-thème, le thème lui-même est le dossier : on n'affiche que ses enfants
                if (f.rootId && n.id === f.rootId) {
                    return [...here.map(it => itemRow(it, depth)), ...nodeRows(n.id, depth)];
                }
                return (
                    <li key={k}>
                        <div className={`flex items-center rounded-lg ${active ? 'bg-neutral-100' : ''}`} style={{ paddingLeft: depth * 16 }}>
                            <button type="button" onClick={() => toggle(k)} aria-expanded={isOpen} aria-label={isOpen ? `Replier ${n.name}` : `Déplier ${n.name}`}
                                className="p-1.5 rounded text-neutral-500 hover:text-neutral-900">
                                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                            </button>
                            <button type="button" disabled={!selectable}
                                onClick={() => { setSel({ type: 'place', folder: f, taxonomyId: n.id, path: pathOf(n.id) }); setExpanded(prev => new Set(prev).add(k)); }}
                                title={selectable ? (tree?.creation === 'directe' ? 'Créer une procédure ici' : 'Proposer une procédure ici') : undefined}
                                className={`min-w-0 flex-1 truncate py-1.5 pr-2 text-left text-sm font-medium text-neutral-700 ${selectable ? 'hover:text-neutral-900' : 'cursor-default'}`}>
                                {n.name}
                            </button>
                        </div>
                        {isOpen && <ul>{[...here.map(it => itemRow(it, depth + 1)), ...nodeRows(n.id, depth + 1)]}</ul>}
                    </li>
                );
            }).flat();
        };

        const loose = shown.filter(i => !i.taxonomyId || !byId.has(i.taxonomyId));
        const activeFolder = sel?.type === 'place' && sel.folder.key === f.key && sel.taxonomyId === (f.rootId ?? null);
        return (
            <li key={f.key} className="border-b border-neutral-100 last:border-0">
                <div className={`flex items-center rounded-lg ${activeFolder ? 'bg-neutral-100' : ''}`}>
                    <button type="button" onClick={() => toggle(f.key)} aria-expanded={open_} aria-label={open_ ? `Replier ${f.label}` : `Déplier ${f.label}`}
                        className="p-1.5 rounded text-neutral-500 hover:text-neutral-900">
                        <ChevronRight className={`w-4 h-4 transition-transform ${open_ ? 'rotate-90' : ''}`} />
                    </button>
                    <button type="button"
                        onClick={() => {
                            toggle(f.key);
                            if (selectable && (f.campaignId || f.rootId)) setSel({ type: 'place', folder: f, taxonomyId: f.rootId, path: f.rootId ? pathOf(f.rootId) : '' });
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left text-sm font-semibold text-neutral-900">
                        <Folder className="w-4 h-4 shrink-0" />
                        <span className="truncate">{f.label}</span>
                        {f.note && <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">{f.note}</span>}
                        <span className="ml-auto shrink-0 text-xs font-normal text-neutral-500">{f.items.length}</span>
                    </button>
                </div>
                {open_ && (
                    <ul className="pb-2">
                        {[...(f.rootId ? [] : loose.map(it => itemRow(it, 1))), ...nodeRows(null, 1)]}
                    </ul>
                )}
            </li>
        );
    };

    const empty = tree && folders.length === 0;
    const creationLabel = tree?.creation === 'directe' ? 'Créer la procédure' : 'Proposer au pilote';
    const selPlace = sel?.type === 'place' ? [sel.folder.campaignId ? sel.folder.label : null, sel.path].filter(Boolean).join(' › ') : '';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="save-target-title"
                className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
                <div className="flex items-start gap-3 border-b border-neutral-200 px-5 py-4">
                    <div className="min-w-0 flex-1">
                        <h2 id="save-target-title" className="text-base font-semibold text-neutral-900">
                            {bulk ? `Enregistrer ${bulk.length} procédure${bulk.length > 1 ? 's' : ''}` : <>Enregistrer « {titre || 'Nouvelle procédure'} »</>}
                        </h2>
                        <p className="mt-0.5 text-sm text-neutral-600">
                            {bulk ? 'Choisissez où les ranger : chacune y est ajoutée sous son nom.'
                                : <>Choisissez la procédure à mettre à jour{canCreate ? ', ou un endroit pour en ajouter une' : ''}.</>}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} disabled={busy} aria-label="Fermer" className="p-1.5 rounded-lg text-neutral-900 hover:bg-neutral-100">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
                    {!tree && !error && <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-neutral-400" /></div>}
                    {tree?.suggestion && !needle && !bulk && (
                        <button type="button" onClick={pickSuggestion}
                            className="mb-3 flex w-full items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2.5 text-left text-sm hover:bg-neutral-50">
                            <Sparkles className="w-4 h-4 shrink-0 text-neutral-900" />
                            <span className="min-w-0 flex-1">
                                <span className="text-neutral-600">Procédure correspondante : </span>
                                <span className="font-medium text-neutral-900">{tree.suggestion.titre}</span>
                            </span>
                            <span className="shrink-0 text-xs font-medium text-neutral-900 underline">Choisir</span>
                        </button>
                    )}
                    {tree && !empty && (
                        <label className="mb-2 flex items-center gap-2 rounded-lg border border-neutral-200 px-2.5 py-1.5">
                            <Search className="w-4 h-4 text-neutral-400" />
                            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une procédure, une catégorie…"
                                aria-label="Rechercher" className="w-full bg-transparent text-sm outline-none" />
                        </label>
                    )}
                    {empty && (
                        <p className="rounded-lg bg-neutral-50 px-3 py-3 text-sm text-neutral-700">
                            {tree?.creation
                                ? 'Vous n’êtes responsable (R) ni approbateur (A) d’aucune procédure. Vous pouvez proposer celle-ci au pilote, qui la placera.'
                                : 'Votre rôle ne permet pas d’enregistrer dans le référentiel.'}
                        </p>
                    )}
                    {tree && !empty && <ul>{folders.map(renderFolder)}</ul>}
                    {empty && tree?.creation === 'proposition' && !sel && (
                        <button type="button" onClick={() => setSel({ type: 'place', folder: { key: 'none', label: '', readOnly: false, campaignId: null, rootId: null, items: [] }, taxonomyId: null, path: '' })}
                            className="mt-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900 hover:bg-neutral-50">Proposer sans emplacement</button>
                    )}
                </div>

                <div className="border-t border-neutral-200 px-5 py-3 space-y-2">
                    {sel?.type === 'item' && (
                        <p className="text-sm text-neutral-700">
                            Mettre à jour <span className="font-medium text-neutral-900">« {sel.item.titre} »</span>{sel.folder.campaignId ? <> · {sel.folder.label}</> : null}.{' '}
                            <span className="text-neutral-500">{sel.item.procedureId
                                ? 'Son contenu est remplacé ; la version précédente reste dans l’historique.'
                                : 'La procédure est créée dans le référentiel, à sa place dans la campagne.'}</span>
                        </p>
                    )}
                    {sel?.type === 'place' && (
                        <div className="space-y-2">
                            <p className="text-sm text-neutral-700">
                                {bulk ? (tree?.creation === 'directe' ? `${bulk.length} nouvelle${bulk.length > 1 ? 's' : ''} procédure${bulk.length > 1 ? 's' : ''}` : `Proposer ${bulk.length} procédure${bulk.length > 1 ? 's' : ''}`)
                                    : (tree?.creation === 'directe' ? 'Nouvelle procédure' : 'Proposer une procédure')}
                                {selPlace ? <> dans <span className="font-medium text-neutral-900">{selPlace}</span></> : null}
                                {tree?.creation === 'proposition' && <span className="text-neutral-500"> — le pilote {bulk ? 'les' : 'la'} valide avant {bulk ? 'qu’elles entrent' : 'qu’elle entre'} au référentiel.</span>}
                            </p>
                            {bulk ? (
                                <ul className="max-h-28 overflow-y-auto rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
                                    {bulk.map(t => <li key={t} className="truncate">· {t}</li>)}
                                </ul>
                            ) : (
                                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} aria-label="Nom de la procédure"
                                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900" />
                            )}
                            {tree?.creation === 'proposition' && (
                                <input value={message} onChange={e => setMessage(e.target.value)} placeholder="Un mot pour le pilote (facultatif)"
                                    aria-label="Message au pilote" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900" />
                            )}
                        </div>
                    )}
                    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                    <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-neutral-900 hover:bg-neutral-100">Annuler</button>
                        <button type="button" onClick={() => void confirm()} disabled={!sel || busy}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40">
                            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {sel?.type === 'place' ? (bulk ? (tree?.creation === 'directe' ? 'Tout enregistrer ici' : 'Tout proposer au pilote') : creationLabel) : 'Enregistrer'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

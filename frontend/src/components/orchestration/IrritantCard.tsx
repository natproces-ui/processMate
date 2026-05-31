'use client';

import { useState } from 'react';
import {
    ChevronDown, ChevronRight, Sparkles, Trash2, Edit2,
    MessageSquare, Check, Loader2, BookOpen,
    Zap, AlertCircle, Clock, Monitor, Users, Tag,
} from 'lucide-react';
import { orchestrationApi } from '@/lib/orchestrationApi';
import { API_CONFIG } from '@/lib/api-config';
import { AnalyseZone, type Finding } from './FindingCard';

// ─── Types ────────────────────────────────────────────────────

export type Categorie = 'Rupture d\'information' | 'Automatisation' | 'Délai / Attente' | 'Outil / Système' | 'Organisation' | 'Autre';
export type Criticite = 'Majeur' | 'Moyen' | 'Mineur';
export type Statut = 'ASIS' | 'En cours' | 'TOBE' | 'Résolu';

export const CATEGORIES: Categorie[] = [
    'Rupture d\'information',
    'Automatisation',
    'Délai / Attente',
    'Outil / Système',
    'Organisation',
    'Autre',
];
export const CRITICITES: Criticite[] = ['Majeur', 'Moyen', 'Mineur'];
export const STATUTS: Statut[] = ['ASIS', 'En cours', 'TOBE', 'Résolu'];

export interface Commentaire {
    id: string; auteur: string; contenu: string; created_at: string;
}

export interface Irritant {
    id: string; titre: string; description: string;
    categorie: Categorie; procedure_id: string; procedure_nom: string;
    etape_liee: string; criticite: Criticite; statut: Statut;
    commentaires: Commentaire[]; ia_analyse: string; created_at: string;
    findings?: Finding[];
}

// ─── Configs visuelles ────────────────────────────────────────

export const CATEGORIE_CONFIG: Record<Categorie, { icon: React.ReactNode; color: string; bg: string }> = {
    'Rupture d\'information': { icon: <AlertCircle className="w-3.5 h-3.5" />, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
    'Automatisation': { icon: <Zap className="w-3.5 h-3.5" />, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
    'Délai / Attente': { icon: <Clock className="w-3.5 h-3.5" />, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
    'Outil / Système': { icon: <Monitor className="w-3.5 h-3.5" />, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
    'Organisation': { icon: <Users className="w-3.5 h-3.5" />, color: 'text-teal-600', bg: 'bg-teal-50 border-teal-200' },
    'Autre': { icon: <Tag className="w-3.5 h-3.5" />, color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
};

export const CRITICITE_STYLE: Record<Criticite, string> = {
    Majeur: 'bg-red-100 text-red-700 border border-red-200',
    Moyen: 'bg-orange-100 text-orange-700 border border-orange-200',
    Mineur: 'bg-green-100 text-green-700 border border-green-200',
};

export const STATUT_STYLE: Record<Statut, string> = {
    'ASIS': 'bg-gray-100 text-gray-600',
    'En cours': 'bg-blue-100 text-blue-700',
    'TOBE': 'bg-violet-100 text-violet-700',
    'Résolu': 'bg-emerald-100 text-emerald-700',
};

// ─── Formulaire ───────────────────────────────────────────────

export const EMPTY_FORM = {
    titre: '', description: '', categorie: 'Rupture d\'information' as Categorie,
    procedure_id: '', procedure_nom: '', etape_liee: '',
    criticite: 'Moyen' as Criticite, statut: 'ASIS' as Statut,
};

export function IrritantForm({ initial, procedures, onSave, onCancel, saving }: {
    initial?: Partial<typeof EMPTY_FORM>;
    procedures: { id: string; nom: string }[];
    onSave: (data: typeof EMPTY_FORM) => Promise<void>;
    onCancel: () => void;
    saving: boolean;
}) {
    const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
    const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm(f => ({ ...f, [k]: v }));

    const handleProcedure = (id: string) => {
        const p = procedures.find(p => p.id === id);
        setForm(f => ({ ...f, procedure_id: id, procedure_nom: p?.nom || '' }));
    };

    return (
        <div className="space-y-3">
            <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Titre *</label>
                <input value={form.titre} onChange={e => set('titre', e.target.value)}
                    placeholder="Ex: Vérification manuelle des doublons"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400" />
            </div>
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: 'Catégorie', key: 'categorie', opts: CATEGORIES },
                    { label: 'Criticité', key: 'criticite', opts: CRITICITES },
                    { label: 'Statut', key: 'statut', opts: STATUTS },
                ].map(({ label, key, opts }) => (
                    <div key={key}>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                        <select value={(form as any)[key]}
                            onChange={e => set(key as keyof typeof EMPTY_FORM, e.target.value)}
                            className="w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                            {opts.map(o => <option key={o}>{o}</option>)}
                        </select>
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Procédure liée</label>
                    <select value={form.procedure_id} onChange={e => handleProcedure(e.target.value)}
                        className="w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
                        <option value="">Aucune</option>
                        {procedures.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Étape liée</label>
                    <input value={form.etape_liee} onChange={e => set('etape_liee', e.target.value)}
                        placeholder="Ex: Vérifier le dossier"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400" />
                </div>
            </div>
            <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)}
                    rows={3} placeholder="Décrivez le problème constaté, son impact, le contexte…"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 resize-none" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
                <button onClick={onCancel}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    Annuler
                </button>
                <button onClick={() => onSave(form)} disabled={!form.titre.trim() || saving}
                    className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5">
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Enregistrer
                </button>
            </div>
        </div>
    );
}

// ─── IrritantCard ─────────────────────────────────────────────

export function IrritantCard({ irritant, procedures, onUpdated, onDeleted, numero, onInstruire }: {
    irritant: Irritant;
    procedures: { id: string; nom: string }[];
    onUpdated: (i: Irritant) => void;
    onDeleted: (id: string) => void;
    numero?: number;
    onInstruire: (procedureId: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [commentInput, setCommentInput] = useState('');
    const [addingComment, setAddingComment] = useState(false);
    const [local, setLocal] = useState<Irritant>(irritant);
    const [findings, setFindings] = useState<Finding[]>(irritant.findings || []);
    const [loadingFindings, setLoadingFindings] = useState(false);
    const [autoAnalyse, setAutoAnalyse] = useState(false);

    const cfg = CATEGORIE_CONFIG[local.categorie] ?? CATEGORIE_CONFIG['Autre'];

    const loadFindings = async () => {
        if (findings.length > 0 || !local.procedure_id) return;
        setLoadingFindings(true);
        try {
            const res = await fetch(`${API_CONFIG.baseUrl}/api/irritants/${local.id}/findings`);
            const data = await res.json();
            if (data.success) setFindings(data.findings);
        } catch { /* silencieux */ }
        finally { setLoadingFindings(false); }
    };

    const handleExpand = async () => {
        const next = !expanded;
        setExpanded(next);
        if (next) await loadFindings();
    };

    const handleAnalyser = async () => {
        setAutoAnalyse(false);
        setExpanded(true);
        await loadFindings();
        setTimeout(() => setAutoAnalyse(true), 50);
    };

    const handleSave = async (form: typeof EMPTY_FORM) => {
        setSaving(true);
        try {
            await orchestrationApi.updateIrritant(local.id, form as unknown as Record<string, unknown>);
            const updated = { ...local, ...form };
            setLocal(updated);
            onUpdated(updated);
            setEditing(false);
        } catch (e: any) { alert(e.message); }
        finally { setSaving(false); }
    };

    const handleAddComment = async () => {
        if (!commentInput.trim()) return;
        setAddingComment(true);
        try {
            const res = await orchestrationApi.addCommentaire(local.id, 'Utilisateur', commentInput);
            const updated = { ...local, commentaires: res.commentaires };
            setLocal(updated);
            onUpdated(updated);
            setCommentInput('');
        } catch (e: any) { alert(e.message); }
        finally { setAddingComment(false); }
    };

    const pistesRetenues = findings.flatMap(f => f.pistes || []).filter(p => p.statut === 'retenue').length;
    const pistesTotal = findings.flatMap(f => f.pistes || []).length;

    return (
        <div className={`bg-white rounded-xl border ${cfg.bg} overflow-hidden transition-shadow hover:shadow-sm`}>
            <div className="px-4 py-3">
                {editing ? (
                    <IrritantForm initial={local} procedures={procedures}
                        onSave={handleSave} onCancel={() => setEditing(false)} saving={saving} />
                ) : (
                    <div className="flex items-start gap-3">
                        {/* Numéro + icône */}
                        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                            {numero !== undefined && (
                                <span className="text-xs font-bold text-gray-400 min-w-[1.2rem] text-right">
                                    {numero}.
                                </span>
                            )}
                            <span className={cfg.color}>{cfg.icon}</span>
                        </div>

                        {/* Contenu */}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 leading-snug">{local.titre}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${cfg.bg} ${cfg.color}`}>
                                    {local.categorie}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CRITICITE_STYLE[local.criticite]}`}>
                                    {local.criticite}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_STYLE[local.statut]}`}>
                                    {local.statut}
                                </span>
                                {local.etape_liee && (
                                    <span className="text-xs text-gray-400 italic truncate max-w-[200px]">
                                        → {local.etape_liee}
                                    </span>
                                )}
                                {pistesTotal > 0 && (
                                    <span className="text-xs text-gray-400">
                                        {pistesRetenues}/{pistesTotal} piste{pistesTotal > 1 ? 's' : ''} retenue{pistesRetenues > 1 ? 's' : ''}
                                    </span>
                                )}
                                {local.commentaires.length > 0 && (
                                    <span className="flex items-center gap-0.5 text-xs text-gray-400">
                                        <MessageSquare className="w-3 h-3" />{local.commentaires.length}
                                    </span>
                                )}
                            </div>
                            {local.description && !expanded && (
                                <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{local.description}</p>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                            <button onClick={handleAnalyser}
                                disabled={!local.procedure_id}
                                title={!local.procedure_id ? 'Liez une procédure pour analyser' : 'Analyser avec l\'IA'}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-violet-200">
                                <Sparkles className="w-3.5 h-3.5" />Analyser
                            </button>
                            {local.procedure_id && (
                                <button onClick={() => onInstruire(local.procedure_id)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200">
                                    <BookOpen className="w-3.5 h-3.5" />Instruire
                                </button>
                            )}
                            <button onClick={() => setEditing(true)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors border border-gray-200">
                                <Edit2 className="w-3.5 h-3.5" />Modifier
                            </button>
                            <button onClick={() => onDeleted(local.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors border border-gray-200 hover:border-red-200">
                                <Trash2 className="w-3.5 h-3.5" />Supprimer
                            </button>
                            <button onClick={handleExpand}
                                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400">
                                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Zone dépliée */}
            {expanded && !editing && (
                <div className="border-t border-gray-100 bg-gray-50/30 px-4 py-4 space-y-4">
                    {local.description && (
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{local.description}</p>
                        </div>
                    )}

                    {loadingFindings ? (
                        <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Chargement de l'analyse…
                        </div>
                    ) : (
                        <AnalyseZone
                            irritantId={local.id}
                            procedureId={local.procedure_id}
                            initialFindings={findings}
                            autoStart={autoAnalyse}
                            onFindingsUpdated={(updated) => {
                                setAutoAnalyse(false);
                                setFindings(updated);
                                onUpdated({ ...local, findings: updated });
                            }}
                        />
                    )}

                    {/* Commentaires */}
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                            Commentaires ({local.commentaires.length})
                        </p>
                        {local.commentaires.length > 0 && (
                            <div className="space-y-2 mb-2">
                                {local.commentaires.map(c => (
                                    <div key={c.id} className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <span className="text-xs font-medium text-gray-700">{c.auteur}</span>
                                            <span className="text-xs text-gray-400">
                                                {new Date(c.created_at).toLocaleDateString('fr-FR')}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-600">{c.contenu}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <input value={commentInput} onChange={e => setCommentInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddComment(); }}
                                placeholder="Ajouter un commentaire…"
                                className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                            <button onClick={handleAddComment}
                                disabled={!commentInput.trim() || addingComment}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 disabled:opacity-40 transition-colors">
                                {addingComment ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
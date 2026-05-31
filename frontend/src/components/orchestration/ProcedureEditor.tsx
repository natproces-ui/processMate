'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { generateBPMNSimple } from '@/logic/bpmnGeneratorSimple';
import type { Table1Row } from '@/logic/types';
import { TaskEnrichment, DEFAULT_PROCESS_METADATA } from '@/logic/bpmnTypes';
import type { BpmnEditorHandle } from '@/components/new-way/BpmnEditor';
import DocumentExportPanel from '@/components/DocumentExportPanel';
import ChatInterface from '@/components/ChatInterface';
import SaveToBiblioModal from '@/components/SaveToBiblioModal';
import { Procedure } from '@/lib/orchestrationApi';
import { orchestrationApi } from '@/lib/orchestrationApi';
import {
    Download, Save, Maximize2, X, MessageSquare,
    CheckCircle, AlertCircle, Loader2,
    Edit2, Check, FileText, Settings2, GitBranch, AlignLeft, Wrench,
} from 'lucide-react';

const BpmnEditor = dynamic(() => import('@/components/new-way/BpmnEditor'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-white">
            <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                <p className="text-xs text-slate-400">Chargement BPMN Studio…</p>
            </div>
        </div>
    ),
});

// ─── Types ────────────────────────────────────────────────────

type Section = 'caracteristiques' | 'qualite' | 'diagramme' | 'descriptions' | 'outils';

interface ExtendedMeta {
    objet: string;
    definition: string;
    perimetre: string;
    proprietaire: string;
    regles_gestion: string[];
    [key: string]: unknown;
}

function readMeta(raw: Record<string, unknown>): ExtendedMeta {
    return {
        objet: (raw.objet as string) || '',
        definition: (raw.definition as string) || '',
        perimetre: (raw.perimetre as string) || '',
        proprietaire: (raw.proprietaire as string) || '',
        regles_gestion: Array.isArray(raw.regles_gestion) ? (raw.regles_gestion as string[]) : [],
        ...raw,
    };
}

function emptyEnrichment(id: string): TaskEnrichment {
    return { id_tache: id, descriptif: '', declencheur: '', applicatif: '', duree_estimee: '', frequence: '', kpi: '' };
}

// ─── ProcedureEditor ──────────────────────────────────────────

interface Props {
    procedure: Procedure;
}

export default function ProcedureEditor({ procedure }: Props) {

    // ─── Données ──────────────────────────────────────────────
    const [data, setData] = useState<Table1Row[]>(() => (procedure as any).workflow_json || []);
    const [enrichments, setEnrichments] = useState<Map<string, TaskEnrichment>>(() => {
        const map = new Map<string, TaskEnrichment>();
        const raw = (procedure as any).enrichments_json || {};
        Object.entries(raw).forEach(([id, enr]: [string, any]) => map.set(id, enr));
        return map;
    });
    const [meta, setMeta] = useState<ExtendedMeta>(() =>
        readMeta((procedure.metadata || {}) as Record<string, unknown>)
    );
    const [bpmnXml, setBpmnXml] = useState<string | null>(null);
    const [title] = useState(procedure.nom);

    // ─── UI ───────────────────────────────────────────────────
    const [activeSection, setActiveSection] = useState<Section>('caracteristiques');
    const [chatOpen, setChatOpen] = useState(false);
    const [editorFullscreen, setEditorFullscreen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // ─── Modes édition ────────────────────────────────────────
    const [editingCaract, setEditingCaract] = useState(false);
    const [editingQualite, setEditingQualite] = useState(false);
    const [editingDiagramme, setEditingDiagramme] = useState(false);
    const [editingDescriptions, setEditingDescriptions] = useState(false);
    const [editingOutils, setEditingOutils] = useState(false);

    // ─── Drafts ───────────────────────────────────────────────
    const [draftMeta, setDraftMeta] = useState<ExtendedMeta>(meta);
    const [draftData, setDraftData] = useState<Table1Row[]>(data);
    const [draftEnrichments, setDraftEnrichments] = useState<Map<string, TaskEnrichment>>(enrichments);
    const [newRegle, setNewRegle] = useState('');

    const editorRef = useRef<BpmnEditorHandle>(null);
    const modelerRef = useRef<any>(null);

    const showError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 5000); };
    const showSuccess = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 4000); };

    // Générer le BPMN au montage si workflow présent
    useEffect(() => {
        if (data.length > 0) setBpmnXml(generateBPMNSimple(data, title));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Persistance centrale ─────────────────────────────────
    const saveToDb = useCallback(async (
        d: Table1Row[],
        e: Map<string, TaskEnrichment>,
        m: ExtendedMeta,
    ) => {
        setSaving(true);
        try {
            const enrichObj: Record<string, unknown> = {};
            e.forEach((v, k) => { enrichObj[k] = v; });
            await orchestrationApi.saveWorkflowData(
                procedure.id,
                d as unknown[],
                enrichObj,
                { ...m, nom: title },
            );
        } catch (err: any) {
            showError(`Erreur : ${err.message}`);
            throw err;
        } finally {
            setSaving(false);
        }
    }, [procedure.id, title]);

    // ─── Sauvegarde par section ───────────────────────────────
    const handleSaveCaract = async () => {
        try {
            await saveToDb(data, enrichments, draftMeta);
            setMeta(draftMeta);
            setEditingCaract(false);
            showSuccess('Caractéristiques enregistrées');
        } catch { /* handled */ }
    };

    const handleSaveQualite = async () => {
        try {
            await saveToDb(data, enrichments, draftMeta);
            setMeta(draftMeta);
            setEditingQualite(false);
            showSuccess('Règles de gestion enregistrées');
        } catch { /* handled */ }
    };

    const handleSaveDiagramme = async () => {
        try {
            if (editorRef.current) {
                const xml = await editorRef.current.saveXml();
                if (xml) setBpmnXml(xml);
            }
            await saveToDb(data, enrichments, meta);
            setEditingDiagramme(false);
            showSuccess('Diagramme enregistré');
        } catch { /* handled */ }
    };

    const handleSaveDescriptions = async () => {
        try {
            await saveToDb(data, draftEnrichments, meta);
            setEnrichments(draftEnrichments);
            setEditingDescriptions(false);
            showSuccess('Descriptions enregistrées');
        } catch { /* handled */ }
    };

    const handleSaveOutils = async () => {
        try {
            await saveToDb(draftData, enrichments, meta);
            setData(draftData);
            setEditingOutils(false);
            showSuccess('Outils enregistrés');
        } catch { /* handled */ }
    };

    // ─── BPMN helpers ────────────────────────────────────────
    const handleGenerateBPMN = useCallback(async () => {
        const xml = generateBPMNSimple(data, title);
        setBpmnXml(xml);
        if (editorRef.current) await editorRef.current.importXml(xml);
        showSuccess('Diagramme BPMN régénéré');
    }, [data, title]);

    const handleDownloadBPMN = useCallback(async () => {
        const xml = await editorRef.current?.saveXml() ?? bpmnXml;
        if (!xml) { showError("Générez d'abord le diagramme"); return; }
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${title.replace(/\s+/g, '_')}.bpmn`;
        a.click(); URL.revokeObjectURL(url);
    }, [bpmnXml, title]);

    // Pour SaveToBiblioModal
    const handleSave = useCallback(async (nom: string, category: string) => {
        setSaving(true);
        try {
            const enrichObj: Record<string, unknown> = {};
            enrichments.forEach((v, k) => { enrichObj[k] = v; });
            await orchestrationApi.saveWorkflowData(
                procedure.id, data as unknown[], enrichObj,
                { ...meta, nom, category },
            );
            showSuccess('Procédure sauvegardée');
        } catch (err: any) {
            showError(`Erreur : ${err.message}`);
            throw err;
        } finally {
            setSaving(false);
        }
    }, [data, enrichments, meta, procedure]);

    const captureBpmnDiagram = useCallback(async (): Promise<string | null> => {
        if (!editorRef.current) return null;
        try {
            const svg = await editorRef.current.saveSvg();
            if (!svg) return null;
            return await new Promise<string | null>((resolve) => {
                const img = new Image();
                const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const scale = 2;
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d')!;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.scale(scale, scale);
                    ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(url);
                    resolve(canvas.toDataURL('image/png', 1.0));
                };
                img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
                img.src = url;
            });
        } catch { return null; }
    }, []);

    const handleWorkflowFromChat = useCallback((
        workflow: Table1Row[],
        _: string,
        newEnrichments: Map<string, TaskEnrichment>,
    ) => {
        setData(workflow);
        setDraftData(workflow);
        setBpmnXml(null);
        if (newEnrichments?.size > 0) {
            setEnrichments(newEnrichments);
            setDraftEnrichments(newEnrichments);
        }
    }, []);

    // ─── Config sections ──────────────────────────────────────
    const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
        { id: 'caracteristiques', label: 'Caractéristiques', icon: <FileText className="w-3.5 h-3.5" /> },
        { id: 'qualite', label: 'Qualité', icon: <Settings2 className="w-3.5 h-3.5" /> },
        { id: 'diagramme', label: 'Diagramme', icon: <GitBranch className="w-3.5 h-3.5" /> },
        { id: 'descriptions', label: 'Descriptions', icon: <AlignLeft className="w-3.5 h-3.5" /> },
        { id: 'outils', label: 'Outils', icon: <Wrench className="w-3.5 h-3.5" /> },
    ];

    // ─── Bouton éditer / édition terminée ─────────────────────
    function EditBtn({ editing, onEdit, onSave }: {
        editing: boolean; onEdit: () => void; onSave: () => void;
    }) {
        return editing ? (
            <button type="button" onClick={onSave} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Édition terminée
            </button>
        ) : (
            <button type="button" onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                <Edit2 className="w-3.5 h-3.5" />Éditer
            </button>
        );
    }

    // ─────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full overflow-hidden bg-slate-50">

            {/* Notifications */}
            {error && (
                <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2 text-sm flex-shrink-0">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
                </div>
            )}
            {success && (
                <div className="mx-4 mt-3 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-2 text-sm flex-shrink-0">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" /><span>{success}</span>
                </div>
            )}

            {/* Header */}
            <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4">
                <h2 className="text-base font-bold text-slate-800 truncate">{title}</h2>
                <button type="button" onClick={() => setChatOpen(o => !o)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${chatOpen
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    <MessageSquare className="w-3.5 h-3.5" />
                    {chatOpen ? 'Masquer le chat' : 'Chat IA'}
                </button>
            </div>

            {/* Navigation sections */}
            <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6">
                <div className="flex">
                    {SECTIONS.map(s => (
                        <button key={s.id} type="button" onClick={() => setActiveSection(s.id)}
                            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeSection === s.id
                                ? 'border-blue-600 text-blue-700'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                }`}>
                            {s.icon}{s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">

                {/* Chat */}
                {chatOpen && (
                    <ChatInterface
                        currentWorkflow={data}
                        onWorkflowGenerated={handleWorkflowFromChat}
                        onError={showError}
                        onSuccess={showSuccess}
                    />
                )}

                {/* ══════════════════════════════════════════════
                    CARACTÉRISTIQUES
                ══════════════════════════════════════════════ */}
                {activeSection === 'caracteristiques' && (
                    <div className="max-w-3xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-800">Caractéristiques</h3>
                            <EditBtn
                                editing={editingCaract}
                                onEdit={() => { setDraftMeta({ ...meta }); setEditingCaract(true); }}
                                onSave={handleSaveCaract}
                            />
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                            {([
                                { label: 'Objet', key: 'objet', multiline: true, placeholder: "Objet de la procédure…" },
                                { label: 'Définition', key: 'definition', multiline: true, placeholder: "Définition et contexte…" },
                                { label: 'Périmètre', key: 'perimetre', multiline: true, placeholder: "Périmètre d'application…" },
                                { label: 'Propriétaire', key: 'proprietaire', multiline: false, placeholder: "Direction / propriétaire…" },
                            ] as const).map(({ label, key, multiline, placeholder }) => (
                                <div key={key} className="flex gap-6 px-5 py-4">
                                    <dt className="w-28 shrink-0 text-xs font-semibold text-slate-500 uppercase tracking-wide pt-0.5">
                                        {label}
                                    </dt>
                                    <dd className="flex-1">
                                        {!editingCaract ? (
                                            <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                                                {(meta as any)[key] || <span className="text-slate-400 italic">Non renseigné</span>}
                                            </p>
                                        ) : multiline ? (
                                            <textarea
                                                value={(draftMeta as any)[key] || ''}
                                                onChange={e => setDraftMeta(d => ({ ...d, [key]: e.target.value }))}
                                                placeholder={placeholder} rows={3}
                                                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none leading-relaxed"
                                            />
                                        ) : (
                                            <input type="text"
                                                value={(draftMeta as any)[key] || ''}
                                                onChange={e => setDraftMeta(d => ({ ...d, [key]: e.target.value }))}
                                                placeholder={placeholder}
                                                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                                            />
                                        )}
                                    </dd>
                                </div>
                            ))}

                            {/* Champs en lecture seule */}
                            {[
                                { label: 'Référence', value: procedure.ref || '—' },
                                { label: 'Domaine', value: procedure.category || '—' },
                                { label: 'Version', value: `v${procedure.version}` },
                                { label: 'Statut', value: procedure.status },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex gap-6 px-5 py-3">
                                    <dt className="w-28 shrink-0 text-xs font-semibold text-slate-500 uppercase tracking-wide pt-0.5">
                                        {label}
                                    </dt>
                                    <dd className="flex-1 text-sm text-slate-600">{value}</dd>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════
                    QUALITÉ — règles de gestion
                ══════════════════════════════════════════════ */}
                {activeSection === 'qualite' && (
                    <div className="max-w-3xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-800">Règles de gestion</h3>
                            <EditBtn
                                editing={editingQualite}
                                onEdit={() => { setDraftMeta({ ...meta, regles_gestion: [...meta.regles_gestion] }); setEditingQualite(true); }}
                                onSave={handleSaveQualite}
                            />
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {(editingQualite ? draftMeta.regles_gestion : meta.regles_gestion).length === 0 && !editingQualite && (
                                <div className="px-5 py-10 text-center text-slate-400 text-sm italic">
                                    Aucune règle de gestion définie.
                                </div>
                            )}

                            <div className="divide-y divide-slate-100">
                                {(editingQualite ? draftMeta.regles_gestion : meta.regles_gestion).map((regle, i) => (
                                    <div key={i} className="flex items-center gap-3 px-5 py-3">
                                        <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">
                                            {i + 1}
                                        </span>
                                        {editingQualite ? (
                                            <>
                                                <input type="text" value={regle}
                                                    onChange={e => setDraftMeta(d => ({
                                                        ...d,
                                                        regles_gestion: d.regles_gestion.map((r, j) => j === i ? e.target.value : r),
                                                    }))}
                                                    className="flex-1 text-sm px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                                                />
                                                <button type="button"
                                                    onClick={() => setDraftMeta(d => ({
                                                        ...d,
                                                        regles_gestion: d.regles_gestion.filter((_, j) => j !== i),
                                                    }))}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </>
                                        ) : (
                                            <p className="flex-1 text-sm text-slate-800">{regle}</p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {editingQualite && (
                                <div className="px-5 py-3 border-t border-dashed border-slate-200 flex gap-2">
                                    <input type="text" value={newRegle}
                                        onChange={e => setNewRegle(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && newRegle.trim()) {
                                                setDraftMeta(d => ({ ...d, regles_gestion: [...d.regles_gestion, newRegle.trim()] }));
                                                setNewRegle('');
                                            }
                                        }}
                                        placeholder="Nouvelle règle… (Entrée pour ajouter)"
                                        className="flex-1 text-sm px-3 py-2 border border-dashed border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    />
                                    <button type="button" disabled={!newRegle.trim()}
                                        onClick={() => {
                                            if (newRegle.trim()) {
                                                setDraftMeta(d => ({ ...d, regles_gestion: [...d.regles_gestion, newRegle.trim()] }));
                                                setNewRegle('');
                                            }
                                        }}
                                        className="px-3 py-2 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 disabled:opacity-40 transition-colors">
                                        + Ajouter
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════
                    DIAGRAMME
                ══════════════════════════════════════════════ */}
                {activeSection === 'diagramme' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-800">Logigramme</h3>
                            <div className="flex items-center gap-2">
                                <EditBtn
                                    editing={editingDiagramme}
                                    onEdit={() => setEditingDiagramme(true)}
                                    onSave={handleSaveDiagramme}
                                />
                                <button onClick={handleDownloadBPMN} disabled={!bpmnXml}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 disabled:opacity-40 transition-colors">
                                    <Download className="w-3.5 h-3.5" />Télécharger
                                </button>
                            </div>
                        </div>

                        {!bpmnXml && data.length > 0 && (
                            <button type="button" onClick={handleGenerateBPMN}
                                className="w-full py-4 bg-white border border-dashed border-slate-300 rounded-xl text-sm font-medium text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                                Générer le diagramme BPMN
                            </button>
                        )}

                        {!bpmnXml && data.length === 0 && (
                            <div className="bg-white rounded-xl border border-slate-200 px-5 py-10 text-center text-slate-400 text-sm">
                                Aucun workflow généré. Utilisez le Chat IA pour créer le processus.
                            </div>
                        )}

                        {bpmnXml && (
                            <div className={`bg-white border border-slate-200 rounded-xl overflow-hidden ${editorFullscreen ? 'fixed inset-4 z-50 shadow-2xl' : ''}`}>
                                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                                    <span className="text-xs font-semibold text-slate-500">
                                        {editingDiagramme
                                            ? <span className="text-blue-600">Mode édition</span>
                                            : 'Mode lecture'}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <button type="button" onClick={() => setSaveModalOpen(true)} disabled={saving}
                                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                                            <Save className="w-3 h-3" />Enregistrer
                                        </button>
                                        <button type="button" onClick={() => setEditorFullscreen(f => !f)}
                                            className="p-1.5 rounded hover:bg-slate-200 transition-colors">
                                            <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                                        </button>
                                        {editorFullscreen && (
                                            <button type="button" onClick={() => setEditorFullscreen(false)}
                                                className="p-1.5 rounded hover:bg-slate-200 transition-colors">
                                                <X className="w-3.5 h-3.5 text-slate-500" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div style={{ height: editorFullscreen ? 'calc(100% - 44px)' : '560px' }}>
                                    <BpmnEditor
                                        ref={editorRef}
                                        initialXml={bpmnXml}
                                        onChange={xml => setBpmnXml(xml)}
                                        onError={showError}
                                        onReady={() => { }}
                                        onModelerReady={m => { modelerRef.current = m; }}
                                    />
                                </div>
                            </div>
                        )}

                        {bpmnXml && data.length > 0 && (
                            <DocumentExportPanel
                                data={data}
                                enrichments={enrichments}
                                processMetadata={DEFAULT_PROCESS_METADATA}
                                bpmnXml={bpmnXml}
                                diagramCaptureFn={captureBpmnDiagram}
                                initialMeta={procedure.metadata}
                                onSuccess={showSuccess}
                                onError={showError}
                            />
                        )}
                    </div>
                )}

                {/* ══════════════════════════════════════════════
                    DESCRIPTIONS
                ══════════════════════════════════════════════ */}
                {activeSection === 'descriptions' && (
                    <div className="max-w-3xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-800">Descriptions des étapes</h3>
                            <EditBtn
                                editing={editingDescriptions}
                                onEdit={() => { setDraftEnrichments(new Map(enrichments)); setEditingDescriptions(true); }}
                                onSave={handleSaveDescriptions}
                            />
                        </div>

                        {data.length === 0 ? (
                            <div className="bg-white rounded-xl border border-slate-200 px-5 py-10 text-center text-slate-400 text-sm">
                                Aucune étape disponible. Générez le workflow via le Chat IA.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {data.map((row, idx) => {
                                    const enr = (editingDescriptions ? draftEnrichments : enrichments).get(row.id);
                                    return (
                                        <div key={row.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                            <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100">
                                                <span className="flex-shrink-0 w-6 h-6 bg-slate-200 text-slate-700 rounded-full flex items-center justify-center text-xs font-bold">
                                                    {idx + 1}
                                                </span>
                                                <span className="flex-1 text-sm font-semibold text-slate-800">{row.étape}</span>
                                                {row.département && (
                                                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                                        {row.département}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="px-5 py-4">
                                                {!editingDescriptions ? (
                                                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                                                        {enr?.descriptif || <span className="text-slate-400 italic">Aucune description</span>}
                                                    </p>
                                                ) : (
                                                    <textarea
                                                        value={draftEnrichments.get(row.id)?.descriptif || ''}
                                                        onChange={e => {
                                                            const cur = draftEnrichments.get(row.id) ?? emptyEnrichment(row.id);
                                                            const next = new Map(draftEnrichments);
                                                            next.set(row.id, { ...cur, descriptif: e.target.value });
                                                            setDraftEnrichments(next);
                                                        }}
                                                        placeholder={`Description de l'étape "${row.étape}"…`}
                                                        rows={4}
                                                        className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y leading-relaxed"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ══════════════════════════════════════════════
                    OUTILS
                ══════════════════════════════════════════════ */}
                {activeSection === 'outils' && (
                    <div className="max-w-4xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-800">Outils par étape</h3>
                            <EditBtn
                                editing={editingOutils}
                                onEdit={() => { setDraftData([...data]); setEditingOutils(true); }}
                                onSave={handleSaveOutils}
                            />
                        </div>

                        {data.length === 0 ? (
                            <div className="bg-white rounded-xl border border-slate-200 px-5 py-10 text-center text-slate-400 text-sm">
                                Aucune étape disponible.
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-10">#</th>
                                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Étape</th>
                                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">Acteur</th>
                                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-56">Outil</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {(editingOutils ? draftData : data).map((row, idx) => (
                                            <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3 text-xs text-slate-400 font-mono">{idx + 1}</td>
                                                <td className="px-4 py-3 text-slate-800 font-medium">{row.étape}</td>
                                                <td className="px-4 py-3 text-slate-500 text-xs">{row.acteur || '—'}</td>
                                                <td className="px-4 py-3">
                                                    {!editingOutils ? (
                                                        <span className={row.outil
                                                            ? 'text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs font-medium'
                                                            : 'text-slate-400 italic text-xs'}>
                                                            {row.outil || 'Non renseigné'}
                                                        </span>
                                                    ) : (
                                                        <input type="text"
                                                            value={row.outil || ''}
                                                            onChange={e => setDraftData(prev =>
                                                                prev.map(r => r.id === row.id ? { ...r, outil: e.target.value } : r)
                                                            )}
                                                            placeholder="Ex: SAP, Core Banking…"
                                                            className="w-full text-sm px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                                                        />
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modale sauvegarde */}
            <SaveToBiblioModal
                open={saveModalOpen}
                initialNom={title}
                onClose={() => setSaveModalOpen(false)}
                onConfirm={handleSave}
            />
        </div>
    );
}

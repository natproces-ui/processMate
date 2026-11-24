'use client';

import { useState, useEffect, useRef } from 'react';
import { FileText, Download, Loader2, ChevronDown, ChevronUp, Plus, Trash2, Sparkles, Crop, ImageOff } from 'lucide-react';
import { Table1Row } from '@/logic/bpmnGenerator';
import { TaskEnrichment, ProcessMetadata } from '@/logic/bpmnTypes';
import { API_CONFIG } from '@/lib/api-config';
import DocumentPreviewModal from './DocumentPreviewModal';
import PdfCaptureModal from './PdfCaptureModal';

export interface AbbreviationItem { abrv: string; signification: string; }
export interface DefinitionItem { terme: string; definition: string; }
export interface AnnexeItem { titre: string; contenu: string; image?: string; }

export interface CIHProcedureMetadata {
    nom: string;
    ref: string;
    version: string;
    dateEffet: string;
    dateDiffusion: string;
    pole: string;
    direction: string;
    objet: string;
    perimeter: string;
    responsabilites_internes: string[];
    responsabilites_externes: string[];
    references: string;
    definitions: DefinitionItem[];
    abbreviations: AbbreviationItem[];
    regles_gestion: string;
    annexe: AnnexeItem[];
}

export const DEFAULT_CIH_METADATA: CIHProcedureMetadata = {
    nom: '', ref: '', version: 'V1', dateEffet: '', dateDiffusion: '',
    // vides par défaut : le pôle et la direction propres à une organisation ne valent pas pour les autres
    pole: '',
    direction: '',
    objet: '', perimeter: '',
    responsabilites_internes: [], responsabilites_externes: [],
    references: '', definitions: [], abbreviations: [], regles_gestion: '', annexe: [],
};

interface DocumentExportPanelProps {
    data: Table1Row[];
    enrichments: Map<string, TaskEnrichment>;
    processMetadata: ProcessMetadata;
    bpmnXml: string;
    /** Fonction de capture du diagramme — retourne un PNG base64 data-URL */
    diagramCaptureFn?: () => Promise<string | null>;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
    /** Métadonnées pré-extraites depuis le document uploadé (auto-fill) */
    initialMeta?: Partial<CIHProcedureMetadata>;
    /** Fichiers sources uploadés (PDF/images), disponibles pour la capture d'annexe */
    sourceFiles?: File[];
    /** Champs modifiés à la main dans le formulaire (hors pré-remplissage), pour que l'appelant les enregistre */
    onMetaEdited?: (changes: Record<string, unknown>) => void;
}

interface ExportOptions {
    include_diagram: boolean;
    include_enrichments: boolean;
    include_annexes: boolean;
    detail_level: 'synthesis' | 'standard' | 'complete';
}

interface DocumentResponse {
    success: boolean; document_id: string; filename: string;
    file_size: number; download_url: string; preview: any;
}

const inputCls = "w-full bg-white border border-neutral-300 text-neutral-900 text-sm rounded-md px-2 py-1.5 placeholder:text-neutral-400 focus:outline-none focus:border-petrole focus:ring-2 focus:ring-petrole/15";
const textareaCls = "w-full bg-white border border-neutral-300 text-neutral-900 text-sm rounded-md px-2 py-1.5 placeholder:text-neutral-400 focus:outline-none focus:border-petrole focus:ring-2 focus:ring-petrole/15 resize-y min-h-[60px]";
const labelCls = "block text-xs font-medium text-neutral-600 mb-1";

export default function DocumentExportPanel({
    data, enrichments, processMetadata, bpmnXml, diagramCaptureFn, onSuccess, onError, initialMeta, sourceFiles, onMetaEdited,
}: DocumentExportPanelProps) {

    const [isGenerating, setIsGenerating] = useState(false);
    const [currentStep, setCurrentStep] = useState('');
    const [showOptions, setShowOptions] = useState(false);
    const [showMetaForm, setShowMetaForm] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [documentData, setDocumentData] = useState<DocumentResponse | null>(null);
    const [autoFilled, setAutoFilled] = useState(false);
    const [captureTargetIdx, setCaptureTargetIdx] = useState<number | null>(null);

    const captureCandidates = (sourceFiles || []).filter(
        f => f.type === 'application/pdf' || f.type.startsWith('image/')
    );

    const [cihMeta, setCihMeta] = useState<CIHProcedureMetadata>({
        ...DEFAULT_CIH_METADATA,
        nom: processMetadata?.nom || '',
    });
    // Référence = état après pré-remplissage ; seules les différences sont des saisies de l'utilisateur
    const baselineRef = useRef<CIHProcedureMetadata>(cihMeta);

    useEffect(() => {
        if (!onMetaEdited) return;
        const base = baselineRef.current;
        const changes: Record<string, unknown> = {};
        (Object.keys(cihMeta) as (keyof CIHProcedureMetadata)[]).forEach(k => {
            if (JSON.stringify(cihMeta[k]) === JSON.stringify(base[k])) return;
            // Format de la base : règles de gestion en liste (le formulaire les saisit en texte)
            changes[k] = k === 'regles_gestion'
                ? String(cihMeta[k]).split('\n').map(r => r.trim()).filter(Boolean)
                : cihMeta[k];
        });
        onMetaEdited(changes);
    }, [cihMeta]); // eslint-disable-line react-hooks/exhaustive-deps

    const [options, setOptions] = useState<ExportOptions>({
        include_diagram: true, include_enrichments: true, include_annexes: true, detail_level: 'standard',
    });

    // Pré-remplissage automatique quand initialMeta arrive depuis l'extraction
    useEffect(() => {
        if (!initialMeta) return;
        // La base stocke `perimetre`, le formulaire lit `perimeter` : on accepte les deux noms
        const raw = initialMeta as Record<string, unknown>;
        const normalized = {
            ...raw,
            perimeter: raw.perimeter || raw.perimetre || '',
            // La base stocke une liste, le formulaire un texte (une règle par ligne)
            regles_gestion: Array.isArray(raw.regles_gestion) ? raw.regles_gestion.join('\n') : raw.regles_gestion,
        };
        setCihMeta(prev => {
            const next = {
                ...prev,
                ...Object.fromEntries(
                    Object.entries(normalized).filter(([, v]) =>
                        v !== undefined && v !== null && v !== '' &&
                        !(Array.isArray(v) && v.length === 0)
                    )
                ),
            };
            baselineRef.current = next;
            return next;
        });
        setAutoFilled(true);
        setShowMetaForm(true);
    }, [initialMeta]);

    const captureDiagramAsBase64 = async (): Promise<string | null> => {
        if (!options.include_diagram) return null;
        if (!diagramCaptureFn) return null;
        try {
            return await diagramCaptureFn();
        } catch (e: any) { onError(`Erreur capture: ${e.message}`); return null; }
    };

    const generateWordDocument = async () => {
        if (!cihMeta.nom.trim()) { onError('Le nom de la procédure est obligatoire.'); return; }
        if (data.length === 0) { onError('Le tableau est vide.'); return; }
        setIsGenerating(true);
        setCurrentStep('Capture du logigramme');
        try {
            const diagramBase64 = await captureDiagramAsBase64();
            setCurrentStep('Génération du document Word');
            const payload = {
                metadata: { ...cihMeta, responsabilites_internes: cihMeta.responsabilites_internes.filter(Boolean), responsabilites_externes: cihMeta.responsabilites_externes.filter(Boolean), definitions: cihMeta.definitions.filter(d => d.terme), abbreviations: cihMeta.abbreviations.filter(a => a.abrv), annexe: cihMeta.annexe.filter(a => a.titre || a.contenu || a.image) },
                workflow: data, enrichments: Object.fromEntries(enrichments), diagram_image: diagramBase64, options,
            };
            const res = await fetch(API_CONFIG.getFullUrl(API_CONFIG.endpoints.docGenerate), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Erreur génération'); }
            const result: DocumentResponse = await res.json();
            setDocumentData(result); setShowPreview(true);
            onSuccess('Fiche Word générée.');
        } catch (e: any) { onError(e.message || 'Erreur'); }
        finally { setIsGenerating(false); setCurrentStep(''); }
    };

    const handleDownload = () => {
        if (!documentData) return;
        const a = document.createElement('a');
        a.href = API_CONFIG.getFullUrl(documentData.download_url); a.download = documentData.filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        onSuccess('Téléchargement lancé.'); setShowPreview(false);
    };

    // Helpers listes
    const actKey = (t: 'internes' | 'externes') => t === 'internes' ? 'responsabilites_internes' : 'responsabilites_externes';
    const updActeur = (t: 'internes' | 'externes', i: number, v: string) => { const arr = [...cihMeta[actKey(t)]]; arr[i] = v; setCihMeta(m => ({ ...m, [actKey(t)]: arr })); };
    const addActeur = (t: 'internes' | 'externes') => setCihMeta(m => ({ ...m, [actKey(t)]: [...m[actKey(t)], ''] }));
    const rmActeur = (t: 'internes' | 'externes', i: number) => setCihMeta(m => ({ ...m, [actKey(t)]: m[actKey(t)].filter((_, j) => j !== i) }));
    const addAbrv = () => setCihMeta(m => ({ ...m, abbreviations: [...m.abbreviations, { abrv: '', signification: '' }] }));
    const rmAbrv = (i: number) => setCihMeta(m => ({ ...m, abbreviations: m.abbreviations.filter((_, j) => j !== i) }));
    const updAbrv = (i: number, f: keyof AbbreviationItem, v: string) => { const a = [...cihMeta.abbreviations]; a[i] = { ...a[i], [f]: v }; setCihMeta(m => ({ ...m, abbreviations: a })); };
    const addDef = () => setCihMeta(m => ({ ...m, definitions: [...m.definitions, { terme: '', definition: '' }] }));
    const rmDef = (i: number) => setCihMeta(m => ({ ...m, definitions: m.definitions.filter((_, j) => j !== i) }));
    const updDef = (i: number, f: keyof DefinitionItem, v: string) => { const a = [...cihMeta.definitions]; a[i] = { ...a[i], [f]: v }; setCihMeta(m => ({ ...m, definitions: a })); };
    const addAnnexe = () => setCihMeta(m => ({ ...m, annexe: [...m.annexe, { titre: '', contenu: '' }] }));
    const rmAnnexe = (i: number) => setCihMeta(m => ({ ...m, annexe: m.annexe.filter((_, j) => j !== i) }));
    const updAnnexe = (i: number, f: keyof AnnexeItem, v: string) => { const a = [...cihMeta.annexe]; a[i] = { ...a[i], [f]: v }; setCihMeta(m => ({ ...m, annexe: a })); };

    return (
        <>
            <div className="mb-6 overflow-hidden rounded-xl border border-neutral-200 bg-white">

                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-petrole" />
                        <div>
                            <h3 className="text-base font-semibold text-petrole">Fiche de la procédure</h3>
                            <p className="text-xs mt-0.5">
                                {autoFilled
                                    ? <span className="flex items-center gap-1 text-petrole"><Sparkles className="w-3 h-3" />Fiche remplie à partir des sources : vérifiez et corrigez si besoin</span>
                                    : <span className="text-neutral-500">Joignez un document au chat pour la remplir, ou renseignez-la ici</span>}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowMetaForm(o => !o)}
                            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-50">
                            {showMetaForm ? 'Masquer la fiche' : 'Voir et modifier la fiche'}
                        </button>
                        <button onClick={() => setShowOptions(o => !o)} title={showOptions ? 'Masquer les options du document Word' : 'Options du document Word'}
                            className="rounded-lg p-1.5 text-neutral-700 hover:bg-neutral-100">
                            {showOptions ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                    </div>
                </div>

                {/* Formulaire métadonnées */}
                {showMetaForm && (
                    <div className="space-y-4 border-b border-neutral-200 p-4">
                        {autoFilled && (
                            <div className="flex items-start gap-2 rounded-lg border border-petrole/30 bg-petrole-tint px-3 py-2">
                                <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-petrole" />
                                <p className="text-xs text-neutral-800">Champs remplis à partir de vos sources. Vérifiez-les et complétez si nécessaire.</p>
                            </div>
                        )}

                        <p className="text-xs font-semibold uppercase tracking-wide text-petrole">Identification</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className={labelCls}>Titre de la procédure *</label>
                                <input className={inputCls} value={cihMeta.nom} onChange={e => setCihMeta(m => ({ ...m, nom: e.target.value }))} placeholder="Ex: MCNE en MAD : Mise en Place" />
                            </div>
                            <div><label className={labelCls}>Référence</label><input className={inputCls} value={cihMeta.ref} onChange={e => setCihMeta(m => ({ ...m, ref: e.target.value }))} placeholder="Ex: Proc-GOI-DOC-001-26" /></div>
                            <div><label className={labelCls}>Version</label><input className={inputCls} value={cihMeta.version} onChange={e => setCihMeta(m => ({ ...m, version: e.target.value }))} placeholder="V3" /></div>
                            <div><label className={labelCls}>Date de prise d'effet</label><input className={inputCls} value={cihMeta.dateEffet} onChange={e => setCihMeta(m => ({ ...m, dateEffet: e.target.value }))} placeholder="JJ/MM/AAAA" /></div>
                            <div><label className={labelCls}>Date de diffusion</label><input className={inputCls} value={cihMeta.dateDiffusion} onChange={e => setCihMeta(m => ({ ...m, dateDiffusion: e.target.value }))} placeholder="JJ/MM/AAAA" /></div>
                            <div><label className={labelCls}>Pôle</label><input className={inputCls} value={cihMeta.pole} onChange={e => setCihMeta(m => ({ ...m, pole: e.target.value }))} /></div>
                            <div><label className={labelCls}>Direction</label><input className={inputCls} value={cihMeta.direction} onChange={e => setCihMeta(m => ({ ...m, direction: e.target.value }))} /></div>
                        </div>

                        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-petrole">Généralités</p>
                        <div><label className={labelCls}>Objet</label><textarea className={textareaCls} value={cihMeta.objet} onChange={e => setCihMeta(m => ({ ...m, objet: e.target.value }))} placeholder="Cette procédure a pour objet de décrire..." /></div>
                        <div><label className={labelCls}>Périmètre d'application</label><textarea className={textareaCls} value={cihMeta.perimeter} onChange={e => setCihMeta(m => ({ ...m, perimeter: e.target.value }))} /></div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={labelCls}>Acteurs internes</label>
                                {cihMeta.responsabilites_internes.map((a, i) => (
                                    <div key={i} className="flex gap-1 mb-1">
                                        <input className={inputCls} value={a} onChange={e => updActeur('internes', i, e.target.value)} placeholder="Ex: Chargé de caisse - Agence" />
                                        <button onClick={() => rmActeur('internes', i)} className="px-1 text-neutral-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                ))}
                                <button onClick={() => addActeur('internes')} className="mt-1 flex items-center gap-1 text-xs font-medium text-petrole hover:underline"><Plus className="w-3 h-3" />Ajouter</button>
                            </div>
                            <div>
                                <label className={labelCls}>Acteurs externes</label>
                                {cihMeta.responsabilites_externes.map((a, i) => (
                                    <div key={i} className="flex gap-1 mb-1">
                                        <input className={inputCls} value={a} onChange={e => updActeur('externes', i, e.target.value)} placeholder="Ex: Client" />
                                        <button onClick={() => rmActeur('externes', i)} className="px-1 text-neutral-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                ))}
                                <button onClick={() => addActeur('externes')} className="mt-1 flex items-center gap-1 text-xs font-medium text-petrole hover:underline"><Plus className="w-3 h-3" />Ajouter</button>
                            </div>
                        </div>

                        <div><label className={labelCls}>Références</label><textarea className={textareaCls} value={cihMeta.references} onChange={e => setCihMeta(m => ({ ...m, references: e.target.value }))} style={{ minHeight: 44 }} /></div>

                        <div>
                            <label className={labelCls}>Abréviations</label>
                            {cihMeta.abbreviations.map((a, i) => (
                                <div key={i} className="flex gap-2 mb-1.5">
                                    <input className={`${inputCls} w-24`} value={a.abrv} onChange={e => updAbrv(i, 'abrv', e.target.value)} placeholder="BOI" />
                                    <input className={inputCls} value={a.signification} onChange={e => updAbrv(i, 'signification', e.target.value)} placeholder="Back Office International" />
                                    <button onClick={() => rmAbrv(i)} className="px-1 text-neutral-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            ))}
                            <button onClick={addAbrv} className="mt-1 flex items-center gap-1 text-xs font-medium text-petrole hover:underline"><Plus className="w-3 h-3" />Ajouter abréviation</button>
                        </div>

                        <div>
                            <label className={labelCls}>Définitions</label>
                            {cihMeta.definitions.map((d, i) => (
                                <div key={i} className="flex gap-2 mb-1.5">
                                    <input className={`${inputCls} w-36`} value={d.terme} onChange={e => updDef(i, 'terme', e.target.value)} placeholder="Terme" />
                                    <input className={inputCls} value={d.definition} onChange={e => updDef(i, 'definition', e.target.value)} placeholder="Définition" />
                                    <button onClick={() => rmDef(i)} className="px-1 text-neutral-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            ))}
                            <button onClick={addDef} className="mt-1 flex items-center gap-1 text-xs font-medium text-petrole hover:underline"><Plus className="w-3 h-3" />Ajouter définition</button>
                        </div>

                        <div><label className={labelCls}>1.1 Règles de gestion</label><textarea className={textareaCls} value={cihMeta.regles_gestion} onChange={e => setCihMeta(m => ({ ...m, regles_gestion: e.target.value }))} placeholder="Une règle par ligne..." style={{ minHeight: 80 }} /></div>

                        <div>
                            <label className={labelCls}>Annexes</label>
                            {cihMeta.annexe.map((a, i) => (
                                <div key={i} className="flex gap-2 mb-2 items-start">
                                    <div className="flex-1 space-y-1">
                                        <input className={inputCls} value={a.titre} onChange={e => updAnnexe(i, 'titre', e.target.value)} placeholder="Titre de l'annexe (ex: Annexe 1 : Grille tarifaire)" />
                                        <textarea className={textareaCls} value={a.contenu} onChange={e => updAnnexe(i, 'contenu', e.target.value)} placeholder="Contenu de l'annexe" />
                                        <div className="flex items-center gap-2">
                                            {a.image ? (
                                                <div className="flex items-center gap-2 rounded border border-neutral-300 bg-white px-2 py-1">
                                                    <img src={a.image} alt="Capture annexe" className="h-10 rounded object-contain" />
                                                    <button onClick={() => updAnnexe(i, 'image', '')} className="text-neutral-400 hover:text-red-600" title="Retirer l'image">
                                                        <ImageOff className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setCaptureTargetIdx(i)}
                                                    disabled={captureCandidates.length === 0}
                                                    className="flex items-center gap-1 text-xs font-medium text-petrole hover:underline disabled:cursor-not-allowed disabled:text-neutral-400"
                                                    title={captureCandidates.length === 0 ? "Uploadez d'abord un document source" : "Capturer une zone du document source"}
                                                >
                                                    <Crop className="w-3 h-3" />Capturer une image depuis le document
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={() => rmAnnexe(i)} className="mt-1.5 px-1 text-neutral-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            ))}
                            <button onClick={addAnnexe} className="mt-1 flex items-center gap-1 text-xs font-medium text-petrole hover:underline"><Plus className="w-3 h-3" />Ajouter une annexe</button>
                        </div>
                    </div>
                )}

                {/* Options */}
                {showOptions && (
                    <div className="border-b border-neutral-200 bg-neutral-50 p-4">
                        <div className="flex gap-4 mb-3">
                            {[{ key: 'include_diagram', label: 'Inclure le logigramme' }, { key: 'include_enrichments', label: 'Inclure les enrichissements' }, { key: 'include_annexes', label: 'Inclure les annexes' }].map(({ key, label }) => (
                                <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-neutral-800">
                                    <input type="checkbox" checked={options[key as keyof ExportOptions] as boolean} onChange={e => setOptions(o => ({ ...o, [key]: e.target.checked }))} className="h-4 w-4 rounded accent-petrole" />
                                    <span>{label}</span>
                                </label>
                            ))}
                        </div>
                        <div className="flex gap-4">
                            {(['synthesis', 'standard', 'complete'] as const).map(l => (
                                <label key={l} className="flex cursor-pointer items-center gap-2 text-sm text-neutral-800">
                                    <input type="radio" value={l} checked={options.detail_level === l} onChange={() => setOptions(o => ({ ...o, detail_level: l }))} className="h-4 w-4 accent-petrole" />
                                    <span>{l === 'synthesis' ? 'Synthèse' : l === 'standard' ? 'Standard' : 'Complet'}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {/* Bouton */}
                <div className="p-4">
                    {isGenerating ? (
                        <div className="flex flex-col items-center py-6 gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-petrole" />
                            <p className="text-sm font-semibold text-neutral-900">{currentStep}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                                <p className="mb-1 font-semibold text-neutral-900">Le document Word contient :</p>
                                <ul className="list-disc space-y-0.5 pl-4">
                                    <li>l&apos;en-tête (référence, version, dates, pôle, direction) ;</li>
                                    <li>les généralités (objet, périmètre, responsabilités, abréviations) ;</li>
                                    <li>le sommaire et 1.1 Règles de gestion ;</li>
                                    {options.include_diagram && <li>1.2 Logigramme BPMN ;</li>}
                                    <li>1.3 Description des opérations ({data.length} étape{data.length > 1 ? 's' : ''}){options.include_annexes && cihMeta.annexe.some(a => a.titre || a.contenu || a.image) ? ' ;' : '.'}</li>
                                    {options.include_annexes && cihMeta.annexe.filter(a => a.titre || a.contenu || a.image).length > 0 && (
                                        <li>les annexes ({cihMeta.annexe.filter(a => a.titre || a.contenu || a.image).length}).</li>
                                    )}
                                </ul>
                            </div>
                            <button onClick={generateWordDocument} disabled={data.length === 0}
                                className="flex w-full items-center justify-center gap-2 rounded-lg bg-petrole px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                                <Download className="w-4 h-4" />Générer la fiche Word
                            </button>
                            {!cihMeta.nom && <p className="text-center text-xs text-neutral-600">Renseignez le titre de la procédure.</p>}
                        </div>
                    )}
                </div>
            </div>

            {documentData && (
                <DocumentPreviewModal isOpen={showPreview} onClose={() => setShowPreview(false)} preview={documentData.preview} filename={documentData.filename} fileSize={documentData.file_size} downloadUrl={documentData.download_url} onDownload={handleDownload} />
            )}

            {captureTargetIdx !== null && (
                <PdfCaptureModal
                    files={captureCandidates}
                    onClose={() => setCaptureTargetIdx(null)}
                    onCapture={dataUrl => {
                        updAnnexe(captureTargetIdx, 'image', dataUrl);
                        setCaptureTargetIdx(null);
                    }}
                />
            )}
        </>
    );
}
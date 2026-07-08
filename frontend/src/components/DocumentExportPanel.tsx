'use client';

import { useState, useEffect } from 'react';
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
    pole: "Pôle Systèmes d'information",
    direction: 'Direction Organisation et Reengineering de Processus',
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

const inputCls = "w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-blue-400";
const textareaCls = "w-full bg-gray-800 border border-gray-600 text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 resize-y min-h-[60px]";
const labelCls = "block text-xs text-gray-400 mb-1";

export default function DocumentExportPanel({
    data, enrichments, processMetadata, bpmnXml, diagramCaptureFn, onSuccess, onError, initialMeta, sourceFiles,
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

    const [options, setOptions] = useState<ExportOptions>({
        include_diagram: true, include_enrichments: true, include_annexes: true, detail_level: 'standard',
    });

    // Pré-remplissage automatique quand initialMeta arrive depuis l'extraction
    useEffect(() => {
        if (!initialMeta) return;
        setCihMeta(prev => ({
            ...prev,
            ...Object.fromEntries(
                Object.entries(initialMeta).filter(([, v]) =>
                    v !== undefined && v !== null && v !== '' &&
                    !(Array.isArray(v) && v.length === 0)
                )
            ),
        }));
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
        setCurrentStep('Capture du logigramme...');
        try {
            const diagramBase64 = await captureDiagramAsBase64();
            setCurrentStep('Génération du document Word...');
            const payload = {
                metadata: { ...cihMeta, responsabilites_internes: cihMeta.responsabilites_internes.filter(Boolean), responsabilites_externes: cihMeta.responsabilites_externes.filter(Boolean), definitions: cihMeta.definitions.filter(d => d.terme), abbreviations: cihMeta.abbreviations.filter(a => a.abrv), annexe: cihMeta.annexe.filter(a => a.titre || a.contenu || a.image) },
                workflow: data, enrichments: Object.fromEntries(enrichments), diagram_image: diagramBase64, options,
            };
            const res = await fetch(API_CONFIG.getFullUrl(API_CONFIG.endpoints.docGenerate), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Erreur génération'); }
            const result: DocumentResponse = await res.json();
            setDocumentData(result); setShowPreview(true);
            onSuccess('✅ Document généré avec succès !');
        } catch (e: any) { onError(e.message || 'Erreur'); }
        finally { setIsGenerating(false); setCurrentStep(''); }
    };

    const handleDownload = () => {
        if (!documentData) return;
        const a = document.createElement('a');
        a.href = API_CONFIG.getFullUrl(documentData.download_url); a.download = documentData.filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        onSuccess('📥 Téléchargement lancé !'); setShowPreview(false);
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
            <div className="mb-6 bg-gray-800 rounded-lg overflow-hidden border border-gray-700 shadow-lg">

                {/* Header */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-blue-400" />
                        <div>
                            <h3 className="text-lg font-bold text-white">Export Procédure — Format CIH Bank</h3>
                            <p className="text-xs mt-0.5">
                                {autoFilled
                                    ? <span className="flex items-center gap-1 text-green-400"><Sparkles className="w-3 h-3" />Métadonnées extraites automatiquement — vérifiez et corrigez si besoin</span>
                                    : <span className="text-gray-400">Uploadez un document pour extraction auto, ou renseignez manuellement</span>}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowMetaForm(o => !o)}
                            className={`px-3 py-1.5 text-white text-xs rounded-lg font-medium transition-colors flex items-center gap-1.5 ${autoFilled ? 'bg-green-700 hover:bg-green-600' : 'bg-blue-700 hover:bg-blue-600'}`}>
                            {autoFilled && <Sparkles className="w-3 h-3" />}
                            {showMetaForm ? 'Masquer' : 'Voir / Modifier'} les métadonnées
                        </button>
                        <button onClick={() => setShowOptions(o => !o)} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white">
                            {showOptions ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                    </div>
                </div>

                {/* Formulaire métadonnées */}
                {showMetaForm && (
                    <div className="p-4 bg-gray-950 border-b border-gray-700 space-y-4">
                        {autoFilled && (
                            <div className="flex items-start gap-2 bg-green-900/30 border border-green-700/50 rounded-lg p-3">
                                <Sparkles className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-green-300">Champs pré-remplis depuis votre document. Vérifiez et complétez si nécessaire.</p>
                            </div>
                        )}

                        <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Identification</p>
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

                        <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide pt-2">Généralités</p>
                        <div><label className={labelCls}>Objet</label><textarea className={textareaCls} value={cihMeta.objet} onChange={e => setCihMeta(m => ({ ...m, objet: e.target.value }))} placeholder="Cette procédure a pour objet de décrire..." /></div>
                        <div><label className={labelCls}>Périmètre d'application</label><textarea className={textareaCls} value={cihMeta.perimeter} onChange={e => setCihMeta(m => ({ ...m, perimeter: e.target.value }))} /></div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={labelCls}>Acteurs internes</label>
                                {cihMeta.responsabilites_internes.map((a, i) => (
                                    <div key={i} className="flex gap-1 mb-1">
                                        <input className={inputCls} value={a} onChange={e => updActeur('internes', i, e.target.value)} placeholder="Ex: Chargé de caisse - Agence" />
                                        <button onClick={() => rmActeur('internes', i)} className="text-red-400 hover:text-red-300 px-1"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                ))}
                                <button onClick={() => addActeur('internes')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1"><Plus className="w-3 h-3" />Ajouter</button>
                            </div>
                            <div>
                                <label className={labelCls}>Acteurs externes</label>
                                {cihMeta.responsabilites_externes.map((a, i) => (
                                    <div key={i} className="flex gap-1 mb-1">
                                        <input className={inputCls} value={a} onChange={e => updActeur('externes', i, e.target.value)} placeholder="Ex: Client" />
                                        <button onClick={() => rmActeur('externes', i)} className="text-red-400 hover:text-red-300 px-1"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                ))}
                                <button onClick={() => addActeur('externes')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1"><Plus className="w-3 h-3" />Ajouter</button>
                            </div>
                        </div>

                        <div><label className={labelCls}>Références</label><textarea className={textareaCls} value={cihMeta.references} onChange={e => setCihMeta(m => ({ ...m, references: e.target.value }))} style={{ minHeight: 44 }} /></div>

                        <div>
                            <label className={labelCls}>Abréviations</label>
                            {cihMeta.abbreviations.map((a, i) => (
                                <div key={i} className="flex gap-2 mb-1.5">
                                    <input className={`${inputCls} w-24`} value={a.abrv} onChange={e => updAbrv(i, 'abrv', e.target.value)} placeholder="BOI" />
                                    <input className={inputCls} value={a.signification} onChange={e => updAbrv(i, 'signification', e.target.value)} placeholder="Back Office International" />
                                    <button onClick={() => rmAbrv(i)} className="text-red-400 hover:text-red-300 px-1"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            ))}
                            <button onClick={addAbrv} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1"><Plus className="w-3 h-3" />Ajouter abréviation</button>
                        </div>

                        <div>
                            <label className={labelCls}>Définitions</label>
                            {cihMeta.definitions.map((d, i) => (
                                <div key={i} className="flex gap-2 mb-1.5">
                                    <input className={`${inputCls} w-36`} value={d.terme} onChange={e => updDef(i, 'terme', e.target.value)} placeholder="Terme" />
                                    <input className={inputCls} value={d.definition} onChange={e => updDef(i, 'definition', e.target.value)} placeholder="Définition" />
                                    <button onClick={() => rmDef(i)} className="text-red-400 hover:text-red-300 px-1"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            ))}
                            <button onClick={addDef} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1"><Plus className="w-3 h-3" />Ajouter définition</button>
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
                                                <div className="flex items-center gap-2 bg-gray-800 border border-gray-600 rounded px-2 py-1">
                                                    <img src={a.image} alt="Capture annexe" className="h-10 rounded object-contain" />
                                                    <button onClick={() => updAnnexe(i, 'image', '')} className="text-red-400 hover:text-red-300" title="Retirer l'image">
                                                        <ImageOff className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setCaptureTargetIdx(i)}
                                                    disabled={captureCandidates.length === 0}
                                                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 disabled:text-gray-600 disabled:cursor-not-allowed"
                                                    title={captureCandidates.length === 0 ? "Uploadez d'abord un document source" : "Capturer une zone du document source"}
                                                >
                                                    <Crop className="w-3 h-3" />Capturer une image depuis le document
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={() => rmAnnexe(i)} className="text-red-400 hover:text-red-300 px-1 mt-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            ))}
                            <button onClick={addAnnexe} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1"><Plus className="w-3 h-3" />Ajouter une annexe</button>
                        </div>
                    </div>
                )}

                {/* Options */}
                {showOptions && (
                    <div className="p-4 bg-gray-900 border-b border-gray-700">
                        <div className="flex gap-4 mb-3">
                            {[{ key: 'include_diagram', label: 'Inclure le logigramme' }, { key: 'include_enrichments', label: 'Inclure les enrichissements' }, { key: 'include_annexes', label: 'Inclure les annexes' }].map(({ key, label }) => (
                                <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                                    <input type="checkbox" checked={options[key as keyof ExportOptions] as boolean} onChange={e => setOptions(o => ({ ...o, [key]: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
                                    <span>{label}</span>
                                </label>
                            ))}
                        </div>
                        <div className="flex gap-4">
                            {(['synthesis', 'standard', 'complete'] as const).map(l => (
                                <label key={l} className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                                    <input type="radio" value={l} checked={options.detail_level === l} onChange={() => setOptions(o => ({ ...o, detail_level: l }))} className="w-4 h-4 text-blue-600" />
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
                            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                            <p className="text-base font-semibold text-white">{currentStep}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-gray-400">
                                <p className="font-semibold mb-1 text-gray-200">Contenu :</p>
                                <ul className="space-y-0.5">
                                    <li>• En-tête (Réf · Version · Dates · Pôle · Direction)</li>
                                    <li>• Généralités (Objet · Périmètre · Responsabilités · Abréviations)</li>
                                    <li>• Sommaire · 1.1 Règles de gestion</li>
                                    {options.include_diagram && <li>• 1.2 Logigramme BPMN</li>}
                                    <li>• 1.3 Description des opérations ({data.length} étape{data.length > 1 ? 's' : ''})</li>
                                    {options.include_annexes && cihMeta.annexe.filter(a => a.titre || a.contenu || a.image).length > 0 && (
                                        <li>• Annexes ({cihMeta.annexe.filter(a => a.titre || a.contenu || a.image).length})</li>
                                    )}
                                </ul>
                            </div>
                            <button onClick={generateWordDocument} disabled={data.length === 0}
                                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all">
                                <Download className="w-4 h-4" />Générer la procédure Word
                            </button>
                            {!cihMeta.nom && <p className="text-center text-xs text-yellow-500">⚠ Renseignez le titre de la procédure</p>}
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
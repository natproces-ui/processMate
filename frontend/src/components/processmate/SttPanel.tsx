'use client';

// components/processmate/SttPanel.tsx
// Contenu BPMN Studio dans le shell ProcessMate.
// Les entrées sont regroupées dans l’assistant ; les actions du résultat restent près du tableau.

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { generateBPMNSimple } from '@/logic/bpmnGeneratorSimple';
import { generateBPMNOutillage } from '@/logic/bpmnGeneratorOutillage';
import { parseWorkflowFromModeler, type ParseResult } from '@/logic/bpmnParser';
import ToolDetailPanel from '@/components/orchestration/ToolDetailPanel';
import ToolQuickCard from '@/components/orchestration/ToolQuickCard';
import type { Table1Row } from '@/logic/types';
import { ProcessMetadata, TaskEnrichment, DEFAULT_PROCESS_METADATA, DEFAULT_ENRICHMENTS, mergeProcedureMetadata, mergeEnrichments } from '@/logic/bpmnTypes';
import type { BpmnEditorHandle } from '@/components/new-way/BpmnEditor';
import Table from '@/components/ProcessTable';
import RevisionPanel from '@/components/RevisionPanel';
import DocumentExportPanel from '@/components/DocumentExportPanel';
import MultiDocUpload, { ProcessCard } from '@/components/MultiDocUpload';
import ProcessDiscoveryPanel from '@/components/ProcessDiscoveryPanel';
import SttToolbar from './SttToolbar';
import ChatInterface from '@/components/ChatInterface';
import SaveToBiblioModal from '@/components/SaveToBiblioModal';
import Library from '@/components/new-way/Library';
import {
    AlertCircle, CheckCircle, Info, ChevronDown, ChevronUp,
    Maximize2, X, Download, Save, Loader2, Plus, ArrowLeft, Send, Code, RotateCw, Wrench,
} from 'lucide-react';
import { API_CONFIG } from '@/lib/api-config';
import { processingLevelHeaders } from '@/lib/processing-level';
import type { StudioTool } from '@/lib/processmate-navigation';
import ProcessingLevelSelector, { useProcessingLevel } from './ProcessingLevelSelector';
import { orchestrationApi } from '@/lib/orchestrationApi';
import { orchestrationTasksApi } from '@/lib/orchestrationTasksApi';
import RecipientPicker from '@/components/orchestration/tasks/RecipientPicker';
import { useProceduresStore } from '@/store/proceduresStore';
import { generateFlowchart as clinicGenerateFlowchart } from '@/app/clinic/lib/clinicHandlers';
import type { ProcessingStep, ParsedData } from '@/app/clinic/lib/clinicTypes';
import FlowchartResults from '@/components/clinic/FlowchartResults';
import { initializeViz, type VizInstance } from '@/components/clinic/flowchartUtils';
// @ts-ignore — CSS import handled by Next.js bundler
import '@/app/clinic/css/style.css';

const BpmnEditor = dynamic(() => import('@/components/new-way/BpmnEditor'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-white">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
    ),
});

type Phase = 'upload' | 'discovery' | 'editing';

interface ProcessInstance {
    process_id: string; title: string; data: Table1Row[];
    enrichments: Map<string, TaskEnrichment>; bpmnXml: string | null;
    metadata: ProcessMetadata; initialMeta: any;
    status: 'generating' | 'ready' | 'error'; workflow_db_id?: string;
}

interface Props { workflowId?: string; onBack?: () => void; currentActorId?: string; fromClinic?: boolean; initialTool?: StudioTool; }

const defaultData: Table1Row[] = [
    { id: '1', étape: 'Début du processus', typeBpmn: 'StartEvent', département: 'Front Office', acteur: 'Client', typeActeur: 'externe', condition: '', outputs: [{ targetId: '2', label: '' }], outil: '' },
    { id: '2', étape: 'Soumettre la demande', typeBpmn: 'Task', département: 'Front Office', acteur: 'Client', typeActeur: 'externe', condition: '', outputs: [{ targetId: '3', label: '' }], outil: 'Portail web' },
    { id: '3', étape: 'Vérifier le dossier', typeBpmn: 'Task', département: 'Back Office', acteur: 'Gestionnaire', typeActeur: 'interne', condition: '', outputs: [{ targetId: '4', label: '' }], outil: 'CRM' },
    { id: '4', étape: 'Dossier complet ?', typeBpmn: 'ExclusiveGateway', département: 'Back Office', acteur: 'Gestionnaire', typeActeur: 'interne', condition: 'Dossier complet ?', outputs: [{ targetId: '5', label: 'Oui' }, { targetId: '2', label: 'Non' }], outil: '' },
    { id: '5', étape: 'Valider la demande', typeBpmn: 'Task', département: 'Back Office', acteur: 'Gestionnaire', typeActeur: 'interne', condition: '', outputs: [{ targetId: '6', label: '' }], outil: 'CRM' },
    { id: '6', étape: 'Fin du processus', typeBpmn: 'EndEvent', département: 'Back Office', acteur: 'Gestionnaire', typeActeur: 'interne', condition: '', outputs: [], outil: '' },
];

export default function SttPanel({ workflowId, onBack, currentActorId, fromClinic, initialTool }: Props) {
    const { invalidate } = useProceduresStore();
    const [processingLevel, setProcessingLevel] = useProcessingLevel();
    const [phase, setPhase] = useState<Phase>('upload');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [cards, setCards] = useState<ProcessCard[]>([]);
    const [generating, setGenerating] = useState(false);
    const [instances, setInstances] = useState<ProcessInstance[]>([]);
    const [activeTab, setActiveTab] = useState(0);
    const [data, setData] = useState<Table1Row[]>(defaultData);
    const [processTitle, setProcessTitle] = useState('Nouveau processus');
    const [bpmnXml, setBpmnXml] = useState<string | null>(null);
    const [enrichments, setEnrichments] = useState<Map<string, TaskEnrichment>>(DEFAULT_ENRICHMENTS);
    const [processMetadata] = useState<ProcessMetadata>(DEFAULT_PROCESS_METADATA);
    const [initialMeta, setInitialMeta] = useState<any>(undefined);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [guideOpen, setGuideOpen] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(initialTool === 'documents');
    const [sourceFiles, setSourceFiles] = useState<File[]>([]);
    const [revisionOpen, setRevisionOpen] = useState(false);
    const [revisionCount, setRevisionCount] = useState(0);
    const [editorFullscreen, setEditorFullscreen] = useState(false);
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [loadingWorkflow, setLoadingWorkflow] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (initialTool === 'code') { setCodeSourceOpen(true); setUploadOpen(false); }
        if (initialTool === 'documents') setUploadOpen(true);
        if (initialTool === 'assistant') { setUploadOpen(false); setCodeSourceOpen(false); }
    }, [initialTool]);

    // Code source state
    const [codeSourceOpen, setCodeSourceOpen] = useState(initialTool === 'code');
    const [codeFile, setCodeFile] = useState<File | null>(null);
    const [codeStep, setCodeStep] = useState<ProcessingStep>('idle');
    const [codeParsedData, setCodeParsedData] = useState<ParsedData | null>(null);
    const [codeFlowchartUrl, setCodeFlowchartUrl] = useState('');
    const [codeDotSource, setCodeDotSource] = useState('');
    const [codeFileName, setCodeFileName] = useState('');
    const [codeActiveTab, setCodeActiveTab] = useState<'simple' | 'editor' | 'table' | 'business'>('simple');

    const editorRef = useRef<BpmnEditorHandle>(null);
    const editorRefs = useRef<(BpmnEditorHandle | null)[]>([]);
    // Champs modifiés dans le formulaire d'export, par onglet : enregistrés avec la procédure
    const exportEditsRef = useRef<Record<number, Record<string, unknown>>>({});
    const modelerRef = useRef<any>(null);
    const vizRef = useRef<VizInstance | null>(null);
    const cancelledRef = useRef(false);
    // XML métier connu-correct, capturé juste avant de basculer en Vue outillage — sert
    // à restaurer le diagramme métier au retour, indépendamment de ce que `onChange` de
    // BpmnEditor a pu écrire dans le state pendant que la vue outillage était affichée
    // (le XML outillage ne doit jamais remplacer durablement le XML métier).
    const businessXmlSnapshotRef = useRef<string | null>(null);

    const showError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 5000); };
    const showSuccess = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 4000); };

    // Viz.js init pour FlowchartResults
    useEffect(() => { initializeViz().then(v => { vizRef.current = v; }); }, []);
    useEffect(() => { return () => { if (codeFlowchartUrl) URL.revokeObjectURL(codeFlowchartUrl); }; }, [codeFlowchartUrl]);

    // Code source handlers
    const handleCodeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setCodeFile(e.target.files[0]);
            setCodeStep('idle');
            setCodeParsedData(null);
            setCodeFlowchartUrl('');
            setCodeDotSource('');
        }
    };

    const handleGenerateCodeFlowchart = async () => {
        if (!codeFile) return;
        setCodeParsedData(null);
        setCodeFlowchartUrl('');
        setCodeDotSource('');
        await clinicGenerateFlowchart({
            file: codeFile,
            processingLevel,
            setCurrentStep: setCodeStep,
            setParsedData: setCodeParsedData,
            setFlowchartImageUrl: setCodeFlowchartUrl,
            setDotSource: setCodeDotSource,
            setCurrentFileName: setCodeFileName,
            setSuccess: showSuccess,
            setError: showError,
        });
    };

    const handleCodeToBPMN = async () => {
        if (!codeParsedData || !codeDotSource) return;
        setLoadingWorkflow(true);
        setCodeSourceOpen(false);
        try {
            const res = await fetch(API_CONFIG.getFullUrl('/api/discovery/analyze-code'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...processingLevelHeaders(processingLevel) },
                body: JSON.stringify({
                    dot_source: codeDotSource,
                    business_info: codeParsedData.business_info,
                    statistics: codeParsedData.statistics,
                }),
            });
            const resData = await res.json();
            if (!resData.success) throw new Error(resData.detail || 'Erreur discovery');
            setSessionId(resData.session_id);
            setCards(resData.processes.map((p: any) => ({
                process_id: p.process_id, title: p.title, description: p.description,
                sources: p.sources, confidence: p.confidence,
                estimated_steps: p.estimated_steps, category: p.category,
            })));
            setPhase('discovery');
            showSuccess(`${resData.processes.length} processus détecté(s) depuis "${codeFileName}"`);
        } catch (e: any) { showError(`Erreur analyse code : ${e.message}`); }
        finally { setLoadingWorkflow(false); }
    };

    const resetCodeSource = () => {
        setCodeFile(null); setCodeStep('idle'); setCodeParsedData(null);
        setCodeFlowchartUrl(''); setCodeDotSource(''); setCodeSourceOpen(false);
    };

    // Chargement via workflowId prop
    useEffect(() => {
        if (!workflowId) return;
        setLoadingWorkflow(true);
        orchestrationApi.getProcedure(workflowId)
            .then(res => {
                const proc = res.procedure;
                const workflow: Table1Row[] = proc.workflow_json || [];
                const title = proc.nom || proc.metadata?.nom || 'Processus';
                if (workflow.length === 0) {
                    setInstances([{
                        process_id: proc.id, title, data: [], enrichments: new Map(),
                        bpmnXml: null, metadata: { ...DEFAULT_PROCESS_METADATA },
                        initialMeta: proc.metadata || { nom: title }, status: 'ready',
                        workflow_db_id: proc.id,
                    }]);
                    setActiveTab(0); setPhase('upload'); setUploadOpen(true);
                    showSuccess(`Procédure "${title}" — workflow vide, prête à être complétée`);
                    setLoadingWorkflow(false);
                    return;
                }
                const enrichMap = new Map<string, TaskEnrichment>();
                const savedBpmnXml = proc.enrichments_json?.__bpmn_xml__ as string | undefined;
                if (proc.enrichments_json) {
                    Object.entries(proc.enrichments_json).forEach(([id, enr]: [string, any]) => {
                        if (id !== '__bpmn_xml__') enrichMap.set(id, enr);
                    });
                }
                const xml = savedBpmnXml || generateBPMNSimple(workflow, title);
                setInstances([{ process_id: proc.id, title, data: workflow, enrichments: enrichMap, bpmnXml: xml, metadata: { ...DEFAULT_PROCESS_METADATA }, initialMeta: proc.metadata || { nom: title }, status: 'ready', workflow_db_id: proc.id }]);
                setActiveTab(0); setPhase('editing'); setUploadOpen(false);
                showSuccess(`Procédure "${title}" chargée`);
            })
            .catch(e => showError(`Erreur chargement : ${e.message}`))
            .finally(() => setLoadingWorkflow(false));
    }, [workflowId]);

    // Chargement depuis Clinic (flowchart → discovery → BPMN)
    useEffect(() => {
        if (!fromClinic) return;
        const raw = sessionStorage.getItem('clinic_to_studio');
        if (!raw) return;
        sessionStorage.removeItem('clinic_to_studio');
        try {
            const { dot_source, business_info, statistics, filename } = JSON.parse(raw);
            if (!dot_source) return;
            setLoadingWorkflow(true);
            setUploadOpen(false);
            fetch(API_CONFIG.getFullUrl('/api/discovery/analyze-code'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...processingLevelHeaders(processingLevel) },
                body: JSON.stringify({ dot_source, business_info, statistics }),
            })
                .then(r => r.json())
                .then(res => {
                    if (!res.success) throw new Error(res.detail || 'Erreur discovery');
                    setSessionId(res.session_id);
                    setCards(res.processes.map((p: any) => ({
                        process_id: p.process_id,
                        title: p.title,
                        description: p.description,
                        sources: p.sources,
                        confidence: p.confidence,
                        estimated_steps: p.estimated_steps,
                        category: p.category,
                    })));
                    setPhase('discovery');
                    showSuccess(`${res.processes.length} processus détecté(s) depuis le flowchart "${filename || 'source'}"`);
                })
                .catch(e => showError(`Erreur analyse flowchart : ${e.message}`))
                .finally(() => setLoadingWorkflow(false));
        } catch { sessionStorage.removeItem('clinic_to_studio'); }
    }, [fromClinic]);

    const activeInst = instances[activeTab];
    const activeData = instances.length > 0 && activeInst ? activeInst.data : data;
    const activeTitle = instances.length > 0 && activeInst ? activeInst.title : processTitle;
    const activeEnrichments = instances.length > 0 && activeInst ? activeInst.enrichments : enrichments;
    const activeBpmnXml = instances.length > 0 && activeInst ? activeInst.bpmnXml : bpmnXml;
    const activeInitialMeta = instances.length > 0 && activeInst ? activeInst.initialMeta : initialMeta;
    const activeMetadata = instances.length > 0 && activeInst ? activeInst.metadata : processMetadata;

    // Étapes touchées par la dernière application de modification IA — surlignées dans
    // le tableau et le diagramme jusqu'à la prochaine sauvegarde manuelle du Studio.
    const recentAiChangedStepIds = useMemo(() => {
        const items = (activeInitialMeta as any)?.recent_ai_changes?.items as { target_step_id?: string | null }[] | undefined;
        return new Set((items || []).map(i => i.target_step_id).filter((id): id is string => Boolean(id)));
    }, [activeInitialMeta]);

    const updateActiveData = (d: Table1Row[]) => setInstances(prev => prev.map((inst, i) => i === activeTab ? { ...inst, data: d } : inst));
    const updateActiveEnrichments = (e: Map<string, TaskEnrichment>) => setInstances(prev => prev.map((inst, i) => i === activeTab ? { ...inst, enrichments: e } : inst));

    // ── Synchronisation diagramme → tableau (voir synchronise.md) ──
    // Le canevas (new-way/BpmnEditor.tsx + Library.tsx) permet de créer des tâches et
    // des outils directement sur le diagramme, mais rien ne relisait ce diagramme pour
    // mettre à jour le tableau — la Cartographie applicative et le score de complexité
    // ne voient que ce qui est tapé dans le tableau. `runParser` relit l'état actuel du
    // modeler bpmn-js et reconstruit Table1Row[] à partir de ce qui est réellement sur
    // le canevas, en préservant les ids/enrichments existants.
    const [syncPreview, setSyncPreview] = useState<ParseResult | null>(null);

    const runParser = useCallback((): ParseResult | null => {
        const modeler = modelerRef.current;
        if (!modeler) return null;
        const rows = instances.length > 0 ? (activeInst?.data ?? []) : data;
        const enrichMap = instances.length > 0 ? (activeInst?.enrichments ?? new Map<string, TaskEnrichment>()) : enrichments;
        return parseWorkflowFromModeler(modeler, rows, enrichMap);
    }, [instances, activeInst, data, enrichments]);

    const applySyncResult = useCallback((parsed: ParseResult) => {
        if (instances.length > 0) {
            setInstances(prev => prev.map((i, idx) => idx === activeTab ? { ...i, data: parsed.rows, enrichments: parsed.enrichments } : i));
        } else {
            setData(parsed.rows);
            setEnrichments(parsed.enrichments);
        }
    }, [instances, activeTab]);

    const handleSyncClick = useCallback(() => {
        const parsed = runParser();
        if (!parsed) { showError('Diagramme non chargé — impossible de synchroniser.'); return; }
        if (parsed.rows.length === 0) { showError(parsed.warnings[0] || 'Rien à synchroniser depuis le diagramme.'); return; }
        setSyncPreview(parsed);
    }, [runParser]);

    const confirmSyncPreview = () => {
        if (!syncPreview) return;
        applySyncResult(syncPreview);
        showSuccess('Tableau synchronisé depuis le diagramme');
        setSyncPreview(null);
    };

    // ── Vue IT (ex "Vue outillage") — voir la discussion sur "l'envers du vêtement" ──
    // Même diagramme métier (mêmes lanes/positions/flux), seul le texte des tâches
    // change : outil en titre + étape en sous-titre, "(Manuel)" si aucun outil. Généré à
    // la volée depuis Table1Row[] à chaque bascule — rien n'est stocké, rien à
    // synchroniser. Enregistrer/Synchroniser restent désactivés tant qu'elle est affichée
    // (le XML IT ne doit jamais être confondu avec le XML métier réel) — mais rien n'empêche
    // bpmn-js lui-même d'être manipulé ici (pas de vrai mode lecture seule au niveau du
    // moteur) ; le garde-fou sur `onChange` ci-dessous évite qu'une manip accidentelle
    // n'écrase le XML métier en mémoire tant qu'on n'est pas revenu en vue métier.
    const [viewMode, setViewMode] = useState<'metier' | 'outillage'>('metier');
    const [outillageTool, setOutillageTool] = useState<{ name: string; x: number; y: number } | null>(null);
    const [manageTool, setManageTool] = useState<string | null>(null);

    const toggleViewMode = useCallback(async () => {
        const ref = instances.length > 0 ? editorRefs.current[activeTab] : editorRef.current;
        const modeler = modelerRef.current;
        if (!ref || !modeler) return;

        if (viewMode === 'metier') {
            businessXmlSnapshotRef.current = activeBpmnXml ?? null;
            const xml = generateBPMNOutillage(activeData, activeTitle);
            await ref.importXml(xml);
            setViewMode('outillage');

            const eventBus = modeler.get('eventBus');
            const onClick = (e: any) => {
                const id: string = e.element?.id || '';
                if (!id.startsWith('ToolNode_')) return; // exclut les "(Manuel)" (Task_) et le reste du diagramme
                const name: string = e.element?.businessObject?.name || '';
                if (!name) return;
                const clientX = e.originalEvent?.clientX ?? window.innerWidth / 2;
                const clientY = e.originalEvent?.clientY ?? window.innerHeight / 2;
                setOutillageTool({ name, x: clientX, y: clientY });
            };
            eventBus.on('element.click', onClick);
            modeler.__outillageClickHandler = onClick; // retrouvé pour le détacher au retour
        } else {
            const modeler2 = modelerRef.current;
            if (modeler2?.__outillageClickHandler) {
                modeler2.get('eventBus').off('element.click', modeler2.__outillageClickHandler);
                delete modeler2.__outillageClickHandler;
            }
            const xml = businessXmlSnapshotRef.current ?? activeBpmnXml;
            if (xml) await ref.importXml(xml);
            setViewMode('metier');
            setOutillageTool(null);
        }
    }, [viewMode, instances, activeTab, activeData, activeTitle, activeBpmnXml]);

    const handleDiscoveryComplete = (sid: string, detected: ProcessCard[], files: File[]) => {
        setSessionId(sid); setCards(detected); setPhase('discovery'); setUploadOpen(false);
        setSourceFiles(files);
    };

    const handleGenerate = async (selectedIds: string[]) => {
        if (!sessionId || selectedIds.length === 0) return;
        setGenerating(true);
        const newInstances: ProcessInstance[] = selectedIds.map(pid => {
            const card = cards.find(c => c.process_id === pid)!;
            return { process_id: pid, title: card.title, data: [], enrichments: new Map(), bpmnXml: null, metadata: { ...DEFAULT_PROCESS_METADATA }, initialMeta: { nom: card.title }, status: 'generating' };
        });
        setInstances(newInstances); setActiveTab(0); setPhase('editing');
        for (let i = 0; i < selectedIds.length; i++) {
            const pid = selectedIds[i];
            try {
                const res = await fetch(API_CONFIG.getFullUrl(API_CONFIG.endpoints.generationGenerate), { method: 'POST', headers: { 'Content-Type': 'application/json', ...processingLevelHeaders(processingLevel) }, body: JSON.stringify({ session_id: sessionId, process_id: pid }) });
                const d = await res.json();
                if (!res.ok) throw new Error(d.detail || 'Erreur');
                const enrichMap = new Map<string, TaskEnrichment>();
                if (d.enrichments) Object.entries(d.enrichments).forEach(([id, enr]: [string, any]) => enrichMap.set(id, enr));
                const xml = generateBPMNSimple(d.workflow, d.title);
                setInstances(prev => prev.map((inst, idx) => idx === i ? { ...inst, title: d.title || inst.title, data: d.workflow || [], enrichments: enrichMap, bpmnXml: xml, initialMeta: d.procedureMetadata || { nom: d.title }, status: 'ready', workflow_db_id: d.workflow_db_id || undefined } : inst));
            } catch (err: any) {
                setInstances(prev => prev.map((inst, idx) => idx === i ? { ...inst, status: 'error' } : inst));
                showError(`Erreur : ${cards.find(c => c.process_id === pid)?.title} — ${err.message}`);
            }
        }
        setGenerating(false);
        showSuccess(`${selectedIds.length} processus généré${selectedIds.length > 1 ? 's' : ''}`);
    };

    const handleGenerateBPMN = useCallback(async () => {
        if (instances.length > 0 && activeInst) {
            const xml = generateBPMNSimple(activeInst.data, activeInst.title);
            setInstances(prev => prev.map((inst, i) => i === activeTab ? { ...inst, bpmnXml: xml } : inst));
            if (editorRefs.current[activeTab]) await editorRefs.current[activeTab]!.importXml(xml);
        } else {
            const xml = generateBPMNSimple(data, processTitle);
            setBpmnXml(xml);
            if (editorRef.current) await editorRef.current.importXml(xml);
        }
        showSuccess('Diagramme BPMN généré !');
    }, [activeInst, activeTab, instances, data, processTitle]);

    const handleSave = useCallback(async (nom: string, category: string, taxonomyId?: string) => {
        const inst = instances.length > 0 ? activeInst : null;
        setSaving(true);
        try {
            // Récupérer le XML BPMN actuel (avec positions modifiées)
            const currentXml = instances.length > 0
                ? (await editorRefs.current[activeTab]?.saveXml() ?? activeInst?.bpmnXml ?? null)
                : (await editorRef.current?.saveXml() ?? bpmnXml ?? null);

            // Le diagramme qu'on vient de figer dans currentXml EST la source qu'on
            // s'apprête à persister — on le reparse pour que workflow_json ne puisse
            // jamais diverger durablement du XML sauvegardé (tâches/outils ajoutés à la
            // main sur le canevas depuis le dernier chargement). Silencieux ici (pas de
            // confirmation) : contrairement au bouton "Synchroniser", on n'affiche pas
            // un tableau périmé à l'utilisateur au moment où il sauvegarde — le résultat
            // du parseur reflète ce qui va réellement être enregistré. Un diagramme vide
            // (parsed.rows.length === 0) ne remplace jamais les données existantes.
            let saveRows = inst ? inst.data : data;
            let saveEnrichments = inst ? inst.enrichments : enrichments;
            const parsed = runParser();
            if (parsed && parsed.rows.length > 0) {
                saveRows = parsed.rows;
                saveEnrichments = parsed.enrichments;
                if (parsed.warnings.length > 0) {
                    showError(`Synchronisation diagramme→tableau : ${parsed.warnings[0]}${parsed.warnings.length > 1 ? ` (+${parsed.warnings.length - 1} autre(s))` : ''}`);
                }
                applySyncResult(parsed);
            }

            if (inst?.workflow_db_id) {
                const enrichObj: Record<string, unknown> = {};
                saveEnrichments.forEach((v, k) => { enrichObj[k] = v; });
                // Une sauvegarde manuelle depuis le Studio efface le tampon "modifications
                // récentes de l'IA" — l'utilisateur a vu et repris la main sur la procédure.
                const exportEdits = exportEditsRef.current[activeTab] ?? {};
                await orchestrationApi.saveWorkflowData(inst.workflow_db_id, saveRows as unknown[], enrichObj, { ...exportEdits, recent_ai_changes: null }, currentXml);
                setInstances(prev => prev.map((i, idx) => idx === activeTab ? { ...i, initialMeta: { ...i.initialMeta, ...exportEdits, recent_ai_changes: null } } : i));
            } else {
                const res = await orchestrationApi.createProcedure({ nom, category, taxonomy_id: taxonomyId });
                const newId = res.procedure.id;
                const enrichObj: Record<string, unknown> = {};
                saveEnrichments.forEach((v, k) => { enrichObj[k] = v; });
                // Métadonnées générées (objet, périmètre, dates, annexes…) + saisies du formulaire d'export
                const fullMeta = { ...(activeInitialMeta ?? {}), ...(exportEditsRef.current[activeTab] ?? {}), nom, category };
                await orchestrationApi.saveWorkflowData(newId, saveRows as unknown[], enrichObj, fullMeta, currentXml);
                if (inst) setInstances(prev => prev.map((i, idx) => idx === activeTab ? { ...i, workflow_db_id: newId, title: nom } : i));
                invalidate();
            }
            showSuccess('Procédure enregistrée');
        } catch (err: any) { showError(`Erreur : ${err.message}`); throw err; }
        finally { setSaving(false); }
    }, [activeInst, activeTab, instances, data, enrichments, invalidate, runParser, applySyncResult, activeInitialMeta]);

    const [submitModalOpen, setSubmitModalOpen] = useState(false);

    const handleSubmitConfirm = useCallback(async (recipientId: string, message: string) => {
        const inst = instances.length > 0 ? activeInst : null;
        if (!inst?.workflow_db_id || !currentActorId) return;
        setSubmitting(true);
        try {
            const currentXml = await editorRefs.current[activeTab]?.saveXml() ?? inst.bpmnXml ?? null;
            const enrichObj: Record<string, unknown> = {};
            inst.enrichments.forEach((v, k) => { enrichObj[k] = v; });
            await orchestrationApi.saveWorkflowData(inst.workflow_db_id, inst.data as unknown[], enrichObj, undefined, currentXml);
            await orchestrationTasksApi.createTask(inst.workflow_db_id, {
                title: `Vérification : ${inst.title}`,
                description: message || undefined,
                assigned_to: recipientId,
                assigned_by: currentActorId,
                raci_role: 'C',
                task_type: 'review',
                priority: 'normal',
            });
            showSuccess('Procédure soumise pour vérification');
            setSubmitModalOpen(false);
            invalidate();
        } catch (err: any) { showError(`Erreur soumission : ${err.message}`); }
        finally { setSubmitting(false); }
    }, [activeInst, instances, currentActorId, invalidate]);

    const handleDownloadBPMN = useCallback(async () => {
        const xml = instances.length > 0 && activeInst
            ? (await editorRefs.current[activeTab]?.saveXml() ?? activeInst.bpmnXml)
            : (await editorRef.current?.saveXml() ?? bpmnXml);
        if (!xml) { showError("Générez d'abord le diagramme"); return; }
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(activeInst?.title || processTitle).replace(/\s+/g, '_')}.bpmn`;
        a.click(); URL.revokeObjectURL(url);
    }, [activeInst, activeTab, instances, bpmnXml, processTitle]);

    const captureBpmnDiagram = useCallback(async (): Promise<string | null> => {
        const ref = instances.length > 0 ? editorRefs.current[activeTab] : editorRef.current;
        if (!ref) return null;
        try {
            const svg = await ref.saveSvg();
            if (!svg) return null;
            return await new Promise<string | null>((resolve) => {
                const img = new Image();
                const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const scale = 2;
                    canvas.width = img.width * scale; canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d')!;
                    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/png', 1.0));
                };
                img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
                img.src = url;
            });
        } catch { return null; }
    }, [activeTab, instances]);

    // Régénère le diagramme BPMN à partir du workflow reçu du chat — évite de le
    // détruire (bpmnXml: null) et d'obliger un clic manuel sur "Générer le diagramme".
    // Régénération complète (pas de patch incrémental) : les positions/ajouts manuels
    // faits directement dans l'éditeur BPMN sont donc réinitialisés à chaque modif chat.
    const safeGenerateBpmn = useCallback((workflow: Table1Row[], title: string): string | null => {
        if (workflow.length === 0) return null;
        try {
            return generateBPMNSimple(workflow, title);
        } catch (err: any) {
            showError(`Diagramme non régénéré : ${err.message || 'erreur inconnue'}`);
            return null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleWorkflowFromChat = useCallback((
        workflow: Table1Row[], title: string,
        newEnrichments: Map<string, TaskEnrichment>, procedureMetadata?: any,
    ) => {
        if (instances.length > 0) {
            const newTitle = title || activeInst?.title || '';
            const xml = safeGenerateBpmn(workflow, newTitle);
            setInstances(prev => prev.map((inst, i) => i === activeTab ? {
                ...inst, data: workflow, title: title || inst.title,
                enrichments: mergeEnrichments(inst.enrichments, newEnrichments), bpmnXml: xml,
                initialMeta: mergeProcedureMetadata(inst.initialMeta, procedureMetadata),
            } : inst));
            if (xml) editorRefs.current[activeTab]?.importXml(xml);
        } else {
            setData(workflow);
            const newTitle = title || processTitle;
            if (title) setProcessTitle(title);
            const xml = safeGenerateBpmn(workflow, newTitle);
            setBpmnXml(xml);
            if (xml) editorRef.current?.importXml(xml);
            if (newEnrichments?.size > 0) setEnrichments(prev => mergeEnrichments(prev, newEnrichments));
            if (procedureMetadata) setInitialMeta((prev: any) => mergeProcedureMetadata(prev, procedureMetadata));
        }
    }, [activeTab, instances, activeInst, processTitle, safeGenerateBpmn]);

    const toggleRecording = async () => {
        if (!recording) {
            cancelledRef.current = false;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const recorder = new MediaRecorder(stream);
                const chunks: BlobPart[] = [];
                recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
                recorder.onstop = async () => {
                    stream.getTracks().forEach(t => t.stop());
                    if (cancelledRef.current) return; // annulé — ne pas traiter
                    setProcessing(true);
                    const blob = new Blob(chunks, { type: 'audio/webm' });
                    const fd = new FormData(); fd.append('file', blob, 'audio.webm');
                    try {
                        const res = await fetch(API_CONFIG.getFullUrl(API_CONFIG.endpoints.transcribe), { method: 'POST', headers: processingLevelHeaders(processingLevel), body: fd });
                        const result = await res.json();
                        if (!res.ok) throw new Error(result.detail || 'Erreur transcription');
                        if (result?.parsedData && Array.isArray(result.parsedData)) {
                            const rows: Table1Row[] = result.parsedData
                                .filter((i: any) => i.étape && i.acteur)
                                .map((i: any) => ({ id: i.id || crypto.randomUUID(), étape: i.étape || '', typeBpmn: i.typeBpmn || 'Task', département: i.département || '', acteur: i.acteur || '', typeActeur: i.typeActeur || '', condition: i.condition || '', outputs: Array.isArray(i.outputs) ? i.outputs : [], outil: i.outil || '' }));
                            if (rows.length > 0) { setData(rows); showSuccess(`✅ ${rows.length} étape(s) extraite(s)`); }
                        }
                    } catch (e: any) { showError(e.message || 'Erreur transcription'); }
                    finally { setProcessing(false); }
                };
                recorder.start(); setMediaRecorder(recorder); setRecording(true);
            } catch { showError("❌ Impossible d'accéder au microphone."); }
        } else {
            mediaRecorder?.stop();
            setRecording(false);
        }
    };

    const cancelRecording = () => {
        cancelledRef.current = true;
        mediaRecorder?.stop();
        setRecording(false);
        showSuccess('Enregistrement annulé — tableau inchangé');
    };

    useEffect(() => {
        if (!activeInst?.bpmnXml) return;
        const ref = editorRefs.current[activeTab];
        if (ref) ref.importXml(activeInst.bpmnXml);
    }, [activeTab]);

    const inputContext = (
        <>
            <div hidden={!uploadOpen}>
                <div className="flex items-center justify-between mb-2"><span className="text-xs font-medium text-slate-600">Documents du processus</span><button type="button" onClick={() => setUploadOpen(false)} aria-label="Fermer les documents" className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button></div>
                <MultiDocUpload processingLevel={processingLevel} onDiscoveryComplete={handleDiscoveryComplete} onError={showError} onSuccess={showSuccess} />
            </div>

            {/* Code source panel */}
            <div hidden={!codeSourceOpen}>
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Code className="w-4 h-4 text-violet-500" />
                        Code source — Analyse et flowchart
                        <button type="button" onClick={() => setCodeSourceOpen(false)} aria-label="Fermer le code source" className="ml-auto text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
                    </div>
                    <p className="text-xs text-slate-500">
                        Ajoutez un fichier source (.wl, .swift, .txt) pour générer un flowchart puis le convertir en BPMN.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex-1 flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-violet-300 hover:bg-violet-50/50 transition-colors">
                            <Code className="w-5 h-5 text-slate-400" />
                            <span className="text-sm text-slate-600 truncate">
                                {codeFile ? codeFile.name : 'Choisir un fichier code source…'}
                            </span>
                            <input type="file" accept=".wl,.swift,.txt,.windev" onChange={handleCodeFileChange} className="hidden" />
                        </label>
                        <button type="button" onClick={handleGenerateCodeFlowchart}
                            disabled={!codeFile || codeStep === 'parsing' || codeStep === 'generating'}
                            className="px-4 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors shrink-0">
                            {codeStep === 'parsing' || codeStep === 'generating' ? 'Génération…' : 'Générer le flowchart'}
                        </button>
                    </div>
                    {(codeStep === 'parsing' || codeStep === 'generating') && (
                        <div className="flex items-center gap-2 text-xs text-violet-600">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {codeStep === 'parsing' ? 'Analyse du code source…' : 'Génération du flowchart…'}
                        </div>
                    )}
                </div>
            </div>
        </>
    );

    return (
        <div className="flex h-full bg-slate-50 overflow-hidden">

            {/* ── Contenu principal ── */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

                {/* Retour au contexte d’origine */}
                <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-white border-b border-slate-200">
                    <div className="flex items-center gap-3 min-w-0">
                        {onBack && (
                            <button type="button" onClick={onBack}
                                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                                <ArrowLeft className="w-3.5 h-3.5" /> Retour
                            </button>
                        )}
                        {activeInst?.workflow_db_id && (
                            <span className="text-xs text-slate-500 truncate">{activeInst.title}</span>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                <div className="max-w-[1400px] mx-auto px-4 py-5 space-y-3">

                    {loadingWorkflow && (
                        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg flex items-center gap-2 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />Chargement…
                        </div>
                    )}
                    {error && <div className="fixed top-16 right-6 z-50 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2 text-sm shadow-lg"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span></div>}
                    {success && <div className="fixed top-16 right-6 z-50 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-2 text-sm shadow-lg"><CheckCircle className="w-4 h-4 flex-shrink-0" /><span>{success}</span></div>}

                    {/* Flowchart Results (depuis code source) */}
                    {codeSourceOpen && codeStep === 'completed' && codeParsedData && codeFlowchartUrl && (
                        <div className="clinic-page" style={{ minHeight: 'auto', background: 'transparent' }}>
                            <FlowchartResults
                                parsedData={codeParsedData}
                                flowchartImageUrl={codeFlowchartUrl}
                                dotSource={codeDotSource}
                                currentFileName={codeFileName}
                                vizInstance={vizRef.current}
                                activeTab={codeActiveTab}
                                onTabChange={setCodeActiveTab}
                                onDotSourceChange={setCodeDotSource}
                                onDownloadJson={() => {}}
                                onGenerateBPMN={handleCodeToBPMN}
                            />
                        </div>
                    )}

                    {phase === 'discovery' && sessionId && (
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <button type="button" onClick={() => { setPhase('upload'); setUploadOpen(true); }} className="text-xs text-blue-600">Retour aux documents</button>
                                <ProcessingLevelSelector value={processingLevel} onChange={setProcessingLevel} />
                            </div>
                            <ProcessDiscoveryPanel processingLevel={processingLevel} sessionId={sessionId} cards={cards} onCardsUpdated={setCards} onGenerate={handleGenerate} generating={generating} />
                        </div>
                    )}
                    <div hidden={phase === 'discovery'}>
                        <ChatInterface
                            inputContextVisible={uploadOpen || codeSourceOpen}
                            inputContext={inputContext}
                            onOpenDocuments={() => { setUploadOpen(true); setCodeSourceOpen(false); }}
                            onOpenCode={() => { setCodeSourceOpen(true); setUploadOpen(false); }}
                            recording={recording} processing={processing}
                            onToggleRecording={toggleRecording} onCancelRecording={cancelRecording}
                            onNewConversation={() => { setUploadOpen(false); setCodeSourceOpen(false); }}
                            onProcessingLevelChange={setProcessingLevel}
                            processingLevel={processingLevel}
                            key={`chat-${activeTab}`}
                            currentWorkflow={activeData}
                            currentEnrichments={activeEnrichments}
                            currentProcedureMetadata={activeInitialMeta}
                            onWorkflowGenerated={handleWorkflowFromChat}
                            onError={showError} onSuccess={showSuccess}
                        />
                    </div>
                    {revisionOpen && phase === 'editing' && (
                        <RevisionPanel
                            processingLevel={processingLevel}
                            workflow={activeData}
                            onWorkflowChange={instances.length > 0 ? updateActiveData : (d) => { setData(d); setRevisionCount(c => c + 1); }}
                            onSuccess={showSuccess} onError={showError}
                        />
                    )}

                    {/* Guide */}
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <button onClick={() => setGuideOpen(!guideOpen)} className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                <Info className="w-3.5 h-3.5 text-blue-400" />Guide d'utilisation
                            </div>
                            {guideOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                        </button>
                        {guideOpen && (
                            <div className="px-4 pb-3 border-t border-slate-100">
                                <ul className="text-xs text-slate-600 space-y-1 mt-2.5">
                                    <li><strong>StartEvent / EndEvent</strong> — Début et fin du processus</li>
                                    <li><strong>Task</strong> — Action réalisée par un acteur</li>
                                    <li><strong>ExclusiveGateway</strong> — Décision (Oui/Non)</li>
                                    <li><strong>Acteur</strong> — Définit les swimlanes</li>
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Actions sur le processus */}
                    <SttToolbar
                        dataLength={activeData.length}
                        bpmnXml={activeBpmnXml ?? ''}
                        isEditingBpmn={!!activeBpmnXml}
                        revisionOpen={revisionOpen}
                        revisionCount={revisionCount}
                        onGenerateBPMN={handleGenerateBPMN}
                        onDownloadBPMN={handleDownloadBPMN}
                        onResetToDefault={() => { setInstances([]); setData(defaultData); setBpmnXml(null); setPhase('upload'); resetCodeSource(); }}
                        onClearTable={() => { if (instances.length > 0) updateActiveData([]); else setData([]); }}
                        onDetectInterfaces={() => { }}
                        onAnalyseErrors={() => showError('🔜 Bientôt disponible')}
                        onToggleRevision={() => setRevisionOpen(o => !o)}
                    />


                    {/* Onglets processus + nouvelle procédure */}
                    {instances.length > 0 && (
                        <div className="flex gap-1 flex-wrap items-center">
                            {instances.map((inst, i) => (
                                <button type="button" key={inst.process_id} onClick={() => setActiveTab(i)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${i === activeTab ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                    {inst.status === 'generating' && <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1.5 animate-pulse" />}
                                    {inst.status === 'error' && <span className="inline-block w-2 h-2 rounded-full bg-red-400    mr-1.5" />}
                                    {inst.status === 'ready' && <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />}
                                    {inst.title.length > 30 ? inst.title.slice(0, 30) + '…' : inst.title}
                                </button>
                            ))}
                            <button type="button" title="Nouvelle procédure" onClick={() => {
                                const newInst: ProcessInstance = {
                                    process_id: crypto.randomUUID(), title: 'Nouvelle procédure',
                                    data: defaultData, enrichments: new Map(), bpmnXml: null,
                                    metadata: { ...DEFAULT_PROCESS_METADATA }, initialMeta: undefined,
                                    status: 'ready',
                                };
                                setInstances(prev => [...prev, newInst]);
                                setActiveTab(instances.length);
                                setPhase('upload'); setUploadOpen(true);
                            }}
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    {/* BPMN Editor */}
                    {activeBpmnXml && (
                        <div className={`bg-white border border-slate-200 rounded-xl overflow-hidden ${editorFullscreen ? 'fixed inset-4 z-50 shadow-2xl' : ''}`}>
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                                <span className="text-sm font-semibold text-slate-700">BPMN Studio — {activeTitle}</span>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => {
                                        const inst = instances.length > 0 ? activeInst : null;
                                        if (inst?.workflow_db_id) {
                                            handleSave(inst.title, '', undefined);
                                        } else {
                                            setSaveModalOpen(true);
                                        }
                                    }} disabled={saving || viewMode === 'outillage'}
                                        title={viewMode === 'outillage' ? 'Repassez en vue métier pour enregistrer' : undefined}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                        <Save className="w-3.5 h-3.5" />{saving ? 'Enregistrement…' : 'Enregistrer'}
                                    </button>
                                    <button type="button" onClick={handleSyncClick} disabled={viewMode === 'outillage'}
                                        title={viewMode === 'outillage' ? 'Repassez en vue métier pour synchroniser' : 'Relire le diagramme pour mettre à jour le tableau (tâches/outils ajoutés directement sur le canevas)'}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 disabled:opacity-40 transition-colors">
                                        <RotateCw className="w-3.5 h-3.5" />Synchroniser
                                    </button>
                                    <button type="button" onClick={toggleViewMode}
                                        title="Vue IT : l'outil devient le titre de chaque tâche — cliquez un outil pour voir ses écrans/champs/codes"
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${viewMode === 'outillage' ? 'bg-violet-600 text-white' : 'bg-white border border-violet-300 text-violet-700 hover:bg-violet-50'}`}>
                                        <Wrench className="w-3.5 h-3.5" />{viewMode === 'outillage' ? 'Vue IT (active)' : 'Vue IT'}
                                    </button>
                                    {activeInst?.workflow_db_id && currentActorId && (
                                        <button type="button" onClick={() => setSubmitModalOpen(true)} disabled={submitting}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                                            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                            Soumettre
                                        </button>
                                    )}
                                    <button type="button" onClick={handleDownloadBPMN}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-300 transition-colors">
                                        <Download className="w-3.5 h-3.5" />Télécharger
                                    </button>
                                    <button type="button" onClick={() => setEditorFullscreen(f => !f)} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                                        <Maximize2 className="w-4 h-4 text-slate-500" />
                                    </button>
                                    <button type="button"
                                        onClick={() => { if (instances.length > 0) setInstances(prev => prev.map((inst, i) => i === activeTab ? { ...inst, bpmnXml: null } : inst)); else setBpmnXml(null); }}
                                        className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
                                        <X className="w-4 h-4 text-slate-500" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex" style={{ height: editorFullscreen ? 'calc(100% - 44px)' : '600px' }}>
                                <Library modelerRef={modelerRef} />
                                <div className="flex-1 min-w-0">
                                    {instances.length > 0
                                        ? <BpmnEditor ref={el => { editorRefs.current[activeTab] = el; }} initialXml={activeBpmnXml} onChange={xml => { if (viewMode === 'metier') setInstances(prev => prev.map((inst, i) => i === activeTab ? { ...inst, bpmnXml: xml } : inst)); }} onError={showError} onReady={() => { }} onModelerReady={m => { modelerRef.current = m; }} highlightStepIds={Array.from(recentAiChangedStepIds)} />
                                        : <BpmnEditor ref={editorRef} initialXml={activeBpmnXml} onChange={xml => { if (viewMode === 'metier') setBpmnXml(xml); }} onError={showError} onReady={() => { }} onModelerReady={m => { modelerRef.current = m; }} highlightStepIds={Array.from(recentAiChangedStepIds)} />
                                    }
                                </div>
                            </div>
                        </div>
                    )}

                    {activeInst?.status === 'generating' ? (
                        <div className="bg-white border border-slate-200 rounded-xl p-8 flex items-center justify-center gap-3 text-slate-400">
                            <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                            <span className="text-sm">Génération de "{activeInst.title}"…</span>
                        </div>
                    ) : (
                        <Table
                            data={activeData} enrichments={activeEnrichments}
                            processTitle={activeTitle}
                            onDataChange={instances.length > 0 ? updateActiveData : setData}
                            onEnrichmentsChange={instances.length > 0 ? updateActiveEnrichments : setEnrichments}
                            onShowSuccess={showSuccess}
                            highlightedRowIds={recentAiChangedStepIds}
                        />
                    )}

                    {activeBpmnXml && activeData.length > 0 && (
                        <DocumentExportPanel
                            data={activeData} enrichments={activeEnrichments}
                            processMetadata={activeMetadata} bpmnXml={activeBpmnXml}
                            diagramCaptureFn={captureBpmnDiagram}
                            initialMeta={activeInitialMeta}
                            sourceFiles={sourceFiles}
                            onSuccess={showSuccess} onError={showError}
                            onMetaEdited={changes => { exportEditsRef.current[activeTab] = changes; }}
                        />
                    )}
                </div>
                </div>
            </div>

            <SaveToBiblioModal open={saveModalOpen} initialNom={activeTitle} onClose={() => setSaveModalOpen(false)} onConfirm={handleSave} />

            {outillageTool && (
                <ToolQuickCard
                    toolName={outillageTool.name}
                    anchor={{ x: outillageTool.x, y: outillageTool.y }}
                    onClose={() => setOutillageTool(null)}
                    onManage={() => { setManageTool(outillageTool.name); setOutillageTool(null); }}
                />
            )}

            {manageTool && (
                <ToolDetailPanel toolName={manageTool} onClose={() => setManageTool(null)} />
            )}

            {syncPreview && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-xl shadow-xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
                            <RotateCw className="w-4 h-4 text-blue-600" />
                            <h3 className="font-bold text-slate-900">Synchroniser depuis le diagramme</h3>
                        </div>
                        <div className="px-5 py-4 space-y-3 max-h-96 overflow-y-auto">
                            <p className="text-sm text-slate-700">
                                {syncPreview.rows.length} étape(s) détectée(s) dans le diagramme
                                {syncPreview.newRowIds.size > 0 && (
                                    <> — dont <strong>{syncPreview.newRowIds.size} nouvelle(s)</strong> (créée(s) directement sur le canevas)</>
                                )}.
                            </p>
                            {syncPreview.warnings.length > 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                                    <p className="text-xs font-semibold text-amber-700">À vérifier après application :</p>
                                    <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
                                        {syncPreview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                                    </ul>
                                </div>
                            )}
                            <p className="text-xs text-slate-400">
                                Cette action remplace le contenu du tableau par ce qui est lu sur le canevas.
                                Les ids et les détails déjà saisis (colonne « Détails ») sont conservés pour
                                les étapes reconnues.
                            </p>
                        </div>
                        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
                            <button type="button" onClick={() => setSyncPreview(null)}
                                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                                Annuler
                            </button>
                            <button type="button" onClick={confirmSyncPreview}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                                Appliquer
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {submitModalOpen && activeInst?.workflow_db_id && (
                <RecipientPicker
                    title="Soumettre pour vérification"
                    subtitle={activeInst.title}
                    procedureId={activeInst.workflow_db_id}
                    actorId={currentActorId || ''}
                    roles={[
                        { value: 'C', label: 'Vérifieur', description: 'Contrôle la cohérence avant validation' },
                        { value: 'A', label: 'Valideur', description: 'Approuve directement sans vérification' },
                    ]}
                    defaultRole="C"
                    showMessage
                    confirmLabel="Soumettre"
                    onConfirm={(recipientId, recipientRole, message) => handleSubmitConfirm(recipientId, message)}
                    onCancel={() => setSubmitModalOpen(false)}
                />
            )}
        </div>
    );
}


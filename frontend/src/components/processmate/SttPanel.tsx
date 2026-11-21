'use client';

// components/processmate/SttPanel.tsx
// Contenu BPMN Studio dans le shell ProcessMate.
// Les entrées sont regroupées dans l’assistant ; les actions du résultat restent près du tableau.

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type * as React from 'react';
import dynamic from 'next/dynamic';
import { generateBPMNSimple } from '@/logic/bpmnGeneratorSimple';
import { generateBPMNOutillage } from '@/logic/bpmnGeneratorOutillage';
import { parseWorkflowFromModeler, type ParseResult } from '@/logic/bpmnParser';
import ToolDetailPanel from '@/components/orchestration/ToolDetailPanel';
import ToolQuickCard from '@/components/orchestration/ToolQuickCard';
import { ScreenHoverCard } from '@/components/orchestration/ScreenHover';
import type { Table1Row } from '@/logic/types';
import { ProcessMetadata, TaskEnrichment, DEFAULT_PROCESS_METADATA, DEFAULT_ENRICHMENTS, mergeProcedureMetadata, mergeEnrichments } from '@/logic/bpmnTypes';
import type { BpmnEditorHandle } from '@/components/new-way/BpmnEditor';
import Table from '@/components/ProcessTable';
import RevisionPanel from '@/components/RevisionPanel';
import DocumentExportPanel from '@/components/DocumentExportPanel';
import type { ProcessCard } from '@/components/MultiDocUpload';
import ProcessDiscoveryPanel from '@/components/ProcessDiscoveryPanel';
import SttToolbar from './SttToolbar';
import ChatInterface, { type GeneratedProcedure } from '@/components/ChatInterface';
import SaveTargetModal, { type SaveChoice } from '@/components/processmate/SaveTargetModal';
import { saveTargetsApi } from '@/lib/saveTargetsApi';
import { LiveBpmn, LiveHeader, LiveTable } from './LiveProcedurePreview';
import {
    AlertCircle, CheckCircle, Info, ChevronDown, ChevronUp,
    X, Download, Save, Loader2, Plus, ArrowLeft, Send, Code, RotateCw, Wrench,
    PanelLeftOpen, Table2, Workflow, FileText, ZoomIn, ZoomOut, Scan, Minimize2, MoreHorizontal, Shapes, History,
    PanelLeftClose, PanelRightClose, PanelRightOpen, Expand, Shrink,
} from 'lucide-react';
import { API_CONFIG } from '@/lib/api-config';
import { CONVERSATIONS_ENABLED, conversationsApi, type StoredProcedure } from '@/lib/conversationsApi';
import { BPMN_PRESERVE_LAYOUT, GUEST_EXPORT_ENABLED, OPEN_POINTS_UI_ENABLED } from '@/lib/features';
import { VERSIONS_ENABLED, type VersionDetail } from '@/lib/versionsApi';
import CircuitBar from '@/components/shared/CircuitBar';
import { RowMenu } from '@/components/home/ui';
import { useAuth } from '@/context/AuthContext';
import VersionHistoryModal from '@/components/shared/VersionHistoryModal';
import OpenPointsPanel, { readOpenPoints, type OpenPoint } from '@/components/shared/OpenPointsPanel';
import { applyLabelChanges } from '@/logic/bpmnLabelPatch';
import { diffWorkflows, isEmptyDiff, isLabelOnly } from '@/logic/workflowDiff';
import { processingLevelHeaders } from '@/lib/processing-level';
import type { StudioTool } from '@/lib/processmate-navigation';
import ProcessingLevelSelector, { useProcessingLevel } from './ProcessingLevelSelector';
import { orchestrationApi, type Procedure } from '@/lib/orchestrationApi';
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
    category?: string;
    process_id: string; title: string; data: Table1Row[];
    enrichments: Map<string, TaskEnrichment>; bpmnXml: string | null;
    metadata: ProcessMetadata; initialMeta: any;
    status: 'generating' | 'ready' | 'error'; workflow_db_id?: string;
    /** remplacée ou retirée par le chat : hors de la liste, gardée et rétablissable */
    archived?: boolean;
}

interface Props {
    workflowId?: string; onBack?: () => void; currentActorId?: string; fromClinic?: boolean; initialTool?: StudioTool;
    /** Page d'accueil « chat d'abord » : le chat occupe l'écran tant qu'aucune procédure n'existe */
    chatFirst?: boolean;
    /** Invité : rien n'est enregistré (pas d'Enregistrer / Soumettre), export selon GUEST_EXPORT_ENABLED */
    guestMode?: boolean;
    /** Projet des conversations créées ici */
    projectId?: string;
    /** Enregistrement dans le référentiel de l'organisation (compte membre, hors lecture seule) */
    librarySave?: boolean;
    /** Premier message envoyé tout seul (nouvelle conversation lancée depuis un projet) */
    initialMessage?: string;
    /** Texte prérempli dans le champ, NON envoyé (l'utilisateur joint ses fichiers d'abord) */
    initialDraft?: string;
    /** Fichiers envoyés avec le premier message (déposés sur l'accueil de l'organisation) */
    initialFiles?: File[];
}

const defaultData: Table1Row[] = [
    { id: '1', étape: 'Début du processus', typeBpmn: 'StartEvent', département: 'Front Office', acteur: 'Client', typeActeur: 'externe', condition: '', outputs: [{ targetId: '2', label: '' }], outil: '' },
    { id: '2', étape: 'Soumettre la demande', typeBpmn: 'Task', département: 'Front Office', acteur: 'Client', typeActeur: 'externe', condition: '', outputs: [{ targetId: '3', label: '' }], outil: 'Portail web' },
    { id: '3', étape: 'Vérifier le dossier', typeBpmn: 'Task', département: 'Back Office', acteur: 'Gestionnaire', typeActeur: 'interne', condition: '', outputs: [{ targetId: '4', label: '' }], outil: 'CRM' },
    { id: '4', étape: 'Dossier complet ?', typeBpmn: 'ExclusiveGateway', département: 'Back Office', acteur: 'Gestionnaire', typeActeur: 'interne', condition: 'Dossier complet ?', outputs: [{ targetId: '5', label: 'Oui' }, { targetId: '2', label: 'Non' }], outil: '' },
    { id: '5', étape: 'Valider la demande', typeBpmn: 'Task', département: 'Back Office', acteur: 'Gestionnaire', typeActeur: 'interne', condition: '', outputs: [{ targetId: '6', label: '' }], outil: 'CRM' },
    { id: '6', étape: 'Fin du processus', typeBpmn: 'EndEvent', département: 'Back Office', acteur: 'Gestionnaire', typeActeur: 'interne', condition: '', outputs: [], outil: '' },
];

const NO_ROWS: Table1Row[] = [];
const NO_ENRICHMENTS = new Map<string, TaskEnrichment>();
/** Tenus par le référentiel : jamais écrasés par une procédure rédigée qu'on y enregistre */
const PROTECTED_META = new Set(['nom', 'ref', 'title', 'category', 'status', 'lifecycle_stages', 'raci', 'remarks',
    'validation', 'circuit', 'created_from', 'cible', 'has_unsaved_changes', 'last_modified_at']);

export default function SttPanel({ workflowId, onBack, currentActorId, fromClinic, initialTool, chatFirst = false, guestMode = false, projectId, librarySave = true, initialMessage, initialDraft, initialFiles }: Props) {
    const autoSend = useMemo(() => (initialMessage?.trim() || initialFiles?.length
        ? { id: 1, text: initialMessage || '', files: initialFiles } : undefined), [initialMessage, initialFiles]);
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
    const [paletteOpen, setPaletteOpen] = useState(false);
    // Mise en page : vue de la procédure, assistant repliable et redimensionnable (mémorisés)
    const [view, setView] = useState<'table' | 'bpmn' | 'fiche'>('bpmn');
    const [hoveredStep, setHoveredStep] = useState<{ id: string; rect: DOMRect } | null>(null);
    const [chatOpen, setChatOpen] = useState(true);
    const [chatActivity, setChatActivity] = useState({ messages: 0, busy: false });
    // « Chat d'abord » : le panneau de procédure s'ouvre à droite dès qu'une procédure existe
    const [hasProcedure, setHasProcedure] = useState(false);
    const exportAllowed = !guestMode || GUEST_EXPORT_ENABLED;
    /** Le backend refuse l'enregistrement aux invités et aux comptes non membres : on ne le propose pas */
    const canSave = !guestMode && librarySave;
    const { access } = useAuth();
    const [versionsOpen, setVersionsOpen] = useState(false);
    // Conversation enregistrée en cours : une procédure enregistrée y est rattachée
    const conversationIdRef = useRef<string | null>(null);
    const linkConversation = (procedureId: string) => {
        const id = conversationIdRef.current;
        if (id) conversationsApi.update(id, { link_procedure_id: procedureId }).catch(() => { /* lien facultatif */ });
    };
    const [chatWidth, setChatWidth] = useState(400);
    /** Panneau de la procédure affiché : c'est l'utilisateur qui le masque ou l'affiche */
    const [procOpen, setProcOpen] = useState(true);
    /** Téléphone : une seule vue à la fois, choisie par l'utilisateur (jamais imposée) */
    const [mobileView, setMobileView] = useState<'chat' | 'proc'>('chat');
    const procPanelRef = useRef<HTMLDivElement>(null);
    const [procFullscreen, setProcFullscreen] = useState(false);
    useEffect(() => {
        const onFs = () => setProcFullscreen(document.fullscreenElement === procPanelRef.current && !!procPanelRef.current);
        document.addEventListener('fullscreenchange', onFs);
        return () => document.removeEventListener('fullscreenchange', onFs);
    }, []);
    const toggleProcFullscreen = () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void procPanelRef.current?.requestFullscreen?.();
    };
    const LAYOUT_KEY = 'processmate-studio-layout';
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
            if (typeof saved.chatOpen === 'boolean') setChatOpen(saved.chatOpen);
            if (typeof saved.paletteOpen === 'boolean') setPaletteOpen(saved.paletteOpen);
            if (typeof saved.chatWidth === 'number') setChatWidth(Math.min(960, Math.max(320, saved.chatWidth)));
            if (typeof saved.procOpen === 'boolean') setProcOpen(saved.procOpen);
        } catch { /* préférence facultative */ }
    }, []);
    // Enregistré au moment de l'action (un effet réécrirait les valeurs par défaut au montage)
    const saveLayout = (patch: { chatOpen?: boolean; chatWidth?: number; paletteOpen?: boolean; procOpen?: boolean }) => {
        try {
            const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
            localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ...saved, ...patch }));
        } catch { /* facultatif */ }
    };
    const toggleChat = (open: boolean) => {
        setChatOpen(open);
        // jamais les deux panneaux masqués : masquer le chat réaffiche la procédure
        if (!open) { setProcOpen(true); saveLayout({ chatOpen: false, procOpen: true }); } else saveLayout({ chatOpen: true });
    };
    const toggleProc = (open: boolean) => {
        setProcOpen(open);
        if (!open) { setChatOpen(true); saveLayout({ procOpen: false, chatOpen: true }); } else saveLayout({ procOpen: true });
    };
    const togglePalette = () => { setPaletteOpen(o => { saveLayout({ paletteOpen: !o }); return !o; }); };
    const startChatResize = (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX, startW = chatWidth;
        let width = startW;
        const onMove = (ev: MouseEvent) => { width = Math.min(960, Math.max(320, startW + ev.clientX - startX)); setChatWidth(width); };
        const onUp = () => {
            saveLayout({ chatWidth: width });
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = ''; document.body.style.userSelect = '';
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    };
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [dictation, setDictation] = useState<{ id: number; text: string }>();
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
                setInstances([{ process_id: proc.id, title, category: proc.category, data: workflow, enrichments: enrichMap, bpmnXml: xml, metadata: { ...DEFAULT_PROCESS_METADATA }, initialMeta: proc.metadata || { nom: title }, status: 'ready', workflow_db_id: proc.id }]);
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
    const chatFirstEmpty = chatFirst && !hasProcedure && instances.length === 0;
    /** Chat en pleine largeur : rien à afficher à côté, ou procédure masquée par l'utilisateur */
    const chatFull = chatFirstEmpty || !procOpen;
    const activeData = instances.length > 0 && activeInst ? activeInst.data : data;
    /** Ce que le chat voit comme « procédure en cours » : rien tant qu'aucune n'est affichée
     *  (l'exemple de départ, caché en mode chat d'abord, ne doit pas être pris pour une procédure à modifier) */
    const chatWorkflow = chatFirstEmpty ? NO_ROWS : activeData;

    /** Téléchargements de la procédure ouverte, réunis dans un seul menu */
    const downloadBlob = (content: string, type: string, ext: string) => {
        const name = (activeTitle || 'procedure').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'procedure';
        const url = URL.createObjectURL(new Blob([content], { type }));
        const a = document.createElement('a');
        a.href = url; a.download = `${name}.${ext}`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const downloadDiagram = async (kind: 'bpmn' | 'svg') => {
        const ed = activeEditor();
        const content = kind === 'bpmn' ? await ed?.saveXml() : await ed?.saveSvg();
        if (!content) { showError('Ouvrez la vue BPMN pour télécharger le logigramme.'); setView('bpmn'); return; }
        downloadBlob(content, kind === 'bpmn' ? 'application/xml' : 'image/svg+xml', kind);
    };
    const downloadTable = () => {
        const cols: [string, (r: Table1Row) => string][] = [
            ['N°', r => r.id], ['Étape', r => r.étape], ['Type', r => r.typeBpmn], ['Département', r => r.département || ''],
            ['Acteur', r => r.acteur || ''], ['Outil', r => r.outil || ''], ['Condition', r => r.condition || ''],
            ['Suite', r => (r.outputs || []).map(o => o.label ? `${o.targetId} (${o.label})` : o.targetId).join(', ')],
        ];
        const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const csv = [cols.map(c => esc(c[0])).join(';'), ...activeData.map(r => cols.map(c => esc(c[1](r))).join(';'))].join('\r\n');
        downloadBlob('\ufeff' + csv, 'text/csv;charset=utf-8', 'csv'); // BOM : accents corrects dans Excel
    };

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

    // « étape N » cliqué dans une réponse : vue Tableau, défilement et surbrillance temporaire
    const [focusedStepIds, setFocusedStepIds] = useState<Set<string>>(new Set());
    const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleFocusSteps = useCallback((ids: string[]) => {
        setView('table');
        setFocusedStepIds(new Set(ids));
        if (focusTimer.current) clearTimeout(focusTimer.current);
        focusTimer.current = setTimeout(() => setFocusedStepIds(new Set()), 5000);
        setTimeout(() => document.querySelector(`[data-step-id="${ids[0]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    }, []);
    const tableHighlightIds = useMemo(() => new Set([...recentAiChangedStepIds, ...focusedStepIds]), [recentAiChangedStepIds, focusedStepIds]);

    const addProcedureTab = () => {
        const newInst: ProcessInstance = {
            process_id: crypto.randomUUID(), title: 'Nouvelle procédure',
            data: defaultData, enrichments: new Map(), bpmnXml: null,
            metadata: { ...DEFAULT_PROCESS_METADATA }, initialMeta: undefined,
            status: 'ready',
        };
        setInstances(prev => [...prev, newInst]);
        setActiveTab(instances.length);
    };
    const activeEditor = () => (instances.length > 0 ? editorRefs.current[activeTab] : editorRef.current);
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


    // ── Procédures générées depuis la conversation : un onglet par procédure ──
    const handleProcedureStarted = useCallback((key: string, title: string) => {
        setPhase('editing'); setUploadOpen(false); setHasProcedure(true);
        setInstances(prev => {
            if (prev.some(i => i.process_id === key)) return prev;
            // Premier onglet de la conversation : il devient l'onglet actif
            if (prev.length === 0) setActiveTab(0);
            return [...prev, {
                process_id: key, title, data: [], enrichments: new Map(), bpmnXml: null,
                metadata: { ...DEFAULT_PROCESS_METADATA }, initialMeta: { nom: title }, status: 'generating',
            }];
        });
    }, []);

    // Aperçu : les étapes s'ajoutent pendant la génération, la version finale les remplace
    const handleProcedureRow = useCallback((key: string, row: Table1Row) => {
        setInstances(prev => prev.map(inst => inst.process_id === key && inst.status === 'generating' && !inst.data.some(r => r.id === row.id)
            ? { ...inst, data: [...inst.data, row] } : inst));
    }, []);

    const handleProcedureReady = useCallback((proc: GeneratedProcedure) => {
        const xml = generateBPMNSimple(proc.workflow, proc.title);
        setInstances(prev => prev.map(inst => inst.process_id === proc.key ? {
            ...inst, title: proc.title, data: proc.workflow, enrichments: proc.enrichments, bpmnXml: xml,
            initialMeta: Object.keys(proc.procedureMetadata).length > 0 ? proc.procedureMetadata : { nom: proc.title },
            status: 'ready',
        } : inst));
    }, []);

    const handleProcedureError = useCallback((key: string) => {
        setInstances(prev => prev.map(inst => inst.process_id === key && inst.status === 'generating' ? { ...inst, data: [], status: 'error' } : inst));
    }, []);

    const handleSelectProcedure = useCallback((key: string) => {
        const idx = instances.findIndex(i => i.process_id === key);
        if (idx >= 0) setActiveTab(idx);
    }, [instances]);

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

    const handleSave = useCallback(async (nom: string, category: string, taxonomyId?: string,
        target?: { procedureId: string; titre: string }) => {
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

            const targetId = target?.procedureId ?? inst?.workflow_db_id;
            if (targetId) {
                const enrichObj: Record<string, unknown> = {};
                saveEnrichments.forEach((v, k) => { enrichObj[k] = v; });
                // Une sauvegarde manuelle depuis le Studio efface le tampon "modifications
                // récentes de l'IA" — l'utilisateur a vu et repris la main sur la procédure.
                const exportEdits = exportEditsRef.current[activeTab] ?? {};
                const openPoints = readOpenPoints(inst?.initialMeta);
                // Première écriture dans une procédure choisie : on apporte les métadonnées rédigées
                // (objet, périmètre…), jamais son nom, sa référence ni ce que tient le référentiel
                const generated: Record<string, unknown> = {};
                if (target) {
                    for (const [k, v] of Object.entries((activeInitialMeta ?? {}) as Record<string, unknown>)) {
                        if (!PROTECTED_META.has(k)) generated[k] = v;
                    }
                }
                await orchestrationApi.saveWorkflowData(targetId, saveRows as unknown[], enrichObj, { ...generated, ...exportEdits, ...(openPoints.length ? { open_points: openPoints } : {}), recent_ai_changes: null }, currentXml);
                linkConversation(targetId);
                if (inst) setInstances(prev => prev.map((i, idx) => idx === activeTab ? {
                    ...i, ...(target ? { workflow_db_id: target.procedureId, title: target.titre } : {}),
                    initialMeta: { ...i.initialMeta, ...generated, ...exportEdits, recent_ai_changes: null },
                } : i));
                if (target) invalidate();
            } else {
                const res = await orchestrationApi.createProcedure({ nom, category, taxonomy_id: taxonomyId });
                const newId = res.procedure.id;
                const enrichObj: Record<string, unknown> = {};
                saveEnrichments.forEach((v, k) => { enrichObj[k] = v; });
                // Métadonnées générées (objet, périmètre, dates, annexes…) + saisies du formulaire d'export
                const fullMeta = { ...(activeInitialMeta ?? {}), ...(exportEditsRef.current[activeTab] ?? {}), nom, category };
                await orchestrationApi.saveWorkflowData(newId, saveRows as unknown[], enrichObj, fullMeta, currentXml);
                linkConversation(newId);
                if (inst) setInstances(prev => prev.map((i, idx) => idx === activeTab ? { ...i, workflow_db_id: newId, title: nom } : i));
                invalidate();
            }
            showSuccess('Procédure enregistrée');
        } catch (err: any) { showError(`Erreur : ${err.message}`); throw err; }
        finally { setSaving(false); }
    }, [activeInst, activeTab, instances, data, enrichments, invalidate, runParser, applySyncResult, activeInitialMeta]);

    /** Fenêtre « Enregistrer » : procédure à mettre à jour, emplacement de campagne, ou nouvelle procédure */
    const handleSaveChoice = useCallback(async (choice: SaveChoice) => {
        if (choice.kind === 'procedure') {
            await handleSave(choice.titre, '', undefined, { procedureId: choice.procedureId, titre: choice.titre });
            return;
        }
        if (choice.kind === 'slot') {
            const r = await saveTargetsApi.attachSlot(choice.slotId);
            await handleSave(r.titre || choice.titre, '', undefined, { procedureId: r.procedure_id, titre: r.titre || choice.titre });
            return;
        }
        const enrich: Record<string, unknown> = {};
        (activeInst?.enrichments ?? enrichments).forEach((v, k) => { enrich[k] = v; });
        const r = await saveTargetsApi.create({
            titre: choice.titre, taxonomy_id: choice.taxonomyId, campaign_id: choice.campaignId, message: choice.message,
            workflow_json: activeData as unknown[], enrichments_json: enrich,
            metadata: (activeInst?.metadata || {}) as unknown as Record<string, unknown>,
        });
        if (r.resultat === 'creee' && r.procedure_id) {
            await handleSave(choice.titre, '', undefined, { procedureId: r.procedure_id, titre: choice.titre });
        } else {
            showSuccess('Proposition envoyée au pilote');
        }
    }, [handleSave, activeInst, enrichments, activeData]);

    /** Le chat a remplacé ou retiré des procédures (archived = true), ou l'utilisateur les rétablit (false) */
    const archiveProcedures = useCallback((keys: string[], archived: boolean) => {
        setInstances(prev => {
            const next = prev.map(i => (keys.includes(i.process_id) ? { ...i, archived } : i));
            setActiveTab(tab => {
                if (next[tab] && !next[tab].archived) return tab;
                const last = next.map(i => !i.archived).lastIndexOf(true);
                return last >= 0 ? last : tab;
            });
            return next;
        });
    }, []);
    const activeCount = instances.filter(i => !i.archived).length;

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

    // ── Plusieurs procédures dans une conversation : une nouvelle s'ajoute, sans écraser l'autre ──
    /** Procédure en cours de rédaction (aperçu d'une nouvelle procédure) */
    const draftKeyRef = useRef<string | null>(null);
    /** Dernière liste des procédures (les réponses du chat arrivent après l'envoi : pas de valeur figée) */
    const instancesRef = useRef(instances);
    instancesRef.current = instances;
    /** Indice de la procédure visée par le message (sinon celle affichée) */
    const targetIndex = (procedureKey?: string) => {
        const idx = procedureKey ? instancesRef.current.findIndex(i => i.process_id === procedureKey) : -1;
        return idx >= 0 ? idx : activeTab;
    };
    /** Procédures envoyées au chat pour qu'il comprenne de laquelle on parle (au moins deux) */
    const conversationProcedures = useMemo<StoredProcedure[] | undefined>(() => {
        // toutes les procédures actives (une seule suffit : on peut demander de la découper)
        const ready = instances.filter(i => i.status === 'ready' && i.data.length > 0 && !i.archived);
        if (ready.length < 1) return undefined;
        return ready.map(i => ({
            key: i.process_id, title: i.title, workflow: i.data,
            enrichments: Object.fromEntries(i.enrichments), procedureMetadata: i.initialMeta ?? null,
        }));
    }, [instances]);
    /** Une vraie procédure est affichée (pas l'exemple ni l'état vide) */
    const hasRealProcedure = instances.length > 0
        ? instances.some(i => i.data.length > 0 && i.status !== 'generating')
        : hasProcedure && data.length > 0;
    /** Ajoute une procédure et l'affiche ; celle affichée seule devient la première de la liste */
    const appendInstance = useCallback((inst: ProcessInstance) => {
        const base: ProcessInstance[] = instances.length > 0 ? instances : [{
            process_id: singleKeyRef.current, title: processTitle || 'Procédure', data, enrichments, bpmnXml,
            metadata: processMetadata, initialMeta: initialMeta ?? { nom: processTitle }, status: 'ready',
        }];
        setInstances([...base, inst]);
        setActiveTab(base.length);
    }, [instances, processTitle, data, enrichments, bpmnXml, processMetadata, initialMeta]);

    const handleWorkflowFromChat = useCallback((
        workflow: Table1Row[], title: string,
        newEnrichments: Map<string, TaskEnrichment>, procedureMetadata?: any,
        options?: { isNew?: boolean; procedureKey?: string },
    ) => {
        const draftKey = draftKeyRef.current;
        draftKeyRef.current = null;
        if (draftKey || (options?.isNew && hasRealProcedure)) {
            const name = title || 'Nouvelle procédure';
            const inst: ProcessInstance = {
                process_id: draftKey ?? crypto.randomUUID(), title: name, data: workflow, enrichments: newEnrichments,
                bpmnXml: safeGenerateBpmn(workflow, name), metadata: { ...DEFAULT_PROCESS_METADATA },
                initialMeta: procedureMetadata && Object.keys(procedureMetadata).length > 0 ? procedureMetadata : { nom: name },
                status: 'ready',
            };
            if (draftKey) setInstances(prev => prev.map(i => i.process_id === draftKey ? inst : i));
            else appendInstance(inst);
            return;
        }
        setHasProcedure(true);
        if (instances.length > 0) {
            // la procédure visée par le message (que le chat a affichée), sinon celle affichée
            const idx = targetIndex(options?.procedureKey);
            const tInst = instancesRef.current[idx] ?? activeInst;
            const newTitle = title || tInst?.title || '';
            // Libellés seulement : le diagramme existant est modifié sur place (positions conservées)
            const diff = tInst ? diffWorkflows(tInst.data, workflow) : null;
            const patched = BPMN_PRESERVE_LAYOUT && diff && tInst?.bpmnXml && isLabelOnly(diff) && (!title || title === tInst.title)
                ? applyLabelChanges(tInst.bpmnXml, diff) : null;
            const xml = patched ?? safeGenerateBpmn(workflow, newTitle);
            if (BPMN_PRESERVE_LAYOUT && !patched && diff && !isEmptyDiff(diff) && tInst?.bpmnXml) {
                showSuccess('Diagramme recalculé : sa mise en page manuelle a été réinitialisée.');
            }
            setInstances(prev => prev.map((inst, i) => i === idx ? {
                ...inst, data: workflow, title: title || inst.title,
                enrichments: mergeEnrichments(inst.enrichments, newEnrichments), bpmnXml: xml,
                initialMeta: mergeProcedureMetadata(inst.initialMeta, procedureMetadata),
            } : inst));
            setActiveTab(idx);
            if (xml) editorRefs.current[idx]?.importXml(xml);
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
    }, [activeTab, instances, activeInst, processTitle, safeGenerateBpmn, hasRealProcedure, appendInstance]);

    // Procédure décrite en texte : les étapes arrivent une à une (aperçu), la réponse finale les remplace
    const handleWorkflowPreview = useCallback((rows: Table1Row[], options?: { isNew?: boolean; procedureKey?: string }) => {
        const draftKey = draftKeyRef.current;
        if (rows.length === 0 && draftKey) {
            // nouvelle procédure abandonnée : on la retire, l'autre reste telle quelle
            draftKeyRef.current = null;
            const idx = instances.findIndex(i => i.process_id === draftKey);
            setInstances(prev => prev.filter(i => i.process_id !== draftKey));
            if (idx >= 0) setActiveTab(t => Math.max(0, t >= idx ? t - 1 : t));
            return;
        }
        if (rows.length > 0 && (draftKey || (options?.isNew && hasRealProcedure))) {
            if (draftKey) {
                setInstances(prev => prev.map(i => i.process_id === draftKey ? { ...i, data: rows } : i));
            } else {
                const key = crypto.randomUUID();
                draftKeyRef.current = key;
                const name = 'Procédure en cours de rédaction';
                appendInstance({
                    process_id: key, title: name, data: rows, enrichments: new Map(), bpmnXml: null,
                    metadata: { ...DEFAULT_PROCESS_METADATA }, initialMeta: { nom: name }, status: 'generating',
                });
            }
            return;
        }
        if (rows.length === 0) {
            // aperçu abandonné alors qu'aucune procédure n'était affichée : on revient à l'état vide
            if (instances.length === 0) {
                setData(defaultData); setBpmnXml(null);
                if (chatFirst) setHasProcedure(false);
            }
            return;
        }
        setHasProcedure(true);
        const idx = targetIndex(options?.procedureKey);
        const title = (instances.length > 0 ? instancesRef.current[idx]?.title : processTitle) || 'Procédure en cours de rédaction';
        const xml = safeGenerateBpmn(rows, title);
        if (instances.length > 0) {
            setInstances(prev => prev.map((inst, i) => i === idx ? { ...inst, data: rows, bpmnXml: xml } : inst));
            if (xml) editorRefs.current[idx]?.importXml(xml);
        } else {
            setData(rows);
            setBpmnXml(xml);
            if (xml) editorRef.current?.importXml(xml);
        }
    }, [instances, activeInst, activeTab, processTitle, safeGenerateBpmn, chatFirst, hasRealProcedure, appendInstance]);

    // ── Procédures gardées avec la conversation : rouvertes telles que laissées ──
    /** Conversation à laquelle appartiennent les procédures affichées (rien n'est enregistré ailleurs) */
    const [proceduresOwner, setProceduresOwner] = useState<string | null>(null);
    const singleKeyRef = useRef<string>(crypto.randomUUID());
    const restoreProcedures = useCallback((procs: StoredProcedure[], active: string | null) => {
        const list: ProcessInstance[] = procs.map(p => ({
            process_id: p.key, title: p.title || 'Procédure', data: (p.workflow || []) as Table1Row[],
            enrichments: new Map(Object.entries(p.enrichments || {})) as Map<string, TaskEnrichment>,
            bpmnXml: p.bpmnXml || safeGenerateBpmn((p.workflow || []) as Table1Row[], p.title || 'Procédure'),
            metadata: { ...DEFAULT_PROCESS_METADATA }, initialMeta: p.procedureMetadata || { nom: p.title },
            status: 'ready', workflow_db_id: p.workflow_db_id || undefined, archived: !!p.archived,
        }));
        draftKeyRef.current = null;
        setInstances(list);
        const idx = list.findIndex(i => i.process_id === active && !i.archived);
        const lastActive = list.map(i => !i.archived).lastIndexOf(true);
        setActiveTab(idx >= 0 ? idx : Math.max(0, lastActive));
        setHasProcedure(true); setPhase('editing'); setUploadOpen(false);
        setProceduresOwner(conversationIdRef.current);
    }, [safeGenerateBpmn]);
    // Enregistrement (silencieux, 1,5 s après la dernière modification)
    useEffect(() => {
        if (guestMode || workflowId || !CONVERSATIONS_ENABLED) return;
        const id = conversationIdRef.current;
        if (!id || id !== proceduresOwner) return;
        const toStored = (key: string, title: string, rows: Table1Row[], enr: Map<string, TaskEnrichment>, meta: Record<string, unknown> | null | undefined, xml: string | null, dbId?: string, archived?: boolean): StoredProcedure => ({
            key, title, workflow: rows, enrichments: Object.fromEntries(enr), procedureMetadata: meta ?? null, bpmnXml: xml, workflow_db_id: dbId ?? null,
            ...(archived ? { archived: true } : {}),
        });
        const list = instances.length > 0
            ? instances.filter(i => i.status === 'ready' && i.data.length > 0)
                .map(i => toStored(i.process_id, i.title, i.data, i.enrichments, i.initialMeta, i.bpmnXml, i.workflow_db_id, i.archived))
            : hasProcedure && data.length > 0
                ? [toStored(singleKeyRef.current, processTitle, data, enrichments, initialMeta, bpmnXml)]
                : [];
        if (list.length === 0) return;
        const active = instances.length > 0 ? instances[activeTab]?.process_id ?? null : singleKeyRef.current;
        const t = setTimeout(() => { conversationsApi.saveProcedures(id, list, active).catch(() => { /* gardé à l'écran ; nouvel essai à la prochaine modification */ }); }, 1500);
        return () => clearTimeout(t);
    }, [guestMode, workflowId, proceduresOwner, instances, activeTab, hasProcedure, data, processTitle, enrichments, initialMeta, bpmnXml]);

    // ── Lot 5 : points de restauration du chat ──
    const takeSnapshot = useCallback((procedureKey?: string) => {
        // procédure visée par le message : son état d'avant, même si elle n'était pas affichée
        const target = procedureKey ? instancesRef.current.find(i => i.process_id === procedureKey) : undefined;
        if (target) return {
            processId: target.process_id as string | null | undefined,
            data: target.data, enrichments: new Map(target.enrichments), initialMeta: target.initialMeta, bpmnXml: target.bpmnXml,
        };
        return {
            processId: instances.length > 0 ? activeInst?.process_id : null,
            data: activeData, enrichments: new Map(activeEnrichments), initialMeta: activeInitialMeta, bpmnXml: activeBpmnXml,
        };
    }, [instances, activeInst, activeData, activeEnrichments, activeInitialMeta, activeBpmnXml]);

    const restoreSnapshot = useCallback((raw: unknown) => {
        const snap = raw as ReturnType<typeof takeSnapshot>;
        if (snap.processId) {
            const idx = instances.findIndex(i => i.process_id === snap.processId);
            if (idx < 0) { showError('Procédure introuvable : onglet fermé ?'); return; }
            setInstances(prev => prev.map((inst, i) => i === idx ? { ...inst, data: snap.data, enrichments: snap.enrichments, initialMeta: snap.initialMeta, bpmnXml: snap.bpmnXml } : inst));
            setActiveTab(idx);
            if (snap.bpmnXml) editorRefs.current[idx]?.importXml(snap.bpmnXml);
        } else {
            setData(snap.data); setEnrichments(snap.enrichments); setInitialMeta(snap.initialMeta); setBpmnXml(snap.bpmnXml);
            if (snap.bpmnXml) editorRef.current?.importXml(snap.bpmnXml);
        }
    }, [instances]);

    // ── Lot 5 : points ouverts (rangés dans les métadonnées de la procédure) ──
    const setPointsFor = useCallback((processId: string | null, points: OpenPoint[]) => {
        if (processId) setInstances(prev => prev.map(inst => inst.process_id === processId ? { ...inst, initialMeta: { ...(inst.initialMeta || {}), open_points: points } } : inst));
        else setInitialMeta((prev: Record<string, unknown> | undefined) => ({ ...(prev || {}), open_points: points }));
    }, []);
    const activePoints = readOpenPoints(activeInitialMeta);
    const answerPoint = (point: OpenPoint, answer: string) => {
        const step = activeData.find(r => r.id === point.step_id);
        setChatOpen(true);
        setDictation({ id: Date.now(), text: `Réponse au point ouvert « ${point.question} »${step ? ` (étape « ${step.étape} »)` : ''} : ${answer}. Mets la procédure à jour en conséquence.` });
    };

    const handleVersionRestored = (v: VersionDetail) => {
        const enrichMap = new Map<string, TaskEnrichment>(Object.entries(v.enrichments_json || {}) as [string, TaskEnrichment][]);
        const xml = v.bpmn_xml || safeGenerateBpmn(v.workflow_json || [], activeTitle);
        setInstances(prev => prev.map((inst, i) => i === activeTab ? { ...inst, data: v.workflow_json || [], enrichments: enrichMap, bpmnXml: xml, initialMeta: { ...(inst.initialMeta || {}), ...(v.metadata || {}) } } : inst));
        if (xml) editorRefs.current[activeTab]?.importXml(xml);
        showSuccess(`Version ${v.version} restaurée`);
    };

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
                        // Dictée : le texte va dans le composeur (plus d'écrasement direct du tableau)
                        const res = await fetch(API_CONFIG.getFullUrl(API_CONFIG.endpoints.dictate), { method: 'POST', body: fd });
                        const result = await res.json();
                        if (!res.ok) throw new Error(result.detail || 'Erreur transcription');
                        if (result?.transcription) setDictation({ id: Date.now(), text: result.transcription });
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

                {!chatFull && (
                    <div role="tablist" aria-label="Vue" className="lg:hidden shrink-0 flex gap-1 border-b border-neutral-200 bg-white p-1.5">
                        {([['chat', 'Conversation'], ['proc', 'Procédure']] as const).map(([id, label]) => (
                            <button key={id} type="button" role="tab" aria-selected={mobileView === id} onClick={() => setMobileView(id)}
                                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${mobileView === id ? 'bg-neutral-900 text-white' : 'text-neutral-900 hover:bg-neutral-100'}`}>
                                {label}
                                {id === 'chat' && mobileView !== 'chat' && chatActivity.busy && <span aria-label="Réponse en cours" className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
                                {id === 'proc' && activeData.length > 0 && <span className={`rounded-full px-1.5 text-[11px] ${mobileView === id ? 'bg-white/20' : 'bg-neutral-100'}`}>{activeData.length}</span>}
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
                {/* Conversation : pleine hauteur, composeur en bas */}
                {/* Toujours monté : masquer l'assistant ne doit pas effacer la conversation */}
                <aside aria-label="Conversation" hidden={!chatOpen && !chatFull} style={{ ['--chat-w' as string]: `${chatWidth}px` } as React.CSSProperties}
                    className={chatFull
                        ? 'relative flex-1 min-h-0 min-w-0 bg-white'
                        : `relative flex-1 lg:flex-none lg:shrink-0 lg:w-[var(--chat-w)] min-h-0 lg:border-r border-neutral-200 bg-white ${mobileView === 'proc' ? 'hidden lg:block' : ''}`}>
                    {!chatFirstEmpty && !procOpen && (
                        <button type="button" onClick={() => toggleProc(true)} title="Afficher la procédure"
                            className="absolute right-4 top-14 z-20 flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-900 shadow-sm hover:bg-neutral-100">
                            <PanelRightOpen className="w-4 h-4" /> Procédure
                        </button>
                    )}
                    <div className={chatFull ? 'h-full mx-auto w-full max-w-3xl' : 'h-full'}>
                    <ChatInterface
                        inputContextVisible={codeSourceOpen}
                        inputContext={inputContext}
                        onOpenCode={() => setCodeSourceOpen(true)}
                        recording={recording} processing={processing}
                        onToggleRecording={toggleRecording} onCancelRecording={cancelRecording}
                        insertText={dictation ?? (initialDraft?.trim() ? { id: -1, text: initialDraft } : undefined)}
                        autoSendText={autoSend}
                        onNewConversation={() => { setUploadOpen(false); setCodeSourceOpen(false); }}
                        onProcessingLevelChange={setProcessingLevel}
                        processingLevel={processingLevel}
                        currentWorkflow={chatWorkflow}
                        currentEnrichments={chatFirstEmpty ? NO_ENRICHMENTS : activeEnrichments}
                        currentProcedureMetadata={activeInitialMeta}
                        onWorkflowGenerated={handleWorkflowFromChat}
                        onError={showError} onSuccess={showSuccess}
                        onProcedureStarted={handleProcedureStarted}
                        onProcedureRow={handleProcedureRow}
                        onWorkflowPreview={handleWorkflowPreview}
                        onProcedureReady={handleProcedureReady}
                        onProcedureError={handleProcedureError}
                        onSelectProcedure={handleSelectProcedure}
                        variant="sidebar"
                        onFilesSent={files => setSourceFiles(prev => [...prev, ...files].slice(-20))}
                        onFocusSteps={handleFocusSteps}
                        onOpenProcedure={title => {
                            const idx = instances.findIndex(i => i.title === title);
                            if (idx >= 0) setActiveTab(idx);
                            if (!procOpen) toggleProc(true);
                            setMobileView('proc');
                        }}
                        onCollapse={() => toggleChat(false)}
                        onActivity={setChatActivity}
                        procedureId={workflowId}
                        restoreGenerated={!workflowId}
                        syncUrl
                        onConversationChange={id => {
                            // conversation créée par le premier message : les procédures affichées sont les siennes
                            if (id && !conversationIdRef.current) setProceduresOwner(id);
                            conversationIdRef.current = id;
                        }}
                        onRestoreProcedures={restoreProcedures}
                        onArchiveProcedures={archiveProcedures}
                        /* page d'accueil : « Nouvelle conversation » est déjà dans la barre latérale */
                        showNewConversation={!chatFirst}
                        conversationProcedures={conversationProcedures}
                        activeProcedureKey={instances.length > 0 ? activeInst?.process_id ?? null : null}
                        onTargetProcedure={key => {
                            const idx = instancesRef.current.findIndex(i => i.process_id === key);
                            if (idx >= 0) setActiveTab(idx);
                        }}
                        projectId={projectId}
                        guestPersistence={guestMode}
                        onCheckpoint={takeSnapshot}
                        onRestore={restoreSnapshot}
                        onOpenPoints={(key, points) => setPointsFor(key, points as OpenPoint[])}
                        onAgentOpenPoint={point => setPointsFor(instances.length > 0 ? activeInst?.process_id ?? null : null, [...activePoints, point as unknown as OpenPoint])}
                        onAgentAnswerPoint={(id, answer) => setPointsFor(instances.length > 0 ? activeInst?.process_id ?? null : null,
                            activePoints.map(p => p.id === id ? { ...p, statut: 'repondu', reponse: answer } : p))}
                    />
                    </div>
                    <div role="separator" aria-orientation="vertical" aria-label="Redimensionner l’assistant" title="Glisser pour redimensionner"
                        onMouseDown={startChatResize}
                        className={chatFull ? 'hidden' : 'hidden lg:block absolute top-0 -right-1 h-full w-2 cursor-col-resize z-10 hover:bg-neutral-900/20'} />
                </aside>
                {/* Procédure : en-tête (onglets + vues + actions) puis la vue choisie en pleine hauteur */}
                <div ref={procPanelRef} hidden={chatFull} className={`flex-1 min-w-0 min-h-0 flex flex-col bg-slate-50 ${mobileView === 'chat' ? 'hidden lg:flex' : ''}`}>
                    {guestMode && (
                        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex flex-wrap items-center gap-x-2">
                            <span>Mode invité : rien n&apos;est enregistré.</span>
                            <a href="/auth/signup/" className="font-semibold underline">Créez un compte</a>
                            <span>pour conserver ce travail.</span>
                        </div>
                    )}
                    {!guestMode && !librarySave && (
                        <div className="shrink-0 bg-slate-100 border-b border-slate-200 px-4 py-2 text-xs text-slate-600">
                            Votre travail est conservé dans cette conversation. L&apos;enregistrement dans le référentiel de
                            l&apos;organisation demande un accès membre, donné par un administrateur.
                        </div>
                    )}
                    {canSave && activeInst?.workflow_db_id && (
                        <CircuitBar procedureId={activeInst.workflow_db_id}
                            onSave={async () => { await handleSave(activeInst.title, '', undefined); }} />
                    )}
                    <div className="shrink-0 bg-white border-b border-neutral-200 px-4 pt-2.5">
                        {/* Procédure : nom (une seule fois), étapes et catégorie dessous, enregistrement */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
                            {chatOpen && !procFullscreen && (
                                <button type="button" onClick={() => toggleChat(false)} title="Masquer la conversation" aria-label="Masquer la conversation"
                                    className="hidden lg:inline-flex shrink-0 p-1.5 rounded-lg text-neutral-900 hover:bg-neutral-100">
                                    <PanelLeftClose className="w-4 h-4" />
                                </button>
                            )}
                            {!chatOpen && !procFullscreen && (
                                <button type="button" onClick={() => toggleChat(true)}
                                    title={chatActivity.busy ? 'Afficher la conversation (réponse en cours)' : 'Afficher la conversation'}
                                    aria-label="Afficher la conversation"
                                    className="shrink-0 flex items-center gap-1.5 rounded-lg p-1.5 text-neutral-900 hover:bg-neutral-100">
                                    <PanelLeftOpen className="w-4 h-4" />
                                    {chatActivity.busy
                                        ? <span aria-label="Réponse en cours" className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                        : chatActivity.messages > 0 && <span className="min-w-[18px] rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">{chatActivity.messages}</span>}
                                </button>
                            )}
                            {onBack && (
                                <button type="button" onClick={onBack} title="Retour" aria-label="Retour"
                                    className="shrink-0 p-1.5 rounded-lg text-neutral-900 hover:bg-neutral-100">
                                    <ArrowLeft className="w-4 h-4" />
                                </button>
                            )}
                            {/* le titre garde sa place : ce sont les actions qui passent à la ligne */}
                            <div className="min-w-[12rem] flex-1">
                                {activeCount > 1 ? (
                                    /* plusieurs procédures dans la conversation : on en change depuis le titre */
                                    <RowMenu label="Changer de procédure" align="left" className="min-w-0 max-w-full"
                                        triggerClassName="-mx-1.5 flex max-w-full items-center gap-1 rounded-lg px-1.5 text-neutral-900 hover:bg-neutral-100"
                                        trigger={<>
                                            <span className="text-base font-semibold truncate" title={activeTitle || 'Nouvelle procédure'}>{activeTitle || 'Nouvelle procédure'}</span>
                                            <ChevronDown className="w-4 h-4 shrink-0" />
                                        </>}
                                        items={instances.map((inst, i) => ({ inst, i })).filter(({ inst }) => !inst.archived).map(({ inst, i }) => ({
                                            label: `${inst.title}${i === activeTab ? '  ✓' : ''}`,
                                            icon: <span className={`inline-block !w-2 !h-2 rounded-full ${inst.status === 'generating' ? 'bg-amber-400 animate-pulse' : inst.status === 'error' ? 'bg-red-500' : 'bg-neutral-900'}`} />,
                                            onSelect: () => setActiveTab(i),
                                        }))} />
                                ) : (
                                    <h1 className="text-base font-semibold text-neutral-900 truncate" title={activeTitle || 'Nouvelle procédure'}>
                                        {activeTitle || 'Nouvelle procédure'}
                                    </h1>
                                )}
                                <p className="text-xs text-neutral-500 truncate">
                                    {activeData.length} étape{activeData.length > 1 ? 's' : ''}{activeInst?.category ? ` · ${activeInst.category}` : ''}{activeCount > 1 ? ` · ${activeCount} procédures dans la conversation` : ''}
                                </p>
                            </div>
                            <div className="ml-auto flex flex-wrap items-center gap-2">
                                {canSave && <button type="button" onClick={() => {
                                    const inst = instances.length > 0 ? activeInst : null;
                                    if (inst?.workflow_db_id) handleSave(inst.title, '', undefined);
                                    else setSaveModalOpen(true);
                                }} disabled={saving || viewMode === 'outillage' || activeData.length === 0}
                                    title={viewMode === 'outillage' ? 'Repassez en vue métier pour enregistrer' : undefined}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-medium hover:bg-neutral-700 disabled:opacity-50 transition-colors">
                                    <Save className="w-3.5 h-3.5" />{saving ? 'Enregistrement…' : 'Enregistrer'}
                                </button>}
                                {activeInst?.workflow_db_id && currentActorId && (
                                    <button type="button" onClick={() => setSubmitModalOpen(true)} disabled={submitting}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                                        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                        Soumettre
                                    </button>
                                )}
                                {exportAllowed && activeData.length > 0 && (
                                    <RowMenu label="Télécharger la procédure" align="right"
                                        triggerClassName="p-1.5 rounded-lg text-neutral-900 hover:bg-neutral-100"
                                        trigger={<Download className="w-4 h-4" />}
                                        items={[
                                            { label: 'Logigramme BPMN (.bpmn)', icon: <Workflow />, onSelect: () => void downloadDiagram('bpmn') },
                                            { label: 'Image du logigramme (.svg)', icon: <Workflow />, onSelect: () => void downloadDiagram('svg') },
                                            { label: 'Tableau (.csv, Excel)', icon: <Table2 />, onSelect: downloadTable },
                                            { label: 'Fiche Word (.docx)…', icon: <FileText />, onSelect: () => setView('fiche'), separatorBefore: true },
                                        ]} />
                                )}
                                {(() => {
                                    const more = [
                                        ...(VERSIONS_ENABLED && canSave && activeInst?.workflow_db_id
                                            ? [{ label: 'Historique des versions', icon: <History />, onSelect: () => setVersionsOpen(true) }] : []),
                                    ];
                                    return more.length > 0 && <RowMenu label="Autres actions" align="right" triggerClassName="p-1.5 rounded-lg text-neutral-900 hover:bg-neutral-100" items={more} />;
                                })()}
                                <button type="button" onClick={toggleProcFullscreen}
                                    title={procFullscreen ? 'Quitter le plein écran (Échap)' : 'Plein écran (tableau, logigramme, fiche)'}
                                    aria-label={procFullscreen ? 'Quitter le plein écran' : 'Afficher la procédure en plein écran'}
                                    className="p-1.5 rounded-lg text-neutral-900 hover:bg-neutral-100">
                                    {procFullscreen ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
                                </button>
                                {!procFullscreen && (
                                    <button type="button" onClick={() => toggleProc(false)} title="Masquer la procédure (le chat prend toute la largeur)"
                                        aria-label="Masquer la procédure" className="hidden lg:inline-flex p-1.5 rounded-lg text-neutral-900 hover:bg-neutral-100">
                                        <PanelRightClose className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                        {/* Vues et actions */}
                        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-2">
                            <div role="tablist" aria-label="Vue de la procédure" className="flex gap-1">
                                {([
                                    { id: 'table' as const, label: 'Tableau', icon: Table2 },
                                    { id: 'bpmn' as const, label: 'BPMN', icon: Workflow },
                                    { id: 'fiche' as const, label: 'Fiche & export', icon: FileText },
                                ]).filter(v => exportAllowed || v.id !== 'fiche').map(v => (
                                    <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}
                                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${view === v.id ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-600 hover:text-neutral-900'}`}>
                                        <v.icon className="w-3.5 h-3.5" />{v.label}
                                    </button>
                                ))}
                            </div>
                            <div className="pb-1.5">
                                <SttToolbar
                                    bare
                                    dataLength={activeData.length}
                                    bpmnXml={activeBpmnXml ?? ''}
                                    isEditingBpmn={!!activeBpmnXml}
                                    revisionOpen={revisionOpen}
                                    revisionCount={revisionCount}
                                    showGenerate={!(view === 'bpmn' && activeBpmnXml)}
                                    onGenerateBPMN={async () => { await handleGenerateBPMN(); setView('bpmn'); }}
                                    onDownloadBPMN={exportAllowed ? handleDownloadBPMN : () => showError('Export réservé aux comptes : créez un compte gratuit pour télécharger.')}
                                    onResetToDefault={() => { setInstances([]); setData(defaultData); setBpmnXml(null); setPhase('upload'); resetCodeSource(); }}
                                    onClearTable={() => { if (instances.length > 0) updateActiveData([]); else setData([]); }}
                                    onToggleRevision={() => setRevisionOpen(o => !o)}
                                    onNewProcedure={addProcedureTab}
                                    extraControls={view === 'bpmn' && activeBpmnXml ? (
                                        <>
                                            {viewMode === 'outillage' && (
                                                <button type="button" onClick={toggleViewMode} title="Revenir à la vue métier"
                                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-700">
                                                    <Wrench className="w-3.5 h-3.5" />Vue IT active
                                                </button>
                                            )}
                                            <button type="button" onClick={togglePalette} aria-pressed={paletteOpen}
                                                title={paletteOpen ? 'Masquer les outils de dessin' : 'Afficher les outils de dessin'}
                                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${paletteOpen ? 'bg-neutral-100 text-neutral-900 border-neutral-900' : 'bg-white text-neutral-900 border-neutral-300 hover:bg-neutral-100'}`}>
                                                <Shapes className="w-4 h-4" />Outils
                                            </button>
                                        </>
                                    ) : undefined}
                                    extraMenu={view === 'bpmn' && activeBpmnXml ? (
                                        <>
                                            <DiagramMenuAction icon={<RotateCw className="w-4 h-4" />} label="Mettre à jour le tableau depuis le diagramme"
                                                disabled={viewMode === 'outillage'} onClick={handleSyncClick} />
                                            <DiagramMenuAction icon={<Wrench className="w-4 h-4" />} label={viewMode === 'outillage' ? 'Revenir à la vue métier' : 'Vue IT (applicatifs)'} onClick={toggleViewMode} />
                                        </>
                                    ) : undefined}
                                />
                            </div>
                        </div>
                    </div>

                    {error && <div className="fixed top-16 right-6 z-50 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2 text-sm shadow-lg"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span></div>}
                    {success && <div className="fixed top-16 right-6 z-50 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-2 text-sm shadow-lg"><CheckCircle className="w-4 h-4 flex-shrink-0" /><span>{success}</span></div>}

                    <div className={`flex-1 min-h-0 p-3 ${view === 'bpmn' ? 'flex flex-col gap-3 overflow-hidden' : 'overflow-auto space-y-3'}`}>
                        {loadingWorkflow && (
                            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg flex items-center gap-2 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />Chargement…
                            </div>
                        )}

                        {/* Flowchart Results (depuis code source) */}
                        {codeSourceOpen && codeStep === 'completed' && codeParsedData && codeFlowchartUrl && (
                            <div className="clinic-page shrink-0" style={{ minHeight: 'auto', background: 'transparent' }}>
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
                            <div className="space-y-2 shrink-0">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <button type="button" onClick={() => { setPhase('upload'); setUploadOpen(true); }} className="text-xs text-blue-600">Retour aux documents</button>
                                    <ProcessingLevelSelector value={processingLevel} onChange={setProcessingLevel} />
                                </div>
                                <ProcessDiscoveryPanel processingLevel={processingLevel} sessionId={sessionId} cards={cards} onCardsUpdated={setCards} onGenerate={handleGenerate} generating={generating} />
                            </div>
                        )}
                        {revisionOpen && phase === 'editing' && (
                            <div className="shrink-0">
                                <RevisionPanel
                                    processingLevel={processingLevel}
                                    workflow={activeData}
                                    onWorkflowChange={instances.length > 0 ? updateActiveData : (d) => { setData(d); setRevisionCount(c => c + 1); }}
                                    onSuccess={showSuccess} onError={showError}
                                />
                            </div>
                        )}

                        {activeInst?.status === 'generating' && activeInst.data.length > 0 ? (
                            <>
                                <LiveHeader title={activeInst.title} count={activeInst.data.length} />
                                {view === 'bpmn' ? <LiveBpmn rows={activeInst.data} title={activeInst.title} /> : <LiveTable rows={activeInst.data} />}
                            </>
                        ) : activeInst?.status === 'generating' ? (
                            <div className="bg-white border border-slate-200 rounded-xl p-8 flex items-center justify-center gap-3 text-slate-400">
                                <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                                <span className="text-sm">Génération de "{activeInst.title}"…</span>
                            </div>
                        ) : view === 'table' ? (
                            <>
                                <Table
                                    data={activeData} enrichments={activeEnrichments}
                                    processTitle={activeTitle} hideTitle
                                    onDataChange={instances.length > 0 ? updateActiveData : setData}
                                    onEnrichmentsChange={instances.length > 0 ? updateActiveEnrichments : setEnrichments}
                                    onShowSuccess={showSuccess}
                                    highlightedRowIds={tableHighlightIds}
                                />
                                {OPEN_POINTS_UI_ENABLED && activeData.length > 0 && (
                                    <OpenPointsPanel title={activeTitle} points={activePoints} rows={activeData}
                                        onChange={pts => setPointsFor(instances.length > 0 ? activeInst?.process_id ?? null : null, pts)}
                                        onFocusStep={id => handleFocusSteps([id])}
                                        onAnswer={answerPoint} procedureId={canSave && access?.organisations_mode ? activeInst?.workflow_db_id : null} />
                                )}
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                    <button onClick={() => setGuideOpen(!guideOpen)} className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                            <Info className="w-3.5 h-3.5 text-blue-400" />Légende des types BPMN
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
                            </>
                        ) : view === 'bpmn' ? (
                            activeBpmnXml ? (
                                <div className={`bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col ${editorFullscreen ? 'fixed inset-4 z-50 shadow-2xl' : 'flex-1 min-h-[420px] relative'}`}>
                                    {editorFullscreen && (
                                        <button type="button" title="Quitter le plein écran" onClick={() => setEditorFullscreen(false)}
                                            className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-white border border-slate-200 shadow-sm hover:bg-slate-50">
                                            <Minimize2 className="w-4 h-4 text-slate-600" />
                                        </button>
                                    )}
                                    <div className="absolute bottom-3 right-3 z-10 flex items-center rounded-lg border border-neutral-300 bg-white shadow-sm overflow-hidden">
                                        <button type="button" title="Dézoomer" aria-label="Dézoomer" onClick={() => activeEditor()?.zoomOut()} className="p-1.5 hover:bg-neutral-100 border-r border-neutral-300"><ZoomOut className="w-4 h-4 text-neutral-900" /></button>
                                        <button type="button" title="Zoomer" aria-label="Zoomer" onClick={() => activeEditor()?.zoomIn()} className="p-1.5 hover:bg-neutral-100 border-r border-neutral-300"><ZoomIn className="w-4 h-4 text-neutral-900" /></button>
                                        <button type="button" title="Ajuster à la largeur" aria-label="Ajuster à la largeur" onClick={() => activeEditor()?.zoomFit()} className="p-1.5 hover:bg-neutral-100"><Scan className="w-4 h-4 text-neutral-900" /></button>
                                    </div>
                                    <div className="flex flex-1 min-h-0">
                                        <div className="flex-1 min-w-0">
                                            {instances.length > 0
                                                ? <BpmnEditor ref={el => { editorRefs.current[activeTab] = el; }} initialXml={activeBpmnXml} onChange={xml => { if (viewMode === 'metier') setInstances(prev => prev.map((inst, i) => i === activeTab ? { ...inst, bpmnXml: xml } : inst)); }} onError={showError} onReady={() => { }} onModelerReady={m => { modelerRef.current = m; }} highlightStepIds={Array.from(recentAiChangedStepIds)} onStepHover={(id, rect) => setHoveredStep(id && rect ? { id, rect } : null)} paletteOpen={paletteOpen} />
                                                : <BpmnEditor ref={editorRef} initialXml={activeBpmnXml} onChange={xml => { if (viewMode === 'metier') setBpmnXml(xml); }} onError={showError} onReady={() => { }} onModelerReady={m => { modelerRef.current = m; }} highlightStepIds={Array.from(recentAiChangedStepIds)} onStepHover={(id, rect) => setHoveredStep(id && rect ? { id, rect } : null)} paletteOpen={paletteOpen} />
                                            }
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl p-8">
                                    <Workflow className="w-8 h-8 text-slate-300" />
                                    <p className="text-sm">Le diagramme n&apos;est pas encore généré.</p>
                                    <button type="button" onClick={handleGenerateBPMN} disabled={activeData.length === 0}
                                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">
                                        Générer le BPMN
                                    </button>
                                </div>
                            )
                        ) : (
                            activeBpmnXml && activeData.length > 0 ? (
                                <DocumentExportPanel
                                    data={activeData} enrichments={activeEnrichments}
                                    processMetadata={activeMetadata} bpmnXml={activeBpmnXml}
                                    diagramCaptureFn={captureBpmnDiagram}
                                    initialMeta={activeInitialMeta}
                                    sourceFiles={sourceFiles}
                                    onSuccess={showSuccess} onError={showError}
                                    onMetaEdited={changes => { exportEditsRef.current[activeTab] = changes; }}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center gap-3 text-center text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl p-8">
                                    <FileText className="w-8 h-8 text-slate-300" />
                                    <p className="text-sm">La fiche et l&apos;export sont disponibles une fois le diagramme BPMN généré.</p>
                                    <button type="button" onClick={async () => { await handleGenerateBPMN(); }} disabled={activeData.length === 0}
                                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">
                                        Générer le BPMN
                                    </button>
                                </div>
                            )
                        )}
                    </div>
                </div>
                </div>
            </div>

            {versionsOpen && activeInst?.workflow_db_id && (
                <VersionHistoryModal procedureId={activeInst.workflow_db_id} currentWorkflow={activeData}
                    onClose={() => setVersionsOpen(false)} onRestored={handleVersionRestored} />
            )}
            <SaveTargetModal open={saveModalOpen} titre={activeTitle} onClose={() => setSaveModalOpen(false)} onConfirm={handleSaveChoice} />

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
            {hoveredStep && (() => {
                const row = activeData.find(r => r.id === hoveredStep.id);
                const ids = activeEnrichments.get(hoveredStep.id)?.ecrans;
                return row?.outil && ids?.length ? <ScreenHoverCard toolName={row.outil} screenIds={ids} anchor={hoveredStep.rect} /> : null;
            })()}
        </div>
    );
}

function DiagramMenuAction({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
    return (
        <button type="button" disabled={disabled} onClick={e => { e.currentTarget.closest('details')?.removeAttribute('open'); onClick(); }}
            className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-left text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
            {icon}{label}
        </button>
    );
}

'use client';

// components/processmate/SttPanel.tsx
// Contenu BPMN Studio dans le shell ProcessMate.
// SttToolbar positionnée à GAUCHE (avant le contenu).

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { generateBPMNSimple } from '@/logic/bpmnGeneratorSimple';
import type { Table1Row } from '@/logic/types';
import { ProcessMetadata, TaskEnrichment, DEFAULT_PROCESS_METADATA, DEFAULT_ENRICHMENTS } from '@/logic/bpmnTypes';
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
    Maximize2, X, Download, Save, CheckCircle2, ArrowRight, Loader2,
} from 'lucide-react';
import { API_CONFIG } from '@/lib/api-config';
import { orchestrationApi } from '@/lib/orchestrationApi';
import { useProceduresStore } from '@/store/proceduresStore';

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

interface Props { workflowId?: string; onBack?: () => void; }

const defaultData: Table1Row[] = [
    { id: '1', étape: 'Début du processus', typeBpmn: 'StartEvent', département: 'Front Office', acteur: 'Client', typeActeur: 'externe', condition: '', outputs: [{ targetId: '2', label: '' }], outil: '' },
    { id: '2', étape: 'Soumettre la demande', typeBpmn: 'Task', département: 'Front Office', acteur: 'Client', typeActeur: 'externe', condition: '', outputs: [{ targetId: '3', label: '' }], outil: 'Portail web' },
    { id: '3', étape: 'Vérifier le dossier', typeBpmn: 'Task', département: 'Back Office', acteur: 'Gestionnaire', typeActeur: 'interne', condition: '', outputs: [{ targetId: '4', label: '' }], outil: 'CRM' },
    { id: '4', étape: 'Dossier complet ?', typeBpmn: 'ExclusiveGateway', département: 'Back Office', acteur: 'Gestionnaire', typeActeur: 'interne', condition: 'Dossier complet ?', outputs: [{ targetId: '5', label: 'Oui' }, { targetId: '2', label: 'Non' }], outil: '' },
    { id: '5', étape: 'Valider la demande', typeBpmn: 'Task', département: 'Back Office', acteur: 'Gestionnaire', typeActeur: 'interne', condition: '', outputs: [{ targetId: '6', label: '' }], outil: 'CRM' },
    { id: '6', étape: 'Fin du processus', typeBpmn: 'EndEvent', département: 'Back Office', acteur: 'Gestionnaire', typeActeur: 'interne', condition: '', outputs: [], outil: '' },
];

function ValidationSuccessModal({ procedureName, onGoToList, onStay }: {
    procedureName: string; onGoToList: () => void; onStay: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-emerald-50 px-6 pt-8 pb-6 text-center">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-9 h-9 text-emerald-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Procédure validée</h2>
                    <p className="text-sm text-gray-500">
                        <span className="font-semibold text-gray-700">"{procedureName}"</span> passée en statut{' '}
                        <span className="font-semibold text-emerald-700">Validée</span>.
                    </p>
                </div>
                <div className="px-6 py-5 space-y-3">
                    <button type="button" onClick={onGoToList}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
                        Voir les procédures <ArrowRight className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={onStay}
                        className="w-full px-4 py-2.5 text-gray-500 text-sm hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-colors">
                        Rester dans le Studio
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function SttPanel({ workflowId, onBack }: Props) {
    const { updateProcedureStatus, invalidate } = useProceduresStore();
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
    const [chatOpen, setChatOpen] = useState(true);
    const [uploadOpen, setUploadOpen] = useState(true);
    const [revisionOpen, setRevisionOpen] = useState(false);
    const [revisionCount, setRevisionCount] = useState(0);
    const [editorFullscreen, setEditorFullscreen] = useState(false);
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [loadingWorkflow, setLoadingWorkflow] = useState(false);
    const [validating, setValidating] = useState(false);
    const [validationSuccess, setValidationSuccess] = useState<string | null>(null);

    const editorRef = useRef<BpmnEditorHandle>(null);
    const editorRefs = useRef<(BpmnEditorHandle | null)[]>([]);
    const modelerRef = useRef<any>(null);
    const cancelledRef = useRef(false);

    const showError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 5000); };
    const showSuccess = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 4000); };

    // Chargement via workflowId prop
    useEffect(() => {
        if (!workflowId) return;
        setLoadingWorkflow(true);
        orchestrationApi.getProcedure(workflowId)
            .then(res => {
                const proc = res.procedure;
                const workflow: Table1Row[] = proc.workflow_json || [];
                if (workflow.length === 0) { setLoadingWorkflow(false); return; }
                const enrichMap = new Map<string, TaskEnrichment>();
                if (proc.enrichments_json) Object.entries(proc.enrichments_json).forEach(([id, enr]: [string, any]) => enrichMap.set(id, enr));
                const title = proc.nom || proc.metadata?.nom || 'Processus';
                const xml = generateBPMNSimple(workflow, title);
                setInstances([{ process_id: proc.id, title, data: workflow, enrichments: enrichMap, bpmnXml: xml, metadata: { ...DEFAULT_PROCESS_METADATA }, initialMeta: proc.metadata || { nom: title }, status: 'ready', workflow_db_id: proc.id }]);
                setActiveTab(0); setPhase('editing'); setUploadOpen(false);
                showSuccess(`Procédure "${title}" chargée`);
            })
            .catch(e => showError(`Erreur chargement : ${e.message}`))
            .finally(() => setLoadingWorkflow(false));
    }, [workflowId]);

    const activeInst = instances[activeTab];
    const activeData = instances.length > 0 && activeInst ? activeInst.data : data;
    const activeTitle = instances.length > 0 && activeInst ? activeInst.title : processTitle;
    const activeEnrichments = instances.length > 0 && activeInst ? activeInst.enrichments : enrichments;
    const activeBpmnXml = instances.length > 0 && activeInst ? activeInst.bpmnXml : bpmnXml;
    const activeInitialMeta = instances.length > 0 && activeInst ? activeInst.initialMeta : initialMeta;
    const activeMetadata = instances.length > 0 && activeInst ? activeInst.metadata : processMetadata;
    const hasWorkflowDbId = !!(instances.length > 0 && activeInst?.workflow_db_id);

    const updateActiveData = (d: Table1Row[]) => setInstances(prev => prev.map((inst, i) => i === activeTab ? { ...inst, data: d } : inst));
    const updateActiveEnrichments = (e: Map<string, TaskEnrichment>) => setInstances(prev => prev.map((inst, i) => i === activeTab ? { ...inst, enrichments: e } : inst));

    const handleDiscoveryComplete = (sid: string, detected: ProcessCard[]) => {
        setSessionId(sid); setCards(detected); setPhase('discovery'); setUploadOpen(false);
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
                const res = await fetch(API_CONFIG.getFullUrl(API_CONFIG.endpoints.generationGenerate), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, process_id: pid }) });
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

    const handleSave = useCallback(async (nom: string, category: string) => {
        const inst = instances.length > 0 ? activeInst : null;
        setSaving(true);
        try {
            if (inst?.workflow_db_id) {
                const enrichObj: Record<string, unknown> = {};
                inst.enrichments.forEach((v, k) => { enrichObj[k] = v; });
                await orchestrationApi.saveWorkflowData(inst.workflow_db_id, inst.data as unknown[], enrichObj, { ...(inst.initialMeta || {}), nom, category });
            } else {
                const res = await orchestrationApi.createProcedure({ nom, category });
                const newId = res.procedure.id;
                const enrichObj: Record<string, unknown> = {};
                (inst ? inst.enrichments : enrichments).forEach((v, k) => { enrichObj[k] = v; });
                await orchestrationApi.saveWorkflowData(newId, (inst ? inst.data : data) as unknown[], enrichObj, { nom, category });
                if (inst) setInstances(prev => prev.map((i, idx) => idx === activeTab ? { ...i, workflow_db_id: newId } : i));
                invalidate();
            }
            showSuccess('Procédure enregistrée');
        } catch (err: any) { showError(`Erreur : ${err.message}`); throw err; }
        finally { setSaving(false); }
    }, [activeInst, activeTab, instances, data, enrichments, invalidate]);

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

    const handleWorkflowFromChat = useCallback((
        workflow: Table1Row[], title: string,
        newEnrichments: Map<string, TaskEnrichment>, procedureMetadata?: any,
    ) => {
        if (instances.length > 0) {
            setInstances(prev => prev.map((inst, i) => i === activeTab ? {
                ...inst, data: workflow, title: title || inst.title,
                enrichments: newEnrichments, bpmnXml: null,
                initialMeta: procedureMetadata || inst.initialMeta,
            } : inst));
        } else {
            setData(workflow);
            if (title) setProcessTitle(title);
            setBpmnXml(null);
            if (newEnrichments?.size > 0) setEnrichments(newEnrichments);
            if (procedureMetadata) setInitialMeta(procedureMetadata);
        }
    }, [activeTab, instances]);

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
                        const res = await fetch(API_CONFIG.getFullUrl(API_CONFIG.endpoints.transcribe), { method: 'POST', body: fd });
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

    const handleValidate = async () => {
        const inst = instances[activeTab];
        if (!inst?.workflow_db_id) return;
        setValidating(true);
        try {
            await orchestrationApi.updateStatus(inst.workflow_db_id, 'Validée');
            updateProcedureStatus(inst.workflow_db_id, 'Validée');
            setValidationSuccess(inst.title);
        } catch (e: any) { showError(`Erreur validation : ${e.message}`); }
        finally { setValidating(false); }
    };

    return (
        <div className="flex h-full bg-slate-50 overflow-hidden">

            {/* ── Toolbar STT — à GAUCHE, expandable ── */}
            <SttToolbar
                dataLength={activeData.length}
                recording={recording}
                processing={processing}
                bpmnXml={activeBpmnXml ?? ''}
                isEditingBpmn={!!activeBpmnXml}
                uploadOpen={uploadOpen}
                chatOpen={chatOpen}
                revisionOpen={revisionOpen}
                revisionCount={revisionCount}
                onToggleRecording={toggleRecording}
                onCancelRecording={cancelRecording}
                onGenerateBPMN={handleGenerateBPMN}
                onDownloadBPMN={handleDownloadBPMN}
                onResetToDefault={() => { setInstances([]); setData(defaultData); setBpmnXml(null); setPhase('upload'); }}
                onClearTable={() => { if (instances.length > 0) updateActiveData([]); else setData([]); }}
                onDetectInterfaces={() => { }}
                onAnalyseErrors={() => showError('🔜 Bientôt disponible')}
                onToggleUpload={() => setUploadOpen(o => !o)}
                onToggleChat={() => setChatOpen(o => !o)}
                onToggleRevision={() => setRevisionOpen(o => !o)}
            />

            {/* ── Contenu principal ── */}
            <div className="flex-1 min-w-0 overflow-y-auto">
                <div className="max-w-[1400px] mx-auto px-4 py-5 space-y-3">

                    {loadingWorkflow && (
                        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg flex items-center gap-2 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />Chargement…
                        </div>
                    )}
                    {error && <div className="p-3 bg-red-50   border border-red-200   text-red-700   rounded-lg flex items-center gap-2 text-sm"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span></div>}
                    {success && <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-2 text-sm"><CheckCircle className="w-4 h-4 flex-shrink-0" /><span>{success}</span></div>}

                    {uploadOpen && <MultiDocUpload onDiscoveryComplete={handleDiscoveryComplete} onError={showError} onSuccess={showSuccess} />}
                    {phase === 'discovery' && sessionId && <ProcessDiscoveryPanel sessionId={sessionId} cards={cards} onCardsUpdated={setCards} onGenerate={handleGenerate} generating={generating} />}
                    {chatOpen && phase !== 'discovery' && (
                        <ChatInterface
                            key={instances.length > 0 ? `chat-${activeTab}` : 'chat-default'}
                            currentWorkflow={activeData}
                            onWorkflowGenerated={handleWorkflowFromChat}
                            onError={showError} onSuccess={showSuccess}
                        />
                    )}
                    {revisionOpen && phase === 'editing' && (
                        <RevisionPanel
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

                    {/* Onglets multi-processus */}
                    {instances.length > 1 && (
                        <div className="flex gap-1 flex-wrap">
                            {instances.map((inst, i) => (
                                <button type="button" key={inst.process_id} onClick={() => setActiveTab(i)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${i === activeTab ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                    {inst.status === 'generating' && <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1.5 animate-pulse" />}
                                    {inst.status === 'error' && <span className="inline-block w-2 h-2 rounded-full bg-red-400    mr-1.5" />}
                                    {inst.status === 'ready' && <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />}
                                    {inst.title.length > 30 ? inst.title.slice(0, 30) + '…' : inst.title}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* BPMN Editor */}
                    {activeBpmnXml && (
                        <div className={`bg-white border border-slate-200 rounded-xl overflow-hidden ${editorFullscreen ? 'fixed inset-4 z-50 shadow-2xl' : ''}`}>
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                                <span className="text-sm font-semibold text-slate-700">BPMN Studio — {activeTitle}</span>
                                <div className="flex items-center gap-2">
                                    {hasWorkflowDbId && (
                                        <button type="button" onClick={handleValidate} disabled={validating}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                                            {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                            Valider
                                        </button>
                                    )}
                                    <button type="button" onClick={() => setSaveModalOpen(true)} disabled={saving}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                        <Save className="w-3.5 h-3.5" />{saving ? 'Enregistrement…' : 'Enregistrer'}
                                    </button>
                                    <button onClick={handleDownloadBPMN}
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
                                        ? <BpmnEditor ref={el => { editorRefs.current[activeTab] = el; }} initialXml={activeBpmnXml} onChange={xml => setInstances(prev => prev.map((inst, i) => i === activeTab ? { ...inst, bpmnXml: xml } : inst))} onError={showError} onReady={() => { }} onModelerReady={m => { modelerRef.current = m; }} />
                                        : <BpmnEditor ref={editorRef} initialXml={activeBpmnXml} onChange={xml => setBpmnXml(xml)} onError={showError} onReady={() => { }} onModelerReady={m => { modelerRef.current = m; }} />
                                    }
                                </div>
                            </div>
                        </div>
                    )}

                    {activeBpmnXml && activeData.length > 0 && (
                        <DocumentExportPanel
                            data={activeData} enrichments={activeEnrichments}
                            processMetadata={activeMetadata} bpmnXml={activeBpmnXml}
                            diagramCaptureFn={captureBpmnDiagram}
                            initialMeta={activeInitialMeta}
                            onSuccess={showSuccess} onError={showError}
                        />
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
                        />
                    )}
                </div>
            </div>

            <SaveToBiblioModal open={saveModalOpen} initialNom={activeTitle} onClose={() => setSaveModalOpen(false)} onConfirm={handleSave} />
            {validationSuccess && (
                <ValidationSuccessModal
                    procedureName={validationSuccess}
                    onGoToList={() => { setValidationSuccess(null); onBack?.(); }}
                    onStay={() => setValidationSuccess(null)}
                />
            )}
        </div>
    );
}
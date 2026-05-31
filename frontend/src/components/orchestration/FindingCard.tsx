'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Zap, ArrowLeftRight, Bell, GitMerge, Lightbulb,
    ChevronDown, ChevronUp, Trash2, CheckCircle2, XCircle,
    Sparkles, Loader2, Map, X,
} from 'lucide-react';
import { API_CONFIG } from '@/lib/api-config';
import { orchestrationApi } from '@/lib/orchestrationApi';
import ApprofondirModal, { type Piste } from './ApprofondirModal';
import dynamic from 'next/dynamic';
import type { HighlightStep } from './BpmnHighlightViewer';

// Lazy-load du viewer BPMN (pas de SSR)
const BpmnHighlightViewer = dynamic(() => import('./BpmnHighlightViewer'), { ssr: false });

// ─── Types ────────────────────────────────────────────────────

export interface Finding {
    id: string;
    irritant_id: string;
    categorie: 'automatisable' | 'aller_retour' | 'notification' | 'interfacage' | 'autre';
    etapes: string[];
    constat: string;
    niveau: 'Élevé' | 'Moyen' | 'Faible';
    source: 'ia' | 'manual';
    ordre: number;
    pistes: Piste[];
}

// ─── Configs visuelles ────────────────────────────────────────

const FINDING_CONFIG: Record<Finding['categorie'], {
    label: string; icon: React.ReactNode;
    headerBg: string; headerText: string;
    cardBg: string; divider: string;
    etapesBg: string; constatBg: string;
    border: string; leftBorder: string;
    tagBg: string; tagText: string; tagBorder: string;
    pisteAccent: string; pisteBorder: string; pisteBg: string;
}> = {
    automatisable: {
        label: 'Automatisable', icon: <Zap className="w-4 h-4" />,
        headerBg: 'bg-amber-600', headerText: 'text-white',
        cardBg: 'bg-amber-50/60', divider: 'border-amber-200',
        etapesBg: 'bg-amber-100/60', constatBg: 'bg-blue-50/80',
        border: 'border border-amber-300', leftBorder: 'border-l-4 border-l-amber-600',
        tagBg: 'bg-amber-100', tagText: 'text-amber-900', tagBorder: 'border-amber-300',
        pisteAccent: 'bg-amber-600', pisteBorder: 'border-amber-200', pisteBg: 'bg-white',
    },
    aller_retour: {
        label: 'Aller-retour / Rupture', icon: <ArrowLeftRight className="w-4 h-4" />,
        headerBg: 'bg-rose-700', headerText: 'text-white',
        cardBg: 'bg-rose-50/60', divider: 'border-rose-200',
        etapesBg: 'bg-rose-100/60', constatBg: 'bg-blue-50/80',
        border: 'border border-rose-300', leftBorder: 'border-l-4 border-l-rose-700',
        tagBg: 'bg-rose-100', tagText: 'text-rose-900', tagBorder: 'border-rose-300',
        pisteAccent: 'bg-rose-700', pisteBorder: 'border-rose-200', pisteBg: 'bg-white',
    },
    notification: {
        label: 'Notifications fusionnables', icon: <Bell className="w-4 h-4" />,
        headerBg: 'bg-sky-700', headerText: 'text-white',
        cardBg: 'bg-sky-50/60', divider: 'border-sky-200',
        etapesBg: 'bg-sky-100/60', constatBg: 'bg-blue-50/80',
        border: 'border border-sky-300', leftBorder: 'border-l-4 border-l-sky-700',
        tagBg: 'bg-sky-100', tagText: 'text-sky-900', tagBorder: 'border-sky-300',
        pisteAccent: 'bg-sky-700', pisteBorder: 'border-sky-200', pisteBg: 'bg-white',
    },
    interfacage: {
        label: 'Interfaçage', icon: <GitMerge className="w-4 h-4" />,
        headerBg: 'bg-violet-700', headerText: 'text-white',
        cardBg: 'bg-violet-50/60', divider: 'border-violet-200',
        etapesBg: 'bg-violet-100/60', constatBg: 'bg-blue-50/80',
        border: 'border border-violet-300', leftBorder: 'border-l-4 border-l-violet-700',
        tagBg: 'bg-violet-100', tagText: 'text-violet-900', tagBorder: 'border-violet-300',
        pisteAccent: 'bg-violet-700', pisteBorder: 'border-violet-200', pisteBg: 'bg-white',
    },
    autre: {
        label: 'Autre amélioration', icon: <Lightbulb className="w-4 h-4" />,
        headerBg: 'bg-teal-700', headerText: 'text-white',
        cardBg: 'bg-teal-50/60', divider: 'border-teal-200',
        etapesBg: 'bg-teal-100/60', constatBg: 'bg-blue-50/80',
        border: 'border border-teal-300', leftBorder: 'border-l-4 border-l-teal-700',
        tagBg: 'bg-teal-100', tagText: 'text-teal-900', tagBorder: 'border-teal-300',
        pisteAccent: 'bg-teal-700', pisteBorder: 'border-teal-200', pisteBg: 'bg-white',
    },
};

const NIVEAU_CONFIG: Record<Finding['niveau'], { dot: string; text: string }> = {
    'Élevé': { dot: 'bg-red-500', text: 'text-red-100' },
    'Moyen': { dot: 'bg-orange-400', text: 'text-orange-100' },
    'Faible': { dot: 'bg-emerald-400', text: 'text-emerald-100' },
};

const STATUT_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
    proposée: { label: 'Proposée', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-600 border-gray-200' },
    retenue: { label: 'Retenue', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    rejetée: { label: 'Rejetée', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700 border-red-200' },
    en_cours: { label: 'En cours', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
};

// ─── generateBPMNSimple ───────────────────────────────────────
// Génère un XML BPMN minimal depuis un workflow_json — FALLBACK ONLY
// Le vrai générateur (bpmnGeneratorSimple) est utilisé en priorité

function generateBPMNFallback(steps: any[]): string {
    const getId = (i: number) => `task_${i}`;

    const tasks = steps.map((s, i) => {
        const id = getId(i);
        // Support both "étape" (with accent, from workflow_json) and fallbacks
        const rawName = s['étape'] || s.etape || s.step || s.nom || s.name || `Étape ${i + 1}`;
        const name = rawName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const x = 150 + (i % 5) * 200;
        const y = 100 + Math.floor(i / 5) * 120;
        return { id, name, x, y, raw: s };
    });

    const shapes = tasks.map(t =>
        `<bpmndi:BPMNShape id="${t.id}_di" bpmnElement="${t.id}">
      <dc:Bounds x="${t.x}" y="${t.y}" width="160" height="60" />
    </bpmndi:BPMNShape>`
    ).join('\n    ');

    const taskXml = tasks.map(t =>
        `<bpmn:task id="${t.id}" name="${t.name}" />`
    ).join('\n    ');

    const seqXml = tasks.slice(0, -1).map((t, i) =>
        `<bpmn:sequenceFlow id="flow_${i}" sourceRef="${t.id}" targetRef="${getId(i + 1)}" />`
    ).join('\n    ');

    const edgeXml = tasks.slice(0, -1).map((t, i) =>
        `<bpmndi:BPMNEdge id="flow_${i}_di" bpmnElement="flow_${i}">
      <di:waypoint x="${t.x + 160}" y="${t.y + 30}" />
      <di:waypoint x="${tasks[i + 1].x}" y="${tasks[i + 1].y + 30}" />
    </bpmndi:BPMNEdge>`
    ).join('\n    ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    ${taskXml}
    ${seqXml}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      ${shapes}
      ${edgeXml}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

// ─── PisteCard ────────────────────────────────────────────────

interface PisteCardProps {
    piste: Piste;
    pisteIndex: number;
    totalPistes: number;
    cfg: typeof FINDING_CONFIG[Finding['categorie']];
    finding: Finding;
    onUpdated: (p: Piste) => void;
    onDeleted: (id: string) => void;
}

function PisteCard({ piste, pisteIndex, totalPistes, cfg, finding, onUpdated, onDeleted }: PisteCardProps) {
    const [approfondirOpen, setApprofondirOpen] = useState(false);
    const [actioning, setActioning] = useState(false);
    const [local, setLocal] = useState<Piste>(piste);

    const statutCfg = STATUT_CONFIG[local.statut] ?? STATUT_CONFIG['proposée'];

    const patch = async (updates: Partial<Piste>) => {
        setActioning(true);
        try {
            await fetch(`${API_CONFIG.baseUrl}/api/irritants/pistes/${piste.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            const updated = { ...local, ...updates };
            setLocal(updated);
            onUpdated(updated);
        } catch { /* silencieux */ }
        finally { setActioning(false); }
    };

    const handleDelete = async () => {
        if (!confirm('Supprimer cette piste définitivement ?')) return;
        setActioning(true);
        try {
            await fetch(`${API_CONFIG.baseUrl}/api/irritants/pistes/${piste.id}`, { method: 'DELETE' });
            onDeleted(piste.id);
        } catch { /* silencieux */ }
        finally { setActioning(false); }
    };

    return (
        <>
            <div className={`rounded-xl border ${cfg.pisteBorder} ${cfg.pisteBg} overflow-hidden`}>
                <div className="flex items-start gap-2.5 px-4 py-3">
                    {totalPistes > 1 && (
                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-0.5 ${cfg.pisteAccent}`}>
                            {pisteIndex + 1}
                        </span>
                    )}
                    <div className="flex-1 min-w-0">
                        {local.titre && local.titre !== 'Piste de résolution' && (
                            <p className="text-xs font-bold text-gray-700 mb-0.5">{local.titre}</p>
                        )}
                        <p className="text-sm text-gray-700 leading-relaxed">{local.description}</p>
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${statutCfg.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statutCfg.dot}`} />
                        {statutCfg.label}
                    </span>
                </div>
                <div className={`flex items-center gap-2 px-4 py-2 border-t ${cfg.pisteBorder} bg-gray-50/50`}>
                    <button onClick={() => setApprofondirOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 text-xs font-medium transition-colors border border-violet-200">
                        <Sparkles className="w-3.5 h-3.5" />Approfondir
                    </button>
                    {local.statut !== 'retenue' && (
                        <button onClick={() => patch({ statut: 'retenue' })} disabled={actioning}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-medium transition-colors border border-emerald-200 disabled:opacity-40">
                            <CheckCircle2 className="w-3.5 h-3.5" />Retenir
                        </button>
                    )}
                    {local.statut !== 'rejetée' && (
                        <button onClick={() => patch({ statut: 'rejetée' })} disabled={actioning}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-gray-500 hover:bg-red-50 hover:text-red-600 text-xs font-medium transition-colors border border-gray-200 hover:border-red-200 disabled:opacity-40">
                            <XCircle className="w-3.5 h-3.5" />Rejeter
                        </button>
                    )}
                    {(local.statut === 'retenue' || local.statut === 'rejetée') && (
                        <button onClick={() => patch({ statut: 'proposée' })} disabled={actioning}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1.5">
                            Remettre en attente
                        </button>
                    )}
                    <button onClick={handleDelete} disabled={actioning}
                        className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 text-xs transition-colors disabled:opacity-40">
                        {actioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Supprimer
                    </button>
                </div>
            </div>
            {approfondirOpen && (
                <ApprofondirModal
                    piste={local}
                    findingCategorie={finding.categorie}
                    findingConstat={finding.constat}
                    findingEtapes={finding.etapes}
                    onClose={() => setApprofondirOpen(false)}
                    onPisteUpdated={(updated) => { setLocal(updated); onUpdated(updated); }}
                />
            )}
        </>
    );
}

// ─── FindingCard ──────────────────────────────────────────────

interface FindingCardProps {
    finding: Finding;
    index: number;
    totalFindings: number;
    onDelete: (id: string) => void;
    onFindingUpdated: (f: Finding) => void;
}

export function FindingCard({ finding, index, totalFindings, onDelete, onFindingUpdated }: FindingCardProps) {
    const [visible, setVisible] = useState(false);
    const [pistesOpen, setPistesOpen] = useState(true);
    const [localPistes, setLocalPistes] = useState<Piste[]>(finding.pistes || []);
    const [deletingFinding, setDeletingFinding] = useState(false);

    const cfg = FINDING_CONFIG[finding.categorie] ?? FINDING_CONFIG.autre;
    const ncfg = NIVEAU_CONFIG[finding.niveau] ?? NIVEAU_CONFIG['Moyen'];
    const showIndex = totalFindings > 1;
    const etapesLabel = (finding.etapes?.length ?? 0) > 1 ? 'Étapes concernées' : 'Étape concernée';
    const retenues = localPistes.filter(p => p.statut === 'retenue').length;
    const rejetees = localPistes.filter(p => p.statut === 'rejetée').length;

    useEffect(() => {
        const t = setTimeout(() => setVisible(true), index * 120 + 50);
        return () => clearTimeout(t);
    }, [index]);

    const handlePisteUpdated = (updated: Piste) => {
        const next = localPistes.map(p => p.id === updated.id ? updated : p);
        setLocalPistes(next);
        onFindingUpdated({ ...finding, pistes: next });
    };

    const handlePisteDeleted = (id: string) => {
        const next = localPistes.filter(p => p.id !== id);
        setLocalPistes(next);
        onFindingUpdated({ ...finding, pistes: next });
    };

    const handleDeleteFinding = async () => {
        if (!confirm('Supprimer ce finding et toutes ses pistes ?')) return;
        setDeletingFinding(true);
        try {
            await fetch(`${API_CONFIG.baseUrl}/api/irritants/findings/${finding.id}`, { method: 'DELETE' });
            onDelete(finding.id);
        } catch { /* silencieux */ }
        finally { setDeletingFinding(false); }
    };

    return (
        <div className={`transition-all duration-400 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
            <div className={`rounded-xl overflow-hidden shadow-sm ${cfg.cardBg} ${cfg.border} ${cfg.leftBorder}`}>
                {/* Header */}
                <div className={`${cfg.headerBg} px-4 py-2.5 flex items-center justify-between`}>
                    <div className={`flex items-center gap-2 ${cfg.headerText}`}>
                        {showIndex && (
                            <span className="text-[10px] font-bold opacity-70 bg-white/20 px-1.5 py-0.5 rounded">
                                #{index + 1}
                            </span>
                        )}
                        {cfg.icon}
                        <span className="text-sm font-semibold">{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ncfg.dot}`} />
                        <span className={`text-xs font-medium ${ncfg.text}`}>{finding.niveau}</span>
                        <button onClick={handleDeleteFinding} disabled={deletingFinding}
                            className="ml-1 p-1 rounded hover:bg-white/20 text-white/70 hover:text-white transition-colors disabled:opacity-40">
                            {deletingFinding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                    </div>
                </div>

                {/* Étapes */}
                {(finding.etapes?.length ?? 0) > 0 && (
                    <div className={`px-4 py-2.5 border-b ${cfg.divider} ${cfg.etapesBg}`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-gray-500">{etapesLabel}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {finding.etapes.map((e, i) => (
                                <span key={i} className={`text-xs px-2 py-0.5 rounded font-mono border ${cfg.tagBg} ${cfg.tagText} ${cfg.tagBorder}`}>
                                    {e}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Constat */}
                <div className={`px-4 py-3 border-b ${cfg.divider} ${cfg.constatBg}`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-blue-700">Constat</p>
                    <p className="text-sm text-gray-800 leading-relaxed">{finding.constat}</p>
                </div>

                {/* Pistes */}
                <div className="px-4 py-3">
                    <button type="button" onClick={() => setPistesOpen(o => !o)}
                        className="flex items-center justify-between w-full mb-2">
                        <div className="flex items-center gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                                Pistes de résolution ({localPistes.length})
                            </p>
                            {retenues > 0 && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                                    {retenues} retenue{retenues > 1 ? 's' : ''}
                                </span>
                            )}
                            {rejetees > 0 && (
                                <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">
                                    {rejetees} rejetée{rejetees > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        {pistesOpen ? <ChevronUp className="w-3.5 h-3.5 text-emerald-600" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-600" />}
                    </button>
                    {pistesOpen && (
                        <div className="space-y-2">
                            {localPistes.map((piste, pi) => (
                                <PisteCard key={piste.id} piste={piste} pisteIndex={pi}
                                    totalPistes={localPistes.length} cfg={cfg} finding={finding}
                                    onUpdated={handlePisteUpdated} onDeleted={handlePisteDeleted} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── AnalyseZone ──────────────────────────────────────────────

interface AnalyseZoneProps {
    irritantId: string;
    procedureId: string;
    initialFindings: Finding[];
    autoStart?: boolean;
    onFindingsUpdated: (findings: Finding[]) => void;
}

export function AnalyseZone({ irritantId, procedureId, initialFindings, autoStart, onFindingsUpdated }: AnalyseZoneProps) {
    const [findings, setFindings] = useState<Finding[]>(initialFindings);
    const [streaming, setStreaming] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState<string | null>(null);

    // ── Logigramme split view ──
    const [showDiagram, setShowDiagram] = useState(false);
    const [bpmnXml, setBpmnXml] = useState<string | null>(null);
    const [loadingDiagram, setLoadingDiagram] = useState(false);

    const esRef = useRef<EventSource | null>(null);
    const autoStartFiredRef = useRef(false);

    useEffect(() => () => { esRef.current?.close(); }, []);
    useEffect(() => { setFindings(initialFindings); }, [initialFindings]);

    useEffect(() => {
        if (autoStart && !autoStartFiredRef.current && !streaming && procedureId) {
            autoStartFiredRef.current = true;
            startStream();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoStart]);

    const startStream = () => {
        if (streaming) return;
        setStreaming(true);
        setFindings([]);
        setError(null);
        setStatus('Connexion…');

        const url = `${API_CONFIG.baseUrl}/api/irritants/${irritantId}/analyse/stream`;
        const es = new EventSource(url);
        esRef.current = es;
        let collected: Finding[] = [];

        es.addEventListener('start', (e) => setStatus(JSON.parse((e as MessageEvent).data).message));
        es.addEventListener('finding', (e) => {
            const data = JSON.parse((e as MessageEvent).data);
            const f: Finding = { ...data.finding, pistes: data.finding.pistes || [] };
            collected = [...collected, f];
            setFindings([...collected]);
            setStatus(`${collected.length} point(s) détecté(s)…`);
        });
        es.addEventListener('done', (e) => {
            const d = JSON.parse((e as MessageEvent).data);
            setStatus(`${d.total} point(s) détecté(s)`);
            setStreaming(false);
            es.close(); esRef.current = null;
            onFindingsUpdated(collected);
        });
        es.addEventListener('error', (e) => {
            try { setError(JSON.parse((e as MessageEvent).data).message); } catch { setError('Erreur de connexion'); }
            setStreaming(false);
            es.close(); esRef.current = null;
        });
        es.onerror = () => {
            if (esRef.current) {
                setError('Connexion interrompue');
                setStreaming(false);
                es.close(); esRef.current = null;
            }
        };
    };

    // ── Charger le logigramme depuis la procédure ──
    const handleShowDiagram = async () => {
        if (showDiagram) { setShowDiagram(false); return; }
        if (bpmnXml) { setShowDiagram(true); return; }
        if (!procedureId) return;

        setLoadingDiagram(true);
        try {
            const res = await orchestrationApi.getProcedure(procedureId);
            const proc = res.procedure ?? res;
            const steps: any[] = proc.workflow_json || proc.steps || [];
            if (steps.length === 0) {
                setError('Aucun logigramme disponible pour cette procédure.');
                return;
            }
            // Priorité 1 : bpmn_xml déjà stocké en base
            // Priorité 2 : vrai générateur avec lanes, topologie, acteurs
            // Priorité 3 : fallback linéaire simple
            let xml: string;
            if (proc.bpmn_xml) {
                xml = proc.bpmn_xml;
            } else {
                try {
                    const { generateBPMNSimple: realGen } = await import('@/logic/bpmnGeneratorSimple');
                    xml = realGen(steps, proc.nom || 'Processus');
                } catch {
                    xml = generateBPMNFallback(steps);
                }
            }
            setBpmnXml(xml);
            setShowDiagram(true);
        } catch (e: any) {
            setError(e.message || 'Erreur chargement logigramme');
        } finally {
            setLoadingDiagram(false);
        }
    };

    // ── Collecter toutes les étapes de tous les findings pour le highlight ──
    const highlightedSteps: HighlightStep[] = findings.flatMap(f =>
        (f.etapes || []).map(step => ({ step, categorie: f.categorie }))
    );

    const handleFindingUpdated = (updated: Finding) => {
        const next = findings.map(f => f.id === updated.id ? updated : f);
        setFindings(next);
        onFindingsUpdated(next);
    };

    const handleFindingDeleted = (id: string) => {
        const next = findings.filter(f => f.id !== id);
        setFindings(next);
        onFindingsUpdated(next);
    };

    if (findings.length === 0 && !streaming && !error) {
        return (
            <div className="text-center py-5">
                {!procedureId ? (
                    <p className="text-xs text-gray-400">Liez une procédure pour activer l'analyse IA</p>
                ) : (
                    <button onClick={startStream}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-700 text-white rounded-xl text-sm font-medium hover:bg-violet-800 transition-colors shadow-sm">
                        <Sparkles className="w-4 h-4" />Lancer l'analyse IA
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Barre statut + bouton logigramme */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {streaming && (
                        <span className="flex items-center gap-1 text-xs text-violet-500">
                            <Loader2 className="w-3 h-3 animate-spin" />{status}
                        </span>
                    )}
                    {!streaming && status && <span className="text-xs text-gray-400">{status}</span>}
                </div>
                <div className="flex items-center gap-2">
                    {/* Bouton Voir le logigramme */}
                    {findings.length > 0 && procedureId && (
                        <button
                            onClick={handleShowDiagram}
                            disabled={loadingDiagram}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${showDiagram
                                ? 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200'
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            {loadingDiagram
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : showDiagram
                                    ? <X className="w-3.5 h-3.5" />
                                    : <Map className="w-3.5 h-3.5" />
                            }
                            {showDiagram ? 'Masquer le logigramme' : 'Voir le logigramme'}
                        </button>
                    )}
                    {!streaming && procedureId && (
                        <button onClick={startStream}
                            className="flex items-center gap-1 text-xs text-gray-400 hover:text-violet-600 transition-colors">
                            <Sparkles className="w-3 h-3" />Régénérer
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                </div>
            )}

            {/* Layout split : findings + logigramme */}
            <div className={`flex gap-4 ${showDiagram ? 'items-start' : ''}`}>

                {/* Colonne findings */}
                <div className={showDiagram ? 'w-[55%] flex-shrink-0' : 'w-full'}>
                    {/* Skeletons */}
                    {streaming && findings.length === 0 && (
                        <div className="space-y-2">
                            {[1, 2].map(i => (
                                <div key={i} className="rounded-xl border border-gray-200 overflow-hidden">
                                    <div className="h-10 bg-gray-200 animate-pulse" />
                                    <div className="p-3 space-y-2 bg-gray-50">
                                        <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
                                        <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="space-y-2">
                        {findings.map((f, i) => (
                            <FindingCard key={f.id} finding={f} index={i}
                                totalFindings={findings.length}
                                onDelete={handleFindingDeleted}
                                onFindingUpdated={handleFindingUpdated} />
                        ))}
                        {streaming && findings.length > 0 && (
                            <div className="rounded-xl border border-gray-200 overflow-hidden">
                                <div className="h-10 bg-gray-200 animate-pulse" />
                                <div className="p-3 bg-gray-50">
                                    <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Colonne logigramme */}
                {showDiagram && bpmnXml && (
                    <div className="flex-1 min-w-0 sticky top-4" style={{ height: '520px' }}>
                        <div className="h-full rounded-xl border border-blue-200 overflow-hidden shadow-sm">
                            {/* Header */}
                            <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border-b border-blue-200">
                                <div className="flex items-center gap-1.5">
                                    <Map className="w-3.5 h-3.5 text-blue-600" />
                                    <span className="text-xs font-semibold text-blue-700">Logigramme</span>
                                    {highlightedSteps.length > 0 && (
                                        <span className="text-[10px] bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded-full font-bold">
                                            {highlightedSteps.length} étape{highlightedSteps.length > 1 ? 's' : ''} surlignée{highlightedSteps.length > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => setShowDiagram(false)}
                                    className="p-1 rounded hover:bg-blue-100 text-blue-400 hover:text-blue-700 transition-colors">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            {/* Viewer */}
                            <div className="h-[calc(100%-40px)]">
                                <BpmnHighlightViewer
                                    xml={bpmnXml}
                                    highlightedSteps={highlightedSteps}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── re-export Piste ─────────────────────────────────────────
export type { Piste };
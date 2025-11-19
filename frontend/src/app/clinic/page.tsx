'use client';

import React, { useState, useRef, useEffect } from 'react';
import '@/app/clinic/css/style.css';
import FlowchartResults from '@/components/clinic/FlowchartResults';
import BPMNResults from '@/components/clinic/BPMNResults';
import { initializeViz, VizInstance } from '@/components/clinic/flowchartUtils';
import {
    ProcessingStep,
    Mode,
    ParsedData,
    BPMNData
} from '@/app/clinic/lib/clinicTypes';
import {
    generateFlowchart,
    generateBPMN,
    downloadJson,
    downloadBPMN
} from '@/app/clinic/lib/clinicHandlers';

export default function ClinicPage() {
    // Mode State
    const [mode, setMode] = useState<Mode>('flowchart');

    // File State
    const [file, setFile] = useState<File | null>(null);
    const [bpmnFiles, setBpmnFiles] = useState<File[]>([]);
    const [dragOver, setDragOver] = useState(false);

    // Processing State
    const [currentStep, setCurrentStep] = useState<ProcessingStep>('idle');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Flowchart Result State
    const [parsedData, setParsedData] = useState<ParsedData | null>(null);
    const [flowchartImageUrl, setFlowchartImageUrl] = useState('');
    const [dotSource, setDotSource] = useState('');
    const [currentFileName, setCurrentFileName] = useState('');

    // BPMN Result State
    const [bpmnData, setBpmnData] = useState<BPMNData | null>(null);
    const [bpmnXml, setBpmnXml] = useState('');

    // UI State
    const [activeTab, setActiveTab] = useState<'simple' | 'editor' | 'table' | 'business'>('simple');

    // Refs
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bpmnInputRef = useRef<HTMLInputElement>(null);
    const vizRef = useRef<VizInstance | null>(null);

    // Initialize Viz.js
    useEffect(() => {
        const init = async () => {
            vizRef.current = await initializeViz();
        };
        init();
    }, []);

    // Reset state when changing mode
    useEffect(() => {
        setFile(null);
        setBpmnFiles([]);
        setError('');
        setSuccess('');
        setCurrentStep('idle');
        setParsedData(null);
        setFlowchartImageUrl('');
        setDotSource('');
        setBpmnData(null);
        setBpmnXml('');
        setActiveTab('simple');
    }, [mode]);

    // Handle file selection for flowchart
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError('');
            setSuccess('');
            setCurrentStep('idle');
            setParsedData(null);
            setFlowchartImageUrl('');
            setDotSource('');
        }
    };

    // Handle multiple files for BPMN
    const handleBpmnFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files).slice(0, 6);
            setBpmnFiles(files);
            setError('');
            setSuccess('');
            setCurrentStep('idle');
            setBpmnData(null);
            setBpmnXml('');
        }
    };

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);

        if (mode === 'flowchart') {
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                setFile(e.dataTransfer.files[0]);
                setError('');
                setSuccess('');
                setCurrentStep('idle');
                setParsedData(null);
                setFlowchartImageUrl('');
                setDotSource('');
            }
        } else {
            if (e.dataTransfer.files) {
                const files = Array.from(e.dataTransfer.files).slice(0, 6);
                setBpmnFiles(files);
                setError('');
                setSuccess('');
                setCurrentStep('idle');
                setBpmnData(null);
                setBpmnXml('');
            }
        }
    };

    // Handlers utilisant les fonctions externalisées
    const handleGenerateFlowchart = async () => {
        if (!file) return;

        setError('');
        setSuccess('');
        setParsedData(null);
        setFlowchartImageUrl('');
        setDotSource('');

        await generateFlowchart({
            file,
            setCurrentStep,
            setParsedData,
            setFlowchartImageUrl,
            setDotSource,
            setCurrentFileName,
            setSuccess,
            setError
        });
    };

    const handleGenerateBPMN = async () => {
        if (bpmnFiles.length === 0) return;

        setError('');
        setSuccess('');
        setBpmnData(null);
        setBpmnXml('');

        await generateBPMN({
            files: bpmnFiles,
            setCurrentStep,
            setBpmnData,
            setBpmnXml,
            setSuccess,
            setError
        });
    };

    const handleDownloadJson = async () => {
        if (!file) return;
        await downloadJson(file, setError);
    };

    const handleDownloadBPMN = () => {
        if (!bpmnXml) return;
        downloadBPMN(bpmnXml);
    };

    const isProcessing = currentStep === 'parsing' || currentStep === 'generating' || currentStep === 'analyzing_docs';
    const hasFlowchartResults = mode === 'flowchart' && currentStep === 'completed' && parsedData && flowchartImageUrl;
    const hasBpmnResults = mode === 'bpmn' && currentStep === 'completed' && bpmnData;

    return (
        <>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/viz.js/2.1.2/viz.js" async />
            <script src="https://cdnjs.cloudflare.com/ajax/libs/viz.js/2.1.2/full.render.js" async />

            <div className="container">
                <header>
                    <h1>Clinic</h1>
                    <p className="tagline">Rendre visible l'invisible</p>
                </header>

                <div className="main-card">
                    {/* Mode Selector */}
                    <div className="view-tabs" style={{ marginBottom: '2rem' }}>
                        <button
                            className={`tab-btn ${mode === 'flowchart' ? 'active' : ''}`}
                            onClick={() => setMode('flowchart')}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="9" y1="9" x2="15" y2="9"></line>
                                <line x1="9" y1="15" x2="15" y2="15"></line>
                            </svg>
                            Flowchart WinDev
                        </button>
                        <button
                            className={`tab-btn ${mode === 'bpmn' ? 'active' : ''}`}
                            onClick={() => setMode('bpmn')}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            Processus BPMN
                        </button>
                    </div>

                    {mode === 'flowchart' ? (
                        <>
                            <h2 className="card-title">Générer un flowchart</h2>
                            <p className="card-description">
                                Uploadez votre fichier WinDev et obtenez instantanément son flowchart avec statistiques et visualisations interactives
                            </p>

                            {/* Upload Zone */}
                            <div
                                className={`upload-zone ${dragOver ? 'dragover' : ''}`}
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDragOver(true);
                                }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleFileDrop}
                            >
                                {!file ? (
                                    <>
                                        <div className="upload-icon">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                <polyline points="17 8 12 3 7 8"></polyline>
                                                <line x1="12" y1="3" x2="12" y2="15"></line>
                                            </svg>
                                        </div>
                                        <div className="upload-text">Cliquez pour sélectionner un fichier</div>
                                        <div className="upload-hint">ou glissez-déposez votre fichier .swift, .wl, .txt</div>
                                    </>
                                ) : (
                                    <div className="file-info">
                                        <div className="file-icon">
                                            <svg viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                <polyline points="14 2 14 8 20 8" fill="none" stroke="white" strokeWidth="2"></polyline>
                                            </svg>
                                        </div>
                                        <div className="file-details">
                                            <div className="file-name">{file.name}</div>
                                            <div className="file-size">{(file.size / 1024).toFixed(2)} KB</div>
                                        </div>
                                    </div>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".swift,.wl,.txt,.windev"
                                    onChange={handleFileChange}
                                    style={{ display: 'none' }}
                                />
                            </div>

                            {/* Generate Button */}
                            <button className="btn" onClick={handleGenerateFlowchart} disabled={!file || isProcessing}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                                </svg>
                                {isProcessing ? 'Génération en cours...' : 'Générer le flowchart'}
                            </button>
                        </>
                    ) : (
                        <>
                            <h2 className="card-title">Analyser des processus métier</h2>
                            <p className="card-description">
                                Uploadez vos documents métier (procédures, spécifications) et obtenez des processus BPMN formalisés automatiquement
                            </p>

                            {/* Upload Zone for BPMN */}
                            <div
                                className={`upload-zone ${dragOver ? 'dragover' : ''}`}
                                onClick={() => bpmnInputRef.current?.click()}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDragOver(true);
                                }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleFileDrop}
                            >
                                {bpmnFiles.length === 0 ? (
                                    <>
                                        <div className="upload-icon">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                <polyline points="17 8 12 3 7 8"></polyline>
                                                <line x1="12" y1="3" x2="12" y2="15"></line>
                                            </svg>
                                        </div>
                                        <div className="upload-text">Cliquez pour sélectionner des fichiers</div>
                                        <div className="upload-hint">ou glissez-déposez vos documents PDF/Word (max 6 fichiers)</div>
                                    </>
                                ) : (
                                    <div className="file-info" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                                        {bpmnFiles.map((f, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                                                <div className="file-icon" style={{ width: '32px', height: '32px' }}>
                                                    <svg viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                        <polyline points="14 2 14 8 20 8" fill="none" stroke="white" strokeWidth="2"></polyline>
                                                    </svg>
                                                </div>
                                                <div className="file-details" style={{ flex: 1 }}>
                                                    <div className="file-name">{f.name}</div>
                                                    <div className="file-size">{(f.size / 1024).toFixed(2)} KB</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <input
                                    ref={bpmnInputRef}
                                    type="file"
                                    accept=".pdf,.doc,.docx,.txt"
                                    multiple
                                    onChange={handleBpmnFilesChange}
                                    style={{ display: 'none' }}
                                />
                            </div>

                            {/* Generate BPMN Button */}
                            <button className="btn" onClick={handleGenerateBPMN} disabled={bpmnFiles.length === 0 || isProcessing}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                                </svg>
                                {isProcessing ? 'Analyse en cours...' : 'Analyser et générer BPMN'}
                            </button>
                        </>
                    )}

                    {/* Loading Progress */}
                    {isProcessing && (
                        <div className="loading-progress show">
                            <div className="progress-steps">
                                {mode === 'flowchart' ? (
                                    <>
                                        <div className={`progress-step ${currentStep === 'parsing' ? 'active' : currentStep === 'generating' || currentStep === 'completed' ? 'completed' : ''}`}>
                                            <div className="step-icon">
                                                {currentStep === 'generating' || currentStep === 'completed' ? '✓' : '1'}
                                            </div>
                                            <div className="step-text">Analyse du code WinDev...</div>
                                            <div className="step-spinner"></div>
                                        </div>
                                        <div className={`progress-step ${currentStep === 'generating' ? 'active' : currentStep === 'completed' ? 'completed' : ''}`}>
                                            <div className="step-icon">
                                                {currentStep === 'completed' ? '✓' : '2'}
                                            </div>
                                            <div className="step-text">Génération du flowchart...</div>
                                            <div className="step-spinner"></div>
                                        </div>
                                    </>
                                ) : (
                                    <div className={`progress-step ${currentStep === 'analyzing_docs' ? 'active' : currentStep === 'completed' ? 'completed' : ''}`}>
                                        <div className="step-icon">
                                            {currentStep === 'completed' ? '✓' : '1'}
                                        </div>
                                        <div className="step-text">Analyse des documents et génération BPMN...</div>
                                        <div className="step-spinner"></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Messages */}
                    {error && <div className="error-message show">{error}</div>}
                    {success && <div className="success-message show">{success}</div>}

                    {/* Flowchart Results */}
                    {hasFlowchartResults && parsedData && (
                        <FlowchartResults
                            parsedData={parsedData}
                            flowchartImageUrl={flowchartImageUrl}
                            dotSource={dotSource}
                            currentFileName={currentFileName}
                            vizInstance={vizRef.current}
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                            onDotSourceChange={setDotSource}
                            onDownloadJson={handleDownloadJson}
                        />
                    )}

                    {/* BPMN Results */}
                    {hasBpmnResults && bpmnData && (
                        <BPMNResults
                            bpmnData={bpmnData}
                            bpmnXml={bpmnXml}
                            filesCount={bpmnFiles.length}
                            onDownloadBPMN={handleDownloadBPMN}
                        />
                    )}
                </div>
            </div>
        </>
    );
}
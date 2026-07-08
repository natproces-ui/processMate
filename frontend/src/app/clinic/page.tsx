'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import '@/app/clinic/css/style.css';
import FlowchartResults from '@/components/clinic/FlowchartResults';
import { initializeViz, VizInstance } from '@/components/clinic/flowchartUtils';
import {
    ProcessingStep,
    ParsedData,
} from '@/app/clinic/lib/clinicTypes';
import {
    generateFlowchart,
    downloadJson,
} from '@/app/clinic/lib/clinicHandlers';
import AuthGuard from '@/components/auth/AuthGuard';

function ClinicPageInner() {
    // File State
    const [file, setFile] = useState<File | null>(null);
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

    // UI State
    const [activeTab, setActiveTab] = useState<'simple' | 'editor' | 'table' | 'business'>('simple');

    // Refs
    const fileInputRef = useRef<HTMLInputElement>(null);
    const vizRef = useRef<VizInstance | null>(null);

    // Initialize Viz.js
    useEffect(() => {
        const init = async () => {
            vizRef.current = await initializeViz();
        };
        init();
    }, []);

    // Helper function pour déterminer la classe CSS d'une étape
    const getStepClass = (stepName: 'parsing' | 'generating' | 'analyzing_docs'): string => {
        if (currentStep === stepName) return 'active';

        const stepOrder: ProcessingStep[] = ['idle', 'parsing', 'generating', 'analyzing_docs', 'completed'];
        const currentIndex = stepOrder.indexOf(currentStep);
        const stepIndex = stepOrder.indexOf(stepName);

        if (currentIndex > stepIndex) return 'completed';
        return '';
    };

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

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0]);
            setError('');
            setSuccess('');
            setCurrentStep('idle');
            setParsedData(null);
            setFlowchartImageUrl('');
            setDotSource('');
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

    const handleDownloadJson = async () => {
        if (!file) return;
        await downloadJson(file, setError);
    };

    const isProcessing = currentStep === 'parsing' || currentStep === 'generating';
    const hasFlowchartResults = currentStep === 'completed' && parsedData && flowchartImageUrl;

    return (
        <div className="clinic-page">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/viz.js/2.1.2/viz.js" async />
            <script src="https://cdnjs.cloudflare.com/ajax/libs/viz.js/2.1.2/full.render.js" async />

            <div className="container">
                <header>
                    <h1>Clinic</h1>
                    <p className="tagline">Rendre visible l&apos;invisible</p>
                </header>

                <div className="main-card">
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
                                    className="hidden-input"
                                    aria-label="Sélectionner un fichier WinDev"
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

                    {/* Loading Progress */}
                    {isProcessing && (
                        <div className="loading-progress show">
                            <div className="progress-steps">
                                <div className={`progress-step ${getStepClass('parsing')}`}>
                                    <div className="step-icon">
                                        {getStepClass('parsing') === 'completed' ? '✓' : '1'}
                                    </div>
                                    <div className="step-text">Analyse du code WinDev...</div>
                                    <div className="step-spinner"></div>
                                </div>
                                <div className={`progress-step ${getStepClass('generating')}`}>
                                    <div className="step-icon">
                                        {getStepClass('generating') === 'completed' ? '✓' : '2'}
                                    </div>
                                    <div className="step-text">Génération du flowchart...</div>
                                    <div className="step-spinner"></div>
                                </div>
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
                            onGenerateBPMN={() => {
                                sessionStorage.setItem('clinic_to_studio', JSON.stringify({
                                    dot_source: dotSource,
                                    business_info: parsedData.business_info,
                                    statistics: parsedData.statistics,
                                    filename: currentFileName,
                                }));
                                window.location.href = '/orchestration?module=stt&from=clinic';
                            }}
                        />
                    )}

                </div>
            </div>
        </div>
    );
}

export default function ClinicPage() {
    return (
        <AuthGuard>
            <ClinicPageInner />
        </AuthGuard>
    );
}
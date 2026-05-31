"use client";

import { useState, useRef } from 'react';
import { Table1Row } from '@/logic/bpmnGenerator';
import { API_CONFIG } from '@/lib/api-config';
import { TaskEnrichment } from '@/logic/bpmnTypes';
import {
    Upload,
    Loader2,
    Trash2,
    Image as ImageIcon,
    Info,
    ChevronDown,
    ChevronUp,
    AlertTriangle

} from 'lucide-react';

interface ImageUploadSectionProps {
    onWorkflowExtracted: (
        workflow: Table1Row[],
        title?: string,
        enrichments?: Map<string, TaskEnrichment>  // 🆕 AJOUTÉ
    ) => void;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
    currentWorkflow?: Table1Row[];
    onVerificationComplete?: (verificationResult: any) => void;
}

export default function ImageUploadSection({
    onWorkflowExtracted,
    onError,
    onSuccess,
    currentWorkflow,
    onVerificationComplete
}: ImageUploadSectionProps) {
    const [uploading, setUploading] = useState(false);
    const [verifying, setVerifying] = useState(false); // ✅ NOUVEAU
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [currentImageData, setCurrentImageData] = useState<File | null>(null); // ✅ NOUVEAU
    const [showGuide, setShowGuide] = useState(true);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) await processFile(file);
    };

    const processFile = async (file: File) => {
        const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            onError('Type de fichier non supporté. Utilisez PNG, JPG ou WebP.');
            return;
        }

        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            onError(`Image trop volumineuse (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum: 10MB.`);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => setPreviewUrl(e.target?.result as string);
        reader.readAsDataURL(file);

        // ✅ Sauvegarder le fichier pour la vérification ultérieure
        setCurrentImageData(file);

        await uploadAndAnalyze(file);
    };

    const uploadAndAnalyze = async (file: File) => {
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const url = API_CONFIG.getFullUrl(API_CONFIG.endpoints.imgToBpmnAnalyze);

            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Erreur lors de l\'analyse.');
            }

            const result = await response.json();

            if (result.success && result.workflow) {
                const title = result.title || "Processus extrait";

                // 🆕 Convertir enrichments objet → Map
                const enrichmentsMap = new Map<string, TaskEnrichment>();
                if (result.enrichments) {
                    Object.entries(result.enrichments).forEach(([id, enr]: [string, any]) => {
                        enrichmentsMap.set(id, enr);
                    });
                }

                onWorkflowExtracted(result.workflow, title, enrichmentsMap);  // ✅ Passe les enrichissements

                const enrichCount = enrichmentsMap.size;
                onSuccess(`${result.steps_count} étapes extraites, ${enrichCount} enrichies.`);
            } else {
                throw new Error('Format de réponse invalide.');
            }
        } catch (error: any) {
            onError(error.message || 'Erreur lors de l\'analyse de l\'image.');
            setPreviewUrl(null);
            setCurrentImageData(null);
        } finally {
            setUploading(false);
        }
    };
    // ✅ NOUVELLE FONCTION : Vérifier l'extraction
    const handleVerifyExtraction = async () => {
        if (!currentImageData || !currentWorkflow || currentWorkflow.length === 0) {
            onError('Impossible de vérifier : pas d\'image ou de workflow disponible.');
            return;
        }

        setVerifying(true);
        try {
            const formData = new FormData();
            formData.append('file', currentImageData);
            formData.append('workflow', JSON.stringify(currentWorkflow));

            const url = API_CONFIG.getFullUrl(API_CONFIG.endpoints.imgToBpmnVerify);

            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Erreur lors de la vérification.');
            }

            const result = await response.json();

            if (result.success && result.verification_result) {
                onSuccess('Analyse d\'erreurs terminée.');
                if (onVerificationComplete) {
                    onVerificationComplete(result.verification_result);
                }
            } else {
                throw new Error('Format de réponse invalide.');
            }
        } catch (error: any) {
            onError(error.message || 'Erreur lors de la vérification.');
        } finally {
            setVerifying(false);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!uploading) setDragActive(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (uploading) return;

        const file = e.dataTransfer.files?.[0];
        if (file) await processFile(file);
    };

    const handleButtonClick = () => fileInputRef.current?.click();

    const handleClearPreview = () => {
        setPreviewUrl(null);
        setCurrentImageData(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ✅ Calculer si la vérification est disponible
    const canVerify = currentImageData && currentWorkflow && currentWorkflow.length > 0;

    return (
        <div className="mb-6 bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-lg p-6">

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <ImageIcon className="w-7 h-7 text-indigo-700" />
                <div>
                    <h2 className="text-xl font-bold text-indigo-900">
                        Analyser une image de processus
                    </h2>
                    <p className="text-sm text-indigo-700">
                        Uploadez ou déposez une capture d'écran de votre workflow pour remplir automatiquement le tableau.
                    </p>
                </div>
            </div>

            {/* Upload zone */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-6 transition-all text-center cursor-pointer ${dragActive
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50'
                    }`}
                onClick={handleButtonClick}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={handleFileSelect}
                    className="hidden"
                />

                {uploading ? (
                    <div className="flex flex-col items-center justify-center gap-2 text-indigo-700">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <p className="font-medium">Analyse en cours...</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center gap-3 text-indigo-800">
                        <Upload className="w-8 h-8 text-indigo-700" />
                        <p className="font-medium">
                            Glissez-déposez une image ici ou <span className="text-indigo-600 underline">cliquez pour parcourir</span>
                        </p>
                        <p className="text-xs text-indigo-500">
                            Formats supportés : PNG, JPG, WebP — max 10MB
                        </p>
                    </div>
                )}
            </div>

            {/* Preview */}
            {previewUrl && (
                <div className="bg-white rounded-lg p-4 border-2 border-indigo-200 mt-4">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                            <ImageIcon className="w-4 h-4" /> Image uploadée
                        </p>
                        <div className="flex gap-2">
                            {/* ✅ NOUVEAU BOUTON : Analyser les erreurs */}
                            {canVerify && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleVerifyExtraction();
                                    }}
                                    disabled={verifying}
                                    className="flex items-center gap-1 text-orange-600 border-2 border-orange-400 px-3 py-1 rounded-md hover:bg-orange-50 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {verifying ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Vérification...
                                        </>
                                    ) : (
                                        <>
                                            <AlertTriangle className="w-4 h-4" />
                                            Analyser les erreurs
                                        </>
                                    )}
                                </button>
                            )}
                            <button
                                onClick={handleClearPreview}
                                className="flex items-center gap-1 text-red-600 border border-red-300 px-2 py-1 rounded-md hover:bg-red-50 text-sm"
                            >
                                <Trash2 className="w-4 h-4" />
                                Effacer
                            </button>
                        </div>
                    </div>
                    <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-w-full max-h-64 rounded-lg shadow-md border-2 border-gray-200"
                    />
                </div>
            )}

            {/* Guide */}
            <div className="bg-white rounded-lg border-2 border-indigo-100 overflow-hidden mt-4">
                <button
                    onClick={() => setShowGuide((prev) => !prev)}
                    className="w-full flex justify-between items-center px-4 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-semibold"
                >
                    <span className="flex items-center gap-2">
                        <Info className="w-5 h-5" />
                        Guide d'utilisation
                    </span>
                    {showGuide ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>

                {showGuide && (
                    <div className="p-4 border-t border-indigo-100">
                        <ul className="text-sm text-indigo-700 space-y-2">
                            <li>• Utilisez des captures nettes et contrastées.</li>
                            <li>• Formats supportés : PNG, JPG, WebP (max 10MB).</li>
                            <li>• Assurez-vous que les textes sont bien lisibles.</li>
                            <li>• Les swimlanes aident à identifier les acteurs ou départements.</li>
                            <li>• L'IA reconnaît les formes BPMN : cercles (événements), rectangles (tâches), losanges (décisions).</li>
                            <li>• <strong>🆕 Cliquez sur "Analyser les erreurs"</strong> après l'extraction pour vérifier la qualité.</li>
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
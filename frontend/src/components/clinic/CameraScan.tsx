"use client";

import { useState, useRef, useEffect } from 'react';
import { Table1Row } from '@/logic/bpmnGenerator';
import { API_CONFIG } from '@/lib/api-config';
import {
    Camera,
    Loader2,
    Trash2,
    Video,
    Info,
    ChevronDown,
    ChevronUp,
    AlertCircle
} from 'lucide-react';

interface CameraScanSectionProps {
    onWorkflowExtracted: (workflow: Table1Row[]) => void;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
}

export default function CameraScanSection({
    onWorkflowExtracted,
    onError,
    onSuccess
}: CameraScanSectionProps) {
    const [isScanning, setIsScanning] = useState(false);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [showGuide, setShowGuide] = useState(true);
    const [cameraError, setCameraError] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Initialiser la caméra
    const startCamera = async () => {
        try {
            setCameraError(null);
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                streamRef.current = stream;
                setIsCameraActive(true);
            }
        } catch (error: any) {
            const message = error.name === 'NotAllowedError'
                ? 'Accès à la caméra refusé. Vérifiez les permissions.'
                : 'Caméra non disponible sur cet appareil.';
            setCameraError(message);
            onError(message);
        }
    };

    // Arrêter la caméra
    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsCameraActive(false);
        setCameraError(null);
    };

    // Capturer une photo depuis la vidéo
    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            if (context) {
                canvasRef.current.width = videoRef.current.videoWidth;
                canvasRef.current.height = videoRef.current.videoHeight;
                context.drawImage(videoRef.current, 0, 0);

                const imageData = canvasRef.current.toDataURL('image/jpeg', 0.95);
                setPreviewUrl(imageData);
                stopCamera();
                setIsScanning(false);
            }
        }
    };

    // Reprendre le scan
    const handleRetake = async () => {
        setPreviewUrl(null);
        await startCamera();
        setIsScanning(true);
    };

    // Soumettre l'image capturée pour analyse
    const submitCapture = async () => {
        if (!previewUrl) return;

        setUploading(true);
        try {
            // Convertir DataURL en Blob
            const response = await fetch(previewUrl);
            const blob = await response.blob();

            const formData = new FormData();
            formData.append('file', blob, 'scan.jpg');

            const url = API_CONFIG.getFullUrl(API_CONFIG.endpoints.imgToBpmn + '/analyze');

            const uploadResponse = await fetch(url, {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                const error = await uploadResponse.json();
                throw new Error(error.detail || 'Erreur lors de l\'analyse.');
            }

            const result = await uploadResponse.json();

            if (result.success && result.workflow) {
                onWorkflowExtracted(result.workflow);
                onSuccess(`${result.steps_count} étapes extraites avec succès.`);
                setPreviewUrl(null);
            } else {
                throw new Error('Format de réponse invalide.');
            }
        } catch (error: any) {
            onError(error.message || 'Erreur lors de l\'analyse de l\'image.');
        } finally {
            setUploading(false);
        }
    };

    // Nettoyage à la désactivation du composant
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    return (
        <div className="mb-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg p-6">

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <Camera className="w-7 h-7 text-blue-700" />
                <div>
                    <h2 className="text-xl font-bold text-blue-900">
                        Scanner un processus
                    </h2>
                    <p className="text-sm text-blue-700">
                        Utilisez votre caméra pour scanner un diagramme BPMN et l'analyser automatiquement.
                    </p>
                </div>
            </div>

            {/* Erreur caméra */}
            {cameraError && (
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-700">{cameraError}</p>
                </div>
            )}

            {/* Zone vidéo ou preview */}
            {isCameraActive && !previewUrl ? (
                <div className="bg-black rounded-lg overflow-hidden mb-4 relative">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full aspect-video object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />
                </div>
            ) : previewUrl ? (
                <div className="bg-white rounded-lg p-4 border-2 border-blue-200 mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                            <Video className="w-4 h-4" /> Image scannée
                        </p>
                        <button
                            onClick={() => setPreviewUrl(null)}
                            className="flex items-center gap-1 text-red-600 border border-red-300 px-2 py-1 rounded-md hover:bg-red-50 text-sm"
                        >
                            <Trash2 className="w-4 h-4" />
                            Effacer
                        </button>
                    </div>
                    <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-w-full max-h-64 rounded-lg shadow-md border-2 border-gray-200 mx-auto"
                    />
                </div>
            ) : (
                <div className="border-2 border-dashed border-blue-200 rounded-lg p-6 text-center bg-white mb-4">
                    <Video className="w-8 h-8 text-blue-700 mx-auto mb-2" />
                    <p className="text-sm text-blue-700">
                        Cliquez sur "Démarrer le scan" pour utiliser votre caméra.
                    </p>
                </div>
            )}

            {/* Boutons d'action */}
            <div className="flex gap-3 flex-wrap">
                {!isCameraActive && !previewUrl ? (
                    <button
                        onClick={startCamera}
                        disabled={uploading}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                        <Camera className="w-5 h-5" />
                        Démarrer le scan
                    </button>
                ) : isCameraActive && !previewUrl ? (
                    <>
                        <button
                            onClick={capturePhoto}
                            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                        >
                            <Camera className="w-5 h-5" />
                            Capturer
                        </button>
                        <button
                            onClick={stopCamera}
                            className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                        >
                            Annuler
                        </button>
                    </>
                ) : previewUrl ? (
                    <>
                        <button
                            onClick={submitCapture}
                            disabled={uploading}
                            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Analyse en cours...
                                </>
                            ) : (
                                <>
                                    <Camera className="w-5 h-5" />
                                    Soumettre et analyser
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleRetake}
                            disabled={uploading}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                        >
                            Reprendre
                        </button>
                    </>
                ) : null}
            </div>

            {/* Guide */}
            <div className="bg-white rounded-lg border-2 border-blue-100 overflow-hidden mt-4">
                <button
                    onClick={() => setShowGuide((prev) => !prev)}
                    className="w-full flex justify-between items-center px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-900 font-semibold"
                >
                    <span className="flex items-center gap-2">
                        <Info className="w-5 h-5" />
                        Guide d'utilisation
                    </span>
                    {showGuide ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>

                {showGuide && (
                    <div className="p-4 border-t border-blue-100">
                        <ul className="text-sm text-blue-700 space-y-2">
                            <li>• Placez le diagramme BPMN face à votre caméra.</li>
                            <li>• Assurez-vous que l'image est nette et bien éclairée.</li>
                            <li>• Centrez le diagramme dans le cadre de visualisation.</li>
                            <li>• Cliquez sur "Capturer" pour prendre la photo.</li>
                            <li>• Vérifiez l'aperçu avant de soumettre pour analyse.</li>
                            <li>• Utilisez "Reprendre" pour refaire un scan.</li>
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
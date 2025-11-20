"use client";

import { useRef, useState, useEffect } from "react";
import { Table1Row } from "@/logic/bpmnGenerator";
import { API_CONFIG } from "@/lib/api-config";
import {
    Camera,
    Loader2,
    Trash2,
    Image as ImageIcon,
    Info,
    ChevronDown,
    ChevronUp,
    Scan,
    Smartphone
} from "lucide-react";

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
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [stream, setStream] = useState<MediaStream | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [capturing, setCapturing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showGuide, setShowGuide] = useState(true);
    const [isMobile, setIsMobile] = useState(false);
    const [cameraType, setCameraType] = useState<'user' | 'environment'>('user');

    // Détection mobile
    useEffect(() => {
        const checkMobile = () => {
            const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            setIsMobile(mobile);
            // Sur mobile, on utilise la caméra arrière par défaut
            setCameraType(mobile ? 'environment' : 'user');
        };
        checkMobile();
    }, []);

    // --- Start camera avec détection automatique ---
    const startCamera = async () => {
        try {
            setCapturing(true);

            // Configuration adaptée au device
            const constraints = {
                video: {
                    facingMode: cameraType,
                    width: { ideal: isMobile ? 1920 : 1280 },
                    height: { ideal: isMobile ? 1080 : 720 }
                }
            };

            const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            setStream(mediaStream);

            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                await videoRef.current.play();
            }
            setCapturing(false);
        } catch (err: any) {
            // Si la caméra arrière échoue, essayer la caméra avant
            if (cameraType === 'environment' && err.name === 'OverconstrainedError') {
                console.log('Caméra arrière non disponible, tentative avec caméra avant...');
                setCameraType('user');
                startCamera(); // Relancer avec caméra avant
                return;
            }
            onError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
            setCapturing(false);
        }
    };

    // --- Stop camera ---
    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
        }
    };

    // --- Capture image ---
    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Appliquer un miroir seulement pour la caméra avant
        if (cameraType === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        setPreviewUrl(dataUrl);
        stopCamera(); // stop after capture
        uploadFromDataUrl(dataUrl);
    };

    // --- Upload captured image ---
    const uploadFromDataUrl = async (dataUrl: string) => {
        setUploading(true);
        try {
            // Convert base64 → File
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const file = new File([blob], "capture.jpg", { type: "image/jpeg" });

            const formData = new FormData();
            formData.append("file", file);

            const url = API_CONFIG.getFullUrl(API_CONFIG.endpoints.imgToBpmn + "/analyze");

            const response = await fetch(url, {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || "Erreur lors de l'analyse.");
            }

            const result = await response.json();

            if (result.success && result.workflow) {
                onWorkflowExtracted(result.workflow);
                onSuccess(`${result.steps_count} étapes extraites avec succès.`);
            } else {
                throw new Error("Réponse invalide du serveur.");
            }
        } catch (err: any) {
            onError(err.message || "Erreur lors de l'analyse de l'image.");
            setPreviewUrl(null);
        } finally {
            setUploading(false);
        }
    };

    const handleClear = () => {
        setPreviewUrl(null);
        stopCamera();
    };

    const restartScan = () => {
        setPreviewUrl(null);
        startCamera();
    };

    // Basculer entre caméra avant/arrière
    const switchCamera = async () => {
        if (stream) {
            stopCamera();
            setCameraType(prev => prev === 'user' ? 'environment' : 'user');
            // Redémarrer avec le nouveau type après un court délai
            setTimeout(startCamera, 100);
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopCamera();
        };
    }, []);

    return (
        <div className="mb-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <Scan className="w-7 h-7 text-blue-700" />
                <div>
                    <h2 className="text-xl font-bold text-blue-900">
                        Scanner avec votre caméra
                    </h2>
                    <p className="text-sm text-blue-700">
                        {isMobile
                            ? "Utilisez la caméra arrière pour une meilleure qualité"
                            : "Utilisez votre webcam pour capturer un diagramme"
                        }
                    </p>
                </div>
            </div>

            {/* Indicateur mobile */}
            {isMobile && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-700">
                        <strong>Mode mobile détecté</strong> - Utilisation de la caméra arrière
                    </span>
                </div>
            )}

            {/* CAMERA VIEW */}
            {!previewUrl && (
                <div className="border-2 border-dashed rounded-lg p-6 transition-all text-center bg-white border-blue-200">
                    <video
                        ref={videoRef}
                        className="w-full max-h-72 rounded-lg bg-black mx-auto"
                        style={{
                            // Miroir seulement pour caméra avant
                            transform: cameraType === 'user' ? 'scaleX(-1)' : 'none'
                        }}
                    />

                    {!stream ? (
                        <div className="flex flex-col gap-3 mt-4">
                            <button
                                onClick={startCamera}
                                disabled={capturing}
                                className="px-6 py-3 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50 transition-colors mx-auto"
                            >
                                {capturing ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <Camera className="w-5 h-5" />
                                )}
                                {capturing ? 'Initialisation...' : 'Activer la caméra'}
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 mt-4">
                            <button
                                onClick={capturePhoto}
                                className="px-6 py-3 bg-green-600 text-white rounded-lg flex items-center gap-2 hover:bg-green-700 transition-colors mx-auto"
                            >
                                <Camera className="w-5 h-5" />
                                Capturer l'image
                            </button>

                            {/* Bouton pour switcher de caméra (mobile seulement) */}
                            {isMobile && (
                                <button
                                    onClick={switchCamera}
                                    className="px-4 py-2 bg-gray-600 text-white rounded-lg flex items-center gap-2 hover:bg-gray-700 transition-colors mx-auto text-sm"
                                >
                                    <Camera className="w-4 h-4" />
                                    {cameraType === 'user' ? 'Caméra arrière' : 'Caméra avant'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* HIDDEN CANVAS FOR CAPTURE */}
            <canvas ref={canvasRef} className="hidden" />

            {/* PREVIEW */}
            {previewUrl && (
                <div className="space-y-4">
                    <div className="bg-white rounded-lg p-4 border-2 border-blue-200">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                                <ImageIcon className="w-4 h-4" /> Image capturée
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={restartScan}
                                    className="flex items-center gap-1 text-blue-600 border border-blue-300 px-3 py-1 rounded-md hover:bg-blue-50 text-sm"
                                >
                                    <Camera className="w-4 h-4" />
                                    Reprendre
                                </button>
                                <button
                                    onClick={handleClear}
                                    className="flex items-center gap-1 text-red-600 border border-red-300 px-3 py-1 rounded-md hover:bg-red-50 text-sm"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Effacer
                                </button>
                            </div>
                        </div>
                        <img
                            src={previewUrl}
                            alt="Capture"
                            className="max-w-full max-h-64 rounded-lg shadow-md border-2 border-gray-200 mx-auto"
                        />
                    </div>

                    {uploading && (
                        <div className="flex items-center justify-center gap-2 p-4 bg-blue-50 rounded-lg">
                            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                            <span className="text-blue-700 font-medium">Analyse en cours...</span>
                        </div>
                    )}
                </div>
            )}

            {/* Guide adapté au mobile */}
            <div className="bg-white rounded-lg border-2 border-blue-100 overflow-hidden mt-4">
                <button
                    onClick={() => setShowGuide((prev) => !prev)}
                    className="w-full flex justify-between items-center px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-900 font-semibold"
                >
                    <span className="flex items-center gap-2">
                        <Info className="w-5 h-5" />
                        {isMobile ? 'Conseils pour mobile' : 'Conseils pour une bonne capture'}
                    </span>
                    {showGuide ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>

                {showGuide && (
                    <div className="p-4 border-t border-blue-100">
                        <ul className="text-sm text-blue-700 space-y-2">
                            {isMobile ? (
                                <>
                                    <li>• 📱 <strong>Utilisez la caméra arrière</strong> pour une meilleure qualité</li>
                                    <li>• 💡 <strong>Bon éclairage</strong> naturel sans reflets</li>
                                    <li>• 📄 <strong>Document à plat</strong> sur une surface stable</li>
                                    <li>• 🎯 <strong>Cadrage droit</strong> de l'ensemble du diagramme</li>
                                    <li>• ✨ <strong>Textes nets</strong> et bien lisibles</li>
                                    <li>• 🔄 <strong>Changez de caméra</strong> avec le bouton si besoin</li>
                                </>
                            ) : (
                                <>
                                    <li>• 💻 Utilisez la caméra avant pour une meilleure visibilité</li>
                                    <li>• 💡 Assurez-vous d'un bon éclairage sans reflets</li>
                                    <li>• 📄 Maintenez le document stable pendant la capture</li>
                                    <li>• 🎯 Cadrez bien l'ensemble du diagramme</li>
                                    <li>• ✨ Les textes doivent être nets et lisibles</li>
                                </>
                            )}
                        </ul>
                    </div>
                )}
            </div>

            {/* Message d'information pour les permissions */}
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    <strong>Autorisation requise :</strong> Votre navigateur va demander l'accès à votre caméra.
                </p>
            </div>
        </div>
    );
}
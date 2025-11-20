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
    Scan
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

    // --- Start camera ---
    const startCamera = async () => {
        try {
            setCapturing(true);
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user" } // Caméra avant du PC
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                await videoRef.current.play();
            }
            setCapturing(false);
        } catch (err) {
            onError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
            setCapturing(false);
        }
    };

    // --- Stop camera ---
    const stopCamera = () => {
        stream?.getTracks().forEach((track) => track.stop());
        setStream(null);
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

        ctx.drawImage(video, 0, 0);

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
                        Scanner avec votre webcam
                    </h2>
                    <p className="text-sm text-blue-700">
                        Utilisez votre caméra avant pour capturer un diagramme de processus.
                    </p>
                </div>
            </div>

            {/* CAMERA VIEW */}
            {!previewUrl && (
                <div className="border-2 border-dashed rounded-lg p-6 transition-all text-center bg-white border-blue-200">
                    <video
                        ref={videoRef}
                        className="w-full max-h-72 rounded-lg bg-black mx-auto"
                        style={{ transform: 'scaleX(-1)' }} // Miroir pour caméra avant
                    />

                    {!stream ? (
                        <button
                            onClick={startCamera}
                            disabled={capturing}
                            className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50 transition-colors mx-auto"
                        >
                            {capturing ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Camera className="w-5 h-5" />
                            )}
                            {capturing ? 'Initialisation...' : 'Activer la webcam'}
                        </button>
                    ) : (
                        <button
                            onClick={capturePhoto}
                            className="mt-4 px-6 py-3 bg-green-600 text-white rounded-lg flex items-center gap-2 hover:bg-green-700 transition-colors mx-auto"
                        >
                            <Camera className="w-5 h-5" />
                            Capturer l'image
                        </button>
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

            {/* Guide */}
            <div className="bg-white rounded-lg border-2 border-blue-100 overflow-hidden mt-4">
                <button
                    onClick={() => setShowGuide((prev) => !prev)}
                    className="w-full flex justify-between items-center px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-900 font-semibold"
                >
                    <span className="flex items-center gap-2">
                        <Info className="w-5 h-5" />
                        Conseils pour une bonne capture
                    </span>
                    {showGuide ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>

                {showGuide && (
                    <div className="p-4 border-t border-blue-100">
                        <ul className="text-sm text-blue-700 space-y-2">
                            <li>• Utilisez la caméra avant pour une meilleure visibilité</li>
                            <li>• Assurez-vous d'un bon éclairage sans reflets</li>
                            <li>• Maintenez le dispositif stable pendant la capture</li>
                            <li>• Cadrez bien l'ensemble du diagramme</li>
                            <li>• Les textes doivent être nets et lisibles</li>
                            <li>• Évitez les ombres portées sur le document</li>
                        </ul>
                    </div>
                )}
            </div>

            {/* Message d'information pour les permissions */}
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    <strong>Autorisation requise :</strong> Votre navigateur va demander l'accès à votre caméra. Cliquez sur "Autoriser" pour continuer.
                </p>
            </div>
        </div>
    );
}
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
    Smartphone,
    RotateCcw,
    Maximize2,
    Wand2,
    FileText,
    Receipt,
    PenTool
} from "lucide-react";

interface CameraScanSectionProps {
    onWorkflowExtracted: (workflow: Table1Row[]) => void;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
}

type ScanMode = 'auto' | 'document' | 'whiteboard' | 'receipt' | 'diagram';

export default function CameraScanSection({
    onWorkflowExtracted,
    onError,
    onSuccess
}: CameraScanSectionProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [stream, setStream] = useState<MediaStream | null>(null);
    const [captures, setCaptures] = useState<string[]>([]);
    const [scannedPreviews, setScannedPreviews] = useState<string[]>([]); // Images après scan
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [capturing, setCapturing] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [cameraType, setCameraType] = useState<'user' | 'environment'>('environment');

    // Paramètres de capture
    const [brightness, setBrightness] = useState(100);
    const [contrast, setContrast] = useState(100);
    const [zoom, setZoom] = useState(1);

    // Mode de scan
    const [scanMode, setScanMode] = useState<ScanMode>('diagram'); // 🔄 Par défaut: diagram
    const [enhanceEnabled, setEnhanceEnabled] = useState(true);

    // Détection mobile
    useEffect(() => {
        const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        setIsMobile(mobile);
    }, []);

    const startCamera = async () => {
        try {
            setCapturing(true);
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: cameraType,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                await videoRef.current.play();
            }
        } catch (err: any) {
            if (cameraType === 'environment') {
                setCameraType('user');
                setTimeout(startCamera, 100);
                return;
            }
            onError("Impossible d'accéder à la caméra");
        } finally {
            setCapturing(false);
        }
    };

    const stopCamera = () => {
        stream?.getTracks().forEach(t => t.stop());
        setStream(null);
    };

    // Capture + envoi immédiat au scanner backend
    const captureAndScan = async () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        // Vérifier que la vidéo est prête
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            onError("Vidéo non prête. Réessayez dans 1 seconde.");
            return;
        }

        // Définir les dimensions du canvas
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        // Dessiner la vidéo sur le canvas avec zoom
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(zoom, zoom);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Appliquer brightness/contrast
        try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const bFactor = brightness / 100;
            const cFactor = contrast / 100;

            for (let i = 0; i < data.length; i += 4) {
                for (let j = 0; j < 3; j++) {
                    let v = data[i + j] * bFactor;
                    v = (v - 128) * cFactor + 128;
                    data[i + j] = Math.max(0, Math.min(255, v));
                }
            }
            ctx.putImageData(imageData, 0, 0);
        } catch (err) {
            console.error("Erreur filtres:", err);
        }

        const rawCapture = canvas.toDataURL("image/jpeg", 0.95);

        // Envoi au scanner backend
        setScanning(true);
        try {
            const res = await fetch(rawCapture);
            const blob = await res.blob();

            // Debug: taille du blob
            console.log("Capture size:", blob.size, "bytes");

            const formData = new FormData();
            formData.append("file", blob, "capture.jpg");
            formData.append("mode", scanMode);
            formData.append("enhance", enhanceEnabled.toString());

            const scanUrl = API_CONFIG.getFullUrl("/api/scanner/scan");
            console.log("Sending to:", scanUrl);

            const response = await fetch(scanUrl, {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Scanner error:", errorText);
                throw new Error(`Erreur scanner: ${response.status}`);
            }

            const result = await response.json();
            console.log("Scanner result:", {
                success: result.success,
                detected: result.document_detected,
                confidence: result.confidence,
                hasImage: !!result.scanned_image
            });

            if (result.scanned_image) {
                // Stocker l'originale ET la scannée
                setCaptures(prev => [...prev, rawCapture]);
                setScannedPreviews(prev => [...prev, result.scanned_image]);
                setSelectedIndex(captures.length);

                if (result.document_detected) {
                    onSuccess(`Document détecté (${Math.round(result.confidence * 100)}% confiance)`);
                } else {
                    onSuccess("Image améliorée (pas de document détecté)");
                }
            } else {
                throw new Error("Pas d'image dans la réponse");
            }
        } catch (err: any) {
            console.error("Scan error:", err);
            // Fallback: utiliser l'image brute si scanner échoue
            setCaptures(prev => [...prev, rawCapture]);
            setScannedPreviews(prev => [...prev, rawCapture]);
            setSelectedIndex(captures.length);
            onError(`Scan fallback: ${err.message}`);
        } finally {
            setScanning(false);
        }
    };

    const deleteCapture = (index: number) => {
        setCaptures(prev => prev.filter((_, i) => i !== index));
        setScannedPreviews(prev => prev.filter((_, i) => i !== index));
        setSelectedIndex(null);
    };

    const clearAllCaptures = () => {
        setCaptures([]);
        setScannedPreviews([]);
        setSelectedIndex(null);
    };

    // Soumettre pour analyse BPMN (utilise l'image scannée)
    const submitForAnalysis = async () => {
        if (scannedPreviews.length === 0) return;

        setUploading(true);
        try {
            const imageToAnalyze = selectedIndex !== null
                ? scannedPreviews[selectedIndex]
                : scannedPreviews[0];

            const res = await fetch(imageToAnalyze);
            const blob = await res.blob();
            const file = new File([blob], "scanned.jpg", { type: "image/jpeg" });

            const formData = new FormData();
            formData.append("file", file);

            const url = API_CONFIG.getFullUrl(API_CONFIG.endpoints.imgToBpmnAnalyze);
            const response = await fetch(url, {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || "Erreur analyse");
            }

            const result = await response.json();

            if (result.success && result.workflow) {
                onWorkflowExtracted(result.workflow);
                onSuccess(`${result.steps_count} étapes extraites !`);
                clearAllCaptures();
                stopCamera();
            } else {
                throw new Error("Réponse invalide");
            }
        } catch (err: any) {
            onError(err.message || "Erreur lors de l'analyse");
        } finally {
            setUploading(false);
        }
    };

    const switchCamera = () => {
        stopCamera();
        setCameraType(prev => prev === 'user' ? 'environment' : 'user');
        setTimeout(startCamera, 100);
    };

    useEffect(() => () => stopCamera(), []);

    const ScanModeButton = ({ mode, icon: Icon, label }: { mode: ScanMode; icon: any; label: string }) => (
        <button
            onClick={() => setScanMode(mode)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${scanMode === mode
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
        >
            <Icon className="w-3.5 h-3.5" />
            {label}
        </button>
    );

    return (
        <div className="mb-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <Scan className="w-7 h-7 text-blue-700" />
                <div>
                    <h2 className="text-xl font-bold text-blue-900">Scanner Pro</h2>
                    <p className="text-sm text-blue-700">Qualité CamScanner - Redressement automatique</p>
                </div>
            </div>

            {/* Mode selector */}
            <div className="mb-4 p-3 bg-white rounded-lg border border-blue-200">
                <p className="text-xs font-semibold text-gray-600 mb-2">Mode de scan:</p>
                <div className="flex flex-wrap gap-2">
                    <ScanModeButton mode="diagram" icon={Maximize2} label="Diagramme" />
                    <ScanModeButton mode="auto" icon={Wand2} label="Auto" />
                    <ScanModeButton mode="document" icon={FileText} label="Document" />
                    <ScanModeButton mode="whiteboard" icon={PenTool} label="Tableau" />
                    <ScanModeButton mode="receipt" icon={Receipt} label="Ticket" />
                </div>
                <div className="mt-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={enhanceEnabled}
                            onChange={(e) => setEnhanceEnabled(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        Amélioration {scanMode === 'diagram' ? 'douce' : 'automatique'} (recommandé)
                    </label>
                    <p className="text-xs text-gray-500 ml-6">
                        {enhanceEnabled
                            ? scanMode === 'diagram'
                                ? "✓ Amélioration légère (préserve les détails BPMN)"
                                : "✓ Fond blanc + texte net + suppression ombres"
                            : "⚠️ Image brute (peut contenir ombres et reflets)"}
                    </p>
                </div>
            </div>

            {/* CAMERA VIEW */}
            {captures.length === 0 && (
                <div className="mb-4 bg-black rounded-lg overflow-hidden border-2 border-blue-300">
                    <div className="relative w-full aspect-video">
                        <video ref={videoRef} className="w-full h-full object-cover" />

                        {/* Overlay grille */}
                        {stream && (
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute inset-4 border-2 border-green-400 rounded-lg opacity-50"></div>
                                <div className="absolute top-1/3 left-4 right-4 border-b border-green-400 opacity-30"></div>
                                <div className="absolute top-2/3 left-4 right-4 border-b border-green-400 opacity-30"></div>
                                <div className="absolute left-1/3 top-4 bottom-4 border-r border-green-400 opacity-30"></div>
                                <div className="absolute left-2/3 top-4 bottom-4 border-r border-green-400 opacity-30"></div>

                                {/* Coins */}
                                {[['top-4 left-4', 'border-t-2 border-l-2'],
                                ['top-4 right-4', 'border-t-2 border-r-2'],
                                ['bottom-4 left-4', 'border-b-2 border-l-2'],
                                ['bottom-4 right-4', 'border-b-2 border-r-2']].map(([pos, border], i) => (
                                    <div key={i} className={`absolute ${pos} w-6 h-6 ${border} border-green-400`}></div>
                                ))}
                            </div>
                        )}

                        {/* Scanning indicator */}
                        {scanning && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <div className="bg-white rounded-lg p-4 flex items-center gap-3">
                                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                                    <span className="font-medium text-gray-800">Scan en cours...</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {!stream ? (
                        <div className="p-4 bg-gray-900">
                            <button
                                onClick={startCamera}
                                disabled={capturing}
                                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50 justify-center"
                            >
                                {capturing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                                {capturing ? 'Initialisation...' : 'Démarrer le scanner'}
                            </button>
                        </div>
                    ) : (
                        <div className="p-4 bg-gray-900 space-y-4">
                            {/* Contrôles */}
                            <div className="grid grid-cols-3 gap-4 text-white text-xs">
                                {[
                                    { label: 'Luminosité', value: brightness, setValue: setBrightness, min: 50, max: 150 },
                                    { label: 'Contraste', value: contrast, setValue: setContrast, min: 50, max: 150 },
                                    { label: 'Zoom', value: zoom, setValue: setZoom, min: 1, max: 3, step: 0.1 }
                                ].map(({ label, value, setValue, min, max, step }) => (
                                    <div key={label}>
                                        <label className="block mb-1">{label}: {typeof value === 'number' && value % 1 ? value.toFixed(1) : value}{label !== 'Zoom' ? '%' : 'x'}</label>
                                        <input
                                            type="range"
                                            min={min}
                                            max={max}
                                            step={step || 1}
                                            value={value}
                                            onChange={(e) => setValue(Number(e.target.value))}
                                            className="w-full h-2 bg-gray-700 rounded"
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* Actions */}
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={captureAndScan}
                                    disabled={scanning}
                                    className="px-4 py-3 bg-green-600 text-white rounded-lg flex items-center gap-2 hover:bg-green-700 disabled:opacity-50 justify-center font-medium"
                                >
                                    <Camera className="w-5 h-5" />
                                    {scanning ? 'Scan...' : 'Capturer'}
                                </button>

                                {isMobile && (
                                    <button onClick={switchCamera} className="px-4 py-3 bg-gray-600 text-white rounded-lg flex items-center gap-2 hover:bg-gray-700 justify-center">
                                        <RotateCcw className="w-5 h-5" />
                                    </button>
                                )}

                                <button onClick={stopCamera} className="px-4 py-3 bg-red-600 text-white rounded-lg flex items-center gap-2 hover:bg-red-700 justify-center">
                                    <Trash2 className="w-4 h-4" />
                                    Annuler
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <canvas ref={canvasRef} className="hidden" />

            {/* CAPTURES GALLERY */}
            {captures.length > 0 && (
                <div className="space-y-4">
                    {/* Preview scannée */}
                    <div className="bg-white rounded-lg p-4 border-2 border-green-200">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                                <Scan className="w-4 h-4" />
                                Document scanné ({captures.length})
                            </p>
                        </div>

                        {selectedIndex !== null && scannedPreviews[selectedIndex] && (
                            <img
                                src={scannedPreviews[selectedIndex]}
                                alt="Scan"
                                className="max-w-full max-h-80 rounded-lg shadow-lg border-2 border-gray-200 mx-auto"
                            />
                        )}
                    </div>

                    {/* Thumbnails */}
                    {captures.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {scannedPreviews.map((preview, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedIndex(idx)}
                                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${selectedIndex === idx ? 'border-green-500 ring-2 ring-green-400' : 'border-gray-300 hover:border-gray-400'
                                        }`}
                                >
                                    <img src={preview} alt={`Scan ${idx + 1}`} className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                        <button
                            onClick={() => { if (stream) captureAndScan(); else startCamera(); }}
                            disabled={scanning}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700 text-sm disabled:opacity-50"
                        >
                            <Camera className="w-4 h-4" />
                            {stream ? 'Ajouter' : 'Nouvelle capture'}
                        </button>

                        <button onClick={clearAllCaptures} className="px-4 py-2 bg-gray-600 text-white rounded-lg flex items-center gap-2 hover:bg-gray-700 text-sm">
                            <RotateCcw className="w-4 h-4" />
                            Recommencer
                        </button>

                        {selectedIndex !== null && (
                            <button onClick={() => deleteCapture(selectedIndex)} className="px-4 py-2 bg-red-600 text-white rounded-lg flex items-center gap-2 hover:bg-red-700 text-sm">
                                <Trash2 className="w-4 h-4" />
                                Supprimer
                            </button>
                        )}
                    </div>

                    {/* Submit */}
                    <button
                        onClick={submitForAnalysis}
                        disabled={uploading}
                        className="w-full px-6 py-4 bg-green-600 text-white rounded-lg flex items-center gap-2 hover:bg-green-700 font-semibold justify-center disabled:opacity-50"
                    >
                        {uploading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Analyse en cours...
                            </>
                        ) : (
                            <>
                                <Maximize2 className="w-5 h-5" />
                                Analyser le workflow
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* Guide */}
            <div className="bg-white rounded-lg border border-blue-100 overflow-hidden mt-4">
                <button
                    onClick={() => setShowGuide(p => !p)}
                    className="w-full flex justify-between items-center px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-900 font-semibold"
                >
                    <span className="flex items-center gap-2">
                        <Info className="w-5 h-5" />
                        Guide Scanner Pro
                    </span>
                    {showGuide ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>

                {showGuide && (
                    <div className="p-4 text-sm text-blue-700 space-y-2">
                        <p>• 📄 <strong>Auto-détection</strong> des bords du document</p>
                        <p>• 🔄 <strong>Redressement automatique</strong> de la perspective</p>
                        <p>• ✨ <strong>Fond blanc parfait</strong> et texte ultra-net</p>
                        <p>• 📸 <strong>Modes spécialisés</strong>: Document, Tableau, Ticket</p>
                        <p>• 💡 <strong>Astuce</strong>: Bon éclairage = meilleur scan</p>
                    </div>
                )}
            </div>
        </div>
    );
}
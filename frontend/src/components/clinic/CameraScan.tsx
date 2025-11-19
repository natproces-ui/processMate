import { useState, useRef, useEffect } from 'react';
import { Camera, X, Check, RotateCw } from 'lucide-react';

interface CameraScanProps {
    onImageCaptured: (file: File) => void;
    onError: (message: string) => void;
}

export default function CameraScan({ onImageCaptured, onError }: CameraScanProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Démarrer la caméra
    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: facingMode,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            });

            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
            setIsOpen(true);
        } catch (err) {
            onError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
            console.error(err);
        }
    };

    // Arrêter la caméra
    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
        setIsOpen(false);
    };

    // Changer de caméra (avant/arrière)
    const switchCamera = async () => {
        stopCamera();
        setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
        setTimeout(() => startCamera(), 100);
    };

    // Capturer l'image
    const captureImage = () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
                onImageCaptured(file);
                stopCamera();
            }
        }, 'image/jpeg', 0.95);
    };

    // Nettoyer au démontage
    useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [stream]);

    return (
        <>
            {/* Bouton pour ouvrir la caméra */}
            <button
                onClick={startCamera}
                className="px-6 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2"
            >
                <Camera className="w-4 h-4" />
                Scanner un document
            </button>

            {/* Modal de la caméra */}
            {isOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4">
                    <div className="relative w-full max-w-4xl">
                        {/* En-tête */}
                        <div className="absolute top-0 left-0 right-0 bg-black bg-opacity-50 p-4 flex justify-between items-center z-10">
                            <h3 className="text-white font-semibold text-lg">Scanner le document</h3>
                            <button
                                onClick={stopCamera}
                                className="text-white hover:text-red-400 transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Vidéo */}
                        <div className="relative bg-black rounded-lg overflow-hidden">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                className="w-full h-auto"
                            />

                            {/* Grille d'aide */}
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="w-full h-full border-2 border-white border-dashed opacity-30 m-4"></div>
                            </div>
                        </div>

                        {/* Contrôles */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 p-6 flex justify-center items-center gap-6">
                            <button
                                onClick={switchCamera}
                                className="p-4 bg-gray-700 hover:bg-gray-600 text-white rounded-full transition-colors"
                                title="Changer de caméra"
                            >
                                <RotateCw className="w-6 h-6" />
                            </button>

                            <button
                                onClick={captureImage}
                                className="p-6 bg-white hover:bg-gray-200 text-gray-900 rounded-full transition-all transform hover:scale-105 shadow-lg"
                                title="Capturer"
                            >
                                <Check className="w-8 h-8" />
                            </button>

                            <button
                                onClick={stopCamera}
                                className="p-4 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
                                title="Annuler"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    {/* Canvas caché pour la capture */}
                    <canvas ref={canvasRef} className="hidden" />
                </div>
            )}
        </>
    );
}
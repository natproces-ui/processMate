'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, Crop, RotateCcw } from 'lucide-react';

interface PdfCaptureModalProps {
    files: File[];
    onCapture: (dataUrl: string) => void;
    onClose: () => void;
}

interface SelectionRect {
    x: number; y: number; width: number; height: number;
}

const RENDER_SCALE = 1.8;

export default function PdfCaptureModal({ files, onCapture, onClose }: PdfCaptureModalProps) {
    const [selectedFileIdx, setSelectedFileIdx] = useState(0);
    const [pageNum, setPageNum] = useState(1);
    const [numPages, setNumPages] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const pdfDocRef = useRef<any>(null);

    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const [selection, setSelection] = useState<SelectionRect | null>(null);

    const selectedFile = files[selectedFileIdx];
    const isPdf = selectedFile?.type === 'application/pdf';

    // ── Chargement du fichier (PDF ou image) ──────────────────────────────
    useEffect(() => {
        let cancelled = false;
        setSelection(null);
        setError(null);
        pdfDocRef.current = null;

        if (!selectedFile) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        if (!isPdf) {
            // Fichier image : dessine directement sur le canvas
            setLoading(true);
            const img = new Image();
            img.onload = () => {
                if (cancelled) return;
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0);
                setNumPages(1);
                setPageNum(1);
                setLoading(false);
            };
            img.onerror = () => { if (!cancelled) { setError('Impossible de charger l\'image'); setLoading(false); } };
            img.src = URL.createObjectURL(selectedFile);
            return () => { cancelled = true; URL.revokeObjectURL(img.src); };
        }

        // Fichier PDF : charge via pdfjs-dist
        setLoading(true);
        (async () => {
            try {
                const pdfjsLib = await import('pdfjs-dist');
                pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
                    'pdfjs-dist/build/pdf.worker.min.mjs',
                    import.meta.url
                ).toString();

                const arrayBuffer = await selectedFile.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                if (cancelled) return;
                pdfDocRef.current = pdf;
                setNumPages(pdf.numPages);
                setPageNum(1);
            } catch (e: any) {
                if (!cancelled) setError(e.message || 'Erreur de chargement du PDF');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [selectedFile, isPdf]);

    // ── Rendu de la page courante ──────────────────────────────────────────
    useEffect(() => {
        if (!isPdf || !pdfDocRef.current) return;
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const page = await pdfDocRef.current.getPage(pageNum);
                const viewport = page.getViewport({ scale: RENDER_SCALE });
                const canvas = canvasRef.current;
                if (!canvas || cancelled) return;
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                await page.render({ canvasContext: ctx, viewport }).promise;
                if (!cancelled) setSelection(null);
            } catch (e: any) {
                if (!cancelled) setError(e.message || 'Erreur de rendu de la page');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [pageNum, isPdf]);

    // ── Sélection rectangle (coordonnées écran → converties en pixels canvas à la capture) ──
    const getRelativePos = useCallback((e: React.MouseEvent) => {
        const container = containerRef.current;
        if (!container) return { x: 0, y: 0 };
        const rect = container.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        const pos = getRelativePos(e);
        setDragStart(pos);
        setSelection({ x: pos.x, y: pos.y, width: 0, height: 0 });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragStart) return;
        const pos = getRelativePos(e);
        setSelection({
            x: Math.min(dragStart.x, pos.x),
            y: Math.min(dragStart.y, pos.y),
            width: Math.abs(pos.x - dragStart.x),
            height: Math.abs(pos.y - dragStart.y),
        });
    };

    const handleMouseUp = () => setDragStart(null);

    const resetSelection = () => setSelection(null);

    const handleCapture = () => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !selection || selection.width < 4 || selection.height < 4) return;

        // Conversion coordonnées écran (affichées, potentiellement redimensionnées par CSS) → pixels réels du canvas
        const displayRect = container.getBoundingClientRect();
        const scaleX = canvas.width / displayRect.width;
        const scaleY = canvas.height / displayRect.height;

        const sx = selection.x * scaleX;
        const sy = selection.y * scaleY;
        const sw = selection.width * scaleX;
        const sh = selection.height * scaleY;

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = sw;
        cropCanvas.height = sh;
        const ctx = cropCanvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

        onCapture(cropCanvas.toDataURL('image/png'));
    };

    if (files.length === 0) {
        return (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md text-center">
                    <p className="text-white text-sm mb-4">Aucun document source disponible. Uploadez un PDF ou une image dans "Import de documents" avant de capturer une annexe.</p>
                    <button onClick={onClose} className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600">Fermer</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                        <Crop className="w-4 h-4 text-blue-400" />
                        <h3 className="text-sm font-semibold text-white">Capturer une zone du document</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X className="w-4 h-4" /></button>
                </div>

                {/* Sélecteur de fichier */}
                {files.length > 1 && (
                    <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2 flex-wrap">
                        {files.map((f, i) => (
                            <button
                                key={i}
                                onClick={() => setSelectedFileIdx(i)}
                                className={`text-xs px-2 py-1 rounded ${i === selectedFileIdx ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                            >
                                {f.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Navigation pages (PDF) */}
                {isPdf && numPages > 1 && (
                    <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-center gap-3">
                        <button onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum <= 1}
                            className="p-1 text-gray-300 hover:text-white disabled:opacity-30">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-gray-300">Page {pageNum} / {numPages}</span>
                        <button onClick={() => setPageNum(p => Math.min(numPages, p + 1))} disabled={pageNum >= numPages}
                            className="p-1 text-gray-300 hover:text-white disabled:opacity-30">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Zone de rendu + sélection */}
                <div className="flex-1 overflow-auto bg-gray-950 p-4 flex items-center justify-center">
                    {loading && <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />}
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    {!loading && !error && (
                        <div
                            ref={containerRef}
                            className="relative inline-block cursor-crosshair select-none"
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        >
                            <canvas ref={canvasRef} className="max-w-full block border border-gray-700" />
                            {selection && (
                                <div
                                    className="absolute border-2 border-blue-400 bg-blue-400/20 pointer-events-none"
                                    style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-gray-700 flex items-center justify-between">
                    <p className="text-xs text-gray-400">Tracez un rectangle sur la zone à capturer.</p>
                    <div className="flex gap-2">
                        <button onClick={resetSelection} disabled={!selection}
                            className="px-3 py-1.5 text-xs text-gray-300 hover:text-white flex items-center gap-1 disabled:opacity-30">
                            <RotateCcw className="w-3.5 h-3.5" />Réinitialiser
                        </button>
                        <button
                            onClick={handleCapture}
                            disabled={!selection || selection.width < 4 || selection.height < 4}
                            className="px-4 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                        >
                            Capturer cette zone
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

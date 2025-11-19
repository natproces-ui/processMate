// src/components/clinic/FlowchartViewer.tsx

'use client';

import React, { useState, useRef } from 'react';
import { calculateFitZoom } from './flowchartUtils';

interface FlowchartViewerProps {
    imageUrl: string;
}

export default function FlowchartViewer({ imageUrl }: FlowchartViewerProps) {
    const [zoom, setZoom] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [scrollStart, setScrollStart] = useState({ left: 0, top: 0 });

    const viewerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    const handleZoomIn = () => setZoom(Math.min(zoom + 0.2, 3));
    const handleZoomOut = () => setZoom(Math.max(zoom - 0.2, 0.2));
    const handleResetZoom = () => setZoom(1);

    const handleFitScreen = () => {
        if (!imageRef.current || !viewerRef.current) return;

        const viewerWidth = viewerRef.current.clientWidth;
        const viewerHeight = viewerRef.current.clientHeight;
        const imageWidth = imageRef.current.naturalWidth;
        const imageHeight = imageRef.current.naturalHeight;

        const optimalZoom = calculateFitZoom(
            imageWidth,
            imageHeight,
            viewerWidth,
            viewerHeight
        );

        setZoom(optimalZoom);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!viewerRef.current) return;
        setIsPanning(true);
        setPanStart({
            x: e.pageX - viewerRef.current.offsetLeft,
            y: e.pageY - viewerRef.current.offsetTop,
        });
        setScrollStart({
            left: viewerRef.current.scrollLeft,
            top: viewerRef.current.scrollTop,
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isPanning || !viewerRef.current) return;
        e.preventDefault();
        const x = e.pageX - viewerRef.current.offsetLeft;
        const y = e.pageY - viewerRef.current.offsetTop;
        const walkX = (x - panStart.x) * 2;
        const walkY = (y - panStart.y) * 2;
        viewerRef.current.scrollLeft = scrollStart.left - walkX;
        viewerRef.current.scrollTop = scrollStart.top - walkY;
    };

    const handleMouseUp = () => setIsPanning(false);

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            setZoom(prev =>
                e.deltaY < 0
                    ? Math.min(prev + 0.1, 3)
                    : Math.max(prev - 0.1, 0.2)
            );
        }
    };

    return (
        <div className="tab-content active">
            <div className="flowchart-controls">
                <button className="control-btn" onClick={handleZoomIn}>
                    Zoom +
                </button>
                <button className="control-btn" onClick={handleZoomOut}>
                    Zoom -
                </button>
                <button className="control-btn" onClick={handleResetZoom}>
                    Réinitialiser
                </button>
                <button className="control-btn" onClick={handleFitScreen}>
                    Ajuster à l'écran
                </button>
            </div>
            <div
                ref={viewerRef}
                className="flowchart-viewer"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            >
                <div className="zoom-info">{Math.round(zoom * 100)}%</div>
                <img
                    ref={imageRef}
                    src={imageUrl}
                    alt="Flowchart"
                    style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
                />
            </div>
        </div>
    );
}
// src/components/DiagramView.tsx
"use client";

import { useEffect, useRef } from "react";
import BpmnViewer from "bpmn-js";

interface DiagramViewProps {
    xml: string;
}

export default function DiagramView({ xml }: DiagramViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<BpmnViewer | null>(null);

    useEffect(() => {
        if (containerRef.current && xml) {
            viewerRef.current = new BpmnViewer({
                container: containerRef.current,
            });

            viewerRef.current.importXML(xml).then(() => {
                const canvas = viewerRef.current!.get("canvas");
                canvas.zoom("fit-viewport");
            }).catch((err: any) => {
                console.error("Erreur lors du rendu du BPMN :", err);
            });
        }

        return () => {
            viewerRef.current?.destroy();
        };
    }, [xml]);

    return <div ref={containerRef} className="w-full h-[600px] border border-gray-300 rounded" />;
}
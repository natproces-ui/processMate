"use client";

import { useEffect, useRef } from "react";
import BpmnViewer from "bpmn-js/dist/bpmn-viewer.production.min.js";

interface DiagramViewProps {
    xml: string;
}

export default function DiagramView({ xml }: DiagramViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);

    useEffect(() => {
        // Initialise le viewer BPMN une seule fois
        if (!viewerRef.current && containerRef.current) {
            viewerRef.current = new BpmnViewer({
                container: containerRef.current,
            });
        }

        const viewer = viewerRef.current;

        // Charge le XML si présent
        if (xml && viewer) {
            viewer
                .importXML(xml)
                .then(() => {
                    const canvas = viewer.get("canvas");
                    canvas.zoom("fit-viewport");
                })
                .catch((err: any) => {
                    console.error("Erreur import BPMN :", err);
                });
        }

        // Nettoyage à la destruction du composant
        return () => {
            if (viewer) {
                viewer.destroy();
                viewerRef.current = null;
            }
        };
    }, [xml]);

    return (
        <div
            ref={containerRef}
            className="w-full h-[500px] border rounded-lg bg-white"
        >
            {!xml && (
                <div className="flex items-center justify-center h-full text-gray-400 italic">
                    Aucun diagramme généré pour le moment.
                </div>
            )}
        </div>
    );
}

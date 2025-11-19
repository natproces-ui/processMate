"use client";

import { useEffect, useRef } from "react";
import BpmnViewer from "bpmn-js";

export default function BpmnViewerComponent({ xml }: { xml: string }) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!xml) return;
        const viewer = new BpmnViewer({ container: containerRef.current! });

        viewer.importXML(xml).then(() => {
            const canvas = viewer.get("canvas");
            canvas.zoom("fit-viewport");
        });

        return () => viewer.destroy();
    }, [xml]);

    return (
        <div
            ref={containerRef}
            style={{
                width: "100%",
                height: "80vh",
                border: "1px solid #ccc",
                borderRadius: "8px",
                background: "white",
                marginTop: "1rem",
            }}
        />
    );
}

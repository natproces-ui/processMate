// src/app/components/MermaidDiagram.tsx
"use client";

import { useEffect, useId } from "react";

interface MermaidDiagramProps {
    code: string;
}

export default function MermaidDiagram({ code }: MermaidDiagramProps) {
    const id = useId().replace(/:/g, "");
    const containerId = `mermaid-container-${id}`;

    useEffect(() => {
        const container = document.getElementById(containerId);
        if (!container) return;

        import("mermaid").then((mermaid) => {
            mermaid.default.initialize({
                startOnLoad: false,
                theme: "default",
                flowchart: { useMaxWidth: true },
            });

            mermaid.default.render(`mermaid-${id}`, code, (svg) => {
                container.innerHTML = svg;
            });
        }).catch(err => {
            container.innerHTML = `<div class="text-red-600">Erreur Mermaid: ${err.message}</div>`;
        });
    }, [code, id]);

, id, containerId]);

    return (
        <div
            id={containerId}
            className="mermaid overflow-x-auto border rounded-lg p-4 bg-white shadow-sm min-h-64"
        />
    );
}
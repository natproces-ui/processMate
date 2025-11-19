// src/app/logic/generateMermaid.ts
import { ProcessNode, ProcessStructure } from "./normalizeTable";

export function generateMermaid(structure: ProcessStructure): string {
    const { elements } = structure;
    const lines: string[] = [];

    lines.push(`%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '14px', 'fontFamily': 'system-ui'}}}%%`);
    lines.push(`graph TD`);

    const serviceColors: Record<string, string> = {
        RH: "#ef4444",
        Finance: "#f59e0b",
        Communication: "#3b82f6",
        Système: "#6b7280",
        default: "#8b5cf6",
    };

    // Générer les nœuds
    elements.forEach(node => {
        const label = node.task.replace(/"/g, '\\"');
        const service = node.service;
        const color = serviceColors[service] || serviceColors.default;
        const className = service.replace(/\s+/g, "_");

        let shape = "";
        switch (node.type) {
            case "startEvent": shape = `(${label})`; break;
            case "endEvent": shape = `((${label}))`; break;
            case "gateway": shape = `{${label}}`; break;
            case "task":
            default: shape = `[${label}]`; break;
        }

        lines.push(`    ${node.id}${shape}:::${className}`);
        lines.push(`    classDef ${className} fill:${color}20,stroke:${color},stroke-width:2px,color:${color},font-weight:500`);
    });

    // Générer les liens
    elements.forEach(node => {
        if (node.next) lines.push(`    ${node.id} --> ${node.next}`);
        if (node.yes) lines.push(`    ${node.id} -->|Oui| ${node.yes}`);
        if (node.no) lines.push(`    ${node.id} -->|Non| ${node.no}`);
    });

    return lines.join("\n");
}
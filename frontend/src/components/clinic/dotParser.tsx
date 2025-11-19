// src/components/clinic/dotParser.ts

import { Node, Edge } from 'reactflow';

export interface ParsedGraph {
    nodes: Node[];
    edges: Edge[];
    graphAttrs: Record<string, string>;
}

/**
 * Parse DOT source to React Flow nodes and edges
 */
export const parseDotToFlow = (dotSource: string): ParsedGraph => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const graphAttrs: Record<string, string> = {};

    // Remove comments
    let cleaned = dotSource.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // Extract graph attributes
    const graphAttrRegex = /graph\s*\[([^\]]+)\]/g;
    let match;
    while ((match = graphAttrRegex.exec(cleaned)) !== null) {
        const attrs = match[1];
        const attrPairs = attrs.split(/[,;]/);
        attrPairs.forEach(pair => {
            const [key, value] = pair.split('=').map(s => s.trim().replace(/"/g, ''));
            if (key && value) {
                graphAttrs[key] = value;
            }
        });
    }

    // Extract node definitions
    const nodeRegex = /(\w+)\s*\[([^\]]+)\]/g;
    const nodeMap = new Map<string, any>();

    while ((match = nodeRegex.exec(cleaned)) !== null) {
        const nodeId = match[1];
        const attrs = match[2];

        const attrMap: Record<string, string> = {};
        const attrPairs = attrs.split(/[,;]/);

        attrPairs.forEach(pair => {
            const [key, value] = pair.split('=').map(s => s.trim().replace(/"/g, ''));
            if (key && value) {
                attrMap[key] = value;
            }
        });

        nodeMap.set(nodeId, attrMap);
    }

    // Extract edges
    const edgeRegex = /(\w+)\s*->\s*(\w+)(?:\s*\[([^\]]+)\])?/g;
    const edgeSet = new Set<string>();

    while ((match = edgeRegex.exec(cleaned)) !== null) {
        const sourceId = match[1];
        const targetId = match[2];
        const edgeAttrs = match[3];

        const edgeKey = `${sourceId}-${targetId}`;
        if (edgeSet.has(edgeKey)) continue;
        edgeSet.add(edgeKey);

        // Ensure nodes exist
        if (!nodeMap.has(sourceId)) {
            nodeMap.set(sourceId, { label: sourceId });
        }
        if (!nodeMap.has(targetId)) {
            nodeMap.set(targetId, { label: targetId });
        }

        const edgeAttrMap: Record<string, string> = {};
        if (edgeAttrs) {
            const attrPairs = edgeAttrs.split(/[,;]/);
            attrPairs.forEach(pair => {
                const [key, value] = pair.split('=').map(s => s.trim().replace(/"/g, ''));
                if (key && value) {
                    edgeAttrMap[key] = value;
                }
            });
        }

        edges.push({
            id: edgeKey,
            source: sourceId,
            target: targetId,
            label: edgeAttrMap.label || '',
            type: 'smoothstep',
            animated: false,
        });
    }

    // Create nodes with auto-layout positions
    let yOffset = 0;
    const nodeSpacing = 150;

    nodeMap.forEach((attrs, nodeId) => {
        nodes.push({
            id: nodeId,
            type: 'default',
            position: { x: 250, y: yOffset },
            data: {
                label: attrs.label || nodeId,
                shape: attrs.shape || 'box',
                color: attrs.color || attrs.fillcolor || '#ffffff',
            },
            style: {
                background: attrs.fillcolor || '#fff',
                border: '2px solid #3b82f6',
                borderRadius: attrs.shape === 'ellipse' ? '50%' : '8px',
                padding: '10px 20px',
                fontSize: '14px',
                width: 'auto',
                minWidth: '100px',
            },
        });
        yOffset += nodeSpacing;
    });

    return { nodes, edges, graphAttrs };
};

/**
 * Generate DOT source from React Flow nodes and edges
 */
export const generateDotFromFlow = (nodes: Node[], edges: Edge[], graphAttrs: Record<string, string> = {}): string => {
    let dot = 'digraph G {\n';

    // Add graph attributes
    if (Object.keys(graphAttrs).length > 0) {
        dot += '  graph [';
        const attrs = Object.entries(graphAttrs).map(([k, v]) => `${k}="${v}"`).join(', ');
        dot += attrs;
        dot += '];\n';
    } else {
        dot += '  graph [rankdir=TB, nodesep=0.5, ranksep=1];\n';
    }

    dot += '  node [shape=box, style=filled, fillcolor=white];\n\n';

    // Add nodes
    nodes.forEach(node => {
        const label = node.data.label || node.id;
        const shape = node.data.shape || 'box';
        const color = node.data.color || '#ffffff';

        dot += `  ${node.id} [label="${label}", shape=${shape}, fillcolor="${color}"];\n`;
    });

    dot += '\n';

    // Add edges
    edges.forEach(edge => {
        if (edge.label) {
            dot += `  ${edge.source} -> ${edge.target} [label="${edge.label}"];\n`;
        } else {
            dot += `  ${edge.source} -> ${edge.target};\n`;
        }
    });

    dot += '}\n';

    return dot;
};

/**
 * Auto-layout nodes using a simple hierarchical layout
 */
export const autoLayoutNodes = (nodes: Node[], edges: Edge[]): Node[] => {
    // Build adjacency list
    const adjacency = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    nodes.forEach(node => {
        adjacency.set(node.id, []);
        inDegree.set(node.id, 0);
    });

    edges.forEach(edge => {
        adjacency.get(edge.source)?.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    });

    // Topological sort (Kahn's algorithm)
    const levels: string[][] = [];
    const queue: string[] = [];
    const visited = new Set<string>();

    // Find root nodes (no incoming edges)
    nodes.forEach(node => {
        if ((inDegree.get(node.id) || 0) === 0) {
            queue.push(node.id);
        }
    });

    // BFS to determine levels
    while (queue.length > 0) {
        const levelSize = queue.length;
        const currentLevel: string[] = [];

        for (let i = 0; i < levelSize; i++) {
            const nodeId = queue.shift()!;
            currentLevel.push(nodeId);
            visited.add(nodeId);

            const neighbors = adjacency.get(nodeId) || [];
            neighbors.forEach(neighbor => {
                const degree = inDegree.get(neighbor) || 0;
                inDegree.set(neighbor, degree - 1);

                if (degree - 1 === 0 && !visited.has(neighbor)) {
                    queue.push(neighbor);
                }
            });
        }

        if (currentLevel.length > 0) {
            levels.push(currentLevel);
        }
    }

    // Add any remaining nodes (cycles)
    nodes.forEach(node => {
        if (!visited.has(node.id)) {
            levels[levels.length - 1]?.push(node.id) || levels.push([node.id]);
        }
    });

    // Position nodes
    const xSpacing = 200;
    const ySpacing = 150;
    const layoutedNodes: Node[] = [];

    levels.forEach((level, levelIndex) => {
        const levelWidth = (level.length - 1) * xSpacing;
        const startX = -levelWidth / 2 + 400; // Center horizontally

        level.forEach((nodeId, nodeIndex) => {
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
                layoutedNodes.push({
                    ...node,
                    position: {
                        x: startX + nodeIndex * xSpacing,
                        y: levelIndex * ySpacing + 50,
                    },
                });
            }
        });
    });

    return layoutedNodes;
};
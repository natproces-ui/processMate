// src/components/clinic/EditorView.tsx

'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ReactFlow, {
    Node,
    Edge,
    Controls,
    Background,
    applyNodeChanges,
    applyEdgeChanges,
    NodeChange,
    EdgeChange,
    Connection,
    addEdge,
    MiniMap,
    NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { VizInstance, downloadTextFile, downloadSvgFromDot, renderDotToSvg } from './flowchartUtils';
import { parseDotToFlow, generateDotFromFlow, autoLayoutNodes } from './dotParser';
import CustomNode from './CustomNode';
import PropertiesPanel from './PropertiesPanel';

interface EditorViewProps {
    dotSource: string;
    onDotSourceChange: (source: string) => void;
    vizInstance: VizInstance | null;
    currentFileName: string;
}

export default function EditorView({
    dotSource,
    onDotSourceChange,
    vizInstance,
    currentFileName,
}: EditorViewProps) {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [graphAttrs, setGraphAttrs] = useState<Record<string, string>>({});
    const [viewMode, setViewMode] = useState<'visual' | 'code' | 'split'>('visual');
    const [localDotSource, setLocalDotSource] = useState(dotSource);
    const [svgPreview, setSvgPreview] = useState<string>('');
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
    const svgContainerRef = useRef<HTMLDivElement>(null);

    // Custom node types
    const nodeTypes: NodeTypes = useMemo(() => ({
        default: CustomNode,
    }), []);

    // Parse DOT to Flow on mount
    useEffect(() => {
        if (dotSource && dotSource !== localDotSource) {
            try {
                const parsed = parseDotToFlow(dotSource);
                const layouted = autoLayoutNodes(parsed.nodes, parsed.edges);

                // Add onLabelChange callback to all nodes
                const nodesWithCallbacks = layouted.map(node => ({
                    ...node,
                    data: {
                        ...node.data,
                        onLabelChange: handleNodeLabelChange,
                    },
                }));

                setNodes(nodesWithCallbacks);
                setEdges(parsed.edges);
                setGraphAttrs(parsed.graphAttrs);
                setLocalDotSource(dotSource);
                updateSvgPreview(dotSource);
            } catch (error) {
                console.error('Error parsing DOT:', error);
            }
        }
    }, [dotSource]);

    // Update SVG preview
    const updateSvgPreview = async (dot: string) => {
        if (!vizInstance || !svgContainerRef.current) return;

        try {
            const svg = await renderDotToSvg(vizInstance, dot);
            if (svg && svgContainerRef.current) {
                svgContainerRef.current.innerHTML = '';
                svgContainerRef.current.appendChild(svg);
            }
        } catch (error) {
            console.error('Error rendering SVG:', error);
            if (svgContainerRef.current) {
                svgContainerRef.current.innerHTML = `<div style="color: #e74c3c; padding: 20px;">Erreur: ${error}</div>`;
            }
        }
    };

    // Sync Flow to DOT and SVG
    const syncFlowToDot = useCallback(async () => {
        const newDot = generateDotFromFlow(nodes, edges, graphAttrs);
        setLocalDotSource(newDot);
        onDotSourceChange(newDot);
        await updateSvgPreview(newDot);
    }, [nodes, edges, graphAttrs, onDotSourceChange, vizInstance]);

    // Handle node label change from CustomNode
    const handleNodeLabelChange = useCallback((nodeId: string, newLabel: string) => {
        setNodes(prevNodes => {
            const updated = prevNodes.map(n =>
                n.id === nodeId
                    ? { ...n, data: { ...n.data, label: newLabel } }
                    : n
            );
            return updated;
        });
        // Trigger sync after a short delay
        setTimeout(syncFlowToDot, 100);
    }, [syncFlowToDot]);

    // Node changes handler
    const onNodesChange = useCallback(
        (changes: NodeChange[]) => {
            const updatedNodes = applyNodeChanges(changes, nodes);
            setNodes(updatedNodes);
            setTimeout(syncFlowToDot, 300);
        },
        [nodes, syncFlowToDot]
    );

    // Edge changes handler
    const onEdgesChange = useCallback(
        (changes: EdgeChange[]) => {
            const updatedEdges = applyEdgeChanges(changes, edges);
            setEdges(updatedEdges);
            setTimeout(syncFlowToDot, 300);
        },
        [edges, syncFlowToDot]
    );

    // Connection handler
    const onConnect = useCallback(
        (connection: Connection) => {
            const newEdges = addEdge(
                {
                    ...connection,
                    type: 'smoothstep',
                    animated: false,
                },
                edges
            );
            setEdges(newEdges);
            setTimeout(syncFlowToDot, 300);
        },
        [edges, syncFlowToDot]
    );

    // Selection handlers
    const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
        setSelectedNode(node);
        setSelectedEdge(null);
    }, []);

    const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
        setSelectedEdge(edge);
        setSelectedNode(null);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
        setSelectedEdge(null);
    }, []);

    // Update node from properties panel
    const handleNodeUpdate = useCallback((nodeId: string, updates: any) => {
        setNodes(prevNodes => {
            const updated = prevNodes.map(n =>
                n.id === nodeId
                    ? { ...n, data: { ...n.data, ...updates } }
                    : n
            );
            return updated;
        });

        // Update selected node
        setSelectedNode(prev =>
            prev?.id === nodeId
                ? { ...prev, data: { ...prev.data, ...updates } }
                : prev
        );

        setTimeout(syncFlowToDot, 100);
    }, [syncFlowToDot]);

    // Update edge from properties panel
    const handleEdgeUpdate = useCallback((edgeId: string, updates: any) => {
        setEdges(prevEdges => {
            const updated = prevEdges.map(e =>
                e.id === edgeId
                    ? { ...e, ...updates }
                    : e
            );
            return updated;
        });

        // Update selected edge
        setSelectedEdge(prev =>
            prev?.id === edgeId
                ? { ...prev, ...updates }
                : prev
        );

        setTimeout(syncFlowToDot, 100);
    }, [syncFlowToDot]);

    // Auto-layout
    const handleAutoLayout = () => {
        const layouted = autoLayoutNodes(nodes, edges);
        setNodes(layouted);
        setTimeout(syncFlowToDot, 300);
    };

    // Add new node
    const handleAddNode = () => {
        const nodeId = `node_${Date.now()}`;
        const newNode: Node = {
            id: nodeId,
            type: 'default',
            position: { x: 250, y: nodes.length * 150 },
            data: {
                label: 'New Node',
                shape: 'box',
                color: '#ffffff',
                onLabelChange: handleNodeLabelChange,
            },
        };
        setNodes([...nodes, newNode]);
        setTimeout(syncFlowToDot, 300);
    };

    // Delete selected
    const handleDelete = () => {
        if (selectedNode) {
            setNodes(nodes.filter(n => n.id !== selectedNode.id));
            setEdges(edges.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
            setSelectedNode(null);
        } else if (selectedEdge) {
            setEdges(edges.filter(e => e.id !== selectedEdge.id));
            setSelectedEdge(null);
        } else {
            const remainingNodes = nodes.filter(n => !n.selected);
            const remainingEdges = edges.filter(e => !e.selected);
            setNodes(remainingNodes);
            setEdges(remainingEdges);
        }
        setTimeout(syncFlowToDot, 300);
    };

    // Parse code to visual
    const handleParseCode = async () => {
        try {
            const parsed = parseDotToFlow(localDotSource);
            const layouted = autoLayoutNodes(parsed.nodes, parsed.edges);

            const nodesWithCallbacks = layouted.map(node => ({
                ...node,
                data: {
                    ...node.data,
                    onLabelChange: handleNodeLabelChange,
                },
            }));

            setNodes(nodesWithCallbacks);
            setEdges(parsed.edges);
            setGraphAttrs(parsed.graphAttrs);
            onDotSourceChange(localDotSource);
            await updateSvgPreview(localDotSource);
        } catch (error: any) {
            alert('Error parsing DOT code: ' + error.message);
        }
    };

    const handleDownloadDot = () => {
        downloadTextFile(localDotSource, `${currentFileName}_flowchart.dot`);
    };

    const handleDownloadSvg = async () => {
        if (!vizInstance) {
            alert('Viz.js non initialisé');
            return;
        }
        try {
            await downloadSvgFromDot(vizInstance, localDotSource, `${currentFileName}_flowchart.svg`);
        } catch (error: any) {
            alert('Erreur lors de l\'export SVG: ' + error.message);
        }
    };

    return (
        <div className="tab-content active">
            {/* Controls */}
            <div className="editor-controls" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        className={viewMode === 'visual' ? 'control-btn' : 'download-btn'}
                        onClick={() => setViewMode('visual')}
                    >
                        🎨 Visual
                    </button>
                    <button
                        className={viewMode === 'split' ? 'control-btn' : 'download-btn'}
                        onClick={() => setViewMode('split')}
                    >
                        ⚡ Split View
                    </button>
                    <button
                        className={viewMode === 'code' ? 'control-btn' : 'download-btn'}
                        onClick={() => setViewMode('code')}
                    >
                        💻 Code
                    </button>
                </div>

                {(viewMode === 'visual' || viewMode === 'split') && (
                    <>
                        <button className="control-btn" onClick={handleAddNode}>➕ Add</button>
                        <button className="control-btn" onClick={handleDelete}>🗑️ Delete</button>
                        <button className="control-btn" onClick={handleAutoLayout}>📐 Layout</button>
                    </>
                )}

                {viewMode === 'code' && (
                    <button className="control-btn" onClick={handleParseCode}>🔄 Apply</button>
                )}

                <button className="download-btn" onClick={handleDownloadDot}>💾 .dot</button>
                <button className="download-btn" onClick={handleDownloadSvg}>📥 SVG</button>
            </div>

            {/* Visual Mode */}
            {viewMode === 'visual' && (
                <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ flex: 1, height: '600px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onNodeClick={onNodeClick}
                            onEdgeClick={onEdgeClick}
                            onPaneClick={onPaneClick}
                            nodeTypes={nodeTypes}
                            fitView
                            attributionPosition="bottom-left"
                        >
                            <Background />
                            <Controls />
                            <MiniMap zoomable pannable />
                        </ReactFlow>
                    </div>
                    <PropertiesPanel
                        selectedNode={selectedNode}
                        selectedEdge={selectedEdge}
                        onNodeUpdate={handleNodeUpdate}
                        onEdgeUpdate={handleEdgeUpdate}
                    />
                </div>
            )}

            {/* Split View */}
            {viewMode === 'split' && (
                <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ flex: 1, height: '600px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onNodeClick={onNodeClick}
                            onEdgeClick={onEdgeClick}
                            onPaneClick={onPaneClick}
                            nodeTypes={nodeTypes}
                            fitView
                            attributionPosition="bottom-left"
                        >
                            <Background />
                            <Controls />
                            <MiniMap zoomable pannable />
                        </ReactFlow>
                    </div>
                    <div style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: '8px', padding: '15px', overflow: 'auto', height: '600px' }}>
                        <div style={{ fontWeight: '600', marginBottom: '10px', color: '#1f2937' }}>🎨 Live SVG Preview</div>
                        <div ref={svgContainerRef} style={{ background: '#f9fafb', padding: '20px', borderRadius: '6px', minHeight: '500px' }} />
                    </div>
                </div>
            )}

            {/* Code Mode */}
            {viewMode === 'code' && (
                <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', marginBottom: '10px', color: '#1f2937' }}>Code source (DOT)</div>
                        <textarea
                            className="code-editor"
                            value={localDotSource}
                            onChange={(e) => setLocalDotSource(e.target.value)}
                            spellCheck={false}
                            style={{ height: '550px', fontFamily: 'monospace', fontSize: '13px' }}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', marginBottom: '10px', color: '#1f2937' }}>Aperçu SVG</div>
                        <div
                            ref={svgContainerRef}
                            style={{
                                background: '#f9fafb',
                                padding: '20px',
                                borderRadius: '6px',
                                height: '550px',
                                overflow: 'auto',
                                border: '1px solid #e5e7eb'
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Tips */}
            <div style={{
                marginTop: '15px',
                padding: '12px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                fontSize: '13px',
                color: '#1e40af'
            }}>
                <strong>💡 Tips:</strong> Double-cliquez sur les nœuds pour éditer directement • Utilisez le panneau de propriétés pour personnaliser • Drag & drop pour repositionner • Glissez depuis le bord d'un nœud pour créer des connexions
            </div>
        </div>
    );
}
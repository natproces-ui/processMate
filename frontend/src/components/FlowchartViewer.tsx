import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
    Node,
    Edge,
    Controls,
    Background,
    MiniMap,
    useNodesState,
    useEdgesState,
    MarkerType,
    Position,
} from 'reactflow';
import 'reactflow/dist/style.css';

interface ProcessNode {
    id: string;
    type: 'startEvent' | 'endEvent' | 'task' | 'gateway';
    task: string;
    service: string;
    condition?: string;
    next?: string;
    yes?: string;
    no?: string;
}

interface ProcessStructure {
    elements: ProcessNode[];
}

interface FlowchartViewerProps {
    data: ProcessStructure;
}

// MEGA-style Custom Nodes
function StartNode({ data }: any) {
    return (
        <div className="relative group">
            <div className="absolute inset-0 bg-red-600 rounded-full blur-md opacity-20 group-hover:opacity-40 transition-opacity"></div>
            <div className="relative px-8 py-4 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-red-600 shadow-2xl">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-600 animate-pulse"></div>
                    <div>
                        <div className="font-bold text-red-500 text-sm uppercase tracking-wider">{data.label}</div>
                        <div className="text-xs text-gray-400 font-mono">{data.service}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function EndNode({ data }: any) {
    return (
        <div className="relative group">
            <div className="absolute inset-0 bg-red-600 rounded-full blur-md opacity-20 group-hover:opacity-40 transition-opacity"></div>
            <div className="relative px-8 py-4 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-red-600 shadow-2xl">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-600"></div>
                    <div>
                        <div className="font-bold text-red-500 text-sm uppercase tracking-wider">{data.label}</div>
                        <div className="text-xs text-gray-400 font-mono">{data.service}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TaskNode({ data }: any) {
    return (
        <div className="relative group">
            <div className="absolute inset-0 bg-red-600 blur-sm opacity-0 group-hover:opacity-20 transition-opacity"></div>
            <div className="relative px-6 py-4 bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 hover:border-red-600 shadow-2xl min-w-[220px] transition-all">
                <div className="flex items-start gap-3">
                    <div className="w-2 h-2 mt-1 bg-red-600 flex-shrink-0"></div>
                    <div className="flex-1">
                        <div className="font-semibold text-gray-100 text-sm mb-2 leading-tight">{data.label}</div>
                        <div className="text-xs text-red-500 bg-gray-900 px-2 py-1 font-mono border border-gray-800 inline-block">
                            {data.service}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function GatewayNode({ data }: any) {
    return (
        <div className="relative group">
            <div className="absolute inset-0 bg-red-600 blur-md opacity-10 group-hover:opacity-30 transition-opacity transform rotate-45"></div>
            <div className="relative w-40 h-40 bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-red-600 shadow-2xl transform rotate-45 flex items-center justify-center">
                <div className="transform -rotate-45 text-center p-3">
                    <div className="w-4 h-4 bg-red-600 mx-auto mb-2"></div>
                    <div className="font-bold text-gray-100 text-xs uppercase tracking-wide mb-1">{data.label}</div>
                    {data.condition && (
                        <div className="text-xs text-red-400 italic font-mono mt-1">{data.condition}</div>
                    )}
                </div>
            </div>
        </div>
    );
}

const nodeTypes = {
    startNode: StartNode,
    endNode: EndNode,
    taskNode: TaskNode,
    gatewayNode: GatewayNode,
};

export default function FlowchartViewer({ data }: FlowchartViewerProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const { nodes: generatedNodes, edges: generatedEdges } = convertToReactFlow(data);
        setNodes(generatedNodes);
        setEdges(generatedEdges);
        setIsLoading(false);
    }, [data, setNodes, setEdges]);

    const onNodeClick = useCallback((event: any, node: Node) => {
        console.log('Node clicked:', node);
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12 bg-gradient-to-br from-gray-900 to-black rounded-lg border border-gray-800">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-red-600 animate-pulse"></div>
                    <div className="text-gray-400 font-mono text-sm uppercase tracking-wider">Loading Process Flow...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-8">
            {/* MEGA-style Header */}
            <div className="mb-6 p-6 bg-gradient-to-r from-gray-900 via-black to-gray-900 border-l-4 border-red-600 shadow-2xl">
                <div className="flex items-center gap-4 mb-3">
                    <div className="w-1 h-8 bg-red-600"></div>
                    <h2 className="text-2xl font-bold text-gray-100 uppercase tracking-wider">
                        Process Flowchart
                    </h2>
                </div>
                <div className="pl-5 space-y-2 text-sm text-gray-400 font-mono">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-red-600"></div>
                        <span>Drag nodes to reposition</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-red-600"></div>
                        <span>Scroll to zoom • Click to select</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-red-600"></div>
                        <span>Drag canvas to pan</span>
                    </div>
                </div>
            </div>

            {/* MEGA-style Flowchart Container */}
            <div className="bg-black border-2 border-gray-800 shadow-2xl overflow-hidden" style={{ height: '700px' }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={onNodeClick}
                    nodeTypes={nodeTypes}
                    fitView
                    attributionPosition="bottom-left"
                    className="bg-gradient-to-br from-gray-950 via-black to-gray-950"
                >
                    <Background
                        color="#1f2937"
                        gap={20}
                        size={1}
                        style={{ opacity: 0.3 }}
                    />
                    <Controls
                        className="bg-gray-900 border-2 border-gray-800 shadow-2xl [&_button]:bg-gray-800 [&_button]:border-gray-700 [&_button]:text-gray-400 [&_button:hover]:bg-red-600 [&_button:hover]:text-white [&_button:hover]:border-red-600"
                    />
                    <MiniMap
                        className="bg-gray-900 border-2 border-gray-800 shadow-2xl opacity-80"
                        maskColor="rgba(0, 0, 0, 0.8)"
                        nodeColor={(node) => {
                            switch (node.type) {
                                case 'startNode': return '#dc2626';
                                case 'endNode': return '#dc2626';
                                case 'gatewayNode': return '#dc2626';
                                default: return '#374151';
                            }
                        }}
                    />
                </ReactFlow>
            </div>

            {/* MEGA-style Legend */}
            <div className="mt-6 p-5 bg-gradient-to-br from-gray-900 to-black border border-gray-800 shadow-xl">
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-4 bg-red-600"></div>
                    <span className="text-xs text-gray-400 uppercase tracking-wider font-mono">Legend</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                    <div className="flex items-center gap-3 p-2 bg-gray-950 border border-gray-800">
                        <div className="w-3 h-3 rounded-full bg-red-600 border border-red-500 flex-shrink-0"></div>
                        <span className="text-gray-400">Start/End</span>
                    </div>
                    <div className="flex items-center gap-3 p-2 bg-gray-950 border border-gray-800">
                        <div className="w-3 h-3 bg-gray-700 border border-gray-600 flex-shrink-0"></div>
                        <span className="text-gray-400">Task</span>
                    </div>
                    <div className="flex items-center gap-3 p-2 bg-gray-950 border border-gray-800">
                        <div className="w-3 h-3 bg-red-600 border border-red-500 transform rotate-45 flex-shrink-0"></div>
                        <span className="text-gray-400">Decision</span>
                    </div>
                    <div className="flex items-center gap-3 p-2 bg-gray-950 border border-gray-800">
                        <div className="w-8 h-0.5 bg-red-600 flex-shrink-0"></div>
                        <span className="text-gray-400">Flow</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function convertToReactFlow(data: ProcessStructure): { nodes: Node[], edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const nodePositions = calculateLayout(data);

    data.elements.forEach((element, index) => {
        const position = nodePositions[element.id] || { x: 250, y: index * 150 };

        let nodeType = 'taskNode';
        switch (element.type) {
            case 'startEvent':
                nodeType = 'startNode';
                break;
            case 'endEvent':
                nodeType = 'endNode';
                break;
            case 'gateway':
                nodeType = 'gatewayNode';
                break;
        }

        nodes.push({
            id: element.id,
            type: nodeType,
            position,
            data: {
                label: element.task,
                service: element.service,
                condition: element.condition,
            },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
        });

        // MEGA-style edges
        if (element.type === 'task' || element.type === 'startEvent') {
            if (element.next) {
                edges.push({
                    id: `${element.id}-${element.next}`,
                    source: element.id,
                    target: element.next,
                    type: 'smoothstep',
                    animated: true,
                    style: { stroke: '#dc2626', strokeWidth: 2 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#dc2626' },
                });
            }
        } else if (element.type === 'gateway') {
            if (element.yes) {
                edges.push({
                    id: `${element.id}-yes-${element.yes}`,
                    source: element.id,
                    target: element.yes,
                    label: 'YES',
                    type: 'smoothstep',
                    animated: true,
                    style: { stroke: '#dc2626', strokeWidth: 2 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#dc2626' },
                    labelStyle: { fill: '#dc2626', fontWeight: 700, fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase' },
                    labelBgStyle: { fill: '#1f2937', opacity: 0.9 },
                });
            }
            if (element.no) {
                edges.push({
                    id: `${element.id}-no-${element.no}`,
                    source: element.id,
                    target: element.no,
                    label: 'NO',
                    type: 'smoothstep',
                    animated: true,
                    style: { stroke: '#6b7280', strokeWidth: 2 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' },
                    labelStyle: { fill: '#9ca3af', fontWeight: 700, fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase' },
                    labelBgStyle: { fill: '#1f2937', opacity: 0.9 },
                });
            }
        }
    });

    return { nodes, edges };
}

function calculateLayout(data: ProcessStructure): Record<string, { x: number, y: number }> {
    const positions: Record<string, { x: number, y: number }> = {};
    const visited = new Set<string>();
    const levels: Record<string, number> = {};

    const startNode = data.elements.find(e => e.type === 'startEvent');
    if (!startNode) return positions;

    function calculateLevels(nodeId: string, level: number) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        levels[nodeId] = level;

        const node = data.elements.find(e => e.id === nodeId);
        if (!node) return;

        if (node.type === 'gateway') {
            if (node.yes) calculateLevels(node.yes, level + 1);
            if (node.no) calculateLevels(node.no, level + 1);
        } else if (node.next) {
            calculateLevels(node.next, level + 1);
        }
    }

    calculateLevels(startNode.id, 0);

    const nodesByLevel: Record<number, string[]> = {};
    Object.entries(levels).forEach(([nodeId, level]) => {
        if (!nodesByLevel[level]) nodesByLevel[level] = [];
        nodesByLevel[level].push(nodeId);
    });

    Object.entries(nodesByLevel).forEach(([level, nodeIds]) => {
        const levelNum = parseInt(level);
        const y = levelNum * 220 + 50;
        const totalWidth = nodeIds.length * 350;
        const startX = Math.max(50, (1000 - totalWidth) / 2);

        nodeIds.forEach((nodeId, index) => {
            positions[nodeId] = {
                x: startX + index * 350,
                y: y,
            };
        });
    });

    return positions;
}
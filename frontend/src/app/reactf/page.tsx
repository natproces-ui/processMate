'use client';

import React, { useState, useCallback, useMemo } from 'react';
import ReactFlow, {
    Node,
    Edge,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    MarkerType,
    Position,
    Handle,
    NodeProps,
    ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';

// ============================================
// TYPES
// ============================================

interface TableRow {
    id: string;
    étape: string;
    typeBpmn: 'StartEvent' | 'Task' | 'ExclusiveGateway' | 'EndEvent';
    acteur: string;
    condition: string;
    outputOui: string;
    outputNon: string;
}

// ============================================
// CONSTANTES
// ============================================

const LANE_WIDTH = 280;
const LANE_HEADER_HEIGHT = 50;
const NODE_WIDTH = 220;
const NODE_HEIGHT = 70;
const VERTICAL_SPACING = 120;
const MARGIN_TOP = 80;
const MARGIN_LEFT = 40;

const LANE_COLORS = [
    { bg: '#EEF2FF', border: '#6366F1', header: '#4F46E5' }, // Indigo
    { bg: '#FEF3C7', border: '#F59E0B', header: '#D97706' }, // Amber
    { bg: '#D1FAE5', border: '#10B981', header: '#059669' }, // Emerald
    { bg: '#FCE7F3', border: '#EC4899', header: '#DB2777' }, // Pink
    { bg: '#E0E7FF', border: '#6366F1', header: '#4338CA' }, // Indigo dark
    { bg: '#CFFAFE', border: '#06B6D4', header: '#0891B2' }, // Cyan
    { bg: '#FEE2E2', border: '#EF4444', header: '#DC2626' }, // Red
    { bg: '#F3E8FF', border: '#A855F7', header: '#9333EA' }, // Purple
];

// ============================================
// CUSTOM NODES
// ============================================

// Start Event Node
const StartEventNode: React.FC<NodeProps> = ({ data }) => {
    return (
        <div className="flex flex-col items-center">
            <div
                className="w-12 h-12 rounded-full border-[3px] border-green-500 bg-green-50 flex items-center justify-center shadow-sm"
            >
                <div className="w-4 h-4 rounded-full bg-green-500" />
            </div>
            <div className="mt-2 text-xs font-medium text-gray-700 text-center max-w-[150px]">
                {data.label}
            </div>
            <Handle type="source" position={Position.Bottom} className="!bg-green-500 !w-2 !h-2" />
        </div>
    );
};

// End Event Node
const EndEventNode: React.FC<NodeProps> = ({ data }) => {
    return (
        <div className="flex flex-col items-center">
            <Handle type="target" position={Position.Top} className="!bg-red-500 !w-2 !h-2" />
            <div
                className="w-12 h-12 rounded-full border-[4px] border-red-500 bg-red-50 flex items-center justify-center shadow-sm"
            >
                <div className="w-5 h-5 rounded-full bg-red-500" />
            </div>
            <div className="mt-2 text-xs font-medium text-gray-700 text-center max-w-[150px]">
                {data.label}
            </div>
        </div>
    );
};

// Task Node
const TaskNode: React.FC<NodeProps> = ({ data }) => {
    return (
        <div
            className="bg-white border-2 border-blue-400 rounded-lg shadow-md px-4 py-3 min-w-[200px] max-w-[220px]"
            style={{ borderLeft: '4px solid #3B82F6' }}
        >
            <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-2 !h-2" />
            <div className="text-sm font-medium text-gray-800 text-center leading-tight">
                {data.label}
            </div>
            {data.tool && (
                <div className="mt-2 text-xs text-gray-500 text-center flex items-center justify-center gap-1">
                    <span>🔧</span> {data.tool}
                </div>
            )}
            <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-2 !h-2" />
        </div>
    );
};

// Gateway Node
const GatewayNode: React.FC<NodeProps> = ({ data }) => {
    return (
        <div className="flex flex-col items-center">
            <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-2 !h-2" />
            <div
                className="w-14 h-14 bg-amber-50 border-[3px] border-amber-500 shadow-md flex items-center justify-center"
                style={{ transform: 'rotate(45deg)' }}
            >
                <span style={{ transform: 'rotate(-45deg)' }} className="text-amber-600 font-bold text-lg">
                    ✕
                </span>
            </div>
            <div className="mt-3 text-xs font-medium text-gray-700 text-center max-w-[160px] bg-amber-50 px-2 py-1 rounded border border-amber-200">
                {data.label}
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                id="no"
                className="!bg-red-500 !w-2 !h-2"
                style={{ left: '30%' }}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="yes"
                className="!bg-green-500 !w-2 !h-2"
            />
        </div>
    );
};

const nodeTypes = {
    startEvent: StartEventNode,
    endEvent: EndEventNode,
    task: TaskNode,
    gateway: GatewayNode,
};

// ============================================
// DONNÉES DE TEST
// ============================================

const defaultData: TableRow[] = [
    { id: '1', étape: 'Début du processus', typeBpmn: 'StartEvent', acteur: 'Client', condition: '', outputOui: '2', outputNon: '' },
    { id: '2', étape: 'Soumettre la demande en ligne', typeBpmn: 'Task', acteur: 'Client', condition: '', outputOui: '3', outputNon: '' },
    { id: '3', étape: 'Réceptionner la demande', typeBpmn: 'Task', acteur: 'Agent commercial', condition: '', outputOui: '4', outputNon: '' },
    { id: '4', étape: 'Vérifier les documents', typeBpmn: 'Task', acteur: 'Agent commercial', condition: '', outputOui: '5', outputNon: '' },
    { id: '5', étape: 'Documents complets ?', typeBpmn: 'ExclusiveGateway', acteur: 'Agent commercial', condition: 'Documents OK ?', outputOui: '6', outputNon: '2' },
    { id: '6', étape: 'Transmettre au service conformité', typeBpmn: 'Task', acteur: 'Agent commercial', condition: '', outputOui: '7', outputNon: '' },
    { id: '7', étape: 'Analyser le dossier', typeBpmn: 'Task', acteur: 'Conformité', condition: '', outputOui: '8', outputNon: '' },
    { id: '8', étape: 'Dossier conforme ?', typeBpmn: 'ExclusiveGateway', acteur: 'Conformité', condition: 'Conforme ?', outputOui: '9', outputNon: '10' },
    { id: '9', étape: 'Valider le dossier', typeBpmn: 'Task', acteur: 'Conformité', condition: '', outputOui: '11', outputNon: '' },
    { id: '10', étape: 'Rejeter le dossier', typeBpmn: 'Task', acteur: 'Conformité', condition: '', outputOui: '12', outputNon: '' },
    { id: '11', étape: 'Créer le compte', typeBpmn: 'Task', acteur: 'Back Office', condition: '', outputOui: '13', outputNon: '' },
    { id: '12', étape: 'Notifier le rejet', typeBpmn: 'Task', acteur: 'Agent commercial', condition: '', outputOui: '14', outputNon: '' },
    { id: '13', étape: 'Compte créé avec succès', typeBpmn: 'EndEvent', acteur: 'Back Office', condition: '', outputOui: '', outputNon: '' },
    { id: '14', étape: 'Processus terminé (rejet)', typeBpmn: 'EndEvent', acteur: 'Client', condition: '', outputOui: '', outputNon: '' },
];

// ============================================
// GÉNÉRATEUR BPMN REACTFLOW
// ============================================

function generateReactFlowBPMN(data: TableRow[]): { nodes: Node[]; edges: Edge[]; lanes: any[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Extraire les acteurs uniques (dans l'ordre d'apparition)
    const acteurs: string[] = [];
    data.forEach(row => {
        if (!acteurs.includes(row.acteur)) {
            acteurs.push(row.acteur);
        }
    });

    // Calculer la progression verticale par lane
    const laneProgress: Map<string, number> = new Map();
    acteurs.forEach(a => laneProgress.set(a, 0));

    // Générer les lanes
    const lanes = acteurs.map((acteur, index) => ({
        id: `lane-${index}`,
        acteur,
        x: MARGIN_LEFT + index * LANE_WIDTH,
        color: LANE_COLORS[index % LANE_COLORS.length],
    }));

    // Calculer les positions et créer les nodes
    const positions: Map<string, { x: number; y: number; laneIndex: number }> = new Map();

    data.forEach(row => {
        const laneIndex = acteurs.indexOf(row.acteur);
        const currentProgress = laneProgress.get(row.acteur) || 0;

        const x = MARGIN_LEFT + laneIndex * LANE_WIDTH + (LANE_WIDTH - NODE_WIDTH) / 2;
        const y = MARGIN_TOP + LANE_HEADER_HEIGHT + currentProgress * VERTICAL_SPACING;

        positions.set(row.id, { x, y, laneIndex });
        laneProgress.set(row.acteur, currentProgress + 1);

        // Déterminer le type de node
        let nodeType = 'task';
        if (row.typeBpmn === 'StartEvent') nodeType = 'startEvent';
        else if (row.typeBpmn === 'EndEvent') nodeType = 'endEvent';
        else if (row.typeBpmn === 'ExclusiveGateway') nodeType = 'gateway';

        nodes.push({
            id: row.id,
            type: nodeType,
            position: { x, y },
            data: {
                label: row.typeBpmn === 'ExclusiveGateway' ? row.condition : row.étape,
            },
        });
    });

    // Générer les edges
    data.forEach(row => {
        const sourcePos = positions.get(row.id);
        if (!sourcePos) return;

        // Edge OUI / NEXT
        if (row.outputOui && row.outputOui.trim() !== '') {
            const targetPos = positions.get(row.outputOui);
            if (targetPos) {
                const isGateway = row.typeBpmn === 'ExclusiveGateway';
                const sameLane = sourcePos.laneIndex === targetPos.laneIndex;
                const goingRight = targetPos.laneIndex > sourcePos.laneIndex;
                const goingLeft = targetPos.laneIndex < sourcePos.laneIndex;

                let edgeType: 'default' | 'smoothstep' | 'step' = 'smoothstep';
                let animated = false;
                let style: React.CSSProperties = { stroke: '#6B7280', strokeWidth: 2 };
                let labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600 };

                if (isGateway) {
                    style = { stroke: '#10B981', strokeWidth: 2 };
                    labelStyle = { ...labelStyle, fill: '#059669', background: '#D1FAE5', padding: '2px 6px', borderRadius: '4px' };
                }

                edges.push({
                    id: `e-${row.id}-${row.outputOui}`,
                    source: row.id,
                    target: row.outputOui,
                    sourceHandle: isGateway ? 'yes' : undefined,
                    type: edgeType,
                    animated,
                    style,
                    label: isGateway ? 'Oui' : undefined,
                    labelStyle: isGateway ? labelStyle : undefined,
                    labelBgStyle: isGateway ? { fill: '#D1FAE5', fillOpacity: 0.9 } : undefined,
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        color: isGateway ? '#10B981' : '#6B7280',
                        width: 20,
                        height: 20,
                    },
                });
            }
        }

        // Edge NON (Gateway uniquement)
        if (row.typeBpmn === 'ExclusiveGateway' && row.outputNon && row.outputNon.trim() !== '') {
            const targetPos = positions.get(row.outputNon);
            if (targetPos) {
                edges.push({
                    id: `e-${row.id}-${row.outputNon}-no`,
                    source: row.id,
                    target: row.outputNon,
                    sourceHandle: 'no',
                    type: 'smoothstep',
                    style: { stroke: '#EF4444', strokeWidth: 2 },
                    label: 'Non',
                    labelStyle: { fontSize: 11, fontWeight: 600, fill: '#DC2626' },
                    labelBgStyle: { fill: '#FEE2E2', fillOpacity: 0.9 },
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        color: '#EF4444',
                        width: 20,
                        height: 20,
                    },
                });
            }
        }
    });

    // Calculer la hauteur maximale
    let maxY = 0;
    positions.forEach(pos => {
        if (pos.y > maxY) maxY = pos.y;
    });

    // Mettre à jour les lanes avec la hauteur
    lanes.forEach(lane => {
        lane.height = maxY + VERTICAL_SPACING;
    });

    return { nodes, edges, lanes };
}

// ============================================
// COMPOSANT LANE BACKGROUND
// ============================================

const LaneBackground: React.FC<{ lanes: any[] }> = ({ lanes }) => {
    const maxHeight = Math.max(...lanes.map(l => l.height || 600));

    return (
        <svg
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: -1 }}
        >
            {lanes.map((lane, index) => (
                <g key={lane.id}>
                    {/* Lane background */}
                    <rect
                        x={lane.x}
                        y={MARGIN_TOP}
                        width={LANE_WIDTH}
                        height={maxHeight}
                        fill={lane.color.bg}
                        stroke={lane.color.border}
                        strokeWidth={2}
                        rx={8}
                    />
                    {/* Lane header */}
                    <rect
                        x={lane.x}
                        y={MARGIN_TOP}
                        width={LANE_WIDTH}
                        height={LANE_HEADER_HEIGHT}
                        fill={lane.color.header}
                        rx={8}
                    />
                    <rect
                        x={lane.x}
                        y={MARGIN_TOP + LANE_HEADER_HEIGHT - 8}
                        width={LANE_WIDTH}
                        height={8}
                        fill={lane.color.header}
                    />
                    {/* Lane title */}
                    <text
                        x={lane.x + LANE_WIDTH / 2}
                        y={MARGIN_TOP + LANE_HEADER_HEIGHT / 2 + 5}
                        textAnchor="middle"
                        fill="white"
                        fontSize={14}
                        fontWeight={600}
                        fontFamily="system-ui, sans-serif"
                    >
                        {lane.acteur}
                    </text>
                </g>
            ))}
        </svg>
    );
};

// ============================================
// COMPOSANT PRINCIPAL
// ============================================

export default function BPMNReactFlowTestPage() {
    const [data, setData] = useState<TableRow[]>(defaultData);
    const [showDiagram, setShowDiagram] = useState(false);

    const { nodes: initialNodes, edges: initialEdges, lanes } = useMemo(
        () => generateReactFlowBPMN(data),
        [data]
    );

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    const handleGenerate = useCallback(() => {
        const { nodes: newNodes, edges: newEdges } = generateReactFlowBPMN(data);
        setNodes(newNodes);
        setEdges(newEdges);
        setShowDiagram(true);
    }, [data, setNodes, setEdges]);

    const handleDataChange = (index: number, field: keyof TableRow, value: string) => {
        const newData = [...data];
        newData[index] = { ...newData[index], [field]: value };
        setData(newData);
    };

    const addRow = () => {
        const newId = (Math.max(...data.map(d => parseInt(d.id))) + 1).toString();
        setData([...data, {
            id: newId,
            étape: 'Nouvelle étape',
            typeBpmn: 'Task',
            acteur: data[0]?.acteur || 'Acteur',
            condition: '',
            outputOui: '',
            outputNon: '',
        }]);
    };

    const deleteRow = (index: number) => {
        setData(data.filter((_, i) => i !== index));
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                    🧪 Test BPMN avec ReactFlow
                </h1>
                <p className="text-gray-600 mb-6">
                    Comparaison du rendu ReactFlow vs bpmn-js pour les diagrammes BPMN
                </p>

                {/* Actions */}
                <div className="mb-6 flex gap-4">
                    <button
                        onClick={handleGenerate}
                        className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                        📊 Générer le diagramme
                    </button>
                    <button
                        onClick={addRow}
                        className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
                    >
                        + Ajouter une ligne
                    </button>
                </div>

                {/* Diagramme ReactFlow */}
                {showDiagram && (
                    <div className="mb-8 bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4">
                            <h2 className="text-xl font-bold">Diagramme BPMN (ReactFlow)</h2>
                        </div>
                        <div style={{ height: 700 }} className="relative">
                            <LaneBackground lanes={lanes} />
                            <ReactFlow
                                nodes={nodes}
                                edges={edges}
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange}
                                nodeTypes={nodeTypes}
                                connectionLineType={ConnectionLineType.SmoothStep}
                                fitView
                                fitViewOptions={{ padding: 0.2 }}
                                defaultEdgeOptions={{
                                    type: 'smoothstep',
                                }}
                                proOptions={{ hideAttribution: true }}
                            >
                                <Background color="#E5E7EB" gap={20} />
                                <Controls />
                                <MiniMap
                                    nodeColor={(node) => {
                                        if (node.type === 'startEvent') return '#10B981';
                                        if (node.type === 'endEvent') return '#EF4444';
                                        if (node.type === 'gateway') return '#F59E0B';
                                        return '#3B82F6';
                                    }}
                                    maskColor="rgba(0,0,0,0.1)"
                                />
                            </ReactFlow>
                        </div>
                    </div>
                )}

                {/* Tableau de données */}
                <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
                    <div className="bg-gradient-to-r from-gray-700 to-gray-800 text-white p-4">
                        <h2 className="text-xl font-bold">Tableau des étapes</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">ID</th>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Étape</th>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Type</th>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Acteur</th>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Condition</th>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">→ Oui</th>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">→ Non</th>
                                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((row, index) => (
                                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <span className="font-mono bg-gray-200 px-2 py-1 rounded text-xs">
                                                {row.id}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                value={row.étape}
                                                onChange={(e) => handleDataChange(index, 'étape', e.target.value)}
                                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <select
                                                value={row.typeBpmn}
                                                onChange={(e) => handleDataChange(index, 'typeBpmn', e.target.value as any)}
                                                className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="StartEvent">🟢 Start</option>
                                                <option value="Task">📋 Task</option>
                                                <option value="ExclusiveGateway">🔶 Gateway</option>
                                                <option value="EndEvent">🔴 End</option>
                                            </select>
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                value={row.acteur}
                                                onChange={(e) => handleDataChange(index, 'acteur', e.target.value)}
                                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                value={row.condition}
                                                onChange={(e) => handleDataChange(index, 'condition', e.target.value)}
                                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder={row.typeBpmn === 'ExclusiveGateway' ? 'Condition...' : '-'}
                                                disabled={row.typeBpmn !== 'ExclusiveGateway'}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                value={row.outputOui}
                                                onChange={(e) => handleDataChange(index, 'outputOui', e.target.value)}
                                                className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-transparent text-center"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                value={row.outputNon}
                                                onChange={(e) => handleDataChange(index, 'outputNon', e.target.value)}
                                                className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-red-500 focus:border-transparent text-center"
                                                disabled={row.typeBpmn !== 'ExclusiveGateway'}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => deleteRow(index)}
                                                className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors text-xs font-medium"
                                            >
                                                Supprimer
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Info */}
                <div className="mt-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
                    <h3 className="font-semibold text-blue-800 mb-2">ℹ️ À propos de ce test</h3>
                    <ul className="text-sm text-blue-700 space-y-1">
                        <li>• <strong>ReactFlow</strong> offre un contrôle total sur le rendu SVG</li>
                        <li>• Les nodes sont des composants React personnalisables</li>
                        <li>• Le routing des edges utilise l'algorithme <code>smoothstep</code></li>
                        <li>• Les lanes sont dessinées en SVG pur (pas de dépendance BPMN)</li>
                        <li>• Drag & drop natif, zoom, pan, minimap inclus</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
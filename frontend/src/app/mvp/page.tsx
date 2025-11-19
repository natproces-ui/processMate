'use client';
import React, { useState, useCallback, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';

const defaultSteps = [
  { id: '1', service: 'Commercial', etape: '1.1', tache: 'Accueillir le client', type: 'Séquentielle', condition: '', siOui: '1.2', siNon: '' },
  { id: '2', service: 'Commercial', etape: '1.2', tache: 'Collecter les informations', type: 'Séquentielle', condition: '', siOui: '1.3', siNon: '' },
  { id: '3', service: 'Commercial', etape: '1.3', tache: 'Renseigner les informations', type: 'Conditionnelle', condition: 'Infos complètes?', siOui: '1.4', siNon: '1.2' },
  { id: '4', service: 'Commercial', etape: '1.4', tache: 'Soumettre le dossier', type: 'Séquentielle', condition: '', siOui: '2.1', siNon: '' },
  { id: '5', service: 'Conformité', etape: '2.1', tache: 'Contrôler authenticité docs', type: 'Conditionnelle', condition: 'Documents authentiques?', siOui: '2.2', siNon: '2.5' },
  { id: '6', service: 'Conformité', etape: '2.2', tache: 'Contrôler le KYC', type: 'Conditionnelle', condition: 'KYC vérifié?', siOui: '2.3', siNon: '2.5' },
  { id: '7', service: 'Conformité', etape: '2.3', tache: 'Analyser le profil', type: 'Conditionnelle', condition: 'Profil fiable?', siOui: '2.4', siNon: '2.5' },
  { id: '8', service: 'Conformité', etape: '2.4', tache: 'Valider le dossier', type: 'Séquentielle', condition: '', siOui: '3.1', siNon: '' },
  { id: '9', service: 'Conformité', etape: '2.5', tache: 'Retourner le dossier', type: 'Séquentielle', condition: '', siOui: '1.2', siNon: '' },
  { id: '10', service: 'Back Office', etape: '3.1', tache: 'Créer le compte', type: 'Séquentielle', condition: '', siOui: '3.2', siNon: '' },
  { id: '11', service: 'Back Office', etape: '3.2', tache: "Attribuer l'IBAN", type: 'Séquentielle', condition: '', siOui: '3.3', siNon: '' },
  { id: '12', service: 'Back Office', etape: '3.3', tache: 'Activer les services', type: 'Séquentielle', condition: '', siOui: 'FIN', siNon: '' },
];

// Composant nœud personnalisé pour tâche séquentielle
const TaskNode = ({ data }) => (
  <div className="px-4 py-3 bg-white border-2 border-blue-400 rounded-lg shadow-md min-w-[180px]">
    <div className="text-xs text-gray-500 font-semibold mb-1">{data.service}</div>
    <div className="text-sm font-medium text-gray-800">{data.etape}</div>
    <div className="text-xs text-gray-600 mt-1">{data.tache}</div>
  </div>
);

// Composant nœud pour décision conditionnelle
const DecisionNode = ({ data }) => (
  <div className="relative">
    <div className="w-32 h-32 bg-yellow-50 border-2 border-yellow-500 transform rotate-45 shadow-md"></div>
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 -rotate-45 text-center w-40">
      <div className="text-xs text-gray-500 font-semibold mb-1">{data.service}</div>
      <div className="text-xs font-medium text-gray-800">{data.condition}</div>
    </div>
  </div>
);

// Composant nœud de départ
const StartNode = () => (
  <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
    <span className="text-white font-bold text-xs">START</span>
  </div>
);

// Composant nœud de fin
const EndNode = () => (
  <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
    <span className="text-white font-bold text-xs">FIN</span>
  </div>
);

const nodeTypes = {
  task: TaskNode,
  decision: DecisionNode,
  start: StartNode,
  end: EndNode,
};

// Fonction pour créer un layout automatique avec Dagre
const getLayoutedElements = (nodes, edges) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'TB', nodesep: 100, ranksep: 150 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: node.width || 200, height: node.height || 80 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return {
    nodes: nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - (node.width || 200) / 2,
          y: nodeWithPosition.y - (node.height || 80) / 2,
        },
      };
    }),
    edges,
  };
};

// Transformation du tableau en graphe ReactFlow
const transformToGraph = (steps) => {
  const nodes = [];
  const edges = [];

  // Ajouter nœud de départ
  nodes.push({
    id: 'start',
    type: 'start',
    position: { x: 0, y: 0 },
    data: {},
    width: 50,
    height: 50,
  });

  // Créer un map pour retrouver les étapes par leur numéro
  const stepMap = {};
  steps.forEach(step => {
    stepMap[step.etape] = step;
  });

  // Ajouter les nœuds pour chaque étape
  steps.forEach((step) => {
    const isConditional = step.type === 'Conditionnelle';

    nodes.push({
      id: step.etape,
      type: isConditional ? 'decision' : 'task',
      position: { x: 0, y: 0 },
      data: {
        ...step,
        label: step.tache,
      },
      width: isConditional ? 130 : 200,
      height: isConditional ? 130 : 80,
    });
  });

  // Ajouter nœud de fin
  nodes.push({
    id: 'end',
    type: 'end',
    position: { x: 0, y: 0 },
    data: {},
    width: 50,
    height: 50,
  });

  // Connexion start → première étape
  edges.push({
    id: 'e-start-1.1',
    source: 'start',
    target: '1.1',
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed },
  });

  // Créer les edges à partir des liens siOui/siNon
  steps.forEach((step) => {
    if (step.siOui) {
      if (step.siOui === 'FIN') {
        edges.push({
          id: `e-${step.etape}-end`,
          source: step.etape,
          target: 'end',
          label: step.type === 'Conditionnelle' ? 'Oui' : '',
          animated: true,
          style: { stroke: '#22c55e' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' },
        });
      } else {
        edges.push({
          id: `e-${step.etape}-${step.siOui}`,
          source: step.etape,
          target: step.siOui,
          label: step.type === 'Conditionnelle' ? 'Oui' : '',
          animated: true,
          style: { stroke: step.type === 'Conditionnelle' ? '#22c55e' : '#3b82f6' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: step.type === 'Conditionnelle' ? '#22c55e' : '#3b82f6'
          },
        });
      }
    }

    if (step.siNon && step.type === 'Conditionnelle') {
      edges.push({
        id: `e-${step.etape}-${step.siNon}-non`,
        source: step.etape,
        target: step.siNon,
        label: 'Non',
        animated: true,
        style: { stroke: '#ef4444' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' },
      });
    }
  });

  return getLayoutedElements(nodes, edges);
};

export default function BPMNProcessBuilder() {
  const [steps, setSteps] = useState(defaultSteps);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showTable, setShowTable] = useState(false);

  // Générer le graphe au chargement et à chaque modification
  useEffect(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = transformToGraph(steps);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [steps, setNodes, setEdges]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleStepChange = (index, field, value) => {
    const newSteps = [...steps];
    newSteps[index][field] = value;
    setSteps(newSteps);
  };

  const addStep = () => {
    const newStep = {
      id: String(steps.length + 1),
      service: 'Nouveau Service',
      etape: `${steps.length + 1}.1`,
      tache: 'Nouvelle tâche',
      type: 'Séquentielle',
      condition: '',
      siOui: '',
      siNon: ''
    };
    setSteps([...steps, newStep]);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Générateur de Processus BPMN</h1>
            <p className="text-sm text-gray-600 mt-1">
              Créez et visualisez vos processus métier en temps réel
            </p>
          </div>
          <button
            onClick={() => setShowTable(!showTable)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            {showTable ? '📊 Voir Diagramme' : '📝 Éditer Tableau'}
          </button>
        </div>
      </div>

      {/* Contenu principal */}
      {showTable ? (
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Tableau des Étapes</h2>
              <button
                onClick={addStep}
                className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
              >
                + Ajouter une étape
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Service</th>
                    <th className="p-2 text-left">Étape</th>
                    <th className="p-2 text-left">Tâche</th>
                    <th className="p-2 text-left">Type</th>
                    <th className="p-2 text-left">Condition</th>
                    <th className="p-2 text-left">Si Oui</th>
                    <th className="p-2 text-left">Si Non</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((step, index) => (
                    <tr key={step.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">
                        <input
                          className="w-full px-2 py-1 border rounded"
                          value={step.service}
                          onChange={(e) => handleStepChange(index, 'service', e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="w-full px-2 py-1 border rounded"
                          value={step.etape}
                          onChange={(e) => handleStepChange(index, 'etape', e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="w-full px-2 py-1 border rounded"
                          value={step.tache}
                          onChange={(e) => handleStepChange(index, 'tache', e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <select
                          className="w-full px-2 py-1 border rounded"
                          value={step.type}
                          onChange={(e) => handleStepChange(index, 'type', e.target.value)}
                        >
                          <option>Séquentielle</option>
                          <option>Conditionnelle</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          className="w-full px-2 py-1 border rounded"
                          value={step.condition}
                          onChange={(e) => handleStepChange(index, 'condition', e.target.value)}
                          disabled={step.type !== 'Conditionnelle'}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="w-full px-2 py-1 border rounded"
                          value={step.siOui}
                          onChange={(e) => handleStepChange(index, 'siOui', e.target.value)}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="w-full px-2 py-1 border rounded"
                          value={step.siNon}
                          onChange={(e) => handleStepChange(index, 'siNon', e.target.value)}
                          disabled={step.type !== 'Conditionnelle'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            className="bg-gray-50"
          >
            <Background color="#e5e7eb" gap={16} />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                if (node.type === 'start') return '#22c55e';
                if (node.type === 'end') return '#ef4444';
                if (node.type === 'decision') return '#eab308';
                return '#3b82f6';
              }}
            />
          </ReactFlow>
        </div>
      )}

      {/* Légende */}
      <div className="bg-white border-t px-6 py-3">
        <div className="flex items-center gap-6 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-400 border-2 border-blue-500 rounded"></div>
            <span>Tâche séquentielle</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-400 border-2 border-yellow-500 transform rotate-45"></div>
            <span>Décision conditionnelle</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-green-500"></div>
            <span>Chemin "Oui"</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-red-500"></div>
            <span>Chemin "Non"</span>
          </div>
        </div>
      </div>
    </div>
  );
}
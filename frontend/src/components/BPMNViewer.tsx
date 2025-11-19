import { useEffect, useRef, useState } from "react";
import {
    X,
    ZoomIn,
    ZoomOut,
    Maximize2,
    Download,
    Edit3,
    Check,
    XCircle,
    FileBarChart,
    MousePointerClick,
    Lightbulb
} from "lucide-react";

interface BPMNViewerProps {
    xml: string;
    height?: string;
    onClose?: () => void;
    onError?: (error: string) => void;
    onUpdate?: (updatedXml: string) => void;
}

declare global {
    interface Window {
        BpmnJS: any;
    }
}

export default function BPMNViewer({ xml, height = '800px', onClose, onError, onUpdate }: BPMNViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const [scriptLoaded, setScriptLoaded] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [selectedElement, setSelectedElement] = useState<any>(null);
    const [editText, setEditText] = useState('');

    const laneColors = [
        { fill: '#E3F2FD', stroke: '#c3ccd4ff', strokeWidth: '4' },
        { fill: '#FFF3E0', stroke: '#F57C00', strokeWidth: '4' },
        { fill: '#F3E5F5', stroke: '#7B1FA2', strokeWidth: '4' },
        { fill: '#E8F5E9', stroke: '#388E3C', strokeWidth: '4' },
        { fill: '#FCE4EC', stroke: '#C2185B', strokeWidth: '4' },
        { fill: '#FFFDE7', stroke: '#F9A825', strokeWidth: '4' },
    ];

    useEffect(() => {
        if (typeof window !== 'undefined' && !window.BpmnJS && !scriptLoaded) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/bpmn-js@17.11.1/dist/bpmn-modeler.development.js';
            script.async = true;

            script.onload = () => {
                setScriptLoaded(true);
            };

            script.onerror = () => {
                onError?.("Impossible de charger la bibliothèque BPMN");
                setLoading(false);
            };

            document.body.appendChild(script);
        } else if (window.BpmnJS) {
            setScriptLoaded(true);
        }
    }, [scriptLoaded, onError]);

    useEffect(() => {
        if (scriptLoaded && containerRef.current && !viewerRef.current) {
            try {
                viewerRef.current = new window.BpmnJS({
                    container: containerRef.current,
                    height: height
                });
                setLoading(false);
            } catch (error) {
                console.error('Erreur initialisation viewer:', error);
                onError?.("Erreur lors de l'initialisation du viewer");
                setLoading(false);
            }
        }
    }, [scriptLoaded, height, onError]);

    useEffect(() => {
        if (viewerRef.current && xml && !loading) {
            displayDiagram(xml);
        }
    }, [xml, loading]);

    const displayDiagram = async (xmlContent: string) => {
        if (!viewerRef.current) return;

        try {
            setLoading(true);
            await viewerRef.current.importXML(xmlContent);

            const canvas = viewerRef.current.get('canvas');
            canvas.zoom('fit-viewport');

            applyLaneColors();

            if (editMode) {
                setupEditMode();
            }

            setTimeout(() => {
                if (containerRef.current) {
                    const canvas = viewerRef.current.get('canvas');
                    canvas.zoom(canvas.zoom());
                }
            }, 100);

            setLoading(false);
        } catch (error: any) {
            console.error('Erreur lors du rendu BPMN:', error);
            onError?.(`Erreur lors de l'affichage: ${error.message}`);
            setLoading(false);
        }
    };

    const applyLaneColors = () => {
        if (!containerRef.current) return;

        try {
            const elementRegistry = viewerRef.current.get('elementRegistry');
            const allElements = elementRegistry.getAll();

            const lanes = allElements.filter((e: any) => e.type === 'bpmn:Lane');
            lanes.forEach((element: any, index: number) => {
                const gfx = elementRegistry.getGraphics(element);
                if (gfx) {
                    const rect = gfx.querySelector('rect');
                    if (rect) {
                        const colorScheme = laneColors[index % laneColors.length];
                        rect.style.fill = colorScheme.fill;
                        rect.style.fillOpacity = '0.9';
                        rect.style.stroke = colorScheme.stroke;
                        rect.style.strokeWidth = colorScheme.strokeWidth;
                    }
                }
            });

            const tasks = allElements.filter((e: any) =>
                e.type === 'bpmn:Task' || e.type === 'bpmn:UserTask'
            );

            tasks.forEach((element: any) => {
                const gfx = elementRegistry.getGraphics(element);
                if (gfx) {
                    const rect = gfx.querySelector('rect');
                    if (rect) {
                        const taskName = element.businessObject?.name?.toLowerCase() || '';
                        let color = { fill: '#EFF6FF', stroke: '#2563EB' };

                        if (taskName.includes('automatique') || taskName.includes('service') || taskName.includes('système')) {
                            color = { fill: '#FEF9C3', stroke: '#CA8A04' };
                        } else if (taskName.includes('envoyer') || taskName.includes('notifier') || taskName.includes('email')) {
                            color = { fill: '#FCE7F3', stroke: '#DB2777' };
                        } else if (taskName.includes('recevoir') || taskName.includes('attendre')) {
                            color = { fill: '#E0E7FF', stroke: '#4F46E5' };
                        } else if (taskName.includes('manuel') || taskName.includes('papier')) {
                            color = { fill: '#FED7AA', stroke: '#EA580C' };
                        } else if (taskName.includes('règle') || taskName.includes('décision') || taskName.includes('calcul')) {
                            color = { fill: '#F3E8FF', stroke: '#9333EA' };
                        } else if (taskName.includes('script') || taskName.includes('code')) {
                            color = { fill: '#D1FAE5', stroke: '#059669' };
                        }

                        rect.style.fill = color.fill;
                        rect.style.stroke = color.stroke;
                        rect.style.strokeWidth = '4px';
                    }
                }
            });
        } catch (error) {
            console.log('Erreur application des couleurs:', error);
        }
    };

    const setupEditMode = () => {
        if (!viewerRef.current) return;

        try {
            const eventBus = viewerRef.current.get('eventBus');

            eventBus.on('element.click', (event: any) => {
                const element = event.element;

                if (element.type === 'bpmn:Task' ||
                    element.type === 'bpmn:UserTask' ||
                    element.type === 'bpmn:Lane' ||
                    element.type === 'bpmn:ExclusiveGateway' ||
                    element.type === 'bpmn:StartEvent' ||
                    element.type === 'bpmn:EndEvent') {

                    setSelectedElement(element);
                    setEditText(element.businessObject.name || '');
                }
            });
        } catch (error) {
            console.error('Erreur setup edit mode:', error);
        }
    };

    const toggleEditMode = () => {
        const newMode = !editMode;
        setEditMode(newMode);

        if (newMode) {
            setupEditMode();
        } else {
            setSelectedElement(null);
            setEditText('');
        }
    };

    const saveTextEdit = async () => {
        if (!selectedElement || !viewerRef.current || !editText.trim()) return;

        try {
            const modeling = viewerRef.current.get('modeling');

            modeling.updateProperties(selectedElement, {
                name: editText.trim()
            });

            const canvas = viewerRef.current.get('canvas');
            const elementRegistry = viewerRef.current.get('elementRegistry');
            const graphicsFactory = viewerRef.current.get('graphicsFactory');

            const gfx = elementRegistry.getGraphics(selectedElement);
            if (gfx) {
                graphicsFactory.update('shape', selectedElement, gfx);
            }

            if (onUpdate) {
                const { xml: updatedXml } = await viewerRef.current.saveXML({ format: true });
                onUpdate(updatedXml);
            }

            alert(`✅ "${selectedElement.type.replace('bpmn:', '')}" mis à jour avec succès!`);

            setSelectedElement(null);
            setEditText('');
        } catch (error) {
            console.error('Erreur lors de la sauvegarde:', error);
            onError?.("Erreur lors de la sauvegarde des modifications");
        }
    };

    const cancelEdit = () => {
        setSelectedElement(null);
        setEditText('');
    };

    const handleZoomIn = () => {
        if (viewerRef.current) {
            const canvas = viewerRef.current.get('canvas');
            canvas.zoom(canvas.zoom() + 0.1);
        }
    };

    const handleZoomOut = () => {
        if (viewerRef.current) {
            const canvas = viewerRef.current.get('canvas');
            canvas.zoom(canvas.zoom() - 0.1);
        }
    };

    const handleZoomReset = () => {
        if (viewerRef.current) {
            const canvas = viewerRef.current.get('canvas');
            canvas.zoom('fit-viewport');
        }
    };

    const handleDownloadSVG = async () => {
        if (!viewerRef.current) return;

        try {
            const { svg } = await viewerRef.current.saveSVG();
            const blob = new Blob([svg], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'process-diagram.svg';
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Erreur export SVG:', error);
            onError?.("Erreur lors de l'export SVG");
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-xl border border-gray-200 font-sans text-sm leading-relaxed text-gray-800">
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                
                .djs-container .djs-element[data-element-id^="Lane_"] rect:first-child {
                    stroke-width: 4px !important;
                    filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.1));
                }
                
                /* AUGMENTATION DES TAILLES DE POLICE */
                .djs-container .djs-element .djs-label text {
                    font-size: 30px !important;
                    font-weight: 600 !important;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                    fill: #111827 !important;
                }
                
                .djs-container .djs-connection .djs-label text {
                    font-size: 30px !important;
                    font-weight: 700 !important;
                    fill: #2563eb !important;
                    text-shadow: 0 0 4px rgba(255, 255, 255, 0.9);
                }
                
                .djs-container .djs-element[data-element-id^="Lane_"] text {
                    font-size: 30px !important;
                    font-weight: 700 !important;
                    fill: #000000 !important;
                    letter-spacing: 0.6px !important;
                }
                
                .djs-container .djs-element[data-element-id^="Gateway_"] + .djs-label text {
                    font-size: 30px !important;
                    font-weight: 900 !important;
                    fill: #374151 !important;
                }
                
                .djs-container .djs-element[data-element-id^="Task_"] rect {
                    stroke-width: 4px !important;
                    filter: drop-shadow(0 4px 8px rgba(37, 99, 235, 0.25));
                    rx: 8 !important;
                }
                
                .djs-container .djs-element[data-element-id^="Task_"] .djs-label text {
                    fill: #111827 !important;
                    font-weight: 600 !important;
                    font-size: 30px !important;
                }
                
                .djs-container .djs-element[data-element-id^="Gateway_"] path {
                    stroke: #f59e0b !important;
                    stroke-width: 4px !important;
                    fill: #fffbeb !important;
                    filter: drop-shadow(0 4px 8px rgba(245, 158, 11, 0.3));
                }
                
                .djs-container .djs-element[data-element-id^="Start_"] circle {
                    stroke: #10b981 !important;
                    stroke-width: 4px !important;
                    fill: #d1fae5 !important;
                    filter: drop-shadow(0 4px 8px rgba(16, 185, 129, 0.35));
                }
                
                .djs-container .djs-element[data-element-id^="End_"] circle {
                    stroke: #ef4444 !important;
                    stroke-width: 5px !important;
                    fill: #fee2e2 !important;
                    filter: drop-shadow(0 4px 8px rgba(239, 68, 68, 0.35));
                }
                
                .djs-container .djs-connection path {
                    stroke: #6b7280 !important;
                    stroke-width: 3px !important;
                }
                
                .djs-container .djs-connection.selected path {
                    stroke: #6b7280 !important;
                    stroke-width: 3px !important;
                    filter: none !important;
                }
                
                .djs-container .selected .djs-outline {
                    stroke: #2563eb !important;
                    stroke-width: 4px !important;
                    stroke-dasharray: 10, 5 !important;
                }
                
                .djs-container .djs-element:hover rect,
                .djs-container .djs-element:hover circle,
                .djs-container .djs-element:hover path {
                    filter: brightness(1.05) drop-shadow(0 5px 10px rgba(0, 0, 0, 0.2));
                }
                
                .spinner {
                    animation: spin 1s linear infinite;
                }
            `}</style>

            {/* Header */}
            <div className="flex items-center justify-between p-4 px-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center gap-3">
                    <FileBarChart className="w-6 h-6 text-blue-600" />
                    <h2 className="text-xl font-semibold text-gray-800 m-0">Diagramme BPMN</h2>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleEditMode}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm border transition-all outline-none ${editMode
                            ? 'bg-green-500 text-white border-green-500 shadow-md'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                        title={editMode ? "Désactiver le mode édition" : "Activer le mode édition"}
                    >
                        <Edit3 className="w-4 h-4" />
                        {editMode ? 'Édition activée' : 'Éditer'}
                    </button>

                    <div className="w-px h-6 bg-gray-300 mx-1"></div>

                    <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-300 p-1">
                        <button
                            onClick={handleZoomIn}
                            className="p-2 rounded hover:bg-gray-100 transition-colors outline-none"
                            title="Zoom avant"
                        >
                            <ZoomIn className="w-4 h-4 text-gray-600" />
                        </button>
                        <button
                            onClick={handleZoomOut}
                            className="p-2 rounded hover:bg-gray-100 transition-colors outline-none"
                            title="Zoom arrière"
                        >
                            <ZoomOut className="w-4 h-4 text-gray-600" />
                        </button>
                        <button
                            onClick={handleZoomReset}
                            className="p-2 rounded hover:bg-gray-100 transition-colors outline-none"
                            title="Ajuster à la vue"
                        >
                            <Maximize2 className="w-4 h-4 text-gray-600" />
                        </button>
                    </div>

                    <button
                        onClick={handleDownloadSVG}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm bg-blue-600 text-white border border-blue-600 shadow-sm hover:bg-blue-700 transition-colors outline-none"
                        title="Exporter en SVG"
                    >
                        <Download className="w-4 h-4" />
                        Exporter
                    </button>

                    {onClose && (
                        <>
                            <div className="w-px h-6 bg-gray-300 mx-1"></div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-gray-100 transition-colors outline-none"
                                title="Fermer"
                            >
                                <X className="w-5 h-5 text-gray-600" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {editMode && selectedElement && (
                <div className="mx-6 mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Edit3 className="w-5 h-5 text-blue-600" />
                            <h3 className="font-semibold text-gray-800 m-0">
                                Édition: {selectedElement.type.replace('bpmn:', '')}
                            </h3>
                        </div>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">
                            {selectedElement.id}
                        </span>
                    </div>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                            placeholder="Entrez le nouveau texte..."
                            onKeyPress={(e) => e.key === 'Enter' && saveTextEdit()}
                            autoFocus
                        />
                        <button
                            onClick={saveTextEdit}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg font-medium text-sm hover:bg-green-600 transition-colors outline-none"
                        >
                            <Check className="w-4 h-4" />
                            Valider
                        </button>
                        <button
                            onClick={cancelEdit}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-300 transition-colors outline-none"
                        >
                            <XCircle className="w-4 h-4" />
                            Annuler
                        </button>
                    </div>

                    <p className="mt-3 text-sm text-gray-600 flex items-center gap-2 m-0">
                        <Lightbulb className="w-4 h-4 text-yellow-600" />
                        <span>Modifiez le texte puis validez ou appuyez sur Entrée</span>
                    </p>
                </div>
            )}

            {editMode && !selectedElement && (
                <div className="mx-6 mt-4 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-gray-700 flex items-center gap-2 m-0">
                        <MousePointerClick className="w-4 h-4 text-yellow-600" />
                        <span>
                            <strong className="font-semibold">Mode édition activé</strong> -
                            Cliquez sur un élément du diagramme pour modifier son texte
                        </span>
                    </p>
                </div>
            )}

            {loading && (
                <div className="flex items-center justify-center p-12" style={{ height }}>
                    <div className="text-center">
                        <div className="spinner rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                        <p className="text-gray-600 font-medium m-0">Chargement du diagramme...</p>
                    </div>
                </div>
            )}

            <div className="p-6">
                <div
                    ref={containerRef}
                    className={`border border-gray-300 rounded-lg overflow-hidden bg-gray-50 ${editMode ? 'cursor-pointer' : 'cursor-default'}`}
                    style={{
                        height,
                        display: loading ? 'none' : 'block'
                    }}
                />
            </div>
        </div>
    );
}
// components/BPMNEditor.tsx
'use client';

import { useEffect, useRef, useState } from "react";

interface BPMNEditorProps {
    xml: string;
    height?: string;
    onClose?: () => void;
    onError?: (error: string) => void;
    onTaskUpdate?: (updatedTasks: Map<string, string>) => void;
    readOnly?: boolean;
}

declare global {
    interface Window {
        BpmnJS: any;
    }
}

export default function BPMNEditor({
    xml,
    height = '700px',
    onClose,
    onError,
    onTaskUpdate,
    readOnly = false
}: BPMNEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const [scriptLoaded, setScriptLoaded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Garder une copie des tâches originales
    const originalTasks = useRef<Map<string, string>>(new Map());

    // Couleurs des lanes
    const laneColors = [
        '#BBDEFB', '#FFCC80', '#CE93D8', '#A5D6A7', '#F48FB1', '#FFF59D'
    ];

    // Charger le script bpmn-js
    useEffect(() => {
        if (typeof window !== 'undefined' && !window.BpmnJS && !scriptLoaded) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/bpmn-js@17.11.1/dist/bpmn-viewer.development.js';
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

    // Initialiser le viewer
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

    // Afficher le diagramme
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

            // Sauvegarder les tâches originales
            saveOriginalTasks();

            // Appliquer les couleurs
            applyLaneColors();

            // Activer l'édition si non readonly
            if (!readOnly) {
                setupDirectLabeling();
            }

            setLoading(false);
        } catch (error: any) {
            console.error('Erreur lors du rendu BPMN:', error);
            onError?.(`Erreur lors de l'affichage: ${error.message}`);
            setLoading(false);
        }
    };

    /**
     * Sauvegarder les noms des tâches originales
     */
    const saveOriginalTasks = () => {
        if (!viewerRef.current) return;

        try {
            const elementRegistry = viewerRef.current.get('elementRegistry');
            const allElements = elementRegistry.getAll();

            originalTasks.current.clear();

            allElements.forEach((element: any) => {
                if (element.type === 'bpmn:UserTask' && element.businessObject?.name) {
                    originalTasks.current.set(element.id, element.businessObject.name);
                }
            });
        } catch (error) {
            console.error('Erreur sauvegarde tâches:', error);
        }
    };

    /**
     * Configurer l'édition directe des labels (texte des tâches)
     */
    const setupDirectLabeling = () => {
        if (!viewerRef.current) return;

        try {
            const eventBus = viewerRef.current.get('eventBus');
            const elementRegistry = viewerRef.current.get('elementRegistry');

            // Écouter les clics sur les éléments
            eventBus.on('element.click', (event: any) => {
                const { element } = event;

                // Permettre l'édition uniquement des tâches
                if (element.type === 'bpmn:UserTask') {
                    enableLabelEditing(element);
                }
            });

            // Écouter les changements d'éléments
            eventBus.on('element.changed', (event: any) => {
                const { element } = event;

                if (element.type === 'bpmn:UserTask') {
                    detectChanges();
                }
            });

        } catch (error) {
            console.error('Erreur configuration édition:', error);
        }
    };

    /**
     * Activer l'édition du label d'une tâche
     */
    const enableLabelEditing = (element: any) => {
        if (!viewerRef.current) return;

        try {
            const directEditing = viewerRef.current.get('directEditing');

            // Activer l'édition directe
            directEditing.activate(element);
            setIsEditing(true);

            // Écouter la fin de l'édition
            const eventBus = viewerRef.current.get('eventBus');
            const handler = (event: any) => {
                setIsEditing(false);
                detectChanges();
                eventBus.off('directEditing.complete', handler);
                eventBus.off('directEditing.cancel', handler);
            };

            eventBus.once('directEditing.complete', handler);
            eventBus.once('directEditing.cancel', handler);

        } catch (error) {
            console.error('Erreur activation édition label:', error);
        }
    };

    /**
     * Détecter les changements et notifier le parent
     */
    const detectChanges = () => {
        if (!viewerRef.current || !onTaskUpdate) return;

        try {
            const elementRegistry = viewerRef.current.get('elementRegistry');
            const allElements = elementRegistry.getAll();

            const updatedTasks = new Map<string, string>();
            let hasModifications = false;

            allElements.forEach((element: any) => {
                if (element.type === 'bpmn:UserTask') {
                    const currentName = element.businessObject?.name || '';
                    const originalName = originalTasks.current.get(element.id) || '';

                    if (currentName !== originalName) {
                        hasModifications = true;
                    }

                    updatedTasks.set(element.id, currentName);
                }
            });

            setHasChanges(hasModifications);

            // Notifier le parent si des changements ont été détectés
            if (hasModifications) {
                onTaskUpdate(updatedTasks);
            }

        } catch (error) {
            console.error('Erreur détection changements:', error);
        }
    };

    /**
     * Sauvegarder les modifications
     */
    const handleSaveChanges = () => {
        detectChanges();

        // Mettre à jour les tâches originales
        saveOriginalTasks();
        setHasChanges(false);

        alert('✅ Modifications synchronisées avec le tableau !');
    };

    /**
     * Annuler les modifications
     */
    const handleCancelChanges = async () => {
        if (xml) {
            await displayDiagram(xml);
            setHasChanges(false);
        }
    };

    /**
     * Appliquer les couleurs aux lanes
     */
    const applyLaneColors = () => {
        if (!containerRef.current) return;

        const lanes = containerRef.current.querySelectorAll('[data-element-id^="Lane_"]');

        lanes.forEach((lane, index) => {
            const rect = lane.querySelector('rect');
            if (rect) {
                const color = laneColors[index % laneColors.length];
                rect.setAttribute('fill', color);
                rect.setAttribute('fill-opacity', '0.5');
                rect.setAttribute('stroke', '#666');
                rect.setAttribute('stroke-width', '2');
            }
        });

        // Forcer le re-rendu
        setTimeout(() => {
            if (containerRef.current && viewerRef.current) {
                const canvas = viewerRef.current.get('canvas');
                canvas.zoom(canvas.zoom());
            }
        }, 100);
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

    const handleDownloadBPMN = async () => {
        if (!viewerRef.current) return;

        try {
            const { xml: currentXml } = await viewerRef.current.saveXML({ format: true });
            const blob = new Blob([currentXml], { type: 'application/xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'process-diagram.bpmn';
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Erreur export BPMN:', error);
            onError?.("Erreur lors de l'export BPMN");
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-lg p-4">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold">
                        {readOnly ? '📊 Diagramme BPMN' : '✏️ Éditeur BPMN'}
                    </h2>

                    {!readOnly && hasChanges && (
                        <div className="flex items-center gap-2">
                            <span className="text-orange-600 text-sm font-medium">
                                ⚠️ Modifications non sauvegardées
                            </span>
                            <button
                                onClick={handleSaveChanges}
                                className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-sm transition-colors"
                            >
                                💾 Sauvegarder
                            </button>
                            <button
                                onClick={handleCancelChanges}
                                className="px-3 py-1 bg-gray-400 hover:bg-gray-500 text-white rounded text-sm transition-colors"
                            >
                                ↺ Annuler
                            </button>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={handleZoomIn}
                            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm transition-colors"
                            title="Zoom avant"
                        >
                            🔍+
                        </button>
                        <button
                            onClick={handleZoomOut}
                            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm transition-colors"
                            title="Zoom arrière"
                        >
                            🔍-
                        </button>
                        <button
                            onClick={handleZoomReset}
                            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm transition-colors"
                            title="Réinitialiser le zoom"
                        >
                            ↺
                        </button>
                        <button
                            onClick={handleDownloadSVG}
                            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors"
                            title="Exporter en SVG"
                        >
                            💾 SVG
                        </button>
                        <button
                            onClick={handleDownloadBPMN}
                            className="px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded text-sm transition-colors"
                            title="Exporter en BPMN"
                        >
                            💾 BPMN
                        </button>
                    </div>
                </div>

                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                        title="Fermer"
                    >
                        ✕
                    </button>
                )}
            </div>

            {!readOnly && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                        💡 <strong>Mode édition :</strong> Cliquez sur une tâche pour modifier son texte.
                        Les modifications seront synchronisées avec le tableau.
                    </p>
                </div>
            )}

            {loading && (
                <div className="flex items-center justify-center" style={{ height }}>
                    <div className="text-gray-500">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <p>Chargement du diagramme...</p>
                    </div>
                </div>
            )}

            <div
                ref={containerRef}
                className={`border border-gray-300 rounded ${loading ? 'hidden' : ''} ${!readOnly ? 'cursor-pointer' : ''}`}
                style={{ height }}
            />

            <style jsx global>{`
                /* Bordure des lanes */
                .djs-container .djs-element[data-element-id^="Lane_"] rect:first-child {
                    stroke-width: 2px;
                    stroke: #999;
                }
                
                /* Texte des tâches */
                .djs-container .djs-element .djs-label text {
                    font-size: 13px !important;
                    font-weight: 500 !important;
                    font-family: Arial, sans-serif !important;
                }
                
                /* Texte des labels de flux */
                .djs-container .djs-connection .djs-label text {
                    font-size: 12px !important;
                    font-weight: 600 !important;
                    fill: #1976d2 !important;
                }
                
                /* Texte des lanes */
                .djs-container .djs-element[data-element-id^="Lane_"] text {
                    font-size: 14px !important;
                    font-weight: 600 !important;
                    fill: #333 !important;
                }
                
                /* Tâches avec hover effect en mode édition */
                ${!readOnly ? `
                .djs-container .djs-element[data-element-id^="Task_"] rect {
                    stroke: #2196f3 !important;
                    stroke-width: 2px !important;
                    cursor: pointer !important;
                    transition: all 0.2s ease !important;
                }
                
                .djs-container .djs-element[data-element-id^="Task_"]:hover rect {
                    stroke: #ff9800 !important;
                    stroke-width: 3px !important;
                    fill: #fff3e0 !important;
                }
                ` : `
                .djs-container .djs-element[data-element-id^="Task_"] rect {
                    stroke: #2196f3 !important;
                    stroke-width: 2px !important;
                }
                `}
                
                /* Gateways */
                .djs-container .djs-element[data-element-id^="Gateway_"] path {
                    stroke: #ff9800 !important;
                    stroke-width: 3px !important;
                    fill: #fff3e0 !important;
                }
                
                /* Input d'édition directe */
                .djs-direct-editing-content {
                    font-size: 13px !important;
                    font-weight: 500 !important;
                    font-family: Arial, sans-serif !important;
                    border: 2px solid #2196f3 !important;
                    background: #ffffff !important;
                    padding: 4px 8px !important;
                    border-radius: 4px !important;
                }
            `}</style>
        </div>
    );
}
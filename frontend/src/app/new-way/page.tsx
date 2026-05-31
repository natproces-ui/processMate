'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import BpmnEditor, { BpmnEditorHandle, EMPTY_DIAGRAM } from '@/components/new-way/BpmnEditor';
import Toolbar from '@/components/new-way/Toolbar';
import StatusBar from '@/components/new-way/StatusBar';
import DropZone from '@/components/new-way/DropZone';

export default function NewWayPage() {
    const editorRef = useRef<BpmnEditorHandle>(null);
    const [xml, setXml] = useState<string | null>(null);
    const [filename, setFilename] = useState<string | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [elementCount, setElementCount] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const savedXmlRef = useRef<string | null>(null);

    const handleImport = useCallback((importedXml: string, name: string) => {
        setXml(importedXml);
        setFilename(name);
        setHasChanges(false);
        savedXmlRef.current = importedXml;
        setError(null);
    }, []);

    const handleNewDiagram = useCallback(() => {
        setXml(EMPTY_DIAGRAM);
        setFilename('nouveau-diagramme.bpmn');
        setHasChanges(false);
        savedXmlRef.current = EMPTY_DIAGRAM;
        setError(null);
    }, []);

    const handleChange = useCallback((updatedXml: string) => {
        setHasChanges(updatedXml !== savedXmlRef.current);
        const matches = updatedXml.match(
            /<(task|userTask|startEvent|endEvent|exclusiveGateway|parallelGateway|inclusiveGateway|sequenceFlow|lane)\b/gi
        );
        setElementCount(matches?.length ?? 0);
    }, []);

    const download = (content: string, name: string, type: string) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.click();
        URL.revokeObjectURL(url);
    };

    const handleSave = useCallback(async () => {
        const currentXml = await editorRef.current?.saveXml();
        if (!currentXml) return;
        savedXmlRef.current = currentXml;
        setHasChanges(false);
        download(currentXml, filename ?? 'diagram.bpmn', 'application/xml');
    }, [filename]);

    const handleExportBpmn = useCallback(async () => {
        const currentXml = await editorRef.current?.saveXml();
        if (!currentXml) return;
        download(currentXml, (filename ?? 'diagram').replace(/\.(bpmn|xml)$/, '') + '.bpmn', 'application/xml');
    }, [filename]);

    const handleExportSvg = useCallback(async () => {
        const svg = await editorRef.current?.saveSvg();
        if (!svg) return;
        download(svg, (filename ?? 'diagram').replace(/\.(bpmn|xml)$/, '') + '.svg', 'image/svg+xml');
    }, [filename]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleSave]);

    return (
        <div className="flex flex-col h-screen overflow-hidden">

            <Toolbar
                filename={filename}
                hasChanges={hasChanges}
                onImport={handleImport}
                onExportBpmn={handleExportBpmn}
                onExportSvg={handleExportSvg}
                onZoomIn={() => editorRef.current?.zoomIn()}
                onZoomOut={() => editorRef.current?.zoomOut()}
                onZoomFit={() => editorRef.current?.zoomFit()}
                onUndo={() => editorRef.current?.undo()}
                onRedo={() => editorRef.current?.redo()}
                onNew={handleNewDiagram}
                onSave={handleSave}
            />

            {error && (
                <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-600 flex items-center justify-between">
                    <span>⚠ {error}</span>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
                </div>
            )}

            <div className="flex-1 overflow-hidden">
                {xml === null ? (
                    <DropZone onFileLoaded={handleImport} onNewDiagram={handleNewDiagram} />
                ) : (
                    <BpmnEditor
                        ref={editorRef}
                        initialXml={xml}
                        onChange={handleChange}
                        onError={setError}
                        onReady={() => setElementCount(0)}
                    />
                )}
            </div>

            {xml !== null && (
                <StatusBar elementCount={elementCount} filename={filename} hasChanges={hasChanges} />
            )}
        </div>
    );
}
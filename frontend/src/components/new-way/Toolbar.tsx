// components/Toolbar.tsx
'use client';

import { useRef } from 'react';
import {
    Upload, FileDown, ZoomIn, ZoomOut, Maximize2,
    Undo2, Redo2, Image, Save, Plus, FileText
} from 'lucide-react';

interface ToolbarProps {
    filename: string | null;
    hasChanges: boolean;
    onImport: (xml: string, name: string) => void;
    onExportBpmn: () => void;
    onExportSvg: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomFit: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onNew: () => void;
    onSave: () => void;
}

export default function Toolbar({
    filename, hasChanges,
    onImport, onExportBpmn, onExportSvg,
    onZoomIn, onZoomOut, onZoomFit,
    onUndo, onRedo, onNew, onSave,
}: ToolbarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = evt => {
            const xml = evt.target?.result as string;
            if (xml) onImport(xml, file.name);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    return (
        <header className="h-11 bg-[#1e1e2e] border-b border-white/[0.07] flex items-center px-3 gap-1.5 select-none flex-shrink-0">

            {/* Logo */}
            <div className="flex items-center gap-2 mr-3">
                <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center">
                    <FileText className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-xs font-semibold text-white/80 tracking-tight">BPMN Studio</span>
            </div>

            <Sep />

            {/* Nom fichier */}
            <div className="flex items-center gap-1.5 px-2">
                {filename
                    ? <span className="text-xs text-slate-300 max-w-[200px] truncate">{filename}</span>
                    : <span className="text-xs text-slate-600 italic">Sans titre</span>
                }
                {hasChanges && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Non sauvegardé" />}
            </div>

            <Sep />

            {/* Actions fichier */}
            <Btn icon={<Plus />} label="Nouveau" onClick={onNew} />
            <Btn icon={<Upload />} label="Ouvrir .bpmn" onClick={() => fileInputRef.current?.click()} />
            <Btn icon={<Save />} label="Sauvegarder (Ctrl+S)" onClick={onSave} highlight={hasChanges} />

            <input ref={fileInputRef} type="file" accept=".bpmn,.xml" onChange={handleFileChange} className="hidden" />

            <Sep />

            {/* Historique */}
            <Btn icon={<Undo2 />} label="Annuler (Ctrl+Z)" onClick={onUndo} />
            <Btn icon={<Redo2 />} label="Rétablir" onClick={onRedo} />

            <Sep />

            {/* Zoom */}
            <Btn icon={<ZoomOut />} label="Zoom -" onClick={onZoomOut} />
            <Btn icon={<Maximize2 />} label="Ajuster" onClick={onZoomFit} />
            <Btn icon={<ZoomIn />} label="Zoom +" onClick={onZoomIn} />

            <div className="flex-1" />

            {/* Export */}
            <Btn icon={<FileDown />} label="Exporter BPMN" onClick={onExportBpmn} />
            <Btn icon={<Image />} label="Exporter SVG" onClick={onExportSvg} />
        </header>
    );
}

function Sep() {
    return <div className="w-px h-4 bg-white/10 mx-0.5" />;
}

function Btn({ icon, label, onClick, highlight = false }: {
    icon: React.ReactNode; label: string; onClick: () => void; highlight?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            className={`
                w-7 h-7 rounded flex items-center justify-center relative group
                transition-colors duration-100
                ${highlight
                    ? 'text-amber-400 hover:bg-amber-400/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }
            `}
        >
            <span className="w-4 h-4">{icon}</span>
            <span className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10 z-50">
                {label}
            </span>
        </button>
    );
}
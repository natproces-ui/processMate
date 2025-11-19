// components/Controls.tsx
import React from 'react';

interface ControlsProps {
    onGenerate: () => void;
    onExport: () => void;
    onReset: () => void;
}

export default function Controls({ onGenerate, onExport, onReset }: ControlsProps) {
    return (
        <>
            <button
                onClick={onGenerate}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-md"
            >
                🔄 Générer
            </button>
            <button
                onClick={onExport}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold shadow-md"
            >
                📤 Exporter
            </button>
            <button
                onClick={onReset}
                className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-semibold shadow-md"
            >
                ♻️ Reset
            </button>
        </>
    );
}
'use client';

import { useState } from 'react';
import { SCVRoot } from '@/lib/types';
import { api } from '@/lib/api';

interface JsonPreviewProps {
    data: SCVRoot;
}

export default function JsonPreview({ data }: JsonPreviewProps) {
    const [validationMessage, setValidationMessage] = useState<string>('');
    const [isValidating, setIsValidating] = useState(false);

    const downloadJson = () => {
        const now = new Date();
        const filename = `007_${now.getDate().toString().padStart(2, '0')}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getFullYear()}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}.json`;

        const jsonStr = JSON.stringify(data, null, 0);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const copyToClipboard = async () => {
        const jsonStr = JSON.stringify(data, null, 2);
        await navigator.clipboard.writeText(jsonStr);
        alert('JSON copié dans le presse-papier !');
    };

    const validateJson = async () => {
        setIsValidating(true);
        setValidationMessage('');
        try {
            const result = await api.validate(data);
            setValidationMessage(result.valid ? '✅ JSON valide' : '❌ ' + result.message);
        } catch (error) {
            setValidationMessage('❌ Erreur de validation: ' + (error instanceof Error ? error.message : 'Erreur inconnue'));
        } finally {
            setIsValidating(false);
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Prévisualisation JSON</h3>
                <div className="flex gap-2">
                    <button
                        onClick={validateJson}
                        disabled={isValidating}
                        className="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm disabled:opacity-50"
                    >
                        {isValidating ? '⏳' : '✓'} Valider
                    </button>
                    <button
                        onClick={copyToClipboard}
                        className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
                    >
                        📋 Copier
                    </button>
                    <button
                        onClick={downloadJson}
                        className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                    >
                        ⬇️ Télécharger
                    </button>
                </div>
            </div>

            {validationMessage && (
                <div className={`mb-4 p-3 rounded ${validationMessage.startsWith('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {validationMessage}
                </div>
            )}

            <div className="flex-1 overflow-auto bg-gray-900 text-green-400 p-4 rounded font-mono text-xs">
                <pre>{JSON.stringify(data, null, 2)}</pre>
            </div>

            <div className="mt-4 text-sm text-gray-600">
                <div>Déposant: {data.SCV.identifiantDeposant.nom} {data.SCV.identifiantDeposant.prenom}</div>
                <div>Héritiers: {data.SCV.heritier.length} | Comptes: {data.SCV.compte.length}</div>
            </div>
        </div>
    );
}
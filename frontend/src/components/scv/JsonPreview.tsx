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

    const deposant = data.SCV.identifiantDeposant;
    const isPP = deposant.typePersonne === 'PP';
    const comptesCOL = data.SCV.compte.filter(c => c.infosCompteBancaire.natureCompte === 'COL').length;
    const comptesIND = data.SCV.compte.filter(c => c.infosCompteBancaire.natureCompte === 'IND').length;

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

            {/* ✅ Informations améliorées */}
            <div className="mt-4 text-sm space-y-2 bg-gray-50 p-3 rounded border">
                <div className="flex justify-between items-center pb-2 border-b">
                    <span className="font-semibold text-gray-700">Résumé SCV</span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${isPP ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                        }`}>
                        {isPP ? '👤 PP' : '🏢 PM'}
                    </span>
                </div>

                <div className="flex justify-between">
                    <span className="text-gray-600">Déposant:</span>
                    <span className="font-medium text-gray-900">
                        {deposant.nom}
                        {deposant.prenom && ` ${deposant.prenom}`}
                    </span>
                </div>

                <div className="flex justify-between">
                    <span className="text-gray-600">ID SCV:</span>
                    <span className="font-mono text-xs text-gray-700">{deposant.idscv}</span>
                </div>

                {isPP && (
                    <div className="flex justify-between">
                        <span className="text-gray-600">Date Naissance:</span>
                        <span className="text-gray-900">{deposant.dateNaissance}</span>
                    </div>
                )}

                {!isPP && deposant.formeJuridique && (
                    <div className="flex justify-between">
                        <span className="text-gray-600">Forme Juridique:</span>
                        <span className="font-semibold text-gray-900">{deposant.formeJuridique}</span>
                    </div>
                )}

                <div className="flex justify-between">
                    <span className="text-gray-600">Statut:</span>
                    <span className={`font-medium ${deposant.isDecede === 'O' ? 'text-gray-700' : 'text-green-700'
                        }`}>
                        {deposant.isDecede === 'O' ? '⚰️ Décédé' : '✅ Vivant'}
                    </span>
                </div>

                <div className="flex justify-between">
                    <span className="text-gray-600">Héritiers:</span>
                    <span className="font-semibold text-gray-900">{data.SCV.heritier.length}</span>
                </div>

                <div className="flex justify-between items-center">
                    <span className="text-gray-600">Comptes:</span>
                    <div className="flex gap-2">
                        <span className="font-semibold text-gray-900">{data.SCV.compte.length}</span>
                        <span className="text-xs text-gray-500">
                            ({comptesCOL} <span className="text-green-600">COL</span>, {comptesIND} <span className="text-orange-600">IND</span>)
                        </span>
                    </div>
                </div>

                {/* Statistiques parts héritiers */}
                {data.SCV.heritier.length > 0 && (
                    <div className="flex justify-between pt-2 border-t">
                        <span className="text-gray-600">Somme parts héritiers:</span>
                        <span className={`font-semibold ${data.SCV.heritier.reduce((sum, h) => sum + h.identifiantHeritier.partHeritage, 0) === 10000
                            ? 'text-green-600'
                            : 'text-red-600'
                            }`}>
                            {data.SCV.heritier.reduce((sum, h) => sum + h.identifiantHeritier.partHeritage, 0)} / 10000
                        </span>
                    </div>
                )}

                {/* Statistiques cotitulaires */}
                {comptesCOL > 0 && (
                    <div className="flex justify-between">
                        <span className="text-gray-600">Cotitulaires (comptes COL):</span>
                        <span className="font-semibold text-gray-900">
                            {data.SCV.compte
                                .filter(c => c.infosCompteBancaire.natureCompte === 'COL')
                                .reduce((sum, c) => sum + c.cotitulaire.length, 0)}
                        </span>
                    </div>
                )}

                {/* Statistiques cartes */}
                <div className="flex justify-between">
                    <span className="text-gray-600">Cartes bancaires:</span>
                    <span className="font-semibold text-gray-900">
                        {data.SCV.compte.reduce((sum, c) => sum + c.infosCarteBancaire.length, 0)}
                    </span>
                </div>
            </div>
        </div>
    );
}
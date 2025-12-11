'use client';

import { useState } from 'react';

interface ImportResult {
    success: boolean;
    total_rows: number;
    generated: number;
    errors: Array<{
        row: number;
        deposant_id: string;
        error?: string;
        errors?: any[];
    }>;
    data: any[];
}

export default function ExcelImport() {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls')) {
                setFile(droppedFile);
                setError(null);
            } else {
                setError('Le fichier doit être un Excel (.xlsx ou .xls)');
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            setError('Veuillez sélectionner un fichier');
            return;
        }

        setUploading(true);
        setError(null);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('http://localhost:8001/import/excel', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Erreur lors de l\'import');
            }

            const data = await response.json();
            setResult(data);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur inconnue');
        } finally {
            setUploading(false);
        }
    };

    const downloadTemplate = () => {
        window.open('http://localhost:8001/download/template', '_blank');
    };

    const downloadResults = () => {
        if (!result || !result.data) return;

        const json = JSON.stringify(result.data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scv_imported_${result.generated}_items_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">📊 Import Excel → SCV</h1>
                    <p className="text-gray-600">
                        Importez un fichier Excel pour générer plusieurs SCV en une seule fois
                    </p>
                </div>

                {/* Download Template */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold text-blue-900 mb-1">
                                📥 Télécharger le Template
                            </h3>
                            <p className="text-sm text-blue-700">
                                Template Excel avec exemples et format requis
                            </p>
                        </div>
                        <button
                            onClick={downloadTemplate}
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-medium"
                        >
                            Télécharger
                        </button>
                    </div>
                </div>

                {/* Upload Zone */}
                <div className="bg-white rounded-lg shadow p-6 mb-6">
                    <h3 className="font-semibold mb-4">Upload Fichier Excel</h3>

                    {/* Drag & Drop Zone */}
                    <div
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-300 hover:border-gray-400'
                            }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        <div className="mb-4">
                            <span className="text-6xl">📄</span>
                        </div>

                        {file ? (
                            <div className="mb-4">
                                <p className="font-semibold text-green-600">✓ Fichier sélectionné</p>
                                <p className="text-sm text-gray-600 mt-1">{file.name}</p>
                                <p className="text-xs text-gray-500">
                                    {(file.size / 1024).toFixed(2)} KB
                                </p>
                            </div>
                        ) : (
                            <div className="mb-4">
                                <p className="font-semibold mb-2">
                                    Glissez-déposez votre fichier Excel ici
                                </p>
                                <p className="text-sm text-gray-600">ou</p>
                            </div>
                        )}

                        <label className="inline-block px-6 py-2 bg-gray-200 text-gray-700 rounded cursor-pointer hover:bg-gray-300">
                            {file ? 'Changer de fichier' : 'Parcourir...'}
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                        </label>

                        <p className="text-xs text-gray-500 mt-4">
                            Formats acceptés: .xlsx, .xls
                        </p>
                    </div>

                    {/* Upload Button */}
                    <div className="mt-4 flex gap-3">
                        <button
                            onClick={handleUpload}
                            disabled={!file || uploading}
                            className="flex-1 px-6 py-3 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                        >
                            {uploading ? '⏳ Import en cours...' : '🚀 Importer et Générer SCV'}
                        </button>

                        {file && (
                            <button
                                onClick={() => {
                                    setFile(null);
                                    setResult(null);
                                    setError(null);
                                }}
                                className="px-6 py-3 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                            >
                                Annuler
                            </button>
                        )}
                    </div>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
                        <p className="font-bold">❌ Erreur</p>
                        <p>{error}</p>
                    </div>
                )}

                {/* Results Display */}
                {result && (
                    <div className="space-y-6">
                        {/* Summary */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-xl font-bold mb-4">📊 Résultats de l'import</h3>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-blue-50 rounded-lg p-4 text-center">
                                    <p className="text-3xl font-bold text-blue-600">
                                        {result.total_rows}
                                    </p>
                                    <p className="text-sm text-gray-600">Lignes traitées</p>
                                </div>

                                <div className="bg-green-50 rounded-lg p-4 text-center">
                                    <p className="text-3xl font-bold text-green-600">
                                        {result.generated}
                                    </p>
                                    <p className="text-sm text-gray-600">SCV générés ✓</p>
                                </div>

                                <div className={`rounded-lg p-4 text-center ${result.errors.length > 0
                                        ? 'bg-red-50'
                                        : 'bg-gray-50'
                                    }`}>
                                    <p className={`text-3xl font-bold ${result.errors.length > 0
                                            ? 'text-red-600'
                                            : 'text-gray-600'
                                        }`}>
                                        {result.errors.length}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                        Erreurs {result.errors.length === 0 && '✓'}
                                    </p>
                                </div>
                            </div>

                            {result.generated > 0 && (
                                <div className="mt-6">
                                    <button
                                        onClick={downloadResults}
                                        className="w-full px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 font-semibold"
                                    >
                                        📥 Télécharger {result.generated} SCV (JSON)
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Errors Detail */}
                        {result.errors.length > 0 && (
                            <div className="bg-white rounded-lg shadow p-6">
                                <h3 className="text-xl font-bold mb-4 text-red-600">
                                    ⚠️ Erreurs détaillées
                                </h3>

                                <div className="space-y-3">
                                    {result.errors.map((err, idx) => (
                                        <div
                                            key={idx}
                                            className="border border-red-200 rounded-lg p-4 bg-red-50"
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <p className="font-semibold text-red-900">
                                                    Ligne {err.row} - ID: {err.deposant_id}
                                                </p>
                                            </div>

                                            {err.error && (
                                                <p className="text-sm text-red-700">{err.error}</p>
                                            )}

                                            {err.errors && err.errors.length > 0 && (
                                                <div className="mt-2">
                                                    <p className="text-sm font-semibold text-red-800 mb-1">
                                                        Erreurs de validation:
                                                    </p>
                                                    <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                                                        {err.errors.map((e: any, i: number) => (
                                                            <li key={i}>{e.message}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Success Message */}
                        {result.generated > 0 && result.errors.length === 0 && (
                            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                                <p className="font-bold">✅ Import réussi !</p>
                                <p>
                                    Tous les {result.generated} SCV ont été générés avec succès sans erreur.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Instructions */}
                <div className="bg-white rounded-lg shadow p-6 mt-6">
                    <h3 className="font-semibold mb-3">📖 Instructions</h3>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                        <li>Téléchargez le template Excel ci-dessus</li>
                        <li>Remplissez les 3 onglets (Deposants, Heritiers, Comptes)</li>
                        <li>Uploadez le fichier rempli</li>
                        <li>Vérifiez les résultats et corrigez les erreurs si nécessaire</li>
                        <li>Téléchargez le JSON généré</li>
                    </ol>

                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                        <p className="text-sm text-yellow-800">
                            <strong>⚠️ Important :</strong> Le champ <code>deposant_id</code> doit être
                            le même dans les 3 onglets pour lier les données ensemble.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
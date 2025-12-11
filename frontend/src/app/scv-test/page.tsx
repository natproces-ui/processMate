'use client';

import { useState } from 'react';
import { useFormData } from '@/hooks/useFormData';
import DeposantForm from '@/components/scv/DeposantForm';
import HeritierForm from '@/components/scv/HeritierForm';
import CompteForm from '@/components/scv/CompteForm';
import JsonPreview from '@/components/scv/JsonPreview';
import {
    Download,
    Upload,
    Plus,
    X,
    RefreshCw,
    FileSpreadsheet,
    AlertCircle,
    CheckCircle,
    ChevronDown,
    ChevronRight
} from 'lucide-react';

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

export default function Home() {
    const {
        data,
        refs,
        loading,
        error,
        scvCount,
        currentIndex,
        addNewSCV,
        deleteSCV,
        setCurrentSCV,
        updateDeposant,
        updateContact,
        regenerateDeposant,
        addRepresentantLegal,
        updateRepresentantLegal,
        deleteRepresentantLegal,
        regenerateRepresentantLegal,
        addHeritier,
        updateHeritier,
        deleteHeritier,
        regenerateHeritier,
        addCompte,
        updateCompte,
        deleteCompte,
        regenerateCompte,
        regenerateAll,
        exportAllSCV
    } = useFormData();

    const [openSection, setOpenSection] = useState<string>('deposant');
    const [showExportModal, setShowExportModal] = useState(false);
    const [mode, setMode] = useState<'manual' | 'import'>('manual');

    // Excel import state
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [importError, setImportError] = useState<string | null>(null);
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
                setImportError(null);
            } else {
                setImportError('Le fichier doit être un Excel (.xlsx ou .xls)');
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setImportError(null);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            setImportError('Veuillez sélectionner un fichier');
            return;
        }

        setUploading(true);
        setImportError(null);
        setImportResult(null);

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
            setImportResult(data);

        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Erreur inconnue');
        } finally {
            setUploading(false);
        }
    };

    const downloadTemplate = () => {
        window.open('http://localhost:8001/download/template', '_blank');
    };

    const downloadImportResults = () => {
        if (!importResult || !importResult.data) return;

        const json = JSON.stringify(importResult.data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scv_imported_${importResult.generated}_items_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (loading && scvCount === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-lg">Génération des données...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    <div>
                        <p className="font-bold">Erreur</p>
                        <p>{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    const toggleSection = (section: string) => {
        setOpenSection(openSection === section ? '' : section);
    };

    const handleExport = () => {
        const jsonContent = exportAllSCV();
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scv_data_${scvCount}_items_${new Date().getTime()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setShowExportModal(false);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto py-8 px-4">
                {/* Header with mode selector */}
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-3xl font-bold">Générateur SCV JSON</h1>

                        {/* Mode selector */}
                        <div className="flex gap-2 bg-white rounded-lg shadow-sm p-1">
                            <button
                                onClick={() => setMode('manual')}
                                className={`px-4 py-2 rounded flex items-center gap-2 transition-colors ${mode === 'manual'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-white text-gray-700 hover:bg-gray-100'
                                    }`}
                            >
                                <RefreshCw className="w-4 h-4" />
                                Mode Manuel
                            </button>
                            <button
                                onClick={() => setMode('import')}
                                className={`px-4 py-2 rounded flex items-center gap-2 transition-colors ${mode === 'import'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-white text-gray-700 hover:bg-gray-100'
                                    }`}
                            >
                                <Upload className="w-4 h-4" />
                                Import Excel
                            </button>
                        </div>
                    </div>

                    {/* Manual mode - existing interface */}
                    {mode === 'manual' && (
                        <>
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowExportModal(true)}
                                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-medium flex items-center gap-2"
                                    >
                                        <Download className="w-4 h-4" />
                                        Exporter Tout ({scvCount})
                                    </button>
                                    <button
                                        onClick={addNewSCV}
                                        disabled={loading}
                                        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 font-medium disabled:opacity-50 flex items-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Ajouter un SCV
                                    </button>
                                </div>
                            </div>

                            {/* Onglets SCV */}
                            {data && refs && data.SCV && (
                                <div className="bg-white rounded-lg shadow-sm p-2 flex gap-2 overflow-x-auto">
                                    {Array.from({ length: scvCount }).map((_, index) => (
                                        <div key={index} className="flex items-center gap-1">
                                            <button
                                                onClick={() => setCurrentSCV(index)}
                                                className={`px-4 py-2 rounded transition-colors ${currentIndex === index
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                                    }`}
                                            >
                                                SCV {index + 1}
                                            </button>
                                            {scvCount > 1 && (
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`Supprimer le SCV ${index + 1} ?`)) {
                                                            deleteSCV(index);
                                                        }
                                                    }}
                                                    className="px-2 py-2 text-red-500 hover:bg-red-50 rounded"
                                                    title="Supprimer ce SCV"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Content area */}
                {mode === 'manual' && data && refs && data.SCV ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            {/* Header avec info SCV actuel */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="font-semibold text-blue-900">
                                            SCV {currentIndex + 1} / {scvCount}
                                        </h3>
                                        <p className="text-sm text-blue-700">
                                            ID: {data.SCV.identifiantDeposant.idscv}
                                        </p>
                                    </div>
                                    <button
                                        onClick={regenerateAll}
                                        className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 font-medium flex items-center gap-2"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        Régénérer ce SCV
                                    </button>
                                </div>
                            </div>

                            {/* Accordéon Déposant */}
                            <div className="bg-white rounded-lg shadow">
                                <button
                                    onClick={() => toggleSection('deposant')}
                                    className="w-full p-4 flex justify-between items-center hover:bg-gray-50"
                                >
                                    <h2 className="text-xl font-semibold">Identifiant Déposant</h2>
                                    {openSection === 'deposant' ? (
                                        <ChevronDown className="w-5 h-5 text-gray-500" />
                                    ) : (
                                        <ChevronRight className="w-5 h-5 text-gray-500" />
                                    )}
                                </button>
                                {openSection === 'deposant' && (
                                    <div className="p-4 border-t">
                                        <DeposantForm
                                            deposant={data.SCV.identifiantDeposant}
                                            contact={data.SCV.infosContact}
                                            representantsLegaux={data.SCV.representantLegal}
                                            villes={refs.villes}
                                            onUpdateDeposant={updateDeposant}
                                            onUpdateContact={updateContact}
                                            onRegenerate={regenerateDeposant}
                                            onAddRepresentant={addRepresentantLegal}
                                            onUpdateRepresentant={updateRepresentantLegal}
                                            onDeleteRepresentant={deleteRepresentantLegal}
                                            onRegenerateRepresentant={regenerateRepresentantLegal}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Accordéon Héritiers */}
                            <div className="bg-white rounded-lg shadow">
                                <button
                                    onClick={() => toggleSection('heritiers')}
                                    className="w-full p-4 flex justify-between items-center hover:bg-gray-50"
                                >
                                    <h2 className="text-xl font-semibold">
                                        Héritiers ({data.SCV.heritier.length})
                                    </h2>
                                    {openSection === 'heritiers' ? (
                                        <ChevronDown className="w-5 h-5 text-gray-500" />
                                    ) : (
                                        <ChevronRight className="w-5 h-5 text-gray-500" />
                                    )}
                                </button>
                                {openSection === 'heritiers' && (
                                    <div className="p-4 border-t space-y-3">
                                        {data.SCV.heritier.map((heritier, index) => (
                                            <HeritierForm
                                                key={index}
                                                heritier={heritier}
                                                index={index}
                                                totalHeritiers={data.SCV.heritier.length}
                                                villes={refs.villes}
                                                onUpdate={(h) => updateHeritier(index, h)}
                                                onDelete={() => deleteHeritier(index)}
                                                onRegenerate={() => regenerateHeritier(index)}
                                                canDelete={data.SCV.heritier.length > 1}
                                            />
                                        ))}
                                        <button
                                            onClick={addHeritier}
                                            className="w-full py-2 bg-green-500 text-white rounded hover:bg-green-600 font-medium flex items-center justify-center gap-2"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Ajouter un Héritier
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Accordéon Comptes */}
                            <div className="bg-white rounded-lg shadow">
                                <button
                                    onClick={() => toggleSection('comptes')}
                                    className="w-full p-4 flex justify-between items-center hover:bg-gray-50"
                                >
                                    <h2 className="text-xl font-semibold">
                                        Comptes Bancaires ({data.SCV.compte.length})
                                    </h2>
                                    {openSection === 'comptes' ? (
                                        <ChevronDown className="w-5 h-5 text-gray-500" />
                                    ) : (
                                        <ChevronRight className="w-5 h-5 text-gray-500" />
                                    )}
                                </button>
                                {openSection === 'comptes' && (
                                    <div className="p-4 border-t space-y-3">
                                        {data.SCV.compte.map((compte, index) => (
                                            <CompteForm
                                                key={index}
                                                compte={compte}
                                                index={index}
                                                onUpdate={(c) => updateCompte(index, c)}
                                                onDelete={() => deleteCompte(index)}
                                                onRegenerate={() => regenerateCompte(index)}
                                                canDelete={data.SCV.compte.length > 1}
                                            />
                                        ))}
                                        <button
                                            onClick={addCompte}
                                            className="w-full py-2 bg-green-500 text-white rounded hover:bg-green-600 font-medium flex items-center justify-center gap-2"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Ajouter un Compte
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Prévisualisation JSON */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-lg shadow p-4 sticky top-4 h-[calc(100vh-8rem)]">
                                <JsonPreview data={data} />
                            </div>
                        </div>
                    </div>
                ) : mode === 'import' ? (
                    /* Import Excel mode */
                    <div className="max-w-4xl mx-auto space-y-6">
                        {/* Download Template */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-semibold text-blue-900 mb-1 flex items-center gap-2">
                                        <FileSpreadsheet className="w-5 h-5" />
                                        Télécharger le Template
                                    </h3>
                                    <p className="text-sm text-blue-700">
                                        Template Excel avec exemples et format requis
                                    </p>
                                </div>
                                <button
                                    onClick={downloadTemplate}
                                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-medium flex items-center gap-2"
                                >
                                    <Download className="w-4 h-4" />
                                    Télécharger
                                </button>
                            </div>
                        </div>

                        {/* Upload Zone */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="font-semibold mb-4">Upload Fichier Excel</h3>

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
                                    <FileSpreadsheet className="w-16 h-16 mx-auto text-gray-400" />
                                </div>

                                {file ? (
                                    <div className="mb-4">
                                        <p className="font-semibold text-green-600 flex items-center justify-center gap-2">
                                            <CheckCircle className="w-5 h-5" />
                                            Fichier sélectionné
                                        </p>
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

                            <div className="mt-4 flex gap-3">
                                <button
                                    onClick={handleUpload}
                                    disabled={!file || uploading}
                                    className="flex-1 px-6 py-3 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2"
                                >
                                    {uploading ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            Import en cours...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-4 h-4" />
                                            Importer et Générer SCV
                                        </>
                                    )}
                                </button>

                                {file && (
                                    <button
                                        onClick={() => {
                                            setFile(null);
                                            setImportResult(null);
                                            setImportError(null);
                                        }}
                                        className="px-6 py-3 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                                    >
                                        Annuler
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Error Display */}
                        {importError && (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded flex items-start gap-2">
                                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold">Erreur</p>
                                    <p>{importError}</p>
                                </div>
                            </div>
                        )}

                        {/* Results Display */}
                        {importResult && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-lg shadow p-6">
                                    <h3 className="text-xl font-bold mb-4">Résultats de l'import</h3>

                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="bg-blue-50 rounded-lg p-4 text-center">
                                            <p className="text-3xl font-bold text-blue-600">
                                                {importResult.total_rows}
                                            </p>
                                            <p className="text-sm text-gray-600">Lignes traitées</p>
                                        </div>

                                        <div className="bg-green-50 rounded-lg p-4 text-center">
                                            <p className="text-3xl font-bold text-green-600">
                                                {importResult.generated}
                                            </p>
                                            <p className="text-sm text-gray-600">SCV générés</p>
                                        </div>

                                        <div className={`rounded-lg p-4 text-center ${importResult.errors.length > 0
                                            ? 'bg-red-50'
                                            : 'bg-gray-50'
                                            }`}>
                                            <p className={`text-3xl font-bold ${importResult.errors.length > 0
                                                ? 'text-red-600'
                                                : 'text-gray-600'
                                                }`}>
                                                {importResult.errors.length}
                                            </p>
                                            <p className="text-sm text-gray-600">Erreurs</p>
                                        </div>
                                    </div>

                                    {importResult.generated > 0 && (
                                        <div className="mt-6">
                                            <button
                                                onClick={downloadImportResults}
                                                className="w-full px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 font-semibold flex items-center justify-center gap-2"
                                            >
                                                <Download className="w-4 h-4" />
                                                Télécharger {importResult.generated} SCV (JSON)
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {importResult.errors.length > 0 && (
                                    <div className="bg-white rounded-lg shadow p-6">
                                        <h3 className="text-xl font-bold mb-4 text-red-600 flex items-center gap-2">
                                            <AlertCircle className="w-5 h-5" />
                                            Erreurs détaillées
                                        </h3>

                                        <div className="space-y-3">
                                            {importResult.errors.map((err, idx) => (
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

                                {importResult.generated > 0 && importResult.errors.length === 0 && (
                                    <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded flex items-start gap-2">
                                        <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-bold">Import réussi</p>
                                            <p>
                                                Tous les {importResult.generated} SCV ont été générés avec succès sans erreur.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="min-h-screen flex items-center justify-center">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
                            <p className="text-lg">Chargement des données...</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal d'export */}
            {showExportModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-xl font-bold mb-4">Exporter tous les SCV</h3>
                        <p className="text-gray-600 mb-6">
                            Vous allez exporter <strong>{scvCount} SCV</strong> dans un seul fichier JSON.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowExportModal(false)}
                                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleExport}
                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2"
                            >
                                <Download className="w-4 h-4" />
                                Télécharger
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
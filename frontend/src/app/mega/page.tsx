'use client';

import React, { useState } from 'react';
import MegaTable from '@/components/mega/MegaTable';
import { API_CONFIG } from '@/lib/api-config';
import { Upload, FileJson, BarChart3, Loader2, X, Image as ImageIcon, Table } from 'lucide-react';

interface MegaTableRow {
    process: string;
    processName: string;
    what: string;
    type: string;
    eventNature: string;
    who: string;
    comment: string;
    previousItem: string;
    previousItemType: string;
    sequenceLabel: string;
    sequenceType: string;
}

interface Stats {
    total_elements: number;
    by_type: Record<string, number>;
    by_event_nature: Record<string, number>;
    by_who: Record<string, number>;
    elements_with_comments: number;
    elements_with_sequence_label: number;
}

const defaultData: MegaTableRow[] = [
    { process: "B1EDB25E2C1401BB", processName: "000000040000063", what: "F3E9F8765D783312", type: "F3E9F85C5D7832C9", eventNature: "7D4D93E85D8855C1", who: "F3E9F8D95D7833ED", comment: "B654EF975D807DB7", previousItem: "F3E9F8923D78333D", previousItemType: "B6A9B9925D7F3CF9", sequenceLabel: "F3E9F8B35D7833A5", sequenceType: "F3E91B585D7937ED" },
    { process: "B1EDB25E2C1401BB", processName: "My Process", what: "start", type: "Event", eventNature: "Start", who: "My Org-unit", comment: "", previousItem: "", previousItemType: "", sequenceLabel: "", sequenceType: "" },
    { process: "B1EDB25E2C1401BB", processName: "My Process", what: "operation 1", type: "Operation", eventNature: "", who: "My Org-unit", comment: "test op1", previousItem: "start", previousItemType: "Event", sequenceLabel: "", sequenceType: "" },
    { process: "B1EDB25E2C1401BB", processName: "My Process", what: "wait", type: "Event", eventNature: "Catching", who: "My Org-unit", comment: "", previousItem: "operation 1", previousItemType: "Operation", sequenceLabel: "", sequenceType: "" },
    { process: "B1EDB25E2C1401BB", processName: "My Process", what: "operation 2", type: "Operation", eventNature: "", who: "Back Office", comment: "test op2", previousItem: "wait", previousItemType: "Event", sequenceLabel: "", sequenceType: "" },
    { process: "B1EDB25E2C1401BB", processName: "My Process", what: "signal", type: "Event", eventNature: "Throwing", who: "My Org-unit", comment: "", previousItem: "operation 2", previousItemType: "Operation", sequenceLabel: "", sequenceType: "" },
    { process: "B1EDB25E2C1401BB", processName: "My Process", what: "operation 2", type: "Operation", eventNature: "", who: "Back Office", comment: "", previousItem: "is it ok ?", previousItemType: "Gateway", sequenceLabel: "no", sequenceType: "Conditioned" },
    { process: "B1EDB25E2C1401BB", processName: "My Process", what: "is it ok ?", type: "Gateway", eventNature: "", who: "Back office", comment: "", previousItem: "signal", previousItemType: "Event", sequenceLabel: "", sequenceType: "" },
    { process: "B1EDB25E2C1401BB", processName: "My Process", what: "operation 3", type: "Operation", eventNature: "", who: "Agence", comment: "test op3", previousItem: "is it ok ?", previousItemType: "Gateway", sequenceLabel: "ok", sequenceType: "Default" },
    { process: "B1EDB25E2C1401BB", processName: "My Process", what: "end", type: "Event", eventNature: "End", who: "Agence", comment: "", previousItem: "operation 3", previousItemType: "Operation", sequenceLabel: "", sequenceType: "" }
];

export default function MegaPage() {
    const [tableData, setTableData] = useState<MegaTableRow[]>(defaultData);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState<Stats | null>(null);
    const [jsonData, setJsonData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (file: File) => {
        setSelectedFile(file);
        setError(null);

        // Créer un aperçu de l'image
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileChange(e.target.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files && files[0] && files[0].type.startsWith('image/')) {
            handleFileChange(files[0]);
        }
    };

    const handleUploadClick = () => {
        document.getElementById('file-upload')?.click();
    };

    const removeImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedFile(null);
        setImagePreview(null);
        setError(null);
    };

    const processImage = async () => {
        if (!selectedFile) {
            setError('Veuillez sélectionner une image');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const response = await fetch(`${API_CONFIG.baseUrl}/api/mega/process-json`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Échec du traitement de l\'image');
            }

            const result = await response.json();

            if (result.success) {
                setTableData(result.data);
                setStats(result.stats);
                setJsonData(result);
            } else {
                setError(result.error || 'Le traitement a échoué');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        } finally {
            setLoading(false);
        }
    };

    const downloadJson = () => {
        if (!jsonData) return;

        const blob = new Blob([JSON.stringify(jsonData.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mega_table_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">Mega Table</h1>
                    <p className="text-gray-600">Extraire les données de processus depuis des images avec l'IA</p>
                </div>

                {/* Upload Section */}
                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Drag & Drop Zone - Clickable */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Télécharger l'image du processus
                            </label>
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={handleUploadClick}
                                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${isDragging
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                                    }`}
                            >
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleInputChange}
                                    className="hidden"
                                    id="file-upload"
                                />
                                {!selectedFile ? (
                                    <div>
                                        <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                                        <p className="text-gray-600 mb-2">
                                            Glissez-déposez votre image ici, ou cliquez pour parcourir
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            PNG, JPG, JPEG jusqu'à 10MB
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <ImageIcon className="w-8 h-8 text-blue-600" />
                                            <div className="text-left">
                                                <p className="text-sm font-medium text-gray-900">
                                                    {selectedFile.name}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {(selectedFile.size / 1024).toFixed(2)} KB
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={removeImage}
                                            className="p-2 hover:bg-red-50 rounded-full transition-colors"
                                        >
                                            <X className="w-5 h-5 text-red-500" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Image Preview */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Aperçu
                            </label>
                            <div className="border-2 border-gray-200 rounded-lg h-[180px] flex items-center justify-center bg-gray-50">
                                {imagePreview ? (
                                    <img
                                        src={imagePreview}
                                        alt="Aperçu"
                                        className="max-h-full max-w-full object-contain rounded"
                                    />
                                ) : (
                                    <div className="text-center text-gray-400">
                                        <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                                        <p className="text-sm">Aucune image</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Process Button */}
                    <div className="mt-6 flex justify-end">
                        <button
                            onClick={processImage}
                            disabled={!selectedFile || loading}
                            className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Extraction en cours...
                                </>
                            ) : (
                                <>
                                    <Table className="w-5 h-5" />
                                    Générer le tableau
                                </>
                            )}
                        </button>
                    </div>

                    {error && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                            {error}
                        </div>
                    )}
                </div>

                {/* Stats Section - Compact */}
                {stats && (
                    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                            <BarChart3 className="w-5 h-5" />
                            Statistiques d'analyse
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                            <div className="bg-blue-50 p-3 rounded-lg">
                                <p className="text-xs text-gray-600 mb-1">Total</p>
                                <p className="text-xl font-bold text-blue-600">{stats.total_elements}</p>
                            </div>
                            <div className="bg-green-50 p-3 rounded-lg">
                                <p className="text-xs text-gray-600 mb-1">Commentaires</p>
                                <p className="text-xl font-bold text-green-600">{stats.elements_with_comments}</p>
                            </div>
                            <div className="bg-purple-50 p-3 rounded-lg">
                                <p className="text-xs text-gray-600 mb-1">Étiquettes</p>
                                <p className="text-xl font-bold text-purple-600">{stats.elements_with_sequence_label}</p>
                            </div>
                            <div className="bg-orange-50 p-3 rounded-lg">
                                <p className="text-xs text-gray-600 mb-1">Acteurs</p>
                                <p className="text-xl font-bold text-orange-600">{Object.keys(stats.by_who).length}</p>
                            </div>
                            <div className="bg-indigo-50 p-3 rounded-lg">
                                <p className="text-xs text-gray-600 mb-1">Événements</p>
                                <p className="text-xl font-bold text-indigo-600">{stats.by_type['Event'] || 0}</p>
                            </div>
                            <div className="bg-pink-50 p-3 rounded-lg">
                                <p className="text-xs text-gray-600 mb-1">Opérations</p>
                                <p className="text-xl font-bold text-pink-600">{stats.by_type['Operation'] || 0}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Download JSON Button */}
                {jsonData && (
                    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold text-gray-900">Options de téléchargement</h2>
                            <button
                                onClick={downloadJson}
                                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                            >
                                <FileJson className="w-5 h-5" />
                                Télécharger JSON
                            </button>
                        </div>
                    </div>
                )}

                {/* Table Section */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">Données du processus</h2>
                    <MegaTable data={tableData} />
                </div>
            </div>
        </div>
    );
}
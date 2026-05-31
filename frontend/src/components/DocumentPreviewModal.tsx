// components/DocumentPreviewModal.tsx
'use client';

import { X, Download, FileText, CheckCircle } from 'lucide-react';

interface PreviewData {
    metadata: {
        nom: string;
        version: string;
        ref?: string;
        pole?: string;
        direction?: string;
        dateEffet?: string;
        dateDiffusion?: string;
    };
    statistics: {
        total_steps: number;
        tasks: number;
        gateways: number;
        events: number;
        actors_count: number;
        departments_count: number;
        tools_count: number;
        enrichments_count: number;
        has_diagram: boolean;
        has_enrichments: boolean;
        has_annexes: boolean;
    };
    sections: Array<{
        title: string;
        icon: string;
        description: string;
    }>;
}

interface DocumentPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    preview: PreviewData;
    filename: string;
    fileSize: number;
    downloadUrl: string;
    onDownload: () => void;
}

export default function DocumentPreviewModal({
    isOpen,
    onClose,
    preview,
    filename,
    fileSize,
    downloadUrl,
    onDownload
}: DocumentPreviewModalProps) {
    if (!isOpen) return null;

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden border border-gray-700">
                {/* Header */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 p-6 flex items-start justify-between">
                    <div className="flex items-start gap-4">
                        <div className="bg-green-500/10 p-3 rounded-lg">
                            <CheckCircle className="w-8 h-8 text-green-500" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-1">
                                Document généré avec succès !
                            </h2>
                            <p className="text-sm text-gray-400">
                                Prévisualisation du contenu avant téléchargement
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-700 rounded-lg"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                    {/* Metadata */}
                    <div className="mb-6 bg-gray-900 rounded-lg p-4 border border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                            Informations du document
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <span className="text-gray-500">Nom :</span>
                                <span className="text-white ml-2 font-medium">{preview.metadata.nom}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Version :</span>
                                <span className="text-white ml-2 font-medium">{preview.metadata.version}</span>
                            </div>
                            {preview.metadata.pole && (
                            <div>
                                <span className="text-gray-500">Pôle :</span>
                                <span className="text-white ml-2 font-medium">{preview.metadata.pole}</span>
                            </div>
                        )}
                            <div>
                                <span className="text-gray-500">Taille :</span>
                                <span className="text-white ml-2 font-medium">{formatFileSize(fileSize)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Statistics */}
                    <div className="mb-6">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                            Statistiques
                        </h3>
                        <div className="grid grid-cols-4 gap-3">
                            <div className="bg-gray-900 rounded-lg p-3 border border-gray-700 text-center">
                                <div className="text-2xl font-bold text-blue-400">
                                    {preview.statistics.total_steps}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">Étapes</div>
                            </div>
                            <div className="bg-gray-900 rounded-lg p-3 border border-gray-700 text-center">
                                <div className="text-2xl font-bold text-green-400">
                                    {preview.statistics.tasks}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">Tâches</div>
                            </div>
                            <div className="bg-gray-900 rounded-lg p-3 border border-gray-700 text-center">
                                <div className="text-2xl font-bold text-purple-400">
                                    {preview.statistics.actors_count}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">Acteurs</div>
                            </div>
                            <div className="bg-gray-900 rounded-lg p-3 border border-gray-700 text-center">
                                <div className="text-2xl font-bold text-orange-400">
                                    {preview.statistics.departments_count}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">Départements</div>
                            </div>
                        </div>
                    </div>

                    {/* Sections Preview */}
                    <div className="mb-6">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                            Contenu du document ({preview.sections.length} sections)
                        </h3>
                        <div className="space-y-2">
                            {preview.sections.map((section, index) => (
                                <div
                                    key={index}
                                    className="bg-gray-900 border border-gray-700 rounded-lg p-3 flex items-start gap-3 hover:bg-gray-800 transition-colors"
                                >
                                    <span className="text-2xl">{section.icon}</span>
                                    <div className="flex-1">
                                        <h4 className="text-sm font-semibold text-white">
                                            {section.title}
                                        </h4>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {section.description}
                                        </p>
                                    </div>
                                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Features included */}
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                        <div className="flex items-start gap-2">
                            <FileText className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-200">
                                <p className="font-semibold mb-1">Format professionnel</p>
                                <p className="text-xs text-blue-300">
                                    Style MEGA HOPEX • Typographie Calibri • Couleurs corporate •
                                    Table des matières interactive
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="bg-gray-900 border-t border-gray-700 p-4 flex items-center justify-between">
                    <div className="text-sm text-gray-400">
                        <span className="font-medium text-white">{filename}</span>
                        <span className="mx-2">•</span>
                        <span>{formatFileSize(fileSize)}</span>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors font-medium"
                        >
                            Fermer
                        </button>
                        <button
                            onClick={onDownload}
                            className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-semibold flex items-center gap-2 shadow-lg"
                        >
                            <Download className="w-4 h-4" />
                            Télécharger le document
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
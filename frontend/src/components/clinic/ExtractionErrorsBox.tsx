"use client";

import { AlertCircle, CheckCircle, XCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface MissingElement {
    type: 'step' | 'connection' | 'actor' | 'tool' | 'gateway' | 'swimlane';
    description: string;
    location?: string;
    severity: 'critical' | 'warning' | 'info';
}

interface ExtractionError {
    category: string;
    items: MissingElement[];
}

interface ExtractionErrorsBoxProps {
    errors: ExtractionError[];
    totalExtracted: number;
    totalExpected: number;
    accuracy: number;
}

export default function ExtractionErrorsBox({
    errors,
    totalExtracted,
    totalExpected,
    accuracy
}: ExtractionErrorsBoxProps) {
    const [expanded, setExpanded] = useState(true);

    const getSeverityColor = (severity: MissingElement['severity']) => {
        switch (severity) {
            case 'critical':
                return 'text-red-600 bg-red-50 border-red-200';
            case 'warning':
                return 'text-orange-600 bg-orange-50 border-orange-200';
            case 'info':
                return 'text-blue-600 bg-blue-50 border-blue-200';
        }
    };

    const getSeverityIcon = (severity: MissingElement['severity']) => {
        switch (severity) {
            case 'critical':
                return <XCircle className="w-4 h-4" />;
            case 'warning':
                return <AlertCircle className="w-4 h-4" />;
            case 'info':
                return <Info className="w-4 h-4" />;
        }
    };

    const getTypeLabel = (type: MissingElement['type']) => {
        const labels = {
            step: '📋 Étape',
            connection: '🔗 Connexion',
            actor: '👤 Acteur',
            tool: '🔧 Outil',
            gateway: '◇ Gateway',
            swimlane: '🏊 Swimlane'
        };
        return labels[type];
    };

    const criticalCount = errors.reduce(
        (acc, cat) => acc + cat.items.filter(i => i.severity === 'critical').length,
        0
    );
    const warningCount = errors.reduce(
        (acc, cat) => acc + cat.items.filter(i => i.severity === 'warning').length,
        0
    );

    return (
        <div className="bg-white rounded-lg border-2 border-orange-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-50 to-red-50 p-4 border-b-2 border-orange-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="w-6 h-6 text-orange-600" />
                        <div>
                            <h3 className="font-bold text-lg text-orange-900">
                                Analyse des erreurs d'extraction
                            </h3>
                            <p className="text-sm text-orange-700">
                                Comparaison entre l'image source et le Process extrait
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="p-2 hover:bg-orange-100 rounded-lg transition-colors"
                    >
                        {expanded ? (
                            <ChevronUp className="w-5 h-5 text-orange-700" />
                        ) : (
                            <ChevronDown className="w-5 h-5 text-orange-700" />
                        )}
                    </button>
                </div>

                {/* Stats Summary */}
                <div className="mt-4 grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg p-3 border border-orange-200">
                        <div className="text-xs text-gray-600 mb-1">Précision</div>
                        <div className={`text-2xl font-bold ${accuracy >= 90 ? 'text-green-600' :
                            accuracy >= 70 ? 'text-orange-600' :
                                'text-red-600'
                            }`}>
                            {accuracy.toFixed(1)}%
                        </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-orange-200">
                        <div className="text-xs text-gray-600 mb-1">Éléments manquants</div>
                        <div className="text-2xl font-bold text-red-600">
                            {totalExpected - totalExtracted}
                        </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-orange-200">
                        <div className="text-xs text-gray-600 mb-1">Extraits</div>
                        <div className="text-2xl font-bold text-gray-800">
                            {totalExtracted}/{totalExpected}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            {expanded && (
                <div className="p-4">
                    {/* Error Badges */}
                    <div className="flex gap-3 mb-4">
                        {criticalCount > 0 && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded-full">
                                <XCircle className="w-4 h-4 text-red-600" />
                                <span className="text-sm font-medium text-red-700">
                                    {criticalCount} critique{criticalCount > 1 ? 's' : ''}
                                </span>
                            </div>
                        )}
                        {warningCount > 0 && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-orange-50 border border-orange-200 rounded-full">
                                <AlertCircle className="w-4 h-4 text-orange-600" />
                                <span className="text-sm font-medium text-orange-700">
                                    {warningCount} avertissement{warningCount > 1 ? 's' : ''}
                                </span>
                            </div>
                        )}
                        {criticalCount === 0 && warningCount === 0 && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded-full">
                                <CheckCircle className="w-4 h-4 text-green-600" />
                                <span className="text-sm font-medium text-green-700">
                                    Extraction complète
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Error Categories */}
                    {errors.length > 0 ? (
                        <div className="space-y-4">
                            {errors.map((category, catIdx) => (
                                <div key={catIdx} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                    <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                                        <span className="text-orange-600">▸</span>
                                        {category.category}
                                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">
                                            {category.items.length}
                                        </span>
                                    </h4>

                                    <div className="space-y-2">
                                        {category.items.map((item, itemIdx) => (
                                            <div
                                                key={itemIdx}
                                                className={`p-3 rounded-lg border flex items-start gap-3 ${getSeverityColor(item.severity)}`}
                                            >
                                                {getSeverityIcon(item.severity)}
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-medium">
                                                            {getTypeLabel(item.type)}
                                                        </span>
                                                        {item.location && (
                                                            <span className="text-xs opacity-75">
                                                                • {item.location}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm font-medium">
                                                        {item.description}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                            <p className="text-gray-600">
                                Aucune erreur détectée ! L'extraction semble complète.
                            </p>
                        </div>
                    )}

                    {/* Recommendations */}
                    {(criticalCount > 0 || warningCount > 0) && (
                        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-start gap-3">
                                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                                <div>
                                    <h5 className="font-semibold text-blue-900 mb-2">
                                        Recommandations
                                    </h5>
                                    <ul className="text-sm text-blue-800 space-y-1">
                                        {criticalCount > 0 && (
                                            <li>• Vérifiez manuellement les éléments critiques manquants</li>
                                        )}
                                        <li>• Vous pouvez éditer le tableau pour compléter les informations</li>
                                        <li>• Ou ré-uploader une image plus claire du processus</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
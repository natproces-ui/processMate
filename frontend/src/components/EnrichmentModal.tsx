'use client';

import { useState, useEffect } from 'react';
import { X, FileText, Clock, Calendar, Target } from 'lucide-react';
import { TaskEnrichment, FREQUENCE_OPTIONS } from '@/logic/bpmnTypes';

interface EnrichmentModalProps {
    isOpen: boolean;
    taskId: string;
    taskName: string;
    enrichment: TaskEnrichment | null;
    onSave: (enrichment: TaskEnrichment) => void;
    onClose: () => void;
}

export default function EnrichmentModal({
    isOpen,
    taskId,
    taskName,
    enrichment,
    onSave,
    onClose
}: EnrichmentModalProps) {
    const [formData, setFormData] = useState<TaskEnrichment>({
        id_tache: taskId,
        descriptif: '',
        duree_estimee: '',
        frequence: '',
        kpi: ''
    });

    // Initialiser le formulaire avec les données existantes
    useEffect(() => {
        if (enrichment) {
            setFormData(enrichment);
        } else {
            setFormData({
                id_tache: taskId,
                descriptif: '',
                duree_estimee: '',
                frequence: '',
                kpi: ''
            });
        }
    }, [taskId, enrichment]);

    const handleChange = (field: keyof TaskEnrichment, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        onSave(formData);
        onClose();
    };

    const handleCancel = () => {
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <FileText className="w-6 h-6" />
                        <div>
                            <h2 className="text-xl font-bold">Enrichissement de la tâche</h2>
                            <p className="text-blue-100 text-sm mt-1">{taskName}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleCancel}
                        className="text-white hover:bg-blue-800 rounded-full p-2 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* Descriptif */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                            <FileText className="w-4 h-4 text-blue-600" />
                            Descriptif détaillé (optionnel)
                        </label>
                        <textarea
                            value={formData.descriptif}
                            onChange={(e) => handleChange('descriptif', e.target.value)}
                            placeholder="Décrivez en détail cette étape : objectif, inputs, outputs, risques, contrôles..."
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            rows={6}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Ce champ peut regrouper : objectif, inputs, outputs, risques, contrôles, etc.
                        </p>
                    </div>

                    {/* Durée estimée */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                            <Clock className="w-4 h-4 text-green-600" />
                            Durée estimée
                        </label>
                        <input
                            type="text"
                            value={formData.duree_estimee}
                            onChange={(e) => handleChange('duree_estimee', e.target.value)}
                            placeholder="Ex: 15 min, 2h, 1 jour"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {/* Fréquence */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                            <Calendar className="w-4 h-4 text-purple-600" />
                            Fréquence
                        </label>
                        <select
                            value={formData.frequence}
                            onChange={(e) => handleChange('frequence', e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            {FREQUENCE_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* KPI */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                            <Target className="w-4 h-4 text-orange-600" />
                            KPI / Indicateur de performance
                        </label>
                        <input
                            type="text"
                            value={formData.kpi}
                            onChange={(e) => handleChange('kpi', e.target.value)}
                            placeholder="Ex: Taux d'erreur < 2%, Délai < 24h"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 rounded-b-lg flex justify-end gap-3">
                    <button
                        onClick={handleCancel}
                        className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                        Sauvegarder
                    </button>
                </div>
            </div>
        </div>
    );
}
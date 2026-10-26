'use client';

import { useState, useEffect } from 'react';
import { X, FileText, Clock, Monitor, Link2 } from 'lucide-react';
import { TaskEnrichment } from '@/logic/bpmnTypes';
import type { StepLink } from '@/lib/processLinks';
import StepScreensPicker from '@/components/orchestration/StepScreensPicker';
import ProcessLinksEditor from '@/components/orchestration/ProcessLinksEditor';

interface EnrichmentModalProps {
    isOpen: boolean;
    taskId: string;
    taskName: string;
    /** Outil de l'étape (Table1Row.outil) — les écrans proposés sont ceux de cet outil. */
    toolName: string;
    /** session_id de la procédure éditée, s'il est connu — exclu des cibles de lien. */
    currentSessionId?: string;
    enrichment: TaskEnrichment | null;
    onSave: (enrichment: TaskEnrichment) => void;
    onClose: () => void;
}

const emptyEnrichment = (taskId: string): TaskEnrichment => ({
    id_tache: taskId,
    descriptif: '',
    declencheur: '',
    applicatif: '',
    duree_estimee: '',
    frequence: '',
    kpi: ''
});

export default function EnrichmentModal({
    isOpen,
    taskId,
    taskName,
    toolName,
    currentSessionId,
    enrichment,
    onSave,
    onClose
}: EnrichmentModalProps) {
    const [formData, setFormData] = useState<TaskEnrichment>(emptyEnrichment(taskId));

    // Initialiser le formulaire avec les données existantes
    useEffect(() => {
        if (enrichment) {
            setFormData(enrichment);
        } else {
            setFormData(emptyEnrichment(taskId));
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
                            <h2 className="text-xl font-bold">Détails de la tâche</h2>
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

                    {/* Écrans — rattachés à l'outil, l'étape choisit ceux qu'elle utilise */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                            <Monitor className="w-4 h-4 text-violet-600" />
                            Écrans utilisés{toolName ? ` — ${toolName}` : ''}
                        </label>
                        <StepScreensPicker
                            toolName={toolName}
                            value={formData.ecrans ?? []}
                            onChange={ids => setFormData(prev => ({ ...prev, ecrans: ids }))}
                        />
                    </div>

                    {/* Liens vers d'autres procédures — le sens inverse s'affiche sur la cible */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                            <Link2 className="w-4 h-4 text-amber-600" />
                            Liens vers d'autres process
                        </label>
                        <ProcessLinksEditor
                            types={['fait_appel_a', 'declenche']}
                            value={formData.liens ?? []}
                            onChange={items => setFormData(prev => ({ ...prev, liens: items as StepLink[] }))}
                            excludeSessionId={currentSessionId}
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
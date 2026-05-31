'use client';

import React from 'react';
import { Check, FileText, Layers, BarChart2 } from 'lucide-react';
import { SFDFormatType, FormatOption } from '@/types/sfd';

interface FormatSelectorProps {
    selectedFormat: SFDFormatType;
    onFormatChange: (format: SFDFormatType) => void;
    disabled?: boolean;
}

const FORMAT_OPTIONS: FormatOption[] = [
    {
        id: 'format1',
        name: 'Format Classique',
        description: 'Structure détaillée : modules, fonctions, cas d\'usage, contraintes techniques',
        icon: 'FileText'
    },
    {
        id: 'format2',
        name: 'Format Agile',
        description: 'User Stories, Epics, critères d\'acceptation, workflows',
        icon: 'Layers'
    },
    {
        id: 'format3',
        name: 'Portail Statistique',
        description: 'Portail de diffusion de données : modules, séries statistiques, API, cas d\'utilisation',
        icon: 'BarChart2'
    }
];

export default function FormatSelector({
    selectedFormat,
    onFormatChange,
    disabled = false
}: FormatSelectorProps) {

    const getIcon = (iconName: string) => {
        switch (iconName) {
            case 'FileText': return FileText;
            case 'Layers': return Layers;
            case 'BarChart2': return BarChart2;
            default: return FileText;
        }
    };

    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-900">
                Format de spécification
            </label>

            <div className="grid grid-cols-1 gap-3">
                {FORMAT_OPTIONS.map((format) => {
                    const Icon = getIcon(format.icon);
                    const isSelected = selectedFormat === format.id;

                    return (
                        <button
                            key={format.id}
                            onClick={() => onFormatChange(format.id)}
                            disabled={disabled}
                            className={`
                                relative p-4 rounded-xl border-2 text-left transition-all
                                ${isSelected
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }
                                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                        >
                            {isSelected && (
                                <div className="absolute top-3 right-3 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                    <Check className="w-3 h-3 text-white" />
                                </div>
                            )}

                            <div className={`
                                w-10 h-10 rounded-lg flex items-center justify-center mb-3
                                ${isSelected ? 'bg-blue-100' : 'bg-slate-100'}
                            `}>
                                <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-slate-600'}`} />
                            </div>

                            <div>
                                <h3 className={`font-semibold mb-1 ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>
                                    {format.name}
                                </h3>
                                <p className="text-sm text-slate-600 leading-relaxed">
                                    {format.description}
                                </p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
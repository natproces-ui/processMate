'use client';

import { Check } from 'lucide-react';

export type StyleName = 'al_maghrib' | 'corporate_blue';

export interface StyleOption {
    name: StyleName;
    label: string;
    description: string;
    colors: {
        primary: string;
        secondary: string;
        accent: string;
        bg: string;
    };
}

export const STYLE_OPTIONS: StyleOption[] = [
    {
        name: 'al_maghrib',
        label: 'Bank Al-Maghrib',
        description: 'Bordeaux institutionnel, sobre et officiel',
        colors: {
            primary: '#7B0C0C',
            secondary: '#A02020',
            accent: '#C4922A',
            bg: '#F5ECEC',
        },
    },
    {
        name: 'corporate_blue',
        label: 'Corporate Blue',
        description: 'Bleu professionnel, style entreprise',
        colors: {
            primary: '#1F3964',
            secondary: '#2E74B5',
            accent: '#2E74B5',
            bg: '#E8EEF5',
        },
    },
];

interface StyleSelectorProps {
    value: StyleName;
    onChange: (style: StyleName) => void;
    disabled?: boolean;
    compact?: boolean; // mode compact pour la sidebar
}

export default function StyleSelector({
    value,
    onChange,
    disabled = false,
    compact = false,
}: StyleSelectorProps) {
    if (compact) {
        return (
            <div className="flex gap-2">
                {STYLE_OPTIONS.map((opt) => {
                    const isSelected = value === opt.name;
                    return (
                        <button
                            key={opt.name}
                            onClick={() => !disabled && onChange(opt.name)}
                            disabled={disabled}
                            title={opt.label}
                            className={`
                flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-medium
                transition-all duration-150
                ${isSelected
                                    ? 'border-current shadow-sm'
                                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
                            style={isSelected ? {
                                borderColor: opt.colors.primary,
                                color: opt.colors.primary,
                                backgroundColor: opt.colors.bg,
                            } : {}}
                        >
                            {/* Swatches */}
                            <div className="flex gap-0.5 flex-shrink-0">
                                <span
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: opt.colors.primary }}
                                />
                                <span
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: opt.colors.accent }}
                                />
                            </div>
                            <span className="truncate">{opt.label}</span>
                            {isSelected && (
                                <Check
                                    className="w-3 h-3 flex-shrink-0 ml-auto"
                                    style={{ color: opt.colors.primary }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>
        );
    }

    // Mode normal — cartes complètes
    return (
        <div className="grid grid-cols-2 gap-2">
            {STYLE_OPTIONS.map((opt) => {
                const isSelected = value === opt.name;
                return (
                    <button
                        key={opt.name}
                        onClick={() => !disabled && onChange(opt.name)}
                        disabled={disabled}
                        className={`
              relative text-left rounded-xl border p-3 transition-all duration-150
              ${isSelected ? 'shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
                        style={isSelected ? {
                            borderColor: opt.colors.primary,
                            backgroundColor: opt.colors.bg,
                        } : {}}
                    >
                        {/* Check */}
                        {isSelected && (
                            <span
                                className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: opt.colors.primary }}
                            >
                                <Check className="w-2.5 h-2.5 text-white" />
                            </span>
                        )}

                        {/* Preview mini-document */}
                        <div
                            className="w-full h-14 rounded-md mb-2.5 overflow-hidden border"
                            style={{ borderColor: isSelected ? opt.colors.primary + '40' : '#e2e8f0' }}
                        >
                            {/* En-tête simulé */}
                            <div
                                className="h-4 w-full flex items-center px-1.5 gap-1"
                                style={{ backgroundColor: opt.colors.primary }}
                            >
                                <span className="w-8 h-1.5 rounded-full bg-white/60" />
                                <span className="w-5 h-1.5 rounded-full bg-white/40" />
                            </div>
                            {/* Corps simulé */}
                            <div className="p-1.5 space-y-1" style={{ backgroundColor: opt.colors.bg }}>
                                <span
                                    className="block h-1.5 w-3/4 rounded-full"
                                    style={{ backgroundColor: opt.colors.primary + '50' }}
                                />
                                <span
                                    className="block h-1 w-full rounded-full"
                                    style={{ backgroundColor: opt.colors.secondary + '30' }}
                                />
                                <span
                                    className="block h-1 w-5/6 rounded-full"
                                    style={{ backgroundColor: opt.colors.secondary + '30' }}
                                />
                                {/* Ligne accent */}
                                <span
                                    className="block h-1 w-1/2 rounded-full"
                                    style={{ backgroundColor: opt.colors.accent + '60' }}
                                />
                            </div>
                        </div>

                        {/* Label */}
                        <p
                            className="text-xs font-semibold leading-tight mb-0.5"
                            style={{ color: isSelected ? opt.colors.primary : '#374151' }}
                        >
                            {opt.label}
                        </p>
                        <p className="text-[10px] text-slate-400 leading-tight">
                            {opt.description}
                        </p>

                        {/* Swatches couleurs */}
                        <div className="flex gap-1 mt-2">
                            {Object.values(opt.colors).slice(0, 3).map((c, i) => (
                                <span
                                    key={i}
                                    className="w-3 h-3 rounded-full border border-white shadow-sm"
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
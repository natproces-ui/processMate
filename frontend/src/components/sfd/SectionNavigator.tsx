'use client';

import { CheckCircle2, Circle, ChevronRight } from 'lucide-react';
import { SECTIONS, SectionKey, SectionStatus } from '@/types/sfd-generator';

interface SectionNavigatorProps {
  sectionsStatus: Record<string, SectionStatus>;
  activeSection?: string;
  onSectionClick: (key: SectionKey) => void;
  onValidate: (key: SectionKey) => void;
}

export default function SectionNavigator({
  sectionsStatus,
  activeSection,
  onSectionClick,
  onValidate,
}: SectionNavigatorProps) {
  const validated = Object.values(sectionsStatus).filter((s) => s === 'validated').length;

  return (
    <div className="flex flex-col h-full">
      {/* Barre de progression globale */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
          <span>Sections validées</span>
          <span className="font-semibold text-slate-700">{validated}/{SECTIONS.length}</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${(validated / SECTIONS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Liste des sections */}
      <div className="flex-1 overflow-y-auto py-2">
        {SECTIONS.map((section) => {
          const status = sectionsStatus[section.key] ?? 'draft';
          const isActive = activeSection === section.key;
          const isValidated = status === 'validated';

          return (
            <div
              key={section.key}
              className={`group flex items-center gap-2 px-3 py-2 mx-2 rounded-lg cursor-pointer transition-all ${
                isActive
                  ? 'bg-blue-50 border border-blue-200'
                  : 'hover:bg-slate-50 border border-transparent'
              }`}
              onClick={() => onSectionClick(section.key)}
            >
              {/* Icône statut */}
              {isValidated ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
              ) : (
                <Circle className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-300'}`} />
              )}

              {/* Numéro + label */}
              <div className="flex-1 min-w-0">
                <span className={`text-xs font-medium ${isActive ? 'text-blue-700' : isValidated ? 'text-slate-600' : 'text-slate-500'}`}>
                  {section.number}.{' '}
                </span>
                <span className={`text-xs ${isActive ? 'text-blue-700 font-semibold' : isValidated ? 'text-slate-600' : 'text-slate-600'}`}>
                  {section.label}
                </span>
              </div>

              {/* Bouton valider */}
              {!isValidated && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onValidate(section.key);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5 bg-green-50 text-green-600 border border-green-200 rounded hover:bg-green-100 transition-opacity flex-shrink-0"
                >
                  ✓
                </button>
              )}

              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

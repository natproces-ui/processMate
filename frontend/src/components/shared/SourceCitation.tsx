'use client';

// Citation d'une étape : le fichier, l'endroit (page, diapositive, section) et l'extrait recopié qui la justifie.
// Partagée par le Studio (tableau, détails) et l'espace de travail (éditeur), comme les autres éléments d'une étape.
import { FileText } from 'lucide-react';

export interface StepSource {
    fichier: string;
    endroit?: string;
    extrait?: string;
}

export default function SourceCitation({ source, compact = false }: { source?: StepSource | null; compact?: boolean }) {
    if (!source?.fichier) return null;
    const where = [source.fichier, source.endroit].filter(Boolean).join(' · ');
    return (
        <span className="inline-flex max-w-full items-start gap-1 text-[11px] text-neutral-600"
            title={source.extrait ? `« ${source.extrait} »` : undefined}>
            <FileText className="mt-px h-3 w-3 shrink-0 text-neutral-400" />
            <span className={compact ? 'truncate' : ''}>
                {where}
                {!compact && source.extrait && <span className="italic text-neutral-500"> — « {source.extrait} »</span>}
            </span>
        </span>
    );
}

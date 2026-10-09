export type ProcessingLevel = 'fast' | 'normal' | 'deep';

export const PROCESSING_LEVELS: { value: ProcessingLevel; label: string; description: string }[] = [
    { value: 'fast', label: 'Rapide', description: 'Privilégie la rapidité du traitement.' },
    { value: 'normal', label: 'Normale', description: 'Équilibre rapidité et analyse.' },
    { value: 'deep', label: 'Approfondie', description: 'Privilégie une analyse détaillée, avec davantage d’attente.' },
];

export function isProcessingLevel(value: unknown): value is ProcessingLevel {
    return value === 'fast' || value === 'normal' || value === 'deep';
}

export function processingLevelHeaders(level?: ProcessingLevel): Record<string, string> {
    return level ? { 'X-Processing-Level': level } : {};
}

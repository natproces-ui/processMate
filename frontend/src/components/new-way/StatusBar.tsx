// components/StatusBar.tsx
'use client';

interface StatusBarProps {
    elementCount: number;
    filename: string | null;
    hasChanges: boolean;
}

export default function StatusBar({ elementCount, filename, hasChanges }: StatusBarProps) {
    return (
        <footer className="h-5 bg-blue-600 flex items-center px-4 gap-4 text-[10px] text-blue-100 flex-shrink-0 select-none">
            <span>{filename ?? 'Sans titre'}</span>
            {hasChanges && <span className="text-blue-200 opacity-70">● Modifié</span>}
            <div className="flex-1" />
            <span>{elementCount} élément{elementCount !== 1 ? 's' : ''}</span>
            <span className="text-blue-400">BPMN 2.0</span>
        </footer>
    );
}
'use client';

// components/processmate/ClinicPanel.tsx
// Wrapper du module Clinic dans le shell ProcessMate.
// Clinic = analyse de code applicatif → flowchart/BPMN
// Importe le composant Clinic existant depuis /app/clinic/page.tsx

import dynamic from 'next/dynamic';

// Import dynamique — Clinic utilise des APIs browser (canvas, file API)
const ClinicPage = dynamic(
    () => import('@/app/clinic/page'),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full items-center justify-center bg-slate-50">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-teal-500 rounded-full animate-spin" />
            </div>
        ),
    }
);

export default function ClinicPanel() {
    return (
        <div className="h-full overflow-hidden overflow-y-auto">
            <ClinicPage />
        </div>
    );
}
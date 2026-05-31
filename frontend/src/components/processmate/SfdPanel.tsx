'use client';

// components/processmate/SfdPanel.tsx
// Wrapper du SFD Generator dans le shell ProcessMate.
// Importe directement le composant page SFD existant.
// Le SFD gère son propre layout interne (panneau gauche + preview).

import dynamic from 'next/dynamic';

// Import dynamique pour éviter les problèmes SSR (le SFD utilise des APIs browser)
const SFDGeneratorPage = dynamic(
    () => import('@/app/sfd/page'),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full items-center justify-center bg-slate-100">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
            </div>
        ),
    }
);

export default function SfdPanel() {
    return (
        <div className="h-full overflow-hidden">
            <SFDGeneratorPage />
        </div>
    );
}
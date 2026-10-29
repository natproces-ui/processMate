'use client';

// components/orchestration/ScreenMockup.tsx
//
// Écran du référentiel qui n'a ni page dessinée ni capture (typiquement l'écran d'un outil
// tiers existant, comme SAB-Sopra) : cadre neutre qui le dit, avec ses champs tels que
// décrits. Pas d'imitation d'interface. Utilisé par ScreenFrame.

import type { ToolScreen } from '@/lib/toolsApi';

const TYPE_LABEL: Record<string, string> = {
    texte: 'Texte', nombre: 'Nombre', date: 'Date', liste: 'Liste', case: 'Case à cocher', fichier: 'Fichier', affichage: 'Affiché',
};

export default function ScreenMockup({ screen, toolName }: { screen: ToolScreen; toolName: string }) {
    const fields = [...screen.fields].sort((a, b) => a.sort_order - b.sort_order);
    return (
        <div className="bg-slate-50 w-full" style={{ aspectRatio: '16 / 10' }}>
            <div className="h-full flex flex-col p-6">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Écran de {toolName}</p>
                <h3 className="mt-1 text-lg font-bold text-slate-800">{screen.name}</h3>
                {screen.description && <p className="mt-1 text-sm text-slate-500 line-clamp-2">{screen.description}</p>}
                <div className="mt-4 flex-1 min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {fields.length === 0 ? (
                        <p className="p-4 text-sm text-slate-400">Aucun champ décrit.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-100">
                                {fields.map(f => (
                                    <tr key={f.id}>
                                        <td className="px-4 py-2 text-slate-700">{f.name}{f.required && <span className="text-rose-500"> *</span>}</td>
                                        <td className="px-4 py-2 text-xs text-slate-400 w-32">{TYPE_LABEL[f.field_type] ?? f.field_type}</td>
                                        <td className="px-4 py-2 text-xs text-slate-500 truncate max-w-[220px]">{f.example_value}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <p className="mt-3 text-xs text-slate-400">Interface de l&apos;outil existant, non maquettée. Ajoutez une capture depuis la fiche applicatif.</p>
            </div>
        </div>
    );
}

'use client';

/** Compte libre invité par une organisation : il accepte ou refuse (jamais rattaché sans accord). */
import { useState } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ORG_ROLES, invitationsApi } from '@/lib/organisationApi';

export default function InvitationBanner() {
    const { access, refreshAccess } = useAuth();
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const invitations = access?.invitations ?? [];
    if (invitations.length === 0) return null;

    const answer = async (id: string, accept: boolean) => {
        setBusy(id);
        setError(null);
        try { await invitationsApi.answer(id, accept); await refreshAccess(); }
        catch (e) { setError(e instanceof Error ? e.message : 'Réponse impossible'); }
        finally { setBusy(null); }
    };

    return (
        <section aria-label="Invitations" className="space-y-2">
            {invitations.map(inv => (
                <div key={inv.id} className="rounded-lg border border-blue-100 bg-blue-50/60 p-2.5 text-xs text-slate-700">
                    <p className="flex items-start gap-1.5">
                        <Building2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-600" />
                        <span><span className="font-semibold">{inv.organisation}</span> vous invite à rejoindre son espace
                            ({ORG_ROLES.find(r => r.id === inv.role)?.label.toLowerCase()}).</span>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">Vos conversations et projets restent privés.</p>
                    <div className="mt-2 flex gap-2">
                        <button type="button" disabled={busy !== null} onClick={() => void answer(inv.id, true)}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                            {busy === inv.id && <Loader2 className="w-3 h-3 animate-spin" />} Rejoindre
                        </button>
                        <button type="button" disabled={busy !== null} onClick={() => void answer(inv.id, false)}
                            className="rounded-md border border-slate-300 px-2.5 py-1 text-slate-600 hover:bg-white disabled:opacity-50">Refuser</button>
                    </div>
                </div>
            ))}
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        </section>
    );
}

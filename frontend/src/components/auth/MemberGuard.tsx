'use client';

/**
 * Espace de l'organisation (référentiel, campagnes, orchestration…) : réservé aux membres
 * actifs. Un compte créé librement garde son espace personnel (chat, projets) et voit ici
 * pourquoi il n'a pas encore accès. Le backend applique la même règle (access_control.py).
 */
import Link from 'next/link';
import { Loader2, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function MemberGuard({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
    const { access, refreshAccess } = useAuth();

    if (access === null) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
        );
    }

    const allowed = admin ? access.is_admin : access.member;
    if (allowed) return <>{children}</>;

    const suspended = access.status === 'suspended';
    if (access.status === 'organisation_suspendue') {
        return (
            <main className="h-screen flex items-center justify-center bg-gray-50 px-4">
                <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h1 className="text-lg font-semibold text-slate-900">L&apos;espace de votre organisation est suspendu</h1>
                    <p className="mt-2 text-sm text-slate-600">
                        Rien n&apos;est supprimé. Contactez processMate pour le réactiver. Le chat et vos projets personnels restent disponibles.
                    </p>
                    <Link href="/" className="mt-5 inline-block rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700">
                        Aller au chat
                    </Link>
                </div>
            </main>
        );
    }
    if (access.status === 'indisponible') {
        return (
            <main className="h-screen flex items-center justify-center bg-gray-50 px-4">
                <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h1 className="text-lg font-semibold text-slate-900">Vos droits n&apos;ont pas pu être vérifiés</h1>
                    <p className="mt-2 text-sm text-slate-600">Le service ne répond pas pour le moment.</p>
                    <button type="button" onClick={() => void refreshAccess()}
                        className="mt-5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700">
                        Réessayer
                    </button>
                </div>
            </main>
        );
    }
    return (
        <main className="h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                    <Lock className="w-5 h-5 text-slate-500" />
                </div>
                <h1 className="text-lg font-semibold text-slate-900">
                    {admin ? 'Réservé aux administrateurs'
                        : suspended ? 'Accès suspendu' : 'Accès à l’espace de l’organisation en attente'}
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                    {admin
                        ? 'Cette page sert à gérer les comptes et leurs droits.'
                        : suspended
                            ? 'Votre accès au référentiel a été suspendu. Contactez un administrateur.'
                            : 'Votre compte est créé. Un administrateur doit l’activer pour que vous accédiez au référentiel, aux campagnes et au pilotage. En attendant, le chat et vos projets restent disponibles.'}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                    <Link href="/" className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700">
                        Aller au chat
                    </Link>
                    <Link href="/projets" className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50">
                        Mes projets
                    </Link>
                    {!admin && (
                        <button type="button" onClick={() => void refreshAccess()}
                            className="rounded-lg px-3.5 py-2 text-sm text-slate-500 hover:text-slate-800">
                            Vérifier à nouveau
                        </button>
                    )}
                </div>
            </div>
        </main>
    );
}

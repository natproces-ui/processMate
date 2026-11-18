'use client';

/**
 * Définir son mot de passe.
 * - Arrivée par un lien d'invitation ou de réinitialisation (compte créé par processMate
 *   ou par l'admin de l'organisation) : Supabase ouvre la session depuis l'URL, on choisit
 *   le mot de passe.
 * - ?oubli=1 : « Mot de passe oublié » — on demande un lien par e-mail.
 * Hors de /auth : ce layout renvoie les personnes connectées vers l'accueil.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';

const inputCls = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
                <div className="mt-4">{children}</div>
            </div>
        </main>
    );
}

function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${window.location.origin}/mot-de-passe/`,
        });
        setBusy(false);
        if (error) setError('Envoi impossible pour le moment. Réessayez dans quelques minutes.');
        else setSent(true);
    };

    return (
        <Card title="Mot de passe oublié">
            {sent ? (
                <p className="text-sm text-slate-600">
                    Si un compte existe pour cette adresse, un lien vient d&apos;y être envoyé. Ouvrez-le pour choisir un nouveau mot de passe.
                </p>
            ) : (
                <form onSubmit={submit} className="flex flex-col gap-3">
                    <label className="text-sm font-medium text-gray-700" htmlFor="email">Adresse e-mail</label>
                    <input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
                    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                    <button type="submit" disabled={busy || !email.trim()}
                        className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                        {busy ? 'Envoi…' : 'Recevoir un lien'}
                    </button>
                </form>
            )}
            <Link href="/auth/login" className="mt-4 inline-block text-sm text-blue-600 hover:underline">Retour à la connexion</Link>
        </Card>
    );
}

function SetPassword() {
    const { user, loading } = useAuth();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [waited, setWaited] = useState(false);

    // La session arrive depuis l'URL du lien : on lui laisse quelques secondes
    useEffect(() => { const t = setTimeout(() => setWaited(true), 4000); return () => clearTimeout(t); }, []);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 8) { setError('Au moins 8 caractères.'); return; }
        if (password !== confirm) { setError('Les deux mots de passe sont différents.'); return; }
        setBusy(true);
        setError(null);
        const { error } = await supabase.auth.updateUser({ password });
        setBusy(false);
        if (error) setError('Enregistrement impossible. Le lien a peut-être expiré : demandez-en un nouveau.');
        else window.location.href = '/';
    };

    if (!user) {
        if (loading || !waited) {
            return <Card title="Ouverture du lien…"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></Card>;
        }
        return (
            <Card title="Lien invalide ou expiré">
                <p className="text-sm text-slate-600">
                    Demandez un nouveau lien à la personne qui a créé votre compte, ou utilisez « Mot de passe oublié ».
                </p>
                <Link href="/mot-de-passe/?oubli=1" className="mt-4 inline-block text-sm text-blue-600 hover:underline">Mot de passe oublié</Link>
            </Card>
        );
    }

    return (
        <Card title="Choisissez votre mot de passe">
            <p className="text-sm text-slate-600">Compte : <span className="font-medium">{user.email}</span></p>
            <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
                <label className="text-sm font-medium text-gray-700" htmlFor="pw">Nouveau mot de passe</label>
                <input id="pw" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
                <label className="text-sm font-medium text-gray-700" htmlFor="pw2">Confirmation</label>
                <input id="pw2" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} />
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <button type="submit" disabled={busy}
                    className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    {busy ? 'Enregistrement…' : 'Enregistrer et continuer'}
                </button>
            </form>
        </Card>
    );
}

export default function MotDePassePage() {
    const [forgot, setForgot] = useState<boolean | null>(null);
    useEffect(() => { setForgot(new URLSearchParams(window.location.search).get('oubli') === '1'); }, []);
    if (forgot === null) return null;
    return forgot ? <ForgotPassword /> : <SetPassword />;
}

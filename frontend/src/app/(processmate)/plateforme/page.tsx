'use client';

/**
 * Console plateforme (super-admin processMate) : ouvrir l'espace d'une organisation et le
 * remettre à son admin (lien), suspendre / réactiver, suivre la consommation IA du mois.
 * Aucune donnée métier des organisations n'est visible ici.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, Loader2, Lock, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { platformApi, type PlatformOrg, type Usage } from '@/lib/platformApi';
import LinkReveal from '@/components/shared/LinkReveal';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';

function CreateForm({ onCreated }: { onCreated: (org: PlatformOrg, link: string, existing: boolean) => void }) {
    const [nom, setNom] = useState('');
    const [adminNom, setAdminNom] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const r = await platformApi.create({ nom: nom.trim(), admin_nom: adminNom.trim(), admin_email: adminEmail.trim() });
            onCreated(r.organisation, r.lien, r.compte_existant);
            setNom(''); setAdminNom(''); setAdminEmail('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Création impossible');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Ouvrir un espace</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-slate-600">Organisation
                    <input value={nom} onChange={e => setNom(e.target.value)} required minLength={2} className={`mt-1 ${inputCls}`} />
                </label>
                <label className="text-xs text-slate-600">Nom de l&apos;admin
                    <input value={adminNom} onChange={e => setAdminNom(e.target.value)} required minLength={2} className={`mt-1 ${inputCls}`} />
                </label>
                <label className="text-xs text-slate-600">E-mail de l&apos;admin
                    <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required className={`mt-1 ${inputCls}`} />
                </label>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Créer l&apos;espace et le compte admin
            </button>
        </form>
    );
}

function UsageCell({ u }: { u: Usage }) {
    return (
        <span className="text-xs text-slate-500">
            {fmt(u.appels)} appels · {fmt(u.jetons_entree + u.jetons_sortie)} jetons
        </span>
    );
}

function Console() {
    const [orgs, setOrgs] = useState<PlatformOrg[] | null>(null);
    const [outside, setOutside] = useState<Usage | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [reveal, setReveal] = useState<{ title: string; link: string; note?: string } | null>(null);

    const load = useCallback(async () => {
        try {
            const r = await platformApi.list();
            setOrgs(r.organisations);
            setOutside(r.hors_organisation_mois);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Liste indisponible');
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const toggle = async (o: PlatformOrg) => {
        const next = o.statut === 'active' ? 'suspendue' : 'active';
        if (next === 'suspendue' && !window.confirm(`Suspendre l'espace « ${o.nom} » ? Ses membres perdent l'accès ; rien n'est supprimé.`)) return;
        setBusyId(o.id);
        try {
            const r = await platformApi.setStatus(o.id, next);
            setOrgs(prev => prev?.map(x => x.id === o.id ? r.organisation : x) ?? null);
        } catch (e) { setError(e instanceof Error ? e.message : 'Action refusée'); }
        finally { setBusyId(null); }
    };

    const newLink = async (o: PlatformOrg, adminId: string, label: string) => {
        setBusyId(o.id);
        try {
            const r = await platformApi.newAdminLink(o.id, adminId);
            setReveal({ title: `Nouveau lien pour ${label}`, link: r.lien });
        } catch (e) { setError(e instanceof Error ? e.message : 'Lien impossible'); }
        finally { setBusyId(null); }
    };

    return (
        <main className="h-full overflow-y-auto">
            <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">
                <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
                    <ArrowLeft className="w-4 h-4" /> Retour
                </Link>
                <div>
                    <h1 className="text-xl font-semibold text-slate-900">Plateforme processMate</h1>
                    <p className="mt-1 text-sm text-slate-600">
                        Espaces des organisations. Vous voyez leurs admins, leurs effectifs et leur consommation, jamais leurs procédures.
                    </p>
                </div>

                <CreateForm onCreated={(org, link, existing) => {
                    setOrgs(prev => [org, ...(prev || [])]);
                    setReveal({
                        title: `Espace « ${org.nom} » créé`, link,
                        note: existing ? 'Ce compte existait déjà : le lien permet de choisir un nouveau mot de passe.' : undefined,
                    });
                }} />

                {error && <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}

                <section aria-label="Organisations" className="rounded-xl border border-slate-200 bg-white">
                    {orgs === null ? (
                        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                    ) : orgs.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-slate-500">Aucune organisation.</p>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {orgs.map(o => (
                                <li key={o.id} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
                                    <div className="min-w-0 flex-1">
                                        <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                                            <Building2 className="w-4 h-4 text-slate-400" />{o.nom}
                                            {o.statut === 'suspendue' && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">Suspendue</span>}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {o.membres_actifs} membre{o.membres_actifs > 1 ? 's' : ''} actif{o.membres_actifs > 1 ? 's' : ''} sur {o.membres} · créée le {new Date(o.created_at).toLocaleDateString('fr-FR')}
                                        </p>
                                        <UsageCell u={o.consommation_mois} />
                                        <ul className="mt-1 space-y-0.5">
                                            {o.admins.map(a => (
                                                <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                                    <span>Admin : {a.full_name || a.email}{a.full_name && a.email ? ` (${a.email})` : ''}</span>
                                                    <button type="button" disabled={busyId === o.id} onClick={() => void newLink(o, a.id, a.full_name || a.email || 'l’admin')}
                                                        className="text-blue-600 hover:underline disabled:opacity-50">Nouveau lien</button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <button type="button" disabled={busyId === o.id} onClick={() => void toggle(o)}
                                        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${o.statut === 'active' ? 'border border-slate-300 text-slate-600 hover:bg-slate-50' : 'bg-slate-900 text-white hover:bg-slate-700'}`}>
                                        {o.statut === 'active' ? 'Suspendre' : 'Réactiver'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
                {outside && (
                    <p className="text-xs text-slate-500">Hors organisation (invités, comptes libres) ce mois : <UsageCell u={outside} /></p>
                )}
            </div>
            {reveal && <LinkReveal title={reveal.title} link={reveal.link} note={reveal.note} onClose={() => setReveal(null)} />}
        </main>
    );
}

export default function PlateformePage() {
    const { access } = useAuth();
    if (access === null) {
        return <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
    }
    if (!access.is_platform_admin) {
        return (
            <main className="h-full flex items-center justify-center px-4">
                <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center">
                    <Lock className="mx-auto w-5 h-5 text-slate-400" />
                    <p className="mt-2 text-sm text-slate-600">Réservé à l&apos;administration de processMate.</p>
                    <Link href="/" className="mt-4 inline-block text-sm text-blue-600 hover:underline">Retour</Link>
                </div>
            </main>
        );
    }
    return <Console />;
}

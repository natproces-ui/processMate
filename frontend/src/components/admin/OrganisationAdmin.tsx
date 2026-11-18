'use client';

/** Administration de l'organisation (mode organisations) : comptes, invitations, équipes. */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, UserPlus, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ORG_ROLES, organisationApi, type OpenTask, type PendingInvitation, type Team } from '@/lib/organisationApi';
import OrgMembers from '@/components/admin/OrgMembers';
import NewMemberForm from '@/components/admin/NewMemberForm';
import TeamsAdmin from '@/components/admin/TeamsAdmin';
import LinkReveal from '@/components/shared/LinkReveal';

type Tab = 'comptes' | 'equipes';

export default function OrganisationAdmin() {
    const { access } = useAuth();
    const [tab, setTab] = useState<Tab>('comptes');
    const [creating, setCreating] = useState(false);
    const [teams, setTeams] = useState<Team[]>([]);
    const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
    const [reloadKey, setReloadKey] = useState(0);
    const [reveal, setReveal] = useState<{ title: string; link: string } | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [removed, setRemoved] = useState<{ name: string; tasks: OpenTask[] } | null>(null);

    const loadSide = useCallback(() => {
        organisationApi.teams().then(setTeams).catch(() => setTeams([]));
        organisationApi.invitations().then(setInvitations).catch(() => setInvitations([]));
    }, []);
    useEffect(() => { loadSide(); }, [loadSide, reloadKey]);

    const cancelInvitation = async (id: string) => {
        try { await organisationApi.cancelInvitation(id); setInvitations(prev => prev.filter(i => i.id !== id)); }
        catch (e) { setNotice(e instanceof Error ? e.message : 'Annulation impossible'); }
    };

    return (
        <main className="h-full overflow-y-auto">
            <div className="mx-auto max-w-5xl px-4 py-6">
                <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
                    <ArrowLeft className="w-4 h-4" /> Retour au chat
                </Link>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{access?.organisation?.nom}</p>
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <h1 className="text-xl font-semibold text-slate-900">Administration de l&apos;organisation</h1>
                    <button type="button" onClick={() => setCreating(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
                        <UserPlus className="w-4 h-4" /> Nouveau compte
                    </button>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                    Vous créez les comptes de vos collaborateurs et consultants, choisissez leur rôle et leurs équipes.
                    Les conversations de chacun restent privées.
                </p>

                <div role="tablist" aria-label="Administration" className="mt-5 flex gap-1 border-b border-slate-200">
                    {([['comptes', 'Comptes'], ['equipes', 'Équipes']] as [Tab, string][]).map(([id, label]) => (
                        <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
                            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === id ? 'border-slate-900 font-medium text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {notice && (
                    <p role="status" className="mt-4 flex items-start justify-between gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-blue-800">
                        <span>{notice}</span>
                        <button type="button" onClick={() => setNotice(null)} aria-label="Fermer"><X className="w-4 h-4" /></button>
                    </p>
                )}
                {removed && (
                    <div role="status" className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
                        <div className="flex items-start justify-between gap-2">
                            <p>{removed.name} a été retiré(e).{removed.tasks.length === 0 ? ' Aucune tâche ouverte à réaffecter.' : ` ${removed.tasks.length} tâche(s) ouverte(s) à réaffecter :`}</p>
                            <button type="button" onClick={() => setRemoved(null)} aria-label="Fermer"><X className="w-4 h-4" /></button>
                        </div>
                        {removed.tasks.length > 0 && (
                            <ul className="mt-1 list-disc pl-5">
                                {removed.tasks.map(t => (
                                    <li key={t.id}><Link className="underline" href={`/orchestration?tab=workspace&procedure_id=${t.procedure_id}&taskId=${t.id}`}>{t.title}</Link></li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                <div className="mt-5" hidden={tab !== 'comptes'}>
                    {invitations.length > 0 && (
                        <section aria-label="Invitations en attente" className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
                            <h2 className="text-xs font-semibold text-slate-700">Invitations en attente de réponse</h2>
                            <ul className="mt-1 divide-y divide-slate-100">
                                {invitations.map(i => (
                                    <li key={i.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                                        <span className="truncate text-slate-700">{i.email} · {ORG_ROLES.find(r => r.id === i.role)?.label}</span>
                                        <button type="button" onClick={() => void cancelInvitation(i.id)} className="text-xs text-slate-500 hover:text-red-600">Annuler</button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                    <OrgMembers reloadKey={reloadKey}
                        onLink={(title, link) => setReveal({ title, link })}
                        onRemoved={(name, tasks) => setRemoved({ name, tasks })} />
                    <details className="mt-4 text-sm text-slate-600">
                        <summary className="cursor-pointer text-slate-700">Ce que permet chaque rôle</summary>
                        <ul className="mt-2 space-y-1 pl-1">
                            {ORG_ROLES.slice().reverse().map(r => <li key={r.id}><span className="font-medium">{r.label}</span> — {r.hint}</li>)}
                        </ul>
                    </details>
                </div>
                {tab === 'equipes' && <div className="mt-5"><TeamsAdmin /></div>}
            </div>

            {creating && (
                <NewMemberForm teams={teams} onClose={() => setCreating(false)}
                    onCreated={({ name, link, invitedEmail }) => {
                        setCreating(false);
                        setReloadKey(k => k + 1);
                        if (link) setReveal({ title: `Compte créé pour ${name}`, link });
                        else if (invitedEmail) setNotice(`${invitedEmail} a déjà un compte processMate : une invitation lui sera proposée à sa prochaine connexion. Elle doit l’accepter.`);
                    }} />
            )}
            {reveal && <LinkReveal title={reveal.title} link={reveal.link} onClose={() => setReveal(null)} />}
        </main>
    );
}

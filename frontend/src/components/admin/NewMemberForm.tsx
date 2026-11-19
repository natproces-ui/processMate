'use client';

/** Créer un compte de l'organisation : lien à transmettre, ou invitation si la personne a déjà un compte. */
import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { OrgRole } from '@/context/AuthContext';
import { ORG_ROLES, organisationApi, type Team } from '@/lib/organisationApi';

const inputCls = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';

interface Props {
    teams: Team[];
    onClose: () => void;
    onCreated: (result: { name: string; link?: string; invitedEmail?: string; emailedTo?: string | false }) => void;
}

export default function NewMemberForm({ teams, onClose, onCreated }: Props) {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<OrgRole>('contributeur');
    const [jobTitle, setJobTitle] = useState('');
    const [department, setDepartment] = useState('');
    const [teamIds, setTeamIds] = useState<string[]>([]);
    const [sendEmail, setSendEmail] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const r = await organisationApi.createMember({
                email: email.trim(), full_name: fullName.trim(), role,
                job_title: jobTitle.trim() || undefined, department: department.trim() || undefined, equipes: teamIds,
                envoyer_email: sendEmail,
            });
            onCreated({ name: fullName.trim(), link: r.lien, invitedEmail: r.invitation ? r.email : undefined,
                emailedTo: sendEmail && r.lien ? (r.email_envoye ? email.trim() : false) : undefined });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Création impossible');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="new-member-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
            <form onSubmit={submit} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
                <div className="flex items-start justify-between">
                    <h2 id="new-member-title" className="text-base font-semibold text-slate-900">Nouveau compte</h2>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="p-1 rounded text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                    Vous obtiendrez un lien à transmettre : la personne y choisit son mot de passe. Si elle a déjà un compte
                    processMate, elle recevra une invitation à accepter.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-600">Nom complet
                        <input value={fullName} onChange={e => setFullName(e.target.value)} required minLength={2} className={inputCls} />
                    </label>
                    <label className="text-xs text-slate-600">E-mail
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className={inputCls} />
                    </label>
                    <label className="text-xs text-slate-600">Poste
                        <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} className={inputCls} />
                    </label>
                    <label className="text-xs text-slate-600">Service
                        <input value={department} onChange={e => setDepartment(e.target.value)} className={inputCls} />
                    </label>
                </div>
                <fieldset className="mt-4">
                    <legend className="text-xs font-medium text-slate-700">Rôle</legend>
                    <div className="mt-1 grid gap-1.5">
                        {ORG_ROLES.map(r => (
                            <label key={r.id} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50/50">
                                <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="mt-1" />
                                <span><span className="font-medium text-slate-800">{r.label}</span> <span className="text-xs text-slate-500">— {r.hint}</span></span>
                            </label>
                        ))}
                    </div>
                </fieldset>
                {teams.length > 0 && (
                    <fieldset className="mt-4">
                        <legend className="text-xs font-medium text-slate-700">Équipes</legend>
                        <div className="mt-1 flex flex-wrap gap-2">
                            {teams.map(t => (
                                <label key={t.id} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs">
                                    <input type="checkbox" checked={teamIds.includes(t.id)}
                                        onChange={e => setTeamIds(prev => e.target.checked ? [...prev, t.id] : prev.filter(x => x !== t.id))} />
                                    {t.nom}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                )}
                <label className="mt-4 flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
                    Envoyer par e-mail l&apos;identifiant et le lien pour choisir le mot de passe
                </label>
                {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
                    <button type="submit" disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Créer le compte
                    </button>
                </div>
            </form>
        </div>
    );
}

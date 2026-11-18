'use client';

/**
 * Comptes de l'organisation (mode organisations) : activer, suspendre, changer le rôle.
 * Le backend vérifie tout (admin de l'organisation, pas son propre rôle, dernier admin,
 * membres d'une autre organisation introuvables).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Loader2, Search, UserMinus } from 'lucide-react';
import { useAuth, type OrgRole } from '@/context/AuthContext';
import { ORG_ROLES, organisationApi, type MemberStatut, type OpenTask, type OrgMember } from '@/lib/organisationApi';

const FILTERS: { id: MemberStatut | 'all'; label: string }[] = [
    { id: 'invitee', label: 'En attente' },
    { id: 'active', label: 'Actifs' },
    { id: 'suspendue', label: 'Suspendus' },
    { id: 'all', label: 'Tous' },
];

interface Props {
    toolbar?: React.ReactNode;
    /** incrémenté par le parent pour recharger la liste (compte créé…) */
    reloadKey?: number;
    onLink?: (title: string, link: string) => void;
    onRemoved?: (name: string, openTasks: OpenTask[]) => void;
}

export default function OrgMembers({ toolbar, reloadKey = 0, onLink, onRemoved }: Props) {
    const { user, profile } = useAuth();
    const [members, setMembers] = useState<OrgMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<MemberStatut | 'all'>('active');
    const [q, setQ] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await organisationApi.members();
            setMembers(list);
            if (list.some(m => m.statut === 'invitee')) setFilter('invitee');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Liste des comptes indisponible');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load, reloadKey]);

    const counts = useMemo(() => ({
        invitee: members.filter(m => m.statut === 'invitee').length,
        active: members.filter(m => m.statut === 'active').length,
        suspendue: members.filter(m => m.statut === 'suspendue').length,
        all: members.length,
    }), [members]);

    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return members
            .filter(m => filter === 'all' || m.statut === filter)
            .filter(m => !needle || [m.full_name, m.email, m.department, m.job_title].some(v => (v || '').toLowerCase().includes(needle)));
    }, [members, filter, q]);

    const update = async (m: OrgMember, changes: { role?: OrgRole; statut?: MemberStatut }) => {
        setBusyId(m.id);
        setError(null);
        try {
            await organisationApi.updateMember(m.id, changes);
            setMembers(prev => prev.map(x => x.id === m.id ? { ...x, ...changes } : x));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Modification refusée');
        } finally {
            setBusyId(null);
        }
    };

    const newLink = async (m: OrgMember, name: string) => {
        setBusyId(m.id);
        setError(null);
        try { onLink?.(`Nouveau lien pour ${name}`, await organisationApi.memberLink(m.id)); }
        catch (e) { setError(e instanceof Error ? e.message : 'Lien impossible'); }
        finally { setBusyId(null); }
    };

    const remove = async (m: OrgMember, name: string) => {
        if (!window.confirm(`Retirer ${name} de l'organisation ? Son nom reste sur ses procédures, tâches et validations.`)) return;
        setBusyId(m.id);
        setError(null);
        try {
            const tasks = await organisationApi.removeMember(m.id);
            setMembers(prev => prev.filter(x => x.id !== m.id));
            onRemoved?.(name, tasks);
        } catch (e) { setError(e instanceof Error ? e.message : 'Retrait refusé'); }
        finally { setBusyId(null); }
    };

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2">
                {FILTERS.map(f => (
                    <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
                        className={`rounded-full px-3 py-1 text-sm ${filter === f.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {f.label} <span className="opacity-70">({counts[f.id]})</span>
                    </button>
                ))}
                <label className="ml-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 w-full sm:w-64">
                    <Search className="w-4 h-4 text-slate-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nom, e-mail, service…"
                        aria-label="Rechercher un compte" className="w-full text-sm outline-none bg-transparent" />
                </label>
                {toolbar}
            </div>

            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}

            <div className="mt-4 rounded-xl border border-slate-200 bg-white">
                {loading ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                ) : shown.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-slate-500">Aucun compte dans cette liste.</p>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {shown.map(m => {
                            const self = m.id === user?.id || m.id === profile?.id;
                            const busy = busyId === m.id;
                            const name = m.full_name || m.display_name || m.email || 'Compte';
                            return (
                                <li key={m.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-slate-900">
                                            {name}{self && <span className="ml-1.5 text-xs font-normal text-slate-400">(vous)</span>}
                                        </p>
                                        <p className="truncate text-xs text-slate-500">{[m.email, m.job_title, m.department].filter(Boolean).join(' · ')}</p>
                                    </div>
                                    <select value={m.role} disabled={self || busy} aria-label={`Rôle de ${name}`}
                                        title={ORG_ROLES.find(r => r.id === m.role)?.hint}
                                        onChange={e => void update(m, { role: e.target.value as OrgRole })}
                                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:opacity-50">
                                        {ORG_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                                    </select>
                                    {!self && (
                                        <div className="flex shrink-0 gap-1">
                                            <button type="button" disabled={busy} onClick={() => void newLink(m, name)} title="Nouveau lien d’accès"
                                                aria-label={`Nouveau lien pour ${name}`}
                                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><KeyRound className="w-4 h-4" /></button>
                                            <button type="button" disabled={busy} onClick={() => void remove(m, name)} title="Retirer de l’organisation"
                                                aria-label={`Retirer ${name}`}
                                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><UserMinus className="w-4 h-4" /></button>
                                        </div>
                                    )}
                                    <div className="flex w-36 shrink-0 justify-end gap-2">
                                        {busy ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                                            : self ? <span className="text-xs text-slate-400">Actif</span>
                                            : m.statut === 'active' ? (
                                                <button type="button" onClick={() => void update(m, { statut: 'suspendue' })}
                                                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Suspendre</button>
                                            ) : (
                                                <button type="button" onClick={() => void update(m, { statut: 'active' })}
                                                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
                                                    {m.statut === 'suspendue' ? 'Réactiver' : 'Activer'}
                                                </button>
                                            )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}

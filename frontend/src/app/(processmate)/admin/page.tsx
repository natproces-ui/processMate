'use client';

/**
 * Administration › Utilisateurs : activer les comptes créés librement, attribuer un rôle,
 * suspendre. Réservé aux administrateurs (le backend le vérifie aussi :
 * PATCH /api/orchestration/users/{id} exige le rôle admin).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import MemberGuard from '@/components/auth/MemberGuard';
import { useAuth } from '@/context/AuthContext';
import { orchestrationApi, type UserProfile } from '@/lib/orchestrationApi';
import OrgMembers from '@/components/admin/OrgMembers';

type Role = UserProfile['global_role'];
type Status = UserProfile['status'];

const ROLES: { id: Role; label: string; hint: string }[] = [
    { id: 'viewer', label: 'Lecteur', hint: 'Consulte le référentiel, ne modifie rien' },
    { id: 'contributor', label: 'Contributeur', hint: 'Formalise et modifie les procédures' },
    { id: 'validator', label: 'Valideur', hint: 'Relit et valide les procédures' },
    { id: 'process_owner', label: 'Responsable de processus', hint: 'Pilote les campagnes' },
    { id: 'admin', label: 'Administrateur', hint: 'Gère les comptes et les droits' },
];

const FILTERS: { id: Status | 'all'; label: string }[] = [
    { id: 'invited', label: 'En attente' },
    { id: 'active', label: 'Actifs' },
    { id: 'suspended', label: 'Suspendus' },
    { id: 'all', label: 'Tous' },
];

function UsersAdmin() {
    const { profile } = useAuth();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Status | 'all'>('invited');
    const [q, setQ] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await orchestrationApi.listUsers({ active_only: false });
            setUsers(res.users);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Liste des comptes indisponible');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const counts = useMemo(() => ({
        invited: users.filter(u => u.status === 'invited').length,
        active: users.filter(u => u.status === 'active').length,
        suspended: users.filter(u => u.status === 'suspended').length,
        all: users.length,
    }), [users]);

    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return users
            .filter(u => filter === 'all' || u.status === filter)
            .filter(u => !needle || [u.full_name, u.email, u.department, u.job_title].some(v => (v || '').toLowerCase().includes(needle)));
    }, [users, filter, q]);

    const update = async (u: UserProfile, changes: Partial<Pick<UserProfile, 'global_role' | 'status'>>) => {
        setBusyId(u.id);
        setError(null);
        try {
            await orchestrationApi.updateUserProfile(u.id, changes);
            setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ...changes } : x));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Modification refusée');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <main className="h-full overflow-y-auto">
            <div className="mx-auto max-w-5xl px-4 py-6">
                <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
                    <ArrowLeft className="w-4 h-4" /> Retour au chat
                </Link>
                <h1 className="mt-3 text-xl font-semibold text-slate-900">Utilisateurs</h1>
                <p className="mt-1 text-sm text-slate-600">
                    Un compte créé depuis l&apos;accueil a accès au chat et à ses projets. Pour le référentiel, les campagnes
                    et le pilotage, activez-le et choisissez son rôle.
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                    {FILTERS.map(f => (
                        <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                            aria-pressed={filter === f.id}
                            className={`rounded-full px-3 py-1 text-sm ${filter === f.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            {f.label} <span className="opacity-70">({counts[f.id]})</span>
                        </button>
                    ))}
                    <label className="ml-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 w-full sm:w-64">
                        <Search className="w-4 h-4 text-slate-400" />
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nom, e-mail, service…"
                            aria-label="Rechercher un compte" className="w-full text-sm outline-none bg-transparent" />
                    </label>
                </div>

                {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}

                <div className="mt-4 rounded-xl border border-slate-200 bg-white">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                    ) : shown.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-slate-500">Aucun compte dans cette liste.</p>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {shown.map(u => {
                                const self = u.id === profile?.id;
                                const busy = busyId === u.id;
                                return (
                                    <li key={u.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-slate-900">
                                                {u.full_name || u.display_name || u.email}{self && <span className="ml-1.5 text-xs font-normal text-slate-400">(vous)</span>}
                                            </p>
                                            <p className="truncate text-xs text-slate-500">
                                                {[u.email, u.job_title, u.department].filter(Boolean).join(' · ')}
                                            </p>
                                        </div>
                                        <select value={u.global_role} disabled={self || busy}
                                            onChange={e => void update(u, { global_role: e.target.value as Role })}
                                            aria-label={`Rôle de ${u.full_name || u.email}`}
                                            title={ROLES.find(r => r.id === u.global_role)?.hint}
                                            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:opacity-50">
                                            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                                        </select>
                                        <div className="flex w-36 shrink-0 justify-end gap-2">
                                            {busy ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                                                : self ? <span className="text-xs text-slate-400">Actif</span>
                                                : u.status === 'active' ? (
                                                    <button type="button" onClick={() => void update(u, { status: 'suspended' })}
                                                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Suspendre</button>
                                                ) : (
                                                    <button type="button" onClick={() => void update(u, { status: 'active' })}
                                                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
                                                        {u.status === 'suspended' ? 'Réactiver' : 'Activer'}
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
        </main>
    );
}

/** Mode organisations : administration de l'organisation de l'admin connecté */
function OrganisationAdmin() {
    const { access } = useAuth();
    return (
        <main className="h-full overflow-y-auto">
            <div className="mx-auto max-w-5xl px-4 py-6">
                <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
                    <ArrowLeft className="w-4 h-4" /> Retour au chat
                </Link>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{access?.organisation?.nom}</p>
                <h1 className="text-xl font-semibold text-slate-900">Administration de l&apos;organisation</h1>
                <p className="mt-1 text-sm text-slate-600">
                    Activez les comptes, choisissez leur rôle, suspendez un accès. Les conversations de chacun restent privées.
                </p>
                <div className="mt-5"><OrgMembers /></div>
            </div>
        </main>
    );
}

export default function AdminPage() {
    const { access } = useAuth();
    return (
        <MemberGuard admin>
            {access?.organisations_mode ? <OrganisationAdmin /> : <UsersAdmin />}
        </MemberGuard>
    );
}

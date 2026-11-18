'use client';

/**
 * Équipes de l'organisation : membres, responsable, branches de la taxonomie dont
 * l'équipe est responsable (proposée par défaut comme R des procédures de la branche).
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Users } from 'lucide-react';
import { organisationApi, type OrgMember, type Team } from '@/lib/organisationApi';
import { taxonomyApi } from '@/lib/taxonomyApi';

type Branch = { id: string; name: string; level?: string };
const inputCls = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';

function TeamEditor({ team, members, branches, onSaved, onDeleted }: {
    team: Team | null; members: OrgMember[]; branches: Branch[];
    onSaved: (t: Team) => void; onDeleted: (id: string) => void;
}) {
    const [nom, setNom] = useState(team?.nom ?? '');
    const [responsable, setResponsable] = useState(team?.responsable_id ?? '');
    const [membres, setMembres] = useState<string[]>(team?.membres ?? []);
    const [branchIds, setBranchIds] = useState<string[]>(team?.branches ?? []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const active = members.filter(m => m.statut === 'active');
    const label = (m: OrgMember) => m.full_name || m.display_name || m.email || 'Compte';

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            const body = { nom: nom.trim(), responsable_id: responsable || null, membres, branches: branchIds };
            onSaved(team ? await organisationApi.updateTeam(team.id, body) : await organisationApi.createTeam(body));
        } catch (e) { setError(e instanceof Error ? e.message : 'Enregistrement impossible'); }
        finally { setBusy(false); }
    };

    const remove = async () => {
        if (!team || !window.confirm(`Supprimer l'équipe « ${team.nom} » ? Ses membres restent dans l'organisation.`)) return;
        setBusy(true);
        try { await organisationApi.deleteTeam(team.id); onDeleted(team.id); }
        catch (e) { setError(e instanceof Error ? e.message : 'Suppression impossible'); setBusy(false); }
    };

    const toggle = (list: string[], id: string, on: boolean) => on ? [...list, id] : list.filter(x => x !== id);

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-600">Nom de l&apos;équipe
                    <input value={nom} onChange={e => setNom(e.target.value)} className={inputCls} />
                </label>
                <label className="text-xs text-slate-600">Responsable
                    <select value={responsable} onChange={e => setResponsable(e.target.value)} className={inputCls}>
                        <option value="">—</option>
                        {active.map(m => <option key={m.id} value={m.id}>{label(m)}</option>)}
                    </select>
                </label>
            </div>
            <fieldset>
                <legend className="text-xs font-medium text-slate-700">Membres ({membres.length})</legend>
                <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-100 p-2 grid gap-1 sm:grid-cols-2">
                    {active.map(m => (
                        <label key={m.id} className="flex items-center gap-2 text-sm text-slate-700">
                            <input type="checkbox" checked={membres.includes(m.id)} onChange={e => setMembres(prev => toggle(prev, m.id, e.target.checked))} />
                            <span className="truncate">{label(m)}</span>
                        </label>
                    ))}
                </div>
            </fieldset>
            <fieldset>
                <legend className="text-xs font-medium text-slate-700">Branches de la taxonomie dont l&apos;équipe est responsable</legend>
                {branches.length === 0 ? <p className="mt-1 text-xs text-slate-400">Aucune branche : créez d&apos;abord la taxonomie dans le référentiel.</p> : (
                    <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-100 p-2 grid gap-1 sm:grid-cols-2">
                        {branches.map(b => (
                            <label key={b.id} className="flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={branchIds.includes(b.id)} onChange={e => setBranchIds(prev => toggle(prev, b.id, e.target.checked))} />
                                <span className="truncate">{b.name}</span>
                            </label>
                        ))}
                    </div>
                )}
                <p className="mt-1 text-[11px] text-slate-400">Une branche n&apos;a qu&apos;une équipe responsable : la cocher ici la retire à l&apos;équipe précédente.</p>
            </fieldset>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center justify-between">
                {team ? (
                    <button type="button" onClick={remove} disabled={busy} className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:underline disabled:opacity-50">
                        <Trash2 className="w-3.5 h-3.5" /> Supprimer l&apos;équipe
                    </button>
                ) : <span />}
                <button type="button" onClick={save} disabled={busy || !nom.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />} Enregistrer
                </button>
            </div>
        </div>
    );
}

export default function TeamsAdmin() {
    const [teams, setTeams] = useState<Team[] | null>(null);
    const [members, setMembers] = useState<OrgMember[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selected, setSelected] = useState<string | 'new' | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([organisationApi.teams(), organisationApi.members()])
            .then(([t, m]) => { setTeams(t); setMembers(m); })
            .catch(e => setError(e instanceof Error ? e.message : 'Équipes indisponibles'));
        taxonomyApi.getFlat()
            .then(r => setBranches((r.nodes || []).map((n: { id: string; name: string; level?: string }) => ({ id: n.id, name: n.name, level: n.level }))))
            .catch(() => { /* taxonomie facultative */ });
    }, []);

    const names = useMemo(() => new Map(members.map(m => [m.id, m.full_name || m.email || ''])), [members]);
    const current = selected && selected !== 'new' ? teams?.find(t => t.id === selected) ?? null : null;

    if (error) return <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>;
    if (!teams) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="space-y-2">
                <button type="button" onClick={() => setSelected('new')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
                    <Plus className="w-4 h-4" /> Nouvelle équipe
                </button>
                {teams.length === 0 ? <p className="text-sm text-slate-500">Aucune équipe.</p> : (
                    <ul className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                        {teams.map(t => (
                            <li key={t.id}>
                                <button type="button" onClick={() => setSelected(t.id)} aria-current={selected === t.id ? 'true' : undefined}
                                    className={`w-full px-3 py-2.5 text-left ${selected === t.id ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                                    <span className="flex items-center gap-2 text-sm font-medium text-slate-900"><Users className="w-4 h-4 text-slate-400" />{t.nom}</span>
                                    <span className="block text-xs text-slate-500">
                                        {t.membres.length} membre{t.membres.length > 1 ? 's' : ''} · {t.branches.length} branche{t.branches.length > 1 ? 's' : ''}
                                        {t.responsable_id ? ` · resp. ${names.get(t.responsable_id) || '—'}` : ''}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {selected && (
                <TeamEditor key={selected} team={current} members={members} branches={branches}
                    onSaved={t => { setTeams(prev => { const rest = (prev || []).filter(x => x.id !== t.id); return [...rest, t].sort((a, b) => a.nom.localeCompare(b.nom)); }); setSelected(t.id); }}
                    onDeleted={id => { setTeams(prev => (prev || []).filter(x => x.id !== id)); setSelected(null); }} />
            )}
        </div>
    );
}

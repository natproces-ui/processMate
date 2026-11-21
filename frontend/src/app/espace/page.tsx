'use client';

/**
 * Accueil de l'organisation (admin et pilote) : où en est le référentiel, et quoi faire.
 * Le référentiel par défaut (structure BIAN) est posé à la création de l'espace : on le garde
 * et on l'adapte, ou on part de rien tant qu'aucune procédure n'y est rangée.
 * Ensuite : l'équipe, puis les campagnes.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderTree, Loader2, Megaphone, Users } from 'lucide-react';
import AuthGuard from '@/components/auth/AuthGuard';
import AppShell from '@/components/home/AppShell';
import { ConfirmDialog, btnGhost, btnPrimary } from '@/components/home/ui';
import { useAuth } from '@/context/AuthContext';
import { referentialApi, type ReferentialState } from '@/lib/referentialApi';

export default function EspacePage() {
    return (
        <AuthGuard>
            <AppShell activeNav="espace">
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <Espace />
                </div>
            </AppShell>
        </AuthGuard>
    );
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
/** Premier message proposé dans le chat : l'admin joint ses sources et l'adapte avant d'envoyer */
const SOURCES_DRAFT = 'Construis le référentiel de nos processus à partir de ces documents (cartographie, manuels, code…) : '
    + 'thèmes, catégories, sous-catégories et noms des procédures, avec tes remarques.';

function Espace() {
    const { access } = useAuth();
    const manager = !!access?.can_manage_campaigns;
    const [state, setState] = useState<ReferentialState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmEmpty, setConfirmEmpty] = useState(false);

    const load = useCallback(() => {
        referentialApi.state().then(setState).catch(e => setError(e instanceof Error ? e.message : 'État indisponible'));
    }, []);
    useEffect(() => { load(); }, [load]);

    const loadDefault = async () => {
        setBusy(true); setError(null);
        try { setState((await referentialApi.loadDefault()).etat); }
        catch (e) { setError(e instanceof Error ? e.message : 'Chargement impossible'); }
        finally { setBusy(false); }
    };

    if (access && !access.member) {
        return <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-neutral-700">L’espace de l’organisation est réservé à ses membres.</p>;
    }

    return (
        <main className="mx-auto max-w-3xl px-4 py-6 space-y-5">
            <header>
                <h1 className="text-xl font-semibold text-neutral-900">{access?.organisation?.nom || 'Organisation'}</h1>
                <p className="mt-1 text-sm text-neutral-600">Le référentiel des processus, l’équipe et les campagnes de formalisation.</p>
            </header>

            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            {/* Référentiel */}
            <section aria-labelledby="ref-title" className="rounded-xl border border-neutral-200 p-4">
                <div className="flex items-start gap-3">
                    <FolderTree className="mt-0.5 w-5 h-5 shrink-0 text-neutral-900" />
                    <div className="min-w-0 flex-1">
                        <h2 id="ref-title" className="text-base font-semibold text-neutral-900">Référentiel des processus</h2>
                        {!state ? <Loader2 className="mt-2 w-4 h-4 animate-spin text-neutral-400" /> : state.origine === 'vide' ? (
                            <p className="mt-1 text-sm text-neutral-700">Aucune structure pour l’instant.</p>
                        ) : (
                            <p className="mt-1 text-sm text-neutral-700">
                                {plural(state.themes, 'thème', 'thèmes')} · {plural(state.categories, 'catégorie', 'catégories')} · {plural(state.sous_categories, 'sous-catégorie', 'sous-catégories')}
                                {' · '}{plural(state.procedures, 'procédure', 'procédures')}{state.procedures ? `, dont ${state.procedures_redigees} rédigée${state.procedures_redigees > 1 ? 's' : ''}` : ''}
                            </p>
                        )}
                        {state?.origine === 'defaut' && (
                            <p className="mt-2 text-sm text-neutral-600">
                                C’est le référentiel par défaut, organisé comme le paysage BIAN. Gardez-le et adaptez-le à votre
                                banque (renommez, supprimez les branches inutiles, ajoutez les vôtres), partez de vos propres
                                sources (cartographie, manuels, présentations, code) que l’assistant analyse pour vous proposer une
                                structure, ou partez de rien.
                            </p>
                        )}
                        {state?.origine === 'vide' && manager && (
                            <p className="mt-2 text-sm text-neutral-600">
                                Construisez votre structure (thèmes, catégories, sous-catégories), ou repartez du référentiel par
                                défaut, organisé comme le paysage BIAN.
                            </p>
                        )}

                        {state && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                <Link href="/orchestration?tab=procedures" className={btnPrimary}>
                                    {state.origine === 'vide' ? 'Construire la structure' : manager ? 'Ouvrir et adapter' : 'Ouvrir le référentiel'}
                                </Link>
                                {manager && state.origine === 'vide' && (
                                    <button type="button" onClick={() => void loadDefault()} disabled={busy} className={btnGhost}>
                                        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Charger le référentiel par défaut
                                    </button>
                                )}
                                {manager && (
                                    <Link href={`/?brouillon=${encodeURIComponent(SOURCES_DRAFT)}`} className={btnGhost}>Partir de mes sources</Link>
                                )}
                                {manager && state.peut_vider && (
                                    <button type="button" onClick={() => setConfirmEmpty(true)} className={btnGhost}>Partir de rien</button>
                                )}
                            </div>
                        )}
                        {manager && state && state.origine !== 'vide' && !state.peut_vider && (
                            <p className="mt-2 text-xs text-neutral-500">
                                Des procédures ou des campagnes y sont rangées : le référentiel s’adapte, il ne se vide plus.
                            </p>
                        )}
                    </div>
                </div>
            </section>

            {/* Équipe */}
            {access?.is_admin && (
                <section aria-labelledby="team-title" className="rounded-xl border border-neutral-200 p-4">
                    <div className="flex items-start gap-3">
                        <Users className="mt-0.5 w-5 h-5 shrink-0 text-neutral-900" />
                        <div className="min-w-0 flex-1">
                            <h2 id="team-title" className="text-base font-semibold text-neutral-900">Équipe</h2>
                            <p className="mt-1 text-sm text-neutral-600">
                                Créez les comptes, donnez les rôles (pilote, contributeur, lecteur) et rattachez chaque équipe à ses
                                branches du référentiel : elle sera proposée comme responsable dans les campagnes.
                            </p>
                            <Link href="/admin" className={`mt-3 ${btnGhost}`}>Gérer l’équipe</Link>
                        </div>
                    </div>
                </section>
            )}

            {/* Campagnes */}
            <section aria-labelledby="camp-title" className="rounded-xl border border-neutral-200 p-4">
                <div className="flex items-start gap-3">
                    <Megaphone className="mt-0.5 w-5 h-5 shrink-0 text-neutral-900" />
                    <div className="min-w-0 flex-1">
                        <h2 id="camp-title" className="text-base font-semibold text-neutral-900">Campagnes</h2>
                        <p className="mt-1 text-sm text-neutral-600">
                            {state ? (state.campagnes.total
                                ? `${plural(state.campagnes.total, 'campagne', 'campagnes')}, dont ${state.campagnes.en_cours} en cours.`
                                : 'Aucune campagne. Une campagne rassemble les procédures à formaliser, leurs responsables (RACI) et une échéance.')
                                : '…'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {manager && <Link href="/espace/campagne" className={btnPrimary}>Créer une campagne</Link>}
                            {state && state.campagnes.total > 0 && <Link href="/orchestration?tab=campagnes" className={btnGhost}>Voir les campagnes</Link>}
                        </div>
                    </div>
                </div>
            </section>

            {confirmEmpty && (
                <ConfirmDialog
                    title="Partir de rien ?"
                    message="Toute la structure actuelle (thèmes, catégories, sous-catégories) est supprimée. Aucune procédure n’y est rangée : rien d’autre n’est perdu. Vous pourrez recharger le référentiel par défaut."
                    confirmLabel="Vider le référentiel"
                    onConfirm={async () => { const r = await referentialApi.empty(); setState(r.etat); }}
                    onClose={() => setConfirmEmpty(false)} />
            )}
        </main>
    );
}

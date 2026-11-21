'use client';

/**
 * Accueil de l'organisation, adapté au rôle — page d'arrivée des membres.
 * En haut, « Que voulez-vous faire ? » : on écrit ou on dépose un fichier, une conversation s'ouvre.
 * Pour tous : mes tâches, mes procédures (R ou A), reprendre une conversation.
 * Pilotage (admin, pilote) : ce qui attend une décision, l'avancement des campagnes, le référentiel
 * (garder et adapter, partir de mes sources, partir de rien), l'équipe pour l'admin.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUp, FileText, FolderTree, Loader2, Megaphone, MessageSquare, Paperclip, Users, X } from 'lucide-react';
import AuthGuard from '@/components/auth/AuthGuard';
import AppShell from '@/components/home/AppShell';
import { ConfirmDialog, btnGhost, btnPrimary } from '@/components/home/ui';
import { useAuth } from '@/context/AuthContext';
import { referentialApi, type ReferentialState } from '@/lib/referentialApi';
import { fetchHome, type HomeData } from '@/lib/homeApi';
import { CONVERSATIONS_ENABLED, conversationsApi, type ConversationSummary } from '@/lib/conversationsApi';
import { setPendingTurn } from '@/lib/pendingTurn';
import StartComposer from '@/components/home/StartComposer';

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
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null);
/** Premier message proposé dans le chat : l'admin joint ses sources et l'adapte avant d'envoyer */
const SOURCES_DRAFT = 'Construis le référentiel de nos processus à partir de ces documents (cartographie, manuels, code…) : '
    + 'thèmes, catégories, sous-catégories et noms des procédures, avec tes remarques.';
const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.xlsm,.csv,.txt,.md,.sql,.cbl,.cob,.cpy,.java,.py,.js,.ts,.cs,image/png,image/jpeg,image/webp';
const card = 'rounded-xl border border-neutral-200 p-4';

function Espace() {
    const { access, profile } = useAuth();
    const [home, setHome] = useState<HomeData | null>(null);
    const [recent, setRecent] = useState<ConversationSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchHome().then(setHome).catch(e => setError(e instanceof Error ? e.message : 'Accueil indisponible'));
        if (CONVERSATIONS_ENABLED) conversationsApi.list({ limit: 4 }).then(setRecent).catch(() => setRecent([]));
        else setRecent([]);
    }, []);

    if (access && !access.member) {
        return <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-neutral-700">L’espace de l’organisation est réservé à ses membres.</p>;
    }
    const firstName = (profile?.display_name || profile?.full_name || '').split(' ')[0];
    const p = home?.pilotage;

    return (
        <main className="mx-auto max-w-5xl px-4 py-6 space-y-5">
            <header>
                <h1 className="text-2xl font-semibold text-neutral-900">{firstName ? `Bonjour ${firstName}` : 'Bonjour'}</h1>
                <p className="mt-1 text-sm text-neutral-600">{access?.organisation?.nom || 'Votre organisation'}</p>
            </header>

            <Composer />

            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            {p && (
                <section aria-label="À traiter" className="grid gap-3 sm:grid-cols-3">
                    <Tile href="/orchestration?tab=campagnes" value={p.propositions} label="procédure proposée" plural="procédures proposées" hint="à traiter" />
                    <Tile href="/orchestration?tab=taches" value={p.validations} label="validation en attente" plural="validations en attente" />
                    <Tile href="/orchestration?tab=taches" value={p.taches_en_retard} label="tâche en retard" plural="tâches en retard" hint="dans l’équipe" alert />
                </section>
            )}

            <div className="grid gap-5 md:grid-cols-2">
                <section aria-labelledby="h-taches" className={card}>
                    <div className="flex items-baseline justify-between gap-2">
                        <h2 id="h-taches" className="text-base font-semibold text-neutral-900">Mes tâches</h2>
                        {home && <span className="text-sm text-neutral-600">{home.taches.ouvertes} en cours{home.taches.en_retard ? `, dont ${home.taches.en_retard} en retard` : ''}</span>}
                    </div>
                    {!home ? <Spinner /> : home.taches.prochaines.length === 0 ? (
                        <p className="mt-2 text-sm text-neutral-600">Aucune tâche en cours.</p>
                    ) : (
                        <ul className="mt-2 divide-y divide-neutral-100">
                            {home.taches.prochaines.map(t => (
                                <li key={t.id}>
                                    <Link href={t.procedure_id ? `/?procedure=${t.procedure_id}` : '/orchestration?tab=taches'}
                                        className="flex items-center gap-2 py-2 text-sm hover:bg-neutral-50">
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium text-neutral-900">{t.titre}</span>
                                            {t.procedure && <span className="block truncate text-xs text-neutral-500">{t.procedure}</span>}
                                        </span>
                                        {t.echeance && (
                                            <span className={`shrink-0 text-xs ${t.en_retard ? 'font-semibold text-red-700' : 'text-neutral-500'}`}>
                                                {t.en_retard ? 'En retard · ' : ''}{fmtDate(t.echeance)}
                                            </span>
                                        )}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                    <Link href="/orchestration?tab=taches" className="mt-2 inline-block text-sm font-medium text-neutral-900 underline">Toutes mes tâches</Link>
                </section>

                <section aria-labelledby="h-procs" className={card}>
                    <div className="flex items-baseline justify-between gap-2">
                        <h2 id="h-procs" className="text-base font-semibold text-neutral-900">Mes procédures</h2>
                        {home && home.procedures.total > 0 && <span className="text-sm text-neutral-600">{home.procedures.total}</span>}
                    </div>
                    {!home ? <Spinner /> : home.procedures.liste.length === 0 ? (
                        <p className="mt-2 text-sm text-neutral-600">Vous n’êtes responsable (R) ni approbateur (A) d’aucune procédure pour l’instant.</p>
                    ) : (
                        <ul className="mt-2 divide-y divide-neutral-100">
                            {home.procedures.liste.map(pr => (
                                <li key={pr.id}>
                                    <Link href={`/?procedure=${pr.id}`} title="Ouvrir dans le chat" className="flex items-center gap-2 py-2 text-sm hover:bg-neutral-50">
                                        <FileText className="w-4 h-4 shrink-0 text-neutral-400" />
                                        <span className="min-w-0 flex-1 truncate text-neutral-900">{pr.nom}</span>
                                        <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-700"
                                            title={pr.role === 'R' ? 'Responsable' : 'Approbateur'}>{pr.role}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                    <Link href="/orchestration?tab=workspace" className="mt-2 inline-block text-sm font-medium text-neutral-900 underline">Mon espace de travail</Link>
                </section>

                {p && (
                    <section aria-labelledby="h-camps" className={card}>
                        <div className="flex items-baseline justify-between gap-2">
                            <h2 id="h-camps" className="text-base font-semibold text-neutral-900">Campagnes en cours</h2>
                            <Megaphone className="w-4 h-4 text-neutral-400" />
                        </div>
                        {p.campagnes.length === 0 ? (
                            <p className="mt-2 text-sm text-neutral-600">Aucune campagne en cours. Une campagne rassemble des procédures à formaliser, leurs responsables et une échéance.</p>
                        ) : (
                            <ul className="mt-2 space-y-3">
                                {p.campagnes.map(c => (
                                    <li key={c.id}>
                                        <div className="flex items-baseline justify-between gap-2 text-sm">
                                            <span className="min-w-0 truncate font-medium text-neutral-900">{c.titre}</span>
                                            <span className={`shrink-0 text-xs ${c.en_retard ? 'font-semibold text-red-700' : 'text-neutral-500'}`}>
                                                {c.statut === 'draft' ? 'Brouillon' : `${c.faites}/${c.total}`}{c.echeance ? ` · ${c.en_retard ? 'échéance dépassée' : fmtDate(c.echeance)}` : ''}
                                            </span>
                                        </div>
                                        <div className="mt-1 h-1.5 rounded-full bg-neutral-100" role="progressbar" aria-valuenow={c.avancement} aria-valuemin={0} aria-valuemax={100} aria-label={`Avancement de ${c.titre}`}>
                                            <div className="h-1.5 rounded-full bg-neutral-900" style={{ width: `${c.avancement}%` }} />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Link href="/espace/campagne" className={btnPrimary}>Créer une campagne</Link>
                            <Link href="/orchestration?tab=campagnes" className={btnGhost}>Voir les campagnes</Link>
                        </div>
                    </section>
                )}

                <section aria-labelledby="h-reprendre" className={card}>
                    <div className="flex items-baseline justify-between gap-2">
                        <h2 id="h-reprendre" className="text-base font-semibold text-neutral-900">Reprendre</h2>
                        <MessageSquare className="w-4 h-4 text-neutral-400" />
                    </div>
                    {!recent ? <Spinner /> : recent.length === 0 ? (
                        <p className="mt-2 text-sm text-neutral-600">Vos conversations apparaîtront ici.</p>
                    ) : (
                        <ul className="mt-2 divide-y divide-neutral-100">
                            {recent.map(c => (
                                <li key={c.id}>
                                    <Link href={`/?c=${c.id}${c.project_id ? `&projet=${c.project_id}` : ''}`} className="block truncate py-2 text-sm text-neutral-900 hover:bg-neutral-50">
                                        {c.title || 'Conversation'}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>

            {p && <Referential initial={p.referentiel} />}

            {access?.is_admin && (
                <section aria-labelledby="h-team" className={`${card} flex items-start gap-3`}>
                    <Users className="mt-0.5 w-5 h-5 shrink-0 text-neutral-900" />
                    <div className="min-w-0 flex-1">
                        <h2 id="h-team" className="text-base font-semibold text-neutral-900">Équipe</h2>
                        <p className="mt-1 text-sm text-neutral-600">
                            Créez les comptes, donnez les rôles (pilote, contributeur, lecteur) et rattachez chaque équipe à ses branches
                            du référentiel : elle sera proposée comme responsable dans les campagnes.
                        </p>
                        <Link href="/admin" className={`mt-3 ${btnGhost}`}>Gérer l’équipe</Link>
                    </div>
                </section>
            )}
        </main>
    );
}

function Spinner() {
    return <Loader2 className="mt-3 w-4 h-4 animate-spin text-neutral-400" />;
}

function Tile({ href, value, label, plural: many, hint, alert }: { href: string; value: number; label: string; plural: string; hint?: string; alert?: boolean }) {
    return (
        <Link href={href} className="rounded-xl border border-neutral-200 px-4 py-3 hover:bg-neutral-50">
            <span className={`block text-2xl font-semibold ${alert && value ? 'text-red-700' : 'text-neutral-900'}`}>{value}</span>
            <span className="block text-sm text-neutral-700">{value > 1 ? many : label}{hint ? ` ${hint}` : ''}</span>
        </Link>
    );
}

/** « Que voulez-vous faire ? » : le champ de départ commun (fichiers, dictée, niveau) ; la conversation part aussitôt */
function Composer() {
    const router = useRouter();
    return (
        <StartComposer placeholder="Que voulez-vous faire ? Décrivez une procédure, posez une question, ou déposez un fichier…"
            onSend={(text, files) => { setPendingTurn({ text, files }); router.push('/?depart=1'); }} />
    );
}

/** Référentiel (pilotage) : état ; garder et adapter, partir de mes sources, partir de rien */
function Referential({ initial }: { initial: ReferentialState }) {
    const [state, setState] = useState<ReferentialState>(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmEmpty, setConfirmEmpty] = useState(false);
    const loadDefault = async () => {
        setBusy(true); setError(null);
        try { setState((await referentialApi.loadDefault()).etat); }
        catch (e) { setError(e instanceof Error ? e.message : 'Chargement impossible'); }
        finally { setBusy(false); }
    };
    return (
        <section aria-labelledby="ref-title" className={`${card} flex items-start gap-3`}>
            <FolderTree className="mt-0.5 w-5 h-5 shrink-0 text-neutral-900" />
            <div className="min-w-0 flex-1">
                <h2 id="ref-title" className="text-base font-semibold text-neutral-900">Référentiel des processus</h2>
                {state.origine === 'vide' ? (
                    <p className="mt-1 text-sm text-neutral-700">
                        Aucune structure pour l’instant. Construisez la vôtre, partez de vos sources, ou repartez du référentiel par défaut (organisé comme le paysage BIAN).
                    </p>
                ) : (
                    <p className="mt-1 text-sm text-neutral-700">
                        {plural(state.themes, 'thème', 'thèmes')} · {plural(state.categories, 'catégorie', 'catégories')} · {plural(state.sous_categories, 'sous-catégorie', 'sous-catégories')}
                        {' · '}{plural(state.procedures, 'procédure', 'procédures')}{state.procedures ? `, dont ${state.procedures_redigees} rédigée${state.procedures_redigees > 1 ? 's' : ''}` : ''}
                    </p>
                )}
                {state.origine === 'defaut' && (
                    <p className="mt-2 text-sm text-neutral-600">
                        C’est le référentiel par défaut, organisé comme le paysage BIAN : gardez-le et adaptez-le, partez de vos propres
                        sources (cartographie, manuels, présentations, code) que l’assistant analyse, ou partez de rien.
                    </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/orchestration?tab=procedures" className={btnPrimary}>{state.origine === 'vide' ? 'Construire la structure' : 'Ouvrir et adapter'}</Link>
                    <Link href={`/?brouillon=${encodeURIComponent(SOURCES_DRAFT)}`} className={btnGhost}>Partir de mes sources</Link>
                    {state.origine === 'vide' && (
                        <button type="button" onClick={() => void loadDefault()} disabled={busy} className={btnGhost}>
                            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Charger le référentiel par défaut
                        </button>
                    )}
                    {state.peut_vider && <button type="button" onClick={() => setConfirmEmpty(true)} className={btnGhost}>Partir de rien</button>}
                </div>
                {state.origine !== 'vide' && !state.peut_vider && (
                    <p className="mt-2 text-xs text-neutral-500">Des procédures ou des campagnes y sont rangées : le référentiel s’adapte, il ne se vide plus.</p>
                )}
                {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
            </div>
            {confirmEmpty && (
                <ConfirmDialog
                    title="Partir de rien ?"
                    message="Toute la structure actuelle (thèmes, catégories, sous-catégories) est supprimée. Aucune procédure n’y est rangée : rien d’autre n’est perdu. Vous pourrez recharger le référentiel par défaut."
                    confirmLabel="Vider le référentiel"
                    onConfirm={async () => { const r = await referentialApi.empty(); setState(r.etat); }}
                    onClose={() => setConfirmEmpty(false)} />
            )}
        </section>
    );
}

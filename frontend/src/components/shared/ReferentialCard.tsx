'use client';

/**
 * Proposition de référentiel dans le chat (« Partir de mes sources ») : l'arborescence
 * Thème › Catégorie › Sous-catégorie, les procédures rangées dessous, les remarques.
 * On l'affine en écrivant au chat ; l'admin ou le pilote l'applique (rien n'est supprimé,
 * les branches de même nom sont reprises, les procédures déjà présentes ne sont pas recréées).
 */
import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FileText, FolderTree, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { referentialApi, type ReferentialNode, type ReferentialProposal, type ApplyResult } from '@/lib/referentialApi';

const REMARK_LABELS: Record<string, string> = { doublon: 'Doublon', manque: 'Manque', incoherence: 'À revoir', conseil: 'Conseil' };
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

function Node({ node, depth }: { node: ReferentialNode; depth: number }) {
    const [open, setOpen] = useState(depth === 0);
    const count = (n: ReferentialNode): number => (n.procedures?.length || 0) + (n.enfants || []).reduce((s, c) => s + count(c), 0);
    const total = count(node);
    return (
        <li>
            <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
                style={{ paddingLeft: 8 + depth * 16 }}
                className="flex w-full items-center gap-1.5 rounded-lg py-1 pr-2 text-left text-sm hover:bg-neutral-50">
                <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-neutral-500 transition-transform ${open ? 'rotate-90' : ''}`} />
                <span className={`min-w-0 flex-1 truncate ${depth === 0 ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-800'}`}>{node.nom}</span>
                {total > 0 && <span className="shrink-0 text-xs text-neutral-500">{total}</span>}
            </button>
            {open && (
                <ul>
                    {(node.procedures || []).map(p => (
                        <li key={p.nom} style={{ paddingLeft: 30 + depth * 16 }} className="flex items-center gap-1.5 py-0.5 pr-2 text-sm text-neutral-700">
                            <FileText className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                            <span className="min-w-0 flex-1 truncate" title={p.source ? `Source : ${p.source}` : undefined}>{p.nom}</span>
                        </li>
                    ))}
                    {(node.enfants || []).map(c => <Node key={c.nom} node={c} depth={depth + 1} />)}
                </ul>
            )}
        </li>
    );
}

export default function ReferentialCard({ proposal }: { proposal: ReferentialProposal }) {
    const { access } = useAuth();
    const canApply = !!access?.can_manage_campaigns;
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<ApplyResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const st = proposal.stats;

    const apply = async () => {
        setBusy(true); setError(null);
        try { setResult(await referentialApi.apply(proposal.arbre)); }
        catch (e) { setError(e instanceof Error ? e.message : 'Application impossible'); }
        finally { setBusy(false); }
    };

    const created = result?.crees;
    const createdText = created && [
        created.themes && plural(created.themes, 'thème', 'thèmes'),
        created.categories && plural(created.categories, 'catégorie', 'catégories'),
        created.sous_categories && plural(created.sous_categories, 'sous-catégorie', 'sous-catégories'),
        created.procedures && plural(created.procedures, 'procédure', 'procédures'),
    ].filter(Boolean).join(', ');

    return (
        <div className="rounded-2xl border border-neutral-300 bg-white overflow-hidden shadow-sm">
            <div className="flex items-start gap-2.5 px-3.5 py-3 border-b border-neutral-200">
                <FolderTree className="mt-0.5 w-4 h-4 shrink-0 text-neutral-900" />
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">{proposal.titre}</p>
                    <p className="text-xs text-neutral-500">
                        {plural(st.themes, 'thème', 'thèmes')} · {plural(st.categories, 'catégorie', 'catégories')} · {plural(st.sous_categories, 'sous-catégorie', 'sous-catégories')} · {plural(st.procedures, 'procédure', 'procédures')}
                    </p>
                </div>
            </div>
            <ul className="max-h-80 overflow-y-auto px-1.5 py-2" aria-label="Arborescence proposée">
                {proposal.arbre.map(n => <Node key={n.nom} node={n} depth={0} />)}
            </ul>
            {proposal.remarques.length > 0 && (
                <div className="border-t border-neutral-200 px-3.5 py-2.5">
                    <p className="text-xs font-semibold text-neutral-900">Remarques</p>
                    <ul className="mt-1 space-y-1">
                        {proposal.remarques.map((r, i) => (
                            <li key={i} className="text-sm text-neutral-700">
                                <span className="mr-1.5 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700">{REMARK_LABELS[r.type] || 'Conseil'}</span>
                                {r.texte}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 bg-neutral-50 px-3.5 py-2.5">
                {result ? (
                    <>
                        <span className="text-sm text-neutral-900">
                            {createdText ? `Ajouté au référentiel : ${createdText}.` : 'Rien de nouveau : tout était déjà dans le référentiel.'}
                            {result.procedures_deja_presentes.length > 0 && ` ${plural(result.procedures_deja_presentes.length, 'procédure était', 'procédures étaient')} déjà présente${result.procedures_deja_presentes.length > 1 ? 's' : ''}.`}
                        </span>
                        <Link href="/orchestration?tab=procedures" className="text-sm font-medium text-neutral-900 underline">Ouvrir le référentiel</Link>
                    </>
                ) : canApply ? (
                    <>
                        <button type="button" onClick={() => void apply()} disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40">
                            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Appliquer au référentiel
                        </button>
                        <span className="text-[11px] text-neutral-500">Rien n’est supprimé ; les branches de même nom sont reprises. Ou affinez par écrit (« fusionne… », « ajoute… »).</span>
                    </>
                ) : (
                    <span className="text-[11px] text-neutral-500">L’administrateur ou le pilote peut l’appliquer au référentiel. Affinez-la par écrit si besoin.</span>
                )}
                {error && <p role="alert" className="w-full text-xs text-red-600">{error}</p>}
            </div>
        </div>
    );
}

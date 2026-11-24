'use client';

/**
 * Circuit d'une procédure (Studio et espace de travail) : campagne, RACI, action attendue de MOI,
 * et « Validée par … le … ». Rien n'est affiché pour une procédure hors campagne sans RACI ni action.
 * - R : « Enregistrer et soumettre » (enregistre d'abord via onSave, puis soumet).
 * - C : « Transmettre au valideur » ou « Renvoyer au rédacteur ».
 * - A : « Valider » (nom et date enregistrés) ou « Renvoyer ».
 *
 * Trois morceaux réutilisables : useCircuit (état et actions), CircuitSummary (une ligne de texte, à placer sous
 * le nom de la procédure), CircuitConfirm (confirmation avec commentaire). CircuitBar les assemble en bandeau.
 */
import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Loader2, Megaphone, Send, Undo2 } from 'lucide-react';
import { circuitApi, formatValidation, type CircuitContext } from '@/lib/circuitApi';
import { useAuth } from '@/context/AuthContext';

const ETAPES: Record<string, string> = {
    soumise: 'en attente de validation', en_relecture: 'en relecture', a_corriger: 'à corriger', validee: 'validée',
};
const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50';

export type CircuitAction = 'soumettre' | 'transmettre' | 'renvoyer' | 'valider' | 'renvoyer_a';

export const CIRCUIT_LABELS: Record<CircuitAction, string> = {
    soumettre: 'Enregistrer et soumettre', transmettre: 'Transmettre au valideur', renvoyer: 'Renvoyer au rédacteur',
    valider: 'Valider cette version', renvoyer_a: 'Renvoyer pour correction',
};

export function useCircuit(procedureId: string | null | undefined, onSave?: () => Promise<boolean | void>, refreshKey = 0) {
    const { access } = useAuth();
    const [ctx, setCtx] = useState<CircuitContext | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [comment, setComment] = useState('');
    const [asking, setAsking] = useState<CircuitAction | null>(null);

    const load = useCallback(async () => {
        if (!procedureId || !access?.member) { setCtx(null); return; }
        try { setCtx(await circuitApi.context(procedureId)); } catch { setCtx(null); }
    }, [procedureId, access?.member]);
    useEffect(() => { void load(); setAsking(null); setError(null); }, [load, refreshKey]);

    const visible = !!ctx && !(!ctx.campagne && !ctx.action && !ctx.validation && ctx.mes_roles.length === 0);
    /** actions attendues de moi, dans l'ordre où les proposer */
    const actions: CircuitAction[] = !ctx ? [] : ctx.action === 'soumettre' ? ['soumettre']
        : ctx.action === 'relire' ? ['transmettre', 'renvoyer'] : ctx.action === 'valider' ? ['valider', 'renvoyer_a'] : [];

    const act = async () => {
        if (!procedureId || !asking) return;
        setBusy(true);
        setError(null);
        try {
            let next: CircuitContext;
            if (asking === 'soumettre') {
                if (onSave && (await onSave()) === false) { setBusy(false); return; }
                next = await circuitApi.submit(procedureId, comment || undefined);
            } else if (asking === 'transmettre' || asking === 'renvoyer') {
                next = await circuitApi.review(procedureId, asking, comment || undefined);
            } else {
                next = await circuitApi.validate(procedureId, asking === 'valider' ? 'valider' : 'renvoyer', comment || undefined);
            }
            setCtx(next);
            setAsking(null);
            setComment('');
        } catch (e) { setError(e instanceof Error ? e.message : 'Action refusée'); }
        finally { setBusy(false); }
    };

    return { ctx, visible, actions, asking, setAsking, comment, setComment, busy, error, setError, act };
}

export type Circuit = ReturnType<typeof useCircuit>;

const names = (list: { nom: string | null }[]) => list.map(p => p.nom || 'sans nom').join(', ') || 'à désigner';

/** Campagne, responsables et étape du circuit, en une ligne de texte */
export function CircuitSummary({ circuit }: { circuit: Circuit }) {
    const { ctx, visible } = circuit;
    if (!visible || !ctx) return null;
    return (
        <>
            {ctx.campagne && (
                <span className="inline-flex items-center gap-1 text-neutral-700">
                    <Megaphone className="h-3 w-3 text-petrole" />{ctx.campagne.title}
                    {ctx.campagne.echeance && <>, échéance le {new Date(ctx.campagne.echeance).toLocaleDateString('fr-FR')}</>}
                </span>
            )}
            <span>R : {names(ctx.raci.R)}</span>
            <span>A : {ctx.raci.A?.nom || 'à désigner'}</span>
            {ctx.raci.C.length > 0 && <span>C : {names(ctx.raci.C)}</span>}
            {ctx.circuit.etape && <span className="rounded-full bg-neutral-100 px-2 text-neutral-700">{ETAPES[ctx.circuit.etape] || ctx.circuit.etape}</span>}
            {ctx.validation && (
                <span className="inline-flex items-center gap-1 rounded-full bg-petrole-tint px-2 font-medium text-petrole">
                    <BadgeCheck className="h-3 w-3" />{formatValidation(ctx.validation)}
                </span>
            )}
        </>
    );
}

/** Confirmation d'une action du circuit, avec un commentaire facultatif */
export function CircuitConfirm({ circuit }: { circuit: Circuit }) {
    const { ctx, asking, setAsking, comment, setComment, busy, error, setError, act } = circuit;
    if (!ctx || (!asking && !error)) return null;
    return (
        <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-2.5 text-xs text-neutral-700">
            {asking && (
                <div className="rounded-lg border border-petrole/30 bg-petrole-tint/40 p-2.5">
                    <p className="font-semibold text-neutral-900">{CIRCUIT_LABELS[asking]}</p>
                    {asking === 'valider' && <p className="mt-0.5">Votre nom et la date seront enregistrés sur cette version, qui devient la version publiée.</p>}
                    {asking === 'soumettre' && <p className="mt-0.5">L&apos;état actuel est enregistré, puis part {ctx.raci.C.length ? 'en relecture' : 'en validation'}.</p>}
                    <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} placeholder="Commentaire (facultatif)"
                        aria-label="Commentaire" className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs" />
                    <div className="mt-2 flex justify-end gap-2">
                        <button type="button" onClick={() => { setAsking(null); setError(null); }} className={`${btn} text-neutral-700 hover:bg-white`}>Annuler</button>
                        <button type="button" disabled={busy} onClick={() => void act()} className={`${btn} bg-petrole text-white hover:opacity-90`}>
                            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Confirmer
                        </button>
                    </div>
                </div>
            )}
            {error && <p role="alert" className="mt-1.5 text-red-600">{error}</p>}
        </div>
    );
}

/** Bandeau complet (espace de travail) */
export default function CircuitBar({ procedureId, onSave, refreshKey = 0 }: {
    procedureId: string | null | undefined;
    /** enregistre l'état courant avant la soumission ; false = abandon */
    onSave?: () => Promise<boolean | void>;
    refreshKey?: number;
}) {
    const circuit = useCircuit(procedureId, onSave, refreshKey);
    if (!circuit.visible) return null;
    const icon = (a: CircuitAction) => a === 'valider' ? <BadgeCheck className="h-3.5 w-3.5" />
        : a === 'renvoyer' || a === 'renvoyer_a' ? <Undo2 className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />;
    return (
        <>
            <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-2 text-xs text-neutral-600">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <CircuitSummary circuit={circuit} />
                    <span className="ml-auto flex flex-wrap gap-2">
                        {circuit.actions.map((a, i) => (
                            <button key={a} type="button" onClick={() => circuit.setAsking(a)}
                                className={`${btn} ${i === 0 ? 'bg-petrole text-white hover:opacity-90' : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-50'}`}>
                                {icon(a)} {a === 'valider' ? 'Valider' : a === 'renvoyer_a' ? 'Renvoyer' : CIRCUIT_LABELS[a]}
                            </button>
                        ))}
                    </span>
                </div>
            </div>
            <CircuitConfirm circuit={circuit} />
        </>
    );
}

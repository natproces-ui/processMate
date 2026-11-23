'use client';

/**
 * Bandeau du circuit d'une procédure (Studio et espace de travail) : campagne, RACI,
 * action attendue de MOI, et « Validée par … le … ». Rien n'est affiché pour une procédure
 * hors campagne sans RACI ni action.
 * - R : « Enregistrer et soumettre » (enregistre d'abord via onSave, puis soumet).
 * - C : « Transmettre au valideur » ou « Renvoyer au rédacteur ».
 * - A : « Valider » (nom et date enregistrés) ou « Renvoyer ».
 */
import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Loader2, Megaphone, Send, Undo2 } from 'lucide-react';
import { circuitApi, formatValidation, type CircuitContext } from '@/lib/circuitApi';
import { useAuth } from '@/context/AuthContext';

const ETAPES: Record<string, string> = {
    soumise: 'en attente de validation', en_relecture: 'en relecture', a_corriger: 'à corriger', validee: 'validée',
};
const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50';

export default function CircuitBar({ procedureId, onSave, refreshKey = 0 }: {
    procedureId: string | null | undefined;
    /** enregistre l'état courant avant la soumission ; false = abandon */
    onSave?: () => Promise<boolean | void>;
    refreshKey?: number;
}) {
    const { access } = useAuth();
    const [ctx, setCtx] = useState<CircuitContext | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [comment, setComment] = useState('');
    const [asking, setAsking] = useState<null | 'transmettre' | 'renvoyer' | 'valider' | 'renvoyer_a' | 'soumettre'>(null);

    const load = useCallback(async () => {
        if (!procedureId || !access?.member) { setCtx(null); return; }
        try { setCtx(await circuitApi.context(procedureId)); } catch { setCtx(null); }
    }, [procedureId, access?.member]);
    useEffect(() => { void load(); }, [load, refreshKey]);

    if (!ctx || (!ctx.campagne && !ctx.action && !ctx.validation && ctx.mes_roles.length === 0)) return null;

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

    const labels: Record<string, string> = {
        soumettre: 'Enregistrer et soumettre', transmettre: 'Transmettre au valideur', renvoyer: 'Renvoyer au rédacteur',
        valider: 'Valider cette version', renvoyer_a: 'Renvoyer pour correction',
    };
    const names = (list: { nom: string | null }[]) => list.map(p => p.nom || 'sans nom').join(', ') || 'à désigner';

    return (
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {ctx.campagne && (
                    <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                        <Megaphone className="w-3.5 h-3.5 text-petrole" />
                        <span>{ctx.campagne.title}{ctx.campagne.echeance && <span className="font-normal text-slate-500">, échéance le {new Date(ctx.campagne.echeance).toLocaleDateString('fr-FR')}</span>}</span>
                    </span>
                )}
                <span>R : {names(ctx.raci.R)}</span>
                <span>A : {ctx.raci.A?.nom || <span className="text-amber-600">à désigner</span>}</span>
                {ctx.raci.C.length > 0 && <span>C : {names(ctx.raci.C)}</span>}
                {ctx.circuit.etape && <span className="rounded-full bg-slate-100 px-2 py-0.5">{ETAPES[ctx.circuit.etape] || ctx.circuit.etape}</span>}
                {ctx.validation && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                        <BadgeCheck className="w-3.5 h-3.5" />{formatValidation(ctx.validation)}
                    </span>
                )}
                <span className="ml-auto flex flex-wrap gap-2">
                    {ctx.action === 'soumettre' && (
                        <button type="button" onClick={() => setAsking('soumettre')} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
                            <Send className="w-3.5 h-3.5" /> {labels.soumettre}
                        </button>
                    )}
                    {ctx.action === 'relire' && (<>
                        <button type="button" onClick={() => setAsking('transmettre')} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}><Send className="w-3.5 h-3.5" /> {labels.transmettre}</button>
                        <button type="button" onClick={() => setAsking('renvoyer')} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}><Undo2 className="w-3.5 h-3.5" /> {labels.renvoyer}</button>
                    </>)}
                    {ctx.action === 'valider' && (<>
                        <button type="button" onClick={() => setAsking('valider')} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}><BadgeCheck className="w-3.5 h-3.5" /> Valider</button>
                        <button type="button" onClick={() => setAsking('renvoyer_a')} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}><Undo2 className="w-3.5 h-3.5" /> Renvoyer</button>
                    </>)}
                </span>
            </div>
            {asking && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <p className="font-medium text-slate-800">{labels[asking]}</p>
                    {asking === 'valider' && (
                        <p className="mt-0.5 text-slate-500">Votre nom et la date seront enregistrés sur cette version, qui devient la version publiée.</p>
                    )}
                    {asking === 'soumettre' && (
                        <p className="mt-0.5 text-slate-500">L&apos;état actuel est enregistré, puis part {ctx.raci.C.length ? 'en relecture' : 'en validation'}.</p>
                    )}
                    <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} placeholder="Commentaire (facultatif)"
                        aria-label="Commentaire" className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" />
                    <div className="mt-2 flex justify-end gap-2">
                        <button type="button" onClick={() => { setAsking(null); setError(null); }} className={`${btn} text-slate-600 hover:bg-white`}>Annuler</button>
                        <button type="button" disabled={busy} onClick={() => void act()} className={`${btn} bg-slate-900 text-white hover:bg-slate-700`}>
                            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirmer
                        </button>
                    </div>
                </div>
            )}
            {error && <p role="alert" className="mt-1.5 text-red-600">{error}</p>}
        </div>
    );
}

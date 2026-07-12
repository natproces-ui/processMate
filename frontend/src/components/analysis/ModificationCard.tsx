'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Loader2, Wand2 } from 'lucide-react';
import type { Modification, Partie } from '@/lib/analysisApi';
import { applyModificationToProcedure, isModificationSupported } from '@/logic/applyModification';

interface Props {
  modification: Modification;
  partie?: Partie;
  /** Si fourni, affiche le bouton "Appliquer à la procédure" (mode individuel). */
  procedureId?: string;
  /** Contrôlé par le parent — ex: déjà appliqué via un lot. Prioritaire sur l'état interne. */
  applied?: boolean;
  onApplied?: () => void;
  /** Mode sélection multiple (case à cocher) piloté par le parent — remplace le bouton individuel.
   *  La case reste toujours cochable même si l'application automatique n'est pas supportée : une
   *  modification non auto-applicable peut quand même être incluse dans une tâche assignée à
   *  quelqu'un qui la fera manuellement dans le Studio. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
}

function OutputsList({ outputs }: { outputs: { targetId: string; label: string }[] }) {
  return (
    <div className="mt-1 space-y-0.5">
      {outputs.map((o, i) => (
        <p key={i} className="text-xs text-blue-900">
          {o.label ? `${o.label} → ` : '→ '}<span className="font-mono">{o.targetId}</span>
        </p>
      ))}
    </div>
  );
}

export default function ModificationCard({
  modification, partie, procedureId, applied: appliedProp, onApplied,
  selectable, selected, onToggleSelected,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [appliedLocal, setAppliedLocal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applied = appliedProp || appliedLocal;
  const supported = partie ? isModificationSupported(partie, modification) : true;

  const doApply = async () => {
    if (!procedureId || !partie) return;
    setApplying(true);
    setError(null);
    try {
      const result = await applyModificationToProcedure(procedureId, {
        partie,
        target_step_id: modification.target_step_id,
        target_field: modification.target_field,
        operation_type: modification.operation_type,
        proposed_value: modification.proposed_value,
        current_value: modification.current_value,
        new_row: modification.new_row,
        after_id: modification.after_id,
        outputs: modification.outputs,
      });
      if (result.ok) {
        setAppliedLocal(true);
        setConfirming(false);
        onApplied?.();
      } else {
        setError(result.reason);
        setConfirming(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l’application');
      setConfirming(false);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="rounded border border-blue-200 bg-blue-50 px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1.5">
        {selectable && !applied && (
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => onToggleSelected?.()}
            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
            title="Inclure dans la tâche ou dans l'application"
          />
        )}
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-400">Modification proposée</p>
        {modification.operation_type && (
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">{modification.operation_type}</span>
        )}
      </div>
      {modification.title && <p className="text-sm font-semibold text-blue-900">{modification.title}</p>}

      {/* Nouvelle étape (operation_type=add) — affichage structuré, pas de dump brut */}
      {modification.new_row && (
        <div className="mt-1 space-y-0.5">
          <p className="text-xs text-blue-900"><span className="text-blue-500">Étape :</span> {modification.new_row.étape}</p>
          <p className="text-xs text-blue-900"><span className="text-blue-500">Acteur :</span> {modification.new_row.acteur}</p>
          <p className="text-xs text-blue-900"><span className="text-blue-500">Type :</span> {modification.new_row.typeBpmn}</p>
          {modification.new_row.condition && (
            <p className="text-xs text-blue-900"><span className="text-blue-500">Condition :</span> {modification.new_row.condition}</p>
          )}
          {(modification.new_row.outputs || []).length > 0 && (
            <OutputsList outputs={modification.new_row.outputs!} />
          )}
        </div>
      )}

      {/* Nouveaux liens (operation_type=relink) */}
      {modification.outputs && modification.outputs.length > 0 && (
        <div className="mt-1">
          <p className="text-xs text-blue-500">Nouveaux liens :</p>
          <OutputsList outputs={modification.outputs} />
        </div>
      )}

      {modification.target_field && (
        <p className="mt-0.5 text-xs text-blue-600">Champ : {modification.target_field}</p>
      )}
      {modification.current_value && (
        <p className="mt-1 text-xs text-slate-500 line-through">{modification.current_value}</p>
      )}
      {modification.proposed_value && <p className="text-xs text-blue-900">{modification.proposed_value}</p>}
      {modification.rationale && <p className="mt-1 text-xs italic text-slate-500">{modification.rationale}</p>}

      {!supported && (
        <p className="mt-1.5 text-xs text-slate-500">
          Non supporté par l'application automatique — peut quand même être assignée en tâche, à faire manuellement dans le Studio.
        </p>
      )}

      {error && (
        <div className="mt-2 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {applied ? (
        <div className="mt-2">
          <span className="inline-flex items-center gap-1 rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
            <Check className="h-3 w-3" /> Appliqué à la procédure
          </span>
        </div>
      ) : selectable ? null : procedureId && partie && supported && (
        <div className="mt-2">
          {confirming ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-blue-800">Confirmer l&apos;application à la procédure ?</span>
              <button
                type="button"
                onClick={doApply}
                disabled={applying}
                className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Confirmer
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={applying}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1 rounded border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              <Wand2 className="h-3 w-3" /> Appliquer à la procédure
            </button>
          )}
        </div>
      )}
    </div>
  );
}

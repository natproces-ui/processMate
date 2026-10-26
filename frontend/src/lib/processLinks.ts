// lib/processLinks.ts — Liens entre procédures.
//
// Un lien est enregistré une seule fois, côté source : `TaskEnrichment.liens` pour
// « fait appel à » / « déclenche » (posés sur une étape), `metadata.necessite` pour
// « nécessite » (posé sur la procédure). Le sens inverse n'est jamais stocké : il est
// calculé par GET /api/orchestration/procedures/{id}/links, donc les deux côtés ne
// peuvent pas diverger. La cible est le session_id (stable d'une version à l'autre).

export type StepLinkType = 'fait_appel_a' | 'declenche';
export type LinkType = StepLinkType | 'necessite';

export interface StepLink {
  type: StepLinkType;
  cible: string; // session_id de la procédure cible
}

export const LINK_LABELS: Record<LinkType, { label: string; inverse: string; color: string }> = {
  fait_appel_a: { label: 'Fait appel à', inverse: 'Sollicité par', color: 'text-violet-700 bg-violet-50 border-violet-200' },
  declenche: { label: 'Déclenche', inverse: 'Déclenché par', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  necessite: { label: 'Nécessite', inverse: 'Nécessaire à', color: 'text-sky-700 bg-sky-50 border-sky-200' },
};

// Question de test affichée dans le sélecteur — évite la confusion appel / déclenchement
export const LINK_HELP =
  "Le process reprend-il une fois l'autre terminé ? Oui → Fait appel à · Non → Déclenche. " +
  "L'autre doit-il être terminé avant même de commencer ? → Nécessite (au niveau de la procédure).";

/** Un lien vu depuis la procédure affichée (sortant ou entrant). */
export interface ResolvedLink {
  type: LinkType;
  session_id: string;          // l'autre procédure
  workflow_id: string | null;  // sa dernière version, null si elle a été supprimée
  nom: string;
  step_id: string | null;      // étape porteuse du lien (côté source), null pour « nécessite »
  step_name: string | null;
}

export interface ProcedureLinks {
  sortants: ResolvedLink[];
  entrants: ResolvedLink[];
}

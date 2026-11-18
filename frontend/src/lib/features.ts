/**
 * Drapeaux de la refonte « chat d'abord » (lot 4). Tous désactivés par défaut :
 * sans eux, l'application se comporte exactement comme avant.
 */
/** Le chat devient la page d'accueil ; la page commerciale passe sur /decouvrir. */
export const CHAT_HOME = process.env.NEXT_PUBLIC_CHAT_HOME === 'true';
/** Export (BPMN, fiche) autorisé sans compte. Décision produit en attente. */
export const GUEST_EXPORT_ENABLED = process.env.NEXT_PUBLIC_GUEST_EXPORT_ENABLED === 'true';

/** Limites invité affichées avant envoi (les vraies limites sont vérifiées par le backend). */
const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);
export const GUEST_LIMITS = {
    maxFiles: num(process.env.NEXT_PUBLIC_GUEST_MAX_FILES, 1),
    maxFileMb: num(process.env.NEXT_PUBLIC_GUEST_MAX_FILE_MB, 5),
    maxPages: num(process.env.NEXT_PUBLIC_GUEST_MAX_PAGES, 15),
};

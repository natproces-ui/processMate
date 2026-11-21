/**
 * Premier message saisi hors du chat (accueil de l'organisation : « Que voulez-vous faire ? »),
 * avec ses fichiers, transmis au chat qui s'ouvre. Gardé en mémoire le temps de la navigation
 * (des fichiers ne passent pas par l'adresse) ; repris une seule fois.
 */
export interface PendingTurn { text: string; files: File[] }

let pending: PendingTurn | null = null;

export function setPendingTurn(turn: PendingTurn): void {
    pending = turn;
}

export function takePendingTurn(): PendingTurn | null {
    const turn = pending;
    pending = null;
    return turn;
}

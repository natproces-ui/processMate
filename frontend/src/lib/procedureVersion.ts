/**
 * AS IS / TO BE : un même processus en deux versions. Le TO BE garde l'identifiant de son AS IS (asis_id) ;
 * une procédure n'est nommée « AS IS » que si son TO BE est à côté d'elle (sinon c'est une procédure, simplement).
 */
export type VersionLabel = 'AS IS' | 'TO BE';

interface Versioned { workflow_db_id?: string | null; meta?: Record<string, unknown> | null }

export function versionLabel(p: Versioned, all: Versioned[]): VersionLabel | null {
    if (p.meta?.asis_id) return 'TO BE';
    if (p.workflow_db_id && all.some(o => o.meta?.asis_id === p.workflow_db_id)) return 'AS IS';
    return null;
}

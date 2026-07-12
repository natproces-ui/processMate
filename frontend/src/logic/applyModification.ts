// logic/applyModification.ts
// Applique une modification proposée par l'analyse IA (ou une tâche qui en découle) à
// une procédure. Une modification cible une des 5 parties de la procédure — chacune
// vit dans une couche de données différente, donc chacune a sa propre logique d'écriture :
//   - diagramme / outils  -> workflow_json  (via le vocabulaire d'opérations partagé)
//   - descriptions        -> enrichments_json[stepId][champ]
//   - qualite / caracteristiques -> procedure_metadata_json[champ]
//
// On modifie toujours une procédure à la fois : applyModificationToProcedure traite une
// seule modification, applyModificationsBatch en traite plusieurs mais jamais réparties
// sur plus d'une procédure (un seul fetch, un seul save).
import type { Table1Row } from './types';
import type { TaskEnrichment } from './bpmnTypes';
import { applyOperations, type Operation } from './workflowOperations';
import { generateBPMNSimple } from './bpmnGeneratorSimple';
import { orchestrationApi } from '@/lib/orchestrationApi';

export type Partie = 'caracteristiques' | 'qualite' | 'diagramme' | 'descriptions' | 'outils';

export interface NewRowInput {
    id: string;
    étape: string;
    typeBpmn: Table1Row['typeBpmn'];
    acteur: string;
    département?: string;
    typeActeur?: Table1Row['typeActeur'];
    condition?: string;
    outputs?: { targetId: string; label: string }[];
    outil?: string;
}

export interface ModificationInput {
    partie: Partie;
    target_step_id?: string | null;
    target_field?: string;
    operation_type?: 'add' | 'update' | 'delete' | 'move' | 'relink';
    proposed_value?: string;
    current_value?: string | null;
    // Uniquement pour operation_type=add : description complète de la nouvelle étape.
    new_row?: NewRowInput;
    after_id?: string;
    // Uniquement pour operation_type=relink : nouveaux liens sortants.
    outputs?: { targetId: string; label: string }[];
}

export interface ProcedureState {
    workflow: Table1Row[];
    enrichments: Record<string, TaskEnrichment>;
    metadata: Record<string, unknown>;
}

function emptyEnrichment(id: string): TaskEnrichment {
    return { id_tache: id, descriptif: '', declencheur: '', applicatif: '', duree_estimee: '', frequence: '', kpi: '' };
}

export interface RecentAiChangeItem {
    partie: Partie;
    target_step_id: string | null;
    target_field: string | null;
}

// Repère précisément l'étape touchée, y compris pour un "add" où l'id définitif n'est
// connu qu'après résolution du préfixe NEW_ par applyOperations — on compare l'état du
// workflow avant/après plutôt que de recalculer cette résolution nous-mêmes.
function buildChangeRecord(mod: ModificationInput, beforeWorkflow: Table1Row[], afterWorkflow: Table1Row[]): RecentAiChangeItem {
    if ((mod.partie === 'diagramme' || mod.partie === 'outils') && mod.operation_type === 'add') {
        const beforeIds = new Set(beforeWorkflow.map(r => r.id));
        const newRow = afterWorkflow.find(r => !beforeIds.has(r.id));
        return { partie: mod.partie, target_step_id: newRow?.id ?? null, target_field: mod.target_field ?? null };
    }
    return { partie: mod.partie, target_step_id: mod.target_step_id ?? null, target_field: mod.target_field ?? null };
}

// Tamponne les éléments touchés dans procedure_metadata_json pour que le Studio puisse
// les surligner à l'ouverture — remplace le tampon précédent (une seule "vague" de
// changements récents à la fois, effacée à la prochaine sauvegarde manuelle du Studio).
function stampRecentChanges(metadata: Record<string, unknown>, items: RecentAiChangeItem[]): Record<string, unknown> {
    return {
        ...metadata,
        recent_ai_changes: { applied_at: new Date().toISOString(), items },
    };
}

// Vérification à froid, sans avoir besoin de charger la procédure — indique si
// l'application automatique est possible pour cette modification. N'empêche jamais
// de la sélectionner pour une tâche (une tâche peut toujours être créée pour qu'un
// humain fasse le changement manuellement) — sert uniquement à filtrer/avertir côté
// "Appliquer les modifications".
export function isModificationSupported(
    partie: Partie,
    mod: Pick<ModificationInput, 'operation_type' | 'new_row' | 'outputs'>,
): boolean {
    if (partie === 'diagramme' || partie === 'outils') {
        if (mod.operation_type === 'add') return Boolean(mod.new_row);
        if (mod.operation_type === 'relink') return Boolean(mod.outputs && mod.outputs.length > 0);
    }
    return true;
}

// ─────────────────────────────────────────────────────────────
// Fonction pure : (état actuel, modification) -> nouvel état
// ─────────────────────────────────────────────────────────────
export function applyModificationToState(
    state: ProcedureState,
    mod: ModificationInput,
): { state: ProcedureState; unsupported?: string } {
    switch (mod.partie) {
        case 'diagramme':
        case 'outils': {
            const opType = mod.operation_type || 'update';

            if (opType === 'add') {
                if (!mod.new_row) {
                    return { state, unsupported: 'Détails de la nouvelle étape manquants pour l’application automatique — à ajouter directement dans le Studio.' };
                }
                const op: Operation = { type: 'add', row: mod.new_row, after_id: mod.after_id };
                return { state: { ...state, workflow: applyOperations(state.workflow, [op]) } };
            }

            if (opType === 'relink') {
                if (!mod.target_step_id || !mod.outputs || mod.outputs.length === 0) {
                    return { state, unsupported: 'Nouveaux liens manquants pour l’application automatique — à relier directement dans le Studio.' };
                }
                const op: Operation = { type: 'relink', id: mod.target_step_id, outputs: mod.outputs };
                return { state: { ...state, workflow: applyOperations(state.workflow, [op]) } };
            }

            if (!mod.target_step_id) {
                return { state, unsupported: 'Étape cible manquante pour cette modification.' };
            }
            let op: Operation;
            if (opType === 'delete') {
                op = { type: 'delete', id: mod.target_step_id, reconnect: true };
            } else if (opType === 'move' && (mod.target_field === 'acteur' || mod.target_field === 'département')) {
                op = { type: 'move', id: mod.target_step_id, [mod.target_field]: mod.proposed_value } as Operation;
            } else {
                if (!mod.target_field) return { state, unsupported: 'Champ cible manquant pour cette modification.' };
                op = { type: 'update', id: mod.target_step_id, fields: { [mod.target_field]: mod.proposed_value } };
            }
            return { state: { ...state, workflow: applyOperations(state.workflow, [op]) } };
        }

        case 'descriptions': {
            if (!mod.target_step_id || !mod.target_field) {
                return { state, unsupported: 'Étape ou champ cible manquant pour cette modification.' };
            }
            const existing = state.enrichments[mod.target_step_id] || emptyEnrichment(mod.target_step_id);
            return {
                state: {
                    ...state,
                    enrichments: {
                        ...state.enrichments,
                        [mod.target_step_id]: { ...existing, [mod.target_field]: mod.proposed_value ?? '' },
                    },
                },
            };
        }

        case 'qualite':
        case 'caracteristiques': {
            if (!mod.target_field) return { state, unsupported: 'Champ cible manquant pour cette modification.' };
            if (mod.target_field === 'regles_gestion') {
                const current = Array.isArray(state.metadata.regles_gestion)
                    ? (state.metadata.regles_gestion as string[])
                    : [];
                const matchIdx = mod.current_value
                    ? current.findIndex(r => r.trim().toLowerCase() === mod.current_value!.trim().toLowerCase())
                    : -1;
                const nextRules = matchIdx >= 0
                    ? current.map((r, i) => (i === matchIdx ? (mod.proposed_value || r) : r))
                    : [...current, mod.proposed_value || ''].filter(Boolean);
                return { state: { ...state, metadata: { ...state.metadata, regles_gestion: nextRules } } };
            }
            return { state: { ...state, metadata: { ...state.metadata, [mod.target_field]: mod.proposed_value ?? '' } } };
        }

        default:
            return { state, unsupported: `Partie de procédure inconnue: ${mod.partie}` };
    }
}

// ─────────────────────────────────────────────────────────────
// I/O partagé : charger / persister l'état complet d'une procédure
// ─────────────────────────────────────────────────────────────
async function loadProcedureState(procedureId: string): Promise<{
    state: ProcedureState;
    existingXml: string | null;
    procedureName: string;
} | null> {
    const { procedure } = await orchestrationApi.getProcedure(procedureId);
    if (!procedure) return null;

    const workflow = (procedure.workflow_json || []) as Table1Row[];
    const enrichmentsRaw = (procedure.enrichments_json || {}) as Record<string, unknown>;
    const enrichments: Record<string, TaskEnrichment> = {};
    Object.entries(enrichmentsRaw).forEach(([id, enr]) => {
        if (id !== '__bpmn_xml__') enrichments[id] = enr as TaskEnrichment;
    });
    const existingXml = (enrichmentsRaw.__bpmn_xml__ as string | undefined) ?? null;
    const metadata = (procedure.metadata || {}) as Record<string, unknown>;

    return { state: { workflow, enrichments, metadata }, existingXml, procedureName: procedure.nom || 'Processus' };
}

async function persistProcedureState(
    procedureId: string,
    state: ProcedureState,
    existingXml: string | null,
    procedureName: string,
    regenerateBpmn: boolean,
): Promise<void> {
    // Le diagramme n'a pas d'instance bpmn-js montée hors du Studio : on ne peut pas
    // patcher incrémentalement, on régénère entièrement — uniquement si une des
    // modifications appliquées a pu changer la structure. Sinon on repropage le XML
    // existant tel quel (enrichments_json est remplacé en entier côté backend, ne pas
    // le perdre en le laissant vide).
    let bpmnXml = existingXml;
    if (regenerateBpmn && state.workflow.length > 0) {
        try {
            bpmnXml = generateBPMNSimple(state.workflow, procedureName);
        } catch {
            bpmnXml = existingXml;
        }
    }
    await orchestrationApi.saveWorkflowData(
        procedureId,
        state.workflow,
        state.enrichments as unknown as Record<string, unknown>,
        state.metadata,
        bpmnXml,
    );
}

// ─────────────────────────────────────────────────────────────
// Application d'une seule modification
// ─────────────────────────────────────────────────────────────
export async function applyModificationToProcedure(
    procedureId: string,
    modification: ModificationInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
    const loaded = await loadProcedureState(procedureId);
    if (!loaded) return { ok: false, reason: 'Procédure introuvable.' };

    const { state, unsupported } = applyModificationToState(loaded.state, modification);
    if (unsupported) return { ok: false, reason: unsupported };

    const changeRecord = buildChangeRecord(modification, loaded.state.workflow, state.workflow);
    const stampedState = { ...state, metadata: stampRecentChanges(state.metadata, [changeRecord]) };

    await persistProcedureState(
        procedureId, stampedState, loaded.existingXml, loaded.procedureName,
        modification.partie === 'diagramme' || modification.partie === 'outils',
    );
    return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Application groupée — toujours sur une seule procédure à la fois
// ─────────────────────────────────────────────────────────────
export interface BatchModificationItem extends ModificationInput {
    /** Index dans le tableau `analysis[]` d'origine — sert à rapporter quels items ont réussi. */
    index: number;
}
export interface BatchApplyResult {
    applied: number[];
    skipped: { index: number; reason: string }[];
}

export async function applyModificationsBatch(
    procedureId: string,
    items: BatchModificationItem[],
): Promise<BatchApplyResult> {
    const applied: number[] = [];
    const skipped: { index: number; reason: string }[] = [];
    if (items.length === 0) return { applied, skipped };

    const loaded = await loadProcedureState(procedureId);
    if (!loaded) {
        return { applied, skipped: items.map(i => ({ index: i.index, reason: 'Procédure introuvable.' })) };
    }

    let state = loaded.state;
    let touchedDiagramme = false;
    const changeRecords: RecentAiChangeItem[] = [];

    for (const item of items) {
        const beforeWorkflow = state.workflow;
        const result = applyModificationToState(state, item);
        if (result.unsupported) {
            skipped.push({ index: item.index, reason: result.unsupported });
            continue;
        }
        changeRecords.push(buildChangeRecord(item, beforeWorkflow, result.state.workflow));
        state = result.state;
        applied.push(item.index);
        if (item.partie === 'diagramme' || item.partie === 'outils') touchedDiagramme = true;
    }

    if (applied.length > 0) {
        state = { ...state, metadata: stampRecentChanges(state.metadata, changeRecords) };
        await persistProcedureState(procedureId, state, loaded.existingXml, loaded.procedureName, touchedDiagramme);
    }

    return { applied, skipped };
}

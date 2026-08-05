// src/logic/bpmnParser.ts
//
// Parseur BPMN → Table1Row[] (sens diagramme → tableau).
// Complète generateBPMNSimple (sens tableau → diagramme, bpmnGeneratorSimple.ts) :
// jusqu'ici rien ne relisait le diagramme, donc toute tâche ou tout outil ajouté à la
// main sur le canevas (new-way/Library.tsx, new-way/BpmnEditor.tsx) était invisible au
// tableau. Voir synchronise.md pour le contexte complet.
//
// Ne parse pas le XML en texte : lit les objets structurés exposés par le modeler
// bpmn-js déjà chargé (elementRegistry, moddle), la même API que BpmnEditor.tsx
// utilise déjà pour créer les shapes Tool_ et les associations.

import { is } from 'bpmn-js/lib/util/ModelUtil';
import type { Table1Row } from './types';
import type { TaskEnrichment } from './bpmnTypes';
import {
    type NodeType,
    type GraphNode,
    type GraphEdge,
    orderNodesByRankAndPosition,
} from './bpmnGraphModel';

// ─────────────────────────────────────────────────────────────
// RÉSULTAT
// ─────────────────────────────────────────────────────────────

export interface ParseResult {
    rows: Table1Row[];
    enrichments: Map<string, TaskEnrichment>;
    /** Ancien id de Table1Row (avant ce parse) → nouvel id, pour tout ce qui référence
     *  une ligne par son id ailleurs que dans `enrichments` (ex. highlightStepIds). */
    idMap: Map<string, string>;
    /** Éléments nouveaux (créés directement sur le canevas) — pas d'ancien id. */
    newRowIds: Set<string>;
    /** Cas limites rencontrés — à afficher à l'utilisateur avant d'appliquer le
     *  résultat (voir Prompt 3, "ne rien détruire silencieusement"). */
    warnings: string[];
}

// ─────────────────────────────────────────────────────────────
// CONVENTION D'ID — miroir de elementId()/toolId() dans bpmnGraphModel.ts
// ─────────────────────────────────────────────────────────────

const ID_PREFIXES: { prefix: string; type: NodeType }[] = [
    // Ordre sans ambiguïté : aucun de ces préfixes n'est le début d'un autre.
    { prefix: 'ParGateway_', type: 'ParallelGateway' },
    { prefix: 'IncGateway_', type: 'InclusiveGateway' },
    { prefix: 'Gateway_', type: 'ExclusiveGateway' },
    { prefix: 'Start_', type: 'StartEvent' },
    { prefix: 'End_', type: 'EndEvent' },
    { prefix: 'Task_', type: 'Task' },
];

/**
 * Retrouve l'id de ligne encodé dans un id d'élément bpmn-js, uniquement si cet id
 * correspond à une ligne déjà connue (`knownIds`). Un élément créé à la main sur le
 * canevas a un id généré par bpmn-js (ex. `Task_1a2b3c4d`) qui peut accidentellement
 * matcher un préfixe sans être une vraie ligne existante — d'où la vérification
 * contre `knownIds` plutôt qu'un simple découpage de chaîne.
 */
function matchExistingRowId(elementId: string, knownIds: Set<string>): string | null {
    for (const { prefix } of ID_PREFIXES) {
        if (elementId.startsWith(prefix)) {
            const candidate = elementId.slice(prefix.length);
            if (knownIds.has(candidate)) return candidate;
            return null;
        }
    }
    return null;
}

function mapElementTypeToNodeType(el: any): NodeType | null {
    if (is(el, 'bpmn:StartEvent')) return 'StartEvent';
    if (is(el, 'bpmn:EndEvent')) return 'EndEvent';
    if (is(el, 'bpmn:ExclusiveGateway')) return 'ExclusiveGateway';
    if (is(el, 'bpmn:ParallelGateway')) return 'ParallelGateway';
    if (is(el, 'bpmn:InclusiveGateway')) return 'InclusiveGateway';
    // bpmn:Task et bpmn:UserTask sont tous deux réinjectés comme 'Task' — c'est ce que
    // generateBPMNSimple produit pour une ligne typeBpmn:'Task' (toujours <userTask>),
    // donc le round-trip doit converger vers la même valeur, pas vers 'UserTask'
    // (que le générateur ne sait de toute façon pas gérer — Table1Row.typeBpmn
    // l'autorise mais elementId() n'a pas d'entrée pour ce cas).
    if (is(el, 'bpmn:Task') || is(el, 'bpmn:UserTask')) return 'Task';
    return null;
}

function isToolElement(el: any): boolean {
    return is(el, 'bpmn:ServiceTask') && typeof el.id === 'string' && el.id.startsWith('Tool_');
}

function isLinkAssociation(el: any): boolean {
    return is(el, 'bpmn:Association') && el.businessObject?.name === 'link';
}

// ─────────────────────────────────────────────────────────────
// PARSEUR PRINCIPAL
// ─────────────────────────────────────────────────────────────

export function parseWorkflowFromModeler(
    modeler: any,
    currentRows: Table1Row[],
    currentEnrichments: Map<string, TaskEnrichment>,
): ParseResult {
    const warnings: string[] = [];
    const elementRegistry = modeler.get('elementRegistry');

    // Exclut les éléments "label" — bpmn-js crée un élément de diagramme séparé pour le
    // label externe d'un StartEvent/EndEvent/Gateway (name affiché sous la forme plutôt
    // que dedans), avec le même businessObject que l'élément réel. Sans ce filtre,
    // is(el, 'bpmn:StartEvent') etc. matche AUSSI le label, qui a un id différent (non
    // reconnu par matchExistingRowId) → chaque Start/Gateway/End se retrouvait compté
    // deux fois. Vérifié dans un vrai bpmn-js (elementRegistry expose `labelTarget` sur
    // le label, jamais sur l'élément réel) — pas une déduction, un fait constaté.
    const all: any[] = elementRegistry.getAll().filter((el: any) => !el.labelTarget);

    const oldRowById = new Map(currentRows.map(r => [r.id, r]));
    const knownIds = new Set(currentRows.map(r => r.id));

    // ── 1. Lanes : acteur + typeActeur ──────────────────────────
    // Le mécanisme correct est `lane.businessObject.flowNodeRef` (la liste, tenue à
    // jour par bpmn-js lui-même, des éléments qui appartiennent à la lane) — PAS
    // `element.parent`, qui vaut toujours le pool (Participant), jamais la lane.
    // Vérifié dans un vrai bpmn-js : parent d'un flow node = Participant_1 pour tous
    // les éléments sans exception, alors que flowNodeRef contient la bonne affectation
    // (y compris pour un élément ajouté après coup sur le canevas — bpmn-js le range
    // lui-même dans le flowNodeRef de la lane où il est déposé).
    const laneByElementId = new Map<string, { acteur: string; typeActeur: 'interne' | 'externe' | '' }>();
    for (const el of all) {
        if (!is(el, 'bpmn:Lane')) continue;
        const acteur = el.businessObject?.name || 'Sans acteur';
        const typeActeur: 'interne' | 'externe' = el.id.startsWith('Lane_ext_') ? 'externe' : 'interne';
        const refs: any[] = el.businessObject?.flowNodeRef || [];
        for (const ref of refs) {
            if (ref?.id) laneByElementId.set(ref.id, { acteur, typeActeur });
        }
    }

    function laneOf(el: any): { acteur: string; typeActeur: 'interne' | 'externe' | '' } {
        const info = laneByElementId.get(el.id);
        if (info) return info;
        warnings.push(`« ${el.businessObject?.name || el.id} » n'est dans aucune lane reconnue — rattachée à "Sans acteur".`);
        return { acteur: 'Sans acteur', typeActeur: '' };
    }

    // ── 2. Associations outil → Map<taskElementId, string[]> ────
    const toolsByTask = new Map<string, string[]>();
    for (const el of all) {
        if (!isLinkAssociation(el)) continue;
        const src = el.source;
        const tgt = el.target;
        if (!src || !tgt) continue;
        const toolEl = isToolElement(src) ? src : isToolElement(tgt) ? tgt : null;
        const taskEl = toolEl === src ? tgt : src;
        if (!toolEl) continue;
        const toolName = (toolEl.businessObject?.name || '').trim();
        if (!toolName) continue;
        const list = toolsByTask.get(taskEl.id) ?? [];
        list.push(toolName);
        toolsByTask.set(taskEl.id, list);
    }

    // ── 3. Nœuds de flux (tâches/événements/gateways, hors Tool_) ─
    interface RawNode { elId: string; type: NodeType; oldRowId: string | null; el: any; }
    const rawNodes: RawNode[] = [];
    for (const el of all) {
        if (isToolElement(el)) continue;
        const type = mapElementTypeToNodeType(el);
        if (!type) continue; // pool, lane, association, flow… pas un nœud de flux
        rawNodes.push({ elId: el.id, type, oldRowId: matchExistingRowId(el.id, knownIds), el });
    }

    if (rawNodes.length === 0) {
        warnings.push('Aucune étape trouvée dans le diagramme — le tableau ne peut pas être reconstruit.');
        return { rows: [], enrichments: new Map(), idMap: new Map(), newRowIds: new Set(), warnings };
    }

    // ── 4. Arêtes (sequenceFlow) ──────────────────────────────────
    const graphEdges: GraphEdge[] = [];
    const outputsByElId = new Map<string, { targetId: string; label: string }[]>();
    for (const el of all) {
        if (!is(el, 'bpmn:SequenceFlow')) continue;
        const src = el.source;
        const tgt = el.target;
        if (!src || !tgt) continue;
        const label = el.businessObject?.name || '';
        graphEdges.push({ src: src.id, tgt: tgt.id, label });
        const list = outputsByElId.get(src.id) ?? [];
        list.push({ targetId: tgt.id, label });
        outputsByElId.set(src.id, list);
    }

    // ── 5. Ordre linéaire stable (rang + position X en départage) ─
    const graphNodes: GraphNode[] = rawNodes.map(n => ({
        id: n.elId,
        type: n.type,
        acteur: laneOf(n.el).acteur,
    }));
    const xOf = (elId: string) => {
        const el = elementRegistry.get(elId);
        return typeof el?.x === 'number' ? el.x : undefined;
    };
    const { order } = orderNodesByRankAndPosition(graphNodes, graphEdges, { xOf });

    const disconnected = rawNodes.filter(n =>
        n.type !== 'StartEvent' &&
        (outputsByElId.get(n.elId)?.length ?? 0) === 0 &&
        !graphEdges.some(e => e.tgt === n.elId),
    );
    if (disconnected.length > 0) {
        warnings.push(
            `${disconnected.length} élément(s) sans connexion entrante ni sortante ont été ajoutés en fin de tableau : ` +
            disconnected.map(n => n.el.businessObject?.name || n.elId).join(', '),
        );
    }

    // ── 6. Renumérotation séquentielle + idMap (même principe que
    //      renumberRows dans ProcessTable.tsx) ─────────────────────
    const byElId = new Map(rawNodes.map(n => [n.elId, n]));
    const idMap = new Map<string, string>(); // ancien Table1Row.id → nouveau
    const newRowIds = new Set<string>();
    const elIdToNewId = new Map<string, string>();

    order.forEach((elId, i) => {
        const newId = String(i + 1);
        elIdToNewId.set(elId, newId);
        const node = byElId.get(elId)!;
        if (node.oldRowId) idMap.set(node.oldRowId, newId);
        else newRowIds.add(newId);
    });

    // ── 7. Construction des lignes ─────────────────────────────────
    const rows: Table1Row[] = order.map(elId => {
        const node = byElId.get(elId)!;
        const newId = elIdToNewId.get(elId)!;
        const oldRow = node.oldRowId ? oldRowById.get(node.oldRowId) : undefined;
        const lane = laneOf(node.el);
        const rawName = (node.el.businessObject?.name || '').trim();

        const outputs = (outputsByElId.get(elId) ?? []).map(o => ({
            targetId: elIdToNewId.get(o.targetId) ?? o.targetId,
            label: o.label,
        }));

        const tools = toolsByTask.get(elId) ?? [];
        if (tools.length > 1) {
            warnings.push(
                `« ${rawName || newId} » est liée à plusieurs outils (${tools.join(', ')}) — ` +
                `seul le premier a été gardé, le champ outil du tableau reste unique pour le moment.`,
            );
        }
        // Limite connue, assumée : si un outil existait déjà sur cette ligne et
        // qu'aucune association Tool_ n'est trouvée sur le canevas (lien supprimé à la
        // main, ou étape pas encore reliée dans ce rendu), on conserve l'ancienne
        // valeur plutôt que de la vider. Corollaire : supprimer un lien outil
        // uniquement sur le canevas ne se répercute pas sur le tableau — il faut passer
        // par le tableau pour le vider. Choix délibéré (priorité à "ne rien détruire"
        // sur "refléter chaque édition du canevas"), pas un oubli — à revoir si ça
        // s'avère gênant en usage réel.
        const outil = tools[0] ?? oldRow?.outil ?? '';

        // Gateway : le générateur écrit condition (ou à défaut étape) dans le `name`
        // XML — étape n'est donc pas récupérable séparément pour un gateway déjà
        // existant, on la préserve depuis l'ancienne ligne plutôt que de la perdre.
        const isGatewayType = node.type === 'ExclusiveGateway' || node.type === 'ParallelGateway' || node.type === 'InclusiveGateway';
        const étape = isGatewayType ? (oldRow?.étape ?? rawName) : rawName;
        const condition = isGatewayType ? rawName : (oldRow?.condition ?? '');

        return {
            id: newId,
            étape,
            typeBpmn: node.type,
            // département n'est encodé nulle part dans le diagramme (les lanes ne
            // portent que l'acteur) — préservé depuis l'ancienne ligne quand connue,
            // vide sinon plutôt que deviné.
            département: oldRow?.département ?? '',
            acteur: lane.acteur,
            typeActeur: lane.typeActeur,
            condition,
            outputs,
            outil,
        };
    });

    // ── 8. Enrichments remappés (même logique que ProcessTable.tsx
    //      handleDrop/handleDeleteRow) ───────────────────────────
    const enrichments = new Map<string, TaskEnrichment>();
    idMap.forEach((newId, oldId) => {
        const enr = currentEnrichments.get(oldId);
        if (enr) enrichments.set(newId, { ...enr, id_tache: newId });
    });

    return { rows, enrichments, idMap, newRowIds, warnings };
}

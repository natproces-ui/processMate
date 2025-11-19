// src/logic/normalizeTable.ts
import { ProcessRow } from "@/components/ProcessTable";

export interface ProcessNode {
    id: string;
    service: string;
    task: string;
    type: "task" | "gateway" | "startEvent" | "endEvent";
    condition?: string | null;
    next?: string | null;
    yes?: string | null;
    no?: string | null;
}

export interface ProcessStructure {
    start: string;
    elements: ProcessNode[];
    end: string[];
}

/**
 * Normalise le tableau en structure BPMN-like
 */
export function normalizeTable(data: ProcessRow[]): ProcessStructure {
    if (!data || data.length === 0) {
        throw new Error("Aucune donnée à normaliser.");
    }

    // Étape 1 : Valider et nettoyer les lignes
    const validRows = data.filter(row =>
        row.step?.trim() &&
        row.service?.trim() &&
        row.task?.trim() &&
        row.type
    );

    if (validRows.length === 0) {
        throw new Error("Aucune ligne valide trouvée.");
    }

    if (validRows.length !== data.length) {
        console.warn(`${data.length - validRows.length} ligne(s) invalide(s) ignorée(s)`);
    }

    // Étape 2 : Créer les nœuds
    const elements: ProcessNode[] = validRows.map((row) => {
        const id = row.step.trim();
        const service = row.service.trim();
        const task = row.task.trim();

        if (row.type === "Conditionnelle") {
            return {
                id,
                service,
                task,
                type: "gateway" as const,
                condition: row.condition?.trim() || null,
                yes: row.yes?.trim() || null,
                no: row.no?.trim() || null,
            };
        }

        // Séquentielle → next = yes
        return {
            id,
            service,
            task,
            type: "task" as const,
            next: row.yes?.trim() || null,
        };
    });

    const elementIds = new Set(elements.map(e => e.id));

    // Étape 3 : Nettoyer les références invalides
    elements.forEach(el => {
        if (el.next && !elementIds.has(el.next)) {
            console.warn(`Référence invalide (next): ${el.id} → ${el.next}`);
            el.next = null;
        }
        if (el.yes && !elementIds.has(el.yes)) {
            console.warn(`Référence invalide (yes): ${el.id} → ${el.yes}`);
            el.yes = null;
        }
        if (el.no && !elementIds.has(el.no)) {
            console.warn(`Référence invalide (no): ${el.id} → ${el.no}`);
            el.no = null;
        }
    });

    // Étape 4 : Trouver le point de départ
    const allTargets = new Set(
        elements.flatMap(e => [e.next, e.yes, e.no].filter(Boolean) as string[])
    );
    const startId = elements.find(e => !allTargets.has(e.id))?.id || elements[0].id;

    // Étape 5 : Ajouter StartEvent
    const startEvent: ProcessNode = {
        id: "StartEvent_1",
        service: elements.find(e => e.id === startId)?.service || "Système",
        task: "Début du processus",
        type: "startEvent",
        next: startId,
    };
    elements.unshift(startEvent);

    // Mettre à jour l'ensemble des IDs
    elementIds.add(startEvent.id);

    // Étape 6 : Trouver les fins (avant EndEvent)
    const endCandidates = elements.filter(e =>
        e.id !== startEvent.id &&
        !e.next && !e.yes && !e.no
    );

    // Étape 7 : Ajouter EndEvent
    const endEvent: ProcessNode = {
        id: "EndEvent_1",
        service: "Système",
        task: "Fin du processus",
        type: "endEvent",
    };
    elements.push(endEvent);

    // Étape 8 : Connecter les fins → EndEvent_1
    endCandidates.forEach(node => {
        if (node.type === "task") {
            node.next = endEvent.id;
        } else if (node.type === "gateway") {
            if (!node.yes) node.yes = endEvent.id;
            if (!node.no) node.no = endEvent.id;
        }
    });

    return {
        start: startEvent.id,
        elements,
        end: [endEvent.id],
    };
}
// logic/processRules.ts
export interface ProcessElement {
    id: string;
    service: string;
    step: string;
    task: string;
    type: "Séquentielle" | "Conditionnelle";
    condition?: string;
    yes?: string;
    no?: string;
}

// Fonction placeholder pour les règles de validation (à implémenter si nécessaire)
export function validateProcessElement(element: ProcessElement): boolean {
    // Exemple de validation : vérifier que l'ID n'est pas vide
    if (!element.id || !element.service || !element.step || !element.task) {
        return false;
    }
    if (element.type === "Conditionnelle" && !element.condition) {
        return false;
    }
    return true;
}
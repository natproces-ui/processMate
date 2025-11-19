// logic/bpmnSync.ts
import { ProcessElement } from './processRules';

export function syncTableToBPMN(elements: ProcessElement[]): ProcessElement[] {
    return elements;
}

export function syncBPMNToTable(xml: string): ProcessElement[] {
    return [];
}
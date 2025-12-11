// bpmnUtils.ts - Fonctions utilitaires partagées

import { BPMN_ELEMENT_PREFIXES, BPMN_TYPES } from './bpmnConstants';
import type { Table1Row } from './bpmnLayoutEngine';

/**
 * Génère un ID de lane à partir du nom d'acteur
 */
export function getLaneId(acteur: string): string {
    return `${BPMN_ELEMENT_PREFIXES.LANE}${acteur.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`;
}

/**
 * Échappe les caractères XML spéciaux
 */
export function escapeXml(text: string): string {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Génère l'ID d'un élément BPMN selon son type
 */
export function getElementId(row: Table1Row): string {
    switch (row.typeBpmn) {
        case BPMN_TYPES.START_EVENT:
            return `${BPMN_ELEMENT_PREFIXES.START}${row.id}`;
        case BPMN_TYPES.END_EVENT:
            return `${BPMN_ELEMENT_PREFIXES.END}${row.id}`;
        case BPMN_TYPES.EXCLUSIVE_GATEWAY:
            return `${BPMN_ELEMENT_PREFIXES.GATEWAY}${row.id}`;
        default:
            return `${BPMN_ELEMENT_PREFIXES.TASK}${row.id}`;
    }
}

/**
 * Récupère l'ID d'élément depuis un identifiant simple
 */
export function getElementIdFromString(id: string, idMap: Map<string, Table1Row>): string {
    const row = idMap.get(id);
    if (!row) return `${BPMN_ELEMENT_PREFIXES.TASK}${id}`;
    return getElementId(row);
}

/**
 * Formate le nom d'une lane pour affichage multi-lignes
 */
export function formatLaneNameForDisplay(name: string, maxCharsPerLine: number = 25): string {
    if (name.length <= maxCharsPerLine) return name;

    const words = name.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach(word => {
        if ((currentLine + ' ' + word).trim().length > maxCharsPerLine) {
            if (currentLine) {
                lines.push(currentLine.trim());
                currentLine = word;
            } else {
                lines.push(word);
                currentLine = '';
            }
        } else {
            currentLine += (currentLine ? ' ' : '') + word;
        }
    });

    if (currentLine) {
        lines.push(currentLine.trim());
    }

    return lines.join('\n');
}

/**
 * Calcule la position centrale d'un événement ou gateway
 */
export interface ElementDimensions {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function getCenterPosition(
    pos: { x: number; y: number },
    containerWidth: number,
    elementSize: number
): { x: number; y: number } {
    return {
        x: pos.x + (containerWidth - elementSize) / 2,
        y: pos.y
    };
}

/**
 * Vérifie si un changement de lane est nécessaire
 */
export function isChangingLane(sourceX: number, targetX: number, laneWidth: number): boolean {
    return Math.abs(targetX - sourceX) > (laneWidth / 2);
}

/**
 * Vérifie si un flux est en arrière (backward)
 */
export function isBackwardFlow(sourceY: number, targetY: number): boolean {
    return targetY < sourceY;
}

/**
 * Calcule les waypoints pour un flux avec changement de lane
 */
export function calculateLaneChangeWaypoints(
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number
): Array<{ x: number; y: number }> {
    const midY = (sourceY + targetY) / 2;
    return [
        { x: sourceX, y: sourceY },
        { x: sourceX, y: midY },
        { x: targetX, y: midY },
        { x: targetX, y: targetY }
    ];
}

/**
 * Calcule les waypoints pour un flux backward
 */
export function calculateBackwardWaypoints(
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    offset: number = 80
): Array<{ x: number; y: number }> {
    const leftX = Math.min(sourceX, targetX) - offset;
    return [
        { x: sourceX, y: sourceY },
        { x: sourceX, y: sourceY + 30 },
        { x: leftX, y: sourceY + 30 },
        { x: leftX, y: targetY - 30 },
        { x: targetX, y: targetY - 30 },
        { x: targetX, y: targetY }
    ];
}
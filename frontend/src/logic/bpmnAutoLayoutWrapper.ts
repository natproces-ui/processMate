// logic/bpmnAutoLayoutWrapper.ts - WRAPPER AVEC bpmn-auto-layout

import { layoutProcess } from 'bpmn-auto-layout';
import { generateLogicBPMN } from './bpmnLogicGenerator';
import type { Table1Row } from './types';

export interface BPMNGenerationResult {
    xml: string;
    toolsInfo: Map<string, string>;
}

/**
 * 🎯 FONCTION PRINCIPALE - Génère un BPMN avec layout automatique
 * 
 * @param data - Tableau de données du processus
 * @returns XML BPMN avec layout + info des outils pour overlays
 */
export async function generateBPMNWithAutoLayout(
    data: Table1Row[]
): Promise<BPMNGenerationResult> {
    console.log('🚀 Génération BPMN avec auto-layout...');

    try {
        // 1️⃣ Générer le XML logique (sans positions DI)
        console.log('  → Génération XML logique...');
        const { xml: logicXML, toolsInfo } = generateLogicBPMN(data);

        // 2️⃣ Appliquer l'auto-layout
        console.log('  → Application auto-layout...');
        const xmlWithLayout = await layoutProcess(logicXML);

        console.log('✅ BPMN généré avec succès !');
        console.log(`   • ${data.length} étapes`);
        console.log(`   • ${toolsInfo.size} outils identifiés`);

        return {
            xml: xmlWithLayout,
            toolsInfo
        };
    } catch (error) {
        console.error('❌ Erreur génération BPMN:', error);
        throw error;
    }
}

/**
 * 🔄 FONCTION SYNCHRONE LEGACY (pour compatibilité)
 * Génère uniquement le XML logique sans layout
 */
export function generateBPMN(data: Table1Row[]): string {
    console.warn('⚠️ generateBPMN() est deprecated. Utilisez generateBPMNWithAutoLayout()');
    const { xml } = generateLogicBPMN(data);
    return xml;
}
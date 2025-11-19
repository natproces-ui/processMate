// hooks/useBPMNSync.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import { generateBPMN } from '@/logic/bpmnGenerator';

export interface TableRow {
    id: string;
    service: string;
    etape: string;
    tache: string;
    type: string;
    condition: string;
    siOui: string;
    siNon: string;
    actions: string;
}

interface ProcessRow {
    id: string;
    service: string;
    step: string;
    task: string;
    type: "Séquentielle" | "Conditionnelle";
    condition: string;
    yes: string;
    no: string;
}

export function useBPMNSync(initialRows: TableRow[]) {
    const [rows, setRows] = useState<TableRow[]>(initialRows);
    const [bpmnXml, setBpmnXml] = useState<string>('');
    const [bpmnError, setBpmnError] = useState<string>('');
    const [isSyncing, setIsSyncing] = useState(false);

    // Référence pour éviter les boucles infinies
    const isUpdatingFromBPMN = useRef(false);

    // Synchronisation automatique avec initialRows
    useEffect(() => {
        if (initialRows.length > 0) {
            setRows(initialRows);
        }
    }, [initialRows]);

    /**
     * Convertir TableRow[] en ProcessRow[] pour le générateur BPMN
     */
    const tableToBPMN = useCallback((tableRows: TableRow[]): ProcessRow[] => {
        return tableRows
            .filter(row => row.type !== 'Début/Fin')
            .map(row => ({
                id: row.id,
                service: row.service || 'Service par défaut',
                step: row.etape,
                task: row.tache,
                type: (row.type === 'Conditionnelle' ? 'Conditionnelle' : 'Séquentielle') as "Séquentielle" | "Conditionnelle",
                condition: row.condition || '',
                yes: row.siOui || '',
                no: row.siNon || ''
            }));
    }, []);

    /**
     * Générer le BPMN à partir du tableau
     */
    const generateBPMNFromTable = useCallback(() => {
        if (isUpdatingFromBPMN.current) return;

        try {
            setBpmnError('');
            setIsSyncing(true);

            const processRows = tableToBPMN(rows);

            if (processRows.length === 0) {
                throw new Error('Aucune donnée valide pour générer le BPMN');
            }

            const xml = generateBPMN(processRows);
            setBpmnXml(xml);
        } catch (error: any) {
            console.error('Erreur génération BPMN:', error);
            setBpmnError(error.message || 'Erreur lors de la génération du BPMN');
        } finally {
            setIsSyncing(false);
        }
    }, [rows, tableToBPMN]);

    /**
     * Mettre à jour une cellule du tableau
     */
    const updateCell = useCallback((rowIndex: number, field: keyof TableRow, value: string) => {
        setRows(prevRows => {
            const newRows = [...prevRows];
            newRows[rowIndex][field] = value;
            return newRows;
        });
    }, []);

    /**
     * Ajouter une nouvelle ligne au tableau
     */
    const addRow = useCallback(() => {
        setRows(prevRows => {
            const newIndex = prevRows.length + 1;
            const newRow: TableRow = {
                id: `1.${newIndex}`,
                service: '',
                etape: `1.${newIndex}`,
                tache: `Nouvelle tâche ${newIndex}`,
                type: 'Séquentielle',
                condition: '',
                siOui: '',
                siNon: '',
                actions: ''
            };
            return [...prevRows, newRow];
        });
    }, []);

    /**
     * Supprimer une ligne du tableau
     */
    const deleteRow = useCallback((rowIndex: number) => {
        setRows(prevRows => {
            const newRows = prevRows.filter((_, idx) => idx !== rowIndex);

            // Renuméroter les étapes
            return newRows.map((row, idx) => ({
                ...row,
                id: `1.${idx + 1}`,
                etape: `1.${idx + 1}`
            }));
        });
    }, []);

    /**
     * Mettre à jour le tableau depuis le BPMN
     * Appelé quand l'utilisateur modifie le diagramme BPMN
     */
    const updateTableFromBPMN = useCallback((updatedTasks: Map<string, string>) => {
        isUpdatingFromBPMN.current = true;

        setRows(prevRows => {
            const newRows = prevRows.map(row => {
                const taskId = `Task_${row.etape.replace(/\./g, '_')}`;
                const updatedTaskName = updatedTasks.get(taskId);

                if (updatedTaskName && updatedTaskName !== row.tache) {
                    return { ...row, tache: updatedTaskName };
                }
                return row;
            });
            return newRows;
        });

        // Réinitialiser le flag après un court délai
        setTimeout(() => {
            isUpdatingFromBPMN.current = false;
        }, 100);
    }, []);

    /**
     * Réorganiser les lignes (pour drag & drop futur)
     */
    const reorderRows = useCallback((startIndex: number, endIndex: number) => {
        setRows(prevRows => {
            const result = Array.from(prevRows);
            const [removed] = result.splice(startIndex, 1);
            result.splice(endIndex, 0, removed);

            // Renuméroter les étapes
            return result.map((row, idx) => ({
                ...row,
                id: `1.${idx + 1}`,
                etape: `1.${idx + 1}`
            }));
        });
    }, []);

    return {
        rows,
        bpmnXml,
        bpmnError,
        isSyncing,
        updateCell,
        addRow,
        deleteRow,
        reorderRows,
        generateBPMNFromTable,
        updateTableFromBPMN,
        setRows
    };
}
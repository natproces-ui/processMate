'use client';

import React, { useState, useEffect } from 'react';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { generateBPMN } from '@/logic/bpmnGenerator';
import BPMNViewer from '@/components/BPMNViewer';
import { processDotToTable, TableRow } from '@/logic/dotTableProcessor';
import { enrichTable, mergeAIEnrichments } from '@/logic/dotAIMerger';
import TableHeader from './TableHeader';
import TableGrid from './TableGrid';

interface EditingCell {
    rowId: string;
    field: keyof TableRow;
}

interface TableComponentProps {
    dotSource: string;
}

export default function TableComponent({ dotSource }: TableComponentProps) {
    const [rows, setRows] = useState<TableRow[]>([]);
    const [filteredRows, setFilteredRows] = useState<TableRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<string>('all');
    const [sortConfig, setSortConfig] = useState<{ key: keyof TableRow; direction: 'asc' | 'desc' } | null>(null);
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

    const [showBPMN, setShowBPMN] = useState(false);
    const [bpmnXml, setBpmnXml] = useState<string>('');
    const [bpmnError, setBpmnError] = useState<string>('');
    const [generatingBPMN, setGeneratingBPMN] = useState(false);

    const [processingWarnings, setProcessingWarnings] = useState<string[]>([]);
    const [showWarnings, setShowWarnings] = useState(false);
    const [enrichingWithAI, setEnrichingWithAI] = useState(false);
    const [aiEnrichmentStatus, setAiEnrichmentStatus] = useState<string>('');

    // Chargement initial des données
    useEffect(() => {
        if (!dotSource) {
            setLoading(false);
            return;
        }

        const processData = async () => {
            try {
                const result = processDotToTable(dotSource);
                setProcessingWarnings(result.warnings);

                if (!result.success) {
                    console.error('❌ Erreurs:', result.errors);
                    setRows([]);
                    setFilteredRows([]);
                } else {
                    if (result.warnings.length > 0) {
                        console.warn('⚠️ Avertissements:', result.warnings);
                    }
                    console.log(`✅ ${result.rows.length} lignes créées`);
                    setRows(result.rows);
                    setFilteredRows(result.rows);
                }
            } catch (err) {
                console.error('💥 Erreur:', err);
                setRows([]);
                setFilteredRows([]);
            } finally {
                setLoading(false);
            }
        };

        processData();
    }, [dotSource]);

    // Filtrage et tri
    useEffect(() => {
        let filtered = [...rows];

        if (searchTerm) {
            filtered = filtered.filter(row =>
                Object.values(row).some(val =>
                    val.toString().toLowerCase().includes(searchTerm.toLowerCase())
                )
            );
        }

        if (filterType !== 'all') {
            filtered = filtered.filter(row => row.typeBpmn === filterType);
        }

        if (sortConfig) {
            filtered.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        setFilteredRows(filtered);
    }, [searchTerm, filterType, sortConfig, rows]);

    // Handlers
    const handleCellChange = (index: number, field: keyof TableRow, value: string) => {
        const newRows = [...rows];
        const originalIndex = rows.findIndex(r => r.id === filteredRows[index].id);

        if (field === 'typeBpmn') {
            newRows[originalIndex][field] = value as TableRow['typeBpmn'];
            if (value !== 'ExclusiveGateway') {
                newRows[originalIndex].condition = '';
                newRows[originalIndex].outputNon = '';
            }
        } else {
            newRows[originalIndex][field] = value as any;
        }

        setRows(newRows);
    };

    const handleCellDoubleClick = (rowId: string, field: keyof TableRow) => {
        setEditingCell({ rowId, field });
    };

    const handleCellBlur = () => {
        setEditingCell(null);
    };

    const handleCellKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
            setEditingCell(null);
        }
    };

    const isEditing = (rowId: string, field: keyof TableRow) => {
        return editingCell?.rowId === rowId && editingCell?.field === field;
    };

    const handleSort = (key: keyof TableRow) => {
        setSortConfig(prev => ({
            key,
            direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleAddRow = () => {
        const newRow: TableRow = {
            id: String(rows.length + 1),
            étape: '',
            typeBpmn: 'Task',
            département: '',
            acteur: '',
            condition: '',
            outputOui: '',
            outputNon: '',
            outil: '',
            actions: ''
        };
        setRows([...rows, newRow]);
    };

    const handleEnrichWithAI = async () => {
        if (rows.length === 0) {
            setAiEnrichmentStatus('⚠️ Aucune donnée à enrichir');
            setTimeout(() => setAiEnrichmentStatus(''), 3000);
            return;
        }

        try {
            setEnrichingWithAI(true);
            setAiEnrichmentStatus('🤖 Enrichissement IA en cours...');

            const aiResponse = await enrichTable(rows);

            if (aiResponse.success && aiResponse.enrichments) {
                const enrichedRows = mergeAIEnrichments(rows, aiResponse.enrichments);
                setRows(enrichedRows);
                setFilteredRows(enrichedRows);
                setAiEnrichmentStatus(`✅ ${aiResponse.enrichments.length} lignes enrichies par IA`);
                setTimeout(() => setAiEnrichmentStatus(''), 5000);
            } else {
                setAiEnrichmentStatus('⚠️ Enrichissement IA échoué');
                setTimeout(() => setAiEnrichmentStatus(''), 5000);
            }
        } catch (aiError: any) {
            console.error('Erreur enrichissement IA:', aiError);
            setAiEnrichmentStatus(`❌ Erreur: ${aiError.message || 'Enrichissement impossible'}`);
            setTimeout(() => setAiEnrichmentStatus(''), 5000);
        } finally {
            setEnrichingWithAI(false);
        }
    };

    const handleDeleteRow = (rowId: string) => {
        const newRows = rows.filter(r => r.id !== rowId);
        newRows.forEach((row, idx) => {
            row.id = String(idx + 1);
        });
        setRows(newRows);
    };

    const exportToExcel = () => {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Processus');
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
        saveAs(blob, 'processus_metier.xlsx');
    };

    const handleGenerateBPMN = () => {
        setBpmnError('');
        setGeneratingBPMN(true);

        try {
            if (rows.length === 0) {
                throw new Error('Aucune donnée valide pour générer le BPMN');
            }

            const xml = generateBPMN(rows);
            setBpmnXml(xml);
            setShowBPMN(true);
        } catch (error: any) {
            console.error('Erreur génération BPMN:', error);
            setBpmnError(error.message || 'Erreur lors de la génération du BPMN');
        } finally {
            setGeneratingBPMN(false);
        }
    };

    const downloadBPMN = () => {
        if (!bpmnXml) return;
        const blob = new Blob([bpmnXml], { type: 'application/xml' });
        saveAs(blob, 'process.bpmn');
    };

    const uniqueTypes = ['all', ...Array.from(new Set(rows.map(r => r.typeBpmn)))];

    if (loading || enrichingWithAI) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '1rem' }}>
                <div style={{ width: '3rem', height: '3rem', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                {enrichingWithAI && (
                    <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>🤖 Enrichissement par IA en cours...</div>
                )}
            </div>
        );
    }

    if (rows.length === 0 && !dotSource) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <div style={{ color: '#6b7280', fontSize: '1.125rem' }}>Aucune donnée</div>
                <p style={{ color: '#9ca3af', marginTop: '0.5rem' }}>Importez un fichier DOT pour commencer</p>
            </div>
        );
    }

    return (
        <div style={{ all: 'initial', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '1.5rem', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>

            <TableHeader
                rowCount={rows.length}
                processingWarnings={processingWarnings}
                showWarnings={showWarnings}
                setShowWarnings={setShowWarnings}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                filterType={filterType}
                setFilterType={setFilterType}
                uniqueTypes={uniqueTypes}
                filteredRowsCount={filteredRows.length}
                aiEnrichmentStatus={aiEnrichmentStatus}
                bpmnError={bpmnError}
                enrichingWithAI={enrichingWithAI}
                generatingBPMN={generatingBPMN}
                onAddRow={handleAddRow}
                onEnrichWithAI={handleEnrichWithAI}
                onGenerateBPMN={handleGenerateBPMN}
                onExportToExcel={exportToExcel}
            />

            {showBPMN && bpmnXml && (
                <div style={{ marginBottom: '1.5rem' }}>
                    <BPMNViewer
                        xml={bpmnXml}
                        height="700px"
                        onClose={() => setShowBPMN(false)}
                        onError={(err: string) => setBpmnError(err)}
                    />
                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                        <button
                            onClick={downloadBPMN}
                            style={{
                                padding: '0.75rem 1.5rem',
                                backgroundColor: '#2563eb',
                                color: 'white',
                                borderRadius: '0.5rem',
                                border: 'none',
                                fontWeight: '500',
                                cursor: 'pointer'
                            }}
                        >
                            💾 Télécharger BPMN
                        </button>
                    </div>
                </div>
            )}

            <TableGrid
                rows={filteredRows}
                allRows={rows}
                sortConfig={sortConfig}
                onSort={handleSort}
                onCellChange={handleCellChange}
                onCellDoubleClick={handleCellDoubleClick}
                onCellBlur={handleCellBlur}
                onCellKeyDown={handleCellKeyDown}
                isEditing={isEditing}
                onDeleteRow={handleDeleteRow}
            />
        </div>
    );
}
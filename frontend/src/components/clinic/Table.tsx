'use client';

import React, { useState, useEffect } from 'react';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { Download, Search, Filter, ChevronDown, ChevronUp, Network, AlertTriangle, Plus, Trash2, Sparkles } from 'lucide-react';
import { generateBPMN } from '@/logic/bpmnGenerator';
import BPMNViewer from '@/components/BPMNViewer';
import { processDotToTable, TableRow } from '@/logic/dotTableProcessor';
import { enrichTable, mergeAIEnrichments } from '@/logic/dotAIMerger';

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

    useEffect(() => {
        if (!dotSource) {
            setLoading(false);
            return;
        }

        const processWithAI = async () => {
            try {
                console.log('📤 Envoi à l\'API pour parsing et enrichissement automatique...');
                const result = await processDotToTable(dotSource);

                // Gestion des warnings
                setProcessingWarnings(result.warnings || []);

                if (!result.success) {
                    const errorMessages = result.errors || ['Erreur inconnue'];
                    console.error('❌ Erreurs:', errorMessages);
                    setRows([]);
                    setFilteredRows([]);
                } else {
                    if (result.warnings && result.warnings.length > 0) {
                        console.warn('⚠️ Avertissements:', result.warnings);
                    }
                    console.log(`✅ ${result.rows.length} lignes enrichies automatiquement par Gemini`);

                    // Données déjà enrichies par l'API
                    setRows(result.rows);
                    setFilteredRows(result.rows);
                }

            } catch (err) {
                console.error('💥 Erreur:', err);
                setProcessingWarnings([
                    `Erreur: ${err instanceof Error ? err.message : 'Erreur inconnue'}`
                ]);
                setRows([]);
                setFilteredRows([]);
            } finally {
                setLoading(false);
            }
        };

        processWithAI();
    }, [dotSource]);

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

    const handleCellChange = (index: number, field: keyof TableRow, value: string) => {
        const newRows = [...rows];
        const originalIndex = rows.findIndex(r => r.id === filteredRows[index].id);

        if (field === 'typeBpmn') {
            newRows[originalIndex][field] = value as TableRow['typeBpmn'];
            // Si ce n'est pas un gateway, vider condition et outputNon
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

    // ✅ NOUVELLE FONCTION : Enrichissement IA sur demande
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
        // Réindexer les IDs
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

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'ExclusiveGateway': return '#fef3c7 #92400e';
            case 'StartEvent': return '#d1fae5 #065f46';
            case 'EndEvent': return '#fee2e2 #991b1b';
            default: return '#dbeafe #1e40af'; // Task
        }
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

            {/* Header Card */}
            <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>Tableau métier - Processus BPMN</h3>
                            <p style={{ color: '#6b7280', marginTop: '0.25rem', margin: 0 }}>{rows.length} étapes détectées</p>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {processingWarnings.length > 0 && (
                                <button
                                    onClick={() => setShowWarnings(!showWarnings)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.75rem 1.5rem',
                                        backgroundColor: '#fef3c7',
                                        color: '#92400e',
                                        borderRadius: '0.5rem',
                                        border: 'none',
                                        fontWeight: '500',
                                        cursor: 'pointer',
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    <AlertTriangle size={18} />
                                    {processingWarnings.length} avertissement{processingWarnings.length > 1 ? 's' : ''}
                                </button>
                            )}

                            <button
                                onClick={handleAddRow}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.75rem 1.5rem',
                                    backgroundColor: '#10b981',
                                    color: 'white',
                                    borderRadius: '0.5rem',
                                    border: 'none',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem'
                                }}
                            >
                                <Plus size={18} />
                                Ajouter une ligne
                            </button>

                            {/* ✅ NOUVEAU BOUTON : Enrichir avec IA */}
                            <button
                                onClick={handleEnrichWithAI}
                                disabled={enrichingWithAI || rows.length === 0}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.75rem 1.5rem',
                                    backgroundColor: enrichingWithAI || rows.length === 0 ? '#9ca3af' : '#8b5cf6',
                                    color: 'white',
                                    borderRadius: '0.5rem',
                                    border: 'none',
                                    fontWeight: '500',
                                    cursor: enrichingWithAI || rows.length === 0 ? 'not-allowed' : 'pointer',
                                    fontSize: '0.875rem'
                                }}
                            >
                                <Sparkles size={18} />
                                {enrichingWithAI ? 'Enrichissement...' : '🤖 Enrichir avec IA'}
                            </button>

                            <button
                                onClick={handleGenerateBPMN}
                                disabled={generatingBPMN || rows.length === 0}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.75rem 1.5rem',
                                    backgroundColor: generatingBPMN || rows.length === 0 ? '#9ca3af' : '#7c3aed',
                                    color: 'white',
                                    borderRadius: '0.5rem',
                                    border: 'none',
                                    fontWeight: '500',
                                    cursor: generatingBPMN || rows.length === 0 ? 'not-allowed' : 'pointer',
                                    fontSize: '0.875rem'
                                }}
                            >
                                <Network size={18} />
                                {generatingBPMN ? 'Génération...' : 'Générer BPMN'}
                            </button>

                            <button
                                onClick={exportToExcel}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.75rem 1.5rem',
                                    backgroundColor: '#059669',
                                    color: 'white',
                                    borderRadius: '0.5rem',
                                    border: 'none',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem'
                                }}
                            >
                                <Download size={18} />
                                Exporter Excel
                            </button>
                        </div>
                    </div>

                    {/* Warnings Panel */}
                    {showWarnings && processingWarnings.length > 0 && (
                        <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '0.5rem', padding: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <AlertTriangle size={18} color="#f59e0b" />
                                <span style={{ fontWeight: '600', color: '#92400e' }}>Avertissements ({processingWarnings.length})</span>
                            </div>
                            {processingWarnings.map((warning, idx) => (
                                <div key={idx} style={{ fontSize: '0.875rem', color: '#78350f', marginLeft: '1.75rem', marginBottom: '0.25rem' }}>
                                    • {warning}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Search and Filter */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div style={{ position: 'relative' }}>
                            <Search style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} size={18} />
                            <input
                                type="text"
                                placeholder="Rechercher dans le tableau..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    paddingLeft: '2.5rem',
                                    paddingRight: '1rem',
                                    paddingTop: '0.5rem',
                                    paddingBottom: '0.5rem',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '0.5rem',
                                    fontSize: '0.875rem',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <div style={{ position: 'relative' }}>
                            <Filter style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} size={18} />
                            <select
                                value={filterType}
                                onChange={e => setFilterType(e.target.value)}
                                style={{
                                    width: '100%',
                                    paddingLeft: '2.5rem',
                                    paddingRight: '1rem',
                                    paddingTop: '0.5rem',
                                    paddingBottom: '0.5rem',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '0.5rem',
                                    fontSize: '0.875rem',
                                    backgroundColor: 'white',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    cursor: 'pointer'
                                }}
                            >
                                {uniqueTypes.map(type => (
                                    <option key={type} value={type}>
                                        {type === 'all' ? 'Tous les types' : type}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {(searchTerm || filterType !== 'all') && (
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            {filteredRows.length} résultat{filteredRows.length > 1 ? 's' : ''} trouvé{filteredRows.length > 1 ? 's' : ''}
                        </div>
                    )}

                    {aiEnrichmentStatus && (
                        <div style={{ padding: '1rem', backgroundColor: aiEnrichmentStatus.startsWith('✅') ? '#d1fae5' : aiEnrichmentStatus.startsWith('❌') ? '#fee2e2' : '#fef3c7', borderLeft: `4px solid ${aiEnrichmentStatus.startsWith('✅') ? '#059669' : aiEnrichmentStatus.startsWith('❌') ? '#ef4444' : '#f59e0b'}`, color: aiEnrichmentStatus.startsWith('✅') ? '#065f46' : aiEnrichmentStatus.startsWith('❌') ? '#991b1b' : '#92400e', borderRadius: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                            {aiEnrichmentStatus}
                        </div>
                    )}

                    {bpmnError && (
                        <div style={{ padding: '1rem', backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', color: '#991b1b', borderRadius: '0.25rem' }}>
                            <strong>⚠️ Erreur :</strong> {bpmnError}
                        </div>
                    )}
                </div>
            </div>

            {/* BPMN Viewer */}
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

            {/* Table */}
            <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                            <tr>
                                {[
                                    { key: 'id' as keyof TableRow, label: '#', sortable: true },
                                    { key: 'étape' as keyof TableRow, label: 'Étape', sortable: true },
                                    { key: 'typeBpmn' as keyof TableRow, label: 'Type BPMN', sortable: true },
                                    { key: 'département' as keyof TableRow, label: 'Département', sortable: true },
                                    { key: 'acteur' as keyof TableRow, label: 'Acteur', sortable: true },
                                    { key: 'condition' as keyof TableRow, label: 'Condition', sortable: true },
                                    { key: 'outputOui' as keyof TableRow, label: 'Output Oui', sortable: true },
                                    { key: 'outputNon' as keyof TableRow, label: 'Output Non', sortable: true },
                                    { key: 'outil' as keyof TableRow, label: 'Outil', sortable: true },
                                    { key: 'actions' as keyof TableRow, label: 'Actions', sortable: true },
                                    { key: null, label: '', sortable: false }
                                ].map(({ key, label, sortable }) => (
                                    <th
                                        key={key || 'delete'}
                                        onClick={() => sortable && key && handleSort(key)}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            textAlign: 'left',
                                            fontSize: '0.75rem',
                                            fontWeight: '600',
                                            color: '#374151',
                                            textTransform: 'uppercase',
                                            cursor: sortable ? 'pointer' : 'default',
                                            userSelect: 'none'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {label}
                                            {sortable && sortConfig?.key === key && (
                                                sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.map((row, idx) => (
                                <tr key={row.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <div style={{ fontSize: '0.875rem', fontFamily: 'monospace', fontWeight: '500' }}>
                                            {row.id}
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onDoubleClick={() => handleCellDoubleClick(row.id, 'étape')}>
                                        {isEditing(row.id, 'étape') ? (
                                            <input
                                                type="text"
                                                value={row.étape}
                                                onChange={e => handleCellChange(idx, 'étape', e.target.value)}
                                                onBlur={handleCellBlur}
                                                onKeyDown={handleCellKeyDown}
                                                placeholder="Description de l'étape"
                                                style={{ width: '100%', minWidth: '200px', padding: '0.5rem', fontSize: '0.875rem', border: '2px solid #3b82f6', borderRadius: '0.25rem' }}
                                                autoFocus
                                            />
                                        ) : (
                                            <div style={{ minWidth: '200px' }}>{row.étape || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Double-cliquez pour éditer</span>}</div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onDoubleClick={() => handleCellDoubleClick(row.id, 'typeBpmn')}>
                                        {isEditing(row.id, 'typeBpmn') ? (
                                            <select
                                                value={row.typeBpmn}
                                                onChange={e => handleCellChange(idx, 'typeBpmn', e.target.value)}
                                                onBlur={handleCellBlur}
                                                style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '2px solid #3b82f6', borderRadius: '0.25rem' }}
                                                autoFocus
                                            >
                                                <option value="StartEvent">Start Event</option>
                                                <option value="Task">Task</option>
                                                <option value="ExclusiveGateway">Gateway</option>
                                                <option value="EndEvent">End Event</option>
                                            </select>
                                        ) : (
                                            <span style={{
                                                display: 'inline-flex',
                                                padding: '0.25rem 0.5rem',
                                                fontSize: '0.75rem',
                                                fontWeight: '500',
                                                borderRadius: '9999px',
                                                backgroundColor: getTypeColor(row.typeBpmn).split(' ')[0],
                                                color: getTypeColor(row.typeBpmn).split(' ')[1]
                                            }}>
                                                {row.typeBpmn}
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onDoubleClick={() => handleCellDoubleClick(row.id, 'département')}>
                                        {isEditing(row.id, 'département') ? (
                                            <input
                                                type="text"
                                                value={row.département}
                                                onChange={e => handleCellChange(idx, 'département', e.target.value)}
                                                onBlur={handleCellBlur}
                                                onKeyDown={handleCellKeyDown}
                                                placeholder="Ex: Commercial"
                                                style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '2px solid #3b82f6', borderRadius: '0.25rem' }}
                                                autoFocus
                                            />
                                        ) : (
                                            <div>{row.département || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>À compléter...</span>}</div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onDoubleClick={() => handleCellDoubleClick(row.id, 'acteur')}>
                                        {isEditing(row.id, 'acteur') ? (
                                            <input
                                                type="text"
                                                value={row.acteur}
                                                onChange={e => handleCellChange(idx, 'acteur', e.target.value)}
                                                onBlur={handleCellBlur}
                                                onKeyDown={handleCellKeyDown}
                                                placeholder="Ex: Vente"
                                                style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '2px solid #3b82f6', borderRadius: '0.25rem' }}
                                                autoFocus
                                            />
                                        ) : (
                                            <div>{row.acteur || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>À compléter...</span>}</div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', cursor: row.typeBpmn === 'ExclusiveGateway' ? 'pointer' : 'default' }} onDoubleClick={() => row.typeBpmn === 'ExclusiveGateway' && handleCellDoubleClick(row.id, 'condition')}>
                                        {isEditing(row.id, 'condition') && row.typeBpmn === 'ExclusiveGateway' ? (
                                            <input
                                                type="text"
                                                value={row.condition}
                                                onChange={e => handleCellChange(idx, 'condition', e.target.value)}
                                                onBlur={handleCellBlur}
                                                onKeyDown={handleCellKeyDown}
                                                placeholder="Question ?"
                                                style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '2px solid #3b82f6', borderRadius: '0.25rem' }}
                                                autoFocus
                                            />
                                        ) : (
                                            <div style={{ fontSize: '0.875rem' }}>
                                                {row.condition || <span style={{ color: '#9ca3af' }}>—</span>}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onDoubleClick={() => handleCellDoubleClick(row.id, 'outputOui')}>
                                        {isEditing(row.id, 'outputOui') ? (
                                            <input
                                                type="text"
                                                value={row.outputOui}
                                                onChange={e => handleCellChange(idx, 'outputOui', e.target.value)}
                                                onBlur={handleCellBlur}
                                                onKeyDown={handleCellKeyDown}
                                                placeholder="ID suivant"
                                                style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '2px solid #3b82f6', borderRadius: '0.25rem' }}
                                                autoFocus
                                            />
                                        ) : (
                                            <div style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: '#2563eb' }}>
                                                {row.outputOui || <span style={{ color: '#9ca3af' }}>—</span>}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', cursor: row.typeBpmn === 'ExclusiveGateway' ? 'pointer' : 'default' }} onDoubleClick={() => row.typeBpmn === 'ExclusiveGateway' && handleCellDoubleClick(row.id, 'outputNon')}>
                                        {isEditing(row.id, 'outputNon') && row.typeBpmn === 'ExclusiveGateway' ? (
                                            <input
                                                type="text"
                                                value={row.outputNon}
                                                onChange={e => handleCellChange(idx, 'outputNon', e.target.value)}
                                                onBlur={handleCellBlur}
                                                onKeyDown={handleCellKeyDown}
                                                placeholder="ID alternatif"
                                                style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '2px solid #3b82f6', borderRadius: '0.25rem' }}
                                                autoFocus
                                            />
                                        ) : (
                                            <div style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: '#dc2626' }}>
                                                {row.outputNon || <span style={{ color: '#9ca3af' }}>—</span>}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onDoubleClick={() => handleCellDoubleClick(row.id, 'outil')}>
                                        {isEditing(row.id, 'outil') ? (
                                            <input
                                                type="text"
                                                value={row.outil}
                                                onChange={e => handleCellChange(idx, 'outil', e.target.value)}
                                                onBlur={handleCellBlur}
                                                onKeyDown={handleCellKeyDown}
                                                placeholder="Ex: CRM, SAP..."
                                                style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '2px solid #3b82f6', borderRadius: '0.25rem' }}
                                                autoFocus
                                            />
                                        ) : (
                                            <div>{row.outil || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>À compléter...</span>}</div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onDoubleClick={() => handleCellDoubleClick(row.id, 'actions')}>
                                        {isEditing(row.id, 'actions') ? (
                                            <input
                                                type="text"
                                                value={row.actions}
                                                onChange={e => handleCellChange(idx, 'actions', e.target.value)}
                                                onBlur={handleCellBlur}
                                                onKeyDown={handleCellKeyDown}
                                                placeholder="Actions à effectuer"
                                                style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '2px solid #3b82f6', borderRadius: '0.25rem' }}
                                                autoFocus
                                            />
                                        ) : (
                                            <div>{row.actions || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>À compléter...</span>}</div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                        <button
                                            onClick={() => handleDeleteRow(row.id)}
                                            style={{
                                                padding: '0.5rem',
                                                backgroundColor: 'transparent',
                                                border: 'none',
                                                color: '#ef4444',
                                                cursor: 'pointer',
                                                borderRadius: '0.25rem',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                            title="Supprimer cette ligne"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Footer stats */}
            <div style={{ marginTop: '1.5rem', backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', textAlign: 'center' }}>
                    {uniqueTypes.slice(1).map(type => {
                        const count = rows.filter(r => r.typeBpmn === type).length;
                        const colors = getTypeColor(type).split(' ');
                        return (
                            <div key={type} style={{ padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors[1] }}>{count}</div>
                                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>{type}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Instructions */}
            <div style={{ marginTop: '1.5rem', backgroundColor: '#eff6ff', border: '1px solid #3b82f6', borderRadius: '0.5rem', padding: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#1e40af', fontSize: '0.875rem', fontWeight: '600' }}>💡 Instructions d'utilisation</h4>
                <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.875rem', color: '#1e40af', lineHeight: '1.6' }}>
                    <li><strong>📋 Import automatique</strong> : Les colonnes Étape et Actions sont remplies automatiquement depuis le fichier .dot</li>
                    <li><strong>🤖 Enrichissement IA sur demande</strong> : Cliquez sur "Enrichir avec IA" pour remplir automatiquement Département, Acteur et Outil</li>
                    <li><strong>✏️ Édition manuelle</strong> : Double-cliquez sur une cellule pour l'éditer et corriger si nécessaire</li>
                    <li><strong>🔀 Type BPMN</strong> : StartEvent = Début, Task = Tâche, Gateway = Décision, EndEvent = Fin</li>
                    <li><strong>❓ Condition</strong> : Uniquement pour les Gateways (questions oui/non)</li>
                    <li><strong>🔗 Output Oui/Non</strong> : ID de l'étape suivante (utilisez les numéros de la colonne #)</li>
                </ul>
            </div>
        </div>
    );
}
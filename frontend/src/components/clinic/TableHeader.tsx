import React from 'react';
import { Download, Search, Filter, Plus, Sparkles, Network, AlertTriangle } from 'lucide-react';

interface TableHeaderProps {
    rowCount: number;
    processingWarnings: string[];
    showWarnings: boolean;
    setShowWarnings: (show: boolean) => void;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    filterType: string;
    setFilterType: (type: string) => void;
    uniqueTypes: string[];
    filteredRowsCount: number;
    aiEnrichmentStatus: string;
    bpmnError: string;
    enrichingWithAI: boolean;
    generatingBPMN: boolean;
    onAddRow: () => void;
    onEnrichWithAI: () => void;
    onGenerateBPMN: () => void;
    onExportToExcel: () => void;
}

export default function TableHeader({
    rowCount,
    processingWarnings,
    showWarnings,
    setShowWarnings,
    searchTerm,
    setSearchTerm,
    filterType,
    setFilterType,
    uniqueTypes,
    filteredRowsCount,
    aiEnrichmentStatus,
    bpmnError,
    enrichingWithAI,
    generatingBPMN,
    onAddRow,
    onEnrichWithAI,
    onGenerateBPMN,
    onExportToExcel
}: TableHeaderProps) {
    return (
        <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Title and Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>
                            Tableau métier - Processus BPMN
                        </h3>
                        <p style={{ color: '#6b7280', marginTop: '0.25rem', margin: 0 }}>
                            {rowCount} étapes détectées
                        </p>
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
                            onClick={onAddRow}
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

                        <button
                            onClick={onEnrichWithAI}
                            disabled={enrichingWithAI || rowCount === 0}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem 1.5rem',
                                backgroundColor: enrichingWithAI || rowCount === 0 ? '#9ca3af' : '#8b5cf6',
                                color: 'white',
                                borderRadius: '0.5rem',
                                border: 'none',
                                fontWeight: '500',
                                cursor: enrichingWithAI || rowCount === 0 ? 'not-allowed' : 'pointer',
                                fontSize: '0.875rem'
                            }}
                        >
                            <Sparkles size={18} />
                            {enrichingWithAI ? 'Enrichissement...' : '🤖 Enrichir avec IA'}
                        </button>

                        <button
                            onClick={onGenerateBPMN}
                            disabled={generatingBPMN || rowCount === 0}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem 1.5rem',
                                backgroundColor: generatingBPMN || rowCount === 0 ? '#9ca3af' : '#7c3aed',
                                color: 'white',
                                borderRadius: '0.5rem',
                                border: 'none',
                                fontWeight: '500',
                                cursor: generatingBPMN || rowCount === 0 ? 'not-allowed' : 'pointer',
                                fontSize: '0.875rem'
                            }}
                        >
                            <Network size={18} />
                            {generatingBPMN ? 'Génération...' : 'Générer BPMN'}
                        </button>

                        <button
                            onClick={onExportToExcel}
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
                            <span style={{ fontWeight: '600', color: '#92400e' }}>
                                Avertissements ({processingWarnings.length})
                            </span>
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

                {/* Results Count */}
                {(searchTerm || filterType !== 'all') && (
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        {filteredRowsCount} résultat{filteredRowsCount > 1 ? 's' : ''} trouvé{filteredRowsCount > 1 ? 's' : ''}
                    </div>
                )}

                {/* Status Messages */}
                {aiEnrichmentStatus && (
                    <div style={{
                        padding: '1rem',
                        backgroundColor: aiEnrichmentStatus.startsWith('✅') ? '#d1fae5' : aiEnrichmentStatus.startsWith('❌') ? '#fee2e2' : '#fef3c7',
                        borderLeft: `4px solid ${aiEnrichmentStatus.startsWith('✅') ? '#059669' : aiEnrichmentStatus.startsWith('❌') ? '#ef4444' : '#f59e0b'}`,
                        color: aiEnrichmentStatus.startsWith('✅') ? '#065f46' : aiEnrichmentStatus.startsWith('❌') ? '#991b1b' : '#92400e',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                    }}>
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
    );
}
import React from 'react';
import { ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { TableRow } from '@/logic/dotTableProcessor';

interface TableGridProps {
    rows: TableRow[];
    allRows: TableRow[];
    sortConfig: { key: keyof TableRow; direction: 'asc' | 'desc' } | null;
    onSort: (key: keyof TableRow) => void;
    onCellChange: (index: number, field: keyof TableRow, value: string) => void;
    onCellDoubleClick: (rowId: string, field: keyof TableRow) => void;
    onCellBlur: () => void;
    onCellKeyDown: (e: React.KeyboardEvent) => void;
    isEditing: (rowId: string, field: keyof TableRow) => boolean;
    onDeleteRow: (rowId: string) => void;
}

export default function TableGrid({
    rows,
    allRows,
    sortConfig,
    onSort,
    onCellChange,
    onCellDoubleClick,
    onCellBlur,
    onCellKeyDown,
    isEditing,
    onDeleteRow
}: TableGridProps) {
    const getTypeColor = (type: string) => {
        switch (type) {
            case 'ExclusiveGateway': return '#fef3c7 #92400e';
            case 'StartEvent': return '#d1fae5 #065f46';
            case 'EndEvent': return '#fee2e2 #991b1b';
            default: return '#dbeafe #1e40af';
        }
    };

    const uniqueTypes = Array.from(new Set(allRows.map(r => r.typeBpmn)));

    return (
        <>
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
                                        onClick={() => sortable && key && onSort(key)}
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
                            {rows.map((row, idx) => (
                                <tr key={row.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <div style={{ fontSize: '0.875rem', fontFamily: 'monospace', fontWeight: '500' }}>
                                            {row.id}
                                        </div>
                                    </td>

                                    {/* Étape */}
                                    <td style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onDoubleClick={() => onCellDoubleClick(row.id, 'étape')}>
                                        {isEditing(row.id, 'étape') ? (
                                            <input
                                                type="text"
                                                value={row.étape}
                                                onChange={e => onCellChange(idx, 'étape', e.target.value)}
                                                onBlur={onCellBlur}
                                                onKeyDown={onCellKeyDown}
                                                placeholder="Description de l'étape"
                                                style={{ width: '100%', minWidth: '200px', padding: '0.5rem', fontSize: '0.875rem', border: '2px solid #3b82f6', borderRadius: '0.25rem' }}
                                                autoFocus
                                            />
                                        ) : (
                                            <div style={{ minWidth: '200px' }}>{row.étape || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Double-cliquez pour éditer</span>}</div>
                                        )}
                                    </td>

                                    {/* Type BPMN */}
                                    <td style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onDoubleClick={() => onCellDoubleClick(row.id, 'typeBpmn')}>
                                        {isEditing(row.id, 'typeBpmn') ? (
                                            <select
                                                value={row.typeBpmn}
                                                onChange={e => onCellChange(idx, 'typeBpmn', e.target.value)}
                                                onBlur={onCellBlur}
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

                                    {/* Département */}
                                    <td style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onDoubleClick={() => onCellDoubleClick(row.id, 'département')}>
                                        {isEditing(row.id, 'département') ? (
                                            <input
                                                type="text"
                                                value={row.département}
                                                onChange={e => onCellChange(idx, 'département', e.target.value)}
                                                onBlur={onCellBlur}
                                                onKeyDown={onCellKeyDown}
                                                placeholder="Ex: Commercial"
                                                style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '2px solid #3b82f6', borderRadius: '0.25rem' }}
                                                autoFocus
                                            />
                                        ) : (
                                            <div>{row.département || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>À compléter...</span>}</div>
                                        )}
                                    </td>

                                    {/* Acteur */}
                                    <td style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onDoubleClick={() => onCellDoubleClick(row.id, 'acteur')}>
                                        {isEditing(row.id, 'acteur') ? (
                                            <input
                                                type="text"
                                                value={row.acteur}
                                                onChange={e => onCellChange(idx, 'acteur', e.target.value)}
                                                onBlur={onCellBlur}
                                                onKeyDown={onCellKeyDown}
                                                placeholder="Ex: Vente"
                                                style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '2px solid #3b82f6', borderRadius: '0.25rem' }}
                                                autoFocus
                                            />
                                        ) : (
                                            <div>{row.acteur || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>À compléter...</span>}</div>
                                        )}
                                    </td>

                                    {/* Condition */}
                                    <td style={{ padding: '0.75rem 1rem', cursor: row.typeBpmn === 'ExclusiveGateway' ? 'pointer' : 'default' }} onDoubleClick={() => row.typeBpmn === 'ExclusiveGateway' && onCellDoubleClick(row.id, 'condition')}>
                                        {isEditing(row.id, 'condition') && row.typeBpmn === 'ExclusiveGateway' ? (
                                            <input
                                                type="text"
                                                value={row.condition}
                                                onChange={e => onCellChange(idx, 'condition', e.target.value)}
                                                onBlur={onCellBlur}
                                                onKeyDown={onCellKeyDown}
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

                                    {/* Output Oui */}
                                    <td style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onDoubleClick={() => onCellDoubleClick(row.id, 'outputOui')}>
                                        {isEditing(row.id, 'outputOui') ? (
                                            <input
                                                type="text"
                                                value={row.outputOui}
                                                onChange={e => onCellChange(idx, 'outputOui', e.target.value)}
                                                onBlur={onCellBlur}
                                                onKeyDown={onCellKeyDown}
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

                                    {/* Output Non */}
                                    <td style={{ padding: '0.75rem 1rem', cursor: row.typeBpmn === 'ExclusiveGateway' ? 'pointer' : 'default' }} onDoubleClick={() => row.typeBpmn === 'ExclusiveGateway' && onCellDoubleClick(row.id, 'outputNon')}>
                                        {isEditing(row.id, 'outputNon') && row.typeBpmn === 'ExclusiveGateway' ? (
                                            <input
                                                type="text"
                                                value={row.outputNon}
                                                onChange={e => onCellChange(idx, 'outputNon', e.target.value)}
                                                onBlur={onCellBlur}
                                                onKeyDown={onCellKeyDown}
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

                                    {/* Outil */}
                                    <td style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onDoubleClick={() => onCellDoubleClick(row.id, 'outil')}>
                                        {isEditing(row.id, 'outil') ? (
                                            <input
                                                type="text"
                                                value={row.outil}
                                                onChange={e => onCellChange(idx, 'outil', e.target.value)}
                                                onBlur={onCellBlur}
                                                onKeyDown={onCellKeyDown}
                                                placeholder="Ex: CRM, SAP..."
                                                style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '2px solid #3b82f6', borderRadius: '0.25rem' }}
                                                autoFocus
                                            />
                                        ) : (
                                            <div>{row.outil || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>À compléter...</span>}</div>
                                        )}
                                    </td>

                                    {/* Actions */}
                                    <td style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onDoubleClick={() => onCellDoubleClick(row.id, 'actions')}>
                                        {isEditing(row.id, 'actions') ? (
                                            <input
                                                type="text"
                                                value={row.actions}
                                                onChange={e => onCellChange(idx, 'actions', e.target.value)}
                                                onBlur={onCellBlur}
                                                onKeyDown={onCellKeyDown}
                                                placeholder="Actions à effectuer"
                                                style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', border: '2px solid #3b82f6', borderRadius: '0.25rem' }}
                                                autoFocus
                                            />
                                        ) : (
                                            <div>{row.actions || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>À compléter...</span>}</div>
                                        )}
                                    </td>

                                    {/* Delete Button */}
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                        <button
                                            onClick={() => onDeleteRow(row.id)}
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

            {/* Footer Stats */}
            <div style={{ marginTop: '1.5rem', backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', textAlign: 'center' }}>
                    {uniqueTypes.map(type => {
                        const count = allRows.filter(r => r.typeBpmn === type).length;
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
        </>
    );
}
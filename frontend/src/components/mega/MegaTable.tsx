'use client';

import React from 'react';
import * as XLSX from 'xlsx';

interface MegaTableRow {
    process: string;
    processName: string;
    what: string;
    type: string;
    eventNature: string;
    who: string;
    comment: string;
    previousItem: string;
    previousItemType: string;
    sequenceLabel: string;
    sequenceType: string;
}

interface MegaTableProps {
    data: MegaTableRow[];
}

const MegaTable: React.FC<MegaTableProps> = ({ data }) => {
    const columns = [
        { key: 'process', label: 'Process' },
        { key: 'processName', label: 'Process Name' },
        { key: 'what', label: 'What' },
        { key: 'type', label: 'Type' },
        { key: 'eventNature', label: 'Event Nature' },
        { key: 'who', label: 'Who' },
        { key: 'comment', label: 'Comment' },
        { key: 'previousItem', label: 'Previous Item' },
        { key: 'previousItemType', label: 'Previous Item Type' },
        { key: 'sequenceLabel', label: 'Sequence Label' },
        { key: 'sequenceType', label: 'Sequence Type' },
    ];

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'Event': return 'bg-blue-50 text-blue-700';
            case 'Operation': return 'bg-green-50 text-green-700';
            case 'Task': return 'bg-purple-50 text-purple-700';
            case 'Gateway': return 'bg-yellow-50 text-yellow-700';
            default: return 'bg-gray-50 text-gray-700';
        }
    };

    const getEventNatureColor = (nature: string) => {
        switch (nature) {
            case 'Start': return 'bg-emerald-100 text-emerald-800';
            case 'End': return 'bg-red-100 text-red-800';
            case 'Catching': return 'bg-indigo-100 text-indigo-800';
            case 'Throwing': return 'bg-orange-100 text-orange-800';
            default: return '';
        }
    };

    const exportToExcel = () => {
        if (data.length === 0) {
            alert('No data to export');
            return;
        }

        // Créer le worksheet à partir des données
        const ws = XLSX.utils.json_to_sheet(data);

        // Détecter et fusionner les cellules pour la colonne Process (colonne A)
        const merges = [];
        let startRow = 1; // commence après l'en-tête (row 0)

        for (let i = 0; i < data.length; i++) {
            // Si c'est la dernière ligne OU le process change
            if (i === data.length - 1 || data[i].process !== data[i + 1].process) {
                // Si on a plus d'une ligne avec le même process
                if (i + 1 > startRow) {
                    merges.push({
                        s: { r: startRow, c: 0 }, // start: row, column
                        e: { r: i + 1, c: 0 }      // end: row, column
                    });
                }
                startRow = i + 2; // prochaine ligne après celle-ci
            }
        }

        // Appliquer les fusions
        if (merges.length > 0) {
            ws['!merges'] = merges;
        }

        // Créer le workbook et ajouter le worksheet
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Process Data");

        // Télécharger le fichier
        XLSX.writeFile(wb, `process_data_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="w-full space-y-4">
            {/* Bouton d'export */}
            <div className="flex justify-end">
                <button
                    onClick={exportToExcel}
                    disabled={data.length === 0}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    Export to Excel
                </button>
            </div>

            {/* Table */}
            <div className="w-full overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-blue-600 to-blue-700">
                        <tr>
                            {columns.map((column) => (
                                <th
                                    key={column.key}
                                    className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap"
                                >
                                    {column.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                                    No data available. Upload an image to see process data.
                                </td>
                            </tr>
                        ) : (
                            data.map((row, index) => (
                                <tr key={index} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 text-sm text-gray-900 font-mono">{row.process}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{row.processName}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900">{row.what}</td>
                                    <td className="px-4 py-3 text-sm">
                                        {row.type && (
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(row.type)}`}>
                                                {row.type}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        {row.eventNature && (
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEventNatureColor(row.eventNature)}`}>
                                                {row.eventNature}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900">{row.who}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 italic">{row.comment}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900">{row.previousItem}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{row.previousItemType}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900">{row.sequenceLabel}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{row.sequenceType}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default MegaTable;
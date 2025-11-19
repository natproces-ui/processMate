// src/components/ProcessTable.tsx
"use client";
import { useState } from "react";

export interface ProcessRow {
    service: string;
    step: string;
    task: string;
    type: "Séquentielle" | "Conditionnelle";
    condition: string;
    yes: string;
    no: string;
}

export default function ProcessTable({
    data,
    setData,
}: {
    data: ProcessRow[];
    setData: (rows: ProcessRow[]) => void;
}) {
    const [error, setError] = useState<string | null>(null);

    const showError = (message: string) => {
        setError(message);
        setTimeout(() => setError(null), 3000);
    };

    const handleChange = (index: number, field: keyof ProcessRow, value: string | ProcessRow['type']) => {
        const updated = [...data];

        // Type guard pour s'assurer que value est du bon type
        if (field === 'type') {
            updated[index][field] = value as ProcessRow['type'];
        } else {
            updated[index][field] = value as any;
        }

        // Validation : S'assurer que step est unique
        if (field === "step") {
            const stepExists = data.some((row, i) => i !== index && row.step === value);
            if (stepExists) {
                showError("L'étape doit être unique !");
                return;
            }
        }

        // Validation : Vérifier que yes/no pointent vers des steps existants
        if (field === "yes" || field === "no") {
            if (value && value === updated[index].step) {
                showError("Une étape ne peut pas pointer vers elle-même !");
                return;
            }
            if (value && !data.some(row => row.step === value)) {
                showError(`La référence "${value}" doit correspondre à une étape existante !`);
                return;
            }
        }

        setData(updated);
    };

    const handleAddRow = () => {
        // Générer un step incrémental
        const lastStep = data.length > 0 ? data[data.length - 1].step : "1.0";
        const parts = lastStep.split(".");
        const major = parts[0] || "1";
        const minor = parseInt(parts[1] || "0");
        const newStep = `${major}.${minor + 1}`;

        const newRow: ProcessRow = {
            service: "",
            step: newStep,
            task: "",
            type: "Séquentielle",
            condition: "",
            yes: "",
            no: "",
        };
        setData([...data, newRow]);
    };

    const handleDeleteRow = (index: number) => {
        const updated = data.filter((_, i) => i !== index);
        setData(updated);
    };

    return (
        <div className="overflow-x-auto">
            {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                    ⚠️ {error}
                </div>
            )}

            <table className="min-w-full border-collapse border border-gray-300 text-sm">
                <thead className="bg-gray-100">
                    <tr>
                        {["Service", "Étape", "Tâche", "Type", "Condition", "Si Oui →", "Si Non →", "Actions"].map(
                            (col) => (
                                <th key={col} className="border border-gray-300 p-2 text-left">
                                    {col}
                                </th>
                            )
                        )}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, i) => (
                        <tr key={row.step}>
                            <td className="border border-gray-300 p-1">
                                <input
                                    className="w-full px-2 py-1 border rounded"
                                    value={row.service}
                                    onChange={(e) => handleChange(i, "service", e.target.value)}
                                    placeholder="Nom du service"
                                />
                            </td>
                            <td className="border border-gray-300 p-1">
                                <input
                                    className="w-full px-2 py-1 border rounded"
                                    value={row.step}
                                    onChange={(e) => handleChange(i, "step", e.target.value)}
                                    placeholder="Ex: 1.0"
                                />
                            </td>
                            <td className="border border-gray-300 p-1">
                                <input
                                    className="w-full px-2 py-1 border rounded"
                                    value={row.task}
                                    onChange={(e) => handleChange(i, "task", e.target.value)}
                                    placeholder="Description de la tâche"
                                />
                            </td>
                            <td className="border border-gray-300 p-1">
                                <select
                                    className="w-full px-2 py-1 border rounded"
                                    value={row.type}
                                    onChange={(e) => handleChange(i, "type", e.target.value as ProcessRow["type"])}
                                    title="Type de tâche"
                                    aria-label="Type de tâche"
                                >
                                    <option value="Séquentielle">Séquentielle</option>
                                    <option value="Conditionnelle">Conditionnelle</option>
                                </select>
                            </td>
                            <td className="border border-gray-300 p-1">
                                <input
                                    className="w-full px-2 py-1 border rounded"
                                    value={row.condition}
                                    onChange={(e) => handleChange(i, "condition", e.target.value)}
                                    placeholder="Condition si applicable"
                                />
                            </td>
                            <td className="border border-gray-300 p-1">
                                <input
                                    className="w-full px-2 py-1 border rounded"
                                    value={row.yes}
                                    onChange={(e) => handleChange(i, "yes", e.target.value)}
                                    placeholder="Étape suivante"
                                />
                            </td>
                            <td className="border border-gray-300 p-1">
                                <input
                                    className="w-full px-2 py-1 border rounded"
                                    value={row.no}
                                    onChange={(e) => handleChange(i, "no", e.target.value)}
                                    placeholder="Étape alternative"
                                />
                            </td>
                            <td className="border border-gray-300 p-1 text-center">
                                <button
                                    className="text-red-500 font-bold hover:text-red-700"
                                    onClick={() => handleDeleteRow(i)}
                                    title="Supprimer cette ligne"
                                >
                                    ✕
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <button
                onClick={handleAddRow}
                className="mt-3 bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
            >
                ➕ Ajouter une ligne
            </button>
        </div>
    );
}
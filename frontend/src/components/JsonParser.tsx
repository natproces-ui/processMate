"use client";
import { useState } from "react";

export default function JsonParser({ data }: { data: any[] }) {
    const [json, setJson] = useState<string>("");

    const handleParse = () => {
        const parsed = JSON.stringify(data, null, 2);
        setJson(parsed);
    };

    return (
        <div className="mt-6">
            <button
                onClick={handleParse}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
                🧠 Générer JSON
            </button>

            {json && (
                <pre className="mt-4 bg-gray-900 text-green-200 p-4 rounded max-h-96 overflow-auto text-xs">
                    {json}
                </pre>
            )}
        </div>
    );
}

// src/app/components/JsonViewer.tsx
"use client";

export default function JsonViewer({ json }: { json: any }) {
    return (
        <div className="mt-6 p-4 bg-gray-800 text-green-400 rounded shadow">
            <h2 className="text-xl font-bold mb-2">📄 JSON Généré</h2>
            <pre className="overflow-x-auto text-sm">
                {JSON.stringify(json, null, 2)}
            </pre>
        </div>
    );
}
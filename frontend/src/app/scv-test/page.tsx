'use client';

import { useState } from 'react';
import { useFormData } from '@/hooks/useFormData';
import DeposantForm from '@/components/process/DeposantForm';
import HeritierForm from '@/components/process/HeritierForm';
import CompteForm from '@/components/process/CompteForm';
import JsonPreview from '@/components/process/JsonPreview';

export default function Home() {
    const {
        data,
        refs,
        loading,
        error,
        scvCount,
        currentIndex,
        addNewSCV,
        deleteSCV,
        setCurrentSCV,
        updateDeposant,
        updateContact,
        regenerateDeposant,
        addRepresentantLegal,
        updateRepresentantLegal,
        deleteRepresentantLegal,
        regenerateRepresentantLegal,
        addHeritier,
        updateHeritier,
        deleteHeritier,
        regenerateHeritier,
        addCompte,
        updateCompte,
        deleteCompte,
        regenerateCompte,
        regenerateAll,
        exportAllSCV
    } = useFormData();

    const [openSection, setOpenSection] = useState<string>('deposant');
    const [showExportModal, setShowExportModal] = useState(false);

    if (loading && scvCount === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-lg">Génération des données...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    <p className="font-bold">Erreur</p>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    if (!data || !refs) {
        return null;
    }

    const toggleSection = (section: string) => {
        setOpenSection(openSection === section ? '' : section);
    };

    const handleExport = () => {
        const jsonContent = exportAllSCV();
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scv_data_${scvCount}_items_${new Date().getTime()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setShowExportModal(false);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto py-8 px-4">
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-3xl font-bold">Générateur SCV JSON</h1>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowExportModal(true)}
                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-medium"
                            >
                                📥 Exporter Tout ({scvCount})
                            </button>
                            <button
                                onClick={addNewSCV}
                                disabled={loading}
                                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 font-medium disabled:opacity-50"
                            >
                                ➕ Ajouter un SCV
                            </button>
                        </div>
                    </div>

                    {/* Onglets SCV */}
                    <div className="bg-white rounded-lg shadow-sm p-2 flex gap-2 overflow-x-auto">
                        {Array.from({ length: scvCount }).map((_, index) => (
                            <div key={index} className="flex items-center gap-1">
                                <button
                                    onClick={() => setCurrentSCV(index)}
                                    className={`px-4 py-2 rounded transition-colors ${currentIndex === index
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                        }`}
                                >
                                    SCV {index + 1}
                                </button>
                                {scvCount > 1 && (
                                    <button
                                        onClick={() => {
                                            if (confirm(`Supprimer le SCV ${index + 1} ?`)) {
                                                deleteSCV(index);
                                            }
                                        }}
                                        className="px-2 py-2 text-red-500 hover:bg-red-50 rounded"
                                        title="Supprimer ce SCV"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">
                        {/* Header avec info SCV actuel */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="font-semibold text-blue-900">
                                        SCV {currentIndex + 1} / {scvCount}
                                    </h3>
                                    <p className="text-sm text-blue-700">
                                        ID: {data.SCV.identifiantDeposant.idscv}
                                    </p>
                                </div>
                                <button
                                    onClick={regenerateAll}
                                    className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 font-medium"
                                >
                                    🔄 Régénérer ce SCV
                                </button>
                            </div>
                        </div>

                        {/* Accordéon Déposant */}
                        <div className="bg-white rounded-lg shadow">
                            <button
                                onClick={() => toggleSection('deposant')}
                                className="w-full p-4 flex justify-between items-center hover:bg-gray-50"
                            >
                                <h2 className="text-xl font-semibold">Identifiant Déposant</h2>
                                <span className="text-gray-500 text-xl">
                                    {openSection === 'deposant' ? '▼' : '▶'}
                                </span>
                            </button>
                            {openSection === 'deposant' && (
                                <div className="p-4 border-t">
                                    <DeposantForm
                                        deposant={data.SCV.identifiantDeposant}
                                        contact={data.SCV.infosContact}
                                        representantsLegaux={data.SCV.representantLegal}
                                        villes={refs.villes}
                                        onUpdateDeposant={updateDeposant}
                                        onUpdateContact={updateContact}
                                        onRegenerate={regenerateDeposant}
                                        onAddRepresentant={addRepresentantLegal}
                                        onUpdateRepresentant={updateRepresentantLegal}
                                        onDeleteRepresentant={deleteRepresentantLegal}
                                        onRegenerateRepresentant={regenerateRepresentantLegal}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Accordéon Héritiers */}
                        <div className="bg-white rounded-lg shadow">
                            <button
                                onClick={() => toggleSection('heritiers')}
                                className="w-full p-4 flex justify-between items-center hover:bg-gray-50"
                            >
                                <h2 className="text-xl font-semibold">
                                    Héritiers ({data.SCV.heritier.length})
                                </h2>
                                <span className="text-gray-500 text-xl">
                                    {openSection === 'heritiers' ? '▼' : '▶'}
                                </span>
                            </button>
                            {openSection === 'heritiers' && (
                                <div className="p-4 border-t space-y-3">
                                    {data.SCV.heritier.map((heritier, index) => (
                                        <HeritierForm
                                            key={index}
                                            heritier={heritier}
                                            index={index}
                                            villes={refs.villes}
                                            onUpdate={(h) => updateHeritier(index, h)}
                                            onDelete={() => deleteHeritier(index)}
                                            onRegenerate={() => regenerateHeritier(index)}
                                            canDelete={data.SCV.heritier.length > 1}
                                        />
                                    ))}
                                    <button
                                        onClick={addHeritier}
                                        className="w-full py-2 bg-green-500 text-white rounded hover:bg-green-600 font-medium"
                                    >
                                        ➕ Ajouter un Héritier
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Accordéon Comptes */}
                        <div className="bg-white rounded-lg shadow">
                            <button
                                onClick={() => toggleSection('comptes')}
                                className="w-full p-4 flex justify-between items-center hover:bg-gray-50"
                            >
                                <h2 className="text-xl font-semibold">
                                    Comptes Bancaires ({data.SCV.compte.length})
                                </h2>
                                <span className="text-gray-500 text-xl">
                                    {openSection === 'comptes' ? '▼' : '▶'}
                                </span>
                            </button>
                            {openSection === 'comptes' && (
                                <div className="p-4 border-t space-y-3">
                                    {data.SCV.compte.map((compte, index) => (
                                        <CompteForm
                                            key={index}
                                            compte={compte}
                                            index={index}
                                            onUpdate={(c) => updateCompte(index, c)}
                                            onDelete={() => deleteCompte(index)}
                                            onRegenerate={() => regenerateCompte(index)}
                                            canDelete={data.SCV.compte.length > 1}
                                        />
                                    ))}
                                    <button
                                        onClick={addCompte}
                                        className="w-full py-2 bg-green-500 text-white rounded hover:bg-green-600 font-medium"
                                    >
                                        ➕ Ajouter un Compte
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Prévisualisation JSON */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-lg shadow p-4 sticky top-4 h-[calc(100vh-8rem)]">
                            <JsonPreview data={data} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal d'export */}
            {showExportModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-xl font-bold mb-4">Exporter tous les SCV</h3>
                        <p className="text-gray-600 mb-6">
                            Vous allez exporter <strong>{scvCount} SCV</strong> dans un seul fichier JSON.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowExportModal(false)}
                                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleExport}
                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                                Télécharger
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
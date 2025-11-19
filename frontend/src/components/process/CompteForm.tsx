'use client';

import { useState } from 'react';
import { Compte } from '@/lib/types';

interface CompteFormProps {
    compte: Compte;
    index: number;
    onUpdate: (compte: Compte) => void;
    onDelete: () => void;
    onRegenerate: () => void;
    canDelete: boolean;
}

export default function CompteForm({
    compte,
    index,
    onUpdate,
    onDelete,
    onRegenerate,
    canDelete
}: CompteFormProps) {
    const [isOpen, setIsOpen] = useState(false);

    const updateInfo = (field: string, value: any) => {
        onUpdate({
            ...compte,
            infosCompteBancaire: { ...compte.infosCompteBancaire, [field]: value }
        });
    };

    const addPrelevement = () => {
        onUpdate({
            ...compte,
            prelevement: [
                ...compte.prelevement,
                { montant: 0, nature: 'AUTRE', natureAutre: '' }
            ]
        });
    };

    const updatePrelevement = (idx: number, field: string, value: any) => {
        const updated = [...compte.prelevement];
        updated[idx] = { ...updated[idx], [field]: value };
        onUpdate({ ...compte, prelevement: updated });
    };

    const deletePrelevement = (idx: number) => {
        onUpdate({
            ...compte,
            prelevement: compte.prelevement.filter((_, i) => i !== idx)
        });
    };

    const addCotitulaire = () => {
        onUpdate({
            ...compte,
            cotitulaire: [
                ...compte.cotitulaire,
                { idscv: '', partCoTitulaire: 2500 }
            ]
        });
    };

    const updateCotitulaire = (idx: number, field: string, value: any) => {
        const updated = [...compte.cotitulaire];
        updated[idx] = { ...updated[idx], [field]: value };
        onUpdate({ ...compte, cotitulaire: updated });
    };

    const deleteCotitulaire = (idx: number) => {
        onUpdate({
            ...compte,
            cotitulaire: compte.cotitulaire.filter((_, i) => i !== idx)
        });
    };

    const addCarte = () => {
        onUpdate({
            ...compte,
            infosCarteBancaire: [
                ...compte.infosCarteBancaire,
                { numeroCarte: '', validite: '' }
            ]
        });
    };

    const updateCarte = (idx: number, field: string, value: any) => {
        const updated = [...compte.infosCarteBancaire];
        updated[idx] = { ...updated[idx], [field]: value };
        onUpdate({ ...compte, infosCarteBancaire: updated });
    };

    const deleteCarte = (idx: number) => {
        onUpdate({
            ...compte,
            infosCarteBancaire: compte.infosCarteBancaire.filter((_, i) => i !== idx)
        });
    };

    return (
        <div className="border rounded-lg overflow-hidden">
            <div
                className="flex justify-between items-center p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="font-medium">
                    Compte {index + 1} - {compte.infosCompteBancaire.nomCompte} ({compte.infosCompteBancaire.rib})
                </span>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={onRegenerate}
                        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                    >
                        🔄
                    </button>
                    {canDelete && (
                        <button
                            onClick={onDelete}
                            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                        >
                            🗑️
                        </button>
                    )}
                    <span className="text-gray-500">{isOpen ? '▼' : '▶'}</span>
                </div>
            </div>

            {isOpen && (
                <div className="p-4 space-y-6">
                    <div>
                        <h5 className="font-semibold mb-3">Informations Compte</h5>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-sm mb-1">RIB</label>
                                <input
                                    type="text"
                                    value={compte.infosCompteBancaire.rib}
                                    onChange={(e) => updateInfo('rib', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Nom Compte</label>
                                <input
                                    type="text"
                                    value={compte.infosCompteBancaire.nomCompte}
                                    onChange={(e) => updateInfo('nomCompte', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Devise</label>
                                <input
                                    type="text"
                                    value={compte.infosCompteBancaire.devise}
                                    onChange={(e) => updateInfo('devise', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Solde</label>
                                <input
                                    type="number"
                                    value={compte.infosCompteBancaire.montantTotalSolde}
                                    onChange={(e) => updateInfo('montantTotalSolde', parseInt(e.target.value))}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Dettes</label>
                                <input
                                    type="number"
                                    value={compte.infosCompteBancaire.montantTotalDettes}
                                    onChange={(e) => updateInfo('montantTotalDettes', parseInt(e.target.value))}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Débits</label>
                                <input
                                    type="number"
                                    value={compte.infosCompteBancaire.montantTotalDebits}
                                    onChange={(e) => updateInfo('montantTotalDebits', parseInt(e.target.value))}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <div className="flex justify-between items-center mb-3">
                            <h5 className="font-semibold">Prélèvements</h5>
                            <button
                                onClick={addPrelevement}
                                className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                            >
                                + Ajouter
                            </button>
                        </div>
                        <div className="space-y-2">
                            {compte.prelevement.map((p, idx) => (
                                <div key={idx} className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <label className="block text-xs mb-1">Montant</label>
                                        <input
                                            type="number"
                                            value={p.montant}
                                            onChange={(e) => updatePrelevement(idx, 'montant', parseInt(e.target.value))}
                                            className="w-full px-2 py-1 border rounded text-sm"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs mb-1">Nature</label>
                                        <select
                                            value={p.nature}
                                            onChange={(e) => updatePrelevement(idx, 'nature', e.target.value)}
                                            className="w-full px-2 py-1 border rounded text-sm"
                                        >
                                            <option value="AUTRE">AUTRE</option>
                                            <option value="PS">PS</option>
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs mb-1">Précision</label>
                                        <input
                                            type="text"
                                            value={p.natureAutre || ''}
                                            onChange={(e) => updatePrelevement(idx, 'natureAutre', e.target.value)}
                                            className="w-full px-2 py-1 border rounded text-sm"
                                        />
                                    </div>
                                    <button
                                        onClick={() => deletePrelevement(idx)}
                                        className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <div className="flex justify-between items-center mb-3">
                            <h5 className="font-semibold">Cotitulaires</h5>
                            <button
                                onClick={addCotitulaire}
                                className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                            >
                                + Ajouter
                            </button>
                        </div>
                        <div className="space-y-2">
                            {compte.cotitulaire.map((c, idx) => (
                                <div key={idx} className="flex gap-2 items-end">
                                    <div className="flex-[2]">
                                        <label className="block text-xs mb-1">IDSCV</label>
                                        <input
                                            type="text"
                                            value={c.idscv}
                                            onChange={(e) => updateCotitulaire(idx, 'idscv', e.target.value)}
                                            className="w-full px-2 py-1 border rounded text-sm"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs mb-1">Part</label>
                                        <input
                                            type="number"
                                            value={c.partCoTitulaire}
                                            onChange={(e) => updateCotitulaire(idx, 'partCoTitulaire', parseInt(e.target.value))}
                                            className="w-full px-2 py-1 border rounded text-sm"
                                        />
                                    </div>
                                    <button
                                        onClick={() => deleteCotitulaire(idx)}
                                        className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <div className="flex justify-between items-center mb-3">
                            <h5 className="font-semibold">Cartes Bancaires</h5>
                            <button
                                onClick={addCarte}
                                className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                            >
                                + Ajouter
                            </button>
                        </div>
                        <div className="space-y-2">
                            {compte.infosCarteBancaire.map((c, idx) => (
                                <div key={idx} className="flex gap-2 items-end">
                                    <div className="flex-[2]">
                                        <label className="block text-xs mb-1">Numéro Carte</label>
                                        <input
                                            type="text"
                                            value={c.numeroCarte}
                                            onChange={(e) => updateCarte(idx, 'numeroCarte', e.target.value)}
                                            className="w-full px-2 py-1 border rounded text-sm"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs mb-1">Validité</label>
                                        <input
                                            type="text"
                                            value={c.validite}
                                            onChange={(e) => updateCarte(idx, 'validite', e.target.value)}
                                            placeholder="MM/YYYY"
                                            className="w-full px-2 py-1 border rounded text-sm"
                                        />
                                    </div>
                                    <button
                                        onClick={() => deleteCarte(idx)}
                                        className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
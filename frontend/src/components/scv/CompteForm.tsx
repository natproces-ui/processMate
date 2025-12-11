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

    const isCOL = compte.infosCompteBancaire.natureCompte === 'COL';
    const isIND = compte.infosCompteBancaire.natureCompte === 'IND';

    // ✅ VALIDATION: Vérifier cohérence nombreCotitulaires
    const nombreCotitulairesAttendu = isCOL ? compte.cotitulaire.length + 1 : null;
    const nombreCotitulairesCoherent = isCOL
        ? compte.infosCompteBancaire.nombreCotitulaires === nombreCotitulairesAttendu
        : true;

    // ✅ VALIDATION: Somme des parts cotitulaires
    const sommeParts = compte.cotitulaire.reduce((sum, c) => sum + c.partCoTitulaire, 0);
    const partsCoherentes = isCOL
        ? sommeParts === 10000
        : true;

    // ✅ VALIDATION: Cartes cohérentes
    const hasCartes = compte.infosCarteBancaire.length > 0;
    const cartesCoherentes =
        (compte.infosCompteBancaire.isCarteBancaire === 'O' && hasCartes) ||
        (compte.infosCompteBancaire.isCarteBancaire === 'N' && !hasCartes);

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

    // ✅ AUTO-UPDATE nombreCotitulaires lors d'ajout
    const addCotitulaire = () => {
        const newCotitulaires = [
            ...compte.cotitulaire,
            { idscv: '', partCoTitulaire: 2500 }
        ];
        onUpdate({
            ...compte,
            cotitulaire: newCotitulaires,
            infosCompteBancaire: {
                ...compte.infosCompteBancaire,
                nombreCotitulaires: isCOL ? newCotitulaires.length + 1 : null
            }
        });
    };

    const updateCotitulaire = (idx: number, field: string, value: any) => {
        const updated = [...compte.cotitulaire];
        updated[idx] = { ...updated[idx], [field]: field === 'partCoTitulaire' ? parseInt(value) || 0 : value };
        onUpdate({ ...compte, cotitulaire: updated });
    };

    // ✅ AUTO-UPDATE nombreCotitulaires lors de suppression
    const deleteCotitulaire = (idx: number) => {
        const newCotitulaires = compte.cotitulaire.filter((_, i) => i !== idx);
        onUpdate({
            ...compte,
            cotitulaire: newCotitulaires,
            infosCompteBancaire: {
                ...compte.infosCompteBancaire,
                nombreCotitulaires: isCOL ? newCotitulaires.length + 1 : null
            }
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
                <div className="flex items-center gap-3">
                    <span className="font-medium">
                        Compte {index + 1} - {compte.infosCompteBancaire.nomCompte}
                    </span>
                    {/* ✅ Badge COL/IND */}
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${isCOL
                        ? 'bg-green-100 text-green-800'
                        : 'bg-orange-100 text-orange-800'
                        }`}>
                        {isCOL ? '👥 Collectif' : '👤 Individuel'}
                    </span>
                    {/* ✅ Badges de validation */}
                    {!nombreCotitulairesCoherent && (
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
                            ⚠️ Cotitulaires
                        </span>
                    )}
                    {!partsCoherentes && (
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
                            ⚠️ Parts
                        </span>
                    )}
                    {!cartesCoherentes && (
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
                            ⚠️ Cartes
                        </span>
                    )}
                </div>
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
                                    className="w-full px-2 py-1 border rounded text-sm font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Nature Compte</label>
                                <select
                                    value={compte.infosCompteBancaire.natureCompte}
                                    onChange={(e) => updateInfo('natureCompte', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm font-semibold"
                                >
                                    <option value="COL">COL - Collectif</option>
                                    <option value="IND">IND - Individuel</option>
                                </select>
                            </div>

                            {/* ✅ AFFICHAGE nombreCotitulaires si COL */}
                            {isCOL && (
                                <div>
                                    <label className="block text-sm mb-1">
                                        Nombre Total Personnes
                                    </label>
                                    <input
                                        type="number"
                                        value={compte.infosCompteBancaire.nombreCotitulaires || 0}
                                        disabled
                                        className={`w-full px-2 py-1 border rounded text-sm font-bold ${nombreCotitulairesCoherent
                                            ? 'bg-green-50 text-green-800'
                                            : 'bg-red-50 text-red-800'
                                            }`}
                                    />
                                    <span className="text-xs text-gray-600 mt-1 block">
                                        {compte.cotitulaire.length} cotit. + 1 tit. = {compte.cotitulaire.length + 1}
                                    </span>
                                </div>
                            )}

                            {isIND && (
                                <div>
                                    <label className="block text-sm mb-1">Nombre Cotitulaires</label>
                                    <input
                                        type="text"
                                        value="N/A (Individuel)"
                                        disabled
                                        className="w-full px-2 py-1 border rounded text-sm bg-gray-100 text-gray-500 italic"
                                    />
                                </div>
                            )}

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
                                <select
                                    value={compte.infosCompteBancaire.devise}
                                    onChange={(e) => updateInfo('devise', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                >
                                    <option value="MAD">MAD</option>
                                    <option value="EUR">EUR</option>
                                    <option value="USD">USD</option>
                                    <option value="RUB">RUB</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Statut</label>
                                <select
                                    value={compte.infosCompteBancaire.statutCompte}
                                    onChange={(e) => updateInfo('statutCompte', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                >
                                    <option value="STP">STP</option>
                                    <option value="NSTP">NSTP</option>
                                    <option value="CLOS">CLOS</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Carte Bancaire</label>
                                <select
                                    value={compte.infosCompteBancaire.isCarteBancaire}
                                    onChange={(e) => updateInfo('isCarteBancaire', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                >
                                    <option value="O">O - Oui</option>
                                    <option value="N">N - Non</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Sens Solde</label>
                                <select
                                    value={compte.infosCompteBancaire.sensSolde}
                                    onChange={(e) => updateInfo('sensSolde', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                >
                                    <option value="DEB">DEB - Débiteur</option>
                                    <option value="CRED">CRED - Créditeur</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Solde</label>
                                <input
                                    type="number"
                                    value={compte.infosCompteBancaire.montantTotalSolde}
                                    onChange={(e) => updateInfo('montantTotalSolde', parseInt(e.target.value) || 0)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Dettes</label>
                                <input
                                    type="number"
                                    value={compte.infosCompteBancaire.montantTotalDettes}
                                    onChange={(e) => updateInfo('montantTotalDettes', parseInt(e.target.value) || 0)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Débits</label>
                                <input
                                    type="number"
                                    value={compte.infosCompteBancaire.montantTotalDebits}
                                    onChange={(e) => updateInfo('montantTotalDebits', parseInt(e.target.value) || 0)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* ✅ VALIDATION VISUELLE COTITULAIRES */}
                    {isCOL && (
                        <div className={`p-3 rounded text-sm ${nombreCotitulairesCoherent
                            ? 'bg-green-50 border border-green-200 text-green-800'
                            : 'bg-red-50 border border-red-200 text-red-800'
                            }`}>
                            {nombreCotitulairesCoherent ? (
                                <div className="flex items-center gap-2">
                                    <span>✅</span>
                                    <span>Nombre de cotitulaires cohérent: {compte.infosCompteBancaire.nombreCotitulaires} personnes</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span>❌</span>
                                    <span>
                                        Incohérence: nombreCotitulaires = {compte.infosCompteBancaire.nombreCotitulaires},
                                        mais devrait être {nombreCotitulairesAttendu} ({compte.cotitulaire.length} cotit. + 1 tit.)
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="border-t pt-4">
                        <div className="flex justify-between items-center mb-3">
                            <h5 className="font-semibold">Prélèvements ({compte.prelevement.length})</h5>
                            <button
                                onClick={addPrelevement}
                                className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                            >
                                + Ajouter
                            </button>
                        </div>
                        {compte.prelevement.length > 0 ? (
                            <div className="space-y-2">
                                {compte.prelevement.map((p, idx) => (
                                    <div key={idx} className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <label className="block text-xs mb-1">Montant</label>
                                            <input
                                                type="number"
                                                value={p.montant}
                                                onChange={(e) => updatePrelevement(idx, 'montant', parseInt(e.target.value) || 0)}
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
                                                <option value="LOYER">LOYER</option>
                                                <option value="CREDIT">CREDIT</option>
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
                        ) : (
                            <p className="text-sm text-gray-500 italic">Aucun prélèvement</p>
                        )}
                    </div>

                    {/* ✅ SECTION COTITULAIRES avec validation */}
                    <div className="border-t pt-4">
                        <div className="flex justify-between items-center mb-3">
                            <h5 className="font-semibold">
                                Cotitulaires ({compte.cotitulaire.length})
                                {isCOL && (
                                    <span className="text-xs text-gray-500 ml-2">
                                        (+ 1 titulaire non listé)
                                    </span>
                                )}
                            </h5>
                            {isCOL && (
                                <button
                                    onClick={addCotitulaire}
                                    className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                                >
                                    + Ajouter
                                </button>
                            )}
                        </div>

                        {isCOL ? (
                            <>
                                {/* ✅ VALIDATION SOMME PARTS */}
                                <div className={`mb-3 p-2 rounded text-sm ${partsCoherentes
                                    ? 'bg-green-50 border border-green-200 text-green-800'
                                    : 'bg-red-50 border border-red-200 text-red-800'
                                    }`}>
                                    {partsCoherentes ? (
                                        <span>✅ Somme des parts visible = {sommeParts} (+ part titulaire = 10000)</span>
                                    ) : (
                                        <span>❌ Somme des parts visible = {sommeParts} (attendu: somme totale avec titulaire = 10000)</span>
                                    )}
                                </div>

                                {compte.cotitulaire.length > 0 ? (
                                    <div className="space-y-2">
                                        {compte.cotitulaire.map((c, idx) => (
                                            <div key={idx} className="flex gap-2 items-end">
                                                <div className="flex-[2]">
                                                    <label className="block text-xs mb-1">IDSCV Cotitulaire</label>
                                                    <input
                                                        type="text"
                                                        value={c.idscv}
                                                        onChange={(e) => updateCotitulaire(idx, 'idscv', e.target.value)}
                                                        className="w-full px-2 py-1 border rounded text-sm font-mono"
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-xs mb-1">Part (/10000)</label>
                                                    <input
                                                        type="number"
                                                        value={c.partCoTitulaire}
                                                        onChange={(e) => updateCotitulaire(idx, 'partCoTitulaire', e.target.value)}
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
                                ) : (
                                    <p className="text-sm text-gray-500 italic">Aucun cotitulaire (compte à 1 seule personne)</p>
                                )}
                            </>
                        ) : (
                            <div className="text-sm text-gray-500 italic bg-gray-50 p-3 rounded">
                                Compte individuel - Pas de cotitulaires
                            </div>
                        )}
                    </div>

                    {/* ✅ SECTION CARTES avec validation */}
                    <div className="border-t pt-4">
                        <div className="flex justify-between items-center mb-3">
                            <h5 className="font-semibold">Cartes Bancaires ({compte.infosCarteBancaire.length})</h5>
                            <button
                                onClick={addCarte}
                                className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                            >
                                + Ajouter
                            </button>
                        </div>

                        {/* ✅ VALIDATION CARTES */}
                        <div className={`mb-3 p-2 rounded text-sm ${cartesCoherentes
                            ? 'bg-green-50 border border-green-200 text-green-800'
                            : 'bg-red-50 border border-red-200 text-red-800'
                            }`}>
                            {cartesCoherentes ? (
                                <span>✅ Cartes cohérentes avec isCarteBancaire = {compte.infosCompteBancaire.isCarteBancaire}</span>
                            ) : (
                                <span>
                                    ❌ Incohérence: isCarteBancaire = {compte.infosCompteBancaire.isCarteBancaire}
                                    mais {hasCartes ? 'il y a des cartes' : 'pas de cartes'}
                                </span>
                            )}
                        </div>

                        {compte.infosCarteBancaire.length > 0 ? (
                            <div className="space-y-2">
                                {compte.infosCarteBancaire.map((c, idx) => (
                                    <div key={idx} className="flex gap-2 items-end">
                                        <div className="flex-[2]">
                                            <label className="block text-xs mb-1">Numéro Carte</label>
                                            <input
                                                type="text"
                                                value={c.numeroCarte}
                                                onChange={(e) => updateCarte(idx, 'numeroCarte', e.target.value)}
                                                className="w-full px-2 py-1 border rounded text-sm font-mono"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-xs mb-1">Validité (MM/YYYY)</label>
                                            <input
                                                type="text"
                                                value={c.validite}
                                                onChange={(e) => updateCarte(idx, 'validite', e.target.value)}
                                                placeholder="04/2031"
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
                        ) : (
                            <p className="text-sm text-gray-500 italic">Aucune carte bancaire</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
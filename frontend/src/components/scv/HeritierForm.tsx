'use client';

import { useState } from 'react';
import { Heritier, Ville } from '@/lib/types';

interface HeritierFormProps {
    heritier: Heritier;
    index: number;
    totalHeritiers: number;  // ✅ AJOUTÉ pour validation
    villes: Ville[];
    onUpdate: (heritier: Heritier) => void;
    onDelete: () => void;
    onRegenerate: () => void;
    canDelete: boolean;
}

export default function HeritierForm({
    heritier,
    index,
    totalHeritiers,  // ✅ AJOUTÉ
    villes,
    onUpdate,
    onDelete,
    onRegenerate,
    canDelete
}: HeritierFormProps) {
    const [isOpen, setIsOpen] = useState(false);

    const updateField = (section: string, field: string, value: any) => {
        const updated = { ...heritier };
        if (section === 'identifiant') {
            updated.identifiantHeritier = { ...updated.identifiantHeritier, [field]: value };
        } else if (section === 'contact') {
            updated.infosContact = { ...updated.infosContact, [field]: value };
        } else if (section === 'repIdentifiant') {
            updated.representantLegal.identifiantRepresentantLegal = {
                ...updated.representantLegal.identifiantRepresentantLegal,
                [field]: value
            };
        } else if (section === 'repContact') {
            updated.representantLegal.infosContact = {
                ...updated.representantLegal.infosContact,
                [field]: value
            };
        }
        onUpdate(updated);
    };

    const hasRep = heritier.representantLegal.identifiantRepresentantLegal.idscv !== null;

    // ✅ VALIDATION: Calculer la part attendue
    const partAttendue = Math.round(10000 / totalHeritiers);
    const partCoherente = Math.abs(heritier.identifiantHeritier.partHeritage - partAttendue) <= 1;
    // Note: tolérance de ±1 pour les arrondis (ex: 3333, 3333, 3334)

    return (
        <div className="border rounded-lg overflow-hidden">
            <div
                className="flex justify-between items-center p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <span className="font-medium">
                        Héritier {index + 1} - {heritier.identifiantHeritier.nom} {heritier.identifiantHeritier.prenom}
                    </span>
                    {/* ✅ Badge représentant */}
                    {hasRep && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            Avec représentant
                        </span>
                    )}
                    {/* ✅ Badge validation part */}
                    <span className={`text-xs px-2 py-1 rounded font-semibold ${partCoherente
                        ? 'bg-green-100 text-green-800'
                        : 'bg-orange-100 text-orange-800'
                        }`}>
                        Part: {heritier.identifiantHeritier.partHeritage}
                    </span>
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
                        <h5 className="font-semibold mb-3">Identité</h5>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm mb-1">Nom</label>
                                <input
                                    type="text"
                                    value={heritier.identifiantHeritier.nom}
                                    onChange={(e) => updateField('identifiant', 'nom', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Prénom</label>
                                <input
                                    type="text"
                                    value={heritier.identifiantHeritier.prenom}
                                    onChange={(e) => updateField('identifiant', 'prenom', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Nature ID</label>
                                <input
                                    type="text"
                                    value={heritier.identifiantHeritier.natureIdentifiantDeposantP}
                                    onChange={(e) => updateField('identifiant', 'natureIdentifiantDeposantP', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Numéro ID</label>
                                <input
                                    type="text"
                                    value={heritier.identifiantHeritier.numeroIdentifiantDeposantP}
                                    onChange={(e) => updateField('identifiant', 'numeroIdentifiantDeposantP', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Date Naissance</label>
                                <input
                                    type="text"
                                    value={heritier.identifiantHeritier.dateNaissance}
                                    onChange={(e) => updateField('identifiant', 'dateNaissance', e.target.value)}
                                    placeholder="DD/MM/YYYY"
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Nationalité</label>
                                <input
                                    type="text"
                                    value={heritier.identifiantHeritier.nationalite}
                                    onChange={(e) => updateField('identifiant', 'nationalite', e.target.value)}
                                    maxLength={2}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>

                            {/* ✅ CHAMP PART HERITAGE avec validation visuelle */}
                            <div className="col-span-2">
                                <label className="block text-sm mb-1">Part Héritage (/10000)</label>
                                <input
                                    type="number"
                                    value={heritier.identifiantHeritier.partHeritage}
                                    onChange={(e) => updateField('identifiant', 'partHeritage', parseInt(e.target.value) || 0)}
                                    className={`w-full px-2 py-1 border rounded text-sm font-semibold ${partCoherente
                                        ? 'border-green-300 bg-green-50'
                                        : 'border-orange-300 bg-orange-50'
                                        }`}
                                />
                                {/* ✅ Message de validation */}
                                <div className={`mt-1 text-xs ${partCoherente ? 'text-green-600' : 'text-orange-600'
                                    }`}>
                                    {partCoherente ? (
                                        <span>✅ Part cohérente ({totalHeritiers} héritiers)</span>
                                    ) : (
                                        <span>
                                            ⚠️ Part attendue: ~{partAttendue} pour {totalHeritiers} héritiers
                                            (somme totale = 10000)
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <h5 className="font-semibold mb-3">Contact</h5>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className="block text-sm mb-1">Adresse</label>
                                <input
                                    type="text"
                                    value={heritier.infosContact.adresse1 || ''}
                                    onChange={(e) => updateField('contact', 'adresse1', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Ville</label>
                                <select
                                    value={heritier.infosContact.ville || ''}
                                    onChange={(e) => updateField('contact', 'ville', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                >
                                    {villes.map((v) => (
                                        <option key={v.code} value={v.code}>{v.ville}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Mobile</label>
                                <input
                                    type="text"
                                    value={heritier.infosContact.mobile || ''}
                                    onChange={(e) => updateField('contact', 'mobile', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm mb-1">Email</label>
                                <input
                                    type="email"
                                    value={heritier.infosContact.email || ''}
                                    onChange={(e) => updateField('contact', 'email', e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {hasRep && (
                        <div className="border-t pt-4">
                            <h5 className="font-semibold mb-3">Représentant Légal</h5>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm mb-1">Nom</label>
                                    <input
                                        type="text"
                                        value={heritier.representantLegal.identifiantRepresentantLegal.nom || ''}
                                        onChange={(e) => updateField('repIdentifiant', 'nom', e.target.value)}
                                        className="w-full px-2 py-1 border rounded text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm mb-1">Prénom</label>
                                    <input
                                        type="text"
                                        value={heritier.representantLegal.identifiantRepresentantLegal.prenom || ''}
                                        onChange={(e) => updateField('repIdentifiant', 'prenom', e.target.value)}
                                        className="w-full px-2 py-1 border rounded text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm mb-1">Nature ID</label>
                                    <input
                                        type="text"
                                        value={heritier.representantLegal.identifiantRepresentantLegal.natureIdentifiantDeposantP || ''}
                                        onChange={(e) => updateField('repIdentifiant', 'natureIdentifiantDeposantP', e.target.value)}
                                        className="w-full px-2 py-1 border rounded text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm mb-1">Numéro ID</label>
                                    <input
                                        type="text"
                                        value={heritier.representantLegal.identifiantRepresentantLegal.numeroIdentifiantDeposantP || ''}
                                        onChange={(e) => updateField('repIdentifiant', 'numeroIdentifiantDeposantP', e.target.value)}
                                        className="w-full px-2 py-1 border rounded text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm mb-1">Date Naissance</label>
                                    <input
                                        type="text"
                                        value={heritier.representantLegal.identifiantRepresentantLegal.dateNaissance || ''}
                                        onChange={(e) => updateField('repIdentifiant', 'dateNaissance', e.target.value)}
                                        placeholder="DD/MM/YYYY"
                                        className="w-full px-2 py-1 border rounded text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm mb-1">Nationalité</label>
                                    <input
                                        type="text"
                                        value={heritier.representantLegal.identifiantRepresentantLegal.nationalite || ''}
                                        onChange={(e) => updateField('repIdentifiant', 'nationalite', e.target.value)}
                                        maxLength={2}
                                        className="w-full px-2 py-1 border rounded text-sm"
                                    />
                                </div>
                            </div>

                            <div className="border-t pt-3 mt-3">
                                <h6 className="text-sm font-semibold mb-2">Contact Représentant</h6>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2">
                                        <label className="block text-sm mb-1">Adresse</label>
                                        <input
                                            type="text"
                                            value={heritier.representantLegal.infosContact.adresse1 || ''}
                                            onChange={(e) => updateField('repContact', 'adresse1', e.target.value)}
                                            className="w-full px-2 py-1 border rounded text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm mb-1">Mobile</label>
                                        <input
                                            type="text"
                                            value={heritier.representantLegal.infosContact.mobile || ''}
                                            onChange={(e) => updateField('repContact', 'mobile', e.target.value)}
                                            className="w-full px-2 py-1 border rounded text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm mb-1">Email</label>
                                        <input
                                            type="email"
                                            value={heritier.representantLegal.infosContact.email || ''}
                                            onChange={(e) => updateField('repContact', 'email', e.target.value)}
                                            className="w-full px-2 py-1 border rounded text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
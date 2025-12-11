'use client';

import { useState } from 'react';
import { IdentifiantDeposant, InfosContact, RepresentantLegal, Ville } from '@/lib/types';

interface DeposantFormProps {
    deposant: IdentifiantDeposant;
    contact: InfosContact;
    representantsLegaux: RepresentantLegal[];
    villes: Ville[];
    onUpdateDeposant: (deposant: IdentifiantDeposant) => void;
    onUpdateContact: (contact: InfosContact) => void;
    onRegenerate: () => void;
    onAddRepresentant: () => void;
    onUpdateRepresentant: (index: number, rep: RepresentantLegal) => void;
    onDeleteRepresentant: (index: number) => void;
    onRegenerateRepresentant: (index: number) => void;
}

export default function DeposantForm({
    deposant,
    contact,
    representantsLegaux,
    villes,
    onUpdateDeposant,
    onUpdateContact,
    onRegenerate,
    onAddRepresentant,
    onUpdateRepresentant,
    onDeleteRepresentant,
    onRegenerateRepresentant
}: DeposantFormProps) {
    const [openRepIndex, setOpenRepIndex] = useState<number | null>(null);

    const updateDeposantField = (field: keyof IdentifiantDeposant, value: any) => {
        onUpdateDeposant({ ...deposant, [field]: value });
    };

    const updateContactField = (field: keyof InfosContact, value: any) => {
        onUpdateContact({ ...contact, [field]: value });
    };

    const updateRepresentantField = (index: number, section: 'identifiant' | 'contact', field: string, value: any) => {
        const rep = { ...representantsLegaux[index] };
        if (section === 'identifiant') {
            rep.identifiantRepresentantLegal = { ...rep.identifiantRepresentantLegal, [field]: value };
        } else {
            rep.infosContact = { ...rep.infosContact, [field]: value };
        }
        onUpdateRepresentant(index, rep);
    };

    const hasRepresentant = (rep: RepresentantLegal) => {
        return rep.identifiantRepresentantLegal.idscv !== null;
    };

    const isPP = deposant.typePersonne === 'PP';
    const isPM = deposant.typePersonne === 'PM';

    return (
        <div className="space-y-6">
            {/* Section Déposant */}
            <div>
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold">Informations du Déposant</h3>
                        {/* ✅ Badge Type Personne */}
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isPP
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                            }`}>
                            {isPP ? '👤 Personne Physique (PP)' : '🏢 Personne Morale (PM)'}
                        </span>
                    </div>
                    <button
                        onClick={onRegenerate}
                        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                    >
                        🔄 Régénérer
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            {isPP ? 'Nom' : 'Dénomination Sociale'}
                        </label>
                        <input
                            type="text"
                            value={deposant.nom}
                            onChange={(e) => updateDeposantField('nom', e.target.value)}
                            className="w-full px-3 py-2 border rounded"
                        />
                    </div>

                    {/* ✅ GESTION PRENOM (null pour PM) */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Prénom</label>
                        {isPP ? (
                            <input
                                type="text"
                                value={deposant.prenom || ''}
                                onChange={(e) => updateDeposantField('prenom', e.target.value)}
                                className="w-full px-3 py-2 border rounded"
                            />
                        ) : (
                            <input
                                type="text"
                                value="N/A (Société)"
                                disabled
                                className="w-full px-3 py-2 border rounded bg-gray-100 text-gray-500 italic"
                            />
                        )}
                    </div>

                    {/* ✅ GESTION DATE NAISSANCE (null pour PM) */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Date de Naissance</label>
                        {isPP ? (
                            <input
                                type="text"
                                value={deposant.dateNaissance || ''}
                                onChange={(e) => updateDeposantField('dateNaissance', e.target.value)}
                                placeholder="DD/MM/YYYY"
                                className="w-full px-3 py-2 border rounded"
                            />
                        ) : (
                            <input
                                type="text"
                                value="N/A (Société)"
                                disabled
                                className="w-full px-3 py-2 border rounded bg-gray-100 text-gray-500 italic"
                            />
                        )}
                    </div>

                    {/* ✅ AFFICHER FORME JURIDIQUE si PM */}
                    {isPM && (
                        <div>
                            <label className="block text-sm font-medium mb-1">Forme Juridique</label>
                            <input
                                type="text"
                                value={deposant.formeJuridique || ''}
                                onChange={(e) => updateDeposantField('formeJuridique', e.target.value)}
                                className="w-full px-3 py-2 border rounded font-semibold"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium mb-1">Nationalité</label>
                        <input
                            type="text"
                            value={deposant.nationalite}
                            onChange={(e) => updateDeposantField('nationalite', e.target.value)}
                            className="w-full px-3 py-2 border rounded"
                            maxLength={2}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Nature Identifiant</label>
                        <input
                            type="text"
                            value={deposant.natureIdentifiantDeposant}
                            onChange={(e) => updateDeposantField('natureIdentifiantDeposant', e.target.value)}
                            className="w-full px-3 py-2 border rounded"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Numéro Identifiant</label>
                        <input
                            type="text"
                            value={deposant.numeroIdentifiantDeposant}
                            onChange={(e) => updateDeposantField('numeroIdentifiantDeposant', e.target.value)}
                            className="w-full px-3 py-2 border rounded"
                        />
                    </div>

                    {/* Champs de comptage */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Statut</label>
                        <select
                            value={deposant.isDecede}
                            onChange={(e) => updateDeposantField('isDecede', e.target.value)}
                            className="w-full px-3 py-2 border rounded"
                        >
                            <option value="O">O - Décédé</option>
                            <option value="N">N - Vivant</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Nombre d'Héritiers</label>
                        <input
                            type="number"
                            value={deposant.nombreHeritiers}
                            onChange={(e) => updateDeposantField('nombreHeritiers', parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 border rounded"
                            min="0"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Nombre de Comptes</label>
                        <input
                            type="number"
                            value={deposant.nombreComptes}
                            onChange={(e) => updateDeposantField('nombreComptes', parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 border rounded"
                            min="1"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Version</label>
                        <input
                            type="number"
                            value={deposant.version}
                            onChange={(e) => updateDeposantField('version', parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 border rounded"
                            min="1"
                            max="9"
                        />
                    </div>
                </div>
            </div>

            {/* Section Contact */}
            <div className="border-t pt-4">
                <h4 className="font-semibold mb-3">Contact</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1">Adresse</label>
                        <input
                            type="text"
                            value={contact.adresse1 || ''}
                            onChange={(e) => updateContactField('adresse1', e.target.value)}
                            className="w-full px-3 py-2 border rounded"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Ville</label>
                        <select
                            value={contact.ville || ''}
                            onChange={(e) => updateContactField('ville', e.target.value)}
                            className="w-full px-3 py-2 border rounded"
                        >
                            {villes.map((v) => (
                                <option key={v.code} value={v.code}>{v.ville}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Mobile</label>
                        <input
                            type="text"
                            value={contact.mobile || ''}
                            onChange={(e) => updateContactField('mobile', e.target.value)}
                            className="w-full px-3 py-2 border rounded"
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1">Email</label>
                        <input
                            type="email"
                            value={contact.email || ''}
                            onChange={(e) => updateContactField('email', e.target.value)}
                            className="w-full px-3 py-2 border rounded"
                        />
                    </div>
                </div>
            </div>

            {/* Section Représentants Légaux */}
            <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                    <h4 className="font-semibold">Représentants Légaux ({representantsLegaux.filter(hasRepresentant).length})</h4>
                    <button
                        onClick={onAddRepresentant}
                        className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                    >
                        ➕ Ajouter
                    </button>
                </div>

                <div className="space-y-3">
                    {representantsLegaux.map((rep, index) => {
                        if (!hasRepresentant(rep)) return null;

                        return (
                            <div key={index} className="border rounded-lg overflow-hidden">
                                <div
                                    className="flex justify-between items-center p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                                    onClick={() => setOpenRepIndex(openRepIndex === index ? null : index)}
                                >
                                    <span className="font-medium">
                                        {rep.identifiantRepresentantLegal.nom} {rep.identifiantRepresentantLegal.prenom}
                                    </span>
                                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => onRegenerateRepresentant(index)}
                                            className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                                        >
                                            🔄
                                        </button>
                                        <button
                                            onClick={() => onDeleteRepresentant(index)}
                                            className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                                        >
                                            🗑️
                                        </button>
                                        <span className="text-gray-500">{openRepIndex === index ? '▼' : '▶'}</span>
                                    </div>
                                </div>

                                {openRepIndex === index && (
                                    <div className="p-4 space-y-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-sm mb-1">Nom</label>
                                                <input
                                                    type="text"
                                                    value={rep.identifiantRepresentantLegal.nom || ''}
                                                    onChange={(e) => updateRepresentantField(index, 'identifiant', 'nom', e.target.value)}
                                                    className="w-full px-2 py-1 border rounded text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm mb-1">Prénom</label>
                                                <input
                                                    type="text"
                                                    value={rep.identifiantRepresentantLegal.prenom || ''}
                                                    onChange={(e) => updateRepresentantField(index, 'identifiant', 'prenom', e.target.value)}
                                                    className="w-full px-2 py-1 border rounded text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm mb-1">Nature ID</label>
                                                <input
                                                    type="text"
                                                    value={rep.identifiantRepresentantLegal.natureIdentifiantDeposantP || ''}
                                                    onChange={(e) => updateRepresentantField(index, 'identifiant', 'natureIdentifiantDeposantP', e.target.value)}
                                                    className="w-full px-2 py-1 border rounded text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm mb-1">Numéro ID</label>
                                                <input
                                                    type="text"
                                                    value={rep.identifiantRepresentantLegal.numeroIdentifiantDeposantP || ''}
                                                    onChange={(e) => updateRepresentantField(index, 'identifiant', 'numeroIdentifiantDeposantP', e.target.value)}
                                                    className="w-full px-2 py-1 border rounded text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm mb-1">Date Naissance</label>
                                                <input
                                                    type="text"
                                                    value={rep.identifiantRepresentantLegal.dateNaissance || ''}
                                                    onChange={(e) => updateRepresentantField(index, 'identifiant', 'dateNaissance', e.target.value)}
                                                    className="w-full px-2 py-1 border rounded text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm mb-1">Nationalité</label>
                                                <input
                                                    type="text"
                                                    value={rep.identifiantRepresentantLegal.nationalite || ''}
                                                    onChange={(e) => updateRepresentantField(index, 'identifiant', 'nationalite', e.target.value)}
                                                    className="w-full px-2 py-1 border rounded text-sm"
                                                />
                                            </div>
                                        </div>

                                        <div className="border-t pt-3">
                                            <h5 className="text-sm font-semibold mb-2">Contact</h5>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="col-span-2">
                                                    <label className="block text-sm mb-1">Adresse</label>
                                                    <input
                                                        type="text"
                                                        value={rep.infosContact.adresse1 || ''}
                                                        onChange={(e) => updateRepresentantField(index, 'contact', 'adresse1', e.target.value)}
                                                        className="w-full px-2 py-1 border rounded text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm mb-1">Mobile</label>
                                                    <input
                                                        type="text"
                                                        value={rep.infosContact.mobile || ''}
                                                        onChange={(e) => updateRepresentantField(index, 'contact', 'mobile', e.target.value)}
                                                        className="w-full px-2 py-1 border rounded text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm mb-1">Email</label>
                                                    <input
                                                        type="email"
                                                        value={rep.infosContact.email || ''}
                                                        onChange={(e) => updateRepresentantField(index, 'contact', 'email', e.target.value)}
                                                        className="w-full px-2 py-1 border rounded text-sm"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {representantsLegaux.filter(hasRepresentant).length === 0 && (
                        <p className="text-sm text-gray-500 italic">Aucun représentant légal</p>
                    )}
                </div>
            </div>
        </div>
    );
}
'use client';

import { useState, useEffect } from 'react';
import { X, FolderOpen, Plus, BookMarked, ChevronDown } from 'lucide-react';
import { orchestrationApi } from '@/lib/orchestrationApi';

interface SaveToBiblioModalProps {
    open: boolean;
    initialNom: string;
    onClose: () => void;
    onConfirm: (nom: string, category: string) => Promise<void>;
}

export default function SaveToBiblioModal({
    open,
    initialNom,
    onClose,
    onConfirm,
}: SaveToBiblioModalProps) {
    const [nom, setNom] = useState(initialNom);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [isNew, setIsNew] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadingCats, setLoadingCats] = useState(false);

    useEffect(() => {
        if (!open) return;
        setNom(initialNom);
        setSelectedCategory('');
        setNewCategory('');
        setIsNew(false);

        setLoadingCats(true);
        orchestrationApi.getCategories()
            .then(res => setCategories(res.categories))
            .catch(() => setCategories([]))
            .finally(() => setLoadingCats(false));
    }, [open, initialNom]);

    if (!open) return null;

    const effectiveCategory = isNew ? newCategory.trim() : selectedCategory;
    const canConfirm = nom.trim().length > 0 && effectiveCategory.length > 0 && !saving;

    const handleConfirm = async () => {
        if (!canConfirm) return;
        setSaving(true);
        try {
            await onConfirm(nom.trim(), effectiveCategory);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                            <BookMarked className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-slate-800">Enregistrer dans la bibliothèque</p>
                            <p className="text-xs text-slate-400">La procédure sera visible dans l'orchestration</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">

                    {/* Nom */}
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                            Nom de la procédure <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            value={nom}
                            onChange={e => setNom(e.target.value)}
                            placeholder="Ex. Ouverture de compte client"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                        />
                    </div>

                    {/* Catégorie */}
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                            Catégorie <span className="text-red-400">*</span>
                        </label>

                        {!isNew ? (
                            <div className="relative">
                                <select
                                    value={selectedCategory}
                                    onChange={e => setSelectedCategory(e.target.value)}
                                    disabled={loadingCats}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-white disabled:text-slate-400"
                                >
                                    <option value="">
                                        {loadingCats ? 'Chargement…' : 'Sélectionner une catégorie'}
                                    </option>
                                    {categories.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            </div>
                        ) : (
                            <input
                                type="text"
                                value={newCategory}
                                onChange={e => setNewCategory(e.target.value)}
                                placeholder="Nom de la nouvelle catégorie"
                                autoFocus
                                className="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                            />
                        )}

                        <button
                            type="button"
                            onClick={() => { setIsNew(v => !v); setSelectedCategory(''); setNewCategory(''); }}
                            className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            {isNew ? 'Choisir une catégorie existante' : 'Créer une nouvelle catégorie'}
                        </button>
                    </div>

                    {/* Aperçu */}
                    {nom.trim() && effectiveCategory && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                            <FolderOpen className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <p className="text-xs text-slate-500 truncate">
                                <span className="font-medium text-slate-700">{effectiveCategory}</span>
                                <span className="mx-1.5 text-slate-300">/</span>
                                {nom.trim()}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                    >
                        <BookMarked className="w-3.5 h-3.5" />
                        {saving ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                </div>
            </div>
        </div>
    );
}
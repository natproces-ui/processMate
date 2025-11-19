import { useState, useEffect } from 'react';
import { SCVRoot, Refs } from '@/lib/types';
import { api } from '@/lib/api';

interface MultiSCVData {
    scvList: SCVRoot[];
    currentIndex: number;
}

export const useFormData = () => {
    const [multiData, setMultiData] = useState<MultiSCVData>({ scvList: [], currentIndex: 0 });
    const [refs, setRefs] = useState<Refs | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            try {
                setLoading(true);
                const [refsData, scvData] = await Promise.all([
                    api.getRefs(),
                    api.generateFull()
                ]);
                setRefs(refsData);
                setMultiData({ scvList: [scvData], currentIndex: 0 });
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load data');
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const currentData = multiData.scvList[multiData.currentIndex] || null;

    // Ajouter un nouveau SCV
    const addNewSCV = async () => {
        try {
            setLoading(true);
            const newSCV = await api.generateFull();
            setMultiData(prev => ({
                scvList: [...prev.scvList, newSCV],
                currentIndex: prev.scvList.length
            }));
        } catch (err) {
            console.error('Failed to add new SCV', err);
        } finally {
            setLoading(false);
        }
    };

    // Supprimer un SCV
    const deleteSCV = (index: number) => {
        if (multiData.scvList.length <= 1) return;

        setMultiData(prev => {
            const newList = prev.scvList.filter((_, i) => i !== index);
            const newIndex = prev.currentIndex >= newList.length
                ? newList.length - 1
                : prev.currentIndex === index
                    ? Math.max(0, index - 1)
                    : prev.currentIndex > index
                        ? prev.currentIndex - 1
                        : prev.currentIndex;

            return {
                scvList: newList,
                currentIndex: newIndex
            };
        });
    };

    // Changer le SCV actif
    const setCurrentSCV = (index: number) => {
        if (index >= 0 && index < multiData.scvList.length) {
            setMultiData(prev => ({ ...prev, currentIndex: index }));
        }
    };

    // Mettre à jour le SCV actuel
    const updateCurrentSCV = (updatedSCV: SCVRoot) => {
        setMultiData(prev => {
            const newList = [...prev.scvList];
            newList[prev.currentIndex] = updatedSCV;
            return { ...prev, scvList: newList };
        });
    };

    // CORRECTION ICI : Accepter l'objet complet au lieu de field/value
    const updateDeposant = (updatedDeposant: any) => {
        if (!currentData) return;
        const updated = {
            ...currentData,
            SCV: {
                ...currentData.SCV,
                identifiantDeposant: updatedDeposant
            }
        };
        updateCurrentSCV(updated);
    };

    const updateContact = (updatedContact: any) => {
        if (!currentData) return;
        const updated = {
            ...currentData,
            SCV: {
                ...currentData.SCV,
                infosContact: updatedContact
            }
        };
        updateCurrentSCV(updated);
    };

    const regenerateDeposant = async () => {
        try {
            const newData = await api.generateDeposant();
            if (!currentData) return;
            const updated = {
                ...currentData,
                SCV: {
                    ...currentData.SCV,
                    identifiantDeposant: newData.identifiantDeposant,
                    infosContact: newData.infosContact
                }
            };
            updateCurrentSCV(updated);
        } catch (err) {
            console.error('Failed to regenerate deposant', err);
        }
    };

    // Gestion des représentants légaux
    const addRepresentantLegal = async () => {
        try {
            if (!currentData) return;
            const newRep = await api.generateRepresentantLegal();
            const updated = {
                ...currentData,
                SCV: {
                    ...currentData.SCV,
                    representantLegal: [...currentData.SCV.representantLegal, newRep]
                }
            };
            updateCurrentSCV(updated);
        } catch (err) {
            console.error('Failed to add representant legal', err);
        }
    };

    const updateRepresentantLegal = (index: number, newRep: any) => {
        if (!currentData) return;
        const reps = [...currentData.SCV.representantLegal];
        reps[index] = newRep;
        const updated = {
            ...currentData,
            SCV: { ...currentData.SCV, representantLegal: reps }
        };
        updateCurrentSCV(updated);
    };

    const deleteRepresentantLegal = (index: number) => {
        if (!currentData) return;
        const reps = currentData.SCV.representantLegal.filter((_, i) => i !== index);
        const updated = {
            ...currentData,
            SCV: {
                ...currentData.SCV,
                representantLegal: reps
            }
        };
        updateCurrentSCV(updated);
    };

    const regenerateRepresentantLegal = async (index: number) => {
        try {
            const newRep = await api.generateRepresentantLegal();
            updateRepresentantLegal(index, newRep);
        } catch (err) {
            console.error('Failed to regenerate representant legal', err);
        }
    };

    // Gestion des héritiers
    const addHeritier = async () => {
        try {
            if (!currentData) return;
            const newHeritier = await api.generateHeritier(currentData.SCV.heritier.length);
            const updated = {
                ...currentData,
                SCV: {
                    ...currentData.SCV,
                    heritier: [...currentData.SCV.heritier, newHeritier],
                    identifiantDeposant: {
                        ...currentData.SCV.identifiantDeposant,
                        nombreHeritiers: currentData.SCV.heritier.length + 1
                    }
                }
            };
            updateCurrentSCV(updated);
        } catch (err) {
            console.error('Failed to add heritier', err);
        }
    };

    const updateHeritier = (index: number, newHeritier: any) => {
        if (!currentData) return;
        const heritiers = [...currentData.SCV.heritier];
        heritiers[index] = newHeritier;
        const updated = {
            ...currentData,
            SCV: { ...currentData.SCV, heritier: heritiers }
        };
        updateCurrentSCV(updated);
    };

    const deleteHeritier = (index: number) => {
        if (!currentData || currentData.SCV.heritier.length <= 1) return;
        const heritiers = currentData.SCV.heritier.filter((_, i) => i !== index);
        const updated = {
            ...currentData,
            SCV: {
                ...currentData.SCV,
                heritier: heritiers,
                identifiantDeposant: {
                    ...currentData.SCV.identifiantDeposant,
                    nombreHeritiers: heritiers.length
                }
            }
        };
        updateCurrentSCV(updated);
    };

    const regenerateHeritier = async (index: number) => {
        try {
            const newHeritier = await api.generateHeritier(index);
            updateHeritier(index, newHeritier);
        } catch (err) {
            console.error('Failed to regenerate heritier', err);
        }
    };

    // Gestion des comptes
    const addCompte = async () => {
        try {
            if (!currentData) return;
            const newCompte = await api.generateCompte(currentData.SCV.identifiantDeposant.idscv);
            const updated = {
                ...currentData,
                SCV: {
                    ...currentData.SCV,
                    compte: [...currentData.SCV.compte, newCompte],
                    identifiantDeposant: {
                        ...currentData.SCV.identifiantDeposant,
                        nombreComptes: currentData.SCV.compte.length + 1
                    }
                }
            };
            updateCurrentSCV(updated);
        } catch (err) {
            console.error('Failed to add compte', err);
        }
    };

    const updateCompte = (index: number, newCompte: any) => {
        if (!currentData) return;
        const comptes = [...currentData.SCV.compte];
        comptes[index] = newCompte;
        const updated = {
            ...currentData,
            SCV: { ...currentData.SCV, compte: comptes }
        };
        updateCurrentSCV(updated);
    };

    const deleteCompte = (index: number) => {
        if (!currentData || currentData.SCV.compte.length <= 1) return;
        const comptes = currentData.SCV.compte.filter((_, i) => i !== index);
        const updated = {
            ...currentData,
            SCV: {
                ...currentData.SCV,
                compte: comptes,
                identifiantDeposant: {
                    ...currentData.SCV.identifiantDeposant,
                    nombreComptes: comptes.length
                }
            }
        };
        updateCurrentSCV(updated);
    };

    const regenerateCompte = async (index: number) => {
        try {
            if (!currentData) return;
            const newCompte = await api.generateCompte(currentData.SCV.identifiantDeposant.idscv);
            updateCompte(index, newCompte);
        } catch (err) {
            console.error('Failed to regenerate compte', err);
        }
    };

    const regenerateAll = async () => {
        try {
            setLoading(true);
            const newData = await api.generateFull();
            updateCurrentSCV(newData);
        } catch (err) {
            console.error('Failed to regenerate all', err);
        } finally {
            setLoading(false);
        }
    };

    // Exporter tous les SCV en un seul fichier
    const exportAllSCV = () => {
        const allData = multiData.scvList.map(scv => scv.SCV);
        return JSON.stringify(allData, null, 2);
    };

    return {
        data: currentData,
        refs,
        loading,
        error,
        scvCount: multiData.scvList.length,
        currentIndex: multiData.currentIndex,
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
    };
};
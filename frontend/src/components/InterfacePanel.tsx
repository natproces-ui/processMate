'use client';

import { useState } from "react";
import {
    Network, ChevronDown, ChevronUp, CheckCircle2,
    AlertCircle, HelpCircle, Edit3, X, Save, Tag
} from "lucide-react";
import {
    InterfaceDetectee,
    InterfaceResume,
    NiveauConfiance,
    TacheLiee,
    TYPE_DEVELOPPEMENT_OPTIONS,
    TYPE_FLUX_OPTIONS,
    SENS_FLUX_OPTIONS,
    OUI_NON_OPTIONS,
} from "@/logic/interfaceTypes";

// ─────────────────────────────────────────────
// Badge niveau de confiance
// ─────────────────────────────────────────────

function ConfidenceBadge({ niveau }: { niveau: NiveauConfiance }) {
    const config = {
        Confirmée: {
            icon: <CheckCircle2 className="w-3.5 h-3.5" />,
            className: "bg-green-100 text-green-700 border border-green-200",
        },
        Suggérée: {
            icon: <AlertCircle className="w-3.5 h-3.5" />,
            className: "bg-orange-100 text-orange-700 border border-orange-200",
        },
        Incertaine: {
            icon: <HelpCircle className="w-3.5 h-3.5" />,
            className: "bg-gray-100 text-gray-500 border border-gray-200",
        },
    };
    const { icon, className } = config[niveau];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
            {icon}{niveau}
        </span>
    );
}

// ─────────────────────────────────────────────
// Liste des tâches liées
// ─────────────────────────────────────────────

function TachesLiees({ taches }: { taches: TacheLiee[] }) {
    return (
        <div className="mt-2 mb-3">
            <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                Tâches concernées ({taches.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
                {taches.map((t) => (
                    <span
                        key={t.id_tache}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded"
                    >
                        <span className="font-mono text-blue-400">#{t.id_tache}</span>
                        {t.nom_etape}
                    </span>
                ))}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// Ligne de champ éditable
// ─────────────────────────────────────────────

function FieldRow({
    label, fieldKey, value, options, isIncomplete, onChange,
}: {
    label: string;
    fieldKey: string;
    value: string;
    options?: string[];
    isIncomplete: boolean;
    onChange: (key: string, val: string) => void;
}) {
    const isUnknown = value === "Inconnu" || value === "À identifier" || value === "";
    const baseClass = `flex-1 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400`;
    const unknownClass = "border-red-300 bg-red-50 text-red-700";
    const normalClass = "border-gray-200 bg-white text-gray-800";

    return (
        <div className={`flex items-center gap-3 py-1.5 ${isIncomplete ? "bg-red-50 -mx-2 px-2 rounded" : ""}`}>
            <span className="text-xs text-gray-500 w-36 shrink-0 font-medium">{label}</span>
            {options ? (
                <select
                    value={value}
                    onChange={(e) => onChange(fieldKey, e.target.value)}
                    className={`${baseClass} ${isUnknown ? unknownClass : normalClass}`}
                >
                    {options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            ) : (
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(fieldKey, e.target.value)}
                    className={`${baseClass} ${isUnknown ? unknownClass : normalClass}`}
                    placeholder="À compléter..."
                />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────
// Carte d'une interface (dédupliquée)
// ─────────────────────────────────────────────

function InterfaceCard({
    iface, onUpdate,
}: {
    iface: InterfaceDetectee;
    onUpdate: (updated: InterfaceDetectee) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<InterfaceDetectee>(iface);

    // Fallbacks défensifs — le backend peut renvoyer undefined sur certains champs
    const tachesLiees = iface.taches_liees ?? [];
    const champsACompleter = iface.champs_a_completer ?? [];
    const incompleteCount = champsACompleter.length;

    const handleFieldChange = (key: string, val: string) => {
        setDraft((prev) => {
            const updated = { ...prev, [key]: val };
            // Retire ce champ de champs_a_completer s'il est renseigné
            if (val !== "Inconnu" && val !== "À identifier" && val !== "") {
                updated.champs_a_completer = prev.champs_a_completer.filter((f) => f !== key);
            }
            return updated;
        });
    };

    const handleSave = () => { onUpdate(draft); setEditing(false); };
    const handleCancel = () => { setDraft(iface); setEditing(false); };

    const display = editing ? draft : iface;

    // Couleur de fond selon confiance
    const borderColor = {
        Confirmée: "border-green-200 bg-green-50/30",
        Suggérée: "border-orange-200 bg-orange-50/30",
        Incertaine: "border-gray-200 bg-gray-50/30",
    }[iface.niveau_confiance];

    return (
        <div className={`border rounded-lg overflow-hidden transition-all ${borderColor}`}>

            {/* En-tête */}
            <div
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white/50 transition-colors"
                onClick={() => !editing && setExpanded(!expanded)}
            >
                <Network className="w-4 h-4 text-blue-500 shrink-0" />

                <div className="flex-1 min-w-0">
                    {/* Nom du système — titre principal */}
                    <p className="font-semibold text-sm text-gray-800">{iface.application_cible}</p>
                    {/* Nombre de tâches liées */}
                    <p className="text-xs text-gray-400 mt-0.5">
                        {tachesLiees.length} tâche{tachesLiees.length > 1 ? "s" : ""} concernée{tachesLiees.length > 1 ? "s" : ""}
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <ConfidenceBadge niveau={iface.niveau_confiance} />
                    {incompleteCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                            {incompleteCount} à compléter
                        </span>
                    )}
                    <span className="text-xs font-mono text-gray-300">{iface.id_interface}</span>
                    {expanded
                        ? <ChevronUp className="w-4 h-4 text-gray-400" />
                        : <ChevronDown className="w-4 h-4 text-gray-400" />
                    }
                </div>
            </div>

            {/* Corps expandé */}
            {expanded && (
                <div className="px-4 pb-4 border-t border-gray-100 bg-white/60">

                    {/* Tâches liées — pill tags */}
                    <TachesLiees taches={tachesLiees} />

                    {/* Description */}
                    <div className="mb-3 p-2 bg-blue-50 rounded text-xs text-blue-800 italic">
                        {display.description_fonctionnelle || "Aucune description disponible"}
                    </div>

                    {/* Champs qualifiables */}
                    <div className="space-y-0.5">
                        <FieldRow label="Application cible" fieldKey="application_cible" value={display.application_cible}
                            isIncomplete={iface.champs_a_completer.includes("application_cible")} onChange={handleFieldChange} />
                        <FieldRow label="Type développement" fieldKey="type_developpement" value={display.type_developpement}
                            options={TYPE_DEVELOPPEMENT_OPTIONS}
                            isIncomplete={iface.champs_a_completer.includes("type_developpement")} onChange={handleFieldChange} />
                        <FieldRow label="Type de flux" fieldKey="type_flux" value={display.type_flux}
                            options={TYPE_FLUX_OPTIONS}
                            isIncomplete={iface.champs_a_completer.includes("type_flux")} onChange={handleFieldChange} />
                        <FieldRow label="Sens du flux" fieldKey="sens_flux" value={display.sens_flux}
                            options={SENS_FLUX_OPTIONS}
                            isIncomplete={iface.champs_a_completer.includes("sens_flux")} onChange={handleFieldChange} />
                        <FieldRow label="Intra-module" fieldKey="flux_intra_module" value={display.flux_intra_module}
                            options={OUI_NON_OPTIONS}
                            isIncomplete={iface.champs_a_completer.includes("flux_intra_module")} onChange={handleFieldChange} />
                        <FieldRow label="Vers CBS" fieldKey="flux_vers_CBS" value={display.flux_vers_CBS}
                            options={OUI_NON_OPTIONS}
                            isIncomplete={iface.champs_a_completer.includes("flux_vers_CBS")} onChange={handleFieldChange} />
                        <FieldRow label="Interface jetable" fieldKey="interface_jetable" value={display.interface_jetable}
                            options={OUI_NON_OPTIONS}
                            isIncomplete={iface.champs_a_completer.includes("interface_jetable")} onChange={handleFieldChange} />
                    </div>

                    {/* Actions */}
                    {editing ? (
                        <div className="flex gap-2 mt-3">
                            <button onClick={handleSave}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors">
                                <Save className="w-3.5 h-3.5" />Enregistrer
                            </button>
                            <button onClick={handleCancel}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300 transition-colors">
                                <X className="w-3.5 h-3.5" />Annuler
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={(e) => { e.stopPropagation(); setEditing(true); setExpanded(true); }}
                            className="flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200 transition-colors">
                            <Edit3 className="w-3.5 h-3.5" />Compléter / Corriger
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────

interface InterfacePanelProps {
    interfaces: InterfaceDetectee[];
    resume: InterfaceResume;
    onInterfacesChange: (updated: InterfaceDetectee[]) => void;
}

export default function InterfacePanel({ interfaces, resume, onInterfacesChange }: InterfacePanelProps) {
    const [filter, setFilter] = useState<NiveauConfiance | "Toutes">("Toutes");

    const handleUpdate = (updated: InterfaceDetectee) => {
        onInterfacesChange(interfaces.map((i) =>
            i.id_interface === updated.id_interface ? updated : i
        ));
    };

    const filtered = filter === "Toutes"
        ? interfaces
        : interfaces.filter((i) => i.niveau_confiance === filter);

    const totalIncomplete = interfaces.filter((i) => i.champs_a_completer.length > 0).length;

    return (
        <div className="border border-blue-200 rounded-xl bg-blue-50/30 overflow-hidden">

            {/* En-tête panneau */}
            <div className="p-4 border-b border-blue-200 bg-white/60">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                        <Network className="w-5 h-5 text-blue-600" />
                        <h3 className="font-semibold text-gray-800">Interfaces applicatives</h3>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                            {resume.total_interfaces} système{resume.total_interfaces > 1 ? "s" : ""}
                        </span>
                    </div>
                    {totalIncomplete > 0 && (
                        <span className="text-xs text-red-600 font-medium bg-red-50 px-2 py-1 rounded border border-red-200">
                            ⚠️ {totalIncomplete} à qualifier
                        </span>
                    )}
                </div>

                {/* Compteurs */}
                <div className="flex gap-4 mt-3 text-xs">
                    <span className="flex items-center gap-1 text-green-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {resume.confirmees} confirmée{resume.confirmees > 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1 text-orange-700">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {resume.suggerees} suggérée{resume.suggerees > 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1 text-gray-500">
                        <HelpCircle className="w-3.5 h-3.5" />
                        {resume.incertaines} incertaine{resume.incertaines > 1 ? "s" : ""}
                    </span>
                </div>

                {/* Systèmes identifiés */}
                {resume.systemes_identifies && resume.systemes_identifies.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {resume.systemes_identifies.map((s) => (
                            <span key={s} className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs rounded">
                                {s}
                            </span>
                        ))}
                    </div>
                )}

                {/* Filtres */}
                <div className="flex gap-2 mt-3">
                    {(["Toutes", "Confirmée", "Suggérée", "Incertaine"] as const).map((f) => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-3 py-1 text-xs rounded-full transition-colors ${filter === f
                                ? "bg-blue-600 text-white"
                                : "bg-white text-gray-600 border border-gray-200 hover:border-blue-300"
                                }`}>
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Liste */}
            <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                {filtered.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">Aucune interface pour ce filtre</p>
                ) : (
                    filtered.map((iface) => (
                        <InterfaceCard key={iface.id_interface} iface={iface} onUpdate={handleUpdate} />
                    ))
                )}
            </div>
        </div>
    );
}
'use client';

import { useState } from "react";
import { generateBPMN, Table1Row } from "@/logic/bpmnGenerator";
import BPMNViewer from "@/components/BPMNViewer";
import ImageUploadSection from "@/components/ImgUpload";
import { FileText, Mic, Square, Sparkles, FileDown, RotateCcw, Trash2, Plus, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Info } from "lucide-react";

// ===== DONNÉES PAR DÉFAUT (Processus création compte bancaire) =====
const defaultData: Table1Row[] = [
    { id: '1', étape: 'Début du processus', typeBpmn: 'StartEvent', département: 'Front Office', acteur: 'Client', condition: '', outputOui: '2', outputNon: '', outil: 'Portail web' },
    { id: '2', étape: 'Prendre rendez-vous en ligne', typeBpmn: 'Task', département: 'Front Office', acteur: 'Client', condition: '', outputOui: '3', outputNon: '', outil: 'Application mobile / Site' },
    { id: '3', étape: 'Accueillir le client', typeBpmn: 'Task', département: 'Commercial', acteur: 'Accueil client', condition: '', outputOui: '4', outputNon: '', outil: 'CRM' },
    { id: '4', étape: 'Signer la fiche d\'accueil', typeBpmn: 'Task', département: 'Commercial', acteur: 'Vente', condition: '', outputOui: '5', outputNon: '', outil: 'CRM' },
    { id: '5', étape: 'Collecter les informations', typeBpmn: 'Task', département: 'Commercial', acteur: 'Vente', condition: '', outputOui: '6', outputNon: '', outil: 'Formulaire CRM' },
    { id: '6', étape: 'Fournir les documents', typeBpmn: 'Task', département: 'Front Office', acteur: 'Client', condition: '', outputOui: '7', outputNon: '', outil: 'Portail client' },
    { id: '7', étape: 'Scanner les documents', typeBpmn: 'Task', département: 'Commercial', acteur: 'Gestion administrative', condition: '', outputOui: '8', outputNon: '', outil: 'Scanner / GED' },
    { id: '8', étape: 'Renseigner le CRM', typeBpmn: 'Task', département: 'Commercial', acteur: 'Vente', condition: '', outputOui: '9', outputNon: '', outil: 'CRM' },
    { id: '9', étape: 'Vérifier complétude dossier', typeBpmn: 'ExclusiveGateway', département: 'Commercial', acteur: 'Vente', condition: 'Infos complètes ?', outputOui: '10', outputNon: '6', outil: '' },
    { id: '10', étape: 'Soumettre le dossier', typeBpmn: 'Task', département: 'Commercial', acteur: 'Vente', condition: '', outputOui: '11', outputNon: '', outil: 'CRM' },
    { id: '11', étape: 'Recevoir le dossier', typeBpmn: 'Task', département: 'Conformité', acteur: 'KYC', condition: '', outputOui: '12', outputNon: '', outil: 'Outil conformité' },
    { id: '12', étape: 'Vérifier authenticité des documents', typeBpmn: 'Task', département: 'Conformité', acteur: 'KYC', condition: '', outputOui: '13', outputNon: '', outil: 'GED / KYC' },
    { id: '13', étape: 'Validation conformité documents', typeBpmn: 'ExclusiveGateway', département: 'Conformité', acteur: 'Contrôle documentaire', condition: 'Docs authentiques ?', outputOui: '14', outputNon: '30', outil: '' },
    { id: '14', étape: 'Lancer contrôle KYC', typeBpmn: 'Task', département: 'Conformité', acteur: 'KYC', condition: '', outputOui: '15', outputNon: '', outil: 'Outil conformité' },
    { id: '15', étape: 'Consulter bases externes', typeBpmn: 'Task', département: 'Conformité', acteur: 'Contrôle risque', condition: '', outputOui: '16', outputNon: '', outil: 'Plateforme KYC' },
    { id: '16', étape: 'Vérification conformité KYC', typeBpmn: 'ExclusiveGateway', département: 'Conformité', acteur: 'Contrôle risque', condition: 'KYC OK ?', outputOui: '17', outputNon: '30', outil: '' },
    { id: '17', étape: 'Analyser le profil risque', typeBpmn: 'Task', département: 'Conformité', acteur: 'Contrôle risque', condition: '', outputOui: '18', outputNon: '', outil: 'Outil scoring' },
    { id: '18', étape: 'Décision sur profil risque', typeBpmn: 'ExclusiveGateway', département: 'Conformité', acteur: 'Contrôle risque', condition: 'Profil acceptable ?', outputOui: '19', outputNon: '31', outil: '' },
    { id: '19', étape: 'Valider le dossier', typeBpmn: 'Task', département: 'Conformité', acteur: 'KYC', condition: '', outputOui: '20', outputNon: '', outil: 'Application conformité' },
    { id: '20', étape: 'Notifier le Back Office', typeBpmn: 'Task', département: 'Conformité', acteur: 'KYC', condition: '', outputOui: '21', outputNon: '', outil: 'Email interne' },
    { id: '21', étape: 'Créer le compte bancaire', typeBpmn: 'Task', département: 'Back Office', acteur: 'Comptabilité', condition: '', outputOui: '22', outputNon: '', outil: 'Core Banking' },
    { id: '22', étape: 'Générer l\'IBAN', typeBpmn: 'Task', département: 'Back Office', acteur: 'Comptabilité', condition: '', outputOui: '23', outputNon: '', outil: 'Core Banking' },
    { id: '23', étape: 'Configurer les services', typeBpmn: 'Task', département: 'Back Office', acteur: 'Opérations', condition: '', outputOui: '24', outputNon: '', outil: 'Outil interne' },
    { id: '24', étape: 'Envoyer demande d\'accès IT', typeBpmn: 'Task', département: 'Back Office', acteur: 'Opérations', condition: '', outputOui: '25', outputNon: '', outil: 'Ticket IT' },
    { id: '25', étape: 'Créer utilisateur système', typeBpmn: 'Task', département: 'IT', acteur: 'Support technique', condition: '', outputOui: '26', outputNon: '', outil: 'Active Directory' },
    { id: '26', étape: 'Notifier le Commercial', typeBpmn: 'Task', département: 'IT', acteur: 'Support technique', condition: '', outputOui: '27', outputNon: '', outil: 'Email interne' },
    { id: '27', étape: 'Informer le client', typeBpmn: 'Task', département: 'Commercial', acteur: 'Accueil client', condition: '', outputOui: '28', outputNon: '', outil: 'CRM / Email' },
    { id: '28', étape: 'Confirmer réception', typeBpmn: 'Task', département: 'Front Office', acteur: 'Client', condition: '', outputOui: '29', outputNon: '32', outil: 'Application mobile' },
    { id: '29', étape: 'Compte créé avec succès', typeBpmn: 'EndEvent', département: 'Front Office', acteur: 'Client', condition: '', outputOui: '', outputNon: '', outil: '' },
    { id: '30', étape: 'Retourner dossier au Commercial', typeBpmn: 'Task', département: 'Conformité', acteur: 'Contrôle documentaire', condition: '', outputOui: '6', outputNon: '', outil: 'Email interne' },
    { id: '31', étape: 'Escalader à la Direction', typeBpmn: 'Task', département: 'Conformité', acteur: 'Contrôle risque', condition: '', outputOui: '33', outputNon: '', outil: 'Email interne' },
    { id: '33', étape: 'Analyser exception', typeBpmn: 'Task', département: 'Direction', acteur: 'Risques', condition: '', outputOui: '34', outputNon: '', outil: 'Outil direction' },
    { id: '34', étape: 'Décision Direction', typeBpmn: 'ExclusiveGateway', département: 'Direction', acteur: 'Risques', condition: 'Approuver ?', outputOui: '19', outputNon: '35', outil: '' },
    { id: '35', étape: 'Rejeter définitivement', typeBpmn: 'Task', département: 'Direction', acteur: 'Risques', condition: '', outputOui: '36', outputNon: '', outil: 'Outil direction' },
    { id: '36', étape: 'Demande rejetée', typeBpmn: 'EndEvent', département: 'Direction', acteur: 'Risques', condition: '', outputOui: '', outputNon: '', outil: '' },
    { id: '32', étape: 'Annuler la demande', typeBpmn: 'Task', département: 'Front Office', acteur: 'Client', condition: '', outputOui: '37', outputNon: '', outil: 'Application mobile' },
    { id: '37', étape: 'Notifier annulation', typeBpmn: 'Task', département: 'Commercial', acteur: 'Accueil client', condition: '', outputOui: '38', outputNon: '', outil: 'Email interne' },
    { id: '38', étape: 'Processus annulé', typeBpmn: 'EndEvent', département: 'Commercial', acteur: 'Accueil client', condition: '', outputOui: '', outputNon: '', outil: '' },
];

export default function VoiceProcessPage() {
    const [data, setData] = useState<Table1Row[]>(defaultData);
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [improving, setImproving] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showDiagram, setShowDiagram] = useState(false);
    const [bpmnXml, setBpmnXml] = useState<string>("");
    const [guideOpen, setGuideOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    const showError = (message: string) => {
        setError(message);
        setTimeout(() => setError(null), 5000);
    };

    const showSuccess = (message: string) => {
        setSuccess(message);
        setTimeout(() => setSuccess(null), 4000);
    };

    // ===== GESTION IMAGE =====
    const handleImageWorkflowExtracted = (workflow: Table1Row[]) => {
        setData(workflow);
        setShowDiagram(false);
        setBpmnXml("");
    };

    // ===== AMÉLIORATION IA =====
    const handleImproveWorkflow = async () => {
        if (data.length === 0) {
            showError("Le tableau est vide, rien à améliorer");
            return;
        }

        setImproving(true);

        try {
            const response = await fetch("http://localhost:8002/api/img-to-bpmn/improve", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ workflow: data })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.detail || "Erreur lors de l'amélioration");
            }

            setData(result.workflow);
            setShowDiagram(false);
            setBpmnXml("");

            // Affichage des améliorations
            const improvements = result.metadata?.improvements;
            if (improvements) {
                const msg = `Workflow amélioré ! ${improvements.steps_reformulated || 0} étape(s) reformulée(s), ${improvements.actors_clarified || 0} acteur(s) clarifié(s), ${improvements.tools_identified || 0} outil(s) identifié(s)`;
                showSuccess(msg);
            } else {
                showSuccess("Workflow amélioré avec succès !");
            }

        } catch (err: any) {
            showError(err.message || "Erreur lors de l'amélioration du workflow");
        } finally {
            setImproving(false);
        }
    };

    // ===== GESTION VOCAL =====
    const toggleRecording = async () => {
        if (!recording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const recorder = new MediaRecorder(stream);
                const chunks: BlobPart[] = [];

                recorder.ondataavailable = (e) => chunks.push(e.data);

                recorder.onstop = async () => {
                    setProcessing(true);
                    const blob = new Blob(chunks, { type: "audio/webm" });
                    const formData = new FormData();
                    formData.append("file", blob, "audio.webm");

                    try {
                        const res = await fetch("http://localhost:8002/api/transcribe", {
                            method: "POST",
                            body: formData
                        });
                        const result = await res.json();

                        if (result?.error) {
                            showError(result.error);
                            return;
                        }

                        if (result?.parsedData && Array.isArray(result.parsedData)) {
                            const newRows: Table1Row[] = result.parsedData
                                .filter((item: any) => item.étape && item.acteur)
                                .map((item: any) => ({
                                    id: crypto.randomUUID(),
                                    étape: item.étape || "",
                                    typeBpmn: item.typeBpmn || 'Task',
                                    département: item.département || "",
                                    acteur: item.acteur || "",
                                    condition: item.condition || "",
                                    outputOui: item.outputOui || "",
                                    outputNon: item.outputNon || "",
                                    outil: item.outil || "",
                                }));

                            if (newRows.length > 0) {
                                setData((prev) => [...prev, ...newRows]);
                                showSuccess(`${newRows.length} ligne(s) ajoutée(s)`);
                            } else {
                                showError("Aucune ligne valide extraite");
                            }
                        }
                    } catch (e: any) {
                        showError("Erreur de transcription");
                    } finally {
                        setProcessing(false);
                        stream.getTracks().forEach(track => track.stop());
                    }
                };

                recorder.start();
                setMediaRecorder(recorder);
                setRecording(true);
            } catch (err) {
                showError("Impossible d'accéder au microphone");
            }
        } else {
            mediaRecorder?.stop();
            setRecording(false);
        }
    };

    // ===== GESTION BPMN =====
    const handleGenerateBPMN = () => {
        try {
            const xml = generateBPMN(data);
            setBpmnXml(xml);
            setShowDiagram(true);
            showSuccess("Diagramme BPMN généré avec succès !");
        } catch (err: any) {
            showError(err.message || "Erreur lors de la génération du BPMN");
        }
    };

    const downloadBPMN = () => {
        if (!bpmnXml) {
            showError("Générez d'abord le diagramme");
            return;
        }

        const blob = new Blob([bpmnXml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'process.bpmn';
        a.click();
        URL.revokeObjectURL(url);
        showSuccess("Fichier BPMN téléchargé !");
    };

    const resetToDefault = () => {
        if (confirm("Réinitialiser au processus par défaut ? Toutes les modifications seront perdues.")) {
            setData(defaultData);
            setShowDiagram(false);
            setBpmnXml("");
            showSuccess("Tableau réinitialisé au processus par défaut");
        }
    };

    const clearTable = () => {
        if (confirm("Vider complètement le tableau ?")) {
            setData([]);
            setShowDiagram(false);
            setBpmnXml("");
            showSuccess("Tableau vidé");
        }
    };

    // ===== GESTION TABLEAU =====
    const handleChange = (index: number, field: keyof Table1Row, value: string) => {
        const updated = [...data];
        if (field === "typeBpmn") {
            updated[index][field] = value as Table1Row["typeBpmn"];
            if (value !== "ExclusiveGateway") {
                updated[index].condition = "";
                updated[index].outputNon = "";
            }
        } else {
            updated[index][field] = value as any;
        }
        setData(updated);
    };

    const handleAddRow = () => {
        const newRow: Table1Row = {
            id: crypto.randomUUID(),
            étape: "",
            typeBpmn: "Task",
            département: "",
            acteur: "",
            condition: "",
            outputOui: "",
            outputNon: "",
            outil: "",
        };
        setData([...data, newRow]);
    };

    const handleDeleteRow = (index: number) => {
        setData(data.filter((_, i) => i !== index));
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-2">ProcessMate</h1>
            <p className="text-gray-600 mb-6">
                Votre compagnon pour des formalisations rapides. Remplissez le tableau par <strong>image</strong>, <strong>vocal</strong> ou <strong>manuellement</strong>,
                puis générez votre diagramme BPMN
            </p>

            {/* NOTIFICATIONS */}
            {error && (
                <div className="mb-4 p-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <strong>Erreur :</strong> {error}
                    </div>
                </div>
            )}

            {success && (
                <div className="mb-4 p-4 bg-green-100 border-l-4 border-green-500 text-green-700 rounded flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <span>{success}</span>
                </div>
            )}

            {/* SECTION IMAGE UPLOAD */}
            <ImageUploadSection
                onWorkflowExtracted={handleImageWorkflowExtracted}
                onError={showError}
                onSuccess={showSuccess}
            />

            {/* GUIDE BPMN RÉTRACTABLE */}
            <div className="mb-6 bg-blue-50 border-l-4 border-blue-500 rounded overflow-hidden">
                <button
                    onClick={() => setGuideOpen(!guideOpen)}
                    className="w-full p-4 flex items-center justify-between hover:bg-blue-100 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <Info className="w-5 h-5 text-blue-700" />
                        <h2 className="font-semibold text-blue-900">Guide d'utilisation du tableau</h2>
                    </div>
                    {guideOpen ? (
                        <ChevronUp className="w-5 h-5 text-blue-700" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-blue-700" />
                    )}
                </button>

                {guideOpen && (
                    <div className="px-4 pb-4">
                        <ul className="text-sm text-blue-800 space-y-1">
                            <li><strong>StartEvent / EndEvent</strong> : Points de départ et d'arrivée du processus</li>
                            <li><strong>Task</strong> : Tâche séquentielle avec un descriptif responsable</li>
                            <li><strong>ExclusiveGateway</strong> : Point de décision (remplir la condition)</li>
                            <li><strong>Si Oui/Si Non</strong> : Utilisez les IDs d'étapes pour connecter les étapes</li>
                            <li><strong>Acteur</strong> : Définit les swimlanes (Client, Vente, KYC, etc.)</li>
                            <li><strong>Améliorer avec IA</strong> : Gemini reformule et optimise votre processus</li>
                        </ul>
                    </div>
                )}
            </div>

            {/* ACTIONS PRINCIPALES */}
            <div className="mb-6 flex gap-4 flex-wrap">
                <button
                    onClick={toggleRecording}
                    disabled={processing}
                    className={`px-6 py-3 rounded-lg text-white font-semibold transition-all flex items-center gap-2 ${recording
                        ? "bg-red-600 hover:bg-red-700 animate-pulse"
                        : processing
                            ? "bg-gray-400 cursor-not-allowed"
                            : "bg-green-600 hover:bg-green-700"
                        }`}
                >
                    {processing ? (
                        "Traitement..."
                    ) : recording ? (
                        <>
                            <Square className="w-4 h-4" />
                            Arrêter
                        </>
                    ) : (
                        <>
                            <Mic className="w-4 h-4" />
                            Enregistrer
                        </>
                    )}
                </button>

                <button
                    onClick={handleImproveWorkflow}
                    disabled={data.length === 0 || improving}
                    className={`px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 ${improving
                        ? "bg-yellow-400 text-gray-800 cursor-wait animate-pulse"
                        : "bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:from-yellow-600 hover:to-orange-600"
                        } disabled:bg-gray-400 disabled:cursor-not-allowed`}
                >
                    <Sparkles className="w-4 h-4" />
                    {improving ? "Amélioration en cours..." : "Améliorer avec IA"}
                </button>

                <button
                    onClick={handleGenerateBPMN}
                    disabled={data.length === 0}
                    className="px-6 py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                    <FileText className="w-4 h-4" />
                    Générer le BPMN
                </button>

                {bpmnXml && (
                    <button
                        onClick={downloadBPMN}
                        className="px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all flex items-center gap-2"
                    >
                        <FileDown className="w-4 h-4" />
                        Télécharger BPMN
                    </button>
                )}

                <button
                    onClick={resetToDefault}
                    className="px-6 py-3 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-all flex items-center gap-2"
                >
                    <RotateCcw className="w-4 h-4" />
                    Réinitialiser
                </button>

                <button
                    onClick={clearTable}
                    className="px-6 py-3 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600 transition-all flex items-center gap-2"
                >
                    <Trash2 className="w-4 h-4" />
                    Vider
                </button>
            </div>

            {/* DIAGRAMME BPMN */}
            {showDiagram && bpmnXml && (
                <div className="mb-6">
                    <BPMNViewer
                        xml={bpmnXml}
                        height="600px"
                        onClose={() => setShowDiagram(false)}
                        onError={(err) => showError(err)}
                    />
                </div>
            )}

            {/* TABLEAU ÉDITABLE */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="bg-gray-800 text-white p-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Tableau du processus ({data.length} étapes)
                    </h2>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-sm">
                        <thead className="bg-gray-700 text-white">
                            <tr>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">ID</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Étape</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Type BPMN</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Département</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Acteur</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Condition</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Si Oui</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Si Non</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Outil</th>
                                <th className="border border-gray-600 px-3 py-2 text-left font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="text-center py-12 text-gray-500">
                                        <div className="flex flex-col items-center gap-3">
                                            <FileText className="w-12 h-12 text-gray-300" />
                                            <p className="text-lg font-semibold">Tableau vide</p>
                                            <p className="text-sm">
                                                Uploadez une image, enregistrez vocalement ou ajoutez manuellement des lignes
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                data.map((row, i) => (
                                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="border border-gray-300 px-2 py-1 text-center font-mono text-xs bg-gray-100">
                                            {row.id}
                                        </td>
                                        <td className="border border-gray-300 p-1">
                                            <input
                                                className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-400"
                                                value={row.étape}
                                                onChange={e => handleChange(i, "étape", e.target.value)}
                                                placeholder="Nom de l'étape"
                                            />
                                        </td>
                                        <td className="border border-gray-300 p-1">
                                            <select
                                                aria-label="Type BPMN"
                                                className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-400"
                                                value={row.typeBpmn}
                                                onChange={e => handleChange(i, "typeBpmn", e.target.value)}
                                            >
                                                <option value="StartEvent">Start Event</option>
                                                <option value="Task">Task</option>
                                                <option value="ExclusiveGateway">Gateway</option>
                                                <option value="EndEvent">End Event</option>
                                            </select>
                                        </td>
                                        <td className="border border-gray-300 p-1">
                                            <input
                                                className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-400"
                                                value={row.département}
                                                onChange={e => handleChange(i, "département", e.target.value)}
                                                placeholder="Ex: Commercial"
                                            />
                                        </td>
                                        <td className="border border-gray-300 p-1">
                                            <input
                                                className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-400"
                                                value={row.acteur}
                                                onChange={e => handleChange(i, "acteur", e.target.value)}
                                                placeholder="Ex: Vente"
                                            />
                                        </td>
                                        <td className="border border-gray-300 p-1">
                                            <input
                                                className={`w-full px-2 py-1 border rounded ${row.typeBpmn !== "ExclusiveGateway" ? 'bg-gray-100' : ''
                                                    }`}
                                                value={row.condition}
                                                onChange={e => handleChange(i, "condition", e.target.value)}
                                                placeholder={row.typeBpmn === "ExclusiveGateway" ? "Question ?" : "—"}
                                                disabled={row.typeBpmn !== "ExclusiveGateway"}
                                            />
                                        </td>
                                        <td className="border border-gray-300 p-1">
                                            <input
                                                className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-400"
                                                value={row.outputOui}
                                                onChange={e => handleChange(i, "outputOui", e.target.value)}
                                                placeholder="ID suivant"
                                            />
                                        </td>
                                        <td className="border border-gray-300 p-1">
                                            <input
                                                className={`w-full px-2 py-1 border rounded ${row.typeBpmn !== "ExclusiveGateway" ? 'bg-gray-100' : ''
                                                    }`}
                                                value={row.outputNon}
                                                onChange={e => handleChange(i, "outputNon", e.target.value)}
                                                placeholder={row.typeBpmn === "ExclusiveGateway" ? "ID alternatif" : "—"}
                                                disabled={row.typeBpmn !== "ExclusiveGateway"}
                                            />
                                        </td>
                                        <td className="border border-gray-300 p-1">
                                            <input
                                                className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-400"
                                                value={row.outil}
                                                onChange={e => handleChange(i, "outil", e.target.value)}
                                                placeholder="Ex: CRM"
                                            />
                                        </td>
                                        <td className="border border-gray-300 p-1 text-center">
                                            <button
                                                type="button"
                                                aria-label="Supprimer cette ligne"
                                                className="text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                                                onClick={() => handleDeleteRow(i)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 bg-gray-50 border-t">
                    <button
                        onClick={handleAddRow}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Ajouter une ligne
                    </button>
                </div>
            </div>
        </div>
    );
}
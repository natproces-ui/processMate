'use client';

import React, { useState } from 'react';
import { Download, FileText, Copy, Check, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { SFDData, SFDFormatType, Format3SFD } from '@/types/sfd';

interface ExtractionResultProps {
    data: SFDData;
    format: SFDFormatType;
    onGenerateWord: () => Promise<{ blob: Blob; filename: string } | null>;
    onDownloadJson: () => void;
    isGenerating?: boolean;
    // Format 3 : URL de téléchargement Word direct depuis le backend
    wordDownloadUrl?: string;
    wordFilename?: string;
}

export default function ExtractionResult({
    data,
    format,
    onGenerateWord,
    onDownloadJson,
    isGenerating = false,
    wordDownloadUrl,
    wordFilename,
}: ExtractionResultProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [wordGenerated, setWordGenerated] = useState(false);
    const [wordDocument, setWordDocument] = useState<{ blob: Blob; filename: string } | null>(null);

    const jsonString = JSON.stringify(data, null, 2);

    const handleCopyJson = async () => {
        try {
            await navigator.clipboard.writeText(jsonString);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleGenerateWord = async () => {
        const result = await onGenerateWord();
        if (result) {
            setWordDocument(result);
            setWordGenerated(true);
        }
    };

    const handleDownloadWord = () => {
        if (!wordDocument) return;
        const url = window.URL.createObjectURL(wordDocument.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = wordDocument.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    // Format 3 : téléchargement direct via URL backend
    const handleDirectDownload = () => {
        if (!wordDownloadUrl) return;
        const a = document.createElement('a');
        a.href = wordDownloadUrl;
        a.download = wordFilename || 'SFD_Portail_Statistique.docx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const projectName = (data as any).nom_projet || 'Projet sans nom';
    const version = (data as any).version || '1.0';
    const date = (data as any).date || (data as any).date_creation || new Date().toISOString().split('T')[0];

    const getFormatLabel = () => {
        if (format === 'format1') return 'Classique';
        if (format === 'format2') return 'Agile';
        return 'Portail Statistique';
    };

    const getStats = () => {
        if (format === 'format1') {
            const d = data as any;
            return [
                { label: 'Modules', value: d.modules?.length || 0 },
                { label: 'Objectifs', value: d.contexte?.objectifs_metier?.length || 0 },
                { label: 'Acteurs', value: d.contexte?.acteurs?.length || 0 },
            ];
        }
        if (format === 'format2') {
            const d = data as any;
            const totalUS = d.epics?.reduce(
                (acc: number, epic: any) => acc + (epic.user_stories?.length || 0), 0
            ) || 0;
            return [
                { label: 'Epics', value: d.epics?.length || 0 },
                { label: 'User Stories', value: totalUS },
                { label: 'Règles Métier', value: d.regles_metier?.length || 0 },
            ];
        }
        // Format 3
        const d = data as Format3SFD;
        return [
            { label: 'Modules', value: d.modules?.length || 0 },
            { label: 'Cas d\'utilisation', value: d.cas_utilisation?.length || 0 },
            { label: 'Endpoints API', value: d.api_endpoints?.length || 0 },
        ];
    };

    const stats = getStats();
    const isFormat3 = format === 'format3';

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-semibold text-slate-900">
                                {projectName}
                            </h3>
                            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                                Généré
                            </span>
                        </div>
                        <p className="text-sm text-slate-500">
                            Version {version}&nbsp;&nbsp;•&nbsp;&nbsp;{date}
                            {isFormat3 && (data as Format3SFD).nom_banque && (
                                <>&nbsp;&nbsp;•&nbsp;&nbsp;{(data as Format3SFD).nom_banque}</>
                            )}
                        </p>
                    </div>
                    <span className="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full whitespace-nowrap">
                        {getFormatLabel()}
                    </span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                    {stats.map((stat, i) => (
                        <div key={i} className="text-center">
                            <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Bouton Word */}
                {isFormat3 && wordDownloadUrl ? (
                    // Format 3 : téléchargement direct, Word déjà généré
                    <button
                        onClick={handleDirectDownload}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium bg-green-600 text-white hover:bg-green-700 shadow-sm transition-all"
                    >
                        <Download className="w-5 h-5" />
                        <span>Télécharger Word</span>
                    </button>
                ) : !wordGenerated ? (
                    <button
                        onClick={handleGenerateWord}
                        disabled={isGenerating}
                        className={`
                            flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all
                            ${isGenerating
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                            }
                        `}
                    >
                        <FileText className="w-5 h-5" />
                        <span>{isGenerating ? 'Génération...' : 'Générer le Word'}</span>
                    </button>
                ) : (
                    <button
                        onClick={handleDownloadWord}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium bg-green-600 text-white hover:bg-green-700 shadow-sm transition-all"
                    >
                        <Download className="w-5 h-5" />
                        <span>Télécharger Word</span>
                    </button>
                )}

                <button
                    onClick={onDownloadJson}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
                >
                    <Download className="w-5 h-5" />
                    <span>Télécharger JSON</span>
                </button>
            </div>

            {/* Confirmation Word format 3 */}
            {isFormat3 && wordDownloadUrl && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <p className="font-medium text-green-900 text-sm">Document Word prêt</p>
                            <p className="text-xs text-green-700 mt-0.5">{wordFilename}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Word généré (format 1/2) */}
            {wordGenerated && wordDocument && !isFormat3 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <p className="font-medium text-green-900 text-sm">Document Word généré</p>
                            <p className="text-xs text-green-700 mt-0.5">{wordDocument.filename}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* JSON Preview */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-medium text-slate-900">Prévisualisation JSON</span>
                    </div>
                    {isExpanded
                        ? <ChevronUp className="w-4 h-4 text-slate-400" />
                        : <ChevronDown className="w-4 h-4 text-slate-400" />
                    }
                </button>

                {isExpanded && (
                    <div className="border-t border-slate-200">
                        <div className="relative">
                            <pre className="p-4 text-xs font-mono text-slate-700 overflow-x-auto max-h-96 overflow-y-auto bg-slate-50">
                                {jsonString}
                            </pre>
                            <button
                                onClick={handleCopyJson}
                                className={`
                                    absolute top-2 right-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                                    ${copied
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                                    }
                                `}
                            >
                                <div className="flex items-center gap-1">
                                    {copied
                                        ? <><Check className="w-3 h-3" /><span>Copié</span></>
                                        : <><Copy className="w-3 h-3" /><span>Copier</span></>
                                    }
                                </div>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
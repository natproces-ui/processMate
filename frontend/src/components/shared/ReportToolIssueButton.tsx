'use client';

// components/shared/ReportToolIssueButton.tsx
//
// "Signaler un problème" pour un outil/écran du référentiel — contrairement à
// JiraLinkButton (relation 1:1 entité↔ticket), un même outil peut accumuler
// plusieurs signalements distincts dans le temps, donc chaque clic génère un
// entity_id neuf (crypto.randomUUID()) plutôt que de réutiliser toolId.

import { useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, Ticket, X } from 'lucide-react';
import { jiraApi } from '@/lib/jiraApi';

interface ReportToolIssueButtonProps {
    toolName: string;
    className?: string;
}

export default function ReportToolIssueButton({ toolName, className = '' }: ReportToolIssueButtonProps) {
    const [open, setOpen] = useState(false);
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ key: string; url: string } | null>(null);

    const handleSubmit = async () => {
        if (!description.trim()) return;
        setSaving(true); setError(null);
        try {
            const res = await jiraApi.createLink({
                entity_type: 'tool_issue',
                entity_id: crypto.randomUUID(),
                summary: `[Outil] ${toolName} — problème signalé`,
                description: `Outil : ${toolName}\n\n${description.trim()}`,
                labels: ['processmate', 'signalement-outil'],
            });
            setResult({ key: res.link.jira_issue_key, url: res.link.jira_issue_url });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erreur');
        } finally {
            setSaving(false);
        }
    };

    const close = () => { setOpen(false); setDescription(''); setResult(null); setError(null); };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                title="Signaler un problème sur cet outil"
                className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 ${className}`}
            >
                <AlertTriangle className="h-3.5 w-3.5" />
                Signaler un problème
            </button>

            {open && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                            <h4 className="text-sm font-bold text-slate-900">Signaler un problème — {toolName}</h4>
                            <button type="button" onClick={close} className="rounded p-1 hover:bg-slate-100">
                                <X className="h-4 w-4 text-slate-500" />
                            </button>
                        </div>

                        <div className="p-4">
                            {result ? (
                                <div className="space-y-3 text-center">
                                    <p className="text-sm text-slate-700">Ticket créé :</p>
                                    <a
                                        href={result.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                                    >
                                        <Ticket className="h-4 w-4" />
                                        {result.key}
                                        <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                </div>
                            ) : (
                                <>
                                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                                        Décrivez le problème
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        rows={4}
                                        placeholder="ex: le champ 'IBAN' n'existe pas sur cet écran, cet outil devrait être intégré à..."
                                        className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        autoFocus
                                    />
                                    {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
                                </>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
                            {result ? (
                                <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                                    Fermer
                                </button>
                            ) : (
                                <>
                                    <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                                        Annuler
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSubmit}
                                        disabled={saving || !description.trim()}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                                    >
                                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                        Créer le ticket
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

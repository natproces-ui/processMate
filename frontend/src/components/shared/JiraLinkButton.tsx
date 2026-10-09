'use client';

// components/shared/JiraLinkButton.tsx
//
// Bouton réutilisable "Créer un ticket Jira" — un seul composant partagé par
// les impacts réglementaires, les tâches de campagne, et tout autre endroit
// où un élément ProcessMate mérite un suivi dans l'outil de delivery de
// l'équipe. Relation 1:1 entre (entityType, entityId) et un ticket Jira — si
// plusieurs tickets doivent pouvoir exister pour la même entité (ex. signaler
// plusieurs problèmes successifs sur un même outil), générer un entityId
// distinct à chaque signalement plutôt que réutiliser celui-ci.

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, Ticket } from 'lucide-react';
import { jiraApi, type JiraEntityType, type JiraLink } from '@/lib/jiraApi';

interface JiraLinkButtonProps {
    entityType: JiraEntityType;
    entityId: string;
    summary: string;
    description?: string;
    priority?: string;
    labels?: string[];
    className?: string;
    /** false pour les types créés automatiquement côté serveur (ex. procedure_task,
     * voir orchestration_tasks_router.py::_auto_create_jira_ticket) — masque le
     * bouton "Créer" quand aucun lien n'existe encore, affiche un état neutre
     * à la place puisque la création n'est pas une action de l'utilisateur ici. */
    manual?: boolean;
    /** Affiche priorité / échéance / labels envoyés à Jira sous le lien. */
    showDetails?: boolean;
    /** Appelé après une synchro qui a fait avancer le statut ProcessMate
     * (procedure_task uniquement — voir sync_task_status_from_jira côté
     * serveur). Permet au parent (TaskTable, TaskDetailDrawer) de rafraîchir
     * son propre état sans repasser par un fetch complet. */
    onTaskStatusSynced?: (newStatus: string) => void;
}

export default function JiraLinkButton({
    entityType, entityId, summary, description, priority, labels, className = '',
    manual = true, showDetails = false, onTaskStatusSynced,
}: JiraLinkButtonProps) {
    const [link, setLink] = useState<JiraLink | null | undefined>(undefined); // undefined = chargement initial
    const [creating, setCreating] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLink(undefined);
        jiraApi.getLink(entityType, entityId)
            .then(res => { if (!cancelled) setLink(res.link); })
            .catch(() => { if (!cancelled) setLink(null); });
        return () => { cancelled = true; };
    }, [entityType, entityId]);

    const handleCreate = async () => {
        setCreating(true); setError(null);
        try {
            const res = await jiraApi.createLink({
                entity_type: entityType, entity_id: entityId, summary, description, priority, labels,
            });
            setLink(res.link);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erreur');
        } finally {
            setCreating(false);
        }
    };

    const handleSync = async () => {
        if (!link) return;
        setSyncing(true);
        try {
            const res = await jiraApi.sync(entityType, entityId);
            setLink(prev => (prev ? { ...prev, jira_status: res.jira_status } : prev));
            if (res.task_status) onTaskStatusSynced?.(res.task_status);
        } catch { /* rafraîchissement silencieux, non bloquant */ }
        finally { setSyncing(false); }
    };

    if (link === undefined) {
        return <Loader2 className={`h-3.5 w-3.5 animate-spin text-slate-300 ${className}`} />;
    }

    if (link) {
        return (
            <div className={className}>
                <div className="inline-flex items-center gap-1.5">
                    <a
                        href={link.jira_issue_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                    >
                        <Ticket className="h-3.5 w-3.5" />
                        {link.jira_issue_key}
                        <ExternalLink className="h-3 w-3" />
                    </a>
                    {link.jira_status && <span className="text-xs text-slate-400">· {link.jira_status}</span>}
                    <button
                        type="button"
                        onClick={handleSync}
                        disabled={syncing}
                        title="Rafraîchir le statut Jira"
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
                    >
                        <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                {showDetails && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                        {link.jira_priority && <span>Priorité : {link.jira_priority}</span>}
                        {link.jira_due_date && <span>· Échéance : {link.jira_due_date}</span>}
                        {link.jira_assignee_email && <span>· Assigné : {link.jira_assignee_email}</span>}
                        {!link.jira_assignee_email && entityType === 'procedure_task' && (
                            <span className="text-amber-500">· Non assigné dans Jira (email introuvable côté Jira)</span>
                        )}
                        {(link.jira_labels ?? []).map(l => (
                            <span key={l} className="rounded bg-slate-100 px-1.5 py-0.5">{l}</span>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (!manual) {
        // Création automatique côté serveur — rien à cliquer, juste un état neutre
        // (soit le serveur n'a pas encore fini, soit Jira n'est pas configuré).
        return <span className={`text-[11px] text-slate-300 ${className}`}>Pas de ticket Jira</span>;
    }

    return (
        <div className={className}>
            <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                title="Créer un ticket Jira lié à cet élément"
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ticket className="h-3.5 w-3.5" />}
                Créer un ticket Jira
            </button>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
}

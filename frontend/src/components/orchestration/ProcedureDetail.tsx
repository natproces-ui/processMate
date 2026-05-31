'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, ArrowLeft, RefreshCw, Lock, MessageSquare, CheckCircle2,
  AlertCircle, Clock, AlertTriangle, Plus, CheckCheck, Calendar, Info,
} from 'lucide-react';
import { orchestrationApi, Procedure, Remark, LifecycleStage, VALID_STATUSES, ProcedureStatus, procedureStatusCls, fmtDate, fmtDateTime } from '@/lib/orchestrationApi';

const STAGE_STATUS_CONFIG = {
  completed:   { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-600', ring: '', label: 'Complété' },
  in_progress: { icon: Clock,        color: 'text-blue-600',  bg: 'bg-blue-600',  ring: 'ring-4 ring-blue-200', label: 'En cours' },
  blocked:     { icon: AlertCircle,  color: 'text-red-600',   bg: 'bg-red-500',   ring: '', label: 'Bloqué' },
  pending:     { icon: Clock,        color: 'text-gray-400',  bg: 'bg-gray-200',  ring: '', label: 'En attente' },
};

const REMARK_TYPE_STYLES: Record<string, string> = {
  remark: 'bg-blue-50 border-blue-200 text-blue-900',
  modification_request: 'bg-orange-50 border-orange-200 text-orange-900',
  approval: 'bg-green-50 border-green-200 text-green-900',
};

const REMARK_TYPE_LABELS: Record<string, string> = {
  remark: 'Remarque',
  modification_request: 'Modification demandée',
  approval: 'Approbation',
};

interface Props {
  procedureId: string;
  onClose: () => void;
  onStatusChange?: () => void;
}

export default function ProcedureDetail({ procedureId, onClose, onStatusChange }: Props) {
  const [procedure, setProcedure] = useState<Procedure | null>(null);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lifecycle' | 'remarks' | 'info'>('lifecycle');

  // Remark form
  const [remarkForm, setRemarkForm] = useState({ author: '', content: '', type: 'remark' });
  const [addingRemark, setAddingRemark] = useState(false);
  const [showRemarkForm, setShowRemarkForm] = useState(false);

  // Lifecycle editing
  const [editingStages, setEditingStages] = useState<LifecycleStage[]>([]);
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [lifecycleSaved, setLifecycleSaved] = useState(false);

  // Stage popup
  const [popupStage, setPopupStage] = useState<LifecycleStage | null>(null);

  // Status
  const [statusModal, setStatusModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Finalize
  const [finalizing, setFinalizing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [procRes, remarkRes] = await Promise.all([
        orchestrationApi.getProcedure(procedureId),
        orchestrationApi.getRemarks(procedureId),
      ]);
      setProcedure(procRes.procedure);
      setEditingStages(procRes.procedure.lifecycle_stages || []);
      setRemarks(remarkRes.remarks);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [procedureId]);

  useEffect(() => { load(); }, [load]);

  const handleAddRemark = async () => {
    if (!remarkForm.author.trim() || !remarkForm.content.trim()) return;
    setAddingRemark(true);
    try {
      const res = await orchestrationApi.addRemark(procedureId, remarkForm);
      setRemarks(prev => [...prev, res.remark]);
      setRemarkForm({ author: '', content: '', type: 'remark' });
      setShowRemarkForm(false);
      if (procedure) setProcedure({ ...procedure, remarks_count: procedure.remarks_count + 1 });
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
    finally { setAddingRemark(false); }
  };

  const handleResolveRemark = async (remarkId: string) => {
    try {
      await orchestrationApi.resolveRemark(procedureId, remarkId);
      setRemarks(prev => prev.map(r => r.id === remarkId ? { ...r, resolved: true } : r));
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
  };

  const handleStageChange = (stageId: string, field: keyof LifecycleStage, value: string | boolean) => {
    setEditingStages(prev => prev.map(s => s.id === stageId ? { ...s, [field]: value } : s));
    setLifecycleSaved(false);
  };

  const handleSaveLifecycle = async () => {
    setSavingLifecycle(true);
    try {
      await orchestrationApi.updateLifecycle(procedureId, editingStages.map(s => ({
        id: s.id,
        status: s.status,
        workshop_done: s.workshop_done,
        notes: s.notes,
        completed_at: s.completed_at || undefined,
      })));
      setLifecycleSaved(true);
      setTimeout(() => setLifecycleSaved(false), 3000);
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
    finally { setSavingLifecycle(false); }
  };

  const handleStatusChange = async (status: ProcedureStatus) => {
    setUpdatingStatus(true);
    try {
      await orchestrationApi.updateStatus(procedureId, status);
      if (procedure) setProcedure({ ...procedure, status });
      setStatusModal(false);
      onStatusChange?.();
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
    finally { setUpdatingStatus(false); }
  };

  const handleFinalize = async () => {
    if (!confirm('Finaliser cette procédure ? Cette action est irréversible.')) return;
    setFinalizing(true);
    try {
      await orchestrationApi.finalizeProcedure(procedureId);
      load();
      onStatusChange?.();
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
    finally { setFinalizing(false); }
  };

  const completedStages = editingStages.filter(s => s.status === 'completed').length;
  const progressPct = editingStages.length > 0 ? (completedStages / editingStages.length) * 100 : 0;

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
    </div>
  );

  if (!procedure) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-start gap-4">
          <button type="button" onClick={onClose} className="mt-1 p-1.5 hover:bg-gray-100 rounded text-gray-500">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              {procedure.is_finalized && <Lock className="w-5 h-5 text-green-600" />}
              <h2 className="text-xl font-bold text-gray-900 truncate">{procedure.nom}</h2>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${procedureStatusCls(procedure.status)}`}>
                {procedure.status}
              </span>
              {procedure.is_finalized && (
                <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">✓ Finalisée</span>
              )}
            </div>
            <div className="flex gap-4 mt-1 text-xs text-gray-400 flex-wrap">
              {procedure.ref && <span>{procedure.ref}</span>}
              {procedure.category && <span>{procedure.category}</span>}
              <span>v{procedure.version}</span>
              <span>Modifié le {fmtDate(procedure.lastModified)}</span>
            </div>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {!procedure.is_finalized && (
              <>
                <button type="button" onClick={() => setStatusModal(true)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 font-medium">
                  Statut
                </button>
                <button type="button" onClick={handleFinalize} disabled={finalizing}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
                  {finalizing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                  Finaliser
                </button>
              </>
            )}
            <button type="button" onClick={onClose} title="Fermer" className="p-1.5 hover:bg-gray-100 rounded text-gray-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barre de progression */}
        <div className="mt-4 space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Progression cycle de vie</span>
            <span>{completedStages}/{editingStages.length} étapes</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all rounded-full" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* Onglets */}
        <div className="flex gap-1 mt-4 border-b border-gray-100">
          {[
            { id: 'lifecycle', label: 'Cycle de vie' },
            { id: 'remarks', label: `Remarques (${remarks.length})` },
            { id: 'info', label: 'Informations' },
          ].map(tab => (
            <button key={tab.id} type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto bg-gray-50">

        {/* ── CYCLE DE VIE ── */}
        {activeTab === 'lifecycle' && (
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">Étapes & Ateliers</h3>
              {!procedure.is_finalized && (
                <button type="button" onClick={handleSaveLifecycle} disabled={savingLifecycle}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {savingLifecycle ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  {lifecycleSaved ? 'Sauvegardé ✓' : 'Sauvegarder'}
                </button>
              )}
            </div>

            {/* Escalier visuel */}
            <div className="relative">
              {editingStages.map((stage, idx) => {
                const cfg = STAGE_STATUS_CONFIG[stage.status] || STAGE_STATUS_CONFIG.pending;
                const Icon = cfg.icon;
                const isLast = idx === editingStages.length - 1;
                return (
                  <div key={stage.id} className="relative">
                    <div className="flex gap-4">
                      {/* Ligne + cercle */}
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md ${cfg.bg} ${cfg.ring} shrink-0`}>
                          {stage.status === 'completed' ? (
                            <CheckCheck className="w-5 h-5" />
                          ) : (
                            <span className="text-sm font-bold">{idx + 1}</span>
                          )}
                        </div>
                        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 my-1 min-h-[1.5rem]" />}
                      </div>

                      {/* Contenu */}
                      <div className={`flex-1 pb-6 ${isLast ? '' : ''}`}>
                        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <button
                                type="button"
                                onClick={() => setPopupStage(stage)}
                                className={`flex items-center gap-1.5 font-semibold ${cfg.color} hover:underline text-left`}
                                title="Voir le détail"
                              >
                                {stage.title}
                                <Info className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              </button>
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{stage.description}</p>
                            </div>
                            {!procedure.is_finalized ? (
                              <select
                                value={stage.status}
                                onChange={e => handleStageChange(stage.id, 'status', e.target.value)}
                                title="Statut de l'étape"
                                className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 shrink-0">
                                <option value="pending">En attente</option>
                                <option value="in_progress">En cours</option>
                                <option value="completed">Complété</option>
                                <option value="blocked">Bloqué</option>
                              </select>
                            ) : (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                stage.status === 'completed' ? 'bg-green-100 text-green-700' :
                                stage.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                stage.status === 'blocked' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-500'
                              }`}>{cfg.label}</span>
                            )}
                          </div>

                          {/* Atelier */}
                          <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${stage.workshop_done ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                            <Calendar className={`w-4 h-4 shrink-0 ${stage.workshop_done ? 'text-green-600' : 'text-amber-600'}`} />
                            <span className={`text-xs font-medium flex-1 ${stage.workshop_done ? 'text-green-800' : 'text-amber-800'}`}>
                              {stage.workshop}
                            </span>
                            {!procedure.is_finalized && (
                              <button type="button"
                                onClick={() => handleStageChange(stage.id, 'workshop_done', !stage.workshop_done)}
                                className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                                  stage.workshop_done ? 'bg-green-200 text-green-800 hover:bg-green-300' : 'bg-amber-200 text-amber-800 hover:bg-amber-300'
                                }`}>
                                {stage.workshop_done ? '✓ Fait' : 'À faire'}
                              </button>
                            )}
                            {procedure.is_finalized && (
                              <span className={`text-xs font-medium ${stage.workshop_done ? 'text-green-700' : 'text-amber-700'}`}>
                                {stage.workshop_done ? '✓ Fait' : 'Non réalisé'}
                              </span>
                            )}
                          </div>

                          {/* Notes */}
                          {!procedure.is_finalized ? (
                            <textarea
                              value={stage.notes}
                              onChange={e => handleStageChange(stage.id, 'notes', e.target.value)}
                              placeholder="Notes sur cette étape..."
                              rows={2}
                              className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none text-gray-700 bg-gray-50" />
                          ) : stage.notes ? (
                            <p className="text-xs text-gray-600 bg-gray-50 rounded p-2">{stage.notes}</p>
                          ) : null}

                          {/* Date de complétion */}
                          {stage.completed_at && (
                            <p className="text-xs text-green-600">✓ Complété le {fmtDate(stage.completed_at)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── REMARQUES ── */}
        {activeTab === 'remarks' && (
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">Remarques & Modifications</h3>
              {!procedure.is_finalized && (
                <button type="button" onClick={() => setShowRemarkForm(!showRemarkForm)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                  <Plus className="w-3 h-3" /> Ajouter
                </button>
              )}
            </div>

            {/* Formulaire d'ajout */}
            {showRemarkForm && (
              <div className="bg-white rounded-xl border border-blue-200 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Auteur</label>
                    <input type="text" value={remarkForm.author} onChange={e => setRemarkForm(f => ({ ...f, author: e.target.value }))}
                      placeholder="Votre nom"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                    <select value={remarkForm.type} onChange={e => setRemarkForm(f => ({ ...f, type: e.target.value }))}
                      title="Type de remarque"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-300">
                      <option value="remark">Remarque</option>
                      <option value="modification_request">Modification demandée</option>
                      <option value="approval">Approbation</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Contenu</label>
                  <textarea value={remarkForm.content} onChange={e => setRemarkForm(f => ({ ...f, content: e.target.value }))}
                    rows={3} placeholder="Décrivez la remarque ou la modification demandée..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none" />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowRemarkForm(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Annuler</button>
                  <button type="button" onClick={handleAddRemark} disabled={addingRemark || !remarkForm.author.trim() || !remarkForm.content.trim()}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                    {addingRemark && <RefreshCw className="w-3 h-3 animate-spin" />}
                    Enregistrer
                  </button>
                </div>
              </div>
            )}

            {/* Liste des remarques */}
            {remarks.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Aucune remarque pour l&apos;instant.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {remarks.map(remark => (
                  <div key={remark.id} className={`rounded-xl border p-4 ${REMARK_TYPE_STYLES[remark.type] || 'bg-gray-50 border-gray-200'} ${remark.resolved ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-sm">{remark.author}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/60 border border-current/20">
                            {REMARK_TYPE_LABELS[remark.type] || remark.type}
                          </span>
                          {remark.resolved && <span className="text-xs text-green-700 font-medium">✓ Résolu</span>}
                        </div>
                        <p className="text-sm">{remark.content}</p>
                        <p className="text-xs opacity-60 mt-1.5">{fmtDateTime(remark.created_at)}</p>
                      </div>
                      {!remark.resolved && !procedure.is_finalized && (
                        <button type="button" onClick={() => handleResolveRemark(remark.id)}
                          title="Marquer comme résolu"
                          className="p-1.5 hover:bg-white/50 rounded transition-colors shrink-0">
                          <CheckCheck className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── INFORMATIONS ── */}
        {activeTab === 'info' && (
          <div className="p-6 space-y-4">
            {/* Versions */}
            {procedure.versions && procedure.versions.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Historique des versions</h3>
                <div className="space-y-2">
                  {[...procedure.versions].reverse().map(v => (
                    <div key={v.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">
                          v{v.version}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${procedureStatusCls(v.status)}`}>{v.status}</span>
                      </div>
                      <span className="text-xs text-gray-400">{fmtDate(v.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Métadonnées */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Détails</h3>
              <dl className="space-y-3 text-sm">
                {[
                  ['Nom', procedure.nom],
                  ['Référence', procedure.ref || '—'],
                  ['Domaine', procedure.category || '—'],
                  ['Description', procedure.description || '—'],
                  ['Statut', procedure.status],
                  ['Finalisée', procedure.is_finalized ? `Oui — ${fmtDateTime(procedure.finalized_at)}` : 'Non'],
                  ['ID', procedure.id],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-3">
                    <dt className="w-28 shrink-0 font-medium text-gray-500">{label}</dt>
                    <dd className="flex-1 text-gray-800 break-all">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Snapshot finalisation */}
            {procedure.is_finalized && (procedure.metadata?.finalized_snapshot as Record<string, unknown>) && (
              <div className="bg-green-50 rounded-xl border border-green-200 p-5">
                <h3 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Snapshot de finalisation
                </h3>
                <p className="text-xs text-green-700">
                  La matrice RACI et le cycle de vie ont été archivés à la finalisation le{' '}
                  {fmtDateTime(procedure.finalized_at)}.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Popup détail étape ── */}
      {popupStage && (() => {
        const cfg = STAGE_STATUS_CONFIG[popupStage.status] || STAGE_STATUS_CONFIG.pending;
        const stageIdx = editingStages.findIndex(s => s.id === popupStage.id);
        return (
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
            onClick={() => setPopupStage(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm ${cfg.bg}`}>
                  {popupStage.status === 'completed'
                    ? <CheckCheck className="w-5 h-5" />
                    : <span className="text-sm font-bold">{stageIdx + 1}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-bold text-base leading-snug ${cfg.color}`}>{popupStage.title}</h3>
                  <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                    popupStage.status === 'completed'  ? 'bg-green-100 text-green-700'  :
                    popupStage.status === 'in_progress'? 'bg-blue-100 text-blue-700'   :
                    popupStage.status === 'blocked'    ? 'bg-red-100 text-red-700'     :
                                                         'bg-gray-100 text-gray-500'
                  }`}>{cfg.label}</span>
                </div>
                <button
                  type="button"
                  title="Fermer"
                  onClick={() => setPopupStage(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-4">

                {/* Description */}
                {popupStage.description && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Description</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{popupStage.description}</p>
                  </div>
                )}

                {/* Atelier */}
                {popupStage.workshop && (
                  <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                    popupStage.workshop_done ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                  }`}>
                    <Calendar className={`w-4 h-4 shrink-0 ${popupStage.workshop_done ? 'text-green-600' : 'text-amber-600'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5 text-gray-500">Atelier</p>
                      <p className={`text-sm font-medium ${popupStage.workshop_done ? 'text-green-800' : 'text-amber-800'}`}>
                        {popupStage.workshop}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      popupStage.workshop_done ? 'bg-green-200 text-green-800' : 'bg-amber-200 text-amber-800'
                    }`}>
                      {popupStage.workshop_done ? 'Réalisé' : 'À faire'}
                    </span>
                  </div>
                )}

                {/* Notes */}
                {popupStage.notes && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Notes</p>
                    <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3 leading-relaxed whitespace-pre-wrap">
                      {popupStage.notes}
                    </p>
                  </div>
                )}

                {/* Date complétion */}
                {popupStage.completed_at && (
                  <div className="flex items-center gap-2 text-xs text-green-700">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Complété le {fmtDate(popupStage.completed_at)}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 pb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setPopupStage(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal statut */}
      {statusModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-xs w-full">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-sm">Changer le statut</h3>
              <button type="button" title="Fermer" onClick={() => setStatusModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 space-y-1">
              {VALID_STATUSES.map(s => (
                <button key={s} type="button"
                  onClick={() => handleStatusChange(s)}
                  disabled={s === procedure.status || updatingStatus}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    s === procedure.status ? 'bg-blue-50 text-blue-800 font-semibold cursor-default' : 'hover:bg-gray-50 text-gray-700'
                  }`}>
                  {s} {s === procedure.status && '✓'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

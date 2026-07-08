'use client';

import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { FileText, LayoutList, MessageSquare, Download, RotateCcw, Loader2, Palette } from 'lucide-react';

import InitForm from '@/components/sfd/InitForm';
import SectionNavigator from '@/components/sfd/SectionNavigator';
import ChatInterface from '@/components/sfd/ChatInterface';
import DocumentPreview from '@/components/sfd/DocumentPreview';
import StyleSelector from '@/components/sfd/StyleSelector';

import { SFD_GENERATOR_API } from '@/lib/sfd-generator-api';
import {
  PageState, ChatMessage, SectionStatus, SectionKey,
  StyleName, DEFAULT_STYLE, InitPayload,
  getErrorMessage,
} from '@/types/sfd-generator';

type LeftTab = 'init' | 'nav' | 'chat';

export default function SFDGeneratorPage() {
  // ─── État global ───────────────────────────────────────────────────────────
  const [pageState, setPageState] = useState<PageState>('idle');
  const [sessionId, setSessionId] = useState('');
  const [activeTab, setActiveTab] = useState<LeftTab>('init');
  const [progressMessage, setProgressMsg] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [highlightSections, setHighlight] = useState<string[]>([]);
  const [sectionsStatus, setSectionsStatus] = useState<Record<string, SectionStatus>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [sectionContext, setSectionContext] = useState<string | undefined>(undefined);
  const [projectLabel, setProjectLabel] = useState('');
  const [style, setStyleState] = useState<StyleName>(DEFAULT_STYLE);

  // ─── Changement de style (live, après génération) ──────────────────────────

  const handleStyleChange = useCallback(async (newStyle: StyleName) => {
    setStyleState(newStyle);
    if (!sessionId) return;
    try {
      const res = await fetch(
        SFD_GENERATOR_API.url(SFD_GENERATOR_API.endpoints.style(sessionId)),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ style: newStyle }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Rafraîchit la preview HTML avec le nouveau thème
      setRefreshTrigger((n) => n + 1);
    } catch (e) {
      toast.error('Impossible de changer le thème : ' + getErrorMessage(e));
    }
  }, [sessionId]);

  // ─── Init ──────────────────────────────────────────────────────────────────

  const handleInit = useCallback(async (data: InitPayload) => {
    setPageState('initializing');
    setSessionId(data.sessionId);
    setProjectLabel(data.projectName || 'Nouveau SFD');
    setStyleState(data.style);
    setProgressMsg('Démarrage...');

    const es = new EventSource(
      SFD_GENERATOR_API.url(SFD_GENERATOR_API.endpoints.progress(data.sessionId))
    );
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.stage === 'ping') return;
        if (event.message) setProgressMsg(event.message);
        if (event.stage === 'done' || event.stage === 'error') es.close();
      } catch { /* ignore */ }
    };
    es.onerror = () => es.close();

    const formData = new FormData();
    formData.append('session_id', data.sessionId);
    formData.append('project_name', data.projectName);
    formData.append('client', data.client);
    formData.append('description', data.description);
    formData.append('urls', JSON.stringify(data.urls));
    formData.append('style', data.style);          // ← envoyé au backend
    data.files.forEach((f, i) => {
      if (i < 5) formData.append(`file${i + 1}`, f);
    });

    try {
      const res = await fetch(
        SFD_GENERATOR_API.url(SFD_GENERATOR_API.endpoints.init),
        { method: 'POST', body: formData }
      );
      es.close();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(getErrorMessage(err));
      }
      setPageState('ready');
      setRefreshTrigger((n) => n + 1);
      setActiveTab('nav');
      toast.success('SFD généré avec succès !');
    } catch (e) {
      es.close();
      setPageState('error');
      toast.error(getErrorMessage(e));
    }
  }, []);

  // ─── Chat ──────────────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(async (message: string) => {
    if (!sessionId) return;
    setPageState('chatting');

    setChatMessages((prev) => [
      ...prev,
      { role: 'user', content: message, timestamp: new Date().toISOString() },
    ]);

    const formData = new FormData();
    formData.append('message', message);
    if (sectionContext) formData.append('section_context', sectionContext);

    try {
      const res = await fetch(
        SFD_GENERATOR_API.url(SFD_GENERATOR_API.endpoints.chat(sessionId)),
        { method: 'POST', body: formData }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(getErrorMessage(err));
      }
      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        { role: 'agent', content: data.agent_message, timestamp: new Date().toISOString() },
      ]);
      setHighlight(data.sections_modified ?? []);
      setTimeout(() => setHighlight([]), 3500);
      setRefreshTrigger((n) => n + 1);
      setPageState('ready');
    } catch (e) {
      toast.error(getErrorMessage(e));
      setPageState('ready');
    }
  }, [sessionId, sectionContext]);

  // ─── Export Word ───────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (!sessionId) return;
    setPageState('exporting');
    try {
      const res = await fetch(
        SFD_GENERATOR_API.url(SFD_GENERATOR_API.endpoints.export(sessionId)),
        { method: 'POST' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SFD_${projectLabel.replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Document Word exporté !');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPageState('ready');
    }
  }, [sessionId, projectLabel]);

  // ─── Section click ─────────────────────────────────────────────────────────

  const handleSectionClick = useCallback((key: string) => {
    setSectionContext(key);
    setActiveTab('chat');
  }, []);

  // ─── Validation section ────────────────────────────────────────────────────

  const handleValidate = useCallback(async (key: SectionKey) => {
    if (!sessionId) return;
    try {
      await fetch(
        SFD_GENERATOR_API.url(SFD_GENERATOR_API.endpoints.validate(sessionId, key)),
        { method: 'POST' }
      );
    } catch { /* silencieux */ }
    setSectionsStatus((prev) => ({ ...prev, [key]: 'validated' }));
    toast.success('Section validée');
  }, [sessionId]);

  // ─── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = useCallback(async () => {
    if (sessionId) {
      await fetch(
        SFD_GENERATOR_API.url(SFD_GENERATOR_API.endpoints.delete(sessionId)),
        { method: 'DELETE' }
      ).catch(() => { });
    }
    setPageState('idle');
    setSessionId('');
    setActiveTab('init');
    setProgressMsg('');
    setSectionsStatus({});
    setChatMessages([]);
    setSectionContext(undefined);
    setProjectLabel('');
    setRefreshTrigger(0);
    setStyleState(DEFAULT_STYLE);
  }, [sessionId]);

  // ─── Flags ─────────────────────────────────────────────────────────────────

  const isInitializing = pageState === 'initializing';
  const isReady = ['ready', 'chatting', 'exporting'].includes(pageState);
  const isChatting = pageState === 'chatting';
  const isExporting = pageState === 'exporting';

  // ─── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden bg-slate-100">

      {/* ── Panneau gauche ── */}
      <div className="w-80 flex-shrink-0 flex flex-col shadow-xl bg-white border-r border-slate-200/80">

        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 bg-gradient-to-r from-[#1a3560] to-[#1e4d8c] flex-shrink-0">
          <div className="w-7 h-7 bg-white/15 rounded-lg flex items-center justify-center border border-white/10">
            <FileText className="w-4 h-4 text-white/90 flex-shrink-0" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-white leading-tight">SFD Generator</h1>
            {projectLabel && (
              <p className="text-[11px] text-blue-200/80 truncate leading-tight mt-0.5">{projectLabel}</p>
            )}
          </div>
          {isReady && (
            <button
              type="button"
              onClick={handleReset}
              className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
              title="Nouveau SFD"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Onglets */}
        <div className="flex border-b border-slate-100 bg-white flex-shrink-0">
          <TabBtn
            icon={<FileText className="w-3.5 h-3.5" />}
            label="Init"
            active={activeTab === 'init'}
            onClick={() => setActiveTab('init')}
          />
          {isReady && (
            <>
              <TabBtn
                icon={<LayoutList className="w-3.5 h-3.5" />}
                label="Sections"
                active={activeTab === 'nav'}
                onClick={() => setActiveTab('nav')}
              />
              <TabBtn
                icon={<MessageSquare className="w-3.5 h-3.5" />}
                label="Chat"
                active={activeTab === 'chat'}
                onClick={() => setActiveTab('chat')}
                badge={chatMessages.filter((m) => m.role === 'agent').length || undefined}
              />
            </>
          )}
        </div>

        {/* Contenu onglet */}
        <div className="flex-1 overflow-hidden bg-white">
          {activeTab === 'init' && (
            <div className="h-full">
              <InitForm
                onSubmit={handleInit}
                isLoading={isInitializing}
                progressMessage={isInitializing ? progressMessage : undefined}
              />
            </div>
          )}
          {activeTab === 'nav' && isReady && (
            <SectionNavigator
              sectionsStatus={sectionsStatus}
              activeSection={sectionContext}
              onSectionClick={(key) => setSectionContext(key)}
              onValidate={handleValidate}
            />
          )}
          {activeTab === 'chat' && isReady && (
            <ChatInterface
              messages={chatMessages}
              isLoading={isChatting}
              sectionContext={sectionContext}
              onSendMessage={handleSendMessage}
              onClearContext={() => setSectionContext(undefined)}
            />
          )}
        </div>

        {/* ── Style du document (visible après génération) ── */}
        {isReady && (
          <div className="px-3 pt-3 pb-1 border-t border-slate-100 bg-white flex-shrink-0">
            <div className="flex items-center gap-1.5 mb-2">
              <Palette className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">Style du document</span>
            </div>
            <StyleSelector
              value={style}
              onChange={handleStyleChange}
              disabled={isExporting}
              compact
            />
          </div>
        )}

        {/* Export Word */}
        {isReady && (
          <div className="p-3 pt-2 border-t border-slate-100 bg-white flex-shrink-0">
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${isExporting
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-[#1a3560] to-[#1e4d8c] text-white hover:from-[#1e3d6e] hover:to-[#2258a0] shadow-md shadow-blue-900/20 hover:shadow-blue-900/30'
                }`}
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Export en cours...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Exporter en Word
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Panneau droit : Document preview ── */}
      <div className="flex-1 overflow-hidden">
        <DocumentPreview
          sessionId={isReady ? sessionId : ''}
          refreshTrigger={refreshTrigger}
          highlightSections={highlightSections}
          onSectionClick={handleSectionClick}
        />
      </div>

    </div>
  );
}

// ─── Composant TabBtn ─────────────────────────────────────────────────────────

function TabBtn({
  icon, label, active, onClick, badge,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all ${active
        ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
        : 'text-slate-400 hover:text-slate-600 border-b-2 border-transparent hover:bg-slate-50/80'
        }`}
    >
      {icon}
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-0.5 px-1.5 py-0.5 bg-blue-600 text-white rounded-full leading-none text-[10px] font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}
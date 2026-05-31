'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, Send, X } from 'lucide-react';
import type { AnalysisArtifact, AnalysisMessage, AnalysisSession, ProcedureCandidate } from '@/lib/analysisApi';
import { analysisApi } from '@/lib/analysisApi';

const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];

const FILE_ICON: Record<string, string> = {
  'application/pdf': '📄', 'text/plain': '📝', 'text/csv': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
  'application/vnd.ms-excel': '📊',
};
const fileIcon = (mime: string) => mime.startsWith('image/') ? '🖼' : FILE_ICON[mime] || '📎';

interface Props {
  session: AnalysisSession;
  procedures: ProcedureCandidate[];
  selectedProcedures: string[];
  onArtifactCreated: (artifact: AnalysisArtifact) => void;
  onMessageAdded: (msg: AnalysisMessage) => void;
}

export function AnalysisChatPanel({ session, procedures, selectedProcedures, onArtifactCreated, onMessageAdded }: Props) {
  const [messages, setMessages] = useState<AnalysisMessage[]>([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [typingText, setTypingText] = useState('');
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback((force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (force || el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, []);

  // Charger l'historique
  useEffect(() => {
    analysisApi.listMessages(session.id)
      .then(res => setMessages(res.messages))
      .catch(() => { });
    return () => { esRef.current?.close(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, [session.id]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Typewriter
  const startTypewriter = useCallback((text: string, onDone: () => void) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const chunk = Math.max(1, Math.ceil(text.length / 160));
    let pos = 0;
    requestAnimationFrame(() => scrollToBottom(true));
    const tick = () => {
      pos = Math.min(pos + chunk, text.length);
      setTypingText(text.slice(0, pos));
      if (pos < text.length) { timerRef.current = setTimeout(tick, 16); }
      else { timerRef.current = null; onDone(); }
    };
    tick();
  }, [scrollToBottom]);

  // Ajouter des fichiers
  const addFiles = (newFiles: FileList | File[]) => {
    const valid = Array.from(newFiles).filter(f => ALLOWED_TYPES.includes(f.type));
    setFiles(prev => [...prev, ...valid].slice(0, 10));
  };

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  // Envoyer analyse
  const sendAnalysis = async () => {
    if ((!input.trim() && files.length === 0 && selectedProcedures.length === 0) || analyzing) return;
    const instruction = input.trim();
    const attachedFiles = [...files];
    setInput(''); setFiles([]); setError(null); setAnalyzing(true);

    // Message user local
    const userMsg: AnalysisMessage = {
      id: crypto.randomUUID(), session_id: session.id, role: 'user',
      content: instruction || `${attachedFiles.length} fichier(s) soumis`,
      sources_meta: attachedFiles.map(f => ({ filename: f.name, mime_type: f.type, size: f.size })),
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    onMessageAdded(userMsg);

    try {
      const result = await analysisApi.analyze(session.id, instruction, selectedProcedures, attachedFiles);
      setMessages(prev => [...prev, result.message]);
      setActiveArtifactId(result.artifact.id);
      onArtifactCreated(result.artifact);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur analyse');
    } finally {
      setAnalyzing(false);
    }
  };

  // Envoyer question de suivi
  const sendChat = (text: string) => {
    if (!text.trim() || streaming) return;
    setInput(''); setError(null);
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(), session_id: session.id, role: 'user',
      content: text, sources_meta: [], created_at: new Date().toISOString(),
    }]);
    setStreaming(true);

    const url = analysisApi.chatStreamUrl(session.id, text, activeArtifactId || undefined);
    const es = new EventSource(url);
    esRef.current = es;
    let closed = false;
    const closeEs = () => { if (!closed) { closed = true; es.close(); if (esRef.current === es) esRef.current = null; } };

    es.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.error) { setError(data.error); setStreaming(false); setTypingText(''); closeEs(); return; }
        if (data.done) { closeEs(); return; }
        if (data.content) {
          startTypewriter(data.content, () => {
            setTypingText('');
            const msg: AnalysisMessage = { id: crypto.randomUUID(), session_id: session.id, role: 'assistant', content: data.content, sources_meta: [], created_at: new Date().toISOString() };
            setMessages(prev => [...prev, msg]);
            setStreaming(false);
          });
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => { setError('Erreur connexion'); setStreaming(false); setTypingText(''); closeEs(); };
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (files.length > 0 || input.trim()) {
        const hasNewContent = files.length > 0;
        hasNewContent ? sendAnalysis() : sendChat(input);
      }
    }
  };

  const handleSend = () => {
    const hasSource = files.length > 0 || selectedProcedures.length > 0;
    const hasConversation = messages.some(m => m.role === 'assistant');
    if (hasSource && (!hasConversation || files.length > 0)) {
      sendAnalysis();
    } else {
      sendChat(input);
    }
  };

  const SUGGESTIONS = [
    'Analyse l\'impact de cette source sur mes procédures sélectionnées',
    'Vérifie si ces règles sont bien couvertes dans les procédures',
    'Identifie les écarts entre cette source et les procédures',
    'Compare les exigences de cette source avec la procédure sélectionnée',
  ];

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
      >
        {dragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-50/80 border-2 border-dashed border-blue-400 rounded-lg">
            <p className="text-sm font-semibold text-blue-600">Déposer les fichiers ici</p>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="space-y-3 py-4">
            <p className="text-center text-sm font-medium text-slate-500">
              Soumettez des fichiers et/ou une instruction pour lancer l&apos;analyse.
            </p>
            <p className="text-center text-xs text-slate-400">Formats acceptés : PDF, Excel, image, texte</p>
            <div className="grid grid-cols-1 gap-2 mt-4">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="rounded-lg border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={msg.id || i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                }`}>
                {/* Fichiers attachés */}
                {(msg.sources_meta || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {msg.sources_meta.map((s, si) => (
                      <span key={si} className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs">
                        {fileIcon(s.mime_type)} {s.filename}
                      </span>
                    ))}
                  </div>
                )}
                {/* Contenu — formatage markdown simple */}
                <div className="whitespace-pre-wrap">
                  {msg.content.split('\n').map((line, li) => (
                    <p key={li} className={line.startsWith('**') ? 'font-semibold' : ''}>
                      {line.replace(/\*\*/g, '')}
                    </p>
                  ))}
                </div>
                {/* Badge artifact */}
                {msg.artifact_id && (
                  <div className="mt-2 flex items-center gap-1 text-xs opacity-70">
                    <FileText className="h-3 w-3" />
                    <span>Résultat disponible — voir le panneau détail</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Typing / analyzing */}
        {typingText && (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2.5 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
              {typingText}<span className="inline-block w-1 h-3.5 bg-slate-400 ml-0.5 animate-pulse rounded-sm" />
            </div>
          </div>
        )}
        {(analyzing || (streaming && !typingText)) && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-3">
              {analyzing ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                  Analyse en cours...
                </div>
              ) : (
                <div className="flex gap-1">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {error && (
          <div className="flex justify-center">
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          </div>
        )}
      </div>

      {/* Zone de saisie */}
      <div className="shrink-0 border-t border-slate-200 px-3 py-3">
        {/* Fichiers attachés */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                {fileIcon(f.type)} <span className="max-w-24 truncate">{f.name}</span>
                <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 focus-within:border-blue-500 focus-within:bg-white transition-colors">
          {/* Bouton fichier */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 text-slate-400 hover:text-blue-500 transition-colors"
            title="Joindre un fichier"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_TYPES.join(',')}
            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
            className="hidden"
          />

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              files.length > 0
                ? 'Ajouter une instruction (optionnel)...'
                : selectedProcedures.length > 0
                  ? 'Instruction (optionnel) — ou envoyez directement pour analyser les procédures'
                  : 'Instruction ou question...'
            }
            rows={2}
            disabled={analyzing || streaming}
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-slate-400 disabled:opacity-50"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={(!input.trim() && files.length === 0 && selectedProcedures.length === 0) || analyzing || streaming}
            className="shrink-0 rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-center text-xs text-slate-400">
          Entrée pour envoyer · Maj+Entrée pour nouvelle ligne · Glisser-déposer des fichiers
        </p>
      </div>
    </div>
  );
}
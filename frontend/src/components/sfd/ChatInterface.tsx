'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, X, Bot, User } from 'lucide-react';
import { ChatMessage } from '@/types/sfd-generator';
import { SECTIONS } from '@/types/sfd-generator';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isLoading: boolean;
  sectionContext?: string;       // section actuellement ciblée
  onSendMessage: (msg: string) => void;
  onClearContext: () => void;
}

export default function ChatInterface({
  messages,
  isLoading,
  sectionContext,
  onSendMessage,
  onClearContext,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll auto vers le bas quand de nouveaux messages arrivent
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || isLoading) return;
    onSendMessage(msg);
    setInput('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const sectionLabel = sectionContext
    ? SECTIONS.find((s) => s.key === sectionContext)?.label ?? sectionContext
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Contexte de section */}
      {sectionContext && (
        <div className="flex items-center gap-2 px-3 py-2 mx-3 mt-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
          <span className="text-blue-600 font-medium flex-1">
            Section ciblée : {sectionLabel}
          </span>
          <button onClick={onClearContext}>
            <X className="w-3.5 h-3.5 text-blue-400 hover:text-blue-600" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <Bot className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">
              Posez une question ou donnez une instruction pour modifier le SFD.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Cliquez sur une section dans le document pour la cibler.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Avatar */}
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                msg.role === 'user' ? 'bg-blue-600' : 'bg-slate-200'
              }`}
            >
              {msg.role === 'user' ? (
                <User className="w-3.5 h-3.5 text-white" />
              ) : (
                <Bot className="w-3.5 h-3.5 text-slate-600" />
              )}
            </div>

            {/* Bulle */}
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-slate-100 text-slate-700 rounded-tl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Indicateur de chargement */}
        {isLoading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <div className="px-3 py-2 bg-slate-100 rounded-xl rounded-tl-sm">
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Zone de saisie */}
      <div className="px-3 pb-3 pt-2 border-t border-slate-100">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={isLoading}
            placeholder={
              sectionContext
                ? `Modifier la section "${sectionLabel}"...`
                : 'Instruction pour l\'agent (Enter pour envoyer)...'
            }
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${
              input.trim() && !isLoading
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1.5 text-right">
          Shift+Enter pour sauter une ligne
        </p>
      </div>
    </div>
  );
}

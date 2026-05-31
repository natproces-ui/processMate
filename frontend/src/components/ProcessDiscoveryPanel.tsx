'use client';

import { useState } from 'react';
import { API_CONFIG } from '@/lib/api-config';
import type { ProcessCard } from '@/components/MultiDocUpload';
import {
    Loader2, Send, CheckSquare, Square, Sparkles,
    FileText, MessageSquare, ChevronDown, ChevronUp, Merge
} from 'lucide-react';

interface ChatMsg {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

interface ProcessDiscoveryPanelProps {
    sessionId: string;
    cards: ProcessCard[];
    onCardsUpdated: (cards: ProcessCard[]) => void;
    onGenerate: (selectedIds: string[]) => void;
    generating: boolean;
}

export default function ProcessDiscoveryPanel({
    sessionId,
    cards,
    onCardsUpdated,
    onGenerate,
    generating,
}: ProcessDiscoveryPanelProps) {

    const [selected, setSelected] = useState<Set<string>>(
        new Set(cards.map(c => c.process_id))
    );
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [input, setInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const [chatOpen, setChatOpen] = useState(true);

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const selectAll = () => setSelected(new Set(cards.map(c => c.process_id)));
    const selectNone = () => setSelected(new Set());

    const sendChat = async () => {
        if (!input.trim() || chatLoading) return;
        const text = input.trim();
        setInput('');

        const userMsg: ChatMsg = { id: crypto.randomUUID(), role: 'user', content: text };
        setMessages(prev => [...prev, userMsg]);
        setChatLoading(true);

        try {
            const res = await fetch(API_CONFIG.getFullUrl(API_CONFIG.endpoints.discoveryChat), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    message: text,
                    current_cards: cards.map(c => ({
                        process_id: c.process_id,
                        title: c.title,
                        description: c.description,
                        sources: c.sources,
                        confidence: c.confidence,
                        estimated_steps: c.estimated_steps,
                        category: c.category,
                    }))
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Erreur');

            const updated: ProcessCard[] = data.processes || [];
            onCardsUpdated(updated);
            setSelected(new Set(updated.map((c: ProcessCard) => c.process_id)));

            const reply = `${updated.length} processus — ${updated.map((c: ProcessCard) => c.title).join(', ')}`;
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: reply }]);

        } catch (err: any) {
            setMessages(prev => [...prev, {
                id: crypto.randomUUID(), role: 'assistant',
                content: `Erreur : ${err.message}`
            }]);
        } finally {
            setChatLoading(false);
        }
    };

    const selectedCards = cards.filter(c => selected.has(c.process_id));

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-800">Processus détectés</p>
                        <p className="text-xs text-slate-400">
                            {cards.length} processus · {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={selectAll} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100">Tout</button>
                    <button onClick={selectNone} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100">Aucun</button>
                </div>
            </div>

            <div className="p-4 space-y-3">

                {/* Cards */}
                <div className="space-y-2">
                    {cards.map(card => {
                        const isSelected = selected.has(card.process_id);
                        return (
                            <div
                                key={card.process_id}
                                onClick={() => toggle(card.process_id)}
                                className={`
                                    flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all
                                    ${isSelected
                                        ? 'border-blue-300 bg-blue-50'
                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                    }
                                `}
                            >
                                <div className="mt-0.5 flex-shrink-0 text-blue-500">
                                    {isSelected
                                        ? <CheckSquare className="w-4 h-4" />
                                        : <Square className="w-4 h-4 text-slate-300" />
                                    }
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-semibold text-slate-800">{card.title}</p>
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                            card.category === 'instructed'
                                                ? 'bg-blue-100 text-blue-700'
                                                : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {card.category === 'instructed' ? 'Ciblé' : 'Découvert'}
                                        </span>
                                        <span className="text-[10px] text-slate-400">~{card.estimated_steps} étapes</span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{card.description}</p>
                                    {card.sources.length > 0 && (
                                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                                            {card.sources.map(s => (
                                                <span key={s.file_id} className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                                                    <FileText className="w-2.5 h-2.5" />
                                                    {s.filename}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Chat discovery */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                        onClick={() => setChatOpen(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-medium text-slate-600">Corriger la détection</span>
                            <span className="text-[10px] text-slate-400">fusionner, renommer, diviser…</span>
                        </div>
                        {chatOpen
                            ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                            : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        }
                    </button>

                    {chatOpen && (
                        <div className="border-t border-slate-100">
                            {messages.length > 0 && (
                                <div className="px-4 py-3 space-y-2 bg-slate-50/50 max-h-40 overflow-y-auto">
                                    {messages.map(m => (
                                        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] text-xs px-3 py-2 rounded-xl ${
                                                m.role === 'user'
                                                    ? 'bg-blue-600 text-white rounded-br-sm'
                                                    : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'
                                            }`}>
                                                {m.content}
                                            </div>
                                        </div>
                                    ))}
                                    {chatLoading && (
                                        <div className="flex justify-start">
                                            <div className="bg-white border border-slate-200 rounded-xl rounded-bl-sm px-3 py-2">
                                                <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="px-3 py-2.5 flex gap-2 bg-white">
                                <input
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && sendChat()}
                                    placeholder='Ex : "fusionne P1 et P2 en un seul processus"'
                                    disabled={chatLoading}
                                    className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 disabled:opacity-50"
                                />
                                <button
                                    onClick={sendChat}
                                    disabled={chatLoading || !input.trim()}
                                    className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    {chatLoading
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        : <Send className="w-3.5 h-3.5" />
                                    }
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Bouton générer */}
                <button
                    onClick={() => onGenerate(Array.from(selected))}
                    disabled={selected.size === 0 || generating}
                    className={`
                        w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm
                        transition-all duration-200
                        ${selected.size === 0 || generating
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-slate-800 text-white hover:bg-slate-700 active:scale-[0.99]'
                        }
                    `}
                >
                    {generating
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération en cours…</>
                        : <><Sparkles className="w-4 h-4" /> Générer {selected.size} processus</>
                    }
                </button>
            </div>
        </div>
    );
}

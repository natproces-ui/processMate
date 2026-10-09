'use client';

import React from 'react';
import { ClipboardList, AlertTriangle, Lightbulb, MessageSquareText } from 'lucide-react';
import MiniMarkdown from '@/components/shared/MiniMarkdown';

/**
 * Relecture d'une procédure : chaque section (### À compléter / Points d'attention /
 * Opportunités) devient un encadré coloré. Les références « étape N » sont cliquables.
 */
const SECTIONS = [
    { test: /compl/i, icon: ClipboardList, label: 'À compléter', tone: 'border-amber-200 bg-amber-50/60', iconTone: 'bg-amber-100 text-amber-700' },
    { test: /attention|risque|erreur/i, icon: AlertTriangle, label: 'Points d’attention', tone: 'border-rose-200 bg-rose-50/60', iconTone: 'bg-rose-100 text-rose-700' },
    { test: /opportunit|amélior/i, icon: Lightbulb, label: 'Opportunités', tone: 'border-emerald-200 bg-emerald-50/60', iconTone: 'bg-emerald-100 text-emerald-700' },
];
const DEFAULT = { icon: MessageSquareText, tone: 'border-slate-200 bg-white', iconTone: 'bg-slate-100 text-slate-600' };

function splitSections(text: string): { title: string | null; body: string }[] {
    const out: { title: string | null; body: string }[] = [];
    let current: { title: string | null; body: string[] } = { title: null, body: [] };
    for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
        const h = line.match(/^#{1,3}\s+(.*)$/) || line.match(/^\*\*([^*]+)\*\*\s*:?\s*$/);
        if (h) {
            if (current.title || current.body.join('').trim()) out.push({ title: current.title, body: current.body.join('\n') });
            current = { title: h[1].trim(), body: [] };
        } else {
            current.body.push(line);
        }
    }
    if (current.title || current.body.join('').trim()) out.push({ title: current.title, body: current.body.join('\n') });
    return out;
}

export default function RemarksView({ text, streaming = false, onStepClick }: { text: string; streaming?: boolean; onStepClick?: (ids: string[]) => void }) {
    const sections = splitSections(text);
    return (
        <div className="space-y-2">
            {sections.map((s, i) => {
                const style = SECTIONS.find(x => s.title && x.test.test(s.title)) || null;
                const Icon = style?.icon || DEFAULT.icon;
                const last = i === sections.length - 1;
                return (
                    <section key={i} className={`pm-rise rounded-xl border px-3.5 py-3 shadow-sm ${style?.tone || DEFAULT.tone}`}>
                        {s.title && (
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-lg ${style?.iconTone || DEFAULT.iconTone}`}>
                                    <Icon className="w-3.5 h-3.5" />
                                </span>
                                <span className="text-[13px] font-semibold text-slate-800">{style?.label || s.title}</span>
                            </div>
                        )}
                        <div className={streaming && last ? 'pm-caret' : undefined}>
                            <MiniMarkdown text={s.body} className="text-[14px] text-slate-700" onStepClick={onStepClick} />
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

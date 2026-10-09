'use client';

import React from 'react';

/**
 * Rendu Markdown minimal pour les réponses de l'assistant (sans dépendance) :
 * titres (#, ##, ###), listes à puces (-, *, •) et numérotées (1.), gras (**…**),
 * italique (*…*), code en ligne (`…`), paragraphes. Le texte n'est jamais injecté
 * en HTML brut.
 */
function inline(text: string, keyBase: string): React.ReactNode[] {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g);
    return parts.filter(Boolean).map((part, i) => {
        const key = `${keyBase}-${i}`;
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={key} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>;
        if (part.startsWith('`') && part.endsWith('`')) return <code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">{part.slice(1, -1)}</code>;
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={key}>{part.slice(1, -1)}</em>;
        return <React.Fragment key={key}>{part}</React.Fragment>;
    });
}

export default function MiniMarkdown({ text, className = '' }: { text: string; className?: string }) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const blocks: React.ReactNode[] = [];
    let list: { ordered: boolean; items: string[] } | null = null;
    let para: string[] = [];

    const flushPara = () => {
        if (para.length) {
            const k = `p${blocks.length}`;
            blocks.push(<p key={k} className="leading-relaxed">{inline(para.join(' '), k)}</p>);
            para = [];
        }
    };
    const flushList = () => {
        if (list) {
            const k = `l${blocks.length}`;
            const Tag = list.ordered ? 'ol' : 'ul';
            blocks.push(
                <Tag key={k} className={`${list.ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1 marker:text-slate-400`}>
                    {list.items.map((it, i) => <li key={i} className="leading-relaxed">{inline(it, `${k}-${i}`)}</li>)}
                </Tag>
            );
            list = null;
        }
    };

    for (const raw of lines) {
        const line = raw.trimEnd();
        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
        if (!line.trim()) { flushPara(); flushList(); continue; }
        if (heading) {
            flushPara(); flushList();
            const k = `h${blocks.length}`;
            blocks.push(<p key={k} className="font-semibold text-slate-800 mt-1">{inline(heading[2], k)}</p>);
        } else if (bullet || numbered) {
            flushPara();
            const ordered = !!numbered;
            if (list && list.ordered !== ordered) flushList();
            if (!list) list = { ordered, items: [] };
            list.items.push((bullet || numbered)![1]);
        } else {
            flushList();
            para.push(line.trim());
        }
    }
    flushPara(); flushList();
    return <div className={`space-y-2 ${className}`}>{blocks}</div>;
}

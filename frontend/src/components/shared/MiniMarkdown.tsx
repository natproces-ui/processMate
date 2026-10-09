'use client';

import React from 'react';

/**
 * Rendu Markdown minimal pour les réponses de l'assistant (sans dépendance) :
 * titres (#, ##, ###), listes à puces (-, *, •) et numérotées (1.), citations (>),
 * séparateurs (---), gras (**…**), italique (*…*), code en ligne (`…`).
 * Option : « étape 5 » / « étapes 3 et 4 » deviennent des références cliquables.
 * Le texte n'est jamais injecté en HTML brut.
 */
const STEP_REF = /(\bétapes?\s+\d+(?:\s*(?:,|et|à|-)\s*\d+)*)/gi;

function stepRefs(text: string, keyBase: string, onStepClick?: (ids: string[]) => void): React.ReactNode[] {
    if (!onStepClick) return [text];
    return text.split(STEP_REF).filter(Boolean).map((part, i) => {
        if (!/^étapes?\s+\d/i.test(part)) return <React.Fragment key={`${keyBase}-s${i}`}>{part}</React.Fragment>;
        const ids = part.match(/\d+/g) || [];
        return (
            <button key={`${keyBase}-s${i}`} type="button" onClick={() => onStepClick(ids)}
                title="Voir dans le tableau"
                className="inline rounded bg-blue-50 px-0.5 font-medium text-blue-700 hover:bg-blue-100 underline-offset-2 hover:underline">
                {part}
            </button>
        );
    });
}

function inline(text: string, keyBase: string, onStepClick?: (ids: string[]) => void): React.ReactNode[] {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g);
    return parts.filter(Boolean).flatMap((part, i) => {
        const key = `${keyBase}-${i}`;
        if (part.startsWith('**') && part.endsWith('**')) return [<strong key={key} className="font-semibold text-slate-900">{stepRefs(part.slice(2, -2), key, onStepClick)}</strong>];
        if (part.startsWith('`') && part.endsWith('`')) return [<code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em] text-slate-800">{part.slice(1, -1)}</code>];
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return [<em key={key}>{part.slice(1, -1)}</em>];
        return stepRefs(part, key, onStepClick);
    });
}

export default function MiniMarkdown({ text, className = '', onStepClick }: { text: string; className?: string; onStepClick?: (ids: string[]) => void }) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const blocks: React.ReactNode[] = [];
    let list: { ordered: boolean; items: string[] } | null = null;
    let para: string[] = [];
    let quote: string[] = [];

    const flushPara = () => {
        if (para.length) {
            const k = `p${blocks.length}`;
            blocks.push(<p key={k} className="leading-relaxed">{inline(para.join(' '), k, onStepClick)}</p>);
            para = [];
        }
    };
    const flushQuote = () => {
        if (quote.length) {
            const k = `q${blocks.length}`;
            blocks.push(<blockquote key={k} className="border-l-2 border-slate-300 pl-3 text-slate-600 italic">{inline(quote.join(' '), k, onStepClick)}</blockquote>);
            quote = [];
        }
    };
    const flushList = () => {
        if (list) {
            const k = `l${blocks.length}`;
            const Tag = list.ordered ? 'ol' : 'ul';
            blocks.push(
                <Tag key={k} className={`${list.ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1.5 marker:text-slate-400`}>
                    {list.items.map((it, i) => <li key={i} className="leading-relaxed pl-0.5">{inline(it, `${k}-${i}`, onStepClick)}</li>)}
                </Tag>
            );
            list = null;
        }
    };
    const flushAll = () => { flushPara(); flushList(); flushQuote(); };

    for (const raw of lines) {
        const line = raw.trimEnd();
        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
        const quoted = line.match(/^\s*>\s?(.*)$/);
        if (!line.trim()) { flushAll(); continue; }
        if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushAll(); blocks.push(<hr key={`hr${blocks.length}`} className="border-slate-200" />); continue; }
        if (heading) {
            flushAll();
            const k = `h${blocks.length}`;
            const size = heading[1].length === 1 ? 'text-base' : 'text-[15px]';
            blocks.push(<p key={k} className={`font-semibold text-slate-900 mt-1 ${size}`}>{inline(heading[2], k, onStepClick)}</p>);
        } else if (quoted) {
            flushPara(); flushList();
            quote.push(quoted[1]);
        } else if (bullet || numbered) {
            flushPara(); flushQuote();
            const ordered = !!numbered;
            if (list && list.ordered !== ordered) flushList();
            if (!list) list = { ordered, items: [] };
            list.items.push((bullet || numbered)![1]);
        } else {
            flushList(); flushQuote();
            para.push(line.trim());
        }
    }
    flushAll();
    return <div className={`space-y-2 ${className}`}>{blocks}</div>;
}

'use client';

/** Lien d'accès à transmettre (montré une seule fois) : copier, avec l'avertissement. */
import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

export default function LinkReveal({ title, link, onClose, note, emailedTo }: {
    title: string; link: string; onClose: () => void; note?: string;
    /** adresse à laquelle le lien vient d'être envoyé ; false = envoi échoué ; undefined = pas d'envoi */
    emailedTo?: string | false;
}) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* sélection manuelle possible */ }
    };
    return (
        <div role="dialog" aria-modal="true" aria-labelledby="link-reveal-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                    <h2 id="link-reveal-title" className="text-base font-semibold text-slate-900">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="p-1 rounded text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
                </div>
                {emailedTo ? (
                    <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        Envoyé par e-mail à <b>{emailedTo}</b> : son identifiant et le lien pour choisir son mot de passe.
                        Vous pouvez aussi copier le lien ci-dessous.
                    </p>
                ) : emailedTo === false ? (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        L&apos;e-mail n&apos;a pas pu partir. Transmettez ce lien vous-même : il permet de choisir le mot de passe.
                    </p>
                ) : (
                    <p className="mt-2 text-sm text-slate-600">
                        Envoyez ce lien à la personne : il lui permet de choisir son mot de passe. Il ne sera plus affiché ;
                        en cas de perte, générez-en un nouveau.
                    </p>
                )}
                {note && <p className="mt-2 text-sm text-amber-700">{note}</p>}
                <div className="mt-3 flex gap-2">
                    <input readOnly value={link} aria-label="Lien d'accès" onFocus={e => e.currentTarget.select()}
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700" />
                    <button type="button" onClick={copy}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700">
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copié' : 'Copier'}
                    </button>
                </div>
            </div>
        </div>
    );
}

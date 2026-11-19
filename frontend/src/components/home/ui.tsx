'use client';

/**
 * Briques d'interface du chat (barre latérale, projets) : menu « ⋯ », fenêtres, dates relatives.
 * Charte : texte, icônes et contours en noir (neutral-900), gris réservé aux informations secondaires.
 */
import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';

export const timeAgo = (iso?: string | null): string => {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'à l’instant';
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    if (s < 7 * 86400) { const d = Math.floor(s / 86400); return `il y a ${d} jour${d > 1 ? 's' : ''}`; }
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

export interface MenuItem {
    label: string;
    icon?: React.ReactNode;
    onSelect: () => void;
    danger?: boolean;
    separatorBefore?: boolean;
}

/** Bouton « ⋯ » et son menu. Se ferme au clic extérieur, avec Échap, ou après un choix. */
export function RowMenu({ items, label, className = '', align = 'right' }: {
    items: MenuItem[]; label: string; className?: string; align?: 'right' | 'left';
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);
    return (
        <div ref={ref} className={`relative ${className}`}>
            <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open}
                onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }}
                className="p-1 rounded-md text-neutral-900 hover:bg-neutral-200">
                <MoreHorizontal className="w-4 h-4" />
            </button>
            {open && (
                <div role="menu" className={`absolute top-full mt-1 z-50 min-w-[210px] rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}>
                    {items.map((it, i) => (
                        <div key={i}>
                            {it.separatorBefore && <div className="my-1 h-px bg-neutral-200" />}
                            <button type="button" role="menuitem"
                                onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(false); it.onSelect(); }}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-neutral-100 ${it.danger ? 'text-red-600' : 'text-neutral-900'}`}>
                                {it.icon && <span className="shrink-0 [&>svg]:w-4 [&>svg]:h-4">{it.icon}</span>}
                                {it.label}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function Modal({ title, onClose, children, footer, wide = false }: {
    title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
            <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-xl`}>
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="p-1 rounded-md text-neutral-900 hover:bg-neutral-100"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-2">{children}</div>
                {footer && <div className="flex justify-end gap-2 px-5 pb-4 pt-3">{footer}</div>}
            </div>
        </div>
    );
}

export const btnPrimary = 'inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40';
export const btnGhost = 'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-neutral-900 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40';
export const btnDanger = 'inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40';
export const field = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900';

export function ConfirmDialog({ title, message, confirmLabel = 'Supprimer', onConfirm, onClose }: {
    title: string; message: string; confirmLabel?: string; onConfirm: () => Promise<void> | void; onClose: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
        <Modal title={title} onClose={onClose} footer={<>
            <button type="button" onClick={onClose} className={btnGhost}>Annuler</button>
            <button type="button" disabled={busy} className={btnDanger} onClick={async () => {
                setBusy(true);
                try { await onConfirm(); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Action impossible'); setBusy(false); }
            }}>{confirmLabel}</button>
        </>}>
            <p className="text-sm text-neutral-700">{message}</p>
            {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        </Modal>
    );
}

/** Champ de renommage en place : Entrée valide, Échap annule, perte du focus valide. */
export function InlineRename({ value, onSave, onCancel, className = '' }: {
    value: string; onSave: (v: string) => void; onCancel: () => void; className?: string;
}) {
    const [v, setV] = useState(value);
    const done = useRef(false);
    const finish = (save: boolean) => {
        if (done.current) return;
        done.current = true;
        if (save && v.trim() && v.trim() !== value) onSave(v.trim()); else onCancel();
    };
    return (
        <input autoFocus value={v} onChange={e => setV(e.target.value)} aria-label="Nouveau nom"
            onFocus={e => e.currentTarget.select()}
            onKeyDown={e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); }}
            onBlur={() => finish(true)}
            className={`min-w-0 flex-1 rounded-md border border-neutral-900 bg-white px-1.5 py-0.5 text-sm text-neutral-900 focus:outline-none ${className}`} />
    );
}

'use client';

import Modal from '../Modal';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-slate-600 mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">
          Annuler
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-700 hover:bg-emerald-800'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Image as ImageIcon, Loader2, Trash2, Upload, X, FolderOpen, Check } from 'lucide-react';
import { listDemoFiles, fetchDemoFile, uploadDemoFile, deleteDemoFile, type DemoFile } from '@/lib/demoFilesApi';

/**
 * Bibliothèque de fichiers de démo partagée entre admins. Les fichiers choisis sont
 * renvoyés en File à `onAttach`, qui les joint comme un dépôt manuel.
 */
export default function DemoFilesPicker({ open, onClose, onAttach, maxSelect, onError }: {
  open: boolean;
  onClose: () => void;
  onAttach: (files: File[]) => void;
  maxSelect: number;
  onError: (msg: string) => void;
}) {
  const [files, setFiles] = useState<DemoFile[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // 'attach' | 'upload' | nom du fichier supprimé
  const uploadRef = useRef<HTMLInputElement>(null);

  const refresh = () =>
    listDemoFiles().then(setFiles).catch(e => { onError(e.message); setFiles([]); });

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setFiles(null);
    refresh();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const toggle = (name: string) =>
    setSelected(prev => prev.includes(name)
      ? prev.filter(n => n !== name)
      : prev.length < maxSelect ? [...prev, name] : prev);

  const attach = async () => {
    setBusy('attach');
    try {
      onAttach(await Promise.all(selected.map(fetchDemoFile)));
      onClose();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const upload = async (list: FileList) => {
    setBusy('upload');
    try {
      for (const f of Array.from(list)) await uploadDemoFile(f);
      await refresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (name: string) => {
    if (!confirm(`Retirer « ${name} » des fichiers de démo pour tous les admins ?`)) return;
    setBusy(name);
    try {
      await deleteDemoFile(name);
      setSelected(prev => prev.filter(n => n !== name));
      await refresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // Portail : le chat peut vivre dans un panneau transformé, qui casserait le position: fixed
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="demo-files-title" className="bg-white w-full max-w-lg rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-blue-600" />
          <h3 id="demo-files-title" className="font-bold text-slate-900">Fichiers de démo</h3>
          <span className="text-xs text-slate-400">partagés entre admins</span>
          <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto p-1 rounded text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {files === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
            </div>
          ) : files.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">Aucun fichier de démo pour l&apos;instant.</p>
          ) : (
            <ul>
              {files.map(f => {
                const checked = selected.includes(f.name);
                const isImage = /\.(png|jpe?g|webp)$/i.test(f.name);
                return (
                  <li key={f.name} className="group flex items-center gap-1">
                    <button type="button" onClick={() => toggle(f.name)} aria-pressed={checked}
                      disabled={!checked && selected.length >= maxSelect}
                      className={`flex-1 min-w-0 flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm disabled:opacity-40 ${checked ? 'bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-50'}`}>
                      <span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}>
                        {checked && <Check className="w-3 h-3" />}
                      </span>
                      {isImage ? <ImageIcon className="w-4 h-4 shrink-0 text-slate-400" /> : <FileText className="w-4 h-4 shrink-0 text-slate-400" />}
                      <span className="truncate">{f.name}</span>
                      {f.size != null && <span className="ml-auto shrink-0 text-xs text-slate-400">{formatSize(f.size)}</span>}
                    </button>
                    <button type="button" onClick={() => remove(f.name)} disabled={busy !== null}
                      aria-label={`Retirer ${f.name}`} title="Retirer pour tous les admins"
                      className="p-2 rounded-lg text-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-600 disabled:opacity-40">
                      {busy === f.name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-2">
          <button type="button" onClick={() => uploadRef.current?.click()} disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            {busy === 'upload' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Ajouter à la démo
          </button>
          <input ref={uploadRef} type="file" multiple accept=".pdf,.docx,.pptx,image/png,image/jpeg,image/webp" className="hidden"
            onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
          <button type="button" onClick={attach} disabled={selected.length === 0 || busy !== null}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {busy === 'attach' && <Loader2 className="w-4 h-4 animate-spin" />}
            Joindre{selected.length > 0 ? ` (${selected.length})` : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

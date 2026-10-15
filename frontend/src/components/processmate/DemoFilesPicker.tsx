'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Presentation, Loader2, Trash2, Upload, X, FolderOpen, Check } from 'lucide-react';
import { listDemoFiles, fetchDemoFile, uploadDemoFile, deleteDemoFile, type DemoFile } from '@/lib/demoFilesApi';

type Kind = 'image' | 'pdf' | 'office';
const kindOf = (name: string): Kind =>
  /\.(png|jpe?g|webp)$/i.test(name) ? 'image' : /\.pdf$/i.test(name) ? 'pdf' : 'office';

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
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // 'attach' | 'upload' | nom du fichier supprimé
  const uploadRef = useRef<HTMLInputElement>(null);
  // Un fichier téléchargé pour la miniature ou l'aperçu sert aussi au « Joindre »
  const cache = useRef(new Map<string, Promise<File>>());

  const getFile = (name: string) => {
    let p = cache.current.get(name);
    if (!p) {
      p = fetchDemoFile(name);
      p.catch(() => cache.current.delete(name));
      cache.current.set(name, p);
    }
    return p;
  };

  const refresh = () =>
    listDemoFiles().then(setFiles).catch(e => { onError(e.message); setFiles([]); });

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setPreviewing(null);
    setFiles(null);
    refresh();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    // Échap ferme d'abord l'aperçu, puis la bibliothèque
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (previewing) setPreviewing(null); else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, previewing, onClose]);

  if (!open) return null;

  const canSelectMore = selected.length < maxSelect;
  const toggle = (name: string) =>
    setSelected(prev => prev.includes(name)
      ? prev.filter(n => n !== name)
      : prev.length < maxSelect ? [...prev, name] : prev);

  const attach = async () => {
    setBusy('attach');
    try {
      onAttach(await Promise.all(selected.map(getFile)));
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
      cache.current.clear(); // un fichier du même nom a pu être remplacé
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
      cache.current.delete(name);
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
    <>
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
                  return (
                    <li key={f.name} className={`group flex items-center gap-1 rounded-lg pl-2 ${checked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <button type="button" onClick={() => toggle(f.name)} aria-pressed={checked}
                        aria-label={`${checked ? 'Désélectionner' : 'Sélectionner'} ${f.name}`}
                        disabled={!checked && !canSelectMore}
                        className="p-1 shrink-0 disabled:opacity-40">
                        <span className={`w-4 h-4 rounded border flex items-center justify-center ${checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'}`}>
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                      </button>
                      <button type="button" onClick={() => setPreviewing(f.name)} title="Aperçu"
                        className={`flex-1 min-w-0 flex items-center gap-2.5 py-1.5 pr-1 text-left text-sm ${checked ? 'text-blue-900' : 'text-slate-700'}`}>
                        <Thumb name={f.name} getFile={getFile} />
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
      </div>

      {previewing && (
        <Preview name={previewing} getFile={getFile} onClose={() => setPreviewing(null)}
          selected={selected.includes(previewing)}
          canSelect={selected.includes(previewing) || canSelectMore}
          onToggle={() => toggle(previewing)} />
      )}
    </>,
    document.body,
  );
}

// ─── Miniature (chargée quand la ligne devient visible) ──────────

function Thumb({ name, getFile }: { name: string; getFile: (n: string) => Promise<File> }) {
  const kind = kindOf(name);
  const ref = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (kind === 'office' || !ref.current) return;
    let cancelled = false;
    let url: string | null = null;
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      try {
        const file = await getFile(name);
        if (cancelled) return;
        if (kind === 'image') { url = URL.createObjectURL(file); setSrc(url); }
        else { const s = await renderPdfFirstPage(file, 96); if (!cancelled) setSrc(s); }
      } catch {
        if (!cancelled) setFailed(true);
      }
    });
    io.observe(ref.current);
    return () => { cancelled = true; io.disconnect(); if (url) URL.revokeObjectURL(url); };
  }, [name, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span ref={ref} className="w-10 h-10 shrink-0 rounded-md border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
      {src ? <img src={src} alt="" className="w-full h-full object-cover object-top" />
        : kind === 'office' || failed ? <FileIcon kind={kind} name={name} />
        : <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-300" />}
    </span>
  );
}

function FileIcon({ kind, name }: { kind: Kind; name: string }) {
  return kind === 'office' && /\.pptx$/i.test(name)
    ? <Presentation className="w-4 h-4 text-orange-400" />
    : <FileText className={`w-4 h-4 ${kind === 'pdf' ? 'text-red-400' : 'text-blue-400'}`} />;
}

async function renderPdfFirstPage(file: File, width: number): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const task = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    // Rendu à 2× pour rester net sur les écrans haute densité
    const viewport = page.getViewport({ scale: (width * 2) / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
    return canvas.toDataURL('image/png');
  } finally {
    task.destroy();
  }
}

// ─── Aperçu en modale ────────────────────────────────────────────

function Preview({ name, getFile, onClose, selected, canSelect, onToggle }: {
  name: string;
  getFile: (n: string) => Promise<File>;
  onClose: () => void;
  selected: boolean;
  canSelect: boolean;
  onToggle: () => void;
}) {
  const kind = kindOf(name);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setFile(null); setUrl(null); setError(null);
    getFile(name).then(f => {
      if (cancelled) return;
      setFile(f);
      if (kind !== 'office') { objectUrl = URL.createObjectURL(f); setUrl(objectUrl); }
    }).catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [name, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={`Aperçu : ${name}`} className="bg-white w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
          <FileIcon kind={kind} name={name} />
          <h4 className="font-semibold text-sm text-slate-900 truncate">{name}</h4>
          <button type="button" onClick={onToggle} disabled={!canSelect} aria-pressed={selected}
            className={`ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${selected ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            {selected && <Check className="w-3.5 h-3.5" />}
            {selected ? 'Sélectionné' : 'Sélectionner'}
          </button>
          <button type="button" onClick={onClose} aria-label="Fermer l'aperçu" className="shrink-0 p-1 rounded text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 bg-slate-100 flex items-center justify-center">
          {error ? (
            <p className="p-10 text-sm text-red-600">{error}</p>
          ) : kind === 'office' ? (
            file ? (
              <div className="p-10 text-center space-y-2">
                <span className="inline-flex [&>svg]:w-10 [&>svg]:h-10"><FileIcon kind={kind} name={name} /></span>
                <p className="text-sm font-medium text-slate-700">{name}</p>
                <p className="text-xs text-slate-500">{formatSize(file.size)} · aperçu non disponible pour les fichiers Word et PowerPoint</p>
              </div>
            ) : <Loader2 className="w-6 h-6 animate-spin text-slate-400 my-20" />
          ) : !url ? (
            <Loader2 className="w-6 h-6 animate-spin text-slate-400 my-20" />
          ) : kind === 'image' ? (
            <img src={url} alt={name} className="max-w-full max-h-[78vh] object-contain" />
          ) : (
            // Lecteur PDF du navigateur : pages, zoom et recherche sans dépendance
            <iframe src={url} title={name} className="w-full h-[78vh] bg-white" />
          )}
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

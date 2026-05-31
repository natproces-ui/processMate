'use client';

import { useState, useRef } from 'react';
import { Upload, X, Plus, FileText, Link, Loader2, Sparkles } from 'lucide-react';
import StyleSelector, { StyleName } from './StyleSelector';

interface InitFormProps {
  onSubmit: (data: {
    sessionId: string;
    projectName: string;
    client: string;
    description: string;
    urls: string[];
    files: File[];
    style: StyleName;        // ← nouveau
  }) => void;
  isLoading: boolean;
  progressMessage?: string;
}

const ACCEPTED = '.pdf,.docx,.doc,.pptx,.ppt,.txt,.jpg,.jpeg,.png,.webp';
const MAX_SIZE_MB = 10;

export default function InitForm({ onSubmit, isLoading, progressMessage }: InitFormProps) {
  const [projectName, setProjectName] = useState('');
  const [client, setClient] = useState('');
  const [description, setDescription] = useState('');
  const [urls, setUrls] = useState<string[]>(['']);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [style, setStyle] = useState<StyleName>('al_maghrib'); // ← défaut Al Maghrib
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Fichiers ──────────────────────────────────────────────────────────────

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const valid = Array.from(newFiles).filter(
      (f) => f.size <= MAX_SIZE_MB * 1024 * 1024
    );
    setFiles((prev) => [...prev, ...valid].slice(0, 5));
  };

  const removeFile = (i: number) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i));

  // ─── URLs ──────────────────────────────────────────────────────────────────

  const updateUrl = (i: number, val: string) =>
    setUrls((prev) => prev.map((u, idx) => (idx === i ? val : u)));

  const addUrl = () => setUrls((prev) => [...prev, '']);
  const removeUrl = (i: number) =>
    setUrls((prev) => prev.filter((_, idx) => idx !== i));

  // ─── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    onSubmit({
      sessionId,
      projectName: projectName.trim(),
      client: client.trim(),
      description: description.trim(),
      urls: urls.filter((u) => u.trim()),
      files,
      style,
    });
  };

  const canSubmit = projectName.trim() && !isLoading;

  // ─── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 p-4">

      {/* Infos projet */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          Nom du projet <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Ex: Portail Clients"
          disabled={isLoading}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Client</label>
        <input
          type="text"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          placeholder="Ex: Société ABC"
          disabled={isLoading}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          Description du projet
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Décrivez le projet, ses objectifs, le contexte..."
          disabled={isLoading}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-slate-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Documents */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          Documents ({files.length}/5)
        </label>
        <div
          className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${dragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          onDragOver={(e) => { e.preventDefault(); if (!isLoading) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!isLoading) addFiles(e.dataTransfer.files);
          }}
          onClick={() => !isLoading && fileInputRef.current?.click()}
        >
          <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
          <p className="text-xs text-slate-500">Glissez vos fichiers ou cliquez</p>
          <p className="text-xs text-slate-400 mt-0.5">PDF, DOCX, PPTX, TXT, Images — 10 MB max</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />

        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded text-xs">
                <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span className="flex-1 truncate text-slate-700">{f.name}</span>
                <span className="text-slate-400 flex-shrink-0">
                  {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
                {!isLoading && (
                  <button onClick={() => removeFile(i)}>
                    <X className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* URLs */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          URLs à explorer
        </label>
        <div className="space-y-2">
          {urls.map((url, i) => (
            <div key={i} className="flex gap-2">
              <div className="relative flex-1">
                <Link className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => updateUrl(i, e.target.value)}
                  placeholder="https://..."
                  disabled={isLoading}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
                />
              </div>
              {urls.length > 1 && !isLoading && (
                <button onClick={() => removeUrl(i)} className="p-2 text-slate-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {urls.length < 3 && !isLoading && (
            <button
              onClick={addUrl}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter une URL
            </button>
          )}
        </div>
      </div>

      {/* ── Style du document ── */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-2">
          Style du document
        </label>
        <StyleSelector
          value={style}
          onChange={setStyle}
          disabled={isLoading}
        />
      </div>

      {/* Progress */}
      {isLoading && progressMessage && (
        <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
          <Loader2 className="w-3.5 h-3.5 mt-0.5 animate-spin flex-shrink-0" />
          <span>{progressMessage}</span>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${canSubmit
          ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md'
          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Génération en cours...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Générer le SFD
          </>
        )}
      </button>
    </div>
  );
}
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { SFD_GENERATOR_API } from '@/lib/sfd-generator-api';
import { RefreshCw } from 'lucide-react';

interface DocumentPreviewProps {
  sessionId: string;
  refreshTrigger?: number;
  highlightSections?: string[];
  onSectionClick?: (section: string) => void;
}

export default function DocumentPreview({
  sessionId,
  refreshTrigger = 0,
  highlightSections = [],
  onSectionClick,
}: DocumentPreviewProps) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ─── Chargement du HTML ───────────────────────────────────────────────────

  const fetchPreview = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(SFD_GENERATOR_API.url(SFD_GENERATOR_API.endpoints.preview(sessionId)));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHtml(await res.text());
    } catch {
      setError('Impossible de charger la prévisualisation.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) fetchPreview();
  }, [sessionId, refreshTrigger, fetchPreview]);

  // ─── Refs stables pour éviter la recréation du handler ───────────────────
  const onSectionClickRef = useRef(onSectionClick);
  const sessionIdRef = useRef(sessionId);
  useEffect(() => { onSectionClickRef.current = onSectionClick; }, [onSectionClick]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ─── postMessage depuis l'iframe ──────────────────────────────────────────

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data) return;

      // Clic section → tab Chat
      if (e.data.type === 'sfd-section-click' && onSectionClickRef.current) {
        onSectionClickRef.current(e.data.key as string);
      }

      // Édition inline → patch backend (fire-and-forget)
      if (e.data.type === 'sfd-edit' && sessionIdRef.current) {
        const { path, value } = e.data as { path: string; value: string };
        fetch(
          SFD_GENERATOR_API.url(SFD_GENERATOR_API.endpoints.patch(sessionIdRef.current)),
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, value }),
          }
        ).catch(() => { /* silencieux */ });
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []); // dépendances vides — le handler est stable via les refs

  // ─── Highlight → postMessage vers l'iframe ────────────────────────────────

  useEffect(() => {
    if (!highlightSections.length || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: 'sfd-highlight', keys: highlightSections },
      '*'
    );
  }, [highlightSections]);

  // ─── Rendu ────────────────────────────────────────────────────────────────

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Le document apparaîtra ici après génération.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-slate-500 text-sm">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Chargement du document...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-red-500 text-sm">
        <span>{error}</span>
        <button
          type="button"
          onClick={fetchPreview}
          className="px-3 py-1 text-xs bg-red-50 border border-red-200 rounded hover:bg-red-100"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      className="w-full h-full border-0"
      title="SFD Preview"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
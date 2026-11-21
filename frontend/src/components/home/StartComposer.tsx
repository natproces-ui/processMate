'use client';

/**
 * Champ de départ d'une conversation, hors du chat (accueil de l'organisation, page d'un projet).
 * Mêmes points d'entrée que le chat : texte, fichiers (« + » ou glisser-déposer), dictée (« Vocal »),
 * niveau de traitement. L'envoi ouvre le chat, qui envoie aussitôt le message avec ses fichiers.
 */
import { useRef, useState } from 'react';
import { ArrowUp, Loader2, Mic, Plus, Square, X } from 'lucide-react';
import ProcessingLevelSelector, { useProcessingLevel } from '@/components/processmate/ProcessingLevelSelector';
import { API_CONFIG } from '@/lib/api-config';

const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.xlsm,.csv,.txt,.md,.sql,.cbl,.cob,.cpy,.java,.py,.js,.ts,.cs,image/png,image/jpeg,image/webp';
const MAX_FILES = 10;

export default function StartComposer({ placeholder, onSend }: {
    placeholder: string;
    onSend: (text: string, files: File[]) => void;
}) {
    const [text, setText] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [drag, setDrag] = useState(false);
    const [level, setLevel] = useProcessingLevel();  // mémorisé : le chat reprend le même niveau
    const [recording, setRecording] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);

    // copie immédiate : la FileList est vidée quand on réinitialise le champ, avant que React ne la lise
    const add = (list: FileList | null) => {
        const picked = list ? Array.from(list) : [];
        if (picked.length) setFiles(prev => [...prev, ...picked].slice(0, MAX_FILES));
    };
    const send = () => {
        if (!text.trim() && !files.length) return;
        onSend(text.trim(), files);
    };

    const toggleVoice = async () => {
        setError(null);
        if (recording) { recorderRef.current?.stop(); setRecording(false); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            const chunks: BlobPart[] = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                setTranscribing(true);
                const fd = new FormData();
                fd.append('file', new Blob(chunks, { type: 'audio/webm' }), 'audio.webm');
                try {
                    const res = await fetch(API_CONFIG.getFullUrl(API_CONFIG.endpoints.dictate), { method: 'POST', body: fd });
                    const result = await res.json();
                    if (!res.ok) throw new Error(result.detail || 'Transcription impossible');
                    if (result?.transcription) setText(prev => (prev.trim() ? `${prev.trimEnd()} ${result.transcription}` : result.transcription));
                } catch (e) { setError(e instanceof Error ? e.message : 'Transcription impossible'); }
                finally { setTranscribing(false); }
            };
            recorder.start();
            recorderRef.current = recorder;
            setRecording(true);
        } catch { setError('Impossible d’accéder au microphone.'); }
    };

    return (
        <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
            className={`rounded-2xl border bg-white px-3 py-2.5 shadow-sm ${drag ? 'border-neutral-900' : 'border-neutral-300'}`}>
            {files.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                    {files.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-lg bg-neutral-100 px-2 py-1 text-xs text-neutral-900">
                            <span className="max-w-[220px] truncate">{f.name}</span>
                            <button type="button" aria-label={`Retirer ${f.name}`} onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                        </li>
                    ))}
                </ul>
            )}
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2} aria-label={placeholder} placeholder={placeholder}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                className="w-full resize-none bg-transparent px-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-500" />
            {error && <p role="alert" className="px-1 text-xs text-red-600">{error}</p>}
            <div className="mt-1 flex items-center gap-1">
                <button type="button" onClick={() => fileRef.current?.click()} aria-label="Joindre des fichiers" title="Joindre des fichiers"
                    className="rounded-lg p-1.5 text-neutral-900 hover:bg-neutral-100">
                    <Plus className="w-4 h-4" />
                </button>
                <input ref={fileRef} type="file" multiple hidden accept={ACCEPT} onChange={e => { add(e.target.files); e.target.value = ''; }} />
                <button type="button" onClick={() => void toggleVoice()} disabled={transcribing}
                    aria-label={recording ? 'Arrêter la dictée' : 'Dicter'} aria-pressed={recording}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm ${recording ? 'bg-red-50 text-red-700' : 'text-neutral-900 hover:bg-neutral-100'}`}>
                    {transcribing ? <Loader2 className="w-4 h-4 animate-spin" /> : recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {recording ? 'Arrêter' : 'Vocal'}
                </button>
                <div className="ml-auto flex items-center gap-2">
                    <ProcessingLevelSelector value={level} onChange={setLevel} />
                    <button type="button" onClick={send} disabled={!text.trim() && !files.length} aria-label="Envoyer"
                        className="rounded-full bg-neutral-900 p-2 text-white hover:bg-neutral-700 disabled:opacity-30">
                        <ArrowUp className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

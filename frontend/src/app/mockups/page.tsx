'use client';

import { useState, useRef, useCallback } from 'react';
import { Globe, Upload, Palette, FileText, Loader2, CheckCircle, AlertCircle, Download } from 'lucide-react';

const MOCKUP_API = process.env.NEXT_PUBLIC_SFD_API_URL || 'http://localhost:8004';

type JobStatus = 'idle' | 'running' | 'done' | 'error';

interface JobState {
    jobId: string;
    status: JobStatus;
    message: string;
    progress: number;
}

export default function MockupsPage() {
    // ── Formulaire ─────────────────────────────────────────────────────────────
    const [url, setUrl] = useState('');
    const [clientName, setClientName] = useState('');
    const [primaryColor, setPrimaryColor] = useState('#1a3560');
    const [secondaryColor, setSecondaryColor] = useState('#2E74B5');
    const [maxPages, setMaxPages] = useState(8);
    const [engine, setEngine] = useState<'v1' | 'v2'>('v2');
    const [instructions, setInstructions] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState('');
    const logoInputRef = useRef<HTMLInputElement>(null);

    // ── État du job ────────────────────────────────────────────────────────────
    const [job, setJob] = useState<JobState | null>(null);
    const pollRef = useRef<NodeJS.Timeout | null>(null);

    // ── Logo upload ────────────────────────────────────────────────────────────
    const handleLogo = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLogoFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
        reader.readAsDataURL(file);
    }, []);

    // ── Polling statut ─────────────────────────────────────────────────────────
    const startPolling = useCallback((jobId: string) => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`${MOCKUP_API}/api/mockup/status/${jobId}`);
                const data = await res.json();

                setJob(prev => prev ? {
                    ...prev,
                    status: data.status === 'done' ? 'done' : data.status === 'error' ? 'error' : 'running',
                    message: data.message,
                    progress: data.progress,
                } : prev);

                if (data.status === 'done' || data.status === 'error') {
                    clearInterval(pollRef.current!);
                }
            } catch {
                // silencieux
            }
        }, 1500);
    }, []);

    // ── Soumission ─────────────────────────────────────────────────────────────
    const handleSubmit = useCallback(async () => {
        if (!url || !clientName) return;

        const formData = new FormData();
        formData.append('url', url);
        formData.append('client_name', clientName);
        formData.append('primary_color', primaryColor);
        formData.append('secondary_color', secondaryColor);
        formData.append('max_pages', String(maxPages));
        formData.append('engine', engine);
        formData.append('instructions', instructions);
        if (logoFile) formData.append('logo', logoFile);

        setJob({ jobId: '', status: 'running', message: 'Démarrage...', progress: 0 });

        try {
            const res = await fetch(`${MOCKUP_API}/api/mockup/generate`, {
                method: 'POST',
                body: formData,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setJob(prev => prev ? { ...prev, jobId: data.job_id } : prev);
            startPolling(data.job_id);
        } catch (e: unknown) {
            setJob({ jobId: '', status: 'error', message: String(e), progress: 0 });
        }
    }, [url, clientName, primaryColor, secondaryColor, maxPages, engine, instructions, logoFile, startPolling]);

    // ── Téléchargement ─────────────────────────────────────────────────────────
    const handleDownload = useCallback(async () => {
        if (!job?.jobId) return;
        const res = await fetch(`${MOCKUP_API}/api/mockup/download/${job.jobId}`);
        if (!res.ok) return;
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Maquettes_${clientName}.docx`;
        a.click();
        URL.revokeObjectURL(a.href);
    }, [job, clientName]);

    const isRunning = job?.status === 'running';
    const isDone = job?.status === 'done';
    const isError = job?.status === 'error';

    return (
        <div className="h-full bg-slate-100 flex flex-col overflow-y-auto">

            {/* Header */}
            <div className="bg-gradient-to-r from-[#1a3560] to-[#1e4d8c] px-6 py-4 shadow-lg">
                <div className="max-w-3xl mx-auto flex items-center gap-3">
                    <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center">
                        <Globe className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="text-white font-bold text-lg leading-tight">Générateur de Maquettes</h1>
                        <p className="text-blue-200 text-xs">Inspirez-vous d'un site existant, rebrandé aux couleurs de votre client</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 space-y-6">

                {/* Formulaire */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">

                    {/* URL source */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                            URL du site source <span className="text-red-500">*</span>
                        </label>
                        <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                            <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <input
                                type="url"
                                placeholder="https://webstat.banque-france.fr"
                                value={url}
                                onChange={e => setUrl(e.target.value)}
                                disabled={isRunning}
                                className="flex-1 outline-none text-sm text-slate-700 placeholder-slate-400 bg-transparent"
                            />
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Le site doit être public (pas d'authentification requise)</p>
                    </div>

                    {/* Nom client */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                            Nom du client <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            placeholder="ex: BKAM, Attijariwafa, CIH..."
                            value={clientName}
                            onChange={e => setClientName(e.target.value)}
                            disabled={isRunning}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    {/* Couleurs */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            <Palette className="inline w-4 h-4 mr-1" />
                            Couleurs du client
                        </label>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <p className="text-xs text-slate-500 mb-1">Primaire</p>
                                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2">
                                    <input
                                        type="color"
                                        value={primaryColor}
                                        onChange={e => setPrimaryColor(e.target.value)}
                                        disabled={isRunning}
                                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                                    />
                                    <input
                                        type="text"
                                        value={primaryColor}
                                        onChange={e => setPrimaryColor(e.target.value)}
                                        disabled={isRunning}
                                        className="flex-1 text-sm text-slate-700 outline-none bg-transparent font-mono"
                                    />
                                </div>
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-slate-500 mb-1">Secondaire</p>
                                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2">
                                    <input
                                        type="color"
                                        value={secondaryColor}
                                        onChange={e => setSecondaryColor(e.target.value)}
                                        disabled={isRunning}
                                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                                    />
                                    <input
                                        type="text"
                                        value={secondaryColor}
                                        onChange={e => setSecondaryColor(e.target.value)}
                                        disabled={isRunning}
                                        className="flex-1 text-sm text-slate-700 outline-none bg-transparent font-mono"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Logo */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                            Logo client <span className="text-slate-400 font-normal">(optionnel)</span>
                        </label>
                        <div
                            onClick={() => logoInputRef.current?.click()}
                            className="flex items-center gap-3 border-2 border-dashed border-slate-200 rounded-xl px-4 py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
                        >
                            {logoPreview ? (
                                <>
                                    <img src={logoPreview} alt="Logo" className="h-10 object-contain" />
                                    <span className="text-sm text-slate-600">{logoFile?.name}</span>
                                </>
                            ) : (
                                <>
                                    <Upload className="w-5 h-5 text-slate-400" />
                                    <span className="text-sm text-slate-500">Cliquer pour uploader le logo (PNG, JPG, SVG)</span>
                                </>
                            )}
                        </div>
                        <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleLogo}
                            className="hidden"
                        />
                    </div>

                    {/* Moteur d'exploration */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                            Moteur d'exploration
                        </label>
                        <div className="flex gap-2">
                            {(['v1', 'v2'] as const).map(v => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => setEngine(v)}
                                    disabled={isRunning}
                                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-all ${
                                        engine === v
                                            ? 'bg-blue-600 text-white border-blue-600 shadow'
                                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                                    }`}
                                >
                                    {v === 'v1' ? '⚙️ V1 — Scroll fixe' : '🤖 V2 — Agent IA'}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                            {engine === 'v2'
                                ? 'L\'IA décide elle-même quand scroller et capturer (browser-use)'
                                : 'Scroll automatique par étapes fixes (Playwright direct)'}
                        </p>
                    </div>

                    {/* Nombre de pages */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                            Nombre maximum d'écrans : <span className="text-blue-600">{maxPages}</span>
                        </label>
                        <input
                            type="range"
                            min={2}
                            max={15}
                            value={maxPages}
                            onChange={e => setMaxPages(Number(e.target.value))}
                            disabled={isRunning}
                            className="w-full accent-blue-600"
                        />
                        <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                            <span>2 (rapide)</span>
                            <span>15 (complet)</span>
                        </div>
                    </div>

                    {/* Instructions personnalisées */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                            Instructions de rebranding <span className="text-slate-400 font-normal">(optionnel)</span>
                        </label>
                        <textarea
                            rows={3}
                            placeholder={"Ex: Ajoute un bandeau de navigation rouge en haut. Remplace les graphiques par des tableaux. Utilise une police sans-serif moderne..."}
                            value={instructions}
                            onChange={e => setInstructions(e.target.value)}
                            disabled={isRunning}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none disabled:bg-slate-50 disabled:cursor-not-allowed"
                        />
                        <p className="text-xs text-slate-400 mt-1">Décris les modifications spécifiques que l'agent doit appliquer à chaque maquette</p>
                    </div>

                    {/* Bouton */}
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isRunning || !url || !clientName}
                        className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${isRunning || !url || !clientName
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-[#1a3560] to-[#1e4d8c] text-white hover:from-[#1e3d6e] hover:to-[#2258a0] shadow-md'
                            }`}
                    >
                        {isRunning ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Génération en cours...</>
                        ) : (
                            <><FileText className="w-4 h-4" /> Générer les maquettes</>
                        )}
                    </button>
                </div>

                {/* Progression */}
                {job && (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            {isDone && <CheckCircle className="w-5 h-5 text-green-500" />}
                            {isError && <AlertCircle className="w-5 h-5 text-red-500" />}
                            {isRunning && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                            <p className={`text-sm font-medium ${isDone ? 'text-green-700' : isError ? 'text-red-700' : 'text-slate-700'
                                }`}>
                                {job.message}
                            </p>
                        </div>

                        {/* Barre de progression */}
                        {!isError && (
                            <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
                                <div
                                    className={`h-2 rounded-full transition-all duration-500 ${isDone ? 'bg-green-500' : 'bg-blue-500'}`}
                                    style={{ width: `${job.progress}%` }}
                                />
                            </div>
                        )}

                        {/* Bouton téléchargement */}
                        {isDone && (
                            <button
                                type="button"
                                onClick={handleDownload}
                                className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white shadow-md transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                Télécharger le document Word
                            </button>
                        )}

                        {/* Nouvelle génération */}
                        {(isDone || isError) && (
                            <button
                                type="button"
                                onClick={() => setJob(null)}
                                className="w-full mt-2 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                                Nouvelle génération
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
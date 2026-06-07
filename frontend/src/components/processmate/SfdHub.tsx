'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, FileText, Globe, Loader2, Palette, Sparkles } from 'lucide-react';

// ─── Imports dynamiques des outils ───────────────────────────

const SFDGeneratorPage = dynamic(() => import('@/app/sfd/page'), {
  ssr: false,
  loading: () => <Loader />,
});

const MockupsPage = dynamic(() => import('@/app/mockups/page'), {
  ssr: false,
  loading: () => <Loader />,
});

function Loader() {
  return (
    <div className="h-full flex items-center justify-center bg-slate-50">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
    </div>
  );
}

// ─── Type de vue ──────────────────────────────────────────────

type View = 'home' | 'sfd' | 'mockup';

// ─── Carte outil ──────────────────────────────────────────────

function ToolCard({
  icon: Icon,
  iconBg,
  iconColor,
  badgeColor,
  badge,
  title,
  subtitle,
  features,
  ctaLabel,
  ctaColor,
  onClick,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  badgeColor: string;
  badge: string;
  title: string;
  subtitle: string;
  features: string[];
  ctaLabel: string;
  ctaColor: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-gray-200 transition-all duration-300 p-8 overflow-hidden"
    >
      {/* Fond décoratif */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${iconBg} rounded-2xl`} style={{ opacity: 0 }} />
      <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl opacity-10 -translate-y-10 translate-x-10 bg-current" />

      {/* Badge */}
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full mb-5 w-fit ${badgeColor}`}>
        {badge}
      </span>

      {/* Icône */}
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${iconBg}`}>
        <Icon className={`w-7 h-7 ${iconColor}`} />
      </div>

      {/* Titre & description */}
      <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-gray-800">{title}</h2>
      <p className="text-sm text-gray-500 leading-relaxed mb-6">{subtitle}</p>

      {/* Features */}
      <ul className="space-y-2 mb-8 flex-1">
        {features.map(f => (
          <li key={f} className="flex items-center gap-2.5 text-sm text-gray-600">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm text-white transition-all ${ctaColor} group-hover:shadow-md`}>
        {ctaLabel}
        <ArrowLeft className="w-4 h-4 rotate-180 group-hover:translate-x-1 transition-transform" />
      </div>
    </button>
  );
}

// ─── Hub principal ────────────────────────────────────────────

export default function SfdHub() {
  const [view, setView] = useState<View>('home');

  // ── Outil actif ─────────────────────────────────────────────
  if (view === 'sfd') {
    return (
      <div className="h-full flex flex-col">
        <div className="shrink-0 px-4 py-2.5 bg-white border-b border-gray-100 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView('home')}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> SFD Generator
          </button>
          <span className="text-gray-300">/</span>
          <span className="text-xs font-semibold text-indigo-600 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Générateur SFD
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <SFDGeneratorPage />
        </div>
      </div>
    );
  }

  if (view === 'mockup') {
    return (
      <div className="h-full flex flex-col">
        <div className="shrink-0 px-4 py-2.5 bg-white border-b border-gray-100 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView('home')}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> SFD Generator
          </button>
          <span className="text-gray-300">/</span>
          <span className="text-xs font-semibold text-violet-600 flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" /> Mockup Rebranding
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <MockupsPage />
        </div>
      </div>
    );
  }

  // ── Hub home ────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-indigo-50/30 overflow-y-auto">

      {/* Header */}
      <div className="shrink-0 px-8 pt-10 pb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-white/80 border border-indigo-100 px-3 py-1.5 rounded-full text-xs font-semibold text-indigo-600 mb-4 shadow-sm">
          <Sparkles className="w-3.5 h-3.5" />
          Propulsé par Gemini AI
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">SFD Generator</h1>
        <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
          Deux outils professionnels pour documenter et visualiser vos projets bancaires, assistés par intelligence artificielle.
        </p>
      </div>

      {/* Cartes */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 px-8 pb-10 max-w-4xl mx-auto w-full">

        <ToolCard
          icon={FileText}
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
          badgeColor="bg-indigo-50 text-indigo-700"
          badge="📄 Documentation"
          title="Générateur SFD"
          subtitle="Produisez une Spécification Fonctionnelle Détaillée complète à partir de vos documents sources et d'un dialogue avec l'IA."
          features={[
            'Upload de documents PDF, Word, images',
            'Génération structurée par sections',
            'Chat IA pour affiner le contenu',
            'Export Word et HTML avec styles',
          ]}
          ctaLabel="Générer un SFD"
          ctaColor="bg-indigo-600 hover:bg-indigo-700"
          onClick={() => setView('sfd')}
        />

        <ToolCard
          icon={Globe}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
          badgeColor="bg-violet-50 text-violet-700"
          badge="🎨 Design"
          title="Mockup Rebranding"
          subtitle="Capturez les écrans d'un site web existant et appliquez automatiquement le design de votre client — logo, couleurs, identité visuelle."
          features={[
            'Capture automatique depuis une URL',
            'Application du logo et des couleurs client',
            'Deux moteurs de rebrandage (v1 & v2)',
            'Export Word avec maquettes intégrées',
          ]}
          ctaLabel="Rebrander un site"
          ctaColor="bg-violet-600 hover:bg-violet-700"
          onClick={() => setView('mockup')}
        />
      </div>

      {/* Footer info */}
      <div className="shrink-0 pb-6 text-center">
        <p className="text-xs text-gray-300">
          SFD Generator · ProcessMate
        </p>
      </div>
    </div>
  );
}

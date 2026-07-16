'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

export default function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { lang, setLang, t } = useLanguage();

  const navLinks = [
    { label: t.nav.produits, href: '/#produits' },
    { label: t.nav.pourquoi, href: '/#pourquoi' },
    { label: t.nav.commander, href: '/#commander' },
    { label: t.nav.contact, href: '/#contact' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Blue Protein" className="h-9 w-auto" />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <div className="inline-flex bg-slate-100 rounded-lg p-0.5 mr-1">
            <button
              onClick={() => setLang('fr')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${lang === 'fr' ? 'bg-white shadow text-emerald-800' : 'text-slate-500'}`}
            >
              FR
            </button>
            <button
              onClick={() => setLang('dar')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${lang === 'dar' ? 'bg-white shadow text-emerald-800' : 'text-slate-500'}`}
            >
              DAR
            </button>
          </div>
          <Link href="/#contact" className="text-sm font-medium text-slate-600 hover:text-emerald-700">{t.nav.espaceClient}</Link>
          <Link href="/#produits" className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            {t.nav.commanderCta} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <button className="md:hidden p-2" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 px-6 py-4 flex flex-col gap-4">
          <div className="inline-flex bg-slate-100 rounded-lg p-0.5 self-start">
            <button
              onClick={() => setLang('fr')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${lang === 'fr' ? 'bg-white shadow text-emerald-800' : 'text-slate-500'}`}
            >
              FR
            </button>
            <button
              onClick={() => setLang('dar')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${lang === 'dar' ? 'bg-white shadow text-emerald-800' : 'text-slate-500'}`}
            >
              DAR
            </button>
          </div>
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setMobileOpen(false)} className="text-sm font-medium text-slate-700">
              {l.label}
            </Link>
          ))}
          <Link href="/#produits" onClick={() => setMobileOpen(false)} className="inline-flex items-center justify-center gap-1.5 bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg">
            {t.nav.commanderCta} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </header>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Leaf, Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { label: 'Produits', href: '/#produits' },
  { label: 'Pourquoi Blue Protein', href: '/#pourquoi' },
  { label: 'Comment commander', href: '/#commander' },
  { label: 'Contact', href: '/#contact' },
];

export default function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-700 flex items-center justify-center">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight"><span className="text-blue-700">Blue</span>Protein</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/#contact" className="text-sm font-medium text-slate-600 hover:text-emerald-700">Espace client</Link>
          <Link href="/#produits" className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            Commander <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <button className="md:hidden p-2" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 px-6 py-4 flex flex-col gap-4">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setMobileOpen(false)} className="text-sm font-medium text-slate-700">
              {l.label}
            </Link>
          ))}
          <Link href="/#produits" onClick={() => setMobileOpen(false)} className="inline-flex items-center justify-center gap-1.5 bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg">
            Commander <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </header>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, Mail, Menu, Phone, Search, X } from 'lucide-react';
import { useLanguage, localizedField } from '@/lib/i18n';
import { categoryIcon } from '@/lib/categoryIcons';
import type { Product } from '@/types/product';

export default function SiteHeader({ products = [] }: { products?: Product[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { lang, setLang, t } = useLanguage();

  const megaRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))), [products]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => {
        const name = (localizedField(lang, p.name, p.name_dar) ?? '').toLowerCase();
        const tagline = (localizedField(lang, p.tagline, p.tagline_dar) ?? '').toLowerCase();
        return name.includes(q) || tagline.includes(q);
      })
      .slice(0, 6);
  }, [products, query, lang]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (megaRef.current && !megaRef.current.contains(e.target as Node)) setMegaOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, []);

  const navLinks = [
    { label: t.nav.pourquoi, href: '/#pourquoi' },
    { label: t.nav.commander, href: '/#commander' },
    { label: t.nav.contact, href: '/#contact' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="hidden sm:flex items-center justify-center gap-6 bg-emerald-950 text-emerald-100 text-xs py-1.5">
        <span className="inline-flex items-center gap-1.5"><Phone className="w-3 h-3" /> +212 5 26 11 22 77</span>
        <span className="inline-flex items-center gap-1.5"><Mail className="w-3 h-3" /> contact@blueprotein.ma</span>
      </div>

      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Blue Protein" className="h-9 w-auto" />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <div ref={megaRef} className="relative">
            <button
              onClick={() => setMegaOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors"
            >
              {t.nav.produits} <ChevronDown className={`w-3.5 h-3.5 transition-transform ${megaOpen ? 'rotate-180' : ''}`} />
            </button>
            {megaOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-72 bg-white rounded-xl border border-slate-200 shadow-lg p-2">
                <Link
                  href="/#produits"
                  onClick={() => setMegaOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                  {t.products.all}
                </Link>
                {categories.map((cat) => {
                  const Icon = categoryIcon(cat);
                  return (
                    <Link
                      key={cat}
                      href={`/?categorie=${encodeURIComponent(cat)}#produits`}
                      onClick={() => setMegaOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Icon className="w-4 h-4 text-emerald-700 shrink-0" /> {cat}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <div ref={searchRef} className="relative">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className="p-2 text-slate-500 hover:text-emerald-700 transition-colors"
              aria-label="Rechercher"
            >
              <Search className="w-4 h-4" />
            </button>
            {searchOpen && (
              <div className="absolute top-full right-0 mt-3 w-80 bg-white rounded-xl border border-slate-200 shadow-lg p-3">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher un produit..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {query.trim() && (
                  <div className="mt-2 max-h-72 overflow-y-auto">
                    {searchResults.length === 0 ? (
                      <p className="text-xs text-slate-400 px-2 py-3">Aucun résultat.</p>
                    ) : (
                      searchResults.map((p) => (
                        <Link
                          key={p.id}
                          href={`/produits/${p.slug}`}
                          onClick={() => { setSearchOpen(false); setQuery(''); }}
                          className="block px-2 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <span className="font-medium">{localizedField(lang, p.name, p.name_dar)}</span>
                          {p.tagline && <span className="block text-xs text-slate-500">{localizedField(lang, p.tagline, p.tagline_dar)}</span>}
                        </Link>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

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
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un produit..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {query.trim() && (
            <div className="-mt-2">
              {searchResults.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">Aucun résultat.</p>
              ) : (
                searchResults.map((p) => (
                  <Link
                    key={p.id}
                    href={`/produits/${p.slug}`}
                    onClick={() => { setMobileOpen(false); setQuery(''); }}
                    className="block py-2 text-sm text-slate-700"
                  >
                    {localizedField(lang, p.name, p.name_dar)}
                  </Link>
                ))
              )}
            </div>
          )}

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

          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{t.nav.produits}</div>
            <div className="flex flex-col gap-2">
              <Link href="/#produits" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-emerald-700">
                {t.products.all}
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat}
                  href={`/?categorie=${encodeURIComponent(cat)}#produits`}
                  onClick={() => setMobileOpen(false)}
                  className="text-sm font-medium text-slate-700"
                >
                  {cat}
                </Link>
              ))}
            </div>
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

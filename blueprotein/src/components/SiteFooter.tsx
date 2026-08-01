'use client';

import Link from 'next/link';
import { useLanguage, localizedField } from '@/lib/i18n';
import type { Product } from '@/types/product';

export default function SiteFooter({ products }: { products: Product[] }) {
  const { lang, t } = useLanguage();

  return (
    <footer className="bg-emerald-950 text-slate-300">
      <div className="max-w-7xl mx-auto px-6 py-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
        <div>
          <Link href="/" className="flex items-center mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.png" alt="Blue Protein" className="h-8 w-auto" />
          </Link>
          <p className="text-sm text-slate-400">{t.footer.tagline}</p>
        </div>
        <div>
          <h4 className="text-white font-semibold text-sm mb-4">{t.footer.productsTitle}</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            {products.map((p) => (
              <li key={p.id}>
                <Link href={`/produits/${p.slug}`} className="hover:text-white transition-colors">
                  {localizedField(lang, p.name, p.name_dar)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold text-sm mb-4">{t.footer.companyTitle}</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><Link href="/#pourquoi" className="hover:text-white transition-colors">{t.footer.companyLinks.pourquoi}</Link></li>
            <li><Link href="/#commander" className="hover:text-white transition-colors">{t.footer.companyLinks.commander}</Link></li>
            <li><Link href="/#contact" className="hover:text-white transition-colors">{t.footer.companyLinks.distributeur}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold text-sm mb-4">{t.footer.contactTitle}</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>contact@blueprotein.ma</li>
            <li>+212 5 26 11 22 77</li>
            <li>Maroc</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-emerald-900 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Blue Protein. {t.footer.rights}
      </div>
    </footer>
  );
}

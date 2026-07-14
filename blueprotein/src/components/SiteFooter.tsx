import Link from 'next/link';
import { Leaf } from 'lucide-react';
import { getPublishedProducts } from '@/lib/products';

export default async function SiteFooter() {
  const products = await getPublishedProducts();

  return (
    <footer className="bg-emerald-950 text-slate-300">
      <div className="max-w-7xl mx-auto px-6 py-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
        <div>
          <Link href="/" className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-700 flex items-center justify-center">
              <Leaf className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold"><span className="text-blue-400">Blue</span>Protein</span>
          </Link>
          <p className="text-sm text-slate-400">Biostimulants et engrais durables, adaptés aux besoins des agriculteurs marocains et africains.</p>
        </div>
        <div>
          <h4 className="text-white font-semibold text-sm mb-4">Produits</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            {products.map((p) => (
              <li key={p.id}>
                <Link href={`/produits/${p.slug}`} className="hover:text-white transition-colors">{p.name}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold text-sm mb-4">Entreprise</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><Link href="/#pourquoi" className="hover:text-white transition-colors">Pourquoi Blue Protein</Link></li>
            <li><Link href="/#commander" className="hover:text-white transition-colors">Comment commander</Link></li>
            <li><Link href="/#contact" className="hover:text-white transition-colors">Devenir distributeur</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold text-sm mb-4">Contact</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>contact@blueprotein.ma</li>
            <li>+212 5 26 11 22 77</li>
            <li>Maroc</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-emerald-900 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Blue Protein. Tous droits réservés.
      </div>
    </footer>
  );
}

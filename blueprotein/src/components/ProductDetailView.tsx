'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Beaker, Box, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import { ProductImage } from '@/components/media';
import { useLanguage, localizedField } from '@/lib/i18n';
import type { Product } from '@/types/product';

export default function ProductDetailView({ product }: { product: Product }) {
  const { lang, t } = useLanguage();
  const d = t.productDetail;
  const familyLabels = { liquide: d.familyLiquide, solide: d.familySolide };

  const name = localizedField(lang, product.name, product.name_dar);
  const tagline = localizedField(lang, product.tagline, product.tagline_dar);
  const description = localizedField(lang, product.description, product.description_dar) || localizedField(lang, product.summary, product.summary_dar);

  return (
    <>
      <div className="max-w-5xl mx-auto px-6 pt-8">
        <Link href="/#produits" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-emerald-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {d.back}
        </Link>
      </div>

      <section className="max-w-5xl mx-auto px-6 pt-6 pb-16">
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          <ProductImage src={product.image_url} className="relative h-72 lg:h-96 rounded-2xl shadow-lg" />

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                {familyLabels[product.family]}
              </span>
              <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                {product.category}
              </span>
              {product.badge && (
                <span className="bg-orange-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                  {product.badge}
                </span>
              )}
              {product.organic_certified && (
                <span className="inline-flex items-center gap-1 bg-emerald-700 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                  <ShieldCheck className="w-3.5 h-3.5" /> {d.certified}
                </span>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">{name}</h1>
            {tagline && <p className="text-lg text-emerald-700 font-medium mb-5">{tagline}</p>}
            <p className="text-slate-600 leading-relaxed mb-8">{description}</p>

            <div className="flex flex-wrap gap-3">
              <Link href="/#contact" className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-5 py-3 rounded-lg transition-colors">
                {d.requestQuote} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/#produits" className="inline-flex items-center gap-1.5 text-slate-700 font-semibold px-5 py-3 rounded-lg border border-slate-300 hover:border-emerald-600 hover:text-emerald-700 transition-colors">
                {d.seeOthers}
              </Link>
            </div>
          </div>
        </div>

        {product.advantages.length > 0 && (
          <div className="mt-14">
            <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-700" /> {d.advantages}
            </h2>
            <ul className="grid sm:grid-cols-2 gap-3">
              {product.advantages.map((a) => (
                <li key={a} className="flex items-start gap-2.5 text-sm text-slate-700 bg-emerald-50/60 rounded-lg p-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" /> {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-14 grid sm:grid-cols-2 gap-6">
          {product.dosage && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-semibold mb-2 flex items-center gap-2"><Beaker className="w-4 h-4 text-emerald-700" /> {d.dosage}</h3>
              <p className="text-sm text-slate-600 whitespace-pre-line">{product.dosage}</p>
            </div>
          )}
          {product.conditioning && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-semibold mb-2 flex items-center gap-2"><Box className="w-4 h-4 text-emerald-700" /> {d.conditioning}</h3>
              <p className="text-sm text-slate-600 whitespace-pre-line">{product.conditioning}</p>
            </div>
          )}
          {product.precautions && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:col-span-2">
              <h3 className="font-semibold mb-2 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-orange-600" /> {d.precautions}</h3>
              <p className="text-sm text-slate-600 whitespace-pre-line">{product.precautions}</p>
            </div>
          )}
        </div>

        {(product.variants.length > 0 || product.composition_summary) && (
          <div className="mt-14">
            <h2 className="text-xl font-bold mb-5">{d.composition}</h2>
            {product.variants.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {Object.keys(product.variants[0]).map((key) => (
                        <th key={key} className="text-left font-semibold text-slate-600 px-4 py-3 whitespace-nowrap">
                          {key === 'name' ? d.reference : key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants.map((variant) => (
                      <tr key={variant.name} className="border-t border-slate-200">
                        {Object.entries(variant).map(([key, value]) => (
                          <td key={key} className={`px-4 py-3 whitespace-nowrap ${key === 'name' ? 'font-medium text-slate-900' : 'text-slate-600'}`}>
                            {value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-xl p-6">{product.composition_summary}</p>
            )}
          </div>
        )}
      </section>
    </>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Check,
  Star, Phone, Mail, MapPin, Coins, Package,
  Tractor, Building2, ChevronRight, Quote, Award, Clock,
  Sprout, Globe, Wallet, CloudRain,
} from 'lucide-react';
import { HeroImage, ProductImage } from './media';
import ContactForm from './ContactForm';
import DynamicSection from './DynamicSection';
import { useLanguage, localizedField } from '@/lib/i18n';
import type { Product } from '@/types/product';
import type { SectionWithCards } from '@/types/section';

const VALUE_ICONS = [
  <Sprout key="sol" className="w-5 h-5 text-emerald-700" />,
  <Coins key="prix" className="w-5 h-5 text-emerald-700" />,
  <Globe key="afrique" className="w-5 h-5 text-emerald-700" />,
];

const NEEDS_ICONS = [
  <Wallet key="cout" className="w-4 h-4" />,
  <Sprout key="sol" className="w-4 h-4" />,
  <CloudRain key="climat" className="w-4 h-4" />,
  <Package key="produits" className="w-4 h-4" />,
];

// Direct testimonial quotes stay in French only — translating an attributed
// quote into a different dialect than the person actually spoke would be
// putting words in their mouth.
const TESTIMONIALS = [
  { name: 'Youssef El Amrani', role: 'Maraîcher, Souss-Massa, Maroc', quote: "Avec les produits Blue Protein, la structure de nos terres s'est nettement améliorée. Et le coût de nutrition a baissé par rapport à nos anciens engrais." },
  { name: 'Moussa Traoré', role: 'Exploitant, 40 ha — céréales, Burkina Faso', quote: "Depuis qu'on est passés à Blue Stimulant, la reprise de végétation est nettement plus rapide. Et je commande tout depuis mon téléphone." },
  { name: 'Fatou Cissé', role: 'Coopérative agricole, 12 membres, Burkina Faso', quote: 'Le support agronomique nous a aidés à choisir les bons dosages. Les livraisons sont toujours dans les délais annoncés.' },
];

type Audience = 'agriculteurs' | 'fournisseurs';

export default function BlueProteinHome({ products, sections }: { products: Product[]; sections: SectionWithCards[] }) {
  const { lang, t } = useLanguage();
  const [activeCategory, setActiveCategory] = useState('Tous');
  const [activeAudience, setActiveAudience] = useState<Audience>('agriculteurs');

  const categories = useMemo(() => {
    const unique = Array.from(new Set(products.map((p) => p.category)));
    return [t.products.all, ...unique];
  }, [products, t.products.all]);

  const filteredProducts = activeCategory === t.products.all
    ? products
    : products.filter((p) => p.category === activeCategory);

  const audience = t.audience[activeAudience];
  const familyLabels = { liquide: t.products.familyLiquide, solide: t.products.familySolide };

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-emerald-50/70 to-white">
        <div className="max-w-7xl mx-auto px-6 pt-16 pb-24 md:pt-20 md:pb-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <div className="flex items-center gap-2.5 text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-5">
              <span className="w-6 h-px bg-emerald-600" /> {t.hero.badge}
            </div>
            <h1 className="text-3xl md:text-[2.75rem] font-bold text-slate-900 leading-[1.15] mb-5">
              {t.hero.title} <span className="text-emerald-700">{t.hero.titleHighlight}</span>
            </h1>
            <p className="text-slate-600 text-base md:text-lg mb-8 max-w-lg">
              {t.hero.subtitle}
            </p>
            <div className="flex flex-wrap gap-3 mb-9">
              <Link href="#produits" className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-5 py-3 rounded-lg transition-colors">
                {t.hero.ctaProducts} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="#pourquoi" className="inline-flex items-center gap-1.5 text-slate-700 font-semibold px-5 py-3 rounded-lg border border-slate-300 hover:border-emerald-600 hover:text-emerald-700 transition-colors">
                {t.hero.ctaDistrib}
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {t.hero.trust.map((tr) => (
                <span key={tr} className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                  <Check className="w-4 h-4 text-emerald-600" /> {tr}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mb-6">
            <HeroImage className="relative h-72 md:h-[26rem] rounded-2xl shadow-xl" />
            <div className="absolute -bottom-6 left-6 bg-white rounded-xl shadow-lg border border-slate-100 px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0">
                <Coins className="w-4 h-4" />
              </div>
              <div>
                <div className="text-lg font-bold text-slate-900 leading-none">{t.hero.statValue}</div>
                <div className="text-xs text-slate-500">{t.hero.statLabel}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Valeurs clés ───────────────────────────────────────── */}
      <section className="border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-3 gap-8">
          {t.values.map((v, i) => (
            <div key={v.id} className="flex gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">{VALUE_ICONS[i]}</div>
              <div>
                <h3 className="font-semibold mb-1">{v.title}</h3>
                <p className="text-sm text-slate-600">{v.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Produits ───────────────────────────────────────────── */}
      <section id="produits" className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">{t.products.title}</h2>
          <p className="text-slate-600">{t.products.subtitle}</p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                activeCategory === cat
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-orange-400 hover:text-orange-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {filteredProducts.length === 0 ? (
          <p className="text-center text-slate-500">{t.products.empty}</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map((p) => (
              <Link
                key={p.id}
                href={`/produits/${p.slug}`}
                className="group rounded-xl overflow-hidden border border-slate-200 hover:shadow-lg transition-shadow bg-white"
              >
                <div className="relative h-48">
                  <ProductImage src={p.image_url} className="absolute inset-0" />
                  {p.badge && (
                    <span className="absolute top-3 left-3 bg-orange-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                      {p.badge}
                    </span>
                  )}
                  <span className="absolute top-3 right-3 bg-white/90 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                    {familyLabels[p.family]}
                  </span>
                  <div className="absolute bottom-3 left-4 right-4">
                    <span className="text-emerald-200 text-xs font-semibold uppercase tracking-wide">{p.category}</span>
                    <h3 className="text-white text-xl font-bold">{localizedField(lang, p.name, p.name_dar)}</h3>
                  </div>
                </div>
                <div className="p-5">
                  {p.tagline && <p className="text-sm font-semibold text-emerald-700 mb-1.5">{localizedField(lang, p.tagline, p.tagline_dar)}</p>}
                  <p className="text-sm text-slate-600 mb-4">{localizedField(lang, p.summary, p.summary_dar)}</p>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 group-hover:gap-2 transition-all">
                    {t.products.viewSheet} <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Vos besoins ────────────────────────────────────────── */}
      <section id="besoins" className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="flex items-center gap-2.5 text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-5">
              <span className="w-6 h-px bg-emerald-600" /> {t.needs.eyebrow}
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">{t.needs.title}</h2>
            <p className="text-slate-600 mb-6">{t.needs.subtitle}</p>
            <ul className="space-y-3">
              {t.needs.items.map((n, i) => (
                <li key={n.id} className="flex items-center gap-3 text-sm text-slate-700">
                  <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">{NEEDS_ICONS[i]}</span>
                  {n.text}
                </li>
              ))}
            </ul>
          </div>

          <ProductImage className="relative h-80 rounded-2xl" />
        </div>
      </section>

      {/* ── Sections dynamiques (gérées depuis l'admin) ─────────── */}
      {sections.length > 0 && (
        <section id="pourquoi" className="bg-slate-50 border-y border-slate-200">
          <div className="max-w-7xl mx-auto px-6 py-20 space-y-20">
            {sections.map((s) => (
              <DynamicSection key={s.id} section={s} />
            ))}
          </div>
        </section>
      )}

      {/* ── Stats ──────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-emerald-800 to-emerald-950">
        <div className="max-w-7xl mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {t.stats.map((s) => (
            <div key={s.id}>
              <div className="text-3xl md:text-4xl font-extrabold text-white mb-1">{s.value}</div>
              <div className="text-sm text-emerald-200">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Onglets de conversion (agriculteurs / fournisseurs) ─── */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex bg-slate-100 rounded-lg p-1 mb-8">
              <button
                onClick={() => setActiveAudience('agriculteurs')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                  activeAudience === 'agriculteurs' ? 'bg-white shadow text-emerald-800' : 'text-slate-500'
                }`}
              >
                <Tractor className="w-4 h-4" /> {t.audience.tabAgri}
              </button>
              <button
                onClick={() => setActiveAudience('fournisseurs')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                  activeAudience === 'fournisseurs' ? 'bg-white shadow text-emerald-800' : 'text-slate-500'
                }`}
              >
                <Building2 className="w-4 h-4" /> {t.audience.tabFourn}
              </button>
            </div>

            <h2 className="text-2xl md:text-3xl font-bold mb-4">{audience.title}</h2>
            <p className="text-slate-600 mb-6">{audience.desc}</p>
            <ul className="space-y-3 mb-8">
              {audience.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <Check className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" /> {b}
                </li>
              ))}
            </ul>
            <Link href="#contact" className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-5 py-3 rounded-lg transition-colors">
              {audience.cta} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <ProductImage className="relative h-80 rounded-2xl" />
        </div>
      </section>

      {/* ── Témoignages ────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">{t.testimonials.title}</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((te) => (
            <div key={te.name} className="bg-white rounded-xl border border-slate-200 p-6">
              <Quote className="w-6 h-6 text-emerald-200 mb-3" />
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm text-slate-700 mb-4">&ldquo;{te.quote}&rdquo;</p>
              <div className="text-sm font-semibold">{te.name}</div>
              <div className="text-xs text-slate-500">{te.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA banner ─────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-emerald-800 to-emerald-950">
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <Award className="w-8 h-8 text-orange-300 mx-auto mb-4" />
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">{t.ctaBanner.title}</h2>
          <p className="text-emerald-200 mb-8 max-w-xl mx-auto">{t.ctaBanner.subtitle}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="#produits" className="inline-flex items-center gap-1.5 bg-white text-emerald-900 font-semibold px-5 py-3 rounded-lg hover:bg-slate-100 transition-colors">
              {t.ctaBanner.ctaProducts} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="#contact" className="inline-flex items-center gap-1.5 bg-white/10 text-white font-semibold px-5 py-3 rounded-lg border border-white/30 hover:bg-white/20 transition-colors">
              {t.ctaBanner.ctaContact}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Contact ────────────────────────────────────────────── */}
      <section id="contact" className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3">{t.contact.title}</h2>
            <p className="text-slate-600 mb-8">{t.contact.subtitle}</p>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Phone className="w-4 h-4 text-emerald-700" /> +212 5 26 11 22 77
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Mail className="w-4 h-4 text-emerald-700" /> contact@blueprotein.ma
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <MapPin className="w-4 h-4 text-emerald-700" /> Maroc
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Clock className="w-4 h-4 text-emerald-700" /> {t.contact.hours}
              </div>
            </div>
          </div>

          <ContactForm />
        </div>
      </section>
    </>
  );
}

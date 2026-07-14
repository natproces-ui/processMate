'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FlaskConical, Truck, ShieldCheck, Users, ArrowRight, Check,
  Star, Phone, Mail, MapPin, Coins, Package,
  Tractor, Building2, ChevronRight, ChevronDown, Quote, ClipboardList, Award, Clock,
  Sprout, Globe, Wallet, CloudRain,
} from 'lucide-react';
import { HeroImage, ProductImage } from './media';
import ContactForm from './ContactForm';
import type { Product } from '@/types/product';

const WHY_ITEMS = [
  { icon: <FlaskConical className="w-5 h-5" />, title: 'Testé avant validation', desc: "Chaque formulation est éprouvée en conditions réelles avant sa mise sur le marché." },
  { icon: <ShieldCheck className="w-5 h-5" />, title: 'Traçabilité complète', desc: 'Chaque lot est suivi de la production à la livraison, avec fiches techniques disponibles.' },
  { icon: <Users className="w-5 h-5" />, title: 'Agronomes de terrain', desc: 'Une équipe locale disponible pour vous accompagner dans le choix des produits.' },
  { icon: <Truck className="w-5 h-5" />, title: 'Livraison rapide', desc: "Un réseau logistique au Maroc et en Afrique de l'Ouest, sans intermédiaire." },
  { icon: <Coins className="w-5 h-5" />, title: 'Prix accessibles', desc: 'Une nutrition efficace à prix producteur, pour réduire durablement vos coûts.' },
  { icon: <Package className="w-5 h-5" />, title: 'Formulations sur mesure', desc: 'Conditionnements et dosages adaptés aux besoins des distributeurs et coopératives.' },
];

const NEEDS_ITEMS = [
  { icon: <Wallet className="w-4 h-4" />, text: "Des coûts d'intrants imprévisibles qui rongent la rentabilité" },
  { icon: <Sprout className="w-4 h-4" />, text: 'Des sols fatigués et des rendements qui stagnent' },
  { icon: <CloudRain className="w-4 h-4" />, text: 'Un climat de plus en plus sec et instable' },
  { icon: <Package className="w-4 h-4" />, text: 'Des produits pensés ailleurs, mal adaptés au terrain local' },
];

const METHODOLOGY = [
  {
    title: 'Diagnostic terrain',
    summary: "On part de votre sol, pas d'une fiche produit.",
    detail: "Avant toute recommandation, nous analysons le sol, la culture et les conditions climatiques de votre exploitation, pour identifier ce qui limite réellement le rendement.",
  },
  {
    title: 'Formulation adaptée',
    summary: "Des produits pensés pour le Maroc et l'Afrique, pas importés tels quels.",
    detail: "Chaque formulation Blue Protein est conçue pour répondre aux besoins précis des cultures et des sols locaux, plutôt qu'adaptée après coup d'un produit pensé pour un autre climat.",
  },
  {
    title: 'Test & validation terrain',
    summary: "Rien n'est commercialisé sans preuve sur le terrain.",
    detail: "Chaque produit est testé en conditions réelles, sur des parcelles locales, avant sa mise sur le marché — pas seulement en laboratoire.",
  },
  {
    title: 'Accompagnement continu',
    summary: 'Un suivi agronomique après la vente, pas juste une livraison.',
    detail: "Nos agronomes suivent les résultats dans la durée et ajustent les recommandations selon les cycles de culture et les retours du terrain.",
  },
];

const STATS = [
  { value: '13', label: 'produits au catalogue' },
  { value: '100 %', label: 'formulations à base organique' },
  { value: '3', label: 'certifiées CCPB bio' },
  { value: '2', label: 'gammes : liquide & solide' },
];

type Audience = 'agriculteurs' | 'fournisseurs';

const AUDIENCE_CONTENT: Record<Audience, { title: string; desc: string; bullets: string[]; cta: string }> = {
  agriculteurs: {
    title: 'Pour les agriculteurs',
    desc: 'Commandez directement vos intrants en ligne, sans passer par un revendeur, et suivez vos livraisons en temps réel.',
    bullets: [
      'Catalogue complet accessible 24/7',
      'Conseils agronomiques personnalisés',
      'Prix producteur, sans marge intermédiaire',
      'Réassort simplifié en un clic',
    ],
    cta: 'Créer mon compte agriculteur',
  },
  fournisseurs: {
    title: 'Pour les fournisseurs & distributeurs',
    desc: 'Approvisionnez votre réseau avec des formulations en volume et des conditions commerciales dédiées aux professionnels.',
    bullets: [
      'Tarifs dégressifs par palier de volume',
      'Conditionnements et marque blanche possibles',
      'Interlocuteur commercial dédié',
      'Support logistique et export',
    ],
    cta: 'Devenir partenaire distributeur',
  },
};

const TESTIMONIALS = [
  { name: 'Youssef El Amrani', role: 'Maraîcher, Souss-Massa, Maroc', quote: "Avec les produits Blue Protein, la structure de nos terres s'est nettement améliorée. Et le coût de nutrition a baissé par rapport à nos anciens engrais." },
  { name: 'Moussa Traoré', role: 'Exploitant, 40 ha — céréales, Burkina Faso', quote: "Depuis qu'on est passés à Blue Stimulant, la reprise de végétation est nettement plus rapide. Et je commande tout depuis mon téléphone." },
  { name: 'Fatou Cissé', role: 'Coopérative agricole, 12 membres, Burkina Faso', quote: 'Le support agronomique nous a aidés à choisir les bons dosages. Les livraisons sont toujours dans les délais annoncés.' },
];

const STEPS = [
  { icon: <ClipboardList className="w-5 h-5" />, title: 'Créer un compte', desc: 'Inscription gratuite en 2 minutes, agriculteur ou distributeur.' },
  { icon: <Package className="w-5 h-5" />, title: 'Parcourir le catalogue', desc: 'Filtrez par gamme, catégorie ou objectif agronomique.' },
  { icon: <Check className="w-5 h-5" />, title: 'Commander en ligne', desc: 'Paiement sécurisé, devis instantané pour les gros volumes.' },
  { icon: <Truck className="w-5 h-5" />, title: 'Livraison & suivi', desc: "Suivi de commande en temps réel jusqu'à la parcelle." },
];

const FAMILY_LABELS: Record<Product['family'], string> = {
  liquide: 'Liquide',
  solide: 'Solide',
};

export default function BlueProteinHome({ products }: { products: Product[] }) {
  const [activeCategory, setActiveCategory] = useState('Tous');
  const [activeAudience, setActiveAudience] = useState<Audience>('agriculteurs');
  const [openMethod, setOpenMethod] = useState<number | null>(0);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(products.map((p) => p.category)));
    return ['Tous', ...unique];
  }, [products]);

  const filteredProducts = activeCategory === 'Tous'
    ? products
    : products.filter((p) => p.category === activeCategory);

  const audience = AUDIENCE_CONTENT[activeAudience];

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-emerald-50/70 to-white">
        <div className="max-w-7xl mx-auto px-6 pt-16 pb-24 md:pt-20 md:pb-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <div className="flex items-center gap-2.5 text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-5">
              <span className="w-6 h-px bg-emerald-600" /> Biostimulants pour le Maroc &amp; l&apos;Afrique
            </div>
            <h1 className="text-3xl md:text-[2.75rem] font-bold text-slate-900 leading-[1.15] mb-5">
              Améliorer le sol. Nourrir vos cultures. <span className="text-emerald-700">À moindre coût.</span>
            </h1>
            <p className="text-slate-600 text-base md:text-lg mb-8 max-w-lg">
              Blue Protein conçoit des biostimulants durables et des engrais adaptés aux besoins réels des agriculteurs marocains et africains — testés sur le terrain, validés avant commercialisation.
            </p>
            <div className="flex flex-wrap gap-3 mb-9">
              <Link href="#produits" className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-5 py-3 rounded-lg transition-colors">
                Découvrir les produits <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="#pourquoi" className="inline-flex items-center gap-1.5 text-slate-700 font-semibold px-5 py-3 rounded-lg border border-slate-300 hover:border-emerald-600 hover:text-emerald-700 transition-colors">
                Devenir distributeur
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {['Testé sur le terrain', 'Prix producteur', 'Adapté au climat local'].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                  <Check className="w-4 h-4 text-emerald-600" /> {t}
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
                <div className="text-lg font-bold text-slate-900 leading-none">-30 %</div>
                <div className="text-xs text-slate-500">coût moyen de nutrition</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Valeurs clés ───────────────────────────────────────── */}
      <section className="border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-3 gap-8">
          {[
            { icon: <Sprout className="w-5 h-5 text-emerald-700" />, title: 'Nous améliorons le sol', desc: 'Des biostimulants qui régénèrent la structure et la vie du sol, pour une fertilité qui dure.' },
            { icon: <Coins className="w-5 h-5 text-emerald-700" />, title: 'Nourrir vos plantes, moins cher', desc: "Une nutrition efficace à prix producteur, sans marge d'intermédiaire ni de distributeur." },
            { icon: <Globe className="w-5 h-5 text-emerald-700" />, title: "Pensé pour l'Afrique", desc: 'Formulations testées et validées sur les cultures et climats marocains et africains.' },
          ].map((v) => (
            <div key={v.title} className="flex gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">{v.icon}</div>
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
          <h2 className="text-2xl md:text-3xl font-bold mb-3">Notre gamme de produits</h2>
          <p className="text-slate-600">Des solutions professionnelles pour la nutrition, la structure du sol et la vitalité des cultures.</p>
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
          <p className="text-center text-slate-500">Aucun produit publié pour cette catégorie pour l&apos;instant.</p>
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
                    {FAMILY_LABELS[p.family]}
                  </span>
                  <div className="absolute bottom-3 left-4 right-4">
                    <span className="text-emerald-200 text-xs font-semibold uppercase tracking-wide">{p.category}</span>
                    <h3 className="text-white text-xl font-bold">{p.name}</h3>
                  </div>
                </div>
                <div className="p-5">
                  {p.tagline && <p className="text-sm font-semibold text-emerald-700 mb-1.5">{p.tagline}</p>}
                  <p className="text-sm text-slate-600 mb-4">{p.summary}</p>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 group-hover:gap-2 transition-all">
                    Voir la fiche produit <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Pourquoi Blue Protein ──────────────────────────────── */}
      <section id="pourquoi" className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">Pourquoi Blue Protein</h2>
            <p className="text-slate-600">Une marque pensée pour les professionnels de l&apos;agriculture, du champ à la coopérative.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {WHY_ITEMS.map((it) => (
              <div key={it.title} className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700 mb-4">{it.icon}</div>
                <h3 className="font-semibold mb-1.5">{it.title}</h3>
                <p className="text-sm text-slate-600">{it.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Vos besoins, notre méthode ─────────────────────────── */}
      <section id="besoins" className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-16">
          <div>
            <div className="flex items-center gap-2.5 text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-5">
              <span className="w-6 h-px bg-emerald-600" /> On comprend vos besoins
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Vos contraintes, pas une fiche produit générique</h2>
            <p className="text-slate-600 mb-6">
              Trop de solutions agricoles sont pensées ailleurs, puis vendues telles quelles au Maroc et en Afrique. Blue Protein part de vos contraintes réelles, pas l&apos;inverse.
            </p>
            <ul className="space-y-3">
              {NEEDS_ITEMS.map((n) => (
                <li key={n.text} className="flex items-center gap-3 text-sm text-slate-700">
                  <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">{n.icon}</span>
                  {n.text}
                </li>
              ))}
            </ul>
          </div>

          <ProductImage className="relative h-80 rounded-2xl" />
        </div>

        <div>
          <h3 className="text-xl font-bold mb-2">Notre méthodologie</h3>
          <p className="text-slate-600 mb-6">Cliquez sur une étape pour voir comment on s&apos;y prend concrètement.</p>
          <div className="space-y-3">
            {METHODOLOGY.map((m, i) => {
              const isOpen = openMethod === i;
              return (
                <div key={m.title} className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenMethod(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left bg-white hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <div className="text-xs font-bold text-emerald-700 mb-0.5">ÉTAPE {i + 1}</div>
                      <div className="font-semibold text-slate-900">{m.title}</div>
                      <div className="text-sm text-slate-500">{m.summary}</div>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-sm text-slate-600 bg-white">
                      {m.detail}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-emerald-800 to-emerald-950">
        <div className="max-w-7xl mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
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
                <Tractor className="w-4 h-4" /> Agriculteurs
              </button>
              <button
                onClick={() => setActiveAudience('fournisseurs')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                  activeAudience === 'fournisseurs' ? 'bg-white shadow text-emerald-800' : 'text-slate-500'
                }`}
              >
                <Building2 className="w-4 h-4" /> Fournisseurs & distributeurs
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

      {/* ── Comment commander ──────────────────────────────────── */}
      <section id="commander" className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">Comment commander</h2>
            <p className="text-slate-600">Quatre étapes entre votre inscription et la réception de votre commande.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative bg-white rounded-xl border border-slate-200 p-6">
                <div className="text-xs font-bold text-orange-600 mb-3">ÉTAPE {i + 1}</div>
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700 mb-4">{s.icon}</div>
                <h3 className="font-semibold mb-1.5">{s.title}</h3>
                <p className="text-sm text-slate-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Témoignages ────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">Ils utilisent Blue Protein</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="bg-white rounded-xl border border-slate-200 p-6">
              <Quote className="w-6 h-6 text-emerald-200 mb-3" />
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm text-slate-700 mb-4">&ldquo;{t.quote}&rdquo;</p>
              <div className="text-sm font-semibold">{t.name}</div>
              <div className="text-xs text-slate-500">{t.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA banner ─────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-emerald-800 to-emerald-950">
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <Award className="w-8 h-8 text-orange-300 mx-auto mb-4" />
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Prêt à améliorer votre sol et réduire vos coûts ?</h2>
          <p className="text-emerald-200 mb-8 max-w-xl mx-auto">Rejoignez les exploitations et distributeurs qui font confiance à Blue Protein pour leurs intrants.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="#produits" className="inline-flex items-center gap-1.5 bg-white text-emerald-900 font-semibold px-5 py-3 rounded-lg hover:bg-slate-100 transition-colors">
              Voir les produits <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="#contact" className="inline-flex items-center gap-1.5 bg-white/10 text-white font-semibold px-5 py-3 rounded-lg border border-white/30 hover:bg-white/20 transition-colors">
              Parler à un conseiller
            </Link>
          </div>
        </div>
      </section>

      {/* ── Contact ────────────────────────────────────────────── */}
      <section id="contact" className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3">Contactez-nous</h2>
            <p className="text-slate-600 mb-8">Une question sur un produit, une commande en volume ou un partenariat distributeur ? Notre équipe vous répond sous 24h.</p>
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
                <Clock className="w-4 h-4 text-emerald-700" /> Lun–Ven, 8h–18h
              </div>
            </div>
          </div>

          <ContactForm />
        </div>
      </section>
    </>
  );
}

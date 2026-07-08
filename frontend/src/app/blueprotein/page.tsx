'use client';

import { useState } from 'react';
import {
  Leaf, FlaskConical, Truck, ShieldCheck, Users, ArrowRight, Check,
  Star, Menu, X, Phone, Mail, MapPin, Coins, Package,
  Tractor, Building2, ChevronRight, Quote, ClipboardList, Award, Clock,
  Sprout, Globe,
} from 'lucide-react';

/* ══════════════════════════════════════════════════════════════════
   VISUELS PLACEHOLDER
   En attendant les photos définitives de chaque produit et du siège,
   une seule photo (granulés épandus) illustre toutes les fiches
   produit, et une photo terrain illustre le hero. À remplacer produit
   par produit une fois les visuels de marque disponibles.
   ══════════════════════════════════════════════════════════════════ */

const HERO_IMG = '/blueprotein/hero-farmer.jpg';
const PRODUCT_PLACEHOLDER_IMG = '/blueprotein/product-placeholder.jpg';

function HeroImage({ className = '' }: { className?: string }) {
  return (
    <div className={`overflow-hidden bg-emerald-950 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={HERO_IMG} alt="Agriculteur dans un champ de cultures" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/30 via-transparent to-transparent" />
    </div>
  );
}

function ProductImage({ className = '' }: { className?: string }) {
  return (
    <div className={`overflow-hidden bg-emerald-950 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PRODUCT_PLACEHOLDER_IMG} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/70 via-emerald-950/10 to-transparent" />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   DONNÉES
   ══════════════════════════════════════════════════════════════════ */

const NAV_LINKS = [
  { label: 'Produits', href: '#produits' },
  { label: 'Pourquoi Blue Protein', href: '#pourquoi' },
  { label: 'Comment commander', href: '#commander' },
  { label: 'Contact', href: '#contact' },
];

const CATEGORIES = ['Tous', 'Engrais', 'Amendements', 'Biostimulants', 'Acides aminés', 'Foliaire', 'Grossistes'];

interface ProductItem {
  id: string;
  category: string;
  name: string;
  tagline: string;
  description: string;
  badge?: string;
}

const PRODUCTS: ProductItem[] = [
  {
    id: 'bluepro-fertil',
    category: 'Engrais',
    name: 'BluePro Fertil',
    tagline: 'Engrais protéinés',
    description: 'Nutrition efficace à libération progressive, pour une croissance plus forte à moindre coût.',
    badge: 'Best-seller',
  },
  {
    id: 'bluepro-sol',
    category: 'Amendements',
    name: 'BluePro Sol',
    tagline: 'Amendements du sol',
    description: 'Régénère la structure et la vie du sol pour une fertilité durable, adaptée aux terres locales.',
  },
  {
    id: 'bluepro-stim',
    category: 'Biostimulants',
    name: 'BluePro Stim',
    tagline: 'Biostimulants',
    description: 'Renforce les défenses naturelles des cultures, un biostimulant durable pensé pour le terrain africain.',
  },
  {
    id: 'bluepro-amino',
    category: 'Acides aminés',
    name: 'BluePro Amino',
    tagline: 'Acides aminés & peptides',
    description: 'Hydrolysats de protéines à assimilation rapide, pour corriger les stress physiologiques à coût maîtrisé.',
    badge: 'Nouveau',
  },
  {
    id: 'bluepro-foliar',
    category: 'Foliaire',
    name: 'BluePro Foliar',
    tagline: 'Fertilisants foliaires',
    description: 'Correction rapide des carences par voie foliaire, pour une réponse visible en quelques jours.',
  },
  {
    id: 'bluepro-bulk',
    category: 'Grossistes',
    name: 'BluePro Bulk',
    tagline: 'Solutions fournisseurs & coopératives',
    description: 'Formulations en volume et conditionnements adaptés pour distributeurs et coopératives agricoles.',
  },
];

const WHY_ITEMS = [
  { icon: <FlaskConical className="w-5 h-5" />, title: 'Testé avant validation', desc: "Chaque formulation est éprouvée en conditions réelles avant sa mise sur le marché." },
  { icon: <ShieldCheck className="w-5 h-5" />, title: 'Traçabilité complète', desc: 'Chaque lot est suivi de la production à la livraison, avec fiches techniques disponibles.' },
  { icon: <Users className="w-5 h-5" />, title: 'Agronomes de terrain', desc: 'Une équipe locale disponible pour vous accompagner dans le choix des produits.' },
  { icon: <Truck className="w-5 h-5" />, title: 'Livraison rapide', desc: 'Un réseau logistique au Maroc et en Afrique de l\'Ouest, sans intermédiaire.' },
  { icon: <Coins className="w-5 h-5" />, title: 'Prix accessibles', desc: 'Une nutrition efficace à prix producteur, pour réduire durablement vos coûts.' },
  { icon: <Package className="w-5 h-5" />, title: 'Formulations sur mesure', desc: 'Conditionnements et dosages adaptés aux besoins des distributeurs et coopératives.' },
];

const STATS = [
  { value: '800+', label: 'exploitations accompagnées' },
  { value: '12', label: 'pays au Maroc et en Afrique' },
  { value: '-30 %', label: 'coût moyen de nutrition' },
  { value: '100 %', label: 'des lots testés sur le terrain' },
];

type Audience = 'agriculteurs' | 'fournisseurs';

const AUDIENCE_CONTENT: Record<Audience, {
  title: string; desc: string; bullets: string[]; cta: string;
}> = {
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
  { name: 'Youssef El Amrani', role: 'Maraîcher, Souss-Massa, Maroc', quote: "Avec BluePro Sol, la structure de nos terres s'est nettement améliorée. Et le coût de nutrition a baissé par rapport à nos anciens engrais." },
  { name: 'Moussa Traoré', role: 'Exploitant, 40 ha — céréales, Burkina Faso', quote: "Depuis qu'on est passés à BluePro Fertil, la reprise de végétation est nettement plus rapide. Et je commande tout depuis mon téléphone." },
  { name: 'Fatou Cissé', role: 'Coopérative agricole, 12 membres, Burkina Faso', quote: "Le support agronomique nous a aidés à choisir les bons dosages. Les livraisons sont toujours dans les délais annoncés." },
];

const STEPS = [
  { icon: <ClipboardList className="w-5 h-5" />, title: 'Créer un compte', desc: 'Inscription gratuite en 2 minutes, agriculteur ou distributeur.' },
  { icon: <Package className="w-5 h-5" />, title: 'Parcourir le catalogue', desc: 'Filtrez par culture, objectif agronomique ou format.' },
  { icon: <Check className="w-5 h-5" />, title: 'Commander en ligne', desc: 'Paiement sécurisé, devis instantané pour les gros volumes.' },
  { icon: <Truck className="w-5 h-5" />, title: 'Livraison & suivi', desc: 'Suivi de commande en temps réel jusqu\'à la parcelle.' },
];

/* ══════════════════════════════════════════════════════════════════
   PAGE
   ══════════════════════════════════════════════════════════════════ */

export default function BlueProteinPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('Tous');
  const [activeAudience, setActiveAudience] = useState<Audience>('agriculteurs');
  const [contactSent, setContactSent] = useState(false);

  const filteredProducts = activeCategory === 'Tous'
    ? PRODUCTS
    : PRODUCTS.filter((p) => p.category === activeCategory);

  const audience = AUDIENCE_CONTENT[activeAudience];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-700 flex items-center justify-center">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight"><span className="text-blue-700">Blue</span>Protein</span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <a href="#contact" className="text-sm font-medium text-slate-600 hover:text-emerald-700">Espace client</a>
            <a href="#produits" className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Commander <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          <button className="md:hidden p-2" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-slate-200 px-6 py-4 flex flex-col gap-4">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)} className="text-sm font-medium text-slate-700">
                {l.label}
              </a>
            ))}
            <a href="#produits" onClick={() => setMobileOpen(false)} className="inline-flex items-center justify-center gap-1.5 bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg">
              Commander <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        )}
      </header>

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
              <a href="#produits" className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-5 py-3 rounded-lg transition-colors">
                Découvrir les produits <ArrowRight className="w-4 h-4" />
              </a>
              <a href="#pourquoi" className="inline-flex items-center gap-1.5 text-slate-700 font-semibold px-5 py-3 rounded-lg border border-slate-300 hover:border-emerald-600 hover:text-emerald-700 transition-colors">
                Devenir distributeur
              </a>
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
          {CATEGORIES.map((cat) => (
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

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((p) => (
            <div key={p.id} className="group rounded-xl overflow-hidden border border-slate-200 hover:shadow-lg transition-shadow bg-white">
              <div className="relative h-48">
                <ProductImage className="absolute inset-0" />
                {p.badge && (
                  <span className="absolute top-3 left-3 bg-orange-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                    {p.badge}
                  </span>
                )}
                <div className="absolute bottom-3 left-4 right-4">
                  <span className="text-emerald-200 text-xs font-semibold uppercase tracking-wide">{p.category}</span>
                  <h3 className="text-white text-xl font-bold">{p.name}</h3>
                </div>
              </div>
              <div className="p-5">
                <p className="text-sm font-semibold text-emerald-700 mb-1.5">{p.tagline}</p>
                <p className="text-sm text-slate-600 mb-4">{p.description}</p>
                <a href="#" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 group-hover:gap-2 transition-all">
                  Voir la fiche produit <ChevronRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
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
            <a href="#contact" className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-5 py-3 rounded-lg transition-colors">
              {audience.cta} <ArrowRight className="w-4 h-4" />
            </a>
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
            <a href="#produits" className="inline-flex items-center gap-1.5 bg-white text-emerald-900 font-semibold px-5 py-3 rounded-lg hover:bg-slate-100 transition-colors">
              Voir les produits <ArrowRight className="w-4 h-4" />
            </a>
            <a href="#contact" className="inline-flex items-center gap-1.5 bg-white/10 text-white font-semibold px-5 py-3 rounded-lg border border-white/30 hover:bg-white/20 transition-colors">
              Parler à un conseiller
            </a>
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
                <Phone className="w-4 h-4 text-emerald-700" /> +212 5 22 00 00 00
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Mail className="w-4 h-4 text-emerald-700" /> contact@blueprotein.com
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <MapPin className="w-4 h-4 text-emerald-700" /> Casablanca, Maroc — bureau régional : Ouagadougou, Burkina Faso
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Clock className="w-4 h-4 text-emerald-700" /> Lun–Ven, 8h–18h
              </div>
            </div>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); setContactSent(true); }}
            className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4"
          >
            {contactSent ? (
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <Check className="w-4 h-4" /> Merci, votre message a bien été enregistré. Un conseiller vous recontacte sous 24h.
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Nom complet</label>
                    <input type="text" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Votre nom" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Société / Exploitation</label>
                    <input type="text" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Optionnel" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
                  <input type="email" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="vous@exemple.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Message</label>
                  <textarea rows={4} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Décrivez votre besoin..." />
                </div>
                <button type="submit" className="w-full inline-flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-5 py-3 rounded-lg transition-colors">
                  Envoyer le message <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}
          </form>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="bg-emerald-950 text-slate-300">
        <div className="max-w-7xl mx-auto px-6 py-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-700 flex items-center justify-center">
                <Leaf className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-bold"><span className="text-blue-400">Blue</span>Protein</span>
            </div>
            <p className="text-sm text-slate-400">Biostimulants et engrais durables, adaptés aux besoins des agriculteurs marocains et africains.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Produits</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              {PRODUCTS.map((p) => <li key={p.id}>{p.name}</li>)}
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Entreprise</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>Pourquoi Blue Protein</li>
              <li>Comment commander</li>
              <li>Devenir distributeur</li>
              <li>Carrières</li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Contact</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>contact@blueprotein.com</li>
              <li>+212 5 22 00 00 00</li>
              <li>Casablanca, Maroc</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-emerald-900 py-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Blue Protein. Tous droits réservés.
        </div>
      </footer>
    </div>
  );
}

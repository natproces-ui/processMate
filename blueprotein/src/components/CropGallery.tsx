'use client';

import { useMemo, useState } from 'react';
import { useLanguage } from '@/lib/i18n';

const ALL = '__all__';

const CROPS = [
  {
    id: 'c1', categoryId: 'maraichage',
    categoryLabel: 'Maraîchage', categoryLabelDar: 'Khodra',
    label: 'Cultures maraîchères', labelDar: 'Zra3at lkhodra',
    image: '/plante1.png',
  },
  {
    id: 'c2', categoryId: 'maraichage',
    categoryLabel: 'Maraîchage', categoryLabelDar: 'Khodra',
    label: 'Application au champ', labelDar: "Tatbiq fl'ard",
    image: '/product-placeholder.jpg',
  },
  {
    id: 'c3', categoryId: 'arboriculture',
    categoryLabel: 'Arboriculture & grandes cultures', categoryLabelDar: 'Chjar w zra3at kbar',
    label: 'Vergers et arbres fruitiers', labelDar: 'Bsatine dyal chjar',
    image: '/plante2.png',
  },
  {
    id: 'c4', categoryId: 'arboriculture',
    categoryLabel: 'Arboriculture & grandes cultures', categoryLabelDar: 'Chjar w zra3at kbar',
    label: 'Exploitations au Maroc', labelDar: 'Dyi3at fLmeghrib',
    image: '/hero-farmer.png',
  },
];

export default function CropGallery() {
  const { lang } = useLanguage();
  const [active, setActive] = useState<string>(ALL);

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of CROPS) {
      if (!seen.has(c.categoryId)) seen.set(c.categoryId, lang === 'dar' ? c.categoryLabelDar : c.categoryLabel);
    }
    return Array.from(seen.entries());
  }, [lang]);

  const filtered = active === ALL ? CROPS : CROPS.filter((c) => c.categoryId === active);

  return (
    <section className="max-w-7xl mx-auto px-6 py-20">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">
          {lang === 'dar' ? 'Zra3at li mnasbin' : 'Cultures adaptées'}
        </h2>
        <p className="text-slate-600">
          {lang === 'dar'
            ? "Formulations dyalna mnasbin l bzzaf dyal zra3at, f'lmeghrib w Afriqya."
            : 'Nos formulations s’adaptent à un large éventail de cultures, au Maroc et en Afrique.'}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-10">
        <button
          onClick={() => setActive(ALL)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            active === ALL
              ? 'bg-orange-500 text-white border-orange-500'
              : 'bg-white text-slate-600 border-slate-300 hover:border-orange-400 hover:text-orange-600'
          }`}
        >
          {lang === 'dar' ? 'Kolchi' : 'Tous'}
        </button>
        {categories.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              active === id
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-slate-600 border-slate-300 hover:border-orange-400 hover:text-orange-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {filtered.map((c) => (
          <div key={c.id} className="rounded-xl overflow-hidden border border-slate-200 bg-white">
            <div className="h-40 bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="p-4">
              <p className="text-sm font-medium text-slate-900">{lang === 'dar' ? c.labelDar : c.label}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLanguage, localizedField } from '@/lib/i18n';
import type { SectionWithCards } from '@/types/section';

export default function DynamicSection({ section }: { section: SectionWithCards }) {
  const { lang } = useLanguage();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const title = localizedField(lang, section.title, section.title_dar);
  const subtitle = localizedField(lang, section.subtitle, section.subtitle_dar);
  const gridCols = section.show_numbers ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div>
      <div className="text-center max-w-2xl mx-auto mb-10">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">{title}</h2>
        {subtitle && <p className="text-slate-600">{subtitle}</p>}
      </div>
      <div className={`grid gap-6 ${gridCols}`}>
        {section.cards.map((card, i) => {
          const cardTitle = localizedField(lang, card.title, card.title_dar);
          const cardDesc = localizedField(lang, card.description, card.description_dar);
          const cardDetail = localizedField(lang, card.detail, card.detail_dar);
          const isOpen = openIndex === i;
          const clickable = Boolean(cardDetail);

          const content = (
            <>
              {card.image_url && (
                <div className="w-full h-32 rounded-lg overflow-hidden mb-4 bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={card.image_url} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              {section.show_numbers && <div className="text-xs font-bold text-orange-600 mb-2">ÉTAPE {i + 1}</div>}
              <div className="font-semibold text-slate-900 mb-1.5">{cardTitle}</div>
              {cardDesc && <p className="text-sm text-slate-600">{cardDesc}</p>}
              {clickable && (
                <ChevronDown className={`w-4 h-4 text-slate-400 mt-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              )}
              {isOpen && cardDetail && (
                <p className="text-sm text-slate-600 mt-3 pt-3 border-t border-slate-100">{cardDetail}</p>
              )}
            </>
          );

          if (clickable) {
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="text-left bg-white border border-slate-200 rounded-xl p-6 hover:border-emerald-300 transition-colors"
              >
                {content}
              </button>
            );
          }

          return (
            <div key={card.id} className="bg-white border border-slate-200 rounded-xl p-6">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useLanguage, localizedField } from '@/lib/i18n';
import { ICONS } from '@/lib/icons';
import Modal from './Modal';
import RichText from './RichText';
import type { SectionWithCards } from '@/types/section';

export default function DynamicSection({ section }: { section: SectionWithCards }) {
  const { lang } = useLanguage();
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const title = localizedField(lang, section.title, section.title_dar);
  const subtitle = localizedField(lang, section.subtitle, section.subtitle_dar);

  const heading = (
    <div className="text-center max-w-2xl mx-auto mb-10">
      <h2 className="text-2xl md:text-3xl font-bold mb-3">{title}</h2>
      {subtitle && <p className="text-slate-600">{subtitle}</p>}
    </div>
  );

  if (section.type === 'rich_text') {
    const body = localizedField(lang, section.body, section.body_dar);
    return (
      <div>
        {heading}
        {body && <RichText html={body} className="max-w-3xl mx-auto text-slate-700" />}
      </div>
    );
  }

  if (section.type === 'icon_list') {
    return (
      <div>
        {heading}
        <ul className="max-w-2xl mx-auto space-y-4">
          {section.cards.map((card) => {
            const Icon = card.icon ? ICONS[card.icon] : null;
            const cardTitle = localizedField(lang, card.title, card.title_dar);
            const cardDesc = localizedField(lang, card.description, card.description_dar);
            return (
              <li key={card.id} className="flex items-start gap-3 text-sm text-slate-700">
                {Icon && (
                  <span className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                )}
                <div className="pt-1">
                  <div className="font-medium text-slate-900">{cardTitle}</div>
                  {cardDesc && <RichText html={cardDesc} className="text-slate-600" />}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // clickable_cards / static_cards
  const gridCols = section.show_numbers ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3';
  const openCard = section.cards.find((c) => c.id === openCardId) ?? null;
  const openCardTitle = openCard ? localizedField(lang, openCard.title, openCard.title_dar) : null;
  const openCardDetail = openCard ? localizedField(lang, openCard.detail, openCard.detail_dar) : null;

  return (
    <div>
      {heading}
      <div className={`grid gap-6 ${gridCols}`}>
        {section.cards.map((card, i) => {
          const Icon = card.icon ? ICONS[card.icon] : null;
          const cardTitle = localizedField(lang, card.title, card.title_dar);
          const cardDesc = localizedField(lang, card.description, card.description_dar);
          const cardDetail = localizedField(lang, card.detail, card.detail_dar);
          const clickable = section.type === 'clickable_cards' && Boolean(cardDetail);

          const inner = (
            <>
              {card.image_url ? (
                <div className="w-full h-32 rounded-lg overflow-hidden mb-4 bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={card.image_url} alt="" className="w-full h-full object-cover" />
                </div>
              ) : Icon ? (
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700 mb-4">
                  <Icon className="w-5 h-5" />
                </div>
              ) : null}
              {section.show_numbers && <div className="text-xs font-bold text-orange-600 mb-2">ÉTAPE {i + 1}</div>}
              <div className="font-semibold text-slate-900 mb-1.5">{cardTitle}</div>
              {cardDesc && <RichText html={cardDesc} className="text-sm text-slate-600" />}
              {clickable && <span className="inline-block text-xs font-semibold text-emerald-700 mt-3">Voir le détail →</span>}
            </>
          );

          if (clickable) {
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setOpenCardId(card.id)}
                className="text-left bg-white border border-slate-200 rounded-xl p-6 hover:border-emerald-300 hover:shadow-md transition-all"
              >
                {inner}
              </button>
            );
          }

          return (
            <div key={card.id} className="bg-white border border-slate-200 rounded-xl p-6">
              {inner}
            </div>
          );
        })}
      </div>

      <Modal open={openCard !== null} onClose={() => setOpenCardId(null)} title={openCardTitle ?? ''}>
        {openCardDetail && <RichText html={openCardDetail} className="text-slate-700" />}
      </Modal>
    </div>
  );
}

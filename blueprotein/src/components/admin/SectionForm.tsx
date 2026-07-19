'use client';

import { useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, ImagePlus, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { createSection, updateSection, replaceSectionCards } from '@/lib/sections';
import { uploadImage } from '@/lib/storage';
import RichTextEditor from '@/components/RichTextEditor';
import IconPicker from './IconPicker';
import type { Section, SectionCardInput, SectionInput, SectionType, SectionWithCards } from '@/types/section';

function slugify(text: string): string {
  return text
    .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u').replace(/ç/g, 'c')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const TYPE_OPTIONS: { value: SectionType; label: string; desc: string }[] = [
  { value: 'clickable_cards', label: 'Cartes cliquables', desc: 'Le clic ouvre une fenêtre avec le détail.' },
  { value: 'static_cards', label: 'Cartes statiques', desc: 'Grille simple, sans clic.' },
  { value: 'icon_list', label: 'Liste à puces', desc: 'Icône + titre + description, en liste compacte.' },
  { value: 'rich_text', label: 'Texte libre', desc: 'Un seul bloc de texte enrichi, sans cartes.' },
];

function blankCardForm() {
  return { title: '', title_dar: '', description: '', description_dar: '', detail: '', detail_dar: '', image_url: null as string | null, icon: null as string | null };
}

function toFormState(section?: SectionWithCards) {
  return {
    type: section?.type ?? 'static_cards' as SectionType,
    title: section?.title ?? '',
    title_dar: section?.title_dar ?? '',
    subtitle: section?.subtitle ?? '',
    subtitle_dar: section?.subtitle_dar ?? '',
    body: section?.body ?? '',
    body_dar: section?.body_dar ?? '',
    show_numbers: section?.show_numbers ?? false,
    published: section?.published ?? true,
    cards: section?.cards.map((c) => ({
      title: c.title, title_dar: c.title_dar ?? '',
      description: c.description ?? '', description_dar: c.description_dar ?? '',
      detail: c.detail ?? '', detail_dar: c.detail_dar ?? '',
      image_url: c.image_url, icon: c.icon,
    })) ?? [],
  };
}

export default function SectionForm({
  section,
  onSaved,
  onCancel,
}: {
  section?: SectionWithCards;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(toFormState(section));
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateCard(index: number, patch: Partial<(typeof form.cards)[number]>) {
    setForm((f) => ({ ...f, cards: f.cards.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));
  }

  function addCard() {
    setForm((f) => ({ ...f, cards: [...f.cards, blankCardForm()] }));
  }

  function removeCard(index: number) {
    setForm((f) => ({ ...f, cards: f.cards.filter((_, i) => i !== index) }));
  }

  function moveCard(index: number, dir: -1 | 1) {
    setForm((f) => {
      const cards = [...f.cards];
      const target = index + dir;
      if (target < 0 || target >= cards.length) return f;
      [cards[index], cards[target]] = [cards[target], cards[index]];
      return { ...f, cards };
    });
  }

  async function handleCardImageChange(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIndex(index);
    setError(null);
    const url = await uploadImage(file);
    setUploadingIndex(null);
    if (!url) {
      setError("L'envoi de l'image a échoué. Vérifiez que le bucket \"images\" existe.");
      return;
    }
    updateCard(index, { image_url: url });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.type !== 'rich_text' && form.cards.length === 0) {
      setError('Ajoutez au moins une carte.');
      return;
    }

    const sectionInput: SectionInput = {
      slug: section?.slug ?? `${slugify(form.title)}-${Math.random().toString(36).slice(2, 7)}`,
      type: form.type,
      title: form.title.trim(),
      title_dar: form.title_dar.trim() || null,
      subtitle: form.subtitle.trim() || null,
      subtitle_dar: form.subtitle_dar.trim() || null,
      body: form.type === 'rich_text' ? (form.body.trim() || null) : null,
      body_dar: form.type === 'rich_text' ? (form.body_dar.trim() || null) : null,
      show_numbers: form.show_numbers,
      sort_order: section?.sort_order ?? 100,
      published: form.published,
    };

    setSaving(true);

    const { data: savedSection, error: saveError } = section
      ? await updateSection(section.id, sectionInput)
      : await createSection(sectionInput);

    if (saveError || !savedSection) {
      setSaving(false);
      setError(saveError?.message ?? "Échec de l'enregistrement.");
      return;
    }

    if (form.type !== 'rich_text') {
      const cardInputs: SectionCardInput[] = form.cards.map((c, i) => ({
        title: c.title.trim(),
        title_dar: c.title_dar.trim() || null,
        description: c.description.trim() || null,
        description_dar: c.description_dar.trim() || null,
        detail: form.type === 'clickable_cards' ? (c.detail.trim() || null) : null,
        detail_dar: form.type === 'clickable_cards' ? (c.detail_dar.trim() || null) : null,
        image_url: c.image_url,
        icon: c.icon,
        sort_order: i * 10,
      }));

      const { error: cardsError } = await replaceSectionCards((savedSection as Section).id, cardInputs);
      if (cardsError) {
        setSaving(false);
        setError(cardsError.message);
        return;
      }
    }

    setSaving(false);
    onSaved();
  }

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1.5';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className={labelClass}>Type de section</label>
        <div className="grid sm:grid-cols-2 gap-2">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set('type', opt.value)}
              className={`text-left border rounded-lg p-3 transition-colors ${
                form.type === opt.value ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-sm font-semibold text-slate-900">{opt.label}</div>
              <div className="text-xs text-slate-500">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Titre</label>
          <input required value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} placeholder="Ex. Nos engagements qualité" />
        </div>
        <div>
          <label className={labelClass}>Titre (darija, optionnel)</label>
          <input value={form.title_dar} onChange={(e) => set('title_dar', e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Sous-titre (optionnel)</label>
          <input value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Sous-titre (darija, optionnel)</label>
          <input value={form.subtitle_dar} onChange={(e) => set('subtitle_dar', e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="flex items-center gap-6">
        {form.type !== 'rich_text' && form.type !== 'icon_list' && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.show_numbers} onChange={(e) => set('show_numbers', e.target.checked)} className="w-4 h-4" />
            Afficher des numéros d&apos;étape
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} className="w-4 h-4" />
          Publié sur le site
        </label>
      </div>

      {form.type === 'rich_text' ? (
        <div className="border-t border-slate-200 pt-4 space-y-4">
          <div>
            <label className={labelClass}>Texte</label>
            <RichTextEditor value={form.body} onChange={(html) => set('body', html)} placeholder="Rédigez le contenu de la section..." />
          </div>
          <div>
            <label className={labelClass}>Texte (darija, optionnel)</label>
            <RichTextEditor value={form.body_dar} onChange={(html) => set('body_dar', html)} />
          </div>
        </div>
      ) : (
        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700">Cartes</h4>
            <button type="button" onClick={addCard} className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
              <Plus className="w-4 h-4" /> Ajouter une carte
            </button>
          </div>

          <div className="space-y-4">
            {form.cards.map((card, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">CARTE {i + 1}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveCard(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Monter">
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => moveCard(i, 1)} disabled={i === form.cards.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Descendre">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => removeCard(i)} className="text-slate-400 hover:text-red-600 ml-2" title="Supprimer la carte">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <input required placeholder="Titre" value={card.title} onChange={(e) => updateCard(i, { title: e.target.value })} className={inputClass} />
                  <input placeholder="Titre (darija, optionnel)" value={card.title_dar} onChange={(e) => updateCard(i, { title_dar: e.target.value })} className={inputClass} />
                </div>

                <div>
                  <label className={labelClass}>Description</label>
                  <RichTextEditor value={card.description} onChange={(html) => updateCard(i, { description: html })} />
                </div>
                <div>
                  <label className={labelClass}>Description (darija, optionnel)</label>
                  <RichTextEditor value={card.description_dar} onChange={(html) => updateCard(i, { description_dar: html })} />
                </div>

                {form.type === 'clickable_cards' && (
                  <>
                    <div>
                      <label className={labelClass}>Détail affiché au clic</label>
                      <RichTextEditor value={card.detail} onChange={(html) => updateCard(i, { detail: html })} placeholder="Le contenu affiché dans la fenêtre au clic sur la carte..." />
                    </div>
                    <div>
                      <label className={labelClass}>Détail (darija, optionnel)</label>
                      <RichTextEditor value={card.detail_dar} onChange={(html) => updateCard(i, { detail_dar: html })} />
                    </div>
                  </>
                )}

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Icône (utilisée si aucune photo n&apos;est chargée)</label>
                    <IconPicker value={card.icon} onChange={(icon) => updateCard(i, { icon })} />
                  </div>
                  <div>
                    <label className={labelClass}>Photo (optionnel, prioritaire sur l&apos;icône)</label>
                    <div className="flex items-center gap-3">
                      {card.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={card.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0" />
                      )}
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-1.5 cursor-pointer transition-colors">
                        {uploadingIndex === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                        {card.image_url ? 'Changer' : 'Charger'}
                        <input type="file" accept="image/*" onChange={(e) => handleCardImageChange(i, e)} disabled={uploadingIndex !== null} className="hidden" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {form.cards.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">Aucune carte — ajoutez-en au moins une.</p>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 border-t border-slate-200 pt-5">
        <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors">
          <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-slate-500 hover:text-slate-700 px-3">
          Annuler
        </button>
      </div>
    </form>
  );
}

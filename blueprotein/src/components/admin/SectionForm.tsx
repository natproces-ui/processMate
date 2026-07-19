'use client';

import { useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, ImagePlus, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { createSection, updateSection, replaceSectionCards } from '@/lib/sections';
import { uploadImage } from '@/lib/storage';
import type { Section, SectionCardInput, SectionInput, SectionWithCards } from '@/types/section';

function slugify(text: string): string {
  return text
    .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u').replace(/ç/g, 'c')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function blankCard(): SectionCardInput {
  return { title: '', title_dar: null, description: '', description_dar: null, detail: '', detail_dar: null, image_url: null, sort_order: 0 };
}

function toFormState(section?: SectionWithCards) {
  return {
    title: section?.title ?? '',
    title_dar: section?.title_dar ?? '',
    subtitle: section?.subtitle ?? '',
    subtitle_dar: section?.subtitle_dar ?? '',
    show_numbers: section?.show_numbers ?? false,
    published: section?.published ?? true,
    cards: section?.cards.map((c) => ({
      title: c.title, title_dar: c.title_dar ?? '',
      description: c.description ?? '', description_dar: c.description_dar ?? '',
      detail: c.detail ?? '', detail_dar: c.detail_dar ?? '',
      image_url: c.image_url, sort_order: c.sort_order,
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
    setForm((f) => ({ ...f, cards: [...f.cards, { ...blankCard(), title_dar: '', description: '', description_dar: '', detail: '', detail_dar: '' }] }));
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

    if (form.cards.length === 0) {
      setError('Ajoutez au moins une carte.');
      return;
    }

    const sectionInput: SectionInput = {
      slug: section?.slug ?? `${slugify(form.title)}-${Math.random().toString(36).slice(2, 7)}`,
      title: form.title.trim(),
      title_dar: form.title_dar.trim() || null,
      subtitle: form.subtitle.trim() || null,
      subtitle_dar: form.subtitle_dar.trim() || null,
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

    const cardInputs: SectionCardInput[] = form.cards.map((c, i) => ({
      title: c.title.trim(),
      title_dar: c.title_dar.trim() || null,
      description: c.description.trim() || null,
      description_dar: c.description_dar.trim() || null,
      detail: c.detail.trim() || null,
      detail_dar: c.detail_dar.trim() || null,
      image_url: c.image_url,
      sort_order: i * 10,
    }));

    const { error: cardsError } = await replaceSectionCards((savedSection as Section).id, cardInputs);
    setSaving(false);

    if (cardsError) {
      setError(cardsError.message);
      return;
    }
    onSaved();
  }

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1.5';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.show_numbers} onChange={(e) => set('show_numbers', e.target.checked)} className="w-4 h-4" />
          Afficher des numéros d&apos;étape (ÉTAPE 1, 2, 3...)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} className="w-4 h-4" />
          Publié sur le site
        </label>
      </div>

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
              <div className="grid sm:grid-cols-2 gap-3">
                <textarea rows={2} placeholder="Description" value={card.description} onChange={(e) => updateCard(i, { description: e.target.value })} className={inputClass} />
                <textarea rows={2} placeholder="Description (darija, optionnel)" value={card.description_dar} onChange={(e) => updateCard(i, { description_dar: e.target.value })} className={inputClass} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <textarea rows={2} placeholder="Détail — si rempli, la carte devient cliquable" value={card.detail} onChange={(e) => updateCard(i, { detail: e.target.value })} className={inputClass} />
                <textarea rows={2} placeholder="Détail (darija, optionnel)" value={card.detail_dar} onChange={(e) => updateCard(i, { detail_dar: e.target.value })} className={inputClass} />
              </div>
              <div className="flex items-center gap-3">
                {card.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.image_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0" />
                )}
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-1.5 cursor-pointer transition-colors">
                  {uploadingIndex === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                  {card.image_url ? 'Changer la photo' : 'Ajouter une photo (optionnel)'}
                  <input type="file" accept="image/*" onChange={(e) => handleCardImageChange(i, e)} disabled={uploadingIndex !== null} className="hidden" />
                </label>
              </div>
            </div>
          ))}
          {form.cards.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">Aucune carte — ajoutez-en au moins une.</p>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 border-t border-slate-200 pt-5">
        <button type="submit" disabled={saving || uploadingIndex !== null} className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors">
          <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-slate-500 hover:text-slate-700 px-3">
          Annuler
        </button>
      </div>
    </form>
  );
}

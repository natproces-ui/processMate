'use client';

import { useState, type FormEvent } from 'react';
import { ImagePlus, Loader2, Save, Star } from 'lucide-react';
import { createTestimonial, updateTestimonial } from '@/lib/testimonials';
import { uploadImage } from '@/lib/storage';
import { getVideoEmbedUrl } from '@/lib/video';
import type { Testimonial, TestimonialInput, TestimonialType } from '@/types/testimonial';

const TYPE_OPTIONS: { value: TestimonialType; label: string; desc: string }[] = [
  { value: 'text', label: 'Texte', desc: 'Citation seule.' },
  { value: 'photo', label: 'Photo', desc: 'Une photo de la personne, avec citation.' },
  { value: 'video', label: 'Vidéo', desc: 'Lien YouTube ou Vimeo.' },
];

function toFormState(testimonial?: Testimonial) {
  return {
    type: testimonial?.type ?? 'text' as TestimonialType,
    name: testimonial?.name ?? '',
    role: testimonial?.role ?? '',
    quote: testimonial?.quote ?? '',
    photo_url: testimonial?.photo_url ?? null as string | null,
    video_url: testimonial?.video_url ?? '',
    rating: testimonial?.rating ?? 5,
    published: testimonial?.published ?? true,
  };
}

export default function TestimonialForm({
  testimonial,
  onSaved,
  onCancel,
}: {
  testimonial?: Testimonial;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(toFormState(testimonial));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const url = await uploadImage(file);
    setUploading(false);
    if (!url) {
      setError("L'envoi de la photo a échoué. Vérifiez que le bucket \"images\" existe.");
      return;
    }
    set('photo_url', url);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.type === 'video' && form.video_url.trim() && !getVideoEmbedUrl(form.video_url.trim())) {
      setError("Ce lien vidéo n'est pas reconnu — utilisez un lien YouTube ou Vimeo.");
      return;
    }

    const input: TestimonialInput = {
      type: form.type,
      name: form.name.trim(),
      role: form.role.trim() || null,
      quote: form.quote.trim() || null,
      photo_url: form.type === 'photo' ? form.photo_url : null,
      video_url: form.type === 'video' ? (form.video_url.trim() || null) : null,
      rating: form.rating || null,
      sort_order: testimonial?.sort_order ?? 100,
      published: form.published,
    };

    setSaving(true);
    const { error: saveError } = testimonial
      ? await updateTestimonial(testimonial.id, input)
      : await createTestimonial(input);
    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }
    onSaved();
  }

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1.5';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className={labelClass}>Type</label>
        <div className="grid sm:grid-cols-3 gap-2">
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
          <label className={labelClass}>Nom</label>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} placeholder="Ex. Youssef El Amrani" />
        </div>
        <div>
          <label className={labelClass}>Rôle / exploitation</label>
          <input value={form.role} onChange={(e) => set('role', e.target.value)} className={inputClass} placeholder="Ex. Maraîcher, Souss-Massa" />
        </div>
      </div>

      {form.type === 'video' && (
        <div>
          <label className={labelClass}>Lien vidéo (YouTube ou Vimeo)</label>
          <input value={form.video_url} onChange={(e) => set('video_url', e.target.value)} className={inputClass} placeholder="https://www.youtube.com/watch?v=..." />
        </div>
      )}

      {form.type === 'photo' && (
        <div>
          <label className={labelClass}>Photo</label>
          <div className="flex items-center gap-4">
            {form.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.photo_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
            )}
            <label className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-2 cursor-pointer transition-colors">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              {form.photo_url ? 'Changer la photo' : 'Charger une photo'}
              <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={uploading} className="hidden" />
            </label>
          </div>
        </div>
      )}

      <div>
        <label className={labelClass}>
          {form.type === 'video' ? 'Citation (optionnel, sous-titre de la vidéo)' : 'Citation'}
        </label>
        <textarea rows={3} value={form.quote} onChange={(e) => set('quote', e.target.value)} className={inputClass} placeholder="Ce que dit le client, tel quel." />
      </div>

      <div>
        <label className={labelClass}>Note</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => set('rating', form.rating === n ? 0 : n)}>
              <Star className={`w-5 h-5 ${n <= form.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input id="published" type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} className="w-4 h-4" />
        <label htmlFor="published" className="text-sm text-slate-700">Publié sur le site</label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 border-t border-slate-200 pt-5">
        <button type="submit" disabled={saving || uploading} className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors">
          <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-slate-500 hover:text-slate-700 px-3">
          Annuler
        </button>
      </div>
    </form>
  );
}

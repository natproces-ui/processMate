'use client';

import { useState, type FormEvent } from 'react';
import { ChevronDown, ImagePlus, Loader2, Save } from 'lucide-react';
import { createProduct, updateProduct } from '@/lib/products';
import { uploadImage } from '@/lib/storage';
import type { Product, ProductFamily, ProductInput } from '@/types/product';

const KNOWN_CATEGORIES = ['Biostimulants organiques', 'Amendements organiques', 'Correcteurs de carences'];

function slugify(text: string): string {
  return text
    .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u').replace(/ç/g, 'c')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toFormState(product?: Product) {
  return {
    slug: product?.slug ?? '',
    name: product?.name ?? '',
    family: (product?.family ?? 'liquide') as ProductFamily,
    category: product?.category ?? KNOWN_CATEGORIES[0],
    tagline: product?.tagline ?? '',
    summary: product?.summary ?? '',
    description: product?.description ?? '',
    name_dar: product?.name_dar ?? '',
    tagline_dar: product?.tagline_dar ?? '',
    summary_dar: product?.summary_dar ?? '',
    description_dar: product?.description_dar ?? '',
    dosage: product?.dosage ?? '',
    conditioning: product?.conditioning ?? '',
    precautions: product?.precautions ?? '',
    advantagesText: (product?.advantages ?? []).join('\n'),
    composition_summary: product?.composition_summary ?? '',
    variantsText: product?.variants && product.variants.length > 0 ? JSON.stringify(product.variants, null, 2) : '',
    organic_certified: product?.organic_certified ?? false,
    badge: product?.badge ?? '',
    image_url: product?.image_url ?? '/product-placeholder.jpg',
    sort_order: product?.sort_order ?? 0,
    published: product?.published ?? true,
  };
}

export default function ProductForm({
  product,
  onSaved,
  onCancel,
}: {
  product?: Product;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(toFormState(product));
  const [slugTouched, setSlugTouched] = useState(Boolean(product));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleNameChange(value: string) {
    setForm((f) => ({ ...f, name: value, slug: slugTouched ? f.slug : slugify(value) }));
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const url = await uploadImage(file);
    setUploading(false);
    if (!url) {
      setError("L'envoi de l'image a échoué. Vérifiez que le bucket \"images\" existe (voir supabase/create_images_bucket.sql).");
      return;
    }
    set('image_url', url);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    let variants: ProductInput['variants'] = [];
    if (form.variantsText.trim()) {
      try {
        variants = JSON.parse(form.variantsText);
        if (!Array.isArray(variants)) throw new Error('doit être un tableau');
      } catch {
        setError('Le champ "Variantes" doit être du JSON valide (tableau d\'objets), ou vide.');
        return;
      }
    }

    const input: ProductInput = {
      slug: form.slug.trim() || slugify(form.name),
      name: form.name.trim(),
      family: form.family,
      category: form.category.trim(),
      tagline: form.tagline.trim() || null,
      summary: form.summary.trim(),
      description: form.description.trim() || null,
      name_dar: form.name_dar.trim() || null,
      tagline_dar: form.tagline_dar.trim() || null,
      summary_dar: form.summary_dar.trim() || null,
      description_dar: form.description_dar.trim() || null,
      dosage: form.dosage.trim() || null,
      conditioning: form.conditioning.trim() || null,
      precautions: form.precautions.trim() || null,
      advantages: form.advantagesText.split('\n').map((s) => s.trim()).filter(Boolean),
      composition_summary: form.composition_summary.trim() || null,
      variants,
      organic_certified: form.organic_certified,
      badge: form.badge.trim() || null,
      image_url: form.image_url.trim() || '/product-placeholder.jpg',
      sort_order: Number(form.sort_order) || 0,
      published: form.published,
    };

    setSaving(true);
    const { error: saveError } = product
      ? await updateProduct(product.id, input)
      : await createProduct(input);
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
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Nom du produit</label>
          <input required value={form.name} onChange={(e) => handleNameChange(e.target.value)} className={inputClass} placeholder="Ex. Blue Stimulant" />
        </div>
        <div>
          <label className={labelClass}>Gamme</label>
          <select value={form.family} onChange={(e) => set('family', e.target.value as ProductFamily)} className={inputClass}>
            <option value="liquide">Liquide</option>
            <option value="solide">Solide</option>
          </select>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Catégorie</label>
          <input required list="categories" value={form.category} onChange={(e) => set('category', e.target.value)} className={inputClass} />
          <datalist id="categories">
            {KNOWN_CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label className={labelClass}>Slug (URL) — généré automatiquement</label>
          <input
            required
            value={form.slug}
            onChange={(e) => { setSlugTouched(true); set('slug', e.target.value); }}
            className={inputClass}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Minuscules, chiffres et tirets uniquement"
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Résumé (affiché sur la carte produit)</label>
        <textarea required rows={2} value={form.summary} onChange={(e) => set('summary', e.target.value)} className={inputClass} placeholder="Une ou deux phrases qui décrivent le produit" />
      </div>

      <div>
        <label className={labelClass}>Image</label>
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={form.image_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0" />
          <label className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-2 cursor-pointer transition-colors">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
            {uploading ? 'Envoi...' : 'Charger une image'}
            <input type="file" accept="image/*" onChange={handleImageChange} disabled={uploading} className="hidden" />
          </label>
        </div>
        <p className="text-xs text-slate-400 mt-1.5">Optionnel — la photo par défaut reste utilisée tant qu&apos;aucune image n&apos;est chargée.</p>
      </div>

      <div className="flex items-center gap-2">
        <input id="published" type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} className="w-4 h-4" />
        <label htmlFor="published" className="text-sm text-slate-700">Publié sur le site</label>
      </div>

      <div className="border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="w-full flex items-center justify-between text-sm font-semibold text-slate-700 hover:text-emerald-700"
        >
          Détails avancés (fiche produit, darija, dosage...)
          <ChevronDown className={`w-4 h-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
        </button>

        {advancedOpen && (
          <div className="space-y-5 mt-5">
            <div>
              <label className={labelClass}>Accroche (tagline)</label>
              <input value={form.tagline} onChange={(e) => set('tagline', e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Description complète</label>
              <textarea rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} className={inputClass} />
            </div>

            <div className="border border-orange-200 bg-orange-50/40 rounded-xl p-4 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-orange-800">Darija (optionnel)</h4>
                <p className="text-xs text-orange-700/80">Écriture latine (arabizi). Laisser vide pour afficher automatiquement la version française. Ne concerne pas le dosage, la composition ni les précautions — gardés en français uniquement.</p>
              </div>
              <div>
                <label className={labelClass}>Nom du produit (darija)</label>
                <input value={form.name_dar} onChange={(e) => set('name_dar', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Accroche (darija)</label>
                <input value={form.tagline_dar} onChange={(e) => set('tagline_dar', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Résumé (darija)</label>
                <textarea rows={2} value={form.summary_dar} onChange={(e) => set('summary_dar', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Description complète (darija)</label>
                <textarea rows={4} value={form.description_dar} onChange={(e) => set('description_dar', e.target.value)} className={inputClass} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Dosage et application</label>
                <textarea rows={3} value={form.dosage} onChange={(e) => set('dosage', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Conditionnement</label>
                <textarea rows={3} value={form.conditioning} onChange={(e) => set('conditioning', e.target.value)} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Précautions d&apos;emploi</label>
                <textarea rows={2} value={form.precautions} onChange={(e) => set('precautions', e.target.value)} className={inputClass} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Avantages (un par ligne)</label>
              <textarea rows={4} value={form.advantagesText} onChange={(e) => set('advantagesText', e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Composition — résumé texte (laisser vide si vous utilisez le tableau de variantes ci-dessous)</label>
              <textarea rows={3} value={form.composition_summary} onChange={(e) => set('composition_summary', e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>
                Variantes — JSON (pour les gammes à plusieurs % comme Blue Humus / Matorg), sinon laisser vide
              </label>
              <textarea
                rows={4}
                value={form.variantsText}
                onChange={(e) => set('variantsText', e.target.value)}
                className={`${inputClass} font-mono text-xs`}
                placeholder='[{"name":"Blue Humus 15","Acide fulvique":"15%"}]'
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4 items-end">
              <div>
                <label className={labelClass}>Badge (ex. Best-seller, Nouveau)</label>
                <input value={form.badge} onChange={(e) => set('badge', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Ordre d&apos;affichage</label>
                <input type="number" value={form.sort_order} onChange={(e) => set('sort_order', Number(e.target.value))} className={inputClass} />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <input id="organic" type="checkbox" checked={form.organic_certified} onChange={(e) => set('organic_certified', e.target.checked)} className="w-4 h-4" />
                <label htmlFor="organic" className="text-sm text-slate-700">Certifié bio (CCPB)</label>
              </div>
            </div>
          </div>
        )}
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

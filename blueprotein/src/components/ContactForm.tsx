'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    setStatus('sending');
    const { error } = await supabase.from('contact_messages').insert({
      name: String(formData.get('name') ?? ''),
      company: String(formData.get('company') ?? '') || null,
      email: String(formData.get('email') ?? ''),
      message: String(formData.get('message') ?? ''),
      audience: String(formData.get('audience') ?? '') || null,
    });

    if (error) {
      console.error('contact_messages insert', error);
      setStatus('error');
      return;
    }
    setStatus('sent');
    form.reset();
  }

  if (status === 'sent') {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <Check className="w-4 h-4" /> Merci, votre message a bien été enregistré. Un conseiller vous recontacte sous 24h.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Nom complet</label>
          <input name="name" type="text" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Votre nom" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Société / Exploitation</label>
          <input name="company" type="text" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Optionnel" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
          <input name="email" type="email" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="vous@exemple.com" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Vous êtes</label>
          <select name="audience" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="agriculteur">Agriculteur</option>
            <option value="fournisseur">Fournisseur / distributeur</option>
            <option value="autre">Autre</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Message</label>
        <textarea name="message" rows={4} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Décrivez votre besoin..." />
      </div>
      {status === 'error' && (
        <p className="text-sm text-red-600">Une erreur est survenue, merci de réessayer.</p>
      )}
      <button type="submit" disabled={status === 'sending'} className="w-full inline-flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold px-5 py-3 rounded-lg transition-colors">
        {status === 'sending' ? 'Envoi...' : 'Envoyer le message'} <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  );
}

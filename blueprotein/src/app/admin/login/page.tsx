'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Leaf } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError('Identifiants incorrects.');
      return;
    }
    router.push('/admin');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-emerald-700 flex items-center justify-center">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold"><span className="text-blue-700">Blue</span>Protein</span>
        </Link>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h1 className="text-lg font-bold mb-1">Espace administrateur</h1>
          <p className="text-sm text-slate-500 mb-6">Connectez-vous pour gérer le catalogue et les demandes.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Mot de passe</label>
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              {loading ? 'Connexion...' : 'Se connecter'} <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

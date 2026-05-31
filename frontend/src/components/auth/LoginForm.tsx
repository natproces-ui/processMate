'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function LoginForm() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await signIn(email, password);

    if (error) {
      const msg = error.toLowerCase();
      if (msg.includes('email not confirmed')) {
        setError('Confirmez votre adresse email avant de vous connecter. Vérifiez votre boîte mail.');
      } else if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('wrong')) {
        setError('Identifiants incorrects. Vérifiez votre email et mot de passe.');
      } else {
        setError(error);
      }
      setLoading(false);
    } else {
      router.replace('/orchestration');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">Adresse email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="vous@exemple.com"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Mot de passe</label>
        </div>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          placeholder="••••••••"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {loading ? 'Connexion en cours…' : 'Se connecter'}
      </button>

      <p className="text-sm text-center text-gray-500">
        Pas encore de compte ?{' '}
        <Link href="/auth/signup" className="text-blue-600 font-medium hover:underline">
          Créer un compte
        </Link>
      </p>
    </form>
  );
}

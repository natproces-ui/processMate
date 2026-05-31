'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

const JOB_TITLES = [
  'Analyste Processus',
  'Auditeur Interne',
  'Chef de Projet',
  'Consultant',
  'Expert Applicatif',
  'Process Owner',
  'Responsable / Manager',
  'Responsable Back Office',
  'Responsable Conformité',
  'Valideur / Contrôleur',
];

const DEPARTMENTS = [
  'Audit',
  'Back Office',
  'Conformité',
  'Direction',
  'Finance',
  'IT / Systèmes d\'Information',
  'Juridique',
  'Opérations',
  'Organisation',
  'Ressources Humaines',
  'Risque',
  'Transformation',
];

const inputCls = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition';
const labelCls = 'text-sm font-medium text-gray-700';

export default function SignupForm() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [fullName, setFullName]     = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [jobTitle, setJobTitle]     = useState('');
  const [jobTitleOther, setJobTitleOther] = useState('');
  const [department, setDepartment] = useState('');
  const [deptOther, setDeptOther]   = useState('');

  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail]   = useState(false);

  const resolvedJobTitle  = jobTitle  === 'autre' ? jobTitleOther.trim()  : jobTitle;
  const resolvedDepartment = department === 'autre' ? deptOther.trim() : department;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setLoading(true);
    setError(null);

    const { error, needsConfirmation } = await signUp(
      email, password, fullName,
      resolvedJobTitle || undefined,
      resolvedDepartment || undefined,
    );

    if (error) {
      setError(error);
      setLoading(false);
    } else if (needsConfirmation) {
      setConfirmEmail(true);
      setLoading(false);
    } else {
      router.replace('/orchestration');
    }
  };

  if (confirmEmail) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">Vérifiez votre boîte mail</p>
          <p className="text-sm text-gray-500 mt-1">
            Un lien de confirmation a été envoyé à <strong>{email}</strong>. Confirmez votre email puis connectez-vous.
          </p>
        </div>
        <Link href="/auth/login" className="mt-2 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors text-center block">
          Aller à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Nom complet */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Nom complet</label>
        <input
          type="text"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          required
          placeholder="Prénom Nom"
          className={inputCls}
        />
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Adresse email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="vous@exemple.com"
          className={inputCls}
        />
      </div>

      {/* Mot de passe */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Mot de passe</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          placeholder="8 caractères minimum"
          className={inputCls}
        />
      </div>

      {/* Poste */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="job_title" className={labelCls}>Poste <span className="text-gray-400 font-normal">(optionnel)</span></label>
        <select id="job_title" value={jobTitle} onChange={e => setJobTitle(e.target.value)} className={inputCls}>
          <option value="">Sélectionner…</option>
          {JOB_TITLES.map(t => <option key={t} value={t}>{t}</option>)}
          <option value="autre">Autre…</option>
        </select>
        {jobTitle === 'autre' && (
          <input
            type="text"
            value={jobTitleOther}
            onChange={e => setJobTitleOther(e.target.value)}
            placeholder="Précisez votre poste"
            className={inputCls}
            autoFocus
          />
        )}
      </div>

      {/* Département */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="department" className={labelCls}>Département <span className="text-gray-400 font-normal">(optionnel)</span></label>
        <select id="department" value={department} onChange={e => setDepartment(e.target.value)} className={inputCls}>
          <option value="">Sélectionner…</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          <option value="autre">Autre…</option>
        </select>
        {department === 'autre' && (
          <input
            type="text"
            value={deptOther}
            onChange={e => setDeptOther(e.target.value)}
            placeholder="Précisez votre département"
            className={inputCls}
          />
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {loading ? 'Création du compte…' : 'Créer mon compte'}
      </button>

      <p className="text-sm text-center text-gray-500">
        Déjà inscrit ?{' '}
        <Link href="/auth/login" className="text-blue-600 font-medium hover:underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}

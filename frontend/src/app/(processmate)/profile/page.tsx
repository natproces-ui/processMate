'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const JOB_TITLES = [
  'Analyste Processus', 'Auditeur Interne', 'Chef de Projet', 'Consultant',
  'Expert Applicatif', 'Process Owner', 'Responsable / Manager',
  'Responsable Back Office', 'Responsable Conformité', 'Valideur / Contrôleur',
];

const DEPARTMENTS = [
  'Audit', 'Back Office', 'Conformité', 'Direction', 'Finance',
  "IT / Systèmes d'Information", 'Juridique', 'Opérations',
  'Organisation', 'Ressources Humaines', 'Risque', 'Transformation',
];

const inputCls = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white';
const labelCls = 'text-sm font-medium text-gray-700';

function isKnownOption(value: string | null, list: string[]) {
  return value && list.includes(value);
}

export default function ProfilePage() {
  const router = useRouter();
  const { profile, user, updateProfile } = useAuth();

  const [fullName, setFullName]       = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone]             = useState('');
  const [avatarUrl, setAvatarUrl]     = useState('');
  const [jobTitle, setJobTitle]       = useState('');
  const [jobTitleOther, setJobTitleOther] = useState('');
  const [department, setDepartment]   = useState('');
  const [deptOther, setDeptOther]     = useState('');

  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name || '');
    setDisplayName(profile.display_name || '');
    setPhone(profile.phone || '');
    setAvatarUrl(profile.avatar_url || '');

    if (isKnownOption(profile.job_title, JOB_TITLES)) {
      setJobTitle(profile.job_title!);
    } else if (profile.job_title) {
      setJobTitle('autre');
      setJobTitleOther(profile.job_title);
    }

    if (isKnownOption(profile.department, DEPARTMENTS)) {
      setDepartment(profile.department!);
    } else if (profile.department) {
      setDepartment('autre');
      setDeptOther(profile.department);
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const { error } = await updateProfile({
      full_name:    fullName.trim() || null,
      display_name: displayName.trim() || fullName.split(' ')[0] || null,
      phone:        phone.trim() || null,
      avatar_url:   avatarUrl.trim() || null,
      job_title:    (jobTitle === 'autre' ? jobTitleOther.trim() : jobTitle) || null,
      department:   (department === 'autre' ? deptOther.trim() : department) || null,
    });

    if (error) setError(error);
    else setSuccess(true);
    setSaving(false);
  };

  const initials = (profile?.display_name || profile?.full_name || user?.email || 'U')
    .split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="h-screen flex flex-col bg-gray-50">

      {/* Header minimal */}
      <header className="shrink-0 h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-gray-700">Mon profil</span>
      </header>

      <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">

        <h1 className="text-2xl font-bold text-gray-900 mb-8">Mon profil</h1>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Avatar */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Photo de profil</h2>
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-blue-600 flex items-center justify-center">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" onError={() => setAvatarUrl('')} />
                ) : (
                  <span className="text-white text-xl font-bold">{initials}</span>
                )}
              </div>
              <div className="flex-1">
                <label htmlFor="avatar_url" className={labelCls}>URL de l'image</label>
                <input
                  id="avatar_url"
                  type="url"
                  value={avatarUrl}
                  onChange={e => setAvatarUrl(e.target.value)}
                  placeholder="https://exemple.com/photo.jpg"
                  className={`${inputCls} mt-1.5`}
                />
                <p className="text-xs text-gray-400 mt-1">Lien direct vers une image (JPG, PNG…)</p>
              </div>
            </div>
          </div>

          {/* Infos personnelles */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Informations personnelles</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="full_name" className={labelCls}>Nom complet</label>
                <input
                  id="full_name"
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Prénom Nom"
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="display_name" className={labelCls}>Prénom affiché</label>
                <input
                  id="display_name"
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Prénom"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Email <span className="text-gray-400 font-normal">(non modifiable)</span></label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="phone" className={labelCls}>Téléphone <span className="text-gray-400 font-normal">(optionnel)</span></label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+212 6XX XXX XXX"
                className={inputCls}
              />
            </div>
          </div>

          {/* Poste & département */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Poste & département</h2>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="job_title" className={labelCls}>Poste</label>
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
                />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="department" className={labelCls}>Département</label>
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

            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Rôle <span className="text-gray-400 font-normal">(non modifiable)</span></label>
              <input
                type="text"
                value={profile?.global_role || ''}
                disabled
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-400 cursor-not-allowed capitalize"
              />
            </div>
          </div>

          {/* Messages */}
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}
          {success && (
            <div className="px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
              Profil mis à jour avec succès.
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>

        </form>
      </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { ICONS, ICON_NAMES } from '@/lib/icons';

export default function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = ICON_NAMES.filter((n) => n.toLowerCase().includes(query.toLowerCase()));
  const SelectedIcon = value ? ICONS[value] : null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {SelectedIcon && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full pl-2 pr-1 py-1">
            <SelectedIcon className="w-3.5 h-3.5" /> {value}
            <button type="button" onClick={() => onChange(null)} className="hover:text-red-600">
              <X className="w-3 h-3" />
            </button>
          </span>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher une icône..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2">
        {filtered.map((name) => {
          const Icon = ICONS[name];
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              title={name}
              className={`flex items-center justify-center p-2 rounded-lg transition-colors ${
                value === name ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
        {filtered.length === 0 && <p className="col-span-full text-xs text-slate-400 text-center py-2">Aucune icône trouvée.</p>}
      </div>
    </div>
  );
}

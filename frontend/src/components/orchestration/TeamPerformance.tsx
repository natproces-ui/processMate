import React, { useEffect, useState } from 'react';
import { Users, RefreshCw } from 'lucide-react';
import { orchestrationApi } from '@/lib/orchestrationApi';

interface PersonStats {
  name: string;
  R: number;
  A: number;
  C: number;
  I: number;
  total: number;
}

export default function TeamPerformance() {
  const [team, setTeam] = useState<PersonStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orchestrationApi.getGlobalRaci().then(res => {
      const stats: Record<string, PersonStats> = {};

      for (const proc of res.procedures) {
        // matrix structure: { [person]: role } — format plat
        const matrix = (proc.matrix || {}) as Record<string, string>;
        for (const [person, role] of Object.entries(matrix)) {
          if (!stats[person]) stats[person] = { name: person, R: 0, A: 0, C: 0, I: 0, total: 0 };
          if (role === 'R') stats[person].R++;
          else if (role === 'A') stats[person].A++;
          else if (role === 'C') stats[person].C++;
          else if (role === 'I') stats[person].I++;
          if (['R', 'A', 'C', 'I'].includes(role)) stats[person].total++;
        }
      }

      // Si pas encore de RACI remplie, afficher les personnes connues sans stats
      if (Object.keys(stats).length === 0) {
        res.all_people.forEach(name => {
          stats[name] = { name, R: 0, A: 0, C: 0, I: 0, total: 0 };
        });
      }

      setTeam(Object.values(stats).sort((a, b) => b.total - a.total));
    }).catch(() => setTeam([]))
      .finally(() => setLoading(false));
  }, []);

  const initials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-shadow">
      <h3 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
        <Users className="w-5 h-5 text-blue-600" />
        Responsables RACI
      </h3>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Chargement...
        </div>
      ) : team.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          <p>Aucun responsable défini.</p>
          <p className="mt-1 text-xs">Remplissez la matrice RACI des procédures.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {team.slice(0, 5).map(member => (
            <div key={member.name} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors">
              <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">
                {initials(member.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm truncate">{member.name}</p>
                <div className="flex gap-2 mt-1">
                  {[['R', 'bg-blue-100 text-blue-700', member.R], ['A', 'bg-red-100 text-red-700', member.A], ['C', 'bg-green-100 text-green-700', member.C], ['I', 'bg-yellow-100 text-yellow-700', member.I]].map(([role, cls, count]) =>
                    Number(count) > 0 ? (
                      <span key={String(role)} className={`text-xs px-1.5 py-0.5 rounded font-bold ${cls}`}>
                        {role}:{count}
                      </span>
                    ) : null
                  )}
                  {member.total === 0 && <span className="text-xs text-gray-400">Aucun rôle assigné</span>}
                </div>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{member.total} rôle{member.total > 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

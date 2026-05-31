'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  GitBranch,
  RefreshCw,
  Search,
  Server,
  Users,
} from 'lucide-react';
import { useProceduresStore } from '@/store/proceduresStore';
import type { Procedure } from '@/lib/orchestrationApi';

type ComplexityLevel = 'Faible' | 'Moyenne' | 'Elevee' | 'Tres elevee';
type WorkflowStep = Record<string, unknown>;

interface ProcedureComplexity {
  procedure: Procedure;
  stepsCount: number;
  rawStepsCount: number;
  actors: string[];
  tools: string[];
  stepScore: number;
  actorScore: number;
  toolScore: number;
  totalScore: number;
  level: ComplexityLevel;
}

const LEVEL_STYLE: Record<ComplexityLevel, string> = {
  Faible: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Moyenne: 'bg-blue-100 text-blue-700 border-blue-200',
  Elevee: 'bg-orange-100 text-orange-700 border-orange-200',
  'Tres elevee': 'bg-red-100 text-red-700 border-red-200',
};

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function splitValues(value: unknown): string[] {
  return textValue(value)
    .split(/[,;/|]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function uniqueValues(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (!seen.has(key)) seen.set(key, value);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

function scoreByThreshold(value: number, thresholds: [number, number, number]): number {
  if (value <= thresholds[0]) return 1;
  if (value <= thresholds[1]) return 2;
  if (value <= thresholds[2]) return 3;
  return 4;
}

function levelFromScore(score: number): ComplexityLevel {
  if (score <= 5) return 'Faible';
  if (score <= 8) return 'Moyenne';
  if (score <= 10) return 'Elevee';
  return 'Tres elevee';
}

function getWorkflow(procedure: Procedure): WorkflowStep[] {
  return Array.isArray(procedure.workflow_json) ? procedure.workflow_json as WorkflowStep[] : [];
}

function getStepId(step: WorkflowStep): string {
  return textValue(step.id);
}

function getStepType(step: WorkflowStep): string {
  return textValue(step.typeBpmn);
}

function isBusinessStep(step: WorkflowStep): boolean {
  const type = getStepType(step);
  return type !== 'StartEvent' && type !== 'EndEvent';
}

function getOutputs(step: WorkflowStep): string[] {
  const outputs = step.outputs;
  if (!Array.isArray(outputs)) return [];

  return outputs
    .map(output => {
      if (typeof output === 'string') return output.trim();
      if (output && typeof output === 'object' && 'targetId' in output) {
        return textValue((output as { targetId?: unknown }).targetId);
      }
      return '';
    })
    .filter(Boolean);
}

function computePathStepCount(workflow: WorkflowStep[]): number {
  if (workflow.length === 0) return 0;

  const byId = new Map(workflow.map(step => [getStepId(step), step]).filter(([id]) => id));
  const referencedTargets = new Set(workflow.flatMap(getOutputs));
  const starts = workflow.filter(step => getStepType(step) === 'StartEvent');
  const entrySteps = starts.length > 0
    ? starts
    : workflow.filter(step => {
      const id = getStepId(step);
      return id && !referencedTargets.has(id);
    });
  const fallbackStart = entrySteps.length > 0 ? entrySteps : [workflow[0]];

  const walk = (step: WorkflowStep, visited: Set<string>): number => {
    const id = getStepId(step);
    if (id && visited.has(id)) return 0;

    const nextVisited = new Set(visited);
    if (id) nextVisited.add(id);

    const ownCount = isBusinessStep(step) ? 1 : 0;
    const outputs = getOutputs(step)
      .map(targetId => byId.get(targetId))
      .filter((target): target is WorkflowStep => Boolean(target));

    if (outputs.length === 0) return ownCount;

    // Une gateway exclusive represente un choix de parcours : on ne cumule pas
    // toutes les sorties, on retient le chemin le plus long.
    const nextCount = Math.max(...outputs.map(target => walk(target, nextVisited)));
    return ownCount + nextCount;
  };

  return Math.max(...fallbackStart.map(step => walk(step, new Set())));
}

function getStepActors(step: WorkflowStep): string[] {
  return uniqueValues([
    ...splitValues(step.acteur),
    ...splitValues(step.acteurs),
    ...splitValues(step.typeActeur),
    ...splitValues(step.type_acteur),
  ]);
}

function getStepTools(step: WorkflowStep): string[] {
  return uniqueValues([
    ...splitValues(step.outil),
    ...splitValues(step.outils),
    ...splitValues(step.applicatif),
    ...splitValues(step.application),
    ...splitValues(step.systeme),
    ...splitValues(step['système']),
  ]);
}

function computeComplexity(procedure: Procedure): ProcedureComplexity {
  const workflow = getWorkflow(procedure);
  const actors = uniqueValues(workflow.flatMap(getStepActors));
  const tools = uniqueValues(workflow.flatMap(getStepTools));

  const rawStepsCount = workflow.filter(isBusinessStep).length;
  const stepsCount = computePathStepCount(workflow);
  const stepScore = scoreByThreshold(stepsCount, [5, 12, 25]);
  const actorScore = scoreByThreshold(actors.length, [2, 5, 8]);
  const toolScore = scoreByThreshold(tools.length, [1, 3, 5]);
  const totalScore = stepScore + actorScore + toolScore;

  return {
    procedure,
    stepsCount,
    rawStepsCount,
    actors,
    tools,
    stepScore,
    actorScore,
    toolScore,
    totalScore,
    level: levelFromScore(totalScore),
  };
}

function MetricCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-gray-400 mb-1">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round((score / 12) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-700">{score}/12</span>
    </div>
  );
}

export default function ComplexityPanel() {
  const { procedures, loading, error, fetchProcedures } = useProceduresStore();
  const [search, setSearch] = useState('');

  useEffect(() => { fetchProcedures(); }, [fetchProcedures]);

  const rows = useMemo(
    () => procedures.map(computeComplexity).sort((a, b) => b.totalScore - a.totalScore),
    [procedures]
  );

  const filtered = rows.filter(row =>
    row.procedure.nom.toLowerCase().includes(search.toLowerCase()) ||
    row.procedure.category.toLowerCase().includes(search.toLowerCase())
  );

  const withWorkflow = rows.filter(row => row.stepsCount > 0);
  const avgScore = withWorkflow.length
    ? Math.round(withWorkflow.reduce((sum, row) => sum + row.totalScore, 0) / withWorkflow.length)
    : 0;
  const highCount = rows.filter(row => row.level === 'Elevee' || row.level === 'Tres elevee').length;
  const avgSteps = withWorkflow.length
    ? Math.round(withWorkflow.reduce((sum, row) => sum + row.stepsCount, 0) / withWorkflow.length)
    : 0;

  if (loading && procedures.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center h-64 text-gray-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2 text-blue-500" />
        Chargement...
      </div>
    );
  }

  if (error && procedures.length === 0) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="flex-1 text-sm">{error}</p>
          <button type="button" onClick={() => fetchProcedures(true)} className="px-3 py-1.5 bg-red-100 rounded-lg text-xs font-semibold">
            Reessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Complexite des procedures</h2>
          <p className="text-sm text-gray-500 mt-1">
            Score structurel calcule avec les etapes de parcours, les acteurs et les outils.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchProcedures(true)}
          title="Actualiser"
          className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Procedures" value={procedures.length} icon={<GitBranch className="w-4 h-4" />} />
        <MetricCard label="Score moyen" value={`${avgScore}/12`} icon={<BarChart3 className="w-4 h-4" />} />
        <MetricCard label="Complexes" value={highCount} icon={<AlertCircle className="w-4 h-4" />} />
        <MetricCard label="Etapes moy." value={avgSteps} icon={<GitBranch className="w-4 h-4" />} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une procedure..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <p className="text-sm text-gray-400">{filtered.length} resultat{filtered.length > 1 ? 's' : ''}</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="text-left px-5 py-3 font-bold">Procedure</th>
              <th className="text-center px-3 py-3 font-bold">Etapes</th>
              <th className="text-center px-3 py-3 font-bold">Acteurs</th>
              <th className="text-center px-3 py-3 font-bold">Outils</th>
              <th className="text-left px-3 py-3 font-bold">Score</th>
              <th className="text-left px-5 py-3 font-bold">Niveau</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(row => (
              <tr key={row.procedure.id} className="hover:bg-blue-50/30 transition-colors">
                <td className="px-5 py-4">
                  <p className="font-semibold text-gray-900">{row.procedure.nom}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{row.procedure.category || 'Non classe'}</p>
                </td>
                <td className="px-3 py-4 text-center">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-gray-800">
                    <GitBranch className="w-3.5 h-3.5 text-gray-400" />
                    {row.stepsCount}
                  </span>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {row.stepScore}/4
                    {row.rawStepsCount !== row.stepsCount && ` · ${row.rawStepsCount} brutes`}
                  </p>
                </td>
                <td className="px-3 py-4 text-center">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-gray-800">
                    <Users className="w-3.5 h-3.5 text-gray-400" />
                    {row.actors.length}
                  </span>
                  <p className="text-[10px] text-gray-400 mt-0.5">{row.actorScore}/4</p>
                </td>
                <td className="px-3 py-4 text-center">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-gray-800">
                    <Server className="w-3.5 h-3.5 text-gray-400" />
                    {row.tools.length}
                  </span>
                  <p className="text-[10px] text-gray-400 mt-0.5">{row.toolScore}/4</p>
                </td>
                <td className="px-3 py-4">
                  <ScoreBar score={row.totalScore} />
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-bold ${LEVEL_STYLE[row.level]}`}>
                    {row.level}
                  </span>
                  {row.tools.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1 truncate max-w-[220px]" title={row.tools.join(', ')}>
                      {row.tools.join(', ')}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            Aucune procedure trouvee.
          </div>
        )}
      </div>
    </div>
  );
}

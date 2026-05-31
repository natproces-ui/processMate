// src/components/orchestration/tasks/ActorSwitcher.tsx
'use client';

import React from 'react';
import { ChevronDown, UserRound } from 'lucide-react';
import type { TaskActor } from '@/lib/orchestrationTasksApi';

interface Props {
  actors: TaskActor[];
  currentActor: TaskActor | null;
  onChange: (actor: TaskActor) => void;
}

const ROLE_LABELS: Record<TaskActor['role'], string> = {
  admin: 'Admin',
  user: 'Utilisateur',
};

export default function ActorSwitcher({ actors, currentActor, onChange }: Props) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-gray-600">
      <span className="font-medium">Agir en tant que</span>
      <span className="relative inline-flex items-center">
        <UserRound className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
        <select
          value={currentActor?.id || ''}
          onChange={event => {
            const next = actors.find(actor => actor.id === event.target.value);
            if (next) onChange(next);
          }}
          className="appearance-none pl-9 pr-9 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        >
          {actors.map(actor => (
            <option key={actor.id} value={actor.id}>
              {actor.name} - {ROLE_LABELS[actor.role]}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 w-4 h-4 text-gray-400 pointer-events-none" />
      </span>
    </label>
  );
}

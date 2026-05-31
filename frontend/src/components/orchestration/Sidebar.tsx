'use client';

import React from 'react';
import {
  ChevronLeft,
  BarChart3,
  FileText,
  GitBranch,
  Users,
  AlertCircle,
  Settings,
  Bell,
  TriangleAlert,
  Workflow,
  Server,
  CheckSquare,
  FileSearch,
  MessageSquare,
  Gauge,
  FolderTree,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const MENU_ITEMS = [
  { id: 'dashboard', label: 'Tableau de Bord', icon: BarChart3, color: 'text-blue-600' },
  { id: 'procedures', label: 'Procédures', icon: FileText, color: 'text-blue-700' },
  { id: 'pipeline', label: 'Pipeline', icon: Workflow, color: 'text-blue-600' },
  { id: 'workflow', label: 'Flux de Travail', icon: GitBranch, color: 'text-blue-600' },
  { id: 'raci', label: 'Responsabilités', icon: Users, color: 'text-blue-700' },
  { id: 'validation', label: 'Validation', icon: AlertCircle, color: 'text-blue-600' },
  { id: 'tasks', label: 'Suivi des tâches', icon: CheckSquare, color: 'text-blue-600' },
  { id: 'irritants', label: 'Irritants', icon: TriangleAlert, color: 'text-blue-600' },
  { id: 'complexity', label: 'Complexité', icon: Gauge, color: 'text-orange-600' },
  { id: 'regulatory-impact', label: "Analyse d'impact", icon: FileSearch, color: 'text-indigo-600' },
  { id: 'applicatifs', label: 'Cartographie Applicative', icon: Server, color: 'text-teal-600' },
  { id: 'analysis', label: 'Analyse IA', icon: MessageSquare, color: 'text-purple-600' },
  { id: 'taxonomy', label: 'Taxonomie', icon: FolderTree, color: 'text-emerald-600' },
];

export default function Sidebar({ activeTab, setActiveTab, sidebarOpen, setSidebarOpen }: SidebarProps) {
  return (
    <div
      className={`${sidebarOpen ? 'w-64' : 'w-20'
        } h-full shrink-0 bg-white border-r border-gray-200 transition-all duration-300 flex flex-col shadow-sm`}
    >
      {/* Header */}
      <div className="shrink-0 p-5 border-b border-gray-200 flex items-center justify-between bg-blue-50">
        {sidebarOpen && <h2 className="text-lg font-bold text-blue-900">Navigation</h2>}
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-gray-600 hover:text-gray-900 transition-colors p-1 ml-auto"
          title="Réduire le menu"
        >
          <ChevronLeft className={`w-5 h-5 transition-transform ${!sidebarOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Menu principal */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            title={item.label}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium ${activeTab === item.id
              ? 'bg-blue-100 text-blue-900 border-l-4 border-blue-600 pl-2'
              : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <item.icon
              className={`w-5 h-5 shrink-0 ${activeTab === item.id ? item.color : 'text-gray-500'}`}
            />
            {sidebarOpen && <span className="truncate">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Bas de sidebar */}
      <div className="shrink-0 border-t border-gray-200 p-3 space-y-1 bg-gray-50">
        <button
          type="button"
          title="Notifications"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-200 transition-colors text-sm"
        >
          <Bell className="w-5 h-5 text-gray-500 shrink-0" />
          {sidebarOpen && <span>Notifications</span>}
        </button>
        <button
          type="button"
          title="Paramètres"
          onClick={() => setActiveTab('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${activeTab === 'settings'
            ? 'bg-blue-100 text-blue-900 border-l-4 border-blue-600 pl-2'
            : 'text-gray-700 hover:bg-gray-200'
            }`}
        >
          <Settings className={`w-5 h-5 shrink-0 ${activeTab === 'settings' ? 'text-blue-600' : 'text-gray-500'}`} />
          {sidebarOpen && <span>Paramètres</span>}
        </button>
      </div>
    </div>
  );
}

import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  change: number;
  icon: React.ComponentType<any>;
  color: string;
  bgIcon: string;
  iconColor: string;
  isAlert?: boolean;
}

export default function KPICard({
  title,
  value,
  change,
  icon: Icon,
  color,
  bgIcon,
  iconColor,
  isAlert = false,
}: KPICardProps) {
  return (
    <div className={`bg-white rounded-xl shadow-lg p-6 border border-slate-200 hover:shadow-xl transition-all duration-300 ${isAlert ? 'border-l-4 border-l-red-500' : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`${bgIcon} p-3 rounded-lg`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
        <div className={`flex items-center gap-1 text-sm font-semibold ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          {change >= 0 ? '+' : ''}{change}%
        </div>
      </div>
      <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
      <p className={`text-3xl font-bold bg-gradient-to-r ${color} bg-clip-text text-transparent`}>{value}</p>
      <p className="text-xs text-slate-500 mt-2">vs mois précédent</p>
    </div>
  );
}

import React from 'react';

/**
 * Utility function to apply dynamic width to charts
 * Fixes inline style linting issues
 */
export const getBarWidth = (value: number, max: number): number => {
  return (value / max) * 100;
};

/**
 * Get status color classes
 */
export const getStatusColorClass = (status: string): string => {
  const colors: Record<string, string> = {
    validated: 'bg-green-100 text-green-700 border-green-300',
    validating: 'bg-blue-100 text-blue-700 border-blue-300',
    pending: 'bg-orange-100 text-orange-700 border-orange-300',
    archived: 'bg-slate-100 text-slate-700 border-slate-300',
    in_progress: 'bg-blue-100 text-blue-700 border-blue-300',
    blocked: 'bg-red-100 text-red-700 border-red-300',
  };
  return colors[status] || colors.archived;
};

/**
 * Get version gradient color
 */
export const getVersionGradientColor = (version: string): string => {
  const colors: Record<string, string> = {
    v0: 'from-slate-500 to-slate-600',
    v1: 'from-blue-500 to-blue-600',
    v2: 'from-purple-500 to-purple-600',
    v3: 'from-pink-500 to-pink-600',
    v4: 'from-indigo-500 to-indigo-600',
  };
  return colors[version] || colors.v0;
};

/**
 * Get severity color for issues
 */
export const getSeverityColorClass = (severity: string): string => {
  const colors: Record<string, string> = {
    error: 'bg-red-50 border-l-4 border-l-red-500 text-red-900',
    warning: 'bg-yellow-50 border-l-4 border-l-yellow-500 text-yellow-900',
    info: 'bg-blue-50 border-l-4 border-l-blue-500 text-blue-900',
  };
  return colors[severity] || colors.info;
};

/**
 * Format date to French format
 */
export const formatDateFR = (date: string): string => {
  return new Date(date).toLocaleDateString('fr-FR');
};

/**
 * Calculate days between two dates
 */
export const calculateDaysDifference = (startDate: string, endDate: string = new Date().toISOString()): number => {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  return Math.ceil((end - start) / (1000 * 3600 * 24));
};

import React from 'react';

interface BarColumnProps {
  value: number;
  max: number;
  color: string;
  label: string;
}

export default function BarColumn({ value, max, color, label }: BarColumnProps) {
  const heightPercent = (value / max) * 100;

  return (
    <div
      className={`flex-1 bg-gradient-to-t ${color} rounded-t opacity-80 hover:opacity-100 transition-opacity`}
      style={{
        height: `${heightPercent}%`,
        minHeight: '2px',
      }}
      title={label}
      role="presentation"
      aria-label={label}
    />
  );
}

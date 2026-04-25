import React from 'react';

export default function ProgressBar({ value, max = 100, label, color = 'primary', showPercent = true }) {
  const percent = Math.min(Math.max((value / max) * 100, 0), 100);

  const colorMap = {
    primary: {
      bar: 'bg-gradient-to-r from-primary-600 to-primary-400',
      glow: 'shadow-primary-500/30',
      text: 'text-primary-300',
    },
    accent: {
      bar: 'bg-gradient-to-r from-green-600 to-emerald-400',
      glow: 'shadow-green-500/30',
      text: 'text-green-300',
    },
    warning: {
      bar: 'bg-gradient-to-r from-yellow-600 to-amber-400',
      glow: 'shadow-yellow-500/30',
      text: 'text-yellow-300',
    },
    danger: {
      bar: 'bg-gradient-to-r from-red-600 to-rose-400',
      glow: 'shadow-red-500/30',
      text: 'text-red-300',
    },
  };

  const scheme = colorMap[color] || colorMap.primary;

  return (
    <div className="w-full" id={`progress-${label?.toLowerCase().replace(/\s+/g, '-') || 'bar'}`}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && <span className="text-xs font-medium text-slate-400">{label}</span>}
          {showPercent && (
            <span className={`text-xs font-bold ${scheme.text}`}>
              {percent.toFixed(0)}%
            </span>
          )}
        </div>
      )}
      <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${scheme.bar}`}
          style={{ width: `${percent}%` }}
        >
          <div className="h-full w-full bg-white/10 rounded-full" />
        </div>
      </div>
    </div>
  );
}

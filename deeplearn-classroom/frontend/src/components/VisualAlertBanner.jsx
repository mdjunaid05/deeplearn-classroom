import React, { useState, useEffect } from 'react';
import { AlertCircle, Info, CheckCircle, AlertTriangle, X } from 'lucide-react';

export default function VisualAlertBanner({ alert, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (alert) {
      setVisible(true);
      if (alert.duration > 0) {
        const timer = setTimeout(() => {
          setVisible(false);
          if (onDismiss) onDismiss();
        }, alert.duration);
        return () => clearTimeout(timer);
      }
    } else {
      setVisible(false);
    }
  }, [alert, onDismiss]);

  if (!visible || !alert) return null;

  const colorMap = {
    info: { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-200', icon: Info, iconColor: 'text-blue-400' },
    warning: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', text: 'text-yellow-200', icon: AlertTriangle, iconColor: 'text-yellow-400' },
    critical: { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-200', icon: AlertCircle, iconColor: 'text-red-400' },
    success: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-200', icon: CheckCircle, iconColor: 'text-emerald-400' },
  };

  const scheme = colorMap[alert.type] || colorMap.info;
  const Icon = scheme.icon;
  const flashClass = alert.flash ? 'animate-pulse' : '';

  return (
    <div 
      className={`w-full p-4 rounded-xl border ${scheme.bg} ${scheme.border} flex items-start gap-3 shadow-lg ${flashClass}`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <Icon className={`w-6 h-6 flex-shrink-0 mt-0.5 ${scheme.iconColor}`} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className={`text-base font-semibold ${scheme.text}`}>{alert.message}</p>
      </div>
      {onDismiss && (
        <button 
          onClick={() => { setVisible(false); onDismiss(); }}
          className={`p-1 hover:bg-white/10 rounded-lg transition-colors ${scheme.text}`}
          aria-label="Dismiss alert"
          tabIndex={0}
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

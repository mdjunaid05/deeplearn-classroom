import React, { useState } from 'react';
import { Bell, Play } from 'lucide-react';
import VisualAlertBanner from '../components/VisualAlertBanner';

export default function VisualAlerts() {
  const [activeAlert, setActiveAlert] = useState(null);

  const triggerMockAlert = (type, message, flash, duration) => {
    setActiveAlert({ type, message, flash, duration });
  };

  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="main" aria-label="Visual Alerts Dashboard">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-3">
            <Bell className="w-8 h-8 text-primary-400" aria-hidden="true" />
            Visual Alerts
          </h1>
          <p className="text-slate-400 mt-1">Color-coded, non-auditory notifications for classroom events.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Controls */}
        <div className="p-6 rounded-2xl glass">
          <h2 className="text-lg font-semibold text-white mb-6">Test Alert Types</h2>
          
          <div className="space-y-4">
            <button 
              onClick={() => triggerMockAlert('info', 'New reading material available in course resources.', false, 5000)}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
              aria-label="Trigger info alert"
              tabIndex={0}
            >
              <span className="font-semibold text-blue-300">Info (Blue)</span>
              <Play className="w-4 h-4 text-blue-400" aria-hidden="true" />
            </button>
            
            <button 
              onClick={() => triggerMockAlert('success', 'Assignment submitted successfully.', false, 3000)}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              aria-label="Trigger success alert"
              tabIndex={0}
            >
              <span className="font-semibold text-emerald-300">Success (Green)</span>
              <Play className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            </button>
            
            <button 
              onClick={() => triggerMockAlert('warning', 'Quiz ends in 5 minutes.', true, 8000)}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors"
              aria-label="Trigger warning alert"
              tabIndex={0}
            >
              <span className="font-semibold text-yellow-300 flex items-center gap-2">
                Warning (Yellow)
                <span className="text-[10px] uppercase tracking-wider bg-yellow-500/20 px-2 py-0.5 rounded text-yellow-400">Flashes</span>
              </span>
              <Play className="w-4 h-4 text-yellow-400" aria-hidden="true" />
            </button>
            
            <button 
              onClick={() => triggerMockAlert('critical', 'Teacher requested your attention.', true, 0)} // 0 means manual dismiss
              className="w-full flex items-center justify-between p-4 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors"
              aria-label="Trigger critical alert"
              tabIndex={0}
            >
              <span className="font-semibold text-red-300 flex items-center gap-2">
                Critical (Red)
                <span className="text-[10px] uppercase tracking-wider bg-red-500/20 px-2 py-0.5 rounded text-red-400">Flashes + Manual Dismiss</span>
              </span>
              <Play className="w-4 h-4 text-red-400" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Live Display Area */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl glass min-h-[300px]">
            <h2 className="text-lg font-semibold text-white mb-4">Alert Display Zone</h2>
            
            <div className="h-full flex flex-col gap-4 relative">
              <VisualAlertBanner 
                alert={activeAlert} 
                onDismiss={() => setActiveAlert(null)} 
              />
              
              {!activeAlert && (
                <div className="flex-1 flex items-center justify-center border-2 border-dashed border-white/10 rounded-xl p-8 text-center text-slate-500">
                  Trigger an alert from the left panel to see how it appears without relying on audio cues.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

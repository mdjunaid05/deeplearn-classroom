import React from 'react';
import { BarChart3, TrendingUp, Sun, Moon, Sunrise, Sunset, Activity } from 'lucide-react';
import { EngagementAreaChart } from '../components/EngagementChart';

const HEATMAP_DATA = [
  { time: 'Morning (8am-12pm)', High: 45, Medium: 30, Low: 10, icon: Sunrise },
  { time: 'Afternoon (12pm-4pm)', High: 25, Medium: 45, Low: 20, icon: Sun },
  { time: 'Evening (4pm-8pm)', High: 35, Medium: 25, Low: 15, icon: Sunset },
  { time: 'Night (8pm-12am)', High: 15, Medium: 20, Low: 35, icon: Moon },
];

const TIMELINE_DATA = Array.from({ length: 24 }, (_, i) => ({
  period: i + 1,
  high_engagement_pct: +(30 + Math.sin(i / 3) * 20 + Math.random() * 10).toFixed(1),
  active_behaviour_pct: +(25 + Math.cos(i / 4) * 15 + Math.random() * 10).toFixed(1),
}));

export default function EngagementAnalytics() {
  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-primary-400" />
            Engagement Analytics
          </h1>
          <p className="text-slate-400 mt-1">Platform-wide engagement trends and time-of-day analysis</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* KPI Cards */}
        <div className="p-6 rounded-2xl glass card-hover bg-gradient-to-br from-primary-900/40 to-transparent border-primary-500/20">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-primary-300">Peak Engagement</p>
              <h3 className="text-3xl font-bold text-white mt-1">68%</h3>
            </div>
             <div className="p-2 bg-primary-500/20 rounded-lg">
                <TrendingUp className="w-5 h-5 text-primary-400" />
             </div>
          </div>
          <p className="text-xs text-slate-400">Usually observed during Morning sessions (10:00 AM).</p>
        </div>

         <div className="p-6 rounded-2xl glass card-hover bg-gradient-to-br from-emerald-900/40 to-transparent border-emerald-500/20">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-emerald-300">Avg Session Time</p>
              <h3 className="text-3xl font-bold text-white mt-1">42m</h3>
            </div>
             <div className="p-2 bg-emerald-500/20 rounded-lg">
                <Activity className="w-5 h-5 text-emerald-400" />
             </div>
          </div>
           <p className="text-xs text-slate-400">+12% increase since adaptive difficulty was enabled.</p>
        </div>

        <div className="p-6 rounded-2xl glass card-hover bg-gradient-to-br from-amber-900/40 to-transparent border-amber-500/20">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-amber-300">Risk Factor</p>
              <h3 className="text-3xl font-bold text-white mt-1">14%</h3>
            </div>
             <div className="p-2 bg-amber-500/20 rounded-lg">
                <BarChart3 className="w-5 h-5 text-amber-400" />
             </div>
          </div>
           <p className="text-xs text-slate-400">Students consistently classified as 'Low' engagement.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engagement Over Time */}
        <div className="p-6 rounded-2xl glass">
           <h3 className="text-sm font-semibold text-slate-300 mb-4">Long-Term Engagement Trend</h3>
           <EngagementAreaChart data={TIMELINE_DATA} />
        </div>

        {/* Time-of-Day Heatmap (Simulated with visual blocks) */}
        <div className="p-6 rounded-2xl glass">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Engagement by Time-of-Day</h3>
          
          <div className="space-y-4">
            {HEATMAP_DATA.map((row, idx) => {
              const total = row.High + row.Medium + row.Low;
              const hPct = (row.High / total) * 100;
              const mPct = (row.Medium / total) * 100;
              const lPct = (row.Low / total) * 100;

              return (
                <div key={idx} className="p-4 rounded-xl glass-light">
                  <div className="flex items-center gap-3 mb-3">
                    <row.icon className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-white">{row.time}</span>
                  </div>
                  
                  {/* Segmented bar */}
                  <div className="h-3 w-full rounded-full overflow-hidden flex shadow-inner shadow-black/20">
                    <div style={{ width: `${hPct}%` }} className="bg-emerald-500" title={`High: ${row.High}`} />
                    <div style={{ width: `${mPct}%` }} className="bg-amber-500" title={`Medium: ${row.Medium}`} />
                    <div style={{ width: `${lPct}%` }} className="bg-red-500" title={`Low: ${row.Low}`} />
                  </div>
                  
                  <div className="flex justify-between mt-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    <span className="text-emerald-400/80">{hPct.toFixed(0)}% High</span>
                    <span className="text-amber-400/80">{mPct.toFixed(0)}% Med</span>
                    <span className="text-red-400/80">{lPct.toFixed(0)}% Low</span>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-400">
            <strong>Insight:</strong> Night sessions show a significant drop in high engagement. Consider recommending complex topics for morning sessions.
          </div>
        </div>
      </div>
    </div>
  );
}

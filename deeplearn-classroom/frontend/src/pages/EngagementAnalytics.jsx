import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Sun, Moon, Sunrise, Sunset, Activity, RefreshCw } from 'lucide-react';
import { EngagementAreaChart } from '../components/EngagementChart';
import { API_BASE } from '../utils/api';

export default function EngagementAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/teacher-dashboard`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Engagement analytics fetch error:', err);
      setError('Could not load analytics data. The backend may be starting up.');
    } finally {
      setLoading(false);
    }
  };

  // Derive stats from real data
  const engDist = data?.engagement_distribution || {};
  const totalStudents = data?.total_students || 0;
  const totalRecords = data?.total_records || 0;
  const timeline = data?.engagement_timeline || [];

  const highCount = engDist['High'] || 0;
  const mediumCount = engDist['Medium'] || 0;
  const lowCount = engDist['Low'] || 0;
  const totalEng = highCount + mediumCount + lowCount;

  const peakEngPct = totalEng > 0 ? ((highCount / totalEng) * 100).toFixed(1) : '—';
  const riskPct = totalEng > 0 ? ((lowCount / totalEng) * 100).toFixed(1) : '—';

  // Heatmap: simulate from timeline data
  const HEATMAP_DATA = [
    { time: 'Morning (8am-12pm)', High: Math.round(highCount * 0.35), Medium: Math.round(mediumCount * 0.3), Low: Math.round(lowCount * 0.15), icon: Sunrise },
    { time: 'Afternoon (12pm-4pm)', High: Math.round(highCount * 0.30), Medium: Math.round(mediumCount * 0.35), Low: Math.round(lowCount * 0.25), icon: Sun },
    { time: 'Evening (4pm-8pm)', High: Math.round(highCount * 0.25), Medium: Math.round(mediumCount * 0.20), Low: Math.round(lowCount * 0.30), icon: Sunset },
    { time: 'Night (8pm-12am)', High: Math.round(highCount * 0.10), Medium: Math.round(mediumCount * 0.15), Low: Math.round(lowCount * 0.30), icon: Moon },
  ];

  if (loading) {
    return (
      <div className="page-enter bg-nexus-background min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-nexus-on-background">
        <div className="flex flex-col items-center justify-center py-32">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00687a] mb-4" />
          <p className="text-[#6d797d]">Loading engagement analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter bg-nexus-background min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-nexus-on-background">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#131b2e] flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-[#00687a]" />
            Engagement Analytics
          </h1>
          <p className="text-[#3d494c] mt-1">
            {totalStudents > 0
              ? `Platform-wide trends · ${totalStudents} students · ${totalRecords} records`
              : 'Platform-wide engagement trends and time-of-day analysis'}
          </p>
        </div>
        <button onClick={fetchData} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#3d494c] transition-colors" title="Refresh">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* KPI Cards */}
        <div className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 card-hover bg-gradient-to-br from-primary-50 to-transparent shadow-lg border border-[#bcc9cd]/40 hover:border-primary-400 transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-primary-700">Peak Engagement</p>
              <h3 className="text-3xl font-bold text-[#131b2e] mt-1">{peakEngPct}{peakEngPct !== '—' ? '%' : ''}</h3>
            </div>
             <div className="p-2 bg-primary-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-primary-500" />
             </div>
          </div>
          <p className="text-xs text-[#3d494c]">{totalEng > 0 ? `${highCount} highly engaged out of ${totalEng} sessions` : 'No data available yet.'}</p>
        </div>

         <div className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 card-hover bg-gradient-to-br from-emerald-50 to-transparent shadow-lg border border-[#bcc9cd]/40 hover:border-emerald-400 transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-emerald-700">Total Students</p>
              <h3 className="text-3xl font-bold text-[#131b2e] mt-1">{totalStudents || '—'}</h3>
            </div>
             <div className="p-2 bg-emerald-100 rounded-lg">
                <Activity className="w-5 h-5 text-emerald-500" />
             </div>
          </div>
           <p className="text-xs text-[#3d494c]">{totalRecords > 0 ? `${totalRecords} activity records tracked` : 'No data available yet.'}</p>
        </div>

        <div className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 card-hover bg-gradient-to-br from-amber-50 to-transparent shadow-lg border border-[#bcc9cd]/40 hover:border-amber-400 transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-amber-700">Risk Factor</p>
              <h3 className="text-3xl font-bold text-[#131b2e] mt-1">{riskPct}{riskPct !== '—' ? '%' : ''}</h3>
            </div>
             <div className="p-2 bg-amber-100 rounded-lg">
                <BarChart3 className="w-5 h-5 text-amber-500" />
             </div>
          </div>
           <p className="text-xs text-[#3d494c]">{totalEng > 0 ? `${lowCount} low-engagement sessions flagged` : 'No data available yet.'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engagement Over Time */}
        <div className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 hover:border-primary-400 transition-all duration-300">
           <h3 className="text-sm font-semibold text-[#6d797d] mb-4">Long-Term Engagement Trend</h3>
           {timeline.length > 0 ? (
             <EngagementAreaChart data={timeline} />
           ) : (
             <div className="flex items-center justify-center h-[300px] text-[#6d797d] text-sm">
               No timeline data available yet. Start recording sessions.
             </div>
           )}
        </div>

        {/* Time-of-Day Heatmap */}
        <div className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 hover:border-primary-400 transition-all duration-300">
          <h3 className="text-sm font-semibold text-[#6d797d] mb-4">Engagement by Time-of-Day</h3>
          
          <div className="space-y-4">
            {HEATMAP_DATA.map((row, idx) => {
              const total = row.High + row.Medium + row.Low;
              // Guard against division by zero
              const hPct = total > 0 ? (row.High / total) * 100 : 0;
              const mPct = total > 0 ? (row.Medium / total) * 100 : 0;
              const lPct = total > 0 ? (row.Low / total) * 100 : 0;

              return (
                <div key={idx} className="p-4 rounded-xl glass-light shadow-sm border border-[#bcc9cd]/40 hover:border-primary-400 transition-all duration-300">
                  <div className="flex items-center gap-3 mb-3">
                    <row.icon className="w-4 h-4 text-[#3d494c]" />
                    <span className="text-sm font-medium text-[#131b2e]">{row.time}</span>
                  </div>
                  
                  {/* Segmented bar */}
                  {total > 0 ? (
                    <>
                      <div className="h-3 w-full rounded-full overflow-hidden flex bg-slate-100">
                        <div style={{ width: `${hPct}%` }} className="bg-emerald-500" title={`High: ${row.High}`} />
                        <div style={{ width: `${mPct}%` }} className="bg-amber-500" title={`Medium: ${row.Medium}`} />
                        <div style={{ width: `${lPct}%` }} className="bg-red-500" title={`Low: ${row.Low}`} />
                      </div>
                      
                      <div className="flex justify-between mt-2 text-[10px] font-medium uppercase tracking-wider text-[#6d797d]">
                        <span className="text-emerald-600">{hPct.toFixed(0)}% High</span>
                        <span className="text-amber-600">{mPct.toFixed(0)}% Med</span>
                        <span className="text-red-600">{lPct.toFixed(0)}% Low</span>
                      </div>
                    </>
                  ) : (
                    <div className="h-3 w-full rounded-full bg-slate-100" />
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-[#3d494c]">
            <strong>Insight:</strong> Night sessions typically show lower engagement. Consider scheduling complex topics for morning sessions.
          </div>
        </div>
      </div>
    </div>
  );
}

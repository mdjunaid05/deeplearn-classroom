import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Clock, MousePointer2, MessageSquare, AlertTriangle, Search, RefreshCw } from 'lucide-react';
import { BehaviourTimeline } from '../components/BehaviourChart';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function BehaviourMonitor() {
  const [studentIdInput, setStudentIdInput] = useState('1001');
  const [studentId, setStudentId] = useState(1001);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const fetchBehaviour = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/student-dashboard?student_id=${id}`);
      if (!res.ok) throw new Error(`No data found for Student ID: ${id}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBehaviour(studentId);
  }, [studentId, fetchBehaviour]);

  const handleSearch = (e) => {
    e.preventDefault();
    const id = parseInt(studentIdInput);
    if (!isNaN(id)) setStudentId(id);
  };

  const events = data?.behaviour_history || [];

  // Calculate aggregate metrics
  const avgClickFreq = events.length
    ? (events.reduce((sum, e) => sum + ((e.clicks || 0) / Math.max(e.session_time || 1, 1)), 0) / events.length).toFixed(1)
    : '—';
  const avgResponse = events.length
    ? (events.reduce((sum, e) => sum + (e.response_speed || 0), 0) / events.length).toFixed(1)
    : '—';
  const totalChats = events.reduce((sum, e) => sum + (e.chat_count || 0), 0);
  const totalIdle = events.reduce((sum, e) => sum + (e.idle_time || 0), 0).toFixed(1);

  // Behaviour distribution counts
  const activeCount = events.filter(e => e.behaviour_label === 'Active').length;
  const passiveCount = events.filter(e => e.behaviour_label === 'Passive').length;
  const distractedCount = events.filter(e => e.behaviour_label === 'Distracted').length;
  const total = events.length || 1;

  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-800 flex items-center gap-3">
            <Activity className="w-8 h-8 text-emerald-400" />
            Behaviour Monitor
          </h1>
          <p className="text-slate-600 mt-1">Detailed breakdown of student interaction patterns</p>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2 items-center">
          <input
            type="number"
            value={studentIdInput}
            onChange={(e) => setStudentIdInput(e.target.value)}
            className="w-36 px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary-500/50 shadow-sm"
            placeholder="Student ID"
            id="behaviour-student-id"
            min="1000" max="9999"
          />
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-400 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-60"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Loading...' : 'Search'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column — Summary & Alerts */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl glass shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
            <h3 className="text-sm font-semibold text-slate-500 mb-4">Behaviour Summary</h3>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-emerald-600">Active</span>
                  <span className="text-sm font-bold text-emerald-600">
                    {activeCount} <span className="text-xs font-normal text-emerald-500">({((activeCount/total)*100).toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="w-full bg-emerald-100 rounded-full h-1.5 mt-2">
                  <div className="bg-emerald-400 h-1.5 rounded-full transition-all duration-700" style={{ width: `${(activeCount/total)*100}%` }} />
                </div>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-amber-600">Passive</span>
                  <span className="text-sm font-bold text-amber-600">
                    {passiveCount} <span className="text-xs font-normal text-amber-500">({((passiveCount/total)*100).toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="w-full bg-amber-100 rounded-full h-1.5 mt-2">
                  <div className="bg-amber-400 h-1.5 rounded-full transition-all duration-700" style={{ width: `${(passiveCount/total)*100}%` }} />
                </div>
              </div>
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-red-600">Distracted</span>
                  <span className="text-sm font-bold text-red-600">
                    {distractedCount} <span className="text-xs font-normal text-red-500">({((distractedCount/total)*100).toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="w-full bg-red-100 rounded-full h-1.5 mt-2">
                  <div className="bg-red-400 h-1.5 rounded-full transition-all duration-700" style={{ width: `${(distractedCount/total)*100}%` }} />
                </div>
              </div>
              <p className="text-xs text-slate-500 text-center pt-1">Based on {events.length} recorded activities</p>
            </div>
          </div>

          <div className="p-6 rounded-2xl glass shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
            <h3 className="text-sm font-semibold text-slate-500 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Recent Alerts
            </h3>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
              {loading ? (
                 <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-500"></div></div>
              ) : events.filter(e => e.behaviour_label === 'Distracted' || e.behaviour_label === 'Passive').length === 0 ? (
                <div className="flex items-start gap-3 p-3 rounded-lg glass-light shadow-lg border border-slate-200/60">
                  <Clock className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">No alerts</p>
                    <p className="text-xs text-slate-500 mt-1">Student behavior is active and positive.</p>
                  </div>
                </div>
              ) : (
                events.filter(e => e.behaviour_label === 'Distracted' || e.behaviour_label === 'Passive')
                  .slice(-5).reverse().map((alert, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg glass-light shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
                    {alert.behaviour_label === 'Distracted' ? (
                      <Clock className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <MousePointer2 className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {alert.behaviour_label === 'Distracted' ? 'High Idle Time Detected' : 'Low Interaction Detected'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Activity #{alert.activity_id} · {alert.idle_time}min idle · {alert.chat_count} chats
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column — Timeline */}
        <div className="lg:col-span-2 p-6 rounded-2xl glass shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
          <h3 className="text-sm font-semibold text-slate-500 mb-4 flex items-center justify-between">
            <span>Interaction Timeline (Student #{studentId})</span>
            <span className="text-xs font-normal text-slate-500">Based on LSTM classifications</span>
          </h3>
          
          <div className="bg-surface-800/50 rounded-xl p-4 mb-6 shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-slate-500 mb-1">Avg Click Freq</p>
                <p className="text-lg font-bold text-slate-800">{avgClickFreq} <span className="text-xs font-normal text-slate-600">/min</span></p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Avg Response</p>
                <p className="text-lg font-bold text-slate-800">{avgResponse} <span className="text-xs font-normal text-slate-600">sec</span></p>
              </div>
               <div>
                <p className="text-xs text-slate-500 mb-1">Total Chats</p>
                <p className="text-lg font-bold text-slate-800 flex items-center justify-center gap-1">
                  <MessageSquare className="w-3 h-3 text-primary-400" />
                  {totalChats}
                </p>
              </div>
               <div>
                <p className="text-xs text-slate-500 mb-1">Total Idle</p>
                <p className="text-lg font-bold text-red-400">{totalIdle} <span className="text-xs font-normal">min</span></p>
              </div>
            </div>
          </div>

          <div className="relative">
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              </div>
            ) : error ? (
              <div className="text-center py-10 text-slate-500">
                {error}
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                No behavior data recorded yet.
              </div>
            ) : (
              <>
                <div className="absolute top-0 bottom-0 left-[21px] w-0.5 bg-slate-200" />
                <BehaviourTimeline events={events.slice().reverse()} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

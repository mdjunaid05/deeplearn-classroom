/**
 * BehaviourMonitor.jsx — AI-Powered Behaviour Monitoring Dashboard
 * 
 * Features:
 *  - Real-time webcam-based student behaviour tracking
 *  - Live engagement / focus / participation scores
 *  - Behaviour classification: Focused / Active / Passive / Distracted / Inactive / Sleeping / Absent
 *  - Dynamic alerts panel for Distracted/Inactive events
 *  - Interaction timeline from backend (per student)
 *  - AI recommendations panel
 *  - Behaviour distribution with animated progress bars
 *  - Search students by ID (teacher view)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, Clock, MousePointer2, MessageSquare, AlertTriangle,
  Search, RefreshCw, Eye, Brain, Zap, TrendingUp, Users,
  CheckCircle, WifiOff, BarChart3, Award, Target, Shield,
} from 'lucide-react';
import { BehaviourTimeline, BehaviourBarChart, BehaviourPieChart } from '../components/BehaviourChart';
import LiveBehaviourTracker from '../components/LiveBehaviourTracker';
import AIRecommendations from '../components/AIRecommendations';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '';

const BEHAVIOUR_CONFIG = {
  Focused:    { color: '#22c55e', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-600' },
  Active:     { color: '#06b6d4', bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30',   text: 'text-cyan-600' },
  Passive:    { color: '#f97316', bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-600' },
  Distracted: { color: '#f59e0b', bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-600' },
  Inactive:   { color: '#ef4444', bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-600' },
  Sleeping:   { color: '#8b5cf6', bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-600' },
  Absent:     { color: '#6b7280', bg: 'bg-slate-500/10',  border: 'border-slate-500/30',  text: 'text-slate-600' },
};

function ScoreRing({ value, label, color, size = 80 }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = circ * (Math.min(value, 100) / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
          <circle
            cx={size/2} cy={size/2} r={r} fill="none"
            stroke={color} strokeWidth="6"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-slate-800">{Math.min(value, 100)}</span>
        </div>
      </div>
      <span className="text-xs text-slate-500 font-medium">{label}</span>
    </div>
  );
}

function AlertCard({ icon, title, subtitle, severity = 'warning' }) {
  const colors = {
    warning: 'border-amber-200 bg-amber-50',
    danger:  'border-red-200 bg-red-50',
    info:    'border-cyan-200 bg-cyan-50',
    success: 'border-emerald-200 bg-emerald-50',
  };
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${colors[severity]} transition-all duration-200`}>
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function BehaviourMonitor() {
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';

  const [studentIdInput, setStudentIdInput] = useState('1001');
  const [studentId, setStudentId] = useState(1001);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Live behaviour (from webcam tracker, student-side)
  const [liveMetrics, setLiveMetrics] = useState(null);
  const [liveHistory, setLiveHistory] = useState([]);
  const liveHistoryRef = useRef([]);

  // ── Fetch backend behaviour data ──────────────────────────────────────────
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

  useEffect(() => { fetchBehaviour(studentId); }, [studentId, fetchBehaviour]);

  const handleSearch = (e) => {
    e.preventDefault();
    const id = parseInt(studentIdInput);
    if (!isNaN(id)) setStudentId(id);
  };

  // ── Live metrics handler ──────────────────────────────────────────────────
  const handleLiveMetrics = useCallback((metrics) => {
    setLiveMetrics(metrics);
    const updated = [...liveHistoryRef.current, metrics].slice(-20);
    liveHistoryRef.current = updated;
    setLiveHistory([...updated]);
  }, []);

  // ── Derive stats from backend data ────────────────────────────────────────
  const events = data?.behaviour_history || [];
  const avgClickFreq = events.length
    ? (events.reduce((s, e) => s + (e.clicks || 0) / Math.max(e.session_time || 1, 1), 0) / events.length).toFixed(1)
    : '—';
  const avgResponse = events.length
    ? (events.reduce((s, e) => s + (e.response_speed || 0), 0) / events.length).toFixed(1)
    : '—';
  const totalChats = events.reduce((s, e) => s + (e.chat_count || 0), 0);
  const totalIdle  = events.reduce((s, e) => s + (e.idle_time  || 0), 0).toFixed(1);

  const activeCount     = events.filter(e => e.behaviour_label === 'Active').length;
  const passiveCount    = events.filter(e => e.behaviour_label === 'Passive').length;
  const distractedCount = events.filter(e => e.behaviour_label === 'Distracted').length;
  const total = events.length || 1;

  const alerts = events.filter(e =>
    e.behaviour_label === 'Distracted' || e.behaviour_label === 'Passive'
  ).slice(-5).reverse();

  // Derive engagement score from backend data
  const avgScore = data?.average_score || 50;
  const engagementScore = liveMetrics?.engagementScore ?? Math.round(avgScore);
  const focusScore = liveMetrics?.focusScore ?? Math.round(avgScore * 0.9);
  const participationScore = liveMetrics?.participationScore ?? Math.round(avgScore * 0.8);
  const currentBehaviour = liveMetrics?.behaviour ?? (data?.current_behaviour || 'Passive');
  const cfg = BEHAVIOUR_CONFIG[currentBehaviour] || BEHAVIOUR_CONFIG.Passive;

  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-800 flex items-center gap-3">
            <Brain className="w-8 h-8 text-primary-400" />
            AI Behaviour Monitor
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Real-time attention tracking · AI-powered engagement analysis
          </p>
        </div>

        {/* Student selector (teacher view) */}
        {isTeacher && (
          <form onSubmit={handleSearch} className="flex gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="number"
                value={studentIdInput}
                onChange={e => setStudentIdInput(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary-500/50 shadow-sm w-40"
                placeholder="Student ID"
                id="behaviour-student-id"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-400 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-60"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {loading ? 'Loading...' : 'Search'}
            </button>
          </form>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Top Row: Live Camera + Scores + AI Rec ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Left: Live Webcam Monitor */}
        <LiveBehaviourTracker
          onMetricsUpdate={handleLiveMetrics}
          studentId={studentId}
        />

        {/* Middle: Score Rings + Current Status */}
        <div className="glass rounded-2xl border border-slate-200/60 shadow-lg p-5 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200/40">
            <Target className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-semibold text-slate-700">Performance Scores</h3>
          </div>

          {/* Current behaviour badge */}
          <div className={`flex items-center justify-center gap-2 py-4 rounded-xl border-2 ${cfg.bg} ${cfg.border} transition-all duration-500`}>
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: cfg.color }} />
            <span className={`font-bold text-xl ${cfg.text}`}>{currentBehaviour}</span>
          </div>

          {/* Score rings */}
          <div className="flex justify-around py-2">
            <ScoreRing value={engagementScore}    label="Engagement"    color="#06b6d4" />
            <ScoreRing value={focusScore}          label="Focus"         color="#8b5cf6" />
            <ScoreRing value={participationScore}  label="Participation" color="#22c55e" />
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Avg Click/min', value: avgClickFreq, icon: <MousePointer2 className="w-3.5 h-3.5 text-primary-400" /> },
              { label: 'Avg Response', value: `${avgResponse}s`, icon: <Zap className="w-3.5 h-3.5 text-amber-400" /> },
              { label: 'Total Chats', value: totalChats, icon: <MessageSquare className="w-3.5 h-3.5 text-emerald-400" /> },
              { label: 'Total Idle', value: `${totalIdle}m`, icon: <Clock className="w-3.5 h-3.5 text-red-400" /> },
            ].map(({ label, value, icon }) => (
              <div key={label} className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-xs text-slate-500">{label}</span></div>
                <p className="text-base font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: AI Recommendations */}
        <AIRecommendations
          behaviour={currentBehaviour}
          engagementScore={engagementScore}
          focusScore={focusScore}
        />
      </div>

      {/* ── Middle Row: Behaviour Distribution + Alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Behaviour Distribution (animated bars) */}
        <div className="glass rounded-2xl border border-slate-200/60 shadow-lg p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-semibold text-slate-700">Behaviour Summary</h3>
            <span className="ml-auto text-xs text-slate-400">{events.length} activities</span>
          </div>
          <div className="space-y-4">
            {[
              { label: 'Active', count: activeCount, color: '#22c55e', bg: 'bg-emerald-100', bar: 'bg-emerald-400' },
              { label: 'Passive', count: passiveCount, color: '#f97316', bg: 'bg-orange-100', bar: 'bg-orange-400' },
              { label: 'Distracted', count: distractedCount, color: '#ef4444', bg: 'bg-red-100', bar: 'bg-red-400' },
            ].map(({ label, count, color, bg, bar }) => (
              <div key={label}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm font-semibold" style={{ color }}>{label}</span>
                  <span className="text-sm font-bold text-slate-700">
                    {count}
                    <span className="text-xs font-normal text-slate-400 ml-1">
                      ({((count / total) * 100).toFixed(0)}%)
                    </span>
                  </span>
                </div>
                <div className={`w-full ${bg} rounded-full h-2.5`}>
                  <div
                    className={`${bar} h-2.5 rounded-full transition-all duration-700`}
                    style={{ width: `${(count / total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Behaviour Pie mini */}
          {events.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200/40">
              <BehaviourPieChart data={{
                Active: activeCount,
                Passive: passiveCount,
                Distracted: distractedCount,
              }} />
            </div>
          )}
        </div>

        {/* Alerts Panel */}
        <div className="glass rounded-2xl border border-slate-200/60 shadow-lg p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-700">Behaviour Alerts</h3>
            {alerts.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full font-bold">
                {alerts.length} flagged
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 text-primary-400 animate-spin" />
            </div>
          ) : alerts.length === 0 ? (
            <AlertCard
              icon={<CheckCircle className="w-4 h-4 text-emerald-500" />}
              title="All Clear — No Alerts"
              subtitle="Student behaviour is active and engaged."
              severity="success"
            />
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {alerts.map((alert, idx) => (
                <AlertCard
                  key={idx}
                  icon={
                    alert.behaviour_label === 'Distracted'
                      ? <AlertTriangle className="w-4 h-4 text-amber-500" />
                      : <Clock className="w-4 h-4 text-orange-500" />
                  }
                  title={alert.behaviour_label === 'Distracted' ? 'High Idle Time Detected' : 'Low Interaction Detected'}
                  subtitle={`Activity #${alert.activity_id} · ${alert.idle_time}min idle · ${alert.chat_count} chats · Response: ${alert.response_speed?.toFixed(1)}s`}
                  severity={alert.behaviour_label === 'Distracted' ? 'danger' : 'warning'}
                />
              ))}
            </div>
          )}

          {/* Live tracker history alerts */}
          {liveHistory.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200/40">
              <p className="text-xs font-semibold text-slate-500 mb-3">Live Session Events</p>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {liveHistory.filter(h => h.behaviour === 'Distracted' || h.behaviour === 'Inactive' || h.behaviour === 'Sleeping').slice(-5).reverse().map((h, idx) => (
                  <AlertCard
                    key={idx}
                    icon={<Eye className="w-4 h-4 text-violet-500" />}
                    title={`Live: ${h.behaviour} detected`}
                    subtitle={`Focus: ${h.focusScore}% · Engagement: ${h.engagementScore}% · ${new Date(h.timestamp).toLocaleTimeString()}`}
                    severity="info"
                  />
                ))}
                {liveHistory.filter(h => h.behaviour === 'Distracted' || h.behaviour === 'Inactive' || h.behaviour === 'Sleeping').length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-2">No attention issues in current session</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Row: Timeline ── */}
      <div className="glass rounded-2xl border border-slate-200/60 shadow-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-700">
              Interaction Timeline
              {isTeacher && <span className="ml-2 text-slate-400 font-normal">(Student #{studentId})</span>}
            </h3>
          </div>
          <span className="text-xs text-slate-400">Based on AI classification model</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <RefreshCw className="w-6 h-6 text-primary-400 animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">
            No activity data recorded yet.
          </div>
        ) : (
          <div className="relative">
            <div className="absolute top-0 bottom-0 left-[21px] w-0.5 bg-slate-200" />
            <BehaviourTimeline events={events.slice().reverse()} />
          </div>
        )}
      </div>
    </div>
  );
}

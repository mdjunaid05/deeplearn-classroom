import React, { useState, useEffect } from 'react';
import {
  GraduationCap, TrendingUp, Target, BookOpen, Zap,
  ChevronDown, RefreshCw, Award,
} from 'lucide-react';
import { EngagementLineChart, EngagementGauge } from '../components/EngagementChart';
import ProgressBar from '../components/ProgressBar';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Empty data for when backend is not running
const EMPTY_DATA = {
  student_id: null,
  average_score: 0,
  current_difficulty: '',
  current_engagement: '',
  current_behaviour: '',
  recommendation: {
    suggested_difficulty: '',
    reason: 'No data available yet. Complete activities to get recommendations.',
  },
  performance_history: [],
  engagement_history: [],
};

export default function StudentDashboard() {
  const [data, setData] = useState(null);
  const [studentId, setStudentId] = useState(1001);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async (id) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/student-dashboard?student_id=${id}`);
      if (!res.ok) throw new Error('API not available');
      const json = await res.json();
      setData(json);
    } catch {
      // Use demo data
      setData(EMPTY_DATA);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(studentId);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchData(studentId);
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  const engagementScore = data.average_score || 72;
  const difficultyBadge = `badge-${(data.current_difficulty || 'medium').toLowerCase()}`;
  const engagementBadge = `badge-${(data.current_engagement || 'medium').toLowerCase()}`;
  const behaviourBadge = `badge-${(data.current_behaviour || 'passive').toLowerCase()}`;

  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-3">
            <GraduationCap className="w-8 h-8 text-primary-400" />
            Student Dashboard
          </h1>
          <p className="text-slate-400 mt-1">Track your learning progress and engagement</p>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="number"
            value={studentId}
            onChange={(e) => setStudentId(Number(e.target.value))}
            className="w-32 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            placeholder="Student ID"
            id="student-id-input"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium
                       hover:bg-primary-500 transition-colors disabled:opacity-50"
            id="student-search-btn"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </form>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: 'Current Difficulty',
            value: data.current_difficulty,
            badge: difficultyBadge,
            icon: Target,
            iconColor: 'text-amber-400',
          },
          {
            label: 'Engagement Level',
            value: data.current_engagement,
            badge: engagementBadge,
            icon: Zap,
            iconColor: 'text-emerald-400',
          },
          {
            label: 'Behaviour Status',
            value: data.current_behaviour,
            badge: behaviourBadge,
            icon: TrendingUp,
            iconColor: 'text-blue-400',
          },
          {
            label: 'Average Score',
            value: `${data.average_score}%`,
            icon: Award,
            iconColor: 'text-purple-400',
          },
        ].map((card, idx) => (
          <div key={idx} className="p-5 rounded-2xl glass card-hover">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400">{card.label}</span>
              <card.icon className={`w-5 h-5 ${card.iconColor}`} />
            </div>
            {card.badge ? (
              <span className={`badge ${card.badge} text-base`}>{card.value}</span>
            ) : (
              <p className="text-2xl font-display font-bold text-white">{card.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Engagement Gauge */}
        <div className="p-6 rounded-2xl glass">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Engagement Score</h3>
          <EngagementGauge score={engagementScore} label="Overall" />
        </div>

        {/* Quiz Performance */}
        <div className="lg:col-span-2 p-6 rounded-2xl glass">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Quiz Performance Trend</h3>
          <EngagementLineChart data={data.performance_history || []} />
        </div>
      </div>

      {/* Recommendation + Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recommendation */}
        <div className="p-6 rounded-2xl glass">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary-400" />
            Recommended Next Activity
          </h3>
          <div className="p-4 rounded-xl bg-primary-600/10 border border-primary-500/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-white">Suggested Difficulty:</span>
              <span className={`badge badge-${(data.recommendation?.suggested_difficulty || 'medium').toLowerCase()}`}>
                {data.recommendation?.suggested_difficulty}
              </span>
            </div>
            <p className="text-sm text-slate-300">{data.recommendation?.reason}</p>
          </div>

          <div className="mt-6 space-y-4">
            <ProgressBar value={data.average_score} label="Average Score" color="primary" />
            <ProgressBar
              value={(data.performance_history?.reduce((s, p) => s + p.completion_rate, 0) /
                      (data.performance_history?.length || 1)) * 100}
              label="Completion Rate"
              color="accent"
            />
          </div>
        </div>

        {/* Recent Activity */}
        <div className="p-6 rounded-2xl glass">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Recent Engagement</h3>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {(data.engagement_history || []).slice(-8).reverse().map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg glass-light">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    item.engagement_label === 'High' ? 'bg-emerald-400' :
                    item.engagement_label === 'Low' ? 'bg-red-400' : 'bg-amber-400'
                  }`} />
                  <span className="text-sm text-slate-300">Activity #{item.activity_id}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{item.session_time?.toFixed(0)}min</span>
                  <span className={`badge badge-${item.engagement_label.toLowerCase()}`}>
                    {item.engagement_label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Signed Videos Section */}
      <div className="mt-8 p-6 rounded-2xl glass">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-emerald-400" aria-hidden="true" />
          Signed Class Videos
        </h2>
        <div className="flex flex-col items-center justify-center py-8 text-center bg-surface-800/30 rounded-xl border border-white/5">
          <BookOpen className="w-10 h-10 text-slate-500 mb-3" aria-hidden="true" />
          <p className="text-slate-400 text-sm">No signed class videos are currently available.</p>
        </div>
      </div>
    </div>
  );
}

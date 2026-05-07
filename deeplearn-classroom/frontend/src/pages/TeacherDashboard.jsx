import React, { useState, useEffect } from 'react';
import {
  Users, BarChart3, TrendingUp, Filter, Search,
  ArrowUpRight, ArrowDownRight, Minus, Video, Brain,
  AlertTriangle, CheckCircle, Shield, Eye, Award, Activity
} from 'lucide-react';
import { BehaviourBarChart, BehaviourPieChart } from '../components/BehaviourChart';
import { EngagementAreaChart } from '../components/EngagementChart';
import BehaviourHeatmap from '../components/BehaviourHeatmap';

const API_BASE = import.meta.env.VITE_API_URL || '';

const EMPTY_DATA = {
  total_students: 0,
  total_records: 0,
  engagement_distribution: { High: 0, Medium: 0, Low: 0 },
  behaviour_distribution: { Active: 0, Passive: 0, Distracted: 0 },
  difficulty_distribution: { Easy: 0, Medium: 0, Hard: 0 },
  student_summaries: [],
  engagement_timeline: [],
};

export default function TeacherDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Loading dashboard data...');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('average_score');

  useEffect(() => {
    const loadingTimer = setTimeout(() => {
      setLoadingText('Server is waking up (this may take up to 50s on free tiers)...');
    }, 5000);

    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/teacher-dashboard`);
        if (!res.ok) throw new Error('API not available');
        const json = await res.json();
        setData(json);
      } catch {
        setData(EMPTY_DATA);
      } finally {
        clearTimeout(loadingTimer);
        setLoading(false);
      }
    };
    fetchData();

    return () => clearTimeout(loadingTimer);
  }, []);

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6">
        <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-slate-800 mb-1">Please Wait</h3>
          <p className="text-slate-500 text-sm max-w-xs">{loadingText}</p>
        </div>
      </div>
    );
  }

  const filteredStudents = (data.student_summaries || [])
    .filter(s => s.student_id.toString().includes(search))
    .sort((a, b) => {
      if (sortBy === 'average_score') return b.average_score - a.average_score;
      if (sortBy === 'completion_rate') return b.completion_rate - a.completion_rate;
      return a.student_id - b.student_id;
    });

  const getTrendIcon = (engagement) => {
    if (engagement === 'High') return <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />;
    if (engagement === 'Low') return <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />;
    return <Minus className="w-3.5 h-3.5 text-amber-400" />;
  };

  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-800 flex items-center gap-3">
            <Users className="w-8 h-8 text-primary-400" />
            Teacher Dashboard
          </h1>
          <p className="text-slate-600 mt-1">
            Overview of {data.total_students} students · {data.total_records} records
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          {
            label: 'Engagement',
            data: data.engagement_distribution,
            colors: { High: 'text-emerald-400', Medium: 'text-amber-400', Low: 'text-red-400' },
          },
          {
            label: 'Behaviour',
            data: data.behaviour_distribution,
            colors: { Active: 'text-emerald-400', Passive: 'text-amber-400', Distracted: 'text-red-400' },
          },
          {
            label: 'Difficulty',
            data: data.difficulty_distribution,
            colors: { Easy: 'text-emerald-400', Medium: 'text-amber-400', Hard: 'text-red-400' },
          },
        ].map((card, idx) => (
          <div key={idx} className="p-5 rounded-2xl glass card-hover shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
            <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
              {card.label} Distribution
            </h3>
            <div className="space-y-2">
              {Object.entries(card.data).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">{key}</span>
                  <span className={`text-sm font-bold ${card.colors[key] || 'text-white'}`}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Engagement Bar */}
        <div className="p-6 rounded-2xl glass shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
          <h3 className="text-sm font-semibold text-slate-500 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary-400" />
            Engagement Distribution
          </h3>
          <BehaviourBarChart data={data.engagement_distribution} />
        </div>

        {/* Behaviour Pie */}
        <div className="p-6 rounded-2xl glass shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
          <h3 className="text-sm font-semibold text-slate-500 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Behaviour Breakdown
          </h3>
          <BehaviourPieChart data={data.behaviour_distribution} />
        </div>
      </div>

      {/* Behaviour Heatmap */}
      <div className="p-6 rounded-2xl glass mb-8 shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
        <div className="flex items-center gap-2 mb-5">
          <Brain className="w-5 h-5 text-primary-400" />
          <h3 className="text-sm font-semibold text-slate-700">AI Behaviour Heatmap</h3>
          <span className="ml-2 text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Live Activity Periods</span>
          <a
            href="/behaviour"
            className="ml-auto text-xs px-3 py-1.5 bg-primary-500 hover:bg-primary-400 text-white rounded-lg font-semibold transition-colors"
          >
            Open Monitor
          </a>
        </div>
        <BehaviourHeatmap studentSummaries={data.student_summaries || []} periods={12} />
      </div>

      {/* Live Student Status Grid */}
      <div className="p-6 rounded-2xl glass mb-8 shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
        <div className="flex items-center gap-2 mb-5">
          <Eye className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-700">Live Student Status</h3>
          <span className="ml-2 text-xs text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold animate-pulse">● Live</span>
          <span className="ml-auto text-xs text-slate-400">{data.student_summaries?.length || 0} students tracked</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {(data.student_summaries || []).slice(0, 24).map((student) => {
            const engagment = student.latest_engagement;
            const behaviour = student.latest_behaviour;
            const statusColor =
              behaviour === 'Active' ? '#22c55e' :
              behaviour === 'Passive' ? '#f97316' :
              '#ef4444';
            const avgScore = student.average_score;
            return (
              <div
                key={student.student_id}
                className="p-3 rounded-xl glass-light border border-slate-200/60 hover:border-cyan-400 transition-all duration-200 hover:shadow-md cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-slate-500">#{student.student_id}</span>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
                </div>
                <div className="text-base font-bold text-slate-800 mb-1">{avgScore}%</div>
                <div className="text-xs" style={{ color: statusColor }}>{behaviour}</div>
                <div className="mt-2 w-full bg-slate-100 rounded-full h-1">
                  <div className="h-1 rounded-full" style={{ width: `${avgScore}%`, background: statusColor }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Attention Analytics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: 'Focused Students',
            value: Math.round((data.student_summaries || []).filter(s => s.latest_engagement === 'High').length),
            icon: <CheckCircle className="w-5 h-5 text-emerald-400" />,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
          },
          {
            label: 'At Risk',
            value: Math.round((data.student_summaries || []).filter(s => s.latest_behaviour === 'Distracted').length),
            icon: <AlertTriangle className="w-5 h-5 text-red-400" />,
            color: 'text-red-600',
            bg: 'bg-red-50',
          },
          {
            label: 'Class Avg Score',
            value: `${Math.round((data.student_summaries || []).reduce((s, st) => s + st.average_score, 0) / Math.max(data.student_summaries?.length || 1, 1))}%`,
            icon: <Award className="w-5 h-5 text-amber-400" />,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
          },
          {
            label: 'Active Learners',
            value: Math.round((data.student_summaries || []).filter(s => s.latest_behaviour === 'Active').length),
            icon: <Activity className="w-5 h-5 text-cyan-400" />,
            color: 'text-cyan-600',
            bg: 'bg-cyan-50',
          },
        ].map((stat, idx) => (
          <div key={idx} className={`p-5 rounded-2xl ${stat.bg} border border-slate-200/60 shadow-lg flex items-center gap-4`}>
            <div className="p-2.5 rounded-xl bg-white shadow-sm">{stat.icon}</div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Engagement Timeline */}
      <div className="p-6 rounded-2xl glass mb-8 shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
        <h3 className="text-sm font-semibold text-slate-500 mb-4">Engagement Over Time</h3>
        <EngagementAreaChart data={data.engagement_timeline || []} />
      </div>

      {/* Student Table */}
      <div className="p-6 rounded-2xl glass shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-500">All Students</h3>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by ID..."
                className="pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white
                           placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 w-40"
                id="teacher-search"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white
                         focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              id="teacher-sort"
            >
              <option value="average_score">Score ↓</option>
              <option value="completion_rate">Completion ↓</option>
              <option value="student_id">ID ↑</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Student</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Score</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Engagement</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Behaviour</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Difficulty</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Completion</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Trend</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student, idx) => (
                <tr key={idx} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-3 font-medium text-white">#{student.student_id}</td>
                  <td className="py-3 px-3 text-slate-500">{student.average_score}%</td>
                  <td className="py-3 px-3">
                    <span className={`badge badge-${student.latest_engagement.toLowerCase()}`}>
                      {student.latest_engagement}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`badge badge-${student.latest_behaviour.toLowerCase()}`}>
                      {student.latest_behaviour}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`badge badge-${student.latest_difficulty.toLowerCase()}`}>
                      {student.latest_difficulty}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-500">{(student.completion_rate * 100).toFixed(0)}%</td>
                  <td className="py-3 px-3">{getTrendIcon(student.latest_engagement)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Video Upload & Processing Queue */}
      <div className="mt-8 p-6 rounded-2xl glass mb-8 shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" aria-hidden="true" />
            Signed Video Processing Queue
          </h3>
          <div className="flex gap-3">
            <a href="/recordings" className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2">
              <Video className="w-4 h-4" /> Recorded Classes
            </a>
            <a href="/video-upload" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors">
              Upload New Video
            </a>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-8 text-center bg-surface-800/30 rounded-xl border border-white/5 shadow-lg hover:shadow-xl hover:border-cyan-400 transition-all duration-300">
          <p className="text-slate-600 text-sm">No videos currently in processing queue.</p>
        </div>
      </div>
    </div>
  );
}

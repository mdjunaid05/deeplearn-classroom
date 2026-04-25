import React, { useState, useEffect } from 'react';
import {
  Users, BarChart3, TrendingUp, Filter, Search,
  ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import { BehaviourBarChart, BehaviourPieChart } from '../components/BehaviourChart';
import { EngagementAreaChart } from '../components/EngagementChart';

const API_BASE = import.meta.env.VITE_API_URL || '';

const DEMO_DATA = {
  total_students: 50,
  total_records: 250,
  engagement_distribution: { High: 95, Medium: 105, Low: 50 },
  behaviour_distribution: { Active: 80, Passive: 110, Distracted: 60 },
  difficulty_distribution: { Easy: 70, Medium: 120, Hard: 60 },
  student_summaries: Array.from({ length: 20 }, (_, i) => ({
    student_id: 1001 + i,
    total_activities: 4 + Math.floor(Math.random() * 8),
    average_score: +(40 + Math.random() * 55).toFixed(2),
    latest_engagement: ['High', 'Medium', 'Low'][Math.floor(Math.random() * 3)],
    latest_behaviour: ['Active', 'Passive', 'Distracted'][Math.floor(Math.random() * 3)],
    latest_difficulty: ['Easy', 'Medium', 'Hard'][Math.floor(Math.random() * 3)],
    completion_rate: +(0.3 + Math.random() * 0.7).toFixed(2),
  })),
  engagement_timeline: Array.from({ length: 15 }, (_, i) => ({
    period: i + 1,
    avg_score: +(50 + Math.random() * 40).toFixed(2),
    high_engagement_pct: +(20 + Math.random() * 60).toFixed(1),
    active_behaviour_pct: +(15 + Math.random() * 55).toFixed(1),
  })),
};

export default function TeacherDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('average_score');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/teacher-dashboard`);
        if (!res.ok) throw new Error('API not available');
        const json = await res.json();
        setData(json);
      } catch {
        setData(DEMO_DATA);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
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
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-3">
            <Users className="w-8 h-8 text-primary-400" />
            Teacher Dashboard
          </h1>
          <p className="text-slate-400 mt-1">
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
          <div key={idx} className="p-5 rounded-2xl glass card-hover">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {card.label} Distribution
            </h3>
            <div className="space-y-2">
              {Object.entries(card.data).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">{key}</span>
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
        <div className="p-6 rounded-2xl glass">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary-400" />
            Engagement Distribution
          </h3>
          <BehaviourBarChart data={data.engagement_distribution} />
        </div>

        {/* Behaviour Pie */}
        <div className="p-6 rounded-2xl glass">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Behaviour Breakdown
          </h3>
          <BehaviourPieChart data={data.behaviour_distribution} />
        </div>
      </div>

      {/* Engagement Timeline */}
      <div className="p-6 rounded-2xl glass mb-8">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Engagement Over Time</h3>
        <EngagementAreaChart data={data.engagement_timeline || []} />
      </div>

      {/* Student Table */}
      <div className="p-6 rounded-2xl glass">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-300">All Students</h3>
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
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Student</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Score</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Engagement</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Behaviour</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Difficulty</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Completion</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Trend</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student, idx) => (
                <tr key={idx} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-3 font-medium text-white">#{student.student_id}</td>
                  <td className="py-3 px-3 text-slate-300">{student.average_score}%</td>
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
                  <td className="py-3 px-3 text-slate-300">{(student.completion_rate * 100).toFixed(0)}%</td>
                  <td className="py-3 px-3">{getTrendIcon(student.latest_engagement)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Video Upload & Processing Queue */}
      <div className="mt-8 p-6 rounded-2xl glass mb-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" aria-hidden="true" />
            Signed Video Processing Queue
          </h3>
          <a href="/video-upload" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors">
            Upload New Video
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-surface-800/50 border border-white/5">
            <div className="flex justify-between items-start mb-2">
              <span className="font-semibold text-white">Lecture_04_CNNs.mp4</span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-300">Done</span>
            </div>
            <p className="text-xs text-slate-400 mb-2">Processed 2 hrs ago</p>
            <p className="text-xs text-primary-300">Watched by 45 students</p>
          </div>
          
          <div className="p-4 rounded-xl bg-surface-800/50 border border-white/5">
            <div className="flex justify-between items-start mb-2">
              <span className="font-semibold text-white">Lecture_05_LSTMs.mp4</span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-300 animate-pulse">Processing (60%)</span>
            </div>
            <p className="text-xs text-slate-400 mb-2">Extracting ASL sequences...</p>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 w-[60%]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

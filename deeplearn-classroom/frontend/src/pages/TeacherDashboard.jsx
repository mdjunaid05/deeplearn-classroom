import React, { useState, useEffect } from 'react';
import {
  Users, BarChart3, TrendingUp, Filter, Search,
  ArrowUpRight, ArrowDownRight, Minus, Video, Brain,
  AlertTriangle, CheckCircle, Shield, Eye, Award, Activity,
  RefreshCw, Download, FileSpreadsheet, FileText, ChevronRight, BookOpen, Trophy
} from 'lucide-react';
import { BehaviourBarChart, BehaviourPieChart } from '../components/BehaviourChart';
import { EngagementAreaChart } from '../components/EngagementChart';
import BehaviourHeatmap from '../components/BehaviourHeatmap';
import { API_BASE } from '../utils/api';

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
  const [activeTab, setActiveTab] = useState('overview');

  // Quiz Analytics States
  const [quizReports, setQuizReports] = useState([]);
  const [classAnalytics, setClassAnalytics] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentReport, setStudentReport] = useState(null);
  const [quizSearch, setQuizSearch] = useState('');
  const [quizFilter, setQuizFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  // Student Progression States
  const [studentProgressList, setStudentProgressList] = useState([]);
  const [loadingProgression, setLoadingProgression] = useState(false);
  const [progressionSearch, setProgressionSearch] = useState('');
  const [progressionSchoolFilter, setProgressionSchoolFilter] = useState('All');
  const [progressionGradeFilter, setProgressionGradeFilter] = useState('All');
  const [progressionAgeFilter, setProgressionAgeFilter] = useState('All');
  const [progressionStatusFilter, setProgressionStatusFilter] = useState('All');
  const [progressionPerformanceFilter, setProgressionPerformanceFilter] = useState('All');
  const [expandedStudentId, setExpandedStudentId] = useState(null);
  const [modalTab, setModalTab] = useState('performance');

  const fetchProgressionData = async () => {
    try {
      setLoadingProgression(true);
      const res = await fetch(`${API_BASE}/teacher/student-progress`);
      if (res.ok) {
        const data = await res.json();
        setStudentProgressList(data);
      }
    } catch (err) {
      console.error("Error fetching student progress data:", err);
    } finally {
      setLoadingProgression(false);
    }
  };

  const handleManualUnlock = async (studentId, lessonId) => {
    try {
      const res = await fetch(`${API_BASE}/lesson/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          lesson_id: lessonId,
          course_id: 1
        })
      });
      if (res.ok) {
        fetchProgressionData();
      }
    } catch (err) {
      console.error("Error unlocking lesson:", err);
    }
  };

  const fetchQuizData = async () => {
    try {
      setRefreshing(true);
      const reportsRes = await fetch(`${API_BASE}/teacher/quiz-reports`);
      if (reportsRes.ok) {
        const reportsData = await reportsRes.json();
        setQuizReports(reportsData);
      }

      const analyticsRes = await fetch(`${API_BASE}/teacher/class-analytics`);
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setClassAnalytics(analyticsData);
      }
    } catch (err) {
      console.error("Error fetching quiz analytics data:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const fetchStudentReport = async (studentId) => {
    try {
      const res = await fetch(`${API_BASE}/teacher/student-report/${studentId}`);
      if (res.ok) {
        const data = await res.json();
        setStudentReport(data);
      }
    } catch (err) {
      console.error("Error fetching student report:", err);
    }
  };

  const handleExportCSV = () => {
    let headers = ['Student ID', 'Student Name', 'Quiz Name', 'Score', 'Percentage', 'Time Taken (s)', 'Submission Time'];
    let csvRows = [headers.join(',')];
    
    quizReports.forEach(row => {
      let data = [
        row.student_id,
        `"${row.student_name.replace(/"/g, '""')}"`,
        `"${row.quiz_name.replace(/"/g, '""')}"`,
        `"${row.score}/${row.total_questions}"`,
        `${row.percentage}%`,
        row.time_taken,
        new Date(row.submitted_at).toLocaleString()
      ];
      csvRows.push(data.join(','));
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "quiz_submissions_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    const htmlContent = `
      <html>
      <head>
        <title>Quiz Analytics Report</title>
        <style>
          body { font-family: 'Inter', sans-serif; color: #334155; padding: 40px; }
          h1 { font-size: 24px; font-weight: bold; margin-bottom: 5px; color: #0f172a; }
          h2 { font-size: 16px; color: #64748b; font-weight: normal; margin-bottom: 30px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left; padding: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #475569; }
          td { border-bottom: 1px solid #f1f5f9; padding: 12px; font-size: 14px; color: #334155; }
          .summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 40px; }
          .card { padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; }
          .card-title { font-size: 12px; color: #64748b; margin-bottom: 5px; }
          .card-value { font-size: 20px; font-weight: bold; color: #0f172a; }
        </style>
      </head>
      <body>
        <h1>DeepLearn Smart Classroom</h1>
        <h2>Quiz Performance & Student Analytics Report — ${new Date().toLocaleDateString()}</h2>
        
        <div class="summary-cards">
          <div class="card">
            <div class="card-title">Class Average</div>
            <div class="card-value">${classAnalytics?.global?.global_average || 0}%</div>
          </div>
          <div class="card">
            <div class="card-title">Total Attempts</div>
            <div class="card-value">${classAnalytics?.global?.total_attempts || 0}</div>
          </div>
          <div class="card">
            <div class="card-title">Total Students</div>
            <div class="card-value">${classAnalytics?.global?.total_students || 0}</div>
          </div>
          <div class="card">
            <div class="card-title">Filter Applied</div>
            <div class="card-value">${quizFilter}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Student Name</th>
              <th>Quiz Name</th>
              <th>Score</th>
              <th>Percentage</th>
              <th>Time Taken</th>
              <th>Submitted At</th>
            </tr>
          </thead>
          <tbody>
            ${quizReports
              .filter(r => {
                const searchMatch = r.student_name.toLowerCase().includes(quizSearch.toLowerCase()) || 
                                    r.student_id.toString().includes(quizSearch);
                const quizMatch = quizFilter === 'All' || r.quiz_name === quizFilter;
                return searchMatch && quizMatch;
              })
              .map(r => `
                <tr>
                  <td>#${r.student_id}</td>
                  <td>${r.student_name}</td>
                  <td>${r.quiz_name}</td>
                  <td>${r.score}/${r.total_questions}</td>
                  <td>${r.percentage}%</td>
                  <td>${r.time_taken}s</td>
                  <td>${new Date(r.submitted_at).toLocaleString()}</td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  const [videos, setVideos] = useState([]);

  const fetchVideos = async () => {
    try {
      const res = await fetch(`${API_BASE}/videos?teacher_id=1`);
      if (res.ok) {
        const json = await res.json();
        setVideos(json.videos || []);
        console.log('[VIDEO_LIST_FETCHED] count=' + (json.videos?.length || 0));
      }
    } catch (err) {
      console.error('Failed to fetch videos:', err);
    }
  };

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
    fetchVideos();
    fetchQuizData();
    fetchProgressionData();

    // Auto-poll quiz reports for real-time reporting
    const interval = setInterval(fetchQuizData, 5000);

    return () => {
      clearTimeout(loadingTimer);
      clearInterval(interval);
    };
  }, []);

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6">
        <div className="w-12 h-12 border-4 border-[#00687a]/30 border-t-primary-500 rounded-full animate-spin shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-[#131b2e] mb-1">Please Wait</h3>
          <p className="text-[#6d797d] text-sm max-w-xs">{loadingText}</p>
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
    <div className="page-enter bg-nexus-background min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-nexus-on-background">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#131b2e] flex items-center gap-3">
            <Users className="w-8 h-8 text-[#00687a]" />
            Teacher Dashboard
          </h1>
          <p className="text-[#3d494c] mt-1 font-semibold">
            Overview of {data.total_students} students · {data.total_records} records
          </p>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-[#bcc9cd]/40 mb-8 gap-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-3 px-6 font-bold text-sm border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'overview'
              ? 'border-[#00687a] text-[#00687a]'
              : 'border-transparent text-[#3d494c] hover:text-[#00687a] hover:border-[#bcc9cd]/40'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Overview & Attention Monitoring
        </button>
        <button
          onClick={() => { setActiveTab('quizzes'); fetchQuizData(); }}
          className={`py-3 px-6 font-bold text-sm border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'quizzes'
              ? 'border-[#00687a] text-[#00687a]'
              : 'border-transparent text-[#3d494c] hover:text-[#00687a] hover:border-[#bcc9cd]/40'
          }`}
        >
          <Award className="w-4 h-4" />
          Quiz Analytics & Student Reports
        </button>
        <button
          onClick={() => { setActiveTab('progression'); fetchProgressionData(); }}
          className={`py-3 px-6 font-bold text-sm border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'progression'
              ? 'border-[#00687a] text-[#00687a]'
              : 'border-transparent text-[#3d494c] hover:text-[#00687a] hover:border-[#bcc9cd]/40'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Student Progression
        </button>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {[
              {
                label: 'Engagement',
                data: data.engagement_distribution,
                colors: { High: 'text-[#006a63]', Medium: 'text-[#00687a]', Low: 'text-[#ba1a1a]' },
              },
              {
                label: 'Behaviour',
                data: data.behaviour_distribution,
                colors: { Active: 'text-[#006a63]', Passive: 'text-[#00687a]', Distracted: 'text-[#ba1a1a]' },
              },
              {
                label: 'Difficulty',
                data: data.difficulty_distribution,
                colors: { Easy: 'text-[#006a63]', Medium: 'text-[#00687a]', Hard: 'text-[#ba1a1a]' },
              },
            ].map((card, idx) => (
              <div key={idx} className="p-5 rounded-[24px] glass-panel card-shadow border border-[#bcc9cd]/40 transition-all duration-300">
                <h3 className="text-xs font-bold text-[#6d797d] uppercase tracking-wider mb-3">
                  {card.label} Distribution
                </h3>
                <div className="space-y-2">
                  {Object.entries(card.data).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#3d494c]">{key}</span>
                      <span className={`text-sm font-bold ${card.colors[key] || 'text-[#131b2e]'}`}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Engagement Bar */}
            <div className="p-6 rounded-[24px] glass-panel card-shadow border border-[#bcc9cd]/40 transition-all duration-300">
              <h3 className="text-sm font-bold text-[#3d494c] mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#00687a]" />
                Engagement Distribution
              </h3>
              <BehaviourBarChart data={data.engagement_distribution} />
            </div>

            {/* Behaviour Pie */}
            <div className="p-6 rounded-[24px] glass-panel card-shadow border border-[#bcc9cd]/40 transition-all duration-300">
              <h3 className="text-sm font-bold text-[#3d494c] mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#006a63]" />
                Behaviour Breakdown
              </h3>
              <BehaviourPieChart data={data.behaviour_distribution} />
            </div>
          </div>

          {/* Behaviour Heatmap */}
          <div className="p-6 rounded-[24px] glass-panel mb-8 card-shadow border border-[#bcc9cd]/40 transition-all duration-300">
            <div className="flex items-center gap-2 mb-5">
              <Brain className="w-5 h-5 text-[#00687a]" />
              <h3 className="text-sm font-bold text-[#131b2e]">AI Behaviour Heatmap</h3>
              <span className="ml-2 text-xs text-[#3d494c] bg-[#eaedff] px-2.5 py-1 rounded-full font-bold">Live Activity Periods</span>
              <a
                href="/behaviour"
                className="btn-primary ml-auto text-xs px-3.5 py-2 rounded-xl font-bold cursor-pointer"
              >
                Open Monitor
              </a>
            </div>
            <BehaviourHeatmap studentSummaries={data.student_summaries || []} periods={12} />
          </div>

          {/* Live Student Status Grid */}
          <div className="p-6 rounded-[24px] glass-panel mb-8 card-shadow border border-[#bcc9cd]/40 transition-all duration-300">
            <div className="flex items-center gap-2 mb-5">
              <Eye className="w-5 h-5 text-[#006a63]" />
              <h3 className="text-sm font-bold text-[#131b2e]">Live Student Status</h3>
              <span className="ml-2 text-xs text-[#006a63] bg-[#9cf2e8]/30 border border-[#9cf2e8] px-2.5 py-1 rounded-full font-bold animate-pulse">● Live</span>
              <span className="ml-auto text-xs font-bold text-[#6d797d]">{data.student_summaries?.length || 0} students tracked</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {(data.student_summaries || []).slice(0, 24).map((student) => {
                const behaviour = student.latest_behaviour;
                const statusColor =
                  behaviour === 'Active' ? '#006a63' :
                  behaviour === 'Passive' ? '#00687a' :
                  '#ba1a1a';
                const avgScore = student.average_score;
                return (
                  <div
                    key={student.student_id}
                    className="p-3 rounded-xl bg-white/70 border border-[#bcc9cd]/40 hover:border-[#00687a] transition-all duration-200 hover:shadow-md cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-[#6d797d]">#{student.student_id}</span>
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
                    </div>
                    <div className="text-base font-bold text-[#131b2e] mb-1">{avgScore}%</div>
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
              <div key={idx} className={`p-5 rounded-2xl ${stat.bg} border border-[#bcc9cd]/40 shadow-lg flex items-center gap-4`}>
                <div className="p-2.5 rounded-xl bg-white shadow-sm">{stat.icon}</div>
                <div>
                  <p className="text-xs text-[#6d797d] mb-0.5">{stat.label}</p>
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Engagement Timeline */}
          <div className="p-6 rounded-[24px] glass-panel mb-8 card-shadow border border-[#bcc9cd]/40 transition-all duration-300">
            <h3 className="text-sm font-semibold text-[#6d797d] mb-4">Engagement Over Time</h3>
            <EngagementAreaChart data={data.engagement_timeline || []} />
          </div>

          {/* Student Table */}
          <div className="p-6 rounded-[24px] glass-panel card-shadow border border-[#bcc9cd]/40 transition-all duration-300">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
              <h3 className="text-sm font-semibold text-[#6d797d]">All Students</h3>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6d797d]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by ID..."
                    className="pl-9 pr-3 py-2 rounded-lg bg-white/60 border border-slate-300 text-sm text-[#131b2e]
                               placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 w-40"
                    id="teacher-search"
                  />
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-white/60 border border-slate-300 text-sm text-[#131b2e]
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
                    <th className="text-left py-3 px-3 text-xs font-medium text-[#3d494c] uppercase tracking-wider">Student</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-[#3d494c] uppercase tracking-wider">Score</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-[#3d494c] uppercase tracking-wider">Engagement</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-[#3d494c] uppercase tracking-wider">Behaviour</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-[#3d494c] uppercase tracking-wider">Difficulty</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-[#3d494c] uppercase tracking-wider">Completion</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-[#3d494c] uppercase tracking-wider">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student, idx) => (
                    <tr 
                      key={idx} 
                      className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer"
                      onClick={() => { setSelectedStudent(student.student_id); fetchStudentReport(student.student_id); }}
                    >
                      <td className="py-3 px-3 font-medium text-[#131b2e]">#{student.student_id}</td>
                      <td className="py-3 px-3 text-[#6d797d]">{student.average_score}%</td>
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
                      <td className="py-3 px-3 text-[#6d797d]">{(student.completion_rate * 100).toFixed(0)}%</td>
                      <td className="py-3 px-3">{getTrendIcon(student.latest_engagement)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeTab === 'quizzes' ? (
        <div className="space-y-8 animate-fade-in">
          {/* Header Actions */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/40 p-4 rounded-2xl border border-slate-200/50">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-[#6d797d]">Filters:</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6d797d]" />
                <input
                  type="text"
                  value={quizSearch}
                  onChange={(e) => setQuizSearch(e.target.value)}
                  placeholder="Search student..."
                  className="pl-9 pr-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-[#131b2e] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 w-44"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#6d797d]" />
                <select
                  value={quizFilter}
                  onChange={(e) => setQuizFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-[#131b2e] focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                >
                  <option value="All">All Quizzes</option>
                  {classAnalytics?.quizzes?.map(q => (
                    <option key={q.quiz_id} value={q.quiz_name}>{q.quiz_name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={fetchQuizData}
                disabled={refreshing}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-[#3d494c] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all animate-none"
                title="Refresh Real-time Data"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={handleExportCSV}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel (CSV)
              </button>
              <button
                onClick={handleExportPDF}
                className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <FileText className="w-3.5 h-3.5" />
                PDF Report
              </button>
            </div>
          </div>

          {/* KPI Analytics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[
              {
                label: 'Class Average',
                value: `${classAnalytics?.global?.global_average || 0}%`,
                desc: 'Across all quizzes taken',
                icon: <Award className="w-5 h-5 text-indigo-500" />,
                bg: 'bg-indigo-50',
                border: 'border-indigo-100'
              },
              {
                label: 'Highest Score',
                value: `${classAnalytics?.quizzes?.length > 0 ? Math.max(...classAnalytics.quizzes.map(q => q.highest_score || 0)) : 0}%`,
                desc: 'Highest individual attempt',
                icon: <Trophy className="w-5 h-5 text-amber-500" />,
                bg: 'bg-amber-50',
                border: 'border-amber-100'
              },
              {
                label: 'Pass Rate',
                value: (() => {
                  if (!classAnalytics?.quizzes || classAnalytics.quizzes.length === 0) return '0%';
                  const totalPass = classAnalytics.quizzes.reduce((acc, q) => acc + (q.pass_count || 0), 0);
                  const totalFail = classAnalytics.quizzes.reduce((acc, q) => acc + (q.fail_count || 0), 0);
                  const total = totalPass + totalFail;
                  return total > 0 ? `${Math.round(totalPass / total * 100)}%` : '0%';
                })(),
                desc: 'Pass score threshold: >= 50%',
                icon: <CheckCircle className="w-5 h-5 text-emerald-500" />,
                bg: 'bg-emerald-50',
                border: 'border-emerald-100'
              },
              {
                label: 'Participation Rate',
                value: `${classAnalytics?.quizzes?.length > 0 ? Math.round(classAnalytics.quizzes.reduce((acc, q) => acc + (q.participation_rate || 0), 0) / classAnalytics.quizzes.length) : 0}%`,
                desc: 'Enrolled students taking quizzes',
                icon: <Activity className="w-5 h-5 text-cyan-500" />,
                bg: 'bg-cyan-50',
                border: 'border-cyan-100'
              }
            ].map((stat, idx) => (
              <div key={idx} className={`p-5 rounded-2xl ${stat.bg} border ${stat.border} shadow-sm flex items-center gap-4`}>
                <div className="p-3 rounded-xl bg-white shadow-sm shrink-0">{stat.icon}</div>
                <div>
                  <p className="text-xs text-[#6d797d] mb-0.5">{stat.label}</p>
                  <p className="text-2xl font-bold text-[#131b2e]">{stat.value}</p>
                  <p className="text-[10px] text-[#6d797d]">{stat.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Leaderboard */}
            <div className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 shadow-sm border border-[#bcc9cd]/40 lg:col-span-1">
              <h3 className="text-sm font-semibold text-[#131b2e] mb-4 flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-500" />
                Student Leaderboard
              </h3>
              <div className="overflow-y-auto max-h-[350px] pr-2 space-y-3">
                {!classAnalytics?.leaderboard || classAnalytics.leaderboard.length === 0 ? (
                  <p className="text-xs text-[#6d797d] py-4 text-center">No quiz submissions yet.</p>
                ) : (
                  classAnalytics.leaderboard.map((student, idx) => (
                    <div 
                      key={student.student_id} 
                      onClick={() => { setSelectedStudent(student.student_id); fetchStudentReport(student.student_id); }}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#faf8ff]/40 border border-[#bcc9cd]/25 hover:border-primary-400 hover:bg-white/80 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                          idx === 0 ? 'bg-amber-100 text-amber-700' :
                          idx === 1 ? 'bg-slate-200 text-[#131b2e]' :
                          idx === 2 ? 'bg-orange-100 text-orange-700' :
                          'bg-slate-100 text-[#3d494c]'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-[#131b2e]">{student.student_name}</p>
                          <p className="text-[10px] text-[#6d797d]">ID: #{student.student_id} · {student.quizzes_taken} taken</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-primary-600">{student.average_percentage}%</p>
                        <p className="text-[9px] text-[#6d797d]">Max: {student.highest_percentage}%</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Most Missed Questions */}
            <div className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 shadow-sm border border-[#bcc9cd]/40 lg:col-span-2">
              <h3 className="text-sm font-semibold text-[#131b2e] mb-4 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Concept Miss Rates (Question-wise Performance)
              </h3>
              <div className="overflow-y-auto max-h-[350px] pr-2 space-y-3">
                {!classAnalytics?.most_missed || classAnalytics.most_missed.length === 0 ? (
                  <p className="text-xs text-[#6d797d] py-4 text-center">All questions answered correctly so far!</p>
                ) : (
                  classAnalytics.most_missed.slice(0, 5).map((q) => (
                    <div key={q.question_id} className="p-4 rounded-xl bg-[#faf8ff]/40 border border-[#bcc9cd]/25 shadow-sm">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <p className="text-[10px] font-bold text-primary-500 uppercase tracking-wide">{q.quiz_name}</p>
                        <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{q.miss_rate}% Miss Rate</span>
                      </div>
                      <p className="text-xs font-semibold text-[#131b2e] mb-2">{q.question_text}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-emerald-600 shrink-0">Correct: {q.correct_count}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-red-500 h-full rounded-full" style={{ width: `${q.miss_rate}%` }} />
                        </div>
                        <span className="text-[10px] text-red-500 shrink-0">Incorrect: {q.incorrect_count}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Submissions Log Table */}
          <div className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 shadow-sm border border-[#bcc9cd]/40">
            <h3 className="text-sm font-semibold text-[#131b2e] mb-4">Quiz Submission Log</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-[#131b2e]">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="py-3 px-3 text-xs font-semibold text-[#6d797d] uppercase">Student</th>
                    <th className="py-3 px-3 text-xs font-semibold text-[#6d797d] uppercase">Quiz Title</th>
                    <th className="py-3 px-3 text-xs font-semibold text-[#6d797d] uppercase">Score</th>
                    <th className="py-3 px-3 text-xs font-semibold text-[#6d797d] uppercase">Percentage</th>
                    <th className="py-3 px-3 text-xs font-semibold text-[#6d797d] uppercase">Time Taken</th>
                    <th className="py-3 px-3 text-xs font-semibold text-[#6d797d] uppercase">Submitted At</th>
                  </tr>
                </thead>
                <tbody>
                  {quizReports.filter(r => {
                    const searchMatch = r.student_name.toLowerCase().includes(quizSearch.toLowerCase()) || 
                                        r.student_id.toString().includes(quizSearch);
                    const quizMatch = quizFilter === 'All' || r.quiz_name === quizFilter;
                    return searchMatch && quizMatch;
                  }).length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-6 text-center text-[#6d797d] text-xs">No records matching filters found.</td>
                    </tr>
                  ) : (
                    quizReports.filter(r => {
                      const searchMatch = r.student_name.toLowerCase().includes(quizSearch.toLowerCase()) || 
                                          r.student_id.toString().includes(quizSearch);
                      const quizMatch = quizFilter === 'All' || r.quiz_name === quizFilter;
                      return searchMatch && quizMatch;
                    }).map((r) => (
                      <tr 
                        key={r.attempt_id} 
                        className="border-b border-[#bcc9cd]/25 hover:bg-slate-50/50 cursor-pointer transition-colors"
                        onClick={() => { setSelectedStudent(r.student_id); fetchStudentReport(r.student_id); }}
                      >
                        <td className="py-3 px-3">
                          <p className="font-semibold text-[#131b2e]">{r.student_name}</p>
                          <p className="text-[10px] text-[#6d797d]">ID: #{r.student_id}</p>
                        </td>
                        <td className="py-3 px-3 text-[#131b2e] font-medium">{r.quiz_name}</td>
                        <td className="py-3 px-3 text-[#3d494c]">{r.score}/{r.total_questions}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${r.percentage >= 50 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                            {r.percentage}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[#6d797d]">{r.time_taken}s</td>
                        <td className="py-3 px-3 text-[#6d797d]">{new Date(r.submitted_at).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          {/* Progression Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/40 p-4 rounded-2xl border border-slate-200/50">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-[#6d797d]">Search student:</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6d797d]" />
                <input
                  type="text"
                  value={progressionSearch}
                  onChange={(e) => setProgressionSearch(e.target.value)}
                  placeholder="Search student ID, name or email..."
                  className="pl-9 pr-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-[#131b2e] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 w-64"
                />
              </div>
            </div>
            
            <div>
              <button
                onClick={fetchProgressionData}
                disabled={loadingProgression}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingProgression ? 'animate-spin' : ''}`} />
                Refresh Progression
              </button>
            </div>
          </div>

          {/* Progression Filters Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-white/40 rounded-2xl border border-slate-200/50">
            <div>
              <label className="block text-[10px] font-bold text-[#6d797d] uppercase tracking-wider mb-1">School Name</label>
              <select
                value={progressionSchoolFilter}
                onChange={(e) => setProgressionSchoolFilter(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-[#131b2e] focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              >
                {['All', ...new Set(studentProgressList.map(s => s.schoolName).filter(Boolean))].map(sch => (
                  <option key={sch} value={sch}>{sch}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-[10px] font-bold text-[#6d797d] uppercase tracking-wider mb-1">Grade / Class</label>
              <select
                value={progressionGradeFilter}
                onChange={(e) => setProgressionGradeFilter(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-[#131b2e] focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              >
                {['All', ...new Set(studentProgressList.map(s => s.grade).filter(Boolean))].map(gr => (
                  <option key={gr} value={gr}>{gr}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#6d797d] uppercase tracking-wider mb-1">Age Group</label>
              <select
                value={progressionAgeFilter}
                onChange={(e) => setProgressionAgeFilter(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-[#131b2e] focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              >
                <option value="All">All Age Groups</option>
                <option value="Under 10">Under 10</option>
                <option value="10-15">10 to 15</option>
                <option value="Over 15">Over 15</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#6d797d] uppercase tracking-wider mb-1">Progress Status</label>
              <select
                value={progressionStatusFilter}
                onChange={(e) => setProgressionStatusFilter(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-[#131b2e] focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              >
                <option value="All">All Progress Statuses</option>
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#6d797d] uppercase tracking-wider mb-1">Quiz Performance</label>
              <select
                value={progressionPerformanceFilter}
                onChange={(e) => setProgressionPerformanceFilter(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-[#131b2e] focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              >
                <option value="All">All Performance Levels</option>
                <option value="High">High (&gt;= 75%)</option>
                <option value="Medium">Medium (45-75%)</option>
                <option value="Low">Low (&lt; 45%)</option>
              </select>
            </div>
          </div>

          {/* Student Progress Detail List */}
          {loadingProgression && studentProgressList.length === 0 ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00687a]"></div>
            </div>
          ) : studentProgressList.length === 0 ? (
            <div className="text-center py-16 dark-glass-panel card-shadow border border-[#bcc9cd]/40 rounded-3xl border border-slate-200">
              <p className="text-[#6d797d] text-sm">No progression metrics available.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {studentProgressList
                .filter(s => {
                  // 1. Search term
                  const term = progressionSearch.toLowerCase();
                  const matchesSearch = s.name.toLowerCase().includes(term) || 
                                        s.email.toLowerCase().includes(term) || 
                                        s.student_id.toString().includes(term);
                                        
                  if (!matchesSearch) return false;

                  // 2. School Filter
                  if (progressionSchoolFilter !== 'All' && s.schoolName !== progressionSchoolFilter) return false;

                  // 3. Grade Filter
                  if (progressionGradeFilter !== 'All' && s.grade !== progressionGradeFilter) return false;

                  // 4. Age Group Filter
                  if (progressionAgeFilter !== 'All') {
                    const age = s.age;
                    if (!age) return false;
                    if (progressionAgeFilter === 'Under 10' && age >= 10) return false;
                    if (progressionAgeFilter === '10-15' && (age < 10 || age > 15)) return false;
                    if (progressionAgeFilter === 'Over 15' && age <= 15) return false;
                  }

                  // 5. Progress Status Filter
                  if (progressionStatusFilter !== 'All') {
                    const pct = s.progress_percentage;
                    if (progressionStatusFilter === 'Not Started' && pct > 0) return false;
                    if (progressionStatusFilter === 'In Progress' && (pct === 0 || pct === 100)) return false;
                    if (progressionStatusFilter === 'Completed' && pct < 100) return false;
                  }

                  // 6. Quiz Performance Filter
                  if (progressionPerformanceFilter !== 'All') {
                    const attempts = s.lessons?.filter(l => l.attempts > 0);
                    if (!attempts || attempts.length === 0) {
                      if (progressionPerformanceFilter !== 'Low') return false;
                    } else {
                      const avg = attempts.reduce((acc, curr) => acc + curr.quiz_score, 0) / attempts.length;
                      let perf = 'Low';
                      if (avg >= 75) perf = 'High';
                      else if (avg >= 45) perf = 'Medium';
                      
                      if (progressionPerformanceFilter !== perf) return false;
                    }
                  }

                  return true;
                })
                .map(student => (
                  <div key={student.student_id} className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 border border-[#bcc9cd]/40 shadow-lg hover:shadow-xl transition-all duration-300">
                    {/* Student Info & Overall Progress */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#bcc9cd]/25 pb-4 mb-4">
                      <div>
                        <h4 className="font-bold text-[#131b2e] text-base flex items-center gap-2">
                          {student.name}
                          <span className="text-[10px] font-normal bg-slate-100 px-2 py-0.5 rounded-full text-[#6d797d]">
                            {student.learningLevel || 'Beginner'}
                          </span>
                        </h4>
                        <p className="text-xs text-[#6d797d]">ID: #{student.student_id} · {student.email}</p>
                      </div>
                      
                      <div className="flex items-center gap-3 w-full md:w-1/2">
                        <span className="text-xs text-[#6d797d] font-semibold shrink-0">Progress:</span>
                        <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div 
                            className="h-full bg-gradient-to-r from-emerald-500 to-primary-500 transition-all duration-500" 
                            style={{ width: `${student.progress_percentage}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-emerald-600 shrink-0">{student.progress_percentage}%</span>
                      </div>
                    </div>

                    {/* Meta Profile Toggle Button */}
                    <div className="mb-4">
                      <button
                        onClick={() => setExpandedStudentId(expandedStudentId === student.student_id ? null : student.student_id)}
                        className="text-xs font-semibold text-primary-600 hover:text-primary-700 underline"
                      >
                        {expandedStudentId === student.student_id ? 'Hide Profile Details' : 'View Student Details & Parent Info'}
                      </button>

                      {expandedStudentId === student.student_id && (
                        <div className="mt-4 p-4 rounded-xl bg-white/50 border border-[#bcc9cd]/25 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-[#131b2e]">
                          {/* Column 1: Personal & Location */}
                          <div className="space-y-1.5">
                            <span className="font-bold text-[#6d797d] block uppercase tracking-wider text-[10px]">Personal & Location</span>
                            <p><span className="text-[#6d797d] font-medium">Age/Gender:</span> {student.age || '—'} · {student.gender || '—'}</p>
                            <p><span className="text-[#6d797d] font-medium">Date of Birth:</span> {student.dob || '—'}</p>
                            <p><span className="text-[#6d797d] font-medium">Location:</span> {student.city ? `${student.city}, ` : ''}{student.state ? `${student.state}, ` : ''}{student.country || '—'}</p>
                            <p><span className="text-[#6d797d] font-medium">Disability:</span> {student.disability_type || '—'}</p>
                          </div>
                          {/* Column 2: Academic & Attendance */}
                          <div className="space-y-1.5">
                            <span className="font-bold text-[#6d797d] block uppercase tracking-wider text-[10px]">Academic & Attendance</span>
                            <p><span className="text-[#6d797d] font-medium">School Name:</span> {student.schoolName || '—'}</p>
                            <p><span className="text-[#6d797d] font-medium">Grade/Class:</span> {student.grade || '—'} · Sec: {student.section || '—'}</p>
                            <p><span className="text-[#6d797d] font-medium">Roll Number:</span> {student.rollNumber || '—'} · Year: {student.academicYear || '—'}</p>
                            <p>
                              <span className="text-[#6d797d] font-medium">Attendance:</span>{' '}
                              <span className={`font-bold ${
                                student.attendanceRate >= 90 ? 'text-emerald-600' :
                                student.attendanceRate >= 75 ? 'text-amber-600' : 'text-red-500'
                              }`}>
                                {student.attendanceRate}%
                              </span>
                            </p>
                          </div>
                          {/* Column 3: Parent & Emergency */}
                          <div className="space-y-1.5">
                            <span className="font-bold text-[#6d797d] block uppercase tracking-wider text-[10px]">Parent & Guardian Details</span>
                            <p><span className="text-[#6d797d] font-medium">Guardian Name:</span> {student.parentName || '—'}</p>
                            <p><span className="text-[#6d797d] font-medium">Parent Phone:</span> {student.parentPhone || '—'}</p>
                            <p><span className="text-[#6d797d] font-medium">Parent Email:</span> {student.parentEmail || '—'}</p>
                            <p><span className="text-[#6d797d] font-medium">Emergency Phone:</span> {student.emergencyContact || '—'}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Lesson Sequence Locked/Unlocked Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {student.lessons && student.lessons.map((les, index) => {
                        return (
                          <div key={les.lesson_id} className="p-4 rounded-xl bg-[#faf8ff]/40 border border-[#bcc9cd]/25 shadow-xs flex flex-col justify-between">
                            <div>
                              <div className="flex justify-between items-start mb-2">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  les.type === 'video' ? 'bg-purple-50 text-purple-600' : 'bg-emerald-50 text-emerald-600'
                                }`}>
                                  {les.type}
                                </span>
                                
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  les.is_locked ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                                }`}>
                                  {les.is_locked ? 'LOCKED' : 'UNLOCKED'}
                                </span>
                              </div>
                              
                              <h5 className="text-xs font-bold text-[#131b2e] mb-2 truncate" title={les.title}>
                                {les.title}
                              </h5>
                              
                              <div className="space-y-1 text-[11px] text-[#6d797d]">
                                <div className="flex justify-between">
                                  <span>Attempts:</span>
                                  <span className="font-semibold text-[#131b2e]">{les.attempts || 0}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Highest Score:</span>
                                  <span className="font-semibold text-[#131b2e]">
                                    {les.attempts > 0 ? `${les.quiz_score}%` : '—'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Status:</span>
                                  <span className={`font-semibold ${
                                    les.passed ? 'text-emerald-600' : les.attempts > 0 ? 'text-red-500' : 'text-[#6d797d]'
                                  }`}>
                                    {les.passed ? 'Passed' : les.attempts > 0 ? 'Failed' : 'Not Attempted'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Manual Unlock Button */}
                            {les.is_locked && (
                              <button
                                onClick={() => handleManualUnlock(student.student_id, les.lesson_id)}
                                className="mt-3 w-full py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[10px] font-bold transition-all border border-indigo-200"
                              >
                                Manual Unlock
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Video Upload & Processing Queue */}
      <div className="mt-8 p-6 rounded-[24px] glass-panel mb-8 card-shadow border border-[#bcc9cd]/40 transition-all duration-300">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-[#131b2e] flex items-center gap-2">
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

        {videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center bg-surface-800/30 rounded-xl border border-white/5 shadow-lg hover:shadow-xl hover:border-cyan-400 transition-all duration-300">
            <p className="text-[#3d494c] text-sm">No videos currently in processing queue.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map(video => (
              <div key={video.video_id} className="glass-panel card-shadow border border-[#bcc9cd]/40 rounded-2xl overflow-hidden shadow-lg border border-[#bcc9cd]/40 p-5 flex flex-col justify-between hover:border-primary-400 transition-all duration-200">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-bold text-[#131b2e] text-sm truncate max-w-[180px]" title={video.title}>
                      {video.title}
                    </h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                      video.status === 'done' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                      video.status === 'error' ? 'bg-red-500/10 text-red-600 border border-red-500/20' :
                      'bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse'
                    }`}>
                      {video.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#6d797d] truncate mb-1">File: {video.filename}</p>
                  <p className="text-[10px] text-[#6d797d] mb-1">Uploaded: {new Date(video.uploaded_at).toLocaleString()}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-[#bcc9cd]/25 flex items-center justify-between">
                  {video.status === 'done' ? (
                    <>
                      <a 
                        href={`/classroom?video_id=${video.video_id}&filename=${encodeURIComponent(video.filename)}`} 
                        className="text-xs font-semibold text-primary-600 hover:text-primary-700"
                      >
                        Watch Video
                      </a>
                      {video.r2_url && (
                        <a 
                          href={video.r2_url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-xs font-semibold text-[#6d797d] hover:text-[#131b2e]"
                        >
                          View R2 URL
                        </a>
                      )}
                    </>
                  ) : (
                    <span className="text-[10px] text-[#6d797d]">Processing pipeline running...</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Student Report Modal */}
      {selectedStudent && studentReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-3xl bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 relative max-h-[85vh] overflow-y-auto">
            <button 
              onClick={() => { setSelectedStudent(null); setStudentReport(null); }} 
              className="absolute top-4 right-4 text-[#6d797d] hover:text-[#3d494c] text-lg font-bold"
            >
              ✕
            </button>
            
            {/* Student Profile Header */}
            <div className="flex items-center gap-4 border-b border-[#bcc9cd]/25 pb-4 mb-5">
              {studentReport.student.profilePhoto ? (
                <img
                  src={studentReport.student.profilePhoto}
                  alt="Profile"
                  className="w-14 h-14 rounded-full object-cover shadow-sm"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-lg">
                  {studentReport.student.name?.charAt(0) || 'S'}
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold text-[#131b2e]">{studentReport.student.name}</h2>
                <p className="text-sm text-[#6d797d]">
                  Student ID: #{studentReport.student.student_id} · {studentReport.student.email}
                </p>
                <div className="flex gap-2 mt-1.5">
                  <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-[#3d494c] font-medium">
                    Level: {studentReport.student.learningLevel || 'Beginner'}
                  </span>
                  {studentReport.student.disability_type && (
                    <span className="text-[10px] bg-purple-50 px-2 py-0.5 rounded text-purple-600 font-medium">
                      Disability: {studentReport.student.disability_type}
                    </span>
                  )}
                  {studentReport.student.preferred_language && (
                    <span className="text-[10px] bg-emerald-50 px-2 py-0.5 rounded text-emerald-600 font-medium">
                      Lang: {studentReport.student.preferred_language}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Tabs Selector */}
            <div className="flex border-b border-[#bcc9cd]/25 mb-6 gap-3 text-xs">
              <button
                onClick={() => setModalTab('performance')}
                className={`pb-2 font-bold transition-all border-b-2 ${
                  modalTab === 'performance' ? 'border-[#00687a] text-[#00687a]' : 'border-transparent text-[#6d797d] hover:text-[#3d494c]'
                }`}
              >
                Performance Summary
              </button>
              <button
                onClick={() => setModalTab('profile')}
                className={`pb-2 font-bold transition-all border-b-2 ${
                  modalTab === 'profile' ? 'border-[#00687a] text-[#00687a]' : 'border-transparent text-[#6d797d] hover:text-[#3d494c]'
                }`}
              >
                Detailed Information Profile
              </button>
            </div>

            {modalTab === 'performance' ? (
              <>
                {/* Metrics Summary */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="p-4 rounded-xl bg-slate-50 border border-[#bcc9cd]/25 text-center">
                    <p className="text-xs text-[#6d797d] mb-0.5">Total Quizzes</p>
                    <p className="text-lg font-bold text-[#131b2e]">{studentReport.summary.total_attempts}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-[#bcc9cd]/25 text-center">
                    <p className="text-xs text-[#6d797d] mb-0.5">Average Score</p>
                    <p className="text-lg font-bold text-primary-600">{studentReport.summary.avg_percentage}%</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-[#bcc9cd]/25 text-center">
                    <p className="text-xs text-[#6d797d] mb-0.5">Highest Score</p>
                    <p className="text-lg font-bold text-emerald-600">{studentReport.summary.max_percentage}%</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-[#bcc9cd]/25 text-center">
                    <p className="text-xs text-[#6d797d] mb-0.5">Lowest Score</p>
                    <p className="text-lg font-bold text-red-500">{studentReport.summary.min_percentage}%</p>
                  </div>
                </div>

                {/* Quiz Attempt History */}
                <h3 className="text-sm font-semibold text-[#131b2e] mb-3">Attempt History Log</h3>
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-[#bcc9cd]/25">
                      <th className="py-2 text-[#6d797d] font-medium">Quiz Name</th>
                      <th className="py-2 text-[#6d797d] font-medium">Score</th>
                      <th className="py-2 text-[#6d797d] font-medium">Percentage</th>
                      <th className="py-2 text-[#6d797d] font-medium">Time Taken</th>
                      <th className="py-2 text-[#6d797d] font-medium">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentReport.attempts.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="py-4 text-center text-[#6d797d] text-xs">No attempts recorded.</td>
                      </tr>
                    ) : (
                      studentReport.attempts.map(att => (
                        <tr key={att.attempt_id} className="border-b border-slate-50">
                          <td className="py-2 font-medium text-[#131b2e]">{att.quiz_name}</td>
                          <td className="py-2 text-[#131b2e]">{att.score}/{att.total_questions}</td>
                          <td className="py-2 font-bold" style={{ color: att.percentage >= 50 ? '#10b981' : '#ef4444' }}>
                            {att.percentage}%
                          </td>
                          <td className="py-2 text-[#6d797d]">{att.time_taken}s</td>
                          <td className="py-2 text-[#6d797d]">{new Date(att.submitted_at).toLocaleDateString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-[#131b2e] border border-[#bcc9cd]/25 p-5 rounded-2xl bg-slate-50/50">
                <div className="space-y-3">
                  <div>
                    <span className="font-bold text-[#6d797d] block uppercase tracking-wider text-[9px] mb-1">Personal Information</span>
                    <p><span className="text-[#6d797d] font-semibold">Age / Gender:</span> {studentReport.student.age || '—'} · {studentReport.student.gender || '—'}</p>
                    <p><span className="text-[#6d797d] font-semibold">Date of Birth:</span> {studentReport.student.dob || '—'}</p>
                    <p><span className="text-[#6d797d] font-semibold">Phone:</span> {studentReport.student.phone || '—'}</p>
                    <p><span className="text-[#6d797d] font-semibold">Location:</span> {studentReport.student.city ? `${studentReport.student.city}, ` : ''}{studentReport.student.state ? `${studentReport.student.state}, ` : ''}{studentReport.student.country || '—'}</p>
                  </div>

                  <div>
                    <span className="font-bold text-[#6d797d] block uppercase tracking-wider text-[9px] mb-1">Academic & Attendance</span>
                    <p><span className="text-[#6d797d] font-semibold">School Name:</span> {studentReport.student.schoolName || '—'}</p>
                    <p><span className="text-[#6d797d] font-semibold">Grade / Section:</span> {studentReport.student.grade || '—'} / {studentReport.student.section || '—'}</p>
                    <p><span className="text-[#6d797d] font-semibold">Roll Number:</span> {studentReport.student.rollNumber || '—'}</p>
                    <p><span className="text-[#6d797d] font-semibold">Academic Year:</span> {studentReport.student.academicYear || '—'}</p>
                    <p>
                      <span className="text-[#6d797d] font-semibold">Attendance Rate:</span>{' '}
                      <span className={`font-bold ${
                        (studentReport.student.attendanceRate || 100) >= 90 ? 'text-emerald-600' :
                        (studentReport.student.attendanceRate || 100) >= 75 ? 'text-amber-600' : 'text-red-500'
                      }`}>
                        {studentReport.student.attendanceRate || 100}%
                      </span>
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="font-bold text-[#6d797d] block uppercase tracking-wider text-[9px] mb-1">Parent / Guardian Information</span>
                    <p><span className="text-[#6d797d] font-semibold">Guardian Name:</span> {studentReport.student.parentName || '—'}</p>
                    <p><span className="text-[#6d797d] font-semibold">Parent Phone:</span> {studentReport.student.parentPhone || '—'}</p>
                    <p><span className="text-[#6d797d] font-semibold">Parent Email:</span> {studentReport.student.parentEmail || '—'}</p>
                    <p><span className="text-[#6d797d] font-semibold">Emergency Phone:</span> {studentReport.student.emergencyContact || '—'}</p>
                  </div>

                  <div>
                    <span className="font-bold text-[#6d797d] block uppercase tracking-wider text-[9px] mb-1">Learning Metrics Summary</span>
                    <p><span className="text-[#6d797d] font-semibold">Enrolled Courses:</span> Smart Virtual Classroom Basics</p>
                    <p><span className="text-[#6d797d] font-semibold">Completed Courses:</span> {studentReport.student.attendanceRate >= 100 ? 'Smart Virtual Classroom Basics' : 'None'}</p>
                    <p><span className="text-[#6d797d] font-semibold">Quiz Average:</span> {studentReport.summary.avg_percentage}%</p>
                    <p><span className="text-[#6d797d] font-semibold">Certificates:</span> {studentReport.student.attendanceRate >= 100 ? 'Smart Classroom Completion Certificate' : 'None'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

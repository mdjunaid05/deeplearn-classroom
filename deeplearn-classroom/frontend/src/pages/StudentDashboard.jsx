import React, { useState, useEffect, useCallback } from 'react';
import {
  GraduationCap, TrendingUp, Target, BookOpen, Zap,
  ChevronDown, RefreshCw, Award, Video, Play, Lock, Users, Brain
} from 'lucide-react';
import { EngagementLineChart, EngagementGauge } from '../components/EngagementChart';
import ProgressBar from '../components/ProgressBar';
import LiveBehaviourTracker from '../components/LiveBehaviourTracker';
import AIRecommendations from '../components/AIRecommendations';

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
  const [loadingText, setLoadingText] = useState('Loading student data...');
  const [liveMetrics, setLiveMetrics] = useState(null);

  const handleLiveMetrics = useCallback((m) => setLiveMetrics(m), []);
  const [error, setError] = useState(null);
  const [recordings, setRecordings] = useState([]);

  const fetchData = async (id) => {
    setLoading(true);
    setError(null);
    const loadingTimer = setTimeout(() => {
      setLoadingText('Server is waking up (this may take up to 50s on free tiers)...');
    }, 5000);

    try {
      const res = await fetch(`${API_BASE}/student-dashboard?student_id=${id}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        throw new Error('Failed to fetch data');
      }
    } catch (err) {
      setData(EMPTY_DATA);
    } finally {
      clearTimeout(loadingTimer);
      setLoading(false);
    }
  };

  const [videos, setVideos] = useState([]);

  const fetchVideos = async () => {
    try {
      const res = await fetch(`${API_BASE}/videos`);
      if (res.ok) {
        const json = await res.json();
        setVideos(json.videos || []);
        console.log('[VIDEO_LIST_FETCHED] count=' + (json.videos?.length || 0));
      }
    } catch (err) {
      console.error('Failed to fetch videos:', err);
    }
  };

  const fetchRecordings = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/recordings?student_id=${id}`);
      if (res.ok) {
        const json = await res.json();
        setRecordings(json.recordings || []);
      }
    } catch (err) {
      console.error('Failed to fetch recordings:', err);
    }
  };

  useEffect(() => {
    fetchData(studentId);
    fetchRecordings(studentId);
    fetchVideos();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchData(studentId);
    fetchRecordings(studentId);
    fetchVideos();
  };

  if (loading) {
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

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  const engagementScore = liveMetrics?.engagementScore ?? (data?.average_score ?? 0);
  const focusScore = liveMetrics?.focusScore ?? Math.round((data?.average_score ?? 0) * 0.9);
  const currentBehaviour = liveMetrics?.behaviour ?? (data?.current_behaviour || 'Passive');
  const difficultyBadge = `badge-${(data?.current_difficulty || 'none').toLowerCase()}`;
  const engagementBadge = `badge-${(data?.current_engagement || 'none').toLowerCase()}`;
  const behaviourBadge  = `badge-${(data?.current_behaviour || 'none').toLowerCase()}`;

  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* AI Behaviour Monitoring Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <LiveBehaviourTracker onMetricsUpdate={handleLiveMetrics} studentId={studentId} />
        <AIRecommendations
          behaviour={currentBehaviour}
          engagementScore={engagementScore}
          focusScore={focusScore}
        />
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-800 flex items-center gap-3">
            <GraduationCap className="w-8 h-8 text-primary-400" />
            Student Dashboard
          </h1>
          <p className="text-slate-600 mt-1">Track your learning progress and engagement</p>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="number"
            value={studentId}
            onChange={(e) => setStudentId(Number(e.target.value))}
            className="w-32 px-3 py-2 rounded-lg bg-white/60 border border-slate-300 text-slate-800 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            placeholder="Student ID"
            id="student-id-input"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-primary-600 text-true-white text-sm font-medium
  hover:bg-primary-500 transition-colors disabled:opacity-50 hover:shadow-[0_0_15px_rgba(34,211,238,0.4)] transition-all duration-300"
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
          <div key={idx} className="p-5 rounded-2xl glass card-hover shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-600">{card.label}</span>
              <card.icon className={`w-5 h-5 ${card.iconColor}`} />
            </div>
            {card.badge ? (
              <span className={`badge ${card.badge} text-base`}>{card.value}</span>
            ) : (
              <p className="text-2xl font-display font-bold text-slate-800">{card.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Engagement Gauge */}
        <div className="p-6 rounded-2xl glass shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
          <h3 className="text-sm font-semibold text-slate-500 mb-4">Engagement Score</h3>
          <EngagementGauge score={engagementScore} label="Overall" />
        </div>

        {/* Quiz Performance */}
        <div className="lg:col-span-2 p-6 rounded-2xl glass shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
          <h3 className="text-sm font-semibold text-slate-500 mb-4">Quiz Performance Trend</h3>
          <EngagementLineChart data={data.performance_history || []} />
        </div>
      </div>

      {/* Recommendation + Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recommendation */}
        <div className="p-6 rounded-2xl glass shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
          <h3 className="text-sm font-semibold text-slate-500 mb-4 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary-400" />
            Recommended Next Activity
          </h3>
          <div className="p-4 rounded-xl bg-primary-600/10 border border-primary-500/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-slate-700">Suggested Difficulty:</span>
              <span className={`badge badge-${(data.recommendation?.suggested_difficulty || 'medium').toLowerCase()}`}>
                {data.recommendation?.suggested_difficulty}
              </span>
            </div>
            <p className="text-sm text-slate-500">{data.recommendation?.reason}</p>
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
        <div className="p-6 rounded-2xl glass shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
          <h3 className="text-sm font-semibold text-slate-500 mb-4">Recent Engagement</h3>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {(data.engagement_history || []).slice(-8).reverse().map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg glass-light shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    item.engagement_label === 'High' ? 'bg-emerald-400' :
                    item.engagement_label === 'Low' ? 'bg-red-400' : 'bg-amber-400'
                  }`} />
                  <span className="text-sm text-slate-500">Activity #{item.activity_id}</span>
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
      <div className="mt-8 p-6 rounded-2xl glass shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-cyan-400 transition-all duration-300">
        <h2 className="text-lg font-semibold text-slate-800 mb-6 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-emerald-400" aria-hidden="true" />
          Classroom Video Catalog
        </h2>

        <div className="mb-8">
          <h3 className="text-sm font-semibold text-slate-600 mb-4 flex items-center gap-2">
            <Video className="w-4 h-4 text-purple-400" />
            Classroom Lesson Videos
          </h3>
          {videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center bg-surface-800/30 rounded-xl border border-white/5">
              <p className="text-slate-600 text-sm">No lesson videos are currently available.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {videos.map(video => (
                <div 
                  key={video.video_id} 
                  className="glass rounded-2xl overflow-hidden shadow-lg border border-slate-200/60 hover:shadow-xl hover:border-primary-400 cursor-pointer transition-all duration-300 flex flex-col group"
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (video.video_id) params.append('video_id', video.video_id);
                    if (video.filename) params.append('filename', video.filename);
                    window.location.href = `/classroom?${params.toString()}`;
                  }}
                >
                  <div className="relative aspect-video bg-slate-900 group">
                    <div className="w-full h-full flex items-center justify-center">
                       <Video className="w-12 h-12 text-slate-600" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                      <div className="w-12 h-12 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                        <Play className="w-6 h-6 ml-1" />
                      </div>
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="text-sm font-bold text-slate-800 line-clamp-1 mb-1 group-hover:text-primary-600 transition-colors">
                      {video.title || "Lesson Video"}
                    </h3>
                    <div className="mt-auto pt-3 space-y-1 text-xs text-slate-500">
                      <p>Uploader: {video.uploader}</p>
                      <p>Uploaded: {new Date(video.uploaded_at).toLocaleDateString()}</p>
                      <p>Captions: <span className="text-emerald-500 font-semibold">{video.captions_status}</span></p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-600 mb-4 flex items-center gap-2">
            <Video className="w-4 h-4 text-emerald-400" />
            Recorded Live Sessions
          </h3>
          {recordings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center bg-surface-800/30 rounded-xl border border-white/5">
              <p className="text-slate-600 text-sm">No live session recordings are currently available.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {recordings.map(recording => (
                <div 
                  key={recording.recording_id} 
                  className={`glass rounded-2xl overflow-hidden shadow-lg border border-slate-200/60 transition-all duration-300 flex flex-col group ${
                    recording.is_locked ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-xl hover:border-primary-400 cursor-pointer'
                  }`}
                  onClick={() => {
                    if (!recording.is_locked) {
                      window.location.href = '/classroom';
                    }
                  }}
                >
                  <div className="relative aspect-video bg-slate-900 group">
                    {recording.thumbnail_path ? (
                      <img 
                        src={`${API_BASE}/recordings/${recording.course_id}/${recording.session_id}/${recording.thumbnail_path}`} 
                        alt="Thumbnail" 
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                         <Video className="w-12 h-12 text-slate-600" />
                      </div>
                    )}
                    
                    {!recording.is_locked && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                        <div className="w-12 h-12 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                          <Play className="w-6 h-6 ml-1" />
                        </div>
                      </div>
                    )}

                    {recording.is_locked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
                        <div className="text-center p-4">
                          <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-2 shadow-lg border border-slate-700">
                            <Lock className="w-5 h-5" />
                          </div>
                          <p className="text-xs font-semibold text-slate-300">Complete previous quiz to continue</p>
                        </div>
                      </div>
                    )}

                    <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 text-white text-xs font-mono backdrop-blur-sm">
                      {Math.floor(recording.duration / 60)}:{(Math.floor(recording.duration % 60)).toString().padStart(2, '0')}
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="text-sm font-bold text-slate-800 line-clamp-1 mb-1 group-hover:text-primary-600 transition-colors">
                      {recording.class_title || "Virtual Class Session"}
                    </h3>
                    <div className="mt-auto pt-3 flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        {new Date(recording.recording_timestamp).toLocaleDateString()}
                      </span>
                      <span className="text-xs font-medium text-primary-500 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {recording.participants_count}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

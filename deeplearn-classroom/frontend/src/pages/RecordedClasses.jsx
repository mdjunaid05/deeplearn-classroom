import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Video, Play, Download, Trash2, Search, Clock, Calendar, AlertCircle } from 'lucide-react';
import VisualAlertBanner from '../components/VisualAlertBanner';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function RecordedClasses() {
  const { user } = useAuth();
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAlert, setActiveAlert] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);

  useEffect(() => {
    fetchRecordings();
  }, [user]);

  const fetchRecordings = async () => {
    try {
      const url = user?.role === 'teacher' 
        ? `${API_BASE}/recordings?teacher_id=${user.id || 1}`
        : `${API_BASE}/recordings`;
        
      const res = await fetch(url);
      const data = await res.json();
      if (data.recordings) {
        setRecordings(data.recordings);
      }
    } catch (err) {
      console.error('Error fetching recordings:', err);
      setActiveAlert({ type: 'error', message: 'Failed to load recordings.', duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (recordingId) => {
    if (!window.confirm("Are you sure you want to delete this recording?")) return;
    
    try {
      const res = await fetch(`${API_BASE}/recordings/${recordingId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setRecordings(recordings.filter(r => r.recording_id !== recordingId));
        setActiveAlert({ type: 'success', message: 'Recording deleted successfully.', duration: 3000 });
      }
    } catch (err) {
      setActiveAlert({ type: 'error', message: 'Failed to delete recording.', duration: 3000 });
    }
  };

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const filteredRecordings = recordings.filter(r => 
    r.class_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.session_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="main">
      <div className="mb-6 w-full max-w-3xl mx-auto">
        <VisualAlertBanner alert={activeAlert} onDismiss={() => setActiveAlert(null)} />
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-800 flex items-center gap-3">
            <Video className="w-8 h-8 text-primary-500" />
            Recorded Classes
          </h1>
          <p className="text-slate-600 mt-1">Access and manage your past live sessions</p>
        </div>
        
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search recordings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 shadow-sm"
          />
        </div>
      </div>

      {selectedVideo && (
        <div className="mb-8 p-4 bg-black rounded-2xl shadow-xl overflow-hidden relative">
          <div className="flex justify-between items-center mb-2 px-2 absolute top-4 right-4 z-10">
            <button 
              onClick={() => setSelectedVideo(null)}
              className="bg-black/50 text-white hover:bg-red-500 px-3 py-1 rounded-lg backdrop-blur-sm transition-colors text-sm"
            >
              Close Video
            </button>
          </div>
          <video 
            src={`${API_BASE}/recordings/${selectedVideo.course_id}/${selectedVideo.session_id}/${selectedVideo.file_path}`}
            controls
            autoPlay
            className="w-full max-h-[60vh] object-contain rounded-xl"
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        </div>
      ) : filteredRecordings.length === 0 ? (
        <div className="text-center py-20 glass rounded-3xl shadow-lg border border-slate-200/60">
          <Video className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-700 mb-2">No recordings found</h3>
          <p className="text-slate-500">You haven't recorded any live classes yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecordings.map(recording => (
            <div key={recording.recording_id} className="glass rounded-2xl overflow-hidden shadow-lg hover:shadow-xl border border-slate-200/60 hover:border-primary-400 transition-all duration-300 flex flex-col group">
              <div className="relative aspect-video bg-slate-900 group cursor-pointer" onClick={() => setSelectedVideo(recording)}>
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
                
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                  <div className="w-12 h-12 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                    <Play className="w-6 h-6 ml-1" />
                  </div>
                </div>

                <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 text-white text-xs font-mono backdrop-blur-sm">
                  {formatDuration(recording.duration)}
                </div>
                {recording.status === 'processing' && (
                  <div className="absolute top-2 left-2 px-2 py-1 rounded bg-amber-500 text-white text-xs font-bold shadow-lg flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Processing
                  </div>
                )}
              </div>
              
              <div className="p-4 flex flex-col flex-1">
                <h3 className="font-bold text-slate-800 mb-1 truncate" title={recording.class_title || "Virtual Class Session"}>
                  {recording.class_title || "Virtual Class Session"}
                </h3>
                
                <div className="space-y-1 mb-4 flex-1">
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(recording.recording_timestamp)}
                  </p>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Session: {recording.session_id.substring(0,8)}...
                  </p>
                </div>
                
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <a 
                    href={`${API_BASE}/recordings/${recording.course_id}/${recording.session_id}/${recording.file_path}`}
                    download
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download
                  </a>
                  
                  {user?.role === 'teacher' && (
                    <button 
                      onClick={() => handleDelete(recording.recording_id)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

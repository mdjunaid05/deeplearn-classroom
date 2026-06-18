/**
 * VirtualClassroom.jsx
 * --------------------
 * Main page for the interactive virtual classroom. Handles:
 *   - Loading an uploaded video from IndexedDB / window fallback
 *   - Live transcript via Web Speech API (useVideoTranscript)
 *   - Dynamic quiz generated from transcript (useQuizGenerator)
 *   - Animated sign-language avatar synced to captions (SignAvatarOverlay)
 *   - Caption display below the video (CaptionOverlay)
 *   - Sidebar: engagement, behaviour, chat, session info
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Monitor, CheckCircle, XCircle, Clock,
  MessageSquare, Activity, Send, HandMetal, Mic, MicOff,
  Video, Play, Download, Trash2, Search, Calendar, Lock, AlertCircle,
  Settings, Type, FastForward, Eye, EyeOff, Maximize, Minimize, Upload
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

import { loadVideo, loadCaptions }    from '../utils/db';
import { useVideoTranscript }     from '../utils/useVideoTranscript';
import { useQuizGenerator }       from '../utils/useQuizGenerator';
import { useSignLanguage }        from '../utils/useSignLanguage';
import CaptionOverlay             from '../components/CaptionOverlay';
import VisualAlertBanner          from '../components/VisualAlertBanner';
import SignAvatarOverlay          from '../components/SignAvatarOverlay';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ---------------------------------------------------------------------------
// Fallback quiz used only if the video has no audible speech
// ---------------------------------------------------------------------------
const FALLBACK_QUIZ = [
  {
    id: 1,
    question: 'What was the primary topic presented in this video?',
    options: [
      'An overview of the subject covered in the lecture.',
      'A historical analysis of ancient civilizations.',
      'A tutorial on graphic design software.',
      'A guide to financial investment strategies.',
    ],
    correct: 0,
  },
  {
    id: 2,
    question: 'Which statement best summarises the video content?',
    options: [
      'The video explained multiple related concepts with practical examples.',
      'The video exclusively focused on abstract mathematics.',
      'No actionable information was presented.',
      'The video was primarily a product advertisement.',
    ],
    correct: 0,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function VirtualClassroom() {
  // ── Video state ───────────────────────────────────────────────────────────
  const videoRef      = useRef(null);
  const videoContainerRef = useRef(null);
  const [videoSrc,    setVideoSrc]    = useState('https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4');
  const [videoTitle,  setVideoTitle]  = useState('Deep Learning Fundamentals');
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [videoTime,   setVideoTime]   = useState(0);
  const [videoEnded,  setVideoEnded]  = useState(false);
  const [activeRecording, setActiveRecording] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── Accessibility State ───────────────────────────────────────────────────
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [signLangEnabled, setSignLangEnabled] = useState(true);
  const [captionSize, setCaptionSize] = useState('normal');
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  // ── Recordings ────────────────────────────────────────────────────────────
  const { user } = useAuth();
  const [recordings, setRecordings] = useState([]);
  const [loadingRecordings, setLoadingRecordings] = useState(true);

  // ── Transcript + captions ─────────────────────────────────────────────────
  // savedCaptions: loaded from IndexedDB (set by VideoUpload after processing)
  // These are displayed immediately before the live speech hook produces any results.
  const [savedCaptions, setSavedCaptions] = useState([]);
  const { transcript, currentCaption, isListening, usingSimulation } = useVideoTranscript(videoRef, savedCaptions);

  // ── Quiz ──────────────────────────────────────────────────────────────────
  const { quizQuestions, generateQuiz } = useQuizGenerator();
  const [answers,      setAnswers]      = useState({});
  const [showResults,  setShowResults]  = useState(false);
  const [quizReady,    setQuizReady]    = useState(false);

  // ── Sidebar / session ─────────────────────────────────────────────────────
  const [sessionTime,  setSessionTime]  = useState(0);
  const [engagement,   setEngagement]   = useState('High');
  const [behaviour,    setBehaviour]    = useState('Active');
  const [chatInput,    setChatInput]    = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [activeAlert,  setActiveAlert]  = useState(null);

  // ── Active quiz (transcript-generated OR fallback) ────────────────────────
  const activeQuiz = quizQuestions || FALLBACK_QUIZ;

  // ── Load video + captions from backend OR IndexedDB on mount ─────────────
  useEffect(() => {
    const fetchData = async () => {
      const params = new URLSearchParams(window.location.search);
      const videoId = params.get('video_id');
      const jobId = params.get('job_id');
      const filename = params.get('filename');

      let loadedVideo = false;

      // 1. If we have videoId/jobId/filename in query params, try fetching direct video URL from backend
      if (videoId || jobId || filename) {
        try {
          const urlRes = await fetch(`${API_BASE}/video-url?${params.toString()}`);
          if (urlRes.ok) {
            const urlData = await urlRes.json();
            if (urlData.video_url) {
              const fullUrl = urlData.video_url.startsWith('http') 
                ? urlData.video_url 
                : `${API_BASE}${urlData.video_url}`;
              setVideoSrc(fullUrl);
              setVideoTitle(filename || 'Uploaded Video');
              loadedVideo = true;
              console.log('[Classroom] Loaded video from backend URL:', fullUrl);
            }
          }
        } catch (err) {
          console.warn('[Classroom] Failed to fetch video URL from backend:', err);
        }
      }

      // 2. Fallback to IndexedDB / Window state if backend video URL lookup wasn't performed or failed
      if (!loadedVideo) {
        try {
          const { file, name } = await loadVideo();
          if (file) {
            setVideoSrc(URL.createObjectURL(file));
            setVideoTitle(name);
            loadedVideo = true;
            console.log('[Classroom] Loaded video from IndexedDB:', name);
          }
        } catch (err) {
          console.error('[Classroom] Failed to load video from IndexedDB:', err);
        }
      }

      if (!loadedVideo && window.uploadedDemoVideo) {
        setVideoSrc(window.uploadedDemoVideo);
        setVideoTitle(window.uploadedDemoTitle || 'Uploaded Video');
        loadedVideo = true;
      }
      setIsVideoLoaded(true);

      // 3. Load saved captions (Window → Backend → IndexedDB)
      try {
        if (window.uploadedDemoCaptions && window.uploadedDemoCaptions.length > 0) {
          console.log('[Classroom] Loaded captions from window:', window.uploadedDemoCaptions.length, 'segments');
          setSavedCaptions(window.uploadedDemoCaptions);
        } else if (videoId || jobId || filename) {
          // Fetch captions from backend
          const capUrl = `${API_BASE}/video-captions?${videoId ? `video_id=${videoId}` : jobId ? `job_id=${jobId}` : `filename=${filename}`}&format=json`;
          const capRes = await fetch(capUrl);
          if (capRes.ok) {
            const capData = await capRes.json();
            if (capData.captions) {
              console.log('[Classroom] Loaded captions from backend:', capData.captions.length, 'segments');
              setSavedCaptions(capData.captions);
            }
          }
        } else {
          const caps = await loadCaptions();
          if (caps && caps.length > 0) {
            console.log('[Classroom] Loaded captions from IndexedDB:', caps.length, 'segments');
            setSavedCaptions(caps);
          }
        }
      } catch (err) {
        console.warn('[Classroom] Could not load saved captions:', err);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!videoEnded) return;
    const fullText = transcript.map(t => t.text).join(' ');
    generateQuiz(fullText, 3);
    setQuizReady(true);
  }, [videoEnded, transcript, generateQuiz]);

  // ── Fetch Recordings ──────────────────────────────────────────────────────
  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(true);

  const fetchVideos = async () => {
    try {
      setLoadingVideos(true);
      const res = await fetch(`${API_BASE}/videos`);
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos || []);
        console.log('[VIDEO_LIST_FETCHED] count=' + (data.videos?.length || 0));
      }
    } catch (err) {
      console.error('Error fetching videos:', err);
    } finally {
      setLoadingVideos(false);
    }
  };

  const fetchRecordings = async () => {
    try {
      setLoadingRecordings(true);
      const url = user?.role === 'teacher' 
        ? `${API_BASE}/recordings?teacher_id=${user.id || 1}`
        : `${API_BASE}/recordings?student_id=${user?.id || 1}`;
        
      const res = await fetch(url);
      const data = await res.json();
      if (data.recordings) {
        setRecordings(data.recordings);
      }
    } catch (err) {
      console.error('Error fetching recordings:', err);
    } finally {
      setLoadingRecordings(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchRecordings();
      fetchVideos();
    }
  }, [user]);

  // ── Playback Speed ────────────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, videoSrc]);

  // ── Fullscreen toggle ─────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    const container = videoContainerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(err =>
        console.warn('[Classroom] Fullscreen request failed:', err)
      );
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Track fullscreen state changes
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Session timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setSessionTime(p => p + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Quiz handlers ─────────────────────────────────────────────────────────
  const handleAnswer = (qIdx, optIdx) =>
    setAnswers(prev => ({ ...prev, [qIdx]: optIdx }));

  const handleSubmitQuiz = async () => {
    setShowResults(true);
    const scoreVal = Object.entries(answers).reduce((acc, [qIdx, ans]) =>
      acc + (activeQuiz[parseInt(qIdx)]?.correct === ans ? 1 : 0), 0);
    const passed = scoreVal >= activeQuiz.length / 2;
    
    // Save quiz score
    if (activeRecording && user?.role === 'student') {
      try {
        await fetch(`${API_BASE}/submit-quiz`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: user.id || 1,
            recording_id: activeRecording.recording_id,
            score: scoreVal,
            passed: passed
          })
        });
        if (passed) {
          fetchRecordings(); // refresh locks
        }
      } catch (err) {
        console.error('Failed to submit quiz score', err);
      }
    }
  };

  const score = Object.entries(answers).reduce((acc, [qIdx, ans]) =>
    acc + (activeQuiz[parseInt(qIdx)]?.correct === ans ? 1 : 0), 0);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setChatMessages(prev => [...prev, { user: 'You', msg: chatInput, time: 'Just now' }]);
    setChatInput('');
  };

  // ── Sign Language Interpretation via AI hook ─────────────────────────────
  const {
    currentSign,
    signQueue,
    isProcessing: signProcessing,
    signCount,
    updateFromLiveWord,
  } = useSignLanguage(videoRef, savedCaptions, signLangEnabled, playbackSpeed);

  // Live word fallback (when no savedCaptions, use currentCaption directly)
  useEffect(() => {
    if (savedCaptions.length === 0 && currentCaption) {
      updateFromLiveWord(currentCaption);
    }
  }, [currentCaption, savedCaptions.length, updateFromLiveWord]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full bg-white min-h-[calc(100vh-4rem)] text-slate-800 transition-colors duration-300">
      <style>{`
        .dark-glass {
            background: rgba(255, 255, 255, 0.7);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(0, 0, 0, 0.06);
            box-shadow: 0 8px 32px 0 rgba(15, 23, 42, 0.04);
        }
        .dark-glass-high {
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid rgba(0, 0, 0, 0.08);
            box-shadow: 0 8px 32px 0 rgba(15, 23, 42, 0.04);
        }
        .emerald-glow {
            box-shadow: 0 0 20px rgba(16, 185, 129, 0.08);
        }
        .interpreter-window {
            border: 2px solid #06b6d4;
            box-shadow: 0 0 15px rgba(6, 182, 212, 0.15);
        }
        .badge-active {
            background: rgba(16, 185, 129, 0.1);
            color: #059669;
        }
        .badge-distracted {
            background: rgba(239, 68, 68, 0.1);
            color: #dc2626;
        }
        .badge-passive {
            background: rgba(249, 115, 22, 0.1);
            color: #ea580c;
        }
      `}</style>

      <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="main" aria-label="Virtual Classroom">

        {/* Visual Alert Banner */}
        <div className="mb-6 w-full max-w-3xl mx-auto">
          <VisualAlertBanner alert={activeAlert} onDismiss={() => setActiveAlert(null)} />
        </div>

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-800 flex items-center gap-3">
              <Monitor className="w-8 h-8 text-primary-500" />
              Virtual Classroom
            </h1>
            <p className="text-slate-500 mt-1 text-sm">{videoTitle} — Live Interactive Session</p>
          </div>
          <div className="flex gap-4 items-center">
            {/* Caption/mic status indicator */}
            {isListening && !usingSimulation ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 animate-pulse">
                <Mic className="w-4 h-4" /> Live Mic
              </span>
            ) : usingSimulation ? (
              <span className="flex items-center gap-1.5 text-xs text-purple-600 animate-pulse">
                <Mic className="w-4 h-4" /> Auto Captions
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <MicOff className="w-4 h-4" /> Captions off
              </span>
            )}

            {/* Live indicator block */}
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="text-[10px] font-bold text-emerald-600 tracking-wider uppercase">LIVE</span>
              <span className="text-[10px] text-slate-500 ml-2 font-mono">{formatTime(sessionTime)}</span>
            </div>

            {/* Upload video button (for teachers) */}
            {user?.role === 'teacher' && (
              <a
                href="/video-upload"
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold transition-colors text-sm shadow-lg shadow-purple-600/20"
                aria-label="Upload Class Video"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                Upload Video
              </a>
            )}
          </div>
        </div>

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Left / Main — 3 cols */}
          <div className="lg:col-span-3 space-y-4">

            {/* ── Video Player stage ── */}
            <div
              ref={videoContainerRef}
              className={`relative w-full aspect-video rounded-3xl overflow-hidden dark-glass emerald-glow group transition-all duration-300 ${isFullscreen ? 'fullscreen-video-container' : ''}`}
            >
              <video
                ref={videoRef}
                src={isVideoLoaded ? videoSrc : ''}
                className="w-full h-full object-contain bg-slate-950"
                controls
                onPlay={() => { setIsPlaying(true); setVideoEnded(false); }}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={(e) => setVideoTime(e.target.currentTime)}
                onEnded={() => { setIsPlaying(false); setVideoEnded(true); }}
                onLoadedMetadata={() => console.log('[VIDEO_RENDERED] src=' + videoSrc)}
                poster={
                  isVideoLoaded && videoSrc.includes('Sintel')
                    ? 'https://storage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg'
                    : undefined
                }
              />

              {/* Video-ended overlay */}
              {videoEnded && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center pointer-events-none z-10">
                  <CheckCircle className="w-16 h-16 text-emerald-400 mb-3" />
                  <p className="text-white font-semibold text-lg">Video Complete</p>
                  <p className="text-slate-400 text-sm mt-1">Quiz generated below</p>
                </div>
              )}

              {/* ASL Interpreter Overlay - placed INSIDE video player */}
              {signLangEnabled && (
                <div className="absolute bottom-6 right-6 z-20 sign-panel-enter">
                  <div className="interpreter-window rounded-2xl overflow-hidden">
                    <SignAvatarOverlay
                      currentSign={currentSign}
                      isActive={isPlaying}
                      signQueue={signQueue}
                      isProcessing={signProcessing}
                      signCount={signCount}
                    />
                  </div>
                </div>
              )}

              {/* Caption overlay — only visible in fullscreen */}
              {captionsEnabled && isFullscreen && (
                <div className="absolute left-0 right-0 bottom-16 z-10 pointer-events-none px-4">
                  <CaptionOverlay
                    transcript={transcript}
                    currentCaption={currentCaption}
                    isActive={isPlaying}
                    usingSimulation={usingSimulation}
                    captionSize={isFullscreen ? 'large' : captionSize}
                  />
                </div>
              )}

              {/* Custom fullscreen toggle button */}
              <button
                onClick={toggleFullscreen}
                className="absolute top-3 right-3 z-20 p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white opacity-70 hover:opacity-100 transition-all duration-200 backdrop-blur-sm"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen with captions'}
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>

            {/* ── Captions — below video in normal mode ── */}
            {captionsEnabled && !isFullscreen && (
              <div className="w-full p-6 rounded-2xl dark-glass-high">
                <CaptionOverlay
                  transcript={transcript}
                  currentCaption={currentCaption}
                  isActive={isPlaying}
                  usingSimulation={usingSimulation}
                  captionSize={captionSize}
                />
                {!isPlaying && transcript.length === 0 && (
                  <p className="text-xs text-slate-500 italic text-center py-2">
                    Captions will appear here when the video plays.
                  </p>
                )}
              </div>
            )}

            {/* ── Accessibility Controls ── */}
            <div className="p-4 rounded-2xl dark-glass flex flex-wrap items-center gap-4 shadow-lg border border-slate-200 transition-all duration-300">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary-500" />
                <span className="text-sm font-semibold text-slate-700">Accessibility Controls</span>
              </div>
              <div className="w-px h-6 bg-slate-200 mx-2"></div>
              
              <button 
                onClick={() => setCaptionsEnabled(!captionsEnabled)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${captionsEnabled ? 'bg-primary-500/10 text-primary-600 border border-primary-500/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {captionsEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                Captions
              </button>
              
              <button 
                id="toggle-sign-language"
                onClick={() => setSignLangEnabled(!signLangEnabled)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                  signLangEnabled
                    ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20 shadow-sm shadow-purple-500/5'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
                aria-pressed={signLangEnabled}
                aria-label="Toggle sign language interpreter"
              >
                <HandMetal className="w-4 h-4" />
                ASL Interpreter Overlay
                {signLangEnabled && signCount > 0 && (
                  <span className="ml-1 text-[10px] font-bold bg-purple-500/20 text-purple-600 px-1.5 py-0.5 rounded-full">
                    {signCount}
                  </span>
                )}
              </button>
              
              <div className="flex items-center gap-2 ml-auto">
                <Type className="w-4 h-4 text-slate-500" />
                <select 
                  value={captionSize} 
                  onChange={(e) => setCaptionSize(e.target.value)}
                  className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg p-1.5 outline-none font-medium focus:ring-1 focus:ring-primary-500"
                >
                  <option value="small">Small text</option>
                  <option value="normal">Normal text</option>
                  <option value="large">Large text</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <FastForward className="w-4 h-4 text-slate-500" />
                <select 
                  value={playbackSpeed} 
                  onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                  className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg p-1.5 outline-none font-medium focus:ring-1 focus:ring-primary-500"
                >
                  <option value="0.5">0.5x</option>
                  <option value="0.75">0.75x</option>
                  <option value="1.0">1.0x (Normal)</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2.0">2.0x</option>
                </select>
              </div>
            </div>

            {/* ── Quiz Section (Bento Card Style) ── */}
            <div className="p-8 rounded-3xl dark-glass flex flex-col gap-6 border border-slate-200 transition-all duration-300">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg text-purple-600">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Quick Assessment</h3>
                  <p className="text-xs text-slate-500">
                    {quizQuestions
                      ? 'Questions generated dynamically from the video transcript.'
                      : videoEnded
                        ? 'Using fallback questions (no speech detected).'
                        : 'Quiz will be generated automatically when the video ends.'}
                  </p>
                </div>
              </div>

              {/* Quiz not ready yet */}
              {!quizReady && !videoEnded && (
                <div className="text-center py-8 text-slate-400">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-40 animate-pulse text-primary-500" />
                  <p className="text-sm">Finish watching the video to unlock the quiz.</p>
                </div>
              )}

              {/* Quiz questions */}
              {(quizReady || videoEnded) && !showResults && (
                <div className="space-y-6">
                  {activeQuiz.map((q, qIdx) => (
                    <div key={q.id} className="p-5 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-primary-500/30 transition-all duration-300">
                      <p className="text-sm font-semibold text-slate-800 mb-4">
                        {qIdx + 1}. {q.question}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {q.options.map((opt, optIdx) => {
                          const isSelected = answers[qIdx] === optIdx;
                          return (
                            <button
                              key={optIdx}
                              id={`quiz-q${qIdx}-opt${optIdx}`}
                              onClick={() => handleAnswer(qIdx, optIdx)}
                              className={`flex items-center justify-between p-5 rounded-2xl text-left text-sm transition-all duration-200
                                ${isSelected
                                  ? 'bg-primary-50 border-2 border-primary-500 text-primary-900 font-semibold'
                                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                                }`}
                            >
                              <span>{opt}</span>
                              {isSelected && (
                                <CheckCircle className="w-4 h-4 text-primary-600 shrink-0 ml-2" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <button
                    id="quiz-submit-btn"
                    onClick={handleSubmitQuiz}
                    disabled={Object.keys(answers).length < activeQuiz.length}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary-600 to-purple-600
                               text-white font-bold text-sm hover:brightness-110
                               disabled:opacity-40 disabled:cursor-not-allowed
                               transition-all shadow-lg shadow-primary-600/10"
                  >
                    Submit Answers
                  </button>
                </div>
              )}

              {/* Results screen */}
              {showResults && (
                <div className="text-center py-8">
                  <div className={`text-5xl font-display font-bold mb-2 ${
                    score === activeQuiz.length ? 'text-emerald-600' :
                    score >= activeQuiz.length / 2 ? 'text-yellow-600' : 'text-red-500'
                  }`}>
                    {score}/{activeQuiz.length}
                  </div>
                  <p className="text-slate-500 text-sm mb-6">
                    {score === activeQuiz.length
                      ? 'Perfect score! Excellent work!'
                      : score >= activeQuiz.length / 2
                        ? 'Good job! Review the material to improve.'
                        : "Keep studying — you'll improve!"}
                  </p>

                  <div className="space-y-3 text-left mt-6 max-w-xl mx-auto">
                    {activeQuiz.map((q, qIdx) => (
                      <div key={q.id} className="flex items-start gap-3 p-4 rounded-xl bg-white border border-slate-100">
                        {answers[qIdx] === q.correct
                          ? <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                          : <XCircle    className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
                        <div>
                          <span className="text-xs text-slate-400 block mb-1">Question {qIdx + 1}</span>
                          <span className="text-sm text-slate-700">{q.question}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    id="quiz-retry-btn"
                    onClick={() => { setShowResults(false); setAnswers({}); }}
                    className="mt-8 px-6 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-sm transition-all border border-slate-200"
                  >
                    Retry Quiz
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Sidebar — 1 col ── */}
          <div className="space-y-4">

            {/* Live Engagement */}
            <div className="p-6 rounded-3xl dark-glass flex flex-col gap-4 border border-slate-200">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Class Engagement
                </span>
                <span className={`text-sm font-bold ${
                  engagement === 'High' ? 'text-emerald-600' :
                  engagement === 'Low' ? 'text-red-500' : 'text-amber-500'
                }`}>
                  {engagement === 'High' ? '88%' : engagement === 'Medium' ? '65%' : '38%'}
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-primary-500 transition-all duration-1000"
                  style={{
                    width: engagement === 'High' ? '88%' : engagement === 'Medium' ? '65%' : '38%'
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                {engagement === 'High' ? 'Interaction levels are peaking in the current segment.' :
                 engagement === 'Medium' ? 'Classroom attention is steady.' :
                 'Attention levels are low. Consider triggering a stretch break.'}
              </p>
            </div>

            {/* Behaviour Status */}
            <div className="p-6 rounded-3xl dark-glass flex flex-col gap-4 border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Behaviour Status
              </h3>
              <div className="flex items-center gap-2">
                <Activity className={`w-4 h-4 ${
                  behaviour === 'Active'     ? 'text-emerald-500' :
                  behaviour === 'Distracted' ? 'text-red-500'     : 'text-amber-500'
                }`} />
                <span className={`badge ${
                  behaviour === 'Active' ? 'badge-active' :
                  behaviour === 'Distracted' ? 'badge-distracted' : 'badge-passive'
                }`}>{behaviour}</span>
              </div>
              <div className="space-y-2 border-t border-slate-100 pt-3">
                {[['Click Rate', 'Steady'], ['Response', 'Good'], ['Idle Time', 'Low']].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-slate-400">{k}</span>
                    <span className="text-slate-700 font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Session Info */}
            <div className="p-6 rounded-3xl dark-glass flex flex-col gap-3 border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Session Info
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Course</span>
                  <span className="text-slate-700 font-medium truncate max-w-[150px] text-right" title={videoTitle}>{videoTitle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Captions</span>
                  <span className="text-slate-700 font-medium">{transcript.length} segments</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Duration</span>
                  <span className="text-slate-700 font-mono">{formatTime(sessionTime)}</span>
                </div>
              </div>
            </div>

            {/* Transcript preview */}
            {transcript.length > 0 && (
              <div className="p-6 rounded-3xl dark-glass flex flex-col gap-3 border border-slate-200">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Transcript ({transcript.length})
                </h3>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1" style={{ scrollbarWidth: 'none' }}>
                  {transcript.slice(-8).map((item, idx) => (
                    <p key={idx} className="text-[10px] text-slate-600 leading-snug">
                      <span className="text-slate-400 font-mono mr-1">{formatTime(Math.floor(item.timestamp))}</span>
                      {item.text}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Text Chat */}
            <div className="p-6 rounded-3xl dark-glass flex flex-col h-[400px] border border-slate-200">
              <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-purple-500" />
                  Class Chat
                </span>
                <span className="text-[10px] text-emerald-600 font-medium">24 Active</span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto my-3 pr-1" role="log" aria-label="Chat messages">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                    <MessageSquare className="w-8 h-8 opacity-20 mb-2" />
                    <p className="text-xs">No messages yet. Say hello!</p>
                  </div>
                ) : (
                  chatMessages.map((c, idx) => (
                    <div key={idx} className="flex gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-200 text-[10px] font-bold text-slate-700 flex items-center justify-center shrink-0">
                        {c.user === 'You' ? 'ME' : c.user.split(' ').map(n=>n[0]).join('').toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] font-semibold text-slate-700">{c.user}</span>
                          <span className="text-[9px] text-slate-400">{c.time}</span>
                        </div>
                        <p className="text-xs bg-slate-50 border border-slate-100 p-2 rounded-2xl rounded-tl-none text-slate-700 leading-relaxed">{c.msg}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendChat} className="flex gap-2 pt-2 border-t border-slate-100">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:bg-white"
                  placeholder="Type a message…"
                  aria-label="Chat message input"
                  style={{ color: '#1e293b', backgroundColor: '#f8fafc' }}
                />
                <button
                  type="submit"
                  className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                  aria-label="Send message"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

            {/* Sign Language Input & Actions */}
            <div className="flex flex-col gap-4">
              <button
                onClick={() => setActiveAlert({ type: 'info', message: 'Sign Language Input mode started.', flash: false, duration: 3000 })}
                className="w-full py-4 rounded-2xl bg-gradient-to-br from-purple-500 to-primary-500 text-white font-bold flex items-center justify-center gap-3 shadow-lg hover:scale-[1.02] transition-transform"
                aria-label="Open sign language input"
              >
                <HandMetal className="w-5 h-5" />
                <span className="text-sm">Use Sign Language Camera</span>
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => {
                    setActiveAlert({ type: 'success', message: 'Hand raised. Teacher has been notified.', flash: true, duration: 3000 });
                  }}
                  className="p-4 rounded-2xl dark-glass hover:bg-slate-100 border border-slate-100 transition-all flex flex-col items-center gap-2 group"
                >
                  <HandMetal className="w-5 h-5 text-slate-400 group-hover:text-primary-500 transition-colors" />
                  <span className="text-xs font-medium text-slate-600">Raise Hand</span>
                </button>
                <button 
                  onClick={() => {
                    setActiveAlert({ type: 'info', message: 'Notes panel opened.', flash: false, duration: 2000 });
                  }}
                  className="p-4 rounded-2xl dark-glass hover:bg-slate-100 border border-slate-100 transition-all flex flex-col items-center gap-2 group"
                >
                  <Settings className="w-5 h-5 text-slate-400 group-hover:text-primary-500 transition-colors" />
                  <span className="text-xs font-medium text-slate-600">Take Notes</span>
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ── Recorded Classes Section ── */}
        <div className="mt-16 border-t border-slate-200 pt-12">
          <h2 className="text-2xl font-display font-bold text-slate-800 flex items-center gap-3 mb-8">
            <Video className="w-7 h-7 text-primary-500" />
            Classroom Video Catalog
          </h2>

          <div className="mb-12">
            <h3 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Video className="w-5 h-5 text-purple-400" />
              Classroom Lesson Videos
            </h3>
            {loadingVideos ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
              </div>
            ) : videos.length === 0 ? (
              <div className="text-center py-8 bg-surface-800/30 rounded-xl border border-white/5 mb-8">
                <p className="text-slate-500 text-sm">No uploaded lesson videos available yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {videos.map(video => (
                  <div 
                    key={video.video_id} 
                    className="dark-glass rounded-2xl overflow-hidden border border-slate-100 transition-all duration-300 flex flex-col group cursor-pointer hover:border-primary-500/40 hover:shadow-lg"
                    onClick={() => {
                      const rawUrl = video.r2_url || video.processed_url || video.original_url || '';
                      const videoUrl = rawUrl && rawUrl.startsWith('http') 
                        ? rawUrl 
                        : rawUrl ? `${API_BASE}${rawUrl}` : '';
                      setVideoSrc(videoUrl);
                      setVideoTitle(video.title || "Uploaded Video");
                      setActiveRecording(null);
                      setVideoEnded(false);
                      setQuizReady(false);
                      setShowResults(false);
                      setAnswers({});
                      setSavedCaptions([]);
                      
                      fetch(`${API_BASE}/video-captions?video_id=${video.video_id}&format=json`)
                        .then(res => {
                          if (res.ok) return res.json();
                          throw new Error('No captions');
                        })
                        .then(data => {
                          if (data.captions && data.captions.length > 0) {
                            setSavedCaptions(data.captions);
                          }
                        })
                        .catch(() => console.log('No captions found for this video.'));

                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    <div className="relative aspect-video bg-slate-950 group">
                      <div className="w-full h-full flex items-center justify-center bg-slate-900">
                         <Video className="w-10 h-10 text-slate-500" />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40">
                        <div className="w-10 h-10 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                          <Play className="w-5 h-5 fill-white ml-0.5" />
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 flex flex-col flex-1">
                      <h3 className="font-bold text-slate-700 text-sm mb-1 truncate" title={video.title}>
                        {video.title}
                      </h3>
                      <div className="space-y-1 mt-auto">
                        <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                          Uploader: {video.uploader}
                        </p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                          Uploaded: {new Date(video.uploaded_at).toLocaleDateString()}
                        </p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                          Captions: <span className={video.status === 'done' ? 'text-emerald-500 font-semibold' : 'text-amber-500 font-semibold'}>{video.captions_status}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Video className="w-5 h-5 text-emerald-400" />
              Recorded Live Sessions
            </h3>
            {loadingRecordings ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              </div>
            ) : recordings.length === 0 ? (
              <div className="text-center py-16 dark-glass rounded-3xl border border-slate-200">
                <Video className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-slate-700">No recordings found</h3>
                <p className="text-slate-500 text-sm">Class recordings will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {recordings.map(recording => (
                  <div 
                    key={recording.recording_id} 
                    className={`dark-glass rounded-2xl overflow-hidden border border-slate-100 transition-all duration-300 flex flex-col group ${
                      recording.is_locked ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary-500/40 cursor-pointer hover:shadow-lg'
                    }`}
                    onClick={() => {
                      if (recording.is_locked) return;
                      setVideoSrc(`${API_BASE}/recordings/${recording.course_id}/${recording.session_id}/${recording.file_path}`);
                      setVideoTitle(recording.class_title || "Virtual Class Session");
                      setActiveRecording(recording);
                      setVideoEnded(false);
                      setQuizReady(false);
                      setShowResults(false);
                      setAnswers({});
                      setSavedCaptions([]);
                      
                      fetch(`${API_BASE}/recordings/${recording.course_id}/${recording.session_id}/captions.json`)
                        .then(res => {
                          if (res.ok) return res.json();
                          throw new Error('No captions');
                        })
                        .then(data => {
                          if (data && data.length > 0) {
                            setSavedCaptions(data);
                          }
                        })
                        .catch(() => console.log('No captions.json found for this recording.'));

                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    <div className="relative aspect-video bg-slate-950 group">
                      {recording.thumbnail_path ? (
                        <img 
                          src={`${API_BASE}/recordings/${recording.course_id}/${recording.session_id}/${recording.thumbnail_path}`} 
                          alt="Thumbnail" 
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-900">
                           <Video className="w-10 h-10 text-slate-500" />
                        </div>
                      )}
                      
                      {recording.is_locked ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-xs">
                          <Lock className="w-6 h-6 text-white/60 mb-2" />
                          <span className="text-white/80 text-[10px] font-semibold px-4 text-center">{recording.locked_reason}</span>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40">
                          <div className="w-10 h-10 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                            <Play className="w-5 h-5 fill-white ml-0.5" />
                          </div>
                        </div>
                      )}

                      <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 text-white text-[10px] font-mono backdrop-blur-xs">
                        {Math.floor(recording.duration / 60)}:{(Math.floor(recording.duration % 60)).toString().padStart(2, '0')}
                      </div>
                    </div>
                    
                    <div className="p-4 flex flex-col flex-1">
                      <h3 className="font-bold text-slate-700 text-sm mb-1 truncate" title={recording.class_title || "Virtual Class Session"}>
                        {recording.class_title || "Virtual Class Session"}
                      </h3>
                      
                      <div className="space-y-1 mt-auto">
                        <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" />
                          {new Date(recording.recording_timestamp).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                        <a 
                          href={`${API_BASE}/recordings/${recording.course_id}/${recording.session_id}/${recording.file_path}`}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className={`flex items-center gap-1.5 text-[10px] font-semibold transition-colors ${
                            recording.is_locked 
                              ? 'text-slate-400 cursor-not-allowed pointer-events-none' 
                              : 'text-primary-600 hover:text-primary-700'
                          }`}
                        >
                          <Download className="w-3 h-3" /> Download
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


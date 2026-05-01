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

import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor, CheckCircle, XCircle, Clock,
  MessageSquare, Activity, Send, HandMetal, Mic, MicOff
} from 'lucide-react';

import { loadVideo, loadCaptions }    from '../utils/db';
import { useVideoTranscript }     from '../utils/useVideoTranscript';
import { useQuizGenerator }       from '../utils/useQuizGenerator';
import CaptionOverlay             from '../components/CaptionOverlay';
import VisualAlertBanner          from '../components/VisualAlertBanner';
import SignAvatarOverlay          from '../components/SignAvatarOverlay';

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
  const [videoSrc,    setVideoSrc]    = useState('https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4');
  const [videoTitle,  setVideoTitle]  = useState('Deep Learning Fundamentals');
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [videoTime,   setVideoTime]   = useState(0);
  const [videoEnded,  setVideoEnded]  = useState(false);

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

  // ── Load video + captions from IndexedDB on mount ────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      // 1. Load video
      let loaded = false;
      try {
        const { file, name } = await loadVideo();
        if (file) {
          setVideoSrc(URL.createObjectURL(file));
          setVideoTitle(name);
          loaded = true;
          console.log('[Classroom] Loaded video from IndexedDB:', name);
        }
      } catch (err) {
        console.error('[Classroom] Failed to load video from IndexedDB:', err);
      }
      if (!loaded && window.uploadedDemoVideo) {
        setVideoSrc(window.uploadedDemoVideo);
        setVideoTitle(window.uploadedDemoTitle || 'Uploaded Video');
      }
      setIsVideoLoaded(true);

      // 2. Load saved captions produced by VideoUpload
      try {
        // Try window first (same-session navigation, no DB latency)
        if (window.uploadedDemoCaptions && window.uploadedDemoCaptions.length > 0) {
          console.log('[Classroom] Loaded captions from window:', window.uploadedDemoCaptions.length, 'segments');
          setSavedCaptions(window.uploadedDemoCaptions);
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

  // ── When video ends → generate quiz from transcript ───────────────────────
  useEffect(() => {
    if (!videoEnded) return;
    const fullText = transcript.map(t => t.text).join(' ');
    generateQuiz(fullText, 3);
    setQuizReady(true);
  }, [videoEnded, transcript, generateQuiz]);

  // ── Session timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setSessionTime(p => p + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Quiz handlers ─────────────────────────────────────────────────────────
  const handleAnswer = (qIdx, optIdx) =>
    setAnswers(prev => ({ ...prev, [qIdx]: optIdx }));

  const handleSubmitQuiz = () => setShowResults(true);

  const score = Object.entries(answers).reduce((acc, [qIdx, ans]) =>
    acc + (activeQuiz[parseInt(qIdx)]?.correct === ans ? 1 : 0), 0);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setChatMessages(prev => [...prev, { user: 'You', msg: chatInput, time: 'Just now' }]);
    setChatInput('');
  };

  // ── Derive first word of current caption for avatar gesture ──────────────
  const avatarWord = currentCaption.trim().split(/\s+/)[0] || '';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="main" aria-label="Virtual Classroom">

      {/* Visual Alert Banner */}
      <div className="mb-6 w-full max-w-3xl mx-auto">
        <VisualAlertBanner alert={activeAlert} onDismiss={() => setActiveAlert(null)} />
      </div>

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-3">
            <Monitor className="w-8 h-8 text-primary-400" />
            Virtual Classroom
          </h1>
          <p className="text-slate-400 mt-1">{videoTitle} — Session Active</p>
        </div>
        <div className="flex gap-3 items-center">
          {/* Caption/mic status indicator */}
          {isListening && !usingSimulation ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 animate-pulse">
              <Mic className="w-4 h-4" /> Live Mic
            </span>
          ) : usingSimulation ? (
            <span className="flex items-center gap-1.5 text-xs text-purple-400 animate-pulse">
              <Mic className="w-4 h-4" /> Auto Captions
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <MicOff className="w-4 h-4" /> Captions off
            </span>
          )}
          <a
            href="/video-upload"
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold transition-colors text-sm"
            aria-label="Upload Class Video"
          >
            <Monitor className="w-4 h-4" aria-hidden="true" />
            Upload Video
          </a>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg glass">
            <Clock className="w-4 h-4 text-primary-400" />
            <span className="text-sm font-mono text-white">{formatTime(sessionTime)}</span>
          </div>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Left / Main — 3 cols */}
        <div className="lg:col-span-3 space-y-4">

          {/* ── Video + Avatar row ── */}
          <div className="flex flex-col xl:flex-row gap-4 items-start">

            {/* Video Player */}
            <div className="flex-1 rounded-2xl glass overflow-hidden">
              <div className="aspect-video bg-black relative group">
              {/* 
                BUGFIX: Always render <video> so videoRef.current is populated
                immediately on mount. Previously wrapped in {isVideoLoaded && ...}
                which caused videoRef.current to be null when useVideoTranscript's
                useEffect ran, so NO listeners were ever attached.
                Now: always render the element, just conditionally set src/poster.
              */}
              <video
                ref={videoRef}
                src={isVideoLoaded ? videoSrc : ''}
                className="w-full h-full object-contain"
                controls
                onPlay={() => { setIsPlaying(true); setVideoEnded(false); }}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={(e) => setVideoTime(e.target.currentTime)}
                onEnded={() => { setIsPlaying(false); setVideoEnded(true); }}
                poster={
                  isVideoLoaded && videoSrc.includes('Sintel')
                    ? 'https://storage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg'
                    : undefined
                }
              />

                {/* Title overlay on hover */}
                <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <h3 className="text-lg font-bold text-white">{videoTitle}</h3>
                  <p className="text-xs text-slate-300">
                    {videoTitle === 'Deep Learning Fundamentals'
                      ? 'Lecture 5: Neural Network Architectures'
                      : 'Custom Uploaded Content'}
                  </p>
                </div>

                {/* Video-ended overlay */}
                {videoEnded && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center pointer-events-none">
                    <CheckCircle className="w-16 h-16 text-emerald-400 mb-3" />
                    <p className="text-white font-semibold text-lg">Video Complete</p>
                    <p className="text-slate-400 text-sm mt-1">Quiz generated below ↓</p>
                  </div>
                )}
              </div>

              {/* ── Captions — below the video, inside the same card ── */}
              <div className="p-3 border-t border-white/5">
                <CaptionOverlay
                  transcript={transcript}
                  currentCaption={currentCaption}
                  isActive={isPlaying}
                  usingSimulation={usingSimulation}
                />
                {!isPlaying && transcript.length === 0 && (
                  <p className="text-xs text-slate-600 italic text-center py-2">
                    Captions will appear here when the video plays.
                  </p>
                )}
              </div>
            </div>

            {/* ── Sign Language Avatar — right of video ── */}
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                ASL Interpreter
              </p>
              <SignAvatarOverlay
                currentWord={avatarWord}
                isActive={isPlaying}
              />
              {transcript.length > 0 && (
                <p className="text-[10px] text-emerald-400/60 text-center max-w-[140px] leading-tight">
                  Signing based on live transcript
                </p>
              )}
            </div>
          </div>

          {/* ── Quiz Section ── */}
          <div className="p-6 rounded-2xl glass">
            <h3 className="text-sm font-semibold text-slate-300 mb-1 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              Quick Assessment
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              {quizQuestions
                ? 'Questions generated from the video transcript.'
                : videoEnded
                  ? 'Using fallback questions (no speech detected).'
                  : 'Quiz will be generated automatically when the video ends.'}
            </p>

            {/* Quiz not ready yet */}
            {!quizReady && !videoEnded && (
              <div className="text-center py-8 text-slate-500">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-40 animate-pulse" />
                <p className="text-sm">Finish watching the video to unlock the quiz.</p>
              </div>
            )}

            {/* Quiz questions */}
            {(quizReady || videoEnded) && !showResults && (
              <div className="space-y-6">
                {activeQuiz.map((q, qIdx) => (
                  <div key={q.id} className="p-4 rounded-xl glass-light">
                    <p className="text-sm font-medium text-white mb-3">
                      {qIdx + 1}. {q.question}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, optIdx) => (
                        <button
                          key={optIdx}
                          id={`quiz-q${qIdx}-opt${optIdx}`}
                          onClick={() => handleAnswer(qIdx, optIdx)}
                          className={`text-left px-4 py-2.5 rounded-lg text-sm transition-all
                            ${answers[qIdx] === optIdx
                              ? 'bg-primary-600/30 border border-primary-500/50 text-primary-200'
                              : 'bg-white/[0.03] border border-white/5 text-slate-300 hover:bg-white/[0.06] hover:border-white/10'
                            }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <button
                  id="quiz-submit-btn"
                  onClick={handleSubmitQuiz}
                  disabled={Object.keys(answers).length < activeQuiz.length}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-600 to-purple-600
                             text-white font-semibold text-sm
                             hover:from-primary-500 hover:to-purple-500
                             disabled:opacity-40 disabled:cursor-not-allowed
                             transition-all shadow-lg shadow-primary-600/20"
                >
                  Submit Answers
                </button>
              </div>
            )}

            {/* Results screen */}
            {showResults && (
              <div className="text-center py-8">
                <div className={`text-5xl font-display font-bold mb-2 ${
                  score === activeQuiz.length ? 'text-emerald-400' :
                  score >= activeQuiz.length / 2 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {score}/{activeQuiz.length}
                </div>
                <p className="text-slate-400 text-sm mb-4">
                  {score === activeQuiz.length
                    ? 'Perfect score! Excellent work!'
                    : score >= activeQuiz.length / 2
                      ? 'Good job! Review the material to improve.'
                      : "Keep studying — you'll improve!"}
                </p>

                <div className="space-y-2 text-left mt-6">
                  {activeQuiz.map((q, qIdx) => (
                    <div key={q.id} className="flex items-start gap-2 p-2 rounded-lg glass-light">
                      {answers[qIdx] === q.correct
                        ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        : <XCircle    className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
                      <span className="text-xs text-slate-300">{q.question}</span>
                    </div>
                  ))}
                </div>

                <button
                  id="quiz-retry-btn"
                  onClick={() => { setShowResults(false); setAnswers({}); }}
                  className="mt-4 px-6 py-2 rounded-lg glass text-sm text-white hover:bg-white/10 transition"
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
          <div className="p-5 rounded-2xl glass">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Live Engagement
            </h3>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-3 h-3 rounded-full shadow-lg animate-pulse ${
                engagement === 'High'   ? 'bg-emerald-400 shadow-emerald-400/50' :
                engagement === 'Low'    ? 'bg-red-400 shadow-red-400/50'         :
                'bg-amber-400 shadow-amber-400/50'
              }`} />
              <span className={`badge badge-${engagement.toLowerCase()}`}>{engagement}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Updates every 8 seconds</p>
          </div>

          {/* Behaviour Status */}
          <div className="p-5 rounded-2xl glass">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Behaviour Status
            </h3>
            <div className="flex items-center gap-2 mb-2">
              <Activity className={`w-4 h-4 ${
                behaviour === 'Active'     ? 'text-emerald-400' :
                behaviour === 'Distracted' ? 'text-red-400'     : 'text-amber-400'
              }`} />
              <span className={`badge badge-${behaviour.toLowerCase()}`}>{behaviour}</span>
            </div>
            <div className="mt-3 space-y-2">
              {[['Click Rate', '—'], ['Response', '—'], ['Idle Time', '—']].map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-slate-300">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Session Info */}
          <div className="p-5 rounded-2xl glass">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Session Info
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Course</span>
                <span className="text-slate-300 truncate max-w-[100px] text-right">{videoTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Captions</span>
                <span className="text-slate-300">{transcript.length} segments</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duration</span>
                <span className="text-slate-300 font-mono">{formatTime(sessionTime)}</span>
              </div>
            </div>
          </div>

          {/* Transcript preview */}
          {transcript.length > 0 && (
            <div className="p-5 rounded-2xl glass">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Transcript ({transcript.length})
              </h3>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1" style={{ scrollbarWidth: 'none' }}>
                {transcript.slice(-8).map((item, idx) => (
                  <p key={idx} className="text-[10px] text-slate-400 leading-snug">
                    <span className="text-slate-600 font-mono mr-1">{formatTime(Math.floor(item.timestamp))}</span>
                    {item.text}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Text Chat */}
          <div className="p-5 rounded-2xl glass flex flex-col h-64">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5" />
              Class Chat
            </h3>
            <div className="flex-1 space-y-2 overflow-y-auto mb-3 pr-1" role="log" aria-label="Chat messages">
              {chatMessages.map((c, idx) => (
                <div key={idx} className="p-2 rounded-lg glass-light">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold text-primary-300">{c.user}</span>
                    <span className="text-[10px] text-slate-500">{c.time}</span>
                  </div>
                  <p className="text-xs text-slate-400">{c.msg}</p>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendChat} className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-surface-800 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                placeholder="Type a message…"
                aria-label="Chat message input"
              />
              <button
                type="submit"
                className="p-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition-colors"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Sign Language Input button */}
          <button
            onClick={() => setActiveAlert({ type: 'info', message: 'Sign Language Input mode started.', flash: false, duration: 3000 })}
            className="w-full p-4 rounded-2xl glass hover:bg-emerald-500/10 border border-emerald-500/20 transition-colors flex items-center justify-center gap-3 text-emerald-400 group"
            aria-label="Open sign language input"
          >
            <HandMetal className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="font-semibold text-sm">Use Sign Language</span>
          </button>
        </div>
      </div>
    </div>
  );
}

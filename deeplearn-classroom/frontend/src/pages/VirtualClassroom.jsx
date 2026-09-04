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
  Settings, Type, FastForward, Eye, EyeOff, Maximize, Minimize, Upload, Loader2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

import { loadVideo, loadCaptions }    from '../utils/db';
import { useVideoTranscript }     from '../utils/useVideoTranscript';
import { useQuizGenerator }       from '../utils/useQuizGenerator';
import { useSignLanguage }        from '../utils/useSignLanguage';
import CaptionOverlay             from '../components/CaptionOverlay';
import VisualAlertBanner          from '../components/VisualAlertBanner';
import SignAvatarOverlay          from '../components/SignAvatarOverlay';
import ISLSignToText              from '../components/ISLSignToText';
import { API_BASE }               from '../utils/api';

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
  const [videoSrc,    setVideoSrc]    = useState('');
  const [videoTitle,  setVideoTitle]  = useState('Deep Learning Classroom');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [videoTime,   setVideoTime]   = useState(0);
  const [videoEnded,  setVideoEnded]  = useState(false);
  const [activeRecording, setActiveRecording] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [courseProgress, setCourseProgress] = useState(null);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [videoError, setVideoError] = useState(null);

  // ── Accessibility State ───────────────────────────────────────────────────
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [signLangEnabled, setSignLangEnabled] = useState(true);
  const [captionSize, setCaptionSize] = useState('normal');
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [vttSrc, setVttSrc] = useState('');
  const [captionStatus, setCaptionStatus] = useState('available'); // 'generating' | 'available' | 'unavailable' | 'failed'
  const [islSignToTextOpen, setIslSignToTextOpen] = useState(false);

  // ── Recordings & Videos ───────────────────────────────────────────────────
  const { user, token } = useAuth();
  const [recordings, setRecordings] = useState([]);
  const [loadingRecordings, setLoadingRecordings] = useState(true);
  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [videosError, setVideosError] = useState(null);
  const [recordingsError, setRecordingsError] = useState(null);

  // Synchronize HTML5 video text tracks whenever captionsEnabled or vttSrc changes
  useEffect(() => {
    if (videoRef.current && videoRef.current.textTracks) {
      for (let i = 0; i < videoRef.current.textTracks.length; i++) {
        videoRef.current.textTracks[i].mode = captionsEnabled ? 'showing' : 'hidden';
      }
    }
  }, [captionsEnabled, vttSrc]);

  // ── getPlayableVideoUrl ──────────────────────────────────────────────────
  const getPlayableVideoUrl = useCallback((video) => {
    if (!video) return null;
    const candidates = [
      video.videoUrl,
      video.r2_url,
      video.processed_url,
      video.original_url,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (candidate.startsWith('C:\\') || candidate.startsWith('/home') || candidate.startsWith('/tmp')) continue;
      if (!candidate.startsWith('http')) continue;
      if (window.location.protocol === 'https:' && candidate.startsWith('http:')) {
        return candidate.replace('http:', 'https:');
      }
      return candidate;
    }
    return null;
  }, []);

  // ── handleRetryCaptions ──────────────────────────────────────────────────
  const handleRetryCaptions = useCallback(async () => {
    const vidId = selectedVideo?.video_id || selectedVideo?.videoId;
    if (!vidId) return;
    setCaptionStatus('generating');
    try {
      const res = await fetch(`${API_BASE}/videos/${vidId}/retry-captions`, { method: 'POST' });
      if (res.ok) {
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          try {
            const check = await fetch(`${API_BASE}/video-captions?video_id=${vidId}&format=json`);
            if (check.ok) {
              const d = await check.json();
              if (d.captions && d.captions.length > 0) {
                setSavedCaptions(d.captions);
                setCaptionStatus('available');
                setVttSrc(`${API_BASE}/video-captions?video_id=${vidId}&format=vtt`);
                clearInterval(interval);
              }
            }
          } catch (e) {}
          if (attempts >= 10) clearInterval(interval);
        }, 3000);
      } else {
        setCaptionStatus('unavailable');
      }
    } catch (e) {
      setCaptionStatus('unavailable');
    }
  }, [selectedVideo]);

  // ── playVideo ────────────────────────────────────────────────────────────
  const playVideo = useCallback((v) => {
    if (!v) return;
    const isTeacher = user?.role === 'teacher';
    if (v.is_locked && !isTeacher) {
      setActiveAlert({
        type: 'warning',
        message: 'You must score at least 35% on the previous quiz to unlock this lesson.',
        flash: true,
        duration: 3000
      });
      return;
    }

    const videoUrl = getPlayableVideoUrl(v);
    if (!videoUrl) {
      console.error('[VIDEO_STREAM_FAILED] No playable URL found for video_id=' + v.video_id + ' title=' + v.title, {
        videoUrl: v.videoUrl, r2_url: v.r2_url, processed_url: v.processed_url, original_url: v.original_url
      });
      setVideoError('Video unavailable. No playable URL available for this video.');
      return;
    }

    console.log(`[VIDEO PLAYER] video ID: ${v.video_id || v.videoId} | filename: ${v.filename} | URL: ${videoUrl.substring(0, 80)}...`);

    if (v.video_type === 'ISL') {
      console.log('[AI_VIDEO_RENDERED] video_id=' + v.video_id + ' filename=' + (v.filename || ''));
    }

    setSelectedVideo(v);
    setVideoSrc(videoUrl);
    setVideoTitle(v.title || "Uploaded Video");
    setIsVideoLoaded(true);
    setVideoError(null);
    setActiveRecording(null);
    setVideoEnded(false);
    setQuizReady(false);
    setShowResults(false);
    setAnswers({});
    setSavedCaptions([]);

    const targetVidId = v.video_id || v.videoId;
    const vttUrl = v.caption_url && v.caption_url.includes('format=vtt')
      ? (v.caption_url.startsWith('http') ? v.caption_url : `${API_BASE}${v.caption_url}`)
      : `${API_BASE}/video-captions?video_id=${targetVidId}&format=vtt`;

    setVttSrc(vttUrl);
    if (v.caption_status === 'available' || v.status === 'done') {
      setCaptionStatus('available');
    } else if (v.caption_status === 'processing' || v.caption_status === 'pending') {
      setCaptionStatus('generating');
    } else {
      setCaptionStatus(v.caption_status || 'available');
    }

    console.log(`[CAPTION TRACK] setVttSrc=${vttUrl} status=${v.caption_status} r2_key=${v.r2_captions_key}`);

    fetch(`${API_BASE}/video-captions?video_id=${targetVidId}&format=json`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('No captions');
      })
      .then(data => {
        if (data.captions && data.captions.length > 0) {
          setSavedCaptions(data.captions);
          setCaptionStatus('available');
        } else if (data.caption_status === 'processing' || data.caption_status === 'pending') {
          setCaptionStatus('generating');
        } else {
          setCaptionStatus(data.caption_status === 'failed' ? 'failed' : 'unavailable');
        }
      })
      .catch(() => {
        console.log('No captions found for this video.');
        setCaptionStatus('unavailable');
      });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [user, getPlayableVideoUrl]);



  const localProgress = recordings.length > 0 
    ? Math.round((recordings.filter(r => !r.is_locked).length / recordings.length) * 100) 
    : 0;

  const displayProgress = courseProgress !== null ? courseProgress : localProgress;

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
  const [quizSubmitResult, setQuizSubmitResult] = useState(null);
  const [quizStartTime, setQuizStartTime] = useState(Date.now());

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

      // Log: CLASSROOM_REQUEST_STARTED
      console.log('[CLASSROOM_REQUEST_STARTED] Classroom loading initiated for user:', user?.email, 'role:', user?.role);

      // 1. If we have videoId/jobId/filename in query params, try fetching direct video URL from backend
      if (videoId || jobId || filename) {
        try {
          const uid = user?.user_id || user?.id || user?.teacher_id || user?.student_id;
          const userIdParam = user?.role === 'teacher' 
            ? (uid ? `teacher_id=${uid}` : '') 
            : (uid ? `student_id=${uid}` : '');
          
          const queryStr = [params.toString(), userIdParam].filter(Boolean).join('&');
          const urlRes = await fetch(`${API_BASE}/video-url?${queryStr}`);
          if (urlRes.ok) {
            const urlData = await urlRes.json();
            if (urlData.video_url) {
              const fullUrl = urlData.video_url.startsWith('http') 
                ? urlData.video_url 
                : `${API_BASE}${urlData.video_url}`;
              setVideoSrc(fullUrl);
              setVideoTitle(filename || 'Uploaded Video');
              setVideoError(null);
              loadedVideo = true;
              console.log('[Classroom] Loaded video from backend URL:', fullUrl);
              console.log('[CLASSROOM_ACCESS_GRANTED] Classroom video access granted for user:', user?.email);
            } else {
              console.error('[Access Failure]', {
                file: 'VirtualClassroom.jsx',
                function: 'fetchData (video-url)',
                endpoint: `${API_BASE}/video-url`,
                error: 'No video_url returned from backend',
                rootCause: 'Video is still processing or missing'
              });
            }
          } else {
            console.error('[Access Failure]', {
              file: 'VirtualClassroom.jsx',
              function: 'fetchData (video-url)',
              endpoint: `${API_BASE}/video-url`,
              error: `API returned status ${urlRes.status}`,
              rootCause: 'Authorization or database retrieval error'
            });
          }
        } catch (err) {
          console.warn('[Classroom] Failed to fetch video URL from backend:', err);
          console.error('[Access Failure]', {
            file: 'VirtualClassroom.jsx',
            function: 'fetchData (video-url)',
            endpoint: `${API_BASE}/video-url`,
            error: err.message,
            rootCause: 'Backend network connection error'
          });
        }
      }

      // 2. Fallback to IndexedDB / Window state if backend video URL lookup wasn't performed or failed
      if (!loadedVideo) {
        try {
          const { file, name } = await loadVideo();
          if (file) {
            setVideoSrc(URL.createObjectURL(file));
            setVideoTitle(name);
            setVideoError(null);
            loadedVideo = true;
            console.log('[Classroom] Loaded video from IndexedDB:', name);
            console.log('[CLASSROOM_ACCESS_GRANTED] Classroom IndexedDB video access granted');
          }
        } catch (err) {
          console.error('[Classroom] Failed to load video from IndexedDB:', err);
        }
      }

      if (!loadedVideo && window.uploadedDemoVideo) {
        setVideoSrc(window.uploadedDemoVideo);
        setVideoTitle(window.uploadedDemoTitle || 'Uploaded Video');
        setVideoError(null);
        loadedVideo = true;
        console.log('[CLASSROOM_ACCESS_GRANTED] Classroom demo window video access granted');
      }

      // If we still loaded no video, we just fall back to standard Sintel video (allowed as default/access granted)
      if (!loadedVideo) {
        console.log('[CLASSROOM_ACCESS_GRANTED] Classroom default video access granted');
      }
      setIsVideoLoaded(true);

      // 3. Load saved captions (Window → Backend → IndexedDB)
      try {
        if (window.uploadedDemoCaptions && window.uploadedDemoCaptions.length > 0) {
          console.log('[Classroom] Loaded captions from window:', window.uploadedDemoCaptions.length, 'segments');
          setSavedCaptions(window.uploadedDemoCaptions);
          setCaptionStatus('available');
        } else if (videoId || jobId || filename) {
          // Set WebVTT track URL
          const capParam = videoId ? `video_id=${videoId}` : jobId ? `job_id=${jobId}` : `filename=${encodeURIComponent(filename)}`;
          const vttUrl = `${API_BASE}/video-captions?${capParam}&format=vtt`;
          setVttSrc(vttUrl);
          console.log('[Classroom] Initialized vttSrc for <track>:', vttUrl);

          // Fetch captions JSON from backend
          const capUrl = `${API_BASE}/video-captions?${capParam}&format=json`;
          const capRes = await fetch(capUrl);
          if (capRes.ok) {
            const capData = await capRes.json();
            if (capData.captions && capData.captions.length > 0) {
              console.log('[Classroom] Loaded captions from backend:', capData.captions.length, 'segments');
              setSavedCaptions(capData.captions);
              setCaptionStatus('available');
            } else if (capData.caption_status === 'processing' || capData.caption_status === 'pending') {
              setCaptionStatus('generating');
            } else {
              setCaptionStatus(capData.caption_status === 'failed' ? 'failed' : 'unavailable');
            }
          }
        } else {
          const caps = await loadCaptions();
          if (caps && caps.length > 0) {
            console.log('[Classroom] Loaded captions from IndexedDB:', caps.length, 'segments');
            setSavedCaptions(caps);
            setCaptionStatus('available');
          }
        }
      } catch (err) {
        console.warn('[Classroom] Could not load saved captions:', err);
      }

      console.log('[CLASSROOM_PAGE_RENDERED] VirtualClassroom details successfully loaded and rendered.');
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!videoEnded) return;
    const fullText = transcript.map(t => t.text).join(' ');
    generateQuiz(fullText, 3);
    setQuizReady(true);
  }, [videoEnded, transcript, generateQuiz]);

  const fetchVideos = async () => {
    try {
      setLoadingVideos(true);
      setVideosError(null);
      const uid = user?.user_id || user?.id || user?.teacher_id || user?.student_id;
      const queryParams = new URLSearchParams();
      queryParams.set('course_id', '1');
      if (user?.role === 'student' && uid) {
        queryParams.set('student_id', uid);
      }
      
      // Add timeout to prevent infinite loading
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const fetchUrl = `${API_BASE}/videos?${queryParams.toString()}`;
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(fetchUrl, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('[Access Failure]', {
          file: 'VirtualClassroom.jsx',
          function: 'fetchVideos',
          endpoint: `${API_BASE}/videos`,
          error: `API returned status ${res.status}: ${errText}`,
          rootCause: 'Authorization or database error'
        });
        throw new Error(`Server returned ${res.status}: ${errText.substring(0, 200)}`);
      }
      const data = await res.json();
      const videoList = data.videos || [];
      setVideos(videoList);
      console.log('[VIDEO_LIST_RESPONSE] count=' + videoList.length);
      console.log('[VIDEOS_RENDERED] count=' + videoList.length);
      if (videoList.length > 0) {
        console.log('[VIDEO_RENDER_SUCCESS] Rendered ' + videoList.length + ' video card(s)');
      }

      // Auto-select and play the first uploaded video if no URL param was specified and no video is currently loaded
      const params = new URLSearchParams(window.location.search);
      const hasUrlParam = params.get('video_id') || params.get('job_id') || params.get('filename');
      if (!hasUrlParam && videoList.length > 0) {
        setVideoSrc(currentSrc => {
          if (!currentSrc) {
            const firstPlayable = videoList.find(v => !v.is_locked && (v.status === 'done' || v.upload_status === 'uploaded')) || videoList[0];
            if (firstPlayable) {
              const url = getPlayableVideoUrl(firstPlayable);
              if (url) {
                setVideoTitle(firstPlayable.title || 'Uploaded Video');
                setIsVideoLoaded(true);
                if (firstPlayable.caption_status === 'available' || firstPlayable.status === 'done') {
                  setVttSrc(`${API_BASE}/video-captions?video_id=${firstPlayable.video_id}&format=vtt`);
                }
                return url;
              }
            }
          }
          return currentSrc;
        });
      }
    } catch (err) {
      console.error('[VIDEO_RENDER_FAILED] Error fetching videos:', err);
      console.error('[Access Failure]', {
        file: 'VirtualClassroom.jsx',
        function: 'fetchVideos',
        endpoint: `${API_BASE}/videos`,
        error: err.message,
        rootCause: 'Backend network connection error'
      });
      setVideosError(err.message || 'Failed to load videos. Please try again.');
    } finally {
      setLoadingVideos(false);
    }
  };

  const fetchRecordings = async () => {
    try {
      setLoadingRecordings(true);
      setRecordingsError(null);
      const uid = user?.user_id || user?.id || user?.teacher_id || user?.student_id;
      const url = user?.role === 'teacher' 
        ? `${API_BASE}/recordings${uid ? `?teacher_id=${uid}` : ''}`
        : `${API_BASE}/recordings${uid ? `?student_id=${uid}` : ''}`;
        
      const res = await fetch(url);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('[Access Failure]', {
          file: 'VirtualClassroom.jsx',
          function: 'fetchRecordings',
          endpoint: `${API_BASE}/recordings`,
          error: `API returned status ${res.status}: ${errText}`,
          rootCause: 'Authorization or database error'
        });
        throw new Error(`Server returned ${res.status}: ${errText.substring(0, 200)}`);
      }
      const data = await res.json();
      if (data.recordings) {
        setRecordings(data.recordings);
      }
    } catch (err) {
      console.error('[VIDEO_RENDER_FAILED] Error fetching recordings:', err);
      console.error('[Access Failure]', {
        file: 'VirtualClassroom.jsx',
        function: 'fetchRecordings',
        endpoint: `${API_BASE}/recordings`,
        error: err.message,
        rootCause: 'Backend network connection error'
      });
      setRecordingsError(err.message || 'Failed to load recordings. Please try again.');
    } finally {
      setLoadingRecordings(false);
    }
  };

  const fetchCourseProgress = async () => {
    if (!user || user?.role !== 'student') return;
    try {
      const studentId = user?.student_id || user?.user_id || user?.id;
      if (!studentId) return;
      const res = await fetch(`${API_BASE}/course/progress?student_id=${studentId}&course_id=1`);
      if (res.ok) {
        const data = await res.json();
        setCourseProgress(data.progress_percentage ?? 0);
        console.log('[CLASSROOMS_FETCHED] type=progress percentage=' + (data.progress_percentage ?? 0));
      } else {
        console.error('[Access Failure]', {
          file: 'VirtualClassroom.jsx',
          function: 'fetchCourseProgress',
          endpoint: `${API_BASE}/course/progress`,
          error: `API returned status ${res.status}`,
          rootCause: 'Authorization or database error'
        });
      }
    } catch (err) {
      console.error('Error fetching course progress:', err);
      console.error('[Access Failure]', {
        file: 'VirtualClassroom.jsx',
        function: 'fetchCourseProgress',
        endpoint: `${API_BASE}/course/progress`,
        error: err.message,
        rootCause: 'Backend network connection error'
      });
    }
  };


  useEffect(() => {
    if (user) {
      fetchRecordings();
      fetchVideos();
      fetchCourseProgress();
    } else {
      // Even without a logged-in user, attempt to load public videos
      fetchVideos();
    }
  }, [user]);

  // Auto-refresh when navigating from upload page
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('uploaded') === 'true') {
      console.log('[VIDEO_LIST_REQUEST] Auto-refreshing after upload...');
      fetchVideos();
      // Clean the query param without full page reload
      const cleanUrl = window.location.pathname + window.location.search.replace(/[?&]uploaded=true/, '');
      window.history.replaceState({}, '', cleanUrl || window.location.pathname);
    }
  }, []);

  // Listen for video-list-updated custom event (dispatched from VideoUpload after successful upload)
  useEffect(() => {
    const handleVideoUpdate = () => {
      console.log('[VIDEO_LIST_REQUEST] Received video-list-updated event, refreshing...');
      fetchVideos();
      fetchRecordings();
    };
    window.addEventListener('video-list-updated', handleVideoUpdate);
    return () => window.removeEventListener('video-list-updated', handleVideoUpdate);
  }, []);

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
    if (submittingQuiz) return;
    setSubmittingQuiz(true);
    console.log('[QUIZ_SUBMIT_REQUEST] Submit Answers clicked.');

    const scoreVal = Object.entries(answers).reduce((acc, [qIdx, ans]) =>
      acc + (activeQuiz[parseInt(qIdx)]?.correct === ans ? 1 : 0), 0);
    const passed = scoreVal >= activeQuiz.length * 0.35; // 35% passing grade requirement

    console.log('[QUIZ_VALIDATION_SUCCESS] Answers validated locally.');
    console.log('[QUIZ_SCORE_CALCULATED] Score calculated:', scoreVal, '/', activeQuiz.length, `(${((scoreVal / activeQuiz.length) * 100).toFixed(1)}%)`);

    if (user?.role === 'student') {
      try {
        const studentId = user?.student_id || user?.user_id || user?.id;
        const payload = {
          student_id: studentId,
          quiz_title: videoTitle || "General Quiz",
          recording_id: activeRecording ? activeRecording.recording_id : null,
          time_taken: Math.round((Date.now() - quizStartTime) / 1000) || 30,
          course_id: activeRecording ? activeRecording.course_id : 1,
          questions: activeQuiz.map((q, idx) => ({
            question_text: q.question,
            options: q.options,
            correct_option: q.correct,
            selected_option: answers[idx] !== undefined ? answers[idx] : 0
          }))
        };

        const headers = { 'Content-Type': 'application/json' };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${API_BASE}/quiz/submit`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server returned status ${res.status}`);
        }

        const data = await res.json();
        console.log('[QUIZ_RESULTS_SAVED] Quiz results successfully saved in database.');
        setQuizSubmitResult(data);
        console.log('[RESPONSE_SENT] Quiz response complete.');

        // Update progress and locks immediately
        fetchRecordings();
        fetchVideos();
        fetchCourseProgress();
        setShowResults(true);

      } catch (err) {
        console.error('Failed to submit quiz score:', err);
        setActiveAlert({
          type: 'error',
          message: `Failed to save quiz results: ${err.message}. Please try again.`,
          flash: true,
          duration: 5000
        });
      } finally {
        setSubmittingQuiz(false);
      }
    } else {
      // Teacher or demo fallback
      console.log('[QUIZ_RESULTS_SAVED] Quiz complete (non-student bypass).');
      console.log('[RESPONSE_SENT] Quiz response complete (bypass).');
      setShowResults(true);
      setSubmittingQuiz(false);
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
    <div className="w-full bg-nexus-background min-h-[calc(100vh-4rem)] text-[#131b2e] transition-colors duration-300">
      <style>{`
        .dark-glass-panel card-shadow border border-[#bcc9cd]/40 {
            background: rgba(250, 248, 255, 0.75); border: 1px solid rgba(188, 201, 205, 0.4);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(0, 0, 0, 0.06);
            box-shadow: 0 8px 32px 0 rgba(15, 23, 42, 0.04);
        }
        .dark-glass-high {
            background: rgba(255, 255, 255, 0.95); border: 1px solid rgba(188, 201, 205, 0.5);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid rgba(0, 0, 0, 0.08);
            box-shadow: 0 8px 32px 0 rgba(15, 23, 42, 0.04);
        }
        .emerald-glow {
            box-shadow: 0 0 20px rgba(16, 185, 129, 0.08);
        }
        .interpreter-window {
            border: 2px solid #00687a;
            box-shadow: 0 10px 30px rgba(19, 27, 46, 0.08);
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

      <div className="page-enter bg-nexus-background min-h-screen max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 text-nexus-on-background" role="main" aria-label="Virtual Classroom">

        {/* Visual Alert Banner */}
        <div className="mb-6 w-full max-w-3xl mx-auto">
          <VisualAlertBanner alert={activeAlert} onDismiss={() => setActiveAlert(null)} />
        </div>

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#131b2e] flex items-center gap-3">
              <Monitor className="w-8 h-8 text-primary-500" />
              Virtual Classroom
            </h1>
            <p className="text-[#6d797d] mt-1 text-sm">{videoTitle} — Live Interactive Session</p>
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
              <span className="flex items-center gap-1.5 text-xs text-[#6d797d]">
                <MicOff className="w-4 h-4" /> Captions off
              </span>
            )}

            {/* Live indicator block */}
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="text-[10px] font-bold text-emerald-600 tracking-wider uppercase">LIVE</span>
              <span className="text-[10px] text-[#6d797d] ml-2 font-mono">{formatTime(sessionTime)}</span>
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
        <div className={`grid grid-cols-1 ${signLangEnabled ? 'lg:grid-cols-9' : 'lg:grid-cols-7'} gap-5 transition-all duration-500`}>

          {/* Left / Main — 3 cols */}
          <div className="lg:col-span-5 space-y-4">

            {/* ── Video Player stage ── */}
            <div
              ref={videoContainerRef}
              className={`relative w-full aspect-video rounded-3xl overflow-hidden dark-glass-panel card-shadow border border-[#bcc9cd]/40 emerald-glow group transition-all duration-300 ${isFullscreen ? 'fullscreen-video-container' : ''}`}
            >
              <video
                ref={videoRef}
                src={isVideoLoaded ? videoSrc : ''}
                crossOrigin="anonymous"
                className="w-full h-full object-contain bg-slate-950"
                controls
                onPlay={() => { 
                  console.log('[VIDEO_PLAY_REQUEST] src=' + videoSrc);
                  console.log('[VIDEO_STREAM_STARTED] src=' + videoSrc);
                  setIsPlaying(true); 
                  setVideoEnded(false); 
                }}
                onPlaying={() => {
                  console.log('[VIDEO_PLAYBACK_SUCCESS] src=' + videoSrc);
                }}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={(e) => setVideoTime(e.target.currentTime)}
                onEnded={() => { setIsPlaying(false); setVideoEnded(true); }}
                onError={(e) => {
                  const err = videoRef.current?.error;
                  let errorMsg = "Unable to play this video.";
                  let codeStr = "UNKNOWN";
                  if (err) {
                    if (err.code === 1) { codeStr = "MEDIA_ERR_ABORTED"; errorMsg = "Video loading was interrupted."; }
                    else if (err.code === 2) { codeStr = "MEDIA_ERR_NETWORK"; errorMsg = "Network error while loading the video."; }
                    else if (err.code === 3) { codeStr = "MEDIA_ERR_DECODE"; errorMsg = "This video could not be decoded."; }
                    else if (err.code === 4) { codeStr = "MEDIA_ERR_SRC_NOT_SUPPORTED"; errorMsg = "This video format or URL is not supported."; }
                  }
                  
                  console.error('[VIDEO PLAYER] playback error:', {
                    video_id: selectedVideo?.video_id || selectedVideo?.videoId || 'unknown',
                    filename: selectedVideo?.filename || 'unknown',
                    src: videoSrc,
                    error_code: codeStr,
                    error_message: errorMsg
                  });
                  
                  setVideoError(errorMsg);
                }}
                onLoadedMetadata={() => console.log('[VIDEO_RENDERED] src=' + videoSrc)}
                poster={selectedVideo?.thumbnail || undefined}
              >
                {vttSrc && captionsEnabled && (
                  <track
                    key={vttSrc}
                    kind="captions"
                    src={vttSrc}
                    srcLang="en"
                    label="English"
                    default
                    onLoad={(e) => {
                      console.log('[CAPTION_TRACK_LOADED] src=' + vttSrc);
                      if (e.target && e.target.track) {
                        e.target.track.mode = captionsEnabled ? 'showing' : 'hidden';
                      }
                    }}
                  />
                )}
              </video>

              {!videoSrc && (
                <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-center z-20">
                  <div className="w-16 h-16 rounded-2xl bg-[#00687a]/20 border border-[#00687a]/40 flex items-center justify-center mb-4">
                    <Video className="w-8 h-8 text-[#00687a]" />
                  </div>
                  <p className="text-white font-semibold text-lg">{videos.length === 0 && !loadingVideos ? 'No videos available' : 'Select a lesson to begin'}</p>
                  <p className="text-slate-400 text-xs max-w-sm mt-1">{videos.length === 0 && !loadingVideos ? 'No uploaded lesson videos found in this classroom.' : 'Choose a lesson from the classroom catalog below.'}</p>
                </div>
              )}

              {videoError && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 text-center z-30 backdrop-blur-xs">
                  <AlertCircle className="w-12 h-12 text-rose-500 mb-3 animate-pulse" />
                  <p className="text-white font-semibold text-lg">Video unavailable</p>
                  <p className="text-slate-300 text-xs max-w-md mt-2">{videoError}</p>
                  <button 
                    onClick={async () => {
                      setVideoError(null);
                      try {
                        const uid = user?.user_id || user?.id || user?.teacher_id || user?.student_id;
                        const queryParams = new URLSearchParams();
                        queryParams.set('course_id', '1');
                        if (user?.role === 'student' && uid) {
                          queryParams.set('student_id', uid);
                        }
                        const fetchUrl = `${API_BASE}/videos?${queryParams.toString()}`;
                        const headers = {};
                        if (token) headers['Authorization'] = `Bearer ${token}`;
                        const res = await fetch(fetchUrl, { headers });
                        if (res.ok) {
                          const data = await res.json();
                          const freshList = data.videos || [];
                          setVideos(freshList);
                          const target = selectedVideo 
                            ? (freshList.find(v => (v.video_id && v.video_id === selectedVideo.video_id) || (v.filename && v.filename === selectedVideo.filename)) || freshList[0])
                            : freshList[0];
                          if (target) {
                            playVideo(target);
                            setTimeout(() => {
                              if (videoRef.current) {
                                videoRef.current.load();
                                videoRef.current.play().catch(err => console.log('Retry play failed:', err));
                              }
                            }, 150);
                          }
                        }
                      } catch (retryErr) {
                        console.error('Retry fetch failed:', retryErr);
                      }
                    }} 
                    className="mt-4 px-4 py-2 bg-[#00687a] hover:bg-[#005260] text-white rounded-xl text-xs font-semibold transition-all duration-300 cursor-pointer shadow-md hover:scale-105"
                  >
                    Retry Playback
                  </button>
                </div>
              )}



              {/* Video-ended overlay */}
              {videoEnded && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center pointer-events-none z-10">
                  <CheckCircle className="w-16 h-16 text-emerald-400 mb-3" />
                  <p className="text-white font-semibold text-lg">Video Complete</p>
                  <p className="text-[#6d797d] text-sm mt-1">Quiz generated below</p>
                </div>
              )}

              {/* ISL Interpreter moved to dedicated side column for visibility */}

              {/* Closed Captions In-Player Overlay — rendered on video in both normal and fullscreen */}
              {captionsEnabled && currentCaption && (
                <div className={`absolute left-0 right-0 ${isFullscreen ? 'bottom-20' : 'bottom-12'} z-15 pointer-events-none px-4 flex justify-center transition-all duration-150`}>
                  <div className="max-w-3xl px-4 py-2 rounded-xl bg-black/85 backdrop-blur-md border border-white/10 text-center shadow-2xl">
                    <p className={`${captionSize === 'large' ? 'text-lg sm:text-xl' : captionSize === 'small' ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'} text-white font-medium leading-snug drop-shadow-md`}>
                      {currentCaption}
                    </p>
                  </div>
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
                  <p className="text-xs text-[#6d797d] italic text-center py-2">
                    Captions will appear here when the video plays.
                  </p>
                )}
              </div>
            )}

            {/* ── Accessibility Controls ── */}
            <div className="p-4 rounded-2xl dark-glass-panel card-shadow border border-[#bcc9cd]/40 flex flex-wrap items-center gap-4 shadow-lg border border-slate-200 transition-all duration-300">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary-500" />
                <span className="text-sm font-semibold text-[#131b2e]">Accessibility Controls</span>
              </div>
              <div className="w-px h-6 bg-slate-200 mx-2"></div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setCaptionsEnabled(!captionsEnabled)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${captionsEnabled ? 'bg-primary-500/10 text-primary-600 border border-[#00687a]/20' : 'bg-slate-100 text-[#6d797d] hover:bg-slate-200'}`}
                >
                  {captionsEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  Captions
                </button>

                {/* Caption Status UX Indicator (PRD Section 10) */}
                {captionsEnabled && captionStatus === 'generating' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-600 border border-amber-500/30 animate-pulse">
                    ⏳ Captions generating...
                  </span>
                )}
                {captionsEnabled && captionStatus === 'available' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                    ✓ Captions available
                  </span>
                )}
                {captionsEnabled && (captionStatus === 'unavailable' || captionStatus === 'failed') && (
                  <div className="inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/15 text-rose-600 border border-rose-500/30">
                      ⚠ Captions unavailable
                    </span>
                    <button
                      onClick={handleRetryCaptions}
                      className="px-2 py-1 rounded-lg text-xs font-semibold bg-[#00687a] hover:bg-[#005260] text-white transition-colors cursor-pointer shadow-xs"
                      title="Retry caption generation"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
              
              <button 
                id="toggle-sign-language"
                onClick={() => setSignLangEnabled(!signLangEnabled)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                  signLangEnabled
                    ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20 shadow-sm shadow-purple-500/5'
                    : 'bg-slate-100 text-[#6d797d] hover:bg-slate-200'
                }`}
                aria-pressed={signLangEnabled}
                aria-label="Toggle sign language interpreter"
              >
                <HandMetal className="w-4 h-4" />
                ISL Interpreter Overlay
                {signLangEnabled && signCount > 0 && (
                  <span className="ml-1 text-[10px] font-bold bg-purple-500/20 text-purple-600 px-1.5 py-0.5 rounded-full">
                    {signCount}
                  </span>
                )}
              </button>

              <button
                id="toggle-isl-sign-to-text"
                onClick={() => setIslSignToTextOpen(!islSignToTextOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                  islSignToTextOpen
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-sm shadow-emerald-500/5'
                    : 'bg-slate-100 text-[#6d797d] hover:bg-slate-200'
                }`}
                aria-pressed={islSignToTextOpen}
                aria-label="Toggle ISL Sign Language to Text"
              >
                <HandMetal className="w-4 h-4" />
                ISL Sign → Text
              </button>
              
              <div className="flex items-center gap-2 ml-auto">
                <Type className="w-4 h-4 text-[#6d797d]" />
                <select 
                  value={captionSize} 
                  onChange={(e) => setCaptionSize(e.target.value)}
                  className="bg-white border border-slate-200 text-[#131b2e] text-sm rounded-lg p-1.5 outline-none font-medium focus:ring-1 focus:ring-primary-500"
                >
                  <option value="small">Small text</option>
                  <option value="normal">Normal text</option>
                  <option value="large">Large text</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <FastForward className="w-4 h-4 text-[#6d797d]" />
                <select 
                  value={playbackSpeed} 
                  onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                  className="bg-white border border-slate-200 text-[#131b2e] text-sm rounded-lg p-1.5 outline-none font-medium focus:ring-1 focus:ring-primary-500"
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

            {/* ── ISL Sign to Text Panel ── */}
            {islSignToTextOpen && (
              <ISLSignToText onClose={() => setIslSignToTextOpen(false)} />
            )}

            {/* ── Quiz Section (Bento Card Style) ── */}
            <div className="p-8 rounded-3xl dark-glass-panel card-shadow border border-[#bcc9cd]/40 flex flex-col gap-6 border border-slate-200 transition-all duration-300">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg text-purple-600">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#131b2e]">Quick Assessment</h3>
                  <p className="text-xs text-[#6d797d]">
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
                <div className="text-center py-8 text-[#6d797d]">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-40 animate-pulse text-primary-500" />
                  <p className="text-sm">Finish watching the video to unlock the quiz.</p>
                </div>
              )}

              {/* Quiz questions */}
              {(quizReady || videoEnded) && !showResults && (
                <div className="space-y-6">
                  {activeQuiz.map((q, qIdx) => (
                    <div key={q.id} className="p-5 rounded-2xl bg-slate-50/50 border border-[#bcc9cd]/25 hover:border-[#00687a]/30 transition-all duration-300">
                      <p className="text-sm font-semibold text-[#131b2e] mb-4">
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
                                  ? 'bg-primary-50 border-2 border-[#00687a] text-primary-900 font-semibold'
                                  : 'bg-white border border-slate-200 text-[#3d494c] hover:bg-slate-50 hover:text-[#131b2e]'
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
                    disabled={submittingQuiz || Object.keys(answers).length < activeQuiz.length}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary-600 to-purple-600
                               text-white font-bold text-sm hover:brightness-110
                               disabled:opacity-40 disabled:cursor-not-allowed
                               transition-all shadow-lg shadow-primary-600/10"
                  >
                    {submittingQuiz ? 'Submitting Answers...' : 'Submit Answers'}
                  </button>
                </div>
              )}

              {/* Results screen */}
              {showResults && (
                <div className="text-center py-8">
                  <div className={`text-5xl font-display font-bold mb-2 ${
                    score === activeQuiz.length ? 'text-emerald-600' :
                    (quizSubmitResult ? quizSubmitResult.attempt?.passed : score >= activeQuiz.length * 0.35) ? 'text-emerald-600' : 'text-red-500'
                  }`}>
                    {score}/{activeQuiz.length}
                  </div>
                  <p className="text-[#6d797d] text-sm mb-4">
                    Score Percentage: <span className="font-bold">{((score / activeQuiz.length) * 100).toFixed(1)}%</span>
                  </p>
                  <p className="text-[#3d494c] text-sm mb-6">
                    {quizSubmitResult ? quizSubmitResult.message : (score >= activeQuiz.length * 0.35 ? 'Success! Lesson completed and next video unlocked.' : 'You must score at least 35% to unlock the next lesson.')}
                  </p>

                  {quizSubmitResult && quizSubmitResult.weak_areas && quizSubmitResult.weak_areas.length > 0 && (
                    <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-left max-w-xl mx-auto">
                      <span className="text-xs font-bold text-amber-800 block mb-1.5">Recommended Areas of Improvement:</span>
                      <div className="flex flex-wrap gap-2">
                        {quizSubmitResult.weak_areas.map((area, idx) => (
                          <span key={idx} className="px-2.5 py-1 bg-white text-amber-700 border border-amber-200 text-[10px] font-semibold rounded-full">
                            {area}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 text-left mt-6 max-w-xl mx-auto">
                    {activeQuiz.map((q, qIdx) => (
                      <div key={q.id} className="flex items-start gap-3 p-4 rounded-xl bg-white border border-[#bcc9cd]/25 shadow-sm">
                        {answers[qIdx] === q.correct
                          ? <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                          : <XCircle    className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
                        <div>
                          <span className="text-xs text-[#6d797d] block mb-1">Question {qIdx + 1}</span>
                          <span className="text-sm text-[#131b2e]">{q.question}</span>
                          {answers[qIdx] !== q.correct && (
                            <p className="text-xs text-red-500 mt-1">
                              Your answer: <span className="font-semibold">{q.options[answers[qIdx]] || 'None'}</span> · Correct: <span className="font-semibold text-emerald-600">{q.options[q.correct]}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    id="quiz-retry-btn"
                    onClick={() => { setShowResults(false); setAnswers({}); setQuizStartTime(Date.now()); setQuizSubmitResult(null); }}
                    className="mt-8 px-6 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-[#131b2e] text-sm transition-all border border-slate-200"
                  >
                    Retry Quiz
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── ISL Interpreter Panel — dedicated column ── */}
          {signLangEnabled && (
            <div className="lg:col-span-2 sign-panel-enter">
              <div className="sticky top-20" style={{ maxHeight: 'calc(100vh - 100px)' }}>
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

          {/* ── Sidebar — 1 col ── */}
          <div className="lg:col-span-2 space-y-3">

            {/* Live Engagement */}
            <div className="p-4 rounded-2xl dark-glass-panel card-shadow border border-[#bcc9cd]/40 flex flex-col gap-3 border border-slate-200">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-[#6d797d] uppercase tracking-wider">
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
                  className="h-full bg-gradient-to-r from-[#00687a] to-[#006a63] transition-all duration-1000"
                  style={{
                    width: engagement === 'High' ? '88%' : engagement === 'Medium' ? '65%' : '38%'
                  }}
                />
              </div>
              <p className="text-[10px] text-[#6d797d] leading-tight">
                {engagement === 'High' ? 'Interaction levels are peaking in the current segment.' :
                 engagement === 'Medium' ? 'Classroom attention is steady.' :
                 'Attention levels are low. Consider triggering a stretch break.'}
              </p>
            </div>

            {/* Behaviour Status */}
            <div className="p-4 rounded-2xl dark-glass-panel card-shadow border border-[#bcc9cd]/40 flex flex-col gap-3 border border-slate-200">
              <h3 className="text-xs font-semibold text-[#6d797d] uppercase tracking-wider">
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
              <div className="space-y-2 border-t border-[#bcc9cd]/25 pt-3">
                {[['Click Rate', 'Steady'], ['Response', 'Good'], ['Idle Time', 'Low']].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-[#6d797d]">{k}</span>
                    <span className="text-[#131b2e] font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Session Info */}
            <div className="p-4 rounded-2xl dark-glass-panel card-shadow border border-[#bcc9cd]/40 flex flex-col gap-2.5 border border-slate-200">
              <h3 className="text-xs font-semibold text-[#6d797d] uppercase tracking-wider">
                Session Info
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#6d797d]">Course</span>
                  <span className="text-[#131b2e] font-medium truncate max-w-[120px] text-right" title={videoTitle}>{videoTitle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6d797d]">Captions</span>
                  <span className="text-[#131b2e] font-medium">{transcript.length} segments</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6d797d]">Duration</span>
                  <span className="text-[#131b2e] font-mono">{formatTime(sessionTime)}</span>
                </div>
              </div>
            </div>

            {/* Transcript preview */}
            {transcript.length > 0 && (
              <div className="p-4 rounded-2xl dark-glass-panel card-shadow border border-[#bcc9cd]/40 flex flex-col gap-2.5 border border-slate-200">
                <h3 className="text-xs font-semibold text-[#6d797d] uppercase tracking-wider">
                  Transcript ({transcript.length})
                </h3>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1" style={{ scrollbarWidth: 'none' }}>
                  {transcript.slice(-8).map((item, idx) => (
                    <p key={idx} className="text-[10px] text-[#3d494c] leading-snug">
                      <span className="text-[#6d797d] font-mono mr-1">{formatTime(Math.floor(item.timestamp))}</span>
                      {item.text}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Text Chat */}
            <div className="p-4 rounded-2xl dark-glass-panel card-shadow border border-[#bcc9cd]/40 flex flex-col h-[350px] border border-slate-200">
              <div className="pb-3 border-b border-[#bcc9cd]/25 flex items-center justify-between">
                <span className="text-xs font-semibold text-[#6d797d] uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-purple-500" />
                  Class Chat
                </span>
                <span className="text-[10px] text-emerald-600 font-medium">24 Active</span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto my-3 pr-1" role="log" aria-label="Chat messages">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-[#6d797d]">
                    <MessageSquare className="w-8 h-8 opacity-20 mb-2" />
                    <p className="text-xs">No messages yet. Say hello!</p>
                  </div>
                ) : (
                  chatMessages.map((c, idx) => (
                    <div key={idx} className="flex gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-200 text-[10px] font-bold text-[#131b2e] flex items-center justify-center shrink-0">
                        {c.user === 'You' ? 'ME' : c.user.split(' ').map(n=>n[0]).join('').toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] font-semibold text-[#131b2e]">{c.user}</span>
                          <span className="text-[9px] text-[#6d797d]">{c.time}</span>
                        </div>
                        <p className="text-xs bg-slate-50 border border-[#bcc9cd]/25 p-2 rounded-2xl rounded-tl-none text-[#131b2e] leading-relaxed">{c.msg}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendChat} className="flex gap-2 pt-2 border-t border-[#bcc9cd]/25">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#131b2e] placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:bg-white"
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
                className="w-full py-4 rounded-2xl bg-gradient-to-br from-[#00687a] to-[#006a63] text-white font-bold flex items-center justify-center gap-3 shadow-lg hover:scale-[1.02] transition-transform"
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
                  className="p-4 rounded-2xl dark-glass-panel card-shadow border border-[#bcc9cd]/40 hover:bg-slate-100 border border-[#bcc9cd]/25 transition-all flex flex-col items-center gap-2 group"
                >
                  <HandMetal className="w-5 h-5 text-[#6d797d] group-hover:text-primary-500 transition-colors" />
                  <span className="text-xs font-medium text-[#3d494c]">Raise Hand</span>
                </button>
                <button 
                  onClick={() => {
                    setActiveAlert({ type: 'info', message: 'Notes panel opened.', flash: false, duration: 2000 });
                  }}
                  className="p-4 rounded-2xl dark-glass-panel card-shadow border border-[#bcc9cd]/40 hover:bg-slate-100 border border-[#bcc9cd]/25 transition-all flex flex-col items-center gap-2 group"
                >
                  <Settings className="w-5 h-5 text-[#6d797d] group-hover:text-primary-500 transition-colors" />
                  <span className="text-xs font-medium text-[#3d494c]">Take Notes</span>
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ── Recorded Classes Section ── */}
        <div className="mt-16 border-t border-slate-200 pt-12">
          <h2 className="text-2xl font-display font-bold text-[#131b2e] flex items-center gap-3 mb-8">
            <Video className="w-7 h-7 text-primary-500" />
            Classroom Video Catalog
          </h2>

          {user?.role === 'student' && displayProgress !== null && (
            <div className="mb-8 p-6 rounded-3xl dark-glass-panel card-shadow border border-[#bcc9cd]/40 border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-[#131b2e]">Your Course progression Progress</h3>
                <p className="text-xs text-[#6d797d]">Complete quizzes with &ge; 35% to unlock subsequent lessons.</p>
              </div>
              <div className="w-full md:w-2/3 flex items-center gap-4">
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-primary-500 transition-all duration-500" 
                    style={{ width: `${displayProgress}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-emerald-600 shrink-0">{displayProgress}% Completed</span>
              </div>
            </div>
          )}

          <div className="mb-12">
            <h3 className="text-lg font-semibold text-[#131b2e] mb-4 flex items-center gap-2">
              <Video className="w-5 h-5 text-purple-400" />
              Classroom Lesson Videos
            </h3>
            {loadingVideos ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#00687a]"></div>
                <span className="ml-3 text-sm text-[#6d797d]">Loading videos...</span>
              </div>
            ) : videosError ? (
              <div className="text-center py-8 rounded-xl border border-red-200 bg-red-50 mb-8">
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-red-600 text-sm font-semibold mb-1">Failed to load videos</p>
                <p className="text-red-400 text-xs mb-3 max-w-md mx-auto">{videosError}</p>
                <button 
                  onClick={fetchVideos}
                  className="px-4 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : videos.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200 mb-8">
                <Video className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-[#6d797d] text-sm font-medium">No uploaded lesson videos available yet.</p>
                {user?.role === 'teacher' && (
                  <a href="/video-upload" className="inline-block mt-3 px-4 py-1.5 rounded-lg bg-primary-500/10 text-primary-600 text-xs font-semibold hover:bg-primary-500/20 transition-colors">
                    Upload your first video
                  </a>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {(() => {
                  const originalVideos = videos.filter(v => v.video_type !== 'ISL');
                  const islVideos = videos.filter(v => v.video_type === 'ISL');
                  
                  return originalVideos.map(video => {
                    const islVideo = islVideos.find(av => av.original_video_id === video.video_id || av.originalVideoId === video.video_id);
                    if (islVideo) {
                      islVideo.is_locked = video.is_locked;
                    }




                    // Download url helper
                    const getDownloadUrl = (v) => {
                      const rawUrl = v.original_url || v.processed_url || v.r2_url || '';
                      const uid = user?.user_id || user?.id || user?.teacher_id || user?.student_id;
                      const authParam = user?.role === 'teacher' 
                        ? (uid ? `teacher_id=${uid}` : '') 
                        : (uid ? `student_id=${uid}` : '');
                      if (rawUrl && !rawUrl.startsWith('http')) {
                        return `${API_BASE}${rawUrl}${authParam ? (rawUrl.includes('?') ? '&' : '?') + authParam : ''}`;
                      }
                      if (rawUrl && authParam && !rawUrl.includes('student_id=') && !rawUrl.includes('teacher_id=')) {
                        return `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}${authParam}`;
                      }
                      return rawUrl;
                    };

                    return (
                      <React.Fragment key={video.video_id}>
                        {/* Original Video Card */}
                        <div 
                          className={`dark-glass-panel card-shadow border border-[#bcc9cd]/40 rounded-2xl overflow-hidden border border-[#bcc9cd]/25 transition-all duration-300 flex flex-col group ${
                            video.is_locked ? 'opacity-50 cursor-not-allowed' : (video.status === 'processing' || video.status === 'uploading') ? 'opacity-80' : 'hover:border-[#00687a]/40 cursor-pointer hover:shadow-lg'
                          }`}
                          onClick={() => (video.status !== 'processing' && video.status !== 'uploading') && playVideo(video)}
                        >
                          <div className="relative aspect-video bg-slate-950 group">
                            {video.thumbnail ? (
                              <img src={video.thumbnail} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-slate-900">
                                 <Video className="w-10 h-10 text-[#6d797d]" />
                              </div>
                            )}
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-blue-500 text-white text-[9px] font-bold uppercase tracking-wider">
                              Original Video
                            </div>
                            {(video.status === 'processing' || video.status === 'uploading') && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs">
                                <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-2" />
                                <span className="text-white/90 text-[10px] font-semibold">{video.status === 'uploading' ? 'Uploading...' : 'Processing...'}</span>
                              </div>
                            )}
                            {video.status !== 'processing' && video.status !== 'uploading' && video.is_locked ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-xs">
                                <Lock className="w-6 h-6 text-white/60 mb-2" />
                                <span className="text-white/80 text-[10px] font-semibold px-4 text-center">Locked: complete previous quiz</span>
                              </div>
                            ) : video.status !== 'processing' && video.status !== 'uploading' && (
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40">
                                <div className="w-10 h-10 rounded-full bg-[#00687a] text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                                  <Play className="w-5 h-5 fill-white ml-0.5" />
                                </div>
                              </div>
                            )}
                          </div>
                          
                          <div className="p-4 flex flex-col flex-1">
                            <h3 className="font-bold text-[#131b2e] text-sm mb-1 truncate" title={video.title}>
                              {video.title}
                            </h3>
                            <div className="space-y-1.5 mb-3">
                              <p className="text-[10px] text-[#6d797d] flex items-center gap-1.5">
                                Uploader: {video.uploader}
                              </p>
                              <p className="text-[10px] text-[#6d797d] flex items-center gap-1.5">
                                Uploaded: {new Date(video.uploaded_at).toLocaleDateString()}
                              </p>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                  video.caption_status === 'available' ? 'bg-emerald-100 text-emerald-700' :
                                  video.caption_status === 'failed' ? 'bg-red-100 text-red-600' :
                                  'bg-amber-100 text-amber-700'
                                }`}>
                                  CC {video.caption_status || 'pending'}
                                </span>
                                <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                  video.signing_status === 'available' ? 'bg-purple-100 text-purple-700' :
                                  video.signing_status === 'failed' ? 'bg-red-100 text-red-600' :
                                  'bg-slate-100 text-slate-500'
                                }`}>
                                  ISL {video.signing_status || 'pending'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-[#bcc9cd]/25 mt-auto" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => playVideo(video)}
                                disabled={video.status === 'processing' || video.status === 'uploading'}
                                className={`text-xs font-bold flex items-center gap-1 ${video.status === 'processing' || video.status === 'uploading' ? 'text-slate-400 cursor-not-allowed' : 'text-primary-600 hover:text-primary-700'}`}
                              >
                                <Play className="w-3 h-3 fill-primary-600" /> Play
                              </button>
                              <a
                                href={getDownloadUrl(video)}
                                download
                                className="text-xs font-bold text-[#00687a] hover:text-[#005260] flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" /> Download
                              </a>
                            </div>
                          </div>
                        </div>

                        {/* Associated ISL Video Card */}
                        {islVideo ? (
                          <div 
                            className={`dark-glass-panel card-shadow border border-[#bcc9cd]/40 rounded-2xl overflow-hidden border border-[#bcc9cd]/25 transition-all duration-300 flex flex-col group ${
                              video.is_locked ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#00687a]/40 cursor-pointer hover:shadow-lg'
                            }`}
                            onClick={() => playVideo(islVideo)}
                          >
                            {(() => {
                              console.log('[AI_VIDEO_RENDERED] video_id=' + islVideo.video_id + ' filename=' + (islVideo.filename || ''));
                              return null;
                            })()}
                            <div className="relative aspect-video bg-slate-950 group">
                              {islVideo.thumbnail ? (
                                <img src={islVideo.thumbnail} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-slate-900">
                                   <Video className="w-10 h-10 text-[#6d797d]" />
                                </div>
                              )}
                              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-purple-600 text-white text-[9px] font-bold uppercase tracking-wider">
                                🤟 ISL Interpreter
                              </div>
                              {video.is_locked ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-xs">
                                  <Lock className="w-6 h-6 text-white/60 mb-2" />
                                  <span className="text-white/80 text-[10px] font-semibold px-4 text-center">Locked: complete previous quiz</span>
                                </div>
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40">
                                  <div className="w-10 h-10 rounded-full bg-[#00687a] text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                                    <Play className="w-5 h-5 fill-white ml-0.5" />
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            <div className="p-4 flex flex-col flex-1">
                              <h3 className="font-bold text-[#131b2e] text-sm mb-1 truncate" title={islVideo.title}>
                                {islVideo.title}
                              </h3>
                              <div className="space-y-1.5 mb-3">
                                <p className="text-[10px] text-[#6d797d] flex items-center gap-1.5">
                                  Uploader: {islVideo.uploader}
                                </p>
                                <p className="text-[10px] text-[#6d797d] flex items-center gap-1.5">
                                  Uploaded: {new Date(islVideo.uploaded_at).toLocaleDateString()}
                                </p>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                    CC available
                                  </span>
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                                    ISL available
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-3 border-t border-[#bcc9cd]/25 mt-auto" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => playVideo(islVideo)}
                                  className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1"
                                >
                                  <Play className="w-3 h-3 fill-purple-600" /> Play ISL Video
                                </button>
                                <a
                                  href={getDownloadUrl(islVideo)}
                                  download
                                  className="text-xs font-bold text-purple-500 hover:text-purple-600 flex items-center gap-1"
                                >
                                  <Download className="w-3 h-3" /> Download
                                </a>
                              </div>
                            </div>
                          </div>
                        ) : (video.signing_status === 'processing' || video.signing_status === 'pending') ? (
                          <div className="dark-glass-panel card-shadow border border-purple-200/40 rounded-2xl p-5 flex flex-col justify-center items-center text-center bg-purple-50/20">
                            <Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-2" />
                            <p className="text-xs font-semibold text-purple-700">🤟 ISL video is being generated...</p>
                            <p className="text-[10px] text-[#6d797d] mt-1">Overlay and signing translation in progress</p>
                          </div>
                        ) : video.signing_status === 'failed' ? (
                          <div className="dark-glass-panel card-shadow border border-red-200/40 rounded-2xl p-5 flex flex-col justify-center items-center text-center bg-red-50/20">
                            <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                            <p className="text-xs font-semibold text-red-700">🤟 ISL generation failed</p>
                            <p className="text-[10px] text-red-500/80 mt-1">You can still watch the original video</p>
                          </div>
                        ) : null}
                      </React.Fragment>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-[#131b2e] mb-4 flex items-center gap-2">
              <Video className="w-5 h-5 text-emerald-400" />
              Recorded Live Sessions
            </h3>
            {loadingRecordings ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00687a]"></div>
                <span className="ml-3 text-sm text-[#6d797d]">Loading recordings...</span>
              </div>
            ) : recordingsError ? (
              <div className="text-center py-12 rounded-3xl border border-red-200 bg-red-50">
                <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
                <h3 className="text-lg font-bold text-red-600">Failed to load recordings</h3>
                <p className="text-red-400 text-xs mb-3 max-w-md mx-auto">{recordingsError}</p>
                <button 
                  onClick={fetchRecordings}
                  className="px-4 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : recordings.length === 0 ? (
              <div className="text-center py-16 dark-glass-panel card-shadow border border-[#bcc9cd]/40 rounded-3xl border border-slate-200">
                <Video className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-[#131b2e]">No recordings found</h3>
                <p className="text-[#6d797d] text-sm">Class recordings will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {recordings.map(recording => (
                  <div 
                    key={recording.recording_id} 
                    className={`dark-glass-panel card-shadow border border-[#bcc9cd]/40 rounded-2xl overflow-hidden border border-[#bcc9cd]/25 transition-all duration-300 flex flex-col group ${
                      recording.is_locked ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#00687a]/40 cursor-pointer hover:shadow-lg'
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
                           <Video className="w-10 h-10 text-[#6d797d]" />
                        </div>
                      )}
                      
                      {recording.is_locked ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-xs">
                          <Lock className="w-6 h-6 text-white/60 mb-2" />
                          <span className="text-white/80 text-[10px] font-semibold px-4 text-center">{recording.locked_reason}</span>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40">
                          <div className="w-10 h-10 rounded-full bg-[#00687a] text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                            <Play className="w-5 h-5 fill-white ml-0.5" />
                          </div>
                        </div>
                      )}

                      <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 text-white text-[10px] font-mono backdrop-blur-xs">
                        {Math.floor(recording.duration / 60)}:{(Math.floor(recording.duration % 60)).toString().padStart(2, '0')}
                      </div>
                    </div>
                    
                    <div className="p-4 flex flex-col flex-1">
                      <h3 className="font-bold text-[#131b2e] text-sm mb-1 truncate" title={recording.class_title || "Virtual Class Session"}>
                        {recording.class_title || "Virtual Class Session"}
                      </h3>
                      
                      <div className="space-y-1 mt-auto">
                        <p className="text-[10px] text-[#6d797d] flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" />
                          {new Date(recording.recording_timestamp).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#bcc9cd]/25">
                        <a 
                          href={`${API_BASE}/recordings/${recording.course_id}/${recording.session_id}/${recording.file_path}`}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className={`flex items-center gap-1.5 text-[10px] font-semibold transition-colors ${
                            recording.is_locked 
                              ? 'text-[#6d797d] cursor-not-allowed pointer-events-none' 
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


/**
 * ISLSignToText.jsx
 * -----------------
 * Real Live Indian Sign Language (ISL) Recognition → Text Component.
 *
 * Pipeline:
 *   Live Camera (Webcam)
 *     ↓
 *   Frame Capture (Video Frame Canvas)
 *     ↓
 *   MediaPipe Real Hand Detection (21 3D Landmarks)
 *     ↓
 *   Landmark Mesh & Skeleton Overlay
 *     ↓
 *   ISL Landmark Geometry & CNN Classification
 *     ↓
 *   Temporal Consensus & Duplicate Prevention
 *     ↓
 *   Sentence Builder & Text Output (with TTS & Clipboard Copy)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera, CameraOff, HandMetal, Trash2, Copy, Volume2,
  Loader2, AlertCircle, X, Delete, RefreshCw, CircleDot, Check,
  BookOpen, ChevronDown, ChevronUp, Sparkles, Eye, EyeOff, Activity,
} from 'lucide-react';
import { API_BASE } from '../utils/api';

// ── Tunable Configuration Constants ────────────────────────────────────────
const FRAME_SAMPLE_INTERVAL_MS = 250;   // Process 1 frame every 250ms (4 FPS for smooth recognition)
const SEQUENCE_LENGTH          = 5;     // Rolling buffer of recent frames
const PREDICTION_BUFFER_SIZE   = 4;     // Rolling consensus buffer of predictions
const MIN_MATCHES_REQUIRED     = 2;     // Accept word when >= 2 matches in consensus buffer
const CONFIDENCE_THRESHOLD     = 0.50;  // Minimum confidence threshold
const NEUTRAL_GAP_COUNT        = 2;     // Consecutive no-hand / neutral frames to allow re-signing

// MediaPipe 21 Hand Landmark Connections
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],         // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],         // Index
  [5, 9], [9, 10], [10, 11], [11, 12],    // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],  // Ring
  [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [0, 17],                                // Palm Base
];

// ── Supported ISL Vocabulary Categories ──────────────────────────────────────
const ISL_VOCABULARY_CATEGORIES = {
  "Core Greetings & Expressions": [
    "namaste", "hello", "welcome", "dhanyavaad", "thank_you", "good", "bad", "happy", "sad",
  ],
  "Conversational & Interaction": [
    "yes", "no", "help", "stop", "understand", "repeat", "question", "learn", "teacher", "student",
  ],
  "Common Signs & Numbers": [
    "ok", "peace", "victory", "i_love_you", "call_me", "one", "two", "three", "four", "five",
  ],
  "ISL Alphabet (A-Z)": [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  ],
  "Time & Modifiers": [
    "morning", "afternoon", "evening", "night", "today", "tomorrow", "yesterday",
    "big", "small", "tall", "short", "fast", "slow",
  ],
};

export default function ISLSignToText({ onClose }) {
  // Camera state: 'off' | 'requesting_permission' | 'starting' | 'on' | 'error'
  const [cameraStatus, setCameraStatus]       = useState('off');
  const [cameraError, setCameraError]         = useState(null);
  const [cameraErrorType, setCameraErrorType] = useState(null);

  const videoRef         = useRef(null);
  const canvasRef        = useRef(null);
  const overlayCanvasRef = useRef(null);
  const streamRef        = useRef(null);

  // Model / Prediction State
  const [modelStatus, setModelStatus]         = useState('idle');
  const [currentSign, setCurrentSign]         = useState(null);
  const [confidence, setConfidence]           = useState(0);
  const [recognizedText, setRecognizedText]   = useState('');
  const [recognitionStatus, setRecognitionStatus] = useState('idle');
  const [handsCount, setHandsCount]           = useState(0);
  const [landmarksCount, setLandmarksCount]   = useState(0);

  // Debug HUD State
  const [showDebugHud, setShowDebugHud]       = useState(false);
  const [framesProcessed, setFramesProcessed] = useState(0);
  const [fps, setFps]                         = useState(0);
  const [videoDims, setVideoDims]             = useState({ width: 1280, height: 720 });

  // UI state
  const [copyFeedback, setCopyFeedback]   = useState(false);
  const [speakFeedback, setSpeakFeedback] = useState(null);
  const [showVocab, setShowVocab]         = useState(false);

  // Internal refs for concurrency & temporal smoothing
  const isStartingRef         = useRef(false);
  const isProcessingRef       = useRef(false);
  const frameBufferRef        = useRef([]);
  const predictionBufferRef   = useRef([]);
  const lastAcceptedSignRef   = useRef(null);
  const neutralCountRef       = useRef(0);
  const recognitionTimerRef   = useRef(null);
  const isMountedRef          = useRef(true);
  const frameCountRef         = useRef(0);
  const lastFpsTimestampRef   = useRef(Date.now());

  /** Full cleanup: stop camera tracks, clear intervals, reset inference state */
  const cleanupAll = useCallback(() => {
    if (recognitionTimerRef.current) {
      clearInterval(recognitionTimerRef.current);
      recognitionTimerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.warn('[ISL] Error stopping track:', e);
        }
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch (e) {}
      videoRef.current.srcObject = null;
    }

    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }

    isProcessingRef.current = false;
    isStartingRef.current = false;
    frameBufferRef.current = [];
    predictionBufferRef.current = [];
    neutralCountRef.current = 0;
    frameCountRef.current = 0;
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupAll();
    };
  }, [cleanupAll]);

  // ── Draw Landmark Skeleton on Overlay Canvas ──────────────────────────────
  const drawLandmarksOverlay = useCallback((landmarksList) => {
    if (!overlayCanvasRef.current || !videoRef.current) return;
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;

    const w = video.videoWidth || canvas.clientWidth || 640;
    const h = video.videoHeight || canvas.clientHeight || 360;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    if (!landmarksList || landmarksList.length === 0) return;

    landmarksList.forEach(landmarks => {
      if (!landmarks || landmarks.length !== 21) return;

      // 1. Draw Skeleton Lines
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
        const p1 = landmarks[startIdx];
        const p2 = landmarks[endIdx];
        if (p1 && p2) {
          ctx.beginPath();
          ctx.moveTo(p1.x * w, p1.y * h);
          ctx.lineTo(p2.x * w, p2.y * h);
          ctx.stroke();
        }
      });

      // 2. Draw Landmark Points (Joints & Fingertips)
      landmarks.forEach((lm, idx) => {
        const x = lm.x * w;
        const y = lm.y * h;
        const isFingertip = [4, 8, 12, 16, 20].includes(idx);
        const isWrist = idx === 0;

        ctx.beginPath();
        if (isFingertip) {
          ctx.arc(x, y, 6, 0, 2 * Math.PI);
          ctx.fillStyle = '#34d399';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (isWrist) {
          ctx.arc(x, y, 7, 0, 2 * Math.PI);
          ctx.fillStyle = '#059669';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.arc(x, y, 4, 0, 2 * Math.PI);
          ctx.fillStyle = '#6ee7b7';
          ctx.fill();
        }
      });
    });
  }, []);

  // ── Process Prediction with Temporal Smoothing ───────────────────────────
  const processWordPrediction = useCallback((prediction, conf, detectedHandsCount) => {
    if (!isMountedRef.current) return;

    setConfidence(conf);

    if (detectedHandsCount === 0 || conf < CONFIDENCE_THRESHOLD || !prediction || prediction === 'Sign not recognized') {
      neutralCountRef.current += 1;
      setRecognitionStatus(detectedHandsCount > 0 ? 'low-confidence' : 'idle');
      setCurrentSign(null);

      // Reset last accepted sign after neutral gap so user can sign it again
      if (neutralCountRef.current >= NEUTRAL_GAP_COUNT) {
        lastAcceptedSignRef.current = null;
      }
      return;
    }

    // High-confidence prediction
    neutralCountRef.current = 0;
    setRecognitionStatus('recognizing');
    setCurrentSign(prediction);

    // Push into consensus buffer
    const buffer = predictionBufferRef.current;
    buffer.push(prediction);
    if (buffer.length > PREDICTION_BUFFER_SIZE) {
      buffer.shift();
    }

    // Tally consensus counts
    const counts = {};
    for (const p of buffer) {
      counts[p] = (counts[p] || 0) + 1;
    }

    let bestWord = null;
    let bestCount = 0;
    for (const [w, count] of Object.entries(counts)) {
      if (count > bestCount) {
        bestCount = count;
        bestWord = w;
      }
    }

    // Accept word when consensus is reached and not repeating the same gesture
    if (bestCount >= MIN_MATCHES_REQUIRED && bestWord !== lastAcceptedSignRef.current) {
      lastAcceptedSignRef.current = bestWord;
      predictionBufferRef.current = [];

      console.log(`[ISL] Accepted word into sentence: ${bestWord}`);

      setRecognizedText(prev => {
        const cleaned = prev ? prev.trim() : '';
        return cleaned ? `${cleaned} ${bestWord}` : bestWord;
      });
    }
  }, []);

  // ── Live Frame Capture & ISL Recognition Step ─────────────────────────────
  const performRecognitionStep = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (!videoRef.current || !canvasRef.current || !streamRef.current || !streamRef.current.active) return;
    const video = videoRef.current;
    if (video.readyState < 2 || video.paused || video.ended) return;

    isProcessingRef.current = true;

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = 320;
      canvas.height = 240;

      // Capture frame from video
      ctx.drawImage(video, 0, 0, 320, 240);
      const frameDataUrl = canvas.toDataURL('image/jpeg', 0.82);

      // Track FPS & frames processed
      frameCountRef.current += 1;
      setFramesProcessed(frameCountRef.current);
      const now = Date.now();
      if (now - lastFpsTimestampRef.current >= 1000) {
        setFps(Math.round((frameCountRef.current / (now - lastFpsTimestampRef.current)) * 1000));
        lastFpsTimestampRef.current = now;
        frameCountRef.current = 0;
      }

      // Update frame sequence buffer
      frameBufferRef.current.push(frameDataUrl);
      if (frameBufferRef.current.length > SEQUENCE_LENGTH) {
        frameBufferRef.current.shift();
      }

      console.log('[ISL] Frame captured. Running hand detection...');

      const res = await fetch(`${API_BASE}/api/isl/word-predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: frameDataUrl,
          frames: frameBufferRef.current,
        }),
      });

      if (!isMountedRef.current) return;

      if (!res.ok) {
        setModelStatus('error');
        setRecognitionStatus('idle');
        return;
      }

      const result = await res.json();
      if (!result || typeof result !== 'object') return;

      const detectedHands = result.hands_detected || 0;
      const landmarksList = result.landmarks || [];
      const prediction    = result.prediction;
      const conf          = result.confidence || 0.0;

      setHandsCount(detectedHands);
      setLandmarksCount(landmarksList.length > 0 ? landmarksList[0].length : 0);

      console.log(`[ISL] Hands detected: ${detectedHands} | Landmarks: ${landmarksList.length > 0 ? 21 : 0}`);

      // Draw real-time hand skeleton overlay over camera
      drawLandmarksOverlay(landmarksList);

      if (detectedHands > 0 && prediction && prediction !== 'Sign not recognized') {
        console.log(`[ISL] Prediction: ${prediction} | Confidence: ${(conf * 100).toFixed(1)}%`);
      }

      processWordPrediction(prediction, conf, detectedHands);

    } catch (err) {
      if (isMountedRef.current) {
        console.warn('[ISL Recognition Loop] Request error:', err.message);
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [drawLandmarksOverlay, processWordPrediction]);

  // ── Start Continuous Recognition Loop ─────────────────────────────────────
  const startRecognitionLoop = useCallback(() => {
    if (recognitionTimerRef.current) clearInterval(recognitionTimerRef.current);
    console.log('[ISL] Recognition loop started');

    recognitionTimerRef.current = setInterval(() => {
      performRecognitionStep();
    }, FRAME_SAMPLE_INTERVAL_MS);
  }, [performRecognitionStep]);

  // ── Camera Start Flow ─────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (isStartingRef.current) {
      console.log('[ISL] Camera start already in progress');
      return;
    }

    isStartingRef.current = true;
    setCameraError(null);
    setCameraErrorType(null);

    console.log('[ISL] Starting camera...');

    // 1. Secure context check
    const isLocalhost = window.location.hostname === 'localhost' ||
                        window.location.hostname === '127.0.0.1' ||
                        window.location.hostname === '[::1]';
    if (!window.isSecureContext && !isLocalhost) {
      const msg = 'Camera access requires a secure connection (HTTPS). Please access this application via HTTPS.';
      console.warn('[ISL] Insecure context:', window.location.protocol);
      setCameraError(msg);
      setCameraErrorType('insecure_context');
      setCameraStatus('error');
      isStartingRef.current = false;
      return;
    }

    // 2. Browser MediaDevices support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'Your browser does not support camera access (getUserMedia unavailable). Please use Chrome, Firefox, or Edge.';
      console.warn('[ISL] getUserMedia not supported');
      setCameraError(msg);
      setCameraErrorType('unsupported');
      setCameraStatus('error');
      isStartingRef.current = false;
      return;
    }

    // 3. Reuse active stream if available
    if (streamRef.current && streamRef.current.active) {
      const liveTracks = streamRef.current.getVideoTracks().filter(t => t.readyState === 'live');
      if (liveTracks.length > 0) {
        console.log('[ISL] Reusing existing active camera stream');
        if (videoRef.current && videoRef.current.srcObject !== streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          await videoRef.current.play().catch(e => console.warn('[ISL] Play error on reused stream:', e));
        }
        setCameraStatus('on');
        setModelStatus('ready');
        setRecognitionStatus('recognizing');
        startRecognitionLoop();
        isStartingRef.current = false;
        return;
      }
    }

    setCameraStatus('requesting_permission');

    try {
      let stream = null;
      const preferredConstraints = {
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
      } catch (err) {
        if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
          console.warn('[ISL] OverconstrainedError with 720p ideal, retrying with facingMode user');
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false,
          });
        } else {
          throw err;
        }
      }

      console.log('[ISL] Camera permission granted');
      console.log('[ISL] Camera stream created');

      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        isStartingRef.current = false;
        return;
      }

      streamRef.current = stream;
      setCameraStatus('starting');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        console.log('[ISL] Video stream attached');

        // Wait for video readiness before starting inference
        await new Promise((resolve) => {
          const video = videoRef.current;
          if (!video) {
            resolve();
            return;
          }

          if (video.readyState >= 2) {
            resolve();
          } else {
            const onReady = () => {
              video.removeEventListener('loadeddata', onReady);
              video.removeEventListener('canplay', onReady);
              resolve();
            };
            video.addEventListener('loadeddata', onReady, { once: true });
            video.addEventListener('canplay', onReady, { once: true });
            setTimeout(resolve, 800);
          }
        });

        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('[ISL] video.play() warning:', playErr);
        }

        const actualW = videoRef.current.videoWidth || 1280;
        const actualH = videoRef.current.videoHeight || 720;
        setVideoDims({ width: actualW, height: actualH });
        console.log(`[ISL] Video dimensions: ${actualW}x${actualH}`);
      }

      console.log('[ISL] Video ready');
      console.log('[ISL] Camera active');

      if (!isMountedRef.current) {
        cleanupAll();
        isStartingRef.current = false;
        return;
      }

      setCameraStatus('on');
      setModelStatus('ready');
      setRecognitionStatus('recognizing');

      startRecognitionLoop();

    } catch (err) {
      if (!isMountedRef.current) {
        isStartingRef.current = false;
        return;
      }

      console.error('[ISL] Camera initialization error:', err);
      let message = 'Unable to access camera. Please check camera permissions and retry.';
      let errType = 'error';

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = 'Camera permission denied. Please allow camera access in your browser settings and try again.';
        errType = 'permission_denied';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = 'No camera was detected on this device. Please connect a webcam and try again.';
        errType = 'no_camera';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = 'The camera is being used by another application. Close other applications using the camera and try again.';
        errType = 'camera_in_use';
      } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        message = 'Camera does not meet requested resolution parameters. Please retry with a standard webcam.';
        errType = 'error';
      } else if (err.name === 'SecurityError') {
        message = 'Camera access blocked due to browser security restrictions or insecure context. Please ensure HTTPS is used.';
        errType = 'insecure_context';
      }

      setCameraError(message);
      setCameraErrorType(errType);
      setCameraStatus('error');
      setRecognitionStatus('idle');
    } finally {
      isStartingRef.current = false;
    }
  }, [cleanupAll, startRecognitionLoop]);

  // ── Camera Stop ───────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    console.log('[ISL] Camera stopped');
    cleanupAll();

    if (isMountedRef.current) {
      setCameraStatus('off');
      setRecognitionStatus('idle');
      setCurrentSign(null);
      setConfidence(0);
      setHandsCount(0);
      setLandmarksCount(0);
      setCameraError(null);
      setCameraErrorType(null);
    }
  }, [cleanupAll]);

  // ── Sentence Controls ─────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    setRecognizedText('');
    setCurrentSign(null);
    setConfidence(0);
    lastAcceptedSignRef.current = null;
    predictionBufferRef.current = [];
    frameBufferRef.current = [];
    neutralCountRef.current = 0;
  }, []);

  const handleBackspace = useCallback(() => {
    setRecognizedText(prev => {
      if (!prev) return '';
      const trimmed = prev.trim();
      const lastSpace = trimmed.lastIndexOf(' ');
      if (lastSpace === -1) return '';
      return trimmed.substring(0, lastSpace);
    });
    lastAcceptedSignRef.current = null;
  }, []);

  const handleAddSpace = useCallback(() => {
    setRecognizedText(prev => (prev ? prev + ' ' : ''));
    lastAcceptedSignRef.current = null;
    predictionBufferRef.current = [];
  }, []);

  const handleCopy = useCallback(async () => {
    if (!recognizedText) return;
    try {
      await navigator.clipboard.writeText(recognizedText);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = recognizedText;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        return;
      }
    }
    setCopyFeedback(true);
    setTimeout(() => {
      if (isMountedRef.current) setCopyFeedback(false);
    }, 1500);
  }, [recognizedText]);

  const handleSpeak = useCallback(() => {
    if (!recognizedText) {
      setSpeakFeedback('empty');
      setTimeout(() => {
        if (isMountedRef.current) setSpeakFeedback(null);
      }, 2000);
      return;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(recognizedText);
      utterance.lang = 'en-IN';
      utterance.rate = 0.92;
      setSpeakFeedback('speaking');
      utterance.onend = () => {
        if (isMountedRef.current) setSpeakFeedback(null);
      };
      utterance.onerror = () => {
        if (isMountedRef.current) setSpeakFeedback(null);
      };
      window.speechSynthesis.speak(utterance);
    }
  }, [recognizedText]);

  // ── Status Config ─────────────────────────────────────────────────────────
  const statusConfig = {
    'off':                   { color: 'text-slate-400',   dot: 'bg-slate-400',   label: 'Camera Off' },
    'requesting_permission': { color: 'text-amber-500',   dot: 'bg-amber-400',   label: 'Requesting Permission' },
    'starting':              { color: 'text-sky-500',     dot: 'bg-sky-400',     label: 'Camera Starting' },
    'on':                    { color: 'text-emerald-600', dot: 'bg-emerald-500', label: 'Camera Active' },
    'recognizing':           { color: 'text-emerald-600', dot: 'bg-emerald-500', label: 'Recognizing ISL Signs' },
    'low-confidence':        { color: 'text-amber-500',   dot: 'bg-amber-400',   label: 'Hand Detected — Sign in Progress' },
    'permission_denied':     { color: 'text-red-500',     dot: 'bg-red-500',     label: 'Camera Permission Denied' },
    'no_camera':             { color: 'text-red-500',     dot: 'bg-red-500',     label: 'No Camera Found' },
    'camera_in_use':         { color: 'text-red-500',     dot: 'bg-red-500',     label: 'Camera Already In Use' },
    'unsupported':           { color: 'text-red-500',     dot: 'bg-red-500',     label: 'Browser Camera API Unsupported' },
    'insecure_context':      { color: 'text-red-500',     dot: 'bg-red-500',     label: 'HTTPS Required for Camera' },
    'error':                 { color: 'text-red-500',     dot: 'bg-red-500',     label: 'Recognition / Camera Error' },
  };

  let currentStatusKey = 'off';
  if (cameraStatus === 'on') {
    if (recognitionStatus === 'recognizing') currentStatusKey = 'recognizing';
    else if (recognitionStatus === 'low-confidence') currentStatusKey = 'low-confidence';
    else currentStatusKey = 'on';
  } else if (cameraStatus === 'starting') {
    currentStatusKey = 'starting';
  } else if (cameraStatus === 'requesting_permission') {
    currentStatusKey = 'requesting_permission';
  } else if (cameraStatus === 'error') {
    currentStatusKey = cameraErrorType || 'error';
  } else {
    currentStatusKey = 'off';
  }
  const status = statusConfig[currentStatusKey] || statusConfig['off'];

  return (
    <div
      className="isl-sign-to-text-panel rounded-3xl dark-glass-panel card-shadow border border-[#bcc9cd]/40 overflow-hidden"
      role="region"
      aria-label="ISL Word Recognition to Text panel"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-[#00687a]/10 to-teal-500/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#00687a] to-teal-600 flex items-center justify-center text-white shadow-lg shadow-[#00687a]/25">
            <HandMetal className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#131b2e]">🤟 ISL Sign Language → Text</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00687a]/10 text-[#00687a] uppercase tracking-wider">
                Real-Time AI
              </span>
            </div>
            <p className="text-[11px] text-[#6d797d]">
              MediaPipe 3D Landmark Tracking + ISL Deep Learning Classification
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDebugHud(!showDebugHud)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              showDebugHud
                ? 'bg-[#00687a] text-white shadow-sm'
                : 'bg-slate-100 text-[#6d797d] hover:bg-slate-200'
            }`}
            title="Toggle ISL Debug Overlay"
            aria-label="Toggle ISL Debug Overlay"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Debug HUD</span>
          </button>
          <button
            onClick={() => { stopCamera(); onClose?.(); }}
            className="p-2 rounded-xl hover:bg-slate-100 text-[#6d797d] hover:text-red-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00687a]/40 focus:ring-offset-1"
            aria-label="Close ISL Sign to Text panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-5 space-y-4">

        {/* Camera & Landmark Preview Area */}
        <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
          {/* Live Video Feed */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              cameraStatus === 'on' ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            style={{ transform: 'scaleX(-1)' }}
            aria-label="Webcam preview for ISL recognition"
          />

          {/* Real-time Hand Landmark Skeleton Overlay */}
          <canvas
            ref={overlayCanvasRef}
            className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300 ${
              cameraStatus === 'on' ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ transform: 'scaleX(-1)' }}
            aria-hidden="true"
          />

          {/* Active Overlays when camera is ON */}
          {cameraStatus === 'on' && (
            <>
              {/* Live Tracking indicator */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-emerald-500/30 shadow-md">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 isl-pulse-dot" />
                <span className="text-[11px] font-bold text-emerald-300 tracking-wide">
                  {handsCount > 0 ? `HAND DETECTED (${handsCount}) · 21 LANDMARKS` : 'WAITING FOR HAND GESTURE'}
                </span>
              </div>

              {/* Current Recognized Word Overlay */}
              {currentSign && (
                <div className="absolute bottom-3 right-3 px-4 py-2 rounded-xl bg-black/80 backdrop-blur-md border border-emerald-400/50 shadow-2xl animate-fade-in">
                  <div className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider">Detected Sign</div>
                  <span className="text-2xl font-bold text-white font-mono tracking-wide">{currentSign}</span>
                </div>
              )}
            </>
          )}

          {/* Loading / Starting / Requesting permission overlay */}
          {(cameraStatus === 'starting' || cameraStatus === 'requesting_permission') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90 bg-slate-950/85 backdrop-blur-sm z-10">
              <Loader2 className="w-9 h-9 animate-spin mb-2 text-[#00687a]" />
              <span className="text-sm font-medium">
                {cameraStatus === 'requesting_permission'
                  ? 'Requesting camera permission...'
                  : 'Initializing MediaPipe Hands & ISL Model...'}
              </span>
              <span className="text-xs text-slate-400 mt-1">Please allow camera access in your browser if prompted</span>
            </div>
          )}

          {/* Camera Off overlay */}
          {cameraStatus === 'off' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 z-10">
              <Camera className="w-12 h-12 mb-2 opacity-30" aria-hidden="true" />
              <span className="text-sm font-semibold">Camera is off</span>
              <span className="text-xs text-slate-500 mt-1">Click &quot;Start Camera&quot; to begin real-time ISL recognition</span>
            </div>
          )}

          {/* Camera Error overlay inside preview */}
          {cameraStatus === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 bg-red-950/30 p-6 text-center z-10">
              <AlertCircle className="w-10 h-10 mb-2 opacity-80 text-red-400" aria-hidden="true" />
              <span className="text-sm font-semibold text-white">Camera Unavailable</span>
              <span className="text-xs text-slate-300 mt-1 max-w-sm">{cameraError || 'Unable to connect to camera.'}</span>
            </div>
          )}
        </div>

        {/* Hidden canvas for frame capture to API */}
        <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true" />

        {/* ── ISL DEBUG HUD Panel (Toggleable) ── */}
        {showDebugHud && (
          <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/30 text-emerald-400 font-mono text-xs shadow-lg space-y-1.5">
            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-1 mb-2">
              <span className="font-bold text-white uppercase flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                ISL DEBUG HUD
              </span>
              <span className="text-[10px] text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                LIVE PIPELINE
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div>Camera: <span className={cameraStatus === 'on' ? 'text-emerald-300 font-bold' : 'text-slate-400'}>{cameraStatus.toUpperCase()}</span></div>
              <div>Video: <span className="text-white">{videoDims.width} × {videoDims.height}</span></div>
              <div>Recognition: <span className={recognitionStatus === 'recognizing' ? 'text-emerald-300 font-bold' : 'text-amber-300'}>{recognitionStatus.toUpperCase()}</span></div>
              <div>Model: <span className="text-emerald-300 font-bold">LOADED (MediaPipe + CNN)</span></div>
              <div>Hands Detected: <span className="text-white font-bold">{handsCount}</span></div>
              <div>Landmarks: <span className="text-white font-bold">{landmarksCount}</span></div>
              <div>Frames: <span className="text-white">{framesProcessed}</span></div>
              <div>Confidence: <span className="text-emerald-300 font-bold">{(confidence * 100).toFixed(0)}%</span></div>
              <div>Last Sign: <span className="text-white font-bold">{currentSign || '—'}</span></div>
              <div>FPS: <span className="text-emerald-300 font-bold">{fps}</span></div>
            </div>
          </div>
        )}

        {/* Camera error box */}
        {cameraError && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700" role="alert">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Camera Error</p>
              <p className="text-xs mt-1 leading-relaxed">{cameraError}</p>
              <button
                onClick={startCamera}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                aria-label="Retry camera access"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Status + Confidence Bar */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-3 h-3 rounded-full ${status.dot} ${
                recognitionStatus === 'recognizing' && cameraStatus === 'on' ? 'isl-pulse-dot' : ''
              }`}
              aria-hidden="true"
            />
            <span className={`text-xs font-bold ${status.color}`} aria-live="polite">
              {status.label}
            </span>
          </div>
          {cameraStatus === 'on' && confidence > 0 && (
            <div className="flex items-center gap-2.5">
              <div className="w-24 h-2.5 bg-slate-200 rounded-full overflow-hidden" aria-hidden="true">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    confidence >= CONFIDENCE_THRESHOLD ? 'bg-emerald-500' : 'bg-amber-400'
                  }`}
                  style={{ width: `${Math.min(confidence * 100, 100)}%` }}
                />
              </div>
              <span className="text-xs font-mono font-bold text-[#131b2e]">
                {(confidence * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>

        {/* Current Sign Display */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm text-center">
          <span className="text-[11px] font-bold text-[#6d797d] uppercase tracking-widest block mb-1">
            Current Detected Sign
          </span>
          <div
            className={`text-3xl font-extrabold font-mono transition-all duration-300 ${
              currentSign ? 'text-[#00687a] scale-105' : 'text-slate-300'
            }`}
            aria-live="polite"
            aria-atomic="true"
          >
            {currentSign || (cameraStatus === 'on' && handsCount > 0 ? 'Analyzing...' : '—')}
          </div>
        </div>

        {/* Recognized Text Display (Sentence Builder) */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-[#6d797d] uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#00687a]" />
              Recognized Text Sentence
            </span>
            {recognizedText && (
              <span className="text-[11px] font-medium text-[#6d797d]">
                {recognizedText.split(/\s+/).filter(Boolean).length} words · {recognizedText.length} chars
              </span>
            )}
          </div>
          <div
            className="min-h-[75px] p-3.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xl font-bold text-[#131b2e] leading-relaxed break-words shadow-inner"
            aria-live="polite"
            aria-atomic="false"
            aria-label="Recognized ISL sentence"
          >
            {recognizedText || (
              <span className="text-slate-400 italic text-sm font-sans font-normal">
                Perform ISL signs in front of camera. Recognized signs will automatically form sentences here...
              </span>
            )}
          </div>
        </div>

        {/* Camera Start / Stop Button */}
        <div>
          {cameraStatus !== 'on' ? (
            <button
              id="start-camera-btn"
              onClick={startCamera}
              disabled={cameraStatus === 'starting' || cameraStatus === 'requesting_permission'}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-[#00687a] to-[#006a63] text-white font-bold text-sm shadow-lg shadow-[#00687a]/25 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00687a]/50 focus:ring-offset-1"
              aria-label="Start camera for ISL recognition"
            >
              {cameraStatus === 'starting' || cameraStatus === 'requesting_permission' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Starting Camera...</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  <span>Start Camera</span>
                </>
              )}
            </button>
          ) : (
            <button
              id="stop-camera-btn"
              onClick={stopCamera}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-red-500/10 text-red-600 border border-red-200 font-bold text-sm hover:bg-red-500/20 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
              aria-label="Stop camera"
            >
              <CameraOff className="w-4 h-4" />
              <span>Stop Camera</span>
            </button>
          )}
        </div>

        {/* Text Control Action Buttons */}
        <div className="grid grid-cols-5 gap-2">
          {/* Space */}
          <button
            onClick={handleAddSpace}
            disabled={!recognizedText && cameraStatus !== 'on'}
            className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[#3d494c] hover:bg-slate-100 hover:border-[#00687a]/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#00687a]/30"
            aria-label="Add space"
            title="Space"
          >
            <CircleDot className="w-4 h-4" />
            <span className="text-[10px]">Space</span>
          </button>

          {/* Backspace */}
          <button
            onClick={handleBackspace}
            disabled={!recognizedText}
            className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[#3d494c] hover:bg-slate-100 hover:border-[#00687a]/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#00687a]/30"
            aria-label="Delete last word"
            title="Backspace Word"
          >
            <Delete className="w-4 h-4" />
            <span className="text-[10px]">Backspace</span>
          </button>

          {/* Clear */}
          <button
            onClick={handleClear}
            disabled={!recognizedText}
            className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[#3d494c] hover:bg-slate-100 hover:border-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-300"
            aria-label="Clear all recognized text"
            title="Clear"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-[10px]">Clear</span>
          </button>

          {/* Copy */}
          <button
            onClick={handleCopy}
            disabled={!recognizedText}
            className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00687a]/30 ${
              copyFeedback
                ? 'bg-emerald-50 border-emerald-300 text-emerald-600'
                : 'bg-slate-50 border-slate-200 text-[#3d494c] hover:bg-slate-100 hover:border-[#00687a]/30'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            aria-label="Copy text to clipboard"
            title="Copy"
          >
            {copyFeedback ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span className="text-[10px]">{copyFeedback ? 'Copied!' : 'Copy'}</span>
          </button>

          {/* Speak */}
          <button
            onClick={handleSpeak}
            disabled={!recognizedText}
            className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-300 ${
              speakFeedback === 'speaking'
                ? 'bg-purple-50 border-purple-300 text-purple-600'
                : speakFeedback === 'empty'
                ? 'bg-amber-50 border-amber-300 text-amber-600'
                : 'bg-slate-50 border-slate-200 text-[#3d494c] hover:bg-slate-100 hover:border-purple-300'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            aria-label="Speak sentence aloud"
            title="Speak"
          >
            <Volume2 className="w-4 h-4" />
            <span className="text-[10px]">
              {speakFeedback === 'speaking' ? 'Speaking...' : 'Speak'}
            </span>
          </button>
        </div>

        {/* Vocabulary Cheatsheet Accordion */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 overflow-hidden">
          <button
            onClick={() => setShowVocab(!showVocab)}
            className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-100/60 transition-colors"
            aria-expanded={showVocab}
          >
            <span className="text-xs font-bold text-[#131b2e] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#00687a]" />
              Supported ISL Gestures &amp; Vocabulary
            </span>
            {showVocab ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>
          {showVocab && (
            <div className="p-3.5 pt-0 space-y-3 text-xs text-[#3d494c] border-t border-slate-200/60">
              {Object.entries(ISL_VOCABULARY_CATEGORIES).map(([cat, words]) => (
                <div key={cat}>
                  <div className="text-[10px] font-bold text-[#00687a] uppercase tracking-wider mb-1.5">{cat}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {words.map(w => (
                      <span key={w} className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-[11px] font-mono text-slate-700">
                        {w.replace('_', ' ').toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info footer */}
        <div className="p-3 rounded-xl bg-[#00687a]/5 border border-[#00687a]/15">
          <p className="text-[11px] text-[#3d494c] leading-relaxed">
            <strong className="text-[#131b2e]">Real-Time ISL Tracking:</strong> MediaPipe tracks 21 hand landmarks across camera frames.
            Perform gestures clearly in camera view. Recognized words will automatically build sentences above.
          </p>
        </div>
      </div>
    </div>
  );
}

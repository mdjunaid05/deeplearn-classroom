/**
 * ISLSignToText.jsx
 * -----------------
 * Live ISL (Indian Sign Language) Word Recognition → Text Component.
 *
 * Captures temporal webcam frame sequences (8 frames), sends them to the
 * backend ISL word prediction API (`POST /api/isl/word-predict`), and displays
 * recognized words with:
 *   - Temporal Smoothing (rolling buffer consensus)
 *   - Duplicate Prevention (holding a sign does not repeat word)
 *   - Automatic Sentence Builder (words concatenated with spaces)
 *   - TTS Voice Synthesis (Indian English pronunciation)
 *   - Full camera and memory lifecycle management
 *
 * Model: ISL Words CNN + LSTM (76 word classes, 8×128×128×3 input).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera, CameraOff, HandMetal, Trash2, Copy, Volume2,
  Loader2, AlertCircle, X, Delete, RefreshCw, CircleDot, Check,
  BookOpen, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react';
import { API_BASE } from '../utils/api';

// ── Tunable Configuration Constants ────────────────────────────────────────
const FRAME_SAMPLE_INTERVAL_MS = 180;   // Capture 1 frame every 180ms
const SEQUENCE_LENGTH          = 8;     // Model expects 8 temporal frames
const PREDICTION_INTERVAL_MS   = 1500;  // Send sequence every 1.5 seconds
const PREDICTION_BUFFER_SIZE   = 5;     // Rolling buffer of last N predictions
const MIN_MATCHES_REQUIRED     = 3;     // Accept word when ≥ 3 of buffer match
const CONFIDENCE_THRESHOLD     = 0.60;  // Minimum confidence to consider valid
const NEUTRAL_GAP_COUNT        = 2;     // # of low-confidence frames to mark neutral

// ── 76 Authentic ISL Word Vocabulary Categories ─────────────────────────────
const ISL_VOCABULARY_CATEGORIES = {
  "Greetings & Common": [
    "good", "bad", "happy", "sad", "beautiful", "ugly", "healthy", "sick",
  ],
  "Time & Days": [
    "morning", "afternoon", "evening", "night", "today", "tomorrow", "yesterday",
    "hour", "minute", "second", "week", "month", "year",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  ],
  "Animals & Nature": [
    "animal", "bird", "cat", "dog", "cow", "horse", "fish", "mouse",
    "cold", "hot", "warm", "wet", "dry",
  ],
  "Clothing & Items": [
    "clothing", "dress", "hat", "pant", "pocket", "shirt", "shoes", "skirt", "suit", "t_shirt",
  ],
  "Descriptions & Modifiers": [
    "big", "small", "tall", "short", "fast", "slow", "loud", "quiet",
    "new", "old", "young", "cheap", "expensive", "famous", "flat", "curved",
    "narrow", "wide", "loose", "long", "light", "deaf", "blind", "female", "time",
  ],
};

export default function ISLSignToText({ onClose }) {
  // Camera state
  const [cameraStatus, setCameraStatus]   = useState('off');   // off | starting | on | error
  const [cameraError, setCameraError]     = useState(null);
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);

  // Model / prediction state
  const [modelStatus, setModelStatus]     = useState('idle');   // idle | loading | ready | error
  const [currentSign, setCurrentSign]     = useState(null);
  const [confidence, setConfidence]       = useState(0);
  const [recognizedText, setRecognizedText] = useState('');
  const [recognitionStatus, setRecognitionStatus] = useState('idle');
  // idle | recognizing | low-confidence

  // UI state
  const [copyFeedback, setCopyFeedback]   = useState(false);
  const [speakFeedback, setSpeakFeedback] = useState(null); // null | 'speaking' | 'empty'
  const [showVocab, setShowVocab]         = useState(false);

  // Internal refs for sequence capture & temporal smoothing
  const isProcessingRef       = useRef(false);
  const frameBufferRef        = useRef([]);  // rolling 8-frame base64 buffer
  const predictionBufferRef   = useRef([]);  // rolling buffer of recent predictions
  const lastAcceptedSignRef   = useRef(null);
  const neutralCountRef       = useRef(0);
  const frameSampleTimerRef   = useRef(null);
  const predictTimerRef       = useRef(null);
  const isMountedRef          = useRef(true);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Full cleanup: stop camera, clear intervals, reset inference state */
  const cleanupAll = useCallback(() => {
    if (frameSampleTimerRef.current) {
      clearInterval(frameSampleTimerRef.current);
      frameSampleTimerRef.current = null;
    }

    if (predictTimerRef.current) {
      clearInterval(predictTimerRef.current);
      predictTimerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    isProcessingRef.current = false;
    frameBufferRef.current = [];
    predictionBufferRef.current = [];
    neutralCountRef.current = 0;
  }, []);

  // ── Camera start ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraStatus('starting');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Your browser does not support camera access. Please use Chrome, Firefox, or Edge.'
      );
      setCameraStatus('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: false,
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setCameraStatus('on');
      setModelStatus('ready');
      setRecognitionStatus('recognizing');

      // 1. Frame Sampling Loop (every 180ms, maintains rolling 8-frame buffer)
      if (frameSampleTimerRef.current) clearInterval(frameSampleTimerRef.current);
      frameSampleTimerRef.current = setInterval(() => {
        captureSingleFrame();
      }, FRAME_SAMPLE_INTERVAL_MS);

      // 2. Word Prediction Loop (every 1.5s, sends 8-frame sequence to backend)
      if (predictTimerRef.current) clearInterval(predictTimerRef.current);
      predictTimerRef.current = setInterval(() => {
        sendSequenceForPrediction();
      }, PREDICTION_INTERVAL_MS);

    } catch (err) {
      if (!isMountedRef.current) return;

      let message = 'Unable to access camera. Please check camera permissions and retry.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = 'Camera permission was denied. Please allow camera access in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = 'No camera found on this device. Please connect a webcam and retry.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = 'Camera is in use by another app. Please close other camera apps and retry.';
      }

      setCameraError(message);
      setCameraStatus('error');
    }
  }, []);

  // ── Camera stop ───────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    cleanupAll();

    if (isMountedRef.current) {
      setCameraStatus('off');
      setRecognitionStatus('idle');
      setCurrentSign(null);
      setConfidence(0);
    }
  }, [cleanupAll]);

  // ── Frame capture into rolling sequence buffer ───────────────────────────
  const captureSingleFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2) return;

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = 128;
      canvas.height = 128;

      // Draw mirrored video frame to canvas
      ctx.save();
      ctx.translate(128, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, 128, 128);
      ctx.restore();

      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);

      // Add to sequence buffer (keep last SEQUENCE_LENGTH frames)
      frameBufferRef.current.push(dataUrl);
      if (frameBufferRef.current.length > SEQUENCE_LENGTH) {
        frameBufferRef.current.shift();
      }
    } catch {
      // Skip frame on canvas error
    }
  }, []);

  // ── Send sequence for Word Prediction ─────────────────────────────────────
  const sendSequenceForPrediction = useCallback(async () => {
    // Inference lock — prevent overlapping / flooded requests
    if (isProcessingRef.current) return;
    if (frameBufferRef.current.length < 3) return; // need at least a few frames
    if (!streamRef.current) return;

    isProcessingRef.current = true;

    try {
      const framesToSend = [...frameBufferRef.current];

      const res = await fetch(`${API_BASE}/api/isl/word-predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames: framesToSend }),
      });

      if (!isMountedRef.current) return;

      if (!res.ok) {
        setModelStatus('error');
        setRecognitionStatus('idle');
        return;
      }

      const result = await res.json();
      if (!result || typeof result !== 'object') return;

      const prediction = result.prediction;
      const conf = result.confidence;
      const lang = result.language;

      if (lang !== 'ISL' || !prediction || typeof conf !== 'number') {
        return;
      }

      processWordPrediction(prediction, conf);

    } catch (err) {
      if (isMountedRef.current) {
        console.warn('[ISL Word Predict] Request failed:', err.message);
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, []);

  // ── Temporal Smoothing & Duplicate Prevention ────────────────────────────
  const processWordPrediction = useCallback((prediction, conf) => {
    if (!isMountedRef.current) return;

    setConfidence(conf);

    // Below confidence threshold or unrecognizable sign
    if (conf < CONFIDENCE_THRESHOLD || prediction === 'Sign not recognized') {
      neutralCountRef.current += 1;
      setRecognitionStatus('low-confidence');
      setCurrentSign(null);

      // After neutral gap, reset last accepted sign so the same word can be signed again
      if (neutralCountRef.current >= NEUTRAL_GAP_COUNT) {
        lastAcceptedSignRef.current = null;
      }
      return;
    }

    // High-confidence prediction
    neutralCountRef.current = 0;
    setRecognitionStatus('recognizing');
    setCurrentSign(prediction);

    // Push into rolling prediction consensus buffer
    const buffer = predictionBufferRef.current;
    buffer.push(prediction);
    if (buffer.length > PREDICTION_BUFFER_SIZE) {
      buffer.shift();
    }

    // Tally predictions in the rolling buffer
    const counts = {};
    for (const p of buffer) {
      counts[p] = (counts[p] || 0) + 1;
    }

    // Find consensus candidate
    let bestWord = null;
    let bestCount = 0;
    for (const [w, count] of Object.entries(counts)) {
      if (count > bestCount) {
        bestCount = count;
        bestWord = w;
      }
    }

    // Accept word ONLY when:
    // 1. Consensus is reached (bestCount >= MIN_MATCHES_REQUIRED)
    // 2. Duplicate prevention passes (bestWord != lastAcceptedSign)
    if (bestCount >= MIN_MATCHES_REQUIRED && bestWord !== lastAcceptedSignRef.current) {
      lastAcceptedSignRef.current = bestWord;
      predictionBufferRef.current = []; // Clear buffer after acceptance

      // Automatic sentence builder: automatically concatenate words with spaces
      setRecognizedText(prev => {
        const cleaned = prev ? prev.trim() : '';
        return cleaned ? `${cleaned} ${bestWord}` : bestWord;
      });
    }
  }, []);

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

  // ── Status Indicator Styling ──────────────────────────────────────────────
  const statusConfig = {
    'idle':           { color: 'text-slate-400',   dot: 'bg-slate-400',   label: 'Camera Off' },
    'recognizing':    { color: 'text-emerald-600', dot: 'bg-emerald-500', label: 'Recognizing ISL Words' },
    'low-confidence': { color: 'text-amber-500',   dot: 'bg-amber-400',   label: 'No Clear Sign Detected' },
  };
  const status = statusConfig[recognitionStatus] || statusConfig['idle'];

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
                Word Mode
              </span>
            </div>
            <p className="text-[11px] text-[#6d797d]">
              Dynamic ISL Word Recognition (76 Words &amp; Expressions) · Indian Sign Language
            </p>
          </div>
        </div>
        <button
          onClick={() => { stopCamera(); onClose?.(); }}
          className="p-2 rounded-xl hover:bg-slate-100 text-[#6d797d] hover:text-red-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00687a]/40 focus:ring-offset-1"
          aria-label="Close ISL Sign to Text panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="p-5 space-y-4">

        {/* Camera Preview */}
        <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
          {cameraStatus === 'on' ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
                aria-label="Webcam preview for ISL word recognition"
              />
              {/* Live indicator */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-emerald-500/30">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 isl-pulse-dot" />
                <span className="text-[11px] font-bold text-emerald-300 tracking-wide">ISL LIVE WORD RECOGNITION</span>
              </div>
              {/* Current recognized word overlay */}
              {currentSign && (
                <div className="absolute bottom-3 right-3 px-4 py-2 rounded-xl bg-black/75 backdrop-blur-md border border-emerald-400/40 shadow-xl">
                  <div className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider">Detected Sign</div>
                  <span className="text-2xl font-bold text-white font-mono tracking-wide">{currentSign}</span>
                </div>
              )}
            </>
          ) : cameraStatus === 'starting' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70">
              <Loader2 className="w-9 h-9 animate-spin mb-2 text-[#00687a]" />
              <span className="text-sm font-medium">Initializing camera &amp; ISL model...</span>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
              <Camera className="w-12 h-12 mb-2 opacity-30" aria-hidden="true" />
              <span className="text-sm font-semibold">Camera is off</span>
              <span className="text-xs text-slate-500 mt-1">Click &quot;Start Camera&quot; to begin recognizing ISL words</span>
            </div>
          )}
        </div>

        {/* Hidden canvas for frame sequence capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true" />

        {/* Camera error */}
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

        {/* Model error */}
        {modelStatus === 'error' && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-700" role="alert">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-semibold">ISL Recognition Service Reconnecting</p>
              <p className="text-xs mt-1">Reconnecting to backend ISL word model server...</p>
              <button
                onClick={() => { setModelStatus('ready'); setRecognitionStatus('recognizing'); }}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
                aria-label="Retry ISL connection"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Status + Confidence */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-3 h-3 rounded-full ${status.dot} ${
                recognitionStatus === 'recognizing' ? 'isl-pulse-dot' : ''
              }`}
              aria-hidden="true"
            />
            <span className={`text-xs font-bold ${status.color}`} aria-live="polite">
              {cameraStatus === 'on' ? status.label : 'Camera Off'}
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
            Current Sign
          </span>
          <div
            className={`text-3xl font-extrabold font-mono transition-all duration-300 ${
              currentSign ? 'text-[#00687a] scale-105' : 'text-slate-300'
            }`}
            aria-live="polite"
            aria-atomic="true"
          >
            {currentSign || '—'}
          </div>
        </div>

        {/* Recognized Text Display (Sentence Builder) */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-[#6d797d] uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#00687a]" />
              Recognized Text
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
                Perform ISL word signs in front of the camera. Recognized words will automatically form sentences here...
              </span>
            )}
          </div>
        </div>

        {/* Camera Start / Stop Button */}
        <div>
          {cameraStatus !== 'on' ? (
            <button
              onClick={startCamera}
              disabled={cameraStatus === 'starting'}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-[#00687a] to-[#006a63] text-white font-bold text-sm shadow-lg shadow-[#00687a]/25 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00687a]/50 focus:ring-offset-1"
              aria-label="Start camera for ISL word recognition"
            >
              <Camera className="w-4 h-4" />
              {cameraStatus === 'starting' ? 'Starting Camera...' : 'Start Camera'}
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-red-500/10 text-red-600 border border-red-200 font-bold text-sm hover:bg-red-500/20 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
              aria-label="Stop camera"
            >
              <CameraOff className="w-4 h-4" />
              Stop Camera
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
              Supported ISL Vocabulary (76 Words)
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
            <strong className="text-[#131b2e]">Temporal Word Recognition:</strong> Signs are analyzed across temporal frame sequences.
            Hold your gesture steadily for ~1 second. Words will be automatically added to the sentence with spaces.
          </p>
        </div>
      </div>
    </div>
  );
}

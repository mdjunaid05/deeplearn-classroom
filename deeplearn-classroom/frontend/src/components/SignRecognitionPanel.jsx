import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, CheckCircle, AlertCircle } from 'lucide-react';
import { API_BASE } from '../utils/api';

// ISL word labels from the actual Kaggle dataset (76 words)
const ISL_WORD_LABELS = [
  "afternoon", "animal", "bad", "beautiful", "big", "bird", "blind", "cat",
  "cheap", "clothing", "cold", "cow", "curved", "deaf", "dog", "dress",
  "dry", "evening", "expensive", "famous", "fast", "female", "fish", "flat",
  "friday", "good", "happy", "hat", "healthy", "horse", "hot", "hour",
  "light", "long", "loose", "loud", "minute", "monday", "month", "morning",
  "mouse", "narrow", "new", "night", "old", "pant", "pocket", "quiet",
  "sad", "saturday", "second", "shirt", "shoes", "short", "sick", "skirt",
  "slow", "small", "suit", "sunday", "tall", "thursday", "time", "today",
  "tomorrow", "tuesday", "t_shirt", "ugly", "warm", "wednesday", "week",
  "wet", "wide", "year", "yesterday", "young",
];

export default function SignRecognitionPanel({ isDetecting, onSignRecognized }) {
  const [currentSign, setCurrentSign] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [history, setHistory] = useState([]);
  const [modelStatus, setModelStatus] = useState('idle'); // idle | loading | ready | error
  const [cameraError, setCameraError] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameBufferRef = useRef([]);
  const isProcessingRef = useRef(false);
  const isMountedRef = useRef(true);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch (e) {}
      videoRef.current.srcObject = null;
    }
    frameBufferRef.current = [];
    isProcessingRef.current = false;
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported by this browser.');
      setModelStatus('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (e) {
          console.warn('[SignPanel] Play error:', e);
        }
      }
      setModelStatus('ready');
    } catch (err) {
      if (!isMountedRef.current) return;
      console.warn('[SignPanel] Camera access failed:', err);
      setCameraError('Unable to access camera.');
      setModelStatus('error');
    }
  }, []);

  // Start/stop webcam
  useEffect(() => {
    isMountedRef.current = true;
    if (isDetecting) {
      startCamera();
    } else {
      stopCamera();
      setCurrentSign(null);
      setConfidence(0);
    }
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [isDetecting, startCamera, stopCamera]);

  // Sample frame into buffer
  const sampleFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isDetecting) return;
    const video = videoRef.current;
    if (video.readyState < 2 || video.paused || video.ended) return;

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = 128;
      canvas.height = 128;
      ctx.drawImage(video, 0, 0, 128, 128);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);

      frameBufferRef.current.push(dataUrl);
      if (frameBufferRef.current.length > 8) {
        frameBufferRef.current.shift();
      }
    } catch {
      // ignore
    }
  }, [isDetecting]);

  // Capture frame sequence and send to ISL Word prediction API
  const captureAndPredict = useCallback(async () => {
    if (isProcessingRef.current || !isDetecting || frameBufferRef.current.length < 3) return;
    if (!streamRef.current || !streamRef.current.active) return;
    isProcessingRef.current = true;

    try {
      const framesToSend = [...frameBufferRef.current];
      const res = await fetch(`${API_BASE}/api/isl/word-predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames: framesToSend }),
      });

      if (res.ok && isMountedRef.current) {
        const result = await res.json();
        const prediction = result.prediction || 'Sign not recognized';
        const conf = result.confidence || 0;

        setCurrentSign(prediction);
        setConfidence(conf);

        // Only add to history if confidence is above threshold
        if (conf >= 0.60 && prediction !== 'Sign not recognized') {
          setHistory(prev => [prediction, ...prev.filter(p => p !== prediction)].slice(0, 8));
          if (onSignRecognized) onSignRecognized(prediction);
        }
      }
    } catch {
      // API not available — skip this frame
    } finally {
      isProcessingRef.current = false;
    }
  }, [isDetecting, onSignRecognized]);

  // Run sampling and prediction loops
  useEffect(() => {
    if (!isDetecting || modelStatus !== 'ready') return;

    const sampleInterval = setInterval(sampleFrame, 200);
    const predictInterval = setInterval(captureAndPredict, 1500);

    return () => {
      clearInterval(sampleInterval);
      clearInterval(predictInterval);
    };
  }, [isDetecting, modelStatus, sampleFrame, captureAndPredict]);

  return (
    <div className="flex flex-col gap-4">
      {/* Webcam Feed */}
      <div className="relative aspect-video bg-surface-800 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center shadow-lg hover:shadow-xl hover:border-cyan-400 transition-all duration-300">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            isDetecting && !cameraError ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{ transform: 'scaleX(-1)' }}
        />
        {isDetecting && !cameraError ? (
          <>
            <div className="absolute inset-0 border-2 border-emerald-500/50 rounded-xl pointer-events-none" />
            <div className="absolute top-2 left-2 bg-emerald-500/20 backdrop-blur px-2.5 py-1 rounded text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
              ISL WORD RECOGNITION
            </div>
          </>
        ) : cameraError ? (
          <div className="text-center p-4 text-red-400 flex flex-col items-center">
            <AlertCircle className="w-8 h-8 mb-1" />
            <span className="text-xs">{cameraError}</span>
          </div>
        ) : (
          <Camera className="w-8 h-8 text-[#6d797d]" aria-hidden="true" />
        )}
        <span className="sr-only">{isDetecting ? 'Camera active' : 'Camera inactive'}</span>
      </div>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      {/* Prediction Display */}
      <div className="p-4 rounded-xl bg-surface-800/50 border border-white/5 shadow-lg hover:shadow-xl hover:border-cyan-400 transition-all duration-300">
        <div className="text-center mb-3">
          <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">
            Detected ISL Word
          </div>
          <div className="text-2xl font-bold text-[#131b2e] font-mono">
            {currentSign || (isDetecting ? '...' : '—')}
          </div>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-[#6d797d]">
            Recognition Confidence:
          </span>
          <span className="text-xs font-mono font-bold text-emerald-400">
            {(confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-500 ${
              confidence >= 0.60 ? 'bg-emerald-500' : 'bg-yellow-500'
            }`}
            style={{ width: `${confidence * 100}%` }}
          />
        </div>
        {confidence > 0 && confidence < 0.60 && (
          <p className="text-xs text-yellow-500 mt-1">Low confidence — sign not recognized</p>
        )}
      </div>

      {/* History */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-[#6d797d] uppercase tracking-wider font-bold">Recent ISL Words</h4>
        <div className="flex flex-wrap gap-2" role="list" aria-label="Recent ISL words recognized">
          {history.map((sign, idx) => (
            <div key={idx} role="listitem" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm font-mono">
              <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
              {sign}
            </div>
          ))}
          {history.length === 0 && <span className="text-sm text-[#6d797d]">No ISL words recognized yet.</span>}
        </div>
      </div>
    </div>
  );
}

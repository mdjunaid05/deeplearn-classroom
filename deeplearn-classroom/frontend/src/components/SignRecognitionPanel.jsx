import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, CheckCircle } from 'lucide-react';

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

// ISL alphabet labels (a-z)
const ISL_ALPHABET_LABELS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

export default function SignRecognitionPanel({ isDetecting, onSignRecognized }) {
  const [currentSign, setCurrentSign] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [history, setHistory] = useState([]);
  const [modelStatus, setModelStatus] = useState('idle'); // idle | loading | ready | error
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Start/stop webcam
  useEffect(() => {
    if (isDetecting) {
      startCamera();
    } else {
      stopCamera();
      setCurrentSign(null);
      setConfidence(0);
    }
    return () => stopCamera();
  }, [isDetecting]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setModelStatus('ready');
    } catch {
      setModelStatus('error');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  // Capture frame and send to ISL prediction API
  const captureAndPredict = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !isDetecting) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = 128;
    canvas.height = 128;
    ctx.drawImage(video, 0, 0, 128, 128);

    // Convert to base64
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    try {
      const res = await fetch(`${API_BASE}/api/isl/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });

      if (res.ok) {
        const result = await res.json();
        const prediction = result.prediction || 'Sign not recognized';
        const conf = result.confidence || 0;

        setCurrentSign(prediction);
        setConfidence(conf);

        // Only add to history if confidence is above threshold
        if (conf > 0.5 && prediction !== 'Sign not recognized') {
          setHistory(prev => [prediction, ...prev].slice(0, 8));
          if (onSignRecognized) onSignRecognized(prediction);
        }
      }
    } catch {
      // API not available — skip this frame
    }
  }, [isDetecting, onSignRecognized]);

  // Run prediction loop
  useEffect(() => {
    if (!isDetecting || modelStatus !== 'ready') return;

    const interval = setInterval(captureAndPredict, 2000);
    return () => clearInterval(interval);
  }, [isDetecting, modelStatus, captureAndPredict]);

  return (
    <div className="flex flex-col gap-4">
      {/* Webcam Feed */}
      <div className="relative aspect-video bg-surface-800 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center shadow-lg hover:shadow-xl hover:border-cyan-400 transition-all duration-300">
        {isDetecting ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 border-2 border-emerald-500/50 rounded-xl" />
            <div className="absolute top-2 left-2 bg-emerald-500/20 backdrop-blur px-2 py-0.5 rounded text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
              ISL LIVE
            </div>
          </>
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
            ISL Interpreter
          </div>
          <div className="text-2xl font-bold text-[#131b2e]">
            {currentSign || (isDetecting ? '...' : '—')}
          </div>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-[#6d797d]">
            Recognized Sign:
          </span>
          <span className="text-xs font-mono text-emerald-400">
            Confidence: {(confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-500 ${
              confidence > 0.5 ? 'bg-emerald-500' : 'bg-yellow-500'
            }`}
            style={{ width: `${confidence * 100}%` }}
          />
        </div>
        {confidence > 0 && confidence <= 0.5 && (
          <p className="text-xs text-yellow-500 mt-1">Low confidence — sign not recognized</p>
        )}
      </div>

      {/* History */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-[#6d797d] uppercase tracking-wider font-bold">Recent ISL Signs</h4>
        <div className="flex flex-wrap gap-2" role="list" aria-label="Recent ISL signs recognized">
          {history.map((sign, idx) => (
            <div key={idx} role="listitem" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">
              <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
              {sign}
            </div>
          ))}
          {history.length === 0 && <span className="text-sm text-[#6d797d]">No ISL signs recognized yet.</span>}
        </div>
      </div>
    </div>
  );
}

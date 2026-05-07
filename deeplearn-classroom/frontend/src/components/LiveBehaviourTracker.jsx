/**
 * LiveBehaviourTracker.jsx
 * Real-time student behaviour monitoring component using:
 *  - Webcam (via browser MediaDevices API)
 *  - Tab-visibility API (detects tab switching)
 *  - Mouse/keyboard event listeners (interaction detection)
 *  - Periodic AI score calculation
 *
 * Emits onMetricsUpdate(metrics) every ~5s.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Eye, EyeOff, Wifi, WifiOff, Activity, AlertTriangle, CheckCircle, Monitor } from 'lucide-react';

const POLL_INTERVAL = 5000; // 5 seconds

function classifyBehaviour({ faceDetected, tabActive, interactionRate, mouseActive }) {
  if (!tabActive) return { label: 'Absent', color: '#6b7280', score: 0 };
  if (!faceDetected) return { label: 'Inactive', color: '#ef4444', score: 10 };
  if (interactionRate < 0.05 && !mouseActive) return { label: 'Sleeping', color: '#8b5cf6', score: 15 };
  if (interactionRate < 0.15) return { label: 'Distracted', color: '#f59e0b', score: 35 };
  if (interactionRate < 0.4) return { label: 'Passive', color: '#f97316', score: 55 };
  return { label: 'Focused', color: '#22c55e', score: 85 + Math.round(interactionRate * 15) };
}

const LABEL_ICONS = {
  Focused:    <CheckCircle className="w-4 h-4 text-emerald-500" />,
  Active:     <Activity className="w-4 h-4 text-cyan-500" />,
  Passive:    <Monitor className="w-4 h-4 text-amber-500" />,
  Distracted: <AlertTriangle className="w-4 h-4 text-orange-500" />,
  Inactive:   <EyeOff className="w-4 h-4 text-red-500" />,
  Sleeping:   <EyeOff className="w-4 h-4 text-purple-500" />,
  Absent:     <WifiOff className="w-4 h-4 text-gray-500" />,
};

export default function LiveBehaviourTracker({ onMetricsUpdate, compact = false, studentId = 1 }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const interactionRef = useRef({ count: 0, mouseX: 0, mouseY: 0 });
  const lastPollRef = useRef(Date.now());

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [tabActive, setTabActive] = useState(!document.hidden);
  const [faceDetected, setFaceDetected] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  // ── Tab visibility ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => setTabActive(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // ── Interaction tracking ───────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => { interactionRef.current.count++; };
    const moveTick = (e) => {
      const dx = Math.abs(e.clientX - interactionRef.current.mouseX);
      const dy = Math.abs(e.clientY - interactionRef.current.mouseY);
      if (dx > 5 || dy > 5) {
        interactionRef.current.count += 0.3;
        interactionRef.current.mouseX = e.clientX;
        interactionRef.current.mouseY = e.clientY;
        interactionRef.current.mouseActive = true;
      }
    };
    window.addEventListener('keydown', tick);
    window.addEventListener('click', tick);
    window.addEventListener('mousemove', moveTick);
    return () => {
      window.removeEventListener('keydown', tick);
      window.removeEventListener('click', tick);
      window.removeEventListener('mousemove', moveTick);
    };
  }, []);

  // ── Session timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setSessionSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Camera setup ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 160, height: 120, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
      setCameraError(null);
    } catch (err) {
      setCameraError('Camera not available');
      setCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // ── Face detection via canvas brightness heuristic ───────────────────────
  const detectFace = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraActive) return false;
    try {
      const ctx = canvas.getContext('2d');
      canvas.width = 40;
      canvas.height = 30;
      ctx.drawImage(video, 0, 0, 40, 30);
      const frame = ctx.getImageData(0, 0, 40, 30);
      // Heuristic: if average brightness is in face-skin range assume face present
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < frame.data.length; i += 4) {
        r += frame.data[i];
        g += frame.data[i + 1];
        b += frame.data[i + 2];
      }
      const pixels = frame.data.length / 4;
      r /= pixels; g /= pixels; b /= pixels;
      const brightness = (r + g + b) / 3;
      // Simple check: non-black frame means the feed is live
      return brightness > 15 && brightness < 240;
    } catch {
      return true; // assume face present on error
    }
  }, [cameraActive]);

  // ── Periodic metrics poll ─────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastPollRef.current) / 1000;
      lastPollRef.current = now;

      const detected = detectFace();
      setFaceDetected(detected);

      const interactionRate = Math.min(interactionRef.current.count / Math.max(elapsed, 1) / 10, 1);
      const mouseActive = interactionRef.current.mouseActive || false;
      interactionRef.current.count = 0;
      interactionRef.current.mouseActive = false;

      const behaviour = classifyBehaviour({ faceDetected: detected, tabActive, interactionRate, mouseActive });
      const engagementScore = behaviour.score;
      const focusScore = detected && tabActive ? Math.round(50 + interactionRate * 50) : 5;
      const participationScore = Math.round(interactionRate * 100);

      const newMetrics = {
        behaviour: behaviour.label,
        behaviourColor: behaviour.color,
        engagementScore,
        focusScore,
        participationScore,
        faceDetected: detected,
        tabActive,
        interactionRate: parseFloat(interactionRate.toFixed(2)),
        timestamp: new Date().toISOString(),
        sessionSeconds,
      };

      setMetrics(newMetrics);
      if (onMetricsUpdate) onMetricsUpdate(newMetrics);
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [detectFace, tabActive, onMetricsUpdate, sessionSeconds]);

  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <video ref={videoRef} className="hidden" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />
        {metrics && (
          <>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass border border-slate-200/60 text-xs font-semibold"
              style={{ color: metrics.behaviourColor }}>
              {LABEL_ICONS[metrics.behaviour]}
              <span>{metrics.behaviour}</span>
            </div>
            <div className="text-xs text-slate-500">Focus: <span className="font-bold text-slate-700">{metrics.focusScore}%</span></div>
          </>
        )}
        {!cameraActive && (
          <span className="text-xs text-slate-400 flex items-center gap-1"><WifiOff className="w-3 h-3" /> No camera</span>
        )}
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl border border-slate-200/60 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
          <h3 className="text-sm font-semibold text-slate-700">Live Behaviour Monitor</h3>
        </div>
        <span className="text-xs text-slate-500 font-mono">{formatTime(sessionSeconds)}</span>
      </div>

      <div className="p-5 space-y-5">
        {/* Camera feed */}
        <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-video max-w-[220px] mx-auto shadow-lg">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline muted autoPlay
          />
          <canvas ref={canvasRef} className="hidden" />

          {!cameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <WifiOff className="w-8 h-8 text-slate-500" />
              <p className="text-xs text-slate-500">{cameraError || 'Camera off'}</p>
            </div>
          )}

          {/* Status overlay */}
          {cameraActive && (
            <div className="absolute bottom-2 left-2 right-2 flex justify-between">
              <span className="px-2 py-0.5 rounded bg-black/70 text-white text-xs backdrop-blur-sm flex items-center gap-1">
                {tabActive ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-red-400" />}
                {tabActive ? 'Tab Active' : 'Tab Hidden'}
              </span>
              <span className="px-2 py-0.5 rounded bg-black/70 text-white text-xs backdrop-blur-sm flex items-center gap-1">
                {faceDetected ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3 text-red-400" />}
                {faceDetected ? 'Present' : 'Away'}
              </span>
            </div>
          )}
        </div>

        {/* Camera controls */}
        <div className="flex gap-2">
          {!cameraActive ? (
            <button onClick={startCamera}
              className="flex-1 px-3 py-2 bg-primary-500 hover:bg-primary-400 text-white rounded-lg text-xs font-semibold transition-colors">
              Enable Camera
            </button>
          ) : (
            <button onClick={stopCamera}
              className="flex-1 px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition-colors">
              Disable Camera
            </button>
          )}
        </div>

        {/* Current status */}
        {metrics && (
          <>
            <div className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all duration-500"
              style={{ borderColor: metrics.behaviourColor + '40', background: metrics.behaviourColor + '10' }}>
              {LABEL_ICONS[metrics.behaviour]}
              <span className="font-bold text-lg" style={{ color: metrics.behaviourColor }}>
                {metrics.behaviour}
              </span>
            </div>

            {/* Score bars */}
            <div className="space-y-3">
              {[
                { label: 'Engagement', value: metrics.engagementScore, color: '#06b6d4' },
                { label: 'Focus', value: metrics.focusScore, color: '#8b5cf6' },
                { label: 'Participation', value: metrics.participationScore, color: '#22c55e' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-bold text-slate-700">{Math.min(value, 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(value, 100)}%`, background: color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!metrics && (
          <div className="text-center py-4 text-slate-400 text-sm">Initialising monitoring...</div>
        )}
      </div>
    </div>
  );
}

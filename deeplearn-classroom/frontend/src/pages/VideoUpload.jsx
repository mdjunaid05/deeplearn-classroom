import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud, CheckCircle, Video, Download, AlertCircle,
  Loader2, MonitorPlay, FileText, Zap, Cloud, Wifi,
  XCircle, RefreshCw, Image, X
} from 'lucide-react';
import SignAvatarOverlay from '../components/SignAvatarOverlay';
import { useAuth } from '../contexts/AuthContext';
import { saveVideo, saveCaptions } from '../utils/db';
import { API_BASE } from '../utils/api';

// ── Upload State Machine ───────────────────────────────────────────────────────
// Prevents duplicate uploads, conflicting states, and concurrent polling.
const STATE = Object.freeze({
  IDLE:                 'IDLE',
  REQUESTING_URL:       'REQUESTING_URL',
  UPLOADING_TO_R2:      'UPLOADING_TO_R2',
  UPLOADING_VIA_PROXY:  'UPLOADING_VIA_PROXY',
  CONFIRMING:           'CONFIRMING',
  PROCESSING:           'PROCESSING',
  COMPLETED:            'COMPLETED',
  FAILED:               'FAILED',
  CANCELLED:            'CANCELLED',
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatETA(seconds) {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/** Map backend step text to pipeline phase indicators */
function inferPipelinePhase(step, progress) {
  if (!step) return { captions: 'pending', signing: 'pending', thumbnail: 'pending' };
  const s = step.toLowerCase();
  if (progress >= 100 || s.includes('complete')) {
    return { captions: 'available', signing: 'available', thumbnail: 'available' };
  }
  if (s.includes('uploading to') || s.includes('finaliz')) {
    return { captions: 'available', signing: 'available', thumbnail: 'processing' };
  }
  if (s.includes('render') || s.includes('overlay') || s.includes('avatar')) {
    return { captions: 'available', signing: 'processing', thumbnail: 'pending' };
  }
  if (s.includes('gesture') || s.includes('mapping') || s.includes('sign')) {
    return { captions: 'available', signing: 'processing', thumbnail: 'pending' };
  }
  if (s.includes('transcri') || s.includes('whisper') || s.includes('audio') || s.includes('speech')) {
    return { captions: 'processing', signing: 'pending', thumbnail: 'pending' };
  }
  return { captions: 'processing', signing: 'pending', thumbnail: 'pending' };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function VideoUpload() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  // File selection
  const [file, setFile] = useState(null);

  // State machine
  const [machineState, setMachineState] = useState(STATE.IDLE);

  // Upload tracking (used during UPLOADING_TO_R2 and UPLOADING_VIA_PROXY)
  const [uploadProgress, setUploadProgress] = useState(0); // 0-100, real XHR progress
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [uploadETA, setUploadETA] = useState(0);
  const [uploadMethod, setUploadMethod] = useState(''); // 'direct' | 'proxy'

  // Processing tracking (used during PROCESSING)
  const [processingStep, setProcessingStep] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [pipelinePhase, setPipelinePhase] = useState({ captions: 'pending', signing: 'pending', thumbnail: 'pending' });

  // Results
  const [jobId, setJobId] = useState(null);
  const [videoId, setVideoId] = useState(null);
  const [r2Key, setR2Key] = useState(null);
  const [filename, setFilename] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [captions, setCaptions] = useState([]);
  const [currentGestureIdx, setCurrentGestureIdx] = useState(0);

  // Error
  const [error, setError] = useState('');
  const [errorContext, setErrorContext] = useState(''); // which phase failed

  const pollRef = useRef(null);
  const xhrRef = useRef(null);
  const videoRef = useRef(null);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (xhrRef.current) { xhrRef.current.abort(); xhrRef.current = null; }
    };
  }, []);

  // Gesture animation for completed videos
  useEffect(() => {
    if (machineState !== STATE.COMPLETED || captions.length === 0) return;
    const allGestures = captions.flatMap(c => (c.text || '').split(' ').filter(Boolean));
    if (allGestures.length === 0) return;
    const interval = setInterval(() => {
      setCurrentGestureIdx(prev => (prev + 1) % allGestures.length);
    }, 800);
    return () => clearInterval(interval);
  }, [machineState, captions]);

  // ── State transition helpers ──────────────────────────────────────────────

  const resetAll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (xhrRef.current) { xhrRef.current.abort(); xhrRef.current = null; }
    setMachineState(STATE.IDLE);
    setUploadProgress(0);
    setUploadSpeed(0);
    setUploadedBytes(0);
    setTotalBytes(0);
    setUploadETA(0);
    setUploadMethod('');
    setProcessingStep('');
    setProcessingProgress(0);
    setPipelinePhase({ captions: 'pending', signing: 'pending', thumbnail: 'pending' });
    setJobId(null);
    setVideoId(null);
    setR2Key(null);
    setFilename('');
    setVideoUrl('');
    setCaptions([]);
    setError('');
    setErrorContext('');
    setCurrentGestureIdx(0);
  }, []);

  const fail = useCallback((message, context) => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    console.error(`[UPLOAD_FAILED] context=${context} error=${message}`);
    setMachineState(STATE.FAILED);
    setError(message);
    setErrorContext(context);
  }, []);

  // ── Guard: prevent actions in non-idle states ─────────────────────────────

  const isActive = machineState !== STATE.IDLE && machineState !== STATE.COMPLETED &&
                   machineState !== STATE.FAILED && machineState !== STATE.CANCELLED;

  // ── File selection ────────────────────────────────────────────────────────

  const handleDrop = (e) => {
    e.preventDefault();
    if (isActive) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      resetAll();
    }
  };

  const handleFileSelect = (e) => {
    if (isActive) return;
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      resetAll();
    }
  };

  // ── Full Pipeline: Presigned → R2 → Confirm → Poll ───────────────────────

  const handleFullPipeline = async () => {
    if (!file || isActive) return;

    if (!user) {
      fail('Your session has expired. Please log in again.', 'auth');
      return;
    }

    setMachineState(STATE.REQUESTING_URL);
    setError('');
    setTotalBytes(file.size);
    console.log(`[UPLOAD_REQUEST_RECEIVED] pipeline=full filename=${file.name} size=${file.size}`);

    try {
      // ── Step 1: Request presigned upload URL ──
      let presignedData = null;
      let useProxy = false;

      try {
        const reqHeaders = { 'Content-Type': 'application/json' };
        if (token) reqHeaders['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}/request-upload-url`, {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify({
            teacher_id: user.teacher_id || user.id || user.user_id || 1,
            course_id: 1,
            filename: file.name,
            content_type: file.type || 'video/mp4',
            title: file.name,
            file_size: file.size,
          }),
        });

        if (res.ok) {
          presignedData = await res.json();
          console.log(`[PRESIGNED_URL_RECEIVED] video_id=${presignedData.video_id} r2_key=${presignedData.r2_key}`);
        } else if (res.status === 503) {
          // R2 not configured — configuration failure → silent fallback
          console.log('[PRESIGNED_UNAVAILABLE] R2 not configured, falling back to proxy');
          useProxy = true;
        } else {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Unable to prepare cloud upload (${res.status})`);
        }
      } catch (presignErr) {
        if (presignErr.message.includes('Failed to fetch') || presignErr.message.includes('NetworkError')) {
          // Network error reaching backend entirely
          const msg = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'Could not reach the local backend. Make sure the Flask server is running:\n  cd backend && python app.py'
            : 'Could not reach the backend API. Check your connection and ensure the backend is running.';
          throw new Error(msg);
        }
        // Other errors — fall back to proxy if it looks like a config issue
        if (!presignErr.message.includes('Unable to prepare')) {
          console.warn('[PRESIGNED_FALLBACK]', presignErr.message);
          useProxy = true;
        } else {
          throw presignErr;
        }
      }

      if (!useProxy && presignedData) {
        // ── Direct R2 upload path ──
        setUploadMethod('direct');
        setVideoId(presignedData.video_id);
        setR2Key(presignedData.r2_key);
        setMachineState(STATE.UPLOADING_TO_R2);

        await performXHRUpload(
          presignedData.upload_url,
          file,
          presignedData.content_type || file.type || 'video/mp4',
          'PUT'
        );

        // ── Step 2: Confirm upload ──
        setMachineState(STATE.CONFIRMING);

        const confHeaders = { 'Content-Type': 'application/json' };
        if (token) confHeaders['Authorization'] = `Bearer ${token}`;

        const confirmRes = await fetch(`${API_BASE}/confirm-upload`, {
          method: 'POST',
          headers: confHeaders,
          body: JSON.stringify({
            video_id: presignedData.video_id,
            r2_key: presignedData.r2_key,
          }),
        });

        if (!confirmRes.ok) {
          const errBody = await confirmRes.json().catch(() => ({}));
          if (errBody.recoverable) {
            throw new Error('Cloud upload could not be verified. The file may not have uploaded completely. Please retry.');
          }
          throw new Error(errBody.error || `Unable to confirm video upload (${confirmRes.status})`);
        }

        const confirmData = await confirmRes.json();
        console.log(`[CONFIRM_SUCCESS] job_id=${confirmData.job_id} video_id=${confirmData.video_id}`);
        setJobId(confirmData.job_id);
        setFilename(confirmData.filename);

        // ── Step 3: Poll processing ──
        setMachineState(STATE.PROCESSING);
        setProcessingStep('Video pipeline started...');
        startPolling(confirmData.job_id);

      } else {
        // ── Proxy upload fallback ──
        setUploadMethod('proxy');
        setMachineState(STATE.UPLOADING_VIA_PROXY);

        const proxyResult = await performProxyUpload();
        setJobId(proxyResult.job_id);
        setVideoId(proxyResult.video_id);
        setFilename(proxyResult.filename);

        setMachineState(STATE.PROCESSING);
        setProcessingStep('Video pipeline started...');
        startPolling(proxyResult.job_id);
      }

    } catch (err) {
      fail(err.message, 'upload');
    }
  };

  // ── XHR upload with real progress (used for both direct R2 PUT and proxy) ─

  const performXHRUpload = useCallback((url, fileObj, contentType, method = 'PUT') => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      let lastLoaded = 0;
      let lastTime = Date.now();

      xhr.upload.addEventListener('progress', (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(pct);
        setUploadedBytes(e.loaded);
        setTotalBytes(e.total);

        // Speed calculation (smoothed over 500ms windows)
        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        if (elapsed > 0.5) {
          const speed = (e.loaded - lastLoaded) / elapsed;
          setUploadSpeed(speed);
          const remaining = e.total - e.loaded;
          setUploadETA(speed > 0 ? remaining / speed : 0);
          lastLoaded = e.loaded;
          lastTime = now;
        }
      });

      xhr.addEventListener('load', () => {
        xhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(100);
          setUploadSpeed(0);
          setUploadETA(0);
          console.log(`[UPLOAD_COMPLETE] status=${xhr.status} method=${method}`);
          resolve(xhr);
        } else {
          reject(new Error(
            method === 'PUT'
              ? `Cloud upload failed (status ${xhr.status}). Please retry.`
              : `Video upload failed (status ${xhr.status}).`
          ));
        }
      });

      xhr.addEventListener('error', () => {
        xhrRef.current = null;
        reject(new Error(
          method === 'PUT'
            ? 'Cloud upload failed. Please check your connection and retry.'
            : 'Video upload failed. Please check your connection and retry.'
        ));
      });

      xhr.addEventListener('abort', () => {
        xhrRef.current = null;
        reject(new Error('Upload cancelled'));
      });

      xhr.open(method, url);
      if (method === 'PUT') {
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.send(fileObj);
      } else {
        // FormData for proxy
        xhr.send(fileObj);
      }
    });
  }, []);

  // ── Proxy upload (fallback) ───────────────────────────────────────────────

  const performProxyUpload = useCallback(() => {
    const formData = new FormData();
    formData.append('video_file', file);
    formData.append('teacher_id', user?.teacher_id || user?.id || user?.user_id || '');
    formData.append('course_id', 1);
    formData.append('title', file.name);
    formData.append('filename', file.name);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      let lastLoaded = 0;
      let lastTime = Date.now();

      xhr.upload.addEventListener('progress', (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(pct);
        setUploadedBytes(e.loaded);
        setTotalBytes(e.total);

        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        if (elapsed > 0.5) {
          const speed = (e.loaded - lastLoaded) / elapsed;
          setUploadSpeed(speed);
          const remaining = e.total - e.loaded;
          setUploadETA(speed > 0 ? remaining / speed : 0);
          lastLoaded = e.loaded;
          lastTime = now;
        }
      });

      xhr.addEventListener('load', () => {
        xhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            setUploadProgress(100);
            setUploadSpeed(0);
            setUploadETA(0);
            resolve(data);
          } catch {
            reject(new Error('Invalid response from server'));
          }
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            reject(new Error(errData.error || `Upload failed (status ${xhr.status})`));
          } catch {
            reject(new Error(`Upload failed (status ${xhr.status})`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        xhrRef.current = null;
        const msg = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          ? 'Could not reach the local backend. Make sure the Flask server is running:\n  cd backend && python app.py'
          : 'Could not reach the backend API. Check your connection and ensure the backend is running.';
        reject(new Error(msg));
      });

      xhr.addEventListener('abort', () => {
        xhrRef.current = null;
        reject(new Error('Upload cancelled'));
      });

      xhr.open('POST', `${API_BASE}/upload-video`);
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.send(formData);
    });
  }, [file, user, token]);

  // ── Processing status polling ─────────────────────────────────────────────

  const startPolling = useCallback((id) => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    let consecutiveFailures = 0;

    pollRef.current = setInterval(async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${API_BASE}/video-status?job_id=${id}`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error('Status check failed');

        const data = await res.json();
        consecutiveFailures = 0;

        // Use real backend progress and step — do NOT fabricate
        if (typeof data.progress === 'number') setProcessingProgress(data.progress);
        if (data.step) setProcessingStep(data.step);

        // Infer pipeline sub-statuses from step text
        const phase = inferPipelinePhase(data.step, data.progress);
        setPipelinePhase(phase);

        if (data.status === 'done') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setMachineState(STATE.COMPLETED);
          setProcessingProgress(100);
          setProcessingStep('Processing complete!');
          setPipelinePhase({ captions: 'available', signing: 'available', thumbnail: 'available' });

          if (data.video_url) setVideoUrl(data.video_url);
          if (data.captions) {
            setCaptions(data.captions);
            saveCaptions(data.captions).catch(console.error);
          }
          window.dispatchEvent(new CustomEvent('video-list-updated'));

        } else if (data.status === 'error') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          fail(data.error || 'Video processing failed.', 'processing');
        }
      } catch (err) {
        consecutiveFailures++;
        console.error(`Polling error (attempt ${consecutiveFailures}/20):`, err.message);
        if (consecutiveFailures >= 20) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          fail('Lost connection to the backend. Processing may still be running — check your video list later.', 'polling');
        }
      }
    }, 3000);
  }, [fail]);

  // ── Cancel ────────────────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    if (xhrRef.current) { xhrRef.current.abort(); xhrRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setMachineState(STATE.CANCELLED);
  }, []);

  // ── Retry ─────────────────────────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    if (errorContext === 'upload') {
      // Full retry from beginning
      resetAll();
      // Small delay then trigger again
      setTimeout(() => handleFullPipeline(), 50);
    } else if (errorContext === 'processing' && videoId && r2Key) {
      // Re-confirm — reuse existing R2 object, don't re-upload
      setMachineState(STATE.CONFIRMING);
      setError('');
      setErrorContext('');

      fetch(`${API_BASE}/confirm-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId, r2_key: r2Key }),
      })
        .then(res => {
          if (!res.ok) throw new Error('Retry confirmation failed');
          return res.json();
        })
        .then(data => {
          setJobId(data.job_id);
          setFilename(data.filename);
          setMachineState(STATE.PROCESSING);
          setProcessingStep('Retrying pipeline...');
          startPolling(data.job_id);
        })
        .catch(err => fail(err.message, 'processing'));
    } else {
      // Generic retry — start fresh
      resetAll();
    }
  }, [errorContext, videoId, r2Key, resetAll, fail, startPolling, handleFullPipeline]);

  // ── Fast caption-only extraction (unchanged logic) ────────────────────────

  const handleCaptionOnly = async () => {
    if (!file || isActive) return;

    if (!user) {
      fail('Your session has expired. Please log in again.', 'auth');
      return;
    }

    setMachineState(STATE.PROCESSING);
    setProcessingStep('Uploading video for caption extraction...');
    setError('');
    console.log(`[UPLOAD_REQUEST_RECEIVED] pipeline=captions filename=${file.name} size=${file.size}`);

    try {
      saveCaptions([]).catch(console.error);
      window.uploadedDemoVideo = null;
      window.uploadedDemoTitle = null;
      window.uploadedDemoCaptions = [];

      const formData = new FormData();
      formData.append('video_file', file);
      formData.append('teacher_id', user?.id || user?.user_id || '');
      formData.append('course_id', 1);
      formData.append('title', file.name);
      formData.append('filename', file.name);

      setProcessingStep('Extracting audio track from video...');
      const res = await fetch(`${API_BASE}/extract-captions`, { method: 'POST', body: formData });

      setProcessingStep('Whisper transcribing audio...');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Backend returned ${res.status}`);
      }

      const data = await res.json();
      const realCaptions = data.captions || [];
      setProcessingStep('Processing transcript...');

      if (realCaptions.length === 0) {
        throw new Error('Whisper returned no transcript. The video may have no audio, or audio is too quiet.');
      }

      saveVideo(file).catch(console.error);
      saveCaptions(realCaptions).catch(console.error);
      window.uploadedDemoVideo = URL.createObjectURL(file);
      window.uploadedDemoTitle = file.name;
      window.uploadedDemoCaptions = realCaptions;

      setCaptions(realCaptions);
      setMachineState(STATE.COMPLETED);
      setProcessingStep('Caption extraction complete!');
      window.dispatchEvent(new CustomEvent('video-list-updated'));

    } catch (err) {
      fail(err.message, 'captions');
    }
  };

  // ── Download helper ───────────────────────────────────────────────────────

  const handleDownload = () => {
    if (videoUrl && videoUrl.startsWith('http')) {
      window.open(videoUrl, '_blank');
    } else if (filename) {
      const authParam = user?.role === 'teacher' ? `&teacher_id=${user?.id}` : `&student_id=${user?.id}`;
      window.open(`${API_BASE}/download-signed-video?filename=${encodeURIComponent(filename)}${authParam}`, '_blank');
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────

  const allGestureWords = captions.flatMap(c => (c.text || '').split(' ').filter(Boolean));
  const currentGesture = allGestureWords[currentGestureIdx] || '';
  const isUploading = machineState === STATE.UPLOADING_TO_R2 || machineState === STATE.UPLOADING_VIA_PROXY;
  const isWorking = isActive; // any non-terminal state

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-enter bg-nexus-background min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-nexus-on-background" role="main">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#131b2e] flex items-center gap-3">
            <UploadCloud className="w-8 h-8 text-[#00687a]" />
            Sign Language Video Pipeline
          </h1>
          <p className="text-[#3d494c] mt-1">Upload lesson videos to automatically extract captions and render an ISL avatar overlay.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ── Left Column: Upload + Controls ── */}
        <div className="space-y-6">

          {/* Drop Zone */}
          <div
            className={`p-10 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-colors text-center ${
              isWorking ? 'border-slate-200 bg-slate-50/50 cursor-not-allowed opacity-60' :
              file ? 'border-[#00687a] bg-primary-500/10 cursor-pointer' :
              'border-white/20 bg-surface-800/50 hover:bg-surface-800 cursor-pointer'
            }`}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={handleDrop}
            onClick={() => !isWorking && document.getElementById('video-upload-input').click()}
            tabIndex={0}
            role="button"
            aria-label="Upload video area"
          >
            <input
              id="video-upload-input"
              type="file"
              accept="video/mp4,video/avi,video/quicktime,video/webm"
              className="hidden"
              onChange={handleFileSelect}
            />
            {file ? (
              <>
                <Video className="w-12 h-12 text-[#00687a] mb-4" />
                <p className="text-lg font-semibold text-[#131b2e]">{file.name}</p>
                <p className="text-sm text-[#3d494c] mt-2">{formatBytes(file.size)}</p>
              </>
            ) : (
              <>
                <UploadCloud className="w-12 h-12 text-[#6d797d] mb-4" />
                <p className="text-lg font-semibold text-[#131b2e]">Drag & drop video here</p>
                <p className="text-sm text-[#3d494c] mt-2">MP4, AVI, MOV or WebM up to 500MB</p>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleCaptionOnly}
              disabled={!file || isWorking}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all text-sm ${
                !file || isWorking
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-surface-700 hover:bg-surface-600 text-white shadow-lg border border-white/10'
              }`}
            >
              Extract Captions Only
            </button>
            <button
              onClick={handleFullPipeline}
              disabled={!file || isWorking}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all text-sm ${
                !file || isWorking
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg hover:shadow-primary-500/25'
              }`}
            >
              {isWorking ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isUploading ? 'Uploading...' : 'Processing...'}
                </span>
              ) : 'Generate Deaf Signing Video'}
            </button>
          </div>

          {/* ── UPLOAD PROGRESS (separate from processing) ── */}
          {isUploading && (
            <div className="p-5 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40" aria-live="polite">
              {/* Method badge */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-[#131b2e]">Uploading Video</span>
                {uploadMethod === 'direct' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                    <Cloud className="w-3 h-3" /> Direct to Cloud
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                    <Wifi className="w-3 h-3" /> Via Server
                  </span>
                )}
              </div>

              {/* Progress bar — real percentage */}
              <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-300 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>

              {/* Stats line */}
              <div className="flex items-center justify-between mt-2.5 text-xs text-[#3d494c]">
                <span>{uploadProgress}%</span>
                <span>{formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}</span>
              </div>
              {uploadSpeed > 0 && (
                <div className="flex items-center justify-between mt-1 text-xs text-[#6d797d]">
                  <span>Speed: {formatBytes(uploadSpeed)}/s</span>
                  <span>ETA: {formatETA(uploadETA)}</span>
                </div>
              )}

              {/* Cancel */}
              <button
                onClick={handleCancel}
                className="mt-3 w-full py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-all border border-transparent hover:border-red-200"
              >
                Cancel Upload
              </button>
            </div>
          )}

          {/* ── CONFIRMING PHASE ── */}
          {machineState === STATE.REQUESTING_URL && (
            <div className="p-5 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 flex items-center gap-3" aria-live="polite">
              <Loader2 className="w-5 h-5 text-[#00687a] animate-spin shrink-0" />
              <span className="text-sm text-[#3d494c]">Requesting upload URL...</span>
            </div>
          )}
          {machineState === STATE.CONFIRMING && (
            <div className="p-5 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40" aria-live="polite">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                <span className="text-sm font-medium text-emerald-700">Upload complete ✓</span>
              </div>
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-[#00687a] animate-spin shrink-0" />
                <span className="text-sm text-[#3d494c]">Verifying upload & starting pipeline...</span>
              </div>
            </div>
          )}

          {/* ── PROCESSING STATUS (status-based, not fake percentage) ── */}
          {machineState === STATE.PROCESSING && (
            <div className="p-5 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40" aria-live="polite">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-[#131b2e]">Processing Pipeline</span>
                {processingProgress > 0 && (
                  <span className="text-xs font-mono text-[#6d797d]">{processingProgress}%</span>
                )}
              </div>

              {/* Upload complete badge */}
              <StatusRow icon={UploadCloud} label="Video uploaded" status="available" />

              {/* Pipeline checklist — derived from real backend step text */}
              <StatusRow icon={FileText} label="Captions" status={pipelinePhase.captions} />
              <StatusRow icon={Zap} label="ISL Signing" status={pipelinePhase.signing} />
              <StatusRow icon={Image} label="Thumbnail" status={pipelinePhase.thumbnail} />

              {/* Current step from backend */}
              {processingStep && (
                <p className="text-[11px] text-[#6d797d] mt-3 pt-3 border-t border-slate-100 truncate">
                  {processingStep}
                </p>
              )}

              {/* Cancel */}
              <button
                onClick={handleCancel}
                className="mt-3 w-full py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-all border border-transparent hover:border-red-200"
              >
                Cancel
              </button>
            </div>
          )}

          {/* ── FAILED ── */}
          {machineState === STATE.FAILED && (
            <div className="p-5 rounded-2xl bg-red-50 border border-red-200 text-center" aria-live="polite">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
              <h3 className="text-base font-bold text-red-700">
                {errorContext === 'upload' ? 'Upload Failed' :
                 errorContext === 'processing' ? 'Processing Failed' :
                 errorContext === 'captions' ? 'Caption Extraction Failed' :
                 'Error'}
              </h3>
              <p className="text-sm text-red-500 mt-1 whitespace-pre-line max-w-md mx-auto">{error}</p>
              <div className="flex gap-2 justify-center mt-4">
                <button
                  onClick={handleRetry}
                  className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" /> Retry
                </button>
                <button
                  onClick={() => { resetAll(); }}
                  className="px-5 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Start Over
                </button>
              </div>
            </div>
          )}

          {/* ── CANCELLED ── */}
          {machineState === STATE.CANCELLED && (
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center" aria-live="polite">
              <X className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <h3 className="text-base font-bold text-slate-600">Upload Cancelled</h3>
              <p className="text-sm text-slate-500 mt-1">You can select a file and try again.</p>
              <button
                onClick={() => resetAll()}
                className="mt-3 px-5 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Reset
              </button>
            </div>
          )}

          {/* ── COMPLETED ── */}
          {machineState === STATE.COMPLETED && (
            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center" aria-live="polite">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h3 className="text-base font-bold text-emerald-700">Processing Complete!</h3>

              {/* Final status checklist */}
              <div className="inline-flex flex-col gap-1.5 mt-3 text-left">
                <StatusRow icon={UploadCloud} label="Video uploaded" status="available" />
                <StatusRow icon={FileText} label="Captions" status={captions.length > 0 ? 'available' : pipelinePhase.captions} />
                <StatusRow icon={Zap} label="ISL Signing" status={pipelinePhase.signing} />
                <StatusRow icon={Image} label="Thumbnail" status={pipelinePhase.thumbnail} />
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 mt-4">
                <button
                  className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-semibold flex items-center justify-center gap-2 transition-colors shadow-md"
                  onClick={handleDownload}
                >
                  <Download className="w-5 h-5" /> Download Processed Video
                </button>

                {jobId && (
                  <div className="flex gap-2 w-full">
                    <a
                      href={`${API_BASE}/video-captions?job_id=${jobId}&format=srt`}
                      download
                      className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      target="_blank" rel="noreferrer"
                    >
                      <FileText className="w-4 h-4" /> SRT
                    </a>
                    <a
                      href={`${API_BASE}/video-captions?job_id=${jobId}&format=vtt`}
                      download
                      className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      target="_blank" rel="noreferrer"
                    >
                      <FileText className="w-4 h-4" /> VTT
                    </a>
                  </div>
                )}

                <button
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-md"
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (jobId) params.append('job_id', jobId);
                    if (filename) params.append('filename', filename);
                    if (captions.length > 0) {
                      window.uploadedDemoCaptions = captions;
                      window.uploadedDemoTitle = file?.name || 'Uploaded Video';
                      if (videoUrl) {
                        window.uploadedDemoVideo = videoUrl;
                      }
                    }
                    navigate(`/classroom?${params.toString()}&uploaded=true`);
                  }}
                >
                  <MonitorPlay className="w-5 h-5" /> Watch in Classroom
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right Column: Preview ── */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 min-h-[300px]">
            <h2 className="text-lg font-semibold text-[#131b2e] mb-4">Pipeline Output Preview</h2>
            {machineState === STATE.COMPLETED && (videoUrl || filename) ? (
              <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
                <video
                  ref={videoRef}
                  src={videoUrl || `${API_BASE}/download-signed-video?filename=${encodeURIComponent(filename)}&${user?.role === 'teacher' ? `teacher_id=${user?.id}` : `student_id=${user?.id}`}`}
                  controls
                  className="absolute inset-0 w-full h-full object-contain"
                  onError={() => { if (videoRef.current) videoRef.current.style.display = 'none'; }}
                />
                <SignAvatarOverlay currentWord={currentGesture} />
              </div>
            ) : isWorking ? (
              <div className="aspect-video bg-slate-50 rounded-xl border-2 border-dashed border-[#00687a]/20 flex flex-col items-center justify-center text-center gap-3">
                <Loader2 className="w-10 h-10 text-[#00687a] animate-spin" />
                <p className="text-sm text-[#3d494c] font-medium">{processingStep || 'Working...'}</p>
                <p className="text-xs text-[#6d797d]">This may take a few minutes</p>
              </div>
            ) : (
              <div className="aspect-video bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-[#6d797d]">
                Preview will appear here after processing.
              </div>
            )}
          </div>

          {/* Extracted Captions */}
          {machineState === STATE.COMPLETED && captions.length > 0 && (
            <div className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 max-h-80 overflow-y-auto">
              <h3 className="text-sm font-semibold text-[#6d797d] mb-4 sticky top-0 bg-white/90 py-2 flex items-center justify-between">
                <span>Extracted Captions & Sign Gestures</span>
                <span className="text-xs text-[#00687a] font-normal">{captions.length} segments</span>
              </h3>
              <ul className="space-y-3">
                {captions.map((cap, idx) => (
                  <li key={idx} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-mono text-[#00687a]">
                        [{cap.start_time || '—'} — {cap.end_time || '—'}]
                      </span>
                      <span className="text-[10px] text-[#6d797d]">Segment {idx + 1}</span>
                    </div>
                    <p className="text-sm text-[#131b2e] mb-2">{cap.text}</p>
                    <div className="flex flex-wrap gap-1">
                      {(cap.gestures || cap.text.split(' ')).map((gesture, i) => (
                        <span
                          key={i}
                          className={`text-[10px] px-2 py-0.5 rounded border ${
                            typeof gesture === 'string' && gesture.startsWith('FS:')
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {typeof gesture === 'string' ? gesture.toUpperCase() : gesture}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── StatusRow sub-component ─────────────────────────────────────────────────

function StatusRow({ icon: Icon, label, status }) {
  const config = {
    available: { icon: CheckCircle, color: 'text-emerald-500', text: '✓' },
    processing: { icon: Loader2, color: 'text-blue-500 animate-spin', text: '⏳' },
    pending: { icon: null, color: 'text-slate-400', text: '⏳' },
    failed: { icon: XCircle, color: 'text-red-500', text: '❌' },
  };
  const c = config[status] || config.pending;
  const StatusIcon = c.icon || Icon;

  return (
    <div className="flex items-center gap-2.5 py-1">
      <StatusIcon className={`w-4 h-4 shrink-0 ${c.color}`} />
      <span className={`text-sm ${status === 'available' ? 'text-emerald-700 font-medium' : status === 'failed' ? 'text-red-600 font-medium' : 'text-[#3d494c]'}`}>
        {label}
      </span>
      {status === 'failed' && (
        <span className="text-[10px] text-red-500 font-semibold uppercase ml-auto">Failed</span>
      )}
    </div>
  );
}

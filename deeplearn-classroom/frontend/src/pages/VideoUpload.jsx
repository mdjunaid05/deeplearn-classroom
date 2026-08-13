import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, CheckCircle, Video, Download, AlertCircle, Loader2, MonitorPlay, FileText, Zap, Cloud, Wifi } from 'lucide-react';
import SignAvatarOverlay from '../components/SignAvatarOverlay';
import { useAuth } from '../contexts/AuthContext';
import { saveVideo, saveCaptions } from '../utils/db';
import { API_BASE } from '../utils/api';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatETA(seconds) {
  if (!seconds || !isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function makeNetworkErrorMessage(err) {
  const isNetworkError =
    err.message.includes('fetch') ||
    err.message.includes('Failed to fetch') ||
    err.message.includes('NetworkError');

  if (!isNetworkError) return null;

  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `Could not reach the local backend. Make sure the Flask server is running:\n  cd backend && python app.py\n\nThen try again.`
    : `Could not reach the backend API. Ensure that the VITE_API_URL environment variable is configured in the Vercel dashboard and your Render backend service is running.`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function VideoUpload() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState('');
  const [status, setStatus] = useState(''); // '', 'uploading', 'processing', 'done', 'error'
  const [phase, setPhase] = useState(''); // 'upload', 'pipeline'
  const [jobId, setJobId] = useState(null);
  const [videoId, setVideoId] = useState(null);
  const [filename, setFilename] = useState('');
  const [captions, setCaptions] = useState([]);
  const [error, setError] = useState('');
  const [currentGestureIdx, setCurrentGestureIdx] = useState(0);

  // Upload metrics
  const [uploadSpeed, setUploadSpeed] = useState(0);  // bytes/sec
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [uploadETA, setUploadETA] = useState(0);
  const [uploadMethod, setUploadMethod] = useState(''); // 'direct' or 'proxy'

  // Pipeline status breakdown
  const [captionStatus, setCaptionStatus] = useState('pending'); // pending, processing, available, failed
  const [signingStatus, setSigningStatus] = useState('pending');

  const pollRef = useRef(null);
  const xhrRef = useRef(null);
  const videoRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (xhrRef.current) xhrRef.current.abort();
    };
  }, []);

  // Cycle through gesture words for the avatar preview
  useEffect(() => {
    if (status !== 'done' || captions.length === 0) return;
    const allGestures = captions.flatMap(c => c.text.split(' '));
    if (allGestures.length === 0) return;

    const interval = setInterval(() => {
      setCurrentGestureIdx(prev => (prev + 1) % allGestures.length);
    }, 800);
    return () => clearInterval(interval);
  }, [status, captions]);

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      resetState();
    }
  };

  const resetState = () => {
    setStatus('');
    setPhase('');
    setProgress(0);
    setStep('');
    setJobId(null);
    setVideoId(null);
    setFilename('');
    setCaptions([]);
    setError('');
    setCurrentGestureIdx(0);
    setUploadSpeed(0);
    setUploadedBytes(0);
    setTotalBytes(0);
    setUploadETA(0);
    setUploadMethod('');
    setCaptionStatus('pending');
    setSigningStatus('pending');
  };

  // ── Fast caption-only extraction (unchanged) ────────────────────────────────

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setStatus('processing');
    setPhase('pipeline');
    setProgress(5);
    setStep('Uploading video...');
    setError('');
    console.log('[UPLOAD_REQUEST_RECEIVED] filename=' + file.name + ' size=' + file.size);
    await extractCaptionsLocally();
  };

  // ── Full pipeline: presigned → R2 → confirm → poll ──────────────────────────

  const handleFullPipeline = async () => {
    if (!file) return;
    setUploading(true);
    setStatus('uploading');
    setPhase('upload');
    setProgress(0);
    setStep('Requesting upload URL...');
    setError('');
    setTotalBytes(file.size);
    console.log('[UPLOAD_REQUEST_RECEIVED] pipeline=full filename=' + file.name + ' size=' + file.size);

    try {
      // ── Step 1: Try presigned direct-to-R2 upload ──
      let usePresigned = true;
      let presignedData = null;

      try {
        const presignRes = await fetch(`${API_BASE}/request-upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teacher_id: user?.id || 1,
            course_id: 1,
            filename: file.name,
            content_type: file.type || 'video/mp4',
            title: file.name,
            file_size: file.size,
          }),
        });

        if (presignRes.ok) {
          presignedData = await presignRes.json();
          console.log('[PRESIGNED_URL_RECEIVED] video_id=' + presignedData.video_id + ' r2_key=' + presignedData.r2_key);
        } else {
          const errBody = await presignRes.json().catch(() => ({}));
          // 503 = R2 not configured → fall back to proxy
          if (presignRes.status === 503) {
            console.log('[PRESIGNED_UNAVAILABLE] R2 not configured, falling back to proxy upload');
            usePresigned = false;
          } else {
            throw new Error(errBody.error || `Presigned URL request failed (${presignRes.status})`);
          }
        }
      } catch (presignErr) {
        // Network error or unexpected failure → fall back to proxy
        const networkMsg = makeNetworkErrorMessage(presignErr);
        if (networkMsg) throw new Error(networkMsg);
        console.warn('[PRESIGNED_FALLBACK] Falling back to proxy upload:', presignErr.message);
        usePresigned = false;
      }

      if (usePresigned && presignedData) {
        // ── Presigned direct-to-R2 upload ──
        setUploadMethod('direct');
        setStep('Uploading directly to cloud storage...');
        setVideoId(presignedData.video_id);

        await uploadToR2Presigned(presignedData.upload_url, file, presignedData.content_type || file.type || 'video/mp4');

        // ── Step 2: Confirm upload + start pipeline ──
        setPhase('pipeline');
        setStatus('processing');
        setProgress(62);
        setStep('Verifying upload & starting pipeline...');

        const confirmRes = await fetch(`${API_BASE}/confirm-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video_id: presignedData.video_id,
            r2_key: presignedData.r2_key,
          }),
        });

        if (!confirmRes.ok) {
          const errBody = await confirmRes.json().catch(() => ({}));
          throw new Error(errBody.error || `Upload confirmation failed (${confirmRes.status})`);
        }

        const confirmData = await confirmRes.json();
        console.log('[CONFIRM_UPLOAD_SUCCESS] job_id=' + confirmData.job_id + ' video_id=' + confirmData.video_id);
        setJobId(confirmData.job_id);
        setFilename(confirmData.filename);
        setProgress(65);
        setStep('Video pipeline started...');
        startPolling(confirmData.job_id);

      } else {
        // ── Fallback: proxy upload through backend ──
        setUploadMethod('proxy');
        setStep('Uploading through server...');
        await uploadViaProxy();
      }
    } catch (err) {
      console.error('[UPLOAD_FAILED]', err);
      const networkMsg = makeNetworkErrorMessage(err);
      setStatus('error');
      setError(networkMsg || `Upload failed: ${err.message}`);
      setUploading(false);
    }
  };

  // ── XHR presigned PUT to R2 (with progress tracking) ────────────────────────

  const uploadToR2Presigned = useCallback((uploadUrl, fileObj, contentType) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      let startTime = Date.now();
      let lastLoaded = 0;
      let lastTime = startTime;

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          // Upload progress mapped to 0-60% of overall progress
          const uploadPct = (e.loaded / e.total) * 100;
          const overallPct = Math.round(uploadPct * 0.6); // 0–60%
          setProgress(overallPct);
          setUploadedBytes(e.loaded);
          setTotalBytes(e.total);

          // Calculate speed (smoothed over 500ms windows)
          const now = Date.now();
          const elapsed = (now - lastTime) / 1000;
          if (elapsed > 0.5) {
            const bytesPerSec = (e.loaded - lastLoaded) / elapsed;
            setUploadSpeed(bytesPerSec);
            const remaining = e.total - e.loaded;
            setUploadETA(bytesPerSec > 0 ? remaining / bytesPerSec : 0);
            lastLoaded = e.loaded;
            lastTime = now;
          }

          if (uploadPct < 100) {
            setStep(`Uploading to cloud... ${Math.round(uploadPct)}%`);
          } else {
            setStep('Finalizing upload...');
          }
        }
      });

      xhr.addEventListener('load', () => {
        xhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          setProgress(60);
          setUploadSpeed(0);
          setUploadETA(0);
          console.log('[R2_UPLOAD_COMPLETE] status=' + xhr.status);
          resolve();
        } else {
          reject(new Error(`R2 upload failed with status ${xhr.status}: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        xhrRef.current = null;
        reject(new Error('Network error during R2 upload. Please check your connection and try again.'));
      });

      xhr.addEventListener('abort', () => {
        xhrRef.current = null;
        reject(new Error('Upload cancelled'));
      });

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.send(fileObj);
    });
  }, []);

  // ── Fallback: proxy upload through backend ──────────────────────────────────

  const uploadViaProxy = async () => {
    const formData = new FormData();
    formData.append('video_file', file);
    formData.append('teacher_id', user?.id || 1);
    formData.append('course_id', 1);
    formData.append('title', file.name);
    formData.append('filename', file.name);

    // Use XHR for progress on proxy upload too
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      let lastLoaded = 0;
      let lastTime = Date.now();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const uploadPct = (e.loaded / e.total) * 100;
          const overallPct = Math.round(uploadPct * 0.5); // 0–50%
          setProgress(overallPct);
          setUploadedBytes(e.loaded);
          setTotalBytes(e.total);

          const now = Date.now();
          const elapsed = (now - lastTime) / 1000;
          if (elapsed > 0.5) {
            const bytesPerSec = (e.loaded - lastLoaded) / elapsed;
            setUploadSpeed(bytesPerSec);
            const remaining = e.total - e.loaded;
            setUploadETA(bytesPerSec > 0 ? remaining / bytesPerSec : 0);
            lastLoaded = e.loaded;
            lastTime = now;
          }

          if (uploadPct < 100) {
            setStep(`Uploading to server... ${Math.round(uploadPct)}%`);
          } else {
            setStep('Server processing upload...');
          }
        }
      });

      xhr.addEventListener('load', () => {
        xhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            console.log('[PROXY_UPLOAD_COMPLETED] job_id=' + data.job_id + ' video_id=' + data.video_id);
            setJobId(data.job_id);
            setVideoId(data.video_id);
            setFilename(data.filename);
            setPhase('pipeline');
            setStatus('processing');
            setProgress(55);
            setStep('Video pipeline started...');
            setUploadSpeed(0);
            setUploadETA(0);
            startPolling(data.job_id);
            resolve();
          } catch (parseErr) {
            reject(new Error('Invalid response from server'));
          }
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            reject(new Error(errData.error || `Upload failed with status ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        xhrRef.current = null;
        const networkMsg = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          ? `Could not reach the local backend. Make sure the Flask server is running:\n  cd backend && python app.py\n\nThen try again.`
          : `Could not reach the backend API. Ensure that the VITE_API_URL environment variable is configured in the Vercel dashboard and your Render backend service is running.`;
        reject(new Error(networkMsg));
      });

      xhr.addEventListener('abort', () => {
        xhrRef.current = null;
        reject(new Error('Upload cancelled'));
      });

      xhr.open('POST', `${API_BASE}/upload-video`);
      xhr.send(formData);
    });
  };

  // ── Caption-only extraction (unchanged) ─────────────────────────────────────

  const extractCaptionsLocally = async () => {
    setProgress(15);
    setStep('Step 1/4: Sending video to backend...');

    try {
      saveCaptions([]).catch(console.error);
      window.uploadedDemoVideo = null;
      window.uploadedDemoTitle = null;
      window.uploadedDemoCaptions = [];

      const formData = new FormData();
      formData.append('video_file', file);
      formData.append('teacher_id', user?.id || 1);
      formData.append('course_id', 1);
      formData.append('title', file.name);
      formData.append('filename', file.name);

      setProgress(30);
      setStep('Step 2/4: Extracting audio track from video...');

      const res = await fetch(`${API_BASE}/extract-captions`, {
        method: 'POST',
        body: formData,
      });

      setProgress(60);
      setStep('Step 3/4: Whisper transcribing audio...');

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Backend returned ${res.status}`);
      }

      const data = await res.json();
      const realCaptions = data.captions || [];

      setProgress(90);
      setStep('Step 4/4: Processing transcript...');

      if (realCaptions.length === 0) {
        throw new Error('Whisper returned no transcript. The video may have no audio, or audio is too quiet.');
      }

      console.log(`[Upload] ✓ Real captions received: ${realCaptions.length} segments`);
      realCaptions.forEach((c, i) =>
        console.log(`  [${i + 1}] ${c.start}s–${c.end}s: "${c.text}"`)
      );

      saveVideo(file).catch(console.error);
      saveCaptions(realCaptions).catch(console.error);
      window.uploadedDemoVideo    = URL.createObjectURL(file);
      window.uploadedDemoTitle    = file.name;
      window.uploadedDemoCaptions = realCaptions;

      setProgress(100);
      setStep('Processing complete!');
      setCaptions(realCaptions);
      setStatus('done');
      setUploading(false);
      console.log('[UPLOAD_COMPLETED] captions=' + realCaptions.length + ' filename=' + file.name);

      window.dispatchEvent(new CustomEvent('video-list-updated'));

    } catch (err) {
      console.error('[Upload] Caption extraction failed:', err.message);
      const networkMsg = makeNetworkErrorMessage(err);
      setStatus('error');
      setError(networkMsg || `Caption extraction failed: ${err.message}`);
      setUploading(false);
    }
  };

  // ── Pipeline polling ────────────────────────────────────────────────────────

  const startPolling = (id) => {
    if (pollRef.current) clearInterval(pollRef.current);
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

        // Map pipeline progress to 65-100% range
        if (data.progress) {
          const pipelinePct = Math.max(65, Math.round(65 + (data.progress / 100) * 35));
          setProgress(pipelinePct);
        }
        if (data.step) setStep(data.step);

        // Track caption and signing status from pipeline
        if (data.caption_status) setCaptionStatus(data.caption_status);
        if (data.signing_status) setSigningStatus(data.signing_status);

        if (data.status === 'done') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setStatus('done');
          setProgress(100);
          setStep('Processing complete!');
          setUploading(false);
          setCaptionStatus('available');
          setSigningStatus('available');

          if (data.captions) {
            setCaptions(data.captions);
            saveCaptions(data.captions).catch(console.error);
          }
          window.dispatchEvent(new CustomEvent('video-list-updated'));
        } else if (data.status === 'error') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setStatus('error');
          setError(data.error || 'Processing failed');
          setUploading(false);
          setCaptionStatus('failed');
          setSigningStatus('failed');
        }
      } catch (err) {
        consecutiveFailures++;
        console.error(`Polling error (attempt ${consecutiveFailures}/25):`, err);
        if (consecutiveFailures >= 25) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setStatus('error');
          setError('Lost connection to backend server. Polling aborted.');
          setUploading(false);
        }
      }
    }, 2000);
  };

  const handleCancelUpload = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    resetState();
    setUploading(false);
  };

  const handleDownload = () => {
    if (!filename) return;
    const authParam = user?.role === 'teacher' ? `&teacher_id=${user?.id || 1}` : `&student_id=${user?.id || 1}`;
    const url = `${API_BASE}/download-signed-video?filename=${encodeURIComponent(filename)}${jobId ? `&job_id=${jobId}` : ''}${authParam}`;
    window.open(url, '_blank');
  };

  const allGestureWords = captions.flatMap(c => c.text.split(' '));
  const currentGesture = allGestureWords[currentGestureIdx] || '';

  // ── Pipeline status step indicator ──────────────────────────────────────────

  const PipelineSteps = () => {
    const steps = [
      { label: 'Upload', icon: UploadCloud, done: phase === 'pipeline' || status === 'done', active: phase === 'upload' },
      { label: 'Captions', icon: FileText, done: captionStatus === 'available', active: phase === 'pipeline' && captionStatus === 'pending', failed: captionStatus === 'failed' },
      { label: 'ISL Signing', icon: Zap, done: signingStatus === 'available', active: phase === 'pipeline' && signingStatus === 'pending', failed: signingStatus === 'failed' },
      { label: 'Done', icon: CheckCircle, done: status === 'done', active: false },
    ];

    return (
      <div className="flex items-center justify-between w-full mb-4" aria-label="Pipeline progress steps">
        {steps.map((s, i) => (
          <React.Fragment key={s.label}>
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500 ${
                s.failed ? 'bg-red-500/20 border-2 border-red-400 text-red-400' :
                s.done ? 'bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400' :
                s.active ? 'bg-primary-500/20 border-2 border-primary-400 text-primary-400 animate-pulse' :
                'bg-slate-200/60 border-2 border-slate-300 text-slate-400'
              }`}>
                {s.active ? <Loader2 className="w-4 h-4 animate-spin" /> : <s.icon className="w-4 h-4" />}
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                s.failed ? 'text-red-400' :
                s.done ? 'text-emerald-600' :
                s.active ? 'text-primary-600' :
                'text-slate-400'
              }`}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mt-[-20px] transition-all duration-700 rounded-full ${
                s.done ? 'bg-emerald-400' : 'bg-slate-200'
              }`} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <div className="page-enter bg-nexus-background min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-nexus-on-background" role="main" aria-label="Video Upload and Pipeline">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#131b2e] flex items-center gap-3">
            <UploadCloud className="w-8 h-8 text-[#00687a]" aria-hidden="true" />
            Sign Language Video Pipeline
          </h1>
          <p className="text-[#3d494c] mt-1">Upload lesson videos to automatically extract captions and render an ISL avatar overlay.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upload Area */}
        <div className="space-y-6">
          <div 
            className={`p-10 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-colors text-center cursor-pointer ${file ? 'border-[#00687a] bg-primary-500/10' : 'border-white/20 bg-surface-800/50 hover:bg-surface-800'}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => document.getElementById('video-upload-input').click()}
            tabIndex={0}
            role="button"
            aria-label="Upload video area. Drag and drop or click to select file."
          >
            <input 
              id="video-upload-input"
              type="file" 
              accept="video/mp4,video/avi,video/quicktime,video/webm" 
              className="hidden" 
              onChange={(e) => { setFile(e.target.files[0]); resetState(); }}
            />
            {file ? (
              <>
                <Video className="w-12 h-12 text-[#00687a] mb-4" aria-hidden="true" />
                 <p className="text-lg font-semibold text-[#131b2e]">{file.name}</p>
                <p className="text-sm text-[#3d494c] mt-2">{formatBytes(file.size)}</p>
              </>
            ) : (
              <>
                <UploadCloud className="w-12 h-12 text-[#6d797d] mb-4" aria-hidden="true" />
                 <p className="text-lg font-semibold text-[#131b2e]">Drag & drop video here</p>
                <p className="text-sm text-[#3d494c] mt-2">MP4, AVI, MOV or WebM up to 500MB</p>
              </>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <button 
              onClick={handleUpload}
              disabled={!file || uploading}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${!file || uploading ? 'bg-surface-800 text-[#6d797d] cursor-not-allowed' : 'bg-surface-700 hover:bg-surface-600 text-white shadow-lg border border-white/10'}`}
              aria-label="Extract Captions Only"
            >
              {uploading && phase !== 'upload' ? 'Processing...' : 'Extract Captions Only (Fast)'}
            </button>
            <button 
              onClick={handleFullPipeline}
              disabled={!file || uploading}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${!file || uploading ? 'bg-surface-800 text-[#6d797d] cursor-not-allowed' : 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg hover:shadow-primary-500/25'}`}
              aria-label="Start full deaf signing pipeline"
            >
              {uploading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {phase === 'upload' ? 'Uploading...' : 'Generating...'}
                </span>
              ) : 'Generate Deaf Signing Video'}
            </button>
          </div>

          {/* Progress Panel */}
          {(status === 'uploading' || status === 'processing') && (
            <div className="p-6 rounded-[24px] glass-panel card-shadow border border-[#bcc9cd]/40 transition-all duration-300" aria-live="polite">
              {/* Pipeline steps indicator */}
              {phase && <PipelineSteps />}

              {/* Upload method badge */}
              {phase === 'upload' && uploadMethod && (
                <div className="flex items-center gap-2 mb-3">
                  {uploadMethod === 'direct' ? (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/20">
                      <Cloud className="w-3 h-3" /> Direct to R2
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-700 border border-blue-500/20">
                      <Wifi className="w-3 h-3" /> Via Server
                    </span>
                  )}
                </div>
              )}

              {/* Main progress bar */}
              <div className="flex justify-between items-center mb-2">
                 <span className="text-sm font-semibold text-primary-700">
                   {phase === 'upload' ? 'Uploading Video' : 'Processing Pipeline'}
                 </span>
                 <span className="text-sm font-mono text-[#131b2e]">{progress}%</span>
               </div>
               <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 rounded-full ${
                    phase === 'upload'
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-400'
                      : 'bg-gradient-to-r from-primary-500 to-emerald-500'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Upload stats */}
              {phase === 'upload' && totalBytes > 0 && (
                <div className="flex items-center justify-between mt-3 text-xs text-[#3d494c]">
                  <span>{formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}</span>
                  {uploadSpeed > 0 && (
                    <span className="flex items-center gap-3">
                      <span>{formatBytes(uploadSpeed)}/s</span>
                      <span>ETA: {formatETA(uploadETA)}</span>
                    </span>
                  )}
                </div>
              )}

              <p className="text-xs text-[#3d494c] mt-3 text-center">
                {step || 'Extracting Audio → Whisper STT → Sign Mapping → Avatar Render → Output'}
              </p>

              {/* Cancel button */}
              {(status === 'uploading' || status === 'processing') && (
                <button
                  onClick={handleCancelUpload}
                  className="mt-4 w-full py-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-red-500 hover:bg-red-50/50 transition-all border border-transparent hover:border-red-200"
                >
                  Cancel
                </button>
              )}
            </div>
          )}

          {/* Error Status */}
          {status === 'error' && (
            <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-center" aria-live="polite">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" aria-hidden="true" />
               <h3 className="text-lg font-bold text-red-700">Processing Failed</h3>
               <p className="text-sm text-red-400/80 mt-1 whitespace-pre-line">{error}</p>
               <button 
                 className="mt-4 px-6 py-2 rounded-lg glass-panel card-shadow border border-[#bcc9cd]/40 text-sm text-[#131b2e] hover:bg-slate-100/50 transition shadow-lg hover:shadow-xl hover:border-cyan-400 transition-all duration-300"
                onClick={() => { resetState(); setUploading(false); }}
              >
                Try Again
              </button>
            </div>
          )}

          {/* Done Status */}
          {status === 'done' && (
            <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center" aria-live="polite">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" aria-hidden="true" />
               <h3 className="text-lg font-bold text-emerald-700">Processing Complete!</h3>
              <p className="text-sm text-emerald-400/80 mt-1">
                Video has captions and sign language overlay. Ready for download.
              </p>

              {/* Status badges */}
              <div className="flex items-center justify-center gap-3 mt-3">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  captionStatus === 'available' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  <FileText className="w-3 h-3" /> Captions {captionStatus}
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  signingStatus === 'available' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  <Zap className="w-3 h-3" /> ISL {signingStatus}
                </span>
              </div>
              
              <div className="flex flex-col gap-2 mt-4">
                <button 
                  className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/20"
                  onClick={handleDownload}
                >
                  <Download className="w-5 h-5" aria-hidden="true" />
                  Download Processed Video
                </button>
                
                {jobId && (
                  <div className="flex gap-2 w-full">
                    <a 
                      href={`${API_BASE}/video-captions?job_id=${jobId}&format=srt`}
                      download
                      className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-white/10"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileText className="w-4 h-4" /> Download SRT
                    </a>
                    <a 
                      href={`${API_BASE}/video-captions?job_id=${jobId}&format=vtt`}
                      download
                      className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-white/10"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileText className="w-4 h-4" /> Download VTT
                    </a>
                  </div>
                )}

                <button 
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary-600/20"
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (jobId) params.append('job_id', jobId);
                    if (filename) params.append('filename', filename);
                    const authParam = user?.role === 'teacher' ? `&teacher_id=${user?.id || 1}` : `&student_id=${user?.id || 1}`;
                    if (captions && captions.length > 0) {
                      window.uploadedDemoCaptions = captions;
                      window.uploadedDemoVideo = `${API_BASE}/download-signed-video?filename=${encodeURIComponent(filename)}${jobId ? `&job_id=${jobId}` : ''}${authParam}`;
                      window.uploadedDemoTitle = file?.name || 'Uploaded Video';
                    }
                    navigate(`/classroom?${params.toString()}&uploaded=true`);
                  }}
                >
                  <MonitorPlay className="w-5 h-5" aria-hidden="true" />
                  Watch in Virtual Classroom
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Preview Area */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 min-h-[300px] shadow-lg hover:shadow-xl hover:border-cyan-400 transition-all duration-300">
             <h2 className="text-lg font-semibold text-[#131b2e] mb-4">Pipeline Output Preview</h2>
             {status === 'done' ? (
               <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
                 {/* Show actual processed video if available */}
                 <video
                   ref={videoRef}
                   src={`${API_BASE}/download-signed-video?filename=${encodeURIComponent(filename)}${user?.role === 'teacher' ? `&teacher_id=${user?.id || 1}` : `&student_id=${user?.id || 1}`}`}
                   controls
                   className="absolute inset-0 w-full h-full object-contain"
                   onLoadedMetadata={() => console.log('[VIDEO_RENDERED] src=' + (videoRef.current?.src || ''))}
                   onError={() => {
                     // If video can't load, show placeholder
                     if (videoRef.current) videoRef.current.style.display = 'none';
                   }}
                 />
                 {/* The Avatar Overlay preview */}
                 <SignAvatarOverlay currentWord={currentGesture} />
               </div>
             ) : (status === 'uploading' || status === 'processing') ? (
               <div className="aspect-video bg-surface-800/50 rounded-xl border-2 border-dashed border-[#00687a]/30 flex flex-col items-center justify-center text-center gap-3 shadow-lg hover:shadow-xl border border-[#bcc9cd]/40 hover:border-cyan-400 transition-all duration-300">
                 <Loader2 className="w-10 h-10 text-[#00687a] animate-spin" />
                 <p className="text-sm text-primary-300 font-medium">{step || 'Processing...'}</p>
                 <p className="text-xs text-[#6d797d]">This may take a few minutes depending on video length</p>
               </div>
             ) : (
               <div className="aspect-video bg-surface-800/50 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center text-[#6d797d] shadow-lg hover:shadow-xl border border-[#bcc9cd]/40 hover:border-cyan-400 transition-all duration-300">
                 Preview will appear here after processing.
               </div>
             )}
          </div>

          {/* Extracted Captions */}
          {status === 'done' && captions.length > 0 && (
            <div className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 max-h-80 overflow-y-auto shadow-lg hover:shadow-xl hover:border-cyan-400 transition-all duration-300">
              <h3 className="text-sm font-semibold text-[#6d797d] mb-4 sticky top-0 bg-surface-900/90 py-2 flex items-center justify-between rounded-2xl shadow-lg hover:shadow-xl border border-[#bcc9cd]/40 hover:border-cyan-400 transition-all duration-300">
                <span>Extracted Captions & Sign Gesture Mapping</span>
                <span className="text-xs text-[#00687a] font-normal">{captions.length} segments</span>
              </h3>
              <ul className="space-y-3">
                {captions.map((cap, idx) => (
                  <li key={idx} className="p-3 rounded-lg bg-surface-800 border border-white/5 shadow-lg hover:shadow-xl hover:border-cyan-400 transition-all duration-300">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-mono text-[#00687a]">
                        [{cap.start_time || '—'} — {cap.end_time || '—'}]
                      </span>
                      <span className="text-[10px] text-[#6d797d]">
                        Segment {idx + 1}
                      </span>
                    </div>
                     <p className="text-sm text-[#131b2e] mb-2">{cap.text}</p>
                    <div className="flex flex-wrap gap-1">
                      {(cap.gestures || cap.text.split(' ')).map((gesture, i) => (
                        <span 
                          key={i} 
                          className={`text-[10px] px-2 py-0.5 rounded border ${
                             typeof gesture === 'string' && gesture.startsWith('FS:')
                               ? 'bg-amber-500/20 text-amber-800 border-amber-500/30'
                               : 'bg-emerald-500/20 text-emerald-800 border-emerald-500/30'
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

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, CheckCircle, Video, Download, AlertCircle, Loader2, MonitorPlay } from 'lucide-react';
import SignAvatarOverlay from '../components/SignAvatarOverlay';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function VideoUpload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState('');
  const [status, setStatus] = useState(''); // 'uploaded', 'processing', 'done', 'error'
  const [jobId, setJobId] = useState(null);
  const [filename, setFilename] = useState('');
  const [captions, setCaptions] = useState([]);
  const [error, setError] = useState('');
  const [currentGestureIdx, setCurrentGestureIdx] = useState(0);
  const pollRef = useRef(null);
  const videoRef = useRef(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
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
    setProgress(0);
    setStep('');
    setJobId(null);
    setFilename('');
    setCaptions([]);
    setError('');
    setCurrentGestureIdx(0);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setStatus('processing');
    setProgress(5);
    setStep('Uploading video...');
    setError('');

    // Always call the local backend for real Whisper transcription.
    // The backend /extract-captions endpoint uses moviepy + Whisper.
    await extractCaptionsLocally();
  };

  /**
   * extractCaptionsLocally
   * ─────────────────────
   * Sends the video file to the local Flask backend (/extract-captions).
   * The backend extracts audio with moviepy, transcribes with Whisper,
   * and returns real caption segments with timestamps.
   *
   * If the backend is not running, shows a clear error instead of fake captions.
   */
  const extractCaptionsLocally = async () => {
    const LOCAL_BACKEND = 'http://localhost:5000';

    // Step 1: Upload
    setProgress(15);
    setStep('Step 1/4: Sending video to backend...');

    try {
      const formData = new FormData();
      formData.append('video_file', file);

      setProgress(30);
      setStep('Step 2/4: Extracting audio track from video...');

      const res = await fetch(`${LOCAL_BACKEND}/extract-captions`, {
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

      // Save real captions + video to IndexedDB
      import('../utils/db').then(({ saveVideo, saveCaptions }) => {
        saveVideo(file).catch(console.error);
        saveCaptions(realCaptions).catch(console.error);
      });
      window.uploadedDemoVideo    = URL.createObjectURL(file);
      window.uploadedDemoTitle    = file.name;
      window.uploadedDemoCaptions = realCaptions;

      setProgress(100);
      setStep('Processing complete!');
      setCaptions(realCaptions);
      setStatus('done');
      setUploading(false);

    } catch (err) {
      console.error('[Upload] Caption extraction failed:', err.message);

      // Show a clear, actionable error — never silently show fake captions
      const isNetworkError = err.message.includes('fetch') || err.message.includes('Failed to fetch') || err.message.includes('NetworkError');
      const userMessage = isNetworkError
        ? `Could not reach the backend. Make sure the Flask server is running:\n  cd backend && python app.py\n\nThen try again.`
        : `Caption extraction failed: ${err.message}`;

      setStatus('error');
      setError(userMessage);
      setUploading(false);
    }
  };

  const startPolling = (id) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/video-status?job_id=${id}`);
        if (!res.ok) throw new Error('Status check failed');

        const data = await res.json();

        if (data.progress) setProgress(data.progress);
        if (data.step) setStep(data.step);

        if (data.status === 'done') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setStatus('done');
          setProgress(100);
          setStep('Processing complete!');
          setUploading(false);

          if (data.captions) {
            setCaptions(data.captions);
            // Save real API captions to IndexedDB
            import('../utils/db').then(({ saveCaptions }) => {
              saveCaptions(data.captions).catch(console.error);
            });
          }
        } else if (data.status === 'error') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setStatus('error');
          setError(data.error || 'Processing failed');
          setUploading(false);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);
  };

  const handleDownload = () => {
    if (!filename) return;
    const url = `${API_BASE}/download-signed-video?filename=${encodeURIComponent(filename)}${jobId ? `&job_id=${jobId}` : ''}`;
    window.open(url, '_blank');
  };

  const allGestureWords = captions.flatMap(c => c.text.split(' '));
  const currentGesture = allGestureWords[currentGestureIdx] || '';

  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="main" aria-label="Video Upload and Pipeline">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-3">
            <UploadCloud className="w-8 h-8 text-primary-400" aria-hidden="true" />
            Sign Language Video Pipeline
          </h1>
          <p className="text-slate-400 mt-1">Upload lesson videos to automatically extract captions and render an ASL avatar overlay.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upload Area */}
        <div className="space-y-6">
          <div 
            className={`p-10 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-colors text-center cursor-pointer ${file ? 'border-primary-500 bg-primary-500/10' : 'border-white/20 bg-surface-800/50 hover:bg-surface-800'}`}
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
              accept="video/mp4,video/avi,video/quicktime" 
              className="hidden" 
              onChange={(e) => { setFile(e.target.files[0]); resetState(); }}
            />
            {file ? (
              <>
                <Video className="w-12 h-12 text-primary-400 mb-4" aria-hidden="true" />
                <p className="text-lg font-semibold text-white">{file.name}</p>
                <p className="text-sm text-slate-400 mt-2">{(file.size / (1024*1024)).toFixed(2)} MB</p>
              </>
            ) : (
              <>
                <UploadCloud className="w-12 h-12 text-slate-500 mb-4" aria-hidden="true" />
                <p className="text-lg font-semibold text-white">Drag & drop video here</p>
                <p className="text-sm text-slate-400 mt-2">MP4, AVI, or MOV up to 500MB</p>
              </>
            )}
          </div>
          
          <button 
            onClick={handleUpload}
            disabled={!file || uploading}
            className={`w-full py-3 rounded-xl font-semibold transition-all ${!file || uploading ? 'bg-surface-800 text-slate-500 cursor-not-allowed' : 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg hover:shadow-primary-500/25'}`}
            aria-label="Start video processing pipeline"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </span>
            ) : 'Upload & Process Video'}
          </button>

          {/* Progress Bar */}
          {status === 'processing' && (
            <div className="p-6 rounded-2xl glass" aria-live="polite">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-primary-300">Processing Video Pipeline...</span>
                <span className="text-sm font-mono text-white">{progress}%</span>
              </div>
              <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-3 text-center">
                {step || 'Extracting Audio → Whisper STT → Sign Mapping → Avatar Render → Output'}
              </p>
            </div>
          )}

          {/* Error Status */}
          {status === 'error' && (
            <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-center" aria-live="polite">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" aria-hidden="true" />
              <h3 className="text-lg font-bold text-red-300">Processing Failed</h3>
              <p className="text-sm text-red-400/80 mt-1">{error}</p>
              <button 
                className="mt-4 px-6 py-2 rounded-lg glass text-sm text-white hover:bg-white/10 transition"
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
              <h3 className="text-lg font-bold text-emerald-300">Processing Complete!</h3>
              <p className="text-sm text-emerald-400/80 mt-1">
                Video has captions and sign language overlay. Ready for download.
              </p>
              
              <div className="flex flex-col gap-2 mt-4">
                <button 
                  className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/20"
                  onClick={handleDownload}
                >
                  <Download className="w-5 h-5" aria-hidden="true" />
                  Download Processed Video
                </button>
                
                <button 
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary-600/20"
                  onClick={() => navigate('/classroom')}
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
          <div className="p-6 rounded-2xl glass min-h-[300px]">
             <h2 className="text-lg font-semibold text-white mb-4">Pipeline Output Preview</h2>
             {status === 'done' ? (
               <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
                 {/* Show actual processed video if available */}
                 <video
                   ref={videoRef}
                   src={`${API_BASE}/download-signed-video?filename=${encodeURIComponent(filename)}`}
                   controls
                   className="absolute inset-0 w-full h-full object-contain"
                   onError={() => {
                     // If video can't load, show placeholder
                     if (videoRef.current) videoRef.current.style.display = 'none';
                   }}
                 />
                 {/* The Avatar Overlay preview */}
                 <SignAvatarOverlay currentWord={currentGesture} />
               </div>
             ) : status === 'processing' ? (
               <div className="aspect-video bg-surface-800/50 rounded-xl border-2 border-dashed border-primary-500/30 flex flex-col items-center justify-center text-center gap-3">
                 <Loader2 className="w-10 h-10 text-primary-400 animate-spin" />
                 <p className="text-sm text-primary-300 font-medium">{step || 'Processing...'}</p>
                 <p className="text-xs text-slate-500">This may take a few minutes depending on video length</p>
               </div>
             ) : (
               <div className="aspect-video bg-surface-800/50 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center text-slate-500">
                 Preview will appear here after processing.
               </div>
             )}
          </div>

          {/* Extracted Captions */}
          {status === 'done' && captions.length > 0 && (
            <div className="p-6 rounded-2xl glass max-h-80 overflow-y-auto">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 sticky top-0 bg-surface-900/90 py-2 flex items-center justify-between">
                <span>Extracted Captions & Sign Gesture Mapping</span>
                <span className="text-xs text-primary-400 font-normal">{captions.length} segments</span>
              </h3>
              <ul className="space-y-3">
                {captions.map((cap, idx) => (
                  <li key={idx} className="p-3 rounded-lg bg-surface-800 border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-mono text-primary-400">
                        [{cap.start_time || '—'} — {cap.end_time || '—'}]
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Segment {idx + 1}
                      </span>
                    </div>
                    <p className="text-sm text-white mb-2">{cap.text}</p>
                    <div className="flex flex-wrap gap-1">
                      {(cap.gestures || cap.text.split(' ')).map((gesture, i) => (
                        <span 
                          key={i} 
                          className={`text-[10px] px-2 py-0.5 rounded border ${
                            typeof gesture === 'string' && gesture.startsWith('FS:')
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
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

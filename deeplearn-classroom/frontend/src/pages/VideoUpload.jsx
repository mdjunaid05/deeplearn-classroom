import React, { useState, useEffect } from 'react';
import { UploadCloud, CheckCircle, Video, Download } from 'lucide-react';
import SignAvatarOverlay from '../components/SignAvatarOverlay';

export default function VideoUpload() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(''); // 'uploaded', 'processing', 'done'
  const [jobId, setJobId] = useState(null);
  const [filename, setFilename] = useState('');
  const [captions, setCaptions] = useState([]);

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setStatus('processing');
    setProgress(10);
    
    // Simulate API call to /upload-video
    setTimeout(() => {
      setJobId("mock-job-id");
      setFilename(`signed_${file.name}`);
      setProgress(20);
      pollStatus();
    }, 1000);
  };

  const pollStatus = () => {
    let currentProgress = 20;
    const interval = setInterval(() => {
      currentProgress += 15;
      if (currentProgress >= 100) {
        clearInterval(interval);
        setProgress(100);
        setStatus('done');
        setCaptions([
          {text: "Welcome to the class.", start_time: "0:00", end_time: "0:02"},
          {text: "Today we will learn about neural networks.", start_time: "0:02", end_time: "0:05"}
        ]);
      } else {
        setProgress(currentProgress);
      }
    }, 1500);
  };

  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="main" aria-label="Video Upload and Pipeline">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-3">
            <UploadCloud className="w-8 h-8 text-primary-400" aria-hidden="true" />
            Sign Language Video Pipeline
          </h1>
          <p className="text-slate-400 mt-1">Upload lesson videos to automatically extract text and render an ASL avatar overlay.</p>
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
              onChange={(e) => setFile(e.target.files[0])}
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
            {uploading ? 'Processing...' : 'Upload & Process Video'}
          </button>

          {/* Progress Bar */}
          {status === 'processing' && (
            <div className="p-6 rounded-2xl glass animate-pulse" aria-live="polite">
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
                Extracting Audio → STT Whisper → Sign Sequence → Avatar Render → Recompile
              </p>
            </div>
          )}

          {/* Done Status */}
          {status === 'done' && (
            <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center" aria-live="polite">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" aria-hidden="true" />
              <h3 className="text-lg font-bold text-emerald-300">Processing Complete!</h3>
              <p className="text-sm text-emerald-400/80 mt-1">Video is ready for download and student viewing.</p>
              
              <button 
                className="mt-4 w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
                onClick={() => alert('Downloading: ' + filename)}
              >
                <Download className="w-5 h-5" aria-hidden="true" />
                Download Processed Video
              </button>
            </div>
          )}
        </div>

        {/* Preview Area */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl glass min-h-[300px]">
             <h2 className="text-lg font-semibold text-white mb-4">Pipeline Output Preview</h2>
             {status === 'done' ? (
               <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
                 <div className="absolute inset-0 flex items-center justify-center">
                   <span className="text-slate-500">Video Playback Mock</span>
                 </div>
                 {/* The Avatar Overlay */}
                 <SignAvatarOverlay currentWord="Welcome" />
               </div>
             ) : (
               <div className="aspect-video bg-surface-800/50 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center text-slate-500">
                 Preview will appear here after processing.
               </div>
             )}
          </div>

          {/* Extracted Captions */}
          {status === 'done' && captions.length > 0 && (
            <div className="p-6 rounded-2xl glass max-h-60 overflow-y-auto">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 sticky top-0 bg-surface-900/90 py-2">Extracted Captions & Gesture Mapping</h3>
              <ul className="space-y-3">
                {captions.map((cap, idx) => (
                  <li key={idx} className="p-3 rounded-lg bg-surface-800 border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-mono text-primary-400">[{cap.start_time} - {cap.end_time}]</span>
                    </div>
                    <p className="text-sm text-white mb-2">{cap.text}</p>
                    <div className="flex flex-wrap gap-1">
                      {cap.text.split(' ').map((word, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {word.toUpperCase()}
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

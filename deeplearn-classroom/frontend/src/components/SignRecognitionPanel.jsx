import React, { useState, useEffect } from 'react';
import { Camera, CheckCircle } from 'lucide-react';

export default function SignRecognitionPanel({ isDetecting, onSignRecognized }) {
  const [currentSign, setCurrentSign] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (isDetecting) {
      const interval = setInterval(() => {
        const signs = ["Hello", "Yes", "No", "Help", "Understand", "Repeat", "Stop", "Good", "Bad", "Question"];
        const recognized = signs[Math.floor(Math.random() * signs.length)];
        const conf = 0.75 + Math.random() * 0.24; // 75-99%
        
        setCurrentSign(recognized);
        setConfidence(conf);
        
        if (conf > 0.85) {
          setHistory(prev => [recognized, ...prev].slice(0, 5));
          if (onSignRecognized) onSignRecognized(recognized);
        }
      }, 3000);
      return () => clearInterval(interval);
    } else {
      setCurrentSign(null);
      setConfidence(0);
    }
  }, [isDetecting, onSignRecognized]);

  return (
    <div className="flex flex-col gap-4">
      {/* Webcam Feed Placeholder */}
      <div className="relative aspect-video bg-surface-800 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center">
        {isDetecting ? (
          <div className="absolute inset-0 border-2 border-emerald-500/50 rounded-xl" />
        ) : null}
        <Camera className={`w-8 h-8 ${isDetecting ? 'text-emerald-400' : 'text-slate-500'}`} aria-hidden="true" />
        <span className="sr-only">{isDetecting ? 'Camera active' : 'Camera inactive'}</span>
      </div>
      
      {/* Confidence Bar */}
      <div className="p-4 rounded-xl bg-surface-800/50 border border-white/5">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-slate-300">
            {currentSign ? `Sign: ${currentSign}` : 'Waiting for gesture...'}
          </span>
          <span className="text-xs font-mono text-emerald-400">
            {(confidence * 100).toFixed(0)}% Conf
          </span>
        </div>
        <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${confidence * 100}%` }}
          />
        </div>
      </div>

      {/* History */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Recent Signs</h4>
        <div className="flex flex-wrap gap-2" role="list" aria-label="Recent signs recognized">
          {history.map((sign, idx) => (
            <div key={idx} role="listitem" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">
              <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
              {sign}
            </div>
          ))}
          {history.length === 0 && <span className="text-sm text-slate-500">No signs recognized yet.</span>}
        </div>
      </div>
    </div>
  );
}

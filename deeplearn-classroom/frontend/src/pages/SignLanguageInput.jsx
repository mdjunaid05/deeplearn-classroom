import React, { useState } from 'react';
import { HandMetal, Settings, Activity } from 'lucide-react';
import SignRecognitionPanel from '../components/SignRecognitionPanel';

export default function SignLanguageInput() {
  const [isActive, setIsActive] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");

  const handleSignRecognized = (sign) => {
    setRecognizedText(prev => {
      const newText = prev ? `${prev} ${sign}` : sign;
      return newText;
    });
  };

  return (
    <div className="page-enter max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="main" aria-label="Sign Language Input Page">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white flex items-center gap-3">
            <HandMetal className="w-8 h-8 text-emerald-400" aria-hidden="true" />
            Sign Language Input
          </h1>
          <p className="text-slate-400 mt-1">Real-time ASL recognition powered by CNN+LSTM.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Col - Video Feed & Recognition */}
        <div className="p-6 rounded-2xl glass">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-lg font-semibold text-white">Camera Feed</h2>
             <button
               onClick={() => setIsActive(!isActive)}
               className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${isActive ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'}`}
               aria-pressed={isActive}
               tabIndex={0}
             >
               {isActive ? "Stop Recognition" : "Start Recognition"}
             </button>
          </div>
          
          <SignRecognitionPanel isDetecting={isActive} onSignRecognized={handleSignRecognized} />
        </div>

        {/* Right Col - Output Text */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl glass h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
               <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                 <Activity className="w-5 h-5 text-primary-400" aria-hidden="true" />
                 Recognized Transcript
               </h2>
               <button
                 onClick={() => setRecognizedText("")}
                 className="text-sm text-slate-400 hover:text-white"
                 aria-label="Clear transcript"
                 tabIndex={0}
               >
                 Clear
               </button>
            </div>
            <div 
              className="flex-1 bg-surface-800/50 rounded-xl border border-white/5 p-4 min-h-[200px]"
              aria-live="polite"
              aria-atomic="false"
            >
              {recognizedText ? (
                <p className="text-lg text-white leading-relaxed">{recognizedText}</p>
              ) : (
                <p className="text-slate-500 italic">Signs will appear here as they are recognized...</p>
              )}
            </div>
            
            <div className="mt-4 p-4 rounded-xl bg-primary-500/10 border border-primary-500/20">
              <h3 className="text-sm font-semibold text-primary-300 flex items-center gap-2 mb-2">
                <Settings className="w-4 h-4" aria-hidden="true" />
                Supported Gestures
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Hello, Yes, No, Help, Understand, Repeat, Stop, Good, Bad, Question.
                <br/>
                <em>Ensure hands are clearly visible in the camera frame for optimal tracking.</em>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <div className="page-enter bg-nexus-background min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-nexus-on-background" role="main" aria-label="Sign Language Input Page">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#131b2e] flex items-center gap-3">
            <HandMetal className="w-8 h-8 text-emerald-400" aria-hidden="true" />
            Sign Language Input
          </h1>
          <p className="text-[#3d494c] mt-1">Real-time ISL (Indian Sign Language) recognition powered by CNN.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Col - Video Feed & Recognition */}
        <div className="p-6 rounded-[24px] glass-panel card-shadow border border-[#bcc9cd]/40 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-lg font-semibold text-[#131b2e]">Camera Feed</h2>
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
          <div className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 h-full flex flex-col shadow-lg hover:shadow-xl border border-[#bcc9cd]/40 hover:border-cyan-400 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
               <h2 className="text-lg font-semibold text-[#131b2e] flex items-center gap-2">
                 <Activity className="w-5 h-5 text-indigo-600" aria-hidden="true" />
                 Recognized Transcript
               </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (!recognizedText) return;
                      navigator.clipboard.writeText(recognizedText);
                    }}
                    disabled={!recognizedText}
                    className="text-xs text-[#00687a] hover:text-[#00687a]/80 font-medium px-2 py-1 rounded bg-[#00687a]/10 disabled:opacity-40"
                    title="Copy text"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => {
                      if (!recognizedText || !('speechSynthesis' in window)) return;
                      window.speechSynthesis.cancel();
                      const u = new SpeechSynthesisUtterance(recognizedText);
                      u.lang = 'en-IN';
                      window.speechSynthesis.speak(u);
                    }}
                    disabled={!recognizedText}
                    className="text-xs text-purple-600 hover:text-purple-700 font-medium px-2 py-1 rounded bg-purple-50 disabled:opacity-40"
                    title="Speak text"
                  >
                    🔊 Speak
                  </button>
                  <button
                    onClick={() => setRecognizedText("")}
                    className="text-xs text-[#6d797d] hover:text-red-600 font-medium px-2 py-1 rounded bg-red-50 disabled:opacity-40"
                    aria-label="Clear transcript"
                    tabIndex={0}
                  >
                    Clear
                  </button>
                </div>
            </div>
            <div 
              className="flex-1 bg-surface-800/50 rounded-xl border border-white/5 p-4 min-h-[200px] shadow-lg hover:shadow-xl hover:border-cyan-400 transition-all duration-300"
              aria-live="polite"
              aria-atomic="false"
            >
              {recognizedText ? (
                <p className="text-lg text-[#131b2e] leading-relaxed">{recognizedText}</p>
              ) : (
                <p className="text-[#6d797d] italic">Signs will appear here as they are recognized...</p>
              )}
            </div>
            
            <div className="mt-4 p-4 rounded-xl bg-primary-500/10 border border-[#00687a]/20">
              <h3 className="text-sm font-semibold text-[#131b2e] flex items-center gap-2 mb-2">
                <Settings className="w-4 h-4" aria-hidden="true" />
                Supported Gestures
              </h3>
              <p className="text-xs text-[#3d494c] leading-relaxed">
                <strong>ISL Alphabet:</strong> A-Z (26 letters)<br/>
                <strong>ISL Words:</strong> afternoon, animal, bad, beautiful, big, bird, cat, cold, cow, deaf, dog, dress, evening, fast, fish, friday, good, happy, hat, healthy, horse, hot, morning, mouse, new, night, old, quiet, sad, saturday, shirt, shoes, short, sick, slow, small, sunday, tall, time, today, tomorrow, tuesday, warm, wednesday, week, wet, wide, year, yesterday, young &amp; more.
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

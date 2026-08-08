import React, { useState } from 'react';
import { HandMetal, Settings, Activity, Sparkles, BookOpen } from 'lucide-react';
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
    <div className="page-enter bg-nexus-background min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-nexus-on-background" role="main" aria-label="Indian Sign Language Input Page">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#131b2e] flex items-center gap-3">
            <HandMetal className="w-8 h-8 text-emerald-500" aria-hidden="true" />
            Indian Sign Language (ISL) Recognition
          </h1>
          <p className="text-[#3d494c] mt-1">Real-time Indian Sign Language (ISL) recognition powered by CNN+LSTM trained on ISLRTC and INCLUDE standard gestures.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <span>ISLRTC & INCLUDE Standard</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Col - Video Feed & Recognition */}
        <div className="p-6 rounded-[24px] glass-panel card-shadow border border-[#bcc9cd]/40 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-lg font-semibold text-[#131b2e]">ISL Camera Feed</h2>
             <button
               onClick={() => setIsActive(!isActive)}
               className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${isActive ? 'bg-red-500/20 text-red-600 hover:bg-red-500/30' : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md'}`}
               aria-pressed={isActive}
               tabIndex={0}
             >
               {isActive ? "Stop ISL Recognition" : "Start ISL Recognition"}
             </button>
          </div>
          
          <SignRecognitionPanel isDetecting={isActive} onSignRecognized={handleSignRecognized} />
        </div>

        {/* Right Col - Output Text & ISL Reference */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl glass-panel card-shadow border border-[#bcc9cd]/40 h-full flex flex-col shadow-lg hover:shadow-xl border border-[#bcc9cd]/40 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
               <h2 className="text-lg font-semibold text-[#131b2e] flex items-center gap-2">
                 <Activity className="w-5 h-5 text-indigo-600" aria-hidden="true" />
                 Recognized ISL Transcript
               </h2>
               <button
                 onClick={() => setRecognizedText("")}
                 className="text-sm text-[#3d494c] hover:text-red-600 font-medium"
                 aria-label="Clear transcript"
                 tabIndex={0}
               >
                 Clear
               </button>
            </div>
            <div 
              className="flex-1 bg-slate-50/70 rounded-xl border border-slate-200 p-4 min-h-[200px] shadow-sm transition-all duration-300"
              aria-live="polite"
              aria-atomic="false"
            >
              {recognizedText ? (
                <p className="text-lg text-[#131b2e] leading-relaxed font-medium">{recognizedText}</p>
              ) : (
                <p className="text-[#6d797d] italic">Indian Sign Language gestures will appear here as they are detected in real time...</p>
              )}
            </div>
            
            <div className="mt-4 p-4 rounded-xl bg-primary-500/10 border border-[#00687a]/20">
              <h3 className="text-sm font-semibold text-[#131b2e] flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-[#00687a]" aria-hidden="true" />
                Supported Indian Sign Language (ISL) Gestures
              </h3>
              <p className="text-xs text-[#3d494c] leading-relaxed">
                <strong>Greetings & Manners:</strong> Namaste (Hello), Dhanyavaad (Thank You), Swagat (Welcome), Kripya (Please)
                <br/>
                <strong>Classroom & Learning:</strong> Shikshak (Teacher), Vidyarthi (Student), Padhna (Learn/Study), Samajh (Understand), Prashna (Question)
                <br/>
                <strong>Responses & Commands:</strong> Ha (Yes), Nahi (No), Madad (Help), Dobara (Repeat), Ruko (Stop), Accha (Good), Bura (Bad)
                <br/>
                <strong>ISL Alphabet:</strong> Authentic Two-Handed ISL Manual Fingerspelling (A to Z) & Numbers (1 to 10)
                <br/>
                <span className="text-[11px] text-[#6d797d] italic mt-1 block">
                  *Ensure both hands are visible in the frame for bilateral ISL gestures and manual alphabet fingerspelling.
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

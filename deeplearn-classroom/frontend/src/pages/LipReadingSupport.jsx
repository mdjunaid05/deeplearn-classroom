import React, { useState, useEffect } from 'react';
import { UserCircle2, Activity, Play, Pause } from 'lucide-react';

export default function LipReadingSupport() {
  const [isActive, setIsActive] = useState(false);
  const [lipState, setLipState] = useState("Neutral");
  const [confidence, setConfidence] = useState(0);

  useEffect(() => {
    if (isActive) {
      const interval = setInterval(() => {
        const states = ["Speaking", "Silent", "Mouthing", "Laughing", "Neutral"];
        const recognized = states[Math.floor(Math.random() * states.length)];
        const conf = 0.6 + Math.random() * 0.35; // 60-95%
        
        setLipState(recognized);
        setConfidence(conf);
      }, 2000);
      return () => clearInterval(interval);
    } else {
      setLipState("Neutral");
      setConfidence(0);
    }
  }, [isActive]);

  return (
    <div className="page-enter bg-nexus-background min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-nexus-on-background" role="main" aria-label="Lip Reading Support Page">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#131b2e] flex items-center gap-3">
            <UserCircle2 className="w-8 h-8 text-[#00687a]" aria-hidden="true" />
            Lip Reading Support
          </h1>
          <p className="text-[#3d494c] mt-1">Real-time lip state tracking using CNN classification.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Face Camera Mock */}
        <div className="p-6 rounded-[24px] glass-panel card-shadow border border-[#bcc9cd]/40 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-lg font-semibold text-[#131b2e]">Face Camera Feed</h2>
             <button
               onClick={() => setIsActive(!isActive)}
               className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${isActive ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-primary-500/20 text-[#00687a] hover:bg-primary-500/30'}`}
               aria-pressed={isActive}
               tabIndex={0}
             >
               {isActive ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
               {isActive ? "Stop Tracking" : "Start Tracking"}
             </button>
          </div>
          
          <div className="relative aspect-square sm:aspect-video bg-surface-800 rounded-xl border border-white/10 overflow-hidden flex items-center justify-center shadow-lg hover:shadow-xl hover:border-cyan-400 transition-all duration-300">
            {isActive && <div className="absolute inset-0 border-2 border-[#00687a]/50 rounded-xl" />}
            <div className="text-center">
               <UserCircle2 className={`w-16 h-16 mx-auto mb-2 ${isActive ? 'text-[#00687a]' : 'text-[#6d797d]'}`} aria-hidden="true" />
               <p className="text-sm text-[#3d494c]">{isActive ? 'Tracking facial features...' : 'Camera inactive'}</p>
            </div>
            
            {/* Mock lip crop bounding box */}
            {isActive && (
              <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-24 h-12 border-2 border-emerald-400 border-dashed rounded-lg bg-emerald-400/10 flex items-center justify-center">
                <span className="text-[10px] font-mono text-emerald-300">LIP CROP</span>
              </div>
            )}
          </div>
        </div>

        {/* State Display */}
        <div className="space-y-6">
          <div className="p-6 rounded-[24px] glass-panel card-shadow border border-[#bcc9cd]/40 transition-all duration-300">
             <h2 className="text-lg font-semibold text-[#131b2e] flex items-center gap-2 mb-4">
               <Activity className="w-5 h-5 text-[#00687a]" aria-hidden="true" />
               Current Lip State
             </h2>
             
             <div className="flex flex-col items-center justify-center p-8 bg-surface-800/50 rounded-xl border border-white/5 min-h-[200px] shadow-lg hover:shadow-xl hover:border-cyan-400 transition-all duration-300" aria-live="polite">
               <span className={`text-4xl font-display font-bold mb-4 ${isActive ? 'text-[#131b2e]' : 'text-[#6d797d]'}`}>
                 {lipState}
               </span>
               <div className="flex items-center gap-4 w-full max-w-xs">
                 <span className="text-sm text-[#3d494c] w-16">Conf:</span>
                 <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                   <div 
                     className={`h-full transition-all duration-300 ${confidence > 0.8 ? 'bg-emerald-500' : confidence > 0.6 ? 'bg-amber-500' : 'bg-red-500'}`}
                     style={{ width: `${confidence * 100}%` }}
                   />
                 </div>
                 <span className="text-sm font-mono text-[#6d797d] w-12 text-right">
                   {(confidence * 100).toFixed(0)}%
                 </span>
               </div>
             </div>
             
             <div className="mt-6 p-4 rounded-xl bg-surface-800 border border-white/5 shadow-lg hover:shadow-xl hover:border-cyan-400 transition-all duration-300">
                <h3 className="text-sm font-semibold text-[#6d797d] mb-2">How it helps:</h3>
                <p className="text-sm text-[#3d494c] leading-relaxed">
                  The Lip Reading CNN helps verify student engagement and communication attempts even when audio is fully disabled. It classifies the mouth region into Speaking, Silent, Mouthing, Laughing, or Neutral states to inform the teacher dashboard.
                </p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

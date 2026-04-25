import React from 'react';

export default function SignAvatarOverlay({ currentWord }) {
  if (!currentWord) return null;

  return (
    <div 
      className="absolute bottom-4 right-4 w-48 h-48 bg-black/80 backdrop-blur-sm border border-white/20 rounded-xl overflow-hidden flex flex-col items-center justify-between shadow-2xl"
      aria-label="Sign Language Avatar Overlay"
    >
      {/* Skeleton / Avatar visualization mock */}
      <div className="flex-1 w-full relative flex items-center justify-center p-2">
         {/* Head */}
         <div className="absolute top-4 w-8 h-8 rounded-full border-2 border-emerald-400" />
         {/* Body */}
         <div className="absolute top-12 bottom-6 w-0.5 bg-emerald-400" />
         {/* Arms (animated vaguely) */}
         <div className="absolute top-14 left-6 right-6 h-0.5 bg-emerald-400 animate-pulse origin-center rotate-12" />
         <div className="absolute top-14 left-8 right-8 h-0.5 bg-emerald-400 animate-pulse origin-center -rotate-12" />
         
         <span className="absolute bottom-2 text-xs text-emerald-400/50 font-mono text-center w-full">MODEL OUTPUT</span>
      </div>
      
      {/* Translated Word */}
      <div className="w-full bg-emerald-500/20 p-2 border-t border-emerald-500/30 text-center" aria-live="polite">
        <span className="text-emerald-300 font-bold tracking-wider text-sm">
          {currentWord.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

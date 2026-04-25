import React, { useState, useEffect } from 'react';

export default function CaptionOverlay({ active, mockText = "" }) {
  const [caption, setCaption] = useState("");

  useEffect(() => {
    if (active && mockText) {
      setCaption(mockText);
    } else if (!active) {
      setCaption("");
    }
  }, [active, mockText]);

  if (!active || !caption) return null;

  return (
    <div 
      className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-3xl z-50 pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="bg-black/80 backdrop-blur-sm p-4 rounded-xl border border-white/10 text-center shadow-2xl">
        <p className="text-white text-lg sm:text-xl md:text-2xl font-semibold tracking-wide" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
          {caption}
        </p>
      </div>
    </div>
  );
}

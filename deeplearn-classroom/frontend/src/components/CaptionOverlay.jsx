/**
 * CaptionOverlay.jsx
 * ------------------
 * Renders live closed-captions below the video with a smooth type-on effect.
 * The current utterance is highlighted in white; previous captions fade to grey.
 *
 * Props:
 *  - transcript      : Array<{ text: string, timestamp: number }>
 *  - currentCaption  : string  — live interim/final recognition text
 *  - videoTime       : number  — current video playback position (seconds)
 *  - isActive        : boolean — whether the video is playing
 */

import React, { useEffect, useRef } from 'react';

export default function CaptionOverlay({
  transcript = [],
  currentCaption = '',
  isActive = false,
}) {
  const bottomRef = useRef(null);

  // Auto-scroll to bottom when new captions arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript, currentCaption]);

  // Don't render anything if inactive and no transcript
  if (!isActive && transcript.length === 0) return null;

  return (
    <div
      className="w-full px-4"
      aria-live="polite"
      aria-label="Live captions"
    >
      <div
        className="rounded-xl border border-white/10 overflow-hidden"
        style={{
          background: 'rgba(0,0,0,0.78)',
          backdropFilter: 'blur(10px)',
          maxHeight: 120,
          overflowY: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        <div className="p-3 space-y-1">
          {/* Historical captions (greyed-out) */}
          {transcript.slice(-4).map((item, idx, arr) => {
            const isLast = idx === arr.length - 1;
            return (
              <p
                key={`${item.timestamp}-${idx}`}
                className="text-sm leading-snug transition-all"
                style={{
                  color: isLast ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
                  fontWeight: isLast ? 500 : 400,
                }}
              >
                {item.text}
              </p>
            );
          })}

          {/* Live interim caption — highlighted */}
          {isActive && currentCaption && (
            <p
              className="text-base font-semibold leading-snug text-white"
              style={{
                textShadow: '0 0 12px rgba(139,92,246,0.6)',
                borderLeft: '3px solid #8b5cf6',
                paddingLeft: 8,
              }}
            >
              {currentCaption}
            </p>
          )}

          {/* Empty state while waiting for speech */}
          {isActive && !currentCaption && transcript.length === 0 && (
            <p className="text-xs text-slate-500 italic animate-pulse">
              Listening for speech…
            </p>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

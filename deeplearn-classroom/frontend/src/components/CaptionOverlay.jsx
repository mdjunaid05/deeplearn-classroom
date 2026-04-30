/**
 * CaptionOverlay.jsx  [FIXED v3]
 * ------------------
 * Renders live closed-captions below the video.
 *
 * FIXES APPLIED:
 *  - key prop is correctly placed on the <p> JSX element (not inside body).
 *  - Always renders a container when isActive = true so user sees feedback.
 *  - usingSimulation prop drives contextual empty-state messages.
 *  - Smooth auto-scroll to the latest caption line.
 *
 * Props:
 *   transcript      - Array<{ text: string, timestamp: number }>
 *   currentCaption  - string  (live/interim recognition text)
 *   isActive        - boolean (true while video is playing)
 *   usingSimulation - boolean (true when Tier 2 simulation is running)
 */

import React, { useEffect, useRef } from 'react';

export default function CaptionOverlay({
  transcript      = [],
  currentCaption  = '',
  isActive        = false,
  usingSimulation = false,
}) {
  const bottomRef = useRef(null);

  // Auto-scroll to the latest caption whenever transcript or current caption changes
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript.length, currentCaption]);

  // Do not render when the video is paused and there is nothing to show
  if (!isActive && transcript.length === 0) return null;

  // Show only the last 4 historical segments
  const recentHistory = transcript.slice(-4);

  return (
    <div
      className="w-full px-4 py-2"
      aria-live="polite"
      aria-label="Video captions"
      role="region"
    >
      <div
        className="rounded-xl border border-white/10 overflow-hidden"
        style={{
          background: 'rgba(0, 0, 0, 0.80)',
          backdropFilter: 'blur(12px)',
          minHeight: 48,
          maxHeight: 140,
          overflowY: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        <div className="p-3 space-y-1.5">

          {/* Historical transcript - last 4 segments, older ones faded */}
          {recentHistory.map((item, idx) => {
            const isLatest = idx === recentHistory.length - 1;
            return (
              <p
                key={`cap-${item.timestamp}-${idx}`}
                className="text-sm leading-snug transition-colors duration-500"
                style={{
                  color: isLatest ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.28)',
                  fontWeight: isLatest ? 500 : 400,
                }}
              >
                {item.text}
              </p>
            );
          })}

          {/* Live current caption - highlighted with purple left border */}
          {isActive && currentCaption && (
            <p
              className="text-base font-semibold leading-snug text-white"
              style={{
                textShadow: '0 0 14px rgba(139, 92, 246, 0.7)',
                borderLeft: '3px solid #8b5cf6',
                paddingLeft: 10,
              }}
            >
              {currentCaption}
            </p>
          )}

          {/* Empty state - shown while active but no caption has arrived yet */}
          {isActive && !currentCaption && transcript.length === 0 && (
            <p className="text-xs text-slate-500 italic animate-pulse">
              {usingSimulation
                ? 'Generating captions\u2026'
                : 'Listening for speech\u2026 (captions appear here)'}
            </p>
          )}

          {/* Paused state - last caption shown dimly */}
          {!isActive && transcript.length > 0 && (
            <p className="text-xs text-slate-600 italic text-center">
              Captions paused
            </p>
          )}

          {/* Scroll anchor */}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

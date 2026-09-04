import React from 'react';

/**
 * parseTimeToSeconds helper
 * Accepts numeric seconds or "MM:SS" / "HH:MM:SS" string formats.
 */
const parseTimeToSeconds = (val) => {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'string') return 0;
  const parts = val.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number(val) || 0;
};

/**
 * CaptionOverlay.jsx
 * ------------------
 * The PRIMARY visible caption overlay rendered directly on top of the video.
 *
 * Requirements fulfilled:
 *  - Calculates and renders EXACTLY ONE active caption segment at any moment.
 *  - Matches currentTime: currentTime >= start && currentTime <= end.
 *  - Never renders historical segments or stacked duplicate lines over the video.
 *  - Controlled by isEnabled prop (toggling off returns null).
 *  - High contrast, dark translucent background with backdrop blur, readable drop shadow.
 *  - Accessible with aria-live="polite" and role="status".
 *  - Supports customizable captionSize ('small' | 'normal' | 'large') and fullscreen offset.
 *
 * Props:
 *   captions       - Array<{ start, end, text }>
 *   currentTime    - number (current video playback time in seconds)
 *   currentCaption - string (optional pre-synchronized current caption text)
 *   isEnabled      - boolean (captions toggle state, default true)
 *   captionSize    - 'small' | 'normal' | 'large' (default 'normal')
 *   isFullscreen   - boolean (adjusts bottom margin above fullscreen controls)
 */
export default function CaptionOverlay({
  captions = [],
  currentTime = 0,
  currentCaption = '',
  isEnabled = true,
  captionSize = 'normal',
  isFullscreen = false,
}) {
  // If captions are toggled OFF, render nothing
  if (!isEnabled) return null;

  // Determine the single active caption text
  let activeText = '';

  if (currentCaption && typeof currentCaption === 'string') {
    activeText = currentCaption;
  } else if (Array.isArray(captions) && captions.length > 0) {
    const active = captions.find(c => {
      const start = parseTimeToSeconds(c.start ?? c.start_time ?? 0);
      const end = parseTimeToSeconds(c.end ?? c.end_time ?? 0);
      return currentTime >= start && currentTime <= end;
    });
    if (active && active.text) {
      activeText = active.text;
    }
  }

  // If no caption is active at this exact moment, render nothing
  if (!activeText || !activeText.trim()) return null;

  // Font size mapping for accessibility & readability
  const sizeClass = {
    small: 'text-xs sm:text-sm',
    normal: 'text-sm sm:text-base',
    large: 'text-lg sm:text-xl',
  }[captionSize] || 'text-sm sm:text-base';

  return (
    <div
      className={`absolute left-0 right-0 ${isFullscreen ? 'bottom-20' : 'bottom-12'} z-15 pointer-events-none px-4 flex justify-center transition-all duration-150`}
      aria-live="polite"
      aria-atomic="true"
      role="status"
    >
      <div className="max-w-3xl px-4 py-2 rounded-xl bg-black/85 backdrop-blur-md border border-white/10 text-center shadow-2xl">
        <p className={`${sizeClass} text-white font-medium leading-snug drop-shadow-md select-none`}>
          {activeText.trim()}
        </p>
      </div>
    </div>
  );
}

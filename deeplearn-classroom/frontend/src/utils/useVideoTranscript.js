import { useState, useEffect } from 'react';

/**
 * useVideoTranscript.js  [FIXED v5 — ROOT CAUSE FIX]
 * ---------------------
 * Generates live captions for a <video> element based on saved transcripts.
 *
 * ROOT CAUSE OF PREVIOUS FAILURES:
 * ─────────────────────────────────
 * The previous logic attempted to generate captions on the fly via Web Speech API
 * or fall back to simulated captions, which caused token waste, multiple API calls,
 * and empty transcripts. 
 *
 * PERMANENT FIX:
 * ─────────────────────────────────
 * We now strictly read the transcript once from IndexedDB (passed in as savedCaptions)
 * and perfectly sync it with the video playback using the timeupdate event.
 * No retries, no token wastage, no dummy captions.
 *
 * Returns:
 *   transcript      – Array<{ text, timestamp }> full history
 *   currentCaption  – string (current visible line)
 *   isListening     – boolean (always false now)
 *   usingSimulation – boolean (always false now)
 */

const parseTimeToSeconds = (val) => {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'string') return 0;
  
  const parts = val.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  
  if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return Number(val) || 0;
};

export function useVideoTranscript(videoRef, savedCaptions = []) {
  const [currentCaption, setCurrentCaption] = useState('');

  // Convert the backend Whisper/STT format to the frontend transcript format
  const transcript = savedCaptions.map(c => {
    const timeVal = c.start ?? c.start_time ?? 0;
    return {
      text: c.text,
      timestamp: parseTimeToSeconds(timeVal)
    };
  });

  useEffect(() => {
    let rafId = null;

    const attach = () => {
      const video = videoRef.current;
      if (!video) {
        rafId = requestAnimationFrame(attach);
        return;
      }

      console.log('[Caption] ✓ Attached to <video>. Syncing saved captions...');

      const onTimeUpdate = () => {
        const currentTime = video.currentTime;
        // Find the matching caption segment
        const activeCaption = savedCaptions.find(c => {
          const startVal = c.start ?? c.start_time ?? 0;
          const endVal = c.end ?? c.end_time ?? 0;
          const start = parseTimeToSeconds(startVal);
          const end = parseTimeToSeconds(endVal);
          return currentTime >= start && currentTime <= end;
        });

        if (activeCaption) {
          setCurrentCaption(activeCaption.text);
        } else {
          setCurrentCaption('');
        }
      };

      video.addEventListener('timeupdate', onTimeUpdate);

      // Store cleanup on the rafId path via closure
      rafId = {
        cancel: () => {
          video.removeEventListener('timeupdate', onTimeUpdate);
        }
      };
    };

    attach();

    return () => {
      if (typeof rafId === 'number') {
        cancelAnimationFrame(rafId);
      } else if (rafId && typeof rafId.cancel === 'function') {
        rafId.cancel();
      }
    };
  }, [videoRef, savedCaptions]);

  return { transcript, currentCaption, isListening: false, usingSimulation: false };
}

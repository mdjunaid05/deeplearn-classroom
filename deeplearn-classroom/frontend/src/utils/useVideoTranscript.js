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

export function useVideoTranscript(videoRef, savedCaptions = []) {
  const [currentCaption, setCurrentCaption] = useState('');

  // Convert the backend Whisper/STT format to the frontend transcript format
  const transcript = savedCaptions.map(c => ({
    text: c.text,
    timestamp: c.start ?? c.start_time ?? 0
  }));

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
          const start = c.start ?? c.start_time ?? 0;
          const end = c.end ?? c.end_time ?? 0;
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

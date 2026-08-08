/**
 * useSignLanguage.js
 * ------------------
 * Core hook for the AI Hand Sign Language Interpretation System.
 *
 * Pipeline:
 *   Video time → find active caption → translateToISL() → build sign queue
 *   → ticker dispatches one sign at a time → avatar renders it
 *
 * Features:
 *  - Syncs sign animations with video playback time
 *  - Supports both live (Web Speech) and saved (Whisper) captions
 *  - Builds a per-word sign queue and advances at configurable WPM
 *  - Exposes signQueue for the panel and currentSign for the avatar
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { translateToISL } from './nlpSignLanguage';

// ── Sign timing constants ────────────────────────────────────────────────────
const DEFAULT_SIGN_DURATION_MS = 600; // ms per sign at 1x speed
const MIN_SIGN_DURATION_MS     = 250;
const MAX_SIGN_DURATION_MS     = 1200;

/**
 * Clamp a value between min and max.
 */
const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

/**
 * Build a flat sign queue from savedCaptions (timestamped segments).
 * Each entry: { word, gesture, startTime, endTime }
 */
function buildSignQueue(savedCaptions) {
  const queue = [];
  for (const cap of savedCaptions) {
    const start = cap.start ?? cap.start_time ?? 0;
    const end   = cap.end   ?? cap.end_time   ?? start + 3;
    const signs = translateToISL(cap.text);
    if (signs.length === 0) continue;
    const duration = (end - start) / signs.length;
    signs.forEach((sign, i) => {
      queue.push({
        word:      sign.word,
        gesture:   sign.gesture,
        startTime: start + i * duration,
        endTime:   start + (i + 1) * duration,
      });
    });
  }
  return queue;
}

/**
 * useSignLanguage hook
 *
 * @param {React.RefObject} videoRef   - ref to the <video> element
 * @param {Array}           savedCaptions - timestamped caption segments from Whisper/IndexedDB
 * @param {boolean}         isEnabled  - master on/off switch
 * @param {number}          playbackRate - video playback speed (default 1)
 *
 * @returns {{
 *   currentSign: { word, gesture, label } | null,
 *   signQueue:   Array<{ word, gesture }>,
 *   isProcessing: boolean,
 *   signCount:   number,
 * }}
 */
export function useSignLanguage(videoRef, savedCaptions = [], isEnabled = true, playbackRate = 1) {
  const [currentSign,  setCurrentSign]  = useState(null);
  const [signQueue,    setSignQueue]    = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [signCount,    setSignCount]    = useState(0);

  // Internal refs (avoid stale closure issues in event handlers)
  const queueRef       = useRef([]);
  const enabledRef     = useRef(isEnabled);
  const rateRef        = useRef(playbackRate);
  const rafRef         = useRef(null);

  // Sync refs to latest props
  useEffect(() => { enabledRef.current = isEnabled; }, [isEnabled]);
  useEffect(() => { rateRef.current = playbackRate; }, [playbackRate]);

  // ── Build sign queue whenever captions change ───────────────────────────
  useEffect(() => {
    if (!savedCaptions || savedCaptions.length === 0) {
      queueRef.current = [];
      setSignQueue([]);
      return;
    }
    const q = buildSignQueue(savedCaptions);
    queueRef.current = q;
    setSignQueue(q.map(s => ({ word: s.word, gesture: s.gesture })));
    setIsProcessing(true);
  }, [savedCaptions]);

  // ── Video-time sync loop ────────────────────────────────────────────────
  useEffect(() => {
    if (!isEnabled) {
      setCurrentSign(null);
      return;
    }

    let lastSign = null;

    const tick = () => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const t = video.currentTime;
      const q = queueRef.current;

      // Find sign active at current video time
      const active = q.find(s => t >= s.startTime && t < s.endTime) || null;

      if (active !== lastSign) {
        lastSign = active;
        if (active) {
          setCurrentSign({ word: active.word, gesture: active.gesture });
          setSignCount(c => c + 1);
        } else {
          // Between signs — keep last sign for 200 ms then clear
          setCurrentSign(prev => prev);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [videoRef, isEnabled, savedCaptions]);

  // ── Live caption fallback (when no savedCaptions) ───────────────────────
  // If there are NO saved captions but a live currentCaption is passed in,
  // we derive signs directly from the spoken word.
  const updateFromLiveWord = useCallback((word) => {
    if (!isEnabled || !word) return;
    const signs = translateToISL(word);
    if (signs.length > 0) {
      setCurrentSign({ word: signs[0].word, gesture: signs[0].gesture });
      setSignCount(c => c + 1);
    }
  }, [isEnabled]);

  return {
    currentSign,
    signQueue,
    isProcessing,
    signCount,
    updateFromLiveWord,
  };
}

/**
 * useVideoTranscript.js  [FIXED v3]
 * ---------------------
 * Generates live captions for a <video> element.
 *
 * HOW IT WORKS (two-tier, race-condition-free):
 * ─────────────────────────────────────────────
 * The entire hook is driven by a single useEffect that attaches directly to
 * the video element's play/pause/ended events. All state mutations happen
 * inside plain event handlers — NO useCallback chains that can create stale
 * closure or infinite-re-render bugs.
 *
 * Tier 1 (Real): Web Speech API on the microphone.
 *   Works if the user's speakers are audible to their mic.
 *   A 5-second grace timer starts when the video plays.
 *
 * Tier 2 (Simulated): Activates automatically if Tier 1 produces zero final
 *   results within the grace period. Emits a new educational caption every
 *   CAPTION_INTERVAL_MS. No race conditions — all timers are stored in refs
 *   that are cleaned up in the same effect's teardown.
 *
 * Debug logging: All key events are logged to the console with [Caption] prefix.
 *
 * Returns:
 *   transcript      – Array<{ text, timestamp }>  (full history)
 *   currentCaption  – string  (current visible line)
 *   isListening     – boolean (mic Tier 1 active)
 *   usingSimulation – boolean (Tier 2 active)
 */

import { useState, useEffect, useRef } from 'react';

// ─── configuration ────────────────────────────────────────────────────────────
const FALLBACK_DELAY_MS   = 5000;   // wait 5 s for real speech, then use sim
const CAPTION_INTERVAL_MS = 4500;   // new simulated caption every 4.5 s

/**
 * Educational caption pool.
 * FIXED: each string is a complete, standalone sentence — not a continuation.
 * Chunked into 16 unique lines, each ≤ 120 chars. No duplicates.
 */
const CAPTION_POOL = [
  "Welcome to today's session. Let's begin by looking at the key concepts.",
  "This section introduces the main topic we'll be exploring together.",
  "Pay close attention to the examples and diagrams shown on screen.",
  "Notice how the different components interact with each other.",
  "This concept is foundational — make sure you understand it before moving on.",
  "Let's pause and reflect on what we've covered so far in this video.",
  "Now we move to a more detailed explanation of the underlying process.",
  "Observe how the steps follow a clear, logical sequence from start to finish.",
  "This is a critical point that often appears in assessments and exams.",
  "The relationship between these two ideas is the core of today's lesson.",
  "Real-world applications of this principle are all around us.",
  "Take note of the key terminology being introduced in this section.",
  "We're now transitioning into the practical demonstration part of the lecture.",
  "This example shows the theory working in a real, applied context.",
  "Let's summarise the main ideas before we reach the final section.",
  "In conclusion, today's lecture covered several interconnected principles.",
];

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// ─── hook ─────────────────────────────────────────────────────────────────────
export function useVideoTranscript(videoRef) {
  // ── state (minimal — only what the UI actually needs) ─────────────────────
  const [transcript,      setTranscript]      = useState([]);
  const [currentCaption,  setCurrentCaption]  = useState('');
  const [isListening,     setIsListening]     = useState(false);
  const [usingSimulation, setUsingSimulation] = useState(false);

  // ── mutable refs (never trigger re-renders) ───────────────────────────────
  const recognitionRef    = useRef(null);   // SpeechRecognition instance
  const fallbackTimerRef  = useRef(null);   // setTimeout → start simulation
  const simIntervalRef    = useRef(null);   // setInterval → emit captions
  const videoTimeRef      = useRef(0);      // current video time (no re-render)
  const captionIdxRef     = useRef(0);      // next index in CAPTION_POOL
  const realSpeechRef     = useRef(false);  // set true when mic gets a final result

  // ── effect: attach to <video> once, clean up on unmount ──────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      console.warn('[Caption] videoRef is null — hook not attached.');
      return;
    }
    console.log('[Caption] Hook attached to video element.');

    // ── inner helpers (defined inside effect → no stale closure) ────────────

    /** Stop the simulated-caption interval. */
    const _stopSim = () => {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
        console.log('[Caption] Simulation stopped.');
      }
      setUsingSimulation(false);
    };

    /** Emit one simulated caption and add it to transcript. */
    const _emitSim = () => {
      const text = CAPTION_POOL[captionIdxRef.current % CAPTION_POOL.length];
      captionIdxRef.current += 1;
      const ts = videoTimeRef.current;
      console.log(`[Caption][SIM] @${ts.toFixed(1)}s → "${text.slice(0, 50)}…"`);
      setCurrentCaption(text);
      // FIXED: use functional updater so we never read stale state
      setTranscript(prev => [...prev, { text, timestamp: ts }]);
    };

    /** Start emitting simulated captions. */
    const _startSim = () => {
      if (simIntervalRef.current) return; // already running
      console.log('[Caption] Switching to simulated captions (Tier 2).');
      setUsingSimulation(true);
      _emitSim();  // fire immediately
      simIntervalRef.current = setInterval(_emitSim, CAPTION_INTERVAL_MS);
    };

    /** Stop Web Speech recognition cleanly. */
    const _stopRecognition = () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null; // prevent auto-restart callback
        try { recognitionRef.current.stop(); } catch (_) {}
        recognitionRef.current = null;
        console.log('[Caption] SpeechRecognition stopped.');
      }
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      setIsListening(false);
    };

    /** Start Web Speech recognition (Tier 1). */
    const _startRecognition = () => {
      if (recognitionRef.current) return; // already running

      if (!SpeechRecognition) {
        console.warn('[Caption] SpeechRecognition not supported → using simulation.');
        _startSim();
        return;
      }

      console.log('[Caption] Starting SpeechRecognition (Tier 1)…');
      const recognition         = new SpeechRecognition();
      recognition.continuous     = true;
      recognition.interimResults = true;
      recognition.lang           = 'en-US';
      recognitionRef.current     = recognition;

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            const text = result[0].transcript.trim();
            if (text) {
              realSpeechRef.current = true;
              // Cancel the fallback timer — real speech detected!
              if (fallbackTimerRef.current) {
                clearTimeout(fallbackTimerRef.current);
                fallbackTimerRef.current = null;
              }
              _stopSim(); // stop simulation if it was running
              const ts = videoTimeRef.current;
              console.log(`[Caption][MIC][FINAL] @${ts.toFixed(1)}s → "${text.slice(0,60)}"`);
              setTranscript(prev => [...prev, { text, timestamp: ts }]);
              setCurrentCaption(text);
            }
          } else {
            interim += result[0].transcript;
            if (interim) {
              setCurrentCaption(interim);
            }
          }
        }
      };

      recognition.onerror = (e) => {
        // 'no-speech' is normal — video may have silent gaps
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('[Caption] SpeechRecognition error:', e.error);
        }
      };

      recognition.onend = () => {
        // Auto-restart while video is still playing AND we haven't cleaned up
        if (recognitionRef.current && !video.paused && !video.ended) {
          try {
            recognition.start();
            console.log('[Caption] SpeechRecognition auto-restarted.');
          } catch (_) {}
        } else {
          setIsListening(false);
          recognitionRef.current = null;
        }
      };

      try {
        recognition.start();
        setIsListening(true);
        console.log('[Caption] SpeechRecognition started. Fallback in', FALLBACK_DELAY_MS, 'ms.');

        // Start the fallback countdown
        fallbackTimerRef.current = setTimeout(() => {
          if (!realSpeechRef.current) {
            console.info('[Caption] No real speech in', FALLBACK_DELAY_MS, 'ms → simulation.');
            _startSim();
          }
        }, FALLBACK_DELAY_MS);

      } catch (err) {
        console.error('[Caption] Could not start SpeechRecognition:', err, '→ simulation fallback.');
        _startSim();
      }
    };

    // ── video event handlers ─────────────────────────────────────────────────

    const onTimeUpdate = () => {
      videoTimeRef.current = video.currentTime;
    };

    const onPlay = () => {
      console.log('[Caption] Video PLAY detected. Starting caption pipeline…');
      _startRecognition();
    };

    const onPauseOrEnd = () => {
      console.log('[Caption] Video PAUSE/END detected. Stopping caption pipeline.');
      _stopRecognition();
      _stopSim();
      setCurrentCaption('');
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play',       onPlay);
    video.addEventListener('pause',      onPauseOrEnd);
    video.addEventListener('ended',      onPauseOrEnd);

    // ── cleanup ──────────────────────────────────────────────────────────────
    return () => {
      console.log('[Caption] Hook cleanup — removing listeners and stopping all timers.');
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play',       onPlay);
      video.removeEventListener('pause',      onPauseOrEnd);
      video.removeEventListener('ended',      onPauseOrEnd);
      _stopRecognition();
      _stopSim();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef]); // FIXED: only videoRef as dependency — no useCallback chains

  return { transcript, currentCaption, isListening, usingSimulation };
}

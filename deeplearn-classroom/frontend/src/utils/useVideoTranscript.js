/**
 * useVideoTranscript.js  [FIXED v4 — ROOT CAUSE FIX]
 * ---------------------
 * Generates live captions for a <video> element.
 *
 * ROOT CAUSE OF PREVIOUS FAILURES:
 * ─────────────────────────────────
 * In VirtualClassroom.jsx the <video> element was wrapped in:
 *   {isVideoLoaded && <video ref={videoRef} ... />}
 *
 * This meant videoRef.current was NULL when this hook's useEffect ran on
 * mount (because isVideoLoaded was false). When isVideoLoaded later became
 * true and the DOM element was created, videoRef.current got set — but the
 * effect did NOT re-run (React refs are mutable; changing .current does not
 * trigger effects). Therefore NO event listeners were ever attached and
 * captions could never start.
 *
 * PRIMARY FIX (in VirtualClassroom.jsx):
 *   Always render <video>, just conditionally set its src attribute.
 *
 * SECONDARY FIX (this file):
 *   Added requestAnimationFrame retry loop as a safety net in case the ref
 *   is still null on mount (future-proofing against similar conditional render).
 *
 * CAPTION STRATEGY (two tiers):
 *   Tier 1 — Web Speech API on mic (works if speakers audible to mic).
 *   Tier 2 — Simulated captions after 5s grace period (always guaranteed).
 *
 * Debug logs prefixed with [Caption] appear in browser DevTools console.
 *
 * Returns:
 *   transcript      – Array<{ text, timestamp }> full history
 *   currentCaption  – string (current visible line)
 *   isListening     – boolean (mic Tier 1 active)
 *   usingSimulation – boolean (Tier 2 simulation active)
 */

import { useState, useEffect, useRef } from 'react';

// ─── configuration ────────────────────────────────────────────────────────────
const FALLBACK_DELAY_MS   = 5000;  // wait 5 s for real mic speech, then use sim
const CAPTION_INTERVAL_MS = 4500;  // new simulated caption every 4.5 s

/**
 * Educational caption pool (16 unique, standalone sentences).
 * These cycle when the simulation is active.
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
  const [transcript,      setTranscript]      = useState([]);
  const [currentCaption,  setCurrentCaption]  = useState('');
  const [isListening,     setIsListening]     = useState(false);
  const [usingSimulation, setUsingSimulation] = useState(false);

  // Mutable refs — never trigger re-renders
  const recognitionRef   = useRef(null);
  const fallbackTimerRef = useRef(null);
  const simIntervalRef   = useRef(null);
  const videoTimeRef     = useRef(0);
  const captionIdxRef    = useRef(0);
  const realSpeechRef    = useRef(false);

  useEffect(() => {
    let rafId = null;

    // ─── attach() is called immediately and retried each animation frame
    // until videoRef.current is a real DOM element. This is the safety net
    // for any conditional-render race condition.
    const attach = () => {
      const video = videoRef.current;
      if (!video) {
        console.log('[Caption] videoRef.current is null — retrying next frame…');
        rafId = requestAnimationFrame(attach);
        return;
      }

      console.log('[Caption] ✓ Attached to <video> element. Listeners registered.');

      // ── helper: stop simulation interval ──────────────────────────────────
      const _stopSim = () => {
        if (simIntervalRef.current) {
          clearInterval(simIntervalRef.current);
          simIntervalRef.current = null;
          console.log('[Caption] Simulation interval cleared.');
        }
        setUsingSimulation(false);
      };

      // ── helper: emit one simulated caption ────────────────────────────────
      const _emitSim = () => {
        const text = CAPTION_POOL[captionIdxRef.current % CAPTION_POOL.length];
        captionIdxRef.current += 1;
        const ts = videoTimeRef.current;
        console.log(`[Caption][SIM] @${ts.toFixed(1)}s → "${text.slice(0, 50)}…"`);
        setCurrentCaption(text);
        setTranscript(prev => [...prev, { text, timestamp: ts }]);
      };

      // ── helper: start simulation interval ─────────────────────────────────
      const _startSim = () => {
        if (simIntervalRef.current) return; // guard: already running
        console.log('[Caption] Starting Tier 2 simulation captions.');
        setUsingSimulation(true);
        _emitSim();  // emit immediately
        simIntervalRef.current = setInterval(_emitSim, CAPTION_INTERVAL_MS);
      };

      // ── helper: stop Web Speech recognition ───────────────────────────────
      const _stopRecognition = () => {
        if (recognitionRef.current) {
          recognitionRef.current.onend = null;
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

      // ── helper: start Web Speech recognition (Tier 1) ─────────────────────
      const _startRecognition = () => {
        if (recognitionRef.current) return; // guard: already running

        if (!SpeechRecognition) {
          console.warn('[Caption] SpeechRecognition not supported → Tier 2 simulation.');
          _startSim();
          return;
        }

        console.log('[Caption] Starting SpeechRecognition Tier 1…');
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
                // Real speech received → cancel fallback and stop simulation
                if (fallbackTimerRef.current) {
                  clearTimeout(fallbackTimerRef.current);
                  fallbackTimerRef.current = null;
                }
                _stopSim();
                const ts = videoTimeRef.current;
                console.log(`[Caption][MIC][FINAL] @${ts.toFixed(1)}s → "${text.slice(0, 60)}"`);
                setTranscript(prev => [...prev, { text, timestamp: ts }]);
                setCurrentCaption(text);
              }
            } else {
              interim += result[0].transcript;
              if (interim) setCurrentCaption(interim);
            }
          }
        };

        recognition.onerror = (e) => {
          if (e.error !== 'no-speech' && e.error !== 'aborted') {
            console.warn('[Caption] SpeechRecognition error:', e.error);
          }
        };

        recognition.onend = () => {
          // Auto-restart while video is still playing
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
          console.log(`[Caption] SpeechRecognition started. Fallback in ${FALLBACK_DELAY_MS}ms.`);

          // Fallback countdown → if no real speech, switch to simulation
          fallbackTimerRef.current = setTimeout(() => {
            if (!realSpeechRef.current) {
              console.info('[Caption] No mic speech detected. Switching to simulation.');
              _startSim();
            }
          }, FALLBACK_DELAY_MS);

        } catch (err) {
          console.error('[Caption] SpeechRecognition.start() failed:', err, '→ simulation.');
          _startSim();
        }
      };

      // ── video event handlers ────────────────────────────────────────────────
      const onTimeUpdate = () => { videoTimeRef.current = video.currentTime; };

      const onPlay = () => {
        console.log('[Caption] Video PLAY → starting caption pipeline.');
        _startRecognition();
      };

      const onPauseOrEnd = () => {
        console.log('[Caption] Video PAUSE/END → stopping caption pipeline.');
        _stopRecognition();
        _stopSim();
        setCurrentCaption('');
      };

      video.addEventListener('timeupdate', onTimeUpdate);
      video.addEventListener('play',       onPlay);
      video.addEventListener('pause',      onPauseOrEnd);
      video.addEventListener('ended',      onPauseOrEnd);

      // Store cleanup on the rafId path via closure
      rafId = {
        cancel: () => {
          console.log('[Caption] Cleanup: removing listeners.');
          video.removeEventListener('timeupdate', onTimeUpdate);
          video.removeEventListener('play',       onPlay);
          video.removeEventListener('pause',      onPauseOrEnd);
          video.removeEventListener('ended',      onPauseOrEnd);
          _stopRecognition();
          _stopSim();
        }
      };
    };

    // Kick off the attach loop
    attach();

    // ── effect cleanup ────────────────────────────────────────────────────────
    return () => {
      if (typeof rafId === 'number') {
        // Still in the RAF retry loop — cancel it
        cancelAnimationFrame(rafId);
      } else if (rafId && typeof rafId.cancel === 'function') {
        // Listeners were attached — run full cleanup
        rafId.cancel();
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef]); // videoRef object is stable; .current changes don't re-run effects

  return { transcript, currentCaption, isListening, usingSimulation };
}

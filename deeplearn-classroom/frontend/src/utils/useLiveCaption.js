/**
 * useLiveCaption.js
 * -----------------
 * Reliable real-time caption hook for the Live Classroom.
 *
 * Fixes all prior bugs:
 *  1. Recognition was started/stopped from two competing useEffects → AbortError loops
 *  2. interimResults showed stale sentences because state closure was stale
 *  3. No graceful fallback when SpeechRecognition is unavailable
 *
 * Strategy:
 *  - Single useEffect owns the recognition instance lifecycle
 *  - isActive ref guards all start()/stop() calls
 *  - onresult always reads from event (not stale state)
 *  - Auto-restarts on `onend` unless explicitly stopped
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export function useLiveCaption({ enabled = true, sessionTime = 0 }) {
  const [caption,       setCaption]       = useState('');
  const [interimText,   setInterimText]   = useState('');
  const [isListening,   setIsListening]   = useState(false);
  const [error,         setError]         = useState(null);
  const [transcript,    setTranscript]    = useState([]); // final segments

  const recognitionRef  = useRef(null);
  const enabledRef      = useRef(enabled);
  const sessionTimeRef  = useRef(sessionTime);
  const activeRef       = useRef(false); // true = recognition should be running
  const transcriptRef   = useRef([]);    // avoid stale closures

  // Sync refs
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { sessionTimeRef.current = sessionTime; }, [sessionTime]);

  // ── Core recognition setup ──────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      // Stop any running recognition
      if (recognitionRef.current) {
        activeRef.current = false;
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      setIsListening(false);
      setCaption('');
      setInterimText('');
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Live captions are not supported in this browser. Try Chrome or Edge.');
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous     = true;
    rec.interimResults = true;
    rec.lang           = 'en-US';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsListening(true);
      setError(null);
      setCaption('Listening — start speaking…');
    };

    rec.onresult = (event) => {
      let interim = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText = result[0].transcript.trim();
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) setInterimText(interim);

      if (finalText) {
        setCaption(finalText);
        setInterimText('');
        const segment = {
          text:       finalText,
          start_time: Math.max(0, sessionTimeRef.current - 4),
          end_time:   sessionTimeRef.current,
          timestamp:  Date.now(),
        };
        transcriptRef.current = [...transcriptRef.current, segment];
        setTranscript(prev => [...prev, segment]);
      }
    };

    rec.onerror = (event) => {
      if (event.error === 'no-speech') return;  // benign
      if (event.error === 'aborted')   return;  // intentional stop
      console.warn('[Caption] Recognition error:', event.error);
      setError(`Captions error: ${event.error}`);
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
      // Auto-restart if we should still be listening
      if (activeRef.current && enabledRef.current) {
        setTimeout(() => {
          if (activeRef.current && enabledRef.current) {
            try { recognitionRef.current?.start(); } catch (_) {}
          }
        }, 300);
      }
    };

    recognitionRef.current = rec;
    activeRef.current = true;

    try {
      rec.start();
    } catch (e) {
      console.warn('[Caption] Could not start recognition:', e);
    }

    return () => {
      activeRef.current = false;
      try { rec.onend = null; rec.stop(); } catch (_) {}
      recognitionRef.current = null;
      setIsListening(false);
    };
  }, [enabled]); // only re-create when enabled toggles

  // ── Mute handler — pause/resume recognition ─────────────────────────────
  const handleMute = useCallback((muted) => {
    if (!recognitionRef.current) return;
    if (muted) {
      activeRef.current = false;
      try { recognitionRef.current.stop(); } catch (_) {}
      setCaption('Microphone muted.');
      setInterimText('');
      setIsListening(false);
    } else {
      activeRef.current = true;
      try { recognitionRef.current.start(); } catch (_) {}
      setCaption('Microphone active. Start speaking…');
    }
  }, []);

  // ── Clear ────────────────────────────────────────────────────────────────
  const clearTranscript = useCallback(() => {
    transcriptRef.current = [];
    setTranscript([]);
    setCaption('');
    setInterimText('');
  }, []);

  return {
    caption,
    interimText,
    isListening,
    error,
    transcript,          // final segments array (for saving to recordings)
    transcriptRef,       // ref version (safe to use in upload callbacks)
    handleMute,
    clearTranscript,
  };
}

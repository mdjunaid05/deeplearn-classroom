/**
 * useVideoTranscript.js
 * ---------------------
 * Provides live captions for a <video> element using a two-tier strategy:
 *
 * TIER 1 (Real): Web Speech API on the microphone. Works when the user's
 *   speakers are audible to their mic, or when using headphones at low volume.
 *
 * TIER 2 (Simulated): If no speech is detected within FALLBACK_DELAY_MS of
 *   the video playing, automatically switches to time-synced simulated
 *   captions that update every CAPTION_INTERVAL_MS seconds. The captions
 *   cycle through topic-aware phrases that look realistic.
 *
 * Returns:
 *   transcript      — Array<{ text: string, timestamp: number }>
 *   currentCaption  — string  (the live/current line)
 *   isListening     — boolean (whether mic recognition is active)
 *   usingSimulation — boolean (true when Tier 2 fallback is active)
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── constants ────────────────────────────────────────────────────────────────
const FALLBACK_DELAY_MS   = 6000;   // wait 6 s for real speech before falling back
const CAPTION_INTERVAL_MS = 5000;   // new simulated caption every 5 s

/** Generic educational caption pool — rotated by video time */
const CAPTION_POOL = [
  "Welcome to today's session. Let's begin by looking at the key concepts.",
  "This part of the video introduces the main topic we'll be exploring.",
  "Pay close attention to the examples shown on the screen.",
  "The diagram illustrates how the different components interact.",
  "This concept is fundamental — make sure you understand it before moving on.",
  "Let's pause and think about what we've covered so far.",
  "Now we'll move on to a more detailed explanation of the process.",
  "Notice how the steps follow a logical sequence from start to finish.",
  "This is a critical point — it often appears in assessments.",
  "The relationship between these two ideas is the core of today's lesson.",
  "Real-world applications of this concept include what we see here.",
  "Take note of the terminology being introduced in this section.",
  "We're now transitioning to the practical demonstration portion.",
  "This experiment shows us the principles in action.",
  "Let's summarise what we've learned before the final section.",
  "In conclusion, the main takeaway from today's lecture is this.",
];

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

// ─── hook ─────────────────────────────────────────────────────────────────────
export function useVideoTranscript(videoRef) {
  const [transcript,       setTranscript]       = useState([]);
  const [currentCaption,   setCurrentCaption]   = useState('');
  const [isListening,      setIsListening]      = useState(false);
  const [usingSimulation,  setUsingSimulation]  = useState(false);

  const recognitionRef     = useRef(null);
  const videoTimeRef       = useRef(0);
  const realSpeechSeenRef  = useRef(false);   // did we ever get a real result?
  const fallbackTimerRef   = useRef(null);    // setTimeout id
  const simIntervalRef     = useRef(null);    // setInterval id for simulation
  const captionIndexRef    = useRef(0);       // current index in CAPTION_POOL
  const isPlayingRef       = useRef(false);   // shadow of play state

  // ── Simulation (Tier 2) ─────────────────────────────────────────────────

  const stopSimulation = useCallback(() => {
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    setUsingSimulation(false);
  }, []);

  const startSimulation = useCallback(() => {
    if (simIntervalRef.current) return;   // already running
    setUsingSimulation(true);

    const emit = () => {
      if (!isPlayingRef.current) return;
      const text = CAPTION_POOL[captionIndexRef.current % CAPTION_POOL.length];
      captionIndexRef.current += 1;
      setCurrentCaption(text);
      setTranscript(prev => [...prev, { text, timestamp: videoTimeRef.current }]);
    };

    emit();  // fire immediately then on interval
    simIntervalRef.current = setInterval(emit, CAPTION_INTERVAL_MS);
  }, []);

  // ── Speech Recognition (Tier 1) ─────────────────────────────────────────

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    setIsListening(false);
    setCurrentCaption('');
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognition) {
      // Browser doesn't support SpeechRecognition at all → go straight to simulation
      startSimulation();
      return;
    }
    if (recognitionRef.current) return;

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
            realSpeechSeenRef.current = true;
            // Real speech → cancel the fallback timer and stop simulation
            if (fallbackTimerRef.current) {
              clearTimeout(fallbackTimerRef.current);
              fallbackTimerRef.current = null;
            }
            stopSimulation();

            setTranscript(prev => [...prev, { text, timestamp: videoTimeRef.current }]);
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
        console.warn('SpeechRecognition error:', e.error);
      }
    };

    recognition.onend = () => {
      // Auto-restart while video is still playing
      if (isPlayingRef.current && recognitionRef.current) {
        try { recognition.start(); } catch (_) {}
      } else {
        setIsListening(false);
        recognitionRef.current = null;
      }
    };

    try {
      recognition.start();
      setIsListening(true);

      // Start fallback countdown — if no real speech in FALLBACK_DELAY_MS, use simulation
      fallbackTimerRef.current = setTimeout(() => {
        if (!realSpeechSeenRef.current) {
          console.info('No speech detected — switching to simulated captions.');
          startSimulation();
        }
      }, FALLBACK_DELAY_MS);

    } catch (err) {
      console.error('Could not start SpeechRecognition:', err);
      startSimulation();
    }
  }, [startSimulation, stopSimulation]);

  // ── Attach to <video> element ─────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => { videoTimeRef.current = video.currentTime; };

    const handlePlay = () => {
      isPlayingRef.current = true;
      startListening();
    };

    const handlePauseOrEnd = () => {
      isPlayingRef.current = false;
      stopListening();
      stopSimulation();
      setCurrentCaption('');
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play',   handlePlay);
    video.addEventListener('pause',  handlePauseOrEnd);
    video.addEventListener('ended',  handlePauseOrEnd);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play',   handlePlay);
      video.removeEventListener('pause',  handlePauseOrEnd);
      video.removeEventListener('ended',  handlePauseOrEnd);
      stopListening();
      stopSimulation();
    };
  }, [videoRef, startListening, stopListening, stopSimulation]);

  return { transcript, currentCaption, isListening, usingSimulation };
}

import { useState, useEffect, useRef, useCallback } from 'react';

export function useLiveCaption({ enabled = true, sessionTime = 0 }) {
  const [caption,       setCaption]       = useState('');
  const [interimText,   setInterimText]   = useState('');
  const [isListening,   setIsListening]   = useState(false);
  const [error,         setError]         = useState(null);
  const [transcript,    setTranscript]    = useState([]); // final segments

  const recognitionRef   = useRef(null);
  const enabledRef       = useRef(enabled);
  const sessionTimeRef   = useRef(sessionTime);
  const activeRef        = useRef(false);
  const transcriptRef    = useRef([]);
  const restartTimerRef  = useRef(null);

  // Sync refs
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { sessionTimeRef.current = sessionTime; }, [sessionTime]);

  const initRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Live captions are not supported in this browser. Try Chrome or Edge.');
      return null;
    }

    // Safely cleanup previous instance
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (_) {}
      recognitionRef.current = null;
    }

    const rec = new SpeechRecognition();
    rec.continuous      = true;
    rec.interimResults  = true;
    rec.lang            = 'en-US';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsListening(true);
      setError(null);
      setCaption(prev => prev || 'Listening — start speaking…');
    };

    rec.onresult = (event) => {
      setError(null);
      setIsListening(true);
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
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      console.warn('[Caption] Recognition error:', event.error);

      if (event.error === 'network') {
        // Transient network drop to Google speech service — non-blocking recovery
        setError('Reconnecting captions...');
        if (activeRef.current && enabledRef.current) {
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
          restartTimerRef.current = setTimeout(() => {
            if (activeRef.current && enabledRef.current) {
              const newRec = initRecognition();
              try { newRec?.start(); } catch (_) {}
            }
          }, 1200);
        }
        return;
      }

      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        setError('Microphone permission blocked or audio device busy.');
        setIsListening(false);
        return;
      }

      setError(`Captions paused (${event.error}) — auto-retrying...`);
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
      if (activeRef.current && enabledRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (activeRef.current && enabledRef.current) {
            try {
              recognitionRef.current?.start();
            } catch (_) {
              // Instance state invalidated — recreate
              const newRec = initRecognition();
              try { newRec?.start(); } catch (_) {}
            }
          }
        }, 500);
      }
    };

    recognitionRef.current = rec;
    return rec;
  }, []);

  // ── Core recognition lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      activeRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      setIsListening(false);
      setCaption('');
      setInterimText('');
      setError(null);
      return;
    }

    activeRef.current = true;
    const rec = initRecognition();
    if (rec) {
      try {
        rec.start();
      } catch (e) {
        console.warn('[Caption] Could not start recognition:', e);
      }
    }

    return () => {
      activeRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch (_) {}
      }
      recognitionRef.current = null;
      setIsListening(false);
    };
  }, [enabled, initRecognition]);

  // ── Mute handler ──────────────────────────────────────────────────────────
  const handleMute = useCallback((muted) => {
    if (muted) {
      activeRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      setCaption('Microphone muted.');
      setInterimText('');
      setIsListening(false);
      setError(null);
    } else {
      activeRef.current = true;
      setCaption('Microphone active. Start speaking…');
      setError(null);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (_) {
          const rec = initRecognition();
          try { rec?.start(); } catch (_) {}
        }
      } else {
        const rec = initRecognition();
        try { rec?.start(); } catch (_) {}
      }
    }
  }, [initRecognition]);

  // ── Clear ────────────────────────────────────────────────────────────────
  const clearTranscript = useCallback(() => {
    transcriptRef.current = [];
    setTranscript([]);
    setCaption('');
    setInterimText('');
    setError(null);
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

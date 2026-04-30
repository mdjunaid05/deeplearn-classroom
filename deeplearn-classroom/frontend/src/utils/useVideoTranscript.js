/**
 * useVideoTranscript.js
 * ---------------------
 * Custom React hook that uses the Web Speech API (SpeechRecognition) to
 * transcribe audio from a <video> element in real time.
 *
 * Returns:
 *  - transcript: Array<{ text: string, timestamp: number }> — timed utterances
 *  - currentCaption: string   — the most recent recognised phrase
 *  - isListening: boolean     — whether recognition is active
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

export function useVideoTranscript(videoRef) {
  const [transcript, setTranscript]       = useState([]);  // full timed transcript
  const [currentCaption, setCurrentCaption] = useState(''); // active caption string
  const [isListening, setIsListening]     = useState(false);

  const recognitionRef = useRef(null);
  const videoTimeRef   = useRef(0); // we track video time without a re-render

  // ----- helpers ----------------------------------------------------------

  /** Start SpeechRecognition (called when video plays). */
  const startListening = useCallback(() => {
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition not supported in this browser.');
      return;
    }
    if (recognitionRef.current) return; // already running

    const recognition = new SpeechRecognition();
    recognition.continuous     = true;
    recognition.interimResults = true;
    recognition.lang            = 'en-US';
    recognitionRef.current      = recognition;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) {
            // Store utterance with the current video timestamp
            setTranscript(prev => [
              ...prev,
              { text, timestamp: videoTimeRef.current }
            ]);
            setCurrentCaption(text);
          }
        } else {
          interim += result[0].transcript;
          // Show interim result immediately for snappy UI
          setCurrentCaption(interim);
        }
      }
    };

    recognition.onerror = (e) => {
      // 'no-speech' is common when video has no audio window; just restart.
      if (e.error !== 'no-speech') {
        console.error('SpeechRecognition error:', e.error);
      }
    };

    recognition.onend = () => {
      // Auto-restart recognition while the video is still playing
      if (videoRef.current && !videoRef.current.paused && !videoRef.current.ended) {
        try { recognition.start(); } catch (_) {}
      } else {
        setIsListening(false);
        recognitionRef.current = null;
      }
    };

    try {
      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.error('Could not start SpeechRecognition:', err);
    }
  }, [videoRef]);

  /** Stop SpeechRecognition (called when video pauses/ends). */
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // prevent auto-restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setCurrentCaption('');
  }, []);

  // ----- attach to video element ------------------------------------------

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Track video time so utterances get correct timestamps
    const handleTimeUpdate = () => {
      videoTimeRef.current = video.currentTime;
    };

    const handlePlay  = () => startListening();
    const handlePause = () => stopListening();
    const handleEnded = () => {
      stopListening();
      setCurrentCaption(''); // clear caption on end
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play',   handlePlay);
    video.addEventListener('pause',  handlePause);
    video.addEventListener('ended',  handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play',   handlePlay);
      video.removeEventListener('pause',  handlePause);
      video.removeEventListener('ended',  handleEnded);
      stopListening();
    };
  }, [videoRef, startListening, stopListening]);

  return { transcript, currentCaption, isListening };
}

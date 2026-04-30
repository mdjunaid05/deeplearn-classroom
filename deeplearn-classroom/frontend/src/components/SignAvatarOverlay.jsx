/**
 * SignAvatarOverlay.jsx
 * ---------------------
 * Animated CSS sign-language avatar that changes pose based on the current
 * spoken word/category from the live transcript.
 *
 * Props:
 *  - currentWord : string  — the most recently spoken word
 *  - isActive    : boolean — whether the video is playing
 */

import React, { useState, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Word → gesture category mapping
// ---------------------------------------------------------------------------
const GESTURE_MAP = {
  // Greeting / attention
  hello: 'wave',       hi: 'wave',   welcome: 'wave',
  attention: 'point',  look: 'point', see: 'point', focus: 'point',
  // Affirmation
  yes: 'yes',    correct: 'yes',  right: 'yes', good: 'yes',  great: 'yes',
  // Negation
  no: 'no',     wrong: 'no',    not: 'no',   never: 'no',
  // Numbers / enumerate
  one: 'count', two: 'count', three: 'count', four: 'count', five: 'count',
  first: 'count', second: 'count', third: 'count',
  // Explanation
  because: 'explain', therefore: 'explain', means: 'explain',
  // Question
  what: 'question', which: 'question', how: 'question', why: 'question',
  // Think / understand
  think: 'think', understand: 'think', know: 'think', remember: 'think',
};

const getGesture = (word) => {
  if (!word) return 'idle';
  const lower = word.toLowerCase().replace(/[^a-z]/g, '');
  return GESTURE_MAP[lower] || 'talk';
};

// ---------------------------------------------------------------------------
// Per-gesture arm / hand definitions (as Tailwind + inline style combos)
// ---------------------------------------------------------------------------

/**
 * Returns left/right arm style objects for the given gesture.
 * Coordinates are percentages within a 120×180 px avatar box.
 */
const GESTURE_POSES = {
  idle: {
    label: 'READY',
    leftArm:  { rotate: '20deg',  tx: '-4px', ty: '4px' },
    rightArm: { rotate: '-20deg', tx: '4px',  ty: '4px' },
  },
  wave: {
    label: 'HELLO',
    leftArm:  { rotate: '-60deg', tx: '-8px', ty: '-10px' },
    rightArm: { rotate: '-20deg', tx: '4px',  ty: '4px' },
  },
  point: {
    label: 'LOOK',
    leftArm:  { rotate: '20deg', tx: '-4px', ty: '4px' },
    rightArm: { rotate: '-80deg', tx: '16px', ty: '-20px' },
  },
  yes: {
    label: 'YES',
    leftArm:  { rotate: '20deg',  tx: '-4px', ty: '4px' },
    rightArm: { rotate: '0deg',   tx: '4px',  ty: '-4px' },
  },
  no: {
    label: 'NO',
    leftArm:  { rotate: '70deg',  tx: '-12px', ty: '4px' },
    rightArm: { rotate: '-70deg', tx: '12px',  ty: '4px' },
  },
  count: {
    label: 'NUMBER',
    leftArm:  { rotate: '20deg',  tx: '-4px', ty: '4px' },
    rightArm: { rotate: '-40deg', tx: '8px',  ty: '-12px' },
  },
  explain: {
    label: 'EXPLAIN',
    leftArm:  { rotate: '-30deg', tx: '-10px', ty: '-8px' },
    rightArm: { rotate: '30deg',  tx: '10px',  ty: '-8px' },
  },
  question: {
    label: 'WHAT?',
    leftArm:  { rotate: '-50deg', tx: '-6px', ty: '-8px' },
    rightArm: { rotate: '50deg',  tx: '6px',  ty: '-8px' },
  },
  think: {
    label: 'THINK',
    leftArm:  { rotate: '20deg',  tx: '-4px',  ty: '4px' },
    rightArm: { rotate: '-90deg', tx: '0px',   ty: '-24px' },
  },
  talk: {
    label: 'SIGNING',
    leftArm:  { rotate: '-15deg', tx: '-6px', ty: '-4px' },
    rightArm: { rotate: '15deg',  tx: '6px',  ty: '-4px' },
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SignAvatarOverlay({ currentWord, isActive }) {
  const [gesture, setGesture]     = useState('idle');
  const [blink, setBlink]         = useState(false);
  const [animKey, setAnimKey]     = useState(0); // forces re-animation on change
  const prevWord = useRef('');

  // Update gesture when word changes
  useEffect(() => {
    if (!isActive) { setGesture('idle'); return; }
    const g = getGesture(currentWord);
    if (g !== gesture || currentWord !== prevWord.current) {
      setGesture(g);
      setAnimKey(k => k + 1);
      prevWord.current = currentWord;
    }
  }, [currentWord, isActive, gesture]);

  // Blink every 3-5 seconds
  useEffect(() => {
    if (!isActive) return;
    const blinker = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(blinker);
  }, [isActive]);

  const pose = GESTURE_POSES[gesture] || GESTURE_POSES.idle;

  const armStyle = (side) => {
    const p = side === 'left' ? pose.leftArm : pose.rightArm;
    return {
      transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
      transform: `rotate(${p.rotate}) translate(${p.tx}, ${p.ty})`,
      transformOrigin: side === 'left' ? 'right top' : 'left top',
    };
  };

  return (
    <div
      className="flex flex-col items-center rounded-2xl overflow-hidden shadow-2xl border border-emerald-500/30"
      style={{
        width: 140,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
      }}
      aria-label="Sign Language Avatar"
      role="img"
    >
      {/* Avatar canvas */}
      <div
        className="relative"
        style={{ width: 140, height: 160 }}
        key={animKey}
      >
        {/* Glow ring */}
        <div
          className="absolute inset-0 rounded-full opacity-20 animate-pulse"
          style={{
            background: 'radial-gradient(circle at 50% 30%, #34d399, transparent 70%)',
          }}
        />

        {/* Head */}
        <div
          className="absolute rounded-full border-2 border-emerald-400"
          style={{
            width: 32, height: 32,
            left: '50%', top: 16,
            transform: 'translateX(-50%)',
            background: 'rgba(52,211,153,0.15)',
          }}
        >
          {/* Eyes */}
          <div className="absolute flex gap-1.5 justify-center w-full" style={{ top: 8 }}>
            <div style={{
              width: 6, height: blink ? 1 : 5,
              borderRadius: '50%',
              background: '#34d399',
              transition: 'height 0.05s',
            }} />
            <div style={{
              width: 6, height: blink ? 1 : 5,
              borderRadius: '50%',
              background: '#34d399',
              transition: 'height 0.05s',
            }} />
          </div>
          {/* Mouth */}
          <div className="absolute w-4 h-1.5 rounded-b-full border-b-2 border-emerald-400"
            style={{ bottom: 6, left: '50%', transform: 'translateX(-50%)' }}
          />
        </div>

        {/* Body / torso */}
        <div
          className="absolute bg-emerald-400/30 border border-emerald-400/50 rounded-lg"
          style={{ width: 28, height: 44, left: '50%', top: 56, transform: 'translateX(-50%)' }}
        />

        {/* Left arm */}
        <div
          className="absolute bg-emerald-400/60 rounded-full origin-right"
          style={{
            width: 38, height: 5,
            left: 18, top: 64,
            ...armStyle('left'),
          }}
        />

        {/* Right arm */}
        <div
          className="absolute bg-emerald-400/60 rounded-full"
          style={{
            width: 38, height: 5,
            right: 18, top: 64,
            ...armStyle('right'),
          }}
        />

        {/* Legs */}
        <div className="absolute flex gap-2 justify-center w-full" style={{ top: 104 }}>
          <div className="bg-emerald-400/40 rounded-full" style={{ width: 10, height: 36 }} />
          <div className="bg-emerald-400/40 rounded-full" style={{ width: 10, height: 36 }} />
        </div>

        {/* Status badge */}
        <div
          className="absolute bottom-2 left-0 right-0 flex justify-center"
        >
          <span className="text-[9px] font-mono text-emerald-400/60 tracking-widest">
            ASL MODEL
          </span>
        </div>
      </div>

      {/* Gesture label */}
      <div
        className="w-full text-center py-1.5 border-t border-emerald-500/30"
        style={{ background: 'rgba(52,211,153,0.1)' }}
        aria-live="polite"
      >
        <span className="text-emerald-300 font-bold tracking-widest text-xs">
          {pose.label}
        </span>
      </div>
    </div>
  );
}

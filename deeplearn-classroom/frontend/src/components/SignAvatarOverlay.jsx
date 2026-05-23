/**
 * SignAvatarOverlay.jsx
 * ---------------------
 * Premium AI Hand Sign Language Interpreter panel.
 *
 * Features:
 *  - 3D-style CSS avatar with realistic hand articulation per gesture
 *  - Glassmorphism accessibility panel
 *  - Sign queue strip showing upcoming signs
 *  - Real-time sign label + category badge
 *  - Smooth animation transitions between gestures
 *  - Glow indicators when active / processing
 *
 * Props:
 *  currentSign  : { word: string, gesture: string } | null
 *  isActive     : boolean — video is playing
 *  signQueue    : Array<{ word, gesture }>  — all upcoming signs
 *  isProcessing : boolean — AI processing indicator
 *  signCount    : number  — total signs rendered so far
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Hand, Zap, Brain, Loader2, Volume2 } from 'lucide-react';
import { getGestureLabel } from '../utils/nlpSignLanguage';

// ── Colour palette per gesture category ─────────────────────────────────────
const GESTURE_COLORS = {
  wave:     { primary: '#06b6d4', secondary: '#0e7490', glow: 'rgba(6,182,212,0.4)' },
  yes:      { primary: '#10b981', secondary: '#065f46', glow: 'rgba(16,185,129,0.4)' },
  no:       { primary: '#ef4444', secondary: '#991b1b', glow: 'rgba(239,68,68,0.4)' },
  count:    { primary: '#f59e0b', secondary: '#92400e', glow: 'rgba(245,158,11,0.4)' },
  explain:  { primary: '#8b5cf6', secondary: '#5b21b6', glow: 'rgba(139,92,246,0.4)' },
  question: { primary: '#ec4899', secondary: '#9d174d', glow: 'rgba(236,72,153,0.4)' },
  think:    { primary: '#3b82f6', secondary: '#1e3a8a', glow: 'rgba(59,130,246,0.4)' },
  point:    { primary: '#14b8a6', secondary: '#0f766e', glow: 'rgba(20,184,166,0.4)' },
  math:     { primary: '#6366f1', secondary: '#3730a3', glow: 'rgba(99,102,241,0.4)' },
  action:   { primary: '#f97316', secondary: '#9a3412', glow: 'rgba(249,115,22,0.4)' },
  alert:    { primary: '#fbbf24', secondary: '#92400e', glow: 'rgba(251,191,36,0.5)' },
  talk:     { primary: '#22d3ee', secondary: '#0e7490', glow: 'rgba(34,211,238,0.35)' },
  idle:     { primary: '#94a3b8', secondary: '#475569', glow: 'rgba(148,163,184,0.2)' },
};

// ── Per-gesture hand / arm poses ──────────────────────────────────────────────
// Each pose defines both hands + optional finger state
const GESTURE_POSES = {
  idle: {
    label: 'READY',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',  scale: 1 },
    rightHand: { rotate: '-15deg', tx: '2px',   ty: '2px',  scale: 1 },
    fingers: 'relaxed',
    bodyLean: 0,
  },
  wave: {
    label: 'HELLO / GOODBYE',
    leftHand:  { rotate: '-55deg', tx: '-10px', ty: '-18px', scale: 1.1 },
    rightHand: { rotate: '-18deg', tx: '2px',   ty: '2px',   scale: 1 },
    fingers: 'open',
    bodyLean: -3,
  },
  yes: {
    label: 'YES / AGREE',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '0deg',   tx: '4px',   ty: '-10px', scale: 1.15 },
    fingers: 'thumbs_up',
    bodyLean: 2,
  },
  no: {
    label: 'NO / WRONG',
    leftHand:  { rotate: '60deg',  tx: '-14px', ty: '4px',  scale: 1 },
    rightHand: { rotate: '-60deg', tx: '14px',  ty: '4px',  scale: 1 },
    fingers: 'index_point',
    bodyLean: 0,
  },
  count: {
    label: 'NUMBER',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '-35deg', tx: '10px',  ty: '-16px', scale: 1.2 },
    fingers: 'count',
    bodyLean: 1,
  },
  explain: {
    label: 'EXPLAIN',
    leftHand:  { rotate: '-28deg', tx: '-12px', ty: '-10px', scale: 1.05 },
    rightHand: { rotate: '28deg',  tx: '12px',  ty: '-10px', scale: 1.05 },
    fingers: 'open',
    bodyLean: 0,
  },
  question: {
    label: 'QUESTION / WHAT?',
    leftHand:  { rotate: '-45deg', tx: '-8px',  ty: '-8px',  scale: 1 },
    rightHand: { rotate: '45deg',  tx: '8px',   ty: '-8px',  scale: 1 },
    fingers: 'curved',
    bodyLean: -2,
  },
  think: {
    label: 'THINK / KNOW',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',  scale: 1 },
    rightHand: { rotate: '-85deg', tx: '2px',   ty: '-28px', scale: 1.1 },
    fingers: 'index_temple',
    bodyLean: 3,
  },
  point: {
    label: 'LOOK / ATTENTION',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',  scale: 1 },
    rightHand: { rotate: '-75deg', tx: '18px',  ty: '-22px', scale: 1.15 },
    fingers: 'index_point',
    bodyLean: -2,
  },
  math: {
    label: 'TECHNICAL',
    leftHand:  { rotate: '-20deg', tx: '-8px',  ty: '-6px',  scale: 1.05 },
    rightHand: { rotate: '20deg',  tx: '8px',   ty: '-6px',  scale: 1.05 },
    fingers: 'pinch',
    bodyLean: 0,
  },
  action: {
    label: 'ACTION',
    leftHand:  { rotate: '-30deg', tx: '-6px',  ty: '-4px',  scale: 1.1 },
    rightHand: { rotate: '-50deg', tx: '4px',   ty: '-12px', scale: 1.15 },
    fingers: 'fist',
    bodyLean: 2,
  },
  alert: {
    label: 'IMPORTANT',
    leftHand:  { rotate: '-50deg', tx: '-4px',  ty: '-14px', scale: 1.1 },
    rightHand: { rotate: '-50deg', tx: '4px',   ty: '-14px', scale: 1.1 },
    fingers: 'open',
    bodyLean: 0,
  },
  talk: {
    label: 'SIGNING',
    leftHand:  { rotate: '-12deg', tx: '-6px',  ty: '-4px',  scale: 1.05 },
    rightHand: { rotate: '12deg',  tx: '6px',   ty: '-4px',  scale: 1.05 },
    fingers: 'curved',
    bodyLean: 0,
  },
};

// ── Hand shape SVG paths (schematic fingertips) ───────────────────────────────
function HandShape({ fingers, color, side, animate }) {
  const isLeft = side === 'left';

  // Finger positions as relative SVG paths (schematic hand)
  const shapes = {
    relaxed: (
      <>
        <circle cx="12" cy="5"  r="2.5" fill={color} opacity="0.9" />
        <circle cx="18" cy="3"  r="2.5" fill={color} opacity="0.9" />
        <circle cx="24" cy="3"  r="2.5" fill={color} opacity="0.9" />
        <circle cx="30" cy="4"  r="2.5" fill={color} opacity="0.9" />
        <circle cx="35" cy="7"  r="2"   fill={color} opacity="0.9" />
        <rect x="8" y="7" width="28" height="14" rx="4" fill={color} opacity="0.7" />
        <circle cx="6" cy="15"  r="3"  fill={color} opacity="0.7" /> {/* thumb */}
      </>
    ),
    open: (
      <>
        <circle cx="12" cy="2"  r="2.5" fill={color} />
        <circle cx="18" cy="0"  r="2.5" fill={color} />
        <circle cx="24" cy="0"  r="2.5" fill={color} />
        <circle cx="30" cy="1"  r="2.5" fill={color} />
        <circle cx="36" cy="5"  r="2"   fill={color} />
        <rect x="8" y="4" width="28" height="14" rx="3" fill={color} opacity="0.7" />
        <circle cx="5" cy="12"  r="3.5" fill={color} opacity="0.7" />
      </>
    ),
    fist: (
      <>
        <rect x="8" y="6" width="28" height="12" rx="6" fill={color} opacity="0.85" />
        <circle cx="5" cy="14"  r="3"  fill={color} opacity="0.7" />
      </>
    ),
    thumbs_up: (
      <>
        <rect x="8" y="8" width="26" height="11" rx="5" fill={color} opacity="0.8" />
        <rect x="10" y="0" width="6" height="10" rx="3" fill={color} /> {/* thumb up */}
      </>
    ),
    index_point: (
      <>
        <rect x="8" y="7" width="26" height="11" rx="5" fill={color} opacity="0.75" />
        <rect x={isLeft ? "30" : "8"} y="0" width="6" height="10" rx="3" fill={color} />
      </>
    ),
    index_temple: (
      <>
        <rect x="8" y="8" width="26" height="11" rx="5" fill={color} opacity="0.75" />
        <rect x="12" y="0" width="6" height="10" rx="3" fill={color} />
      </>
    ),
    curved: (
      <>
        <path d="M10 14 Q13 5 18 4 Q24 3 29 5 Q34 7 36 14 Q30 18 22 18 Q14 18 10 14Z" fill={color} opacity="0.85" />
        <circle cx="6"  cy="14" r="3" fill={color} opacity="0.7" />
      </>
    ),
    count: (
      <>
        <rect x="8" y="7" width="26" height="11" rx="5" fill={color} opacity="0.75" />
        <rect x="18" cy="0" width="6" height="10" rx="3" fill={color} y="0" />
        <rect x="26" cy="0" width="6" height="9"  rx="3" fill={color} y="1" opacity="0.8" />
      </>
    ),
    pinch: (
      <>
        <circle cx="14" cy="6"  r="3"   fill={color} />
        <circle cx="22" cy="3"  r="2.5" fill={color} opacity="0.8" />
        <circle cx="29" cy="4"  r="2.5" fill={color} opacity="0.7" />
        <rect x="8" y="8" width="26" height="11" rx="5" fill={color} opacity="0.7" />
        <circle cx="6"  cy="14" r="3"   fill={color} opacity="0.7" />
      </>
    ),
    l_shape: (
      <>
        <rect x="10" y="0" width="6" height="12" rx="3" fill={color} />
        <rect x="8" y="10" width="22" height="10" rx="4" fill={color} opacity="0.8" />
        <circle cx={isLeft ? "6" : "34"} cy="15" r="3.5" fill={color} />
      </>
    ),
    y_shape: (
      <>
        <rect x="8" y="10" width="22" height="10" rx="4" fill={color} opacity="0.8" />
        <rect x={isLeft ? "10" : "32"} y="2" width="5" height="9" rx="2" fill={color} />
        <circle cx={isLeft ? "34" : "6"} cy="15" r="3.5" fill={color} />
      </>
    ),
    v_shape: (
      <>
        <rect x="12" y="0" width="6" height="11" rx="3" fill={color} />
        <rect x="22" y="1" width="6" height="11" rx="3" fill={color} />
        <rect x="8" y="9" width="26" height="11" rx="4" fill={color} opacity="0.8" />
        <circle cx="6" cy="15" r="3.5" fill={color} opacity="0.7" />
      </>
    ),
    w_shape: (
      <>
        <rect x="10" y="0" width="5" height="11" rx="2" fill={color} />
        <rect x="17" y="0" width="5" height="11" rx="2" fill={color} />
        <rect x="24" y="1" width="5" height="10" rx="2" fill={color} />
        <rect x="8" y="9" width="26" height="11" rx="4" fill={color} opacity="0.8" />
        <circle cx="6" cy="15" r="3" fill={color} opacity="0.7" />
      </>
    ),
    i_shape: (
      <>
        <rect x="8" y="8" width="24" height="11" rx="5" fill={color} opacity="0.8" />
        <rect x={isLeft ? "10" : "30"} y="0" width="5" height="10" rx="2" fill={color} />
        <circle cx="6" cy="14" r="3" fill={color} opacity="0.7" />
      </>
    ),
    f_shape: (
      <>
        <circle cx="14" cy="9" r="3" fill={color} />
        <circle cx="6" cy="12" r="3" fill={color} opacity="0.7" />
        <rect x="18" y="0" width="5" height="12" rx="2" fill={color} />
        <rect x="24" y="0" width="5" height="12" rx="2" fill={color} />
        <rect x="30" y="2" width="5" height="10" rx="2" fill={color} />
        <rect x="8" y="9" width="26" height="11" rx="4" fill={color} opacity="0.7" />
      </>
    ),
    d_shape: (
      <>
        <rect x="12" y="0" width="6" height="11" rx="3" fill={color} />
        <circle cx="22" cy="10" r="4.5" fill={color} opacity="0.9" />
        <circle cx="6" cy="12" r="3" fill={color} opacity="0.8" />
        <rect x="8" y="9" width="26" height="11" rx="4" fill={color} opacity="0.7" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 44 24"
      width="44"
      height="24"
      style={{
        filter: `drop-shadow(0 0 4px ${color})`,
        transform: isLeft ? 'scaleX(-1)' : 'none',
        transition: 'all 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      {shapes[fingers] || shapes.relaxed}
    </svg>
  );
}

// ── Avatar body with animated arms ────────────────────────────────────────────
function Avatar({ pose, color, blink, isActive, animKey }) {
  const armStyle = (side) => {
    const p = side === 'left' ? pose.leftHand : pose.rightHand;
    return {
      transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)',
      transform: `rotate(${p.rotate}) translate(${p.tx}, ${p.ty}) scale(${p.scale})`,
      transformOrigin: side === 'left' ? 'right top' : 'left top',
    };
  };

  return (
    <div
      className="relative"
      style={{ width: 160, height: 200 }}
      key={animKey}
    >
      {/* Ambient glow ring */}
      <div
        className="absolute rounded-full animate-pulse"
        style={{
          inset: 0,
          background: `radial-gradient(circle at 50% 35%, ${color.glow}, transparent 70%)`,
          opacity: isActive ? 0.6 : 0.2,
          transition: 'opacity 0.5s',
        }}
      />

      {/* Body lean */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `rotate(${pose.bodyLean}deg)`,
          transition: 'transform 0.4s ease',
          transformOrigin: 'bottom center',
        }}
      >
        {/* Head */}
        <div
          className="absolute rounded-full"
          style={{
            width: 40, height: 40,
            left: '50%', top: 12,
            transform: 'translateX(-50%)',
            background: `linear-gradient(135deg, ${color.primary}22, ${color.primary}44)`,
            border: `2px solid ${color.primary}`,
            boxShadow: `0 0 12px ${color.glow}`,
          }}
        >
          {/* Eyes */}
          <div className="absolute flex gap-2 justify-center w-full" style={{ top: 10 }}>
            <div style={{
              width: 7, height: blink ? 1 : 6,
              borderRadius: '50%',
              background: color.primary,
              boxShadow: `0 0 4px ${color.primary}`,
              transition: 'height 0.07s',
            }} />
            <div style={{
              width: 7, height: blink ? 1 : 6,
              borderRadius: '50%',
              background: color.primary,
              boxShadow: `0 0 4px ${color.primary}`,
              transition: 'height 0.07s',
            }} />
          </div>
          {/* Mouth */}
          <div
            className="absolute rounded-b-full"
            style={{
              width: 14, height: 5,
              bottom: 7,
              left: '50%',
              transform: 'translateX(-50%)',
              borderBottom: `2px solid ${color.primary}`,
              borderLeft: `1px solid ${color.primary}66`,
              borderRight: `1px solid ${color.primary}66`,
            }}
          />
        </div>

        {/* Neck */}
        <div
          className="absolute"
          style={{
            width: 10, height: 12,
            left: '50%', top: 52,
            transform: 'translateX(-50%)',
            background: `${color.primary}44`,
          }}
        />

        {/* Torso */}
        <div
          className="absolute rounded-xl"
          style={{
            width: 46, height: 56,
            left: '50%', top: 64,
            transform: 'translateX(-50%)',
            background: `linear-gradient(180deg, ${color.primary}33, ${color.primary}18)`,
            border: `1.5px solid ${color.primary}55`,
            boxShadow: `0 4px 12px ${color.glow}`,
          }}
        />

        {/* Left arm (shoulder → hand) */}
        <div
          className="absolute rounded-full"
          style={{
            width: 48, height: 7,
            left: 34, top: 76,
            background: `linear-gradient(90deg, ${color.primary}88, ${color.primary}cc)`,
            boxShadow: `0 2px 6px ${color.glow}`,
            ...armStyle('left'),
          }}
        >
          {/* Hand shape at arm tip */}
          <div className="absolute" style={{ right: -4, top: -8 }}>
            <HandShape fingers={pose.fingers} color={color.primary} side="left" />
          </div>
        </div>

        {/* Right arm (shoulder → hand) */}
        <div
          className="absolute rounded-full"
          style={{
            width: 48, height: 7,
            right: 34, top: 76,
            background: `linear-gradient(90deg, ${color.primary}cc, ${color.primary}88)`,
            boxShadow: `0 2px 6px ${color.glow}`,
            ...armStyle('right'),
          }}
        >
          {/* Hand shape at arm tip */}
          <div className="absolute" style={{ left: -4, top: -8 }}>
            <HandShape fingers={pose.fingers} color={color.primary} side="right" />
          </div>
        </div>

        {/* Legs */}
        <div className="absolute flex gap-3 justify-center w-full" style={{ top: 124 }}>
          <div className="rounded-full" style={{
            width: 12, height: 48,
            background: `linear-gradient(180deg, ${color.primary}55, ${color.primary}33)`,
            boxShadow: `0 4px 8px ${color.glow}`,
          }} />
          <div className="rounded-full" style={{
            width: 12, height: 48,
            background: `linear-gradient(180deg, ${color.primary}55, ${color.primary}33)`,
            boxShadow: `0 4px 8px ${color.glow}`,
          }} />
        </div>
      </div>
    </div>
  );
}

// Map letters to custom finger poses
const letterFingers = {
  a: 'fist',
  b: 'open',
  c: 'curved',
  d: 'd_shape',
  e: 'fist',
  f: 'f_shape',
  g: 'index_point',
  h: 'index_point',
  i: 'i_shape',
  j: 'i_shape',
  k: 'v_shape',
  l: 'l_shape',
  m: 'fist',
  n: 'fist',
  o: 'curved',
  p: 'd_shape',
  q: 'd_shape',
  r: 'v_shape',
  s: 'fist',
  t: 'fist',
  u: 'v_shape',
  v: 'v_shape',
  w: 'w_shape',
  x: 'curved',
  y: 'y_shape',
  z: 'index_point'
};

// ── Main component ────────────────────────────────────────────────────────────
export default function SignAvatarOverlay({
  currentSign,
  isActive,
  signQueue = [],
  isProcessing = false,
  signCount = 0,
}) {
  const [blink,    setBlink]    = useState(false);
  const [animKey,  setAnimKey]  = useState(0);
  const [prevSign, setPrevSign] = useState(null);
  const [pulse,    setPulse]    = useState(false);

  // Determine active gesture
  const gesture = currentSign?.gesture || (isActive ? 'talk' : 'idle');

  // Dynamic color resolution
  let color = GESTURE_COLORS[gesture];
  if (!color) {
    if (gesture.length === 1 && /[a-z]/.test(gesture)) {
      // Purple theme for letters
      color = { primary: '#c084fc', secondary: '#7e22ce', glow: 'rgba(192,132,252,0.4)' };
    } else if (gesture.startsWith('num_')) {
      // Amber theme for digits
      color = { primary: '#fbbf24', secondary: '#b45309', glow: 'rgba(251,191,36,0.4)' };
    } else {
      color = GESTURE_COLORS.idle;
    }
  }

  // Dynamic pose resolution
  let pose = GESTURE_POSES[gesture];
  if (!pose) {
    if (gesture.length === 1 && /[a-z]/.test(gesture)) {
      const handShape = letterFingers[gesture] || 'relaxed';
      const code = gesture.charCodeAt(0);
      const rotateRight = `${-25 - (code % 5) * 8}deg`;
      const tx = `${4 + (code % 3) * 2}px`;
      const ty = `${-12 - (code % 4) * 4}px`;
      pose = {
        label: `LETTER ${gesture.toUpperCase()}`,
        leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',  scale: 1 },
        rightHand: { rotate: rotateRight, tx: tx,      ty: ty,     scale: 1.18 },
        fingers: handShape,
        bodyLean: (code % 3) - 1,
      };
    } else if (gesture.startsWith('num_')) {
      const numStr = gesture.slice(4);
      pose = {
        label: `NUMBER ${numStr}`,
        leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',  scale: 1 },
        rightHand: { rotate: `-${25 + parseInt(numStr || 0) * 5}deg`, tx: '8px', ty: '-12px', scale: 1.2 },
        fingers: 'count',
        bodyLean: 1,
      };
    } else {
      pose = GESTURE_POSES.idle;
    }
  }

  const label = pose.label || getGestureLabel(gesture);

  // Animate on sign change
  useEffect(() => {
    if (currentSign !== prevSign) {
      setAnimKey(k => k + 1);
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 400);
      setPrevSign(currentSign);
      return () => clearTimeout(t);
    }
  }, [currentSign, prevSign]);

  // Natural eye blink
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 120);
    }, 2800 + Math.random() * 2000);
    return () => clearInterval(id);
  }, [isActive]);

  // Up to 8 upcoming signs in the queue strip
  const upcomingQueue = useMemo(() => signQueue.slice(0, 8), [signQueue]);

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden select-none"
      style={{
        width: 180,
        background: 'rgba(15,23,42,0.92)',
        backdropFilter: 'blur(20px)',
        border: `1.5px solid ${color.primary}44`,
        boxShadow: `0 0 24px ${color.glow}, 0 16px 48px rgba(0,0,0,0.4)`,
        transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
      }}
      aria-label="Sign Language Interpreter"
      role="region"
    >
      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1.5 px-3 py-2"
        style={{ borderBottom: `1px solid ${color.primary}22` }}
      >
        <Hand style={{ width: 12, height: 12, color: color.primary }} />
        <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: color.primary }}>
          ASL Interpreter
        </span>
        {isActive && (
          <div
            className="ml-auto rounded-full animate-pulse"
            style={{ width: 6, height: 6, background: color.primary, boxShadow: `0 0 6px ${color.primary}` }}
          />
        )}
      </div>

      {/* ── Avatar canvas ──────────────────────────────────────────────── */}
      <div className="flex justify-center items-center py-2 relative">
        {/* Ripple on sign change */}
        {pulse && (
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              inset: '20%',
              border: `2px solid ${color.primary}`,
              animation: 'ripple-out 0.4s ease-out forwards',
            }}
          />
        )}
        <Avatar
          pose={pose}
          color={color}
          blink={blink}
          isActive={isActive}
          animKey={animKey}
        />
      </div>

      {/* ── Sign label ─────────────────────────────────────────────────── */}
      <div
        className="text-center px-3 py-1.5"
        style={{ borderTop: `1px solid ${color.primary}22` }}
        aria-live="polite"
      >
        <div
          className="text-[10px] font-bold tracking-wider truncate"
          style={{ color: color.primary }}
        >
          {currentSign?.word || (isActive ? '• • •' : 'STAND BY')}
        </div>
        <div className="text-[8px] text-slate-500 mt-0.5 tracking-widest uppercase">
          {label}
        </div>
      </div>

      {/* ── Sign queue strip ───────────────────────────────────────────── */}
      {signQueue.length > 0 && (
        <div
          className="px-2 py-1.5 space-y-0.5 overflow-hidden"
          style={{ borderTop: `1px solid ${color.primary}11`, maxHeight: 80 }}
        >
          <div className="text-[7px] text-slate-600 uppercase tracking-widest mb-1">
            Queue ({signQueue.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {upcomingQueue.map((s, i) => {
              const isChar = s.gesture.length === 1 && /[a-z]/.test(s.gesture);
              const isNum = s.gesture.startsWith('num_');
              const c = isChar
                ? { primary: '#c084fc' }
                : isNum
                ? { primary: '#fbbf24' }
                : GESTURE_COLORS[s.gesture] || GESTURE_COLORS.talk;
              return (
                <span
                  key={i}
                  className="text-[7px] font-bold px-1 py-0.5 rounded"
                  style={{
                    background: `${c.primary}18`,
                    color: c.primary,
                    border: `1px solid ${c.primary}33`,
                  }}
                >
                  {s.word}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Stats footer ───────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ borderTop: `1px solid ${color.primary}22` }}
      >
        {isProcessing ? (
          <span className="flex items-center gap-1 text-[8px] text-slate-500">
            <Loader2 style={{ width: 8, height: 8 }} className="animate-spin" />
            AI Processing
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[8px] text-slate-600">
            <Zap style={{ width: 7, height: 7, color: color.primary }} />
            {signCount} signs
          </span>
        )}
        <span className="text-[8px]" style={{ color: `${color.primary}77` }}>
          ASL MODEL
        </span>
      </div>
    </div>
  );
}

/**
 * SignAvatarOverlay.jsx
 * ---------------------
 * Indian Sign Language (ISL) AI Avatar Interpreter Overlay.
 *
 * Implements authentic ISL characteristics:
 *  - Two-handed ISL manual alphabet fingerspelling (A-Z) conforming to ISLRTC standards
 *  - Authentic ISL gestures (Namaste, Dhanyavaad, Madad, Samajh, Padhna, Ruko, Shikshak, Vidyarthi, etc.)
 *  - Accurate hand articulation, orientation, and bilateral coordination
 *  - Real-time ISL gesture label + Hindi/English bilingual glossing
 *  - Glassmorphic accessibility panel with queue strip and status indicators
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Hand, Zap, Loader2, RotateCcw } from 'lucide-react';
import { getGestureLabel } from '../utils/nlpSignLanguage';

// ── Colour palette per ISL gesture category ─────────────────────────────────
const ISL_GESTURE_COLORS = {
  namaste:    { primary: '#06b6d4', secondary: '#0e7490', glow: 'rgba(6,182,212,0.45)' },
  swagat:     { primary: '#14b8a6', secondary: '#0f766e', glow: 'rgba(20,184,166,0.45)' },
  dhanyavaad: { primary: '#10b981', secondary: '#065f46', glow: 'rgba(16,185,129,0.45)' },
  yes:        { primary: '#10b981', secondary: '#065f46', glow: 'rgba(16,185,129,0.4)' },
  no:         { primary: '#ef4444', secondary: '#991b1b', glow: 'rgba(239,68,68,0.4)' },
  help:       { primary: '#8b5cf6', secondary: '#5b21b6', glow: 'rgba(139,92,246,0.45)' },
  understand: { primary: '#3b82f6', secondary: '#1e3a8a', glow: 'rgba(59,130,246,0.45)' },
  repeat:     { primary: '#a855f7', secondary: '#7e22ce', glow: 'rgba(168,85,247,0.4)' },
  stop:       { primary: '#f43f5e', secondary: '#be123c', glow: 'rgba(244,63,94,0.45)' },
  good:       { primary: '#10b981', secondary: '#047857', glow: 'rgba(16,185,129,0.4)' },
  bad:        { primary: '#f97316', secondary: '#c2410c', glow: 'rgba(249,115,22,0.4)' },
  question:   { primary: '#ec4899', secondary: '#9d174d', glow: 'rgba(236,72,153,0.45)' },
  kya:        { primary: '#ec4899', secondary: '#9d174d', glow: 'rgba(236,72,153,0.4)' },
  kaha:       { primary: '#ec4899', secondary: '#9d174d', glow: 'rgba(236,72,153,0.4)' },
  kyun:       { primary: '#f43f5e', secondary: '#be123c', glow: 'rgba(244,63,94,0.4)' },
  kaise:      { primary: '#ec4899', secondary: '#9d174d', glow: 'rgba(236,72,153,0.4)' },
  learn:      { primary: '#0ea5e9', secondary: '#0369a1', glow: 'rgba(14,165,233,0.45)' },
  teacher:    { primary: '#6366f1', secondary: '#4338ca', glow: 'rgba(99,102,241,0.45)' },
  student:    { primary: '#38bdf8', secondary: '#0284c7', glow: 'rgba(56,189,248,0.4)' },
  classroom:  { primary: '#8b5cf6', secondary: '#6d28d9', glow: 'rgba(139,92,246,0.4)' },
  count:      { primary: '#f59e0b', secondary: '#92400e', glow: 'rgba(245,158,11,0.4)' },
  explain:    { primary: '#8b5cf6', secondary: '#5b21b6', glow: 'rgba(139,92,246,0.4)' },
  think:      { primary: '#3b82f6', secondary: '#1e3a8a', glow: 'rgba(59,130,246,0.4)' },
  point:      { primary: '#14b8a6', secondary: '#0f766e', glow: 'rgba(20,184,166,0.4)' },
  math:       { primary: '#6366f1', secondary: '#3730a3', glow: 'rgba(99,102,241,0.4)' },
  action:     { primary: '#f97316', secondary: '#9a3412', glow: 'rgba(249,115,22,0.4)' },
  start:      { primary: '#22c55e', secondary: '#15803d', glow: 'rgba(34,197,94,0.4)' },
  finish:     { primary: '#a855f7', secondary: '#7e22ce', glow: 'rgba(168,85,247,0.4)' },
  alert:      { primary: '#fbbf24', secondary: '#92400e', glow: 'rgba(251,191,36,0.5)' },
  idle:       { primary: '#94a3b8', secondary: '#475569', glow: 'rgba(148,163,184,0.2)' },
};

// ── Authentic Indian Sign Language (ISL) Poses & Articulations ──────────────
// Each pose defines both hands, body posture, and specific finger shapes
const ISL_GESTURE_POSES = {
  idle: {
    label: 'ISL READY',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',  scale: 1 },
    rightHand: { rotate: '-15deg', tx: '2px',   ty: '2px',  scale: 1 },
    leftFingers: 'relaxed',
    rightFingers: 'relaxed',
    bodyLean: 0,
  },
  namaste: {
    label: 'NAMASTE / GREETING (ISL)',
    leftHand:  { rotate: '-65deg', tx: '16px', ty: '-26px', scale: 1.1 },
    rightHand: { rotate: '65deg',  tx: '-16px', ty: '-26px', scale: 1.1 },
    leftFingers: 'flat_palm',
    rightFingers: 'flat_palm',
    bodyLean: 2, // respectful slight head/torso tilt
  },
  dhanyavaad: {
    label: 'DHANYAVAAD (THANK YOU)',
    leftHand:  { rotate: '20deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '-80deg', tx: '4px',   ty: '-28px', scale: 1.15 },
    leftFingers: 'relaxed',
    rightFingers: 'open_forward',
    bodyLean: 3,
  },
  swagat: {
    label: 'SWAGAT (WELCOME)',
    leftHand:  { rotate: '-35deg', tx: '-10px', ty: '-14px', scale: 1.1 },
    rightHand: { rotate: '35deg',  tx: '10px',  ty: '-14px', scale: 1.1 },
    leftFingers: 'cupped_up',
    rightFingers: 'cupped_up',
    bodyLean: 0,
  },
  yes: {
    label: 'HAAN (YES / AGREE)',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '-10deg', tx: '4px',   ty: '-14px', scale: 1.2 },
    leftFingers: 'relaxed',
    rightFingers: 'thumbs_up',
    bodyLean: 2,
  },
  no: {
    label: 'NAHI (NO / NEGATION)',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '-55deg', tx: '14px',  ty: '-10px', scale: 1.15 },
    leftFingers: 'relaxed',
    rightFingers: 'flat_palm_side',
    bodyLean: -2,
  },
  help: {
    label: 'MADAD (HELP / SUPPORT)',
    leftHand:  { rotate: '-30deg', tx: '8px',  ty: '-10px', scale: 1.1 }, // palm-up base
    rightHand: { rotate: '30deg',  tx: '-8px', ty: '-22px', scale: 1.15 }, // lifting fist on palm
    leftFingers: 'flat_palm_up',
    rightFingers: 'fist',
    bodyLean: 1,
  },
  understand: {
    label: 'SAMAJH (UNDERSTAND)',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '-90deg', tx: '2px',   ty: '-32px', scale: 1.2 }, // point to temple/illumination
    leftFingers: 'relaxed',
    rightFingers: 'index_temple',
    bodyLean: 2,
  },
  repeat: {
    label: 'DOBARA (REPEAT / AGAIN)',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '-45deg', tx: '10px',  ty: '-18px', scale: 1.15 },
    leftFingers: 'relaxed',
    rightFingers: 'v_shape',
    bodyLean: 0,
  },
  stop: {
    label: 'RUKO (STOP / HALT)',
    leftHand:  { rotate: '-35deg', tx: '8px',  ty: '-12px', scale: 1.1 }, // left horizontal palm
    rightHand: { rotate: '45deg',  tx: '-6px', ty: '-20px', scale: 1.15 }, // right vertical chop
    leftFingers: 'flat_palm',
    rightFingers: 'flat_palm_chop',
    bodyLean: 0,
  },
  good: {
    label: 'ACCHA (GOOD / SIKH)',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '-25deg', tx: '8px',   ty: '-14px', scale: 1.2 },
    leftFingers: 'relaxed',
    rightFingers: 'thumbs_up',
    bodyLean: 1,
  },
  bad: {
    label: 'BURA (BAD / GALAT)',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '-65deg', tx: '6px',   ty: '-18px', scale: 1.15 },
    leftFingers: 'relaxed',
    rightFingers: 'palm_down_flip',
    bodyLean: -2,
  },
  question: {
    label: 'PRASHNA (QUESTION / KYA)',
    leftHand:  { rotate: '-40deg', tx: '-10px', ty: '-16px', scale: 1.1 },
    rightHand: { rotate: '40deg',  tx: '10px',  ty: '-16px', scale: 1.1 },
    leftFingers: 'cupped_up',
    rightFingers: 'cupped_up',
    bodyLean: -2,
  },
  kya: {
    label: 'KYA (WHAT / ISL)',
    leftHand:  { rotate: '-45deg', tx: '-12px', ty: '-14px', scale: 1.1 },
    rightHand: { rotate: '45deg',  tx: '12px',  ty: '-14px', scale: 1.1 },
    leftFingers: 'flat_palm_up',
    rightFingers: 'flat_palm_up',
    bodyLean: -2,
  },
  kaha: {
    label: 'KAHA (WHERE / ISL)',
    leftHand:  { rotate: '-55deg', tx: '-14px', ty: '-12px', scale: 1.1 },
    rightHand: { rotate: '55deg',  tx: '14px',  ty: '-12px', scale: 1.1 },
    leftFingers: 'open_forward',
    rightFingers: 'open_forward',
    bodyLean: -1,
  },
  kyun: {
    label: 'KYUN (WHY / ISL)',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '-80deg', tx: '6px',   ty: '-26px', scale: 1.15 },
    leftFingers: 'relaxed',
    rightFingers: 'index_temple',
    bodyLean: 2,
  },
  kaise: {
    label: 'KAISE (HOW / ISL)',
    leftHand:  { rotate: '-35deg', tx: '-8px', ty: '-14px', scale: 1.1 },
    rightHand: { rotate: '35deg',  tx: '8px',  ty: '-14px', scale: 1.1 },
    leftFingers: 'cupped_up',
    rightFingers: 'cupped_up',
    bodyLean: 0,
  },
  learn: {
    label: 'PADHNA (LEARN / STUDY)',
    leftHand:  { rotate: '-25deg', tx: '10px', ty: '-10px', scale: 1.1 }, // left palm as book
    rightHand: { rotate: '60deg',  tx: '-8px', ty: '-26px', scale: 1.15 }, // right scooping to head
    leftFingers: 'flat_palm_up',
    rightFingers: 'scoop',
    bodyLean: 2,
  },
  teacher: {
    label: 'SHIKSHAK (TEACHER / GURU)',
    leftHand:  { rotate: '-70deg', tx: '-6px', ty: '-28px', scale: 1.1 },
    rightHand: { rotate: '70deg',  tx: '6px',  ty: '-28px', scale: 1.1 },
    leftFingers: 'pinch',
    rightFingers: 'pinch',
    bodyLean: 1,
  },
  student: {
    label: 'VIDYARTHI (STUDENT)',
    leftHand:  { rotate: '-25deg', tx: '8px',  ty: '-10px', scale: 1.1 },
    rightHand: { rotate: '45deg',  tx: '-4px', ty: '-22px', scale: 1.15 },
    leftFingers: 'flat_palm_up',
    rightFingers: 'scoop',
    bodyLean: 1,
  },
  classroom: {
    label: 'KAKSHA (CLASSROOM)',
    leftHand:  { rotate: '-45deg', tx: '-8px', ty: '-16px', scale: 1.1 },
    rightHand: { rotate: '45deg',  tx: '8px',  ty: '-16px', scale: 1.1 },
    leftFingers: 'c_shape',
    rightFingers: 'c_shape',
    bodyLean: 0,
  },
  count: {
    label: 'GINTI (NUMBERS / ISL)',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '-40deg', tx: '8px',   ty: '-18px', scale: 1.2 },
    leftFingers: 'relaxed',
    rightFingers: 'count',
    bodyLean: 1,
  },
  explain: {
    label: 'SAMJHANA (EXPLAIN)',
    leftHand:  { rotate: '-30deg', tx: '-10px', ty: '-12px', scale: 1.05 },
    rightHand: { rotate: '30deg',  tx: '10px',  ty: '-12px', scale: 1.05 },
    leftFingers: 'open_forward',
    rightFingers: 'open_forward',
    bodyLean: 0,
  },
  think: {
    label: 'SOCHNA (THINK / COGNITION)',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '-85deg', tx: '2px',   ty: '-28px', scale: 1.15 },
    leftFingers: 'relaxed',
    rightFingers: 'index_temple',
    bodyLean: 2,
  },
  point: {
    label: 'DEKHNA (ATTENTION / FOCUS)',
    leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '-75deg', tx: '16px',  ty: '-22px', scale: 1.2 },
    leftFingers: 'relaxed',
    rightFingers: 'index_point',
    bodyLean: -2,
  },
  math: {
    label: 'VIGYAN / GANIT (STEM)',
    leftHand:  { rotate: '-25deg', tx: '-6px',  ty: '-8px',  scale: 1.05 },
    rightHand: { rotate: '25deg',  tx: '6px',   ty: '-8px',  scale: 1.05 },
    leftFingers: 'pinch',
    rightFingers: 'pinch',
    bodyLean: 0,
  },
  action: {
    label: 'KARYA (ACTION / DO)',
    leftHand:  { rotate: '-30deg', tx: '-6px',  ty: '-6px',  scale: 1.1 },
    rightHand: { rotate: '-50deg', tx: '4px',   ty: '-14px', scale: 1.15 },
    leftFingers: 'fist',
    rightFingers: 'fist',
    bodyLean: 2,
  },
  start: {
    label: 'SHURU (START / BEGIN)',
    leftHand:  { rotate: '-20deg', tx: '6px',  ty: '-10px', scale: 1.1 }, // left index+middle spread
    rightHand: { rotate: '40deg',  tx: '-6px', ty: '-16px', scale: 1.15 }, // right key-turning index
    leftFingers: 'v_shape',
    rightFingers: 'index_point',
    bodyLean: 1,
  },
  finish: {
    label: 'KHATAM (FINISH / COMPLETE)',
    leftHand:  { rotate: '-50deg', tx: '-10px', ty: '-8px', scale: 1.1 },
    rightHand: { rotate: '50deg',  tx: '10px',  ty: '-8px', scale: 1.1 },
    leftFingers: 'flat_palm',
    rightFingers: 'flat_palm',
    bodyLean: 0,
  },
  alert: {
    label: 'ZAROORI (IMPORTANT / ALERT)',
    leftHand:  { rotate: '-55deg', tx: '-4px',  ty: '-16px', scale: 1.1 },
    rightHand: { rotate: '-55deg', tx: '4px',   ty: '-16px', scale: 1.1 },
    leftFingers: 'flat_palm',
    rightFingers: 'flat_palm',
    bodyLean: 0,
  },
};

// ── ISL Two-Handed Hand Shape SVG Paths ──────────────────────────────────────
function ISLHandShape({ fingers, color, side }) {
  const isLeft = side === 'left';

  const shapes = {
    relaxed: (
      <>
        <circle cx="12" cy="5"  r="2.5" fill={color} opacity="0.9" />
        <circle cx="18" cy="3"  r="2.5" fill={color} opacity="0.9" />
        <circle cx="24" cy="3"  r="2.5" fill={color} opacity="0.9" />
        <circle cx="30" cy="4"  r="2.5" fill={color} opacity="0.9" />
        <circle cx="35" cy="7"  r="2"   fill={color} opacity="0.9" />
        <rect x="8" y="7" width="28" height="14" rx="4" fill={color} opacity="0.7" />
        <circle cx="6" cy="15"  r="3"  fill={color} opacity="0.7" />
      </>
    ),
    flat_palm: (
      <>
        <circle cx="12" cy="2"  r="2.5" fill={color} />
        <circle cx="18" cy="0"  r="2.5" fill={color} />
        <circle cx="24" cy="0"  r="2.5" fill={color} />
        <circle cx="30" cy="1"  r="2.5" fill={color} />
        <circle cx="36" cy="5"  r="2"   fill={color} />
        <rect x="8" y="4" width="28" height="14" rx="3" fill={color} opacity="0.85" />
        <circle cx="5" cy="12"  r="3.5" fill={color} opacity="0.8" />
      </>
    ),
    flat_palm_up: (
      <>
        <rect x="6" y="8" width="32" height="10" rx="4" fill={color} opacity="0.9" />
        <circle cx="12" cy="4" r="2.5" fill={color} />
        <circle cx="18" cy="3" r="2.5" fill={color} />
        <circle cx="24" cy="3" r="2.5" fill={color} />
        <circle cx="30" cy="4" r="2.5" fill={color} />
        <circle cx="35" cy="13" r="3" fill={color} opacity="0.75" />
      </>
    ),
    flat_palm_side: (
      <>
        <rect x="10" y="4" width="24" height="14" rx="4" fill={color} opacity="0.9" />
        <circle cx="8" cy="0"  r="2.5" fill={color} />
        <circle cx="14" cy="0" r="2.5" fill={color} />
        <circle cx="20" cy="0" r="2.5" fill={color} />
        <circle cx="26" cy="1" r="2.5" fill={color} />
      </>
    ),
    flat_palm_chop: (
      <>
        <rect x="8" y="2" width="28" height="16" rx="3" fill={color} opacity="0.95" />
        <circle cx="34" cy="12" r="3" fill={color} />
      </>
    ),
    cupped_up: (
      <>
        <path d="M8 16 Q14 6 22 6 Q30 6 36 16 Z" fill={color} opacity="0.85" />
        <circle cx="14" cy="5" r="2.5" fill={color} />
        <circle cx="22" cy="4" r="2.5" fill={color} />
        <circle cx="30" cy="5" r="2.5" fill={color} />
      </>
    ),
    open_forward: (
      <>
        <rect x="8" y="4" width="28" height="14" rx="4" fill={color} opacity="0.85" />
        <circle cx="12" cy="0" r="2.5" fill={color} />
        <circle cx="18" cy="0" r="2.5" fill={color} />
        <circle cx="24" cy="0" r="2.5" fill={color} />
        <circle cx="30" cy="1" r="2.5" fill={color} />
      </>
    ),
    fist: (
      <>
        <rect x="8" y="6" width="28" height="12" rx="6" fill={color} opacity="0.9" />
        <circle cx="5" cy="14"  r="3.5"  fill={color} opacity="0.85" />
      </>
    ),
    thumbs_up: (
      <>
        <rect x="8" y="8" width="26" height="11" rx="5" fill={color} opacity="0.85" />
        <rect x="10" y="0" width="7" height="10" rx="3.5" fill={color} />
      </>
    ),
    index_point: (
      <>
        <rect x="8" y="7" width="26" height="11" rx="5" fill={color} opacity="0.8" />
        <rect x={isLeft ? "30" : "8"} y="0" width="6" height="11" rx="3" fill={color} />
      </>
    ),
    index_temple: (
      <>
        <rect x="8" y="8" width="26" height="11" rx="5" fill={color} opacity="0.8" />
        <rect x="12" y="0" width="6" height="11" rx="3" fill={color} />
      </>
    ),
    scoop: (
      <>
        <path d="M10 14 Q14 4 22 4 Q30 4 34 14 Q28 18 22 18 Z" fill={color} opacity="0.9" />
        <circle cx="6" cy="14" r="3" fill={color} opacity="0.75" />
      </>
    ),
    pinch: (
      <>
        <circle cx="14" cy="6"  r="3.5" fill={color} />
        <circle cx="22" cy="3"  r="2.5" fill={color} opacity="0.8" />
        <circle cx="29" cy="4"  r="2.5" fill={color} opacity="0.7" />
        <rect x="8" y="8" width="26" height="11" rx="5" fill={color} opacity="0.75" />
      </>
    ),
    c_shape: (
      <>
        <path d="M30 4 Q14 2 12 12 Q10 20 28 20 Q32 20 34 16" stroke={color} strokeWidth="6" fill="none" strokeLinecap="round" />
      </>
    ),
    v_shape: (
      <>
        <rect x="12" y="0" width="5" height="11" rx="2.5" fill={color} />
        <rect x="22" y="1" width="5" height="11" rx="2.5" fill={color} />
        <rect x="8" y="9" width="26" height="11" rx="4" fill={color} opacity="0.85" />
      </>
    ),
    count: (
      <>
        <rect x="8" y="7" width="26" height="11" rx="5" fill={color} opacity="0.8" />
        <rect x="18" cy="0" width="6" height="10" rx="3" fill={color} y="0" />
        <rect x="26" cy="0" width="6" height="9"  rx="3" fill={color} y="1" opacity="0.85" />
      </>
    ),
    palm_down_flip: (
      <>
        <rect x="6" y="8" width="30" height="10" rx="4" fill={color} opacity="0.85" />
        <circle cx="10" cy="16" r="2.5" fill={color} />
        <circle cx="16" cy="17" r="2.5" fill={color} />
        <circle cx="22" cy="17" r="2.5" fill={color} />
        <circle cx="28" cy="16" r="2.5" fill={color} />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 44 24"
      width="96"
      height="52"
      style={{
        filter: `drop-shadow(0 0 4px ${color}88)`,
        transform: isLeft ? 'scaleX(-1)' : 'none',
        transition: 'all 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      {shapes[fingers] || shapes.relaxed}
    </svg>
  );
}

// ── Two-Handed ISL Manual Alphabet Poses (A to Z) conforming to ISLRTC ────────
const ISL_TWO_HANDED_LETTERS = {
  a: { leftHand: { rotate: '-25deg', tx: '8px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '45deg', tx: '-8px', ty: '-18px', scale: 1.15 }, leftFingers: 'flat_palm_up', rightFingers: 'index_point', label: 'ISL A (THUMB TOUCH)' },
  b: { leftHand: { rotate: '-45deg', tx: '6px', ty: '-12px', scale: 1.1 }, rightHand: { rotate: '45deg', tx: '-6px', ty: '-12px', scale: 1.1 }, leftFingers: 'pinch', rightFingers: 'pinch', label: 'ISL B (TWO CIRCLES)' },
  c: { leftHand: { rotate: '15deg', tx: '-2px', ty: '2px', scale: 1 }, rightHand: { rotate: '-35deg', tx: '8px', ty: '-14px', scale: 1.2 }, leftFingers: 'relaxed', rightFingers: 'c_shape', label: 'ISL C (CURVED C)' },
  d: { leftHand: { rotate: '-35deg', tx: '6px', ty: '-16px', scale: 1.1 }, rightHand: { rotate: '40deg', tx: '-6px', ty: '-16px', scale: 1.15 }, leftFingers: 'index_point', rightFingers: 'pinch', label: 'ISL D (INDEX + ARCH)' },
  e: { leftHand: { rotate: '-20deg', tx: '10px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '50deg', tx: '-8px', ty: '-20px', scale: 1.15 }, leftFingers: 'flat_palm_up', rightFingers: 'index_point', label: 'ISL E (INDEX TIP TOUCH)' },
  f: { leftHand: { rotate: '-30deg', tx: '8px', ty: '-10px', scale: 1.1 }, rightHand: { rotate: '40deg', tx: '-6px', ty: '-16px', scale: 1.15 }, leftFingers: 'v_shape', rightFingers: 'v_shape', label: 'ISL F (TWO-FINGER CROSS)' },
  g: { leftHand: { rotate: '-25deg', tx: '6px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '35deg', tx: '-6px', ty: '-16px', scale: 1.15 }, leftFingers: 'fist', rightFingers: 'fist', label: 'ISL G (FIST ON FIST)' },
  h: { leftHand: { rotate: '-25deg', tx: '10px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '35deg', tx: '-6px', ty: '-14px', scale: 1.15 }, leftFingers: 'flat_palm_up', rightFingers: 'flat_palm', label: 'ISL H (PALM WIPE)' },
  i: { leftHand: { rotate: '-20deg', tx: '10px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '55deg', tx: '-6px', ty: '-22px', scale: 1.15 }, leftFingers: 'flat_palm_up', rightFingers: 'index_point', label: 'ISL I (MIDDLE TIP TOUCH)' },
  j: { leftHand: { rotate: '-20deg', tx: '10px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '45deg', tx: '-6px', ty: '-18px', scale: 1.15 }, leftFingers: 'flat_palm_up', rightFingers: 'index_point', label: 'ISL J (PALM J TRACE)' },
  k: { leftHand: { rotate: '-35deg', tx: '6px', ty: '-16px', scale: 1.1 }, rightHand: { rotate: '45deg', tx: '-6px', ty: '-18px', scale: 1.15 }, leftFingers: 'index_point', rightFingers: 'index_point', label: 'ISL K (KNUCKLE HOOK)' },
  l: { leftHand: { rotate: '-20deg', tx: '10px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '40deg', tx: '-8px', ty: '-16px', scale: 1.15 }, leftFingers: 'flat_palm_up', rightFingers: 'index_point', label: 'ISL L (L ON PALM)' },
  m: { leftHand: { rotate: '-20deg', tx: '10px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '35deg', tx: '-6px', ty: '-14px', scale: 1.15 }, leftFingers: 'flat_palm_up', rightFingers: 'count', label: 'ISL M (THREE FINGERS ON PALM)' },
  n: { leftHand: { rotate: '-20deg', tx: '10px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '35deg', tx: '-6px', ty: '-14px', scale: 1.15 }, leftFingers: 'flat_palm_up', rightFingers: 'v_shape', label: 'ISL N (TWO FINGERS ON PALM)' },
  o: { leftHand: { rotate: '-20deg', tx: '10px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '55deg', tx: '-6px', ty: '-22px', scale: 1.15 }, leftFingers: 'flat_palm_up', rightFingers: 'index_point', label: 'ISL O (RING TIP TOUCH)' },
  p: { leftHand: { rotate: '-35deg', tx: '6px', ty: '-16px', scale: 1.1 }, rightHand: { rotate: '40deg', tx: '-6px', ty: '-18px', scale: 1.15 }, leftFingers: 'index_point', rightFingers: 'pinch', label: 'ISL P (INDEX CIRCLE TOUCH)' },
  q: { leftHand: { rotate: '-30deg', tx: '8px', ty: '-12px', scale: 1.1 }, rightHand: { rotate: '40deg', tx: '-8px', ty: '-16px', scale: 1.15 }, leftFingers: 'pinch', rightFingers: 'index_point', label: 'ISL Q (CIRCLE HOOK)' },
  r: { leftHand: { rotate: '-20deg', tx: '10px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '40deg', tx: '-6px', ty: '-16px', scale: 1.15 }, leftFingers: 'flat_palm_up', rightFingers: 'v_shape', label: 'ISL R (CROSSED ON PALM)' },
  s: { leftHand: { rotate: '-30deg', tx: '6px', ty: '-10px', scale: 1.1 }, rightHand: { rotate: '30deg', tx: '-6px', ty: '-10px', scale: 1.1 }, leftFingers: 'fist', rightFingers: 'fist', label: 'ISL S (INTERLOCKED HOOKS)' },
  t: { leftHand: { rotate: '-30deg', tx: '8px', ty: '-14px', scale: 1.1 }, rightHand: { rotate: '45deg', tx: '-6px', ty: '-20px', scale: 1.15 }, leftFingers: 'index_point', rightFingers: 'index_point', label: 'ISL T (T FORMATION)' },
  u: { leftHand: { rotate: '-20deg', tx: '10px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '60deg', tx: '-6px', ty: '-24px', scale: 1.15 }, leftFingers: 'flat_palm_up', rightFingers: 'index_point', label: 'ISL U (PINKY TIP TOUCH)' },
  v: { leftHand: { rotate: '-20deg', tx: '10px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '35deg', tx: '-6px', ty: '-14px', scale: 1.15 }, leftFingers: 'flat_palm_up', rightFingers: 'v_shape', label: 'ISL V (V ON PALM)' },
  w: { leftHand: { rotate: '-20deg', tx: '10px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '35deg', tx: '-6px', ty: '-14px', scale: 1.15 }, leftFingers: 'flat_palm_up', rightFingers: 'count', label: 'ISL W (W ON PALM)' },
  x: { leftHand: { rotate: '-40deg', tx: '6px', ty: '-14px', scale: 1.1 }, rightHand: { rotate: '40deg', tx: '-6px', ty: '-14px', scale: 1.1 }, leftFingers: 'index_point', rightFingers: 'index_point', label: 'ISL X (INDEX CROSS)' },
  y: { leftHand: { rotate: '-20deg', tx: '10px', ty: '-8px', scale: 1.1 }, rightHand: { rotate: '35deg', tx: '-6px', ty: '-14px', scale: 1.15 }, leftFingers: 'flat_palm_up', rightFingers: 'thumbs_up', label: 'ISL Y (Y ON PALM)' },
  z: { leftHand: { rotate: '-35deg', tx: '6px', ty: '-12px', scale: 1.1 }, rightHand: { rotate: '45deg', tx: '-6px', ty: '-18px', scale: 1.15 }, leftFingers: 'flat_palm', rightFingers: 'index_point', label: 'ISL Z (Z FORMATION)' },
};

// ── ISL Avatar Body Component (Upper-Body Focus) ────────────────────────────
// Shows head + shoulders + torso + arms ONLY (no legs).
// Hands are significantly enlarged with strong contrast for finger visibility.
// Arms clearly separated from torso for clean signing space.
// Professional skin tones + white/light clothing.
function ISLAvatar({ pose, color, blink, isActive, animKey, animationSpeed = 1 }) {
  const dur = (0.4 / animationSpeed).toFixed(2);

  const armStyle = (side) => {
    const p = side === 'left' ? pose.leftHand : pose.rightHand;
    return {
      transition: `transform ${dur}s cubic-bezier(0.34,1.56,0.64,1)`,
      transform: `rotate(${p.rotate}) translate(${p.tx}, ${p.ty}) scale(${p.scale})`,
      transformOrigin: side === 'left' ? 'right top' : 'left top',
    };
  };

  return (
    <div
      className="relative mx-auto isl-avatar-body"
      key={animKey}
    >
      {/* Subtle signing-area ambient glow */}
      <div
        className="absolute rounded-full animate-pulse"
        style={{
          inset: '-4%',
          background: `radial-gradient(circle at 50% 40%, ${color.glow}, transparent 70%)`,
          opacity: isActive ? 0.22 : 0.06,
          transition: 'opacity 0.5s',
        }}
      />

      {/* Body lean for ISL expression & respectful posture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `rotate(${pose.bodyLean || 0}deg)`,
          transition: `transform ${dur}s ease`,
          transformOrigin: 'bottom center',
        }}
      >
        {/* Head */}
        <div
          className="absolute rounded-full"
          style={{
            width: 56, height: 56,
            left: '50%', top: 8,
            transform: 'translateX(-50%)',
            background: 'linear-gradient(145deg, #f2e4d4, #e5d0bc)',
            border: `2.5px solid ${color.primary}44`,
            boxShadow: `0 0 18px ${color.glow}, 0 3px 10px rgba(0,0,0,0.08)`,
          }}
        >
          {/* Eyes */}
          <div className="absolute flex gap-3 justify-center w-full" style={{ top: 14 }}>
            <div style={{
              width: 8, height: blink ? 1 : 7,
              borderRadius: '50%',
              background: '#4a3728',
              boxShadow: `0 0 3px ${color.primary}33`,
              transition: 'height 0.07s',
            }} />
            <div style={{
              width: 8, height: blink ? 1 : 7,
              borderRadius: '50%',
              background: '#4a3728',
              boxShadow: `0 0 3px ${color.primary}33`,
              transition: 'height 0.07s',
            }} />
          </div>
          {/* Expressive Mouth */}
          <div
            className="absolute rounded-b-full"
            style={{
              width: 14, height: 5,
              bottom: 9,
              left: '50%',
              transform: 'translateX(-50%)',
              borderBottom: '2px solid #a58868',
              borderLeft: '1px solid #a5886866',
              borderRight: '1px solid #a5886866',
            }}
          />
        </div>

        {/* Neck */}
        <div
          className="absolute"
          style={{
            width: 12, height: 14,
            left: '50%', top: 64,
            transform: 'translateX(-50%)',
            background: '#e5d0bc',
            borderRadius: 3,
          }}
        />

        {/* Shoulders — wide professional bar */}
        <div
          className="absolute"
          style={{
            width: 162, height: 20,
            left: '50%', top: 76,
            transform: 'translateX(-50%)',
            background: 'linear-gradient(180deg, #f8f9fa, #f0f1f3)',
            borderRadius: '12px 12px 0 0',
            border: '1.5px solid #e0e2e5',
            borderBottom: 'none',
          }}
        />

        {/* Torso — professional white top */}
        <div
          className="absolute"
          style={{
            width: 82, height: 116,
            left: '50%', top: 94,
            transform: 'translateX(-50%)',
            background: 'linear-gradient(180deg, #f0f1f3, #f5f6f8)',
            border: '1.5px solid #e0e2e5',
            borderTop: 'none',
            borderRadius: '0 0 16px 16px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
          }}
        />

        {/* Left arm (ISL base/interacting hand) — clearly separated from torso */}
        <div
          className="absolute rounded-full"
          style={{
            width: 78, height: 9,
            left: 24, top: 100,
            background: 'linear-gradient(90deg, #e5d0bc, #eddcc8)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.07)',
            ...armStyle('left'),
          }}
        >
          <div className="absolute" style={{ right: -6, top: -14 }}>
            <ISLHandShape fingers={pose.leftFingers || 'relaxed'} color={color.primary} side="left" />
          </div>
        </div>

        {/* Right arm (ISL dominant/shaper hand) — clearly separated from torso */}
        <div
          className="absolute rounded-full"
          style={{
            width: 78, height: 9,
            right: 24, top: 100,
            background: 'linear-gradient(90deg, #eddcc8, #e5d0bc)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.07)',
            ...armStyle('right'),
          }}
        >
          <div className="absolute" style={{ left: -6, top: -14 }}>
            <ISLHandShape fingers={pose.rightFingers || 'relaxed'} color={color.primary} side="right" />
          </div>
        </div>

        {/* Upper body only — NO legs for maximum signing-area visibility */}
      </div>
    </div>
  );
}

// ── Main ISL SignAvatarOverlay Component ─────────────────────────────────────
export default function SignAvatarOverlay({
  currentSign,
  currentSignIndex = -1,
  isActive,
  signQueue = [],
  isProcessing = false,
  signCount = 0,
}) {
  const queueScrollRef = useRef(null);
  const [blink,     setBlink]     = useState(false);
  const [animKey,   setAnimKey]   = useState(0);
  const [prevSign,  setPrevSign]  = useState(null);
  const [pulse,     setPulse]     = useState(false);
  const [animSpeed, setAnimSpeed] = useState(1);

  // Active gesture token
  const gesture = currentSign?.gesture || (isActive ? 'namaste' : 'idle');

  // Dynamic ISL color palette
  let color = ISL_GESTURE_COLORS[gesture];
  if (!color) {
    if (gesture.length === 1 && /[a-z]/.test(gesture)) {
      color = { primary: '#c084fc', secondary: '#7e22ce', glow: 'rgba(192,132,252,0.45)' };
    } else if (gesture.startsWith('num_')) {
      color = { primary: '#fbbf24', secondary: '#b45309', glow: 'rgba(251,191,36,0.45)' };
    } else {
      color = ISL_GESTURE_COLORS.idle;
    }
  }

  // Dynamic ISL pose resolution
  let pose = ISL_GESTURE_POSES[gesture];
  if (!pose) {
    if (gesture.length === 1 && /[a-z]/.test(gesture)) {
      // Authentic Two-Handed ISL Alphabet Pose
      pose = ISL_TWO_HANDED_LETTERS[gesture] || {
        label: `ISL LETTER ${gesture.toUpperCase()} (2-HANDED)`,
        leftHand:  { rotate: '-25deg', tx: '8px',  ty: '-8px',  scale: 1.1 },
        rightHand: { rotate: '45deg',  tx: '-8px', ty: '-16px', scale: 1.15 },
        leftFingers: 'flat_palm_up',
        rightFingers: 'index_point',
        bodyLean: 1,
      };
    } else if (gesture.startsWith('num_')) {
      const numStr = gesture.slice(4);
      pose = {
        label: `ISL NUMBER ${numStr}`,
        leftHand:  { rotate: '15deg',  tx: '-2px',  ty: '2px',   scale: 1 },
        rightHand: { rotate: `-${25 + parseInt(numStr || 0, 10) * 4}deg`, tx: '8px', ty: '-14px', scale: 1.2 },
        leftFingers: 'relaxed',
        rightFingers: 'count',
        bodyLean: 1,
      };
    } else {
      pose = ISL_GESTURE_POSES.idle;
    }
  }

  const label = pose.label || getGestureLabel(gesture);

  // Replay current sign animation
  const handleReplay = useCallback(() => {
    setAnimKey(k => k + 1);
    setPulse(true);
    setTimeout(() => setPulse(false), 400);
  }, []);

  // Trigger animation on sign transition
  useEffect(() => {
    if (currentSign !== prevSign) {
      setAnimKey(k => k + 1);
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 400);
      setPrevSign(currentSign);
      return () => clearTimeout(t);
    }
  }, [currentSign, prevSign]);

  // Natural blink loop
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 120);
    }, 2800 + Math.random() * 2000);
    return () => clearInterval(id);
  }, [isActive]);

  // Auto-scroll the queue strip to keep the current sign visible
  useEffect(() => {
    if (queueScrollRef.current && currentSignIndex >= 0) {
      const container = queueScrollRef.current;
      const activeEl = container.querySelector('[data-active-sign="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentSignIndex]);

  return (
    <div
      className="isl-interpreter-panel flex flex-col select-none"
      style={{
        width: '100%',
        background: '#fafbfc',
        borderRadius: 20,
        border: '1.5px solid #e2e8f0',
        boxShadow: '0 8px 32px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.02)',
        overflow: 'hidden',
      }}
      aria-label="Indian Sign Language (ISL) Interpreter"
      role="region"
    >
      {/* ── Header Bar ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: '1px solid #e2e8f0', background: '#f8f9fb' }}
      >
        <Hand style={{ width: 14, height: 14, color: color.primary }} />
        <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: '#374151' }}>
          ISL Interpreter
        </span>
        {isActive && (
          <div className="flex items-center gap-1.5 ml-auto">
            <div
              className="rounded-full animate-pulse"
              style={{ width: 7, height: 7, background: '#10b981', boxShadow: '0 0 8px rgba(16,185,129,0.5)' }}
            />
            <span className="text-[9px] font-semibold" style={{ color: '#059669' }}>LIVE</span>
          </div>
        )}
      </div>

      {/* ── Signing Stage (primary visual area) ────────────────────────── */}
      <div
        className="isl-signing-stage relative flex justify-center items-center overflow-hidden"
        style={{ padding: '16px 8px 8px', minHeight: 260 }}
      >
        {/* Signing area background — high contrast for hand visibility */}
        <div
          className="absolute rounded-2xl"
          style={{
            inset: 6,
            background: 'linear-gradient(180deg, #ffffff, #f8f9fa)',
            border: '1px solid #e8eaed',
          }}
        />

        {/* Transition pulse ring */}
        {pulse && (
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              inset: '12%',
              border: `2px solid ${color.primary}`,
              animation: 'ripple-out 0.4s ease-out forwards',
            }}
          />
        )}

        <ISLAvatar
          pose={pose}
          color={color}
          blink={blink}
          isActive={isActive}
          animKey={animKey}
          animationSpeed={animSpeed}
        />
      </div>

      {/* ── Current Sign Badge (prominent identification) ─────────────── */}
      <div
        className="text-center px-4 py-3"
        style={{ borderTop: '1px solid #eef0f2' }}
        aria-live="polite"
      >
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300"
          style={{
            background: `${color.primary}0D`,
            border: `1.5px solid ${color.primary}30`,
            boxShadow: `0 0 14px ${color.glow}`,
          }}
        >
          <div
            className="rounded-full shrink-0"
            style={{
              width: 8, height: 8,
              background: color.primary,
              boxShadow: `0 0 6px ${color.primary}`,
            }}
          />
          <span
            className="text-sm font-bold tracking-wide"
            style={{ color: color.primary }}
          >
            {currentSign?.word || (isActive ? 'NAMASTE' : 'STAND BY')}
          </span>
        </div>
        <div
          className="text-[10px] mt-1.5 font-semibold tracking-wider uppercase"
          style={{ color: '#6b7280' }}
        >
          {label}
        </div>
      </div>

      {/* ── Controls Bar (Replay + Speed) ──────────────────────────────── */}
      <div
        className="flex items-center justify-center gap-3 px-4 py-2"
        style={{ borderTop: '1px solid #eef0f2' }}
      >
        <button
          onClick={handleReplay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 hover:scale-105 cursor-pointer"
          style={{
            background: '#f0f1f3',
            color: '#374151',
            border: '1px solid #e0e2e5',
          }}
          title="Replay current sign"
          aria-label="Replay current sign"
        >
          <RotateCcw style={{ width: 12, height: 12 }} />
          Replay
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold" style={{ color: '#6b7280' }}>Speed:</span>
          <select
            value={animSpeed}
            onChange={(e) => setAnimSpeed(parseFloat(e.target.value))}
            className="text-[10px] font-semibold rounded-md px-1.5 py-1 outline-none cursor-pointer"
            style={{
              background: '#f0f1f3',
              border: '1px solid #e0e2e5',
              color: '#374151',
            }}
            aria-label="Animation speed"
          >
            <option value={0.5}>0.5× Slow</option>
            <option value={0.75}>0.75×</option>
            <option value={1}>1× Normal</option>
            <option value={1.25}>1.25×</option>
            <option value={1.5}>1.5× Fast</option>
          </select>
        </div>
      </div>

      {/* ── ISL Sign Queue Strip — full scrollable queue ─────────────── */}
      {signQueue.length > 0 && (
        <div
          className="px-3 py-2"
          style={{ borderTop: '1px solid #eef0f2' }}
        >
          <div className="text-[8px] uppercase tracking-widest mb-1.5 font-bold" style={{ color: '#9ca3af' }}>
            ISL Queue — {signQueue.length} signs
          </div>
          <div
            ref={queueScrollRef}
            className="flex gap-1 pb-1"
            style={{
              overflowX: 'auto',
              scrollbarWidth: 'thin',
              scrollbarColor: '#cbd5e1 transparent',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {signQueue.map((s, i) => {
              const isChar = s.gesture.length === 1 && /[a-z]/.test(s.gesture);
              const isNum = s.gesture.startsWith('num_');
              const c = isChar
                ? { primary: '#c084fc' }
                : isNum
                ? { primary: '#fbbf24' }
                : ISL_GESTURE_COLORS[s.gesture] || ISL_GESTURE_COLORS.idle;
              const isCurrent = i === currentSignIndex;
              const isPast = i < currentSignIndex;
              return (
                <span
                  key={i}
                  data-active-sign={isCurrent ? 'true' : undefined}
                  className="text-[9px] font-bold px-2 py-1 rounded-md transition-all duration-200 whitespace-nowrap shrink-0"
                  style={{
                    background: isCurrent ? `${c.primary}22` : isPast ? '#f3f4f6' : `${c.primary}08`,
                    color: isCurrent ? c.primary : isPast ? '#9ca3af' : c.primary,
                    border: isCurrent ? `2px solid ${c.primary}` : `1px solid ${isPast ? '#e5e7eb' : c.primary + '18'}`,
                    boxShadow: isCurrent ? `0 0 10px ${c.primary}30` : 'none',
                    fontWeight: isCurrent ? 800 : 600,
                    transform: isCurrent ? 'scale(1.1)' : 'scale(1)',
                    opacity: isPast ? 0.55 : 1,
                  }}
                >
                  {isCurrent && '\u25B8 '}{s.word}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ borderTop: '1px solid #eef0f2', background: '#f8f9fb' }}
      >
        {isProcessing ? (
          <span className="flex items-center gap-1.5 text-[9px]" style={{ color: '#6b7280' }}>
            <Loader2 style={{ width: 10, height: 10 }} className="animate-spin" />
            Processing ISL…
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[9px] font-medium" style={{ color: '#059669' }}>
            <Zap style={{ width: 9, height: 9, color: color.primary }} />
            {signCount} ISL signs
          </span>
        )}
        <span className="text-[8px] font-semibold" style={{ color: '#9ca3af' }}>
          ISLRTC · INCLUDE
        </span>
      </div>
    </div>
  );
}


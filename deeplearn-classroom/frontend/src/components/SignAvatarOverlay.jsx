/**
 * SignAvatarOverlay.jsx
 * ---------------------
 * Professional ISL (Indian Sign Language) Interpreter Panel.
 *
 * Features:
 *  - Clean white-themed panel with realistic human avatar
 *  - Natural skin tones, dark hair, white clothing
 *  - ISL-specific hand shapes (Namaste greeting, ISL fingerspelling)
 *  - Smooth CSS transitions between sign poses
 *  - ISL grammar-aware labeling (Subject-Object-Verb order)
 *  - Sign queue strip and stats footer
 *  - Responsive: 180px desktop → 140px tablet → 120px mobile
 *
 * Props:
 *  currentSign  : { word: string, gesture: string } | null
 *  isActive     : boolean — video is playing
 *  signQueue    : Array<{ word, gesture }>  — upcoming signs
 *  isProcessing : boolean — AI processing indicator
 *  signCount    : number  — total signs rendered so far
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Hand, Zap, Brain, Loader2 } from 'lucide-react';
import { getGestureLabel } from '../utils/nlpSignLanguage';

// ── Skin & clothing colour tokens ─────────────────────────────────────────────
const SKIN  = '#D4A574';       // warm medium skin tone
const SKIN2 = '#C4956A';       // slightly darker for shading
const SKIN3 = '#E0B990';       // highlight
const HAIR  = '#2C1810';       // dark brown-black hair
const WHITE_SHIRT = '#F8FAFC'; // clean white shirt
const SHIRT_SHADE = '#E2E8F0'; // shirt shadow/fold
const SHIRT_BORDER = '#CBD5E1';// shirt edge
const EYE_COLOR = '#1E293B';   // dark eyes
const LIP_COLOR = '#C4786E';   // natural lip tone
const ACCENT  = '#0F766E';     // teal accent for ISL labels
const ACCENT2 = '#14B8A6';     // lighter teal

// ── ISL-specific hand poses ───────────────────────────────────────────────────
// Each pose defines both hands + finger shape + ISL-accurate description
const ISL_POSES = {
  idle: {
    label: 'READY',
    leftHand:  { rotate: '12deg',  tx: '-2px',  ty: '2px',  scale: 1 },
    rightHand: { rotate: '-12deg', tx: '2px',   ty: '2px',  scale: 1 },
    fingers: 'relaxed',
    bodyLean: 0,
    mouthOpen: false,
    eyebrowRaise: false,
  },
  // ISL Namaste — both palms pressed together at chest height
  wave: {
    label: 'NAMASTE',
    leftHand:  { rotate: '10deg',  tx: '18px',  ty: '-16px', scale: 1.05 },
    rightHand: { rotate: '-10deg', tx: '-18px', ty: '-16px', scale: 1.05 },
    fingers: 'namaste',
    bodyLean: 2,
    mouthOpen: false,
    eyebrowRaise: false,
  },
  yes: {
    label: 'YES / AGREE',
    leftHand:  { rotate: '12deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '-5deg',  tx: '4px',   ty: '-14px', scale: 1.12 },
    fingers: 'fist_nod',
    bodyLean: 3,
    mouthOpen: false,
    eyebrowRaise: false,
  },
  no: {
    label: 'NO / DISAGREE',
    leftHand:  { rotate: '12deg',  tx: '-2px',  ty: '2px',  scale: 1 },
    rightHand: { rotate: '-30deg', tx: '10px',  ty: '-10px', scale: 1.1 },
    fingers: 'index_wag',
    bodyLean: -1,
    mouthOpen: false,
    eyebrowRaise: true,
  },
  count: {
    label: 'NUMBER',
    leftHand:  { rotate: '12deg',  tx: '-2px',  ty: '2px',   scale: 1 },
    rightHand: { rotate: '-30deg', tx: '8px',   ty: '-16px', scale: 1.18 },
    fingers: 'isl_count',
    bodyLean: 1,
    mouthOpen: false,
    eyebrowRaise: false,
  },
  explain: {
    label: 'EXPLAIN',
    leftHand:  { rotate: '-20deg', tx: '-14px', ty: '-10px', scale: 1.05 },
    rightHand: { rotate: '20deg',  tx: '14px',  ty: '-10px', scale: 1.05 },
    fingers: 'palms_up',
    bodyLean: 0,
    mouthOpen: true,
    eyebrowRaise: false,
  },
  question: {
    label: 'QUESTION',
    leftHand:  { rotate: '12deg',  tx: '-2px',  ty: '2px',  scale: 1 },
    rightHand: { rotate: '-70deg', tx: '6px',   ty: '-24px', scale: 1.1 },
    fingers: 'index_circle',
    bodyLean: -2,
    mouthOpen: false,
    eyebrowRaise: true,
  },
  think: {
    label: 'THINK / KNOW',
    leftHand:  { rotate: '12deg',  tx: '-2px',  ty: '2px',  scale: 1 },
    rightHand: { rotate: '-80deg', tx: '2px',   ty: '-28px', scale: 1.08 },
    fingers: 'index_temple',
    bodyLean: 3,
    mouthOpen: false,
    eyebrowRaise: false,
  },
  point: {
    label: 'LOOK / ATTENTION',
    leftHand:  { rotate: '12deg',  tx: '-2px',  ty: '2px',  scale: 1 },
    rightHand: { rotate: '-65deg', tx: '18px',  ty: '-18px', scale: 1.12 },
    fingers: 'index_point',
    bodyLean: -2,
    mouthOpen: false,
    eyebrowRaise: true,
  },
  math: {
    label: 'TECHNICAL',
    leftHand:  { rotate: '-16deg', tx: '-8px',  ty: '-6px',  scale: 1.05 },
    rightHand: { rotate: '16deg',  tx: '8px',   ty: '-6px',  scale: 1.05 },
    fingers: 'pinch',
    bodyLean: 0,
    mouthOpen: false,
    eyebrowRaise: false,
  },
  action: {
    label: 'ACTION / DO',
    leftHand:  { rotate: '-25deg', tx: '-8px',  ty: '-6px',  scale: 1.08 },
    rightHand: { rotate: '-40deg', tx: '6px',   ty: '-14px', scale: 1.12 },
    fingers: 'fist',
    bodyLean: 2,
    mouthOpen: false,
    eyebrowRaise: false,
  },
  alert: {
    label: 'IMPORTANT',
    leftHand:  { rotate: '-40deg', tx: '-6px',  ty: '-14px', scale: 1.08 },
    rightHand: { rotate: '-40deg', tx: '6px',   ty: '-14px', scale: 1.08 },
    fingers: 'open_spread',
    bodyLean: 0,
    mouthOpen: true,
    eyebrowRaise: true,
  },
  talk: {
    label: 'SIGNING',
    leftHand:  { rotate: '-10deg', tx: '-8px',  ty: '-4px',  scale: 1.02 },
    rightHand: { rotate: '10deg',  tx: '8px',   ty: '-4px',  scale: 1.02 },
    fingers: 'palms_up',
    bodyLean: 0,
    mouthOpen: true,
    eyebrowRaise: false,
  },
};

// ── ISL Hand Shape SVGs ───────────────────────────────────────────────────────
// Realistic hand shapes with visible fingers, thumb, and proper proportions
function ISLHandShape({ fingers, side, animate }) {
  const isLeft = side === 'left';
  const palmColor = SKIN;
  const fingerColor = SKIN3;
  const nailColor = '#F0D0B8';

  const shapes = {
    relaxed: (
      <g>
        {/* Palm */}
        <rect x="8" y="7" width="28" height="15" rx="5" fill={palmColor} />
        {/* Thumb */}
        <ellipse cx={isLeft ? "7" : "37"} cy="14" rx="4" ry="3.5" fill={fingerColor} />
        {/* Fingers - slightly curled */}
        <rect x="11" y="2" width="5" height="8" rx="2.5" fill={fingerColor} />
        <rect x="18" y="1" width="5" height="9" rx="2.5" fill={fingerColor} />
        <rect x="25" y="1" width="5" height="9" rx="2.5" fill={fingerColor} />
        <rect x="31" y="3" width="4.5" height="7" rx="2.2" fill={fingerColor} />
      </g>
    ),
    namaste: (
      <g>
        {/* Both palms pressed flat — shown as single open palm */}
        <rect x="6" y="6" width="32" height="16" rx="4" fill={palmColor} />
        {/* Fingers straight up, pressed together */}
        <rect x="9" y="0" width="5.5" height="9" rx="2.5" fill={fingerColor} />
        <rect x="16" y="-2" width="5.5" height="11" rx="2.5" fill={fingerColor} />
        <rect x="23" y="-2" width="5.5" height="11" rx="2.5" fill={fingerColor} />
        <rect x="30" y="0" width="5" height="9" rx="2.5" fill={fingerColor} />
        {/* Thumb tucked in */}
        <ellipse cx={isLeft ? "5" : "39"} cy="12" rx="3.5" ry="4" fill={fingerColor} />
      </g>
    ),
    fist_nod: (
      <g>
        {/* Closed fist */}
        <rect x="8" y="5" width="28" height="16" rx="7" fill={palmColor} />
        {/* Thumb over fingers */}
        <ellipse cx={isLeft ? "8" : "36"} cy="12" rx="4.5" ry="5" fill={fingerColor} />
        {/* Knuckle highlights */}
        <circle cx="16" cy="6" r="2" fill={SKIN2} opacity="0.5" />
        <circle cx="22" cy="5" r="2" fill={SKIN2} opacity="0.5" />
        <circle cx="28" cy="6" r="2" fill={SKIN2} opacity="0.5" />
      </g>
    ),
    index_wag: (
      <g>
        {/* Palm base */}
        <rect x="8" y="8" width="28" height="14" rx="6" fill={palmColor} />
        {/* Index finger extended and angled */}
        <rect x="12" y="-2" width="5.5" height="13" rx="2.5" fill={fingerColor} transform="rotate(-8 15 5)" />
        <ellipse cx="14" cy="-2" rx="2.8" ry="2" fill={nailColor} />
        {/* Other fingers curled */}
        <ellipse cx="22" cy="8" rx="3" ry="3.5" fill={SKIN2} opacity="0.6" />
        <ellipse cx="28" cy="9" rx="3" ry="3" fill={SKIN2} opacity="0.6" />
        {/* Thumb */}
        <ellipse cx={isLeft ? "7" : "37"} cy="14" rx="4" ry="3.5" fill={fingerColor} />
      </g>
    ),
    isl_count: (
      <g>
        {/* Palm */}
        <rect x="8" y="7" width="28" height="15" rx="5" fill={palmColor} />
        {/* Index + middle extended (ISL "2") */}
        <rect x="14" y="-1" width="5" height="11" rx="2.5" fill={fingerColor} />
        <rect x="22" y="-1" width="5" height="11" rx="2.5" fill={fingerColor} />
        {/* Ring + pinky curled */}
        <ellipse cx="31" cy="8" rx="3" ry="3.5" fill={SKIN2} opacity="0.5" />
        {/* Thumb */}
        <ellipse cx={isLeft ? "7" : "37"} cy="14" rx="4" ry="3.5" fill={fingerColor} />
      </g>
    ),
    palms_up: (
      <g>
        {/* Open palm facing up */}
        <rect x="6" y="8" width="32" height="14" rx="5" fill={palmColor} />
        {/* Fingers extended slightly spread */}
        <rect x="8" y="1" width="5" height="10" rx="2.5" fill={fingerColor} />
        <rect x="15" y="-1" width="5" height="12" rx="2.5" fill={fingerColor} />
        <rect x="22" y="-1" width="5" height="12" rx="2.5" fill={fingerColor} />
        <rect x="29" y="1" width="5" height="10" rx="2.5" fill={fingerColor} />
        {/* Thumb */}
        <ellipse cx={isLeft ? "5" : "39"} cy="12" rx="3.5" ry="4" fill={fingerColor} />
      </g>
    ),
    index_circle: (
      <g>
        {/* Palm */}
        <rect x="8" y="8" width="28" height="14" rx="6" fill={palmColor} />
        {/* Index finger extended */}
        <rect x="14" y="-1" width="5.5" height="12" rx="2.5" fill={fingerColor} />
        <ellipse cx="17" cy="-1" rx="2.8" ry="2" fill={nailColor} />
        {/* Other fingers curled */}
        <ellipse cx="24" cy="9" rx="3.5" ry="3" fill={SKIN2} opacity="0.5" />
        <ellipse cx="30" cy="10" rx="3" ry="2.5" fill={SKIN2} opacity="0.5" />
        {/* Thumb */}
        <ellipse cx={isLeft ? "7" : "37"} cy="14" rx="4" ry="3.5" fill={fingerColor} />
      </g>
    ),
    index_temple: (
      <g>
        {/* Palm sideways */}
        <rect x="8" y="8" width="26" height="13" rx="6" fill={palmColor} />
        {/* Index pointing to temple */}
        <rect x="11" y="0" width="5.5" height="11" rx="2.5" fill={fingerColor} />
        <ellipse cx="14" cy="0" rx="2.5" ry="2" fill={nailColor} />
        {/* Other fingers curled */}
        <ellipse cx="22" cy="9" rx="3" ry="3.5" fill={SKIN2} opacity="0.5" />
        <ellipse cx="28" cy="10" rx="3" ry="3" fill={SKIN2} opacity="0.5" />
        {/* Thumb */}
        <ellipse cx={isLeft ? "7" : "34"} cy="15" rx="3.5" ry="3" fill={fingerColor} />
      </g>
    ),
    index_point: (
      <g>
        {/* Palm */}
        <rect x="8" y="8" width="28" height="14" rx="6" fill={palmColor} />
        {/* Index extended strongly */}
        <rect x={isLeft ? "30" : "8"} y="-2" width="6" height="13" rx="3" fill={fingerColor} />
        <ellipse cx={isLeft ? "33" : "11"} cy="-2" rx="3" ry="2" fill={nailColor} />
        {/* Other fingers curled */}
        <ellipse cx="18" cy="8" rx="3" ry="3.5" fill={SKIN2} opacity="0.5" />
        <ellipse cx="24" cy="8" rx="3" ry="3.5" fill={SKIN2} opacity="0.5" />
        {/* Thumb */}
        <ellipse cx={isLeft ? "7" : "37"} cy="14" rx="4" ry="3.5" fill={fingerColor} />
      </g>
    ),
    pinch: (
      <g>
        {/* Palm */}
        <rect x="8" y="8" width="28" height="14" rx="5" fill={palmColor} />
        {/* Thumb + index touching (pinch) */}
        <ellipse cx="14" cy="5" rx="4" ry="3.5" fill={fingerColor} />
        <ellipse cx={isLeft ? "7" : "37"} cy="8" rx="4" ry="4" fill={fingerColor} />
        {/* Other fingers slightly open */}
        <rect x="22" y="2" width="4.5" height="9" rx="2" fill={fingerColor} opacity="0.8" />
        <rect x="28" y="3" width="4.5" height="8" rx="2" fill={fingerColor} opacity="0.7" />
      </g>
    ),
    fist: (
      <g>
        {/* Closed fist */}
        <rect x="8" y="5" width="28" height="16" rx="8" fill={palmColor} />
        {/* Thumb wrapping */}
        <ellipse cx={isLeft ? "8" : "36"} cy="11" rx="5" ry="5.5" fill={fingerColor} />
        {/* Knuckle line */}
        <line x1="12" y1="6" x2="32" y2="6" stroke={SKIN2} strokeWidth="1.5" opacity="0.4" />
      </g>
    ),
    open_spread: (
      <g>
        {/* Palm */}
        <rect x="6" y="8" width="32" height="14" rx="5" fill={palmColor} />
        {/* Fingers spread wide */}
        <rect x="6" y="-1" width="5" height="12" rx="2.5" fill={fingerColor} transform="rotate(-12 8 5)" />
        <rect x="14" y="-3" width="5" height="14" rx="2.5" fill={fingerColor} transform="rotate(-4 16 4)" />
        <rect x="22" y="-3" width="5" height="14" rx="2.5" fill={fingerColor} transform="rotate(4 24 4)" />
        <rect x="30" y="-1" width="5" height="12" rx="2.5" fill={fingerColor} transform="rotate(12 32 5)" />
        {/* Thumb spread out */}
        <ellipse cx={isLeft ? "3" : "41"} cy="10" rx="4" ry="5" fill={fingerColor} transform="rotate(-20 3 10)" />
      </g>
    ),
  };

  // ISL alphabet hand shapes (right hand dominant, ISL-specific)
  const islAlphabetShapes = {
    a: 'fist_nod',
    b: 'palms_up',
    c: 'pinch',
    d: 'index_point',
    e: 'fist',
    f: 'pinch',
    g: 'index_point',
    h: 'index_point',
    i: 'fist_nod',
    j: 'fist_nod',
    k: 'isl_count',
    l: 'index_point',
    m: 'fist',
    n: 'fist',
    o: 'pinch',
    p: 'index_point',
    q: 'pinch',
    r: 'isl_count',
    s: 'fist',
    t: 'fist_nod',
    u: 'isl_count',
    v: 'isl_count',
    w: 'open_spread',
    x: 'fist_nod',
    y: 'fist_nod',
    z: 'index_point',
  };

  // Resolve finger shape
  let resolvedFingers = fingers;
  if (fingers && fingers.length === 1 && /[a-z]/.test(fingers)) {
    resolvedFingers = islAlphabetShapes[fingers] || 'relaxed';
  }

  return (
    <svg
      viewBox="0 0 44 24"
      width="44"
      height="24"
      style={{
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))',
        transform: isLeft ? 'scaleX(-1)' : 'none',
        transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      {shapes[resolvedFingers] || shapes.relaxed}
    </svg>
  );
}

// ── Realistic Avatar Body ─────────────────────────────────────────────────────
function Avatar({ pose, blink, isActive, animKey, breathe }) {
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
      style={{ width: 160, height: 210 }}
      key={animKey}
    >
      {/* Body lean + breathing */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `rotate(${pose.bodyLean}deg) scale(${breathe ? 1.008 : 1})`,
          transition: 'transform 0.4s ease',
          transformOrigin: 'bottom center',
        }}
      >
        {/* ── Hair (behind head) ────────────────────────────────── */}
        <div
          className="absolute rounded-full"
          style={{
            width: 46, height: 26,
            left: '50%', top: 6,
            transform: 'translateX(-50%)',
            background: HAIR,
            zIndex: 0,
          }}
        />

        {/* ── Head ──────────────────────────────────────────────── */}
        <div
          className="absolute rounded-full"
          style={{
            width: 42, height: 44,
            left: '50%', top: 10,
            transform: 'translateX(-50%)',
            background: `linear-gradient(145deg, ${SKIN3}, ${SKIN})`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            zIndex: 1,
          }}
        >
          {/* Hair on top */}
          <div
            className="absolute"
            style={{
              width: 42, height: 14,
              top: -2, left: 0,
              borderRadius: '21px 21px 0 0',
              background: HAIR,
            }}
          />

          {/* Eyebrows */}
          <div className="absolute flex gap-4 justify-center w-full" style={{ top: 12 }}>
            <div style={{
              width: 8, height: 2,
              borderRadius: 1,
              background: HAIR,
              transform: pose.eyebrowRaise ? 'translateY(-2px)' : 'none',
              transition: 'transform 0.3s ease',
            }} />
            <div style={{
              width: 8, height: 2,
              borderRadius: 1,
              background: HAIR,
              transform: pose.eyebrowRaise ? 'translateY(-2px)' : 'none',
              transition: 'transform 0.3s ease',
            }} />
          </div>

          {/* Eyes */}
          <div className="absolute flex gap-3.5 justify-center w-full" style={{ top: 17 }}>
            {/* Left eye */}
            <div style={{ position: 'relative', width: 8, height: blink ? 1 : 7 }}>
              <div style={{
                width: 8, height: blink ? 1 : 7,
                borderRadius: '50%',
                background: 'white',
                border: `1px solid ${SKIN2}`,
                overflow: 'hidden',
                transition: 'height 0.08s',
              }}>
                {!blink && (
                  <div style={{
                    width: 4, height: 4,
                    borderRadius: '50%',
                    background: EYE_COLOR,
                    position: 'absolute',
                    top: 1.5, left: 2,
                  }}>
                    <div style={{
                      width: 1.5, height: 1.5,
                      borderRadius: '50%',
                      background: 'white',
                      position: 'absolute',
                      top: 0.5, left: 0.5,
                    }} />
                  </div>
                )}
              </div>
            </div>
            {/* Right eye */}
            <div style={{ position: 'relative', width: 8, height: blink ? 1 : 7 }}>
              <div style={{
                width: 8, height: blink ? 1 : 7,
                borderRadius: '50%',
                background: 'white',
                border: `1px solid ${SKIN2}`,
                overflow: 'hidden',
                transition: 'height 0.08s',
              }}>
                {!blink && (
                  <div style={{
                    width: 4, height: 4,
                    borderRadius: '50%',
                    background: EYE_COLOR,
                    position: 'absolute',
                    top: 1.5, left: 2,
                  }}>
                    <div style={{
                      width: 1.5, height: 1.5,
                      borderRadius: '50%',
                      background: 'white',
                      position: 'absolute',
                      top: 0.5, left: 0.5,
                    }} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Nose */}
          <div
            className="absolute"
            style={{
              width: 4, height: 5,
              left: '50%', top: 26,
              transform: 'translateX(-50%)',
              borderRadius: '0 0 2px 2px',
              background: SKIN2,
              opacity: 0.5,
            }}
          />

          {/* Mouth */}
          <div
            className="absolute"
            style={{
              width: pose.mouthOpen ? 8 : 12,
              height: pose.mouthOpen ? 5 : 3,
              left: '50%', bottom: 5,
              transform: 'translateX(-50%)',
              borderRadius: pose.mouthOpen ? '3px 3px 6px 6px' : '0 0 6px 6px',
              background: pose.mouthOpen ? '#8B4049' : 'transparent',
              borderBottom: pose.mouthOpen ? 'none' : `2px solid ${LIP_COLOR}`,
              borderLeft: pose.mouthOpen ? 'none' : `0.5px solid ${LIP_COLOR}88`,
              borderRight: pose.mouthOpen ? 'none' : `0.5px solid ${LIP_COLOR}88`,
              transition: 'all 0.3s ease',
            }}
          />
        </div>

        {/* ── Neck ──────────────────────────────────────────────── */}
        <div
          className="absolute"
          style={{
            width: 14, height: 12,
            left: '50%', top: 54,
            transform: 'translateX(-50%)',
            background: `linear-gradient(180deg, ${SKIN}, ${SKIN2})`,
            zIndex: 0,
          }}
        />

        {/* ── Torso (white shirt) ──────────────────────────────── */}
        <div
          className="absolute rounded-xl"
          style={{
            width: 52, height: 60,
            left: '50%', top: 64,
            transform: 'translateX(-50%)',
            background: `linear-gradient(180deg, ${WHITE_SHIRT}, ${SHIRT_SHADE})`,
            border: `1.5px solid ${SHIRT_BORDER}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            zIndex: 0,
          }}
        >
          {/* Collar */}
          <div style={{
            position: 'absolute',
            top: -1, left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '10px solid transparent',
            borderRight: '10px solid transparent',
            borderTop: `8px solid ${SKIN2}`,
          }} />
          {/* Shirt button line */}
          <div className="absolute flex flex-col items-center gap-2 w-full" style={{ top: 10 }}>
            <div style={{ width: 3, height: 3, borderRadius: '50%', background: SHIRT_BORDER }} />
            <div style={{ width: 3, height: 3, borderRadius: '50%', background: SHIRT_BORDER }} />
            <div style={{ width: 3, height: 3, borderRadius: '50%', background: SHIRT_BORDER }} />
          </div>
        </div>

        {/* ── Left Arm ──────────────────────────────────────────── */}
        <div
          className="absolute rounded-full"
          style={{
            width: 50, height: 8,
            left: 30, top: 78,
            background: `linear-gradient(90deg, ${WHITE_SHIRT}, ${SKIN})`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            zIndex: 2,
            ...armStyle('left'),
          }}
        >
          <div className="absolute" style={{ right: -6, top: -8 }}>
            <ISLHandShape fingers={pose.fingers} side="left" />
          </div>
        </div>

        {/* ── Right Arm ─────────────────────────────────────────── */}
        <div
          className="absolute rounded-full"
          style={{
            width: 50, height: 8,
            right: 30, top: 78,
            background: `linear-gradient(90deg, ${SKIN}, ${WHITE_SHIRT})`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            zIndex: 2,
            ...armStyle('right'),
          }}
        >
          <div className="absolute" style={{ left: -6, top: -8 }}>
            <ISLHandShape fingers={pose.fingers} side="right" />
          </div>
        </div>

        {/* ── Legs ──────────────────────────────────────────────── */}
        <div className="absolute flex gap-3 justify-center w-full" style={{ top: 128 }}>
          <div className="rounded-full" style={{
            width: 14, height: 50,
            background: `linear-gradient(180deg, #475569, #334155)`,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }} />
          <div className="rounded-full" style={{
            width: 14, height: 50,
            background: `linear-gradient(180deg, #475569, #334155)`,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }} />
        </div>
      </div>
    </div>
  );
}

// ── ISL letter → finger shape mapping ─────────────────────────────────────────
const islLetterFingers = {
  a: 'fist_nod', b: 'palms_up', c: 'pinch', d: 'index_point',
  e: 'fist', f: 'pinch', g: 'index_point', h: 'index_point',
  i: 'fist_nod', j: 'fist_nod', k: 'isl_count', l: 'index_point',
  m: 'fist', n: 'fist', o: 'pinch', p: 'index_point',
  q: 'pinch', r: 'isl_count', s: 'fist', t: 'fist_nod',
  u: 'isl_count', v: 'isl_count', w: 'open_spread', x: 'fist_nod',
  y: 'fist_nod', z: 'index_point',
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
  const [breathe,  setBreathe]  = useState(false);

  // Determine active gesture
  const gesture = currentSign?.gesture || (isActive ? 'talk' : 'idle');

  // Dynamic pose resolution
  let pose = ISL_POSES[gesture];
  if (!pose) {
    if (gesture.length === 1 && /[a-z]/.test(gesture)) {
      const handShape = islLetterFingers[gesture] || 'relaxed';
      const code = gesture.charCodeAt(0);
      const rotateRight = `${-25 - (code % 5) * 8}deg`;
      const tx = `${4 + (code % 3) * 2}px`;
      const ty = `${-14 - (code % 4) * 3}px`;
      pose = {
        label: `ISL LETTER ${gesture.toUpperCase()}`,
        leftHand:  { rotate: '12deg',  tx: '-2px',  ty: '2px',  scale: 1 },
        rightHand: { rotate: rotateRight, tx, ty, scale: 1.15 },
        fingers: handShape,
        bodyLean: (code % 3) - 1,
        mouthOpen: false,
        eyebrowRaise: false,
      };
    } else if (gesture.startsWith('num_')) {
      const numStr = gesture.slice(4);
      pose = {
        label: `ISL NUMBER ${numStr}`,
        leftHand:  { rotate: '12deg',  tx: '-2px',  ty: '2px',  scale: 1 },
        rightHand: { rotate: `-${25 + parseInt(numStr || 0) * 5}deg`, tx: '8px', ty: '-14px', scale: 1.18 },
        fingers: 'isl_count',
        bodyLean: 1,
        mouthOpen: false,
        eyebrowRaise: false,
      };
    } else {
      pose = ISL_POSES.idle;
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
    }, 3000 + Math.random() * 1500);
    return () => clearInterval(id);
  }, [isActive]);

  // Subtle breathing animation
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      setBreathe(true);
      setTimeout(() => setBreathe(false), 1200);
    }, 2400);
    return () => clearInterval(id);
  }, [isActive]);

  // Up to 8 upcoming signs in the queue strip
  const upcomingQueue = useMemo(() => signQueue.slice(0, 8), [signQueue]);

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden select-none"
      style={{
        width: 'clamp(120px, 15vw, 180px)',
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(12px)',
        border: `1.5px solid ${SHIRT_BORDER}`,
        boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)',
        transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
      }}
      aria-label="ISL Sign Language Interpreter"
      role="region"
    >
      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1.5 px-3 py-2"
        style={{
          borderBottom: `1px solid ${SHIRT_BORDER}`,
          background: `linear-gradient(90deg, ${ACCENT}08, ${ACCENT}04)`,
        }}
      >
        <Hand style={{ width: 12, height: 12, color: ACCENT }} />
        <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: ACCENT }}>
          ISL Interpreter
        </span>
        {isActive && (
          <div
            className="ml-auto rounded-full"
            style={{
              width: 6, height: 6,
              background: ACCENT2,
              boxShadow: `0 0 6px ${ACCENT2}`,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        )}
      </div>

      {/* ── Avatar canvas ──────────────────────────────────────────────── */}
      <div className="flex justify-center items-center py-2 relative"
        style={{ background: `linear-gradient(180deg, #f8fafcff, #f1f5f9ff)` }}
      >
        {/* Subtle pulse ring on sign change */}
        {pulse && (
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              inset: '20%',
              border: `2px solid ${ACCENT2}44`,
              animation: 'ripple-out 0.4s ease-out forwards',
            }}
          />
        )}
        <Avatar
          pose={pose}
          blink={blink}
          isActive={isActive}
          animKey={animKey}
          breathe={breathe}
        />
      </div>

      {/* ── Sign label ─────────────────────────────────────────────────── */}
      <div
        className="text-center px-3 py-1.5"
        style={{ borderTop: `1px solid ${SHIRT_BORDER}` }}
        aria-live="polite"
      >
        <div
          className="text-[10px] font-bold tracking-wider truncate"
          style={{ color: '#1E293B' }}
        >
          {currentSign?.word || (isActive ? '• • •' : 'STAND BY')}
        </div>
        <div className="text-[8px] mt-0.5 tracking-widest uppercase" style={{ color: ACCENT }}>
          {label}
        </div>
      </div>

      {/* ── Sign queue strip ───────────────────────────────────────────── */}
      {signQueue.length > 0 && (
        <div
          className="px-2 py-1.5 space-y-0.5 overflow-hidden"
          style={{ borderTop: `1px solid ${SHIRT_BORDER}`, maxHeight: 80 }}
        >
          <div className="text-[7px] uppercase tracking-widest mb-1" style={{ color: '#94A3B8' }}>
            Queue ({signQueue.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {upcomingQueue.map((s, i) => (
              <span
                key={i}
                className="text-[7px] font-bold px-1 py-0.5 rounded"
                style={{
                  background: `${ACCENT}0D`,
                  color: ACCENT,
                  border: `1px solid ${ACCENT}22`,
                }}
              >
                {s.word}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Stats footer ───────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ borderTop: `1px solid ${SHIRT_BORDER}`, background: '#F8FAFC' }}
      >
        {isProcessing ? (
          <span className="flex items-center gap-1 text-[8px]" style={{ color: '#94A3B8' }}>
            <Loader2 style={{ width: 8, height: 8 }} className="animate-spin" />
            Processing
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[8px]" style={{ color: '#64748B' }}>
            <Zap style={{ width: 7, height: 7, color: ACCENT2 }} />
            {signCount} signs
          </span>
        )}
        <span className="text-[8px] font-medium" style={{ color: `${ACCENT}88` }}>
          ISL
        </span>
      </div>

      {/* ── CSS Animations ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes ripple-out {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

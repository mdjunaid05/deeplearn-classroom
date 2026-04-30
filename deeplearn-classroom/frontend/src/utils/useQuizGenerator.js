/**
 * useQuizGenerator.js  [FIXED v2]
 * -------------------
 * Converts a plain-text transcript into MCQ quiz questions.
 * No external APIs — pure NLP heuristics.
 *
 * FIXES:
 *  - Added a "generated once" cache ref so generateQuiz() is a no-op if called
 *    again with the same text (prevents token/CPU wastage on re-renders).
 *  - Fixed chunking: sentences are now split on [.!?] followed by a space
 *    AND filtered for minimum meaningful length (>= 30 chars).
 *  - Added console logging at each pipeline step for easy debugging.
 *  - Added graceful fallback at every stage so the quiz always renders.
 *
 * Returns:
 *   quizQuestions  – Array<{ id, question, options, correct }> | null
 *   generateQuiz(text, count) – call once when video ends
 */

import { useState, useRef, useCallback } from 'react';

// ─── constants ─────────────────────────────────────────────────────────────
const MIN_SENTENCE_LEN = 30;  // ignore fragments shorter than this
const MAX_CHUNK_WORDS  = 50;  // max words per sentence chunk (token safety)

// ─── pure helpers ──────────────────────────────────────────────────────────

/**
 * splitSentences — FIXED chunking logic
 * Splits on terminal punctuation followed by whitespace.
 * Filters out duplicates and very short fragments.
 */
const splitSentences = (text) => {
  // Normalise whitespace
  const normalised = text.replace(/\s+/g, ' ').trim();

  // Split on . ! ? followed by a space or end-of-string
  const raw = normalised.split(/(?<=[.!?])\s+/);

  // Deduplicate and filter
  const seen = new Set();
  return raw
    .map(s => s.trim())
    .filter(s => {
      if (s.length < MIN_SENTENCE_LEN) return false;   // too short
      if (seen.has(s)) return false;                    // duplicate
      seen.add(s);
      return true;
    })
    .map(s => {
      // Truncate if over MAX_CHUNK_WORDS to stay within token limits
      const words = s.split(/\s+/);
      return words.length > MAX_CHUNK_WORDS
        ? words.slice(0, MAX_CHUNK_WORDS).join(' ') + '…'
        : s;
    });
};

/**
 * extractKeyTerms — pull out meaningful words from a sentence.
 * Prioritises: capitalised words, numbers, and long content words.
 */
const extractKeyTerms = (sentence) =>
  sentence
    .split(/\s+/)
    .filter(w =>
      /[A-Z][a-z]/.test(w) ||   // Proper noun
      /\d/.test(w)           ||  // Number
      w.length > 7               // Long common noun
    )
    .map(w => w.replace(/[^a-zA-Z0-9\-]/g, ''))
    .filter(w => w.length > 1);  // strip punctuation-only tokens

/** Score a sentence by information density. */
const scoreS = (sentence) => {
  const terms = extractKeyTerms(sentence);
  const lengthBonus = sentence.length > 60 ? 2 : 0;
  return terms.length + lengthBonus;
};

/**
 * buildMCQ — convert one sentence into a fill-in-the-blank MCQ.
 * Returns null if no useful key term can be extracted.
 */
const buildMCQ = (sentence, id, distractorPool) => {
  const terms = extractKeyTerms(sentence);
  if (terms.length === 0) {
    console.log(`[Quiz] Skipping sentence (no key terms): "${sentence.slice(0, 40)}…"`);
    return null;
  }

  const answer = terms[0];
  const blanked = sentence.replace(answer, '___');

  // Build distractors from other sentences' key terms, excluding the answer
  const candidates = distractorPool
    .filter(t => t !== answer && t.length > 2)
    .sort(() => Math.random() - 0.5)
    .slice(0, 6);

  const distractors = new Set();
  candidates.forEach(t => { if (distractors.size < 3) distractors.add(t); });

  // Generic fallbacks if not enough terms in transcript
  const fallbacks = [
    'the standard protocol', 'a common misconception', 'an unrelated concept',
    'background noise',      'a different subject',    'the wrong approach',
  ];
  let fi = 0;
  while (distractors.size < 3) distractors.add(fallbacks[fi++]);

  const opts = [answer, ...distractors].sort(() => Math.random() - 0.5);
  const correct = opts.indexOf(answer);

  return { id, question: `"${blanked}" — which term best fills the blank?`, options: opts, correct };
};

/** Comprehension fallback question when NLP extraction fails. */
const fallbackQuestion = (sentences, id) => ({
  id,
  question: 'Based on the video, which statement best reflects the content?',
  options: [
    sentences[0] || 'The topic was comprehensively explained.',
    'The content was purely theoretical with no examples.',
    'No conclusions were drawn during the session.',
    'The video focused on a completely unrelated subject.',
  ],
  correct: 0,
});

// ─── hook ──────────────────────────────────────────────────────────────────

export function useQuizGenerator() {
  const [quizQuestions, setQuizQuestions] = useState(null);

  // FIXED: cache last input text so generateQuiz is a no-op on repeated calls
  const lastTextRef = useRef('');

  const generateQuiz = useCallback((transcriptText, count = 3) => {
    // ── Guard: skip if empty ────────────────────────────────────────────────
    if (!transcriptText || transcriptText.trim().length < 40) {
      console.warn('[Quiz] Transcript too short to generate quiz. Length:', transcriptText?.length ?? 0);
      setQuizQuestions(null);
      return;
    }

    // ── Guard: skip if same text (no-op to avoid re-processing) ────────────
    if (transcriptText === lastTextRef.current) {
      console.log('[Quiz] Same transcript as last call — skipping regeneration (cached).');
      return;
    }
    lastTextRef.current = transcriptText;

    console.log('[Quiz] Starting quiz generation. Transcript length:', transcriptText.length, 'chars.');

    // ── Step 1: Chunk transcript into sentences ─────────────────────────────
    const sentences = splitSentences(transcriptText);
    console.log('[Quiz] STEP 1 — Chunking:', sentences.length, 'valid sentences extracted.');

    if (sentences.length < 1) {
      console.warn('[Quiz] Not enough sentences. Using fallback quiz.');
      setQuizQuestions([fallbackQuestion([transcriptText], 1), fallbackQuestion([transcriptText], 2)]);
      return;
    }

    // ── Step 2: Rank by information density ────────────────────────────────
    const ranked = [...sentences]
      .map(s => ({ s, score: scoreS(s) }))
      .sort((a, b) => b.score - a.score);
    console.log('[Quiz] STEP 2 — Top ranked sentences:', ranked.slice(0, 3).map(r => `"${r.s.slice(0,40)}…" (score=${r.score})`));

    // ── Step 3: Build distractor pool from all key terms ───────────────────
    const allTerms = ranked.flatMap(({ s }) => extractKeyTerms(s));
    console.log('[Quiz] STEP 3 — Distractor pool:', allTerms.length, 'key terms collected.');

    // ── Step 4: Generate questions ─────────────────────────────────────────
    const questions = [];
    for (const { s } of ranked) {
      if (questions.length >= count) break;
      const q = buildMCQ(s, questions.length + 1, allTerms);
      if (q) {
        console.log(`[Quiz] STEP 4 — Q${q.id} generated from: "${s.slice(0, 50)}…"`);
        questions.push(q);
      }
    }

    // ── Step 5: Pad with fallback questions if needed ──────────────────────
    while (questions.length < Math.min(count, 2)) {
      const q = fallbackQuestion(sentences, questions.length + 1);
      console.log('[Quiz] STEP 5 — Adding fallback question', q.id);
      questions.push(q);
    }

    const final = questions.slice(0, count);
    console.log('[Quiz] ✅ Quiz generation complete:', final.length, 'questions ready.');
    setQuizQuestions(final);
  }, []);

  return { quizQuestions, generateQuiz };
}

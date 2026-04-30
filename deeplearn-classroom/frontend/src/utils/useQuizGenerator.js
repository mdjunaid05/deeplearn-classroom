/**
 * useQuizGenerator.js
 * -------------------
 * Custom React hook that converts a plain-text transcript into a set of
 * multiple-choice quiz questions using pure NLP heuristics — no external API.
 *
 * Algorithm:
 *  1. Split transcript into sentences.
 *  2. Score each sentence by information density (proper nouns, numbers, etc.).
 *  3. Turn top-N sentences into fill-in-the-blank or what/who/which questions.
 *  4. Generate plausible distractors by swapping keywords from other sentences.
 *
 * Returns:
 *  - quizQuestions: Array<{ id, question, options, correct }> | null
 *  - generateQuiz(transcriptText): void — call with joined transcript
 */

import { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Split text into sentences. */
const toSentences = (text) =>
  text
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 20); // ignore very short fragments

/** Simple noun-phrase extractor — capitalised words and numbers. */
const extractKeyTerms = (sentence) => {
  const words = sentence.split(/\s+/);
  return words.filter(w =>
    /[A-Z][a-z]/.test(w) ||          // capitalised word
    /\d/.test(w) ||                   // contains a number
    w.length > 7                      // long common-noun
  ).map(w => w.replace(/[^a-zA-Z0-9\-]/g, ''));
};

/** Information-density score for a sentence. */
const scoreS = (sentence) => {
  const terms = extractKeyTerms(sentence);
  return terms.length + (sentence.length > 60 ? 2 : 0);
};

/** Pick a random element from an array. */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Swap one key term in a sentence to create a distractor. */
const makeDistractor = (correct, termPool) => {
  const shuffled = [...termPool].sort(() => Math.random() - 0.5);
  for (const term of shuffled) {
    if (!correct.includes(term)) {
      // Replace the first key term in `correct` with this alternative term
      const replaced = correct.replace(
        /\b[A-Z][a-z]+\b|\b\d+\b|\b\w{8,}\b/,
        term
      );
      if (replaced !== correct) return replaced;
    }
  }
  // Fallback: add "not" or negate
  return `${correct} is not the primary factor`;
};

// ---------------------------------------------------------------------------
// Question builders
// ---------------------------------------------------------------------------

/**
 * Convert a sentence into a question.
 * Strategy: pick the highest-score key term → replace it with "___" and ask
 * "Which of the following correctly fills in the blank?"
 */
const buildQuestion = (sentence, id, allTerms) => {
  const terms = extractKeyTerms(sentence);
  if (terms.length === 0) return null;

  const targetTerm = terms[0]; // the term we'll blank out
  const questionText = sentence.replace(targetTerm, '___');

  // Build 3 distractors from other sentences' terms
  const distractorPool = allTerms
    .filter(t => t !== targetTerm && t.length > 2)
    .sort(() => Math.random() - 0.5)
    .slice(0, 6);

  const distractors = new Set();
  while (distractors.size < 3 && distractorPool.length > 0) {
    distractors.add(distractorPool.pop());
  }
  // Pad with generic fallbacks if not enough terms were extracted
  const fallbacks = [
    'the standard protocol',
    'a common misconception',
    'an unrelated concept'
  ];
  let fi = 0;
  while (distractors.size < 3) distractors.add(fallbacks[fi++]);

  // Shuffle all options
  const opts = [targetTerm, ...distractors].sort(() => Math.random() - 0.5);
  const correctIndex = opts.indexOf(targetTerm);

  return {
    id,
    question: `In the video, "${questionText}" — which term best fills the blank?`,
    options: opts,
    correct: correctIndex,
  };
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useQuizGenerator() {
  const [quizQuestions, setQuizQuestions] = useState(null);

  /**
   * generateQuiz
   * @param {string} transcriptText — the full joined transcript from the hook
   * @param {number} count          — how many questions to generate (default 3)
   */
  const generateQuiz = useCallback((transcriptText, count = 3) => {
    if (!transcriptText || transcriptText.trim().length < 40) {
      setQuizQuestions(null);
      return;
    }

    const sentences = toSentences(transcriptText);
    if (sentences.length < 2) {
      setQuizQuestions(null);
      return;
    }

    // Sort sentences by information density and pick top-N
    const ranked = [...sentences]
      .map(s => ({ s, score: scoreS(s) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(count, 5));

    // Collect all key terms across top sentences for distractor pool
    const allTerms = ranked.flatMap(({ s }) => extractKeyTerms(s));

    // Build questions
    const questions = [];
    for (const { s } of ranked) {
      if (questions.length >= count) break;
      const q = buildQuestion(s, questions.length + 1, allTerms);
      if (q) questions.push(q);
    }

    // If we couldn't extract enough, fall back to comprehension questions
    while (questions.length < 2) {
      questions.push({
        id: questions.length + 1,
        question: `Based on the video, which statement best reflects the content?`,
        options: [
          sentences[0] || 'The topic was comprehensively explained.',
          'The content was purely theoretical with no examples.',
          'No conclusions were drawn during the session.',
          'The video focused on a completely unrelated subject.',
        ],
        correct: 0,
      });
    }

    setQuizQuestions(questions.slice(0, count));
  }, []);

  return { quizQuestions, generateQuiz };
}

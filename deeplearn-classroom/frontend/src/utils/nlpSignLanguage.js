/**
 * nlpSignLanguage.js
 * -------------------
 * NLP module to convert English text into ASL-like grammar sequences.
 * Handles sentence splitting, stop-word removal, and keyword recognition.
 */

const STOP_WORDS = new Set(["a", "an", "the", "is", "are", "am", "be", "to", "in", "on", "at", "it"]);

// Simple keyword mapping to gesture categories used by our avatar
const ASL_KEYWORD_MAP = {
  // Greetings
  hello: 'wave', hi: 'wave', welcome: 'wave',
  // Affirmation
  yes: 'yes', correct: 'yes', right: 'yes', good: 'yes', great: 'yes', okay: 'yes',
  // Negation
  no: 'no', wrong: 'no', not: 'no', never: 'no', bad: 'no',
  // Numbers
  one: 'count', two: 'count', three: 'count', four: 'count', five: 'count', first: 'count',
  // Explanation / Action
  because: 'explain', means: 'explain', explain: 'explain', show: 'explain', help: 'explain', make: 'explain',
  // Question
  what: 'question', which: 'question', how: 'question', why: 'question', who: 'question', where: 'question',
  // Cognition
  think: 'think', understand: 'think', know: 'think', remember: 'think', learn: 'think',
  // Attention
  look: 'point', see: 'point', focus: 'point', there: 'point', attention: 'point'
};

/**
 * Translates an English sentence into an ASL-simplified sequence of signs.
 * @param {string} text The spoken text
 * @returns {Array<{word: string, gesture: string}>} Array of signs
 */
export function translateToASL(text) {
  if (!text) return [];

  // 1. Sentence splitting and tokenization
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);

  // 2. Grammar simplification (remove stop words)
  const filteredTokens = tokens.filter(word => word && !STOP_WORDS.has(word));

  // 3. Keyword recognition and mapping
  const sequence = filteredTokens.map(word => {
    // Map to known gesture or default to 'talk' (generic signing)
    const gesture = ASL_KEYWORD_MAP[word] || 'talk';
    return { word: word.toUpperCase(), gesture };
  });

  return sequence;
}

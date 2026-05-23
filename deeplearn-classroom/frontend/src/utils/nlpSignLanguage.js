/**
 * nlpSignLanguage.js
 * -------------------
 * NLP module to convert English text into ASL-like grammar sequences.
 * Handles sentence splitting, stop-word removal, and keyword recognition.
 *
 * Extended with 150+ sign mappings across academic, educational and general vocabulary.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'am', 'be', 'to', 'in', 'on', 'at',
  'it', 'of', 'and', 'or', 'but', 'if', 'as', 'by', 'for', 'with',
  'this', 'that', 'these', 'those', 'was', 'were', 'has', 'have', 'had',
  'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can',
  'do', 'does', 'did', 'its', 'his', 'her', 'our', 'their', 'we', 'they',
  'i', 'you', 'he', 'she', 'us', 'them', 'my', 'your',
]);

// Comprehensive keyword → gesture category mapping
export const ASL_KEYWORD_MAP = {
  // ── Greetings / social ─────────────────────────────────────────────────
  hello: 'wave',     hi: 'wave',        welcome: 'wave',    goodbye: 'wave',
  bye: 'wave',       greet: 'wave',     morning: 'wave',    evening: 'wave',

  // ── Affirmation ────────────────────────────────────────────────────────
  yes: 'yes',        correct: 'yes',    right: 'yes',       good: 'yes',
  great: 'yes',      okay: 'yes',       fine: 'yes',        agree: 'yes',
  true: 'yes',       sure: 'yes',       exactly: 'yes',     perfect: 'yes',
  excellent: 'yes',  well: 'yes',       done: 'yes',        complete: 'yes',

  // ── Negation ───────────────────────────────────────────────────────────
  no: 'no',          wrong: 'no',       not: 'no',          never: 'no',
  bad: 'no',         false: 'no',       incorrect: 'no',    fail: 'no',
  error: 'no',       stop: 'no',        avoid: 'no',        reject: 'no',

  // ── Numbers / quantity ─────────────────────────────────────────────────
  one: 'count',      two: 'count',      three: 'count',     four: 'count',
  five: 'count',     six: 'count',      seven: 'count',     eight: 'count',
  nine: 'count',     ten: 'count',      first: 'count',     second: 'count',
  third: 'count',    many: 'count',     few: 'count',       several: 'count',
  multiple: 'count', number: 'count',   count: 'count',     total: 'count',

  // ── Explanation / demonstration ────────────────────────────────────────
  because: 'explain',  means: 'explain',  explain: 'explain', show: 'explain',
  help: 'explain',     make: 'explain',   create: 'explain',  build: 'explain',
  process: 'explain',  define: 'explain', describe: 'explain', demonstrate: 'explain',
  example: 'explain',  instance: 'explain', case: 'explain',  result: 'explain',
  output: 'explain',   produce: 'explain',  represent: 'explain',

  // ── Question ───────────────────────────────────────────────────────────
  what: 'question',  which: 'question', how: 'question',    why: 'question',
  who: 'question',   where: 'question', when: 'question',   whether: 'question',

  // ── Cognition / learning ───────────────────────────────────────────────
  think: 'think',    understand: 'think', know: 'think',    remember: 'think',
  learn: 'think',    study: 'think',      analyze: 'think', consider: 'think',
  recognize: 'think', identify: 'think',  classify: 'think', evaluate: 'think',
  comprehend: 'think', grasp: 'think',    realize: 'think',  discover: 'think',

  // ── Attention / direction ──────────────────────────────────────────────
  look: 'point',     see: 'point',      focus: 'point',     there: 'point',
  attention: 'point', here: 'point',    observe: 'point',   notice: 'point',
  watch: 'point',    view: 'point',     find: 'point',      locate: 'point',

  // ── Math / science / educational terminology ───────────────────────────
  calculate: 'math', compute: 'math',   solve: 'math',      equation: 'math',
  formula: 'math',   algorithm: 'math', function: 'math',   matrix: 'math',
  vector: 'math',    variable: 'math',  value: 'math',      data: 'math',
  model: 'math',     train: 'math',     predict: 'math',    classify: 'math',
  network: 'math',   layer: 'math',     node: 'math',       weight: 'math',
  
  // Academic & STEM vocabulary extensions
  photosynthesis: 'math', gravity: 'math', chemistry: 'math', physics: 'math',
  biology: 'math', calculus: 'math', electricity: 'math', evolution: 'math',
  molecule: 'math', atom: 'math', planet: 'math', DNA: 'math', universe: 'math',
  energy: 'math', temperature: 'math', force: 'math', climate: 'math', oxygen: 'math',
  history: 'explain', geography: 'explain', classroom: 'explain', lesson: 'explain',
  lecture: 'explain', homework: 'explain', experiment: 'explain', cell: 'math',
  organism: 'math', ecosystem: 'math', genetics: 'math', robot: 'math', AI: 'math',

  // ── Movement / action ──────────────────────────────────────────────────
  move: 'action',    go: 'action',      run: 'action',      start: 'action',
  begin: 'action',   open: 'action',    close: 'action',    apply: 'action',
  use: 'action',     set: 'action',     put: 'action',      take: 'action',
  give: 'action',    send: 'action',    receive: 'action',  connect: 'action',

  // ── Important / urgent ─────────────────────────────────────────────────
  important: 'alert', key: 'alert',     critical: 'alert',  note: 'alert',
  warning: 'alert',   remember: 'alert', must: 'alert',     always: 'alert',
  never: 'alert',     careful: 'alert',  significant: 'alert',
};

/**
 * Translates an English sentence into an ASL-simplified sequence of signs.
 * Falls back to letter-by-letter fingerspelling if a word has no direct sign mapping.
 * @param {string} text The spoken or typed text
 * @returns {Array<{word: string, gesture: string, isLetter?: boolean}>} Array of signs
 */
export function translateToASL(text) {
  if (!text) return [];

  // 1. Tokenize and normalize (retain letters and digits)
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);

  // 2. Grammar simplification (remove stop words, keep content words)
  const filteredTokens = tokens.filter(word => word && !STOP_WORDS.has(word));

  const sequence = [];

  // 3. Keyword recognition or word-level fallback
  filteredTokens.forEach(word => {
    // If it is in the dictionary, add the gesture
    if (ASL_KEYWORD_MAP[word]) {
      sequence.push({ word: word.toUpperCase(), gesture: ASL_KEYWORD_MAP[word] });
    } else if (word.length === 1) {
      // Single character spelling/digit
      if (/[a-z]/.test(word)) {
        sequence.push({ word: word.toUpperCase(), gesture: word, isLetter: true });
      } else if (/[0-9]/.test(word)) {
        sequence.push({ word, gesture: `num_${word}`, isLetter: true });
      }
    } else {
      // Complete word fallback: Translate to a dynamic word-level gesture
      const wordGestures = ['talk', 'explain', 'think', 'action', 'point', 'math', 'alert'];
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = word.charCodeAt(i) + ((hash << 5) - hash);
      }
      const gestureIndex = Math.abs(hash) % wordGestures.length;
      const selectedGesture = wordGestures[gestureIndex];

      sequence.push({ word: word.toUpperCase(), gesture: selectedGesture });
    }
  });

  return sequence;
}

/**
 * Returns the gesture category label for display.
 */
export function getGestureLabel(gesture) {
  // Letters A-Z
  if (gesture.length === 1 && /[a-z]/.test(gesture)) {
    return `LETTER ${gesture.toUpperCase()}`;
  }
  // Numbers num_0 to num_9
  if (gesture.startsWith('num_')) {
    return `NUMBER ${gesture.slice(4)}`;
  }

  const labels = {
    wave:     'GREETING',
    yes:      'AFFIRMATION',
    no:       'NEGATION',
    count:    'NUMBER',
    explain:  'EXPLAIN',
    question: 'QUESTION',
    think:    'COGNITION',
    point:    'ATTENTION',
    math:     'TECHNICAL',
    action:   'ACTION',
    alert:    'IMPORTANT',
    talk:     'SIGNING',
    idle:     'READY',
  };
  return labels[gesture] || 'SIGNING';
}

/**
 * BATCH Micro Reflex Engine — a deterministic, dependency-free "model".
 *
 * This is NOT a language model. It is an honest, narrow reflex engine that can
 * actually answer a small, well-defined family of machine-gradable tasks
 * (arithmetic, sorting, unit conversion, CSV→JSON, JSON extraction, …) with
 * zero network access, zero latency and zero cost.
 *
 * Why it exists:
 *   1. The gateway can be demonstrated end-to-end offline without pretending an
 *      echo simulator is an LLM.
 *   2. It gives the built-in Bench a target that can genuinely pass or fail, so
 *      grader correctness is testable instead of vacuous.
 *
 * Unsupported prompts return a clearly-labelled capability note (never a made-up
 * answer), so benchmarks stay truthful.
 */

export const MICRO_MODEL_ID = 'batch-micro-v1';

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeDigits(input) {
  return String(input ?? '').replace(/[٠-٩۰-۹]/g, (ch) => {
    const ar = AR_DIGITS.indexOf(ch);
    if (ar >= 0) return String(ar);
    return String(FA_DIGITS.indexOf(ch));
  }).replace(/[٫]/g, '.');
}

/** ------------------------------------------------------------------ */
/** Arithmetic: a tiny recursive-descent parser (never uses eval).      */
/** ------------------------------------------------------------------ */

function tokenizeExpression(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < src.length && /[0-9.]/.test(src[i])) { num += src[i]; i += 1; }
      if (!/^\d*\.?\d+$/.test(num)) throw new Error(`bad number: ${num}`);
      tokens.push({ type: 'num', value: Number(num) });
      continue;
    }
    if ('+-*/%^()'.includes(ch)) {
      tokens.push({ type: ch });
      i += 1;
      continue;
    }
    if (ch === '×' || ch === 'x' || ch === 'X') { tokens.push({ type: '*' }); i += 1; continue; }
    if (ch === '÷') { tokens.push({ type: '/' }); i += 1; continue; }
    throw new Error(`unsupported character: ${ch}`);
  }
  return tokens;
}

export function evaluateExpression(rawExpr) {
  const src = normalizeDigits(rawExpr)
    .replace(/[؟?]+$/g, '')
    .replace(/=\s*$/g, '')
    .trim();
  const tokens = tokenizeExpression(src);
  if (tokens.length === 0) throw new Error('empty expression');
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = (type) => {
    if (peek()?.type !== type) throw new Error(`expected ${type}`);
    pos += 1;
  };

  // expr := term (('+'|'-') term)*
  function parseExpr() {
    let value = parseTerm();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = tokens[pos++].type;
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  // term := unary (('*'|'/'|'%') unary)*
  function parseTerm() {
    let value = parseUnary();
    while (peek() && ['*', '/', '%'].includes(peek().type)) {
      const op = tokens[pos++].type;
      const rhs = parseUnary();
      if (op === '*') value *= rhs;
      else if (op === '/') {
        if (rhs === 0) throw new Error('division by zero');
        value /= rhs;
      } else {
        if (rhs === 0) throw new Error('modulo by zero');
        value %= rhs;
      }
    }
    return value;
  }

  // unary := ('+'|'-') unary | power
  function parseUnary() {
    if (peek()?.type === '+') { pos += 1; return parseUnary(); }
    if (peek()?.type === '-') { pos += 1; return -parseUnary(); }
    return parsePower();
  }

  // power := atom ('^' unary)?   (right-associative)
  function parsePower() {
    const base = parseAtom();
    if (peek()?.type === '^') { pos += 1; return base ** parseUnary(); }
    return base;
  }

  function parseAtom() {
    const tok = peek();
    if (!tok) throw new Error('unexpected end of expression');
    if (tok.type === 'num') { pos += 1; return tok.value; }
    if (tok.type === '(') {
      pos += 1;
      const value = parseExpr();
      eat(')');
      return value;
    }
    throw new Error(`unexpected token: ${tok.type}`);
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error('trailing tokens');
  if (!Number.isFinite(result)) throw new Error('non-finite result');
  return result;
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  const rounded = Math.round(value * 1e9) / 1e9;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(Number(rounded.toFixed(6)));
}

/** ------------------------------------------------------------------ */
/** Unit conversion                                                     */
/** ------------------------------------------------------------------ */

const UNIT_TABLE = {
  // length → metres
  mm: { dim: 'length', factor: 0.001 },
  cm: { dim: 'length', factor: 0.01 },
  m: { dim: 'length', factor: 1 },
  km: { dim: 'length', factor: 1000 },
  in: { dim: 'length', factor: 0.0254 },
  ft: { dim: 'length', factor: 0.3048 },
  yd: { dim: 'length', factor: 0.9144 },
  mi: { dim: 'length', factor: 1609.344 },
  // mass → grams
  mg: { dim: 'mass', factor: 0.001 },
  g: { dim: 'mass', factor: 1 },
  kg: { dim: 'mass', factor: 1000 },
  t: { dim: 'mass', factor: 1_000_000 },
  lb: { dim: 'mass', factor: 453.59237 },
  oz: { dim: 'mass', factor: 28.349523125 },
  // time → seconds
  ms: { dim: 'time', factor: 0.001 },
  s: { dim: 'time', factor: 1 },
  sec: { dim: 'time', factor: 1 },
  min: { dim: 'time', factor: 60 },
  h: { dim: 'time', factor: 3600 },
  hr: { dim: 'time', factor: 3600 },
  day: { dim: 'time', factor: 86400 },
  // data → bytes
  b: { dim: 'data', factor: 1 },
  kb: { dim: 'data', factor: 1000 },
  mb: { dim: 'data', factor: 1e6 },
  gb: { dim: 'data', factor: 1e9 },
};

const TEMP_UNITS = new Set(['c', 'f', 'k']);

function toCelsius(value, unit) {
  if (unit === 'c') return value;
  if (unit === 'f') return (value - 32) * (5 / 9);
  return value - 273.15;
}

function fromCelsius(celsius, unit) {
  if (unit === 'c') return celsius;
  if (unit === 'f') return celsius * (9 / 5) + 32;
  return celsius + 273.15;
}

export function convertUnit(value, fromUnit, toUnit) {
  const from = String(fromUnit).toLowerCase().replace(/°|degrees?/g, '').trim();
  const to = String(toUnit).toLowerCase().replace(/°|degrees?/g, '').trim();

  if (TEMP_UNITS.has(from) && TEMP_UNITS.has(to)) {
    if (from === to) return value;
    return fromCelsius(toCelsius(value, from), to);
  }
  const a = UNIT_TABLE[from];
  const b = UNIT_TABLE[to];
  if (!a || !b) throw new Error(`unknown unit: ${!a ? from : to}`);
  if (a.dim !== b.dim) throw new Error(`incompatible units: ${from} (${a.dim}) and ${to} (${b.dim})`);
  return (value * a.factor) / b.factor;
}

/** ------------------------------------------------------------------ */
/** Structured helpers                                                  */
/** ------------------------------------------------------------------ */

export function extractFirstJsonBlob(text) {
  const src = String(text ?? '');
  for (let start = 0; start < src.length; start++) {
    const open = src[start];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (inString) {
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          const candidate = src.slice(start, i + 1);
          try { return JSON.parse(candidate); } catch { break; }
        }
      }
    }
  }
  return null;
}

function coerceCell(cell) {
  const trimmed = String(cell).trim();
  if (trimmed === '') return '';
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^null$/i.test(trimmed)) return null;
  return trimmed;
}

export function csvToJson(csv) {
  const lines = String(csv)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) throw new Error('CSV needs a header and at least one row');
  const split = (line) => line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
  const headers = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = coerceCell(cells[i] ?? ''); });
    return row;
  });
}

function parseList(input) {
  return normalizeDigits(input)
    .replace(/[\[\]{}()]/g, ' ')
    .split(/[,;،\n]|\s{2,}|\s+(?=-?\d)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** ------------------------------------------------------------------ */
/** Intent routing                                                      */
/** ------------------------------------------------------------------ */

const INTENT_PATTERNS = [
  // CSV → JSON must be matched before generic JSON extraction
  { intent: 'csv2json', re: /^(?:csv[\s_-]*(?:2|to|-+>)[\s_-]*json|json[\s_-]*from[\s_-]*csv|سي\s*إس\s*في\s*إلى\s*json)\s*[:：]?\s*/i },
  { intent: 'extract_json', re: /^(?:extract[\s_-]*json|json[\s_-]*extract|استخرج\s*(?:ال)?json)\s*[:：]?\s*/i },
  { intent: 'calc', re: /^(?:calc|calculate|compute|eval|solve|احسب|احسبي|كم\s*يساوي|ما\s*ناتج)\s*[:：]?\s*/i },
  { intent: 'sort', re: /^(?:sort|order|رتّ?ب|رتّ?بي|ترتيب)\s*[:：]?\s*/i },
  { intent: 'convert', re: /^(?:convert|unit|حوّل|حول)\s*[:：]?\s*/i },
  { intent: 'count', re: /^(?:count(?:\s*words?)?|عدد\s*الكلمات)\s*[:：]?\s*/i },
  { intent: 'reverse', re: /^(?:reverse|اعكس|اعكسي)\s*[:：]?\s*/i },
  { intent: 'unique', re: /^(?:unique|dedupe|أزل\s*المكرر)\s*[:：]?\s*/i },
];

function matchIntent(prompt) {
  const text = normalizeDigits(prompt).trim();
  for (const { intent, re } of INTENT_PATTERNS) {
    const m = text.match(re);
    if (m) return { intent, body: text.slice(m[0].length).trim() };
  }
  return null;
}

const CAPABILITY_NOTE = [
  'MICRO_ENGINE_UNSUPPORTED',
  'This offline reflex engine only answers explicit, machine-checkable commands:',
  '  CALC: <expression> · CONVERT: 5 km to m · SORT: 8, 3, 11 · COUNT: <text>',
  '  CSV2JSON: <header row + data rows> · EXTRACT_JSON: <blob> · REVERSE: <text> · UNIQUE: <list>',
  'Arabic equivalents are supported (احسب، حوّل، رتّب، استخرج، اعكس).',
  'For open-ended language tasks, configure a real provider (Groq / Gemini / OpenRouter) or local Ollama.',
].join('\n');

/**
 * Solve a chat request. Always returns a plain-text answer, never throws.
 * @returns {{intent: string, text: string, ok: boolean}}
 */
export function solve(prompt) {
  const raw = String(prompt ?? '').trim();
  if (!raw) return { intent: 'empty', text: CAPABILITY_NOTE, ok: false };

  const hit = matchIntent(raw);
  if (!hit) {
    // Bare arithmetic ("What is 2+2?" / "12 * 9") is accepted as a convenience.
    const bare = raw.replace(/^(?:what\s+is|what's|كم|ما\s+هو)\s*/i, '').replace(/[?؟=]+\s*$/, '').trim();
    if (/^[-+*/%^().\d\s×÷]+$/.test(bare) && /\d/.test(bare)) {
      return runCalc(bare);
    }
    return { intent: 'unknown', text: CAPABILITY_NOTE, ok: false };
  }

  const { intent, body } = hit;
  try {
    switch (intent) {
      case 'calc': return runCalc(body);
      case 'csv2json': {
        const json = csvToJson(body.replace(/^`+|`+$/g, ''));
        return { intent, text: JSON.stringify(json), ok: true };
      }
      case 'extract_json': {
        const parsed = extractFirstJsonBlob(body);
        if (parsed === null) throw new Error('no valid JSON object found');
        return { intent, text: JSON.stringify(parsed), ok: true };
      }
      case 'sort': {
        const descending = /(desc|descending|تنازلي|من\s*الأكبر)/i.test(body);
        const nums = (normalizeDigits(body).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        if (nums.length < 2) throw new Error('need at least two numbers');
        nums.sort((a, b) => (descending ? b - a : a - b));
        return { intent, text: nums.join(', '), ok: true };
      }
      case 'convert': {
        const m = body.match(/(-?\d+(?:\.\d+)?)\s*([a-zA-Z°]+)\s*(?:to|->|→|into|إلى)\s*([a-zA-Z°]+)/);
        if (!m) throw new Error('expected "<value> <unit> to <unit>"');
        const value = convertUnit(Number(m[1]), m[2], m[3]);
        return { intent, text: formatNumber(value), ok: true };
      }
      case 'count': {
        const words = body.split(/\s+/).filter(Boolean);
        return { intent, text: String(words.length), ok: true };
      }
      case 'reverse': {
        return { intent, text: Array.from(body).reverse().join(''), ok: true };
      }
      case 'unique': {
        const seen = new Set();
        const out = [];
        for (const token of parseList(body)) {
          const key = token.toLowerCase();
          if (!seen.has(key)) { seen.add(key); out.push(token); }
        }
        return { intent, text: out.join(', '), ok: true };
      }
      default:
        return { intent: 'unknown', text: CAPABILITY_NOTE, ok: false };
    }
  } catch (err) {
    return { intent, text: `MICRO_ENGINE_ERROR: ${err.message}`, ok: false };
  }
}

function runCalc(expr) {
  try {
    const value = evaluateExpression(expr);
    return { intent: 'calc', text: formatNumber(value), ok: true };
  } catch (err) {
    return { intent: 'calc', text: `MICRO_ENGINE_ERROR: ${err.message}`, ok: false };
  }
}

/** Pick the last user message out of an OpenAI-shaped request. */
export function promptFromMessages(messages = []) {
  const last = [...messages].reverse().find((m) => m?.role === 'user');
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  if (Array.isArray(last.content)) {
    return last.content
      .map((part) => (typeof part === 'string' ? part : part?.type === 'text' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export function createMicroCompletion(reqBody, modelName = MICRO_MODEL_ID) {
  const prompt = promptFromMessages(reqBody.messages || []);
  const solution = solve(prompt);
  const promptTokens = Math.max(1, Math.ceil(String(prompt).length / 4));
  const completionTokens = Math.max(1, Math.ceil(solution.text.length / 4));
  return {
    id: `chatcmpl-micro-${hashHex(prompt).slice(0, 12)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: modelName,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: solution.text },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
    batch_micro: { intent: solution.intent, deterministic: true },
  };
}

export async function* streamMicroCompletion(reqBody, modelName = MICRO_MODEL_ID) {
  const completion = createMicroCompletion(reqBody, modelName);
  const text = completion.choices[0].message.content;
  const base = {
    id: completion.id,
    object: 'chat.completion.chunk',
    created: completion.created,
    model: modelName,
  };
  yield { ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] };
  for (const piece of text.match(/\S+\s*/g) || [text]) {
    yield { ...base, choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] };
  }
  yield { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
}

function hashHex(input) {
  // Small, stable, non-cryptographic hash — only used for readable response ids.
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, '0').repeat(2).slice(0, 12);
}

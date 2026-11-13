/**
 * Deterministic graders for the BATCH Bench.
 *
 * Every grader returns { passed, score, detail }. `score` is 0..1 so partial
 * credit (e.g. a JSON object with 3 of 4 keys right) is visible instead of a
 * flat pass/fail. Graders never call a model — an LLM grading an LLM is how
 * benchmark numbers stop meaning anything.
 */

export function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u200f|\u200e/g, '')
    .replace(/[٠-٩]/g, (ch) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)))
    .replace(/[،]/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripFences(value) {
  const text = String(value ?? '').trim();
  const fenced = text.match(/```(?:json|javascript|js|txt|text)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : text;
}

/** Pull the first balanced JSON value out of arbitrary text. */
export function extractJson(value) {
  const text = stripFences(value);
  try { return JSON.parse(text); } catch { /* keep trying */ }
  for (let start = 0; start < text.length; start++) {
    const open = text[start];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
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
          try { return JSON.parse(text.slice(start, i + 1)); } catch { break; }
        }
      }
    }
  }
  return undefined;
}

function deepSubset(actual, expected, path = '$') {
  const mismatches = [];
  if (expected === null || typeof expected !== 'object') {
    if (actual !== expected) mismatches.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    return mismatches;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      mismatches.push(`${path}: expected array, got ${typeof actual}`);
      return mismatches;
    }
    if (actual.length !== expected.length) {
      mismatches.push(`${path}: expected length ${expected.length}, got ${actual.length}`);
    }
    const len = Math.min(actual.length, expected.length);
    for (let i = 0; i < len; i++) mismatches.push(...deepSubset(actual[i], expected[i], `${path}[${i}]`));
    return mismatches;
  }
  if (typeof actual !== 'object' || actual === null) {
    mismatches.push(`${path}: expected object, got ${JSON.stringify(actual)}`);
    return mismatches;
  }
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (!(key in actual)) {
      mismatches.push(`${path}.${key}: missing`);
      continue;
    }
    mismatches.push(...deepSubset(actual[key], expectedValue, `${path}.${key}`));
  }
  return mismatches;
}

const GRADERS = {
  exact({ expected, actual }) {
    const ok = normalizeText(actual) === normalizeText(expected);
    return { passed: ok, score: ok ? 1 : 0, detail: ok ? 'exact match' : `expected "${expected}"` };
  },

  numeric({ expected, actual, tolerance = 1e-6 }) {
    const numbers = normalizeText(actual).match(/-?\d+(?:\.\d+)?/g) || [];
    if (numbers.length === 0) return { passed: false, score: 0, detail: 'no number in output' };
    // Prefer an exact in-range hit anywhere in the answer; models often narrate.
    const hit = numbers.map(Number).find((n) => Math.abs(n - Number(expected)) <= tolerance);
    if (hit === undefined) {
      return {
        passed: false,
        score: 0,
        detail: `expected ≈${expected}, got ${numbers.slice(0, 5).join(', ')}`,
      };
    }
    return { passed: true, score: 1, detail: `found ${hit}` };
  },

  contains_all({ expected, actual }) {
    const haystack = normalizeText(actual).toLowerCase();
    const needles = (Array.isArray(expected) ? expected : [expected]).map((n) => normalizeText(n).toLowerCase());
    const missing = needles.filter((n) => !haystack.includes(n));
    const score = needles.length === 0 ? 1 : (needles.length - missing.length) / needles.length;
    return {
      passed: missing.length === 0,
      score,
      detail: missing.length ? `missing: ${missing.join(', ')}` : 'all terms present',
    };
  },

  regex({ expected, actual, flags = 'i' }) {
    const re = new RegExp(expected, flags);
    const ok = re.test(stripFences(actual));
    return { passed: ok, score: ok ? 1 : 0, detail: ok ? `matched /${expected}/` : `did not match /${expected}/` };
  },

  sequence({ expected, actual, delimiter = /[,\n;]+/ }) {
    const actualList = normalizeText(stripFences(actual))
      .split(delimiter)
      .map((v) => v.trim())
      .filter(Boolean);
    const expectedList = expected.map((v) => normalizeText(v));
    const ok = actualList.length === expectedList.length
      && actualList.every((v, i) => v.toLowerCase() === expectedList[i].toLowerCase());
    const prefix = expectedList.filter((v, i) => (actualList[i] || '').toLowerCase() === v.toLowerCase()).length;
    return {
      passed: ok,
      score: ok ? 1 : prefix / (expectedList.length || 1),
      detail: ok ? 'ordered sequence match' : `expected [${expectedList.join(', ')}], got [${actualList.join(', ')}]`,
    };
  },

  json({ expected, actual }) {
    const parsed = extractJson(actual);
    if (parsed === undefined) {
      return { passed: false, score: 0, detail: 'output is not valid JSON' };
    }
    const mismatches = deepSubset(parsed, expected);
    const total = countLeaves(expected) || 1;
    const score = Math.max(0, (total - mismatches.length) / total);
    return {
      passed: mismatches.length === 0,
      score,
      detail: mismatches.length ? mismatches.slice(0, 3).join('; ') : 'JSON subset match',
    };
  },

  set_equals({ expected, actual, delimiter = /[,\n;]/ }) {
    const norm = (list) => list.map((v) => normalizeText(v).toLowerCase()).filter(Boolean).sort();
    const actualList = norm(normalizeText(stripFences(actual)).split(delimiter));
    const expectedList = norm(expected);
    const ok = actualList.length === expectedList.length && actualList.every((v, i) => v === expectedList[i]);
    const overlap = expectedList.filter((v) => actualList.includes(v)).length;
    const score = expectedList.length === 0 ? 0 : overlap / expectedList.length;
    return {
      passed: ok,
      score: ok ? 1 : score,
      detail: ok ? 'set match' : `expected {${expectedList.join(', ')}}, got {${actualList.join(', ')}}`,
    };
  },
};

function countLeaves(value) {
  if (value === null || typeof value !== 'object') return 1;
  if (Array.isArray(value)) return value.reduce((sum, v) => sum + countLeaves(v), 0);
  return Object.values(value).reduce((sum, v) => sum + countLeaves(v), 0);
}

export const GRADER_TYPES = Object.keys(GRADERS);

/**
 * Detect the cheapest way to fake a benchmark: repeating the question.
 * An echoing provider contains the prompt verbatim, so any grader that scans
 * for numbers/terms would hand out free points. Reject the answer outright.
 */
export function echoesPrompt(output, prompt) {
  const out = normalizeText(output).toLowerCase();
  const ask = normalizeText(prompt).toLowerCase();
  if (!out || ask.length < 12) return false;
  return out.includes(ask);
}

/**
 * @param {{type: string}} spec  grader spec from a suite
 * @param {string} output        raw model output
 * @param {{prompt?: string}} [context]
 */
export function grade(spec, output, context = {}) {
  const grader = GRADERS[spec?.type];
  if (!grader) {
    return { passed: false, score: 0, detail: `unknown grader "${spec?.type}"` };
  }
  if (context.prompt && echoesPrompt(output, context.prompt)) {
    return { passed: false, score: 0, detail: 'output repeats the prompt instead of answering' };
  }
  try {
    return grader({ ...spec, actual: output });
  } catch (err) {
    return { passed: false, score: 0, detail: `grader error: ${err.message}` };
  }
}

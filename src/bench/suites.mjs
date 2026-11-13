/**
 * BATCH Bench suites.
 *
 * Design rules (deliberate, and the reason these numbers are worth trusting):
 *   - Every case is gradable *mechanically* — no LLM judge, no vibes.
 *   - Prompts are answerable by a decent general model and by the offline
 *     Micro Reflex Engine, so the bench works with zero API keys.
 *   - Cases are short: the bench measures routing, graders and latency, not
 *     the model's ability to write a novel.
 */

export const BENCH_SUITES = [
  {
    id: 'reflex-core',
    name: 'Reflex Core (arithmetic & transforms)',
    description: 'Operator precedence, unit conversion, ordering, counting and text transforms in English.',
    cases: [
      {
        id: 'arith-precedence',
        prompt: 'CALC: 37 * 43 + 11',
        grader: { type: 'numeric', expected: 1602 },
        tags: ['math'],
      },
      {
        id: 'arith-parens',
        prompt: 'CALC: (128 - 48) / 5 + 2^5',
        grader: { type: 'numeric', expected: 48 },
        tags: ['math', 'precedence'],
      },
      {
        id: 'arith-negative',
        prompt: 'CALC: -7 * (3 - 9) + 4',
        grader: { type: 'numeric', expected: 46 },
        tags: ['math', 'unary'],
      },
      {
        id: 'arith-modulo',
        prompt: 'CALC: 101 % 7',
        grader: { type: 'numeric', expected: 3 },
        tags: ['math'],
      },
      {
        id: 'convert-length',
        prompt: 'CONVERT: 5 km to m',
        grader: { type: 'numeric', expected: 5000 },
        tags: ['units'],
      },
      {
        id: 'convert-temp',
        prompt: 'CONVERT: 98.6 F to C',
        grader: { type: 'numeric', expected: 37, tolerance: 1e-6 },
        tags: ['units', 'float'],
      },
      {
        id: 'sort-ascending',
        prompt: 'SORT: 8, 3, 11, 5, 2',
        grader: { type: 'sequence', expected: ['2', '3', '5', '8', '11'] },
        tags: ['ordering'],
      },
      {
        id: 'sort-descending-decimals',
        prompt: 'SORT: 2.5, 10.25, 0.75, 7.1 (descending)',
        grader: { type: 'sequence', expected: ['10.25', '7.1', '2.5', '0.75'] },
        tags: ['ordering', 'float'],
      },
      {
        id: 'count-words',
        prompt: 'COUNT: resilient gateways fail over before users notice',
        grader: { type: 'exact', expected: '7' },
        tags: ['text'],
      },
      {
        id: 'reverse-text',
        prompt: 'REVERSE: BATCH',
        grader: { type: 'exact', expected: 'HCTAB' },
        tags: ['text'],
      },
      {
        id: 'unique-tokens',
        prompt: 'UNIQUE: alpha, beta, alpha, gamma, Beta',
        grader: { type: 'set_equals', expected: ['alpha', 'beta', 'gamma'] },
        tags: ['text', 'dedupe'],
      },
      {
        id: 'arith-nested',
        prompt: 'CALC: ((14 + 6) * 3 - 10) / 5',
        grader: { type: 'numeric', expected: 10 },
        tags: ['math'],
      },
    ],
  },
  {
    id: 'structured-data',
    name: 'Structured Data (CSV→JSON, extraction, shape)',
    description: 'Deterministic serialisation and extraction — the tasks agents actually chain together.',
    cases: [
      {
        id: 'csv-people',
        prompt: 'CSV2JSON:\nname,age\nAda,36\nLinus,55',
        grader: { type: 'json', expected: [{ name: 'Ada', age: 36 }, { name: 'Linus', age: 55 }] },
        tags: ['json'],
      },
      {
        id: 'csv-semicolon',
        prompt: 'CSV2JSON:\nservice,rpm,healthy\ngroq;30;true\ngemini;15;false',
        grader: {
          type: 'json',
          expected: [{ service: 'groq', rpm: 30, healthy: true }, { service: 'gemini', rpm: 15, healthy: false }],
        },
        tags: ['json', 'coercion'],
      },
      {
        id: 'extract-object',
        prompt: 'EXTRACT_JSON: upstream said {"provider":"groq","latency_ms":42,"ok":true} and then closed',
        grader: { type: 'json', expected: { provider: 'groq', latency_ms: 42, ok: true } },
        tags: ['json', 'extraction'],
      },
      {
        id: 'extract-nested',
        prompt: 'EXTRACT_JSON: logs [[1,2],{"retry":{"after":3}}] tail',
        grader: { type: 'json', expected: [[1, 2], { retry: { after: 3 } }] },
        tags: ['json', 'nested'],
      },
      {
        id: 'extract-escaped',
        prompt: 'EXTRACT_JSON: noise {"note":"quote \\" and brace } inside string","n":2} trailing',
        grader: { type: 'json', expected: { note: 'quote " and brace } inside string', n: 2 } },
        tags: ['json', 'string'],
      },
      {
        id: 'arxiv-number',
        prompt: 'CALC: 2^10 + 24',
        grader: { type: 'numeric', expected: 1048 },
        tags: ['math', 'power'],
      },
      {
        id: 'convert-data',
        prompt: 'CONVERT: 1.5 gb to mb',
        grader: { type: 'numeric', expected: 1500 },
        tags: ['units', 'data'],
      },
      {
        id: 'sort-negative',
        prompt: 'SORT: -5, 12, -1, 0, 7',
        grader: { type: 'sequence', expected: ['-5', '-1', '0', '7', '12'] },
        tags: ['ordering', 'negative'],
      },
    ],
  },
  {
    id: 'arabic-first',
    name: 'Arabic-First (مهارات عربية)',
    description: 'أوامر عربية مباشرة: حساب، تحويل وحدات، ترتيب، عدّ الكلمات، عكس النص.',
    cases: [
      {
        id: 'ar-calc-simple',
        prompt: 'احسب: ٢٥ × ٤',
        grader: { type: 'numeric', expected: 100 },
        tags: ['ar', 'math'],
      },
      {
        id: 'ar-calc-parens',
        prompt: 'احسب: (١٤ + ٦) × ٣ - ١٠',
        grader: { type: 'numeric', expected: 50 },
        tags: ['ar', 'math'],
      },
      {
        id: 'ar-convert',
        prompt: 'حوّل: 3 kg إلى g',
        grader: { type: 'numeric', expected: 3000 },
        tags: ['ar', 'units'],
      },
      {
        id: 'ar-sort-asc',
        prompt: 'رتّب: ٩, ٤, ١٥, ٧',
        grader: { type: 'sequence', expected: ['4', '7', '9', '15'] },
        tags: ['ar', 'ordering'],
      },
      {
        id: 'ar-sort-desc',
        prompt: 'رتّب: 9, 4, 15, 7 تنازلي',
        grader: { type: 'sequence', expected: ['15', '9', '7', '4'] },
        tags: ['ar', 'ordering'],
      },
      {
        id: 'ar-count',
        prompt: 'عدد الكلمات: البوابة الذكية تبدّل المزوّد قبل أن يشعر المستخدم',
        grader: { type: 'exact', expected: '8' },
        tags: ['ar', 'text'],
      },
      {
        id: 'ar-extract',
        prompt: 'استخرج JSON: النتيجة {"المزود":"groq","الحالة":"سليم"} انتهى',
        grader: { type: 'json', expected: { المزود: 'groq', الحالة: 'سليم' } },
        tags: ['ar', 'json'],
      },
      {
        id: 'ar-reverse',
        prompt: 'اعكس: BATCH',
        grader: { type: 'exact', expected: 'HCTAB' },
        tags: ['ar', 'text'],
      },
    ],
  },
];

export function listSuiteSummaries() {
  return BENCH_SUITES.map((suite) => ({
    id: suite.id,
    name: suite.name,
    description: suite.description,
    caseCount: suite.cases.length,
    tags: [...new Set(suite.cases.flatMap((c) => c.tags || []))].sort(),
  }));
}

export function getSuiteIds() {
  return BENCH_SUITES.map((s) => s.id);
}

export function resolveSuites(requested) {
  if (!requested || requested.length === 0) return BENCH_SUITES;
  const wanted = new Set(Array.isArray(requested) ? requested : [requested]);
  const picked = BENCH_SUITES.filter((suite) => wanted.has(suite.id));
  if (picked.length === 0) {
    throw Object.assign(new Error(`Unknown suite(s): ${[...wanted].join(', ')}`), { status: 400 });
  }
  return picked;
}

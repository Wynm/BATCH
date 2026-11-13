import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import { solve, evaluateExpression, convertUnit, MICRO_MODEL_ID } from '../src/engine/microSolver.mjs';
import { grade, echoesPrompt } from '../src/bench/graders.mjs';
import { BENCH_SUITES, listSuiteSummaries } from '../src/bench/suites.mjs';
import { BenchRunner } from '../src/bench/runner.mjs';
import { Store } from '../src/db/store.mjs';
import { GatewayRouter } from '../src/router/gateway.mjs';

/* ---------------- deterministic engine ---------------- */

test('micro engine: arithmetic honours precedence, exponents and unary minus', () => {
  assert.equal(evaluateExpression('37 * 43 + 11'), 1602);
  assert.equal(evaluateExpression('(128 - 48) / 5 + 2^5'), 48);
  assert.equal(evaluateExpression('-7 * (3 - 9) + 4'), 46);
  assert.equal(evaluateExpression('101 % 7'), 3);
  assert.equal(evaluateExpression('2^3^2'), 512); // right-associative
});

test('micro engine: rejects injection instead of evaluating code', () => {
  assert.throws(() => evaluateExpression("require('fs').rmSync('/')"));
  assert.throws(() => evaluateExpression('1 + '));
  assert.throws(() => evaluateExpression('4 / 0'));
  const out = solve("CALC: process.exit(1)");
  assert.equal(out.ok, false);
  assert.match(out.text, /MICRO_ENGINE_ERROR/);
});

test('micro engine: arabic-indic digits, arabic commands and units', () => {
  assert.equal(solve('احسب: ٢٥ × ٤').text, '100');
  assert.equal(solve('حوّل: 3 kg إلى g').text, '3000');
  assert.equal(solve('رتّب: ٩, ٤, ١٥, ٧').text, '4, 7, 9, 15');
  assert.equal(solve('رتّب: 9, 4, 15, 7 تنازلي').text, '15, 9, 7, 4');
  assert.equal(convertUnit(98.6, 'F', 'C').toFixed(6), '37.000000');
  assert.equal(convertUnit(1.5, 'gb', 'mb'), 1500);
});

test('micro engine: refuses open-ended prompts instead of hallucinating', () => {
  const out = solve('Write a haiku about distributed systems');
  assert.equal(out.ok, false);
  assert.match(out.text, /MICRO_ENGINE_UNSUPPORTED/);
  assert.match(out.text, /Ollama|Groq/);
});

/* ---------------- graders ---------------- */

test('graders: numeric, exact, sequence, set, json and partial credit', () => {
  assert.equal(grade({ type: 'numeric', expected: 48 }, 'The answer is 48.').passed, true);
  assert.equal(grade({ type: 'numeric', expected: 48 }, '49').passed, false);
  assert.equal(grade({ type: 'exact', expected: 'HCTAB' }, ' HCTAB\n').passed, true);
  assert.equal(grade({ type: 'sequence', expected: ['3', '5', '8'] }, '3, 5, 8').passed, true);
  assert.equal(grade({ type: 'sequence', expected: ['3', '5', '8'] }, '5, 3, 8').passed, false);
  assert.equal(grade({ type: 'set_equals', expected: ['a', 'b'] }, 'b, a').passed, true);

  const fenced = 'here you go\n```json\n{"service":"groq","rpm":30}\n```';
  assert.equal(grade({ type: 'json', expected: { service: 'groq' } }, fenced).passed, true);

  const partial = grade({ type: 'json', expected: { a: 1, b: { c: 2 } } }, '{"a":1,"b":{"c":9}}');
  assert.equal(partial.passed, false);
  assert.ok(partial.score > 0 && partial.score < 1, 'partial score expected');
});

test('graders: an echoed prompt can never score', () => {
  const prompt = 'CALC: (128 - 48) / 5 + 2^5';
  const echo = `Processed prompt: "${prompt}" — add a real key for live answers 48`;
  assert.equal(echoesPrompt(echo, prompt), true);
  const verdict = grade({ type: 'numeric', expected: 48 }, echo, { prompt });
  assert.equal(verdict.passed, false);
  assert.match(verdict.detail, /repeats the prompt/);
});

test('suites: ids unique, every case mechanically gradable, micro engine is self-consistent', () => {
  const ids = new Set();
  let total = 0;
  for (const suite of BENCH_SUITES) {
    for (const testCase of suite.cases) {
      assert.ok(!ids.has(testCase.id), `duplicate case id ${testCase.id}`);
      ids.add(testCase.id);
      assert.ok(testCase.grader?.type, `${testCase.id} has no grader`);
      const answer = solve(testCase.prompt);
      const verdict = grade(testCase.grader, answer.text, { prompt: testCase.prompt });
      assert.equal(verdict.passed, true, `${suite.id}/${testCase.id} should be solvable: ${answer.text} | ${verdict.detail}`);
      total += 1;
    }
  }
  assert.equal(total, listSuiteSummaries().reduce((n, s) => n + s.caseCount, 0));
  assert.ok(total >= 24, 'bench should stay meaningful');
});

/* ---------------- runner + persistence ---------------- */

test('bench runner: deterministic engine scores 100%, echo simulator scores 0%', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-bench-'));
  const store = new Store(path.join(dir, 'bench.db'), crypto.randomBytes(32), { enableDemo: true });
  const router = new GatewayRouter(store);
  const runner = new BenchRunner(store, router);

  try {
    const run = await runner.run({
      suiteIds: ['reflex-core', 'structured-data', 'arabic-first'],
      targets: ['offline-proof', `sandbox-sim/batch-sim-v1`],
      concurrency: 4,
    });

    assert.equal(run.summary.cases, 56);
    const engine = run.scorecards.find((c) => c.target === 'offline-proof');
    const echo = run.scorecards.find((c) => c.target === 'sandbox-sim/batch-sim-v1');

    assert.equal(engine.passed, engine.cases, 'deterministic engine must pass every case');
    assert.equal(engine.passRate, 1);
    assert.equal(echo.passed, 0, 'an echoing provider must score zero');
    assert.ok(engine.latencyMs.p95 < 200, 'in-process engine should be fast');
    assert.equal(run.summary.bestTarget, 'offline-proof');

    const listed = store.listBenchRuns(5);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, run.id);
    assert.equal(store.getBenchRun(run.id).summary.passed, 28);
    assert.equal(store.getBenchRun('nope'), null);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bench runner: rejects oversized runs, and with no ready provider reports routing failures', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-bench-'));
  // Demo engines disabled => nothing is ready => every case must fail honestly.
  const store = new Store(path.join(dir, 'bench.db'), crypto.randomBytes(32), { enableDemo: false });
  const runner = new BenchRunner(store, new GatewayRouter(store));

  try {
    await assert.rejects(
      () => runner.run({ suiteIds: ['reflex-core'], targets: Array.from({ length: 7 }, (_, i) => `t${i}`) }),
      /Too many targets/,
    );
    await assert.rejects(() => runner.run({ suiteIds: ['nope'] }), /Unknown suite/);

    const run = await runner.run({ suiteIds: ['arabic-first'], targets: ['does-not-exist'] });
    assert.equal(run.summary.passed, 0);
    assert.ok(run.results.every((r) => /routing failed/.test(r.detail)));
    assert.ok(run.results.every((r) => r.providerId === null));
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('provider readiness: micro engine needs no key but respects the demo switch', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-bench-'));
  const withDemo = new Store(path.join(dir, 'a.db'), crypto.randomBytes(32), { enableDemo: true });
  const withoutDemo = new Store(path.join(dir, 'b.db'), crypto.randomBytes(32), { enableDemo: false });
  try {
    assert.equal(withDemo.getProvider('micro').enabled, true);
    assert.equal(withDemo.getProvider('micro').hasApiKey, false);
    assert.equal(withoutDemo.getProvider('micro').enabled, false);
    assert.equal(withDemo.getProvider('micro').defaultModel, MICRO_MODEL_ID);
  } finally {
    withDemo.close();
    withoutDemo.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

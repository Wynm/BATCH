/**
 * BATCH Bench runner.
 *
 * Executes deterministic suites against one or more routing targets (combos or
 * provider/model pairs) through the *real* gateway router, grades every answer
 * mechanically, and produces a scorecard with pass-rate, partial score,
 * latency distribution and the provider that actually answered each case.
 *
 * Deliberate omissions: no LLM-as-judge, no "overall vibe" number, no
 * normalisation that hides failures. A target that echoes its prompt scores 0,
 * which is exactly what should happen.
 */

import crypto from 'node:crypto';
import { resolveSuites, listSuiteSummaries } from './suites.mjs';
import { grade } from './graders.mjs';

const MAX_CONCURRENCY = 8;
const MAX_TARGETS = 6;
const MAX_TASKS = 400;

export class BenchRunner {
  constructor(store, router, options = {}) {
    this.store = store;
    this.router = router;
    this.concurrency = options.concurrency ?? 4;
  }

  listSuites() {
    return listSuiteSummaries();
  }

  listRuns(limit = 20) {
    return this.store.listBenchRuns(limit);
  }

  getRun(id) {
    return this.store.getBenchRun(id);
  }

  /**
   * @param {{suiteIds?: string[], targets?: string[], concurrency?: number, name?: string}} input
   */
  async run(input = {}) {
    const suites = resolveSuites(input.suiteIds);
    const targets = normalizeTargets(input.targets);
    const concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Number(input.concurrency) || this.concurrency));

    const cases = suites.flatMap((suite) => suite.cases.map((testCase) => ({ suite, testCase })));
    const totalTasks = cases.length * targets.length;
    if (totalTasks > MAX_TASKS) {
      throw Object.assign(
        new Error(`Bench run too large: ${totalTasks} cases × targets (limit ${MAX_TASKS}). Pick fewer suites or targets.`),
        { status: 400 },
      );
    }

    const tasks = [];
    for (const target of targets) {
      for (const { suite, testCase } of cases) {
        tasks.push({ target, suite, testCase });
      }
    }

    const results = new Array(tasks.length);
    const startedAt = Date.now();
    let cursor = 0;

    const worker = async () => {
      while (cursor < tasks.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await this._runTask(tasks[index]);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));

    const run = {
      id: `bench_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      name: (input.name && String(input.name).slice(0, 120)) || `Bench ${new Date().toISOString().replace('T', ' ').slice(0, 19)}Z`,
      createdAt: startedAt,
      durationMs: Date.now() - startedAt,
      suiteIds: suites.map((s) => s.id),
      targets,
      concurrency,
      status: 'completed',
      scorecards: buildScorecards(targets, results, suites),
      results,
    };
    run.summary = summarize(run);

    this.store.saveBenchRun(run);
    return run;
  }

  async _runTask({ target, suite, testCase }) {
    const t0 = Date.now();
    let routed;
    try {
      routed = await this.router.routeChatCompletion(
        {
          model: target,
          messages: [
            ...(testCase.system ? [{ role: 'system', content: testCase.system }] : []),
            { role: 'user', content: testCase.prompt },
          ],
          temperature: 0,
          stream: false,
        },
        { 'x-batch-cache': 'bypass' },
      );
    } catch (err) {
      return {
        target,
        suiteId: suite.id,
        caseId: testCase.id,
        passed: false,
        score: 0,
        detail: `router threw: ${err.message}`,
        output: '',
        latencyMs: Date.now() - t0,
        providerId: null,
        model: null,
        error: err.message,
      };
    }

    if (!routed.ok) {
      return {
        target,
        suiteId: suite.id,
        caseId: testCase.id,
        passed: false,
        score: 0,
        detail: `routing failed: ${routed.error}`,
        output: '',
        latencyMs: Date.now() - t0,
        providerId: null,
        model: null,
        error: routed.error,
        attempts: routed.meta?.attempts ?? [],
      };
    }

    const output = routed.data?.choices?.[0]?.message?.content ?? '';
    const verdict = grade(testCase.grader, output, { prompt: testCase.prompt });
    return {
      target,
      suiteId: suite.id,
      caseId: testCase.id,
      passed: verdict.passed,
      score: Number(verdict.score.toFixed(4)),
      detail: verdict.detail,
      output: String(output).slice(0, 2000),
      latencyMs: routed.meta?.latencyMs ?? Date.now() - t0,
      providerId: routed.meta?.providerId ?? null,
      model: routed.meta?.model ?? null,
      cacheHit: Boolean(routed.meta?.cacheHit),
      fallbackCount: Array.isArray(routed.meta?.attempts) ? Math.max(0, routed.meta.attempts.length - 1) : 0,
      attempts: routed.meta?.attempts ?? [],
    };
  }
}

function normalizeTargets(targets) {
  const list = Array.isArray(targets) ? targets.filter(Boolean).map(String) : [];
  if (list.length === 0) list.push('offline-proof');
  const unique = [...new Set(list)];
  if (unique.length > MAX_TARGETS) {
    throw Object.assign(new Error(`Too many targets (limit ${MAX_TARGETS})`), { status: 400 });
  }
  return unique;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function buildScorecards(targets, results, suites) {
  return targets.map((target) => {
    const own = results.filter((r) => r.target === target);
    const latencies = own.filter((r) => !r.error).map((r) => r.latencyMs);
    const passed = own.filter((r) => r.passed).length;
    const providers = {};
    for (const r of own) {
      if (r.providerId) providers[r.providerId] = (providers[r.providerId] || 0) + 1;
    }
    return {
      target,
      cases: own.length,
      passed,
      failed: own.length - passed,
      passRate: own.length ? passed / own.length : 0,
      score: own.length ? own.reduce((sum, r) => sum + (r.score || 0), 0) / own.length : 0,
      latencyMs: {
        avg: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        max: latencies.length ? Math.max(...latencies) : 0,
      },
      fallbacks: own.reduce((sum, r) => sum + (r.fallbackCount || 0), 0),
      errors: own.filter((r) => r.error).length,
      providers,
      suites: suites.map((suite) => {
        const rows = own.filter((r) => r.suiteId === suite.id);
        const ok = rows.filter((r) => r.passed).length;
        return {
          id: suite.id,
          name: suite.name,
          cases: rows.length,
          passed: ok,
          passRate: rows.length ? ok / rows.length : 0,
        };
      }),
    };
  });
}

function summarize(run) {
  const passed = run.results.filter((r) => r.passed).length;
  const total = run.results.length;
  const score = total ? run.results.reduce((sum, r) => sum + (r.score || 0), 0) / total : 0;
  return {
    cases: total,
    passed,
    failed: total - passed,
    passRate: total ? passed / total : 0,
    score,
    bestTarget: [...run.scorecards].sort((a, b) => b.passRate - a.passRate || a.latencyMs.p95 - b.latencyMs.p95)[0]?.target ?? null,
  };
}

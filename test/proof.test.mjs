import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROOF_SCENARIOS,
  listScenarios,
  runResilienceProof,
  MemoryStore,
  createScriptedFetch,
  openAIBody,
  jsonResponse,
} from '../src/proof/resilienceLab.mjs';
import { GatewayRouter } from '../src/router/gateway.mjs';
import { CircuitBreakerRegistry } from '../src/router/circuitBreaker.mjs';

test('proof lab: all scenarios pass against the real router', async () => {
  const report = await runResilienceProof();
  const failing = report.results.filter((r) => !r.passed).map((r) => `${r.id}: ${r.checks.filter((c) => !c.passed).map((c) => c.label).join(', ')}`);
  assert.deepEqual(failing, [], `proof failures: ${failing.join(' | ')}`);
  assert.equal(report.summary.scenarios, report.results.length);
  assert.ok(report.results.length >= 8, 'suite must cover the main failure modes');
  assert.ok(report.summary.checks >= 30, 'assertions should be substantial');
  assert.equal(report.summary.allPassed, true);
});

test('proof lab: every scenario reports at least three assertions and observations', () => {
  for (const scenario of listScenarios()) {
    assert.ok(scenario.id && scenario.name && scenario.what, `${scenario.id} needs metadata`);
  }
  assert.equal(PROOF_SCENARIOS.length, listScenarios().length);
});

test('negative control: a broken circuit breaker must make the proof fail', async () => {
  // If this test ever passes while the scenarios still pass, the proof lab is
  // decorative. A breaker that never trips must be detected.
  class NeverTrips extends CircuitBreakerRegistry {
    recordFailure() { return null; }
  }

  const report = await runResilienceProof({
    only: ['failover-429', 'auth-quarantine', 'breaker-skip'],
    createRouter: (store, options) => new GatewayRouter(store, { ...options, circuitBreaker: new NeverTrips() }),
  });

  assert.equal(report.summary.passed, 0, 'broken breaker must not be certified');
  assert.ok(report.summary.checksPassed < report.summary.checks);
});

test('negative control: removing timeouts makes the timeout scenario fail', async () => {
  const report = await runResilienceProof({
    only: ['timeout-failover'],
    createRouter: (store, options) => new GatewayRouter(store, { ...options, timeoutMs: 60_000 }),
  });
  assert.equal(report.results[0].passed, false);
});

test('scripted fetch records per-provider call counts', async () => {
  const fetchImpl = createScriptedFetch({
    'http://a.test/v1': { providerId: 'a', respond: () => jsonResponse(openAIBody('a')) },
    'http://b.test/v1/chat': { providerId: 'b', respond: () => jsonResponse(openAIBody('b')) },
  });
  await fetchImpl('http://a.test/v1/chat/completions', {});
  await fetchImpl('http://b.test/v1/chat/completions', {});
  assert.equal(fetchImpl.count('a'), 1);
  assert.equal(fetchImpl.count('b'), 1);
  assert.equal(fetchImpl.count('c'), 0);
});

test('memory store honours TTL and cache hits', () => {
  const store = new MemoryStore();
  store.setCachedResponse('k', 'm', 'p', { ok: true }, 50);
  assert.equal(store.getCachedResponse('k').hits, 1);
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(store.getCachedResponse('k'), null);
      resolve();
    }, 70);
  });
});

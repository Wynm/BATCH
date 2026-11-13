import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

import { buildCacheKey } from '../src/router/cache.mjs';
import { Store } from '../src/db/store.mjs';
import { createBatchApp } from '../src/server/httpServer.mjs';

function tempStore(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-reg-'));
  const store = new Store(path.join(dir, 'r.db'), crypto.randomBytes(32), { enableDemo: true, ...overrides });
  return { store, dir };
}

test('cache key covers every sampling parameter that changes the answer', () => {
  const base = {
    targetModel: 'auto-free',
    messages: [{ role: 'user', content: 'hi' }],
    temperature: 0.2,
  };
  const key = buildCacheKey(base);
  assert.equal(key, buildCacheKey({ ...base }));

  for (const tweak of [
    { top_p: 0.5 },
    { stop: ['\n\n'] },
    { seed: 7 },
    { n: 2 },
    { presence_penalty: 0.3 },
    { frequency_penalty: 0.3 },
    { max_tokens: 16 },
    { response_format: { type: 'json_object' } },
    { tool_choice: 'auto' },
  ]) {
    assert.notEqual(key, buildCacheKey({ ...base, ...tweak }), `cache key must change for ${Object.keys(tweak)[0]}`);
  }
});

test('a rotated master key degrades per provider instead of crashing the gateway', () => {
  const { store, dir } = tempStore();
  try {
    store.db.prepare("UPDATE providers SET encrypted_api_key = 'not-a-valid-sealed-blob' WHERE id = 'groq'").run();
    const providers = store.listProviders(false);
    const groq = providers.find((p) => p.id === 'groq');
    assert.equal(Boolean(groq), true); // listProviders did not throw
    assert.equal(groq.hasApiKey, false);
    assert.ok(groq.keyError, 'the failure must be surfaced, not hidden');
    assert.equal(providers.find((p) => p.id === 'micro').enabled, true);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('HTTP: proof and bench endpoints, overview metadata, and batch size cap', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-api-'));
  const app = createBatchApp({
    host: '127.0.0.1',
    port: 0,
    dataDir: dir,
    dbPath: path.join(dir, 'api.db'),
    masterKey: crypto.randomBytes(32),
    apiKey: null,
    enableDemo: true,
    workspaceRoot: process.cwd(),
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;

  try {
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.status, 'ok');
    assert.equal(health.readyProviders, 2, 'micro + sandbox simulator are ready without keys');

    const overview = await (await fetch(`${base}/api/overview`)).json();
    assert.ok(Array.isArray(overview.benchSuites) && overview.benchSuites.length === 3);
    assert.ok(Array.isArray(overview.proofScenarios) && overview.proofScenarios.length >= 8);
    assert.equal(overview.providers.find((p) => p.id === 'micro').ready, true);
    assert.equal(overview.providers.find((p) => p.id === 'groq').ready, false);

    const proof = await (await fetch(`${base}/api/proof/run`, { method: 'POST', body: '{}' })).json();
    assert.equal(proof.summary.allPassed, true);

    const benchRes = await fetch(`${base}/api/bench/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suiteIds: ['reflex-core'], targets: ['offline-proof'], concurrency: 2 }),
    });
    assert.equal(benchRes.status, 201);
    const { run } = await benchRes.json();
    assert.equal(run.summary.passed, run.summary.cases);
    const persisted = await (await fetch(`${base}/api/bench/runs/${run.id}`)).json();
    assert.equal(persisted.run.id, run.id);

    const tooMany = await fetch(`${base}/api/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: Array.from({ length: 1001 }, (_, i) => `prompt ${i}`) }),
    });
    assert.equal(tooMany.status, 413);
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('HTTP streaming: an upstream that dies mid-stream terminates SSE cleanly', async () => {
  // Upstream that starts an SSE response and then kills the socket.
  const upstream = http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ id: 'x', choices: [{ index: 0, delta: { content: 'par' } }] })}\n\n`);
    setTimeout(() => res.destroy(), 25);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = upstream.address().port;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-sse-'));
  const app = createBatchApp({
    host: '127.0.0.1',
    port: 0,
    dataDir: dir,
    dbPath: path.join(dir, 'sse.db'),
    masterKey: crypto.randomBytes(32),
    apiKey: null,
    enableDemo: true,
    workspaceRoot: process.cwd(),
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;

  app.store.upsertProvider({
    id: 'flaky-upstream',
    name: 'Flaky upstream',
    kind: 'openai-compatible',
    baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
    defaultModel: 'flaky-1',
    models: ['flaky-1'],
    apiKey: 'k',
    rpmLimit: 100,
    enabled: true,
  });

  try {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'flaky-upstream/flaky-1',
        messages: [{ role: 'user', content: 'stream please' }],
        stream: true,
      }),
      signal: AbortSignal.timeout(4000),
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /"par"/, 'partial content should reach the client');
    assert.match(text, /stream aborted/, 'client must be told the upstream died');
    assert.match(text, /\[DONE\]/, 'stream must be terminated, not left hanging');
  } finally {
    await app.close();
    await new Promise((resolve) => upstream.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

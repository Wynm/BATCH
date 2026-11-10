import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Store } from '../src/db/store.mjs';
import { GatewayRouter } from '../src/router/gateway.mjs';
import { parseRetryAfterMs } from '../src/router/circuitBreaker.mjs';
import { anthropicRequestToOpenAI, openAIResponseToAnthropic } from '../src/router/adapters.mjs';

function makeTempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-router-test-'));
  const dbPath = path.join(dir, 'test.db');
  const key = crypto.randomBytes(32);
  const store = new Store(dbPath, key, { enableDemo: false });
  return { store, cleanup: () => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('parseRetryAfterMs handles numeric seconds and HTTP dates', () => {
  assert.equal(parseRetryAfterMs('12'), 12000);
  assert.equal(parseRetryAfterMs('0'), 1000);
  const futureDate = new Date(Date.now() + 15000).toUTCString();
  const parsed = parseRetryAfterMs(futureDate);
  assert.ok(parsed >= 10000 && parsed <= 16000);
});

test('Anthropic <-> OpenAI payload adapters preserve system and text blocks', () => {
  const anthReq = {
    model: 'coding-fast',
    system: 'Be concise.',
    max_tokens: 256,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Ping' }] }],
  };
  const openaiReq = anthropicRequestToOpenAI(anthReq);
  assert.equal(openaiReq.messages[0].role, 'system');
  assert.equal(openaiReq.messages[1].content, 'Ping');

  const anthRes = openAIResponseToAnthropic({
    id: 'chatcmpl-123',
    model: 'groq/gpt-oss',
    choices: [{ message: { content: 'Pong' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 2 },
  }, 'coding-fast');
  assert.equal(anthRes.type, 'message');
  assert.equal(anthRes.content[0].text, 'Pong');
  assert.equal(anthRes.usage.input_tokens, 5);
});

test('GatewayRouter fails over from 429 primary upstream to healthy secondary and caches response', async () => {
  const { store, cleanup } = makeTempStore();
  let primaryCalls = 0;
  let backupCalls = 0;

  const primarySrv = http.createServer((req, res) => {
    primaryCalls += 1;
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '20' });
    res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
  });

  const backupSrv = http.createServer((req, res) => {
    backupCalls += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'chatcmpl-backup',
      object: 'chat.completion',
      model: 'backup-model',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hello from backup!' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    }));
  });

  await new Promise((r) => primarySrv.listen(0, '127.0.0.1', r));
  await new Promise((r) => backupSrv.listen(0, '127.0.0.1', r));

  try {
    const pPort = primarySrv.address().port;
    const bPort = backupSrv.address().port;

    store.upsertProvider({
      id: 'mock-primary',
      name: 'Mock Primary',
      kind: 'openai-compatible',
      tier: 'free-cloud',
      baseUrl: `http://127.0.0.1:${pPort}/v1`,
      defaultModel: 'primary-model',
      apiKey: 'test-key-1',
      rpmLimit: 100,
      priority: 1,
      enabled: true,
    });
    store.upsertProvider({
      id: 'mock-backup',
      name: 'Mock Backup',
      kind: 'openai-compatible',
      tier: 'free-cloud',
      baseUrl: `http://127.0.0.1:${bPort}/v1`,
      defaultModel: 'backup-model',
      apiKey: 'test-key-2',
      rpmLimit: 100,
      priority: 2,
      enabled: true,
    });
    store.upsertCombo({
      id: 'test-chain',
      name: 'Test Chain',
      strategy: 'failover',
      providerIds: ['mock-primary', 'mock-backup'],
    });

    const router = new GatewayRouter(store);

    // 1st request: primary returns 429, trips circuit breaker, fails over to backup
    const first = await router.routeChatCompletion({
      model: 'test-chain',
      messages: [{ role: 'user', content: 'Say hi' }],
      temperature: 0.1,
    });
    assert.equal(first.ok, true);
    assert.equal(first.meta.providerId, 'mock-backup');
    assert.equal(first.meta.cacheHit, false);
    assert.equal(first.data.choices[0].message.content, 'Hello from backup!');
    assert.equal(primaryCalls, 1);
    assert.equal(backupCalls, 1);
    assert.equal(router.circuitBreaker.getStatus('mock-primary').effectiveState, 'open');

    // 2nd identical request: hits cache immediately (0 upstream calls)
    const second = await router.routeChatCompletion({
      model: 'test-chain',
      messages: [{ role: 'user', content: 'Say hi' }],
      temperature: 0.1,
    });
    assert.equal(second.ok, true);
    assert.equal(second.meta.cacheHit, true);
    assert.equal(backupCalls, 1);

    // 3rd distinct request with cache bypass: skips open primary circuit breaker, goes straight to backup
    const third = await router.routeChatCompletion(
      { model: 'test-chain', messages: [{ role: 'user', content: 'Another prompt' }], temperature: 0.1 },
      { 'x-batch-cache': 'bypass' },
    );
    assert.equal(third.ok, true);
    assert.equal(primaryCalls, 1);
    assert.equal(backupCalls, 2);
    assert.equal(third.meta.attempts[0].status, 'skipped-circuit-open');
  } finally {
    await new Promise((r) => primarySrv.close(r));
    await new Promise((r) => backupSrv.close(r));
    cleanup();
  }
});

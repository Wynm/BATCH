import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Store } from '../src/db/store.mjs';
import { GatewayRouter } from '../src/router/gateway.mjs';
import { BatchRunner } from '../src/batch/runner.mjs';

test('BatchRunner executes items concurrently, retries transient errors, and exports JSONL', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-runner-test-'));
  const store = new Store(path.join(dir, 'batch.db'), crypto.randomBytes(32), { enableDemo: false });

  let calls = 0;
  const mockUpstream = http.createServer(async (req, res) => {
    calls += 1;
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const userMsg = body.messages?.[0]?.content || '';

    // Fail first call once to verify BatchRunner retry logic
    if (calls === 1) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Transient overload' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: `cmpl-${calls}`,
      object: 'chat.completion',
      model: 'mock-batch-model',
      choices: [{ index: 0, message: { role: 'assistant', content: `Processed: ${userMsg}` }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8 },
    }));
  });

  await new Promise((r) => mockUpstream.listen(0, '127.0.0.1', r));

  try {
    store.upsertProvider({
      id: 'batch-mock',
      name: 'Batch Mock',
      kind: 'openai-compatible',
      tier: 'free-cloud',
      baseUrl: `http://127.0.0.1:${mockUpstream.address().port}/v1`,
      defaultModel: 'mock-batch-model',
      apiKey: 'mock-key',
      rpmLimit: 500,
      priority: 1,
      enabled: true,
    });
    store.upsertCombo({
      id: 'batch-combo',
      name: 'Batch Combo',
      strategy: 'failover',
      providerIds: ['batch-mock'],
    });

    const router = new GatewayRouter(store);
    const runner = new BatchRunner(store, router, { maxRetries: 2, retryDelayMs: 30 });

    const job = runner.submitJob({
      name: 'Unit Test Batch',
      comboOrModel: 'batch-combo',
      concurrency: 2,
      items: [
        { customId: 'row-1', prompt: 'Alpha' },
        { customId: 'row-2', prompt: 'Beta' },
        { customId: 'row-3', prompt: 'Gamma' },
      ],
    });

    const finished = await runner.waitForJob(job.id);
    assert.equal(finished.status, 'completed');
    assert.equal(finished.completedItems, 3);
    assert.equal(finished.failedItems, 0);

    const jsonl = runner.exportJsonl(job.id);
    const lines = jsonl.trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.length, 3);
    assert.equal(lines[0].custom_id, 'row-1');
    assert.ok(lines.every((l) => l.status === 'completed' && l.response.startsWith('Processed: ')));
  } finally {
    await new Promise((r) => mockUpstream.close(r));
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

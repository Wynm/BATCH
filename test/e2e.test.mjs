import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createBatchApp } from '../src/server/httpServer.mjs';

test('Full HTTP E2E: UI, /v1/* OpenAI & Anthropic compat, SSE streaming, /api/*, and /mcp', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-e2e-'));
  const app = createBatchApp({
    host: '127.0.0.1',
    port: 0,
    dataDir: dir,
    dbPath: path.join(dir, 'e2e.db'),
    masterKey: crypto.randomBytes(32),
    apiKey: 'secret-e2e-token',
    enableDemo: true,
    workspaceRoot: process.cwd(),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer secret-e2e-token',
  };

  try {
    // 1. UI HTML loads without auth & health works
    const uiRes = await fetch(`${baseUrl}/`);
    assert.equal(uiRes.status, 200);
    const uiHtml = await uiRes.text();
    assert.ok(uiHtml.includes('BATCH'));

    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.status, 'ok');

    // 2. Protected /v1/models rejects unauthenticated call, accepts authorized call
    const unauth = await fetch(`${baseUrl}/v1/models`);
    assert.equal(unauth.status, 401);

    const modelsRes = await fetch(`${baseUrl}/v1/models`, { headers: authHeaders });
    assert.equal(modelsRes.status, 200);
    const modelsJson = await modelsRes.json();
    assert.ok(modelsJson.data.some((m) => m.id === 'auto-free'));

    // 3. /v1/chat/completions (non-streaming)
    const chatRes = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        model: 'auto-free',
        messages: [{ role: 'user', content: 'Hello gateway E2E' }],
      }),
    });
    assert.equal(chatRes.status, 200);
    assert.equal(chatRes.headers.get('x-batch-provider'), 'sandbox-sim');
    const chatJson = await chatRes.json();
    assert.ok(chatJson.choices[0].message.content.includes('Hello gateway E2E'));

    // 4. /v1/chat/completions (SSE streaming)
    const streamRes = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        model: 'auto-free',
        stream: true,
        messages: [{ role: 'user', content: 'Stream test' }],
      }),
    });
    assert.equal(streamRes.status, 200);
    assert.ok((streamRes.headers.get('content-type') || '').includes('text/event-stream'));
    const sseText = await streamRes.text();
    assert.ok(sseText.includes('data: [DONE]'));

    // 5. /v1/messages (Anthropic Claude Code compatibility)
    const anthRes = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        model: 'coding-fast',
        max_tokens: 128,
        messages: [{ role: 'user', content: 'Anthropic compat check' }],
      }),
    });
    assert.equal(anthRes.status, 200);
    const anthJson = await anthRes.json();
    assert.equal(anthJson.type, 'message');
    assert.ok(anthJson.content[0].text.includes('Anthropic compat check'));

    // 6. /v1/completions (legacy autocomplete compat)
    const cmplRes = await fetch(`${baseUrl}/v1/completions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ model: 'coding-fast', prompt: 'function add(a, b)' }),
    });
    assert.equal(cmplRes.status, 200);
    const cmplJson = await cmplRes.json();
    assert.equal(cmplJson.object, 'text_completion');

    // 7. MCP JSON-RPC initialize + tools/list + tools/call
    const mcpListRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(mcpListRes.status, 200);
    const mcpList = await mcpListRes.json();
    assert.ok(mcpList.result.tools.some((t) => t.name === 'batch_chat'));

    const mcpCallRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'craft_inspect_workspace',
          arguments: { path: 'src' },
        },
      }),
    });
    assert.equal(mcpCallRes.status, 200);
    const mcpCall = await mcpCallRes.json();
    assert.ok(mcpCall.result.content[0].text.includes('"type": "directory"'));
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

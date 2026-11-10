import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { Store } from '../db/store.mjs';
import { GatewayRouter } from '../router/gateway.mjs';
import { BatchRunner } from '../batch/runner.mjs';
import { McpHandler } from '../mcp/server.mjs';
import { inspectWorkspace } from '../craft/inspector.mjs';
import { generateClientConfigs } from '../craft/clientConfigs.mjs';
import {
  anthropicRequestToOpenAI,
  openAIResponseToAnthropic,
} from '../router/adapters.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.resolve(__dirname, '../ui');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    ...extraHeaders,
  });
  res.end(body);
}

async function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Invalid JSON request body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function getRequestOrigin(req, fallbackPort) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${fallbackPort}`;
  return `${proto}://${host}`;
}

function isAuthorized(req, expectedApiKey) {
  if (!expectedApiKey) return true;
  const auth = String(req.headers.authorization || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const xApiKey = String(req.headers['x-api-key'] || '').trim();
  return bearer === expectedApiKey || xApiKey === expectedApiKey;
}

async function writeOpenAISseStream(res, streamResult, meta) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Batch-Provider': meta.providerId || '',
    'X-Batch-Model': meta.model || '',
    'X-Batch-Request-Id': meta.requestId || '',
  });

  if (streamResult.kind === 'simulator-stream') {
    for await (const chunk of streamResult.generator) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  if (streamResult.kind === 'synthetic-stream') {
    const content = streamResult.data?.choices?.[0]?.message?.content ?? '';
    const id = streamResult.data?.id || `chatcmpl-${crypto.randomUUID().slice(0, 8)}`;
    const created = Math.floor(Date.now() / 1000);
    res.write(`data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created,
      model: meta.model,
      choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }],
    })}\n\n`);
    res.write(`data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created,
      model: meta.model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  if (streamResult.kind === 'openai-stream' && streamResult.response?.body) {
    const nodeStream = Readable.fromWeb(streamResult.response.body);
    for await (const chunk of nodeStream) {
      res.write(chunk);
    }
    res.end();
    return;
  }

  if (streamResult.kind === 'anthropic-stream' && streamResult.response?.body) {
    // Convert Anthropic SSE stream -> OpenAI SSE chunks
    const id = `chatcmpl-${crypto.randomUUID().slice(0, 8)}`;
    const created = Math.floor(Date.now() / 1000);
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const rawChunk of Readable.fromWeb(streamResult.response.body)) {
      buffer += decoder.decode(rawChunk, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            res.write(`data: ${JSON.stringify({
              id,
              object: 'chat.completion.chunk',
              created,
              model: meta.model,
              choices: [{ index: 0, delta: { content: ev.delta.text }, finish_reason: null }],
            })}\n\n`);
          }
        } catch {
          // ignore non-JSON SSE control lines
        }
      }
    }
    res.write(`data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created,
      model: meta.model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

export function createBatchApp(config, deps = {}) {
  const store = deps.store ?? new Store(config.dbPath, config.masterKey, { enableDemo: config.enableDemo });
  const router = deps.router ?? new GatewayRouter(store, { fetchImpl: deps.fetchImpl });
  const batchRunner = deps.batchRunner ?? new BatchRunner(store, router);
  const mcpHandler = new McpHandler({
    store,
    router,
    batchRunner,
    workspaceRoot: config.workspaceRoot,
    baseUrl: `http://localhost:${config.port}`,
  });

  const startedAt = Date.now();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      });
      res.end();
      return;
    }

    try {
      // Static Web Dashboard
      if (req.method === 'GET' && (pathname === '/' || pathname === '/styles.css' || pathname === '/app.js')) {
        const fileName = pathname === '/' ? 'index.html' : pathname.slice(1);
        const filePath = path.join(UI_DIR, fileName);
        if (!fs.existsSync(filePath)) {
          sendJson(res, 404, { error: 'UI asset not found' });
          return;
        }
        const ext = path.extname(fileName);
        const content = fs.readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(content);
        return;
      }

      if (req.method === 'GET' && pathname === '/health') {
        const providers = store.listProviders(false);
        const enabledReady = providers.filter((p) => p.enabled && (p.hasApiKey || p.kind === 'local-openai' || p.kind === 'simulator'));
        sendJson(res, 200, {
          status: 'ok',
          service: 'batch-ai-gateway',
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
          readyProviders: enabledReady.length,
          totalProviders: providers.length,
        });
        return;
      }

      // Auth check for API / OpenAI / MCP endpoints
      if (pathname.startsWith('/v1/') || pathname.startsWith('/api/') || pathname === '/mcp') {
        if (!isAuthorized(req, config.apiKey)) {
          sendJson(res, 401, { error: { message: 'Unauthorized: invalid or missing BATCH_API_KEY', type: 'authentication_error' } });
          return;
        }
      }

      // ---------------- OpenAI-Compatible /v1/* ----------------
      if (req.method === 'GET' && pathname === '/v1/models') {
        const combos = store.listCombos();
        const providers = store.listProviders(false);
        const nowSec = Math.floor(Date.now() / 1000);
        const data = [
          ...combos.map((c) => ({
            id: c.id,
            object: 'model',
            created: nowSec,
            owned_by: 'batch-combo',
          })),
          ...providers
            .filter((p) => p.enabled && (p.hasApiKey || p.kind === 'local-openai' || p.kind === 'simulator'))
            .flatMap((p) =>
              p.models.map((m) => ({
                id: `${p.id}/${m}`,
                object: 'model',
                created: nowSec,
                owned_by: p.id,
              })),
            ),
        ];
        sendJson(res, 200, { object: 'list', data });
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/chat/completions') {
        const body = await readJsonBody(req);
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          sendJson(res, 400, { error: { message: 'messages array is required', type: 'invalid_request_error' } });
          return;
        }
        const routed = await router.routeChatCompletion(body, req.headers);
        if (!routed.ok) {
          sendJson(res, routed.status || 502, {
            error: { message: routed.error, type: 'gateway_error', meta: routed.meta },
          });
          return;
        }
        if (routed.stream) {
          await writeOpenAISseStream(res, routed.streamResult, routed.meta);
          return;
        }
        const extraHeaders = {
          'X-Batch-Provider': routed.meta.providerId || '',
          'X-Batch-Model': routed.meta.model || '',
          'X-Batch-Cache': routed.meta.cacheHit ? 'HIT' : 'MISS',
          'X-Batch-Request-Id': routed.meta.requestId || '',
        };
        sendJson(res, 200, routed.data, extraHeaders);
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/completions') {
        const body = await readJsonBody(req);
        const promptText = Array.isArray(body.prompt) ? body.prompt.join('\n') : String(body.prompt || '');
        const chatBody = {
          model: body.model || 'coding-fast',
          messages: [{ role: 'user', content: promptText }],
          max_tokens: body.max_tokens ?? 256,
          temperature: body.temperature ?? 0.2,
          stream: false,
        };
        const routed = await router.routeChatCompletion(chatBody, req.headers);
        if (!routed.ok) {
          sendJson(res, routed.status || 502, { error: { message: routed.error, type: 'gateway_error' } });
          return;
        }
        const text = routed.data?.choices?.[0]?.message?.content ?? '';
        sendJson(res, 200, {
          id: `cmpl-${routed.meta.requestId}`,
          object: 'text_completion',
          created: Math.floor(Date.now() / 1000),
          model: routed.meta.model,
          choices: [{ text, index: 0, finish_reason: 'stop' }],
          usage: routed.data?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }, {
          'X-Batch-Provider': routed.meta.providerId || '',
          'X-Batch-Cache': routed.meta.cacheHit ? 'HIT' : 'MISS',
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/messages') {
        const body = await readJsonBody(req);
        const openaiReq = anthropicRequestToOpenAI(body);
        // If streaming was requested on Anthropic endpoint, run non-stream internally and emit clean Anthropic SSE
        const wantStream = Boolean(body.stream);
        const routed = await router.routeChatCompletion({ ...openaiReq, stream: false }, req.headers);
        if (!routed.ok) {
          sendJson(res, routed.status || 502, {
            type: 'error',
            error: { type: 'api_error', message: routed.error },
          });
          return;
        }
        const anthPayload = openAIResponseToAnthropic(routed.data, body.model || routed.meta.model);
        if (!wantStream) {
          sendJson(res, 200, anthPayload, {
            'X-Batch-Provider': routed.meta.providerId || '',
            'X-Batch-Cache': routed.meta.cacheHit ? 'HIT' : 'MISS',
          });
          return;
        }

        const text = anthPayload.content?.[0]?.text ?? '';
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Batch-Provider': routed.meta.providerId || '',
        });
        res.write(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { ...anthPayload, content: [] } })}\n\n`);
        res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`);
        res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n\n`);
        res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
        res.write(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: anthPayload.usage.output_tokens } })}\n\n`);
        res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
        res.end();
        return;
      }

      // ---------------- MCP HTTP Endpoint ----------------
      if (req.method === 'POST' && pathname === '/mcp') {
        const body = await readJsonBody(req);
        const resp = await mcpHandler.handleRpc(body);
        if (!resp) {
          res.writeHead(204);
          res.end();
          return;
        }
        sendJson(res, 200, resp);
        return;
      }

      // ---------------- Control Plane /api/* ----------------
      if (req.method === 'GET' && pathname === '/api/overview') {
        const providers = store.listProviders(false);
        const breakers = router.circuitBreaker.snapshot(providers.map((p) => p.id));
        const breakerMap = Object.fromEntries(breakers.map((b) => [b.providerId, b]));
        const origin = getRequestOrigin(req, config.port);
        sendJson(res, 200, {
          providers: providers.map((p) => ({
            ...p,
            circuitBreaker: breakerMap[p.id] || null,
          })),
          combos: store.listCombos(),
          metrics: store.getMetrics(),
          recentLogs: store.listLogs(40),
          batches: store.listBatchJobs(20),
          clientConfigs: generateClientConfigs(origin, config.apiKey ? '<YOUR_BATCH_API_KEY>' : 'batch-local-dev'),
          authEnabled: Boolean(config.apiKey),
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/providers') {
        sendJson(res, 200, { providers: store.listProviders(false) });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/providers') {
        const body = await readJsonBody(req);
        if (!body.id || !/^[a-z0-9][a-z0-9-_]{0,63}$/i.test(body.id)) {
          sendJson(res, 400, { error: 'Valid provider id (alphanumeric, dash, underscore) is required' });
          return;
        }
        const saved = store.upsertProvider({
          id: body.id.toLowerCase(),
          name: body.name,
          kind: body.kind,
          tier: body.tier,
          baseUrl: body.baseUrl,
          defaultModel: body.defaultModel,
          models: Array.isArray(body.models)
            ? body.models
            : typeof body.models === 'string'
              ? body.models.split(',').map((s) => s.trim()).filter(Boolean)
              : undefined,
          apiKey: body.apiKey,
          clearApiKey: Boolean(body.clearApiKey),
          rpmLimit: body.rpmLimit,
          priority: body.priority,
          enabled: body.enabled,
          notes: body.notes,
        });
        sendJson(res, 200, { provider: saved });
        return;
      }

      const providerMatch = pathname.match(/^\/api\/providers\/([a-z0-9-_]+)(?:\/(test|reset-breaker))?$/i);
      if (providerMatch) {
        const providerId = providerMatch[1];
        const action = providerMatch[2];
        if (req.method === 'DELETE' && !action) {
          const deleted = store.deleteProvider(providerId);
          sendJson(res, deleted ? 200 : 404, { deleted });
          return;
        }
        if (req.method === 'POST' && action === 'test') {
          const result = await router.testProvider(providerId);
          sendJson(res, 200, result);
          return;
        }
        if (req.method === 'POST' && action === 'reset-breaker') {
          router.circuitBreaker.reset(providerId);
          router.rateLimiter.reset(providerId);
          sendJson(res, 200, { ok: true, status: router.circuitBreaker.getStatus(providerId) });
          return;
        }
      }

      if (req.method === 'GET' && pathname === '/api/combos') {
        sendJson(res, 200, { combos: store.listCombos() });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/combos') {
        const body = await readJsonBody(req);
        if (!body.id || !/^[a-z0-9][a-z0-9-_]{0,63}$/i.test(body.id)) {
          sendJson(res, 400, { error: 'Valid combo id is required' });
          return;
        }
        const combo = store.upsertCombo({
          id: body.id.toLowerCase(),
          name: body.name,
          strategy: body.strategy,
          description: body.description,
          providerIds: Array.isArray(body.providerIds) ? body.providerIds : [],
        });
        sendJson(res, 200, { combo });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/cache/clear') {
        const cleared = store.clearCache();
        sendJson(res, 200, { cleared });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/playground') {
        const body = await readJsonBody(req);
        const messages = Array.isArray(body.messages) && body.messages.length > 0
          ? body.messages
          : [
              ...(body.system ? [{ role: 'system', content: String(body.system) }] : []),
              { role: 'user', content: String(body.prompt || 'Hello from BATCH Playground!') },
            ];
        const routed = await router.routeChatCompletion(
          {
            model: body.model || 'auto-free',
            messages,
            temperature: body.temperature ?? 0.2,
            max_tokens: body.max_tokens,
            cache: body.cache,
            stream: false,
          },
          body.bypassCache ? { 'x-batch-cache': 'bypass' } : {},
        );
        if (!routed.ok) {
          sendJson(res, routed.status || 502, { ok: false, error: routed.error, meta: routed.meta });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          content: routed.data?.choices?.[0]?.message?.content ?? '',
          usage: routed.data?.usage ?? null,
          meta: routed.meta,
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/batches') {
        sendJson(res, 200, { batches: store.listBatchJobs(50) });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/batches') {
        const body = await readJsonBody(req);
        const items = Array.isArray(body.items) ? body.items : [];
        const job = batchRunner.submitJob({
          name: body.name,
          comboOrModel: body.comboOrModel || 'auto-free',
          concurrency: body.concurrency ?? 2,
          systemPrompt: body.systemPrompt || '',
          items,
        });
        sendJson(res, 201, { job });
        return;
      }

      const batchMatch = pathname.match(/^\/api\/batches\/([a-z0-9-_]+)(?:\/(cancel|export))?$/i);
      if (batchMatch) {
        const jobId = batchMatch[1];
        const action = batchMatch[2];
        if (req.method === 'GET' && !action) {
          const job = store.getBatchJob(jobId);
          if (!job) {
            sendJson(res, 404, { error: 'Batch job not found' });
            return;
          }
          sendJson(res, 200, { job });
          return;
        }
        if (req.method === 'POST' && action === 'cancel') {
          const job = batchRunner.cancelJob(jobId);
          if (!job) {
            sendJson(res, 404, { error: 'Batch job not found' });
            return;
          }
          sendJson(res, 200, { job });
          return;
        }
        if (req.method === 'GET' && action === 'export') {
          const jsonl = batchRunner.exportJsonl(jobId);
          if (jsonl === null) {
            sendJson(res, 404, { error: 'Batch job not found' });
            return;
          }
          res.writeHead(200, {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Content-Disposition': `attachment; filename="${jobId}.jsonl"`,
          });
          res.end(jsonl + '\n');
          return;
        }
      }

      if (req.method === 'POST' && pathname === '/api/craft/inspect') {
        const body = await readJsonBody(req);
        const inspection = inspectWorkspace(config.workspaceRoot, body.path || '.');
        sendJson(res, 200, { inspection });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/craft/configs') {
        const origin = getRequestOrigin(req, config.port);
        sendJson(res, 200, {
          configs: generateClientConfigs(origin, config.apiKey ? '<YOUR_BATCH_API_KEY>' : 'batch-local-dev'),
        });
        return;
      }

      sendJson(res, 404, { error: `Route not found: ${req.method} ${pathname}` });
    } catch (err) {
      const status = err.status || 500;
      sendJson(res, status, { error: err.message || 'Internal server error' });
    }
  });

  return {
    server,
    store,
    router,
    batchRunner,
    mcpHandler,
    close: async () => {
      await new Promise((resolve) => server.close(() => resolve()));
      store.close();
    },
  };
}

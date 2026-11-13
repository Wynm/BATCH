/**
 * BATCH Resilience Proof Lab.
 *
 * The gateway claims "zero-dropped-request" behaviour: 429s, revoked keys,
 * 5xx storms and hung sockets must fail over instead of surfacing. Claims are
 * cheap, so this module *proves* them by running the real `GatewayRouter`
 * (real circuit breaker, real token bucket, real cache) against scripted
 * upstreams, and asserting on what actually happened.
 *
 * Nothing here is mocked at the router level — only the network is scripted.
 * That is the whole point: if the router regresses, these scenarios fail.
 */

import { GatewayRouter } from '../router/gateway.mjs';
import { CircuitBreakerRegistry } from '../router/circuitBreaker.mjs';
import { RateLimiterRegistry } from '../router/rateLimiter.mjs';

/* ------------------------------------------------------------------ */
/* Test doubles (network + storage only)                               */
/* ------------------------------------------------------------------ */

export class MemoryStore {
  constructor({ providers = [], combos = [] } = {}) {
    this.providers = providers;
    this.combos = combos;
    this.cache = new Map();
    this.logs = [];
    this.batchJobs = new Map();
  }

  listProviders(includeSecrets = false) {
    return this.providers.map((p) => (includeSecrets ? { ...p, apiKey: p.apiKey } : { ...p, apiKey: undefined, hasApiKey: Boolean(p.apiKey) }));
  }

  getProvider(id, includeSecret = false) {
    const found = this.providers.find((p) => p.id === id);
    if (!found) return null;
    return includeSecret ? { ...found, apiKey: found.apiKey } : { ...found, apiKey: undefined, hasApiKey: Boolean(found.apiKey) };
  }

  listCombos() { return this.combos.map((c) => ({ ...c })); }
  getCombo(id) {
    const combo = this.combos.find((c) => c.id === id);
    return combo ? { ...combo } : null;
  }

  getCachedResponse(key) {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) { this.cache.delete(key); return null; }
    hit.hits += 1;
    return { providerId: hit.providerId, model: hit.model, response: hit.response, hits: hit.hits };
  }

  setCachedResponse(key, model, providerId, response, ttlMs = 3600_000) {
    this.cache.set(key, { model, providerId, response, hits: 0, expiresAt: Date.now() + ttlMs });
  }

  clearCache() { const n = this.cache.size; this.cache.clear(); return n; }

  logRequest(entry) { this.logs.push({ ...entry, at: Date.now() }); }
  listLogs(limit = 50) { return this.logs.slice(-limit).reverse(); }
  getMetrics() { return { summary: { totalRequests: this.logs.length }, byProvider: [], cacheStats: { entries: this.cache.size } }; }
  listBatchJobs() { return []; }
  getBatchJob() { return null; }
  close() {}
}

/** Scripted network: maps baseUrl prefix → handler(init) → Response. */
export function createScriptedFetch(handlers) {
  const calls = new Map();
  const prefixes = Object.keys(handlers).sort((a, b) => b.length - a.length);

  const fetchImpl = async (url, init = {}) => {
    const prefix = prefixes.find((p) => String(url).startsWith(p));
    if (!prefix) throw new Error(`scripted fetch has no handler for ${url}`);
    const providerId = handlers[prefix].providerId || prefix;
    calls.set(providerId, (calls.get(providerId) || 0) + 1);
    return handlers[prefix].respond({ url: String(url), init, callIndex: calls.get(providerId) });
  };

  fetchImpl.calls = calls;
  fetchImpl.count = (id) => calls.get(id) || 0;
  return fetchImpl;
}

export function openAIBody(text, { promptTokens = 12, completionTokens = 4 } = {}) {
  return {
    id: `chatcmpl-lab-${Math.random().toString(36).slice(2, 8)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'lab-model',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
  };
}

export function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/**
 * A socket that accepts and never answers. `capMs` is only a safety net so a
 * deliberately mis-configured router cannot hang the test process forever.
 */
export function hangingResponse(signal, capMs = 800) {
  return new Promise((_, reject) => {
    let timer = null;
    const fail = (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    };
    if (signal?.aborted) {
      fail(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      return;
    }
    signal?.addEventListener('abort', () => fail(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    timer = setTimeout(() => fail(new Error('socket stalled (safety cap)')), capMs);
    timer.unref?.();
  });
}

function labProvider(id, { rpmLimit = 1000, priority = 10 } = {}) {
  return {
    id,
    name: id,
    kind: 'openai-compatible',
    tier: 'lab',
    baseUrl: `http://${id}.lab.test/v1`,
    defaultModel: `${id}-model`,
    models: [`${id}-model`],
    apiKey: 'lab-key',
    enabled: true,
    rpmLimit,
    priority,
    hasApiKey: true,
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chain(...ids) {
  return {
    id: 'lab-chain',
    name: 'Lab chain',
    strategy: 'failover',
    description: 'ephemeral proof chain',
    providerIds: ids,
  };
}

async function buildRouter({ providers, handlers, breakerOptions = {}, timeoutMs = 400, createRouter }) {
  const store = new MemoryStore({ providers, combos: [chain(...providers.map((p) => p.id))] });
  const fetchImpl = createScriptedFetch(handlers);
  const circuitBreaker = new CircuitBreakerRegistry({ failureThreshold: 1, defaultCooldownMs: 60, authCooldownMs: 300_000, ...breakerOptions });
  const rateLimiter = new RateLimiterRegistry();
  const routerOptions = { fetchImpl, circuitBreaker, rateLimiter, timeoutMs, cacheTtlMs: 60_000 };
  const router = createRouter ? createRouter(store, routerOptions) : new GatewayRouter(store, routerOptions);
  return { router, store, fetchImpl, circuitBreaker, rateLimiter };
}

const ask = (content = 'ping') => ({ model: 'lab-chain', messages: [{ role: 'user', content }], temperature: 0.9 });
const bypass = { 'x-batch-cache': 'bypass' };

function check(label, passed, detail = '') {
  return { label, passed: Boolean(passed), detail: String(detail ?? '') };
}

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

export const PROOF_SCENARIOS = [
  {
    id: 'failover-429',
    name: 'Failover on HTTP 429 (quota exhausted)',
    what: 'A rate-limited primary must be quarantined and the request served by the next provider, without the caller seeing an error.',
    tags: ['failover', 'quota'],
    async run({ createRouter } = {}) {
      const alpha = labProvider('alpha');
      const beta = labProvider('beta');
      const { router, fetchImpl, circuitBreaker } = await buildRouter({
        createRouter,
        providers: [alpha, beta],
        handlers: {
          'http://alpha.lab.test/v1': {
            providerId: 'alpha',
            respond: () => jsonResponse({ error: { message: 'rate limit exceeded' } }, 429, { 'retry-after': '1' }),
          },
          'http://beta.lab.test/v1': {
            providerId: 'beta',
            respond: () => jsonResponse(openAIBody('served by beta')),
          },
        },
      });

      const started = Date.now();
      const result = await router.routeChatCompletion(ask(), bypass);
      const breaker = circuitBreaker.getStatus('alpha');

      return {
        durationMs: Date.now() - started,
        checks: [
          check('request succeeded', result.ok, result.error ?? ''),
          check('served by secondary', result.meta?.providerId === 'beta', result.meta?.providerId),
          check('primary attempted first', result.meta?.attempts?.[0]?.providerId === 'alpha' && result.meta.attempts[0].httpStatus === 429),
          check('primary breaker opened', breaker.effectiveState === 'open', breaker.effectiveState),
          check('Retry-After honoured (≥1s cooldown)', breaker.remainingCooldownMs >= 900, `${breaker.remainingCooldownMs}ms`),
          check('secondary called exactly once', fetchImpl.count('beta') === 1, fetchImpl.count('beta')),
        ],
        observations: {
          provider: result.meta?.providerId,
          content: result.data?.choices?.[0]?.message?.content,
          cooldownMs: breaker.remainingCooldownMs,
          attempts: result.meta?.attempts,
        },
      };
    },
  },

  {
    id: 'auth-quarantine',
    name: 'Revoked key → long quarantine (401)',
    what: 'A 401/403 is not a transient error. The breaker must open for minutes, not retry every request and burn latency.',
    tags: ['auth', 'circuit-breaker'],
    async run({ createRouter } = {}) {
      const alpha = labProvider('alpha');
      const beta = labProvider('beta');
      const { router, circuitBreaker } = await buildRouter({
        createRouter,
        providers: [alpha, beta],
        handlers: {
          'http://alpha.lab.test/v1': { providerId: 'alpha', respond: () => jsonResponse({ error: 'invalid api key' }, 401) },
          'http://beta.lab.test/v1': { providerId: 'beta', respond: () => jsonResponse(openAIBody('ok')) },
        },
      });

      const result = await router.routeChatCompletion(ask(), bypass);
      const breaker = circuitBreaker.getStatus('alpha');
      return {
        durationMs: 0,
        checks: [
          check('request survived the bad credential', result.ok && result.meta.providerId === 'beta'),
          check('breaker open', breaker.effectiveState === 'open'),
          check('cooldown measured in minutes, not seconds', breaker.remainingCooldownMs >= 240_000, `${breaker.remainingCooldownMs}ms`),
          check('attempt trace records 401', result.meta.attempts?.[0]?.httpStatus === 401),
        ],
        observations: { cooldownMs: breaker.remainingCooldownMs, breaker },
      };
    },
  },

  {
    id: 'breaker-skip',
    name: 'Open breaker is skipped, not re-probed on every request',
    what: 'After the primary trips, subsequent requests must go straight to the healthy provider with no wasted upstream call.',
    tags: ['circuit-breaker', 'latency'],
    async run({ createRouter } = {}) {
      const alpha = labProvider('alpha');
      const beta = labProvider('beta');
      const { router, fetchImpl } = await buildRouter({
        createRouter,
        providers: [alpha, beta],
        handlers: {
          'http://alpha.lab.test/v1': { providerId: 'alpha', respond: () => jsonResponse({ error: 'boom' }, 500) },
          'http://beta.lab.test/v1': { providerId: 'beta', respond: () => jsonResponse(openAIBody('ok')) },
        },
      });

      await router.routeChatCompletion(ask(), bypass);          // trips alpha
      const alphaCallsAfterTrip = fetchImpl.count('alpha');
      const second = await router.routeChatCompletion(ask(), bypass);

      return {
        durationMs: 0,
        checks: [
          check('first request tripped the breaker', alphaCallsAfterTrip === 1, `alphaCalls=${alphaCallsAfterTrip}`),
          check('second request still succeeded', second.ok),
          check('second request did not hit the dead primary', fetchImpl.count('alpha') === alphaCallsAfterTrip, `alphaCalls=${fetchImpl.count('alpha')}`),
          check('skip reason is visible in the trace', second.meta.attempts?.[0]?.status === 'skipped-circuit-open', second.meta.attempts?.[0]?.status),
        ],
        observations: { attempts: second.meta.attempts },
      };
    },
  },

  {
    id: 'total-outage',
    name: 'Total upstream outage returns a truthful 502',
    what: 'When every candidate fails, the gateway must fail loudly with the full attempt trace instead of pretending to answer.',
    tags: ['failure-mode', 'observability'],
    async run({ createRouter } = {}) {
      const alpha = labProvider('alpha');
      const beta = labProvider('beta');
      const { router } = await buildRouter({
        createRouter,
        providers: [alpha, beta],
        handlers: {
          'http://alpha.lab.test/v1': { providerId: 'alpha', respond: () => jsonResponse({ error: 'down' }, 503) },
          'http://beta.lab.test/v1': { providerId: 'beta', respond: () => jsonResponse({ error: 'also down' }, 500) },
        },
      });

      const result = await router.routeChatCompletion(ask(), bypass);
      return {
        durationMs: 0,
        checks: [
          check('reported as failure', result.ok === false),
          check('status 502', result.status === 502, result.status),
          check('both providers attempted', result.meta.attempts.length === 2, result.meta.attempts.length),
          check('no fabricated content', !result.data),
        ],
        observations: { error: result.error, attempts: result.meta.attempts },
      };
    },
  },

  {
    id: 'timeout-failover',
    name: 'Hung socket → timeout → failover',
    what: 'A provider that accepts the connection and never answers must be abandoned on the configured deadline, not left to hang the client.',
    tags: ['timeout', 'failover'],
    async run({ createRouter } = {}) {
      const alpha = labProvider('alpha');
      const beta = labProvider('beta');
      const { router } = await buildRouter({
        createRouter,
        providers: [alpha, beta],
        timeoutMs: 150,
        handlers: {
          'http://alpha.lab.test/v1': { providerId: 'alpha', respond: ({ init }) => hangingResponse(init.signal) },
          'http://beta.lab.test/v1': { providerId: 'beta', respond: () => jsonResponse(openAIBody('rescued')) },
        },
      });

      const started = Date.now();
      const result = await router.routeChatCompletion(ask(), bypass);
      const elapsed = Date.now() - started;

      return {
        durationMs: elapsed,
        checks: [
          check('request succeeded via fallback', result.ok && result.meta.providerId === 'beta'),
          check('hung provider recorded a 504', result.meta.attempts?.[0]?.httpStatus === 504, result.meta.attempts?.[0]?.httpStatus),
          check('deadline enforced (< 3s)', elapsed < 3000, `${elapsed}ms`),
        ],
        observations: { elapsedMs: elapsed, attempts: result.meta.attempts },
      };
    },
  },

  {
    id: 'cache-short-circuit',
    name: 'Deterministic request served from cache',
    what: 'Identical low-temperature prompts must not pay for a second upstream call; the cache must report HIT.',
    tags: ['cache', 'cost'],
    async run({ createRouter } = {}) {
      const alpha = labProvider('alpha');
      const { router, fetchImpl } = await buildRouter({
        createRouter,
        providers: [alpha],
        handlers: {
          'http://alpha.lab.test/v1': { providerId: 'alpha', respond: () => jsonResponse(openAIBody('cached answer')) },
        },
      });

      const cold = { model: 'lab-chain', messages: [{ role: 'user', content: 'cache me' }], temperature: 0.1 };
      const first = await router.routeChatCompletion(cold);
      const second = await router.routeChatCompletion({ ...cold, messages: [{ role: 'user', content: 'cache me' }] });

      return {
        durationMs: 0,
        checks: [
          check('first call reached upstream', first.ok && first.meta.cacheHit === false),
          check('second call was a cache HIT', second.meta.cacheHit === true),
          check('upstream called only once', fetchImpl.count('alpha') === 1, fetchImpl.count('alpha')),
          check('cached provider identity preserved', second.meta.providerId === 'alpha'),
        ],
        observations: { upstreamCalls: fetchImpl.count('alpha'), content: second.data?.choices?.[0]?.message?.content },
      };
    },
  },

  {
    id: 'rate-paced',
    name: 'Local token bucket paces a tight RPM limit',
    what: 'The gateway must throttle itself before the provider does, skipping a saturated bucket and failing over instead of collecting 429s.',
    tags: ['rate-limit', 'pacing'],
    async run({ createRouter } = {}) {
      const alpha = labProvider('alpha', { rpmLimit: 1 }); // 1 call/minute bucket
      const beta = labProvider('beta');
      const { router, fetchImpl } = await buildRouter({
        createRouter,
        providers: [alpha, beta],
        handlers: {
          'http://alpha.lab.test/v1': { providerId: 'alpha', respond: () => jsonResponse(openAIBody('alpha')) },
          'http://beta.lab.test/v1': { providerId: 'beta', respond: () => jsonResponse(openAIBody('beta')) },
        },
      });

      const first = await router.routeChatCompletion(ask('one'), bypass);
      const second = await router.routeChatCompletion(ask('two'), bypass);

      return {
        durationMs: 0,
        checks: [
          check('first request used the primary', first.meta.providerId === 'alpha'),
          check('second request still succeeded', second.ok),
          check('second request skipped the saturated bucket', second.meta.attempts?.[0]?.status === 'skipped-rate-limit', second.meta.attempts?.[0]?.status),
          check('primary was called once, not twice', fetchImpl.count('alpha') === 1, fetchImpl.count('alpha')),
        ],
        observations: { attempts: second.meta.attempts },
      };
    },
  },

  {
    id: 'half-open-recovery',
    name: 'Half-open probe restores a recovered provider',
    what: 'After the cooldown expires the breaker must allow exactly one probe; a success closes it and traffic returns to the primary.',
    tags: ['circuit-breaker', 'recovery'],
    async run({ createRouter } = {}) {
      const alpha = labProvider('alpha');
      const beta = labProvider('beta');
      let alphaHealthy = false;
      const { router, fetchImpl, circuitBreaker } = await buildRouter({
        createRouter,
        providers: [alpha, beta],
        breakerOptions: { failureThreshold: 1, defaultCooldownMs: 80 },
        handlers: {
          'http://alpha.lab.test/v1': {
            providerId: 'alpha',
            respond: () => (alphaHealthy ? jsonResponse(openAIBody('alpha recovered')) : jsonResponse({ error: 'flaky' }, 500)),
          },
          'http://beta.lab.test/v1': { providerId: 'beta', respond: () => jsonResponse(openAIBody('beta')) },
        },
      });

      await router.routeChatCompletion(ask('trip'), bypass);
      const tripped = circuitBreaker.getStatus('alpha');
      alphaHealthy = true;
      await sleep(110);
      const afterCooldown = circuitBreaker.getStatus('alpha');
      const probe = await router.routeChatCompletion(ask('probe'), bypass);
      const recovered = circuitBreaker.getStatus('alpha');

      return {
        durationMs: 110,
        checks: [
          check('breaker opened after failure', tripped.effectiveState === 'open'),
          check('cooldown elapsed', afterCooldown.remainingCooldownMs === 0, `${afterCooldown.remainingCooldownMs}ms`),
          check('probe reached the recovered primary', probe.meta.providerId === 'alpha', probe.meta.providerId),
          check('breaker closed after successful probe', recovered.effectiveState === 'closed', recovered.effectiveState),
          check('primary called exactly twice (trip + probe)', fetchImpl.count('alpha') === 2, fetchImpl.count('alpha')),
        ],
        observations: { tripped: tripped.effectiveState, recovered: recovered.effectiveState },
      };
    },
  },
];

export function listScenarios() {
  return PROOF_SCENARIOS.map(({ id, name, what, tags }) => ({ id, name, what, tags }));
}

/**
 * Execute the proof suite.
 * @param {{only?: string[]}} options
 */
export async function runResilienceProof(options = {}) {
  const only = options.only ? new Set(options.only) : null;
  const scenarios = only ? PROOF_SCENARIOS.filter((s) => only.has(s.id)) : PROOF_SCENARIOS;
  if (scenarios.length === 0) {
    throw Object.assign(new Error(`Unknown scenario(s): ${[...only].join(', ')}`), { status: 400 });
  }

  const startedAt = Date.now();
  const results = [];
  for (const scenario of scenarios) {
    const t0 = Date.now();
    try {
      const outcome = await scenario.run({ createRouter: options.createRouter });
      results.push({
        id: scenario.id,
        name: scenario.name,
        what: scenario.what,
        tags: scenario.tags,
        passed: outcome.checks.every((c) => c.passed),
        checks: outcome.checks,
        observations: outcome.observations ?? {},
        durationMs: outcome.durationMs ?? Date.now() - t0,
      });
    } catch (err) {
      results.push({
        id: scenario.id,
        name: scenario.name,
        what: scenario.what,
        tags: scenario.tags,
        passed: false,
        checks: [check('scenario executed without throwing', false, err.stack?.split('\n')[0] ?? err.message)],
        observations: {},
        durationMs: Date.now() - t0,
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    generatedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    summary: {
      scenarios: results.length,
      passed,
      failed: results.length - passed,
      checks: results.reduce((n, r) => n + r.checks.length, 0),
      checksPassed: results.reduce((n, r) => n + r.checks.filter((c) => c.passed).length, 0),
      allPassed: passed === results.length,
    },
    results,
  };
}
